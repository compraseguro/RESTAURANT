import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdInfo, MdRefresh } from 'react-icons/md';
import {
  getPrintServiceBaseUrl,
  setPrintServiceBaseUrl,
  getPrintInstallerDownloadUrl,
  getStationPrinterConfig,
  setStationPrinterConfig,
  isThermalLanIp,
  isUsbComPort,
  isUsbUnixDevice,
} from '../utils/localPrinterStorage';
import { sendEscPosToStation } from '../utils/cajaThermalPrint';
import { pairBrowserUsbPrinter, isWebUsbSerialSupported } from '../utils/browserUsbPrint';
import { isStandaloneDisplayMode } from '../utils/pwaDetect';

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
export default function StationPrinterCard({ station, userRole, hideHeading = false, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [serviceUrl, setServiceUrl] = useState('http://127.0.0.1:3049');
  const [windowsPrinters, setWindowsPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
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

  const refreshWindowsPrinters = async () => {
    const base = serviceUrl.replace(/\/$/, '');
    setLoadingPrinters(true);
    try {
      const res = await fetch(`${base}/printers`);
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
          <div className="rounded border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-2 py-2 text-[10px] text-[var(--ui-muted)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--ui-body-text)]">
              <MdInfo className="text-sm" /> Microservicio local
            </span>
            <p className="mt-1 leading-snug">
              Si eligió <strong>USB (navegador / app instalada)</strong>, Chrome o Edge envían el ticket directo al cable USB tras vincular
              una sola vez: no hace falta instalar el programa local ni ver código fuente.
            </p>
            <p className="mt-1 leading-snug">
              Para impresora por <strong>IP en red</strong> o <strong>cola Windows</strong>, use el programa local (puerto 3049):{' '}
              <code className="rounded bg-[var(--ui-surface-2)] px-1">npm run print-service</code> o el instalador descargable.
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
          ) : null}

          {form.connection === 'usb_serial' ? (
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
          ) : null}

          {form.connection === 'usb_windows' ? (
            <div className="space-y-2">
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
                  Pulse <strong>Vincular USB</strong> una vez con la térmica encendida y conectada; después los tickets salen solos (sin elegir
                  impresora).
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
