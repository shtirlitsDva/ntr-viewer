import type { CameraAngles, ViewOrientation } from "@viewer/engine";

interface ViewOrientationTarget {
  orientView(orientation: ViewOrientation): void;
  getCameraAngles(): CameraAngles | null;
}

export interface ViewCubeConfig {
  readonly container: HTMLElement;
  readonly getOrientationTarget: () => ViewOrientationTarget | null;
}

export interface ViewCubeController {
  dispose(): void;
}

const FACE_LABELS: Record<ViewOrientation, { readonly label: string; readonly title: string }> = {
  north: { label: "N", title: "Look from north" },
  south: { label: "S", title: "Look from south" },
  east: { label: "E", title: "Look from east" },
  west: { label: "W", title: "Look from west" },
  up: { label: "Up", title: "Look from up" },
  down: { label: "Down", title: "Look from down" },
};

const ORIENTATIONS: readonly ViewOrientation[] = ["north", "south", "east", "west", "up", "down"];

const CUBE_SIZE = 48;
const FACE_OFFSET = CUBE_SIZE / 2;

const FACE_TRANSFORMS: Record<ViewOrientation, string> = {
  north: `translateZ(${FACE_OFFSET}px)`,
  south: `rotateY(180deg) translateZ(${FACE_OFFSET}px)`,
  east: `rotateY(90deg) translateZ(${FACE_OFFSET}px)`,
  west: `rotateY(-90deg) translateZ(${FACE_OFFSET}px)`,
  up: `rotateX(90deg) translateZ(${FACE_OFFSET}px)`,
  down: `rotateX(-90deg) translateZ(${FACE_OFFSET}px)`,
};

const toDegrees = (radians: number): number => radians * (180 / Math.PI);

const computeRotation = (
  angles: CameraAngles,
  previous: { rotX: number; rotY: number } | null,
): { rotX: number; rotY: number } => {
  const rotX = toDegrees(angles.beta - Math.PI / 2);
  let rotY = toDegrees(angles.alpha - Math.PI / 2);
  if (previous) {
    let delta = rotY - previous.rotY;
    while (delta > 180) {
      rotY -= 360;
      delta = rotY - previous.rotY;
    }
    while (delta < -180) {
      rotY += 360;
      delta = rotY - previous.rotY;
    }
  }
  return { rotX, rotY };
};

export const attachViewCube = (config: ViewCubeConfig): ViewCubeController => {
  const root = document.createElement("div");
  root.className = "view-gizmo";
  root.dataset.control = "view-gizmo";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "View cube");

  const inner = document.createElement("div");
  inner.className = "view-gizmo-inner";
  const cube = document.createElement("div");
  cube.className = "view-gizmo-cube";
  inner.append(cube);
  root.append(inner);

  const cleanupHandlers: Array<() => void> = [];

  ORIENTATIONS.forEach((orientation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.orientation = orientation;
    const detail = FACE_LABELS[orientation];
    button.textContent = detail.label;
    button.title = detail.title;
    button.setAttribute("aria-label", detail.title);
    button.className = `view-gizmo-face view-gizmo-face--${orientation}`;
    button.style.transform = FACE_TRANSFORMS[orientation];
    const handleClick = () => {
      const target = config.getOrientationTarget();
      if (!target) {
        return;
      }
      target.orientView(orientation);
    };
    button.addEventListener("click", handleClick);
    cleanupHandlers.push(() => {
      button.removeEventListener("click", handleClick);
    });
    cube.append(button);
  });

  config.container.append(root);

  let rafId: number | null = null;
  let disposed = false;
  let lastTransform = "";
  let lastRotation: { rotX: number; rotY: number } | null = null;

  const updateCubeRotation = () => {
    if (disposed) {
      return;
    }
    const target = config.getOrientationTarget();
    if (target) {
      const angles = target.getCameraAngles();
      if (angles) {
        const rotation = computeRotation(angles, lastRotation);
        const transform = `rotateX(${rotation.rotX}deg) rotateY(${rotation.rotY}deg)`;
        if (transform !== lastTransform) {
          cube.style.transform = transform;
          lastTransform = transform;
        }
        lastRotation = rotation;
      }
    }
    rafId = window.requestAnimationFrame(updateCubeRotation);
  };

  rafId = window.requestAnimationFrame(updateCubeRotation);

  return {
    dispose: () => {
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      cleanupHandlers.forEach((disposeHandler) => disposeHandler());
      root.remove();
    },
  };
};
