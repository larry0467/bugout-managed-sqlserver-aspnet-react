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
    orbColors = ['#4caf50', '#ff9800'],
    // Tenant context
    tenantId,
    tenantName,
    databaseName,
    appVersion,
    environment,
  } = props;

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const consoleErrorsRef = useRef<CapturedError[]>([]);
  const networkErrorsRef = useRef<CapturedNetworkError[]>([]);

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    // Inject keyframes style
    if (!styleRef.current) {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes bom-orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes bom-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
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
        networkErrorsRef.current.push({
          method,
          url,
          status: 0,
          statusText: err.message || 'Network Error',
          timestamp: new Date().toISOString(),
        });
        if (networkErrorsRef.current.length > 30) networkErrorsRef.current.shift();
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
      return origXHRSend.apply(this, args);
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
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
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
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

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

      // Upload video if recorded or file selected
      const videoToUpload = recordedBlob || uploadFile;
      if (videoToUpload && ticket.id) {
        const formData = new FormData();
        formData.append('file', videoToUpload, 'recording.webm');
        await fetch(`${apiUrl}/tickets/${ticket.id}/video`, {
          method: 'POST',
          body: formData,
        });
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
      {/* Floating Orb */}
      <div
        onClick={() => {
          if (!isOpen) resetForm();
          setIsOpen(!isOpen);
        }}
        style={{
          position: 'fixed',
          ...posStyle,
          width: orbSize * 2,
          height: orbSize * 2,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${orbColors[0]}, ${orbColors[1]})`,
          cursor: 'pointer',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 20px ${orbColors[0]}66`,
          animation: 'bom-orb-pulse 3s ease-in-out infinite',
        }}
        title="Report a bug or request a feature"
      >
        <svg width={orbSize} height={orbSize} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>

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
    </>
  );
};

export default BugOutManagedWidget;
