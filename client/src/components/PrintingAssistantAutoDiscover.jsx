import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ensureLocalPrintingAssistantDiscovered } from '../utils/api';

/**
 * Tras iniciar sesión (personal), intenta detectar el asistente Electron en la PC
 * y guardar su URL para este dominio. Mismo instalador para todos los repos/clientes Vercel.
 */
export default function PrintingAssistantAutoDiscover() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.type !== 'staff') return undefined;

    let cancelled = false;
    const run = async () => {
      await ensureLocalPrintingAssistantDiscovered();
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 2200));
      if (cancelled) return;
      await ensureLocalPrintingAssistantDiscovered();
    };

    const t = window.setTimeout(() => {
      void run();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [user?.id, user?.type]);

  return null;
}
