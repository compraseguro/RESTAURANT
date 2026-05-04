import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdInfo, MdRefresh, MdRadar, MdSearch } from 'react-icons/md';
import {
  getPrintServiceBaseUrl,
  setPrintServiceBaseUrl,
  getPrintInstallerDownloadUrl,
  getStationPrinterConfig,
  setStationPrinterConfig,
  isThermalLanIp,
  isUsbComPort,
  isUsbUnixDevice,
  localPrintServiceUnreachableHelp,
  setPrinterStorageScope,
} from '../utils/localPrinterStorage';
import { sendEscPosToStation } from '../utils/cajaThermalPrint';
import { pairBrowserUsbPrinter, isWebUsbSerialSupported } from '../utils/browserUsbPrint';
import { isStandaloneDisplayMode } from '../utils/pwaDetect';
import { usePrintServiceWebSocket } from '../hooks/usePrintServiceWebSocket';
import {
  fetchDiscoverAll,
  postWatchdogTargets,
  postWatchdogProbeNow,
  postProbeLan,
} from '../utils/printServiceApi';
import { useAuth } from '../context/AuthContext';

const TITLES = {
  cocina: 'Impresora de cocina',
  bar: 'Impresora de bar',
  caja: 'Impresora de caja (precuentas)',
  delivery: 'Impresora de delivery (reportes)',
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

/**
 * Configuración local (navegador) por estación + URL del microservicio de impresión en este PC.
 * Red + microservicio, USB por COM/Windows con microservicio, o USB directo con Web Serial (app instalada).
 */
function buildWatchdogTarget(stationId, form) {
  const conn = form.connection || 'lan';
  const sid = String(stationId || '').toLowerCase();
  if (conn === 'lan' && String(form.ip || '').trim()) {
    return { id: sid, kind: 'lan', ip: String(form.ip).trim(), port: Number(form.port) || 9100 };
  }
  if (conn === 'usb_serial' && String(form.com_port || '').trim()) {
    return { id: sid, kind: 'usb_serial', com_port: String(form.com_port).trim() };
  }
  if (conn === 'usb_windows' && String(form.windows_printer || '').trim()) {
    return { id: sid, kind: 'usb_windows', name: String(form.windows_printer).trim() };
  }
  return null;
}

export default function StationPrinterCard({ station, userRole, hideHeading = false, embedded = false }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [serviceUrl, setServiceUrl] = useState('http://127.0.0.1:3049');
  const [windowsPrinters, setWindowsPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [discoveringLan, setDiscoveringLan] = useState(false);
  const [lanCandidates, setLanCandidates] = useState([]);
  const [serialPortsList, setSerialPortsList] = useState([]);
  const [scanningSerialPorts, setScanningSerialPorts] = useState(false);
  const [proMergedList, setProMergedList] = useState([]);
  const [proDiscoverAllLoading, setProDiscoverAllLoading] = useState(false);
  const [form, setForm] = useState({
    connection: 'lan',
    ip: '',
    port: 9100,
    com_port: '',
    baud_rate: 9600,
    windows_printer: '',
    browser_usb_paired: 0,
    copies: 1,
    auto_print: 1,
    width_mm: 80,
  });

  const canEdit =
    userRole === 'admin' ||
    userRole === 'master_admin' ||
    (userRole === 'cocina' && station === 'cocina') ||
    (userRole === 'bar' && station === 'bar') ||
    (userRole === 'cajero' && station === 'caja') ||
    (userRole === 'delivery' && station === 'delivery');

  const showAutoPrint = station !== 'caja';
  const printInstallerUrl = getPrintInstallerDownloadUrl();

  const load = useCallback(() => {
    setLoading(true);
    try {
      setServiceUrl(getPrintServiceBaseUrl());
      const c = getStationPrinterConfig(station);
      setForm({
        connection: c.connection || 'lan',
        ip: c.ip,
        port: c.port,
        com_port: c.com_port,
        baud_rate: c.baud_rate,
        windows_printer: c.windows_printer,
        browser_usb_paired: Number(c.browser_usb_paired) === 1 ? 1 : 0,
        copies: c.copies,
        auto_print: c.auto_print,
        width_mm: c.width_mm,
      });
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const rid = user?.restaurant_id;
    if (rid) setPrinterStorageScope(String(rid));
  }, [user?.restaurant_id]);

  const { connected: wsConnected, lastEvent: wsLastEvent } = usePrintServiceWebSocket(serviceUrl);

  const proActivityLabel = useMemo(() => {
    const t = wsLastEvent?.type;
    if (t === 'job:printing') return 'Imprimiendo…';
    if (t === 'job:queued') return 'En cola…';
    if (t === 'job:retry') return `Reintento ${wsLastEvent?.attempt ?? ''}…`;
    if (t === 'job:done') return 'Impresión enviada';
    if (t === 'job:failed') return 'Falló (revisar térmica)';
    if (t === 'job:deduped') return 'Duplicado omitido';
    if (t === 'watchdog:status') return 'Estado red';
    return wsConnected ? 'Servicio en vivo' : 'Pulse Buscar o compruebe el complemento';
  }, [wsLastEvent, wsConnected]);

  useEffect(() => {
    if (form.connection !== 'lan') setLanCandidates([]);
  }, [form.connection]);

  useEffect(() => {
    if (form.connection !== 'usb_serial') setSerialPortsList([]);
  }, [form.connection]);

  const refreshWindowsPrinters = async () => {
    const base = serviceUrl.replace(/\/$/, '');
    setLoadingPrinters(true);
    try {
      const res = await fetch(`${base}/printers`, {
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const list = Array.isArray(data.printers) ? data.printers : [];
      setWindowsPrinters(list);
      if (!list.length && data.hint) toast(data.hint, { icon: 'ℹ️' });
      else toast.success(`${list.length} impresora(s) en Windows`);
    } catch (e) {
      toast.error(e?.message || 'No se pudo listar impresoras (solo Windows, con microservicio en ejecución)');
      setWindowsPrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  };

  const discoverSerialPorts = async () => {
    const base = String(serviceUrl || '')
      .trim()
      .replace(/\/$/, '') || 'http://127.0.0.1:3049';
    setScanningSerialPorts(true);
    try {
      const res = await fetch(`${base}/serial-ports`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const ports = Array.isArray(data.ports) ? data.ports : [];
      if (data.hint && !ports.length) {
        toast.error(String(data.hint), { duration: 10000 });
        setSerialPortsList([]);
        return;
      }
      if (!ports.length) {
        toast.error(
          'No se detectó ningún puerto COM. Revise el cable USB, el driver en Administrador de dispositivos, o use «Impresora Windows» si la térmica solo aparece como impresora instalada.',
          { duration: 11000 }
        );
        setSerialPortsList([]);
        return;
      }
      setSerialPortsList(ports);
      const pick = ports.includes(form.com_port) ? form.com_port : ports[0];
      setForm((f) => ({ ...f, connection: 'usb_serial', com_port: pick }));
      toast.success(
        ports.length === 1 ? `Detectado ${ports[0]} — guardá para aplicar.` : `${ports.length} puertos COM; elegí uno si hay varios.`,
        { duration: 6000 }
      );
    } catch (e) {
      const msg = String(e?.message || '');
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        toast.error(localPrintServiceUnreachableHelp(base), { duration: 12000 });
      } else {
        toast.error(msg || 'No se pudieron listar puertos COM.');
      }
      setSerialPortsList([]);
    } finally {
      setScanningSerialPorts(false);
    }
  };

  const discoverLanPrinters = async () => {
    const base = String(serviceUrl || '')
      .trim()
      .replace(/\/$/, '') || 'http://127.0.0.1:3049';
    setDiscoveringLan(true);
    try {
      const res = await fetch(`${base}/discover-lan`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      const subnets = Array.isArray(data.subnets) ? data.subnets : [];
      const hint = data.hint ? String(data.hint) : '';
      if (hint && !candidates.length) {
        toast.error(hint, { duration: 7000 });
        return;
      }
      if (!candidates.length) {
        toast.error(
          subnets.length
            ? `No se encontró ningún puerto abierto en las subredes ${subnets.join(', ')}. Si la térmica va por USB a este PC, use «USB desde el navegador» o «Impresora Windows».`
            : 'No hay interfaz de red para escanear.',
          { duration: 9000 }
        );
        return;
      }
      const first = candidates[0];
      setLanCandidates(candidates);
      setForm((f) => ({
        ...f,
        connection: 'lan',
        ip: first.ip,
        port: first.port,
      }));
      toast.success(
        candidates.length === 1
          ? `Detectado ${first.ip}:${first.port} — guardá para aplicar.`
          : `Detectados ${candidates.length} equipos; revisá la lista y guardá.`,
        { duration: 6000 }
      );
    } catch (e) {
      const msg = String(e?.message || '');
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        toast.error(localPrintServiceUnreachableHelp(base), { duration: 12000 });
      } else {
        toast.error(msg || 'No se pudo escanear la red.');
      }
    } finally {
      setDiscoveringLan(false);
    }
  };

  const applyProMergedItem = (item) => {
    if (!item?.kind) return;
    if (item.kind === 'lan') {
      setForm((f) => ({ ...f, connection: 'lan', ip: item.ip || f.ip, port: item.port || 9100 }));
    } else if (item.kind === 'usb_serial') {
      setForm((f) => ({ ...f, connection: 'usb_serial', com_port: item.com_port || f.com_port }));
    } else if (item.kind === 'usb_windows') {
      setForm((f) => ({ ...f, connection: 'usb_windows', windows_printer: item.windows_printer || f.windows_printer }));
    }
  };

  const discoverAllUnified = async () => {
    setProDiscoverAllLoading(true);
    try {
      const data = await fetchDiscoverAll(serviceUrl);
      const merged = Array.isArray(data.merged) ? data.merged : [];
      setProMergedList(merged);
      if (merged.length === 0) {
        toast.error(
          'Nada detectado en esta pasada. USB con driver: «Impresora Windows»; USB-COM: «USB serie»; red: misma Wi‑Fi que esta PC.',
          { duration: 10000 }
        );
        return;
      }
      applyProMergedItem(merged[0]);
      toast.success(
        merged.length === 1
          ? '1 dispositivo detectado — revisá modo/IP/COM y guardá.'
          : `${merged.length} dispositivos — elegí en la lista y guardá.`,
        { duration: 7000 }
      );
    } catch (e) {
      const msg = String(e?.message || '');
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        toast.error(localPrintServiceUnreachableHelp(String(serviceUrl || '').replace(/\/$/, '')), {
          duration: 12000,
        });
      } else toast.error(msg || 'No se pudo buscar impresoras.');
    } finally {
      setProDiscoverAllLoading(false);
    }
  };

  const reconnectProfessional = async () => {
    const base = String(serviceUrl || '')
      .trim()
      .replace(/\/$/, '') || 'http://127.0.0.1:3049';
    try {
      const t = buildWatchdogTarget(station, form);
      if (t) await postWatchdogTargets(base, [t]);
      await postWatchdogProbeNow(base);
      if ((form.connection || '') === 'lan' && String(form.ip || '').trim()) {
        const r = await postProbeLan(base, { ip: form.ip, port: form.port || 9100 });
        if (r.tcp || r.ok) toast.success('Red: respuesta TCP OK.', { duration: 4000 });
        else toast.error('Red: sin TCP en esa IP/puerto.', { duration: 6000 });
      } else {
        toast.success('Seguimiento actualizado. Use Probar impresión.', { duration: 4000 });
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        toast.error(localPrintServiceUnreachableHelp(base), { duration: 12000 });
      } else toast.error(msg);
    }
  };

  const saveStation = () => {
    if (!canEdit) return;
    if (![58, 80].includes(Number(form.width_mm))) {
      toast.error('Ancho debe ser 58 u 80 mm');
      return;
    }
    const conn = form.connection || 'lan';
    if (conn === 'lan') {
      const ip = String(form.ip || '').trim();
      if (!ip || !isThermalLanIp(ip)) {
        toast.error('Indique una IP de red local válida para modo LAN.');
        return;
      }
    } else if (conn === 'usb_serial') {
      const com = String(form.com_port || '').trim();
      if (!isUsbComPort(com) && !isUsbUnixDevice(com)) {
        toast.error('Use un puerto COM (p. ej. COM3) o dispositivo /dev/ttyUSB0.');
        return;
      }
    } else if (conn === 'usb_windows') {
      const w = String(form.windows_printer || '').trim();
      if (!w) {
        toast.error('Elija o escriba el nombre exacto de la impresora en Windows.');
        return;
      }
    } else if (conn === 'usb_browser') {
      if (!isWebUsbSerialSupported()) {
        toast.error('Instale la app con Chrome o Edge (menú ⋮ → Instalar aplicación) para usar USB desde el navegador.');
        return;
      }
    }

    const prev = getStationPrinterConfig(station);
    setStationPrinterConfig(station, {
      ...prev,
      connection: conn,
      ip: form.ip,
      port: form.port,
      com_port: form.com_port,
      baud_rate: form.baud_rate,
      windows_printer: form.windows_printer,
      copies: form.copies,
      auto_print: showAutoPrint ? form.auto_print : 0,
      width_mm: form.width_mm,
    });
    setPrintServiceBaseUrl(serviceUrl);
    const wt = buildWatchdogTarget(station, form);
    if (wt) void postWatchdogTargets(String(serviceUrl || '').replace(/\/$/, ''), [wt]).catch(() => {});
    toast.success('Configuración guardada en este equipo');
    load();
  };

  const testPrint = async () => {
    const now = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const text = ['*** PRUEBA ***', TITLES[station] || station, now, ''].join('\n');
    const r = await sendEscPosToStation({ station, text, copies: 1 });
    if (r.ok) toast.success(r.via === 'web-serial' ? 'Prueba enviada por USB (navegador)' : 'Prueba enviada al servicio local');
    else toast.error(r.error || 'Revise la conexión, USB o el microservicio');
  };

  const connLabel = () => {
    if (form.connection === 'usb_serial') return `USB serie ${form.com_port || '—'} @ ${form.baud_rate}`;
    if (form.connection === 'usb_windows') return `Windows: ${form.windows_printer || '—'}`;
    if (form.connection === 'usb_browser') return `USB navegador · ${Number(form.browser_usb_paired) === 1 ? 'vinculada' : 'sin vincular'} · ${form.baud_rate} baud`;
    return `LAN ${form.ip || '—'}:${form.port}`;
  };

  if (loading) {
    return (
      <div
        className={`rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)] ${embedded ? '' : 'mb-3'}`}
      >
        Cargando…
      </div>
    );
  }

  const shellClass = embedded
    ? 'rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm'
    : 'rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-3 mb-4 text-sm';

  return (
    <div className={shellClass}>
      {!hideHeading ? (
        <p className="font-semibold text-[var(--ui-body-text)] mb-2">{TITLES[station] || station}</p>
      ) : null}

      {!canEdit ? (
        <p className="text-xs text-[var(--ui-muted)]">
          {connLabel()} · Ancho {form.width_mm} mm
          {showAutoPrint ? <> · Auto {Number(form.auto_print) === 1 ? 'sí' : 'no'}</> : null}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5 text-[10px] shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
                title={wsConnected ? 'WebSocket en vivo' : 'Sin WebSocket (el servicio puede estar activo)'}
              />
              <span className="font-semibold text-[var(--ui-body-text)]">Detección POS</span>
              <span className="text-[var(--ui-muted)] truncate max-w-[10rem] sm:max-w-[20rem]">{proActivityLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => void discoverAllUnified()}
                disabled={proDiscoverAllLoading}
                className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1"
              >
                <MdSearch className="text-base" /> {proDiscoverAllLoading ? 'Buscando…' : 'Buscar impresoras'}
              </button>
              <button
                type="button"
                onClick={() => void reconnectProfessional()}
                className="btn-secondary text-xs py-1.5 px-2"
              >
                Reconectar
              </button>
              <button
                type="button"
                onClick={() => void testPrint()}
                className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1"
              >
                <MdPlayArrow className="text-base" /> Probar impresión
              </button>
            </div>
            {proMergedList.length > 0 ? (
              <div className="mt-2">
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">
                  Resultados (elegí y guardá)
                </label>
                <select
                  key={proMergedList.map((m) => m.id).join('|')}
                  className="input-field text-sm py-1.5 w-full"
                  defaultValue={0}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    const it = proMergedList[i];
                    if (it) applyProMergedItem(it);
                  }}
                >
                  {proMergedList.map((m, i) => (
                    <option key={m.id || i} value={i}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className="mt-2 text-[9px] text-[var(--ui-muted)] leading-snug">
              Cola en memoria y en <strong>disco</strong> (reintentos automáticos tras fallos o reinicio del servicio), anti-duplicados, más
              watchdog de red. ESC/POS RAW (HPRT O-Series, Epson, XPrinter, Rongta, Star, etc.; puerto típ. 9100).
            </p>
            <p className="mt-2 text-[9px] text-sky-800/90 dark:text-sky-200/90 leading-snug border-t border-sky-500/25 pt-2">
              <strong>Recomendado en restaurante:</strong> si la térmica tiene <strong>Ethernet o Wi‑Fi con IP en red</strong>, usala antes que
              USB: es más estable con <strong>varias cajas o tablets</strong>. Fijá <strong>IP estática</strong> en la impresora o <strong>reserva
              DHCP</strong> en el router para que no «desaparezca» al reiniciar. El buscador prioriza <strong>red (LAN)</strong> sobre USB en la
              lista.
            </p>
          </div>
          <div className="rounded border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-2 py-2 text-[10px] text-[var(--ui-muted)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--ui-body-text)]">
              <MdInfo className="text-sm" /> Microservicio local
            </span>
            <p className="mt-1 leading-snug">
              Si eligió <strong>USB (navegador / app instalada)</strong>, Chrome o Edge envían el ticket directo al cable USB tras vincular
              una sola vez: no hace falta instalar el programa local ni ver código fuente.
            </p>
            <p className="mt-1 leading-snug">
              Para impresora por <strong>IP en red</strong> o <strong>cola Windows</strong>, instale una sola vez el complemento de impresión
              para Windows (enlace abajo). Se ejecuta solo al encender el PC; no hace falta abrir consola ni comandos.
            </p>
            <p className="mt-1 leading-snug text-[10px]">
              USB vía microservicio: <strong>COM</strong> o <strong>Windows RAW</strong> como antes.
            </p>
            {isStandaloneDisplayMode() ? (
              <p className="mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                App instalada: use la opción USB navegador para la experiencia más simple en este equipo.
              </p>
            ) : null}
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mt-2 mb-0.5">URL del servicio de impresión</label>
            <input
              type="url"
              className="input-field text-sm py-1.5 w-full"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value.trim())}
              placeholder="http://127.0.0.1:3049"
            />
            {printInstallerUrl ? (
              <p className="mt-2 text-[10px] leading-snug text-[var(--ui-muted)]">
                ¿Primera vez en este equipo?{' '}
                <a
                  href={printInstallerUrl}
                  className="text-sky-600 dark:text-sky-400 font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Descargar instalador del servicio de impresión (Windows)
                </a>
                . Instala solo el programa que escucha en este PC; la aplicación web sigue en el navegador.
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Conexión</label>
            <select
              className="input-field text-sm py-1.5 w-full"
              value={form.connection}
              onChange={(e) => setForm((f) => ({ ...f, connection: e.target.value }))}
            >
              <option value="usb_browser">USB desde el navegador / app instalada (recomendado PWA)</option>
              <option value="lan">Red (IP térmica, puerto RAW típ. 9100)</option>
              <option value="usb_serial">USB / serie vía programa local (COM o /dev/tty…)</option>
              <option value="usb_windows">Impresora Windows vía programa local (RAW)</option>
            </select>
          </div>

          {form.connection === 'lan' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => void discoverLanPrinters()}
                  disabled={discoveringLan}
                  className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1"
                >
                  <MdRadar className="text-base" /> {discoveringLan ? 'Buscando…' : 'Buscar en esta red (Wi‑Fi / cable)'}
                </button>
                <span className="text-[10px] text-[var(--ui-muted)] leading-snug max-w-md">
                  Escanea la misma subred que esta PC (puertos típicos 9100, 9101…). La térmica debe tener IP en la red; si va solo por USB a
                  este equipo, use otro modo arriba.
                </span>
              </div>
              {lanCandidates.length > 1 ? (
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Elegir entre detectados</label>
                  <select
                    className="input-field text-sm py-1.5 w-full"
                    value={`${form.ip}:${form.port}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      const [ip, portStr] = v.split(':');
                      const port = Number(portStr) || 9100;
                      setForm((f) => ({ ...f, ip: ip || f.ip, port }));
                    }}
                  >
                    {lanCandidates.map((c) => (
                      <option key={`${c.ip}:${c.port}`} value={`${c.ip}:${c.port}`}>
                        {c.ip} — puerto {c.port}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">IP de la térmica</label>
                  <input
                    className="input-field text-sm py-1.5"
                    value={form.ip}
                    onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value.trim() }))}
                    placeholder="192.168.1.50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Puerto TCP</label>
                  <input
                    type="number"
                    className="input-field text-sm py-1.5"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) || 9100 }))}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {form.connection === 'usb_serial' ? (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--ui-muted)] leading-snug">
                USB por cable suele crear un <strong>puerto COM</strong> en Windows. Pulse <strong>Buscar puertos COM</strong>. Si la térmica
                solo aparece como impresora instalada (driver tipo CBX) y <strong>no</strong> genera COM, use abajo{' '}
                <strong>Impresora Windows</strong> y «Listar impresoras».
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => void discoverSerialPorts()}
                  disabled={scanningSerialPorts}
                  className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1"
                >
                  <MdSearch className="text-base" /> {scanningSerialPorts ? 'Buscando…' : 'Buscar puertos COM (USB serie)'}
                </button>
              </div>
              {serialPortsList.length > 1 ? (
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Elegir puerto detectado</label>
                  <select
                    className="input-field text-sm py-1.5 w-full"
                    value={serialPortsList.includes(form.com_port) ? form.com_port : serialPortsList[0]}
                    onChange={(e) => setForm((f) => ({ ...f, com_port: e.target.value }))}
                  >
                    {serialPortsList.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Puerto COM o dispositivo</label>
                  <input
                    className="input-field text-sm py-1.5"
                    value={form.com_port}
                    onChange={(e) => setForm((f) => ({ ...f, com_port: e.target.value.trim() }))}
                    placeholder="COM3 o /dev/ttyUSB0"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Velocidad (baudios)</label>
                  <select
                    className="input-field text-sm py-1.5"
                    value={form.baud_rate}
                    onChange={(e) => setForm((f) => ({ ...f, baud_rate: Number(e.target.value) }))}
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {form.connection === 'usb_windows' ? (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--ui-muted)] leading-snug">
                Ideal cuando la térmica está por <strong>USB</strong> y ya tiene <strong>driver en Windows</strong> (cola de impresión con
                nombre propio). Pulse Listar y elija la misma que en Configuración → Impresoras. No usa «buscar en red» ni COM.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <button
                  type="button"
                  onClick={() => void refreshWindowsPrinters()}
                  disabled={loadingPrinters}
                  className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1"
                >
                  <MdRefresh className="text-base" /> {loadingPrinters ? '…' : 'Listar impresoras Windows'}
                </button>
              </div>
              {windowsPrinters.length > 0 ? (
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Elegir nombre</label>
                  <select
                    className="input-field text-sm py-1.5 w-full"
                    value={windowsPrinters.includes(form.windows_printer) ? form.windows_printer : ''}
                    onChange={(e) => setForm((f) => ({ ...f, windows_printer: e.target.value }))}
                  >
                    <option value="">— seleccionar —</option>
                    {windowsPrinters.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Nombre exacto de la impresora</label>
                <input
                  className="input-field text-sm py-1.5 w-full"
                  value={form.windows_printer}
                  onChange={(e) => setForm((f) => ({ ...f, windows_printer: e.target.value }))}
                  placeholder="Como aparece en Configuración → Impresoras"
                />
              </div>
            </div>
          ) : null}

          {form.connection === 'usb_browser' ? (
            <div className="space-y-2 rounded border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-2 py-2">
              {!isWebUsbSerialSupported() ? (
                <p className="text-[10px] text-amber-800 dark:text-amber-200 leading-snug">
                  Abra el sitio con <strong>Chrome</strong> o <strong>Edge</strong> y use el menú <strong>⋮ → Instalar aplicación</strong>. Así el
                  USB queda permitido sin programas extra.
                </p>
              ) : (
                <p className="text-[10px] text-[var(--ui-muted)] leading-snug">
                  No aparece en «buscar en red» ni en COM: aquí el navegador habla por USB directo. Pulse <strong>Vincular USB</strong> una vez
                  con la térmica encendida; después los tickets salen solos.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Velocidad (baudios)</label>
                  <select
                    className="input-field text-sm py-1.5"
                    value={form.baud_rate}
                    onChange={(e) => setForm((f) => ({ ...f, baud_rate: Number(e.target.value) }))}
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-[10px] text-[var(--ui-muted)]">
                    Vinculación:{' '}
                    <span className="font-semibold text-[var(--ui-body-text)]">
                      {Number(form.browser_usb_paired) === 1 ? 'Sí ✓' : 'Pendiente'}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!isWebUsbSerialSupported()}
                onClick={async () => {
                  const prev = getStationPrinterConfig(station);
                  setStationPrinterConfig(station, {
                    ...prev,
                    connection: 'usb_browser',
                    baud_rate: form.baud_rate,
                    width_mm: form.width_mm,
                    copies: form.copies,
                    auto_print: showAutoPrint ? form.auto_print : 0,
                  });
                  const r = await pairBrowserUsbPrinter(station);
                  if (r.ok) {
                    toast.success('Impresora USB vinculada a esta app');
                    load();
                  } else toast.error(r.error || 'No se pudo vincular');
                }}
                className="btn-primary text-xs py-1.5 px-3 w-full sm:w-auto"
              >
                Vincular impresora USB (una vez)
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Ancho mm</label>
              <select
                className="input-field text-sm py-1.5"
                value={form.width_mm}
                onChange={(e) => setForm((f) => ({ ...f, width_mm: Number(e.target.value) }))}
              >
                <option value={58}>58</option>
                <option value={80}>80</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Copias</label>
              <input
                type="number"
                className="input-field text-sm py-1.5"
                min={1}
                max={5}
                value={form.copies}
                onChange={(e) => setForm((f) => ({ ...f, copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) }))}
              />
            </div>
            {showAutoPrint ? (
              <div className="sm:col-span-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Number(form.auto_print) === 1}
                    onChange={(e) => setForm((f) => ({ ...f, auto_print: e.target.checked ? 1 : 0 }))}
                  />
                  Impresión automática al recibir pedido
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => void saveStation()} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
              <MdSave className="text-base" /> Guardar en este equipo
            </button>
            <button
              type="button"
              onClick={() => void testPrint()}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
            >
              <MdPlayArrow className="text-base" /> Probar impresión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
