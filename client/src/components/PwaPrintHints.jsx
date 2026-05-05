import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { isStandaloneDisplayMode } from '../utils/pwaDetect';

const SESSION_ONCE_KEY = 'resto_fadey_pwa_print_tip_v4_once';
const SNOOZE_UNTIL_KEY = 'resto_fadey_pwa_print_snooze_until';

function getSnoozeUntil() {
  try {
    const n = Number(localStorage.getItem(SNOOZE_UNTIL_KEY) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setSnoozeDays(days) {
  try {
    const ms = Math.min(365, Math.max(1, Number(days) || 30)) * 86400000;
    localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + ms));
  } catch {
    /* */
  }
}

const STAFF_ROLES = new Set(['admin', 'master_admin', 'cajero', 'cocina', 'bar', 'delivery', 'mozo']);

/**
 * Recordatorio breve: la impresión sale del servidor Node (panel Impresoras).
 */
export default function PwaPrintHints() {
  const { user } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    const onInstalled = () => {
      toast.success('App instalada. Configure impresoras en el menú del sistema (servidor Windows).', { duration: 6000 });
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  useEffect(() => {
    if (!user || user.type === 'customer' || !STAFF_ROLES.has(user.role)) return;
    if (!isStandaloneDisplayMode()) return;

    const until = getSnoozeUntil();
    if (until && Date.now() < until) return;

    try {
      if (sessionStorage.getItem(SESSION_ONCE_KEY)) return;
      sessionStorage.setItem(SESSION_ONCE_KEY, '1');
    } catch {
      if (ranRef.current) return;
      ranRef.current = true;
    }

    toast(
      (t) => (
        <div className="text-sm text-gray-800 max-w-xs">
          <p className="font-semibold text-gray-900 mb-1">Impresión</p>
          <p className="text-xs leading-snug mb-2">
            Las térmicas se configuran en <strong>Impresora</strong> y se imprimen desde el <strong>servidor</strong> (mismo equipo que ejecuta la API en
            producción local).
          </p>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              className="text-xs font-medium px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800"
              onClick={() => {
                setSnoozeDays(30);
                toast.dismiss(t.id);
                toast.success('Aviso silenciado 30 días.', { duration: 4000 });
              }}
            >
              No mostrar 30 días
            </button>
            <button type="button" className="text-xs text-gray-600 underline" onClick={() => toast.dismiss(t.id)}>
              Cerrar
            </button>
          </div>
        </div>
      ),
      { duration: 18000, id: 'pwa-print-hints-main' }
    );
  }, [user]);

  return null;
}
