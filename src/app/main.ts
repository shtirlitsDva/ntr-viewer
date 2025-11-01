import {
  loadNtrFileAtPath,
  openNtrFile,
  startFileWatch,
  stopFileWatch,
} from "@app/api/files";
import { initializeTelemetry, recordTelemetry, setTelemetryEnabled } from "@app/telemetry";
import { parseNtr } from "@ntr/parser";
import type { ParseIssue } from "@ntr/model";
import {
  buildSceneGraph,
  extractElementProperties,
  type SceneElement,
  type SceneGraph,
} from "@viewer/sceneGraph";
import { createBabylonRenderer } from "@viewer/viewer";
// import { createHighTessellationRenderer } from "@viewer/renderers";
import type { ColorMode, SceneRenderer } from "@viewer/engine";
import { toPropertyColorMode, tryGetPropertyFromColorMode } from "@viewer/engine";
import { isOk } from "@shared/result";
import { createToast, publishToast, subscribeToToasts } from "@shared/toast";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { InitializeCSG2Async } from "@babylonjs/core/Meshes/csg2";

interface AppState {
  filePath: string | null;
  issues: ParseIssue[];
  graph: SceneGraph | null;
  propertyNames: string[];
  elementProperties: Map<string, Record<string, string>>;
}

let renderer: SceneRenderer | null = null;
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
let optionsVisible = false;
let optionsPreviousFocus: HTMLElement | null = null;

const activeToasts = new Map<string, HTMLElement>();
const LAST_FILE_STORAGE_KEY = "ntr-viewer:last-file-path";
const SETTINGS_STORAGE_KEY = "ntr-viewer:options";

interface PersistedSettings {
  readonly rotationSensitivity: number;
  readonly panSensitivity: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  rotationSensitivity: 1,
  panSensitivity: 1,
};

interface FileChangePayload {
  readonly path: string;
  readonly kind: string;
}

type LoadSource = "manual" | "restore" | "watch";

let unlistenFileChange: (() => void) | null = null;
let unlistenWatchError: (() => void) | null = null;
let unlistenFileDrop: Array<() => void> = [];

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
  renderer?.load({ elements: [], bounds: null });
  renderer?.setSelection(null);
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

  // Swap renderer factories here for experimentation:
  renderer = createBabylonRenderer(getCanvas());
  // renderer = createHighTessellationRenderer(getCanvas());
  renderer.onSelectionChanged(handleSelectionChange);
  renderer.setGridVisible(gridToggle.checked);
  const persistedSettings = getPersistedSettings();
  renderer.setRotationSensitivity(persistedSettings.rotationSensitivity);
  renderer.setPanSensitivity(persistedSettings.panSensitivity);
  refreshOptionsValues();
  updateColorModeOptions([]);

  setupToolbar();
  setupOptionsPanel();
  setupKeyboardShortcuts();
  setupToasts();
  initializeTelemetryPreferences();
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

const setupToolbar = () => {
  queryElement<HTMLButtonElement>('[data-action="open-file"]').addEventListener("click", () => {
    void handleOpenFile();
  });

  queryElement<HTMLButtonElement>('[data-action="fit-view"]').addEventListener("click", () => {
    fitToCurrentBounds();
  });

  queryElement<HTMLButtonElement>('[data-action="reset-view"]').addEventListener("click", () => {
    renderer?.setSelection(null);
    fitToCurrentBounds();
  });

  optionsOpenButton.addEventListener("click", () => {
    if (optionsVisible) {
      hideOptionsPanel();
    } else {
      showOptionsPanel();
    }
  });

  colorModeSelect.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    currentColorMode = select.value as ColorMode;
    renderer?.setColorMode(currentColorMode);
  });

  gridToggle.addEventListener("change", () => {
    renderer?.setGridVisible(gridToggle.checked);
  });

  telemetryToggle.addEventListener("change", () => {
    setTelemetryEnabled(telemetryToggle.checked);
    publishToast(
      createToast(
        "info",
        telemetryToggle.checked
          ? "Telemetry enabled"
          : "Telemetry disabled",
      ),
    );
  });
};

const formatNumberForInput = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "1";
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/(?:\.0+|0+)$/, "");
};

