import {
  createBabylonRenderer,
  DEFAULT_PIPE_DIAMETER,
  type BabylonRendererOptions,
  type SceneRenderer,
} from "@viewer/viewer";
import type { SceneRendererFactory } from "@viewer/engine";
import type { TessellationStrategyInput } from "@viewer/viewer";

const HIGH_DETAIL_OPTIONS: BabylonRendererOptions = {
  minTessellation: 96,
  maxTessellation: 384,
  tessellationStrategy: ({ diameters, cameraRadius }: TessellationStrategyInput) => {
    const reference = diameters.length > 0 ? Math.max(...diameters) : DEFAULT_PIPE_DIAMETER;
    const distanceFactor = cameraRadius > 0 ? Math.min(6, 250 / cameraRadius) : 6;
    return Math.max(reference, reference * distanceFactor);
  },
};

/**
 * Returns a Babylon renderer tuned for very high tessellation counts.
 * This aims to approximate CAD-level smoothness without moving to impostors.
 */
export const createHighTessellationRenderer: SceneRendererFactory = (canvas) =>
  createBabylonRenderer(canvas, HIGH_DETAIL_OPTIONS);

export type { SceneRenderer };
