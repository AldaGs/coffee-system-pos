// TablesTab — manage floor plans for the tables register layout. Each floor is
// one room/zone holding a drag-and-drop layout of tables (see docs/tables.md).
// Mirrors MenusTab's shape: list / create / rename / delete, with the visual
// editor opening full-screen over the tab.

import { useEffect, useEffectEvent, useState } from 'react';
import { Icon } from '@iconify/react';
import { loadFloors, addFloor, updateFloor, deleteFloor } from '../../api/floors';
import { tablesOf } from '../../utils/floorDocument';
import FloorEditor from '../floor/FloorEditor';
import InfoTip from '../shared/InfoTip';
import { useTranslation } from '../../hooks/useTranslation';

function TablesTab({ showAlert, showConfirm }) {
  const { t } = useTranslation();
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);

  async function reload() {
    try { setFloors(await loadFloors()); }
    catch (err) { showAlert?.('Error', err.message); }
    finally { setLoading(false); }
  }
  // Load once on mount; reload is also called imperatively after mutations.
  const loadOnMount = useEffectEvent(() => { reload(); });
  useEffect(() => { loadOnMount(); }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await addFloor({ name });
      setNewName('');
      await reload();
      setEditingId(id);
    } catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleRename(floor) {
    const name = window.prompt(t('floors.renamePrompt'), floor.name)?.trim();
    if (!name || name === floor.name) return;
    try { await updateFloor(floor.id, { name }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  function handleDelete(floor) {
    showConfirm?.(
      t('floors.deleteTitle'),
      t('floors.deleteDesc').replace('{name}', floor.name),
      async () => {
        try { await deleteFloor(floor.id); await reload(); }
        catch (err) { showAlert?.('Error', err.message); }
      }
    );
  }

  const editing = floors.find(f => f.id === editingId) || null;
  if (editing) {
    return (
      <FloorEditor
        floor={editing}
        showAlert={showAlert}
        onClose={async (saved) => { setEditingId(null); if (saved) await reload(); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
          <Icon icon="lucide:armchair" style={{ color: 'var(--brand-color)' }} />
          {t('floors.title')}
          <InfoTip text={t('pageInfo.tables')} section="tables" />
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
          {t('floors.subtitle')}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder={t('floors.namePlaceholder')}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
        />
        <button onClick={handleCreate} disabled={!newName.trim()}
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--brand-color, #3498db)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: newName.trim() ? 1 : 0.5 }}>
          {t('floors.btnCreate')}
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('floors.loading')}</p>
      ) : floors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12 }}>
          <Icon icon="lucide:armchair" style={{ fontSize: '2rem', opacity: 0.5 }} />
          <p style={{ margin: '8px 0 0' }}>{t('floors.empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {floors.map(floor => {
            const count = tablesOf(floor.document).length;
            return (
              <div key={floor.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <Icon icon="lucide:map" style={{ color: 'var(--brand-color)', fontSize: '1.3rem' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{floor.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {count} {count === 1 ? t('floors.table') : t('floors.tables')}{floor.zone ? ` · ${floor.zone}` : ''}
                  </div>
                </div>
                <button onClick={() => setEditingId(floor.id)} title={t('floors.titleEdit')}
                  style={iconBtn('primary')}><Icon icon="lucide:pencil" /></button>
                <button onClick={() => handleRename(floor)} title={t('floors.titleRename')}
                  style={iconBtn()}><Icon icon="lucide:text-cursor-input" /></button>
                <button onClick={() => handleDelete(floor)} title={t('floors.titleDelete')}
                  style={iconBtn('danger')}><Icon icon="lucide:trash-2" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function iconBtn(kind) {
  const base = { width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' };
  if (kind === 'primary') return { ...base, background: 'var(--brand-color, #3498db)', color: '#fff', border: 'none' };
  if (kind === 'danger') return { ...base, color: 'var(--danger, #e74c3c)' };
  return base;
}

export default TablesTab;