const getPersistedSettings = (): PersistedSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const rotation = Number(parsed.rotationSensitivity);
    const pan = Number(parsed.panSensitivity);
    return {
      rotationSensitivity:
        Number.isFinite(rotation) && rotation > 0 ? rotation : DEFAULT_SETTINGS.rotationSensitivity,
      panSensitivity: Number.isFinite(pan) && pan > 0 ? pan : DEFAULT_SETTINGS.panSensitivity,
    };
  } catch (error) {
    console.warn("Failed to read viewer options", error);
    return DEFAULT_SETTINGS;
  }
};

const persistSettings = (settings: PersistedSettings) => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist viewer options", error);
  }
};

function refreshOptionsValues(): void {
  const settings = renderer
    ? {
        rotationSensitivity: renderer.getRotationSensitivity(),
        panSensitivity: renderer.getPanSensitivity(),
      }
    : getPersistedSettings();
  rotationSensitivityInput.value = formatNumberForInput(settings.rotationSensitivity);
  panSensitivityInput.value = formatNumberForInput(settings.panSensitivity);
}

function handleOptionsKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    hideOptionsPanel();
  }
}

function showOptionsPanel(): void {
  if (optionsVisible) {
    return;
  }
  refreshOptionsValues();
  optionsPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  optionsPanel.removeAttribute("hidden");
  optionsPanel.classList.add("visible");
  optionsVisible = true;
  optionsCloseButton.focus();
  document.addEventListener("keydown", handleOptionsKeydown);
}

function hideOptionsPanel(): void {
  if (!optionsVisible) {
    return;
  }
  persistSettings({
    rotationSensitivity: renderer?.getRotationSensitivity() ?? DEFAULT_SETTINGS.rotationSensitivity,
    panSensitivity: renderer?.getPanSensitivity() ?? DEFAULT_SETTINGS.panSensitivity,
  });
  optionsPanel.classList.remove("visible");
  optionsPanel.setAttribute("hidden", "");
  optionsVisible = false;
  document.removeEventListener("keydown", handleOptionsKeydown);
  if (optionsPreviousFocus) {
    optionsPreviousFocus.focus();
    optionsPreviousFocus = null;
  }
}

function applyRotationInput(): void {
  if (!renderer) {
    return;
  }
  const current = renderer.getRotationSensitivity();
  const parsed = Number(rotationSensitivityInput.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    rotationSensitivityInput.value = formatNumberForInput(current);
    return;
  }
  renderer.setRotationSensitivity(parsed);
  rotationSensitivityInput.value = formatNumberForInput(renderer.getRotationSensitivity());
  persistSettings({
    rotationSensitivity: renderer.getRotationSensitivity(),
    panSensitivity: renderer.getPanSensitivity(),
  });
}

function applyPanInput(): void {
  if (!renderer) {
    return;
  }
  const current = renderer.getPanSensitivity();
  const parsed = Number(panSensitivityInput.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    panSensitivityInput.value = formatNumberForInput(current);
    return;
  }
  renderer.setPanSensitivity(parsed);
  panSensitivityInput.value = formatNumberForInput(renderer.getPanSensitivity());
  persistSettings({
    rotationSensitivity: renderer.getRotationSensitivity(),
    panSensitivity: renderer.getPanSensitivity(),
  });
}

function handleManualPathSubmit(event: SubmitEvent): void {
  event.preventDefault();
  const path = manualPathInput.value.trim();
  if (!path) {
    publishToast(createToast("warning", "Enter a file path to load."));
    manualPathInput.focus();
    return;
  }
  void (async () => {
    const success = await handleLoadFileFromPath(path);
    if (success) {
      manualPathInput.value = "";
      hideOptionsPanel();
    }
  })();
}

function setupOptionsPanel(): void {
  optionsPanel.addEventListener("click", (event) => {
    if (event.target === optionsPanel) {
      hideOptionsPanel();
    }
  });
  optionsCloseButton.addEventListener("click", () => {
    hideOptionsPanel();
  });
  rotationSensitivityInput.addEventListener("change", applyRotationInput);
  rotationSensitivityInput.addEventListener("blur", applyRotationInput);
  panSensitivityInput.addEventListener("change", applyPanInput);
  panSensitivityInput.addEventListener("blur", applyPanInput);
  manualPathForm.addEventListener("submit", handleManualPathSubmit);
  refreshOptionsValues();
}

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
  renderer?.setColorMode(validated);
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

const setupKeyboardShortcuts = () => {
  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "f":
        fitToCurrentBounds();
        event.preventDefault();
        break;
      case "r":
        renderer?.setSelection(null);
        fitToCurrentBounds();
        event.preventDefault();
        break;
      case "escape":
        renderer?.setSelection(null);
        event.preventDefault();
        break;
      case "g":
        gridToggle.checked = !gridToggle.checked;
        renderer?.setGridVisible(gridToggle.checked);
        event.preventDefault();
        break;
      default:
        break;
    }
  });
};

