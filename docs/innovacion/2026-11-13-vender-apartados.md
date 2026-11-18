# Innovar · Vender ▸ Apartados — 2026-11-13

> **Pasada rápida — sin escéptico, puede traer ideas que no aguantan.** Fue la primera corrida de `/innovar`, hecha para probar la skill.

- **Alcance:** `/vender/apartados` · **Modo:** rápido (sin agentes y sin web; la fuente es el radar)
- **SHA analizado:** `9d3608dce` · **Radar usado:** 2026-11-13 (recién armado)
- **Corrieron:** el coordinador solo, con el radar · sin escéptico
- **Resultado:** 6 propuestas (3 Ahora · 3 Visión) · 3 descartadas · 1 derivada

## Qué es y qué problema resuelve hoy

Un cliente quiere una prenda y no la lleva hoy: deja un adelanto, la prenda queda bloqueada a su nombre por 7 días (`PLAZO_DIAS`,
`lib/separaciones-reglas.ts:16`) y, al volver, paga el saldo y la boleta sale una sola vez por el total (ADR-0166, ADR-0399). Si no vuelve, la
prenda regresa a la tienda y el adelanto se le devuelve. La pantalla tiene tres vistas (Apartar, Entregar y Todos), recordatorios por WhatsApp
con registro de quién avisó y cuándo, aplazar el plazo con historial, y pedidos a otra sede que llegan como traslado.

## Ahora

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| apartados#1 | La constancia lleva un QR con su código; Entregar lo lee con la pistola o la cámara | vendedora | Shopify POS (escanear para recibir y trasladar) | 2 | S | Alta | 2,0 |
| apartados#2 | «¿Va a volver?»: lo que cada cliente hizo con sus apartados anteriores, a la vista al recordar | encargada | Linear (sugerencia con su porqué), Shopify (clienteling) | 3 | M | Media | 1,05 |
| apartados#3 | Una página para el cliente con su apartado: qué prendas, hasta cuándo, cuánto falta y dónde recoger | cliente | Lightspeed (solicitud con estado y vencimiento) | 3 | M | Media | 1,05 |

## Visión

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| apartados#4 | Reservar online para probarse en la sede, sin pagar, por 24 horas | cliente, vendedora | Shopify (retiro en sede), Inditex (reserva de probador) | 4 | L | Media | 0,93 |
| apartados#5 | QR de Yape o Plin con el monto exacto del adelanto o del saldo, conciliado solo | vendedora, Felipe | Proveedores peruanos de QR interoperable | 4 | L | Baja | 0,53 |
| apartados#6 | Cobrar el saldo por un enlace que vence | cliente | Lightspeed («Solicitar pago», vence a los 14 días) | 3 | XL | Media | 0,42 |

## Detalle de cada propuesta

### apartados#1 · La constancia lleva un QR con su código  ·  Ahora · impacto 2 · esfuerzo S · confianza Alta
- **Hoy:** la constancia imprime el código `APT-TRU-0001` en texto y nada más («Todavía sin QR», `components/apartados/piezas.tsx:111`). En
  Entregar, la vendedora escribe el nombre, el DNI o el código en el buscador (`EntregarVista.tsx:188`).
- **Propuesta:** imprimir el código como QR en la constancia con `CodigoQR` (ya existe y lo usa `ReciboTermico.tsx`). El buscador **ya** encuentra
  el apartado por su código (`coincide`, `lib/separaciones-reglas.ts:154`), así que con la pistola funciona sin tocar Entregar. En el celular se
  suma el botón de cámara con `EscanerCamara`, que Apartar ya usa (`ApartarVista.tsx:17`).
- **El momento que mejora:** sábado por la tarde, el cliente llega con su constancia y hay fila. Hoy hay que deletrear el apellido; con el QR, un
  disparo abre su apartado y se evita confundirlo con otro del mismo apellido.
