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
      toast.success('App lista. Menú → Impresora → USB app → Vincular (una vez).', { duration: 7000 });
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
          <div className="text-sm text-gray-800 max-w-xs">
            <p className="font-semibold text-gray-900 mb-1.5">Impresión en esta PC</p>
            <ul className="mb-2 list-disc pl-4 space-y-1 text-xs leading-snug">
              <li>
                <strong>USB app:</strong> Menú → Impresora → USB directo → Vincular. Sin .exe.
              </li>
              <li>
                <strong>Red / COM / cola Windows:</strong> complemento en este PC (
                <code className="text-[11px]">http://127.0.0.1:3049</code>
                ).
              </li>
            </ul>
            {!healthOk ? (
              <p className="mb-2 text-xs text-amber-900 leading-snug rounded bg-amber-50 px-2 py-1.5 border border-amber-200">
                El servicio en 3049 no responde (cerrado o no instalado).
                {installer ? (
                  <>
                    {' '}
                    <a
                      href={installer}
                      className="text-sky-700 font-medium underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => toast.dismiss(t.id)}
                    >
                      Descargar complemento
                    </a>
                    {' · '}
                  </>
                ) : null}
                <a
                  href={`${base}/health`}
                  className="text-sky-700 font-medium underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Probar /health
                </a>{' '}
                (debe verse <code className="text-[10px]">ok: true</code>).
              </p>
            ) : null}
            <details className="text-[11px] text-gray-600 mb-2">
              <summary className="cursor-pointer">Más ayuda</summary>
              <p className="mt-1 pl-1 space-y-1">
                Instaló el .exe pero sigue «rechazado»? En Windows: menú Inicio → carpeta Resto-FADEY → «impresión (inicio manual)»; luego
                vuelva a probar /health. Si no arranca: Programador de tareas → tarea «RestoFadeyPrintService» → Ejecutar. Vuelva a instalar
                con el .exe más reciente del sitio (corrige el arranque bajo Program Files).
              </p>
            </details>
            <div className="flex flex-wrap gap-2 mt-1 pt-2 border-t border-gray-200">
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
        { duration: 22000, id: 'pwa-print-hints-main' }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
