import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

import { openNtrFile } from "@app/api/files";

const mockedInvoke = vi.mocked(invoke);

describe("openNtrFile", () => {
  it("returns cancelled when the dialog is dismissed", async () => {
    mockedInvoke.mockResolvedValueOnce(null);
    const result = await openNtrFile();
    expect(result).toEqual({ status: "cancelled" });
    expect(mockedInvoke).toHaveBeenCalledWith("open_ntr_file");
  });

  it("returns contents when a file is selected", async () => {
    mockedInvoke.mockResolvedValueOnce({ path: "/tmp/sample.ntr", contents: "DATA" });
    const result = await openNtrFile();
    expect(result).toEqual({
      status: "success",
      path: "/tmp/sample.ntr",
      contents: "DATA",
    });
  });
});
