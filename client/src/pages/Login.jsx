import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { MdStorefront, MdPerson, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';

function getRoleRoute(role) {
  if (role === 'master_admin') return '/master';
  if (role === 'cajero') return '/admin/caja';
  if (role === 'mozo') return '/admin/mesas';
  if (role === 'cocina') return '/kitchen';
  if (role === 'bar') return '/bar';
  if (role === 'delivery') return '/delivery';
  return '/admin';
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(username, password);
      toast.success(`Bienvenido, ${user.full_name}`);
      navigate(getRoleRoute(user.role), { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#3B82F6]/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#2563EB]/25 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-[#3B82F6] to-[#2563EB] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#2563EB]/30">
            <MdStorefront className="text-white text-4xl" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Resto-FADEY</h1>
          <p className="text-[#9CA3AF] mt-2 text-sm">Sistema de Gestión para Restaurantes</p>
        </div>

        <div className="bg-[#1F2937]/85 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-[#3B82F6]/35">
          <h2 className="text-xl font-bold text-white mb-1">Iniciar Sesión</h2>
          <p className="text-sm text-[#9CA3AF] mb-6">Ingresa tus credenciales para acceder al sistema</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#F9FAFB] mb-1.5">Usuario</label>
              <div className="relative">
                <MdPerson className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-xl" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Ingresa tu usuario"
                  className="w-full px-3 py-2.5 pl-10 bg-[#111827]/70 border border-[#3B82F6]/35 rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-all"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#F9FAFB] mb-1.5">Contraseña</label>
              <div className="relative">
                <MdLock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-xl" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full px-3 py-2.5 pl-10 pr-10 bg-[#111827]/70 border border-[#3B82F6]/35 rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none text-[#F9FAFB] placeholder:text-[#9CA3AF] transition-all"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors"
                >
                  {showPassword ? <MdVisibilityOff className="text-xl" /> : <MdVisibility className="text-xl" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-lg font-semibold text-lg hover:from-[#1D4ED8] hover:to-[#1E40AF] transition-all shadow-lg shadow-[#2563EB]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Ingresando...
                </span>
              ) : 'Ingresar'}
            </button>
          </form>

        </div>

        <p className="text-center text-[#9CA3AF] text-xs mt-6">
          &copy; {new Date().getFullYear()} Resto-FADEY &mdash; Sistema de Gestión
        </p>
      </div>
    </div>
  );
}
