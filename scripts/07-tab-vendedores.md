# 07 · Vendedores / Consignación

⏱️ 6–7 min · 👤 Administrador · 📍 Admin → **Vendedores** · 🔒 Modo Avanzado

> Objetivo: registrar a los vendedores en consignación, etiquetar sus productos y
> generar el reporte de liquidación con su pago.

---

## Introducción

🎙️ «Si vendes productos de otras marcas o personas —pan, postres, café de otro
tostador— el módulo de Vendedores te liquida a cada uno automáticamente según lo
vendido.»

🖱️ Entra a **Admin → Vendedores** (ícono de tienda).

---

## Paso 1 — Crear un vendedor

🖱️ Pulsa **«Agregar vendedor»** y pon su nombre y datos de contacto.

---

## Paso 2 — Elegir el modelo de reparto

🎙️ «Hay dos modelos de reparto:»

- 🖱️ **Comisión %** — te quedas un porcentaje de la venta (sobre el total bruto o
  sobre la base sin IVA).
- 🖱️ **Recuperación de costo** — la casa recupera el costo de producción de cada
  ítem y el vendedor se lleva la utilidad.

💡 Elige el que hayas acordado con tu vendedor.

---

## Paso 3 — Etiquetar productos

🖱️ En el Editor de Menú (o aquí), asigna a cada producto su **vendedor dueño**.

🎙️ «En cada venta, el vendedor se *fotografía* sobre la línea del ticket. Así, si
después renombras o reasignas un producto, las liquidaciones viejas no cambian.»

💡 Hay un interruptor de **respaldo por menú** para reatribuir tickets anteriores
a la etiqueta.

---

## Paso 4 — Generar la liquidación

🖱️ Elige el vendedor y el **rango de fechas**, y genera el **reporte de
liquidación**.

🎙️ «Verás el desglose por ítem, lo que le corresponde y el resumen contable que
separa tu *ingreso por comisión* de lo que es *cuenta por pagar al vendedor*, con
el IVA detallado.»

---

## Paso 5 — Registrar el pago (libro de pagos)

🖱️ Cuando le pagues, registra el **pago** en el libro (`vendor_payouts`).

🎙️ «El reporte muestra *adeudado − pagado = saldo*. Además, el pago puede
asentarse en el libro de gastos / salida de caja, y congela el estado de cuenta
contra el que pagaste.»

🖱️ Exporta el **estado de cuenta en PDF o PNG** para compartirlo (lleva el color
de tu marca).

---

## Cierre

🎙️ «Así cada vendedor cobra justo lo suyo y tu contabilidad queda limpia.»

💡 Nota: el resumen de libros es una reconciliación de reporte. En cada venta el
ticket completo entra como ingreso; la cuenta por pagar al vendedor se calcula en
el reporte, no se separa en tiempo real en la caja.

### ✅ Checklist
- [ ] Vendedores creados
- [ ] Modelo de reparto elegido
- [ ] Productos etiquetados
- [ ] Liquidación generada y pago registrado

➡️ Siguiente: [08 · Mesas](08-tab-mesas.md)
