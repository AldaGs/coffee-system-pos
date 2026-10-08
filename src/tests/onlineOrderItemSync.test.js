import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));
vi.mock('../db', () => ({ db: {} }));

const { toOrderItems } = await import('../services/ticketSync');

describe('toOrderItems (ticket edits -> customer tracker)', () => {
  it('prices lines in cents with modifiers and drops the fee line', () => {
    const lines = toOrderItems([
      { id: 'latte', name: 'Latte', basePrice: 5500, qty: 2, selectedModifiers: [{ id: 'oat', name: 'Avena', price: 1000 }] },
      { id: 'online-delivery-fee', name: 'Envío', basePrice: 3000, qty: 1, selectedModifiers: [] },
      { id: 'cookie', name: 'Galleta', basePrice: 25.5, selectedModifiers: [] }, // legacy pesos, no qty
    ]);
    expect(lines.map((l) => [l.id, l.qty, l.unit_cents, l.line_cents])).toEqual([
      ['latte', 2, 6500, 13000],
      ['cookie', 1, 2550, 2550],
    ]);
    expect(lines[0].modifiers).toEqual([{ id: 'oat', name: 'Avena', groupId: undefined, price_cents: 1000 }]);
  });
});
