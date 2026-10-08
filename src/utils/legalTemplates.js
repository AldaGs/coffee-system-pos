// Spanish starter templates (Mexico). Reference only, not legal advice.
const fill = (t, { businessName, address, contact }) => t
  .replaceAll('{negocio}', businessName || '[nombre del negocio]')
  .replaceAll('{domicilio}', address || '[domicilio]')
  .replaceAll('{contacto}', contact || '[correo o teléfono de contacto]')
  .replaceAll('{fecha}', new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }));

const PRIVACY = `AVISO DE PRIVACIDAD INTEGRAL

1. Responsable
{negocio}, con domicilio en {domicilio}, es responsable del tratamiento de tus datos personales, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (vigente desde el 21 de marzo de 2025).

2. Datos que recabamos
- Identificación y contacto: nombre y teléfono.
- Entrega: domicilio y, opcionalmente, ubicación en el mapa.
- Pedido: productos, notas, fecha y hora solicitadas, y forma de pago elegida (efectivo, tarjeta o transferencia). No almacenamos datos de tarjetas.
- Facturación (solo si solicitas factura): RFC, razón social, régimen fiscal, código postal, correo electrónico y constancia de situación fiscal.

3. Finalidades
Primarias (necesarias): recibir, preparar, entregar y cobrar tu pedido; contactarte sobre su estado; emitir tu CFDI cuando lo solicites.
Secundarias: no utilizamos tus datos para fines secundarios. Si en el futuro enviáramos promociones, solo lo haríamos con tu consentimiento, y podrás negarte o retirarlo en cualquier momento escribiendo a {contacto}, sin que ello afecte tu pedido.

4. Datos guardados en tu dispositivo
Para agilizar tus pedidos, tu historial y datos de contacto se recuerdan en el navegador de tu dispositivo. Puedes borrarlos con la opción "Olvidar mis datos" de la página de pedidos.

5. Transferencias
No vendemos tus datos. Los compartimos únicamente con: el SAT, para la emisión de facturas; el personal de reparto, para entregar tu pedido; y proveedores de pago y tecnología que actúan por nuestra cuenta, para operar el servicio. Estas transferencias son necesarias para la relación contigo o por obligación legal.

6. Derechos ARCO y revocación del consentimiento
Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición, o revocar tu consentimiento, enviando tu solicitud a {contacto} con tu nombre, un medio para responderte, la descripción clara de tu petición y, en su caso, el documento que acredite tu identidad. Te responderemos en los plazos que marca la ley. Si consideras que tu derecho fue vulnerado, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno.

7. Conservación
Conservamos tus datos el tiempo necesario para cumplir las finalidades anteriores y las obligaciones legales y fiscales aplicables; después los eliminamos o bloqueamos.

8. Cambios al aviso
Cualquier cambio se publicará en esta misma página.

Última actualización: {fecha}`;

const TERMS = `TÉRMINOS Y CONDICIONES

1. Quiénes somos
{negocio}, con domicilio en {domicilio}. Contacto: {contacto}.

2. Pedidos
Tu pedido es una solicitud que el negocio debe aceptar. Podemos rechazarlo (por ejemplo, por falta de producto o fuera de horario) y te lo notificaremos.

3. Precios y cargos
Los precios están en pesos mexicanos (MXN) e incluyen IVA. El costo de envío, si aplica, se muestra antes de enviar tu pedido.

4. Pago
El pago se realiza al recoger o al recibir tu pedido, con la forma de pago que elegiste (efectivo, tarjeta o transferencia).

5. Horarios y disponibilidad
Los pedidos están sujetos al horario de atención, a la fecha y hora disponibles y a la existencia de los productos.

6. Cancelaciones y reembolsos
Puedes cancelar tu pedido antes de que comience su preparación, contactándonos en {contacto}. El negocio puede cancelar un pedido y te informará el motivo. Si ya hubiera un pago, se te reembolsará por el mismo medio.

7. Entrega
La cobertura de entrega es la que el negocio indique. Eres responsable de que el domicilio y la ubicación sean correctos y de estar disponible para recibir.

8. Problemas con el producto
Si tu pedido llega incompleto, incorrecto o en mal estado, contáctanos en {contacto} para resolverlo.

9. Facturación
Puedes solicitar tu factura (CFDI) con el enlace de tu ticket.

10. Autoridad y ley aplicable
La autoridad en materia de consumo es la Procuraduría Federal del Consumidor (Profeco). Estos términos se rigen por las leyes de México, en particular la Ley Federal de Protección al Consumidor.

Última actualización: {fecha}`;

export const legalTemplate = (kind, fields) => fill(kind === 'terms' ? TERMS : PRIVACY, fields);
