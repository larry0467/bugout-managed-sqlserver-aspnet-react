export interface LauncherTool {
  id: string;
  label: string;
  icon: string;
  open: () => void;
  close: () => void;
}

export interface ManagedLauncherRegistry {
  register(tool: LauncherTool): void;
  unregister(id: string): void;
  /** Subscribe to tool-list changes; returns unsubscribe fn. */
  subscribe(fn: (tools: LauncherTool[]) => void): () => void;
  getTools(): LauncherTool[];
  /**
   * Try to claim the launcher-orb host role.
   * Returns false if another host already owns it — caller should NOT render an orb.
   * onRevoked fires if a higher-priority host later forcibly takes over.
   */
  claimHost(hostId: string, onRevoked: () => void): boolean;
  /** Forcibly take over from the current host (e.g. Comms taking over from Bug Out). */
  revokeHost(): void;
  /** Voluntarily release without triggering the revoke callback (called on unmount). */
  releaseHost(hostId: string): void;
  getHostId(): string | null;
}

declare global {
  interface Window {
    __ManagedLauncher__?: ManagedLauncherRegistry;
  }
}

export function getOrCreateRegistry(): ManagedLauncherRegistry {
  if (!window.__ManagedLauncher__) {
    let tools: LauncherTool[] = [];
    const listeners = new Set<(tools: LauncherTool[]) => void>();
    let hostId: string | null = null;
    let hostRevoke: (() => void) | null = null;

    window.__ManagedLauncher__ = {
      register(tool) {
        tools = [...tools.filter(t => t.id !== tool.id), tool];
        listeners.forEach(fn => fn(tools));
      },
      unregister(id) {
        tools = tools.filter(t => t.id !== id);
        listeners.forEach(fn => fn(tools));
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      getTools: () => tools,
      claimHost(id, onRevoked) {
        if (hostId !== null) return false;
        hostId = id;
        hostRevoke = onRevoked;
        return true;
      },
      revokeHost() {
        hostRevoke?.();
        hostId = null;
        hostRevoke = null;
      },
      releaseHost(id) {
        if (hostId === id) {
          hostId = null;
          hostRevoke = null;
        }
      },
      getHostId: () => hostId,
    };
  }
  return window.__ManagedLauncher__!;
}
