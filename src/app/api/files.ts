import { invoke } from "@tauri-apps/api/core";

interface OpenFileResponse {
  readonly path: string;
  readonly contents: string;
}

export type OpenNtrFileResult =
  | { readonly status: "cancelled" }
  | { readonly status: "success"; readonly path: string; readonly contents: string };

export const openNtrFile = async (): Promise<OpenNtrFileResult> => {
  const response = await invoke<OpenFileResponse | null>("open_ntr_file");
  if (response === null) {
    return { status: "cancelled" };
  }
  return { status: "success", path: response.path, contents: response.contents };
};
