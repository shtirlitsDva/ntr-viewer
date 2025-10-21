import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  HighlightLayer,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3 as BabylonVector3
} from "babylonjs";
import { buildComponentGeometry } from "../geo/builders";
import type { NtrComponent, NtrDocument } from "../ntr/model";

export type ColorMode = "type" | "material" | "loadCase" | "group" | "diameter";

export interface ViewerOptions {
  readonly onSelect: (component: NtrComponent | null) => void;
}

export interface ViewerHandle {
  readonly canvas: HTMLCanvasElement;
  fitToScene(): void;
  resetView(): void;
  toggleGrid(): boolean;
  setColoring(mode: ColorMode): void;
  setDocument(document: NtrDocument | null): void;
  dispose(): void;
}

interface ComponentState {
  readonly component: NtrComponent;
  readonly meshes: readonly AbstractMesh[];
  readonly material: StandardMaterial;
}

export const createViewer = (host: HTMLElement, options: ViewerOptions): ViewerHandle => {
  const canvas = document.createElement("canvas");
  canvas.className = "render-canvas";
  host.append(canvas);

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  });
  const scene = new Scene(engine);

  const defaultAlpha = Math.PI / 2;
  const defaultBeta = Math.PI / 2.8;
  const defaultRadius = 20;

  const camera = new ArcRotateCamera(
    "orbitCamera",
    defaultAlpha,
    defaultBeta,
    defaultRadius,
    new BabylonVector3(0, 0, 0),
    scene
  );
  camera.lowerBetaLimit = 0.1;
  camera.upperBetaLimit = Math.PI / 1.95;
  camera.lowerRadiusLimit = 0.5;
  camera.attachControl(canvas, true);

  const light = new HemisphericLight("hemi", new BabylonVector3(0, 1, 0), scene);
  light.intensity = 1.1;

  const grid = createGrid(scene);
  let gridVisible = true;

  const highlightLayer = new HighlightLayer("selection-highlight", scene);
  highlightLayer.blurHorizontalSize = 0.8;
  highlightLayer.blurVerticalSize = 0.8;

  const componentStates = new Map<string, ComponentState>();
  let currentDocument: NtrDocument | null = null;
  let selectedComponentId: string | null = null;
  let colorMode: ColorMode = "type";

  engine.runRenderLoop(() => {
    if (!scene.isDisposed()) {
      scene.render();
    }
  });

  window.addEventListener("resize", () => engine.resize());

  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
      return;
    }

    const event = pointerInfo.event as PointerEvent;
    if (event.button !== 0) {
      return;
    }

    const pickInfo = pointerInfo.pickInfo;
    const mesh = pickInfo?.pickedMesh ?? null;
    if (!pickInfo?.hit || mesh === null) {
      applySelection(null);
      return;
    }

    const componentId = readComponentId(mesh);
    if (!componentId) {
      applySelection(null);
      return;
    }

    applySelection(componentId);
  });

  const applySelection = (componentId: string | null) => {
    if (selectedComponentId === componentId) {
      return;
    }

    if (selectedComponentId) {
      const previous = componentStates.get(selectedComponentId);
      if (previous) {
        for (const mesh of previous.meshes) {
          highlightLayer.removeMesh(mesh);
        }
      }
    }

    selectedComponentId = componentId;
    if (!componentId) {
      options.onSelect(null);
      return;
    }

    const state = componentStates.get(componentId);
    if (!state) {
      options.onSelect(null);
      return;
    }

    for (const mesh of state.meshes) {
      highlightLayer.addMesh(mesh, selectionColor);
    }

    options.onSelect(state.component);
  };

  const clearComponents = () => {
    for (const state of componentStates.values()) {
      for (const mesh of state.meshes) {
        highlightLayer.removeMesh(mesh);
        mesh.dispose(false, true);
      }
      state.material.dispose(true, true);
    }
    componentStates.clear();
    selectedComponentId = null;
    options.onSelect(null);
  };

  const setDocument = (document: NtrDocument | null) => {
    clearComponents();
    currentDocument = document;
    if (!document) {
      fitToScene();
      return;
    }

    for (const component of document.components) {
      const material = createComponentMaterial(scene, component);
      const meshes = buildComponentGeometry(component, {
        scene
      }).map((mesh) => {
        mesh.id = mesh.id || `${component.kind}-${component.id}`;
        mesh.metadata = {
          ...(mesh.metadata ?? {}),
          componentId: component.id
        };
        mesh.material = material;
        return mesh;
      });

      if (meshes.length === 0) {
        material.dispose();
        continue;
      }

      componentStates.set(component.id, {
        component,
        meshes,
        material
      });
    }

    applyColoring();
    fitToScene();
  };

  const fitToScene = () => {
    const meshes = Array.from(componentStates.values()).flatMap((state) => state.meshes);
    if (meshes.length === 0) {
      camera.setTarget(BabylonVector3.Zero());
      camera.radius = defaultRadius;
      return;
    }

    const bounds = computeBounds(meshes);
    if (!bounds) {
      return;
    }

    camera.setTarget(bounds.center);
    camera.radius = Math.max(bounds.extent * 1.2, 1);
  };

  const toggleGrid = (): boolean => {
    gridVisible = !gridVisible;
    grid.setEnabled(gridVisible);
    return gridVisible;
  };

  const resetView = () => {
    camera.alpha = defaultAlpha;
    camera.beta = defaultBeta;
    fitToScene();
    if (componentStates.size === 0) {
      camera.radius = defaultRadius;
      camera.setTarget(BabylonVector3.Zero());
    }
  };

  const setColoring = (mode: ColorMode) => {
    colorMode = mode;
    applyColoring();
  };

  const applyColoring = () => {
    if (!currentDocument) {
      return;
    }

    const colorMap = deriveColors(currentDocument, colorMode);
    for (const [id, state] of componentStates.entries()) {
      const baseColor = colorMap.get(id) ?? componentPalette[state.component.kind] ?? fallbackColor;
      applyMaterialColor(state.material, baseColor);
    }
  };

  return {
    canvas,
    fitToScene,
    resetView,
    toggleGrid,
    setColoring,
    setDocument,
    dispose: () => {
      clearComponents();
      highlightLayer.dispose();
      grid.dispose(false, true);
      scene.dispose();
      engine.dispose();
      canvas.remove();
    }
  };
};

