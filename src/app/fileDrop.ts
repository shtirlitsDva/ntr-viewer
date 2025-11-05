import { listen, TauriEvent } from "@tauri-apps/api/event";

type Unlisten = () => void;

export interface FileDropHandlers {
  onEnter(payload: readonly string[] | undefined): void;
  onOver(payload: readonly string[] | undefined): void;
  onLeave(): void;
  onDrop(paths: readonly string[]): Promise<void>;
  onProcessingError(error: unknown): void;
  onSetupFailed?(error: unknown): void;
}

export interface FileDropManager {
  setup(): Promise<void>;
  dispose(): void;
}

const extractPaths = (eventPayload: unknown): readonly string[] => {
  const payload = eventPayload as { paths?: string[] } | undefined | null;
  if (payload?.paths && Array.isArray(payload.paths)) {
    return payload.paths;
  }
  if (Array.isArray(eventPayload)) {
    return eventPayload as string[];
  }
  return [];
};

export const createFileDropManager = (handlers: FileDropHandlers): FileDropManager => {
  let unlisteners: Unlisten[] = [];

  const dispose = () => {
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch {
        // Ignore, best-effort cleanup
      }
    }
    unlisteners = [];
  };

  const setup = async (): Promise<void> => {
    dispose();
    try {
      unlisteners.push(
        await listen<string[] | { paths?: string[] } | undefined>(
          TauriEvent.DRAG_ENTER,
          (event) => {
            handlers.onEnter(extractPaths(event.payload));
          },
        ),
      );
      unlisteners.push(
        await listen<string[] | { paths?: string[] } | undefined>(
          TauriEvent.DRAG_OVER,
          (event) => {
            handlers.onOver(extractPaths(event.payload));
          },
        ),
      );
      unlisteners.push(
        await listen(TauriEvent.DRAG_LEAVE, () => {
          handlers.onLeave();
        }),
      );
      unlisteners.push(
        await listen<{ paths?: string[] } | undefined>(TauriEvent.DRAG_DROP, (event) => {
          const paths = extractPaths(event.payload);
          void handlers.onDrop(paths).catch((error) => {
            handlers.onProcessingError(error);
          });
        }),
      );
    } catch (error) {
      dispose();
      handlers.onSetupFailed?.(error);
      throw error;
    }
  };

  return {
    setup,
    dispose,
  };
};

