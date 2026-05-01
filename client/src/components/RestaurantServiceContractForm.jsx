import { useRef } from 'react';
import { api, resolveMediaUrl } from '../utils/api';
import toast from 'react-hot-toast';

const EMPTY_CONTRATO = { texto_contrato: '', firma_comprador_url: '', firma_vendedor_url: '' };

export function normalizeContratoFromApi(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CONTRATO };
  return {
    texto_contrato: String(raw.texto_contrato ?? raw.observations ?? '').trim(),
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

  const patch = (partial) => onChange({ ...merged, ...partial });

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
      <textarea
        className={`input-field min-h-[280px] font-sans text-sm leading-relaxed ${!canEdit ? 'bg-slate-100 cursor-default' : ''}`}
        rows={12}
        readOnly={!canEdit}
        placeholder={canEdit ? 'Escribe aquí el contrato completo…' : ''}
        value={merged.texto_contrato || ''}
        onChange={(e) => patch({ texto_contrato: e.target.value })}
      />
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
