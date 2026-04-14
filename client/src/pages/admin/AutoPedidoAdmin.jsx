import { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { MdAdd, MdDelete, MdSave, MdContentCopy, MdQrCode2, MdUploadFile, MdRestaurantMenu } from 'react-icons/md';
import CartasHorizontalCarousel from '../../components/CartasHorizontalCarousel';
import Modal from '../../components/Modal';
import {
  parseMenuLines,
  buildMenuCartaSvgBlob,
  DEFAULT_MENU_CARTA_COLORS,
  normalizeHex,
} from '../../utils/generateMenuCartaSvg';

/** Editor con resaltado: líneas que empiezan (tras espacios) con # usan color de sección. */
function MenuCartaSyntaxEditor({ value, onChange, bgColor, textColor, sectionColor }) {
  const innerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.style.transform = `translateY(-${scrollTop}px)`;
    }
  }, [scrollTop, value, bgColor, textColor, sectionColor]);

  const lines = String(value ?? '').split(/\r?\n/);
  const hashLine = (line) => line.trimStart().startsWith('#');

  return (
    <div
      className="relative rounded-lg border border-slate-500 overflow-hidden shadow-inner"
      style={{ backgroundColor: bgColor }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
        <div ref={innerRef} className="p-3 font-mono text-sm leading-6 text-left will-change-transform">
          {lines.map((line, i) => (
            <div
              key={i}
              className="whitespace-pre-wrap break-words min-h-[1.5rem]"
              style={{ color: hashLine(line) ? sectionColor : textColor }}
            >
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        spellCheck={false}
        className="relative z-10 block w-full min-h-[220px] max-h-[min(52vh,420px)] p-3 font-mono text-sm leading-6 bg-transparent text-transparent resize-y overflow-auto border-0 outline-none focus:ring-2 focus:ring-sky-400/40 rounded-lg"
        style={{ caretColor: textColor }}
        placeholder=""
      />
    </div>
  );
}

const MENU_GEN_PLACEHOLDER = `# Entradas
Ceviche clásico  28
Wantán frito  18

# Platos fuertes
Lomo saltado  38
Ají de gallina  32

Postres
Helado de vainilla  10`;

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
  const [genOpenIndex, setGenOpenIndex] = useState(null);
  const [genTitle, setGenTitle] = useState('Nuestra carta');
  const [genText, setGenText] = useState(MENU_GEN_PLACEHOLDER);
  const [genPreviewUrl, setGenPreviewUrl] = useState('');
  const [genColors, setGenColors] = useState(() => ({ ...DEFAULT_MENU_CARTA_COLORS }));

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

  useEffect(() => {
    if (genOpenIndex === null) return undefined;
    const rows = parseMenuLines(genText);
    const blob = buildMenuCartaSvgBlob({
      rows,
      title: genTitle.trim() || 'Nuestra carta',
      colors: genColors,
    });
    const url = URL.createObjectURL(blob);
    setGenPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [genOpenIndex, genText, genTitle, genColors]);

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

  const openGenerator = (index) => {
    setGenTitle('Nuestra carta');
    setGenText(MENU_GEN_PLACEHOLDER);
    setGenColors({ ...DEFAULT_MENU_CARTA_COLORS });
    setGenOpenIndex(index);
  };

  const closeGenerator = () => {
    setGenOpenIndex(null);
    setGenPreviewUrl('');
  };

  const applyGeneratedCarta = async () => {
    if (!canSave || genOpenIndex === null) return;
    const rows = parseMenuLines(genText);
    if (!rows.some((r) => r.kind === 'item')) {
      toast.error('Añade al menos una línea con precio al final (ej. Lomo saltado  35)');
      return;
    }
    const tid = toast.loading('Generando y subiendo…');
    try {
      const blob = buildMenuCartaSvgBlob({
        rows,
        title: genTitle.trim() || 'Nuestra carta',
        colors: genColors,
      });
      const file = new File([blob], `carta-${Date.now()}.svg`, { type: 'image/svg+xml' });
      const { url } = await api.upload(file);
      updateRow(genOpenIndex, 'url', url || '');
      toast.success('Carta generada aplicada. Pulsa Guardar para persistir.', { id: tid });
      closeGenerator();
    } catch (err) {
      toast.error(err.message || 'No se pudo subir la carta', { id: tid });
    }
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
                  <div className="md:col-span-12 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openGenerator(i)}
                      className="text-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 font-medium disabled:opacity-50"
                      disabled={!canSave}
                    >
                      <MdRestaurantMenu className="text-lg" />
                      Generar carta desde texto (platos y precios)
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

      <Modal
        isOpen={genOpenIndex !== null}
        onClose={closeGenerator}
        title="Generar carta desde texto"
        size="lg"
        variant="light"
      >
        <div className="space-y-4 text-slate-800">
          <p className="text-sm text-slate-600">
            Escribe cada plato en una línea y el precio al final (con o sin <span className="font-mono">S/</span>). Usa líneas con{' '}
            <span className="font-mono">#</span> o solo texto sin número para títulos de sección (ej. «Postres»).
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Título de la carta</label>
            <input
              className="input-field"
              value={genTitle}
              onChange={(e) => setGenTitle(e.target.value)}
              placeholder="Nuestra carta"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Colores de la carta (también en la vista previa)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Fondo
                <input
                  type="color"
                  value={normalizeHex(genColors.bg, DEFAULT_MENU_CARTA_COLORS.bg)}
                  onChange={(e) => setGenColors((c) => ({ ...c, bg: e.target.value }))}
                  className="h-9 w-full min-w-0 rounded border border-slate-300 cursor-pointer bg-white p-0.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Texto (platos)
                <input
                  type="color"
                  value={normalizeHex(genColors.text, DEFAULT_MENU_CARTA_COLORS.text)}
                  onChange={(e) => setGenColors((c) => ({ ...c, text: e.target.value }))}
                  className="h-9 w-full min-w-0 rounded border border-slate-300 cursor-pointer bg-white p-0.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Líneas con # (secciones)
                <input
                  type="color"
                  value={normalizeHex(genColors.section, DEFAULT_MENU_CARTA_COLORS.section)}
                  onChange={(e) => setGenColors((c) => ({ ...c, section: e.target.value }))}
                  className="h-9 w-full min-w-0 rounded border border-slate-300 cursor-pointer bg-white p-0.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Precios
                <input
                  type="color"
                  value={normalizeHex(genColors.price, DEFAULT_MENU_CARTA_COLORS.price)}
                  onChange={(e) => setGenColors((c) => ({ ...c, price: e.target.value }))}
                  className="h-9 w-full min-w-0 rounded border border-slate-300 cursor-pointer bg-white p-0.5"
                />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Contenido</label>
              <p className="text-[11px] text-slate-500 mb-1">
                Las líneas que empiezan con <span className="font-mono">#</span> se ven en color de «secciones» mientras escribes.
              </p>
              <MenuCartaSyntaxEditor
                value={genText}
                onChange={setGenText}
                bgColor={normalizeHex(genColors.bg, DEFAULT_MENU_CARTA_COLORS.bg)}
                textColor={normalizeHex(genColors.text, DEFAULT_MENU_CARTA_COLORS.text)}
                sectionColor={normalizeHex(genColors.section, DEFAULT_MENU_CARTA_COLORS.section)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Vista previa</label>
              <div
                className="rounded-xl border border-slate-200 min-h-[220px] flex items-center justify-center p-2 overflow-hidden"
                style={{ backgroundColor: normalizeHex(genColors.bg, DEFAULT_MENU_CARTA_COLORS.bg) }}
              >
                {genPreviewUrl ? (
                  <img
                    src={genPreviewUrl}
                    alt="Vista previa de la carta generada"
                    className="max-w-full max-h-[min(360px,50vh)] w-auto h-auto object-contain rounded-lg"
                  />
                ) : (
                  <p className="text-slate-500 text-sm px-4 text-center">Escribe platos y precios para ver la vista previa</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-200">
            <button type="button" onClick={closeGenerator} className="btn-secondary text-sm">
              Cerrar
            </button>
            <button type="button" onClick={applyGeneratedCarta} className="btn-primary text-sm" disabled={!canSave}>
              Subir y aplicar a «{genOpenIndex !== null ? cartas[genOpenIndex]?.name || 'esta carta' : ''}»
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
