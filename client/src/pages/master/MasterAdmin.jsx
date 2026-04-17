import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import RestaurantServiceContractForm, { normalizeContratoFromApi } from '../../components/RestaurantServiceContractForm';
import {
  MdAdminPanelSettings,
  MdReceiptLong,
  MdEventAvailable,
  MdNotifications,
  MdLock,
  MdSave,
  MdAdd,
  MdUpload,
  MdLogout,
  MdManageAccounts,
  MdVisibility,
  MdVisibilityOff,
  MdClose,
  MdEdit,
  MdDelete,
  MdReceipt,
  MdPayment,
} from 'react-icons/md';
import MasterRestaurantBillingWorkspace from '../../components/master/MasterRestaurantBillingWorkspace';

const TABS = [
  { id: 'usuarios', label: 'Usuario administrador', icon: MdAdminPanelSettings },
  { id: 'contrato', label: 'Contrato del servicio', icon: MdReceiptLong },
  { id: 'sunat_bot', label: 'Bot facturación SUNAT', icon: MdReceipt },
  { id: 'pago_uso_sistema', label: 'Pago por uso del sistema', icon: MdPayment },
  { id: 'facturacion', label: 'Fecha de facturación', icon: MdEventAvailable },
  { id: 'notificaciones', label: 'Notificaciones', icon: MdNotifications },
  { id: 'bloqueo', label: 'Bloqueo por falta de pago', icon: MdLock },
];

