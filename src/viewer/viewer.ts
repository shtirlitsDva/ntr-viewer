import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 as BabylonVector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import "@babylonjs/core/Meshes/Builders/linesBuilder";
import "@babylonjs/core/Meshes/Builders/groundBuilder";

import { RevitStylePointerInput } from "./RevitStylePointerInput.ts";

import type { SceneRenderer, SceneRendererFactory, LoadOptions, SelectionListener, ColorMode } from "./engine";
import type { ResolvedPoint, SceneElement, SceneGraph } from "@viewer/sceneGraph";

export const TYPE_COLOR_MAP: Record<SceneElement["kind"], Color3> = {
  RO: new Color3(0.9, 0.6, 0.2),
  BOG: new Color3(0.2, 0.7, 0.9),
  TEE: new Color3(0.8, 0.3, 0.6),
  ARM: new Color3(0.4, 0.9, 0.5),
  PROF: new Color3(0.7, 0.7, 0.2),
  RED: new Color3(0.9, 0.4, 0.2),
};

export const HIGHLIGHT_COLOR = new Color3(1, 1, 0.4);
const DEFAULT_CAMERA_RADIUS = 10;
export const DEFAULT_PIPE_DIAMETER = 50;
const MSAA_SAMPLES = 4;
const Z_OFFSET_BUCKETS = 9;
const Z_OFFSET_STEP = 0.02;
interface MeshMetadata {
  elementId?: string;
}

interface TubeOptions {
  readonly diameter?: number;
  readonly startDiameter?: number;
  readonly endDiameter?: number;
}

export interface BabylonRendererOptions {}

