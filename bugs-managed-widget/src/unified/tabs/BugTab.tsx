import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { BugOutConfig, PanelSize, UserConfig } from '../types';

// ---------------------------------------------------------------------------
// BugTab — renders the report form DIRECTLY inside the unified panel.
//
// Root cause of the blank panel: BugsManagedWidget gates all its UI behind
// `{isOpen && (...)}` and `isOpen` starts false. With `hideOrb=true` there
// is no button to flip it true, so nothing ever renders.
//
// Fix: pull the form rendering inline here. No orb, no modal, no isOpen gate.
// The form is always visible when this tab is active.
// ---------------------------------------------------------------------------

// ─── Recording draft persistence (IndexedDB) ────────────────────────────────
const _IDB_NAME  = 'bom-draft';
const _IDB_STORE = 'chunks';

let _dbConn: Promise<IDBDatabase> | null = null;
function _getDB(): Promise<IDBDatabase> {
  if (!_dbConn) {
    _dbConn = new Promise((resolve, reject) => {
      const req = indexedDB.open(_IDB_NAME, 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore(_IDB_STORE, { autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => { _dbConn = null; reject(req.error); };
    });
  }
  return _dbConn;
}
function dbSaveChunk(chunk: Blob): void {
  _getDB().then((db) => {
    db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).add(chunk);
  }).catch(() => {});
}
function dbLoadChunks(): Promise<Blob[]> {
  return _getDB().then(
    (db) => new Promise<Blob[]>((resolve) => {
      const req = db.transaction(_IDB_STORE, 'readonly').objectStore(_IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result as Blob[]);
      req.onerror   = () => resolve([]);
    }),
  ).catch(() => []);
}
function dbClearChunks(): void {
  _getDB().then((db) => {
    db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).clear();
  }).catch(() => {});
}
// ────────────────────────────────────────────────────────────────────────────

const TICKET_TYPES = [
  { value: 'BUG',             label: 'Bug Report'      },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'QUESTION',        label: 'Question'        },
];
const PRIORITIES = [
  { value: 'LOW',      label: 'Low'      },
  { value: 'MEDIUM',   label: 'Medium'   },
  { value: 'HIGH',     label: 'High'     },
  { value: 'CRITICAL', label: 'Critical' },
];

interface CapturedError {
  type: string; message: string; source?: string;
  line?: number; col?: number; timestamp: string;
}
interface CapturedNetworkError {
  method: string; url: string; status: number;
  statusText: string; timestamp: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  bugoutConfig: BugOutConfig;
  user:         UserConfig | undefined;
  size:         PanelSize;
  theme:        'dark' | 'light';
  tenantId?:    string;
  tenantName?:  string;
  appVersion?:  string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}

const ORB_COLORS: [string, string] = ['#fbbf24', '#fb923c'];

