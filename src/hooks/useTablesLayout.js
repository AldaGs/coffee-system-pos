import { useEffect, useMemo, useState } from 'react';
import { loadFloors } from '../api/floors';
import { tablesOf } from '../utils/floorDocument';

// The tables layout: a floor map in front of the per-table ticket flow. Floors
// rarely change mid-shift, so they load once instead of live.
export function useTablesLayout({ layoutMode, setActiveTicketId, setIsMobileCartOpen, setOrderFlowStep }) {
  const [floors, setFloors] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);

  useEffect(() => {
    if (layoutMode !== 'tables') return;
    let cancelled = false;
    loadFloors().then((f) => { if (!cancelled) setFloors(f); }).catch((err) => console.error('Floor load failed:', err));
    return () => { cancelled = true; };
  }, [layoutMode]);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    for (const f of floors) {
      const hit = tablesOf(f.document).find((tb) => tb.id === selectedTableId);
      if (hit) return hit;
    }
    return null;
  }, [selectedTableId, floors]);

  const handleSelectTable = (table) => {
    setSelectedTableId(table.id);
    setActiveTicketId(null);
    setOrderFlowStep('tickets');
  };

  const handleBackToFloor = () => {
    setSelectedTableId(null);
    setActiveTicketId(null);
    setIsMobileCartOpen(false);
  };

  return { floors, selectedTable, handleSelectTable, handleBackToFloor };
}
