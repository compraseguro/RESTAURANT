import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { isStandaloneDisplayMode } from '../utils/pwaDetect';
import { getPrintInstallerDownloadUrl, getPrintServiceBaseUrl } from '../utils/localPrinterStorage';

/** Evita repetir el mismo toast en la misma pestaña (React Strict Mode). */
const SESSION_ONCE_KEY = 'resto_fadey_pwa_print_tip_v3_once';

/**
 * El usuario puede silenciar el recordatorio; se guarda en localStorage (la PWA borra session al cerrar).
 * Así no entra en bucle «instalé y sigue saliendo».
 */
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
 * Tras instalar la PWA: orienta sobre USB y complemento para IP/Windows.
 * El toast no debe reaparecer en cada apertura si el usuario ya lo descartó (localStorage).
 */
export default function PwaPrintHints() {
  const { user } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    const onInstalled = () => {
      toast.success(
        'Aplicación instalada. Abra Menú → Impresora, elija «USB desde el navegador / app» y pulse Vincular una vez con la térmica conectada.',
        { duration: 10000 }
      );
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

    const installer = getPrintInstallerDownloadUrl();
    const base = getPrintServiceBaseUrl().replace(/\/$/, '');

    let cancelled = false;
    void (async () => {
      let healthOk = false;
      try {
        const r = await fetch(`${base}/health`, { method: 'GET', cache: 'no-store' });
        healthOk = r.ok;
      } catch {
        healthOk = false;
      }
      if (cancelled) return;

      toast(
        (t) => (
          <div className="text-sm text-gray-800 max-w-sm">
            <p className="font-semibold text-gray-900 mb-1">App instalada en este equipo</p>
            <p className="mb-2 leading-snug">
              <strong>Solo USB directo:</strong> Menú → Impresora → «USB desde el navegador / app» → <strong>Vincular</strong> (una vez). No
              hace falta el complemento Windows.
            </p>
            {!healthOk && installer ? (
              <p className="mb-2 leading-snug">
                <strong>Red / IP / cola Windows:</strong> hace falta el complemento en <strong>este mismo PC</strong>.{' '}
                <a
                  href={installer}
                  className="text-sky-600 font-medium underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => toast.dismiss(t.id)}
                >
                  Descargar complemento
                </a>
                . Si ya lo instaló y sigue fallando, el servicio no está activo: abra{' '}
                <a
                  href={`${base}/health`}
                  className="text-sky-600 font-medium underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  comprobar servicio (3049)
                </a>
                .
              </p>
            ) : !healthOk ? (
              <p className="mb-2 text-xs text-amber-900 leading-snug">
                Red o Windows: instale el complemento en este PC. Si ya lo hizo y no imprime, revise firewall o reinicie sesión en Windows.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-200">
              <button
                type="button"
                className="text-xs font-medium px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800"
                onClick={() => {
                  setSnoozeDays(30);
                  toast.dismiss(t.id);
                  toast.success('Listo. Este aviso no volverá durante 30 días.', { duration: 4000 });
                }}
              >
                Entendido — no volver a mostrar 30 días
              </button>
              <button
                type="button"
                className="text-xs text-gray-600 underline"
                onClick={() => toast.dismiss(t.id)}
              >
                Cerrar
              </button>
            </div>
          </div>
        ),
        { duration: 25000, id: 'pwa-print-hints-main' }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
