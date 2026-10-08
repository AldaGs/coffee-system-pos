import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { visibleDeliveryCoverage } from '../../utils/deliveryCoverage';
import { formatForDisplay } from '../../utils/moneyUtils';

maplibregl.setWorkerUrl(workerUrl);
const STYLE = 'https://tiles.openfreemap.org/styles/bright';
const FALLBACK = [-98.2063, 19.0414];

function drawAreas(map, coverage, drawn) {
  drawn.current.forEach((id) => {
    if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
    if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
    if (map.getSource(id)) map.removeSource(id);
  });
  const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  drawn.current = [...coverage].reverse().map((area, index) => {
    const id = `overview-zone-${index}`;
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: area.geometry } });
    map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': area.color, 'fill-opacity': area.enabled ? 0.18 : 0.05 } }, firstLabel);
    map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': area.color, 'line-width': area.enabled ? 2.5 : 2, ...(area.enabled ? {} : { 'line-dasharray': [2, 2] }) } }, firstLabel);
    return id;
  });
}

export default function DeliveryCoverageOverview({ areas, lang = 'es' }) {
  const el = useRef(null);
  const map = useRef(null);
  const drawn = useRef([]);
  const latest = useRef([]);
  const ready = useRef(false);
  const fitted = useRef(false);
  const userMoved = useRef(false);
  const [error, setError] = useState(false);
  const en = lang === 'en';
  const coverage = useMemo(() => visibleDeliveryCoverage(areas, { includeDisabled: true }), [areas]);

  const fitFirstCoverage = (instance) => {
    if (fitted.current || userMoved.current || !latest.current.length) return;
    const coords = latest.current.flatMap((area) => area.boundsPoints);
    const bounds = coords.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(coords[0], coords[0]));
    instance.fitBounds(bounds, { padding: 28, maxZoom: 14, duration: 0 });
    fitted.current = true;
  };

  useEffect(() => {
    latest.current = coverage;
    const instance = map.current;
    if (instance && ready.current) { drawAreas(instance, coverage, drawn); fitFirstCoverage(instance); }
    // Rendering must never reset the map camera.
  }, [coverage]);

  useEffect(() => {
    let disposed = false; let instance;
    const observer = new ResizeObserver(() => map.current?.resize());
    observer.observe(el.current);
    fetch(STYLE).then((response) => response.json()).then((style) => {
      if (disposed) return;
      instance = new maplibregl.Map({ container: el.current, style, center: FALLBACK, zoom: 10, attributionControl: false });
      map.current = instance;
      instance.addControl(new maplibregl.AttributionControl({ compact: true }));
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }));
      instance.on('movestart', (event) => { if (event.originalEvent) userMoved.current = true; });
      instance.on('load', () => { ready.current = true; drawAreas(instance, latest.current, drawn); fitFirstCoverage(instance); });
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; ready.current = false; observer.disconnect(); instance?.remove(); map.current = null; };
  }, []);

  return <section style={{ display: 'grid', gap: 8 }} aria-label={en ? 'Delivery zones overview' : 'Vista general de zonas de entrega'}>
    <strong>{en ? 'Zones overview' : 'Vista general de zonas'}</strong>
    {error ? <small>{en ? 'The map could not load.' : 'No se pudo cargar el mapa.'}</small>
      : <div ref={el} style={{ height: 280, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }} />}
    {coverage.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {coverage.map((area, index) => <span key={area.id || index} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.82rem' }}>
        <span aria-hidden="true" style={{ width: 11, height: 11, border: `2px ${area.enabled ? 'solid' : 'dashed'} ${area.color}`, borderRadius: 2, background: area.enabled ? area.color : 'transparent' }} />
        {area.name}: {formatForDisplay(area.feeCents, lang)}{area.enabled ? '' : ` · ${en ? 'Inactive' : 'Inactiva'}`}
      </span>)}
    </div> : <small style={{ color: 'var(--text-muted)' }}>{en ? 'Add and complete a zone to see it here.' : 'Agrega y completa una zona para verla aquí.'}</small>}
  </section>;
}
