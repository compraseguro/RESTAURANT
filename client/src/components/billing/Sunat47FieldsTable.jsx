import { SUNAT_47_CATALOG, SUNAT_47_COUNT } from '../../data/sunat47Catalog';

const emitHint = 'Se completa al emitir el comprobante (caja / servidor).';
const metaHint = (flags) => {
  if (flags?.billing_api_url_from_env || flags?.billing_api_secret_from_env) {
    return 'Configurado con EFACT_API_URL / EFACT_HTTP_SECRET en el entorno del API Node.';
  }
  if (flags?.has_billing_api_token || flags?.hasStoredUrl) {
    return 'Valores almacenados en el servidor (no visibles en pantalla).';
  }
  return 'Defina EFACT_API_URL y EFACT_HTTP_SECRET en el servidor para conectar con el bot.';
};

function CellReadonly({ children, muted }) {
  return (
    <span className={`text-xs ${muted ? 'text-slate-500' : 'text-slate-600'}`}>{children}</span>
  );
}

export default function Sunat47FieldsTable({
  restaurant,
  onRestaurantField,
  billingPanel,
  onBillingPanelField,
  billingExtras,
  onBillingExtrasField,
  disabled,
  billingFlags,
  variant = 'light',
}) {
  const isDark = variant === 'dark';
  const th = isDark ? 'text-slate-300 border-slate-600' : 'text-slate-600 border-slate-200';
  const td = isDark ? 'border-slate-700' : 'border-slate-100';
  const inputCls = isDark
    ? 'input-field bg-[#0f172a] border-slate-600 text-slate-100'
    : 'input-field';

  const parseBind = (row) => {
    const parts = String(row.bind || '').split('.');
    return { kind: parts[0] || '', subKey: parts.slice(1).join('.') };
  };

  const renderControl = (row) => {
    if (row.input === 'readonly') {
      if (row.bind === 'emit') {
        if (row.id === 'tipocomp') return <CellReadonly>{emitHint}</CellReadonly>;
        if (row.id === 'corr') return <CellReadonly>Automático según último correlativo por serie.</CellReadonly>;
        return <CellReadonly>{emitHint}</CellReadonly>;
      }
      if (row.bind === 'meta') {
        return <CellReadonly muted>{metaHint(billingFlags)}</CellReadonly>;
      }
    }

    if (row.input === 'triple') {
      return (
        <div className="flex flex-wrap gap-2">
          {row.fields.map((f) => (
            <input
              key={f.key}
              type="text"
              placeholder={f.ph}
              className={`${inputCls} flex-1 min-w-[120px]`}
              value={restaurant?.[f.key] ?? ''}
              disabled={disabled}
              onChange={(e) => onRestaurantField(f.key, e.target.value)}
            />
          ))}
        </div>
      );
    }

    if (row.input === 'dual_series') {
      return (
        <div className="flex flex-wrap gap-2">
          {row.fields.map((f) => (
            <input
              key={f.key}
              type="text"
              placeholder={f.ph}
              className={`${inputCls} flex-1 min-w-[100px]`}
              value={restaurant?.[f.key] ?? ''}
              disabled={disabled}
              onChange={(e) => onRestaurantField(f.key, (e.target.value || '').toUpperCase())}
            />
          ))}
        </div>
      );
    }

    const { kind, subKey } = parseBind(row);

    if (kind === 'r') {
      if (row.input === 'select') {
        return (
          <select
            className={inputCls}
            value={String(restaurant?.[subKey] ?? '')}
            disabled={disabled}
            onChange={(e) => onRestaurantField(subKey, e.target.value)}
          >
            {(row.options || []).map((o) => (
              <option key={String(o.v)} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        );
      }
      if (row.input === 'number') {
        const raw = restaurant?.[subKey];
        const n = Number(raw);
        const display = Number.isFinite(n) ? n : 18;
        return (
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className={inputCls}
            value={display}
            disabled={disabled}
            onChange={(e) => onRestaurantField(subKey, parseFloat(e.target.value) || 0)}
          />
        );
      }
      const maxLen = row.maxLen ? { maxLength: row.maxLen } : {};
      const rucVal = String(restaurant?.company_ruc ?? '').replace(/\D/g, '').slice(0, 11);
      return (
        <input
          type={row.input === 'password' ? 'password' : 'text'}
          className={inputCls}
          value={subKey === 'company_ruc' ? rucVal : restaurant?.[subKey] ?? ''}
          placeholder={row.placeholder || ''}
          disabled={disabled}
          {...maxLen}
          onChange={(e) => {
            if (subKey === 'company_ruc') onRestaurantField(subKey, e.target.value.replace(/\D/g, '').slice(0, 11));
            else onRestaurantField(subKey, e.target.value);
          }}
        />
      );
    }

    if (kind === 'p') {
      const key = subKey;
      const pv = billingPanel?.[key];
      const strVal = pv === undefined || pv === null ? '' : String(pv);
      const opts = row.options || [];
      const firstOptV = opts[0]?.v;
      const selectValue =
        strVal === '' && firstOptV !== undefined && firstOptV !== null
          ? String(firstOptV)
          : strVal;
      if (row.input === 'select') {
        return (
          <select
            className={inputCls}
            value={selectValue}
            disabled={disabled}
            onChange={(e) => {
              let v = e.target.value;
              if (row.id === 'op' || row.id === 'tenv' || row.id === 'modo' || row.id === 'fpago') v = e.target.value;
              onBillingPanelField(key, v);
            }}
          >
            {(row.options || []).map((o) => (
              <option key={String(o.v)} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        );
      }
      if (row.input === 'checkbox') {
        const checked = Number(pv) === 1;
        return (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-slate-400"
              checked={checked}
              disabled={disabled}
              onChange={(e) => onBillingPanelField(key, e.target.checked ? 1 : 0)}
            />
            <span className="text-xs text-slate-500">Activado en servidor / emisión</span>
          </label>
        );
      }
      return (
        <input
          type={row.input === 'password' ? 'password' : 'text'}
          className={inputCls}
          value={strVal}
          placeholder={row.placeholder || ''}
          disabled={disabled}
          maxLength={row.maxLen}
          onChange={(e) => onBillingPanelField(key, e.target.value)}
        />
      );
    }

    if (kind === 'x') {
      const key = subKey;
      return (
        <select
          className={inputCls}
          value={Number(billingExtras?.[key]) ? '1' : '0'}
          disabled={disabled}
          onChange={(e) => onBillingExtrasField(key, Number(e.target.value))}
        >
          {(row.options || []).map((o) => (
            <option key={String(o.v)} value={String(o.v)}>
              {o.l}
            </option>
          ))}
        </select>
      );
    }

    return <CellReadonly>—</CellReadonly>;
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className={`px-4 py-3 text-sm font-semibold ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-800'}`}>
        Datos SUNAT y comprobante electrónico — {SUNAT_47_COUNT} parámetros
      </div>
      <div className="max-h-[min(75vh,720px)] overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <tr className={`border-b ${th}`}>
              <th className="text-left py-2 px-3 w-[28%]">Dato</th>
              <th className="text-left py-2 px-3 w-[36%]">Función</th>
              <th className="text-left py-2 px-3 w-[36%]">Valor / configuración</th>
            </tr>
          </thead>
          <tbody>
            {SUNAT_47_CATALOG.map((row) => (
              <tr key={row.id} className={`border-b ${td} align-top`}>
                <td className={`py-2.5 px-3 font-medium ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{row.label}</td>
                <td className={`py-2.5 px-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({row.help})</td>
                <td className="py-2.5 px-3">{renderControl(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
