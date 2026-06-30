# 01 · Primera configuración (Onboarding)

⏱️ Duración estimada: 6–8 min · 👤 Para el dueño / administrador

> Objetivo: dejar la tienda lista para vender desde cero — conectar la nube,
> aprovisionar la base de datos y crear el primer PIN de administrador.

---

## Introducción

🎙️ «Bienvenido a TinyPOS. En este primer tutorial vamos a configurar tu
cafetería desde cero. Al terminar vas a poder cobrar tu primera venta. No
necesitas saber nada de bases de datos ni copiar claves: TinyPOS hace todo el
trabajo pesado por ti.»

💡 TinyPOS funciona **offline-first**: aunque se caiga el internet, la caja
sigue cobrando y todo se sincroniza solo cuando vuelve la conexión.

---

## Paso 1 — Abrir la app por primera vez

🖱️ Abre la dirección de tu TinyPOS en el navegador (Chrome o el navegador de
la tablet). La primera vez verás la **pantalla de bienvenida / setup**.

🎙️ «Esta pantalla solo aparece una vez, cuando la tienda todavía no está
conectada a la nube.»

💡 Si solo quieres probar el sistema sin nube, existe el **Modo Local**: todo se
guarda en este dispositivo. Para varias cajas, reportes y respaldo necesitas la
nube (Supabase).

---

## Paso 2 — Conectar tu proyecto de nube (Supabase) con OAuth

🖱️ Pulsa **«Conectar con Supabase»**. Se abre la ventana de inicio de sesión de
Supabase.

🎙️ «TinyPOS usa tu propia cuenta de Supabase como base de datos. Es gratis para
empezar y los datos son tuyos. Inicia sesión o crea una cuenta.»

🖱️ Autoriza el acceso. Vuelves automáticamente a TinyPOS.

🖱️ Elige el **proyecto** donde quieres instalar TinyPOS de la lista que aparece.

💡 La clave de administrador (`service_role`) se usa solo unos segundos para
instalar y luego se **descarta de la memoria** — nunca se guarda. Esto es parte
del diseño de seguridad «zero-trust».

---

## Paso 3 — Aprovisionar la base de datos

🖱️ Pulsa **«Instalar / Aprovisionar»**.

🎙️ «En segundos TinyPOS crea todo lo necesario: tablas, reglas de seguridad,
funciones de cobro, recetas, inventario y datos de ejemplo. No tienes que tocar
ningún editor de SQL.»

🖱️ Espera a que la barra termine y muestre **«Listo»**.

💡 Si más adelante ves el aviso **«Actualización disponible»** en Configuración,
es el mismo proceso: pulsa **Actualizar esquema** y vuelve a autorizar. Es
seguro repetirlo.

---

## Paso 4 — Crear el PIN de administrador

🎙️ «Ahora cada persona del equipo se identifica con un PIN, no con contraseñas.
El primer usuario que entra se vuelve administrador automáticamente.»

🖱️ Ingresa y confirma tu PIN de administrador.

💡 Anota tu PIN en un lugar seguro. El administrador es quien puede entrar al
panel, editar el menú y ver los reportes.

---

## Paso 5 — Primer recorrido por el panel

🖱️ Entra al **Panel de Administración** (botón «Admin»).

🎙️ «Esta es tu central de control. En la barra izquierda están todas las
secciones. Las que tienen un candado se activan con el **Modo Avanzado**, que
veremos en el siguiente tutorial.»

🖱️ Señala de arriba a abajo: Analíticas, Historial de Tickets, Menú,
Modificadores, Recetas, Inventario, Vendedores, Mesas, Menús Públicos,
Configuración de Ticket, Descuentos, Lealtad, Equipo, Dispositivos, Propinas,
Registro de Actividad y General.

---

## Cierre

🎙️ «¡Listo! Tu tienda ya está conectada y aprovisionada. En el siguiente video
vamos a Configuración General para poner el nombre, la moneda, el color de tu
marca y activar el Modo Avanzado.»

### ✅ Checklist de este tutorial
- [ ] Conectaste Supabase con OAuth
- [ ] Aprovisionaste la base de datos (estado «Listo»)
- [ ] Creaste tu PIN de administrador
- [ ] Entraste al panel de administración

➡️ Siguiente: [02 · Configuración General](02-tab-general.md)
