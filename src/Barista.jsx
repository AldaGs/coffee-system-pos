import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import './App.css';

function Barista() {
  const [isLoading, setIsLoading] = useState(true);

  // Read LIVE from Dexie's sales table
  const orders = useLiveQuery(
    () => db.sales.where('status').equals('pending').sortBy('created_at')
  ) || [];

  useEffect(() => {
    // 1. Fetch initial unpaid/pending orders from Cloud and push into Dexie
    const fetchOrders = async () => {
      try {
        if (navigator.onLine) {
          const { data } = await supabase
            .from('sales')
            .select('*')
            .eq('status', 'pending');
          
          if (data && data.length > 0) {
            // Sync cloud into local dexie to ensure local truth
            await db.sales.bulkPut(data);
          }
        }
      } catch (e) {
        console.error("Cloud fetch failed, using local offline data.", e);
      }
      setIsLoading(false);
    };

    fetchOrders();

    // 2. REAL-TIME MAGIC: Mirror Supabase straight into Dexie
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'sales' }, 
        async (payload) => {
          if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
            await db.sales.put(payload.new);
          }
          if (payload.eventType === 'UPDATE') {
             await db.sales.update(payload.new.id, payload.new).catch(() => db.sales.put(payload.new));
          }
          if (payload.eventType === 'DELETE') {
             await db.sales.delete(payload.old.id);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const completeOrder = async (id) => {
    // Optimistic UI: Update Dexie locally first so it instantly removes from queue
    await db.sales.update(id, { status: 'completed' });

    // Actually tell the cloud database that this order is finished!
    try {
      if (!navigator.onLine) throw new Error("Offline, order completed locally.");
      const { error } = await supabase
        .from('sales')
        .update({ status: 'completed' })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.warn("Cloud sync delayed:", err);
      // It stays 'completed' in Dexie locally!
    }
  };

  if (isLoading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <div style={{ padding: '20px', backgroundColor: '#121212', minHeight: '100vh', color: 'white' }}>
      <h1 style={{ marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>☕ Barista Queue</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {orders.map(order => (
          <div key={order.id} style={{ background: '#1e1e1e', borderRadius: '12px', padding: '20px', border: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--brand-color)' }}>Order #{order.id.toString().slice(-3)}</span>
              <span style={{ color: '#888' }}>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, flex: 1 }}>
              {order.items_sold && order.items_sold.map((item, i) => (
                <li key={i} style={{ fontSize: '1.3rem', marginBottom: '8px', borderBottom: '1px solid #2a2a2a', paddingBottom: '4px' }}>
                   {item}
                </li>
              ))}
            </ul>

            <button 
              onClick={() => completeOrder(order.id)}
              style={{ marginTop: '20px', padding: '15px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}
            >
              DONE / SERVED
            </button>
          </div>
        ))}
        {orders.length === 0 && <p style={{color: '#888'}}>No pending orders down here.</p>}
      </div>
    </div>
  );
}

export default Barista;