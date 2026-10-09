import { describe, expect, it, vi } from 'vitest';
import { fetchOrderMenu } from '../utils/orderMenu';

describe('selected order menu resolver', () => {
  it('retains the selected menu response', async () => {
    const selected = { data: { menu: { id: 'B' } }, error: null };
    const client = { rpc: vi.fn().mockResolvedValue(selected) };
    expect(await fetchOrderMenu(client)).toBe(selected);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['PGRST202', '42883'])('supports the missing legacy function (%s)', async (code) => {
    const active = { data: { menu: { id: 'A' } }, error: null };
    const client = { rpc: vi.fn().mockResolvedValueOnce({ error: { code, message: 'Function public.get_order_menu() does not exist' } }).mockResolvedValueOnce(active) };
    expect(await fetchOrderMenu(client)).toBe(active);
  });
  it.each([{ code: '42501', message: 'permission denied for function get_order_menu' }, { code: '500', message: 'server error' }, { message: 'Failed to fetch' }, { code: 'PGRST202', message: 'Function public.other_rpc does not exist' }, { code: '42883', message: 'Function public.other_rpc does not exist' }])('preserves true errors %o', async (error) => {
    const response = { data: null, error };
    const client = { rpc: vi.fn().mockResolvedValueOnce(response).mockResolvedValue({ data: { menu: { id: 'A' } }, error: null }) };
    expect(await fetchOrderMenu(client)).toBe(response);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it('preserves an internal missing-function error mentioning get_order_menu in context', async () => {
    const response = { data: null, error: { code: '42883', message: 'function public.other_rpc() does not exist', details: 'PL/pgSQL function get_order_menu() line 4 at assignment' } };
    const client = { rpc: vi.fn().mockResolvedValueOnce(response).mockResolvedValue({ data: { menu: { id: 'A' } }, error: null }) };
    expect(await fetchOrderMenu(client)).toBe(response);
  });
  it('supports PostgREST missing parameterless function wording', async () => {
    const active = { data: { menu: { id: 'A' } }, error: null };
    const client = { rpc: vi.fn().mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Could not find the function public.get_order_menu without parameters in the schema cache' } }).mockResolvedValueOnce(active) };
    expect(await fetchOrderMenu(client)).toBe(active);
  });
});
