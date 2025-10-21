import { open } from "@tauri-apps/api/dialog";
import { readTextFile } from "@tauri-apps/api/fs";
import type { NtrComponent, NtrDocument, NtrIssue, NominalDiameter, Vector3 } from "../ntr/model";
import { parseNtr } from "../ntr/parser";
import { createViewer } from "../render/viewer";
import type { ColorMode, ViewerHandle } from "../render/viewer";

interface AppState {
  readonly viewer: ViewerHandle;
  document: NtrDocument | null;
  selection: NtrComponent | null;
  colorMode: ColorMode;
}

export const bootstrapApp = async (): Promise<void> => {
  const root = document.getElementById("app-root");
  if (!root) {
    throw new Error("Missing root container");
  }

  root.innerHTML = "";

  const toolbar = createToolbar();
  const viewerContainer = createViewerContainer();
  const sidePanel = createSidePanel();

  root.append(toolbar.element, viewerContainer.host);
  viewerContainer.host.append(sidePanel.panel);

  const state: AppState = {
    viewer: createViewer(viewerContainer.stage, {
      onSelect: (component) => {
        state.selection = component;
        populateSelection(sidePanel.selectionTable, component, state.document);
      }
    }),
    document: null,
    selection: null,
    colorMode: "type"
  };

  state.viewer.setColoring(state.colorMode);
  bindToolbar(toolbar, state, sidePanel);
  bindDragAndDrop(viewerContainer.host, state, sidePanel);
  bindKeyboardShortcuts(toolbar, state);
};

interface ToolbarElements {
  readonly element: HTMLElement;
  readonly openButton: HTMLButtonElement;
  readonly fitButton: HTMLButtonElement;
  readonly gridToggle: HTMLButtonElement;
  readonly colorSelect: HTMLSelectElement;
}

const createToolbar = (): ToolbarElements => {
  const element = document.createElement("div");
  element.className = "toolbar";

  const openButton = document.createElement("button");
  openButton.textContent = "Open";
  openButton.title = "Open NTR file";

  const fitButton = document.createElement("button");
  fitButton.textContent = "Fit";
  fitButton.title = "Fit model to view";

  const gridToggle = document.createElement("button");
  gridToggle.textContent = "Grid";
  gridToggle.title = "Toggle ground grid";
  gridToggle.setAttribute("aria-pressed", "true");

  const colorSelect = document.createElement("select");
  colorSelect.className = "color-select";
  const colorModes: Array<{ value: ColorMode; label: string }> = [
    { value: "type", label: "Color: Type" },
    { value: "material", label: "Color: Material" },
    { value: "loadCase", label: "Color: Load" },
    { value: "group", label: "Color: Group" },
    { value: "diameter", label: "Color: Diameter" }
  ];
  for (const mode of colorModes) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    colorSelect.append(option);
  }

  element.append(openButton, fitButton, gridToggle, colorSelect);

  return { element, openButton, fitButton, gridToggle, colorSelect };
};

interface ViewerContainer {
  readonly host: HTMLElement;
  readonly stage: HTMLElement;
}

const createViewerContainer = (): ViewerContainer => {
  const host = document.createElement("div");
  host.className = "viewer-container";

  const stage = document.createElement("div");
  stage.className = "viewer-stage";
  host.append(stage);

  return { host, stage };
};

interface SidePanelElements {
  readonly panel: HTMLElement;
  readonly selectionTable: HTMLTableSectionElement;
  readonly summaryTable: HTMLTableSectionElement;
  readonly issuesList: HTMLUListElement;
  readonly message: HTMLParagraphElement;
}

const createSidePanel = (): SidePanelElements => {
  const panel = document.createElement("aside");
  panel.className = "panel";

  const selectionHeading = document.createElement("h2");
  selectionHeading.textContent = "Selection";

  const selectionTable = document.createElement("table");
  selectionTable.className = "properties-table";
  const selectionBody = document.createElement("tbody");
  selectionTable.append(selectionBody);

  const summaryHeading = document.createElement("h2");
  summaryHeading.textContent = "Summary";

  const message = document.createElement("p");
  message.textContent = "Drop an .ntr file or use Open to begin.";

  const summaryTable = document.createElement("table");
  summaryTable.className = "properties-table";
  const summaryBody = document.createElement("tbody");
  summaryTable.append(summaryBody);

  const issuesHeading = document.createElement("h2");
  issuesHeading.textContent = "Issues";

  const issuesList = document.createElement("ul");
  issuesList.className = "error-list";

  panel.append(
    selectionHeading,
    selectionTable,
    summaryHeading,
    message,
    summaryTable,
    issuesHeading,
    issuesList
  );

  return {
    panel,
    selectionTable: selectionBody,
    summaryTable: summaryBody,
    issuesList,
    message
  };
};

