import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../../utils/api';
import toast from 'react-hot-toast';
import { MdAccessTime } from 'react-icons/md';

const ROLE_LABEL = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mozo: 'Mozo',
  cocina: 'Cocina',
  bar: 'Bar',
  delivery: 'Delivery',
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

  const loadUsers = async () => {
    try {
      const data = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (_) {
      setUsers([]);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      if (filters.user_id !== 'all') qs.set('user_id', filters.user_id);
      const data = await api.get(`/users/work-sessions${qs.toString() ? `?${qs.toString()}` : ''}`);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      setSummary(Array.isArray(data?.summary) ? data.summary : []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadReport();
  }, [filters.from, filters.to, filters.user_id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Tiempo trabajado</h1>
        <p className="text-sm text-slate-500 mt-1">Control de jornada por inicio y cierre de sesión</p>
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
                {sessions.map((row) => (
                  <div key={row.id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{row.full_name}</p>
                        <p className="text-xs text-slate-500">Inicio: {formatDateTime(row.login_at)}</p>
                        <p className="text-xs text-slate-500">Fin: {row.logout_at ? formatDateTime(row.logout_at) : 'Jornada activa'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800">{formatMinutes(row.worked_minutes)}</p>
                        <p className={`text-xs ${row.logout_at ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {row.logout_at ? 'Cerrada' : 'En curso'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
