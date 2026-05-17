import { DATE_PRESETS } from '../../utils/indicatorsDatePresets';

export default function IndicatorsDateFilters({ preset, onPresetChange, filters, onFiltersChange }) {
  return (
    <div className="card grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 py-3">
      <div className="flex flex-wrap gap-2 items-center">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              preset === p.id
                ? 'bg-gold-600 text-white border-gold-600'
                : 'border-[color:var(--ui-border)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 min-w-[240px]">
        <div>
          <label className="block text-xs text-[var(--ui-muted)] mb-1">Desde</label>
          <input
            type="date"
            className="input-field"
            value={filters.from}
            onChange={(e) => {
              onPresetChange('custom');
              onFiltersChange({ ...filters, from: e.target.value });
            }}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--ui-muted)] mb-1">Hasta</label>
          <input
            type="date"
            className="input-field"
            value={filters.to}
            onChange={(e) => {
              onPresetChange('custom');
              onFiltersChange({ ...filters, to: e.target.value });
            }}
          />
        </div>
      </div>
    </div>
  );
}
