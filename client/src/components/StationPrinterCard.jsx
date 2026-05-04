import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdInfo } from 'react-icons/md';
import {
  getPrintServiceBaseUrl,
  setPrintServiceBaseUrl,
  getStationPrinterConfig,
  setStationPrinterConfig,
  isThermalLanIp,
} from '../utils/localPrinterStorage';
import { sendEscPosToStation } from '../utils/cajaThermalPrint';

const TITLES = {
  cocina: 'Impresora de cocina',
  bar: 'Impresora de bar',
  caja: 'Impresora de caja (precuentas)',
  delivery: 'Impresora de delivery (reportes)',
};

/**
 * Configuración local (navegador) por estación + URL del microservicio de impresión en este PC.
 */
export default function StationPrinterCard({ station, userRole, hideHeading = false, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [serviceUrl, setServiceUrl] = useState('http://127.0.0.1:3049');
  const [form, setForm] = useState({
    ip: '',
    port: 9100,
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

  const load = useCallback(() => {
    setLoading(true);
    try {
      setServiceUrl(getPrintServiceBaseUrl());
      const c = getStationPrinterConfig(station);
      setForm({
        ip: c.ip,
        port: c.port,
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

  const saveStation = () => {
    if (!canEdit) return;
    if (![58, 80].includes(Number(form.width_mm))) {
      toast.error('Ancho debe ser 58 u 80 mm');
      return;
    }
    const ip = String(form.ip || '').trim();
    if (ip && !isThermalLanIp(ip)) {
      toast.error('Use una IP de red local válida (no placeholders tipo 192.168.x.x).');
      return;
    }
    setStationPrinterConfig(station, {
      ip,
      port: form.port,
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
    if (r.ok) toast.success('Prueba enviada al servicio local');
    else toast.error(r.error || 'Revise IP, puerto y que el microservicio esté en ejecución');
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
          IP: {form.ip || '—'} · Puerto {form.port} · Ancho {form.width_mm} mm
          {showAutoPrint ? <> · Auto {Number(form.auto_print) === 1 ? 'sí' : 'no'}</> : null}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-2 py-2 text-[10px] text-[var(--ui-muted)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--ui-body-text)]">
              <MdInfo className="text-sm" /> Microservicio local
            </span>
            <p className="mt-1 leading-snug">
              Ejecute en este PC: <code className="rounded bg-[var(--ui-surface-2)] px-1">npm run print-service</code> en la raíz del
              proyecto (puerto por defecto 3049). Puede registrar el inicio automático con{' '}
              <code className="rounded bg-[var(--ui-surface-2)] px-1">scripts/install-print-service-startup.ps1</code>.
            </p>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mt-2 mb-0.5">URL del servicio de impresión</label>
            <input
              type="url"
              className="input-field text-sm py-1.5 w-full"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value.trim())}
              placeholder="http://127.0.0.1:3049"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">IP de la térmica (RAW)</label>
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
