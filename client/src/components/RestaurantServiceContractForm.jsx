import { useRef, useState, useEffect, useMemo } from 'react';
import mammoth from 'mammoth';
import { MdUploadFile, MdDownload, MdDescription } from 'react-icons/md';
import { api, resolveMediaUrl } from '../utils/api';
import toast from 'react-hot-toast';

const EMPTY_CONTRATO = {
  texto_contrato: '',
  documento_word_url: '',
  documento_word_nombre: '',
  firma_comprador_url: '',
  firma_vendedor_url: '',
};

/** HTML de mammoth: imagen de portada al inicio → fondo con texto encima (como en Word). */
function htmlHasLeadingFullBleedImage(html) {
  const s = String(html || '').trim();
  if (!s) return false;
  if (/^<p\b[^>]*>\s*<img\b/i.test(s)) return true;
  if (/^<img\b/i.test(s)) return true;
  if (/^<figure\b[^>]*>\s*<img\b/i.test(s)) return true;
  return false;
}

function wordFileKind(url, nombre) {
  const n = String(nombre || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (n.endsWith('.docx') || /\.docx(\?|#|$)/.test(u)) return 'docx';
  if ((n.endsWith('.doc') && !n.endsWith('.docx')) || /\.doc(\?|#|$)/.test(u)) return 'doc';
  return '';
}

export function normalizeContratoFromApi(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CONTRATO };
  return {
    texto_contrato: String(raw.texto_contrato ?? raw.observations ?? '').trim(),
    documento_word_url: String(raw.documento_word_url || '').trim(),
    documento_word_nombre: String(raw.documento_word_nombre || '').trim(),
    firma_comprador_url: String(raw.firma_comprador_url || '').trim(),
    firma_vendedor_url: String(raw.firma_vendedor_url || '').trim(),
  };
}

/**
 * Contrato: documento Word con vista previa (.docx) + firmas.
 */
export default function RestaurantServiceContractForm({
  contrato,
  canEdit,
  onChange,
  cardClassName = 'rounded-xl shadow-sm border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-6 space-y-5',
}) {
  const merged = { ...EMPTY_CONTRATO, ...contrato };
  const firmaCompradorInputRef = useRef(null);
  const firmaVendedorInputRef = useRef(null);
  const wordInputRef = useRef(null);

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewNote, setPreviewNote] = useState('');

  const imageUnderTextLayout = useMemo(() => htmlHasLeadingFullBleedImage(previewHtml), [previewHtml]);

  const patch = (partial) => onChange({ ...merged, ...partial });

  useEffect(() => {
    let cancelled = false;
    const url = String(merged.documento_word_url || '').trim();
    const nombre = merged.documento_word_nombre || '';
    if (!url) {
      setPreviewHtml('');
      setPreviewNote('');
      setPreviewLoading(false);
      return undefined;
    }

    const kind = wordFileKind(url, nombre);
    if (kind === 'doc') {
      setPreviewHtml('');
      setPreviewNote(
        'La vista previa integrada solo admite .docx. Descargue el archivo para abrirlo en Word.'
      );
      setPreviewLoading(false);
      return undefined;
    }
    if (kind !== 'docx') {
      setPreviewHtml('');
      setPreviewNote(
        'No se detectó un .docx. Guarde el contrato como .docx o use Descargar para abrirlo.'
      );
      setPreviewLoading(false);
      return undefined;
    }

    const fullUrl = resolveMediaUrl(url);
    setPreviewLoading(true);
    setPreviewNote('');

    (async () => {
      try {
        const res = await fetch(fullUrl, { credentials: 'omit' });
        if (!res.ok) throw new Error(`No se pudo obtener el documento (${res.status})`);
        const buf = await res.arrayBuffer();
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) {
          setPreviewHtml(html || '<p>(Documento sin texto reconocible)</p>');
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewHtml('');
          setPreviewNote(e.message || 'No se pudo generar la vista previa. Use Descargar para abrir el archivo.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [merged.documento_word_url, merged.documento_word_nombre]);

  const uploadWordDoc = async (file) => {
    if (!file) return;
    if (!canEdit) {
      toast.error('No tienes permiso para subir el contrato.');
      return;
    }
    const name = String(file.name || '');
    const lower = name.toLowerCase();
    if (!lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      toast.error('Use un archivo Word (.doc o .docx)');
      return;
    }
    try {
      const uploaded = await api.upload(file);
      const url = uploaded?.url || '';
      patch({
        documento_word_url: url,
        documento_word_nombre: name || 'contrato.docx',
      });
      toast.success('Documento cargado. Pulse Guardar cambios para conservarlo.');
    } catch (err) {
      toast.error(err.message || 'No se pudo subir el documento');
    } finally {
      if (wordInputRef.current) wordInputRef.current.value = '';
    }
  };

  const uploadFirma = async (file, field) => {
    if (!file) return;
    if (!canEdit) {
      toast.error('No tienes permiso para subir firmas.');
      return;
    }
    try {
      const uploaded = await api.upload(file);
      const url = uploaded?.url || '';
      patch({ [field]: url });
      toast.success('Firma cargada. Pulsa Guardar cambios para conservarla.');
    } catch (err) {
      toast.error(err.message || 'No se pudo subir la imagen');
    } finally {
      if (field === 'firma_comprador_url' && firmaCompradorInputRef.current) firmaCompradorInputRef.current.value = '';
      if (field === 'firma_vendedor_url' && firmaVendedorInputRef.current) firmaVendedorInputRef.current.value = '';
    }
  };

  return (
    <div className={cardClassName}>
      <h3 className="font-bold text-[var(--ui-body-text)] text-lg">Contrato del servicio</h3>

      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--ui-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <MdDescription className="text-xl text-[var(--ui-accent-muted)] shrink-0" />
            <p className="font-bold text-[var(--ui-body-text)] tracking-wide">CONTRATO</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {merged.documento_word_url ? (
              <>
                <span
                  className="text-xs text-[var(--ui-muted)] truncate max-w-[200px] sm:max-w-xs"
                  title={merged.documento_word_nombre}
                >
                  {merged.documento_word_nombre || 'documento'}
                </span>
                <a
                  href={resolveMediaUrl(merged.documento_word_url)}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2 py-1.5 inline-flex items-center gap-1 text-[var(--ui-accent-muted)] hover:underline"
                >
                  <MdDownload className="text-base" /> Descargar
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => patch({ documento_word_url: '', documento_word_nombre: '' })}
                  >
                    Quitar archivo
                  </button>
                ) : null}
              </>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1"
                  onClick={() => wordInputRef.current?.click()}
                >
                  <MdUploadFile className="text-base" /> Cargar Word
                </button>
                <input
                  ref={wordInputRef}
                  type="file"
                  accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => uploadWordDoc(e.target.files?.[0])}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="contract-page-scroll border-t border-[color:var(--ui-border)]">
          {!merged.documento_word_url ? (
            <div className="flex flex-col items-center justify-center min-h-[240px] text-center text-[var(--ui-muted)] text-sm gap-2 px-4 py-8">
              <p>No hay documento cargado.</p>
              {canEdit ? (
                <p className="text-xs">Use <strong className="text-[var(--ui-body-text)]">Cargar Word</strong> arriba (.doc / .docx, hasta 15 MB).</p>
              ) : null}
            </div>
          ) : previewLoading ? (
            <div className="flex justify-center py-16 text-[var(--ui-muted)] text-sm">Generando vista previa…</div>
          ) : previewNote && !previewHtml ? (
            <p className="text-sm text-[var(--ui-muted)] leading-relaxed px-4 py-6">{previewNote}</p>
          ) : (
            <>
              {previewNote ? (
                <p className="text-xs text-amber-500/90 px-4 pt-3 max-w-[210mm] mx-auto">{previewNote}</p>
              ) : null}
              <div className="contract-page-canvas">
                <div
                  className={`contract-mammoth-preview contract-mammoth-preview--page ${imageUnderTextLayout ? 'contract-mammoth-preview--image-under-text' : ''}`}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[color:var(--ui-border)]">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--ui-body-text)]">Firma del comprador</p>
          <div className="rounded-lg border-2 border-dashed border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] min-h-[120px] flex items-center justify-center overflow-hidden">
            {merged.firma_comprador_url ? (
              <img
                src={resolveMediaUrl(merged.firma_comprador_url)}
                alt="Firma comprador"
                className="max-h-32 max-w-full object-contain p-2"
              />
            ) : (
              <span className="text-xs text-[var(--ui-muted)] px-4 text-center">Sin imagen</span>
            )}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary text-sm py-2"
                onClick={() => firmaCompradorInputRef.current?.click()}
              >
                Cargar imagen
              </button>
              <input
                ref={firmaCompradorInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => uploadFirma(e.target.files?.[0], 'firma_comprador_url')}
              />
              {merged.firma_comprador_url ? (
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => patch({ firma_comprador_url: '' })}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--ui-body-text)]">Firma del vendedor</p>
          <div className="rounded-lg border-2 border-dashed border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] min-h-[120px] flex items-center justify-center overflow-hidden">
            {merged.firma_vendedor_url ? (
              <img
                src={resolveMediaUrl(merged.firma_vendedor_url)}
                alt="Firma vendedor"
                className="max-h-32 max-w-full object-contain p-2"
              />
            ) : (
              <span className="text-xs text-[var(--ui-muted)] px-4 text-center">Sin imagen</span>
            )}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary text-sm py-2"
                onClick={() => firmaVendedorInputRef.current?.click()}
              >
                Cargar imagen
              </button>
              <input
                ref={firmaVendedorInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => uploadFirma(e.target.files?.[0], 'firma_vendedor_url')}
              />
              {merged.firma_vendedor_url ? (
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => patch({ firma_vendedor_url: '' })}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
