import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { BugOutManagedConfig } from './types';

// ─── Recording draft persistence (IndexedDB) ────────────────────────────────
// Chunks are written to IndexedDB as they arrive so a page refresh during
// recording doesn't lose the captured video. On mount the widget checks for
// leftover chunks, reconstructs the Blob, and opens straight to the
// submission form. Cleared when a new recording starts and on form reset.
//
// Design notes:
//   - Singleton DB connection: opened once per page, reused for every chunk
//     write. Opening a fresh connection per-chunk is async and unreliable
//     when the page is being torn down (the open might never resolve).
//   - beforeunload hook (added in startRecording, removed in stopRecording)
//     calls requestData() to flush the MediaRecorder's current buffer so
//     the final partial-second chunk lands in IndexedDB before the page dies.

const _IDB_NAME = 'bom-draft';
const _IDB_STORE = 'chunks';

// Lazily opened, kept alive for the page lifetime.
let _dbConn: Promise<IDBDatabase> | null = null;

function _getDB(): Promise<IDBDatabase> {
  if (!_dbConn) {
    _dbConn = new Promise((resolve, reject) => {
      const req = indexedDB.open(_IDB_NAME, 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore(_IDB_STORE, { autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { _dbConn = null; reject(req.error); };
    });
  }
  return _dbConn;
}

function dbSaveChunk(chunk: Blob): void {
  _getDB().then((db) => {
    // Fire-and-forget write on the persistent connection — no open overhead.
    db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).add(chunk);
  }).catch(() => {});
}

function dbLoadChunks(): Promise<Blob[]> {
  return _getDB().then(
    (db) => new Promise<Blob[]>((resolve) => {
      const req = db.transaction(_IDB_STORE, 'readonly')
        .objectStore(_IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result as Blob[]);
      req.onerror  = () => resolve([]);
    })
  ).catch(() => []);
}

function dbClearChunks(): void {
  _getDB().then((db) => {
    db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).clear();
  }).catch(() => {});
}
// ────────────────────────────────────────────────────────────────────────────

const TICKET_TYPES = [
  { value: 'BUG', label: 'Bug Report' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'QUESTION', label: 'Question' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface CapturedError {
  type: string;
  message: string;
  source?: string;
  line?: number;
  col?: number;
  timestamp: string;
}

interface CapturedNetworkError {
  method: string;
  url: string;
  status: number;
  statusText: string;
  timestamp: string;
}

const BugOutManagedWidget: React.FC<BugOutManagedConfig> = (props) => {
  const {
    apiKey,
    apiUrl,
    userEmail,
    userName,
    theme = 'dark',
    position = 'bottom-right',
    orbSize = 24,
    // Bug Out's identity is amber/orange ("we caught a bug" — warm, high contrast).
    // Hosts can override; if they do, we treat [0]=core, [1]=ring.
    orbColors = ['#fbbf24', '#fb923c'],
    // Tenant context
    tenantId,
    tenantName,
    databaseName,
    appVersion,
    environment,
    onApiReady,
    hideOrb = false,
  } = props;

  // Stable random suffix for SVG gradient IDs — must be unique per mount.
  const orbIdRef = useRef<string>(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  );

  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [noAudioWarning, setNoAudioWarning] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecovered, setIsRecovered] = useState(false);
  const [showRecoveryPill, setShowRecoveryPill] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [ticketType, setTicketType] = useState('BUG');
  const [priority, setPriority] = useState('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  // Video-upload state — distinct from the general `error` slot because
  // ticket creation can succeed while the video upload fails, and we
  // need to keep the panel open in that case so the user can retry.
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  // Screenshots collected from drop / paste / file picker. Uploaded after
  // ticket creation succeeds (parallel to the video upload path).
  // Generic file attachments. Started as image-only ("screenshots") but
  // widened to any file type so reporters can drop logs, .har exports,
  // CSVs, mock-ups, etc. We only render an <img> preview for image MIME
  // types; everything else shows as a generic file chip.
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<(string | null)[]>([]);
  const addScreenshots = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setScreenshots((prev) => [...prev, ...files]);
    setScreenshotPreviews((prev) => [
      ...prev,
      ...files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    ]);
  }, []);
  const removeScreenshot = useCallback((idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
    setScreenshotPreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // Mini-controller floating position. Defaults to top-right; user can
  // drag it anywhere. Persisted only for the lifetime of one recording.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [miniPos, setMiniPos] = useState<{ top: number; left: number }>(() => ({
    top: 24,
    left: typeof window !== 'undefined' ? Math.max(24, window.innerWidth - 280) : 24,
  }));
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const beforeUnloadRef = useRef<(() => void) | null>(null);
  // Holds chunks recovered from IndexedDB so startRecording can prepend them
  // if the user chooses to continue recording after a refresh.
  const recoveredChunksRef = useRef<Blob[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const consoleErrorsRef = useRef<CapturedError[]>([]);
  const networkErrorsRef = useRef<CapturedNetworkError[]>([]);

  useEffect(() => {
    onApiReady?.({ open: () => setIsOpen(true), close: () => setIsOpen(false) });
  }, [onApiReady]);

  // Recover any recording that was interrupted by a page refresh.
  useEffect(() => {
    dbLoadChunks().then((chunks) => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: 'video/webm' });
      // Keep IDB intact — startRecording will clear it if user continues recording,
      // resetForm will clear it if user submits/discards.
      recoveredChunksRef.current = chunks; // store raw chunks for possible merge
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setIsRecovered(true);
      setShowRecoveryPill(true);  // show pill, NOT modal
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    // Inject keyframes + orb styles. Scoped under .bom-orb so we don't
    // collide with any host app classes.
    if (!styleRef.current) {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes bom-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bom-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(229,57,53,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(229,57,53,0); }
          100% { box-shadow: 0 0 0 0 rgba(229,57,53,0); }
        }
        @keyframes bom-orb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bom-orb-core {
          0%, 100% { transform: scale(1);    opacity: 0.92; }
          50%      { transform: scale(1.06); opacity: 1;    }
        }
        @keyframes bom-orb-halo {
          0%, 100% { opacity: 0.85; }
          50%      { opacity: 1;    }
        }
        @keyframes bom-orb-scan {
          0%   { transform: translateY(-60%); opacity: 0;   }
          20%  { opacity: 0.9; }
          80%  { opacity: 0.9; }
          100% { transform: translateY(60%);  opacity: 0;   }
        }
        .bom-orb-wrap {
          position: fixed;
          z-index: 999999;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          outline: none;
        }
        .bom-orb-wrap:focus-visible {
          box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.55);
          border-radius: 50%;
        }
        .bom-orb {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          filter:
            drop-shadow(0 0 2px var(--bom-halo))
            drop-shadow(0 0 12px var(--bom-halo))
            drop-shadow(0 0 28px var(--bom-halo));
          transition: filter 220ms ease-out;
        }
        .bom-orb-wrap:hover .bom-orb {
          filter:
            drop-shadow(0 0 3px var(--bom-halo))
            drop-shadow(0 0 18px var(--bom-halo))
            drop-shadow(0 0 36px var(--bom-halo));
        }
        .bom-orb__svg { display: block; width: 100%; height: 100%; }
        .bom-orb__halo {
          animation: bom-orb-halo var(--bom-pulse, 4s) ease-in-out infinite;
          transform-origin: 50% 50%;
        }
        .bom-orb__core {
          transform-origin: 50% 50%;
          animation: bom-orb-core var(--bom-pulse, 4s) ease-in-out infinite;
        }
        .bom-orb__spin-cw {
          transform-origin: 50% 50%;
          animation: bom-orb-spin var(--bom-spin, 18s) linear infinite;
        }
        .bom-orb__spin-ccw {
          transform-origin: 50% 50%;
          animation: bom-orb-spin var(--bom-spin, 18s) linear infinite reverse;
        }
        .bom-orb__spin-cw-fast {
          transform-origin: 50% 50%;
          animation: bom-orb-spin calc(var(--bom-spin, 18s) / 3) linear infinite;
        }
        .bom-orb-wrap:hover .bom-orb__spin-cw,
        .bom-orb-wrap:hover .bom-orb__spin-ccw {
          animation-duration: calc(var(--bom-spin, 18s) / 2);
        }
        .bom-orb-wrap:hover .bom-orb__core,
        .bom-orb-wrap:hover .bom-orb__halo {
          animation-duration: calc(var(--bom-pulse, 4s) / 1.6);
        }
        .bom-orb__scan {
          position: absolute;
          inset: 8% 18%;
          border-radius: 50%;
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(255, 247, 220, 0) 40%,
            rgba(255, 247, 220, 0.22) 50%,
            rgba(255, 247, 220, 0) 60%,
            transparent 100%
          );
          mix-blend-mode: screen;
          animation: bom-orb-scan calc(var(--bom-pulse, 4s) * 1.4) ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .bom-orb__spin-cw,
          .bom-orb__spin-ccw,
          .bom-orb__spin-cw-fast,
          .bom-orb__core,
          .bom-orb__halo,
          .bom-orb__scan { animation: none !important; }
        }
      `;
      document.head.appendChild(style);
      styleRef.current = style;
    }

    // Capture console errors
    const origConsoleError = console.error;
    console.error = (...args: any[]) => {
      consoleErrorsRef.current.push({
        type: 'console.error',
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
        timestamp: new Date().toISOString(),
      });
      // Keep only last 50 errors
      if (consoleErrorsRef.current.length > 50) consoleErrorsRef.current.shift();
      origConsoleError.apply(console, args);
    };

    const handleWindowError = (event: ErrorEvent) => {
      consoleErrorsRef.current.push({
        type: 'window.onerror',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        timestamp: new Date().toISOString(),
      });
      if (consoleErrorsRef.current.length > 50) consoleErrorsRef.current.shift();
    };
    window.addEventListener('error', handleWindowError);

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      consoleErrorsRef.current.push({
        type: 'unhandledrejection',
        message: event.reason?.message || String(event.reason),
        timestamp: new Date().toISOString(),
      });
      if (consoleErrorsRef.current.length > 50) consoleErrorsRef.current.shift();
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Capture network errors by intercepting fetch
    const origFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const method = (args[1]?.method || 'GET').toUpperCase();
      try {
        const response = await origFetch.apply(window, args);
        if (!response.ok && !url.includes(apiUrl)) {
          // Only capture non-widget API errors
          networkErrorsRef.current.push({
            method,
            url,
            status: response.status,
            statusText: response.statusText,
            timestamp: new Date().toISOString(),
          });
          if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
        }
        return response;
      } catch (err: any) {
        // Skip Bug Out's own API calls so widget failures don't pollute the
        // host app's error context shown in the ticket.
        if (!url.includes(apiUrl)) {
          networkErrorsRef.current.push({
            method,
            url,
            status: 0,
            statusText: err.message || 'Network Error',
            timestamp: new Date().toISOString(),
          });
          if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
        }
        throw err;
      }
    };

    // Capture XMLHttpRequest errors
    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      (this as any)._bomMethod = method;
      (this as any)._bomUrl = String(url);
      return origXHROpen.apply(this, [method, url, ...rest] as any);
    };
    XMLHttpRequest.prototype.send = function (...args: any[]) {
      this.addEventListener('loadend', () => {
        if (this.status >= 400 && !(this as any)._bomUrl?.includes(apiUrl)) {
          networkErrorsRef.current.push({
            method: (this as any)._bomMethod || 'GET',
            url: (this as any)._bomUrl || '',
            status: this.status,
            statusText: this.statusText,
            timestamp: new Date().toISOString(),
          });
          if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
        }
      });
      // XHR.send signature varies by overload; the rest spread is fine at
      // runtime but tsc's strict overload-resolution doesn't accept it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origXHRSend as any).apply(this, args);
    };

    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
      console.error = origConsoleError;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origXHROpen;
      XMLHttpRequest.prototype.send = origXHRSend;
    };
  }, [apiUrl]);

  const isDark = theme === 'dark';
  const bg = isDark ? '#1a1a2e' : '#ffffff';
  const fg = isDark ? '#e0e0e0' : '#333333';
  const borderColor = isDark ? '#333' : '#ddd';
  const inputBg = isDark ? '#16213e' : '#f5f5f5';

  const posStyle: React.CSSProperties =
    position === 'bottom-left'
      ? { bottom: 24, left: 24 }
      : { bottom: 24, right: 24 };

  const startRecording = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        // 'monitor' hints Chrome/Edge to pre-select "Entire Screen" in the picker.
        video: { displaySurface: 'monitor' } as MediaTrackConstraints,
        // Passing only systemAudio:'include' — extra constraints alongside it
        // cause Chrome to silently ignore the pre-check.
        audio: { systemAudio: 'include' } as MediaTrackConstraints,
      });

      // Request mic so the user's narration is captured alongside the screen.
      // If the browser denies mic access we fall back to display audio only.
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        // Mic denied or unavailable — continue with display audio only.
      }
      micStreamRef.current = micStream;

      // Require audio — stop immediately and show the dedicated retry prompt.
      const hasMic = (micStream?.getAudioTracks().length ?? 0) > 0;
      const hasSystemAudio = displayStream.getAudioTracks().length > 0;
      if (!hasMic && !hasSystemAudio) {
        displayStream.getTracks().forEach((t) => t.stop());
        micStream?.getTracks().forEach((t) => t.stop());
        setNoAudioWarning(true);
        setIsOpen(false);
        return;
      }

      // Build the recording stream: all video tracks from the display capture,
      // plus mic audio (preferred) or display audio if mic is unavailable.
      const audioTracks = hasMic
        ? micStream!.getAudioTracks()
        : displayStream.getAudioTracks();
      const stream = new MediaStream([...displayStream.getVideoTracks(), ...audioTracks]);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });
      chunksRef.current = [];
      if (recoveredChunksRef.current.length === 0) {
        dbClearChunks(); // only clear if not merging with a recovery
      }
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          dbSaveChunk(e.data); // persist chunk so a page refresh doesn't lose it
        }
      };
      mediaRecorder.onstop = () => {
        const allChunks = [...recoveredChunksRef.current, ...chunksRef.current];
        const blob = new Blob(allChunks, { type: 'video/webm' });
        recoveredChunksRef.current = [];
        dbClearChunks(); // now safe to clear — we have the merged blob
        setRecordedBlob(blob);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        setIsRecovered(false);
        setShowRecoveryPill(false);
        displayStream.getTracks().forEach((t) => t.stop());
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

      // Flush the current partial chunk before the page unloads so it lands
      // in IndexedDB before the browser tears down the tab.
      const handleBeforeUnload = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      beforeUnloadRef.current = handleBeforeUnload;

      setIsRecording(true);
      // Get the big modal out of the user's way so they can actually
      // demonstrate the bug. The mini controller (rendered below the
      // modal block) keeps a Stop button visible. Modal reopens
      // automatically when stopRecording fires.
      setIsOpen(false);

      // Speech recognition
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        let finalTranscript = '';
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          setTranscript(finalTranscript + interim);
        };
        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (beforeUnloadRef.current) {
      window.removeEventListener('beforeunload', beforeUnloadRef.current);
      beforeUnloadRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    // Bring the modal back so the user can review the captured recording
    // and finish filling out the form before submitting.
    setIsOpen(true);
  }, []);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTicketType('BUG');
    setPriority('MEDIUM');
    setTranscript('');
    setRecordedBlob(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setUploadFile(null);
    setScreenshots([]);
    setScreenshotPreviews((prev) => { prev.forEach((u) => { if (u) URL.revokeObjectURL(u); }); return []; });
    setError('');
    setSubmitted(false);
    setVideoUploadError(null);
    setCreatedTicketId(null);
    setVideoUploading(false);
    setIsRecovered(false);
    setShowRecoveryPill(false);
    setNoAudioWarning(false);
    recoveredChunksRef.current = [];
    dbClearChunks();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const ticketData: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        ticketType,
        priority,
        submittedBy: userEmail || userName || 'Anonymous',
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: transcript || null,
        consoleErrors: consoleErrorsRef.current.length > 0
          ? JSON.stringify(consoleErrorsRef.current)
          : null,
        networkErrors: networkErrorsRef.current.length > 0
          ? JSON.stringify(networkErrorsRef.current)
          : null,
      };

      // Add tenant context if provided
      if (tenantId) ticketData.tenantId = tenantId;
      if (tenantName) ticketData.tenantName = tenantName;
      if (databaseName) ticketData.databaseName = databaseName;
      if (appVersion) ticketData.applicationVersion = appVersion;
      if (environment) ticketData.environment = environment;

      const res = await fetch(`${apiUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BOM-API-Key': apiKey,
        },
        body: JSON.stringify(ticketData),
      });

      if (!res.ok) throw new Error('Failed to submit ticket');
      const ticket = await res.json();

      // Upload screenshots first — small/fast, and rolling into the same
      // try block as the ticket POST means a network drop here surfaces in
      // the same submitter-visible error path. Independent of video upload
      // below so a video failure doesn't lose already-stored screenshots
      // (and vice versa).
      if (screenshots.length > 0 && ticket.id) {
        for (const file of screenshots) {
          try {
            const fd = new FormData();
            fd.append('file', file, file.name || 'screenshot.png');
            const ssRes = await fetch(`${apiUrl}/tickets/${ticket.id}/attachments/widget`, {
              method: 'POST',
              headers: { 'X-BOM-API-Key': apiKey },
              body: fd,
            });
            if (!ssRes.ok) {
              console.warn(`[Bug Out] Screenshot upload failed (${ssRes.status}) for ticket ${ticket.id}`);
            }
          } catch (ssErr) {
            console.warn('[Bug Out] Screenshot upload network error:', ssErr);
          }
        }
      }

      // Upload video if recorded or file selected. Retried with backoff
      // because the server cap + network blips were silently dropping
      // recordings (the ticket creates fine, video falls through). Keep
      // createdTicketId so the user can retry from the post-submit panel
      // if all attempts fail.
      const videoToUpload = recordedBlob || uploadFile;
      setCreatedTicketId(ticket.id);
      if (videoToUpload && ticket.id) {
        const uploadErr = await uploadVideoWithRetry(ticket.id, videoToUpload);
        if (uploadErr) {
          // Ticket exists, video doesn't — keep the panel open so the
          // user can retry. resetForm is intentionally NOT called.
          setVideoUploadError(uploadErr);
          setSubmitting(false);
          return;
        }
      }

      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        resetForm();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  // Server caps individual video uploads at 200 MB. Anything bigger is
  // a permanent failure — no point retrying. Everything else is retried
  // up to 3 times with exponential backoff (1s, 2s, 4s).
  const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
  const uploadVideoWithRetry = async (ticketId: number, blob: Blob): Promise<string | null> => {
    if (blob.size > MAX_VIDEO_BYTES) {
      return `Recording is ${(blob.size / 1024 / 1024).toFixed(1)} MB — exceeds the ${MAX_VIDEO_BYTES / 1024 / 1024} MB upload limit. Stop the recording sooner next time.`;
    }
    setVideoUploading(true);
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        const res = await fetch(`${apiUrl}/tickets/${ticketId}/video`, {
          method: 'POST',
          headers: { 'X-BOM-API-Key': apiKey },
          body: formData,
        });
        if (res.ok) {
          setVideoUploading(false);
          return null;
        }
        // 4xx is a client-side problem — no point retrying.
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          const body = await res.text().catch(() => '');
          lastErr = `Server rejected upload (${res.status}): ${body || res.statusText}`;
          break;
        }
        lastErr = `Upload failed (${res.status}). Retrying…`;
      } catch (e: any) {
        lastErr = e?.message
          ? `Network error: ${e.message}. Retrying…`
          : 'Network error. Retrying…';
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
    setVideoUploading(false);
    return lastErr || 'Video upload failed after 3 attempts.';
  };

  const retryVideoUpload = async () => {
    if (!createdTicketId) return;
    const videoToUpload = recordedBlob || uploadFile;
    if (!videoToUpload) return;
    setVideoUploadError(null);
    const err = await uploadVideoWithRetry(createdTicketId, videoToUpload);
    if (err) {
      setVideoUploadError(err);
    } else {
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        resetForm();
      }, 2000);
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    transition: 'opacity 0.2s',
  };

  return (
    <>
      {/* Floating Orb — only when not managed by the ManagedLauncherOrb */}
      {!hideOrb && (() => {
        const px = orbSize * 2;
        const core = orbColors[0];
        const ring = orbColors[1];
        // Halo derived from core color so swapping orbColors stays consistent.
        const halo = `${core}8c`; // ~55% alpha
        const id = orbIdRef.current;
        return (
          <button
            type="button"
            role="button"
            aria-label="Report a bug"
            title="Report a bug or request a feature"
            onClick={() => {
              if (!isOpen) resetForm();
              setIsOpen(!isOpen);
            }}
            className="bom-orb-wrap"
            style={
              {
                ...posStyle,
                width: px,
                height: px,
                ['--bom-core' as any]: core,
                ['--bom-ring' as any]: ring,
                ['--bom-halo' as any]: halo,
                ['--bom-spin' as any]: '18s',
                ['--bom-pulse' as any]: '4s',
              } as React.CSSProperties
            }
          >
            <span className="bom-orb">
              <svg
                viewBox="0 0 100 100"
                width={px}
                height={px}
                aria-hidden="true"
                className="bom-orb__svg"
              >
                <defs>
                  <radialGradient id={`${id}-core`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor={core} stopOpacity="1" />
                    <stop offset="55%"  stopColor={core} stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#1a0f00" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id={`${id}-iris`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#fff7dc" stopOpacity="0.95" />
                    <stop offset="40%"  stopColor={core}    stopOpacity="0.7" />
                    <stop offset="100%" stopColor={core}    stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Outer halo — radial bloom */}
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill={`url(#${id}-core)`}
                  className="bom-orb__halo"
                />

                {/* Outer ring with tick marks (rotates clockwise) */}
                <g className="bom-orb__spin-cw">
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke={ring}
                    strokeOpacity="0.55"
                    strokeWidth="0.5"
                  />
                  {Array.from({ length: 36 }).map((_, i) => {
                    const a = (i * 10 * Math.PI) / 180;
                    const x1 = 50 + Math.cos(a) * 41;
                    const y1 = 50 + Math.sin(a) * 41;
                    const x2 = 50 + Math.cos(a) * (i % 3 === 0 ? 44 : 43);
                    const y2 = 50 + Math.sin(a) * (i % 3 === 0 ? 44 : 43);
                    return (
                      <line
                        key={i}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={ring}
                        strokeOpacity={i % 3 === 0 ? 0.8 : 0.35}
                        strokeWidth="0.8"
                      />
                    );
                  })}
                </g>

                {/* Mid ring — counter-rotating arc segments */}
                <g className="bom-orb__spin-ccw">
                  <circle
                    cx="50"
                    cy="50"
                    r="36"
                    fill="none"
                    stroke={ring}
                    strokeOpacity="0.18"
                    strokeWidth="0.5"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="36"
                    fill="none"
                    stroke={ring}
                    strokeOpacity="0.85"
                    strokeWidth="1.4"
                    strokeDasharray="42 30 18 36 24 32"
                    strokeLinecap="round"
                  />
                </g>

                {/* Inner ring — dashed sweep */}
                <g className="bom-orb__spin-cw-fast">
                  <circle
                    cx="50"
                    cy="50"
                    r="28"
                    fill="none"
                    stroke={core}
                    strokeOpacity="0.7"
                    strokeWidth="0.9"
                    strokeDasharray="2 4"
                  />
                </g>

                {/* Core iris (pulses) */}
                <circle
                  cx="50"
                  cy="50"
                  r="20"
                  fill={`url(#${id}-iris)`}
                  className="bom-orb__core"
                />

                {/* Bug glyph dead-center — tiny "i" mark identifies this as the
                    bug button (the visual cue users learn). Drawn on top of
                    the iris so it stays legible at all sizes. */}
                <g stroke="#1a0f00" strokeOpacity="0.55" strokeLinecap="round">
                  <line x1="50" y1="42" x2="50" y2="42" strokeWidth="3.4" />
                  <line x1="50" y1="48" x2="50" y2="58" strokeWidth="2.4" />
                </g>

                {/* Crosshair lines */}
                <line x1="50" y1="6"  x2="50" y2="14" stroke={ring} strokeOpacity="0.7" strokeWidth="0.6" />
                <line x1="50" y1="86" x2="50" y2="94" stroke={ring} strokeOpacity="0.7" strokeWidth="0.6" />
                <line x1="6"  y1="50" x2="14" y2="50" stroke={ring} strokeOpacity="0.7" strokeWidth="0.6" />
                <line x1="86" y1="50" x2="94" y2="50" stroke={ring} strokeOpacity="0.7" strokeWidth="0.6" />
              </svg>

              {/* Vertical scan sweep */}
              <span className="bom-orb__scan" />
            </span>
          </button>
        );
      })()}

      {/* No-audio gate — shown when recording started but no audio track was captured */}
      {noAudioWarning && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'bom-fade-in 0.2s ease-out',
          }}
        >
          <div style={{
            background: bg, color: fg, borderRadius: 12, padding: 28,
            width: '90%', maxWidth: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔇</div>
            <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>No audio detected</h3>
            <p style={{ margin: '0 0 18px', fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
              Your recording would have no sound. In the screen picker, enable the
              <strong> "Also share system audio"</strong> toggle before clicking Share.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <div
                onClick={() => { setNoAudioWarning(false); startRecording(); }}
                style={{
                  ...btnStyle,
                  background: `linear-gradient(135deg, ${orbColors[0]}, ${orbColors[1]})`,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Try again
              </div>
              <div
                onClick={() => { setNoAudioWarning(false); setIsOpen(true); }}
                style={{ ...btnStyle, background: 'transparent', color: fg, border: `1px solid ${borderColor}`, cursor: 'pointer' }}
              >
                Skip audio
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'bom-fade-in 0.2s ease-out',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            style={{
              background: bg,
              color: fg,
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 520,
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {submitted ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
                <h3 style={{ margin: 0, fontSize: 20 }}>Submitted!</h3>
                <p style={{ opacity: 0.7, marginTop: 8 }}>Thank you for your feedback.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Report an Issue</h3>
                  <div
                    onClick={() => setIsOpen(false)}
                    style={{ cursor: 'pointer', fontSize: 20, opacity: 0.6, padding: '0 4px' }}
                  >
                    &#10005;
                  </div>
                </div>

                {/* Type */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {TICKET_TYPES.map((t) => (
                      <div
                        key={t.value}
                        onClick={() => setTicketType(t.value)}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          textAlign: 'center',
                          borderRadius: 6,
                          border: `2px solid ${ticketType === t.value ? orbColors[0] : borderColor}`,
                          background: ticketType === t.value ? `${orbColors[0]}22` : 'transparent',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: ticketType === t.value ? 700 : 400,
                        }}
                      >
                        {t.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Priority */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${borderColor}`,
                      background: inputBg,
                      color: fg,
                      fontSize: 14,
                      outline: 'none',
                    }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                    Title <span style={{ color: '#e53935' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief summary of the issue"
                    maxLength={500}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${borderColor}`,
                      background: inputBg,
                      color: fg,
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onPaste={(e) => {
                      // Paste-an-image-from-clipboard support. Treats any
                      // image item in the clipboard as a screenshot
                      // attachment; text paste falls through to the default.
                      const items = Array.from(e.clipboardData?.items || []);
                      const imgs = items
                        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                        .map((it) => it.getAsFile())
                        .filter((f): f is File => f != null);
                      if (imgs.length > 0) {
                        e.preventDefault();
                        addScreenshots(imgs);
                      }
                    }}
                    placeholder="Describe the issue in detail... (you can paste a screenshot here)"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${borderColor}`,
                      background: inputBg,
                      color: fg,
                      fontSize: 14,
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Files */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                    Files
                  </label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const files = Array.from(e.dataTransfer?.files || []);
                      if (files.length) addScreenshots(files);
                    }}
                    style={{
                      border: `1px dashed ${borderColor}`,
                      borderRadius: 6,
                      padding: 14,
                      background: inputBg,
                      fontSize: 12,
                      opacity: 0.95,
                      textAlign: 'center',
                      minHeight: 70,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <label style={{ ...btnStyle, background: '#444', color: '#fff', padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                        Choose files
                        <input
                          type="file"
                          accept="*/*"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) addScreenshots(files);
                            (e.target as HTMLInputElement).value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <span style={{ opacity: 0.7 }}>or drag &amp; drop / paste images here — any file type</span>
                    </div>
                    {screenshots.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {screenshots.map((f, i) => {
                          const preview = screenshotPreviews[i];
                          return (
                            <div key={i} style={{ position: 'relative' }}>
                              {preview ? (
                                <img
                                  src={preview}
                                  alt={f.name || `file-${i + 1}`}
                                  title={f.name}
                                  style={{
                                    width: 64, height: 64,
                                    objectFit: 'cover',
                                    borderRadius: 4,
                                    border: `1px solid ${borderColor}`,
                                  }}
                                />
                              ) : (
                                <div
                                  title={f.name}
                                  style={{
                                    width: 90, height: 64,
                                    borderRadius: 4,
                                    border: `1px solid ${borderColor}`,
                                    background: '#0d1117',
                                    color: '#9ca3af',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    padding: '0 4px',
                                    fontSize: 10,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  <div style={{ fontSize: 18, lineHeight: 1 }}>📎</div>
                                  <div style={{
                                    maxWidth: 78,
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    marginTop: 4,
                                  }}>{f.name || 'file'}</div>
                                </div>
                              )}
                              <div
                                onClick={() => removeScreenshot(i)}
                                style={{
                                  position: 'absolute',
                                  top: -6, right: -6,
                                  width: 18, height: 18,
                                  borderRadius: 9,
                                  background: '#e53935',
                                  color: '#fff',
                                  fontSize: 12,
                                  lineHeight: '18px',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                }}
                                title="Remove"
                              >×</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Screen Recording */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Screen Recording</label>
                  {isMobile ? (
                    <div>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        style={{ fontSize: 13 }}
                      />
                      {uploadFile && (
                        <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>
                          {uploadFile.name}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {!isRecording && !recordedBlob && (
                        <div
                          onClick={startRecording}
                          style={{
                            ...btnStyle,
                            background: `linear-gradient(135deg, ${orbColors[0]}, ${orbColors[1]})`,
                            color: '#fff',
                          }}
                        >
                          Start Recording
                        </div>
                      )}
                      {isRecording && (
                        <div
                          onClick={stopRecording}
                          style={{ ...btnStyle, background: '#e53935', color: '#fff' }}
                        >
                          Stop Recording
                        </div>
                      )}
                      {isRecovered && (
                        <div style={{
                          fontSize: 12,
                          color: '#fb923c',
                          background: 'rgba(251,146,60,0.12)',
                          border: '1px solid rgba(251,146,60,0.35)',
                          borderRadius: 6,
                          padding: '5px 10px',
                          marginBottom: 4,
                        }}>
                          Recording recovered after page reload — your video is intact.
                        </div>
                      )}
                      {recordedBlob && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>
                            {(recordedBlob.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <div
                            onClick={() => { setRecordedBlob(null); setPreviewUrl((p) => { if (p) URL.revokeObjectURL(p); return null; }); }}
                            style={{ ...btnStyle, background: '#666', color: '#fff', padding: '4px 10px', fontSize: 12 }}
                          >
                            Remove
                          </div>
                        </div>
                      )}
                      {isRecording && (
                        <span style={{ fontSize: 12, color: '#e53935', fontWeight: 600 }}>
                          Recording...
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Video preview — lets the user verify audio was captured before submitting */}
                {previewUrl && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>
                      Preview
                    </label>
                    <video
                      src={previewUrl}
                      controls
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: `1px solid ${borderColor}`,
                        background: '#000',
                        maxHeight: 220,
                        display: 'block',
                      }}
                    />
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                      Make sure your audio is audible before submitting.
                    </div>
                  </div>
                )}

                {/* Transcript */}
                {transcript && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Voice Transcript</label>
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: inputBg,
                        border: `1px solid ${borderColor}`,
                        fontSize: 13,
                        maxHeight: 80,
                        overflowY: 'auto',
                        opacity: 0.8,
                      }}
                    >
                      {transcript}
                    </div>
                  </div>
                )}

                {/* Error capture indicator */}
                {(consoleErrorsRef.current.length > 0 || networkErrorsRef.current.length > 0) && (
                  <div style={{
                    marginBottom: 14,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: isDark ? '#2a1a1a' : '#fff3f0',
                    border: `1px solid ${isDark ? '#4a2020' : '#ffccc7'}`,
                    fontSize: 12,
                    opacity: 0.8,
                  }}>
                    {consoleErrorsRef.current.length > 0 && (
                      <span>{consoleErrorsRef.current.length} console error(s) captured</span>
                    )}
                    {consoleErrorsRef.current.length > 0 && networkErrorsRef.current.length > 0 && ' | '}
                    {networkErrorsRef.current.length > 0 && (
                      <span>{networkErrorsRef.current.length} network error(s) captured</span>
                    )}
                    <span style={{ display: 'block', marginTop: 2, opacity: 0.7 }}>
                      These will be included in your report automatically.
                    </span>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{ color: '#e53935', fontSize: 13, marginBottom: 10 }}>{error}</div>
                )}

                {/* Video upload error — ticket already created; offer
                    a retry so the recording isn't lost. Distinct from
                    the general error slot above so the user can see the
                    ticket landed even though the video didn't. */}
                {videoUploadError && createdTicketId && (
                  <div style={{
                    background: 'rgba(229, 57, 53, 0.12)',
                    border: '1px solid rgba(229, 57, 53, 0.45)',
                    color: '#ffb4ad',
                    padding: '10px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    marginBottom: 10,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#ff6b66' }}>
                      Ticket #{createdTicketId} was saved — but the video upload failed.
                    </div>
                    <div style={{ marginBottom: 8 }}>{videoUploadError}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div
                        onClick={videoUploading ? undefined : retryVideoUpload}
                        style={{
                          ...btnStyle,
                          background: videoUploading ? '#666' : `linear-gradient(135deg, ${orbColors[0]}, ${orbColors[1]})`,
                          color: '#fff',
                          padding: '5px 12px',
                          fontSize: 12,
                          opacity: videoUploading ? 0.6 : 1,
                          cursor: videoUploading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {videoUploading ? 'Retrying…' : 'Retry video upload'}
                      </div>
                      <div
                        onClick={() => {
                          setVideoUploadError(null);
                          setIsOpen(false);
                          resetForm();
                        }}
                        style={{
                          ...btnStyle,
                          background: 'transparent',
                          color: fg,
                          border: `1px solid ${borderColor}`,
                          padding: '5px 12px',
                          fontSize: 12,
                        }}
                      >
                        Skip & close
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <div
                    onClick={() => setIsOpen(false)}
                    style={{
                      ...btnStyle,
                      background: 'transparent',
                      color: fg,
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    Cancel
                  </div>
                  <div
                    onClick={submitting ? undefined : handleSubmit}
                    style={{
                      ...btnStyle,
                      background: submitting
                        ? '#666'
                        : `linear-gradient(135deg, ${orbColors[0]}, ${orbColors[1]})`,
                      color: '#fff',
                      opacity: submitting ? 0.6 : 1,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </div>
                </div>

                {/* Context info */}
                <div style={{ marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: 'center' }}>
                  Page URL, browser info, screen size, and console errors will be captured automatically.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mini recording controller — renders independently of the modal so
          the user can navigate the page and reproduce the bug while the
          screen is being captured. Drag anywhere on the pill to reposition. */}
      {isRecording && (
        <div
          onMouseDown={(e) => {
            // STOP button handles its own mousedown — don't start a drag.
            if ((e.target as HTMLElement).closest('[data-bom-stop]')) return;
            e.preventDefault();
            dragOffsetRef.current = {
              x: e.clientX - miniPos.left,
              y: e.clientY - miniPos.top,
            };
            const onMove = (ev: MouseEvent) => {
              if (!dragOffsetRef.current) return;
              setMiniPos({
                left: Math.max(0, Math.min(window.innerWidth - 240, ev.clientX - dragOffsetRef.current.x)),
                top: Math.max(0, Math.min(window.innerHeight - 50, ev.clientY - dragOffsetRef.current.y)),
              });
            };
            const onUp = () => {
              dragOffsetRef.current = null;
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
          onTouchStart={(e) => {
            if ((e.target as HTMLElement).closest('[data-bom-stop]')) return;
            const touch = e.touches[0];
            dragOffsetRef.current = {
              x: touch.clientX - miniPos.left,
              y: touch.clientY - miniPos.top,
            };
            const onMove = (ev: TouchEvent) => {
              if (!dragOffsetRef.current) return;
              ev.preventDefault();
              const t = ev.touches[0];
              setMiniPos({
                left: Math.max(0, Math.min(window.innerWidth - 240, t.clientX - dragOffsetRef.current.x)),
                top: Math.max(0, Math.min(window.innerHeight - 50, t.clientY - dragOffsetRef.current.y)),
              });
            };
            const onUp = () => {
              dragOffsetRef.current = null;
              document.removeEventListener('touchmove', onMove);
              document.removeEventListener('touchend', onUp);
            };
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
          }}
          style={{
            position: 'fixed',
            top: miniPos.top,
            left: miniPos.left,
            zIndex: 1000001,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: bg,
            color: fg,
            borderRadius: 999,
            border: `1px solid ${borderColor}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 13,
            userSelect: 'none',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          {/* Grip dots — visual affordance that the whole pill is draggable */}
          <span style={{ opacity: 0.45, fontSize: 14, lineHeight: 1, pointerEvents: 'none' }}>
            &#x2630;
          </span>

          {/* Live indicator */}
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#e53935',
              boxShadow: '0 0 0 0 rgba(229,57,53,0.6)',
              animation: 'bom-pulse 1.4s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
          <span style={{ fontWeight: 600, pointerEvents: 'none' }}>Recording</span>

          {/* Stop button — data-bom-stop prevents drag from firing on this element */}
          <div
            data-bom-stop="true"
            onClick={stopRecording}
            style={{
              cursor: 'pointer',
              background: '#e53935',
              color: '#fff',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
            }}
          >
            STOP
          </div>
        </div>
      )}

      {/* Recovery pill — shown after page refresh recovers an in-progress recording */}
      {showRecoveryPill && !isRecording && !isOpen && recordedBlob && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          right: 24,
          zIndex: 1000001,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: bg,
          color: fg,
          borderRadius: 999,
          border: `1px solid rgba(251,146,60,0.5)`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 13,
          userSelect: 'none',
        }}>
          <span style={{ fontSize: 16 }}>🎥</span>
          <span style={{ fontWeight: 600, color: '#fb923c' }}>
            Recovered ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
          </span>
          <div
            onClick={() => { setShowRecoveryPill(false); startRecording(); }}
            style={{ cursor: 'pointer', background: `linear-gradient(135deg, ${orbColors[0]}, ${orbColors[1]})`, color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}
          >
            Continue
          </div>
          <div
            onClick={() => { setShowRecoveryPill(false); setIsOpen(true); }}
            style={{ cursor: 'pointer', background: '#22c55e', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}
          >
            Submit
          </div>
          <div
            onClick={() => {
              setShowRecoveryPill(false);
              setIsRecovered(false);
              setRecordedBlob(null);
              setPreviewUrl((p) => { if (p) URL.revokeObjectURL(p); return null; });
              recoveredChunksRef.current = [];
              dbClearChunks();
            }}
            style={{ cursor: 'pointer', opacity: 0.5, fontSize: 12, padding: '5px 8px' }}
          >
            ✕
          </div>
        </div>
      )}
    </>
  );
};

export default BugOutManagedWidget;
