// Optional delivery pin for /order checkout: MapLibre GL + OpenFreeMap vector tiles
// (free, no API key), restyled toward Google Maps' palette. Loaded lazily (React.lazy
// in PublicOrder) so the menu bundle stays small.
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre finds its worker relative to its own file, which breaks once Vite
// pre-bundles/moves it (map stays blank gray). Let Vite bundle the worker and hand over its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { visibleDeliveryCoverage } from '../utils/deliveryCoverage';
import { formatForDisplay } from '../utils/moneyUtils';

maplibregl.setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const YELLOW = /^(highway|bridge|tunnel)-(motorway|trunk|primary)/;

// Patch the OpenFreeMap "bright" style's paint colors by layer id/type toward Google's palette.
function googleize(style) {
  for (const l of style.layers) {
    const id = l.id;
    // Bus stops/shops clutter a small "drop your pin" map; street and place labels stay.
    if (/^poi/.test(id)) { l.layout = { ...l.layout, visibility: 'none' }; continue; }
    const paint = (l.paint ||= {});
    const color = (c) => { paint[l.type === 'line' ? 'line-color' : l.type === 'background' ? 'background-color' : 'fill-color'] = c; };
    if (l.type === 'background') color('#f5f5f5');
    else if (/^landuse-(residential|suburb|railway|commercial|industrial)/.test(id)) color('#f5f5f5');
    else if (/^(park|landcover-(grass|wood))/.test(id)) color(id === 'landcover-wood' ? '#b7dfb9' : '#c8e6c9');
    else if (/^water(way|$|-)/.test(id) && l.type !== 'symbol') color('#aadaff');
    else if (/^building/.test(id)) color('#e8e8e8');
    else if (/^(highway|bridge|tunnel)-/.test(id) && l.type !== 'symbol') {
      if (/-path/.test(id)) color('#dadce0');
      else if (YELLOW.test(id)) color(id.includes('casing') ? '#f9ab00' : '#fde293');
      else color(id.includes('casing') ? '#dadce0' : '#ffffff');
    }
    if (l.type === 'symbol' && 'text-color' in paint) {
      paint['text-color'] = /^label_(city|town|state|country)/.test(id) ? '#3c4043' : '#5f6368';
      paint['text-halo-color'] = '#ffffff';
    }
  }
  return style;
}

// Expand abbreviations Nominatim's Spanish data doesn't match ("Calle 37B Nte. 1223").
const normalize = (q) => q
  .replace(/\bNte\.?(?=\s|$)/gi, 'Norte').replace(/\bPte\.?(?=\s|$)/gi, 'Poniente')
  .replace(/\bOte\.?(?=\s|$)/gi, 'Oriente').replace(/\bAv\.?(?=\s|$)/gi, 'Avenida')
  .replace(/\b(\d+)([A-Za-z])\b/g, '$1 $2').replace(/\s+/g, ' ').trim();
const PUEBLA = [-98.2063, 19.0414]; // [lng, lat]
const btn = { padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: 'white', fontSize: '0.9rem', cursor: 'pointer' };

export default function PinMap({ pin, address, onPin, s, areas = [], lang = 'es' }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const cb = useRef(onPin);
  cb.current = onPin;
  const [msg, setMsg] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const coverage = visibleDeliveryCoverage(areas);

  const addMarker = (lat, lng) => {
    marker.current = new maplibregl.Marker({ draggable: true, color: '#ea4335' }).setLngLat([lng, lat]).addTo(map.current);
    marker.current.on('dragend', () => { const p = marker.current.getLngLat(); cb.current(p.lat, p.lng); });
  };
  const place = (lat, lng, zoom) => {
    if (!map.current) return;
    if (marker.current) marker.current.setLngLat([lng, lat]); else addMarker(lat, lng);
    if (zoom) map.current.jumpTo({ center: [lng, lat], zoom });
    cb.current(lat, lng);
  };

  useEffect(() => {
    let m; let dead = false; let customerMovedMap = false;
    const observer = new ResizeObserver(() => map.current?.resize());
    observer.observe(el.current);
    fetch(STYLE_URL).then((r) => r.json()).then((style) => {
      if (dead) return;
      m = new maplibregl.Map({
        container: el.current, style: googleize(style), attributionControl: false,
        center: pin ? [pin.lng, pin.lat] : PUEBLA, zoom: pin ? 15 : 10,
      });
      m.addControl(new maplibregl.AttributionControl({ compact: false }));
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }));
      map.current = m;
      if (pin) addMarker(pin.lat, pin.lng);
      m.on('movestart', (event) => { if (event.originalEvent) customerMovedMap = true; });
      m.on('load', () => {
        // Draw lower-priority areas first, so the server's winning area is on top.
        const firstLabel = m.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
        [...coverage].reverse().forEach((area, index) => {
          const sourceId = `delivery-area-${index}`;
          m.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: area.geometry } });
          m.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, paint: { 'fill-color': area.color, 'fill-opacity': 0.18 } }, firstLabel);
          m.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, paint: { 'line-color': area.color, 'line-width': 2.5 } }, firstLabel);
        });
        // The first view shows every service area. An existing pin, or any
        // subsequent customer pan/zoom, always takes precedence over this fit.
        if (!marker.current && !customerMovedMap && coverage.length) {
          const coords = coverage.flatMap((area) => area.boundsPoints);
          const bounds = coords.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(coords[0], coords[0]));
          m.fitBounds(bounds, { padding: 24, maxZoom: 14, duration: 0 });
        }
      });
      m.on('click', (e) => place(e.lngLat.lat, e.lngLat.lng));
    }).catch(() => !dead && setMsg(s.pinNotFound));
    return () => { dead = true; observer.disconnect(); m?.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin cleared by the parent (e.g. "Remove pin"): drop the marker too. Typing
  // the address keeps the pin; only the map/search moves it.
  useEffect(() => {
    if (!pin && marker.current) { marker.current.remove(); marker.current = null; }
  }, [pin]);

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
    if (!map.current) return;
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
        <button type="button" style={btn} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? s.pinReduce : s.pinExpand}</button>
        {pin && <button type="button" style={btn} onClick={() => { marker.current?.remove(); marker.current = null; cb.current(null, null); }}>{s.pinClear}</button>}
      </div>
      <div ref={el} style={{ height: expanded ? 'min(65dvh, 600px)' : 220, borderRadius: 10, border: '1px solid #ddd', zIndex: 0 }} />
      {coverage.length > 0 && <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        <small style={{ color: '#555' }}>{s.zoneCostInfo}</small>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {coverage.map((area, index) => <span key={area.id || index} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.8rem' }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: area.color }} />
            {area.name}: {formatForDisplay(area.feeCents, lang)}
          </span>)}
        </div>
      </div>}
      <div style={{ fontSize: '0.8rem', color: '#777', marginTop: 4 }}>{msg || s.pinHint}</div>
    </div>
  );
}