const selectionColor = new Color3(1, 0.85, 0.2);
const fallbackColor = new Color3(0.6, 0.6, 0.6);

const componentPalette: Record<NtrComponent["kind"], Color3> = {
  straight: new Color3(0.4, 0.7, 0.9),
  reducer: new Color3(0.8, 0.5, 0.2),
  bend: new Color3(0.6, 0.6, 0.85),
  tee: new Color3(0.65, 0.45, 0.85)
};

const createComponentMaterial = (scene: Scene, component: NtrComponent): StandardMaterial => {
  const material = new StandardMaterial(`component-material-${component.id}`, scene);
  material.diffuseColor = componentPalette[component.kind] ?? fallbackColor;
  material.specularColor = new Color3(0.2, 0.2, 0.2);
  material.emissiveColor = material.diffuseColor.scale(0.1);
  material.backFaceCulling = false;
  return material;
};

const createGrid = (scene: Scene) => {
  const grid = MeshBuilder.CreateGround(
    "ground-grid",
    { width: 10_000, height: 10_000, subdivisions: 10 },
    scene
  );
  grid.isPickable = false;

  const material = new StandardMaterial("grid-material", scene);
  material.diffuseColor = new Color3(0.15, 0.15, 0.15);
  material.specularColor = Color3.Black();
  material.alpha = 0.25;
  grid.material = material;

  return grid;
};

const readComponentId = (mesh: AbstractMesh | null): string | null => {
  if (!mesh || !mesh.metadata) {
    return null;
  }

  const metadata = mesh.metadata as { componentId?: string };
  if (metadata.componentId) {
    return metadata.componentId;
  }

  if (mesh.parent && "metadata" in mesh.parent) {
    const parentMetadata = mesh.parent.metadata as { componentId?: string };
    return parentMetadata?.componentId ?? null;
  }

  return null;
};

interface Bounds {
  readonly center: BabylonVector3;
  readonly extent: number;
}

