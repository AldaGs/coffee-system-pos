// Optional delivery pin for /order checkout: Leaflet + OpenStreetMap tiles, no
// API keys. Loaded lazily (React.lazy in PublicOrder) so the menu bundle stays small.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Bundlers break Leaflet's runtime icon-path detection; point it at the assets.
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const PUEBLA = [19.0414, -98.2063];
const btn = { padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: 'white', fontSize: '0.9rem', cursor: 'pointer' };

export default function PinMap({ pin, address, onPin, s }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const cb = useRef(onPin);
  cb.current = onPin;
  const [msg, setMsg] = useState(null);

  const addMarker = (lat, lng) => {
    marker.current = L.marker([lat, lng], { draggable: true }).addTo(map.current);
    marker.current.on('dragend', () => { const p = marker.current.getLatLng(); cb.current(p.lat, p.lng); });
  };
  const place = (lat, lng, zoom) => {
    if (marker.current) marker.current.setLatLng([lat, lng]); else addMarker(lat, lng);
    if (zoom) map.current.setView([lat, lng], zoom);
    cb.current(lat, lng);
  };

  useEffect(() => {
    const m = L.map(el.current).setView(pin ? [pin.lat, pin.lng] : PUEBLA, pin ? 16 : 11);
    map.current = m;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    if (pin) addMarker(pin.lat, pin.lng);
    m.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
    return () => { m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = () => {
    setMsg(null);
    if (!navigator.geolocation) { setMsg(s.pinNoGeo); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => place(p.coords.latitude, p.coords.longitude, 17),
      () => setMsg(s.pinNoGeo),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Button press only (Nominatim usage policy: no per-keystroke autocomplete).
  const search = async () => {
    setMsg(null);
    const q = (address || '').trim();
    if (!q) { setMsg(s.pinNeedAddr); return; }
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const [hit] = await r.json();
      if (hit) place(+hit.lat, +hit.lon, 17); else setMsg(s.pinNotFound);
    } catch { setMsg(s.pinNotFound); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" style={btn} onClick={locate}>{s.pinUseMine}</button>
        <button type="button" style={btn} onClick={search}>{s.pinSearch}</button>
        {pin && <button type="button" style={btn} onClick={() => { marker.current?.remove(); marker.current = null; cb.current(null, null); }}>{s.pinClear}</button>}
      </div>
      <div ref={el} style={{ height: 220, borderRadius: 10, border: '1px solid #ddd', zIndex: 0 }} />
      <div style={{ fontSize: '0.8rem', color: '#777', marginTop: 4 }}>{msg || s.pinHint}</div>
    </div>
  );
}
