import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdRefresh, MdSearch } from 'react-icons/md';
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
import { usePrintServiceWebSocket } from '../hooks/usePrintServiceWebSocket';
import {
  fetchDiscoverAll,
  fetchWindowsPrintersList,
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

/** Misma prioridad que `print-microservice/discoverAll.js`: red antes que Windows/COM. */
const DISCOVER_KIND_ORDER = { lan: 0, usb_windows: 1, usb_serial: 2 };

const DISCOVER_GROUP_LABELS = {
  lan: 'Red (IP térmica, RAW)',
  usb_windows: 'Cola Windows',
  usb_serial: 'USB serie (COM)',
};

function sortMergedForUi(items) {
  return [...items].sort((a, b) => {
    const pa = DISCOVER_KIND_ORDER[a.kind] ?? 9;
    const pb = DISCOVER_KIND_ORDER[b.kind] ?? 9;
    if (pa !== pb) return pa - pb;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

/** Etiqueta corta en el desplegable; el backend sigue enviando `label` largo. */
function formatDiscoverOptionLabel(m) {
  if (m.kind === 'lan') return `${m.ip}:${m.port ?? 9100} · TCP RAW`;
  if (m.kind === 'usb_serial') return `${m.com_port} · serie`;
  if (m.kind === 'usb_windows') return `«${m.windows_printer}»`;
  return m.label || m.id || '—';
}

/** Red/COM/cola Windows necesitan el programa local en este PC; USB navegador no. */
function needsLocalMicroservice(conn) {
  return conn === 'lan' || conn === 'usb_serial' || conn === 'usb_windows';
}

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
  const [proMergedList, setProMergedList] = useState([]);
  const [selectedDiscoverId, setSelectedDiscoverId] = useState('');
  const [discoverLoading, setDiscoverLoading] = useState(false);
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

  useEffect(() => {
    setProMergedList([]);
    setSelectedDiscoverId('');
  }, [form.connection]);

  const { connected: wsConnected, lastEvent: wsLastEvent } = usePrintServiceWebSocket(serviceUrl);

  const statusShort = useMemo(() => {
    const t = wsLastEvent?.type;
    if (t === 'job:printing') return 'Imprimiendo…';
    if (t === 'job:failed') return 'Error envío';
    if (t === 'job:done') return 'OK';
    return wsConnected ? 'Servicio' : '…';
  }, [wsLastEvent, wsConnected]);

  const applyMergedItem = (item) => {
    if (!item?.kind) return;
    if (item.kind === 'lan') {
      setForm((f) => ({ ...f, connection: 'lan', ip: item.ip || f.ip, port: item.port || 9100 }));
    } else if (item.kind === 'usb_serial') {
      setForm((f) => ({ ...f, connection: 'usb_serial', com_port: item.com_port || f.com_port }));
    } else if (item.kind === 'usb_windows') {
      setForm((f) => ({ ...f, connection: 'usb_windows', windows_printer: item.windows_printer || f.windows_printer }));
    }
  };

  const discoverPrinters = async () => {
    setDiscoverLoading(true);
    try {
      const data = await fetchDiscoverAll(serviceUrl);
      const raw = Array.isArray(data.merged) ? data.merged : [];
      const merged = sortMergedForUi(raw);
      setProMergedList(merged);
      const first = merged[0];
      if (first?.id) setSelectedDiscoverId(first.id);
      else setSelectedDiscoverId('');
      if (!merged.length) {
        toast.error('Sin resultados. Revise modo de conexión o instale el complemento Windows si usa red/COM/cola.');
        return;
      }
      applyMergedItem(first);
      toast.success(merged.length === 1 ? 'Dispositivo aplicado — guardá.' : `${merged.length} opciones — elegí y guardá.`);
    } catch (e) {
      const msg = String(e?.message || '');
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        toast.error(localPrintServiceUnreachableHelp(String(serviceUrl || '').replace(/\/$/, '')), { duration: 12000 });
      } else toast.error(msg || 'Error al buscar.');
    } finally {
      setDiscoverLoading(false);
    }
  };

  const reconnectActions = async () => {
    const base = String(serviceUrl || '')
      .trim()
      .replace(/\/$/, '') || 'http://127.0.0.1:3049';
    try {
      const t = buildWatchdogTarget(station, form);
      if (t) await postWatchdogTargets(base, [t]);
      await postWatchdogProbeNow(base);
      if ((form.connection || '') === 'lan' && String(form.ip || '').trim()) {
        const r = await postProbeLan(base, { ip: form.ip, port: form.port || 9100 });
        if (r.tcp || r.ok) toast.success('TCP OK');
        else toast.error('Sin respuesta TCP');
      } else {
        toast.success('Actualizado');
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        toast.error(localPrintServiceUnreachableHelp(base), { duration: 12000 });
      } else toast.error(msg);
    }
  };

  const refreshWindowsPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const data = await fetchWindowsPrintersList(serviceUrl);
      const list = Array.isArray(data.printers) ? data.printers : [];
      setWindowsPrinters(list);
      toast.success(list.length ? `${list.length} cola(s)` : 'Sin impresoras');
    } catch (e) {
      toast.error(e?.message || 'No se pudo listar');
      setWindowsPrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  };

  const saveStation = () => {
    if (!canEdit) return;
    if (![58, 80].includes(Number(form.width_mm))) {
      toast.error('Ancho 58 u 80 mm');
      return;
    }
    const conn = form.connection || 'lan';
    if (conn === 'lan') {
      const ip = String(form.ip || '').trim();
      if (!ip || !isThermalLanIp(ip)) {
        toast.error('IP local válida requerida.');
        return;
      }
    } else if (conn === 'usb_serial') {
      const com = String(form.com_port || '').trim();
      if (!isUsbComPort(com) && !isUsbUnixDevice(com)) {
        toast.error('COM o /dev válido.');
        return;
      }
    } else if (conn === 'usb_windows') {
      if (!String(form.windows_printer || '').trim()) {
        toast.error('Nombre de impresora Windows.');
        return;
      }
    } else if (conn === 'usb_browser') {
      if (!isWebUsbSerialSupported()) {
        toast.error('Chrome o Edge con app instalada.');
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
    toast.success('Guardado');
    load();
  };

  const testPrint = async () => {
    const now = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const text = ['*** PRUEBA ***', TITLES[station] || station, now, ''].join('\n');
    const r = await sendEscPosToStation({
      station,
      text,
      copies: 1,
      runtimeConfig: form,
      runtimeServiceUrl: needsLocalMicroservice(form.connection) ? serviceUrl : undefined,
    });
    if (r.ok) toast.success(r.via === 'web-serial' ? 'Enviado (USB app)' : 'Enviado');
    else toast.error(r.error || 'Falló');
  };

  const connLabel = () => {
    if (form.connection === 'usb_serial') return `${form.com_port || '—'} @ ${form.baud_rate}`;
    if (form.connection === 'usb_windows') return form.windows_printer || '—';
    if (form.connection === 'usb_browser') return `USB app · ${Number(form.browser_usb_paired) === 1 ? 'ok' : 'pendiente'}`;
    return `${form.ip || '—'}:${form.port}`;
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

  const ms = needsLocalMicroservice(form.connection);

  return (
    <div className={shellClass}>
      {!hideHeading ? (
        <p className="font-semibold text-[var(--ui-body-text)] mb-2">{TITLES[station] || station}</p>
      ) : null}

      {!canEdit ? (
        <p className="text-xs text-[var(--ui-muted)]">
          {connLabel()} · {form.width_mm} mm
          {showAutoPrint ? <> · Auto {Number(form.auto_print) === 1 ? 'sí' : 'no'}</> : null}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-[var(--ui-muted)]">{statusShort}</span>
            <button
              type="button"
              onClick={() => void discoverPrinters()}
              disabled={discoverLoading}
              className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
            >
              <MdSearch className="text-base" /> {discoverLoading ? '…' : 'Buscar impresoras'}
            </button>
            <button type="button" onClick={() => void reconnectActions()} className="btn-secondary text-xs py-1 px-2">
              Reconectar
            </button>
          </div>

          {proMergedList.length > 0 ? (
            <div>
              <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">
                Detectados (red primero, luego Windows, COM)
              </label>
              <select
                key={proMergedList.map((m) => m.id).join('|')}
                className="input-field text-sm py-1.5 w-full"
                value={selectedDiscoverId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedDiscoverId(id);
                  const it = proMergedList.find((m) => m.id === id);
                  if (it) applyMergedItem(it);
                }}
              >
                {['lan', 'usb_windows', 'usb_serial'].map((kind) => {
                  const items = proMergedList.filter((m) => m.kind === kind);
                  if (!items.length) return null;
                  return (
                    <optgroup key={kind} label={DISCOVER_GROUP_LABELS[kind] || kind}>
                      {items.map((m) => (
                        <option key={m.id} value={m.id}>
                          {formatDiscoverOptionLabel(m)}
                          {proMergedList[0]?.id === m.id ? ' · recomendado' : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
                {proMergedList.some((m) => DISCOVER_KIND_ORDER[m.kind] === undefined) ? (
                  <optgroup label="Otros">
                    {proMergedList
                      .filter((m) => DISCOVER_KIND_ORDER[m.kind] === undefined)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {formatDiscoverOptionLabel(m)}
                          {proMergedList[0]?.id === m.id ? ' · recomendado' : ''}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
          ) : null}

          {ms ? (
            <div>
              <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">URL servicio local</label>
              <input
                type="url"
                className="input-field text-sm py-1.5 w-full"
                value={serviceUrl}
                onChange={(e) => setServiceUrl(e.target.value.trim())}
                placeholder="http://127.0.0.1:3049"
              />
              {printInstallerUrl ? (
                <p className="mt-1 text-[10px] text-[var(--ui-muted)]">
                  <a href={printInstallerUrl} className="text-sky-600 dark:text-sky-400 underline" target="_blank" rel="noreferrer">
                    Instalador Windows
                  </a>{' '}
                  (red / COM / cola)
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Conexión</label>
            <select
              className="input-field text-sm py-1.5 w-full"
              value={form.connection}
              onChange={(e) => setForm((f) => ({ ...f, connection: e.target.value }))}
            >
              <option value="lan">Red IP (RAW, ej. 9100)</option>
              <option value="usb_browser">USB directo (app Chrome/Edge)</option>
              <option value="usb_serial">USB serie (COM)</option>
              <option value="usb_windows">Cola Windows</option>
            </select>
          </div>

          {form.connection === 'lan' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">IP térmica</label>
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
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">COM / dispositivo</label>
                <input
                  className="input-field text-sm py-1.5"
                  value={form.com_port}
                  onChange={(e) => setForm((f) => ({ ...f, com_port: e.target.value.trim() }))}
                  placeholder="COM3"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Baudios</label>
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
                  <MdRefresh className="text-base" /> {loadingPrinters ? '…' : 'Listar impresoras'}
                </button>
              </div>
              {windowsPrinters.length > 0 ? (
                <select
                  className="input-field text-sm py-1.5 w-full"
                  value={windowsPrinters.includes(form.windows_printer) ? form.windows_printer : ''}
                  onChange={(e) => setForm((f) => ({ ...f, windows_printer: e.target.value }))}
                >
                  <option value="">— Elegir —</option>
                  {windowsPrinters.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : null}
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Nombre cola Windows</label>
                <input
                  className="input-field text-sm py-1.5 w-full"
                  value={form.windows_printer}
                  onChange={(e) => setForm((f) => ({ ...f, windows_printer: e.target.value.trim() }))}
                  placeholder="Exacto como en Windows"
                />
              </div>
            </div>
          ) : null}

          {form.connection === 'usb_browser' ? (
            <div className="space-y-2 rounded border border-[color:var(--ui-border)] px-2 py-2">
              {!isWebUsbSerialSupported() ? (
                <p className="text-[10px] text-amber-800 dark:text-amber-200">Chrome o Edge, menú ⋮ → Instalar app.</p>
              ) : (
                <p className="text-[10px] text-[var(--ui-muted)]">Vincular una vez; luego imprime solo.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Baudios</label>
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
                <p className="text-[10px] self-end text-[var(--ui-muted)]">
                  USB: {Number(form.browser_usb_paired) === 1 ? 'ok' : 'pendiente'}
                </p>
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
                    toast.success('USB vinculado');
                    load();
                  } else toast.error(r.error || 'Error');
                }}
                className="btn-primary text-xs py-1.5 px-3 w-full sm:w-auto"
              >
                Vincular USB
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
                  Auto al recibir pedido
                </label>
              </div>
            ) : null}
          </div>

          <details className="text-[10px] text-[var(--ui-muted)] rounded border border-[color:var(--ui-border)] px-2 py-1">
            <summary className="cursor-pointer py-1">Ayuda breve</summary>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              <li>Red IP prioritaria para varios POS; IP fija o reserva DHCP en el router.</li>
              <li>USB app = sin instalador; red/COM/cola = complemento en este PC (3049).</li>
            </ul>
          </details>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => void saveStation()} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
              <MdSave className="text-base" /> Guardar
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
