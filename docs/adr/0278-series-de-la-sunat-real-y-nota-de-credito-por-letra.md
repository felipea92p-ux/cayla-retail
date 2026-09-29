# ADR-0278 — Las series de la SUNAT real, y una nota de crédito por letra

**Fecha:** 2026-09-29 · **Estado:** propuesto por Felipe (series y nombres dictados por él en el chat del 2026-09-29) y **construido, probado en local, SIN pegar en producción** — los dos SQL los pega Felipe (ver «Salida a producción») · Relacionado: ADR-0165 (envío automático y series), ADR-0015 (el comprobante guarda su ambiente), ADR-0016 (anulación), ADR-0009 (Lucode).

## Contexto

Felipe quiere que el ERP de producción deje de transmitir al sandbox de Lucode y pase a la SUNAT real, y que los correlativos de producción queden limpios. Lo que había en producción el 2026-09-29 (leído con un `select`, no de la memoria):

| | SUNAT real (panel de Lucode, ambiente PROD) | Base de CAYLA |
|---|---|---|
| Boleta `B004` (Trujillo) | usados 1, 2 y 3 (el 3 anulado) | `B004-2` y `B004-3` (producción) y `B004-33` (**sandbox**, de hoy); el contador estaba en 34 |
| Boleta `B005` (Arequipa) | nada | contador en 2 |
| Facturas `F004`, `F005` | nada | contador en 1, sin uso |
| Notas de crédito `NC01`, `NC02` | nada | contador en 1, sin uso |
| Notas de venta `NV01`–`NV03` | no son de SUNAT | no se tocan |

Tres hechos mandan la decisión:

1. **`B004` no puede seguir desde el 4.** El sandbox gastó los números 4 a 33 de la misma serie y `B004-33` existe en `comprobantes`. La base tiene `unique (tipo, serie, numero)` y `registrar_serie_comprobante` no deja bajar el contador por debajo de un número ya emitido. Para «arrancar desde el 4» habría que borrar un comprobante, y aquí los comprobantes no se borran. Seguir en el 34 dejaba un hueco 4–33 en la SUNAT real.
2. **`NC01` y `NC02` no sirven ante SUNAT.** La serie de una nota de crédito lleva la letra del documento que corrige (RS 117-2017, Anexo N.° 3): B… si corrige una boleta, F… si corrige una factura. Empiezan con N. Entraron a producción porque solo la pantalla comprobaba el formato: la base aceptaba cualquier nombre.
3. **Una tienda necesita las dos notas.** Felipe: «BC01 para boletas y FC01 para facturas». `20260922234100_series_archivar.sql` lo dejó anotado como pendiente creyendo que había que cambiar la firma de `emitir_nota` y `aprobar_devolucion`. No hace falta: `emitir_nota` ya tiene el comprobante original en la mano y sabe si es boleta o factura.

## Decisión

**1. Series nuevas, desde el 1** (Trujillo 1, Arequipa 2, Lima 3; Felipe):

| Tipo | Trujillo | Arequipa | Lima |
|---|---|---|---|
| Boleta | `B001` | `B002` | `B003` |
| Factura | `F001` | `F002` | `F003` |
| Nota de crédito de boletas | `BC01` | `BC02` | `BC03` |
| Nota de crédito de facturas | `FC01` | `FC02` | `FC03` |

Las series viejas (`B004`, `B005`, `F004`, `F005`, `NC01`, `NC02`) se **archivan**, no se borran: sus comprobantes las nombran. Sin borrar nada, `B004-33` queda como lo que es: una prueba de sandbox que no suma a lo facturado.

**2. Una nota de crédito por letra** (`20260929170000_notas_de_credito_una_serie_por_letra.sql`):