const bindToolbar = (toolbar: ToolbarElements, state: AppState, sidePanel: SidePanelElements) => {
  toolbar.colorSelect.value = state.colorMode;

  toolbar.openButton.addEventListener("click", async () => {
    const selection = await open({
      multiple: false,
      filters: [{ name: "ROHR2 Neutral", extensions: ["ntr", "txt"] }]
    });

    if (selection === null) {
      return;
    }

    const path = Array.isArray(selection) ? selection[0] : selection;
    try {
      const content = await readTextFile(path);
      processDocument(content, `File: ${path}`, state, sidePanel);
    } catch (error) {
      sidePanel.message.textContent = `Failed to read file: ${(error as Error).message}`;
    }
  });

  toolbar.fitButton.addEventListener("click", () => {
    state.viewer.fitToScene();
  });

  toolbar.gridToggle.addEventListener("click", () => {
    const visible = state.viewer.toggleGrid();
    toolbar.gridToggle.setAttribute("aria-pressed", visible ? "true" : "false");
  });

  toolbar.colorSelect.addEventListener("change", () => {
    const mode = toolbar.colorSelect.value as ColorMode;
    state.colorMode = mode;
    state.viewer.setColoring(mode);
  });
};

const bindDragAndDrop = (container: HTMLElement, state: AppState, sidePanel: SidePanelElements) => {
  container.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer?.dropEffect && (event.dataTransfer.dropEffect = "copy");
  });

  container.addEventListener("drop", async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      processDocument(content, `Drop: ${file.name}`, state, sidePanel);
    } catch (error) {
      sidePanel.message.textContent = `Failed to read dropped file: ${(error as Error).message}`;
    }
  });
};

const bindKeyboardShortcuts = (toolbar: ToolbarElements, state: AppState) => {
  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
        return;
      }
    }

    switch (event.key.toLowerCase()) {
      case "f":
        event.preventDefault();
        state.viewer.fitToScene();
        break;
      case "g":
        event.preventDefault();
        {
          const visible = state.viewer.toggleGrid();
          toolbar.gridToggle.setAttribute("aria-pressed", visible ? "true" : "false");
        }
        break;
      case "r":
        event.preventDefault();
        state.viewer.resetView();
        break;
      default:
        break;
    }
  });
};

const processDocument = (
  source: string,
  label: string,
  state: AppState,
  sidePanel: SidePanelElements
) => {
  const result = parseNtr(source);
  if (!result.ok) {
    sidePanel.message.textContent = `${label} — ${result.error.message}`;
    state.document = null;
    state.selection = null;
    state.viewer.setDocument(null);
    populateIssues(sidePanel.issuesList, []);
    populateSummary(sidePanel.summaryTable, null);
    populateSelection(sidePanel.selectionTable, null, null);
    return;
  }

  state.document = result.value;
  state.selection = null;
  state.viewer.setDocument(result.value);
  state.viewer.setColoring(state.colorMode);
  sidePanel.message.textContent = `${label} — ${result.value.components.length} components loaded`;

  populateIssues(sidePanel.issuesList, result.value.issues);
  populateSummary(sidePanel.summaryTable, result.value);
  populateSelection(sidePanel.selectionTable, null, result.value);
};

const populateIssues = (list: HTMLUListElement, issues: readonly NtrIssue[]) => {
  list.replaceChildren();
  if (issues.length === 0) {
    const empty = document.createElement("li");
    empty.className = "error-item";
    empty.textContent = "No issues detected.";
    list.append(empty);
    return;
  }

  for (const issue of issues) {
    const item = document.createElement("li");
    item.className = `error-item ${issue.severity}`;
    item.textContent = `${capitalize(issue.severity)} line ${issue.line}: ${issue.message}`;
    list.append(item);
  }
};

const populateSelection = (
  tbody: HTMLTableSectionElement,
  component: NtrComponent | null,
  doc: NtrDocument | null
) => {
  tbody.replaceChildren();

  if (!component || !doc) {
    const row = document.createElement("tr");
    const single = document.createElement("td");
    single.colSpan = 2;
    single.textContent = "No element selected.";
    row.append(single);
    tbody.append(row);
    return;
  }

  const entries = describeComponent(component, doc.metadata.units);
  appendRows(tbody, entries);
};

const populateSummary = (tbody: HTMLTableSectionElement, doc: NtrDocument | null) => {
  tbody.replaceChildren();

  if (!doc) {
    const row = document.createElement("tr");
    const single = document.createElement("td");
    single.colSpan = 2;
    single.textContent = "No document loaded.";
    row.append(single);
    tbody.append(row);
    return;
  }

  const entries = summarize(doc);
  appendRows(tbody, entries);
};

