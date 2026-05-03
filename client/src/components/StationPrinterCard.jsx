import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdRefresh } from 'react-icons/md';
import { shouldTryServerNetworkPrint, hasThermalDestination } from '../utils/networkPrinter';
import { isLocalPrintAgentConfigured, fetchAgentPrinters } from '../utils/localPrintAgent';
import { sendEscPosToStation } from '../utils/cajaThermalPrint';

const TITLES = {
  cocina: 'Impresora de cocina',
  bar: 'Impresora de bar',
  caja: 'Impresora de caja (precuentas)',
};

function formToPrinterStub(form) {
  const ip = String(form.ip_address || '').trim();
  const pt = String(form.printer_type || 'lan').toLowerCase();
  return {
    ip_address: ip,
    port: form.port,
    copies: form.copies,
    printer_type: pt,
    local_printer_name: String(form.local_printer_name || '').trim(),
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
    (userRole === 'cocina' && station === 'cocina') ||
    (userRole === 'bar' && station === 'bar') ||
    (userRole === 'cajero' && station === 'caja');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/orders/print-config')
      .then((c) => {
        setPrintCfg(c);
        const p = c?.printers?.[station];
        if (p) {
          const pt = String(p.printer_type || 'lan').toLowerCase();
          setForm({
            ip_address: String(p.ip_address || ''),
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

  const save = async () => {
    if (!canEdit) return;
    try {
      await api.put(`/orders/printer-station/${station}`, {
        ip_address: form.ip_address,
        port: form.port,
        copies: form.copies,
        auto_print: form.auto_print,
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
      toast.error('Configure primero la URL del print-agent en Configuración → Impresoras');
      return;
    }
    setDetecting(true);
    try {
      const list = await fetchAgentPrinters(pa.base_url);
      if (!list.length) {
        toast.error('No se detectaron impresoras en este equipo (o el agente no tiene permisos).');
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
    toast.error('Indique IP (red RAW) o nombre de impresora USB, y la URL del print-agent en Configuración.');
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

  return (
    <div className={shellClass}>
      {!hideHeading ? (
        <p className="font-semibold text-[var(--ui-body-text)] mb-2">{TITLES[station] || station}</p>
      ) : null}
      {!canEdit ? (
        <p className="text-xs text-[var(--ui-muted)]">
          IP: {form.ip_address || '—'} · USB: {form.local_printer_name || '—'} · Puerto {form.port} · Auto{' '}
          {Number(form.auto_print) === 1 ? 'sí' : 'no'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Conexión</label>
            <select
              className="input-field text-sm py-1.5"
              value={form.printer_type}
              onChange={(e) => setForm((f) => ({ ...f, printer_type: e.target.value }))}
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
          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => void save()} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
              <MdSave className="text-base" /> Guardar
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
          </div>
        </div>
      )}
    </div>
  );
}
