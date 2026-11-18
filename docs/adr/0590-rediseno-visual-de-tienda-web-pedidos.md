# ADR-0590 — Tienda web ▸ Pedidos: rediseño visual, un solo WhatsApp y «cómo se consigue» una prenda

- **Fecha:** 2026-10-31 · **Estado:** código, pruebas y verificación local listos en la rama `claude/redesign-orders-module-8b2733`.
  **La migración `20261031170000` NO está en producción** (se pega con el OK de Felipe).
- **Relacionados:** ADR-0408 y ADR-0430 (la tienda online y su módulo), ADR-0358 (una función, una pieza), ADR-0284 (guía de foco),
  ADR-0389 (guías interactivas), ADR-0136 (movimiento). Maqueta aprobada por Felipe: `docs/maquetas/pedidos-redisenio-2026-10/`.

## El problema

Pedidos web se leía como una pantalla de tablas: tres botones pesados en la cabecera, el camino escondido en un día tranquilo, una lista
corrida donde lo urgente y lo que solo espera se veían igual, cerrados que crecían sin forma de encontrar uno, una hoja del pedido larga y de
una columna con **tres botones de WhatsApp** distintos (la tarjeta del cliente, los avisos y el pie), y textos de tres y cuatro frases. Faltaba
también lo que la tienda hacía de palabra: nadie le decía a quien entrega que avise al cliente que su código está en «Mis pedidos», ni que
coordine antes de elegir qué hacer con una prenda que no hay.

## Lo que se decidió (Felipe, 2026-10-31, mirando la maqueta)

1. **Un solo WhatsApp por hoja:** el de la tarjeta del cliente, en verde (token `camino-whatsapp`), y su texto dice para qué es («Pedirle el pago»,
   «Avisarle que ya puede recoger»…). Regla pura `whatsappDeLaHoja`. Donde no hay un mensaje propio del paso se abre el predeterminado de la persona.
2. **La hoja en dos columnas con su ruta** (Confirmar → Cobrar → Entregar; `RutaDelPedido`): el título lleva solo el estado, corto y en versalitas,
   y el tiempo que le queda va en la ruta, como píldora aparte. Un pedido cerrado dice cómo terminó en una línea.
3. **El camino siempre a la vista; «Lo que te toca» en tramos** (Urgente, Pide tu atención, En plazo, Esperan una prenda; `gruposDeLaLista`), con
   una franja del color del plazo en cada fila. El orden no cambia. **Cerrados:** los motivos filtran y hay buscador (`filtrarCerrados`).
4. **Una prenda que no hay** ofrece pedirla a otra sede, comprarla o pedirla al taller, y antes dice «Coordina antes de elegir…». Comprarla y
   pedirla al taller se guardan (`pedido_web_lineas.conseguir_via`) y la hoja dice «Por comprar» o «En taller». Pedirla a otra sede sigue como
   siempre (reserva allá y traslado).
5. **Entrega:** el código en 4 casillas y, encima, los pasos «Para entregarlo» (avisar, decir que está en «Mis pedidos», pedir el código).
6. **Mensajes de WhatsApp** con emojis y botones para insertar Nombre, Tienda, Código y emojis. Textos más cortos en toda la pantalla.

## Lo que NO cambia

Plazos, estados, permisos, responsable, caja, boleta y SUNAT; lo que guarda cada acción; el orden de la lista. Los textos de WhatsApp sí cambian
(los ve el cliente).

## Piezas que se apartan de «una función, una pieza» y quedan para `/unificar`

Las 4 casillas del código (`CodigoEnCasillas`, marcada con `unificar-fijo`), la ruta del pedido, la píldora de opciones de la prenda sin stock
(`PILDORA_ELIGE`), la etiqueta del título en versalitas dentro de la hoja y la franja de color de la fila. Felipe las eligió mirando la maqueta;
si se quieren como piezas del sistema, se decide con `/unificar`.

## La migración

`20261031170000_pedidos_web_conseguir_via.sql`: una columna con CHECK y cuatro reemplazos anclados en `confirmar_pedido_web` y `fn_pedido_web`
(si el texto vivo no es el esperado, aborta sin aplicar nada). Una decisión sin `via` sigue valiendo. `lib/pedidos-web-conseguir-via.test.ts`
comprueba cada ancla contra el texto del repo; **no se corrió contra Postgres** (el CI de «Pruebas de RPC» es el juez). Antes de pegarla en
producción: confirmar con Felipe, pegarla entera (una sola parte) y refrescar el diccionario (`docs/datos/`) con la columna nueva.

## Pendiente (no se hizo en esta ronda)

- Pegar la migración en producción y refrescar el diccionario.
- `/chaos` de las hojas que guardan (necesita la base local) y `/formidable` con lectores ciegos.
- `pnpm --filter web guias:recorrer` (necesita sesión y base) y `tema:auditar`: se verificó a mano en claro, oscuro y 375 px con datos inventados.
- Que `pedidos-web-reglas.ts` (1.400 líneas) se parta si sigue creciendo.
