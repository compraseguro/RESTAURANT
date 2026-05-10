import { useRef } from 'react';
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
 * Misma vista que Mi Restaurante → Contrato: texto + firmas comprador/vendedor.
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

  const patch = (partial) => onChange({ ...merged, ...partial });

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

      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-4 space-y-3">
        <div className="flex items-center gap-2 text-[var(--ui-body-text)]">
          <MdDescription className="text-xl text-[var(--ui-accent-muted)] shrink-0" />
          <div>
            <p className="font-medium text-sm">Documento Word (.doc / .docx)</p>
            <p className="text-xs text-[var(--ui-muted)]">Suba el contrato formal; límite 15 MB.</p>
          </div>
        </div>
        {merged.documento_word_url ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--ui-body-text)] truncate max-w-full" title={merged.documento_word_nombre}>
              {merged.documento_word_nombre || 'Contrato.docx'}
            </span>
            <a
              href={resolveMediaUrl(merged.documento_word_url)}
              download
              target="_blank"
              rel="noreferrer"
              className="text-sm inline-flex items-center gap-1 text-[var(--ui-accent-muted)] hover:underline"
            >
              <MdDownload className="text-base" /> Descargar
            </a>
            {canEdit ? (
              <button
                type="button"
                className="text-sm text-red-600 hover:underline"
                onClick={() => patch({ documento_word_url: '', documento_word_nombre: '' })}
              >
                Quitar archivo
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[var(--ui-muted)]">No hay documento cargado.</p>
        )}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm py-2 inline-flex items-center gap-2"
              onClick={() => wordInputRef.current?.click()}
            >
              <MdUploadFile className="text-lg" /> Cargar Word
            </button>
            <input
              ref={wordInputRef}
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => uploadWordDoc(e.target.files?.[0])}
            />
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--ui-body-text)] mb-1">Texto de referencia (opcional)</p>
        <p className="text-xs text-[var(--ui-muted)] mb-2">Puede dejar en blanco si el contrato oficial está solo en el Word.</p>
        <textarea
          className={`input-field min-h-[160px] font-sans text-sm leading-relaxed ${!canEdit ? 'opacity-90 cursor-default' : ''}`}
          rows={6}
          readOnly={!canEdit}
          placeholder={canEdit ? 'Resumen o borrador en texto plano…' : ''}
          value={merged.texto_contrato || ''}
          onChange={(e) => patch({ texto_contrato: e.target.value })}
        />
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
