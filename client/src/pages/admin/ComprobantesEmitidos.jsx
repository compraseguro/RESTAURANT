import { useState, useEffect, useCallback } from 'react';
import { api, resolveMediaUrl, formatCurrency } from '../../utils/api';
import toast from 'react-hot-toast';
import { MdRefresh, MdPictureAsPdf, MdWhatsapp, MdSearch } from 'react-icons/md';

function buildWhatsappUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  let n = digits;
  if (n.length === 9) n = `51${n}`;
  else if (n.length === 10 && n.startsWith('0')) n = `51${n.slice(1)}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

export default function ComprobantesEmitidos() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [docType, setDocType] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '150', doc_type: docType, search: searchApplied.trim() });
      const data = await api.get(`/billing/documents?${q.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los comprobantes');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, docType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Comprobantes electrónicos</h1>
        <button type="button" onClick={load} className="btn-secondary flex items-center justify-center gap-2 shrink-0" disabled={loading}>
          <MdRefresh className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Buscar</label>
            <div className="relative">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field pl-9"
                placeholder="Número, cliente, DNI/RUC o celular"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSearchApplied(searchInput.trim());
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-slate-600 mb-0">Tipo</label>
            <select className="input-field" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="all">Todos</option>
              <option value="boleta">Boleta</option>
              <option value="factura">Factura</option>
            </select>
            <button
              type="button"
              className="btn-primary text-sm py-2"
              onClick={() => setSearchApplied(searchInput.trim())}
            >
              Buscar
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">Descarga el PDF para imprimir o abre WhatsApp con el número guardado al emitir el comprobante.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Celular</th>
                <th className="px-4 py-3">Mesa</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">Cargando…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">No hay comprobantes registrados.</td>
                </tr>
              ) : (
                rows.map((d) => {
                  const pdfAbs = d.pdf_url ? resolveMediaUrl(d.pdf_url) : '';
                  const msg = pdfAbs
                    ? `Hola, adjuntamos tu comprobante ${d.full_number || ''}. Puedes ver el PDF aquí: ${pdfAbs}`
                    : `Hola, tu comprobante ${d.full_number || ''} ya está registrado.`;
                  const wa = buildWhatsappUrl(d.customer_phone, msg);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {d.created_at ? String(d.created_at).replace('T', ' ').slice(0, 16) : '—'}
                      </td>
                      <td className="px-4 py-3 capitalize">{d.doc_type || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{d.full_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-800 max-w-[180px] truncate" title={d.customer_name}>{d.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{d.customer_phone || '—'}</td>
                      <td className="px-4 py-3">{d.table_number != null && d.table_number !== '' ? d.table_number : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(Number(d.total || 0))}</td>
                      <td className="px-4 py-3 text-xs">{d.provider_status || '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {pdfAbs ? (
                          <a
                            href={pdfAbs}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline mr-3"
                          >
                            <MdPictureAsPdf /> PDF
                          </a>
                        ) : (
                          <span className="text-slate-400 mr-3">Sin PDF</span>
                        )}
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                          >
                            <MdWhatsapp /> WhatsApp
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">Sin celular</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
