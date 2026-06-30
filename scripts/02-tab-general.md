# 02 · Configuración General

⏱️ 5–6 min · 👤 Administrador · 📍 Admin → **General**

> Objetivo: dejar la identidad de la tienda lista (nombre, moneda, zona horaria,
> color de marca) y activar el **Modo Avanzado** y la **seguridad de accesos**.

---

## Introducción

🎙️ «Configuración General es el corazón de los ajustes de tu tienda. Aquí defines
cómo se ve y cómo se comporta TinyPOS en todos los dispositivos.»

🖱️ Entra a **Admin → General** (último ícono de la barra lateral, engrane).

---

## Paso 1 — Identidad de la tienda

🖱️ Escribe el **nombre del negocio**.

🖱️ Elige el **Color de Marca Principal**.

🎙️ «Este color se usa en el panel, en los tickets, en los reportes PDF y en tu
menú público. Pon el color de tu marca para que todo se vea consistente.»

---

## Paso 2 — Moneda y zona horaria

🖱️ Selecciona la **moneda** y la **zona horaria**.

💡 La zona horaria es importante: define a qué hora cierran los cortes de caja y
qué menú público se muestra según el horario programado.

---

## Paso 3 — Modo Avanzado

🖱️ Activa **Modo Avanzado** (pedirá un PIN).

🎙️ «Con el Modo Avanzado apagado, TinyPOS funciona en *Modo Lite*: se ocultan
Inventario, Recetas, Reglas de Descuento, Cortes de Caja y Gastos. Es ideal para
un puesto sencillo. Si manejas inventario, recetas y márgenes, actívalo.»

💡 Cambiar este interruptor siempre pide PIN, para que un empleado no lo apague
por accidente.

---

## Paso 4 — Seguridad y Accesos

🎙️ «Aquí controlas quién puede hacer qué. Las dos opciones vienen **apagadas**,
así que si toda tu tienda comparte un solo PIN, nada cambia.»

🖱️ **Restringir Panel de Administración** — oculta el botón «Admin» para los
cajeros que no son administradores y bloquea la ruta `/admin`.

🖱️ **Requerir Gerente para Acciones Sensibles** — cuando un Empleado intente
hacer un **reembolso, anulación, gasto o descuento manual**, el sistema pedirá el
PIN de un Gerente o Administrador. Gerentes y administradores no ven el aviso.

💡 Cada autorización de este tipo queda registrada en el **Registro de
Actividad** con quién la autorizó.

---

## Paso 5 — Layout de la caja (OrderFlow)

🖱️ Si está disponible, muestra el interruptor de **diseño de la caja** por
dispositivo: clásico (cuadrícula) vs. **OrderFlow** (ticket → categorías →
ítems, pantalla completa en móvil).

🎙️ «Este ajuste es por dispositivo: una tablet grande puede usar la cuadrícula y
un teléfono el modo OrderFlow.»

---

## Cierre

🖱️ Pulsa **Guardar**.

🎙️ «Cada vez que guardas aquí, queda registrado en el historial. Ya tienes la
identidad de tu tienda lista. Sigamos con el menú.»

### ✅ Checklist
- [ ] Nombre, moneda y zona horaria
- [ ] Color de marca
- [ ] Modo Avanzado decidido (on/off)
- [ ] Seguridad de accesos configurada

➡️ Siguiente: [03 · Editor de Menú](03-tab-menu.md)
