import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdRefresh, MdWifiTethering, MdInfo, MdCable } from 'react-icons/md';
import { shouldTryServerNetworkPrint, hasThermalDestination, isThermalLanIp } from '../utils/networkPrinter';
import {
  isLocalPrintAgentConfigured,
  fetchAgentPrinters,
  fetchAgentStatus,
  probeAgentTcp,
  probeLocalAgent,
} from '../utils/localPrintAgent';
import { sendEscPosToStation } from '../utils/cajaThermalPrint';

const TITLES = {
  cocina: 'Impresora de cocina',
  bar: 'Impresora de bar',
  caja: 'Impresora de caja (precuentas)',
};

function formToPrinterStub(form) {
  const ip = String(form.ip_address || '').trim();
  const pt = String(form.printer_type || 'lan').toLowerCase();
  const wm = Number(form.width_mm);
  return {
    ip_address: ip,
    port: form.port,
    copies: form.copies,
    printer_type: pt,
    local_printer_name: String(form.local_printer_name || '').trim(),
    width_mm: [58, 80].includes(wm) ? wm : 80,
    connection: pt === 'lan' || ip ? 'wifi' : pt === 'usb' ? 'usb' : 'browser',
  };
}

/**
 * Configuración de la impresora de una sola estación, en el panel correspondiente.
 * @param {{ station: string, userRole?: string, hideHeading?: boolean, embedded?: boolean }} props
 */
