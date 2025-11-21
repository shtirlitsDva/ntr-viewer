import { createBabylonRenderer, type BabylonRendererOptions } from "@viewer/viewer";
import type {
  CameraAngles,
  ColorMode,
  LoadOptions,
  SceneRenderer,
  SelectionListener,
  ViewOrientation,
} from "@viewer/engine";
import type { SceneElement, SceneGraph } from "@viewer/sceneGraph";

type RendererSceneGraph = Parameters<SceneRenderer["load"]>[0];
type RendererBounds = Parameters<SceneRenderer["fitToBounds"]>[0];

export interface ViewerHostConfig {
  readonly canvas: HTMLCanvasElement;
  readonly onSelectionChanged: SelectionListener;
  readonly initialGridVisible: boolean;
  readonly rendererOptions?: BabylonRendererOptions;
}

const createEmptyScene = (): RendererSceneGraph => ({
  elements: [] as readonly SceneElement[],
  bounds: null,
});

export interface ViewerHost {
  resetScene(): void;
  load(graph: SceneGraph, options?: LoadOptions): void;
  setColorMode(mode: ColorMode): void;
  setSelection(elementId: string | null): void;
  setGridVisible(visible: boolean): void;
  fitToBounds(bounds: SceneGraph["bounds"]): void;
  getRotationSensitivity(): number;
  setRotationSensitivity(value: number): void;
  getPanSensitivity(): number;
  setPanSensitivity(value: number): void;
  getCameraAngles(): CameraAngles;
  orientView(orientation: ViewOrientation): void;
  setIsometricView(enabled: boolean): void;
  isIsometricView(): boolean;
  addSelectionListener(listener: SelectionListener): () => void;
  dispose(): void;
  readonly renderer: SceneRenderer;
}

export const createViewerHost = (config: ViewerHostConfig): ViewerHost => {
  const {
    canvas,
    onSelectionChanged,
    initialGridVisible,
    rendererOptions,
  } = config;

  const renderer: SceneRenderer =
    rendererOptions !== undefined
      ? createBabylonRenderer(canvas, rendererOptions)
      : createBabylonRenderer(canvas);
  const detachInitialListener = renderer.onSelectionChanged(onSelectionChanged);
  renderer.setGridVisible(initialGridVisible);

  return {
    resetScene() {
      renderer.load(createEmptyScene());
      renderer.setSelection(null);
    },
    load: (graph: RendererSceneGraph, options?: LoadOptions) => {
      renderer.load(graph, options);
    },
    setColorMode: (mode: ColorMode) => {
      renderer.setColorMode(mode);
    },
    setSelection: (elementId: string | null) => {
      renderer.setSelection(elementId);
    },
    setGridVisible: (visible: boolean) => {
      renderer.setGridVisible(visible);
    },
    fitToBounds: (bounds: RendererBounds) => {
      renderer.fitToBounds(bounds);
    },
    getRotationSensitivity() {
      return renderer.getRotationSensitivity();
    },
    setRotationSensitivity: (value: number) => {
      renderer.setRotationSensitivity(value);
    },
    getPanSensitivity() {
      return renderer.getPanSensitivity();
    },
    setPanSensitivity: (value: number) => {
      renderer.setPanSensitivity(value);
    },
    getCameraAngles: () => renderer.getCameraAngles(),
    orientView: (orientation: ViewOrientation) => {
      renderer.orientView(orientation);
    },
    setIsometricView: (enabled: boolean) => {
      renderer.setIsometricView(enabled);
    },
    isIsometricView: () => renderer.isIsometricView(),
    addSelectionListener: (listener: SelectionListener) => renderer.onSelectionChanged(listener),
    dispose() {
      detachInitialListener();
      renderer.dispose();
    },
    renderer,
  };
};
