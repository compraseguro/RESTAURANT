import { MdClose } from 'react-icons/md';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  containerClassName = '',
  headerClassName = '',
  titleClassName = '',
  closeButtonClassName = '',
  closeIconClassName = '',
}) {
  if (!isOpen) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }[size];
  const hasCustomJustify = /\bjustify-(start|end|center|between|around|evenly)\b/.test(containerClassName);
  const justifyClass = hasCustomJustify ? '' : 'justify-center';

  return (
    <div className={`fixed inset-0 z-50 flex items-center ${justifyClass} p-4 ${containerClassName}`} onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${sizeClass} max-h-[90vh] flex flex-col border border-slate-200`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-6 py-4 border-b border-slate-100 ${headerClassName}`}>
          <h2 className={`text-lg font-bold text-slate-800 ${titleClassName}`}>{title}</h2>
          <button onClick={onClose} className={`p-2 hover:bg-slate-100 rounded-lg transition-colors ${closeButtonClassName}`}>
            <MdClose className={`text-xl text-slate-400 ${closeIconClassName}`} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
