import {
  loadNtrFileAtPath,
  openNtrFile,
  startFileWatch,
  stopFileWatch,
} from "@app/api/files";
import { recordTelemetry, setTelemetryEnabled } from "@app/telemetry";
import { parseNtr } from "@ntr/parser";
import type { ParseIssue } from "@ntr/model";
import {
  buildSceneGraph,
  extractElementProperties,
  type SceneElement,
  type SceneGraph,
} from "@viewer/sceneGraph";
import {
  createFileWatchManager,
  type FileChangePayload,
  type FileWatchManager,
} from "./fileWatch.ts";
import { createFileDropManager, type FileDropManager } from "./fileDrop.ts";
import { attachToolbar, type ToolbarController } from "./toolbar.ts";
import {
  attachKeyboardShortcuts,
  type KeyboardShortcutController,
} from "./keyboardShortcuts.ts";
import {
  createOptionsPanelController,
  DEFAULT_SETTINGS,
  readViewerSettings,
  type OptionsPanelController,
} from "./optionsPanel.ts";
import { createToastManager, type ToastManager } from "./toastManager.ts";
import { initializeTelemetryToggle } from "./telemetryPreferences.ts";
import { createViewerHost, type ViewerHost } from "./viewerHost.ts";
import type { ColorMode } from "@viewer/engine";
import { toPropertyColorMode, tryGetPropertyFromColorMode } from "@viewer/engine";
import { isOk } from "@shared/result";
import { createToast, publishToast } from "@shared/toast";
import { InitializeCSG2Async } from "@babylonjs/core/Meshes/csg2";

interface AppState {
  filePath: string | null;
  issues: ParseIssue[];
  graph: SceneGraph | null;
  propertyNames: string[];
  elementProperties: Map<string, Record<string, string>>;
}

let viewerHost: ViewerHost | null = null;
let state: AppState = {
  filePath: null,
  issues: [],
  graph: null,
  propertyNames: [],
  elementProperties: new Map(),
};

let selectionContainer: HTMLElement;
let issuesList: HTMLUListElement;
let filePathLabel: HTMLElement;
let gridToggle: HTMLInputElement;
let telemetryToggle: HTMLInputElement;
let toastContainer: HTMLElement;
let colorModeSelect: HTMLSelectElement;
let optionsPanel: HTMLElement;
let optionsOpenButton: HTMLButtonElement;
let optionsCloseButton: HTMLButtonElement;
let rotationSensitivityInput: HTMLInputElement;
let panSensitivityInput: HTMLInputElement;
let manualPathForm: HTMLFormElement;
let manualPathInput: HTMLInputElement;
let currentColorMode: ColorMode = "type";
const LAST_FILE_STORAGE_KEY = "ntr-viewer:last-file-path";
const SETTINGS_STORAGE_KEY = "ntr-viewer:options";

type LoadSource = "manual" | "restore" | "watch";

let fileWatchManager: FileWatchManager | null = null;
let fileDropManager: FileDropManager | null = null;
let toolbarController: ToolbarController | null = null;
let keyboardController: KeyboardShortcutController | null = null;
let optionsPanelController: OptionsPanelController | null = null;
let toastManager: ToastManager | null = null;

const isWindows = navigator.userAgent.toLowerCase().includes("windows");

const normalizePath = (value: string): string => {
  const unified = value.replace(/\\/g, "/");
  let withoutPrefix = unified;
  if (unified.startsWith("//?/UNC/")) {
    withoutPrefix = `//${unified.slice(8)}`;
  } else if (unified.startsWith("//?/")) {
    withoutPrefix = unified.slice(4);
  }
  return isWindows ? withoutPrefix.toLowerCase() : withoutPrefix;
};

const pathsMatch = (a: string, b: string): boolean => normalizePath(a) === normalizePath(b);

const rememberLastFile = (path: string) => {
  try {
    localStorage.setItem(LAST_FILE_STORAGE_KEY, path);
  } catch (error) {
    console.warn("Failed to persist last file path", error);
  }
};