- El índice único parcial pasa de `(ubicacion_id, tipo)` a `(ubicacion_id, tipo, letra)`, donde la letra solo cuenta en las notas. Boleta, factura y nota de venta siguen con UNA serie activa por tienda.
- `fn_reservar_numero_serie` gana un tercer parámetro, la letra (opcional). Se dropea la firma de 2 parámetros para no dejar una sobrecarga ambigua; las llamadas de 2 parámetros (`emitir_comprobante`) siguen sirviendo. Sin permiso para nadie más que su dueño, como antes.
- `emitir_nota` pide la serie de la letra del original (boleta → B, factura → F). Es su único cambio; el cuerpo es el de producción tal cual. `aprobar_devolucion` no se toca.
- `registrar_serie_comprobante` mira la letra en las notas y **ahora rechaza en la base** lo que solo rechazaba la pantalla: cuatro caracteres alfanuméricos y la primera letra que pide cada tipo. La nota de venta queda con nombre libre (no es un documento de SUNAT). Así `NC01` no se vuelve a poder registrar.
- Una nota cuya letra no tiene serie se niega diciendo qué falta y **no gasta un número** de la otra serie.

**3. Dos SQL, en orden, y ninguno lo pega Claude.** El SQL Editor de producción corre como `postgres` sin sesión de app: `fn_es_lider()` da falso y las RPC de series rechazarían todo. Por eso el script de datos (`supabase/migrations/pegar-en-produccion-series-salida-a-produccion-2026-09.sql`, sin timestamp: `db reset` lo ignora) hace el `update`/`insert` directo, todo o nada, idempotente, con comprobaciones al inicio y al final. La auditoría es el archivo mismo (regla de `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`).

## Salida a producción — el orden (importa)

1. **Pegar `20260929170000_notas_de_credito_una_serie_por_letra.sql`** en el SQL Editor (una parte; no cambia datos, se puede pegar sin ventana). Verificación al pie del archivo.
2. **Ventana sin ventas.** Pegar `pegar-en-produccion-series-salida-a-produccion-2026-09.sql`. Termina mostrando las 12 series activas con próximo = 1.
3. **Vercel:** `LUCODE_ENTORNO=produccion` solo en Production, con `LUCODE_TOKEN` el de tu organización en `app.apisunat.pe` (sandbox y producción son plataformas distintas: un token de sandbox responde «Lucode rechazó el token»), y volver a desplegar. Es buen momento para rotar el token (BACKLOG: pasó por el chat el 2026-09-09).
4. **Una venta chica real.** En Comprobantes ▸ Emitidos debe salir «Aceptado» **sin** «· prueba», y en el panel de Lucode debe aparecer como PROD.

Entre 2 y 3 toda venta sigue yendo al sandbox y se comería el número 1 de la serie nueva; por eso no se vende en esa ventana. Y **nunca 3 antes que 2**: una venta saldría a la SUNAT real como `B004-34`.

**Pendiente, decisión de Felipe — la regla del cron.** `cronNoTransmite` (`apps/web/lib/transmision-reglas.ts`) hace que el reintento automático de cada 5 minutos **no transmita nada fuera del sandbox** (responde 200 «omitido»). Fue una guarda a propósito (ADR-0165, «Actualización 2026-09-23»: «salir en vivo es cambiar ESTA regla a propósito»). Con producción activa, sin quitarla, el envío al cobrar y los reintentos desde las pantallas funcionan, pero una caída de Lucode de noche deja la cola quieta hasta que alguien abra Comprobantes. Este PR **no la toca**: cambiarla es un paso propio que Felipe autoriza a propósito, y puede hacerse antes o después de los pasos de arriba.

## Alternativas descartadas

- **Seguir en `B004` desde el 4.** Exigía borrar `B004-33` (comprobante de sandbox) y forzar el contador hacia atrás por fuera de la función que lo prohíbe a propósito. Con serie nueva no se borra ni se fuerza nada.
- **Cambiar la firma de `emitir_nota` y `aprobar_devolucion` para pasar la letra** (lo que anticipaba `20260922234100`). Tocaba dos funciones con otras ramas encima; `emitir_nota` ya sabe el tipo del original, así que el cambio cabe en una línea.
- **Un tipo de serie nuevo por letra** (`nota_credito_factura`). Multiplica los `check (tipo in (...))` de `comprobantes` y de la pantalla por un dato que ya está en el primer carácter de la serie.
- **Solo la nota de boletas (`BC..`) por ahora.** Una devolución de una factura toparía con «no hay serie» el día que ocurra, con la clienta delante.
- **Registrar las series desde la pantalla de Series.** Funciona, pero son 12 altas y 6 archivos a mano; con el script salen todas o ninguna, y la ventana sin ventas es de segundos.

