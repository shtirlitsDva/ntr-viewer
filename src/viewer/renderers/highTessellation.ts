import { createBabylonRenderer } from "@viewer/viewer";
import type { SceneRendererFactory } from "@viewer/engine";

export const createHighTessellationRenderer: SceneRendererFactory = (canvas) =>
  createBabylonRenderer(canvas);
