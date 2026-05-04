import { useEffect, useState } from 'react';

/**
 * Estado en tiempo real del microservicio local (cola, trabajos, watchdog).
 */
export function usePrintServiceWebSocket(baseUrl) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    const b = String(baseUrl || '')
      .trim()
      .replace(/\/$/, '') || 'http://127.0.0.1:3049';
    const wsUrl = `${b.replace(/^http/i, 'ws')}/ws-print`;
    let ws;
    let alive = true;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setConnected(false);
      return undefined;
    }
    ws.onopen = () => {
      if (alive) setConnected(true);
    };
    ws.onclose = () => {
      if (alive) setConnected(false);
    };
    ws.onerror = () => {
      if (alive) setConnected(false);
    };
    ws.onmessage = (ev) => {
      try {
        setLastEvent(JSON.parse(ev.data));
      } catch {
        setLastEvent({ type: 'parse_error', raw: String(ev.data || '') });
      }
    };
    return () => {
      alive = false;
      try {
        ws.close();
      } catch {
        /* */
      }
    };
  }, [baseUrl]);

  return { connected, lastEvent };
}
