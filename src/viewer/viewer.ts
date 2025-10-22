import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 as BabylonVector3 } from "@babylonjs/core/Maths/math.vector";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Meshes/Builders/linesBuilder";
import "@babylonjs/core/Meshes/Builders/groundBuilder";

import type { ResolvedPoint, SceneElement, SceneGraph } from "@viewer/sceneGraph";

export type ColorMode = "type" | "material";

const TYPE_COLOR_MAP: Record<SceneElement["kind"], Color3> = {
  RO: new Color3(0.9, 0.6, 0.2),
  BOG: new Color3(0.2, 0.7, 0.9),
  TEE: new Color3(0.8, 0.3, 0.6),
  ARM: new Color3(0.4, 0.9, 0.5),
  PROF: new Color3(0.7, 0.7, 0.2),
  RED: new Color3(0.9, 0.4, 0.2),
};

const HIGHLIGHT_COLOR = new Color3(1, 1, 0.4);
const DEFAULT_CAMERA_RADIUS = 10;

type SelectionListener = (elementId: string | null) => void;
interface MeshMetadata {
  elementId?: string;
}

export class Viewer {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly ground: Mesh;
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly elementMeshes = new Map<string, LinesMesh[]>();
  private readonly elementLookup = new Map<string, SceneElement>();
  private readonly elementBaseColor = new Map<string, Color3>();
  private readonly materialColorCache = new Map<string, Color3>();
  private resizeHandler: (() => void) | null = null;
  private currentGraph: SceneGraph | null = null;
  private selectedElement: string | null = null;
  private colorMode: ColorMode = "type";
  private gridVisible = true;

