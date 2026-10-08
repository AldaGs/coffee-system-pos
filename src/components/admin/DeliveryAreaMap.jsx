import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import * as Dialog from '@radix-ui/react-dialog';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);
const STYLE = 'https://tiles.openfreemap.org/styles/bright';
const FALLBACK = [-98.2063, 19.0414];

// The saved shape uses [longitude, latitude], matching GeoJSON and MapLibre.
export default function DeliveryAreaMap({ area, onChange, lang = 'es' }) {
  const [expanded, setExpanded] = useState(false);
  const en = lang === 'en';
  const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' };
  return <Dialog.Root open={expanded} onOpenChange={setExpanded}>
    <div style={{ display: 'grid', gap: 8 }}>
      <Dialog.Trigger asChild><button type="button" style={{ ...input, justifySelf: 'start', cursor: 'pointer' }}>
        {en ? 'Expand map' : 'Ampliar mapa'}
      </button></Dialog.Trigger>
      {!expanded && <MapCanvas area={area} onChange={onChange} lang={lang} />}
    </div>
    <Dialog.Portal>
      <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)' }} />
      <Dialog.Content style={{ position: 'fixed', inset: '2vh 2vw', zIndex: 3001, background: 'var(--bg-surface)', color: 'var(--text-main)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', padding: 12, gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Dialog.Title style={{ margin: 0, fontSize: '1.1rem', flex: 1 }}>{area.name || (en ? 'Delivery area' : 'Zona de entrega')}</Dialog.Title>
          {area.kind === 'radius' && <label>{en ? 'Radius (km)' : 'Radio (km)'} <input style={{ ...input, width: 80 }} type="number" min="0.01" step="0.1" value={area.radiusKm || ''} onChange={(e) => onChange({ ...area, radiusKm: Number(e.target.value) })} /></label>}
          <Dialog.Close asChild><button type="button" style={{ ...input, cursor: 'pointer', fontWeight: 700 }}>{en ? 'Done' : 'Listo'}</button></Dialog.Close>
        </div>
        <Dialog.Description style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {en ? 'Done keeps these edits in the zone draft. Save zone to publish them.' : 'Listo conserva los cambios en el borrador. Guarda la zona para publicarlos.'}
        </Dialog.Description>
        <MapCanvas area={area} onChange={onChange} lang={lang} expanded />
        {area.kind === 'polygon' && (area.points || []).length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: '12vh', overflowY: 'auto' }}>
          {area.points.map((_, index) => <button key={index} type="button" aria-label={`${en ? 'Remove corner' : 'Quitar esquina'} ${index + 1}`} style={{ ...input, cursor: 'pointer', padding: '6px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => onChange({ ...area, points: area.points.filter((__, i) => i !== index) })}><Icon icon="lucide:x" aria-hidden="true" style={{ color: '#c0392b' }} />{en ? 'Corner' : 'Esquina'} {index + 1}</button>)}
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function MapCanvas({ area, onChange, lang, expanded = false }) {
  const el = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const latest = useRef({ area, onChange, lang });
  latest.current = { area, onChange, lang };
  const [error, setError] = useState(false);

  const draw = () => {
    const instance = map.current;
    if (!instance?.getSource('area')) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const current = latest.current.area;
    const points = current.kind === 'radius'
      ? current.center ? [[current.center.lng, current.center.lat]] : []
      : current.points || [];
    points.forEach((coord, index) => {
      const marker = new maplibregl.Marker({ draggable: true, color: '#d45c12' }).setLngLat(coord).addTo(instance);
      const en = latest.current.lang === 'en';
      const pointName = current.kind === 'radius' ? (en ? 'Center' : 'Centro') : `${en ? 'Corner' : 'Esquina'} ${index + 1}`;
      const label = document.createElement('span');
      label.textContent = current.name ? `${current.name} · ${pointName}` : pointName;
      Object.assign(label.style, {
        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
        marginBottom: '4px', padding: '3px 6px', borderRadius: '4px',
        background: 'var(--bg-surface, white)', color: 'var(--text-main, #222)',
        border: '1px solid var(--border, #ddd)', fontSize: '12px', fontWeight: '600',
        whiteSpace: 'nowrap', pointerEvents: 'none',
      });
      marker.getElement().appendChild(label);
      marker.getElement().setAttribute('aria-label', label.textContent);
      marker.getElement().addEventListener('click', (e) => e.stopPropagation());
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        const { area: now, onChange: change } = latest.current;
        if (now.kind === 'radius') change({ ...now, center: { lat: p.lat, lng: p.lng } });
        else change({ ...now, points: now.points.map((xy, i) => i === index ? [p.lng, p.lat] : xy) });
      });
      markers.current.push(marker);
    });
    const features = [];
    if (current.kind === 'polygon' && points.length >= 2) {
      features.push({ type: 'Feature', geometry: points.length >= 3
        ? { type: 'Polygon', coordinates: [[...points, points[0]]] }
        : { type: 'LineString', coordinates: points }, properties: {} });
    }
    if (current.kind === 'radius' && points.length) {
      const [lng, lat] = points[0];
      const radius = Number(current.radiusKm) || 0;
      const latRad = lat * Math.PI / 180;
      const lngRad = lng * Math.PI / 180;
      const distance = radius / 6371.0088;
      const ring = Array.from({ length: 64 }, (_, i) => {
        const bearing = i * Math.PI / 32;
        const lat2 = Math.asin(Math.sin(latRad) * Math.cos(distance) + Math.cos(latRad) * Math.sin(distance) * Math.cos(bearing));
        const lng2 = lngRad + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latRad), Math.cos(distance) - Math.sin(latRad) * Math.sin(lat2));
        return [lng2 * 180 / Math.PI, lat2 * 180 / Math.PI];
      });
      ring.push(ring[0]);
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} });
    }
    instance.getSource('area').setData({ type: 'FeatureCollection', features });
  };
  useEffect(() => {
    let disposed = false;
    let instance;
    let observer;
    const coords = area.kind === 'radius' && area.center
      ? [area.center.lng, area.center.lat] : area.points?.[0] || FALLBACK;
    fetch(STYLE).then((r) => r.json()).then((style) => {
      if (disposed) return;
      instance = new maplibregl.Map({ container: el.current, style, center: coords, zoom: area.kind === 'radius' && area.center ? 13 : area.points?.length ? 13 : 10, attributionControl: false });
      instance.addControl(new maplibregl.AttributionControl({ compact: true }));
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }));
      map.current = instance;
      observer = new ResizeObserver(() => instance.resize());
      observer.observe(el.current);
      instance.on('load', () => {
        instance.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#ee8a20', 'fill-opacity': 0.2 } });
        instance.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#d45c12', 'line-width': 3 } });
        draw();
        requestAnimationFrame(() => {
          if (disposed) return;
          instance.resize();
          const current = latest.current.area;
          const points = current.kind === 'radius'
            ? current.center ? [[current.center.lng, current.center.lat]] : []
            : current.points || [];
          if (current.kind === 'radius' && current.center && Number(current.radiusKm) > 0) {
            const { lat, lng } = current.center;
            const latDelta = Number(current.radiusKm) / 110.574;
            const lngDelta = Number(current.radiusKm) / (111.32 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
            instance.fitBounds([[lng - lngDelta, lat - latDelta], [lng + lngDelta, lat + latDelta]], { padding: 42, maxZoom: 16, duration: 0 });
          } else if (points.length > 1) {
            const bounds = points.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
            instance.fitBounds(bounds, { padding: 42, maxZoom: 16, duration: 0 });
          } else if (points.length === 1) instance.jumpTo({ center: points[0], zoom: 15 });
        });
      });
      instance.on('click', (e) => {
        const { area: current, onChange: change } = latest.current;
        if (current.kind === 'radius') change({ ...current, center: { lat: e.lngLat.lat, lng: e.lngLat.lng } });
        else change({ ...current, points: [...(current.points || []), [e.lngLat.lng, e.lngLat.lat]] });
      });
    }).catch(() => !disposed && setError(true));
    return () => { disposed = true; observer?.disconnect(); markers.current.forEach((m) => m.remove()); markers.current = []; instance?.remove(); map.current = null; };
    // This map keeps its instance while editing; the next effect redraws it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw, [area, lang]);

  return <div style={expanded ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : undefined}>
    <div ref={el} style={{ height: expanded ? '100%' : 280, flex: expanded ? 1 : undefined, minHeight: expanded ? 0 : undefined, borderRadius: 10, border: '1px solid var(--border)' }} />
    {error && <small>{lang === 'en' ? 'Map could not load. Check your connection.' : 'No se pudo cargar el mapa. Revisa tu conexión.'}</small>}
    <small style={{ display: 'block', marginTop: 4 }}>{lang === 'en'
      ? `Click the map to ${area.kind === 'radius' ? 'set the center' : 'add a corner'}. Drag a marker to adjust it.`
      : `Toca el mapa para ${area.kind === 'radius' ? 'elegir el centro' : 'agregar una esquina'}. Arrastra un marcador para ajustarlo.`}</small>
  </div>;
}
