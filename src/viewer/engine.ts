import type { SceneGraph } from "./sceneGraph";

export type ColorMode = "type" | "material";

export interface LoadOptions {
  readonly maintainCamera?: boolean;
}

export type SelectionListener = (elementId: string | null) => void;

export interface SceneRenderer {
  load(graph: SceneGraph, options?: LoadOptions): void;
  setColorMode(mode: ColorMode): void;
  setSelection(elementId: string | null): void;
  onSelectionChanged(listener: SelectionListener): () => void;
  setGridVisible(visible: boolean): void;
  fitToBounds(bounds: SceneGraph["bounds"]): void;
  dispose(): void;
}

export type SceneRendererFactory = (canvas: HTMLCanvasElement) => SceneRenderer;