const forgetLastFile = () => {
  try {
    localStorage.removeItem(LAST_FILE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear last file path", error);
  }
};

const getRememberedFile = (): string | null => {
  try {
    return localStorage.getItem(LAST_FILE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to read last file path", error);
    return null;
  }
};

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};

const reportWatchStartFailure = (error: unknown) => {
  const detail = describeError(error);
  console.warn("Failed to start file watch", error);
  publishToast(createToast("warning", "Live reload unavailable", detail));
};

const reportWatchStopFailure = (error: unknown) => {
  const detail = describeError(error);
  console.warn("Failed to stop file watch", error);
  publishToast(createToast("warning", "Live reload cleanup failed", detail));
};

const reportFileChangeHandlingFailure = (error: unknown) => {
  const detail = describeError(error);
  console.error("Failed processing file change event", error);
  publishToast(createToast("error", "File change handling failed", detail));
};

const reportDropHandlingFailure = (error: unknown) => {
  const detail = describeError(error);
  console.error("Failed processing dropped file", error);
  publishToast(createToast("error", "Failed to open dropped file", detail));
};

const reportDropSetupFailure = (error: unknown) => {
  const detail = describeError(error);
  console.warn("Failed to set up file drop listeners", error);
  publishToast(createToast("warning", "Drag-and-drop unavailable", detail));
};

const reportWatchSubscriptionFailure = (error: unknown) => {
  const detail = describeError(error);
  console.warn("Failed to subscribe to file watch events", error);
  publishToast(createToast("warning", "File change monitoring unavailable", detail));
};

const getFileWatchManager = (): FileWatchManager => {
  if (!fileWatchManager) {
    fileWatchManager = createFileWatchManager({
      onFileChanged: handleFileChangeEvent,
      onWatchError: handleFileWatchError,
      onProcessingError: reportFileChangeHandlingFailure,
      onSetupFailed: reportWatchSubscriptionFailure,
    });
  }
  return fileWatchManager;
};

const setupFileWatchListeners = async (): Promise<void> => {
  try {
    await getFileWatchManager().setup();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("File watch listener setup failed", error);
    }
  }
};

const collectElementPropertyData = (elements: readonly SceneElement[]) => {
  const propertyNames = new Set<string>();
  const elementProperties = new Map<string, Record<string, string>>();

  for (const element of elements) {
    const properties = extractElementProperties(element.source);
    elementProperties.set(element.id, properties);
    for (const key of Object.keys(properties)) {
      if (key === "kind") {
        continue;
      }
      propertyNames.add(key);
    }
  }

  return {
    elementProperties,
    propertyNames: [...propertyNames].sort((a, b) => a.localeCompare(b)),
  };
};

const getCanvas = (): HTMLCanvasElement => {
  const canvas = document.querySelector<HTMLCanvasElement>("#viewer-canvas");
  if (!canvas) {
    throw new Error("Viewer canvas not found");
  }
  return canvas;
};

const resetViewerState = () => {
  state = {
    filePath: null,
    issues: [],
    graph: null,
    propertyNames: [],
    elementProperties: new Map(),
  };
  currentColorMode = "type";
  updateColorModeOptions([]);
  viewerHost?.resetScene();
  renderFilePath(null);
  renderSelection(null);
  renderIssues([]);
};

