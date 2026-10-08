// Optional delivery pin for /order checkout: Leaflet + OpenStreetMap tiles, no
// API keys. Loaded lazily (React.lazy in PublicOrder) so the menu bundle stays small.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Bundlers break Leaflet's runtime icon-path detection (it also prepends an
// auto-detected imagePath), so use an explicit icon instead of the Default one.
const pinIcon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });

// Expand abbreviations Nominatim's Spanish data doesn't match ("Calle 37B Nte. 1223").
const normalize = (q) => q
  .replace(/\bNte\.?(?=\s|$)/gi, 'Norte').replace(/\bPte\.?(?=\s|$)/gi, 'Poniente')
  .replace(/\bOte\.?(?=\s|$)/gi, 'Oriente').replace(/\bAv\.?(?=\s|$)/gi, 'Avenida')
  .replace(/\b(\d+)([A-Za-z])\b/g, '$1 $2').replace(/\s+/g, ' ').trim();
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
    marker.current = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(map.current);
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
    if (!window.isSecureContext) { setMsg(s.pinNeedHttps); return; }
    if (!navigator.geolocation) { setMsg(s.pinNoGeo); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => place(p.coords.latitude, p.coords.longitude, 17),
      (err) => setMsg(err.code === 1 ? s.pinDenied : s.pinNoGeo),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Button press only (Nominatim usage policy: no per-keystroke autocomplete).
  const search = async () => {
    setMsg(null);
    const q = (address || '').trim();
    if (!q) { setMsg(s.pinNeedAddr); return; }
    // Bounded to ~±0.15° around the map center, Mexico only; OSM has streets but
    // rarely house numbers, so retry without the trailing number.
    const c = map.current.getCenter();
    const vb = [c.lng - 0.15, c.lat + 0.15, c.lng + 0.15, c.lat - 0.15].join(',');
    const look = async (text) => {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&viewbox=${vb}&bounded=1&q=${encodeURIComponent(text)}`);
      return (await r.json())[0];
    };
    try {
      const full = normalize(q);
      let hit = await look(full);
      let street = false;
      const noNum = full.replace(/[\s,#]*(?:no\.?\s*)?\d+\s*[A-Za-z]?\s*$/i, '');
      if (!hit && noNum && noNum !== full) { hit = await look(noNum); street = !!hit; }
      if (!hit) { setMsg(s.pinNotFound); return; }
      place(+hit.lat, +hit.lon, 17);
      if (street) setMsg(s.pinStreet);
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
