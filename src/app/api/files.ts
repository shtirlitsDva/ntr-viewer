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

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};
