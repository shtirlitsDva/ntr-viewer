import { listen } from "@tauri-apps/api/event";

export interface FileChangePayload {
  readonly path: string;
  readonly kind: string;
}

type Unlisten = () => void;

export interface FileWatchHandlers {
  onFileChanged(payload: FileChangePayload): Promise<void>;
  onWatchError(payload: FileChangePayload): void;
  onProcessingError(error: unknown): void;
  onSetupFailed?(error: unknown): void;
}

export interface FileWatchManager {
  setup(): Promise<void>;
  dispose(): void;
}

export const createFileWatchManager = (handlers: FileWatchHandlers): FileWatchManager => {
  let unlistenChange: Unlisten | null = null;
  let unlistenError: Unlisten | null = null;

  const dispose = () => {
    unlistenChange?.();
    unlistenChange = null;
    unlistenError?.();
    unlistenError = null;
  };

  const setup = async (): Promise<void> => {
    dispose();
    try {
      unlistenChange = await listen<FileChangePayload>("ntr-file-changed", (event) => {
        void handlers.onFileChanged(event.payload).catch((error) => {
          handlers.onProcessingError(error);
        });
      });
      unlistenError = await listen<FileChangePayload>("ntr-file-watch-error", (event) => {
        handlers.onWatchError(event.payload);
      });
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

