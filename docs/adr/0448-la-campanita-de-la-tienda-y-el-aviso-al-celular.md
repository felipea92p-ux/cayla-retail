# ADR-0448 — La campanita de la tienda y el aviso al celular

- **Fecha:** 2026-10-17 · **Estado:** parcial. La **campanita** (actividades 1 y 2) está construida y verificada, sin migración. El **aviso al
  celular** (actividades 3 a 7) está **propuesto**: Felipe aprobó la dirección («probar de ambas maneras») y falta su OK a tres puntos
  (ver «Lo que falta decidir»). Nada de lo propuesto está construido ni pegado en producción.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0431 (instalar la tienda en el celular), ADR-0288 (el Club: CL-19, CL-20, CL-21, G-5),
  migraciones `20261015024000` (favoritos y esperas), `20261015025000` («Mi cuenta») y `20261015045000` (el aviso al entrar).

## El problema

Un cliente mira la Blusa Emma en negro, talla M, y en Trujillo no hay. Toca «Avísame cuando llegue» y la tienda lo anota. Cuando la talla
llega, hoy se entera **solo si entra** a «Mi perfil» o al Inicio (el aviso al entrar). Nadie lo busca; el aviso espera en una pantalla que
quizá no abra. Lo mismo con lo nuevo: «Llegaron 3 prendas» solo existe dentro de «Mi perfil».

Lo que se pidió: avisar cuando lleguen nuevos ingresos, **dentro de la página del Club** y **al celular**, aunque la página esté cerrada.

## Lo que se midió antes de decidir (producción, solo lectura, 2026-10-17)

- 8 cuentas web, 11 miembros del Club (8 con publicidad), 298 modelos en la vitrina, 4.493 movimientos y **0 «Avísame» vivos**: nadie lo
  ha usado todavía.
- `fn_tienda_novedades` tarda **131 ms** (15.882 lecturas de página) y devuelve los 298 modelos: el catálogo se cargó hace poco y todo es
  «nuevo». Leer la cuenta tarda ~13 ms; `tienda_mis_avisos_del_club`, ~6 ms ya caliente (56 ms la primera vez).
- El ERP ya tiene tareas programadas de 5 y 15 minutos (`apps/web/vercel.json`): el plan de Vercel las permite. Se deduce, no se vio el plan.

## DECISIÓN 1 (construida): la campanita en la cabecera

Un ícono más en la fila de la cabecera de quien tiene cuenta (entre el corazón y la persona; en toda página con cuenta) que abre un panel con
dos cosas: **«Las tallas que esperabas» que ya llegaron** (cada una lleva a su ficha) y **«Lo nuevo» desde la última vez que miró**
(lleva a Lo nuevo). Su globo suma las tallas sin ver y las prendas nuevas.

- **Qué lee.** Las tallas, de `tienda_mis_avisos_del_club` (la misma lectura del aviso al entrar: ahora `leerAvisosDelClub` va en `cache` de
  React y las dos piezas comparten una sola por petición; devuelve también `producto_id`, que ya traía la base, para llevar a la ficha).
  Lo nuevo, del **catálogo que la página ya leyó**: cada prenda trae `nuevo.dias` (hace cuántos días llegó, la regla única de
  `fn_tienda_lo_nuevo`). **Cero consultas nuevas y cero migraciones.**
- **«Desde tu última visita» es un DÍA, en una cookie de este aparato** (`tienda-campanita-<8 letras del usuario>`, 400 días, solo la fecha
  de Lima). Una prenda se cuenta cuando llegó después de ese día (`dias < hoy − visto`). La base no guarda qué leyó la gente (decidido en
  `20261015045000`). Al abrir el panel se anota hoy y lo nuevo baja del globo; las tallas **siguen contando** hasta que se separen, se
  quite el aviso o se cierren con «Entendido» en el Inicio: son una cosa que hacer, no una noticia.
- **La primera vez en un aparato no hay número.** Sin un día anterior no se sabe qué es nuevo *para ella* y el primer globo diría «298».
  Se anota la mirada al montarse (sin abrir nada) y lo que llegue desde mañana sí cuenta. Vacía, el panel explica el botón («¿Una talla
  agotada? Toca «Avísame»…»), que hoy nadie usa.
- **Si algo falla:** la base sin responder deja la campanita sin tallas (las novedades no la necesitan); sin sesión legible no se dibuja y la
  cabecera queda como estaba. Llega por detrás (`Suspense`) y mientras tanto ocupa su lugar apagada (`CampanitaApagada`), para que la persona
  y la bolsa no se corran. A 375 px la fila de la cabecera cabe (los íconos terminan en 370 px).
- **Piezas:** `lib/campanita.ts` (+ prueba de 21 casos), `components/campanita/` (`Campanita.tsx` de servidor, `BotonCampanita.tsx` del
  navegador, `CampanitaApagada.tsx`), `app/estilos/campanita.css`. Clases con prefijo `t-avisos`: `t-campana` ya existía (la tarjeta de
  campaña de la portada) y se pisaban.

