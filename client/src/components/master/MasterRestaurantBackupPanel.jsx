import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MdDownload, MdUpload, MdRestartAlt } from 'react-icons/md';
import { api } from '../../utils/api';
import Modal from '../Modal';

/**
 * Respaldo / restauración / reinicio operativo (solo administrador maestro en API).
 * @param {{ onAfterMutate?: () => void | Promise<void>, cardClassName?: string, textTone?: 'theme' | 'slate' }} props
 */
export default function MasterRestaurantBackupPanel({ onAfterMutate, cardClassName = 'card space-y-4', textTone = 'theme' }) {
  const restoreInputRef = useRef(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const runAfterMutate = async () => {
    if (typeof onAfterMutate === 'function') {
      await onAfterMutate();
    }
  };

  const downloadBackup = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/restaurant/backup', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'No se pudo descargar el backup');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `restaurant_backup_${new Date().toISOString().slice(0, 10)}.db`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Backup descargado');
    } catch (err) {
      toast.error(err.message || 'No se pudo descargar el backup');
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    const confirmed = window.confirm('Esta acción reemplazará toda la información actual por la del backup. ¿Deseas continuar?');
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('backup', file);
      const response = await fetch('/api/restaurant/restore', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'No se pudo restaurar el backup');
      toast.success('Información restaurada correctamente');
      await runAfterMutate();
    } catch (err) {
      toast.error(err.message || 'No se pudo restaurar el backup');
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  const submitResetOperational = async (e) => {
    e?.preventDefault?.();
    const pwd = String(resetPassword || '').trim();
    if (!pwd) {
      toast.error('Introduce la contraseña de reinicio.');
      return;
    }
    setResetBusy(true);
    try {
      await api.post('/restaurant/reset-operational', { password: pwd });
      toast.success('Datos operativos reiniciados para pruebas');
      setResetDialogOpen(false);
      setResetPassword('');
      await runAfterMutate();
    } catch (err) {
      toast.error(err.message || 'No se pudo reiniciar la información operativa');
    } finally {
      setResetBusy(false);
    }
  };

  const titleCls = textTone === 'slate' ? 'font-bold text-slate-900' : 'font-bold text-[var(--ui-body-text)]';
  const bodyCls = textTone === 'slate' ? 'text-sm text-slate-600' : 'text-sm text-[var(--ui-muted)]';

  return (
    <>
      <div className={cardClassName}>
        <h3 className={titleCls}>Respaldo y restauración de información</h3>
        <p className={bodyCls}>
          Descarga una copia completa de datos antes de actualizar la app y luego restaura desde ese archivo para recuperar toda la información.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button type="button" onClick={() => void downloadBackup()} className="w-full btn-secondary flex items-center justify-center gap-2">
            <MdDownload /> Guardar backup
          </button>
          <button type="button" onClick={() => restoreInputRef.current?.click()} className="w-full btn-primary flex items-center justify-center gap-2">
            <MdUpload /> Restaurar información
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            onChange={(e) => restoreBackup(e.target.files?.[0])}
          />
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
          Importante: al restaurar, se reemplaza la información actual por la del archivo de backup.
        </div>
        <div className="pt-2 flex justify-start">
          <button
            type="button"
            onClick={() => {
              setResetPassword('');
              setResetDialogOpen(true);
            }}
            className="px-4 py-2 rounded-lg border border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-medium text-sm flex items-center gap-2"
          >
            <MdRestartAlt />
            Reiniciar datos de la app (pruebas)
          </button>
        </div>
      </div>

      <Modal
        variant="light"
        isOpen={resetDialogOpen}
        onClose={() => !resetBusy && setResetDialogOpen(false)}
        title="Reiniciar datos (pruebas)"
        size="md"
      >
        <form onSubmit={submitResetOperational} className="space-y-4">
          <p className={textTone === 'slate' ? 'text-sm text-slate-600' : 'text-sm text-[var(--ui-muted)]'}>
            Se borrarán ventas, pedidos, caja, clientes, productos y demás datos operativos. El{' '}
            <strong>contrato del servicio</strong> (texto y firmas guardados en Mi Restaurante) no se elimina.
          </p>
          <div>
            <label htmlFor="master-backup-reset-password" className={`block text-sm font-medium mb-1 ${textTone === 'slate' ? 'text-slate-800' : 'text-[var(--ui-body-text)]'}`}>
              Contraseña de reinicio
            </label>
            <input
              id="master-backup-reset-password"
              type="password"
              autoComplete="off"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="input-field w-full"
              placeholder="Contraseña"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-secondary" disabled={resetBusy} onClick={() => setResetDialogOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={resetBusy}>
              {resetBusy ? 'Reiniciando…' : 'Confirmar reinicio'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
