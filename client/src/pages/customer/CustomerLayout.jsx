import { useState } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import {
  MdStorefront, MdShoppingCart, MdPerson, MdLogout,
  MdRestaurantMenu, MdReceipt, MdLogin, MdClose
} from 'react-icons/md';

export default function CustomerLayout() {
  const { user, customerLogin, customerRegister, logout } = useAuth();
  const { count } = useCart();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', phone: '', address: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await customerLogin(loginForm.email, loginForm.password);
      toast.success('Bienvenido');
      setShowAuth(false);
      setLoginForm({ email: '', password: '' });
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await customerRegister(registerForm);
      toast.success('Cuenta creada exitosamente');
      setShowAuth(false);
      setRegisterForm({ name: '', email: '', password: '', phone: '', address: '' });
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/customer" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
              <MdStorefront className="text-white text-xl" />
            </div>
            <span className="font-bold text-lg text-gray-800 hidden sm:block">Sabor Peruano</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/customer" end className={navLinkClass}>
              <MdRestaurantMenu /> Menú
            </NavLink>
            {user?.type === 'customer' && (
              <NavLink to="/customer/orders" className={navLinkClass}>
                <MdReceipt /> Mis Pedidos
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/customer/cart" className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <MdShoppingCart className="text-2xl text-gray-600" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </Link>

            {user?.type === 'customer' ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-700">{user.name}</p>
                </div>
                <button onClick={logout} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400" title="Cerrar sesión">
                  <MdLogout className="text-xl" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
                <MdLogin /> Ingresar
              </button>
            )}

            <Link to="/" className="text-xs text-gray-400 hover:text-gray-600 hidden md:block">Staff</Link>
          </div>
        </div>

        <nav className="md:hidden flex border-t border-gray-100">
          <NavLink to="/customer" end className={({ isActive }) => `flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium ${isActive ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}>
            <MdRestaurantMenu /> Menú
          </NavLink>
          <Link to="/customer/cart" className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-gray-500`}>
            <MdShoppingCart /> Carrito {count > 0 && `(${count})`}
          </Link>
          {user?.type === 'customer' && (
            <NavLink to="/customer/orders" className={({ isActive }) => `flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium ${isActive ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}>
              <MdReceipt /> Pedidos
            </NavLink>
          )}
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <Modal variant="light" isOpen={showAuth} onClose={() => setShowAuth(false)} title={authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}>
        {authMode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} className="input-field" placeholder="tu@email.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} className="input-field" required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">{loading ? 'Ingresando...' : 'Ingresar'}</button>
            <p className="text-center text-sm text-gray-500">
              ¿No tienes cuenta?{' '}
              <button type="button" onClick={() => setAuthMode('register')} className="text-primary-600 font-medium hover:underline">Regístrate</button>
            </p>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-400 text-center mb-2">Demo: cliente@email.com / cliente123</p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input value={registerForm.name} onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={registerForm.email} onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
              <input type="password" value={registerForm.password} onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))} className="input-field" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input value={registerForm.phone} onChange={e => setRegisterForm(f => ({ ...f, phone: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input value={registerForm.address} onChange={e => setRegisterForm(f => ({ ...f, address: e.target.value }))} className="input-field" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">{loading ? 'Creando cuenta...' : 'Crear Cuenta'}</button>
            <p className="text-center text-sm text-gray-500">
              ¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => setAuthMode('login')} className="text-primary-600 font-medium hover:underline">Inicia sesión</button>
            </p>
          </form>
        )}
      </Modal>
    </div>
  );
}
