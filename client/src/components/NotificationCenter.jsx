import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StaffTeamChat from './StaffTeamChat';
import Modal from './Modal';
import { MdNotificationsNone, MdClose, MdChat, MdCampaign, MdDelete } from 'react-icons/md';

const DISMISSED_AVISOS_STORAGE_KEY = 'admin_avisos_descartados_v1';

function loadDismissedAvisoIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_AVISOS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveDismissedAvisoIds(ids) {
  localStorage.setItem(DISMISSED_AVISOS_STORAGE_KEY, JSON.stringify([...new Set(ids.map(String))]));
}

/**
 * Campana de notificaciones: pestaña Chat (grupo/privado) por defecto y avisos del maestro (admin).
 */
export default function NotificationCenter({ className = '' }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const [unreadChat, setUnreadChat] = useState(0);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [dismissedAvisoIds, setDismissedAvisoIds] = useState(loadDismissedAvisoIds);
  const [avisoToDismiss, setAvisoToDismiss] = useState(null);

  const showAvisosTab = user?.role === 'admin';

  const visibleAdminNotifications = useMemo(
    () => adminNotifications.filter((n) => !dismissedAvisoIds.includes(String(n.id))),
    [adminNotifications, dismissedAvisoIds],
  );

  useEffect(() => {
    if (!showAvisosTab) setTab('chat');
  }, [showAvisosTab]);

  useEffect(() => {
    if (!showAvisosTab) return;
    const load = () => {
      api.get('/master-admin/admin-notifications')
        .then((data) => setAdminNotifications(Array.isArray(data) ? data : []))
        .catch(() => setAdminNotifications([]));
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [showAvisosTab]);

  const onUnreadDelta = useCallback((n) => {
    setUnreadChat((u) => u + n);
  }, []);

  useEffect(() => {
    if (open && tab === 'chat') {
      setUnreadChat(0);
    }
  }, [open, tab]);

  const confirmDismissAviso = () => {
    if (!avisoToDismiss?.id) return;
    const id = String(avisoToDismiss.id);
    const next = [...new Set([...dismissedAvisoIds, id])];
    setDismissedAvisoIds(next);
    saveDismissedAvisoIds(next);
    setAvisoToDismiss(null);
  };

  const totalBadge = unreadChat + (showAvisosTab ? visibleAdminNotifications.length : 0);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          if (!open) setTab('chat');
        }}
        className="p-2 hover:bg-[#3B82F6]/20 rounded-lg transition-colors relative"
        title="Mensajes y notificaciones"
        aria-expanded={open}
      >
        <MdNotificationsNone className="text-xl text-[#F9FAFB]" />
        {totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-[#EF4444] text-white rounded-full">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-[60] top-14 right-3 sm:right-6 w-[min(100vw-1.5rem,420px)] h-[min(72vh,580px)] flex flex-col rounded-2xl border border-[#3B82F6]/35 bg-[#1F2937] shadow-2xl shadow-black/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Centro de mensajes"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#3B82F6]/30 bg-[#111827]/90">
              {showAvisosTab ? (
                <div className="flex rounded-lg bg-[#0f172a] p-0.5 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setTab('chat')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                      tab === 'chat' ? 'bg-[#2563EB] text-white' : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                    }`}
                  >
                    <MdChat className="text-base" /> Mensajes
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('avisos')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                      tab === 'avisos' ? 'bg-[#2563EB] text-white' : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                    }`}
                  >
                    <MdCampaign className="text-base" /> Avisos
                    {visibleAdminNotifications.length > 0 && (
                      <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{visibleAdminNotifications.length}</span>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-[#F9FAFB] flex items-center gap-2">
                  <MdChat className="text-lg text-[#93C5FD]" /> Mensajes del equipo
                </p>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#374151] text-[#9CA3AF]"
                aria-label="Cerrar"
              >
                <MdClose className="text-lg" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-3">
              {tab === 'chat' && (
                <StaffTeamChat isActive={open && tab === 'chat'} onUnreadDelta={onUnreadDelta} />
              )}
              {tab === 'avisos' && showAvisosTab && (
                <div className="h-full overflow-y-auto space-y-2">
                  {visibleAdminNotifications.length === 0 ? (
                    <p className="text-sm text-[#9CA3AF] text-center py-8">Sin avisos del sistema.</p>
                  ) : (
                    visibleAdminNotifications.slice(0, 15).map((n) => (
                      <div key={n.id} className="rounded-xl border border-[#3B82F6]/20 bg-[#111827]/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-[#F9FAFB] pr-2 flex-1 min-w-0 select-none cursor-default">
                            {n.title}
                          </p>
                          <button
                            type="button"
                            onClick={() => setAvisoToDismiss(n)}
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-950/60 hover:bg-red-900/70 text-red-200 border border-red-800/50"
                            aria-label="Quitar aviso de la lista"
                          >
                            <MdDelete className="text-sm" />
                            Quitar
                          </button>
                        </div>
                        <p className="text-[10px] text-[#9CA3AF] mt-1">{new Date(n.created_at).toLocaleString('es-PE')}</p>
                        <p className="text-xs text-[#D1D5DB] mt-2 whitespace-pre-wrap select-text">{n.message}</p>
                        {n.image_url ? (
                          <img src={n.image_url} alt="" className="mt-2 rounded-lg max-h-32 w-full object-cover border border-[#3B82F6]/20" />
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={!!avisoToDismiss}
        onClose={() => setAvisoToDismiss(null)}
        title="Quitar aviso"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <strong className="font-semibold">Aviso:</strong> asegúrese de haber comprendido el mensaje antes de quitarlo.{' '}
            <strong>No podrá recuperarlo</strong> en esta lista en este navegador (solo deja de mostrarse aquí; el historial completo lo gestiona el administrador maestro).
          </div>
          {avisoToDismiss ? (
            <p className="text-sm text-[#D1D5DB]">
              ¿Quitar «<span className="font-semibold text-[#F9FAFB]">{avisoToDismiss.title}</span>» de sus avisos?
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setAvisoToDismiss(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
              onClick={confirmDismissAviso}
            >
              <MdDelete className="text-lg" />
              Sí, quitar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
