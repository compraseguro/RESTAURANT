import { MdClose } from 'react-icons/md';

/**
 * Modales centrados por defecto (misma sensación que el flujo de pedidos).
 * Tema oscuro por defecto para alinear con body / Mesas; usa variant="light" en rutas de cliente.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  placement = 'center',
  variant = 'dark',
  containerClassName = '',
  headerClassName = '',
  titleClassName = '',
  closeButtonClassName = '',
  closeIconClassName = '',
}) {
  if (!isOpen) return null;

  const isLight = variant === 'light';

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }[size];

  const placementClass = placement === 'right' ? 'justify-end' : 'justify-center';

  const overlayClass = isLight ? 'bg-slate-900/70' : 'bg-black/75';

  const panelClass = isLight
    ? 'border border-slate-300 bg-[#F1F5F9] shadow-xl text-slate-900'
    : 'border border-[#3B82F6]/40 bg-[#1F2937] shadow-2xl shadow-black/50';

  const headerDefault = isLight
    ? 'border-b border-slate-200 bg-[#F8FAFC] text-slate-900'
    : 'border-b border-[#3B82F6]/30 bg-[#111827]';

  const titleDefault = isLight ? 'text-slate-900' : 'text-[#F9FAFB]';

  const closeDefault = isLight ? 'hover:bg-slate-200' : 'hover:bg-[#374151]';

  const closeIconDefault = isLight ? 'text-slate-500' : 'text-[#9CA3AF]';

  const bodyClass = isLight
    ? 'overflow-y-auto p-6 flex-1 bg-[#F1F5F9] text-slate-800 [&_strong]:text-slate-900'
    : 'overflow-y-auto p-6 flex-1 bg-[#1F2937] modal-sheet-body';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center ${placementClass} p-4 ${containerClassName}`}
      onClick={onClose}
      role="presentation"
    >
      <div className={`fixed inset-0 ${overlayClass}`} aria-hidden />
      <div
        className={`relative rounded-2xl w-full ${sizeClass} max-h-[90vh] flex flex-col overflow-hidden ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null && title !== '' ? 'modal-title' : undefined}
      >
        <div
          className={`flex items-center justify-between px-6 py-4 shrink-0 ${headerClassName || headerDefault}`}
        >
          {title != null && title !== '' ? (
            <h2 id="modal-title" className={`text-lg font-bold ${titleClassName || titleDefault}`}>
              {title}
            </h2>
          ) : (
            <span className="sr-only">Diálogo</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${closeButtonClassName || closeDefault}`}
            aria-label="Cerrar"
          >
            <MdClose className={`text-xl ${closeIconClassName || closeIconDefault}`} />
          </button>
        </div>
        <div className={bodyClass}>{children}</div>
      </div>
    </div>
  );
}
