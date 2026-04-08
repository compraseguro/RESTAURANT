import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { MdMenu, MdPointOfSale, MdLock } from 'react-icons/md';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const [cajaOpen, setCajaOpen] = useState(null);
  const [checkingCaja, setCheckingCaja] = useState(true);
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
            <NotificationCenter />
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
    </div>
  );
}
