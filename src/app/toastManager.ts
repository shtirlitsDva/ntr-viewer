import { createToast, publishToast, subscribeToToasts, type ToastPayload } from "@shared/toast";

export interface ToastManagerConfig {
  readonly container: HTMLElement;
  readonly autoDismissMs?: number;
  readonly closingDelayMs?: number;
}

export interface ToastManager {
  dispose(): void;
  dismiss(id: string): void;
}

const DEFAULT_AUTO_DISMISS_MS = 5_000;
const DEFAULT_CLOSING_DELAY_MS = 150;

export const createToastManager = (config: ToastManagerConfig): ToastManager => {
  const { container, autoDismissMs = DEFAULT_AUTO_DISMISS_MS, closingDelayMs = DEFAULT_CLOSING_DELAY_MS } = config;
  const activeToasts = new Map<string, HTMLElement>();
  const timeoutHandles = new Map<string, number>();

  const dismiss = (id: string): void => {
    const element = activeToasts.get(id);
    if (!element) {
      return;
    }
    window.clearTimeout(timeoutHandles.get(id));
    timeoutHandles.delete(id);
    element.classList.add("toast-closing");
    window.setTimeout(() => {
      element.remove();
      activeToasts.delete(id);
    }, closingDelayMs);
  };

  const renderToast = (toast: ToastPayload): void => {
    const element = document.createElement("div");
    element.className = `toast toast-${toast.level}`;

    const message = document.createElement("p");
    message.className = "toast-message";
    message.textContent = toast.message;
    element.append(message);

    if (toast.detail) {
      const detail = document.createElement("p");
      detail.className = "toast-detail";
      detail.textContent = toast.detail;
      element.append(detail);
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => dismiss(toast.id));
    element.append(closeButton);

    container.append(element);
    activeToasts.set(toast.id, element);

    const handle = window.setTimeout(() => {
      dismiss(toast.id);
    }, autoDismissMs);
    timeoutHandles.set(toast.id, handle);
  };

  const unsubscribe = subscribeToToasts(renderToast);

  return {
    dispose: () => {
      unsubscribe();
      timeoutHandles.forEach((handle) => window.clearTimeout(handle));
      timeoutHandles.clear();
      activeToasts.forEach((element) => {
        element.remove();
      });
      activeToasts.clear();
    },
    dismiss,
  };
};

export const showToast = (level: ToastPayload["level"], message: string, detail?: string): void => {
  publishToast(createToast(level, message, detail));
};
