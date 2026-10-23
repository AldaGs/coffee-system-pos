import { useState } from 'react';
import { Icon } from '@iconify/react';
import { addSchedule, updateSchedule, deleteSchedule, DAY_ORDER, daysToBitmask, bitmaskToDays } from '../../../api/menus';
import { useTranslation } from '../../../hooks/useTranslation';
import Field from './Field';
import { dayLabel, inputStyle, btnSecondary, dangerBtn } from './menuShared';

export function ScheduleEditor({ menu, onChange, showAlert }) {
  const { t } = useTranslation();
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
            ? t('menusTab.noSchedules')
            : t('menusTab.anySchedule')}
        </p>
        <button onClick={add} style={btnSecondary}>
          <Icon icon="lucide:plus" /> {t('menusTab.addSchedule')}
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
  const { t } = useTranslation();
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
            >{dayLabel(d, t)}</button>
          );
        })}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 8 }}>
          {days.length === 0 ? t('menusTab.everyDay') : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Field label={t('menusTab.fromTime')}>
          <input type="time" value={startTime}
            onChange={e => setStartTime(e.target.value)}
            onBlur={() => flush({ startTime })}
            style={inputStyle} />
        </Field>
        <Field label={t('menusTab.toTime')}>
          <input type="time" value={endTime}
            onChange={e => setEndTime(e.target.value)}
            onBlur={() => flush({ endTime })}
            style={inputStyle} />
        </Field>
        <Field label={t('menusTab.fromDate')}>
          <input type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)}
            onBlur={() => flush({ startDate })}
            style={inputStyle} />
        </Field>
        <Field label={t('menusTab.toDate')}>
          <input type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)}
            onBlur={() => flush({ endDate })}
            style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onRemove} style={dangerBtn}>
          <Icon icon="lucide:trash-2" /> {t('menusTab.deleteSchedule')}
        </button>
      </div>
    </div>
  );
}
