import { invoke } from "@tauri-apps/api/core";

interface OpenFileResponse {
  readonly path: string;
  readonly contents: string;
}

export type OpenNtrFileResult =
  | { readonly status: "cancelled" }
  | { readonly status: "success"; readonly path: string; readonly contents: string }
  | { readonly status: "error"; readonly message: string };

export const openNtrFile = async (): Promise<OpenNtrFileResult> => {
  try {
    const response = await invoke<OpenFileResponse | null>("open_ntr_file");
    if (response === null) {
      return { status: "cancelled" };
    }
    return { status: "success", path: response.path, contents: response.contents };
  } catch (error) {
    return { status: "error", message: formatError(error) };
  }
};

export const loadNtrFileAtPath = async (path: string): Promise<OpenNtrFileResult> => {
  try {
    const response = await invoke<OpenFileResponse>("load_ntr_file", { path });
    return { status: "success", path: response.path, contents: response.contents };
  } catch (error) {
    return { status: "error", message: formatError(error) };
  }
};

export const startFileWatch = async (path: string): Promise<void> => {
  try {
    await invoke("start_file_watch", { path });
  } catch (error) {
    console.warn("Failed to start file watch", error);
  }
};

export const stopFileWatch = async (): Promise<void> => {
  try {
    await invoke("stop_file_watch");
  } catch (error) {
    console.warn("Failed to stop file watch", error);
  }
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};
