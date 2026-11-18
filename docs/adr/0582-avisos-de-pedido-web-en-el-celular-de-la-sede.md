# ADR-0582 — El celular de la sede suena cuando llega un pedido web

- **Fecha:** 2026-10-30 · **Estado:** código, pruebas y verificación local listos en la rama `claude/order-notifications-store-1aae00`.
  **En producción (2026-10-30, con el OK de Felipe):** la migración `20261030150000` se pegó con `apply_migration` del MCP de Supabase y quedó
  registrada como `20261030190324 pedidos_web_push_aparatos`; las claves `ERP_VAPID_PUBLIC_KEY`, `ERP_VAPID_PRIVATE_KEY` y `ERP_VAPID_ASUNTO`
  (`https://retail.cayla.pe`) están en Vercel, proyecto `cayla-retail`, Production. **No cambies esas claves:** cada teléfono queda suscrito
  con la pública, y con otra habría que volver a activar los dos. **Pendiente:** la web (este PR) y la prueba en los dos teléfonos reales
  (un Android y un iPhone 12).
- **Relacionados:** ADR-0461 (los avisos push de la tienda a los clientes: el mismo patrón), ADR-0408 (pedidos web), ADR-0210 (el service
  worker del ERP), ADR-0136 (hojas), ADR-0389 (guías).

## El problema

Un pedido web nuevo solo se ve si alguien abre Tienda web ▸ Pedidos. La sede tiene dos teléfonos con el ERP instalado y Felipe quiere que
suenen cuando un cliente separa en la tienda online, con un aviso que él diseñó y un sonido característico.

## Lo que se decidió

1. **Push web en el ERP, no Telegram ni una app nativa** (Felipe, 2026-10-30). No hay que instalar nada más y no cuesta nada. A cambio, el
   sonido propio solo se puede en Android: un aviso web no trae su sonido (la opción `sound` nunca la implementó ningún navegador), pero en
   Android se elige una vez en Ajustes ▸ Apps ▸ CAYLA ERP ▸ Notificaciones con el archivo que da el ERP. En el iPhone suena el tono de iOS.
2. **El diseño se eligió mirando** (`docs/maquetas/aviso-pedido-web-2026-10/`): texto «A · Directo» —«Pedido web nuevo · W-0018» /
   «Tienda TRU · 1 prenda · S/ 109.00»— y el sonido «Campanita» (`public/sonidos/campanita-cayla.wav`, generado con la misma tabla de notas
   que sonó en la maqueta). Nunca el nombre del cliente ni la prenda: el teléfono está en el mostrador. Android además muestra la foto de la
   primera prenda, «Ver pedido» y «Ver todos», y vibra al ritmo de Campanita; el iPhone no los muestra.
3. **El ERP se instala como app** (`app/manifest.ts`, «CAYLA ERP», ícono rojo distinto del crema de la tienda): sin manifiesto el iPhone no
   entrega avisos. El manifiesto queda fuera de la sesión en `proxy.ts` (el navegador lo pide sin cookies).
4. **Una cola en la base, anotada por un disparador** (`pedidos_web_push_nuevo` en `pedidos_web`), como ADR-0461: una ficha por pedido, en
   la misma transacción. Si no se puede anotar, el pedido nace igual. La ficha guarda solo el pedido: el texto se arma al enviar, porque el
   pedido nace con total 0 y sus prendas llegan después en la misma transacción.
5. **Cada teléfono se cuelga de UNA sede** (`pedidos_web_push_aparatos`) y guarda la CUENTA que lo activó, no el responsable del combo
   (ADR-0162): es una preferencia del teléfono, como el modo oscuro. Activar exige lo mismo que atender un pedido (`fn_pedido_web_exigir`).
6. **El permiso se vuelve a preguntar en cada envío** (`fn_pedidos_web_push_puede`, que se pone un instante en la piel de la cuenta y llama
   a `fn_ve_modulo` y `fn_puede_operar_ubicacion`): a quien le quitan el módulo o la sede, su teléfono deja de sonar solo.
7. **Un cron del ERP cada minuto** (`/api/pedidos-web/avisar`, con `CRON_SECRET`), con claves de envío propias (`ERP_VAPID_*`), separadas
   de las de la tienda. «high» de urgencia: el Android lo entrega aunque esté en reposo.

## Descarté

- **Telegram** (sonido propio en los dos teléfonos): otra app y otro servicio de afuera por donde pasan los pedidos. Felipe eligió el push.
- **Una app nativa:** USD 99 al año de Apple y otro sistema que mantener, para dos teléfonos.
- **Anotar el aviso en cada función que crea pedidos:** el disparador cubre `crear_pedido_web` y cualquiera que venga.
- **Guardar el texto en la cola:** al disparar, el pedido aún no tiene prendas ni total.
- **Revisar el permiso solo al activar:** un teléfono de alguien que ya no atiende la sede seguiría sonando.

## Se rompe si

- **El cron deja de correr:** las fichas de más de dos horas se cierran sin enviar; el pedido igual está en la pantalla.
- **Las claves VAPID cambian:** los teléfonos dejan de recibir hasta que se vuelven a activar.
- **Un teléfono responde mal una vez y el otro bien:** la ficha se da por cumplida (la sede ya se enteró) y el primero no la recibe después.
- **Alguien cambia `auth.uid()` o el modo en que `fn_ve_modulo` lee la sesión:** `fn_pedidos_web_push_puede` deja de ponerse en la piel de
  la cuenta. Lo cubre la prueba D1 de `pnpm pruebas:pedidos-web-push`.
- **Un pedido llega de noche:** el teléfono suena igual (no hay horario de silencio).

## Pruebas

- Base: `pnpm pruebas:pedidos-web-push` (11 escenarios, ROLLBACK), en la lista del CI.
- Web: `lib/push-pedidos-web.test.ts` (14), incluido que `sw.js` maneja el aviso y que sus archivos existen.
- Local, de punta a punta: la ruta responde 401 sin clave y lee la cola con ella; FCM responde 410 a una dirección inventada (se quita);
  la hoja activa, prueba y apaga contra la base local (con el teléfono simulado: el navegador de la app bloquea las notificaciones), en
  escritorio y a 375 px en oscuro; la guía recorre sus 8 pasos.
- **No verificado:** un aviso real en el Android y en el iPhone 12.
