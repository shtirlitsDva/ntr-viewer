import type { ViewOrientation } from "@viewer/engine";

interface ViewOrientationTarget {
  orientView(orientation: ViewOrientation): void;
}

export interface ViewCubeConfig {
  readonly container: HTMLElement;
  readonly getOrientationTarget: () => ViewOrientationTarget | null;
}

export interface ViewCubeController {
  dispose(): void;
}

const FACE_DETAILS: Record<ViewOrientation, { readonly label: string; readonly title: string }> = {
  north: { label: "N", title: "Look from north" },
  south: { label: "S", title: "Look from south" },
  east: { label: "E", title: "Look from east" },
  west: { label: "W", title: "Look from west" },
  up: { label: "Up", title: "Look from up" },
  down: { label: "Down", title: "Look from down" },
};

const GRID_LAYOUT: readonly (ViewOrientation | null)[][] = [
  [null, "up", null],
  ["west", "north", "east"],
  [null, "south", null],
  [null, "down", null],
];

export const attachViewCube = (config: ViewCubeConfig): ViewCubeController => {
  const root = document.createElement("div");
  root.className = "view-gizmo";
  root.dataset.control = "view-gizmo";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "View cube");

  const grid = document.createElement("div");
  grid.className = "view-gizmo-grid";
  root.append(grid);

  const cleanupHandlers: Array<() => void> = [];

  GRID_LAYOUT.forEach((row) => {
    row.forEach((orientation) => {
      if (!orientation) {
        const spacer = document.createElement("span");
        spacer.className = "view-gizmo-spacer";
        grid.append(spacer);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.orientation = orientation;
      const detail = FACE_DETAILS[orientation];
      button.textContent = detail.label;
      button.title = detail.title;
      button.setAttribute("aria-label", detail.title);
      button.className = "view-gizmo-face";
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
      grid.append(button);
    });
  });

  config.container.append(root);

  return {
    dispose: () => {
      cleanupHandlers.forEach((disposeHandler) => disposeHandler());
      root.remove();
    },
  };
};