## Consecuencias

- Cada tienda lleva sus dos series de nota. La pantalla Series las lista (ya muestra todas las series de la tienda); el aviso «Sin serie de nota de crédito» sigue mirando solo si hay alguna, no las dos letras: una tienda con solo `BC..` no se avisa de que le falta `FC..` (BACKLOG).
- Un nombre de serie mal escrito ya no llega a producción por ninguna vía que use la RPC.
- El diccionario de datos y `inventario-produccion.json` siguen describiendo el índice viejo hasta que se refresque el volcado después de pegar (`docs/datos/generado/COMO-REFRESCAR.md`).

## Se rompe si

- Se pega el script de datos antes que la migración: se detiene sin cambiar nada y lo dice (comprueba el índice).
- Se cambia `LUCODE_ENTORNO` antes de registrar las series nuevas (ver arriba: sale `B004-34`).
- Alguien vuelve a crear `fn_reservar_numero_serie(uuid, text)` de 2 parámetros junto a la de 3: la llamada de 2 se vuelve ambigua (lo vigila `pnpm pruebas:notas-credito-serie-por-letra`, que exige una sola firma).
- Una migración futura recrea `emitir_nota` desde un archivo viejo: vuelve a pedir la serie sin letra y, con dos notas activas, tomaría la primera por nombre (la BC) también para una factura. La prueba lo detecta.

## Actualización 2026-09-29 (tarde) — Trujillo sigue en `B001`, pero el próximo es el 4 (no el 1)

**Decide:** Felipe, con lo que leyó en el panel de Lucode (PROD). Se aplicó en producción dos veces el mismo día, porque su lectura cambió:

1. **Primero** leyó que la serie de boleta era `B004` y que el próximo era el 4 → `pegar-en-produccion-serie-boleta-trujillo-b004-2026-09-29.sql` (B001 archivada, B004 activa con próximo 4).
2. **Después** vio boletas emitidas **hasta `B001-000003`**: la serie en uso es `B001` y el que sigue es el 4 → `pegar-en-produccion-serie-boleta-trujillo-b001-proximo-4-2026-09-29.sql` (B004 archivada otra vez, B001 activa con próximo 4).

**Estado final, verificado con un `select` en producción:** Tienda TRU · `B001` ACTIVA con próximo 4 · `B004` archivada · ningún comprobante tocado (`B001-000001`, `B004-000002`, `B004-000003`). Ninguna venta salió entre los dos cambios, así que no se emitió ningún número con la serie equivocada.

**Qué cambia respecto a la decisión 1.** La serie de Trujillo sigue siendo `B001` (no cambia el nombre), pero **el contador arranca en 4, no en 1**: Lucode ya tiene los números 2 y 3 de `B001`. El ERP solo conoce `B001-000001`; el 2 y el 3 se emitieron por fuera del ERP (¿desde el panel de Lucode?). Para no repetirlos el contador va a 4, y hay un hueco 2-3 en `comprobantes` que **no es un error del ERP**. Arequipa (`B002`) y Lima (`B003`) siguen como quedaron, desde el 1: Felipe solo verificó la de Trujillo.

**Lo que se aprende.** «Seguir en el N» exige comprobar el número contra el panel de Lucode antes de tocar el contador, y una serie que ya emitió por fuera del ERP tiene números que la base no ve. El script comprueba que el 4 esté libre **en el ERP**; contra Lucode solo puede comprobarlo una persona.

**Qué no cambia.** `B001-000001` (una venta de prueba del 2026-09-29 a las 12:55, «aceptada» por Lucode en producción, con CDR) conserva su número: los comprobantes no se borran ni se renumeran. Qué hacer con esa boleta ante SUNAT —darla de baja por resumen diario, ADR-0016— es un paso aparte, de Felipe (ver el backlog del 2026-09-29).

**Se rompe si** alguien vuelve a pegar `pegar-en-produccion-series-salida-a-produccion-2026-09.sql` de cero: su comprobación «ya hay comprobantes con alguna de las series nuevas» se detiene (existe `B001-000001`) y no cambia nada.
