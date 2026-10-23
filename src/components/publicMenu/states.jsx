import { centerStyle } from './shared';

export function LoadingState() {
  return <div style={centerStyle}>Cargando…</div>;
}

export function EmptyState() {
  return <div style={centerStyle}>Menú vacío.</div>;
}

export function ErrorState({ message }) {
  return (
    <div style={centerStyle}>
      <div>
        <p style={{ margin: 0, fontWeight: 700 }}>No se pudo cargar el menú.</p>
        <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#888' }}>{message}</p>
      </div>
    </div>
  );
}

export function ConfigMissing() {
  return (
    <div style={centerStyle}>
      <div>
        <p style={{ margin: 0, fontWeight: 700 }}>Enlace inválido.</p>
        <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#888' }}>
          Faltan los parámetros del menú. Pide al negocio un enlace o QR actualizado.
        </p>
      </div>
    </div>
  );
}