export default function MasterAdmin() {
  const { logout } = useAuth();
  const [tab, setTab] = useState('usuarios');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [adminForm, setAdminForm] = useState({ username: '', full_name: '', email: '', password: '' });
  const [notifyForm, setNotifyForm] = useState({ title: '', message: '', image_url: '', duration_value: 1, duration_unit: 'hours', no_expiry: false });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMasterAccessModal, setShowMasterAccessModal] = useState(false);
  const [showCreateBuyerModal, setShowCreateBuyerModal] = useState(false);
  const [showBuyerPassword, setShowBuyerPassword] = useState(false);
  const [previewNotification, setPreviewNotification] = useState(null);
  const [masterCredForm, setMasterCredForm] = useState({
    current_password: '',
    new_username: '',
    new_password: '',
    confirm_password: '',
  });
  const [showEditNotificationModal, setShowEditNotificationModal] = useState(false);
  const [editingNotification, setEditingNotification] = useState(null);
  const [editNotifyForm, setEditNotifyForm] = useState({ title: '', message: '', image_url: '', duration_value: 1, duration_unit: 'hours', no_expiry: false });
  const [showEditBuyerModal, setShowEditBuyerModal] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [editBuyerForm, setEditBuyerForm] = useState({ username: '', full_name: '', email: '', password: '' });
  const [showEditBuyerPassword, setShowEditBuyerPassword] = useState(false);
  const [serviceContrato, setServiceContrato] = useState(() => normalizeContratoFromApi(null));
  const [serviceContratoLoading, setServiceContratoLoading] = useState(false);
  const [serviceContratoSaving, setServiceContratoSaving] = useState(false);

  const loadDashboard = async () => {
    try {
      const data = await api.get('/master-admin/dashboard');
      setDashboard(data);
    } catch (err) {
      toast.error(err.message || 'No se pudo cargar administrador maestro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  useEffect(() => {
    if (tab !== 'contrato') return;
    let cancelled = false;
    (async () => {
      setServiceContratoLoading(true);
      try {
        const appCfg = await api.get('/admin-modules/config/app');
        if (cancelled) return;
        setServiceContrato(normalizeContratoFromApi(appCfg?.contrato));
      } catch (err) {
        if (!cancelled) toast.error(err.message || 'No se pudo cargar el contrato del servicio');
      } finally {
        if (!cancelled) setServiceContratoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  const saveServiceContrato = async () => {
    const c = serviceContrato || {};
    const payload = {
      texto_contrato: String(c.texto_contrato || ''),
      firma_comprador_url: String(c.firma_comprador_url || '').trim(),
      firma_vendedor_url: String(c.firma_vendedor_url || '').trim(),
    };
    try {
      setServiceContratoSaving(true);
      const saved = await api.put('/admin-modules/config/app', { contrato: payload });
      setServiceContrato(normalizeContratoFromApi(saved?.contrato));
      toast.success('Contrato del servicio guardado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setServiceContratoSaving(false);
    }
  };

  const resolveDurationHours = (formState) => {
    if (formState?.no_expiry) return null;
    const value = Math.max(1, Number(formState?.duration_value || 1));
    const unit = formState?.duration_unit === 'days' ? 'days' : 'hours';
    return unit === 'days' ? value * 24 : value;
  };

  const getRemainingLabel = (expiresAt) => {
    if (!expiresAt) return 'Sin vencimiento';
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return 'Sin vencimiento';
    if (ms <= 0) return 'Expirada';
    const totalHours = Math.ceil(ms / (1000 * 60 * 60));
    if (totalHours < 24) return `Activa · ${totalHours}h restantes`;
    const days = Math.ceil(totalHours / 24);
    return `Activa · ${days} día(s) restantes`;
  };

  const updateControl = async (patch, okMessage) => {
    try {
      const control = await api.put('/master-admin/control', patch);
      setDashboard((prev) => ({ ...(prev || {}), control, lock: { ...(prev?.lock || {}), locked: Number(control.global_lock_enabled || 0) === 1, reason: control.global_lock_reason || '' } }));
      if (okMessage) toast.success(okMessage);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const createAdminBuyer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', {
        ...adminForm,
        role: 'admin',
      });
      toast.success('Administrador comprador creado');
      setAdminForm({ username: '', full_name: '', email: '', password: '' });
      setShowBuyerPassword(false);
      setShowCreateBuyerModal(false);
      await loadDashboard();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const uploaded = await api.upload(file);
      setNotifyForm((prev) => ({ ...prev, image_url: uploaded?.url || '' }));
      toast.success('Imagen cargada');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const sendNotification = async (e) => {
    e.preventDefault();
    try {
      await api.post('/master-admin/notifications', {
        title: notifyForm.title,
        message: notifyForm.message,
        image_url: notifyForm.image_url,
        duration_hours: resolveDurationHours(notifyForm),
      });
      toast.success('Notificación publicada');
      setNotifyForm({ title: '', message: '', image_url: '', duration_value: 1, duration_unit: 'hours', no_expiry: false });
      await loadDashboard();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const previewDraftNotification = () => {
    if (!notifyForm.title.trim() || !notifyForm.message.trim()) {
      return toast.error('Escribe título y mensaje para la vista previa');
    }
    setPreviewNotification({
      id: 'draft-preview',
      title: notifyForm.title.trim(),
      message: notifyForm.message.trim(),
      image_url: notifyForm.image_url || '',
      created_by: 'Vista previa',
      created_at: new Date().toISOString(),
      expires_at: (() => {
        const hours = resolveDurationHours(notifyForm);
        if (!hours) return null;
        return new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
      })(),
    });
  };

  const openEditNotification = (notification) => {
    setEditingNotification(notification);
    setEditNotifyForm({
      title: notification?.title || '',
      message: notification?.message || '',
      image_url: notification?.image_url || '',
      duration_value: 1,
      duration_unit: 'hours',
      no_expiry: !notification?.expires_at,
    });
    setShowEditNotificationModal(true);
  };

  const submitEditNotification = async (e) => {
    e.preventDefault();
    if (!editingNotification?.id) return;
    try {
      await api.put(`/master-admin/notifications/${editingNotification.id}`, {
        title: editNotifyForm.title,
        message: editNotifyForm.message,
        image_url: editNotifyForm.image_url,
        duration_hours: resolveDurationHours(editNotifyForm),
      });
      toast.success('Notificación actualizada');
      setShowEditNotificationModal(false);
      setEditingNotification(null);
      await loadDashboard();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeNotification = async (notification) => {
    if (!notification?.id) return;
    if (!window.confirm(`¿Eliminar notificación "${notification.title}"?`)) return;
    try {
      await api.delete(`/master-admin/notifications/${notification.id}`);
      toast.success('Notificación eliminada');
      await loadDashboard();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openEditBuyer = (buyer) => {
    setEditingBuyer(buyer);
    setEditBuyerForm({
      username: buyer?.username || '',
      full_name: buyer?.full_name || '',
      email: buyer?.email || '',
      password: '',
    });
    setShowEditBuyerPassword(false);
    setShowEditBuyerModal(true);
  };

  const submitEditBuyer = async (e) => {
    e.preventDefault();
    if (!editingBuyer?.id) return;
    try {
      const payload = {
        username: editBuyerForm.username,
        full_name: editBuyerForm.full_name,
        email: editBuyerForm.email,
        role: 'admin',
      };
      if (String(editBuyerForm.password || '').trim()) {
        payload.password = editBuyerForm.password;
      }
      await api.put(`/users/${editingBuyer.id}`, payload);
      toast.success('Credenciales del administrador actualizadas');
      setShowEditBuyerModal(false);
      setEditingBuyer(null);
      await loadDashboard();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const updateMasterCredentials = async (e) => {
    e.preventDefault();
    if (masterCredForm.new_password && masterCredForm.new_password !== masterCredForm.confirm_password) {
      return toast.error('La confirmación de contraseña no coincide');
    }
    try {
      const payload = {
        current_password: masterCredForm.current_password,
        new_username: masterCredForm.new_username,
        new_password: masterCredForm.new_password,
      };
      await api.put('/master-admin/credentials', payload);
      toast.success('Credenciales de administrador maestro actualizadas');
      setMasterCredForm({ current_password: '', new_username: '', new_password: '', confirm_password: '' });
      setShowMasterAccessModal(false);
      await loadDashboard();
      logout();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;
  }

  const control = dashboard?.control || {};
  const notifications = dashboard?.notifications || [];
  const adminUsers = dashboard?.admin_users || [];
  const creds = dashboard?.master_credentials || { username: 'Romero25879' };
  const lockEnabled = Number(control.global_lock_enabled || 0) === 1;

  return (
    <div className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="card mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Administrador Maestro</h1>
              <p className="text-sm text-slate-500">Control de dueños, contratos, SUNAT y pago por uso del restaurante, fecha de facturación, bloqueo global y notificaciones.</p>
            </div>
            <button onClick={logout} className="btn-secondary flex items-center gap-2"><MdLogout /> Salir</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${tab === item.id ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-[#1F2937] text-[#F9FAFB] border-[#3B82F6]/30 hover:bg-[#3B82F6]/15'}`}
              >
                <item.icon />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'usuarios' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card lg:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-800">Administradores compradores</h3>
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={() => setShowCreateBuyerModal(true)}
                >
                  <MdAdd /> Crear administrador
                </button>
              </div>
              <div className="space-y-2">
                {adminUsers.map((u) => (
                  <div key={u.id} className="border rounded-lg px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-slate-800">{u.full_name}</p>
                      <p className="text-xs text-slate-500">{u.username} · {u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${Number(u.is_active || 0) === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {Number(u.is_active || 0) === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditBuyer(u)}
                        className="p-2 rounded bg-sky-50 hover:bg-sky-100 text-sky-700"
                        aria-label="Editar credenciales del comprador"
                      >
                        <MdEdit />
                      </button>
                    </div>
                  </div>
                ))}
                {adminUsers.length === 0 && <p className="text-sm text-slate-500">No hay administradores registrados.</p>}
              </div>
            </div>
          </div>
        )}

        {tab === 'contrato' && (
          <div className="space-y-3">
            {serviceContratoLoading ? (
              <div className="card py-12 flex justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                <RestaurantServiceContractForm
                  contrato={serviceContrato}
                  canEdit
                  onChange={setServiceContrato}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn-primary flex items-center gap-2"
                    disabled={serviceContratoSaving}
                    onClick={saveServiceContrato}
                  >
                    <MdSave /> {serviceContratoSaving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {(tab === 'sunat_bot' || tab === 'pago_uso_sistema') && (
          <MasterRestaurantBillingWorkspace active={tab === 'sunat_bot' ? 'sunat' : 'pago_uso'} />
        )}

        {tab === 'facturacion' && (
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-2">Fecha de facturación y bloqueo automático</h2>
            <p className="text-xs text-slate-500 mb-3">
              La fecha es la <strong>ancla del ciclo</strong> (p. ej. día de venta o alta). No exige pago ese mismo día: los avisos y el bloqueo automático por mora se calculan contra la <strong>próxima fecha de cobro</strong> (Pago por uso → próxima facturación, según periodo mensual o semestral).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de referencia del ciclo</label>
                <input className="input-field" type="date" value={control.billing_date || ''} onChange={(e) => setDashboard((p) => ({ ...p, control: { ...(p?.control || {}), billing_date: e.target.value } }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Avisar antes (días)</label>
                <input className="input-field" type="number" min="1" max="30" value={control.notify_days_before ?? 5} onChange={(e) => setDashboard((p) => ({ ...p, control: { ...(p?.control || {}), notify_days_before: Number(e.target.value || 5) } }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bloqueo automático por mora</label>
                <select className="input-field" value={Number(control.auto_block_on_overdue || 0) === 1 ? '1' : '0'} onChange={(e) => setDashboard((p) => ({ ...p, control: { ...(p?.control || {}), auto_block_on_overdue: Number(e.target.value) } }))}>
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button className="btn-primary flex items-center gap-2" onClick={() => updateControl({ billing_date: control.billing_date || '', notify_days_before: Number(control.notify_days_before || 5), auto_block_on_overdue: Number(control.auto_block_on_overdue || 0) }, 'Parámetros de facturación guardados')}><MdSave /> Guardar facturación</button>
            </div>
          </div>
        )}

        {tab === 'notificaciones' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <h2 className="font-semibold text-slate-800 mb-3">Publicar notificación para administradores</h2>
              <form onSubmit={sendNotification} className="space-y-3">
                <input className="input-field" placeholder="Título" value={notifyForm.title} onChange={(e) => setNotifyForm((p) => ({ ...p, title: e.target.value }))} required />
                <textarea className="input-field" rows={4} placeholder="Mensaje" value={notifyForm.message} onChange={(e) => setNotifyForm((p) => ({ ...p, message: e.target.value }))} required />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Duración</label>
                    <input
                      type="number"
                      min="1"
                      className="input-field"
                      value={notifyForm.duration_value}
                      onChange={(e) => setNotifyForm((p) => ({ ...p, duration_value: Number(e.target.value || 1) }))}
                      disabled={notifyForm.no_expiry}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label>
                    <select
                      className="input-field"
                      value={notifyForm.duration_unit}
                      onChange={(e) => setNotifyForm((p) => ({ ...p, duration_unit: e.target.value }))}
                      disabled={notifyForm.no_expiry}
                    >
                      <option value="hours">Horas (ej. 1h, 5h)</option>
                      <option value="days">Días</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={notifyForm.no_expiry}
                        onChange={(e) => setNotifyForm((p) => ({ ...p, no_expiry: e.target.checked }))}
                      />
                      Sin vencimiento
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Imagen (opcional)</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => uploadImage(e.target.files?.[0])} />
                  {uploadingImage && <p className="text-xs text-slate-500 mt-1">Subiendo imagen...</p>}
                  {notifyForm.image_url && <p className="text-xs text-emerald-700 mt-1">Imagen cargada: {notifyForm.image_url}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={previewDraftNotification} className="btn-secondary">Mostrar en pantalla</button>
                  <button type="submit" className="btn-primary flex items-center gap-2"><MdUpload /> Publicar notificación</button>
                </div>
              </form>
            </div>
            <div className="card">
              <h3 className="font-semibold text-slate-800 mb-2">Historial de notificaciones</h3>
              <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                {notifications.map((n) => (
                  <div key={n.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-800">{n.title}</p>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setPreviewNotification(n)} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs text-slate-700">Mostrar</button>
                        <button type="button" onClick={() => openEditNotification(n)} className="p-2 rounded bg-sky-50 hover:bg-sky-100 text-sky-700" aria-label="Editar notificación"><MdEdit /></button>
                        <button type="button" onClick={() => removeNotification(n)} className="p-2 rounded bg-red-50 hover:bg-red-100 text-red-700" aria-label="Eliminar notificación"><MdDelete /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{new Date(n.created_at).toLocaleString('es-PE')} · {n.created_by}</p>
                    <p className={`text-xs mb-2 ${n.expires_at && new Date(n.expires_at).getTime() <= Date.now() ? 'text-red-600' : 'text-emerald-600'}`}>{getRemainingLabel(n.expires_at)}</p>
                    <p className="text-sm text-slate-700">{n.message}</p>
                    {n.image_url ? <img src={n.image_url} alt={n.title} className="mt-2 w-full max-h-40 object-cover rounded-lg border" /> : null}
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-sm text-slate-500">No hay notificaciones publicadas.</p>}
              </div>
            </div>
          </div>
        )}

        {tab === 'bloqueo' && (
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-3">Bloqueo total del sistema</h2>
            <div className={`rounded-lg border p-3 mb-3 ${lockEnabled ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              Estado actual: <strong>{lockEnabled ? 'BLOQUEADO' : 'OPERATIVO'}</strong>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de bloqueo</label>
                <input className="input-field" value={control.global_lock_reason || ''} onChange={(e) => setDashboard((p) => ({ ...p, control: { ...(p?.control || {}), global_lock_reason: e.target.value } }))} />
              </div>
              <div className="flex items-end gap-2">
                <button
                  className={`px-4 py-2 rounded-lg text-white font-medium ${lockEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                  onClick={() => updateControl({ global_lock_enabled: lockEnabled ? 0 : 1, global_lock_reason: control.global_lock_reason || 'Bloqueo por falta de pago' }, lockEnabled ? 'Sistema desbloqueado' : 'Sistema bloqueado')}
                >
                  {lockEnabled ? 'Desactivar bloqueo' : 'Activar "bloqueo por falta de pago"'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Cuando está activo, ningún usuario estándar podrá ingresar ni operar hasta que lo desactives.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowMasterAccessModal(true)}
        className="fixed bottom-6 right-6 z-40 px-4 py-3 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-lg flex items-center gap-2"
      >
        <MdManageAccounts />
        Acceso maestro
      </button>

      <Modal isOpen={showMasterAccessModal} onClose={() => setShowMasterAccessModal(false)} title="Acceso administrador maestro">
        <form onSubmit={updateMasterCredentials} className="space-y-3">
          <div className="rounded-lg bg-slate-50 border px-3 py-2 text-sm">
            <strong>Usuario actual:</strong> {creds.username}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña actual *</label>
            <input
              type="password"
              className="input-field"
              value={masterCredForm.current_password}
              onChange={(e) => setMasterCredForm((p) => ({ ...p, current_password: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo usuario (opcional)</label>
            <input
              className="input-field"
              value={masterCredForm.new_username}
              onChange={(e) => setMasterCredForm((p) => ({ ...p, new_username: e.target.value }))}
              placeholder="Deja vacío para mantener actual"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nueva contraseña (opcional)</label>
            <input
              type="password"
              className="input-field"
              value={masterCredForm.new_password}
              onChange={(e) => setMasterCredForm((p) => ({ ...p, new_password: e.target.value }))}
              placeholder="Deja vacío para mantener actual"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar nueva contraseña</label>
            <input
              type="password"
              className="input-field"
              value={masterCredForm.confirm_password}
              onChange={(e) => setMasterCredForm((p) => ({ ...p, confirm_password: e.target.value }))}
              placeholder="Solo si cambias contraseña"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowMasterAccessModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary flex items-center gap-2"><MdSave /> Guardar credenciales</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showCreateBuyerModal}
        onClose={() => {
          setShowCreateBuyerModal(false);
          setShowBuyerPassword(false);
        }}
        title="Crear administrador comprador"
      >
        <form onSubmit={createAdminBuyer} className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="input-field" placeholder="Usuario" value={adminForm.username} onChange={(e) => setAdminForm((p) => ({ ...p, username: e.target.value }))} required />
          <input className="input-field" placeholder="Nombre completo" value={adminForm.full_name} onChange={(e) => setAdminForm((p) => ({ ...p, full_name: e.target.value }))} required />
          <input className="input-field md:col-span-2" type="email" placeholder="Email" value={adminForm.email} onChange={(e) => setAdminForm((p) => ({ ...p, email: e.target.value }))} required />
          <div className="md:col-span-2 relative">
            <input
              className="input-field pr-10"
              type={showBuyerPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              value={adminForm.password}
              onChange={(e) => setAdminForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
            <button
              type="button"
              onClick={() => setShowBuyerPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              aria-label={showBuyerPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showBuyerPassword ? <MdVisibilityOff /> : <MdVisibility />}
            </button>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowCreateBuyerModal(false)}>Cancelar</button>
            <button className="btn-primary flex items-center justify-center gap-2" type="submit"><MdAdd /> Crear administrador</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showEditNotificationModal} onClose={() => setShowEditNotificationModal(false)} title="Editar notificación">
        <form onSubmit={submitEditNotification} className="space-y-3">
          <input className="input-field" placeholder="Título" value={editNotifyForm.title} onChange={(e) => setEditNotifyForm((p) => ({ ...p, title: e.target.value }))} required />
          <textarea className="input-field" rows={4} placeholder="Mensaje" value={editNotifyForm.message} onChange={(e) => setEditNotifyForm((p) => ({ ...p, message: e.target.value }))} required />
          <input className="input-field" placeholder="URL de imagen (opcional)" value={editNotifyForm.image_url} onChange={(e) => setEditNotifyForm((p) => ({ ...p, image_url: e.target.value }))} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duración</label>
              <input
                type="number"
                min="1"
                className="input-field"
                value={editNotifyForm.duration_value}
                onChange={(e) => setEditNotifyForm((p) => ({ ...p, duration_value: Number(e.target.value || 1) }))}
                disabled={editNotifyForm.no_expiry}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label>
              <select
                className="input-field"
                value={editNotifyForm.duration_unit}
                onChange={(e) => setEditNotifyForm((p) => ({ ...p, duration_unit: e.target.value }))}
                disabled={editNotifyForm.no_expiry}
              >
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editNotifyForm.no_expiry}
                  onChange={(e) => setEditNotifyForm((p) => ({ ...p, no_expiry: e.target.checked }))}
                />
                Sin vencimiento
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowEditNotificationModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary flex items-center gap-2"><MdSave /> Guardar cambios</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showEditBuyerModal} onClose={() => setShowEditBuyerModal(false)} title="Editar credenciales del administrador comprador">
        <form onSubmit={submitEditBuyer} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
            <input className="input-field" value={editBuyerForm.username} onChange={(e) => setEditBuyerForm((p) => ({ ...p, username: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
            <input className="input-field" value={editBuyerForm.full_name} onChange={(e) => setEditBuyerForm((p) => ({ ...p, full_name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" className="input-field" value={editBuyerForm.email} onChange={(e) => setEditBuyerForm((p) => ({ ...p, email: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nueva contraseña (opcional)</label>
            <div className="relative">
              <input
                className="input-field pr-10"
                type={showEditBuyerPassword ? 'text' : 'password'}
                value={editBuyerForm.password}
                onChange={(e) => setEditBuyerForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Dejar vacío para mantener la actual"
              />
              <button
                type="button"
                onClick={() => setShowEditBuyerPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                aria-label={showEditBuyerPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showEditBuyerPassword ? <MdVisibilityOff /> : <MdVisibility />}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowEditBuyerModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
          </div>
        </form>
      </Modal>

      {previewNotification && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setPreviewNotification(null)} />
          <aside className="fixed top-0 right-0 h-screen w-full md:w-1/2 bg-white z-50 shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Vista previa de notificación</h3>
              <button
                type="button"
                onClick={() => setPreviewNotification(null)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label="Cerrar vista previa"
              >
                <MdClose className="text-xl" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <h4 className="text-2xl font-bold text-slate-900 mb-2">{previewNotification.title}</h4>
              <p className="text-sm text-slate-500 mb-4">
                {new Date(previewNotification.created_at).toLocaleString('es-PE')} · {previewNotification.created_by}
              </p>
              <p className="text-sm text-slate-600 mb-4">{getRemainingLabel(previewNotification.expires_at)}</p>
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