  public constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);

    this.camera = new ArcRotateCamera(
      "camera",
      Math.PI / 4,
      Math.PI / 3,
      DEFAULT_CAMERA_RADIUS,
      BabylonVector3.Zero(),
      this.scene,
    );
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 0.1;

    const light = new HemisphericLight("hemi", new BabylonVector3(0, 1, 0), this.scene);
    light.intensity = 0.9;

    this.ground = MeshBuilder.CreateGround(
      "grid",
      { width: 1, height: 1, subdivisions: 20 },
      this.scene,
    );
    const groundMaterial = new StandardMaterial("grid-material", this.scene);
    groundMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);
    groundMaterial.specularColor = Color3.Black();
    groundMaterial.alpha = 0.4;
    groundMaterial.wireframe = true;
    this.ground.material = groundMaterial;
    this.ground.isPickable = false;

    this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERUP) {
        return;
      }
      const pick = pointerInfo.pickInfo;
      const metadata = pick?.pickedMesh?.metadata as MeshMetadata | undefined;
      if (pick?.hit && metadata?.elementId) {
        this.setSelection(metadata.elementId);
      }
    });

    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    const resize = () => {
      this.engine.resize();
    };
    window.addEventListener("resize", resize);
    this.resizeHandler = resize;
  }

  public dispose(): void {
    this.clearElements();
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    this.scene.dispose();
    this.engine.dispose();
  }

  public load(graph: SceneGraph): void {
    this.clearElements();
    this.currentGraph = graph;

    graph.elements.forEach((element) => {
      const meshes = this.createMeshesForElement(element);
      if (meshes.length === 0) {
        return;
      }
      this.elementMeshes.set(element.id, meshes);
      this.elementLookup.set(element.id, element);
    });

    this.updateColors();
    this.applySelectionColors();
    this.updateGround(graph.bounds);
    this.fitToBounds(graph.bounds);
  }

  public setColorMode(mode: ColorMode): void {
    if (this.colorMode === mode) {
      return;
    }
    this.colorMode = mode;
    this.updateColors();
    this.applySelectionColors();
  }

  public setSelection(elementId: string | null): void {
    if (this.selectedElement === elementId) {
      return;
    }
    this.selectedElement = elementId;
    this.applySelectionColors();
    this.notifySelectionChanged();
  }

  public onSelectionChanged(listener: SelectionListener): () => void {
    this.selectionListeners.add(listener);
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  public setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    this.ground.isVisible = visible && this.currentGraph?.bounds !== null;
  }

  public fitToBounds(bounds: SceneGraph["bounds"]): void {
    if (!bounds) {
      this.camera.target = BabylonVector3.Zero();
      this.camera.radius = DEFAULT_CAMERA_RADIUS;
      return;
    }

    const center = new BabylonVector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2,
    );

    const spanX = bounds.max.x - bounds.min.x;
    const spanY = bounds.max.y - bounds.min.y;
    const spanZ = bounds.max.z - bounds.min.z;
    const maxSpan = Math.max(spanX, spanY, spanZ, 1);
    const radius = maxSpan * 1.5;

    this.camera.target = center;
    this.camera.radius = radius;
    this.camera.lowerRadiusLimit = radius * 0.05;
  }

  private notifySelectionChanged(): void {
    for (const listener of this.selectionListeners) {
      listener(this.selectedElement);
    }
  }

  private clearElements(): void {
    for (const meshes of this.elementMeshes.values()) {
      meshes.forEach((mesh) => mesh.dispose());
    }
    this.elementMeshes.clear();
    this.elementLookup.clear();
    this.elementBaseColor.clear();
  }

  private updateGround(bounds: SceneGraph["bounds"]): void {
    if (!bounds) {
      this.ground.isVisible = false;
      return;
    }

    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;
    const size = Math.max(spanX, spanZ, 1);

    this.ground.scaling.x = size;
    this.ground.scaling.z = size;
    this.ground.position.x = (bounds.min.x + bounds.max.x) / 2;
    this.ground.position.z = (bounds.min.z + bounds.max.z) / 2;
    this.ground.position.y = bounds.min.y;
    this.ground.isVisible = this.gridVisible;
  }

  private updateColors(): void {
    for (const [id, element] of this.elementLookup.entries()) {
      const color = this.getColorForElement(element);
      this.elementBaseColor.set(id, color);
      if (this.selectedElement !== id) {
        this.applyColorToMeshes(id, color);
      }
    }
  }

  private applySelectionColors(): void {
    for (const [id, baseColor] of this.elementBaseColor.entries()) {
      if (this.selectedElement && id === this.selectedElement) {
        this.applyColorToMeshes(id, HIGHLIGHT_COLOR);
      } else {
        this.applyColorToMeshes(id, baseColor);
      }
    }
  }

  private applyColorToMeshes(id: string, color: Color3): void {
    const meshes = this.elementMeshes.get(id);
    if (!meshes) {
      return;
    }
    meshes.forEach((mesh) => {
      mesh.color = color.clone();
    });
  }

  private createMeshesForElement(element: SceneElement): LinesMesh[] {
    const segments: BabylonVector3[][] = [];
    switch (element.kind) {
      case "RO": {
        const segment = this.segmentFromPoints(element.start, element.end);
        if (segment) segments.push(segment);
        break;
      }
      case "PROF": {
        const segment = this.segmentFromPoints(element.start, element.end);
        if (segment) segments.push(segment);
        break;
      }
      case "BOG": {
        const path = this.pathFromPoints([element.start, element.tangent, element.end]);
        if (path) segments.push(path);
        break;
      }
      case "TEE": {
        const main = this.segmentFromPoints(element.mainStart, element.mainEnd);
        if (main) segments.push(main);
        const branch = this.segmentFromPoints(element.branchStart, element.branchEnd);
        if (branch) segments.push(branch);
        break;
      }
      case "ARM": {
        const segment = this.segmentFromPoints(element.start, element.end);
        if (segment) segments.push(segment);
        break;
      }
      case "RED": {
        const segment = this.segmentFromPoints(element.start, element.end);
        if (segment) segments.push(segment);
        break;
      }
    }

    const meshes: LinesMesh[] = [];
    segments.forEach((points, index) => {
      if (points.length < 2) {
        return;
      }
      const mesh = MeshBuilder.CreateLines(
        `${element.id}-${index}`,
        { points },
        this.scene,
      );
      mesh.isPickable = true;
      mesh.metadata = { elementId: element.id } satisfies MeshMetadata;
      meshes.push(mesh);
    });

    return meshes;
  }

  private segmentFromPoints(start: ResolvedPoint, end: ResolvedPoint): BabylonVector3[] | null {
    const startVec = this.pointToVector(start);
    const endVec = this.pointToVector(end);
    if (!startVec || !endVec) {
      return null;
    }
    return [startVec, endVec];
  }

  private pathFromPoints(points: ResolvedPoint[]): BabylonVector3[] | null {
    const vectors: BabylonVector3[] = [];
    for (const point of points) {
      const vec = this.pointToVector(point);
      if (!vec) {
        return null;
      }
      vectors.push(vec);
    }
    return vectors;
  }

  private pointToVector(point: ResolvedPoint): BabylonVector3 | null {
    if (!point) {
      return null;
    }
    if (point.kind === "coordinate") {
      return new BabylonVector3(point.position.x, point.position.y, point.position.z);
    }
    return null;
  }

  private getColorForElement(element: SceneElement): Color3 {
    if (this.colorMode === "material" && element.material) {
      return this.colorForMaterial(element.material);
    }
    return TYPE_COLOR_MAP[element.kind].clone();
  }

  private colorForMaterial(material: string): Color3 {
    const cached = this.materialColorCache.get(material);
    if (cached) {
      return cached.clone();
    }
    const hash = hashString(material);
    const color = colorFromHue(hash % 360);
    this.materialColorCache.set(material, color);
    return color.clone();
  }
}

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const colorFromHue = (hue: number): Color3 => {
  const h = (hue % 360) / 360;
  const [r, g, b] = hslToRgb(h, 0.6, 0.5);
  return new Color3(r, g, b);
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    return [l, l, l];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
};
