import { useState, useEffect } from 'react';
import Modal from './Modal';
import AttendancePhotoCapture from './AttendancePhotoCapture';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

/** Finalizar jornada: foto solo si la política lo exige. */
export default function EndShiftModal({ isOpen, onClose }) {
  const { logout } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logoutRequired, setLogoutRequired] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setPhoto(null);
      setLoading(false);
      setPolicyLoading(true);
      return;
    }
    setPolicyLoading(true);
    api
      .get('/auth/attendance-photos-required')
      .then((d) => setLogoutRequired(!!d?.logoutRequired))
      .catch(() => setLogoutRequired(false))
      .finally(() => setPolicyLoading(false));
  }, [isOpen]);

  const handleConfirm = async () => {
    if (logoutRequired && !photo) {
      toast.error('Tome una foto para finalizar la jornada');
      return;
    }
    setLoading(true);
    try {
      await logout(logoutRequired && photo ? { photo_logout: photo } : {});
    } catch (err) {
      toast.error(err?.message || 'No se pudo cerrar la sesión');
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={loading ? () => {} : onClose} title="Finalizar jornada" size="md">
      {policyLoading ? (
        <p className="text-sm text-[#9CA3AF] mb-4">Cargando…</p>
      ) : logoutRequired ? (
        <>
          <p className="text-sm text-[#9CA3AF] mb-4">
            Tome una foto para registrar el cierre de su jornada. Después podrá salir del sistema.
          </p>
          {isOpen && (
            <AttendancePhotoCapture onCapture={setPhoto} disabled={loading} />
          )}
        </>
      ) : (
        <p className="text-sm text-[#9CA3AF] mb-4">Se cerrará su sesión en el sistema.</p>
      )}
      <div className="flex gap-3 mt-6 justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-[#3B82F6]/35 text-[#F9FAFB] text-sm hover:bg-[#3B82F6]/10"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={loading || policyLoading || (logoutRequired && !photo)}
          onClick={() => void handleConfirm()}
          className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8] disabled:opacity-50"
        >
          {loading ? 'Cerrando…' : logoutRequired ? 'Tomar foto y salir' : 'Salir'}
        </button>
      </div>
    </Modal>
  );
}