export class BabylonSceneRenderer implements SceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly ground: Mesh;
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly elementMeshes = new Map<string, Mesh[]>();
  private readonly elementLookup = new Map<string, SceneElement>();
  private readonly elementBaseColor = new Map<string, Color3>();
  private readonly elementMaterials = new Map<string, StandardMaterial>();
  private readonly materialColorCache = new Map<string, Color3>();
  private renderPipeline: DefaultRenderingPipeline | null = null;
  private resizeHandler: (() => void) | null = null;
  private wheelHandler: ((event: WheelEvent) => void) | null = null;
  private currentGraph: SceneGraph | null = null;
  private selectedElement: string | null = null;
  private colorMode: ColorMode = "type";
  private gridVisible = true;
  private sceneOffset = new BabylonVector3(0, 0, 0);

  public constructor(canvas: HTMLCanvasElement, _options: BabylonRendererOptions = {}) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);

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
    this.camera.minZ = 0.1;
    this.camera.maxZ = 100_000;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.panningSensibility = 50;
    this.camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
    this.camera.inputs.removeByType("ArcRotateCameraPointersInput");
    this.camera.inputs.add(new RevitStylePointerInput());

    this.configureRenderingPipeline();

    const light = new HemisphericLight("hemi", new BabylonVector3(0, 1, 0), this.scene);
    light.intensity = 0.9;

    this.initializeMouseWheelZoom();

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
    if (this.wheelHandler) {
      this.canvas.removeEventListener("wheel", this.wheelHandler);
      this.wheelHandler = null;
    }
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    this.scene.dispose();
    this.engine.dispose();
  }

  public load(graph: SceneGraph, options: LoadOptions = {}): void {
    this.clearElements();
    this.currentGraph = graph;
    this.sceneOffset = this.computeSceneOffset(graph.bounds);

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
    if (!options.maintainCamera) {
      this.fitToBounds(graph.bounds);
    }
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

    const adjusted = this.adjustBounds(bounds);
    if (!adjusted) {
      this.camera.target = BabylonVector3.Zero();
      this.camera.radius = DEFAULT_CAMERA_RADIUS;
      return;
    }

    const center = new BabylonVector3(
      (adjusted.min.x + adjusted.max.x) / 2,
      (adjusted.min.y + adjusted.max.y) / 2,
      (adjusted.min.z + adjusted.max.z) / 2,
    );

    const spanX = adjusted.max.x - adjusted.min.x;
    const spanY = adjusted.max.y - adjusted.min.y;
    const spanZ = adjusted.max.z - adjusted.min.z;
    const maxSpan = Math.max(spanX, spanY, spanZ, 1);
    const radius = maxSpan * 1.5;
    const farPlane = Math.max(maxSpan * 20, 10_000);

    this.camera.target = center;
    this.camera.radius = radius;
    this.camera.lowerRadiusLimit = Math.max(radius * 0.05, 0.5);
    this.camera.maxZ = Math.max(this.camera.maxZ, farPlane);
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
    for (const material of this.elementMaterials.values()) {
      material.dispose(false, true);
    }
    this.elementMaterials.clear();
  }

  private updateGround(bounds: SceneGraph["bounds"]): void {
    if (!bounds) {
      this.ground.isVisible = false;
      return;
    }

    const adjusted = this.adjustBounds(bounds);
    if (!adjusted) {
      this.ground.isVisible = false;
      return;
    }

    const spanX = adjusted.max.x - adjusted.min.x;
    const spanZ = adjusted.max.z - adjusted.min.z;
    const size = Math.max(spanX, spanZ, 1);

    this.ground.scaling.x = size;
    this.ground.scaling.z = size;
    this.ground.position.x = (adjusted.min.x + adjusted.max.x) / 2;
    this.ground.position.z = (adjusted.min.z + adjusted.max.z) / 2;
    this.ground.position.y = adjusted.min.y;
    this.ground.isVisible = this.gridVisible;
  }

  private updateColors(): void {
    for (const [id, element] of this.elementLookup.entries()) {
      const color = this.getColorForElement(element);
      this.elementBaseColor.set(id, color.clone());
      if (this.selectedElement !== id) {
        this.applyMaterialColor(id, color, false);
      }
    }
  }

  private applySelectionColors(): void {
    for (const [id, baseColor] of this.elementBaseColor.entries()) {
      const highlighted = this.selectedElement === id;
      this.applyMaterialColor(id, highlighted ? HIGHLIGHT_COLOR : baseColor, highlighted);
    }
  }

  private applyMaterialColor(id: string, color: Color3, highlight: boolean): void {
    const material = this.elementMaterials.get(id);
    if (!material) {
      return;
    }
    material.diffuseColor = color.clone();
    material.emissiveColor = highlight ? color.scale(0.4) : Color3.Black();
  }

  private createMeshesForElement(element: SceneElement): Mesh[] {
    const meshes: Mesh[] = [];
    switch (element.kind) {
      case "RO": {
        const mesh = this.createTubeSegment(
          element.id,
          "straight",
          element.start,
          element.end,
          { diameter: element.outerDiameter },
        );
        if (mesh) meshes.push(mesh);
        break;
      }
      case "PROF": {
        const mesh = this.createTubeSegment(
          element.id,
          "profile",
          element.start,
          element.end,
          { diameter: DEFAULT_PIPE_DIAMETER * 0.5 },
        );
        if (mesh) meshes.push(mesh);
        break;
      }
      case "BOG": {
        const first = this.createTubeSegment(
          element.id,
          "bend-segment-1",
          element.start,
          element.tangent,
          { diameter: element.outerDiameter },
        );
        if (first) meshes.push(first);
        const second = this.createTubeSegment(
          element.id,
          "bend-segment-2",
          element.tangent,
          element.end,
          { diameter: element.outerDiameter },
        );
        if (second) meshes.push(second);
        break;
      }
      case "TEE": {
        const main = this.createTubeSegment(
          element.id,
          "tee-main",
          element.mainStart,
          element.mainEnd,
          { diameter: element.mainOuterDiameter },
        );
        if (main) meshes.push(main);
        const branch = this.createTubeSegment(
          element.id,
          "tee-branch",
          element.branchStart,
          element.branchEnd,
          { diameter: element.branchOuterDiameter },
        );
        if (branch) meshes.push(branch);
        break;
      }
      case "ARM": {
        const inlet = this.createTubeSegment(
          element.id,
          "arm-inlet",
          element.start,
          element.center,
          {
            startDiameter: element.inletOuterDiameter,
            endDiameter: element.inletOuterDiameter,
          },
        );
        if (inlet) meshes.push(inlet);
        const outlet = this.createTubeSegment(
          element.id,
          "arm-outlet",
          element.center,
          element.end,
          {
            startDiameter: element.outletOuterDiameter,
            endDiameter: element.outletOuterDiameter,
          },
        );
        if (outlet) meshes.push(outlet);
        break;
      }
      case "RED": {
        const mesh = this.createTubeSegment(
          element.id,
          "reducer",
          element.start,
          element.end,
          {
            startDiameter: element.inletOuterDiameter,
            endDiameter: element.outletOuterDiameter,
          },
        );
        if (mesh) meshes.push(mesh);
        break;
      }
    }
    return meshes;
  }

  private createTubeSegment(
    elementId: string,
    suffix: string,
    start: ResolvedPoint,
    end: ResolvedPoint,
    options: TubeOptions,
  ): Mesh | null {
    if (start.kind !== "coordinate" || end.kind !== "coordinate") {
      return null;
    }

    const startVec = new BabylonVector3(
      start.scenePosition.x,
      start.scenePosition.y,
      start.scenePosition.z,
    );
    const endVec = new BabylonVector3(
      end.scenePosition.x,
      end.scenePosition.y,
      end.scenePosition.z,
    );

    startVec.subtractInPlace(this.sceneOffset);
    endVec.subtractInPlace(this.sceneOffset);

    const path = [startVec, endVec];
    const startDiameter = Math.max(options.startDiameter ?? options.diameter ?? DEFAULT_PIPE_DIAMETER, 0.01);
    const endDiameter = Math.max(options.endDiameter ?? options.diameter ?? DEFAULT_PIPE_DIAMETER, 0.01);
    const startRadius = startDiameter * 0.5;
    const endRadius = endDiameter * 0.5;

    const tubeOptions: Parameters<typeof MeshBuilder.CreateTube>[1] = {
      path,
      cap: Mesh.CAP_ALL,
    };

    if (Math.abs(startRadius - endRadius) < 1e-6) {
      tubeOptions.radius = startRadius;
    } else {
      const totalLength = BabylonVector3.Distance(startVec, endVec);
      const deltaRadius = endRadius - startRadius;
      tubeOptions.radiusFunction = (_index, distance) => {
        if (totalLength <= 1e-6) {
          return startRadius;
        }
        const ratio = Math.min(Math.max(distance / totalLength, 0), 1);
        return startRadius + deltaRadius * ratio;
      };
    }

    const mesh = MeshBuilder.CreateTube(`${elementId}-${suffix}`, tubeOptions, this.scene);
    return this.finalizeMesh(elementId, mesh);
  }

  private finalizeMesh(elementId: string, mesh: Mesh): Mesh {
    mesh.isPickable = true;
    mesh.metadata = { elementId } satisfies MeshMetadata;
    mesh.material = this.getMaterialForElement(elementId);
    return mesh;
  }

  private getMaterialForElement(elementId: string): StandardMaterial {
    let material = this.elementMaterials.get(elementId);
    if (!material) {
      material = new StandardMaterial(`${elementId}-material`, this.scene);
      material.specularColor = Color3.Black();
      material.zOffset = this.getZOffsetForElement(elementId);
      material.zOffsetUnits = 0;
      material.useLogarithmicDepth = true;
      material.needDepthPrePass = true;
      this.elementMaterials.set(elementId, material);
    }
    return material;
  }

  private getZOffsetForElement(elementId: string): number {
    const bucket = hashString(elementId) % Z_OFFSET_BUCKETS;
    const centered = bucket - Math.floor(Z_OFFSET_BUCKETS / 2);
    return centered * Z_OFFSET_STEP;
  }

  private initializeMouseWheelZoom(): void {
    const handler = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      const zoomFactor = Math.exp(event.deltaY * 0.001);
      const lowerLimit = this.camera.lowerRadiusLimit ?? 0.1;
      const upperLimit = this.camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
      const targetRadius = this.camera.radius * zoomFactor;
      const clampedRadius = Math.min(Math.max(targetRadius, lowerLimit), upperLimit);
      this.camera.radius = clampedRadius;
    };

    this.canvas.addEventListener("wheel", handler, { passive: false });
    this.wheelHandler = handler;
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

  private configureRenderingPipeline(): void {
    const pipeline = new DefaultRenderingPipeline("default-pipeline", true, this.scene, [this.camera]);
    const maxSamples = this.engine.getCaps().maxMSAASamples;
    pipeline.samples = maxSamples > 1 ? Math.min(MSAA_SAMPLES, maxSamples) : 1;
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    this.renderPipeline = pipeline;
  }

  private computeSceneOffset(bounds: SceneGraph["bounds"]): BabylonVector3 {
    if (!bounds) {
      return new BabylonVector3(0, 0, 0);
    }
    return new BabylonVector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2,
    );
  }

  private adjustBounds(bounds: SceneGraph["bounds"]): SceneGraph["bounds"] | null {
    if (!bounds) {
      return null;
    }
    return {
      min: {
        x: bounds.min.x - this.sceneOffset.x,
        y: bounds.min.y - this.sceneOffset.y,
        z: bounds.min.z - this.sceneOffset.z,
      },
      max: {
        x: bounds.max.x - this.sceneOffset.x,
        y: bounds.max.y - this.sceneOffset.y,
        z: bounds.max.z - this.sceneOffset.z,
      },
    };
  }
}

export function createBabylonRenderer(canvas: HTMLCanvasElement): SceneRenderer;
export function createBabylonRenderer(
  canvas: HTMLCanvasElement,
  options: BabylonRendererOptions,
): SceneRenderer;
export function createBabylonRenderer(
  canvas: HTMLCanvasElement,
  options: BabylonRendererOptions = {},
): SceneRenderer {
  return new BabylonSceneRenderer(canvas, options);
}

export const createDefaultBabylonRenderer: SceneRendererFactory = (canvas) =>
  createBabylonRenderer(canvas);

export type { SceneRenderer, LoadOptions, SelectionListener, ColorMode } from "./engine";


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
