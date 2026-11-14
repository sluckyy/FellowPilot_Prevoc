'use client';
/**
 * Device-side event queue. Every event is written here first, then sent in batches. Survives
 * reloads and losing signal; the server ignores duplicates, so re-sending is always safe.
 */
import type { AppEvent } from '@/lib/core';
import type { Feedback } from '@/lib/data';

const KEY = 'mcq.events.v1';
const MAX_QUEUED = 5000;

function read(): AppEvent[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as AppEvent[]; } catch { return []; }
}
function write(xs: AppEvent[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(xs.slice(-MAX_QUEUED))); } catch { /* storage full or blocked */ }
}

export function enqueue(...events: AppEvent[]): void {
  if (!events.length) return;
  write([...read(), ...events]);
}

export function pendingCount(): number { return read().length; }

export interface FlushResult { sent: number; feedback: Feedback[]; offline: boolean }

let inFlight: Promise<FlushResult> | null = null;

/** Sends queued events. Accepted, duplicate and permanently rejected events leave the queue. */
export function flush(): Promise<FlushResult> {
  inFlight ??= doFlush().finally(() => { inFlight = null; });
  return inFlight;
}

async function doFlush(): Promise<FlushResult> {
  const out: FlushResult = { sent: 0, feedback: [], offline: false };
  for (let guard = 0; guard < 50; guard++) {
    const batch = read().slice(0, 100);
    if (!batch.length) break;
    let res: Response;
    try {
      res = await fetch('/api/events', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch }), keepalive: batch.length < 40,
      });
    } catch {
      out.offline = true;
      break;
    }
    if (res.status === 401 || res.status === 403) break;   // signed out: keep events for later
    if (!res.ok) break;                                     // server trouble: try again later
    const r = (await res.json()) as { accepted: string[]; duplicates: string[]; rejected: { event_id: string }[]; feedback: Feedback[] };
    const done = new Set([...r.accepted, ...r.duplicates, ...r.rejected.map((x) => x.event_id)]);
    write(read().filter((e) => !done.has(e.event_id)));
    out.sent += r.accepted.length;
    out.feedback.push(...r.feedback);
    if (r.rejected.length) console.warn('events rejected', r.rejected);
  }
  return out;
}

let started = false;
/** Background sending: when the device comes back online, every 30 seconds, and when hidden. */
export function startBackgroundSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
  setInterval(() => { if (navigator.onLine && pendingCount()) void flush(); }, 30_000);
  void flush();
}
