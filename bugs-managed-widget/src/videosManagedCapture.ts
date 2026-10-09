import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Recording through Videos Managed instead of in the page.
 *
 * The in-page recorder (getDisplayMedia + MediaRecorder inside the host app)
 * dies the moment the host navigates or reloads, which is exactly what people
 * do while showing a bug. So when the app has a Videos Managed workspace key,
 * the widget asks Bug Out for a one-time capture link and opens Videos Managed's
 * recorder in its own window. That window owns the capture; the host page can
 * do anything. When the reporter stops, the recorder posts the share link back
 * here and closes itself, and the ticket is submitted with that link instead of
 * a blob. Reporters never log in to Videos Managed: the workspace key is the
 * licence, scoped to that one new recording.
 *
 * `begin()` resolves `false` when this path is not available (app not enabled,
 * Videos Managed down, popup blocked) so the caller falls back to the in-page
 * recorder. Nothing here throws.
 */

export interface VmAttachedRecording {
  recordingId: string;
  shareUrl: string;
  durationSeconds?: number;
}

interface VmCaptureSession {
  sessionId: string;
  recordingId: string;
  captureUrl: string;
  shareUrl: string;
  expiresAt: string;
}

export interface UseVideosManagedCaptureOptions {
  apiUrl: string;
  apiKey: string;
  /** Title for the recording; the ticket title when there is one. */
  getTitle: () => string;
  /** The recorder window finished and the share link is attached. */
  onAttached?: (recording: VmAttachedRecording) => void;
  /** The recorder window closed or discarded without a recording. */
  onClosed?: () => void;
}

const COMPLETE = 'videos-managed:capture-complete';
const DISCARDED = 'videos-managed:capture-discarded';
const WINDOW_NAME = 'bugout-videos-managed-recorder';
const WINDOW_FEATURES = 'popup=yes,width=840,height=660,menubar=no,toolbar=no,location=no,status=no';

export function useVideosManagedCapture(opts: UseVideosManagedCaptureOptions) {
  const { apiUrl, apiKey } = opts;
  const [capturing, setCapturing] = useState(false);
  const [attached, setAttached] = useState<VmAttachedRecording | null>(null);

  // Latest callbacks without re-creating begin() on every render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const popupRef = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const begin = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;

    // Open the window inside the click (popup blockers allow that) and point
    // it at the capture link once Bug Out has one. Opening after the fetch
    // would often be blocked.
    let popup: Window | null = null;
    try { popup = window.open('', WINDOW_NAME, WINDOW_FEATURES); } catch { popup = null; }
    if (!popup) return false;
    try {
      popup.document.write(
        '<!doctype html><title>Opening the recorder…</title>' +
        '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#050818;color:#cbd5e1;font:15px system-ui,sans-serif">' +
        '<p>Opening the Videos Managed recorder…</p></body>',
      );
    } catch { /* cross-origin already — ignore */ }

    let session: VmCaptureSession | null = null;
    try {
      const res = await fetch(`${apiUrl}/tickets/capture-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BOM-API-Key': apiKey },
        body: JSON.stringify({ title: optsRef.current.getTitle() || document.title, pageUrl: window.location.href }),
      });
      // 409 = recorder not enabled for this app, 502 = Videos Managed down.
      // Both mean "record in the page instead".
      if (res.ok) session = (await res.json()) as VmCaptureSession;
    } catch { session = null; }

    if (!session?.captureUrl || !session.recordingId) {
      try { popup.close(); } catch { /* already closed */ }
      return false;
    }

    let vmOrigin: string;
    try { vmOrigin = new URL(session.captureUrl).origin; } catch { try { popup.close(); } catch { /* noop */ } return false; }

    try { popup.location.href = session.captureUrl; } catch { try { popup.close(); } catch { /* noop */ } return false; }
    popupRef.current = popup;
    setCapturing(true);

    const openedPopup = popup;
    const openedSession = session;
    let settled = false;
    let cleanup: () => void = () => {};

    const finish = (recording: VmAttachedRecording | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      setCapturing(false);
      if (recording) {
        setAttached(recording);
        optsRef.current.onAttached?.(recording);
      } else {
        optsRef.current.onClosed?.();
      }
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== vmOrigin) return;
      const d = e.data as { type?: string; recordingId?: string; shareUrl?: string; durationSeconds?: number } | null;
      if (!d || typeof d !== 'object' || d.recordingId !== openedSession.recordingId) return;
      if (d.type === COMPLETE) {
        finish({ recordingId: d.recordingId, shareUrl: d.shareUrl || openedSession.shareUrl, durationSeconds: d.durationSeconds });
      } else if (d.type === DISCARDED) {
        finish(null);
      }
    };
    window.addEventListener('message', onMessage);

    // The recorder closes itself a few seconds after posting the result, so a
    // close that arrives without a message means the reporter gave up.
    const timer = window.setInterval(() => {
      let closed = false;
      try { closed = openedPopup.closed; } catch { closed = true; }
      if (closed) finish(null);
    }, 1000);

    cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
      cleanupRef.current = null;
      popupRef.current = null;
    };
    cleanupRef.current = cleanup;
    return true;
  }, [apiUrl, apiKey]);

  /** Bring the recorder window to the front. */
  const focus = useCallback(() => {
    try { popupRef.current?.focus(); } catch { /* noop */ }
  }, []);

  /** Close the recorder window; counts as "nothing recorded". */
  const cancel = useCallback(() => {
    try { popupRef.current?.close(); } catch { /* noop */ }
  }, []);

  /** Drop an attached recording so the reporter can record again. */
  const clear = useCallback(() => setAttached(null), []);

  return { capturing, attached, begin, focus, cancel, clear };
}
