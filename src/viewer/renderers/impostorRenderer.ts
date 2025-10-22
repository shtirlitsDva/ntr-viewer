import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 as BabylonVector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import "@babylonjs/core/Meshes/Builders/groundBuilder";

import { RevitStylePointerInput } from "../RevitStylePointerInput";
import {
  DEFAULT_PIPE_DIAMETER,
  HIGHLIGHT_COLOR,
  TYPE_COLOR_MAP,
} from "../viewer";
import type {
  SceneRenderer,
  LoadOptions,
  SelectionListener,
  ColorMode,
  SceneRendererFactory,
} from "../engine";
import type { ResolvedPoint, SceneElement, SceneGraph } from "@viewer/sceneGraph";

interface MeshMetadata {
  elementId?: string;
}

interface CylinderSegment {
  readonly start: ResolvedPoint;
  readonly end: ResolvedPoint;
  readonly diameter?: number;
  readonly suffix: string;
}

const MSAA_SAMPLES = 4;
const IMPOSTOR_SHADER_NAME = "cylinderImpostor";
const DEFAULT_CAMERA_RADIUS = 10;
const BASE_BOX_EPSILON = 0.1;

let shadersRegistered = false;

const ensureImpostorShaders = () => {
  if (shadersRegistered) {
    return;
  }

  Effect.ShadersStore[`${IMPOSTOR_SHADER_NAME}VertexShader`] = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 world;
    uniform mat4 worldViewProjection;
    varying vec3 vWorldPosition;
    void main(void) {
      vec4 worldPos = world * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }
  `;

  Effect.ShadersStore[`${IMPOSTOR_SHADER_NAME}FragmentShader`] = `
    precision highp float;
    varying vec3 vWorldPosition;

    uniform vec3 start;
    uniform vec3 end;
    uniform float radius;
    uniform vec3 color;
    uniform vec3 highlightColor;
    uniform float highlightMix;
    uniform vec3 lightDirection;

    void main(void) {
      vec3 axis = end - start;
      float axisLength = length(axis);
      if (axisLength < 1e-4) {
        discard;
      }

      vec3 direction = axis / axisLength;
      vec3 relative = vWorldPosition - start;
      float projection = dot(relative, direction);
      if (projection < 0.0 || projection > axisLength) {
        discard;
      }

      vec3 closest = start + direction * projection;
      vec3 radial = vWorldPosition - closest;
      float radialDistance = length(radial);
      if (radialDistance > radius) {
        discard;
      }

      vec3 normal = radialDistance > 1e-4 ? normalize(radial) : vec3(0.0, 1.0, 0.0);
      float lighting = 0.2 + max(dot(normal, -lightDirection), 0.0) * 0.8;
      vec3 baseColor = mix(color, highlightColor, clamp(highlightMix, 0.0, 1.0));
      gl_FragColor = vec4(baseColor * lighting, 1.0);
    }
  `;

  shadersRegistered = true;
};

export class BabylonImpostorRenderer implements SceneRenderer {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly ground: Mesh;
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly elementMeshes = new Map<string, Mesh[]>();
  private readonly elementLookup = new Map<string, SceneElement>();
  private readonly elementBaseColor = new Map<string, Color3>();
  private readonly elementMaterials = new Map<string, ShaderMaterial[]>();
  private readonly materialColorCache = new Map<string, Color3>();
  private readonly lightDirection = new BabylonVector3(-0.4, -0.9, -0.3).normalize();
  private renderPipeline: DefaultRenderingPipeline | null = null;
  private resizeHandler: (() => void) | null = null;
  private wheelHandler: ((event: WheelEvent) => void) | null = null;
  private currentGraph: SceneGraph | null = null;
  private selectedElement: string | null = null;
  private colorMode: ColorMode = "type";
  private gridVisible = true;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    ensureImpostorShaders();
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
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
    this.ground.renderingGroupId = 0;

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

    for (const element of graph.elements) {
      const baseColor = this.getColorForElement(element);
      const meshes = this.createMeshesForElement(element, baseColor.clone());
      if (meshes.length === 0) {
        continue;
      }
      this.elementMeshes.set(element.id, meshes);
      this.elementLookup.set(element.id, element);
      this.elementBaseColor.set(element.id, baseColor.clone());
    }

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
      meshes.forEach((mesh) => {
        mesh.material?.dispose();
        mesh.dispose();
      });
    }
    this.elementMeshes.clear();
    this.elementLookup.clear();
    this.elementBaseColor.clear();
    this.elementMaterials.clear();
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
      this.elementBaseColor.set(id, color.clone());
      this.setElementColor(id, color);
    }
  }

  private setElementColor(elementId: string, color: Color3): void {
    const materials = this.elementMaterials.get(elementId);
    if (!materials) {
      return;
    }
    for (const material of materials) {
      material.setVector3("color", this.colorToVector3(color));
    }
  }

  private applySelectionColors(): void {
    for (const [id, materials] of this.elementMaterials.entries()) {
      const highlighted = this.selectedElement === id;
      const mix = highlighted ? 1 : 0;
      for (const material of materials) {
        material.setFloat("highlightMix", mix);
        material.setVector3("highlightColor", this.colorToVector3(HIGHLIGHT_COLOR));
      }
    }
  }

  private createMeshesForElement(element: SceneElement, baseColor: Color3): Mesh[] {
    const meshes: Mesh[] = [];
    const register = (mesh: Mesh | null) => {
      if (!mesh) {
        return;
      }
      mesh.metadata = { elementId: element.id } satisfies MeshMetadata;
      mesh.isPickable = true;
      const material = mesh.material instanceof ShaderMaterial ? mesh.material : null;
      if (material) {
        if (!this.elementMaterials.has(element.id)) {
          this.elementMaterials.set(element.id, []);
        }
        this.elementMaterials.get(element.id)?.push(material);
      }
      meshes.push(mesh);
    };

    switch (element.kind) {
      case "RO":
        register(
          this.createCylinderSegment(element.id, {
            start: element.start,
            end: element.end,
            diameter: element.outerDiameter,
            suffix: "main",
          }, baseColor),
        );
        break;
      case "PROF":
        register(
          this.createCylinderSegment(element.id, {
            start: element.start,
            end: element.end,
            diameter: DEFAULT_PIPE_DIAMETER,
            suffix: "profile",
          }, baseColor),
        );
        break;
      case "BOG":
        register(
          this.createCylinderSegment(element.id, {
            start: element.start,
            end: element.tangent,
            diameter: element.outerDiameter,
            suffix: "bend-segment-1",
          }, baseColor),
        );
        register(
          this.createCylinderSegment(element.id, {
            start: element.tangent,
            end: element.end,
            diameter: element.outerDiameter,
            suffix: "bend-segment-2",
          }, baseColor),
        );
        break;
      case "TEE":
        register(
          this.createCylinderSegment(element.id, {
            start: element.mainStart,
            end: element.mainEnd,
            diameter: element.mainOuterDiameter,
            suffix: "tee-main",
          }, baseColor),
        );
        register(
          this.createCylinderSegment(element.id, {
            start: element.branchStart,
            end: element.branchEnd,
            diameter: element.branchOuterDiameter,
            suffix: "tee-branch",
          }, baseColor),
        );
        break;
      case "ARM":
        register(
          this.createCylinderSegment(element.id, {
            start: element.start,
            end: element.center,
            diameter: element.inletOuterDiameter,
            suffix: "arm-inlet",
          }, baseColor),
        );
        register(
          this.createCylinderSegment(element.id, {
            start: element.center,
            end: element.end,
            diameter: element.outletOuterDiameter,
            suffix: "arm-outlet",
          }, baseColor),
        );
        break;
      case "RED":
        register(
          this.createCylinderSegment(element.id, {
            start: element.start,
            end: element.end,
            diameter: element.inletOuterDiameter ?? element.outletOuterDiameter ?? DEFAULT_PIPE_DIAMETER,
            suffix: "reducer",
          }, baseColor),
        );
        break;
      default:
        break;
    }

    return meshes;
  }

  private createCylinderSegment(
    elementId: string,
    segment: CylinderSegment,
    baseColor: Color3,
  ): Mesh | null {
    const start = this.resolveScenePosition(segment.start);
    const end = this.resolveScenePosition(segment.end);
    if (!start || !end) {
      return null;
    }

    const direction = end.subtract(start);
    const length = direction.length();
    if (length <= 1e-4) {
      return null;
    }

    const radius = Math.max(
      (segment.diameter ?? DEFAULT_PIPE_DIAMETER) / 2,
      DEFAULT_PIPE_DIAMETER / 4,
    );

    const mesh = MeshBuilder.CreateBox(
      `${elementId}-${segment.suffix}-impostor`,
      { size: 1 },
      this.scene,
    );

    mesh.position = start.add(direction.scale(0.5));
    const axis = direction.normalize();
    const rotation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(BabylonVector3.Up(), axis, rotation);
    mesh.rotationQuaternion = rotation;
    mesh.scaling = new BabylonVector3(
      radius * 2 + BASE_BOX_EPSILON,
      length,
      radius * 2 + BASE_BOX_EPSILON,
    );

    const material = new ShaderMaterial(
      `${elementId}-${segment.suffix}-material`,
      this.scene,
      {
        vertex: IMPOSTOR_SHADER_NAME,
        fragment: IMPOSTOR_SHADER_NAME,
      },
      {
        attributes: ["position"],
        uniforms: [
          "world",
          "worldViewProjection",
          "start",
          "end",
          "radius",
          "color",
          "highlightColor",
          "highlightMix",
          "lightDirection",
        ],
      },
    );
    material.backFaceCulling = false;
    material.setVector3("start", start);
    material.setVector3("end", end);
    material.setFloat("radius", radius);
    material.setVector3("color", this.colorToVector3(baseColor));
    material.setVector3("highlightColor", this.colorToVector3(HIGHLIGHT_COLOR));
    material.setFloat("highlightMix", 0);
    material.setVector3("lightDirection", this.lightDirection);

    mesh.material = material;
    mesh.renderingGroupId = 1;
    return mesh;
  }

  private resolveScenePosition(point: ResolvedPoint): BabylonVector3 | null {
    if (point.kind !== "coordinate") {
      return null;
    }
    const { x, y, z } = point.scenePosition;
    return new BabylonVector3(x, y, z);
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
    const hash = this.hashString(material);
    const color = this.colorFromHue(hash % 360);
    this.materialColorCache.set(material, color);
    return color.clone();
  }

  private colorToVector3(color: Color3): BabylonVector3 {
    return new BabylonVector3(color.r, color.g, color.b);
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private colorFromHue(hue: number): Color3 {
    const h = (hue % 360) / 360;
    const [r, g, b] = this.hslToRgb(h, 0.6, 0.5);
    return new Color3(r, g, b);
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
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
  }

  private configureRenderingPipeline(): void {
    const pipeline = new DefaultRenderingPipeline("impostor-pipeline", true, this.scene, [this.camera]);
    const maxSamples = this.engine.getCaps().maxMSAASamples;
    pipeline.samples = maxSamples > 1 ? Math.min(MSAA_SAMPLES, maxSamples) : 1;
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    this.renderPipeline = pipeline;
  }
}

export const createImpostorRenderer: SceneRendererFactory = (canvas) =>
  new BabylonImpostorRenderer(canvas);
