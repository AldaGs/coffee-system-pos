export async function fetchOrderMenu(client) {
  const result = await client.rpc('get_order_menu');
  const error = result.error;
  // Older schemas lack this RPC. Other failures must retain the selection
  // error instead of silently replacing an owner's chosen ordering menu.
  const missing = ['PGRST202', '42883'].includes(error?.code)
    && /\bfunction\s+(?:public\.)?get_order_menu\b/i.test(error?.message || '');
  return missing ? client.rpc('get_active_menu') : result;
}
