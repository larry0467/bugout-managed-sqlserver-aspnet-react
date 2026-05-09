import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CommsConfig, CommsMessage, CommsThread, PanelSize, UserConfig } from '../types';
import { useCommsMessages } from '../hooks/useCommsMessages';

// ---------------------------------------------------------------------------
// MessagesTab — 3-size chat panel
//
// mini      — 380×360 stacked: message list → reply bar
// large     — 500×560 stacked with richer bubbles
// fullscreen — split: left thread sidebar | right thread + reply
// ---------------------------------------------------------------------------

interface Props {
  commsConfig: CommsConfig;
  user: UserConfig | undefined;
  entityId: string | undefined;
  size: PanelSize;
  theme: 'dark' | 'light';
  onUnreadChange: (n: number) => void;
  accentColor: string;
}

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
function MessageBubble({
  msg,
  isDark,
  compact,
  accentColor,
}: {
  msg: CommsMessage;
  isDark: boolean;
  compact: boolean;
  accentColor: string;
}) {
  const isOut = msg.direction === 'outbound';
  // Outbound bubbles use the accent color; inbound stay neutral
  const bubbleBg = isOut
    ? accentColor
    : isDark ? '#1e293b' : '#f1f5f9';
  const bubbleColor = isOut ? '#fff' : isDark ? '#e2e8f0' : '#1e293b';
  const metaColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOut ? 'flex-end' : 'flex-start',
        marginBottom: compact ? 8 : 12,
      }}
    >
      {!compact && (
        <span
          style={{
            fontSize: 11,
            color: metaColor,
            marginBottom: 2,
            paddingLeft: isOut ? 0 : 2,
            paddingRight: isOut ? 2 : 0,
            fontFamily: FONT,
          }}
        >
          {isOut ? 'You' : msg.senderName} · {fmtTime(msg.sentAt)}
        </span>
      )}
      <div
        style={{
          maxWidth: '80%',
          background: bubbleBg,
          color: bubbleColor,
          borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: compact ? '6px 10px' : '8px 12px',
          fontSize: compact ? 12 : 13,
          lineHeight: 1.5,
          fontFamily: FONT,
          wordBreak: 'break-word',
        }}
      >
        {msg.body}
      </div>
      {compact && (
        <span style={{ fontSize: 10, color: metaColor, marginTop: 2, fontFamily: FONT }}>
          {fmtTime(msg.sentAt)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThreadList — sidebar for fullscreen mode
// ---------------------------------------------------------------------------
function ThreadList({
  threads,
  selectedId,
  onSelect,
  isDark,
  accentColor,
}: {
  threads: CommsThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isDark: boolean;
  accentColor: string;
}) {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isDark ? '#475569' : '#94a3b8',
          fontFamily: FONT,
        }}
      >
        Conversations
      </div>
      {threads.length === 0 && (
        <div
          style={{
            padding: '12px',
            fontSize: 12,
            color: isDark ? '#475569' : '#94a3b8',
            fontFamily: FONT,
          }}
        >
          No conversations yet.
        </div>
      )}
      {threads.map(t => {
        const isSelected = t.id === selectedId;
        const last = t.messages[t.messages.length - 1];
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              padding: '10px 12px',
              background: isSelected
                ? isDark ? '#1e293b' : '#f0f4ff'
                : 'transparent',
              border: 'none',
              borderLeft: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: FONT,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: t.unreadCount > 0 ? 700 : 500,
                  color: isDark ? '#e2e8f0' : '#1e293b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 130,
                }}
              >
                {t.subject}
              </span>
              {t.unreadCount > 0 && (
                <span
                  style={{
                    background: accentColor,
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 6px',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {t.unreadCount}
                </span>
              )}
            </div>
            {last && (
              <span
                style={{
                  fontSize: 11,
                  color: isDark ? '#475569' : '#94a3b8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {last.body.slice(0, 40)}{last.body.length > 40 ? '…' : ''}
              </span>
            )}
            <span style={{ fontSize: 10, color: isDark ? '#334155' : '#cbd5e1' }}>
              {fmtDate(t.lastMessageAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// useSpeechRecognition — returns mic state and toggle function
// ---------------------------------------------------------------------------
type SpeechStatus = 'idle' | 'listening' | 'unsupported';

function useSpeechRecognition(onTranscript: (t: string) => void) {
  const [status, setStatus] = useState<SpeechStatus>(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    return SR ? 'idle' : 'unsupported';
  });
  const recogRef = useRef<any>(null);

  function toggle() {
    if (status === 'unsupported') return;

    if (status === 'listening') {
      recogRef.current?.stop();
      return;
    }

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';

    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((res: any) => res[0].transcript)
        .join('');
      onTranscript(transcript);
    };

    r.onstart = () => setStatus('listening');
    r.onend   = () => setStatus('idle');
    r.onerror = () => setStatus('idle');

    recogRef.current = r;
    r.start();
  }

  return { status, toggle };
}

// ---------------------------------------------------------------------------
// MicButton
// ---------------------------------------------------------------------------
function MicButton({ status, onToggle, multiline }: { status: SpeechStatus; onToggle: () => void; multiline: boolean }) {
  const isListening   = status === 'listening';
  const isUnsupported = status === 'unsupported';

  const btnStyle: React.CSSProperties = {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    borderRadius: 8,
    padding: multiline ? '6px' : '5px',
    cursor: isUnsupported ? 'not-allowed' : 'pointer',
    opacity: isUnsupported ? 0.35 : 1,
    fontSize: 18,
    lineHeight: 1,
    alignSelf: multiline ? 'flex-end' : 'center',
    color: isListening ? '#ef4444' : '#64748b',
    transition: 'color 150ms',
    animation: isListening ? 'bugout-mic-pulse 900ms ease-in-out infinite alternate' : 'none',
    outline: 'none',
  };

  return (
    <>
      {/* Keyframe injected once into the document head */}
      <style>{`
        @keyframes bugout-mic-pulse {
          from { opacity: 1; }
          to   { opacity: 0.35; }
        }
      `}</style>
      <button
        type="button"
        onClick={onToggle}
        disabled={isUnsupported}
        title={
          isUnsupported
            ? 'Voice input not supported in this browser'
            : isListening
            ? 'Stop recording'
            : 'Speak to fill the reply box'
        }
        style={btnStyle}
        aria-label={isListening ? 'Stop recording' : 'Start voice input'}
      >
        🎤
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// ReplyBar
// ---------------------------------------------------------------------------
function ReplyBar({
  onSend,
  sending,
  isDark,
  multiline,
  accentColor,
}: {
  onSend: (text: string) => void;
  sending: boolean;
  isDark: boolean;
  multiline: boolean;
  accentColor: string;
}) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { status: micStatus, toggle: toggleMic } = useSpeechRecognition((transcript) => {
    setText(prev => (prev ? prev + ' ' + transcript : transcript));
    // Focus the textarea so the user can see the appended text
    taRef.current?.focus();
  });

  function submit() {
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText('');
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const border = isDark ? '#1e293b' : '#e2e8f0';
  const inputBg = isDark ? '#0f172a' : '#f8fafc';
  const inputColor = isDark ? '#e2e8f0' : '#1e293b';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '10px 12px',
        borderTop: `1px solid ${border}`,
        background: isDark ? '#0f172a' : '#fff',
      }}
    >
      <MicButton status={micStatus} onToggle={toggleMic} multiline={multiline} />
      <textarea
        ref={taRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        rows={multiline ? 3 : 1}
        placeholder="Reply… (Enter to send, Shift+Enter for newline)"
        style={{
          flex: 1,
          resize: 'none',
          background: inputBg,
          border: `1px solid ${border}`,
          borderRadius: 10,
          padding: '8px 10px',
          fontSize: 13,
          color: inputColor,
          fontFamily: FONT,
          outline: 'none',
          lineHeight: 1.5,
        }}
        onFocus={e => (e.target.style.borderColor = accentColor)}
        onBlur={e => (e.target.style.borderColor = border)}
      />
      <button
        onClick={submit}
        disabled={sending || !text.trim()}
        style={{
          flexShrink: 0,
          background: accentColor,
          border: 'none',
          borderRadius: 10,
          padding: multiline ? '8px 14px' : '7px 12px',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: sending || !text.trim() ? 'not-allowed' : 'pointer',
          opacity: sending || !text.trim() ? 0.5 : 1,
          fontFamily: FONT,
          transition: 'opacity 150ms',
          alignSelf: multiline ? 'flex-end' : 'center',
        }}
      >
        {sending ? '…' : '↑ Send'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageThread — scrollable list
// ---------------------------------------------------------------------------
function MessageThread({
  messages,
  loading,
  isDark,
  compact,
  accentColor,
}: {
  messages: CommsMessage[];
  loading: boolean;
  isDark: boolean;
  compact: boolean;
  accentColor: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDark ? '#475569' : '#94a3b8',
          fontSize: 13,
          fontFamily: FONT,
        }}
      >
        Loading…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: isDark ? '#475569' : '#94a3b8',
          fontSize: 13,
          fontFamily: FONT,
        }}
      >
        <span style={{ fontSize: 28 }}>💬</span>
        <span>No messages yet.</span>
        <span style={{ fontSize: 11 }}>Send a reply to start the conversation.</span>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: compact ? '8px 10px' : '12px 14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map(m => (
        <MessageBubble key={m.id} msg={m} isDark={isDark} compact={compact} accentColor={accentColor} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessagesTab — main export
// ---------------------------------------------------------------------------
export default function MessagesTab({ commsConfig, user, entityId, size, theme, onUnreadChange, accentColor }: Props) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#0f172a' : '#ffffff';

  const {
    threads,
    selectedThread,
    selectedThreadId,
    setSelectedThreadId,
    unreadCount,
    loading,
    sending,
    error,
    sendReply,
  } = useCommsMessages(commsConfig, user, entityId);

  useEffect(() => { onUnreadChange(unreadCount); }, [unreadCount, onUnreadChange]);

  const compact  = size === 'mini';
  const fullscr  = size === 'fullscreen';
  const messages = selectedThread?.messages ?? [];

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: bg }}>
      {/* Fullscreen sidebar */}
      {fullscr && (
        <ThreadList
          threads={threads}
          selectedId={selectedThreadId}
          onSelect={setSelectedThreadId}
          isDark={isDark}
          accentColor={accentColor}
        />
      )}

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Thread subject bar (large + fullscreen) */}
        {!compact && selectedThread && (
          <div
            style={{
              padding: '8px 14px',
              borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? '#94a3b8' : '#64748b',
              fontFamily: FONT,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: accentColor }}>●</span>
            {selectedThread.subject}
          </div>
        )}

        {/* Mini: thread picker strip */}
        {compact && threads.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '6px 10px',
              overflowX: 'auto',
              borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
            }}
          >
            {threads.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedThreadId(t.id)}
                style={{
                  flexShrink: 0,
                  padding: '3px 8px',
                  borderRadius: 8,
                  border: `1px solid ${t.id === selectedThreadId ? accentColor : isDark ? '#1e293b' : '#e2e8f0'}`,
                  background: t.id === selectedThreadId ? accentColor : 'transparent',
                  color: t.id === selectedThreadId ? '#fff' : isDark ? '#94a3b8' : '#64748b',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  whiteSpace: 'nowrap',
                }}
              >
                {t.subject.slice(0, 20)}{t.subject.length > 20 ? '…' : ''}
                {t.unreadCount > 0 && ` (${t.unreadCount})`}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11,
              color: '#f87171',
              fontFamily: FONT,
              background: isDark ? '#1c1117' : '#fff1f2',
            }}
          >
            {error}
          </div>
        )}

        <MessageThread
          messages={messages}
          loading={loading && messages.length === 0}
          isDark={isDark}
          compact={compact}
          accentColor={accentColor}
        />

        <ReplyBar
          onSend={text => sendReply(text, selectedThreadId)}
          sending={sending}
          isDark={isDark}
          multiline={!compact}
          accentColor={accentColor}
        />
      </div>
    </div>
  );
}
