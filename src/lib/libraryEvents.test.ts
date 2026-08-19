// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessageListener = () => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly listeners = new Set<MessageListener>();
  readonly postMessage = vi.fn();

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(type: string, listener: MessageListener) {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: MessageListener) {
    if (type === "message") this.listeners.delete(listener);
  }

  emitRemoteMessage() {
    this.listeners.forEach((listener) => listener());
  }
}

describe("library change delivery", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("delivers a local notification once and publishes it for other tabs", async () => {
    const { LIBRARY_CHANGE_EVENT, notifyLibraryChange, subscribeLibraryChange } =
      await import("./libraryEvents");
    const listener = vi.fn();
    const unsubscribe = subscribeLibraryChange(listener);

    notifyLibraryChange();

    expect(listener).toHaveBeenCalledOnce();
    expect(FakeBroadcastChannel.instances[0]?.name).toBe(LIBRARY_CHANGE_EVENT);
    expect(FakeBroadcastChannel.instances[0]?.postMessage).toHaveBeenCalledWith(
      LIBRARY_CHANGE_EVENT,
    );
    unsubscribe();
  });

  it("delivers a remote BroadcastChannel message to the subscriber", async () => {
    const { subscribeLibraryChange } = await import("./libraryEvents");
    const listener = vi.fn();
    const unsubscribe = subscribeLibraryChange(listener);

    FakeBroadcastChannel.instances[0]?.emitRemoteMessage();

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("removes both local and remote listeners on cleanup", async () => {
    const { notifyLibraryChange, subscribeLibraryChange } = await import("./libraryEvents");
    const listener = vi.fn();
    const unsubscribe = subscribeLibraryChange(listener);
    const channel = FakeBroadcastChannel.instances[0];

    unsubscribe();
    notifyLibraryChange();
    channel?.emitRemoteMessage();

    expect(listener).not.toHaveBeenCalled();
    expect(channel?.listeners.size).toBe(0);
  });
});
