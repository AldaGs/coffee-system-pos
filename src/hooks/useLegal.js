import { useEffect, useState } from 'react';

// get_legal() is tiny: fetch it once per client (shared by every LegalLinks on the
// page) so links with no text are never shown, instead of opening an empty modal.
const cache = new WeakMap();
export function useLegal(client) {
  const [legal, setLegal] = useState(null);
  useEffect(() => {
    if (!client) return;
    if (!cache.has(client)) cache.set(client, client.rpc('get_legal').then(({ data }) => data || {}, () => ({})));
    let alive = true;
    cache.get(client).then((d) => alive && setLegal(d));
    return () => { alive = false; };
  }, [client]);
  return legal;
}
