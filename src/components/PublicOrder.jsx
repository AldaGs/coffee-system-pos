// Customer-facing online ordering (pickup or delivery, pay on receipt). No accounts.
//
//   /order?p=REF                  menu + cart + checkout
//   /order/track/<token>?p=REF    live status of one order
//
// Talks to Supabase only through the anon key and two RPCs: get_active_menu
// (menu), public_place_order (submit; server reprices) and get_order_status
// (token lookup). Customer details and past orders live in this browser's
// localStorage only. Connection bootstrap mirrors PublicMenu (?p= ref or
// custom domain).

import { useState } from 'react';
import { STR } from './publicOrder/strings';
import { MOTION_CSS, centerStyle, useClient } from './publicOrder/shared';
import { Loading } from './publicOrder/ui';
import Order from './publicOrder/Order';
import Track from './publicOrder/Track';

function PublicOrder() {
  const trackToken = window.location.pathname.startsWith('/order/track/')
    ? window.location.pathname.split('/order/track/')[1].replace(/\/$/, '') : null;
  const { client, error } = useClient();
  const [lang, setLang] = useState(() => (navigator.language || 'es').startsWith('en') ? 'en' : 'es');
  const s = STR[lang] || STR.es;

  if (error) return <div style={centerStyle}>{s.badLink}</div>;
  if (!client) return <><style>{MOTION_CSS}</style><Loading text={s.loading} /></>;
  return <><style>{MOTION_CSS}</style>{trackToken
    ? <Track client={client} token={trackToken} lang={lang} setLang={setLang} />
    : <Order client={client} lang={lang} setLang={setLang} />}</>;
}

export default PublicOrder;
