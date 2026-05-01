import Modal from './Modal';

export default function StaffModifierPromptModal({
  open,
  onClose,
  modifierPrompt,
  setModifierPrompt,
  onConfirm,
  onSkipOptional,
}) {
  const modifier = modifierPrompt.modifier;
  const product = modifierPrompt.product;
  const required = Number(modifier?.required || 0) === 1;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Seleccionar ${modifier?.name || 'modificador'}`}
      size="sm"
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--ui-body-text)]">
          {product?.name || 'Producto'} · {required ? 'Obligatorio' : 'Opcional'}
        </p>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {(modifier?.options || []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setModifierPrompt((prev) => ({ ...prev, selectedOption: opt }))}
              className={`w-full px-3 py-2 rounded-lg border text-left text-sm ${
                modifierPrompt.selectedOption === opt
                  ? 'border-[color:var(--ui-accent)] bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)]'
                  : 'border-[color:var(--ui-border)] hover:border-[var(--ui-accent)] text-[var(--ui-body-text)]'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {!required && (
            <button type="button" onClick={onSkipOptional} className="btn-secondary flex-1">
              Sin opción
            </button>
          )}
          <button type="button" onClick={onConfirm} className="btn-primary flex-1">
            Añadir al pedido
          </button>
        </div>
      </div>
    </Modal>
  );
}
