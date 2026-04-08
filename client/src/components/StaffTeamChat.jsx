import { useEffect, useState, useRef, useCallback } from 'react';
import { api, formatDateTime } from '../utils/api';
import { getSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { MdSend, MdGroup, MdPerson } from 'react-icons/md';

const ROLE_LABEL = {
  admin: 'Admin',
  cajero: 'Caja',
  mozo: 'Mozo',
  cocina: 'Cocina',
  bar: 'Bar',
  delivery: 'Delivery',
};

/**
 * Chat grupal (todos) o privado entre dos usuarios staff. Ciclo de mensajes en servidor.
 * @param {boolean} isActive — panel de mensajes visible (no sumar no leídos)
 * @param {(n:number)=>void} onUnreadDelta
 */
export default function StaffTeamChat({ isActive, onUnreadDelta }) {
  const { user } = useAuth();
  const [mode, setMode] = useState('group');
  const [recipients, setRecipients] = useState([]);
  const [privateUserId, setPrivateUserId] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatMeta, setChatMeta] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const loadMeta = useCallback(async () => {
    try {
      const s = await api.get('/staff-chat/state');
      setChatMeta(s);
    } catch {
      setChatMeta(null);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      if (mode === 'group') {
        const data = await api.get('/staff-chat/messages?mode=group');
        setMessages(data.messages || []);
      } else if (privateUserId) {
        const data = await api.get(
          `/staff-chat/messages?mode=private&with_user=${encodeURIComponent(privateUserId)}`
        );
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('staff-chat loadMessages', err);
      toast.error(err?.message || 'No se pudieron cargar los mensajes');
      setMessages([]);
    }
  }, [mode, privateUserId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    api.get('/staff-chat/recipients')
      .then((data) => setRecipients(Array.isArray(data) ? data : []))
      .catch((err) => {
        setRecipients([]);
        toast.error(err?.message || 'No se pudo cargar la lista de compañeros');
      });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages();
    }, 20000);
    return () => clearInterval(id);
  }, [loadMessages]);

  useEffect(() => {
    const s = getSocket();
    const token = localStorage.getItem('token');
    if (token) s.emit('join-staff', { token });

    const onMsg = (msg) => {
      const me = user?.id;
      if (!me || !msg?.id) return;

      const append = (row) => {
        setMessages((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
        scrollToBottom();
      };

      const notify = () => {
        if (!isActive && msg.sender_id !== me) {
          onUnreadDelta?.(1);
          toast(`${msg.sender_name || 'Equipo'}`, {
            icon: '💬',
            description: String(msg.body || '').slice(0, 140),
          });
        }
      };

      if (!msg.recipient_id) {
        if (mode === 'group') append(msg);
        notify();
        return;
      }

      const inThread =
        msg.sender_id === me || msg.recipient_id === me;
      if (!inThread) return;

      const peer = msg.sender_id === me ? msg.recipient_id : msg.sender_id;
      if (mode === 'private' && privateUserId === peer) append(msg);

      if (!isActive && msg.sender_id !== me) {
        onUnreadDelta?.(1);
        toast(`${msg.sender_name || 'Privado'}`, {
          icon: '✉️',
          description: String(msg.body || '').slice(0, 140),
        });
      }
    };

    s.on('staff-chat-message', onMsg);
    return () => s.off('staff-chat-message', onMsg);
  }, [user?.id, mode, privateUserId, isActive, onUnreadDelta]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, mode, privateUserId]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    if (mode === 'private' && !privateUserId) {
      toast.error('Seleccione un compañero');
      return;
    }
    setSending(true);
    try {
      const saved = await api.post('/staff-chat/messages', {
        body: t,
        recipient_id: mode === 'private' ? privateUserId : undefined,
      });
      setText('');
      if (saved?.id) {
        setMessages((prev) => (prev.some((x) => x.id === saved.id) ? prev : [...prev, saved]));
      }
      await loadMessages();
      await loadMeta();
      scrollToBottom();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[280px]">
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setMode('group'); setPrivateUserId(''); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            mode === 'group'
              ? 'bg-[#2563EB] border-[#2563EB] text-white'
              : 'bg-[#111827]/60 border-[#3B82F6]/35 text-[#9CA3AF] hover:text-[#F9FAFB]'
          }`}
        >
          <MdGroup className="text-base" /> Chat de grupo
        </button>
        <button
          type="button"
          onClick={() => setMode('private')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            mode === 'private'
              ? 'bg-[#2563EB] border-[#2563EB] text-white'
              : 'bg-[#111827]/60 border-[#3B82F6]/35 text-[#9CA3AF] hover:text-[#F9FAFB]'
          }`}
        >
          <MdPerson className="text-base" /> Mensaje privado
        </button>
      </div>

      {mode === 'private' && (
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wide text-[#9CA3AF] mb-1">Enviar a</label>
          <select
            value={privateUserId}
            onChange={(e) => setPrivateUserId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#111827]/80 border border-[#3B82F6]/35 text-[#F9FAFB] text-sm outline-none focus:ring-2 focus:ring-[#3B82F6]"
          >
            <option value="">— Seleccione usuario —</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} (@{r.username}) · {ROLE_LABEL[r.role] || r.role}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-[#3B82F6]/25 bg-[#0f172a]/80 p-3 space-y-2 mb-3">
        {messages.length === 0 ? (
          <p className="text-sm text-[#9CA3AF] text-center py-8">
            {mode === 'private' && !privateUserId
              ? 'Seleccione un compañero para ver el historial.'
              : 'Sin mensajes en este ciclo. Escriba el primero.'}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    mine
                      ? 'bg-[#2563EB]/90 text-white rounded-br-sm'
                      : 'bg-[#1F2937] text-[#F9FAFB] border border-[#3B82F6]/20 rounded-bl-sm'
                  }`}
                >
                  {!mine && (
                    <p className="text-[10px] font-semibold text-[#93C5FD] mb-0.5">
                      {m.sender_name || m.sender_username || 'Usuario'}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100/80' : 'text-[#9CA3AF]'}`}>
                    {formatDateTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === 'private' && !privateUserId ? 'Seleccione destinatario…' : 'Escribir mensaje…'}
          disabled={mode === 'private' && !privateUserId}
          className="flex-1 px-3 py-2 rounded-lg bg-[#111827]/80 border border-[#3B82F6]/35 text-[#F9FAFB] text-sm placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#3B82F6] disabled:opacity-50"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || !text.trim() || (mode === 'private' && !privateUserId)}
          className="shrink-0 px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50 flex items-center gap-1"
        >
          <MdSend className="text-lg" />
        </button>
      </form>

      {chatMeta && (
        <p className="text-[10px] text-[#9CA3AF] mt-2 leading-snug">
          Ciclo #{chatMeta.cycle_id}. El historial se renueva cuando nadie tiene sesión abierta y han pasado 24 h desde ese momento (al iniciar sesión se aplica el cambio).
        </p>
      )}
    </div>
  );
}
