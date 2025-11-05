import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { listen } from "@tauri-apps/api/event";
import { createFileWatchManager, type FileChangePayload } from "@app/fileWatch";

const mockListen = vi.mocked(listen);

describe("createFileWatchManager", () => {
  beforeEach(() => {
    mockListen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes onFileChanged handler and surfaces processing errors", async () => {
    const changeHandlers: Array<(event: { payload: FileChangePayload }) => void> = [];
    const errorHandlers: Array<(event: { payload: FileChangePayload }) => void> = [];

    mockListen
      .mockImplementationOnce((_name, handler) => {
        changeHandlers.push(handler as (event: { payload: FileChangePayload }) => void);
        return Promise.resolve(vi.fn());
      })
      .mockImplementationOnce((_name, handler) => {
        errorHandlers.push(handler as (event: { payload: FileChangePayload }) => void);
        return Promise.resolve(vi.fn());
      });

    const onFileChanged = vi.fn().mockResolvedValue(undefined);
    const onProcessingError = vi.fn();
    const onWatchError = vi.fn();

    const manager = createFileWatchManager({
      onFileChanged,
      onProcessingError,
      onWatchError,
    });

    await manager.setup();

    expect(changeHandlers).toHaveLength(1);
    expect(errorHandlers).toHaveLength(1);

    const payload: FileChangePayload = { path: "/tmp/example.ntr", kind: "modify" };
    changeHandlers[0]({ payload });
    expect(onFileChanged).toHaveBeenCalledWith(payload);

    onFileChanged.mockRejectedValueOnce(new Error("failure"));
    changeHandlers[0]({ payload });
    await Promise.resolve(); // allow rejection handler to run
    expect(onProcessingError).toHaveBeenCalledWith(expect.any(Error));

    errorHandlers[0]({ payload });
    expect(onWatchError).toHaveBeenCalledWith(payload);

    manager.dispose();
  });

  it("calls onSetupFailed when listener registration throws", async () => {
    const error = new Error("listen failed");
    mockListen.mockRejectedValueOnce(error);

    const onSetupFailed = vi.fn();
    const manager = createFileWatchManager({
      onFileChanged: vi.fn(),
      onProcessingError: vi.fn(),
      onWatchError: vi.fn(),
      onSetupFailed,
    });

    await expect(manager.setup()).rejects.toThrow(error);
    expect(onSetupFailed).toHaveBeenCalledWith(error);
  });
});
