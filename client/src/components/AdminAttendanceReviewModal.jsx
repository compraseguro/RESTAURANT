import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api, formatDateTime } from '../utils/api';
import toast from 'react-hot-toast';

const ROLE_LABEL = {
  admin: 'Admin',
  cajero: 'Caja',
  mozo: 'Mozo',
  cocina: 'Cocina',
  bar: 'Bar',
  delivery: 'Delivery',
};

/**
 * Obligatorio antes de finalizar jornada (admin): clasificar cada sesión del día como
 * asistente, justificado o ausente para que cuente en tiempo trabajado.
 */
export default function AdminAttendanceReviewModal({ isOpen, onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRows([]);
      setDraft({});
      setLoading(true);
      return;
    }
    let cancelled = false;
    api
      .get('/users/attendance-review/today')
      .then((data) => {
        if (cancelled) return;
        const p = Array.isArray(data?.pending) ? data.pending : [];
        setRows(p);
        const init = {};
        p.forEach((r) => {
          init[r.id] = 'asistente';
        });
        setDraft(init);
        setLoading(false);
        if (p.length === 0) {
          onComplete?.();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          toast.error('No se pudo cargar la revisión de asistencia');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const setStatus = (sessionId, status) => {
    setDraft((prev) => ({ ...prev, [sessionId]: status }));
  };

  const handleSubmit = async () => {
    if (!rows.length) {
      onComplete?.();
      return;
    }
    const items = rows.map((r) => ({
      session_id: r.id,
      status: draft[r.id] || 'asistente',
    }));
    setSaving(true);
    try {
      await api.post('/users/attendance-review/apply', { items });
      toast.success('Asistencia del día registrada');
      onComplete?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title="Revisión de asistencia del día"
      size="lg"
      variant="dark"
    >
      <p className="text-sm text-[#E5E7EB] mb-4 leading-relaxed">
        Las jornadas del <strong className="text-white font-semibold">administrador</strong> no aparecen aquí: quien gestiona la asistencia del personal no requiere esta clasificación.
        Para el resto, indique si fue <strong className="text-white font-semibold">asistente</strong>,{' '}
        <strong className="text-white font-semibold">justificado</strong> o <strong className="text-white font-semibold">ausente</strong>. Solo &quot;Asistente&quot; suma tiempo en el
        informe. Después podrá finalizar su propia jornada.
      </p>
      {loading ? (
        <p className="text-sm text-[#9CA3AF] py-6">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#9CA3AF] py-4">No hay sesiones pendientes de clasificar hoy.</p>
      ) : (
        <div className="space-y-3 max-h-[min(60vh,420px)] overflow-y-auto pr-1">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-3 justify-between rounded-lg border border-[#3B82F6]/35 bg-[#111827]/90 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#F9FAFB]">{r.full_name}</p>
                <p className="text-xs text-[#93C5FD]">
                  @{r.username} · {ROLE_LABEL[r.role] || r.role}
                </p>
                <p className="text-xs text-[#BFDBFE] mt-0.5">
                  Inicio: {r.login_at ? formatDateTime(r.login_at) : '—'} · Fin:{' '}
                  {r.logout_at ? formatDateTime(r.logout_at) : 'En curso'}
                </p>
              </div>
              <select
                className="input-field w-44 text-sm"
                value={draft[r.id] || 'asistente'}
                onChange={(e) => setStatus(r.id, e.target.value)}
                disabled={saving}
              >
                <option value="asistente">Asistente</option>
                <option value="justificado">Justificado</option>
                <option value="ausente">Ausente</option>
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#3B82F6]/30">
        <button type="button" className="btn-secondary text-sm" disabled={saving} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={saving || loading || rows.length === 0}
          onClick={() => void handleSubmit()}
        >
          {saving ? 'Guardando…' : 'Confirmar y continuar'}
        </button>
      </div>
    </Modal>
  );
}