const initialize = async () => {
  await InitializeCSG2Async();
  selectionContainer = queryElement<HTMLElement>('[data-panel="selection"]');
  issuesList = queryElement<HTMLUListElement>('[data-panel="issues"]');
  filePathLabel = queryElement<HTMLElement>('[data-state="file-path"]');
  gridToggle = queryElement<HTMLInputElement>('[data-control="grid-toggle"]');
  telemetryToggle = queryElement<HTMLInputElement>('[data-control="telemetry-toggle"]');
  toastContainer = queryElement<HTMLElement>('[data-state="toasts"]');
  colorModeSelect = queryElement<HTMLSelectElement>('[data-control="color-mode"]');
  optionsPanel = queryElement<HTMLElement>('[data-state="options-panel"]');
  optionsOpenButton = queryElement<HTMLButtonElement>('[data-action="open-options"]');
  optionsCloseButton = queryElement<HTMLButtonElement>('[data-action="close-options"]');
  rotationSensitivityInput = queryElement<HTMLInputElement>('[data-control="rotation-sensitivity"]');
  panSensitivityInput = queryElement<HTMLInputElement>('[data-control="pan-sensitivity"]');
  manualPathForm = queryElement<HTMLFormElement>('[data-action="manual-path-form"]');
  manualPathInput = queryElement<HTMLInputElement>('[data-control="manual-path"]');
  const openFileButton = queryElement<HTMLButtonElement>('[data-action="open-file"]');
  const fitViewButton = queryElement<HTMLButtonElement>('[data-action="fit-view"]');
  const resetViewButton = queryElement<HTMLButtonElement>('[data-action="reset-view"]');

  viewerHost?.dispose();
  viewerHost = createViewerHost({
    canvas: getCanvas(),
    onSelectionChanged: handleSelectionChange,
    initialGridVisible: gridToggle.checked,
  });
  if (!viewerHost) {
    throw new Error("Failed to initialize viewer host");
  }
  const persistedSettings = readViewerSettings(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
  viewerHost.setRotationSensitivity(persistedSettings.rotationSensitivity);
  viewerHost.setPanSensitivity(persistedSettings.panSensitivity);
  updateColorModeOptions([]);

  toolbarController?.dispose();
  toolbarController = attachToolbar(
    {
      openFileButton,
      fitViewButton,
      resetViewButton,
      optionsToggleButton: optionsOpenButton,
      colorModeSelect,
      gridToggle,
      telemetryToggle,
    },
    {
      onOpenFile: () => handleOpenFile(),
      onFitView: () => fitToCurrentBounds(),
      onResetView: () => {
        viewerHost?.setSelection(null);
        fitToCurrentBounds();
      },
      onOptionsToggle: () => {
        optionsPanelController?.toggle();
      },
      onColorModeChange: (mode) => {
        currentColorMode = mode;
        viewerHost?.setColorMode(mode);
      },
      onGridToggle: (visible) => {
        viewerHost?.setGridVisible(visible);
      },
      onTelemetryToggle: (enabled) => {
        setTelemetryEnabled(enabled);
        publishToast(createToast("info", enabled ? "Telemetry enabled" : "Telemetry disabled"));
      },
    },
  );
  keyboardController?.dispose();
  keyboardController = attachKeyboardShortcuts(
    { gridToggle },
    {
      onFitView: () => fitToCurrentBounds(),
      onResetView: () => {
        viewerHost?.setSelection(null);
        fitToCurrentBounds();
      },
      onClearSelection: () => {
        viewerHost?.setSelection(null);
      },
      onToggleGrid: (visible) => {
        viewerHost?.setGridVisible(visible);
      },
    },
  );
  optionsPanelController?.dispose();
  optionsPanelController = createOptionsPanelController({
    panel: optionsPanel,
    closeButton: optionsCloseButton,
    rotationInput: rotationSensitivityInput,
    panInput: panSensitivityInput,
    manualPathForm,
    manualPathInput,
    storageKey: SETTINGS_STORAGE_KEY,
    defaultSettings: DEFAULT_SETTINGS,
    getViewerHost: () => viewerHost,
    loadFileFromPath: (path) => handleLoadFileFromPath(path),
    notifyWarning: (message) => {
      publishToast(createToast("warning", message));
    },
  });
  optionsPanelController.refresh();
  toastManager?.dispose();
  toastManager = createToastManager({ container: toastContainer });
  initializeTelemetryToggle(telemetryToggle);
  renderFilePath(null);
  renderSelection(null);
  renderIssues([]);
};

const queryElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element for selector: ${selector}`);
  }
  return element;
};

const updateColorModeOptions = (propertyNames: readonly string[]) => {
  if (!colorModeSelect) {
    return;
  }

  const previousMode = currentColorMode;
  colorModeSelect.innerHTML = "";

  addColorModeOption("type", "TYPE");

  for (const property of propertyNames) {
    addColorModeOption(toPropertyColorMode(property), property);
  }

  const validated = ensureValidColorMode(previousMode, propertyNames);
  currentColorMode = validated;
  colorModeSelect.value = validated;
  viewerHost?.setColorMode(validated);
};

const addColorModeOption = (value: ColorMode, label: string) => {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  colorModeSelect.append(option);
};

const ensureValidColorMode = (
  desired: ColorMode,
  propertyNames: readonly string[],
): ColorMode => {
  const property = tryGetPropertyFromColorMode(desired);
  if (!property) {
    return desired;
  }
  return propertyNames.includes(property) ? desired : "type";
};

const loadFileFromContents = (path: string, contents: string, source: LoadSource): boolean => {
  const parseResult = parseNtr(path, contents);

  if (!isOk(parseResult)) {
    state = {
      filePath: path,
      graph: null,
      issues: [...parseResult.error],
      propertyNames: [],
      elementProperties: new Map(),
    };
    currentColorMode = "type";
    updateColorModeOptions([]);
    viewerHost?.resetScene();
    renderFilePath(path);
    renderSelection(null);
    renderIssues(state.issues);

    publishToast(
      createToast(
        "error",
        source === "manual" ? "Failed to load NTR file" : "Failed to reload NTR file",
        parseResult.error[0]?.message ?? "Unexpected parser error",
      ),
    );

    recordTelemetry("file_open_failed", {
      issueCount: state.issues.length,
      method: source,
    });

    if (source === "restore") {
      forgetLastFile();
      void stopFileWatch().catch(reportWatchStopFailure);
    }

    return false;
  }

  const graph = buildSceneGraph(parseResult.value.file);
  const propertyData = collectElementPropertyData(graph.elements);
  state = {
    filePath: path,
    graph,
    issues: [...parseResult.value.issues],
    propertyNames: propertyData.propertyNames,
    elementProperties: propertyData.elementProperties,
  };

  viewerHost?.load(graph, { maintainCamera: source === "watch" });
  updateColorModeOptions(state.propertyNames);
  viewerHost?.setSelection(null);
  renderFilePath(path);
  renderSelection(null);
  renderIssues(state.issues);

  const warningCount = state.issues.filter((issue) => issue.severity === "warning").length;
  const fileName = getFileName(path);
  const toastLevel = warningCount > 0 ? "warning" : "success";
  const toastTitleBase = source === "manual" ? "Loaded" : "Restored";
  publishToast(
    createToast(
      toastLevel,
      warningCount > 0
        ? `${toastTitleBase} ${fileName} with warnings`
        : `${toastTitleBase} ${fileName}`,
      warningCount > 0 ? `${warningCount} warnings detected` : undefined,
    ),
  );

  recordTelemetry("file_opened", {
    elementCount: graph.elements.length,
    warnings: warningCount,
    method: source,
  });

  rememberLastFile(path);
  if (source !== "watch") {
    void startFileWatch(path).catch(reportWatchStartFailure);
  }
  return true;
};

const handleFileChangeEvent = async (payload: FileChangePayload) => {
  if (!state.filePath) {
    return;
  }

  if (!pathsMatch(state.filePath, payload.path)) {
    return;
  }

  const result = await loadNtrFileAtPath(payload.path);
  if (result.status === "success") {
    loadFileFromContents(result.path, result.contents, "watch");
    return;
  }

  if (result.status === "error") {
    publishToast(
      createToast(
        "warning",
        "File change detected but reload failed",
        result.message || undefined,
      ),
    );
    if (import.meta.env.DEV) {
      console.warn("[watch] reload failed", payload, result);
    }
    // Keep watching; editors may rewrite files via temporary deletes before recreating them.
  }
};

const handleFileWatchError = (payload: FileChangePayload) => {
  publishToast(
    createToast(
      "warning",
      "File watch error",
      payload.kind.replace(/^error:/, "").trim() || undefined,
    ),
  );
};

const getFileDropManager = (): FileDropManager => {
  if (!fileDropManager) {
    fileDropManager = createFileDropManager({
      onEnter: (payload) => {
        if (import.meta.env.DEV) {
          console.debug("[drag-drop] drag enter", payload ?? []);
        }
      },
      onOver: (payload) => {
        if (import.meta.env.DEV) {
          console.debug("[drag-drop] drag over", payload ?? []);
        }
      },
      onLeave: () => {
        if (import.meta.env.DEV) {
          console.debug("[drag-drop] drag leave");
        }
      },
      onDrop: async (paths) => {
        if (import.meta.env.DEV) {
          console.debug("[drag-drop] drag drop", paths);
        }
        const [path] = paths;
        if (!path) {
          publishToast(createToast("warning", "Dropped file path unavailable"));
          return;
        }
        await handleDroppedFile(path);
      },
      onProcessingError: reportDropHandlingFailure,
      onSetupFailed: reportDropSetupFailure,
    });
  }
  return fileDropManager;
};

const setupFileDropListeners = async (): Promise<void> => {
  try {
    await getFileDropManager().setup();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[drag-drop] listener setup failed", error);
    }
  }
};

const handleDroppedFile = async (path: string) => {
  if (import.meta.env.DEV) {
    console.debug("[drag-drop] reading file", path);
  }
  const result = await loadNtrFileAtPath(path);
  if (result.status === "success") {
    try {
      loadFileFromContents(result.path, result.contents, "manual");
    } catch (error) {
      console.error(error);
      publishToast(createToast("error", "Unexpected error while opening dropped file"));
    }
    return;
  }

  publishToast(
    createToast(
      "error",
      "Failed to open dropped file",
      result.status === "error" ? result.message : undefined,
    ),
  );
};

const handleLoadFileFromPath = async (path: string): Promise<boolean> => {
  const result = await loadNtrFileAtPath(path);
  if (result.status === "success") {
    try {
      loadFileFromContents(result.path, result.contents, "manual");
      return true;
    } catch (error) {
      console.error(error);
      publishToast(createToast("error", "Unexpected error while opening file"));
      return false;
    }
  }

  publishToast(
    createToast(
      "error",
      "Failed to open NTR file",
      result.status === "error" ? result.message : undefined,
    ),
  );
  return false;
};

const handleOpenFile = async () => {
  const result = await openNtrFile();
  if (result.status === "cancelled") {
    return;
  }

  if (result.status === "error") {
    publishToast(createToast("error", "Failed to open NTR file", result.message));
    return;
  }

  try {
    loadFileFromContents(result.path, result.contents, "manual");
  } catch (error) {
    console.error(error);
    publishToast(createToast("error", "Unexpected error while opening file"));
  }
};

const restoreLastFile = async () => {
  const remembered = getRememberedFile();
  if (!remembered) {
    return;
  }

  const result = await loadNtrFileAtPath(remembered);
  if (result.status === "success") {
    try {
      loadFileFromContents(result.path, result.contents, "restore");
    } catch (error) {
      console.error(error);
      publishToast(createToast("error", "Unexpected error while reloading last file"));
      forgetLastFile();
    }
    return;
  }

  if (result.status === "error") {
    forgetLastFile();
    resetViewerState();
    void stopFileWatch().catch(reportWatchStopFailure);
    publishToast(
      createToast("warning", "Last NTR file unavailable", result.message || undefined),
    );
  }
};

const handleSelectionChange = (elementId: string | null) => {
  if (!state.graph) {
    renderSelection(null);
    return;
  }

  const element = state.graph.elements.find((item) => item.id === elementId) ?? null;
  renderSelection(element);
};

const renderFilePath = (path: string | null) => {
  if (!path) {
    filePathLabel.textContent = "";
    filePathLabel.title = "";
    return;
  }
  filePathLabel.textContent = getFileName(path);
  filePathLabel.title = path;
};

const renderSelection = (element: SceneElement | null) => {
  selectionContainer.innerHTML = "";

  if (!state.graph || state.graph.elements.length === 0) {
    selectionContainer.append(createEmptyState("Open an NTR file to begin."));
    return;
  }

  if (!element) {
    selectionContainer.append(
      createEmptyState("Click one of the rendered elements to inspect its details."),
    );
    return;
  }

  const list = document.createElement("dl");
  list.className = "detail-list";

  appendDetail(list, "Element ID", element.id);
  appendDetail(list, "Type", element.kind);

  const propertyMap = state.elementProperties.get(element.id);
  if (propertyMap) {
    for (const [key, value] of Object.entries(propertyMap)) {
      if (key === "id" || key === "kind") {
        continue;
      }
      appendDetail(list, key, value);
    }
  }

  selectionContainer.append(list);
};

const appendDetail = (list: HTMLDListElement, label: string, value: string) => {
  const term = document.createElement("dt");
  term.className = "detail-label";
  term.textContent = label;

  const description = document.createElement("dd");
  description.textContent = value;

  list.append(term, description);
};

const getFileName = (path: string): string => {
  const segments = path.split(/[/\\]/);
  return segments.at(-1) ?? path;
};

const renderIssues = (issues: ParseIssue[]) => {
  issuesList.innerHTML = "";
  if (issues.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No issues reported.";
    issuesList.append(empty);
    return;
  }

  issues.forEach((issue) => {
    const item = document.createElement("li");
    item.className = `issue-item ${issue.severity}`;

    const meta = document.createElement("div");
    meta.className = "issue-meta";
    meta.textContent = `${issue.severity.toUpperCase()} · ${issue.recordCode} · line ${issue.lineNumber}`;

    const message = document.createElement("div");
    message.className = "issue-message";
    message.textContent = issue.message;

    item.append(meta, message);
    issuesList.append(item);
  });
};

const createEmptyState = (text: string): HTMLElement => {
  const el = document.createElement("p");
  el.className = "empty-state";
  el.textContent = text;
  return el;
};

const fitToCurrentBounds = () => {
  const bounds = state.graph?.bounds ?? null;
  viewerHost?.fitToBounds(bounds);
};

window.addEventListener("DOMContentLoaded", () => {
  void (async () => {
    await initialize();
    await setupFileDropListeners();
    await setupFileWatchListeners();
    await restoreLastFile();
  })();
});

window.addEventListener("beforeunload", () => {
  fileWatchManager?.dispose();
  fileDropManager?.dispose();
  toolbarController?.dispose();
  keyboardController?.dispose();
  optionsPanelController?.dispose();
  toastManager?.dispose();
  viewerHost?.dispose();
  void stopFileWatch().catch(reportWatchStopFailure);
});
