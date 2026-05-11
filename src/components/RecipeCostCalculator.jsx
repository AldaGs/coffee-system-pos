import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toCents, formatForDisplay } from '../utils/moneyUtils';

const UNITS = ['g', 'ml', 'pza'];

function emptyIngredient() {
  return { id: Date.now() + Math.random(), name: '', qty: '', unit: 'g', costPerUnit: '' };
}

export default function RecipeCostCalculator() {
  useEffect(() => {
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const [recipeName, setRecipeName] = useState('');
  const [ingredients, setIngredients] = useState([emptyIngredient()]);
  const [targetMargin, setTargetMargin] = useState(30);
  const [customPrice, setCustomPrice] = useState('');

  function addIngredient() {
    setIngredients(prev => [...prev, emptyIngredient()]);
  }

  function removeIngredient(id) {
    if (ingredients.length > 1) {
      setIngredients(prev => prev.filter(i => i.id !== id));
    }
  }

  function updateIngredient(id, field, value) {
    setIngredients(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function loadExample() {
    setRecipeName('Latte');
    setIngredients([
      { id: Date.now() + 1, name: 'Espresso', qty: '18', unit: 'g', costPerUnit: '0.25' },
      { id: Date.now() + 2, name: 'Leche', qty: '180', unit: 'ml', costPerUnit: '0.03' },
      { id: Date.now() + 3, name: 'Vaso', qty: '1', unit: 'pza', costPerUnit: '2.50' },
    ]);
    setTargetMargin(25);
  }

  function reset() {
    setRecipeName('');
    setIngredients([emptyIngredient()]);
    setTargetMargin(30);
    setCustomPrice('');
  }

  const totalCost = ingredients.reduce((sum, ing) => {
    const qty = parseFloat(ing.qty) || 0;
    const cpu = parseFloat(ing.costPerUnit) || 0;
    return sum + qty * cpu;
  }, 0);

  const recommendedPrice = totalCost > 0 ? totalCost / (targetMargin / 100) : 0;
  const expectedProfit = recommendedPrice - totalCost;

  const fmt = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: 'var(--bg-main, #f4f6f8)',
      fontFamily: 'var(--font-main, system-ui)',
      color: 'var(--text-main, #111827)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto',
    }}>
      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 5%', alignItems: 'center', backgroundColor: 'var(--bg-surface, white)', borderBottom: '1px solid var(--border, #e5e7eb)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/icon.svg" alt="tinypos" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
          <span style={{ fontSize: '1.3rem', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-0.5px' }}>tinypos</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: '300', fontSize: '1.4rem' }}>/</span>
          <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-muted)' }}>Calculadora de Recetas</span>
        </div>
        <a
          href="/"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', textDecoration: 'none', fontWeight: '600', fontSize: '0.95rem', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', transition: 'all 0.2s' }}
        >
          <Icon icon="lucide:arrow-left" />
          Volver
        </a>
      </nav>

      {/* BODY */}
      <main style={{ flex: 1, padding: 'clamp(32px, 6vw, 64px) 5%', maxWidth: '1000px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* HEADER */}
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', fontWeight: '800', margin: '0 0 10px', color: 'var(--text-main)', letterSpacing: '-1px' }}>
              Constructor de Recetas
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
              Calcula costos y márgenes de ganancia en tiempo real.
            </p>
          </div>
          <button
            onClick={loadExample}
            style={{ padding: '12px 24px', background: 'var(--brand-color, #f28b05)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(242, 139, 5, 0.2)' }}
          >
            <Icon icon="lucide:coffee" />
            Cargar ejemplo
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* RECIPE INFO */}
          <div style={{ background: 'var(--bg-surface, white)', padding: '24px', borderRadius: '18px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border)' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:tag" style={{ color: 'var(--brand-color)' }} />
              Nombre de la receta
            </label>
            <input
              value={recipeName}
              onChange={e => setRecipeName(e.target.value)}
              placeholder="Ej. Latte de Vainilla"
              style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1.2rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
            />
          </div>

          {/* INGREDIENTS LIST */}
          <div style={{ background: 'var(--bg-surface, white)', padding: '24px', borderRadius: '18px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:list-ordered" style={{ color: 'var(--brand-color)' }} />
                Ingredientes y Costos
              </h3>
              <button onClick={addIngredient} style={{ padding: '10px 20px', background: 'rgba(242, 139, 5, 0.1)', color: 'var(--brand-color)', border: '1px solid var(--brand-color)', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:plus-circle" />
                Agregar fila
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ingredients.map((ing, idx) => {
                const rowCost = (parseFloat(ing.qty) || 0) * (parseFloat(ing.costPerUnit) || 0);
                return (
                  <div key={ing.id} className="recipe-ingredient-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) 44px', gap: '12px', alignItems: 'center', background: 'var(--bg-main)', padding: '12px', borderRadius: '16px', border: '1px solid var(--border)' }}>

                    <input
                      value={ing.name}
                      onChange={e => updateIngredient(ing.id, 'name', e.target.value)}
                      placeholder={`Ingrediente ${idx + 1}`}
                      style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                      <input
                        type="number"
                        placeholder="Cant"
                        value={ing.qty}
                        onChange={e => updateIngredient(ing.id, 'qty', e.target.value)}
                        style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none', textAlign: 'right' }}
                      />
                      <select
                        value={ing.unit}
                        onChange={e => updateIngredient(ing.id, 'unit', e.target.value)}
                        style={{ padding: '0 8px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.03)', border: 'none', height: '42px', outline: 'none' }}
                      >
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', paddingLeft: '10px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Costo u."
                        value={ing.costPerUnit}
                        onChange={e => updateIngredient(ing.id, 'costPerUnit', e.target.value)}
                        style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none' }}
                      />
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-surface)', color: 'var(--text-main)', textAlign: 'right', fontWeight: '900', border: '1px solid var(--border)' }}>
                      {formatForDisplay(toCents(rowCost))}
                    </div>

                    <button
                      onClick={() => removeIngredient(ing.id)}
                      disabled={ingredients.length === 1}
                      style={{ padding: '10px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: 'none', borderRadius: '10px', cursor: ingredients.length === 1 ? 'default' : 'pointer', display: 'flex', opacity: ingredients.length === 1 ? 0.3 : 1 }}
                    >
                      <Icon icon="lucide:trash-2" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PROFIT ENGINE */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>

            {/* TARGET FOOD COST */}
            <div style={{ background: 'var(--bg-surface, white)', padding: '24px', borderRadius: '18px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid var(--brand-color)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
                <Icon icon="lucide:target" style={{ color: 'var(--brand-color)' }} />
                Food Cost Objetivo
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)' }}>{targetMargin}%</span>
                </div>
                <input
                  type="range" min="10" max="60"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(parseFloat(e.target.value))}
                  style={{ width: '100%', height: '8px', borderRadius: '4px', accentColor: 'var(--brand-color)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '20px', background: 'var(--bg-main)', borderRadius: '16px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', margin: '0 0 4px 0', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px', fontWeight: 'bold' }}>Costo total de insumos</p>
                  <div style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text-main)' }}>{fmt(totalCost)}</div>
                </div>

                <div style={{ padding: '24px', background: 'rgba(39, 174, 96, 0.05)', borderRadius: '16px', border: '1px solid rgba(39, 174, 96, 0.2)', textAlign: 'center' }}>
                  <p style={{ color: '#27ae60', margin: '0 0 4px 0', fontWeight: '800', fontSize: '0.85rem' }}>Precio Sugerido</p>
                  <div style={{ fontSize: '3rem', fontWeight: '900', color: '#27ae60', letterSpacing: '-1px' }}>{fmt(recommendedPrice)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#27ae60', fontSize: '0.9rem', marginTop: '4px', fontWeight: 'bold' }}>
                    <Icon icon="lucide:trending-up" />
                    Ganancia bruta: {fmt(expectedProfit)}
                  </div>
                </div>
              </div>
            </div>

            {/* WHAT-IF ANALYSIS */}
            <div style={{ background: 'var(--bg-surface, white)', padding: '24px', borderRadius: '18px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '8px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
                <Icon icon="lucide:calculator" style={{ color: 'var(--brand-color)' }} />
                Análisis "¿Y si...?"
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>Ingresa un precio de venta para ver tu margen real.</p>

              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '2px solid var(--border)', borderRadius: '16px', padding: '0 16px', marginBottom: '24px' }}>
                <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>$</span>
                <input
                  type="number" step="0.01" placeholder="Precio de venta personalizado"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  style={{ flex: 1, padding: '16px', border: 'none', background: 'transparent', fontSize: '1rem', color: 'var(--text-main)', outline: 'none', fontWeight: '900' }}
                />
              </div>

              {customPrice && parseFloat(customPrice) > 0 ? (() => {
                const price = parseFloat(customPrice);
                const netProfit = price - totalCost;
                const foodCostPercentage = price > 0 ? ((totalCost / price) * 100).toFixed(1) : 0;
                const grossMarginPercentage = price > 0 ? ((netProfit / price) * 100).toFixed(1) : 0;

                const isProfitable = netProfit >= 0;

                return (
                  <div style={{ background: isProfitable ? 'rgba(26, 188, 156, 0.05)' : 'rgba(231, 76, 60, 0.05)', padding: '24px', borderRadius: '16px', border: `1px solid ${isProfitable ? 'rgba(26, 188, 156, 0.2)' : 'rgba(231, 76, 60, 0.2)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px dashed ${isProfitable ? '#1abc9c' : '#e74c3c'}`, paddingBottom: '12px' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>Ganancia neta</span>
                      <span style={{ fontWeight: '900', fontSize: '1.8rem', color: isProfitable ? '#1abc9c' : '#e74c3c' }}>
                        {fmt(netProfit)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>Margen de utilidad</span>
                        <span style={{ fontWeight: '800', color: 'var(--brand-color)', fontSize: '1rem' }}>{grossMarginPercentage}%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Costo de insumos (Food Cost)</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold' }}>{foodCostPercentage}%</span>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-main)', borderRadius: '16px', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Ingresa un precio para ver el análisis de margen
                </div>
              )}
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              onClick={reset}
              style={{ padding: '16px 32px', background: 'var(--bg-surface)', border: '2px solid var(--border)', borderRadius: '16px', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' }}
            >
              Limpiar todo
            </button>
          </div>
        </div>

        {/* PROMO FOOTER */}
        <div style={{ marginTop: '64px', padding: '40px', background: 'linear-gradient(135deg, #0d3a66 0%, #1e4b8a 100%)', borderRadius: '24px', color: 'white', textAlign: 'center', boxShadow: '0 20px 40px rgba(13, 58, 102, 0.2)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '1.6rem', fontWeight: '900' }}>¿Gestionas un negocio de café?</h3>
          <p style={{ margin: '0 0 32px', color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', maxWidth: '600px', marginInline: 'auto' }}>
            tinypos automatiza este cálculo vinculando tus compras de inventario con tus ventas reales.
          </p>
          <a
            href="/"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '16px 40px', background: 'var(--brand-color)', color: 'white', borderRadius: '16px', textDecoration: 'none', fontWeight: '900', fontSize: '1.1rem', boxShadow: '0 8px 20px rgba(242, 139, 5, 0.3)' }}
          >
            <Icon icon="lucide:sparkles" />
            Usa tinypos gratis
          </a>
        </div>
      </main>

      <footer style={{ padding: '32px', textAlign: 'center', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} tinypos. Diseñado por Aldair Gonzalez Sanchez.
      </footer>
    </div>
  );
}