const computeBounds = (meshes: readonly AbstractMesh[]): Bounds | null => {
  let min = new BabylonVector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  let max = new BabylonVector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  );

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const boundingInfo = mesh.getBoundingInfo();
    const box = boundingInfo.boundingBox.vectorsWorld;
    for (const vector of box) {
      min = BabylonVector3.Minimize(min, vector);
      max = BabylonVector3.Maximize(max, vector);
    }
  }

  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    return null;
  }

  const center = min.add(max).scale(0.5);
  const size = max.subtract(min);
  const extent = Math.max(size.x, size.y, size.z);

  return { center, extent };
};

const applyMaterialColor = (material: StandardMaterial, color: Color3) => {
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.15);
};

const deriveColors = (document: NtrDocument, mode: ColorMode): Map<string, Color3> => {
  switch (mode) {
    case "type":
      return deriveTypeColors(document);
    case "material":
      return deriveCategoricalColors(document, (component) => component.material ?? "n/a");
    case "loadCase":
      return deriveCategoricalColors(document, (component) => component.loadCase ?? "n/a");
    case "group":
      return deriveCategoricalColors(document, (component) => component.group ?? "n/a");
    case "diameter":
      return deriveNumericColors(document, componentDiameter);
    default:
      return deriveTypeColors(document);
  }
};

const deriveTypeColors = (document: NtrDocument): Map<string, Color3> => {
  const colors = new Map<string, Color3>();
  for (const component of document.components) {
    colors.set(component.id, componentPalette[component.kind] ?? fallbackColor);
  }
  return colors;
};

const deriveCategoricalColors = (
  document: NtrDocument,
  selector: (component: NtrComponent) => string
): Map<string, Color3> => {
  const valueToColor = new Map<string, Color3>();
  const result = new Map<string, Color3>();

  for (const component of document.components) {
    const value = selector(component).trim();
    if (!valueToColor.has(value)) {
      valueToColor.set(value, colorFromString(value));
    }
    result.set(component.id, valueToColor.get(value) ?? fallbackColor);
  }

  return result;
};

const deriveNumericColors = (
  document: NtrDocument,
  selector: (component: NtrComponent) => number | null
): Map<string, Color3> => {
  const values: number[] = [];
  const pairs: Array<{ id: string; value: number | null }> = [];

  for (const component of document.components) {
    const value = selector(component);
    if (value !== null && Number.isFinite(value)) {
      values.push(value);
    }
    pairs.push({ id: component.id, value });
  }

  if (values.length === 0) {
    return deriveTypeColors(document);
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const start = new Color3(0.2, 0.45, 0.9);
  const end = new Color3(0.9, 0.55, 0.2);

  const result = new Map<string, Color3>();
  for (const { id, value } of pairs) {
    if (value === null || !Number.isFinite(value)) {
      result.set(id, fallbackColor);
      continue;
    }
    const normalized = (value - min) / span;
    result.set(id, Color3.Lerp(start, end, normalized));
  }

  return result;
};

const componentDiameter = (component: NtrComponent): number | null => {
  switch (component.kind) {
    case "straight":
      return component.nominal.outsideDiameter;
    case "bend":
      return component.nominal.outsideDiameter;
    case "reducer":
      return (component.nominalStart.outsideDiameter + component.nominalEnd.outsideDiameter) / 2;
    case "tee":
      return (
        (component.runNominal.outsideDiameter + component.branchNominal.outsideDiameter) / 2
      );
    default:
      return null;
  }
};

const colorFromString = (value: string): Color3 => {
  if (!value || value === "n/a") {
    return fallbackColor;
  }

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  const hue = ((hash >>> 0) % 360) / 360;
  const saturation = 0.55;
  const lightness = 0.5;
  return hslToColor3(hue, saturation, lightness);
};

const hslToColor3 = (h: number, s: number, l: number): Color3 => {
  if (s === 0) {
    return new Color3(l, l, l);
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const channel = (t: number) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };

  const r = channel(h + 1 / 3);
  const g = channel(h);
  const b = channel(h - 1 / 3);
  return new Color3(r, g, b);
};
