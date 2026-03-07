import { useEffect, useRef } from 'react';

export function useActiveInterval(callback, delayMs = 10000, { runOnVisible = true } = {}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!Number.isFinite(delayMs) || delayMs <= 0) return undefined;

    const runIfActive = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      callbackRef.current();
    };

    const intervalId = setInterval(runIfActive, delayMs);

    const handleVisibility = () => {
      if (!runOnVisible) return;
      if (typeof document !== 'undefined' && !document.hidden) {
        callbackRef.current();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [delayMs, runOnVisible]);
}