const setupToasts = () => {
  subscribeToToasts((toast) => {
    const element = document.createElement("div");
    element.className = `toast toast-${toast.level}`;

    const message = document.createElement("p");
    message.className = "toast-message";
    message.textContent = toast.message;
    element.append(message);

    if (toast.detail) {
      const detail = document.createElement("p");
      detail.className = "toast-detail";
      detail.textContent = toast.detail;
      element.append(detail);
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => dismissToast(toast.id));
    element.append(closeButton);

    toastContainer.append(element);
    activeToasts.set(toast.id, element);

    window.setTimeout(() => dismissToast(toast.id), 5000);
  });
};

const dismissToast = (id: string) => {
  const element = activeToasts.get(id);
  if (!element) {
    return;
  }
  element.classList.add("toast-closing");
  window.setTimeout(() => {
    element.remove();
    activeToasts.delete(id);
  }, 150);
};

const initializeTelemetryPreferences = () => {
  const enabled = initializeTelemetry();
  telemetryToggle.checked = enabled;
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
    renderer?.load({ elements: [], bounds: null });
    renderer?.setSelection(null);
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
      void stopFileWatch();
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

  renderer?.load(graph, { maintainCamera: source === "watch" });
  updateColorModeOptions(state.propertyNames);
  renderer?.setSelection(null);
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
    void startFileWatch(path);
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

const setupFileWatchListeners = async () => {
  try {
    unlistenFileChange?.();
    unlistenFileChange = await listen<FileChangePayload>("ntr-file-changed", async (event) => {
      if (import.meta.env.DEV) {
        console.debug("[watch] change", event.payload.kind, event.payload.path);
      }
      await handleFileChangeEvent(event.payload);
    });

    unlistenWatchError?.();
    unlistenWatchError = await listen<FileChangePayload>(
      "ntr-file-watch-error",
      (event) => {
        if (import.meta.env.DEV) {
          console.warn("[watch] error", event.payload.kind, event.payload.path);
        }
        handleFileWatchError(event.payload);
      },
    );
  } catch (error) {
    console.warn("Failed to set up file watch listeners", error);
  }
};

const setupFileDropListeners = async () => {
  try {
    unlistenFileDrop.forEach((dispose) => {
      try {
        dispose();
      } catch (error) {
        console.warn("Failed disposing file drop listener", error);
      }
    });
    unlistenFileDrop = [];

    let highlightDispose: () => void;
    let overDispose: () => void;
    let leaveDispose: () => void;
    let dropDispose: () => void;

    highlightDispose = await listen<string[]>(TauriEvent.DRAG_ENTER, (event) => {
      if (import.meta.env.DEV) {
        console.debug("[drag-drop] drag enter", (event as unknown as { payload?: string[] }).payload);
      }
    });
    overDispose = await listen<string[]>(TauriEvent.DRAG_OVER, (event) => {
      if (import.meta.env.DEV) {
        console.debug("[drag-drop] drag over", (event as unknown as { payload?: string[] }).payload);
      }
    });
    leaveDispose = await listen<string[]>(TauriEvent.DRAG_LEAVE, () => {
      if (import.meta.env.DEV) {
        console.debug("[drag-drop] drag leave");
      }
    });
    dropDispose = await listen<string[]>(TauriEvent.DRAG_DROP, (event) => {
      const payload = (event as unknown as { payload?: { paths: string[] } }).payload;
      if (import.meta.env.DEV) {
        console.debug("[drag-drop] drag drop", payload);
      }
      const path = payload?.paths?.[0];
      if (!path) {
        publishToast(createToast("warning", "Dropped file path unavailable"));
        return;
      }
      void handleDroppedFile(path);
    });

    unlistenFileDrop.push(highlightDispose, overDispose, leaveDispose, dropDispose);
  } catch (error) {
    console.warn("Failed to set up file drop listeners", error);
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
    void stopFileWatch();
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
  renderer?.fitToBounds(bounds);
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
  unlistenFileChange?.();
  unlistenWatchError?.();
  unlistenFileDrop.forEach((dispose) => {
    try {
      dispose();
    } catch (error) {
      console.warn("Failed disposing file drop listener", error);
    }
  });
  unlistenFileDrop = [];
  void stopFileWatch();
});
