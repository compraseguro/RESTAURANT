import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { MdAdd, MdDelete, MdSave, MdContentCopy, MdQrCode2, MdUploadFile } from 'react-icons/md';
import CartasHorizontalCarousel from '../../components/CartasHorizontalCarousel';

function selfOrderUrlForTable(number) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/auto-pedido?mesa=${encodeURIComponent(String(number))}`;
}

export default function AutoPedidoAdmin() {
  const { user } = useAuth();
  const canSave = user?.role === 'admin';
  const [cartas, setCartas] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/admin-modules/auto-pedido/cartas'), api.get('/tables')])
      .then(([cData, tData]) => {
        setCartas(Array.isArray(cData.cartas) ? cData.cartas : []);
        setTables(Array.isArray(tData) ? tData : []);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addRow = () => {
    setCartas((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, name: `Carta ${prev.length + 1}`, url: '', sort: prev.length },
    ]);
  };

  const updateRow = (index, field, value) => {
    setCartas((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const removeRow = (index) => {
    setCartas((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadCartaFile = async (index, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canSave) return;
    const tid = toast.loading('Subiendo…');
    try {
      const { url } = await api.upload(file);
      updateRow(index, 'url', url || '');
      toast.success('Archivo aplicado a la carta', { id: tid });
    } catch (err) {
      toast.error(err.message || 'No se pudo subir', { id: tid });
    }
  };

  const save = async () => {
    if (!canSave) return;
    const tid = toast.loading('Guardando…');
    try {
      const normalized = cartas.map((c, i) => ({
        id: String(c.id || '').startsWith('tmp-') ? '' : c.id,
        name: c.name || `Carta ${i + 1}`,
        url: String(c.url || '').trim(),
        sort: i,
      }));
      const invalid = normalized.find((c) => !c.url);
      if (invalid) {
        toast.error('Cada carta debe tener una URL válida', { id: tid });
        return;
      }
      const data = await api.put('/admin-modules/auto-pedido/cartas', { cartas: normalized });
      setCartas(data.cartas || normalized);
      toast.success('Cartas guardadas', { id: tid });
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar', { id: tid });
    }
  };

  const copyLink = (num) => {
    const url = selfOrderUrlForTable(num);
    navigator.clipboard.writeText(url).then(() => toast.success('Enlace copiado')).catch(() => toast.error('No se pudo copiar'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MdQrCode2 className="text-[#2563EB]" />
          Auto pedido (QR)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Solo administradores ven esta pantalla. Los clientes, al escanear el QR, entran a <span className="font-mono text-slate-600">/auto-pedido?mesa=…</span>: solo ven la carta (deslizable) y el botón «Hacer pedido». Aquí configuras cartas, subes archivos y generas los QR por mesa.
        </p>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch">
          <div className="lg:w-[min(100%,420px)] shrink-0 rounded-xl border border-slate-200 bg-[#0f172a] overflow-hidden min-h-[280px] lg:min-h-[460px] flex flex-col">
            <CartasHorizontalCarousel cartas={cartas} className="flex-1 min-h-0" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-800">Cartas</h2>
              <div className="flex gap-2">
                <button type="button" onClick={addRow} className="btn-secondary text-sm inline-flex items-center gap-1">
                  <MdAdd /> Añadir
                </button>
                {canSave ? (
                  <button type="button" onClick={save} className="btn-primary text-sm inline-flex items-center gap-1">
                    <MdSave /> Guardar
                  </button>
                ) : null}
              </div>
            </div>
            {!canSave && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Solo un usuario administrador puede guardar cambios en las cartas.
              </p>
            )}
            <div className="space-y-3">
              {cartas.length === 0 && (
                <p className="text-slate-500 text-sm">No hay cartas. Añade una y sube un archivo o indica una URL.</p>
              )}
              {cartas.map((c, i) => (
                <div key={c.id || i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-lg p-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Nombre</label>
                    <input
                      className="input-field"
                      value={c.name}
                      onChange={(e) => updateRow(i, 'name', e.target.value)}
                      disabled={!canSave}
                    />
                  </div>
                  <div className="md:col-span-6">
                    <label className="block text-xs text-slate-500 mb-1">URL (imagen o PDF)</label>
                    <input
                      className="input-field font-mono text-sm"
                      value={c.url}
                      onChange={(e) => updateRow(i, 'url', e.target.value)}
                      placeholder="https://…, /cartas/… o /uploads/…"
                      disabled={!canSave}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <span className="block text-xs text-slate-500 mb-1">Archivo</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      id={`carta-upload-${i}`}
                      className="sr-only"
                      onChange={(e) => uploadCartaFile(i, e)}
                      disabled={!canSave}
                    />
                    <label
                      htmlFor={`carta-upload-${i}`}
                      className={`btn-secondary text-sm w-full inline-flex items-center justify-center gap-1 py-2 ${!canSave ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
                    >
                      <MdUploadFile className="text-lg shrink-0" />
                      Subir
                    </label>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      disabled={!canSave}
                      aria-label="Eliminar"
                    >
                      <MdDelete className="text-xl" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Enlaces y QR por mesa</h2>
        <p className="text-sm text-slate-500 mb-4">Imprime o muestra el QR en cada mesa. El cliente solo verá la vista de auto pedido.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((t) => {
            const url = selfOrderUrlForTable(t.number);
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
            return (
              <div key={t.id} className="border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center">
                <p className="font-semibold text-slate-800">{t.name}</p>
                <p className="text-xs text-slate-500 mb-2">Mesa {t.number}</p>
                <img src={qrSrc} alt="" className="w-40 h-40 mb-2 bg-white p-1 rounded" />
                <button
                  type="button"
                  onClick={() => copyLink(t.number)}
                  className="text-xs text-[#2563EB] inline-flex items-center gap-1 hover:underline"
                >
                  <MdContentCopy /> Copiar enlace
                </button>
              </div>
            );
          })}
        </div>
        {tables.length === 0 && <p className="text-slate-500 text-sm">No hay mesas configuradas. Créalas en Configuración → Salones y Mesas.</p>}
      </div>
    </div>
  );
}
