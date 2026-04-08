import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getSocketOrigin } from '../utils/api';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(getSocketOrigin(), {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socket.on('connect', () => {
      try {
        const token = localStorage.getItem('token');
        if (token) socket.emit('join-staff', { token });
      } catch (_) {
        /* noop */
      }
    });
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
