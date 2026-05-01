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

/** Si en Mi empresa no hay nombre guardado, se muestra este texto en el login. */
const FALLBACK_RESTAURANT_NAME = 'Resto Fadey App';

/** Pie del login: fijo, no configurable (no usar datos de /restaurant). */
const LOGIN_PRODUCT_FOOTER = 'RESTO FADEY APP - SISTEMA DE GESTION';

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
  const [brandLogo, setBrandLogo] = useState('');
  /** Nombre comercial del establecimiento (Mi empresa / Mi Restaurante); distinto del subtítulo del producto. */
  const [restaurantName, setRestaurantName] = useState(FALLBACK_RESTAURANT_NAME);

  const photosRequired = attendancePolicy.loginRequired;
  const policyReady = !attendancePolicy.loading;

  useEffect(() => {
    api
      .get('/restaurant')
      .then((r) => {
        const n = String(r?.name || '').trim();
        setRestaurantName(n || FALLBACK_RESTAURANT_NAME);
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
    <div className="min-h-screen bg-[var(--ui-body-bg)] text-[var(--ui-body-text)] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[var(--ui-accent)]/15 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[var(--ui-accent)]/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-[var(--ui-surface)]/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg overflow-hidden flex items-center justify-center bg-[var(--ui-surface)] ring-1 ring-[color:var(--ui-border)]">
            {brandLogo ? (
              <img
                src={resolveMediaUrl(brandLogo)}
                alt={restaurantName}
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[var(--ui-accent)] to-[var(--ui-accent-hover)] flex items-center justify-center">
                <MdStorefront className="text-white text-4xl" />
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-[var(--ui-body-text)] tracking-tight px-1">{restaurantName}</h1>
        </div>

        <div className="bg-[var(--ui-surface)] backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-[color:var(--ui-border)]">
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-[var(--ui-body-text)] mb-1">Iniciar Sesión</h2>
              <p className="text-sm text-[var(--ui-muted)] mb-6">Ingresa tus credenciales</p>
              <form onSubmit={handleContinue} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[var(--ui-body-text)] mb-1.5">Usuario</label>
                  <div className="relative">
                    <MdPerson className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-muted)] text-xl pointer-events-none" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ingresa tu usuario"
                      className="input-field pl-10"
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--ui-body-text)] mb-1.5">Contraseña</label>
                  <div className="relative">
                    <MdLock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-muted)] text-xl pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña"
                      className="input-field pl-10 pr-10"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ui-muted)] hover:text-[var(--ui-body-text)] transition-colors"
                    >
                      {showPassword ? <MdVisibilityOff className="text-xl" /> : <MdVisibility className="text-xl" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !policyReady}
                  className="w-full py-3 btn-primary rounded-lg font-semibold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="p-2 rounded-lg hover:bg-[var(--ui-sidebar-hover)] text-[var(--ui-muted)] hover:text-[var(--ui-body-text)]"
                  aria-label="Volver"
                  disabled={loading}
                >
                  <MdArrowBack className="text-xl" />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-[var(--ui-body-text)] flex items-center gap-2">
                    <MdCameraAlt className="text-[var(--ui-accent)]" /> Foto de asistencia
                  </h2>
                </div>
              </div>
              <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-4 mb-5">
                <AttendancePhotoCapture onCapture={setPhotoLogin} disabled={loading} />
              </div>
              <button
                type="button"
                onClick={() => void submitLogin()}
                disabled={loading || !photoLogin}
                className="w-full py-3 btn-primary rounded-lg font-semibold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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

        <p className="text-center text-[var(--ui-muted)] text-xs mt-6 select-none" aria-hidden="true">
          {LOGIN_PRODUCT_FOOTER}
        </p>
      </div>
    </div>
  );
}
