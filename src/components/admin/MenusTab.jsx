// MenusTab — manage multiple menus + their schedules. The resolver in
// get_active_menu() picks one server-side based on priority + matching
// schedules (in shop-local time). The implicit kind='live' row represents
// the catalog; it can be renamed and re-prioritized but not deleted.
//
// P1 scope: list / create (placeholder kinds) / rename / toggle active /
// priority bump / per-menu schedule editor. PDF upload (P2), TV (P3), and
// the designer (P4) plug in by adding kind-specific creation flows and
// renderers; the data model and resolver don't change.

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import {
  loadMenus, addMenu, updateMenu, deleteMenu,
  addSchedule, updateSchedule, deleteSchedule,
  DAY_ORDER, DAY_BITS, daysToBitmask, bitmaskToDays
} from '../../api/menus';

function MenusTab({ showAlert, showConfirm }) {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  async function reload() {
    try {
      setMenus(await loadMenus());
    } catch (err) {
      showAlert?.('Error', err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await addMenu({ name, kind: 'designed', priority: 1 });
      setNewName('');
      await reload();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleRename(menu, name) {
    try { await updateMenu(menu.id, { name }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleToggleActive(menu) {
    try { await updateMenu(menu.id, { is_active: !menu.is_active }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  async function handlePriority(menu, delta) {
    try { await updateMenu(menu.id, { priority: Math.max(0, menu.priority + delta) }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleDelete(menu) {
    if (menu.kind === 'live') return;
    showConfirm?.('Eliminar menú', `¿Eliminar "${menu.name}"?`, async () => {
      try { await deleteMenu(menu.id); await reload(); }
      catch (err) { showAlert?.('Error', err.message); }
    });
  }

  if (loading) return <div className="admin-section fade-in"><p>Cargando…</p></div>;

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: 800 }}>Menús</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '1.05rem' }}>
          Múltiples menús con horarios. El de mayor prioridad cuyo horario coincida con la hora actual del negocio se muestra al cliente.
        </p>
      </div>

      <div style={{ background: 'var(--bg-surface)', padding: 20, borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', marginBottom: 24, display: 'flex', gap: 12 }}>
        <input
          type="text"
          placeholder="Nombre del nuevo menú (ej. Brunch, Verano)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' }}
        />
        <button onClick={handleCreate} style={btnPrimary}>
          <Icon icon="lucide:plus" /> Crear
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {menus.map(menu => (
          <MenuCard
            key={menu.id}
            menu={menu}
            expanded={expandedId === menu.id}
            onExpand={() => setExpandedId(expandedId === menu.id ? null : menu.id)}
            onRename={name => handleRename(menu, name)}
            onToggleActive={() => handleToggleActive(menu)}
            onPriority={delta => handlePriority(menu, delta)}
            onDelete={() => handleDelete(menu)}
            onScheduleChange={reload}
            showAlert={showAlert}
          />
        ))}
      </div>
    </div>
  );
}

function MenuCard({ menu, expanded, onExpand, onRename, onToggleActive, onPriority, onDelete, onScheduleChange, showAlert }) {
  const [name, setName] = useState(menu.name);
  useEffect(() => { setName(menu.name); }, [menu.name]);

  const isLive = menu.kind === 'live';

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', overflow: 'hidden', opacity: menu.is_active ? 1 : 0.55 }}>
      <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon icon={kindIcon(menu.kind)} style={{ fontSize: '1.4rem', color: 'var(--brand-color)' }} />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name !== menu.name && name.trim()) onRename(name.trim()); }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--text-main)', fontWeight: 800, fontSize: '1.05rem', outline: 'none' }}
        />

        <span style={kindBadge}>{kindLabel(menu.kind)}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'var(--bg-main)' }}>
          <button onClick={() => onPriority(-1)} disabled={isLive || menu.priority <= 0} style={priBtn} title="Bajar prioridad">
            <Icon icon="lucide:chevron-down" />
          </button>
          <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center', color: 'var(--text-main)' }}>{menu.priority}</span>
          <button onClick={() => onPriority(+1)} disabled={isLive} style={priBtn} title="Subir prioridad">
            <Icon icon="lucide:chevron-up" />
          </button>
        </div>

        <button onClick={onToggleActive} style={menu.is_active ? activeBtn : inactiveBtn}>
          <Icon icon={menu.is_active ? 'lucide:eye' : 'lucide:eye-off'} />
          {menu.is_active ? 'Activo' : 'Pausado'}
        </button>

        <button onClick={onExpand} style={iconBtn} title="Horarios">
          <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:calendar-clock'} />
          <span style={{ fontWeight: 700 }}>{menu.schedules.length} horario{menu.schedules.length === 1 ? '' : 's'}</span>
        </button>

        {!isLive && (
          <button onClick={onDelete} style={dangerBtn} title="Eliminar menú">
            <Icon icon="lucide:trash-2" />
          </button>
        )}
      </div>

      {expanded && (
        <ScheduleEditor
          menu={menu}
          onChange={onScheduleChange}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}

function ScheduleEditor({ menu, onChange, showAlert }) {
  async function add() {
    try { await addSchedule(menu.id, { days_of_week: 0 }); onChange(); }
    catch (err) { showAlert?.('Error', err.message); }
  }
  async function patch(id, next) {
    try { await updateSchedule(id, next); onChange(); }
    catch (err) { showAlert?.('Error', err.message); }
  }
  async function remove(id) {
    try { await deleteSchedule(id); onChange(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {menu.schedules.length === 0
            ? 'Sin horarios — el menú está activo en todo momento (cuando es el de mayor prioridad).'
            : 'El menú se mostrará si CUALQUIER horario coincide con la hora local del negocio.'}
        </p>
        <button onClick={add} style={btnSecondary}>
          <Icon icon="lucide:plus" /> Agregar horario
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {menu.schedules.map(s => (
          <ScheduleRow key={s.id} schedule={s} onPatch={p => patch(s.id, p)} onRemove={() => remove(s.id)} />
        ))}
      </div>
    </div>
  );
}

function ScheduleRow({ schedule, onPatch, onRemove }) {
  const [days, setDays] = useState(bitmaskToDays(schedule.days_of_week));
  const [startTime, setStartTime] = useState(schedule.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(schedule.end_time?.slice(0, 5) || '');
  const [startDate, setStartDate] = useState(schedule.start_date || '');
  const [endDate, setEndDate] = useState(schedule.end_date || '');

  function flush(next = {}) {
    onPatch({
      days_of_week: daysToBitmask(next.days ?? days),
      start_time: next.startTime ?? startTime,
      end_time: next.endTime ?? endTime,
      start_date: next.startDate ?? startDate,
      end_date: next.endDate ?? endDate
    });
  }

  function toggleDay(d) {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    setDays(next);
    flush({ days: next });
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {DAY_ORDER.map(d => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: on ? 'var(--brand-color)' : 'var(--bg-main)',
                color: on ? 'white' : 'var(--text-main)',
                fontWeight: 800,
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.05em'
              }}
            >{dayLabel(d)}</button>
          );
        })}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 8 }}>
          {days.length === 0 ? '(todos los días)' : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Field label="Desde (hora)">
          <input type="time" value={startTime}
            onChange={e => setStartTime(e.target.value)}
            onBlur={() => flush({ startTime })}
            style={inputStyle} />
        </Field>
        <Field label="Hasta (hora)">
          <input type="time" value={endTime}
            onChange={e => setEndTime(e.target.value)}
            onBlur={() => flush({ endTime })}
            style={inputStyle} />
        </Field>
        <Field label="Desde (fecha)">
          <input type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)}
            onBlur={() => flush({ startDate })}
            style={inputStyle} />
        </Field>
        <Field label="Hasta (fecha)">
          <input type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)}
            onBlur={() => flush({ endDate })}
            style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onRemove} style={dangerBtn}>
          <Icon icon="lucide:trash-2" /> Eliminar horario
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  );
}

function kindIcon(kind) {
  return ({
    live:     'lucide:coffee',
    pdf:      'lucide:file-text',
    image:    'lucide:image',
    designed: 'lucide:palette'
  })[kind] || 'lucide:menu';
}
function kindLabel(kind) {
  return ({
    live:     'Catálogo',
    pdf:      'PDF',
    image:    'Imagen',
    designed: 'Diseñado'
  })[kind] || kind;
}
function dayLabel(d) {
  return ({ mon:'Lun', tue:'Mar', wed:'Mié', thu:'Jue', fri:'Vie', sat:'Sáb', sun:'Dom' })[d];
}

const inputStyle = { padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' };
const btnPrimary = { padding: '12px 18px', borderRadius: 12, border: 'none', background: 'var(--brand-color)', color: 'white', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
const btnSecondary = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
const iconBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' };
const dangerBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #d9534f', background: 'transparent', color: '#d9534f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
const activeBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #27ae60', background: 'rgba(39,174,96,0.1)', color: '#27ae60', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
const inactiveBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
const kindBadge = { padding: '4px 10px', borderRadius: 999, background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' };
const priBtn = { background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', padding: 4 };

export default MenusTab;
