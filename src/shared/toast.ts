export type ToastLevel = "info" | "success" | "warning" | "error";

export interface ToastPayload {
  readonly id: string;
  readonly level: ToastLevel;
  readonly message: string;
  readonly detail?: string;
}

const EVENT_NAME = "app:toast";

export const publishToast = (payload: ToastPayload): void => {
  if (typeof window === "undefined") {
    return;
  }

  const event = new CustomEvent<ToastPayload>(EVENT_NAME, {
    detail: payload,
    bubbles: false,
  });

  window.dispatchEvent(event);
};

export const subscribeToToasts = (
  handler: (payload: ToastPayload) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = (event: Event): void => {
    const custom = event as CustomEvent<ToastPayload>;
    handler(custom.detail);
  };

  window.addEventListener(EVENT_NAME, listener as EventListener);

  return () => {
    window.removeEventListener(EVENT_NAME, listener as EventListener);
  };
};

export const createToast = (
  level: ToastLevel,
  message: string,
  detail?: string,
): ToastPayload => ({
  id: crypto.randomUUID(),
  level,
  message,
  detail,
});
