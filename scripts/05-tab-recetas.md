# 05 · Creador de Recetas (BOM)

⏱️ 5–6 min · 👤 Administrador · 📍 Admin → **Recetas** · 🔒 Modo Avanzado

> Objetivo: definir de qué ingredientes está hecho cada producto para que la
> venta descuente inventario y se calcule el costo y el margen.

---

## Introducción

🎙️ «Una receta —o BOM, lista de materiales— le dice a TinyPOS qué insumos
consume cada producto. Con esto, cada venta descuenta el inventario solo y el
sistema sabe cuánto te cuesta cada bebida.»

🖱️ Entra a **Admin → Recetas** (ícono de matraz).

💡 Si la pestaña tiene candado, actívala primero con el **Modo Avanzado** en
General.

---

## Paso 1 — Elegir el producto

🖱️ Selecciona el producto al que le vas a crear la receta (ej. *Latte Mediano*).

---

## Paso 2 — Agregar ingredientes

🖱️ Pulsa **«Agregar ingrediente»** y elige un insumo del inventario (ej. *Café
en grano*, *Leche*).

🖱️ Escribe la **cantidad** que consume (ej. 18 g de café, 200 ml de leche).

🎙️ «Usa las mismas unidades con las que compras y guardas el insumo en
inventario. Si compras café por kilo y lo descuentas en gramos, mantén la unidad
consistente.»

---

## Paso 3 — Ver el costo y el margen

🎙️ «Conforme agregas ingredientes, TinyPOS suma el costo real de la receta a
partir del precio de cada insumo.»

🖱️ Muestra el **Motor de COGS / Margen**: pon un **margen objetivo** y el sistema
te sugiere el **precio recomendado**.

💡 Esto te ayuda a poner precios con cabeza, no a tanteo.

---

## Paso 4 — Repetir por producto

🎙️ «Crea la receta de cada bebida que quieras controlar. No todo necesita receta;
empieza por tus productos estrella.»

---

## Paso 5 — Crear el producto desde la receta

🎙️ «Una receta por sí sola no se vende: hay que crear el producto que la usa.»

🖱️ Si la receta todavía no tiene producto, usa **«Crear producto desde la
receta»** (antes se llamaba «Publicar en el menú»). Al guardar, el sistema te
dice en qué categoría del menú quedó el producto nuevo.

💡 También puedes ir al revés: desde el formulario de un producto, en **Menú**,
toca «Nueva receta para este producto».

---

## Cierre

🖱️ **Guardar**.

🎙️ «Con las recetas listas, cada venta va a mover el inventario automáticamente.
Vamos a configurar ese inventario.»

### ✅ Checklist
- [ ] Producto seleccionado
- [ ] Ingredientes con cantidad y unidad
- [ ] Margen objetivo / precio recomendado revisado
- [ ] Producto creado desde la receta (si no existía)

➡️ Siguiente: [06 · Inventario y El Tostador](06-tab-inventario.md)
