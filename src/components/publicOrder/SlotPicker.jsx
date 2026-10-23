import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { slotRules, timesFor, toLocalInput, fromLocalInput, firstSlot, asapOk, autoSlotIsToday } from '../../utils/pickupSlots';
import { inputStyle, qtyBtn } from './shared';

// Optional pickup/delivery time: native datetime-local (shop timezone) behind the same button.
// Always blocks the past; with slots.enabled it also applies lead/range/step and re-checks the rules on pick.
// Date via the native calendar, then a time list holding only times that are actually
// allowed that day (native pickers can't block hours, so they accepted then rejected).
export default function SlotPicker({ label, value, onChange, date, onDateChange, shop, cap, lang, s, delivery }) {
  const ref = useRef(null);
  const tz = shop?.timezone || 'America/Mexico_City';
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const rules = shop?.slots?.enabled ? slotRules(shop.slots, shop.schedule) : null;
  const ctx = { tz, slots: shop?.slots, schedule: shop?.schedule, ...cap };
  // Clock read on open (not during render); the time list is refreshed each time the calendar opens.
  const [now, setNow] = useState(() => Date.now());
  const minDate = toLocalInput(now, tz).slice(0, 10);
  const maxDate = toLocalInput(now + (rules?.daysAhead ?? 14) * 86400000, tz).slice(0, 10);
  const times = date ? timesFor(date, { ...ctx, now }) : [];
  const time = value ? toLocalInput(Date.parse(value), tz).slice(11) : '';

  const asap = asapOk(ctx);
  // ASAP isn't served right now: preselect the first available slot (the customer can still change it).
  const [auto, setAuto] = useState(null);
  useEffect(() => {
    const selectedAt = now;
    if (value || date || asapOk({ ...ctx, now: selectedAt })) return;
    const ms = firstSlot({ ...ctx, now: selectedAt });
    if (ms == null) return;
    const iso = new Date(ms).toISOString();
    onDateChange(toLocalInput(ms, tz).slice(0, 10)); setAuto({ iso, today: autoSlotIsToday(ms, selectedAt, tz) }); onChange(iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const open = () => { setNow(Date.now()); const el = ref.current; try { el.showPicker(); } catch { el.focus(); el.click(); } };
  const pickDate = (e) => { if (!e.target.value) return; setAuto(null); setNow(Date.now()); onDateChange(e.target.value); onChange(''); };
  const pickTime = (e) => { setAuto(null); onChange(e.target.value ? new Date(fromLocalInput(`${date}T${e.target.value}`, tz)).toISOString() : ''); };
  const clear = () => { setAuto(null); onDateChange(''); onChange(''); };
  const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = (hhmm) => new Date(`2000-01-01T${hhmm}:00Z`).toLocaleTimeString(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  const days = rules && (rules.days ? [0, 1, 2, 3, 4, 5, 6].filter((i) => rules.days & (1 << i)).map((i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })).join(', ') : s.everyDay);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={open} style={{ ...inputStyle, flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left', background: 'white' }}>
          <Icon icon="lucide:calendar" />{date ? `${fmtDate(date)}${time ? `, ${fmtTime(time)}` : ''}` : s.chooseSlot}
        </button>
        {date && asap && <button type="button" aria-label={s.clearSlot} onClick={clear} style={{ ...qtyBtn, width: 44, height: 'auto' }}><Icon icon="lucide:x" /></button>}
      </div>
      {/* visually hidden, not display:none (that blocks showPicker in some browsers) */}
      <input ref={ref} type="date" tabIndex={-1} aria-hidden="true" value={date} min={minDate} max={maxDate} onChange={pickDate}
        style={{ position: 'absolute', left: 0, top: 24, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }} />
      {date && times.length > 0 && (
        <select value={time} onChange={pickTime} style={{ ...inputStyle, marginTop: 8, cursor: 'pointer' }} aria-label={label}>
          <option value="">{s.chooseTime}</option>
          {times.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
        </select>
      )}
      {date && times.length === 0 && (
        <small style={{ color: '#c0392b', display: 'block', marginTop: 6 }}>
          {s.noTimes}{rules ? ` ${s.slotRule.replace('{days}', days).replace('{start}', rules.start).replace('{end}', rules.end).replace('{n}', rules.interval)}` : ''}
        </small>
      )}
      {!date && asap && <small style={{ color: '#777' }}>{s.asap}</small>}
      {auto && value === auto.iso && (
        <small style={{ color: '#a05a00', display: 'block', marginTop: 6 }}>
          {(auto.today ? (delivery ? s.upcomingSlot : s.upcomingSlotPickup) : (delivery ? s.noMoreSlots : s.noMoreSlotsPickup)).replace('{when}', `${fmtDate(date)}, ${fmtTime(time)}`)}
        </small>
      )}
    </div>
  );
}
