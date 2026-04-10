import { useEffect, useState, useCallback } from 'react';
import { api, formatDateTime } from '../../utils/api';
import toast from 'react-hot-toast';
import { MdAccessTime, MdPhotoCamera } from 'react-icons/md';
import Modal from '../../components/Modal';

const ROLE_LABEL = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mozo: 'Mozo',
  cocina: 'Cocina',
  bar: 'Bar',
  delivery: 'Delivery',
};

const ATT_LABEL = {
  pending: 'Pendiente',
  asistente: 'Asistente',
  justificado: 'Justificado',
  ausente: 'Ausente',
};

function formatMinutes(value) {
  const total = Math.max(0, Number(value || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function WorkTime() {
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', user_id: 'all' });
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [photoModal, setPhotoModal] = useState(null);
  const [classifyDraft, setClassifyDraft] = useState({});
  const [classifySavingId, setClassifySavingId] = useState('');

  const openSessionPhotos = async (sessionId) => {
    try {
      const data = await api.get(`/users/work-sessions/${sessionId}/photos`);
      setPhotoModal(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (_) {
      setUsers([]);
    }
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      if (filters.user_id !== 'all') qs.set('user_id', filters.user_id);
      const data = await api.get(`/users/work-sessions${qs.toString() ? `?${qs.toString()}` : ''}`);
      const list = Array.isArray(data?.sessions) ? data.sessions : [];
      setSessions(list);
      setSummary(Array.isArray(data?.summary) ? data.summary : []);
      const draft = {};
      list.forEach((r) => {
        if (r.attendance_status === 'pending') draft[r.id] = 'asistente';
      });
      setClassifyDraft(draft);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.user_id]);

  const applyClassification = async (sessionId) => {
    const status = classifyDraft[sessionId] || 'asistente';
    try {
      setClassifySavingId(sessionId);
      await api.patch(`/users/work-sessions/${encodeURIComponent(sessionId)}/attendance`, { status });
      toast.success('Asistencia registrada');
      await loadReport();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClassifySavingId('');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Tiempo trabajado</h1>
        <p className="text-sm text-slate-500 mt-1">
          El rol <strong>Administrador</strong> no entra en revisión de asistencia: su tiempo cuenta con la jornada cerrada.
          Para el resto, mientras quede en <strong>Pendiente</strong>, el tiempo computable es <strong>0</strong> (los &quot;brutos&quot; son solo referencia).
          Al cerrar la jornada, clasifique cada sesión como <strong>Asistente</strong>, <strong>Justificado</strong> o <strong>Ausente</strong> aquí o desde el aviso del menú.
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <MdAccessTime /> Reporte de jornadas
          </p>
          <button onClick={loadReport} className="btn-secondary text-sm" disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Desde</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hasta</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="input-field"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Usuario</label>
            <select
              value={filters.user_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value }))}
              className="input-field"
            >
              <option value="all">Todos los usuarios</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-700">Resumen por usuario</p>
            </div>
            {summary.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Sin registros para el rango seleccionado.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {summary.map((item) => (
                  <div key={item.user_id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.full_name}</p>
                        <p className="text-xs text-slate-500">@{item.username} · {ROLE_LABEL[item.role] || item.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">{formatMinutes(item.total_minutes)}</p>
                        <p className="text-xs text-slate-500">{item.sessions_count} sesión(es)</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-700">Detalle de jornadas</p>
            </div>
            {sessions.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Sin jornadas registradas.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {sessions.map((row) => {
                  const isAdminSession = String(row.role || '').toLowerCase() === 'admin';
                  return (
                  <div key={row.id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{row.full_name}</p>
                        <p className="text-xs text-slate-500">Inicio: {formatDateTime(row.login_at)}</p>
                        <p className="text-xs text-slate-500">Fin: {row.logout_at ? formatDateTime(row.logout_at) : 'Jornada activa'}</p>
                        <p className="text-xs mt-1">
                          <span className="text-slate-500">Asistencia: </span>
                          <span
                            className={
                              row.attendance_status === 'asistente' || (isAdminSession && row.attendance_status === 'pending')
                                ? 'text-emerald-700 font-medium'
                                : row.attendance_status === 'pending'
                                  ? 'text-amber-600 font-medium'
                                  : 'text-slate-600 font-medium'
                            }
                          >
                            {isAdminSession && row.attendance_status === 'pending'
                              ? 'Sin revisión (admin)'
                              : ATT_LABEL[row.attendance_status] || ATT_LABEL.pending}
                          </span>
                          {Number(row.raw_worked_minutes) !== Number(row.worked_minutes) ? (
                            <span className="text-slate-400 ml-1">
                              (bruto {formatMinutes(row.raw_worked_minutes)})
                            </span>
                          ) : null}
                        </p>
                        {(row.has_photo_login || row.has_photo_logout) ? (
                          <button
                            type="button"
                            onClick={() => openSessionPhotos(row.id)}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            <MdPhotoCamera className="text-sm" /> Ver fotos de asistencia
                          </button>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1">Sin fotos registradas</p>
                        )}
                        {row.attendance_status === 'pending' && row.logout_at && !isAdminSession ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                              className="input-field text-xs py-1.5 max-w-[11rem]"
                              value={classifyDraft[row.id] || 'asistente'}
                              onChange={(e) =>
                                setClassifyDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                            >
                              <option value="asistente">Asistente (cuenta tiempo)</option>
                              <option value="justificado">Justificado (0 min)</option>
                              <option value="ausente">Ausente (0 min)</option>
                            </select>
                            <button
                              type="button"
                              className="btn-primary text-xs py-1.5 px-2"
                              disabled={classifySavingId === row.id}
                              onClick={() => applyClassification(row.id)}
                            >
                              {classifySavingId === row.id ? 'Guardando…' : 'Guardar clasificación'}
                            </button>
                          </div>
                        ) : null}
                        {row.attendance_status === 'pending' && !row.logout_at && !isAdminSession ? (
                          <p className="text-xs text-amber-700 mt-2">
                            Jornada abierta: al cerrar sesión podrá clasificarla aquí o desde el aviso del menú.
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800">{formatMinutes(row.worked_minutes)}</p>
                        <p className="text-xs text-slate-500">Computable</p>
                        <p className={`text-xs mt-0.5 ${row.logout_at ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {row.logout_at ? 'Cerrada' : 'En curso'}
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!photoModal}
        onClose={() => setPhotoModal(null)}
        title="Fotos de asistencia"
        variant="light"
        size="lg"
      >
        {photoModal && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Inicio de jornada</p>
              {photoModal.photo_login ? (
                <img src={photoModal.photo_login} alt="" className="rounded-lg max-h-72 w-full object-contain bg-slate-100 border border-slate-200" />
              ) : (
                <p className="text-sm text-slate-400">Sin foto</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Fin de jornada</p>
              {photoModal.photo_logout ? (
                <img src={photoModal.photo_logout} alt="" className="rounded-lg max-h-72 w-full object-contain bg-slate-100 border border-slate-200" />
              ) : (
                <p className="text-sm text-slate-400">Sin foto</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
