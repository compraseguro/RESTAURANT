import { useState, useEffect, useCallback } from 'react';
import { api, API_BASE } from '../utils/api';
import toast from 'react-hot-toast';
import { MdPrint, MdCloudDone, MdCloudOff, MdUsb, MdRouter } from 'react-icons/md';

const LOCAL_AGENT = 'http://127.0.0.1:37421';

export default function PrintAgentSettingsSection() {
  const [health, setHealth] = useState(null);
  const [agentsOnline, setAgentsOnline] = useState([]);
  const [tokenPayload, setTokenPayload] = useState(null);
  const [deviceLabel, setDeviceLabel] = useState('PC del restaurante');
  const [enableCocina, setEnableCocina] = useState(true);
  const [enableBar, setEnableBar] = useState(true);
  const [enableDelivery, setEnableDelivery] = useState(false);
  const [enableParrilla, setEnableParrilla] = useState(false);
  const [enableCaja, setEnableCaja] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [bindingsHint, setBindingsHint] = useState('');

  const probeLocal = useCallback(async () => {
    try {
      const r = await fetch(`${LOCAL_AGENT}/health`, { method: 'GET' });
      const j = await r.json();
      setHealth(j);
    } catch (_) {
      setHealth({ ok: false, paired: false, wsConnected: false });
    }
  }, []);

  const loadOnline = useCallback(async () => {
    try {
      const data = await api.get('/print-agent/agents-online');
      setAgentsOnline(Array.isArray(data?.agents) ? data.agents : []);
    } catch (_) {
      setAgentsOnline([]);
    }
  }, []);

  useEffect(() => {
    probeLocal();
    loadOnline();
    const t = setInterval(() => {
      probeLocal();
      loadOnline();
    }, 8000);
    return () => clearInterval(t);
  }, [probeLocal, loadOnline]);

  const issueToken = async () => {
    try {
      const data = await api.post('/print-agent/issue-token', { device_label: deviceLabel });
      setTokenPayload(data);
      toast.success('Token generado. Use «Enviar a este equipo» en la PC donde corre el agente.');
    } catch (e) {
      toast.error(e.message || 'No se pudo generar el token');
    }
  };

  const enableStations = async () => {
    try {
      await api.post('/print-agent/enable-stations', {
        cocina: enableCocina,
        bar: enableBar,
        delivery: enableDelivery,
        parrilla: enableParrilla,
        caja: enableCaja,
      });
      toast.success('Estaciones configuradas para Print Agent');
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar');
    }
  };

  const sendPairToLocalhost = async () => {
    if (!tokenPayload?.token || !tokenPayload?.apiBase) {
      toast.error('Genere un token primero');
      return;
    }
    setPairing(true);
    try {
      const r = await fetch(`${LOCAL_AGENT}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenPayload.token, apiBase: tokenPayload.apiBase }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo emparejar');
      toast.success('Agente local emparejado. Debería conectarse en segundos.');
      probeLocal();
    } catch (e) {
      toast.error(
        e.message ||
          '¿Está ejecutándose el Print Agent en esta PC? (node print-agent o servicio Windows)'
      );
    } finally {
      setPairing(false);
    }
  };

  const testPrint = async (area) => {
    try {
      await api.post('/print-agent/test-print', { area });
      toast.success('Trabajo de prueba enviado a agentes conectados');
    } catch (e) {
      toast.error(e.message || 'Error');
    }
  };

  const agentOk = health?.ok && health?.paired && health?.wsConnected;
  const cloudOk = agentsOnline.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-5">
        <h3 className="text-lg font-bold text-[var(--ui-body-text)] flex items-center gap-2">
          <MdPrint className="text-2xl text-[var(--ui-accent-muted)]" />
          Print Agent (impresión silenciosa)
        </h3>
        <p className="text-sm text-[var(--ui-muted)] mt-2">
          Instale el agente ligero en la PC conectada a la térmica. El panel puede emparejarlo en un clic
          (sin ventanas de impresión del navegador). La impresión automática de cocina/bar se activa cuando las
          rutas usan conexión «Print Agent» y hay al menos un agente en línea.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
          Los navegadores y el sistema operativo no permiten instalar software sin ninguna acción del usuario:
          el primer uso requiere ejecutar o autorizar el agente una vez. Después puede iniciarse solo con Windows
          (Tareas programadas) según la guía en <code className="text-[11px]">print-agent/README.md</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className={`rounded-xl border p-4 ${
            agentOk
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--ui-body-text)]">
            {agentOk ? <MdCloudDone className="text-emerald-500 text-xl" /> : <MdCloudOff className="text-xl text-[var(--ui-muted)]" />}
            Agente en esta PC
          </div>
          <p className="text-xs text-[var(--ui-muted)] mt-1">
            {health?.ok
              ? health.paired
                ? health.wsConnected
                  ? 'Conectado al servidor'
                  : 'Emparejado; esperando WebSocket…'
                : 'Servicio local activo; falta emparejar'
              : 'No responde en 127.0.0.1:37421'}
            {typeof health?.queuePending === 'number' ? (
              <span className="block mt-1">Cola local: {health.queuePending} pendiente(s)</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => void probeLocal()}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-[color:var(--ui-border)] hover:bg-[var(--ui-sidebar-hover)]"
          >
            Actualizar estado
          </button>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            cloudOk
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--ui-body-text)]">
            <MdRouter className="text-[var(--ui-accent-muted)] text-xl" />
            Agentes en la nube
          </div>
          <p className="text-xs text-[var(--ui-muted)] mt-1">
            {cloudOk ? `${agentsOnline.length} conectado(s)` : 'Ningún agente autenticado ahora'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-5 space-y-4">
        <h4 className="font-semibold text-[var(--ui-body-text)]">1. Estaciones con Print Agent</h4>
        <label className="flex items-center gap-2 text-sm text-[var(--ui-body-text)]">
          <input type="checkbox" checked={enableCocina} onChange={(e) => setEnableCocina(e.target.checked)} />
          Cocina
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ui-body-text)]">
          <input type="checkbox" checked={enableBar} onChange={(e) => setEnableBar(e.target.checked)} />
          Bar
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ui-body-text)]">
          <input type="checkbox" checked={enableDelivery} onChange={(e) => setEnableDelivery(e.target.checked)} />
          Delivery (comanda automática solo en pedidos delivery)
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ui-body-text)]">
          <input type="checkbox" checked={enableParrilla} onChange={(e) => setEnableParrilla(e.target.checked)} />
          Parrilla (misma lógica que cocina)
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ui-body-text)]">
          <input type="checkbox" checked={enableCaja} onChange={(e) => setEnableCaja(e.target.checked)} />
          Caja (conexión agent; impresión automática desde API <code className="text-[10px]">/print-agent/push-job</code>)
        </label>
        <button type="button" onClick={() => void enableStations()} className="btn-primary px-4 py-2 rounded-lg text-sm">
          Guardar rutas (connection_type = agent)
        </button>
      </div>

      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-5 space-y-4">
        <h4 className="font-semibold text-[var(--ui-body-text)]">2. Token y emparejamiento</h4>
        <div>
          <label className="text-xs text-[var(--ui-muted)]">Nombre del equipo</label>
          <input
            className="mt-1 w-full rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void issueToken()} className="btn-primary px-4 py-2 rounded-lg text-sm">
            Generar token (365 días)
          </button>
          <button
            type="button"
            disabled={pairing}
            onClick={() => void sendPairToLocalhost()}
            className="px-4 py-2 rounded-lg text-sm border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-sidebar-hover)] disabled:opacity-50"
          >
            {pairing ? 'Enviando…' : 'Enviar a este equipo (localhost)'}
          </button>
        </div>
        {tokenPayload?.token ? (
          <div className="text-xs break-all font-mono bg-[var(--ui-surface-2)] p-3 rounded-lg border border-[color:var(--ui-border)]">
            <div className="text-[var(--ui-muted)] mb-1">API base: {tokenPayload.apiBase}</div>
            <div>{tokenPayload.token.slice(0, 48)}…</div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-5 space-y-3">
        <h4 className="font-semibold text-[var(--ui-body-text)] flex items-center gap-2">
          <MdUsb /> 3. Enlaces físicos (en la PC del agente)
        </h4>
        <p className="text-sm text-[var(--ui-muted)]">
          Edite <code className="text-xs">print-agent/data/config.json</code> y defina{' '}
          <code className="text-xs">bindings</code>: IP:9100 para red, o UNC Windows para cola compartida.
        </p>
        <textarea
          className="w-full h-28 text-xs font-mono rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-3"
          placeholder={`Ejemplo bindings:\n{\n  "cocina": { "transport": "tcp", "host": "192.168.1.50", "port": 9100 },\n  "bar": { "transport": "tcp", "host": "192.168.1.51", "port": 9100 },\n  "delivery": { "transport": "tcp", "host": "192.168.1.52", "port": 9100 },\n  "caja": { "transport": "tcp", "host": "192.168.1.53", "port": 9100 }\n}`}
          value={bindingsHint}
          onChange={(e) => setBindingsHint(e.target.value)}
        />
        <p className="text-xs text-[var(--ui-muted)]">Este cuadro es solo ayuda visual; copie el JSON al archivo del agente.</p>
      </div>

      <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-5 flex flex-wrap gap-2">
        <span className="text-sm font-medium text-[var(--ui-body-text)] w-full">Prueba</span>
        <button
          type="button"
          onClick={() => void testPrint('cocina')}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)]"
        >
          Ticket prueba · Cocina
        </button>
        <button
          type="button"
          onClick={() => void testPrint('bar')}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)]"
        >
          Ticket prueba · Bar
        </button>
        <button
          type="button"
          onClick={() => void testPrint('delivery')}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)]"
        >
          Ticket prueba · Delivery
        </button>
        <button
          type="button"
          onClick={() => void testPrint('caja')}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)]"
        >
          Ticket prueba · Caja
        </button>
        <button
          type="button"
          onClick={() => void testPrint('parrilla')}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)]"
        >
          Ticket prueba · Parrilla
        </button>
        <span className="text-xs text-[var(--ui-muted)] w-full">
          API interna: <code className="text-[10px]">{API_BASE}</code>
        </span>
      </div>
    </div>
  );
}
