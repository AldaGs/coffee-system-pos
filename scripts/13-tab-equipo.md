# 13 · Equipo y PINs

⏱️ 4–5 min · 👤 Administrador · 📍 Admin → **Equipo & PIN** · ☁️ Solo nube

> Objetivo: dar de alta a los cajeros, asignarles un rol y un PIN seguro.

---

## Introducción

🎙️ «En Equipo das de alta a las personas que usan la caja. Cada una tiene su PIN
y su rol, lo que define qué puede hacer.»

🖱️ Entra a **Admin → Equipo & PIN** (ícono de personas).

💡 Requiere proyecto en la nube.

---

## Paso 1 — Agregar un cajero

🖱️ Pulsa **«Agregar»**, escribe el **nombre** y asígnale un **PIN**.

🎙️ «El PIN se guarda cifrado con bcrypt en la nube y se verifica en el servidor,
nunca en el navegador. Por seguridad, ni siquiera el sistema puede leerlo en
texto.»

---

## Paso 2 — Asignar el rol

🖱️ Elige el **rol** con el selector de 3 opciones:

- **Empleado** — opera la caja; las acciones sensibles pueden requerir
  autorización.
- **Gerente** — puede autorizar reembolsos, anulaciones, gastos y descuentos.
- **Administrador** — acceso total, incluido el panel.

🎙️ «Combina los roles con las opciones de *Seguridad y Accesos* de Configuración
General para controlar quién hace qué.»

➡️ Ver [02 · Configuración General](02-tab-general.md), Paso 4.

---

## Paso 3 — Quitar un cajero

🖱️ Para dar de baja a alguien, elimínalo; su PIN se borra de la nube.

💡 Quien deja de trabajar contigo pierde el acceso de inmediato.

---

## Cierre

🎙️ «Ya tienes a tu equipo con sus PINs y roles. Cada acción quedará atribuida a
quien la hizo.»

### ✅ Checklist
- [ ] Cajeros dados de alta con PIN
- [ ] Roles asignados
- [ ] Probado el inicio de sesión con un PIN

➡️ Siguiente: [14 · Dispositivos](14-tab-dispositivos.md)
