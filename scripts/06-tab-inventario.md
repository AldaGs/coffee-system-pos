# 06 · Inventario y El Tostador

⏱️ 6–7 min · 👤 Administrador · 📍 Admin → **Inventario** · 🔒 Modo Avanzado

> Objetivo: cargar el stock de insumos, configurar alertas de reposición y usar
> **El Tostador** para transformar café verde en café tostado listo para vender.

---

## Introducción

🎙️ «Inventario es el almacén de TinyPOS. Aquí registras tus insumos, ves cuánto
te queda y recibes alertas cuando algo está por agotarse. También incluye *El
Tostador* para los que tuestan su propio café.»

🖱️ Entra a **Admin → Inventario** (ícono de base de datos).

---

## Paso 1 — Crear un insumo

🖱️ Pulsa **«Agregar insumo»**. Escribe nombre, **unidad** (g, ml, pza), **costo**
y **stock actual**.

🎙️ «El costo que pongas aquí es el que usan las recetas para calcular cuánto te
cuesta cada bebida.»

---

## Paso 2 — Punto de reposición (alertas)

🖱️ Define el **punto de reposición** (umbral) de cada insumo.

🎙️ «Cuando el stock baje a ese nivel o menos, TinyPOS te avisa, tanto en el panel
como en la caja registradora, para que repongas a tiempo.»

---

## Paso 3 — Multi-almacén

🖱️ Si tienes varios almacenes/sucursales, vincula el insumo al almacén
correspondiente.

💡 Útil cuando una bodega central surte a varios puntos.

---

## Paso 4 — El Tostador (verde → tostado)

🎙️ «Si tuestas tu propio café, El Tostador convierte café verde en café tostado
y ajusta el inventario de ambos.»

🖱️ Abre **El Tostador**, elige el café verde de entrada y la cantidad.

🖱️ Ingresa el **rendimiento final** — el **peso real que sacaste del tambor**, no
un porcentaje de merma.

🎙️ «Antes se pedía un porcentaje de pérdida; ahora simplemente pones lo que de
verdad obtuviste. Más simple y más exacto.»

🖱️ Confirma. El verde baja y el tostado sube en el inventario.

---

## Paso 5 — Ajustes y mermas

🖱️ Para corregir stock, usa el **ajuste** indicando el motivo (merma, conteo,
daño).

💡 Toda eliminación o ajuste queda en el **Registro de Actividad** con su motivo y
categoría, para auditoría.

---

## Cierre

🎙️ «Con el inventario cargado y las recetas hechas, cada venta descuenta solo y
sabes en tiempo real qué tienes. Sigamos con Vendedores si trabajas en
consignación.»

### ✅ Checklist
- [ ] Insumos con costo, unidad y stock
- [ ] Puntos de reposición definidos
- [ ] Tostado registrado con peso final (si aplica)

➡️ Siguiente: [07 · Vendedores / Consignación](07-tab-vendedores.md)
