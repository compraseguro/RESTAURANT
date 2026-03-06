import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { MdMenu, MdNotificationsNone, MdPointOfSale, MdLock, MdClose } from 'react-icons/md';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const [cajaOpen, setCajaOpen] = useState(null);
  const [checkingCaja, setCheckingCaja] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [previewNotification, setPreviewNotification] = useState(null);

  const checkCaja = () => {
    api.get('/pos/register-status')
      .then(data => setCajaOpen(data.is_open))
      .catch(() => setCajaOpen(false))
      .finally(() => setCheckingCaja(false));
  };

  useEffect(() => {
    if (user?.role === 'mozo') {
      checkCaja();
      const interval = setInterval(checkCaja, 15000);
      return () => clearInterval(interval);
    } else {
      setCajaOpen(true);
      setCheckingCaja(false);
    }
  }, [user?.role]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!['admin', 'master_admin'].includes(user?.role)) {
      setAdminNotifications([]);
      return;
    }
    const loadNotifications = () => {
      api.get('/master-admin/admin-notifications')
        .then((data) => setAdminNotifications(Array.isArray(data) ? data : []))
        .catch(() => setAdminNotifications([]));
    };
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.role]);

  const isMozoBlocked = user?.role === 'mozo' && cajaOpen === false && !checkingCaja;

  return (
    <div className="min-h-screen bg-[#111827]">
      {isMobile && mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setMobileMenuOpen(false)} />
      )}
      <Sidebar
        collapsed={collapsed}
        isMobile={isMobile}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
      <div className={`transition-all duration-300 ${isMobile ? 'ml-0' : (collapsed ? 'ml-16' : 'ml-60')}`}>
        <header className="h-14 bg-[#1F2937] flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30 shadow-sm border-b border-[#3B82F6]/30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (isMobile ? setMobileMenuOpen(prev => !prev) : setCollapsed(!collapsed))}
              className="p-2 hover:bg-[#3B82F6]/20 rounded-lg transition-colors"
            >
              <MdMenu className="text-xl text-[#F9FAFB]" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {isMozoBlocked && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-[#3B82F6]/20 text-[#F9FAFB] text-xs rounded-full font-medium border border-[#3B82F6]/35">
                <MdLock className="text-sm" /> Caja cerrada
              </span>
            )}
            <button onClick={() => setNotificationsOpen(prev => !prev)} className="p-2 hover:bg-[#3B82F6]/20 rounded-lg transition-colors relative">
              <MdNotificationsNone className="text-xl text-[#F9FAFB]" />
              {adminNotifications.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#3B82F6] rounded-full" />}
            </button>
            {notificationsOpen && (
              <div
                className={`absolute top-12 ${isMobile ? 'right-2 w-[calc(100vw-1rem)] max-w-sm' : 'right-24 w-80'} bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-96 overflow-auto`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Notificaciones</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotificationsOpen(false);
                    }}
                    className="p-1 rounded hover:bg-slate-100 text-slate-500"
                    aria-label="Cerrar notificaciones"
                  >
                    <MdClose className="text-base" />
                  </button>
                </div>
                {adminNotifications.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">Sin notificaciones</p>
                ) : (
                  adminNotifications.slice(0, 10).map((n) => (
                    <div key={n.id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">{n.title}</p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewNotification(n);
                            setNotificationsOpen(false);
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs text-slate-700"
                        >
                          Ver
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">{new Date(n.created_at).toLocaleString('es-PE')}</p>
                      <p className="text-xs text-slate-700">{n.message}</p>
                      {n.image_url ? <img src={n.image_url} alt={n.title} className="w-full h-24 object-cover rounded mt-2 border" /> : null}
                    </div>
                  ))
                )}
              </div>
            )}
            {!isMobile && <div className="h-8 w-px bg-[#3B82F6]/25" />}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#3B82F6]/20 rounded-full flex items-center justify-center border border-[#3B82F6]/35">
                <span className="text-[#F9FAFB] text-xs font-bold">{user?.full_name?.[0] || 'U'}</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-[#F9FAFB] leading-tight">{user?.full_name || user?.username}</p>
                <p className="text-xs text-[#9CA3AF] capitalize">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="p-3 sm:p-6 bg-[#111827] min-h-[calc(100vh-3.5rem)]">
          {isMozoBlocked ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-24 h-24 bg-[#1F2937] rounded-3xl flex items-center justify-center mb-6 border border-[#3B82F6]/30">
                <MdPointOfSale className="text-5xl text-[#3B82F6]" />
              </div>
              <div className="w-16 h-16 bg-[#111827] rounded-full flex items-center justify-center mb-4 -mt-10 ml-14 border-4 border-[#1F2937]">
                <MdLock className="text-2xl text-[#2563EB]" />
              </div>
              <h2 className="text-2xl font-bold text-[#F9FAFB] mb-2">Caja no abierta</h2>
              <p className="text-[#9CA3AF] max-w-md mb-4">
                No se puede operar sin una caja abierta. El cajero o administrador debe abrir la caja para que puedas acceder al sistema.
              </p>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#1F2937] border border-[#3B82F6]/30 rounded-xl text-sm text-[#BFDBFE]">
                <MdPointOfSale />
                <span>Esperando apertura de caja...</span>
                <div className="animate-spin w-4 h-4 border-2 border-[#3B82F6] border-t-transparent rounded-full ml-1" />
              </div>
            </div>
          ) : checkingCaja ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      {previewNotification && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setPreviewNotification(null)} />
          <aside className="fixed top-0 right-0 h-screen w-full md:w-1/2 bg-white z-50 shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Notificación</h3>
              <button
                type="button"
                onClick={() => setPreviewNotification(null)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label="Cerrar notificación"
              >
                <MdClose className="text-xl" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <h4 className="text-2xl font-bold text-slate-900 mb-2">{previewNotification.title}</h4>
              <p className="text-sm text-slate-500 mb-4">{new Date(previewNotification.created_at).toLocaleString('es-PE')}</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 text-base leading-relaxed whitespace-pre-wrap">
                {previewNotification.message}
              </div>
              {previewNotification.image_url ? (
                <img src={previewNotification.image_url} alt={previewNotification.title} className="mt-4 w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 bg-white" />
              ) : (
                <p className="mt-4 text-sm text-slate-400">Esta notificación no tiene imagen.</p>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
