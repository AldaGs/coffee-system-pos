import { useEffect, useEffectEvent, useRef } from 'react';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import { isLocalMode } from '../utils/appMode';

// Sending a ticket to the kitchen (KDS): one order_fulfillment row per ticket.
// In "immediate" mode every ticket with items goes out without a button press.
export function useKdsSend({ tickets, posSettings, showToast, showAlert, t }) {
  // kds_sent only flips after the awaited write, so a re-render in between could send twice.
  const sendingRef = useRef(new Set());

  const handleSendToKds = async (ticket, { silent = false } = {}) => {
    if (!ticket || ticket.kds_sent || sendingRef.current.has(ticket.id)) return;
    sendingRef.current.add(ticket.id);
    try {
      await db.active_tickets.update(ticket.id, { kds_sent: true });
      if (!isLocalMode()) {
        // The fulfillment row is the send; scheduled online orders carry their time.
        const { data: oo } = await supabase.from('online_orders').select('pickup_at').eq('active_ticket_id', ticket.id).maybeSingle();
        const { error: insertErr } = await supabase.from('order_fulfillment').insert({
          active_ticket_id: ticket.id,
          customer_name: ticket.name,
          items: ticket.items,
          payment_status: 'unpaid',
          status: 'received',
          ...(oo?.pickup_at ? { delivery_date: oo.pickup_at } : {}),
        });
        if (insertErr) throw insertErr;
        // Best effort: the KDS doesn't read this flag and older installs may lack the column.
        const { error: flagErr } = await supabase.from('active_tickets').update({ kds_sent: true }).eq('id', ticket.id);
        if (flagErr) console.warn('Cloud kds_sent flag update failed (non-fatal):', flagErr.message);
      }
      if (!silent) showToast('Pedido enviado a cocina');
    } catch (err) {
      console.error('Failed to send to KDS:', err);
      // Undo the local flag so the ticket can be retried.
      await db.active_tickets.update(ticket.id, { kds_sent: false }).catch(() => {});
      if (!silent) showAlert(t('common.error'), 'No se pudo enviar a la cocina');
    } finally {
      sendingRef.current.delete(ticket.id);
    }
  };

  // handleSendToKds is recreated every render; the ticket list is what should trigger a send.
  const autoSend = useEffectEvent((tk) => handleSendToKds(tk, { silent: true }));
  useEffect(() => {
    if (!posSettings?.kdsEnabled || posSettings?.kdsMode !== 'immediate') return;
    tickets
      .filter((tk) => !tk.kds_sent && Array.isArray(tk.items) && tk.items.length > 0)
      .forEach((tk) => autoSend(tk));
  }, [tickets, posSettings?.kdsEnabled, posSettings?.kdsMode]);

  return handleSendToKds;
}