DECIDÍ: contar lo nuevo en el catálogo que la página ya leyó, con un día de Lima en una cookie del aparato.
DESCARTÉ: llamar a `fn_tienda_novedades` en cada página (131 ms contra ~13 ms de leer la cuenta, en cada navegación de cada miembro) y
guardar «última visita» en la base (`tienda_mi_club` ya lo hace, pero escribe en cada llamada y movería la visita de «Mi perfil»).
SE ROMPE SI: una prenda llega a las 3 de la tarde y la persona miró la campanita a las 9 de la mañana de ese mismo día: no se cuenta hasta
mañana (se prefiere contar de menos a anunciar algo que ya vio); o dos personas comparten un celular y una cierra la sesión de la otra
(la cookie lleva dueño, no se pisan).

## DECISIÓN 2 (propuesta, no construida): aviso al celular de «llegó tu talla»

Solo lo que la persona **pidió** con «Avísame» (CL-19: «Llegó tu talla» sale sin el «SÍ» general de publicidad si ella pidió esa talla, con
texto fijo y sin promoción; no cuenta para el tope de CL-21). **No es publicidad** y por eso no toca `club_permisos`.

- **Cómo avisa un navegador sin app:** *Web Push* (un servicio del navegador manda el aviso aunque la página esté cerrada). Funciona en
  Android con Chrome y en iPhone **solo con la tienda instalada en la pantalla de inicio** (iOS 16.4 o más: por eso importa ADR-0431). No hay
  app de tienda ni costo por aviso.
- **Datos (migración nueva, a pegar en producción con el OK de Felipe, una parte, tablas nuevas sin políticas):**
  - `retail.push_suscripciones`: un aparato por fila (cuenta web, dirección del navegador única, claves, creada, desactivada y motivo). Nunca se
    borra: un aparato muerto (404/410 del servicio) se marca desactivado. Tope de aparatos por cuenta.
  - `retail.push_envios`: historial append-only, **único por espera y aparato**: el mismo aviso no sale dos veces al mismo celular.
  - Funciones `retail.tienda_push_*` (suscribir, quitar, estado) con el mismo molde de `tienda_*` (`security definer`, cerradas a
    `public`/`anon`/`authenticated`); y las del trabajo programado (qué espera avisar, registrar el envío, desactivar un aparato), que usan
    **la misma regla de «hay» que la ficha** (`fn_tienda_disponible`), sin copiarla.
- **El flujo:** un trabajo programado cada 15 minutos (`/api/avisos-push`, con `CRON_SECRET`, `lib/cron.ts`) pide a la base las esperas que
  llegaron y no se avisaron, manda el aviso firmado y anota el envío. «Llegó» sigue sin guardarse (se descartó en `20261015024000`): se
  recalcula en cada vuelta.
- **Todo-o-nada (Gray):** el envío se anota **después** de que el servicio de avisos lo aceptó (2xx), no antes. Si el servicio no
  responde, no se anota y la próxima vuelta lo reintenta; si dos vueltas se cruzan, el índice único y la etiqueta del aviso (`tag`) hacen
  que el celular lo muestre una sola vez. **Se degrada así:** sin push, la campanita igual muestra la talla; el aviso nunca es la única
  fuente (principio 9).
- **El celular:** `public/sw.js` suma `push` y `notificationclick` (abre la ficha); hoy se registra solo en Android y habría que
  registrarlo también en iPhone instalado: **enmienda ADR-0431**. El botón «Activar avisos» se ofrece justo después de «Avísame» y en «Mi
  perfil»; el permiso del celular se pide solo al tocarlo, nunca al entrar. En iPhone sin instalar, lleva a la guía de instalar.
- **El aviso:** texto fijo, sin promoción: «Llegó tu talla M · Blusa Emma — hay en Trujillo». Un solo aviso por «Avísame» (si se vuelve a
  acabar y a llegar, no suena otra vez: se vuelve a pedir).
- **Dependencia nueva:** `web-push` (firma los avisos). **Variables nuevas** en Vercel: las claves VAPID (pública y privada) y un contacto.

DECIDÍ: avisar al celular solo lo que la persona pidió y marcarlo enviado después del 2xx.
DESCARTÉ: marcarlo antes de enviar (si el servicio no responde, la persona no se entera y la base cree que sí) y guardar «llegó» en la base
(envejece apenas alguien vende).
SE ROMPE SI: el trabajo programado usa otra regla de «hay» que la ficha (el aviso diría «llegó» y la ficha mostraría agotado: la migración
`20261015024000` cuenta que ya pasó una vez); o el aviso se manda aunque la prenda ya se separó (la espera se cierra al separar y el trabajo
mira solo las vivas).

