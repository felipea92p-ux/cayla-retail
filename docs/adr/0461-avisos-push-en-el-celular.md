# ADR-0461 — Avisos push en el celular: una cola en la base, un cron cada minuto y el permiso con un toque

- **Fecha:** 2026-10-20 · **Estado:** código, pruebas de base y build listos en la rama `claude/tienda-push-notificaciones`. **Pendiente:** las dos migraciones (`20261020145000`, `20261020150000`) no están en producción; las claves VAPID no están en Vercel; la pantalla no se verificó en el navegador (las rutas con sesión se quedaban colgadas en local, ver «Lo que falta»).
- **Relacionados:** ADR-0460 (historial de notificaciones en la base), ADR-0431 (la tienda como app instalable y su service worker), ADR-0408 («Avísame» y las esperas), ADR-0450 (la tienda no cae si la base no responde).

## El problema

Las notificaciones de la tienda solo se ven si la persona abre la app. Felipe quiere que lleguen al celular cuando la app está instalada: una talla que esperaba ya está disponible, o cambia su pedido web (pagado, vencido, anulado). Hoy nada sale de la base hacia afuera: el aviso se arma cuando alguien lee la campanita.

## Lo que se decidió

1. **Cada aviso se anota en una cola en la misma transacción del cambio** (`retail.tienda_push_envios`, una fila por cuenta y clave). Un talla que pasa de 0 a disponible, o un pedido que pasa a pagado, vencido o anulado, escribe su aviso dentro de la misma operación. Si el aviso no se puede anotar, el disparador lo registra como advertencia y la operación sigue: una venta nunca se bloquea por un aviso.
2. **Un disparador en la tabla, no en cada función.** Los pedidos y el stock cambian desde muchas funciones (pagar, anular, vencer, recibir). Dos disparadores (`tienda_push_talla` sobre `stock`, `tienda_push_pedido` sobre `pedidos_web`) capturan todos esos caminos sin tocar ninguno. El stock es una fila por sububicación, así que hay dos disparadores: uno para la fila nueva (un insert) y otro para la que pasa de cero (un update).
3. **Un cron de Vercel cada minuto** (`/api/push-enviar`, protegido con `CRON_SECRET` como `cuentas-cerradas`) toma un lote de la cola, lo manda a cada aparato con `web-push` y marca como enviado lo que llegó a alguno. Un aparato que responde 404 o 410 se quita; un fallo pasajero deja el aviso para la vuelta siguiente, hasta 5 intentos. El plan de Vercel del equipo es Pro, así que el cron de cada minuto está permitido.
4. **El permiso se pide con un toque** («Avísame en el celular», en la pantalla de notificaciones). iPhone no deja pedirlo de otra forma, y Chrome penaliza pedirlo solo. En iPhone, si la app no está instalada en la pantalla de inicio, el botón no pide nada y explica cómo agregarla.
5. **El texto es genérico.** «Llegó una talla que esperabas» y «Tu pedido está pagado»: sin nombre de prenda, talla ni monto. Lo que el teléfono muestra en la pantalla bloqueada no revela una compra. El enlace solo dice a qué pantalla ir.

## Descarté

- **Comparar la base cada minuto para ver qué cambió.** Pierde eventos si el trabajo falla justo en el cambio, y lee todas las cuentas en cada vuelta. La cola no pierde nada: lo que no se envió sigue ahí.
- **Tocar cada función de pedidos del ERP para anotar el aviso.** Son más de veinte funciones que cambian pedidos; cualquier función nueva se olvidaría. El disparador en la tabla cubre todas.
- **Supabase `pg_cron` como disparador.** Vercel ya ejecuta el cron de cuentas cerradas y el plan permite un minuto. Un segundo lugar que programe trabajos sería otra pieza que mantener.
- **Un aviso con el nombre de la prenda.** Es más útil de un vistazo, pero lo ve cualquiera que mire el teléfono. Felipe lo eligió genérico.

## Se rompe si

- **El cron deja de correr más de dos horas:** los avisos de más de dos horas se cierran sin enviar (la propia función lo hace), para que al volver no salga de golpe una cola vieja. Lo que se perdió en esas dos horas no llega después.
- **Una talla pasa de cero a disponible varias veces en la misma transacción:** la clave del aviso lleva el instante del cambio, así que dos cambios en el mismo instante dan un solo aviso. Es lo que se quiere (una sola llamada), pero no se vuelve a avisar hasta el siguiente cambio.
- **Se pegan las migraciones antes de que exista la ruta de envío:** la cola se llena y, si la ruta tarda en llegar, las entradas de más de dos horas se cierran sin enviar. No se manda nada viejo, pero las notificaciones de esas horas no llegan.
- **Las claves VAPID cambian:** los aparatos suscritos con la clave anterior dejan de recibir avisos hasta que vuelven a activarlos. Por eso la clave privada va solo a Vercel, y la pública se pasa desde el servidor.
- **El disparador de stock cuesta mucho en un alta masiva de stock:** el disparador tiene un `WHEN` que lo filtra antes de entrar (solo 0 → positivo), pero no se midió el costo en una carga grande.

## Lo que falta antes de publicar

- Pegar las dos migraciones en producción. Conviene hacerlo al fusionar la rama, para que la cola y la ruta de envío arranquen juntas.
- Poner en Vercel (proyecto de la tienda, entorno Production): `TIENDA_VAPID_PUBLIC_KEY`, `TIENDA_VAPID_PRIVATE_KEY` y `TIENDA_VAPID_ASUNTO` (un `mailto:` de contacto). La clave pública también debe estar en el build, porque la página la lee al compilar.
- Verificar la pantalla en el navegador: las rutas con sesión (Inicio, Mis pedidos, Notificaciones) se quedaban en «Cargando…» tanto en desarrollo como en producción local. No se encontró la causa dentro de esta rama, y el cambio no toca la lectura de la sesión.
- Probar un aviso de punta a punta en un iPhone real con la app instalada. El navegador de escritorio no prueba iOS.

## Pruebas

- `lib/push.test.ts` (13 pruebas): validación de la suscripción, enlaces internos, cortes de texto, decisión ante 201, 404, 410 y fallos, y la conversión de la clave pública.
- Base (en una transacción con `ROLLBACK`, contra la base local del ERP): una talla que llega por `insert` genera un aviso; un pedido que pasa a vencido genera un aviso con texto genérico; el trabajo reclama los avisos con sus aparatos, los marca como enviados y quita un aparato muerto. El camino de `update` del stock no se pudo separar en la prueba (la clave es igual dentro de una misma transacción): **no verificado**; queda como prueba pendiente.
- La suite de la tienda pasa (735 pruebas), con tipos, lint sin errores y `knip` limpio. `pnpm --filter tienda build` compila, incluidas `/api/push-enviar` y `/notificaciones`.
- La ruta responde 401 sin la clave del cron. El camino autorizado no se corrió de punta a punta en local.
