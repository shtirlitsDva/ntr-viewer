export interface KeyboardShortcutCallbacks {
  onFitView(): void;
  onResetView(): void;
  onClearSelection(): void;
  onToggleGrid(visible: boolean): void;
}

export interface KeyboardShortcutOptions {
  readonly gridToggle: HTMLInputElement;
}

export interface KeyboardShortcutController {
  dispose(): void;
}

export const attachKeyboardShortcuts = (
  options: KeyboardShortcutOptions,
  callbacks: KeyboardShortcutCallbacks,
): KeyboardShortcutController => {
  const handler = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "f":
        callbacks.onFitView();
        event.preventDefault();
        break;
      case "r":
        callbacks.onClearSelection();
        callbacks.onFitView();
        event.preventDefault();
        break;
      case "escape":
        callbacks.onClearSelection();
        event.preventDefault();
        break;
      case "g": {
        const nextValue = !options.gridToggle.checked;
        options.gridToggle.checked = nextValue;
        callbacks.onToggleGrid(nextValue);
        event.preventDefault();
        break;
      }
      default:
        break;
    }
  };

  window.addEventListener("keydown", handler);

  return {
    dispose: () => {
      window.removeEventListener("keydown", handler);
    },
  };
};

