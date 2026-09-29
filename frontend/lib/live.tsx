"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { API_URL, getToken } from "./api";

export type LiveEvent = { kind: string; data: Record<string, unknown>; at: string };

const LiveCtx = createContext<{ events: LiveEvent[]; connected: boolean; version: number }>({
  events: [],
  connected: false,
  version: 0,
});

/** Subscribes once to the SSE stream; `version` bumps on data-changing events so pages can refetch. */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`${API_URL}/api/stream?token=${encodeURIComponent(token)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        const ev = { ...JSON.parse(m.data), at: new Date().toISOString() } as LiveEvent;
        setEvents((prev) => [ev, ...prev].slice(0, 50));
        setVersion((v) => v + 1);
      } catch {}
    };
    return () => es.close();
  }, []);

  return <LiveCtx.Provider value={{ events, connected, version }}>{children}</LiveCtx.Provider>;
}

export const useLive = () => useContext(LiveCtx);