export default function StationPrinterCard({ station, userRole, hideHeading = false, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [printCfg, setPrintCfg] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [agentHint, setAgentHint] = useState(null);
  const [agentConn, setAgentConn] = useState({ base_url: '', agent_token: '', qz_enabled: 0 });
  const [savingAgent, setSavingAgent] = useState(false);
  const [form, setForm] = useState({
    ip_address: '',
    port: 9100,
    copies: 1,
    auto_print: 1,
    printer_type: 'lan',
    width_mm: 80,
    local_printer_name: '',
  });

  const canEdit =
    userRole === 'admin' ||
    userRole === 'master_admin' ||
    (userRole === 'cocina' && station === 'cocina') ||
    (userRole === 'bar' && station === 'bar') ||
    (userRole === 'cajero' && station === 'caja');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/orders/print-config')
      .then((c) => {
        setPrintCfg(c);
        const pa = c?.print_agent || {};
        setAgentConn({
          base_url: String(pa.base_url || '').trim(),
          agent_token: String(pa.agent_token || ''),
          qz_enabled: Number(pa.qz_tray?.enabled) === 1 || pa.qz_tray?.enabled === true ? 1 : 0,
        });
        const p = c?.printers?.[station];
        if (p) {
          const pt = String(p.printer_type || 'lan').toLowerCase();
          setForm({
            ip_address: pt === 'usb' ? '' : String(p.ip_address || ''),
            port: Number(p.port || 9100),
            copies: Math.min(5, Math.max(1, Number(p.copies || 1))),
            auto_print: Number(p.auto_print ?? 1) === 0 ? 0 : 1,
            printer_type: pt === 'usb' ? 'usb' : 'lan',
            width_mm: [58, 80].includes(Number(p.width_mm)) ? Number(p.width_mm) : 80,
            local_printer_name: String(p.local_printer_name || ''),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [station]);

  useEffect(() => {
    load();
  }, [load]);

  const saveLocalConnection = async () => {
    if (!canEdit) return;
    setSavingAgent(true);
    try {
      await api.put('/orders/local-print-connection', {
        base_url: String(agentConn.base_url || '').trim() || 'http://127.0.0.1:3001',
        agent_token: agentConn.agent_token,
        qz_tray: { enabled: Number(agentConn.qz_enabled) === 1 },
      });
      toast.success('Conexión local guardada');
      await load();
    } catch (e) {
      toast.error(e?.message || 'No se pudo guardar la conexión');
    } finally {
      setSavingAgent(false);
    }
  };

  const save = async () => {
    if (!canEdit) return;
    if (![58, 80].includes(Number(form.width_mm))) {
      toast.error('Ancho de papel debe ser 58 u 80 mm');
      return;
    }
    const pa = printCfg?.print_agent;
    if (form.printer_type === 'lan') {
      const ip = String(form.ip_address || '').trim();
      if (!isThermalLanIp(ip)) {
        toast.error('Indique una IP de red local válida (no use plantillas tipo 192.168.x.x).');
        return;
      }
      if (isLocalPrintAgentConfigured(pa)) {
        try {
          await probeAgentTcp(pa, ip, form.port);
        } catch (e) {
          toast.error(
            `No se pudo validar la conexión TCP: ${e?.message || 'error'}. Revise IP, puerto 9100 y que la térmica esté encendida.`
          );
          return;
        }
      }
    }
    if (form.printer_type === 'usb' && String(form.local_printer_name || '').trim() && isLocalPrintAgentConfigured(pa)) {
      try {
        const list = await fetchAgentPrinters(pa);
        const want = String(form.local_printer_name || '').trim();
        const found = list.some((n) => String(n).trim() === want);
        if (!found) {
          toast.error(`El nombre «${want}» no aparece entre las impresoras del sistema. Use «Detectar impresoras» y copie el nombre exacto.`);
          return;
        }
      } catch (e) {
        toast.error(e?.message || 'No se pudo validar el nombre USB contra el agente.');
        return;
      }
    }
    try {
      await api.put(`/orders/printer-station/${station}`, {
        ip_address: form.ip_address,
        port: form.port,
        copies: form.copies,
        auto_print: station === 'caja' ? 0 : form.auto_print,
        printer_type: form.printer_type,
        width_mm: form.width_mm,
        local_printer_name: form.local_printer_name,
      });
      toast.success('Impresora guardada');
      load();
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar');
    }
  };

  const detectPrinters = async () => {
    const pa = printCfg?.print_agent;
    if (!isLocalPrintAgentConfigured(pa)) {
      toast.error('Configure primero la URL del print-agent abajo (Guardar conexión local).');
      return;
    }
    setDetecting(true);
    try {
      const list = await fetchAgentPrinters(pa);
      if (!list.length) {
        toast.error(
          'No hay impresoras en Windows (Impresoras y escáneres). Instale el driver y asegúrese de que aparezca una cola. Ejecute el print-agent «Como administrador» si sigue vacío. En USB instale opcional: npm install printer en la carpeta local-print-agent.'
        );
        return;
      }
      const preview = list.slice(0, 6).join(', ') + (list.length > 6 ? '…' : '');
      toast.success(`${list.length} impresora(s): ${preview}`);
    } catch (e) {
      toast.error(e?.message || 'No se pudo contactar al print-agent (¿está en ejecución?)');
    } finally {
      setDetecting(false);
    }
  };

  const testPrint = async () => {
    const stub = formToPrinterStub(form);
    const name = TITLES[station] || station;
    const now = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const text = ['*** PRUEBA ***', name, now, ''].join('\n');
    const copies = Math.min(5, Math.max(1, Number(form.copies || 1)));
    const pa = printCfg?.print_agent;

    if (shouldTryServerNetworkPrint(stub)) {
      try {
        await api.post('/orders/print-network', { station, text, copies });
        toast.success('Prueba enviada (red vía servidor)');
        return;
      } catch (e) {
        toast.error(e.message || 'Fallo por red en el servidor');
      }
    }
    if (hasThermalDestination(stub) && isLocalPrintAgentConfigured(pa)) {
      try {
        const r = await sendEscPosToStation({
          api,
          station,
          stationConfig: { ...stub, port: form.port || 9100 },
          printAgent: pa,
          text,
          copies,
        });
        if (r.ok) {
          toast.success('Prueba enviada (print-agent)');
          return;
        }
        toast.error('El print-agent no pudo imprimir. Revise IP, nombre USB y que el servicio esté activo.');
      } catch (e) {
        toast.error(e.message || 'Programa local no disponible');
      }
      return;
    }
    toast.error('Indique IP (red RAW) o nombre de impresora USB, y guarde la URL del print-agent en este panel.');
  };

  const reconnectAgent = async () => {
    const pa = printCfg?.print_agent;
    if (!isLocalPrintAgentConfigured(pa)) {
      toast.error('Configure la URL del print-agent en este panel (Guardar conexión local).');
      return;
    }
    setStatusLoading(true);
    setAgentHint(null);
    try {
      const ok = await probeLocalAgent(pa);
      if (!ok) {
        toast.error('El agente no responde en la URL configurada.');
        return;
      }
      toast.success('Agente en línea (health OK)');
    } catch (e) {
      toast.error(e?.message || 'Sin conexión al agente');
    } finally {
      setStatusLoading(false);
    }
  };

  const showAgentStatus = async () => {
    const pa = printCfg?.print_agent;
    if (!isLocalPrintAgentConfigured(pa)) {
      toast.error('Configure la URL del print-agent.');
      return;
    }
    setStatusLoading(true);
    try {
      const st = await fetchAgentStatus(pa);
      const q = Number(st.queueLength ?? 0);
      const last = st.lastOkAt || st.lastJobAt || '—';
      const err = st.lastError ? ` · Último error: ${String(st.lastError).slice(0, 120)}` : '';
      setAgentHint(`Cola: ${q} · Último OK: ${last} · Trabajos OK: ${st.jobsOk ?? 0}${err}`);
      toast.success('Estado del agente actualizado');
    } catch (e) {
      setAgentHint(null);
      toast.error(e?.message || 'No se pudo leer /status (¿token incorrecto?)');
    } finally {
      setStatusLoading(false);
    }
  };

  const validateIpOnly = async () => {
    const pa = printCfg?.print_agent;
    if (!isLocalPrintAgentConfigured(pa)) {
      toast.error('Configure el print-agent para validar TCP desde este PC.');
      return;
    }
    const ip = String(form.ip_address || '').trim();
    if (!isThermalLanIp(ip)) {
      toast.error('IP no válida para térmica en red.');
      return;
    }
    setStatusLoading(true);
    try {
      await probeAgentTcp(pa, ip, form.port);
      toast.success('Puerto RAW responde (conexión TCP OK)');
    } catch (e) {
      toast.error(e?.message || 'No se alcanzó la impresora');
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        className={`rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)] ${embedded ? '' : 'mb-3'}`}
      >
        Cargando impresora…
      </div>
    );
  }

  const shellClass = embedded
    ? 'rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm'
    : 'rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-3 mb-4 text-sm';

  /** Caja no recibe comandas al crear pedidos; solo cocina/bar usan auto-impresión al recibir pedido. */
  const showAutoPrintToggle = station !== 'caja';

  return (
    <div className={shellClass}>
      {!hideHeading ? (
        <p className="font-semibold text-[var(--ui-body-text)] mb-2">{TITLES[station] || station}</p>
      ) : null}
      {!canEdit ? (
        <p className="text-xs text-[var(--ui-muted)]">
          IP: {form.ip_address || '—'} · USB: {form.local_printer_name || '—'} · Puerto {form.port}
          {showAutoPrintToggle ? (
            <>
              {' '}
              · Auto {Number(form.auto_print) === 1 ? 'sí' : 'no'}
            </>
          ) : null}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Conexión</label>
            <select
              className="input-field text-sm py-1.5"
              value={form.printer_type}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  printer_type: v,
                  ip_address: v === 'usb' ? '' : f.ip_address,
                }));
              }}
            >
              <option value="lan">Red (IP RAW, puerto 9100)</option>
              <option value="usb">USB / cola del sistema (vía print-agent)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">IP (si es red)</label>
            <input
              className="input-field text-sm py-1.5"
              value={form.ip_address}
              onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))}
              placeholder="192.168.x.x"
              disabled={form.printer_type === 'usb'}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">
              Nombre impresora local (USB / exacto como en el sistema)
            </label>
            <input
              className="input-field text-sm py-1.5"
              value={form.local_printer_name}
              onChange={(e) => setForm((f) => ({ ...f, local_printer_name: e.target.value }))}
              placeholder="Ej. XP-80C"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Puerto</label>
            <input
              type="number"
              className="input-field text-sm py-1.5"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) || 9100 }))}
            />
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
          {showAutoPrintToggle ? (
            <div className="flex items-end">
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
          <div className="sm:col-span-2 mt-1 pt-3 border-t border-[color:var(--ui-border)] space-y-2">
            <p className="text-[11px] font-semibold text-[var(--ui-body-text)]">Print-agent y QZ Tray (este equipo)</p>
            <p className="text-[10px] text-[var(--ui-muted)] leading-snug">
              La misma URL y opciones aplican a caja, cocina y bar. Instale la carpeta{' '}
              <code className="rounded bg-[var(--ui-surface)] px-1 border border-[color:var(--ui-border)]">local-print-agent</code> en
              este PC. Con HTTPS en desarrollo suele usarse el proxy{' '}
              <code className="rounded bg-[var(--ui-surface)] px-1 border border-[color:var(--ui-border)]">/print-agent</code>.
            </p>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[color:var(--ui-border)]"
                checked={Number(agentConn.qz_enabled) === 1}
                onChange={(e) => setAgentConn((a) => ({ ...a, qz_enabled: e.target.checked ? 1 : 0 }))}
              />
              <span className="text-xs text-[var(--ui-body-text)]">
                Usar QZ Tray (impresión silenciosa). Si falla, se usa print-agent o el servidor.{' '}
                <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="text-sky-600 underline">
                  Descargar QZ
                </a>
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">URL del print-agent</label>
                <input
                  type="url"
                  className="input-field text-sm py-1.5"
                  value={agentConn.base_url}
                  onChange={(e) => setAgentConn((a) => ({ ...a, base_url: e.target.value.trim() }))}
                  placeholder="http://127.0.0.1:3001"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Token del agente (opcional)</label>
                <input
                  type="password"
                  className="input-field text-sm py-1.5"
                  autoComplete="off"
                  value={agentConn.agent_token}
                  onChange={(e) => setAgentConn((a) => ({ ...a, agent_token: e.target.value }))}
                  placeholder="PRINT_AGENT_TOKEN"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveLocalConnection()}
              disabled={savingAgent}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <MdSave className="text-base" /> {savingAgent ? 'Guardando…' : 'Guardar conexión local'}
            </button>
          </div>
          {agentHint ? (
            <div className="sm:col-span-2 text-[10px] text-[var(--ui-muted)] rounded border border-[color:var(--ui-border)] px-2 py-1.5 bg-[var(--ui-surface)]">
              <span className="inline-flex items-center gap-1 font-medium text-[var(--ui-body-text)]">
                <MdInfo className="text-sm" /> Agente
              </span>
              <span className="block mt-0.5">{agentHint}</span>
            </div>
          ) : null}
          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => void save()} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
              <MdSave className="text-base" /> Guardar impresora
            </button>
            <button
              type="button"
              onClick={() => void testPrint()}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
            >
              <MdPlayArrow className="text-base" /> Probar impresión
            </button>
            <button
              type="button"
              onClick={() => void detectPrinters()}
              disabled={detecting}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <MdRefresh className="text-base" /> {detecting ? 'Detectando…' : 'Detectar impresoras'}
            </button>
            <button
              type="button"
              onClick={() => void reconnectAgent()}
              disabled={statusLoading}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <MdWifiTethering className="text-base" /> Reconectar
            </button>
            <button
              type="button"
              onClick={() => void showAgentStatus()}
              disabled={statusLoading}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <MdInfo className="text-base" /> Ver estado
            </button>
            {form.printer_type === 'lan' ? (
              <button
                type="button"
                onClick={() => void validateIpOnly()}
                disabled={statusLoading}
                className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <MdCable className="text-base" /> Validar IP
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
