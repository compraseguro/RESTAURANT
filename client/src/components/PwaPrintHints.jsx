import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { isStandaloneDisplayMode } from '../utils/pwaDetect';
import { getPrintInstallerDownloadUrl, getPrintServiceBaseUrl } from '../utils/localPrinterStorage';

const SESSION_TIP_KEY = 'resto_fadey_pwa_print_tip_v2';

const STAFF_ROLES = new Set(['admin', 'master_admin', 'cajero', 'cocina', 'bar', 'delivery', 'mozo']);

/**
 * Tras instalar la PWA (⋮ → Instalar aplicación): orienta sobre USB vía navegador y complemento para IP/Windows.
 */
export default function PwaPrintHints() {
  const { user } = useAuth();

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
    try {
      if (sessionStorage.getItem(SESSION_TIP_KEY)) return;
      sessionStorage.setItem(SESSION_TIP_KEY, '1');
    } catch {
      return;
    }

    const installer = getPrintInstallerDownloadUrl();
    const base = getPrintServiceBaseUrl().replace(/\/$/, '');

    void (async () => {
      let healthOk = false;
      try {
        const r = await fetch(`${base}/health`, { method: 'GET' });
        healthOk = r.ok;
      } catch {
        healthOk = false;
      }

      toast(
        (t) => (
          <div className="text-sm text-gray-800 max-w-sm">
            <p className="font-semibold text-gray-900 mb-1">App instalada en este equipo</p>
            <p className="mb-2 leading-snug">
              <strong>USB:</strong> Menú → Impresora → «USB desde el navegador / app» → <strong>Vincular</strong> (una vez). Los tickets
              salen solos, sin instalar programas extra.
            </p>
            {!healthOk && installer ? (
              <p className="mb-0 leading-snug">
                <strong>Red / IP / Windows:</strong>{' '}
                <a
                  href={installer}
                  className="text-sky-600 font-medium underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => toast.dismiss(t.id)}
                >
                  Descargar complemento de impresión
                </a>
                .
              </p>
            ) : !healthOk ? (
              <p className="text-xs text-amber-900 leading-snug">
                Si usa impresora por red o cola Windows, instale en este PC el complemento que le envíe su proveedor (doble clic, sin consola).
              </p>
            ) : null}
          </div>
        ),
        { duration: 18000 }
      );
    })();
  }, [user]);

  return null;
}
