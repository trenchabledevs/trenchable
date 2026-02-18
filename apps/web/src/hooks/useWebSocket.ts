import { useEffect, useRef, useState, useCallback } from 'react';
import type { NewPairEvent } from '@trenchable/shared';

export function useWebSocket() {
  const [pairs, setPairs] = useState<NewPairEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/monitor`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 5 seconds
      setTimeout(connect, 5000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const data: NewPairEvent = JSON.parse(event.data);
        setPairs(prev => [data, ...prev].slice(0, 100)); // Keep last 100
      } catch {
        // Ignore parse errors
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const clearPairs = useCallback(() => setPairs([]), []);

  return { pairs, connected, clearPairs };
}