export default function BugTab({
  bugoutConfig,
  user,
  size: _size,
  theme,
  tenantId,
  tenantName,
  appVersion,
  environment,
}: Props) {
  const { apiKey, apiUrl } = bugoutConfig;

  // ── Theme ───────────────────────────────────────────────────────────────
  const isDark      = theme === 'dark';
  const bg          = isDark ? '#0f172a' : '#ffffff';
  const fg          = isDark ? '#e0e0e0' : '#333333';
  const borderColor = isDark ? '#1e293b' : '#ddd';
  const inputBg     = isDark ? '#16213e' : '#f5f5f5';

  // ── Form state ──────────────────────────────────────────────────────────
  const [ticketType,  setTicketType]  = useState('BUG');
  const [priority,    setPriority]    = useState('MEDIUM');
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [error,       setError]       = useState('');

  // ── Recording state ─────────────────────────────────────────────────────
  const [isRecording,       setIsRecording]       = useState(false);
  const [recordedBlob,      setRecordedBlob]      = useState<Blob | null>(null);
  const [previewUrl,        setPreviewUrl]        = useState<string | null>(null);
  const [transcript,        setTranscript]        = useState('');
  const [uploadFile,        setUploadFile]        = useState<File | null>(null);
  const [noAudioWarning,    setNoAudioWarning]    = useState(false);
  const [isRecovered,       setIsRecovered]       = useState(false);
  const [showRecoveryPill,  setShowRecoveryPill]  = useState(false);
  const [isMobile,          setIsMobile]          = useState(false);

  // Mini-controller drag position
  const [miniPos, setMiniPos] = useState<{ top: number; left: number }>(() => ({
    top: 24,
    left: typeof window !== 'undefined' ? Math.max(24, window.innerWidth - 280) : 24,
  }));

  const mediaRecorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const micStreamRef        = useRef<MediaStream | null>(null);
  const recognitionRef      = useRef<any>(null);
  const recoveredChunksRef  = useRef<Blob[]>([]);
  const beforeUnloadRef     = useRef<(() => void) | null>(null);
  const dragOffsetRef       = useRef<{ x: number; y: number } | null>(null);
  const consoleErrorsRef    = useRef<CapturedError[]>([]);
  const networkErrorsRef    = useRef<CapturedNetworkError[]>([]);
  const styleRef            = useRef<HTMLStyleElement | null>(null);

  // ── Videos Managed extension bridge ────────────────────────────────────
  // When the VM chrome extension is installed, recording lives in the
  // extension's offscreen document — survives a host-page refresh that
  // would kill an in-page getDisplayMedia stream. We probe on mount;
  // when absent (the default), the existing in-page recorder is used.
  const [extPresent, setExtPresent] = useState(false);
  const extRequestIdRef = useRef<string | null>(null);

  // ── Inject keyframes once ────────────────────────────────────────────────
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    if (!styleRef.current) {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes bom-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes bom-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(229,57,53,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(229,57,53,0);   }
          100% { box-shadow: 0 0 0 0   rgba(229,57,53,0);   }
        }
      `;
      document.head.appendChild(style);
      styleRef.current = style;
    }

    // ── Error capture ──
    const origConsoleError = console.error;
    console.error = (...args: any[]) => {
      consoleErrorsRef.current.push({
        type: 'console.error',
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
        timestamp: new Date().toISOString(),
      });
      if (consoleErrorsRef.current.length > 50) consoleErrorsRef.current.shift();
      origConsoleError.apply(console, args);
    };

    const handleWindowError = (ev: ErrorEvent) => {
      consoleErrorsRef.current.push({
        type: 'window.onerror', message: ev.message,
        source: ev.filename, line: ev.lineno, col: ev.colno,
        timestamp: new Date().toISOString(),
      });
      if (consoleErrorsRef.current.length > 50) consoleErrorsRef.current.shift();
    };
    window.addEventListener('error', handleWindowError);

    const handleUnhandledRejection = (ev: PromiseRejectionEvent) => {
      consoleErrorsRef.current.push({
        type: 'unhandledrejection',
        message: ev.reason?.message || String(ev.reason),
        timestamp: new Date().toISOString(),
      });
      if (consoleErrorsRef.current.length > 50) consoleErrorsRef.current.shift();
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const origFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url    = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const method = (args[1]?.method || 'GET').toUpperCase();
      try {
        const response = await origFetch.apply(window, args);
        if (!response.ok && !url.includes(apiUrl)) {
          networkErrorsRef.current.push({ method, url, status: response.status, statusText: response.statusText, timestamp: new Date().toISOString() });
          if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
        }
        return response;
      } catch (err: any) {
        if (!url.includes(apiUrl)) {
          networkErrorsRef.current.push({ method, url, status: 0, statusText: err.message || 'Network Error', timestamp: new Date().toISOString() });
          if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
        }
        throw err;
      }
    };

    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      (this as any)._bomMethod = method;
      (this as any)._bomUrl   = String(url);
      return origXHROpen.apply(this, [method, url, ...rest] as any);
    };
    XMLHttpRequest.prototype.send = function (...args: any[]) {
      this.addEventListener('loadend', () => {
        if (this.status >= 400 && !(this as any)._bomUrl?.includes(apiUrl)) {
          networkErrorsRef.current.push({ method: (this as any)._bomMethod || 'GET', url: (this as any)._bomUrl || '', status: this.status, statusText: this.statusText, timestamp: new Date().toISOString() });
          if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
        }
      });
      return (origXHRSend as any).apply(this, args);
    };

    return () => {
      if (styleRef.current) { document.head.removeChild(styleRef.current); styleRef.current = null; }
      console.error = origConsoleError;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origXHROpen;
      XMLHttpRequest.prototype.send = origXHRSend;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  // ── Recover any recording that was interrupted by a page refresh ─────────
  useEffect(() => {
    dbLoadChunks().then((chunks) => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: 'video/webm' });
      recoveredChunksRef.current = chunks;
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setIsRecovered(true);
      setShowRecoveryPill(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Videos Managed extension: mark widget presence + probe ──────────────
  // The marker is the origin guard the extension's content script checks
  // before bridging postMessage commands — without it, no random page can
  // drive the extension via window.postMessage.
  useEffect(() => {
    document.documentElement.setAttribute('data-bugout-widget', '1');

    let resolved = false;
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'VM_EXT_READY') {
        if (!resolved) { resolved = true; setExtPresent(true); }
      } else if (d.type === 'VM_BUGOUT_COMPLETE' && d.requestId === extRequestIdRef.current) {
        // Decode the data URL the extension sent us and feed it into the
        // existing upload pipeline by setting recordedBlob.
        fetch(d.dataUrl)
          .then((r) => r.blob())
          .then((blob) => {
            setRecordedBlob(blob);
            setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
            setIsRecording(false);
          })
          .catch((err) => {
            console.error('[Bug Out] Failed to decode extension recording:', err);
            setIsRecording(false);
          });
      } else if (d.type === 'VM_BUGOUT_ERROR') {
        console.warn('[Bug Out] Extension recording error:', d.error);
        setIsRecording(false);
      }
    };
    window.addEventListener('message', onMessage);

    // Probe. If the extension is loaded, content.js answers with VM_EXT_READY.
    const requestId = `probe-${Math.random().toString(36).slice(2)}`;
    window.postMessage({ type: 'VM_BUGOUT_PROBE', requestId }, '*');

    return () => {
      window.removeEventListener('message', onMessage);
      document.documentElement.removeAttribute('data-bugout-widget');
    };
  }, []);

  // ── Form helpers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setTitle(''); setDescription('');
    setTicketType('BUG'); setPriority('MEDIUM');
    setTranscript('');
    setRecordedBlob(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setUploadFile(null);
    setError(''); setSubmitted(false);
    setIsRecovered(false); setShowRecoveryPill(false); setNoAudioWarning(false);
    recoveredChunksRef.current = [];
    dbClearChunks();
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSubmitting(true); setError('');
    try {
      const ticketData: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        ticketType, priority,
        submittedBy:      user?.email || user?.name || 'Anonymous',
        currentPageUrl:   window.location.href,
        currentPageName:  document.title,
        browserInfo:      navigator.userAgent,
        screenWidth:      window.innerWidth,
        screenHeight:     window.innerHeight,
        transcript:       transcript || null,
        consoleErrors:    consoleErrorsRef.current.length > 0 ? JSON.stringify(consoleErrorsRef.current) : null,
        networkErrors:    networkErrorsRef.current.length > 0 ? JSON.stringify(networkErrorsRef.current) : null,
      };
      if (tenantId)    ticketData.tenantId           = tenantId;
      if (tenantName)  ticketData.tenantName         = tenantName;
      if (appVersion)  ticketData.applicationVersion = appVersion;
      if (environment) ticketData.environment        = environment;

      const res = await fetch(`${apiUrl}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BOM-API-Key': apiKey },
        body: JSON.stringify(ticketData),
      });
      if (!res.ok) throw new Error('Failed to submit ticket');
      const ticket = await res.json();

      const videoToUpload = recordedBlob || uploadFile;
      if (videoToUpload && ticket.id) {
        try {
          const fd = new FormData();
          fd.append('file', videoToUpload, 'recording.webm');
          const vRes = await fetch(`${apiUrl}/tickets/${ticket.id}/video`, {
            method: 'POST', headers: { 'X-BOM-API-Key': apiKey }, body: fd,
          });
          if (!vRes.ok) console.warn(`[Bug Out] Video upload failed (${vRes.status})`);
        } catch (ve) { console.warn('[Bug Out] Video upload error:', ve); }
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Recording helpers ────────────────────────────────────────────────────
  // Extension path: defer the MediaStream to the VM extension so a host-
  // page refresh cannot kill it. Speech transcription still runs on the
  // page since that's a page-level Web Speech API.
  const startRecordingViaExt = useCallback(() => {
    const requestId = `rec-${Math.random().toString(36).slice(2)}`;
    extRequestIdRef.current = requestId;
    window.postMessage({
      type: 'VM_BUGOUT_START',
      requestId,
      options: { quality: 1080, mic: true, systemAudio: true }
    }, '*');
    setIsRecording(true);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition    = new SpeechRecognition();
      recognition.continuous     = true;
      recognition.interimResults = true;
      recognition.lang           = 'en-US';
      let finalTranscript        = '';
      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
          else interim += event.results[i][0].transcript;
        }
        setTranscript(finalTranscript + interim);
      };
      recognition.onerror = () => {};
      recognition.start();
      recognitionRef.current = recognition;
    }
  }, []);

  const stopRecordingViaExt = useCallback(() => {
    if (extRequestIdRef.current) {
      window.postMessage({ type: 'VM_BUGOUT_STOP', requestId: extRequestIdRef.current }, '*');
    }
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    // setIsRecording(false) happens when VM_BUGOUT_COMPLETE arrives so
    // the user keeps seeing the "Recording" state until the blob lands.
  }, []);

  const startRecording = useCallback(async () => {
    if (extPresent) { startRecordingViaExt(); return; }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as MediaTrackConstraints,
        audio: { systemAudio: 'include' } as MediaTrackConstraints,
      });

      let micStream: MediaStream | null = null;
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); } catch { /* mic denied */ }
      micStreamRef.current = micStream;

      const hasMic         = (micStream?.getAudioTracks().length ?? 0) > 0;
      const hasSystemAudio = displayStream.getAudioTracks().length > 0;
      if (!hasMic && !hasSystemAudio) {
        displayStream.getTracks().forEach((t) => t.stop());
        micStream?.getTracks().forEach((t) => t.stop());
        setNoAudioWarning(true);
        return;
      }

      const audioTracks = hasMic ? micStream!.getAudioTracks() : displayStream.getAudioTracks();
      const stream      = new MediaStream([...displayStream.getVideoTracks(), ...audioTracks]);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      });
      chunksRef.current = [];
      if (recoveredChunksRef.current.length === 0) dbClearChunks();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) { chunksRef.current.push(e.data); dbSaveChunk(e.data); }
      };
      mediaRecorder.onstop = () => {
        const allChunks = [...recoveredChunksRef.current, ...chunksRef.current];
        const blob      = new Blob(allChunks, { type: 'video/webm' });
        recoveredChunksRef.current = [];
        dbClearChunks();
        setRecordedBlob(blob);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        setIsRecovered(false); setShowRecoveryPill(false);
        displayStream.getTracks().forEach((t) => t.stop());
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

      const handleBeforeUnload = () => { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.requestData(); };
      window.addEventListener('beforeunload', handleBeforeUnload);
      beforeUnloadRef.current = handleBeforeUnload;

      setIsRecording(true);

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition    = new SpeechRecognition();
        recognition.continuous     = true;
        recognition.interimResults = true;
        recognition.lang           = 'en-US';
        let finalTranscript        = '';
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
            else interim += event.results[i][0].transcript;
          }
          setTranscript(finalTranscript + interim);
        };
        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (err) { console.error('Failed to start recording:', err); }
  }, [extPresent, startRecordingViaExt]);

  const stopRecording = useCallback(() => {
    if (extPresent) { stopRecordingViaExt(); return; }
    if (beforeUnloadRef.current) { window.removeEventListener('beforeunload', beforeUnloadRef.current); beforeUnloadRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsRecording(false);
  }, [extPresent, stopRecordingViaExt]);

  // ── Shared button style ──────────────────────────────────────────────────
  const btnStyle: React.CSSProperties = {
    padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, transition: 'opacity 0.2s',
  };

  // ── Success state ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: fg, gap: 12 }}>
        <div style={{ fontSize: 48, color: '#22c55e' }}>&#10003;</div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: fg }}>Submitted!</h3>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>Thank you for your feedback.</p>
        <button
          onClick={resetForm}
          style={{ ...btnStyle, background: `linear-gradient(135deg, ${ORB_COLORS[0]}, ${ORB_COLORS[1]})`, color: '#fff', marginTop: 8 }}
        >
          Submit another
        </button>
      </div>
    );
  }

  // ── No-audio gate (overlay within the tab) ───────────────────────────────
  if (noAudioWarning) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: fg, textAlign: 'center', gap: 12 }}>
        <div style={{ fontSize: 40 }}>&#128263;</div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>No audio detected</h3>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
          In the screen picker, enable the <strong>"Also share system audio"</strong> toggle before clicking Share.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setNoAudioWarning(false); startRecording(); }} style={{ ...btnStyle, background: `linear-gradient(135deg, ${ORB_COLORS[0]}, ${ORB_COLORS[1]})`, color: '#fff' }}>Try again</button>
          <button onClick={() => setNoAudioWarning(false)} style={{ ...btnStyle, background: 'transparent', color: fg, border: `1px solid ${borderColor}` }}>Skip audio</button>
        </div>
      </div>
    );
  }

  // ── Main inline form ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        padding: '16px 16px 12px',
        background: bg, color: fg,
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        fontSize: 14,
        animation: 'bom-fade-in 0.18s ease-out',
        gap: 12,
      }}
    >
      {/* Recovery pill */}
      {showRecoveryPill && !isRecording && recordedBlob && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: isDark ? '#1c1208' : '#fff7e6', border: `1px solid rgba(251,146,60,0.45)`, fontSize: 12 }}>
          <span style={{ fontSize: 15 }}>&#127909;</span>
          <span style={{ fontWeight: 600, color: '#fb923c', flex: 1 }}>
            Recording recovered ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
          </span>
          <button onClick={() => { setShowRecoveryPill(false); startRecording(); }} style={{ ...btnStyle, padding: '4px 10px', fontSize: 11, background: `linear-gradient(135deg, ${ORB_COLORS[0]}, ${ORB_COLORS[1]})`, color: '#fff' }}>Continue</button>
          <button onClick={() => setShowRecoveryPill(false)} style={{ ...btnStyle, padding: '4px 10px', fontSize: 11, background: '#22c55e', color: '#fff' }}>Use it</button>
          <button onClick={() => { setShowRecoveryPill(false); setIsRecovered(false); setRecordedBlob(null); setPreviewUrl((p) => { if (p) URL.revokeObjectURL(p); return null; }); recoveredChunksRef.current = []; dbClearChunks(); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: 14, color: fg, padding: '2px 4px' }}>&#10005;</button>
        </div>
      )}

      {/* Type selector */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Type</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {TICKET_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTicketType(t.value)}
              style={{
                flex: 1, padding: '7px 4px', textAlign: 'center', borderRadius: 6,
                border: `2px solid ${ticketType === t.value ? ORB_COLORS[0] : borderColor}`,
                background: ticketType === t.value ? `${ORB_COLORS[0]}22` : 'transparent',
                cursor: 'pointer', fontSize: 11, fontWeight: ticketType === t.value ? 700 : 400,
                color: fg, transition: 'all 120ms',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${borderColor}`, background: inputBg, color: fg, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        >
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Title */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
          Title <span style={{ color: '#e53935' }}>*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary of the issue"
          maxLength={500}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${borderColor}`, background: inputBg, color: fg, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Description */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue in detail..."
          rows={3}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${borderColor}`, background: inputBg, color: fg, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
      </div>

      {/* Screen Recording */}
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Screen Recording</label>
        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="file" accept="video/*" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
            {uploadFile && <span style={{ fontSize: 11, opacity: 0.7 }}>{uploadFile.name}</span>}
          </div>
        ) : isRecording ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e53935', animation: 'bom-pulse 1.4s ease-out infinite' }} />
            <span style={{ fontSize: 12, color: '#e53935', fontWeight: 600 }}>Recording...</span>
            {extPresent && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'linear-gradient(90deg, #6366F1, #2DD4BF)', color: '#fff', letterSpacing: 0.3 }}>
                via Videos Managed
              </span>
            )}
            <button onClick={stopRecording} style={{ ...btnStyle, padding: '6px 14px', fontSize: 12, background: '#e53935', color: '#fff' }}>Stop Recording</button>
          </div>
        ) : recordedBlob ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>&#10003; Recording ready</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)</span>
            <button onClick={() => { setRecordedBlob(null); setPreviewUrl((p) => { if (p) URL.revokeObjectURL(p); return null; }); }} style={{ ...btnStyle, padding: '4px 10px', fontSize: 11, background: '#64748b', color: '#fff' }}>Remove</button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            style={{ ...btnStyle, background: `linear-gradient(135deg, ${ORB_COLORS[0]}, ${ORB_COLORS[1]})`, color: '#fff', fontSize: 13 }}
          >
            Start Recording
          </button>
        )}
      </div>

      {/* Mini recording controller — floats outside panel during recording */}
      {isRecording && (
        <div
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('[data-bom-stop]')) return;
            e.preventDefault();
            dragOffsetRef.current = { x: e.clientX - miniPos.left, y: e.clientY - miniPos.top };
            const onMove = (ev: MouseEvent) => {
              if (!dragOffsetRef.current) return;
              setMiniPos({ left: Math.max(0, Math.min(window.innerWidth - 240, ev.clientX - dragOffsetRef.current.x)), top: Math.max(0, Math.min(window.innerHeight - 50, ev.clientY - dragOffsetRef.current.y)) });
            };
            const onUp = () => { dragOffsetRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
          style={{ position: 'fixed', top: miniPos.top, left: miniPos.left, zIndex: 1000001, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: bg, color: fg, borderRadius: 999, border: `1px solid ${borderColor}`, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontFamily: 'inherit', fontSize: 13, userSelect: 'none', cursor: 'grab' }}
        >
          <span style={{ opacity: 0.45, fontSize: 14, pointerEvents: 'none' }}>&#9776;</span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#e53935', animation: 'bom-pulse 1.4s ease-out infinite', pointerEvents: 'none' }} />
          <span style={{ fontWeight: 600, pointerEvents: 'none' }}>Recording</span>
          {extPresent && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 999, background: 'linear-gradient(90deg, #6366F1, #2DD4BF)', color: '#fff', letterSpacing: 0.3, pointerEvents: 'none' }}>
              via Videos Managed
            </span>
          )}
          <div data-bom-stop="true" onClick={stopRecording} style={{ cursor: 'pointer', background: '#e53935', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>STOP</div>
        </div>
      )}

      {/* Video preview */}
      {previewUrl && (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Preview</label>
          <video src={previewUrl} controls style={{ width: '100%', borderRadius: 8, border: `1px solid ${borderColor}`, background: '#000', maxHeight: 160, display: 'block' }} />
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>Verify audio is audible before submitting.</div>
        </div>
      )}

      {/* Voice transcript */}
      {transcript && (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Voice Transcript</label>
          <div style={{ padding: '8px 12px', borderRadius: 6, background: inputBg, border: `1px solid ${borderColor}`, fontSize: 12, maxHeight: 70, overflowY: 'auto', opacity: 0.8 }}>{transcript}</div>
        </div>
      )}

      {/* Captured-error indicator */}
      {(consoleErrorsRef.current.length > 0 || networkErrorsRef.current.length > 0) && (
        <div style={{ padding: '6px 10px', borderRadius: 6, background: isDark ? '#2a1a1a' : '#fff3f0', border: `1px solid ${isDark ? '#4a2020' : '#ffccc7'}`, fontSize: 11, opacity: 0.85 }}>
          {consoleErrorsRef.current.length > 0  && <span>{consoleErrorsRef.current.length} console error(s) captured</span>}
          {consoleErrorsRef.current.length > 0 && networkErrorsRef.current.length > 0 && ' | '}
          {networkErrorsRef.current.length > 0  && <span>{networkErrorsRef.current.length} network error(s) captured</span>}
          <span style={{ display: 'block', marginTop: 2, opacity: 0.7 }}>Included automatically.</span>
        </div>
      )}

      {/* Error message */}
      {error && <div style={{ color: '#e53935', fontSize: 13 }}>{error}</div>}

      {/* Submit */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 4 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ ...btnStyle, background: submitting ? '#475569' : `linear-gradient(135deg, ${ORB_COLORS[0]}, ${ORB_COLORS[1]})`, color: '#fff', opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>

      {/* Footer hint */}
      <div style={{ fontSize: 10, opacity: 0.35, textAlign: 'center' }}>
        Page URL, browser info, and console errors are captured automatically.
      </div>
    </div>
  );
}
