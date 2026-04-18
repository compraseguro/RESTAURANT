import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, resolveMediaUrl } from '../utils/api';
import toast from 'react-hot-toast';
import { MdStorefront, MdPerson, MdLock, MdVisibility, MdVisibilityOff, MdArrowBack, MdCameraAlt } from 'react-icons/md';
import AttendancePhotoCapture from '../components/AttendancePhotoCapture';

function getRoleRoute(role) {
  if (role === 'master_admin') return '/master';
  if (role === 'cajero') return '/admin/caja';
  if (role === 'mozo') return '/admin/mesas';
  if (role === 'cocina') return '/kitchen';
  if (role === 'bar') return '/bar';
  if (role === 'delivery') return '/delivery';
  return '/admin';
}

/** Marca por defecto en login y pie de página (si no hay nombre propio en Mi Restaurante). */
const DEFAULT_LOGIN_BRAND = 'Resto Fadey App';

/** Nombres genéricos del demo que en login se muestran como marca del producto. */
function resolveLoginBrandDisplayName(apiName) {
  const t = String(apiName || '').trim();
  if (!t) return DEFAULT_LOGIN_BRAND;
  const lower = t.toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'mi restaurante' || lower === 'resto-fadey' || lower === 'resto fadey') {
    return DEFAULT_LOGIN_BRAND;
  }
  return t;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoLogin, setPhotoLogin] = useState(null);
  /** Evita carrera: antes de cargar la política no se debe enviar login sin paso de foto. */
  const [attendancePolicy, setAttendancePolicy] = useState({ loading: true, loginRequired: false });
  /** 1 = usuario/contraseña, 2 = capturar foto e ingresar (solo si loginRequired) */
  const [step, setStep] = useState(1);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [brandName, setBrandName] = useState(DEFAULT_LOGIN_BRAND);
  const [brandLogo, setBrandLogo] = useState('');

  const photosRequired = attendancePolicy.loginRequired;
  const policyReady = !attendancePolicy.loading;

  useEffect(() => {
    api
      .get('/restaurant')
      .then((r) => {
        setBrandName(resolveLoginBrandDisplayName(r?.name));
        setBrandLogo(String(r?.logo || '').trim());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get('/auth/attendance-photos-required')
      .then((data) =>
        setAttendancePolicy({
          loading: false,
          loginRequired: !!(data?.loginRequired ?? data?.required),
        })
      )
      .catch(() => {
        /* Si falla la lectura de política, no bloqueamos; si el servidor exige foto, lo recuperamos en el error de login. */
        setAttendancePolicy({ loading: false, loginRequired: false });
      });
  }, []);

  const submitLogin = async () => {
    if (photosRequired && !photoLogin) {
      toast.error('Debe tomarse una foto para continuar');
      return;
    }
    setLoading(true);
    try {
      const loginOpts = {};
      if (photoLogin) loginOpts.photo_login = photoLogin;
      const user = await login(username, password, loginOpts);
      toast.success(`Bienvenido, ${user.full_name}`);
      navigate(getRoleRoute(user.role), { replace: true });
    } catch (err) {
      const msg = String(err?.message || '');
      if (/foto|inicio de jornada|jornada/i.test(msg)) {
        setAttendancePolicy((p) => ({ ...p, loading: false, loginRequired: true }));
        setPhotoLogin(null);
        setStep(2);
        toast.error('Se requiere foto de asistencia.');
      } else {
        toast.error(msg || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (e) => {
    e.preventDefault();
    if (!policyReady) {
      toast.error('Espere a cargar la configuración de asistencia');
      return;
    }
    if (!username.trim() || !password) {
      toast.error('Ingrese usuario y contraseña');
      return;
    }
    if (!photosRequired) {
      void submitLogin();
      return;
    }
    setPhotoLogin(null);
    setStep(2);
  };

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#3B82F6]/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#2563EB]/25 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg shadow-[#2563EB]/30 overflow-hidden flex items-center justify-center bg-[#1F2937] ring-1 ring-[#3B82F6]/25">
            {brandLogo ? (
              <img
                src={resolveMediaUrl(brandLogo)}
                alt={brandName}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB] flex items-center justify-center">
                <MdStorefront className="text-white text-4xl" />
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{brandName}</h1>
          <p className="text-[#9CA3AF] mt-2 text-sm">Sistema de Gestión para Restaurantes</p>
        </div>

        <div className="bg-[#1F2937]/85 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-[#3B82F6]/35">
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-white mb-1">Iniciar Sesión</h2>
              <p className="text-sm text-[#9CA3AF] mb-6">Ingresa tus credenciales</p>
              <form onSubmit={handleContinue} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#F9FAFB] mb-1.5">Usuario</label>
                  <div className="relative">
                    <MdPerson className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-xl" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
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
                      onChange={(e) => setPassword(e.target.value)}
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
                  disabled={loading || !policyReady}
                  className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-lg font-semibold text-lg hover:from-[#1D4ED8] hover:to-[#1E40AF] transition-all shadow-lg shadow-[#2563EB]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!policyReady ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      Cargando…
                    </span>
                  ) : loading && !photosRequired ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      Ingresando...
                    </span>
                  ) : photosRequired ? (
                    'Continuar'
                  ) : (
                    'Ingresar'
                  )}
                </button>
              </form>
            </>
          )}

          {step === 2 && photosRequired && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => { setStep(1); setPhotoLogin(null); }}
                  className="p-2 rounded-lg hover:bg-[#111827]/80 text-[#9CA3AF] hover:text-[#F9FAFB]"
                  aria-label="Volver"
                  disabled={loading}
                >
                  <MdArrowBack className="text-xl" />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <MdCameraAlt className="text-[#93C5FD]" /> Foto de asistencia
                  </h2>
                </div>
              </div>
              <div className="rounded-xl border border-[#3B82F6]/25 bg-[#111827]/50 p-4 mb-5">
                <AttendancePhotoCapture onCapture={setPhotoLogin} disabled={loading} />
              </div>
              <button
                type="button"
                onClick={() => void submitLogin()}
                disabled={loading || !photoLogin}
                className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-lg font-semibold text-lg hover:from-[#1D4ED8] hover:to-[#1E40AF] transition-all shadow-lg shadow-[#2563EB]/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Ingresando...
                  </span>
                ) : (
                  'Ingresar al sistema'
                )}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-[#9CA3AF] text-xs mt-6">
          &copy; {new Date().getFullYear()} {brandName} &mdash; Sistema de Gestión
        </p>
      </div>
    </div>
  );
}
