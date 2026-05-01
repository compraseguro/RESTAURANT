import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';
import { applyUiTheme } from '../theme/uiTheme';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then((data) => {
          if (data?.ui_theme) applyUiTheme(data.ui_theme);
          setUser(data);
        })
        .catch(() => { localStorage.removeItem('token'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password, opts = {}) => {
    const body = { username, password };
    if (opts.photo_login) body.photo_login = opts.photo_login;
    const data = await api.post('/auth/login', body);
    localStorage.setItem('token', data.token);
    if (data.user?.ui_theme) applyUiTheme(data.user.ui_theme);
    setUser({ ...data.user, type: 'staff' });
    return data.user;
  };

  const customerLogin = async (email, password) => {
    const data = await api.post('/auth/customer/login', { email, password });
    localStorage.setItem('token', data.token);
    if (data.customer?.ui_theme) applyUiTheme(data.customer.ui_theme);
    setUser({ ...data.customer, type: 'customer' });
    return data.customer;
  };

  const customerRegister = async (formData) => {
    const data = await api.post('/auth/customer/register', formData);
    localStorage.setItem('token', data.token);
    if (data.customer?.ui_theme) applyUiTheme(data.customer.ui_theme);
    setUser({ ...data.customer, type: 'customer' });
    return data.customer;
  };

  const logout = async (opts = {}) => {
    const body = {};
    if (opts.photo_logout) body.photo_logout = opts.photo_logout;
    await api.post('/auth/logout', body);
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, customerLogin, customerRegister, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