- **Cómo lo hacen los mejores:** Shopify POS recibe y traslada escaneando y muestra el estado al instante (radar, referentes #5;
  [fuente](https://www.shopify.com/blog/retail-roundup-february-2026), mar-2026).
- **DECIDÍ** el QR del código y no uno que lleve los datos del apartado: el código ya es la llave y no expone nada si la constancia se pierde.
  **DESCARTÉ** un código de barras lineal: la cámara del celular lee mejor un QR y la pistola lee los dos. **SE ROMPE SI** el rollo térmico
  imprime el QR muy chico para la pistola: se prueba con la impresora real de una sede antes de cerrar.
- **Primer paso:** el QR en la constancia y una prueba con la pistola en Entregar.

### apartados#2 · «¿Va a volver?»  ·  Ahora · impacto 3 · esfuerzo M · confianza Media
- **Hoy:** «Vencen pronto» ordena por fecha (`TodosVista.tsx:233`) y el recordatorio se manda a todos por igual. La base ya sabe, para cada
  cliente, cuántos apartados recogió y cuántos dejó vencer (`separaciones.estado`), pero no lo muestra.
- **Propuesta:** junto al nombre, en Todos y en el recordatorio, una línea con su historia: «Recogió 4 de 4» o «Dejó vencer 2 de 3». Con menos de
  3 apartados no se dice nada (con tan pocos casos el número engaña; ver `/rigor`, la lente de estadística). Lo calcula una función de solo
  lectura y la regla vive en `lib/separaciones-reglas.ts` con su prueba.
- **El momento que mejora:** la encargada tiene 12 apartados por vencer y 15 minutos. Llama primero a quien suele dejarlos vencer, y a quien
  siempre vuelve le basta el WhatsApp.
- **Cómo lo hacen los mejores:** Linear sugiere y muestra **por qué** al pasar el mouse (radar #40;
  [fuente](https://linear.app/docs/triage-intelligence)); Shopify pone la historia del cliente en la pantalla del POS (radar #16;
  [fuente](https://www.shopify.com/enterprise/blog/omnichannel-pos), 2026).
- **DECIDÍ** mostrar el hecho («dejó vencer 2 de 3»), no un puntaje ni un porcentaje: la vendedora lo entiende sin estadística (ley 4 de
  Formidable). **DESCARTÉ** un modelo que prediga: no hay volumen para eso y no explicaría su porqué. **SE ROMPE SI** se lee como un juicio
  sobre el cliente y alguien le niega un apartado por eso: la línea informa, nunca bloquea, y no sale en nada que el cliente vea.
- **Primer paso:** contar en local cuántos clientes tienen 3 apartados o más; si son muy pocos, la propuesta espera.

### apartados#3 · Una página para el cliente con su apartado  ·  Ahora · impacto 3 · esfuerzo M · confianza Media
- **Hoy:** el cliente solo tiene el papel de la constancia y lo que le diga el WhatsApp.
- **Propuesta:** el WhatsApp de recordatorio lleva un enlace a una página de la tienda online (`apps/tienda`) con las prendas y su foto, hasta
  cuándo, cuánto falta pagar y la dirección y el horario de la sede. Sin cobrar (la pasarela es la visión #6) y sin datos personales en la página.
- **El momento que mejora:** el cliente no encuentra su constancia, o duda si era el martes o el jueves: abre el enlace y lo ve.
- **Cómo lo hacen los mejores:** Lightspeed manda una solicitud con su estado (pendiente, pagada, cancelada) que vence sola (radar #18;
  [fuente](https://retail-support.lightspeedhq.com/hc/en-us/articles/40261399126939-Taking-deposits-for-special-orders-layaways-and-work-orders)).
- ⚠ **Toca lo delicado (permisos):** abre una página pública con datos de un apartado. Va con un enlace imposible de adivinar, que vence al
  cerrarse el apartado, y espera el OK de Felipe.
- **DECIDÍ** que la página viva en `apps/tienda` y no en el ERP: el ERP pide sesión y la tienda ya es pública. **DESCARTÉ** mandar la constancia
  como PDF por WhatsApp: no se actualiza si se aplaza o se abona. **SE ROMPE SI** el enlace se reenvía a otra persona: por eso nunca muestra el
  DNI ni el teléfono, y solo dice lo que ya decía el papel.
- **Primer paso:** la página con datos inventados en local y una captura a 375 px.

### apartados#4 · Reservar online para probarse en la sede  ·  Visión · impacto 4 · esfuerzo L · confianza Media
- **Propuesta:** desde la tienda online, el cliente elige talla y sede y la prenda queda guardada 24 horas sin pagar, como un apartado sin
  adelanto que vence solo. Usa el mismo candado de stock (`apartar_stock`, ADR-0141).
- **Referente:** Shopify gestiona en el POS los pedidos online a retirar y deja que otra sede los prepare (radar #8); Inditex usa la reserva de
  probador (radar #6, ESPERAR por el RFID, pero la reserva no lo necesita).
- ⚠ **Toca lo delicado (stock):** bloquea prendas del piso desde afuera. Antes hay que decidir cuántas puede reservar una persona a la vez.

### apartados#5 · QR de Yape o Plin con el monto exacto  ·  Visión · impacto 4 · esfuerzo L · confianza Baja
- **Propuesta:** al cobrar el adelanto o el saldo, la pantalla muestra un QR con el monto exacto y el pago se concilia solo, sin que la vendedora
  revise el celular de la tienda.
- **Referente:** proveedores peruanos de QR interoperable (radar #28). Confianza Baja: solo hay fuentes secundarias y no coinciden en si la
  interoperabilidad ya funciona para comercios.
- ⚠ **Toca lo delicado (dinero):** integra un medio de pago. Primero, una investigación con fuentes primarias (BCRP y proveedores).

### apartados#6 · Cobrar el saldo por un enlace que vence  ·  Visión · impacto 3 · esfuerzo XL · confianza Media
- **Propuesta:** la página de la #3 suma «Pagar el saldo» y el cliente llega solo a recoger.
- **Referente:** Lightspeed, «Solicitar pago», que vence a los 14 días (radar #18).
- ⚠ **Toca lo delicado (dinero y SUNAT):** necesita una pasarela, que no está integrada (Culqi se investigó y no se integró:
  `docs/investigacion/2026-09-23-tarjeta-pos-y-canal-online.md`). La boleta tendría que salir al cobrar.

## Para otras skills
- `/formidable`: ver si «Aplazar» necesita su confirmación o si alcanza con un «Deshacer» (ley 7). No se midió aquí.

## Descartadas (para que nadie las vuelva a proponer)
| Propuesta | Por qué no |
|---|---|
| Recordatorios por WhatsApp a quien vence pronto | Ya existe, con registro de quién avisó y cuándo (`TodosVista.tsx:560`) |
| Apartar una prenda que está en otra sede | Ya existe: el pedido sale como traslado y llega guardado para el cliente (`ModalesApartado.tsx:1196`) |
| Recordatorio automático con la API de WhatsApp Business | Felipe lo descartó el 2026-09-30 (sin bot, `docs/investigacion/2026-09-30-whatsapp-bot-y-consentimiento.md`) y el motivo empeoró: desde el 1-oct-2026 Meta cobra también los mensajes utility |

## Fuera del alcance, pero urge
- **Next.js 16.4.1 tiene siete avisos de seguridad de severidad media corregidos en la 16.4.5** (2026-11-03, verificado en los avisos de GitHub
  de `vercel/next.js`; radar, stack). Afecta a toda la web y a la tienda, no solo a Apartados.

## Lo que no se miró
- Producción: cuántos apartados vencen sin recogerse (decide si la #2 vale la pena).
- La pantalla en el navegador: esta pasada leyó el código, no la midió.
