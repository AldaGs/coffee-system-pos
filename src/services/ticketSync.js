import { supabase } from '../supabaseClient';
import { db } from '../db';

export const fetchActiveTickets = async () => {
    if (!navigator.onLine) return;

    try {
        // 1. Ask Supabase for all currently active tickets
        const { data: cloudTickets, error } = await supabase
            .from('active_tickets')
            .select('*');

        if (error) throw error;
        if (!cloudTickets) return;

        // 2. Erase the local Dexie active_tickets cache and replace it with the fresh cloud data
        // (Since active tickets are temporary, it's safer to completely overwrite Dexie with the cloud truth on boot)
        await db.active_tickets.clear();
        await db.active_tickets.bulkPut(cloudTickets);

        console.log(`☁️ Successfully pulled ${cloudTickets.length} active tickets from cloud.`);
    } catch (err) {
        console.error("Failed to pull active tickets:", err);
    }
};