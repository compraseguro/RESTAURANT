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
        <p className="text-sm text-[#D1D5DB]">
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
                  ? 'border-[#3B82F6] bg-[#2563EB]/25 text-[#BFDBFE]'
                  : 'border-[#3B82F6]/30 hover:border-[#60A5FA] text-[#E5E7EB]'
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
