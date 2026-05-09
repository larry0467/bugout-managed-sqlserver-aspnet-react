import { useState, useEffect, useCallback, useRef } from 'react';
import type { CommsConfig, CommsMessage, CommsThread, UserConfig } from '../types';

const POLL_MS = 30_000;

function buildHeaders(apiKey: string) {
  return { 'Content-Type': 'application/json', 'X-Comms-Api-Key': apiKey };
}

/** Groups flat MessageDto array from Comms into client-side threads. */
function groupIntoThreads(msgs: CommsMessage[]): CommsThread[] {
  const map = new Map<string, CommsThread>();
  for (const m of msgs) {
    if (!map.has(m.threadId)) {
      map.set(m.threadId, {
        id: m.threadId,
        subject: m.entityTitle ?? m.entityRef ?? `Thread ${m.threadId.slice(0, 8)}`,
        lastMessageAt: m.sentAt,
        entityRef: m.entityRef,
        entityTitle: m.entityTitle,
        messages: [],
        unreadCount: 0,
      });
    }
    const t = map.get(m.threadId)!;
    t.messages.push(m);
    if (m.direction === 'inbound') t.unreadCount++;
    if (m.sentAt > t.lastMessageAt) t.lastMessageAt = m.sentAt;
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export function useCommsMessages(
  config: CommsConfig,
  user: UserConfig | undefined,
  entityId: string | undefined,
) {
  const [threads, setThreads] = useState<CommsThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const params = new URLSearchParams({ workspaceId: config.workspaceId, take: '50' });
      if (entityId) params.set('entityId', entityId);
      const res = await fetch(`${config.apiUrl}/v1/messages?${params}`, {
        headers: buildHeaders(config.apiKey),
      });
      if (!res.ok) return;
      const data: CommsMessage[] = await res.json();
      const grouped = groupIntoThreads(data);
      setThreads(grouped);
      setUnreadCount(grouped.reduce((n, t) => n + t.unreadCount, 0));
      setSelectedThreadId(prev => prev ?? (grouped[0]?.id ?? null));
      setError(null);
    } catch {
      setError('Could not load messages.');
    }
  }, [config.apiUrl, config.apiKey, config.workspaceId, entityId]);

  const sendReply = useCallback(
    async (body: string, threadId?: string | null) => {
      const tid = threadId ?? selectedThreadId;
      if (!body.trim()) return;
      setSending(true);
      try {
        const payload = {
          workspaceId: config.workspaceId,
          senderUserId: config.senderUserId,
          channel: 'email',
          to: user?.email ?? 'support@managedplatform.com',
          body,
          entityId,
          visibility: 'shared',
        };
        const res = await fetch(`${config.apiUrl}/v1/messages/send`, {
          method: 'POST',
          headers: buildHeaders(config.apiKey),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const msg: CommsMessage = await res.json();
          setThreads(prev =>
            prev.map(t =>
              t.id === (tid ?? msg.threadId)
                ? { ...t, messages: [...t.messages, msg], lastMessageAt: msg.sentAt }
                : t,
            ),
          );
        }
      } catch {
        /* silent — UX shows sending=false */
      } finally {
        setSending(false);
      }
    },
    [selectedThreadId, config, user, entityId],
  );

  useEffect(() => {
    setLoading(true);
    fetch_().finally(() => setLoading(false));
    pollRef.current = setInterval(fetch_, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetch_]);

  const selectedThread = threads.find(t => t.id === selectedThreadId) ?? null;

  return {
    threads,
    selectedThread,
    selectedThreadId,
    setSelectedThreadId,
    unreadCount,
    loading,
    sending,
    error,
    sendReply,
    refetch: fetch_,
  };
}
