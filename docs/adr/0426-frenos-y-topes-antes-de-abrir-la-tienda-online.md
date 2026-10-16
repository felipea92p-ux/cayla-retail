# ADR-0426 — Antes de abrir la tienda online a cualquiera: frenos, topes y plazos que se cumplen solos

- **Fecha:** 2026-10-15 · **Estado:** aceptado (Felipe aprobó D1 a D10 y la lista de trabajo B1–B5, C1 y C2). Las migraciones ya están
  en producción (pegadas el 15-oct con su OK); la web y la tienda de este PR entran al fusionar.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0166 (Apartados), ADR-0288 (el cartel del Club), ADR-0414 (aplazar y abonar),
  ADR-0008 (padrón DNI/RUC).

## El problema

Hasta ahora la tienda online y el cartel del Club los usaba poca gente, y lo que no tenía regla lo resolvía una persona en la tienda:
un pedido que nadie pagaba lo anulaba alguien a mano, un apartado con S/ 1 se aceptaba porque la encargada conocía a la clienta, lo
vencido se liberaba cuando alguien abría la pantalla. Con cuentas abiertas a cualquiera, cada una de esas cosas pasa a escala y sin
nadie mirando: prendas guardadas semanas por pedidos que nunca se pagan, una sola cuenta que separa toda una talla, datos de una ficha
cambiados por quien solo conoce el documento. El principio 2 dice que eso se corrige en la base, no con la buena voluntad de la tienda.

## Decisiones (Felipe, 2026-10-15)

| | Decisión | Dónde vive |
|---|---|---|
| D1 | Un apartado deja **al menos el 30 %** del total (hacia arriba al céntimo); si se suman prendas, lo pagado sigue siendo el 30 % o se pide un abono antes | `separar_prendas`, `editar_separacion` (20261016003000); el formulario lo dice antes de guardar (`erroresDelApartado`) |
| D2 | Por persona: **3 apartados abiertos** y **2 de una misma prenda y talla**, en todas las tiendas y sin excepción para el líder. En la tienda online, lo mismo: 3 separaciones abiertas (por confirmar, confirmadas y pagadas sin recoger) y 2 de una prenda | `fn_separaciones_abiertas_de` (ficha, DNI o celular), `tienda_separar` (20261016001000) |
| D3 | El plazo de un apartado sigue como está (7 días y sus extensiones, ADR-0414) | sin cambio |
| D4 | Cada madrugada se libera solo lo vencido (con 2 días de gracia) en todas las tiendas, también los apartados simples de Existencias; no los pedidos entre tiendas ni los pedidos web | `fn_vencer_apartados_de_todas`, `/api/apartados/vencer` |
| D5 | (reemplazada por la opción A de B2) | — |
| D6 | La consulta de DNI de una página pública usa solo el servicio gratis de SUNAT, nunca el proveedor de pago; y tiene freno por día y por documento | `club_intento` (20261016000000), `consultarPadronPublico`, `lib/padron-servidor.ts` de la tienda |
| D7 | Una cuenta web se une a una ficha que ya existía **solo** si el correo confirmado es el que la ficha ya tenía | `tienda_registrar_cuenta` (20261015230000) |
| D8 | Un pago por Yape, Plin o transferencia de un pedido web lo registra el líder hasta que exista una pasarela que lo confirme sola | `registrar_pago_pedido_web` (20261016001000) |
| D9 | Un pedido web confirmado sin **ningún** pago se anula solo a las horas de «Si no paga» (de fábrica 48) y sus prendas vuelven; uno pagado y sin recoger solo avisa | `fn_anular_pedidos_web_sin_pagar`, el cierre de cada 15 min |
| D10 | Captcha en las puertas públicas, apagado hasta que existan las llaves de Cloudflare Turnstile | **pendiente** (ver abajo) |

Y la opción A de B2: el cartel del Club, que no puede saber si quien escribe es dueña del documento, **no escribe nada** en una ficha que
ya existía (ni datos, ni Club, ni permisos): lo pide en caja, donde ven a la persona (20261015232000).

## Por qué así

- **En la base, no en la pantalla.** Cada tope y cada plazo vive en la función que guarda (o en el barrido que corre solo), con su
  prueba que la rompe a propósito. Las pantallas solo lo dicen antes, con el mismo número. Si mañana otra pantalla aparta, hereda la
  regla sin acordarse.
- **La persona se reconoce por cualquiera de sus tres datos.** Un tope por nombre se esquiva escribiendo otro nombre; por ficha, sin
  ficha. Ficha, DNI o celular: basta que coincida uno. Sin ninguno de los tres no hay con qué cruzar y cuenta solo el apartado de ahora
  (pedir celular o DNI siempre sería otra decisión de negocio, que no se tomó aquí).
- **Lo vencido se libera con la misma regla en los dos caminos.** La pantalla y el barrido diario llaman la misma pieza
  (`fn_vencer_separaciones_de`): no hay dos definiciones de «vencido».
- **Una sola configuración para «si no paga».** Las horas que antes solo avisaban ahora anulan cuando no hay ningún pago; con un pago
  parcial sigue el aviso y decide la tienda (hay dinero de por medio).
- **El catálogo de la tienda se comparte 30 segundos** entre visitas (son datos públicos, iguales para todos): cien clientes abriendo la
  tienda son una consulta, no cien. «Separar» vuelve a mirar precio y stock en la base, así que nunca se separa con un dato viejo.

## Lo que se descartó

- **Tope por tienda en vez de por persona:** una persona separaría 3 en cada tienda. Se pidió «todas las tiendas».
- **Excepción para el líder:** Felipe la descartó: el líder también atiende clientes, y un tope que se salta no es un tope.
- **Anular también lo pagado en parte:** obliga a devolver dinero sin que nadie lo decida. Queda el aviso.
- **Captcha conectado a medias:** una pieza del servidor sin pantalla que la use la rechaza el CI (Knip) y el widget solo se prueba con
  las llaves reales. Se conecta entero el día que existan.

## Lo que falta

- **D10, el captcha:** Felipe crea la cuenta de Cloudflare Turnstile y entrega las dos llaves; entonces se conecta en «Crear mi cuenta»
  (que es la que manda correos y consulta el DNI) y se prueba en el navegador.
- **La política de scripts de la tienda (`script-src`):** las cabeceras de hoy ya impiden que otra página meta la tienda en un marco,
  pero la lista de scripts se escribe recién cuando se pueda probar la tienda entera en el navegador con la pila de clientes.
- Lo demás que quedó por decidir se le entregó a Felipe aparte (no se versiona en este repositorio, que es público).

## Cómo se verifica

`pnpm pruebas:tienda-bolsa` (32), `pnpm pruebas:pedidos-web-cobrar` (16), `pnpm pruebas:separaciones` (101), `pnpm pruebas:tienda-cuentas`,
`pnpm pruebas:club-registro-cartel` (y `pnpm pruebas:sesion-no-es-equipo`, del PR #1122), y las suites que tocan esas funciones (todas en verde contra el
Postgres local con las migraciones aplicadas). En producción, cada función quedó con el md5 de este repositorio.
