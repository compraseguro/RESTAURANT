import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { MdSave, MdPlayArrow, MdRefresh, MdSearch } from 'react-icons/md';
import {
  fetchPrintConfig,
  savePrintConfig,
  fetchUsbPrinters,
  scanNetworkPrinters,
  executePrint,
} from '../services/printBridge';
const TITLES = {
  cocina: 'Impresora de cocina',
  bar: 'Impresora de bar',
  caja: 'Impresora de caja (precuentas)',
  delivery: 'Impresora de delivery (reportes)',
};

function defaultStationForm() {
  return {
    tipo: 'red',
    nombre: '',
    ip: '',
    puerto: 9100,
    autoPrint: true,
    widthMm: 80,
    copies: 1,
  };
}

export default function StationPrinterCard({ station, userRole, hideHeading = false, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullConfig, setFullConfig] = useState(null);
  const [form, setForm] = useState(defaultStationForm);
  const [usbList, setUsbList] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [lanHits, setLanHits] = useState([]);

  const canEdit =
    userRole === 'admin' ||
    userRole === 'master_admin' ||
    (userRole === 'cocina' && station === 'cocina') ||
    (userRole === 'bar' && station === 'bar') ||
    (userRole === 'cajero' && station === 'caja') ||
    (userRole === 'delivery' && station === 'delivery');

  const showAutoPrint = station !== 'caja';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetchPrintConfig();
      setFullConfig(cfg);
      const s = cfg[station] || defaultStationForm();
      setForm({
        tipo: s.tipo === 'usb' ? 'usb' : 'red',
        nombre: String(s.nombre || ''),
        ip: String(s.ip || ''),
        puerto: Math.min(65535, Math.max(1, Number(s.puerto || 9100) || 9100)),
        autoPrint: s.autoPrint !== false,
        widthMm: [58, 80].includes(Number(s.widthMm)) ? Number(s.widthMm) : 80,
        copies: Math.min(5, Math.max(1, Number(s.copies || 1))),
      });
    } catch (e) {
      toast.error(e?.message || 'No se pudo cargar la configuración');
      setForm(defaultStationForm());
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async () => {
    if (!canEdit || !fullConfig) return;
    setSaving(true);
    try {
      const next = {
        ...fullConfig,
        [station]: {
          tipo: form.tipo,
          nombre: form.tipo === 'usb' ? String(form.nombre || '').trim() : '',
          ip: form.tipo === 'red' ? String(form.ip || '').trim() : '',
          puerto: form.tipo === 'red' ? form.puerto : 9100,
          autoPrint: showAutoPrint ? form.autoPrint : true,
          widthMm: form.widthMm,
          copies: form.copies,
        },
      };
      const saved = await savePrintConfig(next);
      setFullConfig(saved);
      toast.success('Guardado');
    } catch (e) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const detectUsb = async () => {
    try {
      const r = await fetchUsbPrinters();
      const list = Array.isArray(r.printers) ? r.printers : [];
      setUsbList(list);
      toast.success(list.length ? `${list.length} cola(s) Windows` : 'Sin impresoras');
    } catch (e) {
      toast.error(e?.message || 'No se pudo listar');
    }
  };

  const runLanScan = async () => {
    setScanning(true);
    setLanHits([]);
    try {
      const r = await scanNetworkPrinters({});
      const c = Array.isArray(r.candidates) ? r.candidates : [];
      setLanHits(c);
      if (!c.length) {
        toast.error(r.hint || 'Sin térmicas detectadas en esta red');
        return;
      }
      toast.success(`${c.length} destino(s) en LAN`);
    } catch (e) {
      toast.error(e?.message || 'Error al escanear');
    } finally {
      setScanning(false);
    }
  };

  const testPrint = async () => {
    const now = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const text = ['*** PRUEBA ***', TITLES[station] || station, now, ''].join('\n');
    try {
      await executePrint({
        station,
        text,
        copies: 1,
        widthMm: form.widthMm,
      });
      toast.success('Enviado');
    } catch (e) {
      toast.error(e?.message || 'Falló');
    }
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
          {form.tipo === 'usb' ? form.nombre || '—' : `${form.ip || '—'}:${form.puerto}`} · {form.widthMm} mm
          {showAutoPrint ? <> · Auto {form.autoPrint ? 'sí' : 'no'}</> : null}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] text-[var(--ui-muted)]">
            La impresión se ejecuta en el servidor Node (Windows recomendado). Despliegue API+front en el mismo PC que las térmicas, o use una
            VM/servidor local.
          </p>

          <div>
            <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Tipo</label>
            <select
              className="input-field text-sm py-1.5 w-full"
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
            >
              <option value="red">Red (IP RAW, ej. 9100)</option>
              <option value="usb">USB / cola Windows (RAW)</option>
            </select>
          </div>

          {form.tipo === 'red' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">IP</label>
                <input
                  className="input-field text-sm py-1.5"
                  value={form.ip}
                  onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value.trim() }))}
                  placeholder="192.168.1.50"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Puerto</label>
                <input
                  type="number"
                  className="input-field text-sm py-1.5"
                  min={1}
                  max={65535}
                  value={form.puerto}
                  onChange={(e) => setForm((f) => ({ ...f, puerto: Number(e.target.value) || 9100 }))}
                />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runLanScan()}
                  disabled={scanning}
                  className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                >
                  <MdSearch className="text-base" /> {scanning ? '…' : 'Escanear red'}
                </button>
              </div>
              {lanHits.length > 0 ? (
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Detectados</label>
                  <select
                    className="input-field text-sm py-1.5 w-full"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const [ip, port] = v.split(':');
                      setForm((f) => ({ ...f, ip, puerto: Number(port) || 9100 }));
                    }}
                  >
                    <option value="">— Elegir IP —</option>
                    {lanHits.map((h) => (
                      <option key={`${h.ip}:${h.port}`} value={`${h.ip}:${h.port}`}>
                        {h.ip}:{h.port}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void detectUsb()}
                  className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                >
                  <MdRefresh className="text-base" /> Detectar impresoras
                </button>
              </div>
              {usbList.length > 0 ? (
                <select
                  className="input-field text-sm py-1.5 w-full"
                  value={usbList.includes(form.nombre) ? form.nombre : ''}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                >
                  <option value="">— Elegir —</option>
                  {usbList.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : null}
              <div>
                <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Nombre exacto en Windows</label>
                <input
                  className="input-field text-sm py-1.5 w-full"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre de la cola"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-[var(--ui-muted)] mb-0.5">Ancho mm</label>
              <select
                className="input-field text-sm py-1.5"
                value={form.widthMm}
                onChange={(e) => setForm((f) => ({ ...f, widthMm: Number(e.target.value) }))}
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
                    checked={form.autoPrint}
                    onChange={(e) => setForm((f) => ({ ...f, autoPrint: e.target.checked }))}
                  />
                  Auto al recibir pedido (servidor)
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persist()}
              className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
            >
              <MdSave className="text-base" /> {saving ? '…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => void testPrint()}
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
            >
              <MdPlayArrow className="text-base" /> Probar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
