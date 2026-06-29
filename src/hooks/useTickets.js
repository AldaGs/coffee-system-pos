import { db } from '../db';
import { supabase } from '../supabaseClient';
import { logActivity } from '../services/activityService';
import { consumePendingAuthorizer } from '../utils/overrideAuthorizer';
import { isLocalMode } from '../utils/appMode';

// Mirror an active_ticket mutation to the cloud. If offline or the write fails,
// stash the patch on db.updateQueue so attemptBackgroundSync can replay it.
export const pushActiveTicketUpdate = (ticketId, patch) => {
  // Local ('guest') mode: the Dexie write by the caller is authoritative and
  // these are ephemeral — nothing to mirror or queue.
  if (isLocalMode()) return;

  const enqueue = () => db.updateQueue.add({
    type: 'active_ticket_update',
    ticket_id: ticketId,
    data: patch,
    local_id: crypto.randomUUID()
  }).catch(err => console.error('Failed to queue active_ticket_update:', err));

  if (!navigator.onLine) { enqueue(); return; }

  supabase.from('active_tickets').update(patch).eq('id', ticketId)
    .then(({ error }) => { if (error) { console.warn('Cloud active_ticket update failed, queuing:', error); enqueue(); } })
    .catch(err => { console.warn('Cloud active_ticket update threw, queuing:', err); enqueue(); });
};

