import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

export function useConfigHub({ enabled = true } = {}) {
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await api.get('/admin-modules/config/hub');
      setHub(data);
    } catch (_) {
      setHub(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { hub, loading, reload };
}