## Lo que NO entra: novedades generales por celular

«Llegó algo nuevo» a todo el que lo active **sí es publicidad** (Ley 32323: solo a quien la pide por iniciativa propia; el esquema lo
impone con un check en `club_permisos`). Pide, además: un permiso propio registrado (`publicidad_push`), que cuente en el **mismo tope de
2 al mes** que el WhatsApp (CL-21) y pase por el grupo testigo (CL-20), que la BAJA por WhatsApp apague también el celular (si no, quien dijo
BAJA sigue recibiendo), un texto de privacidad nuevo (hoy promete solo WhatsApp) y la revisión de un abogado (CL-34, abierta). **Queda
fuera hasta que Felipe lo decida.**

## Lo que falta decidir (Felipe)

1. La dependencia `web-push` y las 3 variables de Vercel (las claves las genera la sesión; las pega quien administre Vercel).
2. Si se actualiza el texto de privacidad del Club (hoy promete solo WhatsApp) para nombrar el aviso al celular de lo que pidió.
3. La enmienda a ADR-0431 (registrar el service worker también en iPhone instalado).

## Qué se verificó

- En la tienda: 548 pruebas, `tsc` y `eslint` limpios; `pnpm knip` y `pnpm knip:produccion` sin hallazgos nuevos.
- En un banco de prueba temporal (borrado), en el navegador, con la cabecera real: escritorio 1280 px (panel de 360 px alineado al ícono,
  dentro de la ventana) y 375 px (panel de 355 px, la fila no se desborda); modo claro y oscuro; el estado con tallas, vacío, con 6 tallas
  (cuatro nombradas y «Y llegaron 2 más»); globo que baja al abrir; la cookie del día se escribe al abrir y al montarse la primera vez;
  Escape cierra y devuelve el foco al botón; tocar fuera cierra.
- **Con una sesión real, en local, con la tienda compilada para producción (2026-10-17).** Se levantó la pila de clientes
  (README, «Levantarla en local»), se creó una cuenta de prueba, una miembro del Club, dos prendas publicadas y seis «Avísame» (todo con
  una foto de `scripts/flujo-de-negocio/estado.mjs`, restaurada al final: la base volvió idéntica; la pila se apagó con sus datos).
  Se vio: la campanita sale sola en una carga completa (~250 ms) y al navegar dentro de la tienda, también en «Mi perfil»; las tallas que
  llegaron salen con su enlace a la ficha (`/catalogo/<producto_id>`, que abre al tocarlas) y con su punto si no se vieron; «Entendido» del
  Inicio baja el globo y la talla sigue en el panel sin punto; con una cookie vieja (20-sep) cuenta 2 novedades, al abrir las deja en 0 y
  anota hoy; con 6 esperas nombra 4 (las sin ver primero) y dice «Y llegaron 2 más» con un enlace a «Mi perfil»; a 375 px la fila no se
  desborda y el panel mide 355 px; un visitante sin sesión no recibe el botón (y el esqueleto ya no le dibuja la campanita apagada: sale solo
  con la cookie de sesión, `ElegirPorCookie`).
- Dos cosas que parecían fallos y no lo eran: el aviso de Next sobre `Date.now()` en `/inicio` sale igual **sin** la campanita (viene de la
  lectura de sesión que ya existía), y en el navegador integrado de Claude lo que llega por detrás no se revela hasta que se pinta un cuadro
  (las transiciones de vista de la tienda, `components/Vistas.tsx`, esperan un cuadro): hasta que alguien tocaba o se sacaba una captura, la
  campanita parecía atascada apagada. En un navegador normal no pasa.

## Lo que NO se verificó

- **La campanita en la publicación de Vercel y en un celular de verdad.** La tienda no tiene publicación de prueba (ADR-0408: sus variables
  están solo en Producción, y `scripts/ci/vercel-ignorar-tienda.mjs` no construye nada que no sea producción; Vercel lo mostró en el PR #1180
  como «1 Skipped Deployment»), así que la primera vez que la ve el mundo real es justo después de fusionar: ahí hay que mirarla con una
  cuenta que tenga un «Avísame» ya llegado, en un Android y un iPhone. Fusionar publica: la campanita llega a todos los miembros con sesión.
- Nada del aviso al celular (no está construido) y, cuando se construya, **un Android y un iPhone reales**: es la única prueba que no se
  puede hacer en el escritorio.
- Que la campanita se use: hoy no hay un solo «Avísame» vivo.

## Qué se rompería sin esto

Sin la campanita, la persona que esperaba una talla se entera solo si abre «Mi perfil»; con el aviso al celular sin el índice único, un
trabajo que se cruza consigo mismo la despertaría dos veces por la misma prenda; y sin que la BAJA apague todos los canales, quien pidió no
recibir publicidad la seguiría recibiendo por el que no se acordó nadie.
