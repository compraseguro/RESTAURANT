import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function useSocket(event, callback) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    const s = getSocket();
    const handler = (...args) => savedCallback.current(...args);
    s.on(event, handler);
    return () => s.off(event, handler);
  }, [event]);

  return getSocket();
}

export function useSocketEmit() {
  const emit = useCallback((event, data) => {
    getSocket().emit(event, data);
  }, []);
  return emit;
}
