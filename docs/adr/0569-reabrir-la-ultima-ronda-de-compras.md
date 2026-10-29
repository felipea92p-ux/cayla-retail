# ADR-0569 — Reabrir la última ronda de compras (Mis compras)

- **Fecha:** 2026-10-29 · **Estado:** construido y probado en local; la migración `20261029150000` **está en producción desde el 2026-10-29** (pegada con `apply_migration` antes de fusionar y verificada por objeto).
- **Continúa a:** [ADR-0480](0480-compras-simple-en-cuatro-pasos.md) (la ronda de compras) y [ADR-0559](0559-la-mesa-de-la-ronda-mis-compras-con-la-ronda-abierta.md).
- **Origen:** Felipe, 2026-10-29, usando Mis compras: «quiero agregar un gasto de bebidas de 4 soles y la ronda está cerrada, ¿cómo hago? Además puse que ese dinero lo
  usaría para la siguiente ronda, pero se tomó otra decisión y se quiere devolver, y no lo permite». Y, al ver dos funciones propuestas: «lo más fácil puede ser reabrir la ronda».

## El problema

Una ronda cerrada no cambia nunca (`fn_compra_rondas_fija`), anotar un gasto exige una ronda abierta («Abre tu ronda de compras antes de anotar») y el cierre
(«me quedo la plata» o «la devuelvo») se guarda una sola vez. Quien se olvidaba de un gasto, o cambiaba de idea sobre la plata que le sobró, solo podía abrir OTRA ronda: el gasto
quedaba en la que no era y el cierre equivocado no se corregía.

## Lo que se decidió

**Una sola función: reabrir la última ronda.** `reabrir_ronda_compras()` (con un botón «Reabrir RC-…» bajo «Abrir mi ronda», solo cuando se puede): la ronda vuelve a estar abierta
con el mismo número y la misma fecha de apertura, con todo lo que ya tenía. Desde ahí todo funciona como siempre: se anota el gasto en su ronda, se corrige una compra, y al
cerrarla otra vez se elige de nuevo qué hacer con lo que queda (el monto sale de lo que de verdad tiene en ese momento, ya con el gasto).

**Cuándo se puede** (lo exige la base, no la pantalla): es de quien la cerró, es la ÚLTIMA ronda cerrada, no hay otra abierta, y Compras todavía no recibió su cierre
(`resuelto_en` nulo). «Me lo quedo» nunca lo recibe Compras, así que esa ronda se reabre hasta que abra la siguiente. Lo que devolvió o le pagaron ya movió plata de verdad: ahí no.

**Nada se borra sin rastro.** El cierre de la ronda sale del libro de cierres (que Compras mira) y se archiva en `compra_cierres_reabiertos` (qué había decidido, cuánto, cuándo, quién
reabrió). Se anota en Actividad. Dos toques seguidos devuelven la misma ronda (`ya_estaba`).

**La excepción es chica y de una sola función.** Los dos disparadores que prohibían tocar una ronda cerrada o borrar un cierre ganan una excepción que exige una marca de la
transacción (`retail.reabriendo_ronda` = el id de esa ronda) que solo la función pone. Fuera de ella, una ronda cerrada sigue sin cambiar y un cierre sigue sin borrarse (lo prueba
`pruebas:compras-simple-reabrir`, también con la marca de OTRA ronda).

## DESCARTÉ

- **Dos funciones nuevas** («agregar un gasto a una ronda cerrada» y «cambiar cómo cerré»), que era lo recomendado al principio: cada una tenía que recalcular el cierre y repetir las reglas de
  la ronda. Reabrir reutiliza todo lo que ya existe y cubre además lo que no se pensó (corregir una compra de esa ronda). Felipe lo pidió así.
- **Reabrir cualquier ronda vieja:** el cierre de una ronda anterior ya pudo moverse (plata devuelta, la siguiente ronda se armó con lo que sobró). Solo la última, sin otra abierta.
- **Reabrir con el cierre ya recibido por Compras:** habría que deshacer un movimiento de dinero real (`devolver_fondo` / `entregar_fondo`). Es decisión de Felipe y de Compras, no una puerta de la compradora.
- **Un `DELETE` del cierre sin archivo:** CLAUDE.md pide mover a archivo, nunca borrar historial.
- **Una columna nueva «reabierta» en `compra_rondas`:** habría exigido un `alter table` de una tabla en uso en producción y no hacía falta.

## Cómo se verificó

`pnpm pruebas:compras-simple-reabrir` (9 casos, migraciones pegadas dos veces, ROLLBACK): módulo como llave, nada que reabrir / ya hay una abierta, mismo id y número con el cierre archivado y
dos toques, el gasto de S/ 4 en su ronda y cierre nuevo con «devuelvo» por S/ 36 (de S/ 40), solo la última, cierre recibido por Compras que no se reabre, los disparadores siguen cerrados fuera de la
función, permisos. En la web: la regla `puedeReabrirLaRonda`, la clave de firma `compra_ronda_reabrir` (web y base con las mismas 66), la guía interactiva con su paso y la huella, `tsc` y `knip`.

**Falta:** ver el botón en el navegador con una cuenta de compradora real (en esta sesión no se probó la pantalla), y `/formidable`.
