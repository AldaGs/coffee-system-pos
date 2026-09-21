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

🖱️ Elige también el **bolsillo con el que pagaste**: *Caja chica*, *Banco* o
*Dueño*.

💡 Solo lo pagado desde la caja afecta el corte del día; lo que pagaste con el
banco o de tu bolsa entra al P&L pero no descuadra el efectivo.

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

## Paso 5 — Lotes de tueste (FIFO)

🎙️ «Los artículos con lote —café tostado, tandas de jarabe, comida preparada—
guardan cada tanda por separado, con su fecha de tueste y su fecha de entrada.»

🖱️ Expande un artículo con lote para ver sus **lotes** y cuánto queda de cada uno.

🎙️ «Las ventas consumen primero el lote más viejo, así que cada bolsa vendida se
puede rastrear hasta el tueste del que salió.»

🖱️ Expande un lote para ver **qué ventas salieron de esa tanda**.

💡 Si tuestas fuera y el café llega días después, pon la **fecha de tueste** real
además de la fecha en que entró a inventario.

---

## Paso 6 — Ajustes, mermas y auditoría

🖱️ Para corregir stock, usa **Auditar** indicando el motivo (merma, conteo,
daño). Los remanentes de lote se ajustan junto con el stock.

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
- [ ] Lotes revisados y rastreables (si aplica)
- [ ] Bolsillo de pago correcto en compras y resurtidos

➡️ Siguiente: [07 · Vendedores / Consignación](07-tab-vendedores.md)