const appendRows = (
  tbody: HTMLTableSectionElement,
  rows: ReadonlyArray<readonly [string, string]>
) => {
  for (const [label, value] of rows) {
    const tr = document.createElement("tr");
    const labelCell = document.createElement("th");
    labelCell.textContent = label;
    const valueCell = document.createElement("td");
    valueCell.textContent = value;
    tr.append(labelCell, valueCell);
    tbody.append(tr);
  }
};

const summarize = (doc: NtrDocument): ReadonlyArray<readonly [string, string]> => {
  const totals = new Map<string, number>();
  for (const component of doc.components) {
    totals.set(component.kind, (totals.get(component.kind) ?? 0) + 1);
  }

  const rows: Array<readonly [string, string]> = [
    ["Components", doc.components.length.toString()],
    ["Units", doc.metadata.units]
  ];

  for (const [kind, count] of totals.entries()) {
    rows.push([capitalize(kind), count.toString()]);
  }

  if (doc.metadata.projectName) {
    rows.push(["Project", doc.metadata.projectName]);
  }

  if (doc.metadata.code) {
    rows.push(["Code", doc.metadata.code]);
  }

  return rows;
};

const describeComponent = (
  component: NtrComponent,
  units: string
): ReadonlyArray<readonly [string, string]> => {
  const rows: Array<readonly [string, string]> = [
    ["ID", component.id],
    ["Type", componentKindLabel(component)]
  ];

  if (component.label) {
    rows.push(["Label", component.label]);
  }

  if (component.material) {
    rows.push(["Material", component.material]);
  }

  if (component.loadCase) {
    rows.push(["Load Case", component.loadCase]);
  }

  if (component.group) {
    rows.push(["Group", component.group]);
  }

  switch (component.kind) {
    case "straight": {
      rows.push(["Length", formatLength(distance(component.start, component.end), units)]);
      rows.push(["Nominal", formatNominal(component.nominal, units)]);
      break;
    }
    case "reducer": {
      rows.push(["Length", formatLength(distance(component.start, component.end), units)]);
      rows.push(["Start Nominal", formatNominal(component.nominalStart, units)]);
      rows.push(["End Nominal", formatNominal(component.nominalEnd, units)]);
      break;
    }
    case "bend": {
      rows.push(["Arc Length", formatLength(approximateBendLength(component), units)]);
      rows.push(["Nominal", formatNominal(component.nominal, units)]);
      break;
    }
    case "tee": {
      rows.push([
        "Run Length",
        formatLength(distance(component.runStart, component.runEnd), units)
      ]);
      rows.push([
        "Branch Length",
        formatLength(distance(component.branchStart, component.branchEnd), units)
      ]);
      rows.push(["Run Nominal", formatNominal(component.runNominal, units)]);
      rows.push(["Branch Nominal", formatNominal(component.branchNominal, units)]);
      break;
    }
  }

  return rows;
};

const componentKindLabel = (component: NtrComponent): string => {
  switch (component.kind) {
    case "straight":
      return "Straight Pipe";
    case "reducer":
      return "Reducer";
    case "bend":
      return "Bend";
    case "tee":
      return "Tee";
    default:
      return capitalize(component.kind);
  }
};

const formatNominal = (nominal: NominalDiameter, units: string): string => {
  const parts = [`${nominal.name}`];
  parts.push(`Ø ${nominal.outsideDiameter.toFixed(1)} ${units.toLowerCase()}`);
  if (nominal.wallThickness !== undefined) {
    parts.push(`t ${nominal.wallThickness.toFixed(1)} ${units.toLowerCase()}`);
  }
  return parts.join(" · ");
};

const formatLength = (value: number, units: string): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(1)} ${units.toLowerCase()}`;
};

const distance = (a: Vector3, b: Vector3): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.hypot(dx, dy, dz);
};

const approximateBendLength = (component: Extract<NtrComponent, { kind: "bend" }>): number => {
  const segments = 24;
  let length = 0;
  let previous = component.start;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const point = quadraticBezier(component.start, component.control, component.end, t);
    length += distance(previous, point);
    previous = point;
  }
  return length;
};

const quadraticBezier = (p0: Vector3, p1: Vector3, p2: Vector3, t: number): Vector3 => {
  const l1 = lerp(p0, p1, t);
  const l2 = lerp(p1, p2, t);
  return lerp(l1, l2, t);
};

const lerp = (a: Vector3, b: Vector3, t: number): Vector3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
});

const capitalize = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