// All active-ticket CRUD lives here. The hook is intentionally dumb: it
// receives the data it needs (active cashier, device id, recipes, etc.) and
// returns handlers ready to wire into the existing components. Register stays
// in charge of dialog UX and computed state.
export function useTickets({
  myDeviceId, activeCashier, posSettings, recipes,
  activeTicket, setActiveTicketId, tickets,
  nextOrderNum, setNextOrderNum,
  showAlert, showConfirm, showPrompt, showToast, t,
  setPendingItem, setIsModalOpen
}) {
  // Core ticket creation, shared by the name-prompt flow (cafe/orders) and the
  // table-bound flow (tables layout). When tableId is set the ticket carries
  // table_id + seats (the per-ticket cover count, defaulted from the table's
  // expectedSeats but overridable on open — see docs/tables.md). Returns the id.
  const createTicket = async ({ customName = '', tableId = null, seats = null } = {}) => {
    const newId = Date.now();
    const currentNum = nextOrderNum;
    const prefix = myDeviceId.substring(0, 3).toUpperCase();
    const trimmed = customName ? customName.trim() : '';
    const ticketName = trimmed ? `${prefix} - ${trimmed} (#${currentNum})` : `${prefix} - #${currentNum}`;

    const newTicket = {
      id: newId,
      name: ticketName,
      items: [],
      cashier_id: activeCashier?.id,
      last_modified_by: myDeviceId,
      created_at: new Date().toISOString()
    };
    if (tableId != null) {
      newTicket.table_id = tableId;
      newTicket.seats = seats;
    }

    await db.active_tickets.add(newTicket);

    if (!isLocalMode() && navigator.onLine) {
      try {
        await supabase.from('active_tickets').insert([newTicket]);
      } catch (err) {
        console.error('Cloud create failed:', err);
      }
    }

    setActiveTicketId(newId);
    setNextOrderNum(currentNum + 1);
    return newId;
  };

  const handleNewTicket = () => {
    showPrompt(
      t('reg.promptTicketName'),
      t('reg.promptTicketNameDesc'),
      async (inputValue) => { await createTicket({ customName: inputValue }); },
      '',
      t('reg.btnCreateTicket'),
      t('reg.btnCancel')
    );
  };

  // Tables layout: open a new ticket on a specific table. Prompts for the cover
  // count (pre-filled with the table's expected seats, overridable for an extra
  // chair), then creates the table-bound ticket and runs onCreated (used by the
  // floor view to drop straight into the menu).
  const handleNewTableTicket = (tableId, expectedSeats = 4, onCreated) => {
    showPrompt(
      t('reg.promptSeats'),
      t('reg.promptSeatsDesc'),
      async (val) => {
        const parsed = parseInt(val, 10);
        const seats = Math.max(1, Number.isFinite(parsed) ? parsed : expectedSeats);
        await createTicket({ tableId, seats });
        onCreated?.();
      },
      String(expectedSeats),
      t('reg.btnCreateTicket'),
      t('reg.btnCancel')
    );
  };

  const handleRenameTicket = () => {
    if (!activeTicket) return;
    showPrompt(
      t('reg.promptTicketName'),
      t('reg.promptTicketNameDesc'),
      async (inputValue) => {
        if (!inputValue || !inputValue.trim()) return;
        const customName = inputValue.trim();
        const match = activeTicket.name.match(/\(#(\d+)\)$/);
        const match2 = activeTicket.name.match(/- #(\d+)$/);
        const currentNum = match ? match[1] : (match2 ? match2[1] : '?');
        const prefix = myDeviceId.substring(0, 3).toUpperCase();
        const newName = `${prefix} - ${customName} (#${currentNum})`;

        await db.active_tickets.update(activeTicket.id, { name: newName });

        if (!isLocalMode() && navigator.onLine) {
          try {
            await supabase.from('active_tickets').update({ name: newName }).eq('id', activeTicket.id);
          } catch (err) {
            console.error('Cloud rename failed:', err);
          }
        }
      },
      '',
      t('ticket.btnRename'),
      t('reg.btnCancel')
    );
  };

  const clearCurrentTicket = async () => {
    if (!activeTicket) return;
    const ticketIdToDelete = activeTicket.id;
    await db.active_tickets.delete(ticketIdToDelete);
    if (!isLocalMode() && navigator.onLine) {
      try {
        await supabase.from('active_tickets').delete().eq('id', ticketIdToDelete);
      } catch (err) {
        console.error('Cloud delete failed:', err);
      }
    }
    const remainingTickets = tickets.filter(t => t.id !== ticketIdToDelete);
    if (remainingTickets.length > 0) {
      const nextVisible = remainingTickets.find(tk => posSettings.ticketVisibility === 'open' || tk.cashier_id === activeCashier?.id);
      setActiveTicketId(nextVisible ? nextVisible.id : null);
    } else {
      setActiveTicketId(null);
    }
  };

  const handleCancelTicket = () => {
    if (!activeTicket) return;
    if (activeTicket.items.length === 0) {
      clearCurrentTicket();
      return;
    }
    showConfirm(t('reg.voidTitle'), t('reg.voidDesc'), () => {
      // Log the void; consume any manager override the gate just authorized.
      logActivity('ticket_voided', null, {
        ticket_id: activeTicket.id,
        ticket_name: activeTicket.name,
        item_count: activeTicket.items.length,
      }, consumePendingAuthorizer());
      clearCurrentTicket();
    });
  };

  const addToTicket = async (item, modifiers, customPrice) => {
    if (!activeTicket) {
      showAlert(t('cart.noActiveOrderTitle'), t('cart.noActiveOrderDesc'));
      setIsModalOpen(false);
      setPendingItem(null);
      return;
    }

    // Low-stock: non-blocking toast at/under threshold; modal only when an
    // ingredient would actually go negative.
    if (recipes) {
      const recipe = recipes.find(r => r.linked_menu_item === item.id);
      if (recipe && recipe.ingredients) {
        const inventory = await db.inventory.toArray();
        const threshold = posSettings?.lowStockThreshold || 0;
        for (const ing of recipe.ingredients) {
          const invItem = inventory.find(i => i.name === ing.name);
          if (!invItem) continue;
          const projected = invItem.current_stock - ing.qty;
          if (projected < 0) {
            showAlert(t('register.lowStock'), t('register.lowStockDesc').replace('{{ingredient}}', invItem.name).replace('{{qty}}', threshold));
            break;
          }
          if (projected <= threshold) {
            showToast(t('register.lowStockDesc').replace('{{ingredient}}', invItem.name).replace('{{qty}}', threshold), 'warning');
            break;
          }
        }
      }
    }

    const newItem = {
      ...item,
      basePrice: customPrice !== undefined ? customPrice : item.basePrice,
      uniqueId: crypto.randomUUID(),
      selectedModifiers: modifiers
    };
    const updatedItems = [...activeTicket.items, newItem];

    await db.active_tickets.update(activeTicket.id, { items: updatedItems });
    pushActiveTicketUpdate(activeTicket.id, { items: updatedItems, last_modified_by: myDeviceId });

    setIsModalOpen(false);
    setPendingItem(null);
  };

  const handleUpdateItemQty = async (itemUniqueId, newQty) => {
    if (!activeTicket) return;
    const updatedItems = newQty === 0
      ? activeTicket.items.filter(i => i.uniqueId !== itemUniqueId)
      : activeTicket.items.map(i => i.uniqueId === itemUniqueId ? { ...i, qty: newQty } : i);
    await db.active_tickets.update(activeTicket.id, { items: updatedItems });
    pushActiveTicketUpdate(activeTicket.id, { items: updatedItems, last_modified_by: myDeviceId });
  };

  const handleRemoveItem = async (itemUniqueId) => {
    if (!activeTicket) return;
    const updatedItems = activeTicket.items.filter(i => i.uniqueId !== itemUniqueId);
    await db.active_tickets.update(activeTicket.id, { items: updatedItems });
    pushActiveTicketUpdate(activeTicket.id, { items: updatedItems, last_modified_by: myDeviceId });
  };

  return {
    handleNewTicket,
    handleNewTableTicket,
    handleRenameTicket,
    clearCurrentTicket,
    handleCancelTicket,
    addToTicket,
    handleUpdateItemQty,
    handleRemoveItem
  };
}
