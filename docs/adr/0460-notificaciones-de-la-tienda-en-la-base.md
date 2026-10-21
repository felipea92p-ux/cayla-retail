# ADR-0460 — Las notificaciones de la tienda viven en la base, por cuenta

- **Fecha:** 2026-10-20 · **Estado:** código y pruebas listos en el PR #1212; **las tres migraciones (`20261020002000`, `20261020003000`, `20261020004000`) están pegadas en producción desde el 2026-10-20** con el OK de Felipe; falta fusionar el PR para publicar la web.
- **Relacionados:** ADR-0408 (la campanita y los avisos de la tienda online), ADR-0448 (la campanita avisa de la talla que llegó), ADR-0381 (las migraciones se reservan al empezar).

## El problema

La campanita solo sabía lo que estaba a favor **hoy**: una talla que llegó, una respuesta reciente. Todo lo demás vivía en cookies de este aparato. Eso dejaba tres huecos: una talla que se volvía a acabar desaparecía sin dejar rastro; nada guardaba **cuándo** le llegó el aviso a la clienta (y el panel tenía que ordenarse por esa hora); y una notificación borrada en un celular reaparecía en la computadora. Felipe pidió: el panel con las 5 más recientes por hora de recepción, una pantalla «Todas las notificaciones» con búsqueda, paginado y borrado, y que la «×» del panel solo saque la notificación de la bandeja, sin borrarla.

## Lo que se decidió

1. **Una fila por cuenta y por aviso** en `retail.avisos_tienda` (llave: cuenta + clave), con el texto tal como se vio, `recibido_en` (la hora en que la cuenta lo recibió) y dos marcas: `borrado_en` (la persona lo borró) y `quitada_de_bandeja_en` (lo quitó del panel). La tienda la escribe solo a través de funciones `tienda_avisos_*`, con RLS encendido y sin políticas: nadie toca la tabla por fuera de ellas.
2. **Tres salidas distintas, tres significados.** «Borrar» marca `borrado_en`: sale de todas partes y no vuelve. La «×» del panel marca `quitada_de_bandeja_en`: sale del panel y sigue en «Todas las notificaciones». «Vaciar bandeja» guarda una fecha en `retail.avisos_bandeja` y el panel muestra solo lo que llegó después: no toca ninguna fila, y lo que llegue después vuelve a salir.
3. **Dos estados de lectura, en cookies de este aparato.** «Entendido» (abrir el panel) oculta el globo rojo, pero no quita el punto ni resta del número. «Leído» (clic en la notificación) quita el punto y resta 1. Se quedan en cookies porque son de quien mira, no de la cuenta.
4. **Lo que la base no contesta no rompe la campanita.** Si la lectura falla, la campanita se dibuja sin historial; si falla la escritura, el aviso se intenta guardar de nuevo al abrir la página siguiente.
5. **La vista en vivo** (`/api/avisos-club`) lista solo la bandeja y compara contra las claves que la pantalla ya conoce: un aviso nuevo se anuncia de inmediato.

## Descarté

- **Guardar el historial solo en cookies.** La hora de llegada no sobrevive a cambiar de aparato, y una cookie no puede marcar un borrado que valga en otro navegador. Las cookies ya no son la fuente de verdad: solo guardan lo que mira cada aparato.
- **Borrar la fila al presionar la «×».** Felipe lo pidió explícitamente distinto: la «×» quita del panel, no de la historia. Borrar física o lógicamente lo mismo habría hecho desaparecer la notificación de «Todas las notificaciones».
- **Una tabla de notificaciones global para todas las cuentas.** Obligaría a filtrar por cuenta en cada consulta y a recordar la regla de privacidad en cada función. Una fila por cuenta con RLS y funciones de dueño deja la regla en un solo lugar.

## Lo que se conserva

- **Las cookies de la campanita** (`tienda-aviso-` para «Leído», `tienda-panel-visto-` para «Entendido»): siguen siendo de este aparato, como antes.
- **El aviso al entrar:** sigue leyendo lo que la persona tiene a su favor en el Club (`retail.tienda_mis_avisos_del_club`), sin cambios; el historial no lo reemplaza.

## Se rompe si

- **Dos aparatos de la misma cuenta:** «Entendido» y «Leído» son de cada aparato, así que el globo puede seguir encendido en la computadora aunque en el celular ya se haya abierto el panel. Es lo esperado mientras esas dos marcas sean cookies; si Felipe quiere que sean de la cuenta, es un cambio de diseño aparte.
- **La base cae justo cuando llega un aviso:** el aviso sigue saliendo en vivo, pero no queda en el historial hasta la siguiente lectura que sí logre escribir.
- **Se publican las migraciones con otro número:** `apply_migration` registra la versión con la hora de aplicación, no con el número del archivo. Las versiones en producción son distintas a las de `supabase/migrations/`; cualquier herramienta que compare por nombre de archivo lo verá como diferencia.

## Pruebas

`lib/campanita.test.ts` (panel, «Entendido», «Leído», globo y aviso en vivo), `lib/cookies-avisos-sobrantes.test.ts` (limpieza de cookies de tallas que se volvieron a acabar), `lib/pedidos.test.ts` (fecha del paso «Anulado»). La suite de la tienda pasa en local (722 pruebas, tipos y lint). Verificado en el navegador local: la «×» pasa el panel de 4 a 3 y «Todas las notificaciones» conserva las 4; la campanita está en la cabecera y el panel muestra «Tus notificaciones», «Vaciar bandeja», «Ver todas las notificaciones» y «Lo nuevo». No probado: el paginado de `/notificaciones` con muchos avisos y las pruebas de base de la tienda (`pnpm pruebas:*`).
