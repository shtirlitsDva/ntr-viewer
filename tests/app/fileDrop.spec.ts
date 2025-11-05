import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
  TauriEvent: {
    DRAG_ENTER: "drag-enter",
    DRAG_OVER: "drag-over",
    DRAG_LEAVE: "drag-leave",
    DRAG_DROP: "drag-drop",
  },
}));

import { listen, TauriEvent } from "@tauri-apps/api/event";
import { createFileDropManager } from "@app/fileDrop";

const mockListen = vi.mocked(listen);

describe("createFileDropManager", () => {
  beforeEach(() => {
    mockListen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires drag events and handles drop payloads", async () => {
    const handlers: Record<string, Array<(event: { payload?: unknown }) => void>> = {
      [TauriEvent.DRAG_ENTER]: [],
      [TauriEvent.DRAG_OVER]: [],
      [TauriEvent.DRAG_LEAVE]: [],
      [TauriEvent.DRAG_DROP]: [],
    };

    mockListen.mockImplementation((eventName, handler) => {
      handlers[eventName as string].push(handler as (event: { payload?: unknown }) => void);
      return Promise.resolve(vi.fn());
    });

    const onEnter = vi.fn();
    const onOver = vi.fn();
    const onLeave = vi.fn();
    const onDrop = vi.fn().mockResolvedValue(undefined);
    const onProcessingError = vi.fn();

    const manager = createFileDropManager({
      onEnter,
      onOver,
      onLeave,
      onDrop,
      onProcessingError,
    });

    await manager.setup();

    handlers[TauriEvent.DRAG_ENTER][0]({ payload: ["a.ntr"] });
    expect(onEnter).toHaveBeenCalledWith(["a.ntr"]);

    handlers[TauriEvent.DRAG_OVER][0]({ payload: { paths: ["b.ntr"] } });
    expect(onOver).toHaveBeenCalledWith(["b.ntr"]);

    handlers[TauriEvent.DRAG_LEAVE][0]({ payload: undefined });
    expect(onLeave).toHaveBeenCalled();

    handlers[TauriEvent.DRAG_DROP][0]({ payload: { paths: ["c.ntr"] } });
    expect(onDrop).toHaveBeenCalledWith(["c.ntr"]);

    onDrop.mockRejectedValueOnce(new Error("drop failure"));
    handlers[TauriEvent.DRAG_DROP][0]({ payload: { paths: ["d.ntr"] } });
    await Promise.resolve();
    expect(onProcessingError).toHaveBeenCalledWith(expect.any(Error));

    manager.dispose();
  });

  it("invokes onSetupFailed when listener registration fails", async () => {
    const error = new Error("listen failed");
    mockListen.mockRejectedValueOnce(error);

    const onSetupFailed = vi.fn();
    const manager = createFileDropManager({
      onEnter: vi.fn(),
      onOver: vi.fn(),
      onLeave: vi.fn(),
      onDrop: vi.fn().mockResolvedValue(undefined),
      onProcessingError: vi.fn(),
      onSetupFailed,
    });

    await expect(manager.setup()).rejects.toThrow(error);
    expect(onSetupFailed).toHaveBeenCalledWith(error);
  });
});
