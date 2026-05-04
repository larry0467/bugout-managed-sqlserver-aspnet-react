import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { BugOutManagedConfig } from './types';

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
  } = props;

  // Stable random suffix for SVG gradient IDs — must be unique per mount.
  const orbIdRef = useRef<string>(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  );

  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
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

  // Mini-controller floating position. Defaults to top-right; user can
  // drag it anywhere. Persisted only for the lifetime of one recording.
  const [miniPos, setMiniPos] = useState<{ top: number; left: number }>(() => ({
    top: 24,
    left: typeof window !== 'undefined' ? Math.max(24, window.innerWidth - 280) : 24,
  }));
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const consoleErrorsRef = useRef<CapturedError[]>([]);
  const networkErrorsRef = useRef<CapturedNetworkError[]>([]);

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
        video: true,
        // systemAudio: 'include' pre-checks the "Also share system audio" toggle in Chrome 105+.
        audio: { systemAudio: 'include', suppressLocalAudioPlayback: false } as MediaTrackConstraints,
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

      // Warn if neither system audio nor mic is available.
      const hasMic = (micStream?.getAudioTracks().length ?? 0) > 0;
      const hasSystemAudio = displayStream.getAudioTracks().length > 0;
      if (!hasMic && !hasSystemAudio) {
        alert(
          'Your recording will have no audio.\n\n' +
          'To capture audio, re-start the recording and either:\n' +
          '  • Enable "Also share system audio" in the screen picker (Chrome), or\n' +
          '  • Allow microphone access when prompted.\n\n' +
          'The recording will continue without audio.'
        );
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
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
        displayStream.getTracks().forEach((t) => t.stop());
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
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
    setUploadFile(null);
    setError('');
    setSubmitted(false);
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

      // Upload video if recorded or file selected. Runs independently of ticket
      // creation so a storage failure doesn't un-submit an already-saved ticket.
      const videoToUpload = recordedBlob || uploadFile;
      if (videoToUpload && ticket.id) {
        try {
          const formData = new FormData();
          formData.append('file', videoToUpload, 'recording.webm');
          const videoRes = await fetch(`${apiUrl}/tickets/${ticket.id}/video`, {
            method: 'POST',
            headers: { 'X-BOM-API-Key': apiKey },
            body: formData,
          });
          if (!videoRes.ok) {
            console.warn(`[Bug Out] Video upload failed (${videoRes.status}) for ticket ${ticket.id}`);
          }
        } catch (videoErr) {
          console.warn('[Bug Out] Video upload network error:', videoErr);
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
      {/* Floating Orb — animated SVG, amber tone */}
      {(() => {
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
                    placeholder="Describe the issue in detail..."
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
                      {recordedBlob && (
                        <>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>
                            Recording captured ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
                          </span>
                          <div
                            onClick={() => setRecordedBlob(null)}
                            style={{ ...btnStyle, background: '#666', color: '#fff', padding: '4px 10px', fontSize: 12 }}
                          >
                            Remove
                          </div>
                        </>
                      )}
                      {isRecording && (
                        <span style={{ fontSize: 12, color: '#e53935', fontWeight: 600 }}>
                          Recording...
                        </span>
                      )}
                    </div>
                  )}
                </div>

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
          screen is being captured. Drag from the grip to reposition. */}
      {isRecording && (
        <div
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
          }}
        >
          {/* Drag grip — mousedown starts a drag; the document-level
              listeners (added on mousedown, removed on mouseup) keep
              the controller pinned to the cursor even when it leaves
              the small grip area. */}
          <div
            onMouseDown={(e) => {
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
            style={{
              cursor: 'grab',
              padding: '2px 4px',
              opacity: 0.6,
              fontSize: 16,
              lineHeight: 1,
            }}
            title="Drag to move"
          >
            &#x2630;
          </div>

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
            }}
          />
          <span style={{ fontWeight: 600 }}>Recording</span>

          {/* Stop button — terminates the MediaRecorder and reopens the
              big modal with the captured blob ready for review. */}
          <div
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
    </>
  );
};

export default BugOutManagedWidget;
