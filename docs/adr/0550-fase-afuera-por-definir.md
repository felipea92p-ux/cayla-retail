# ADR-0550 — Una fase que sale afuera puede quedar «por definir», sin inventar un proveedor

**Estado: DESCARTADA el 2026-10-28 (no se fusiona; el PR #1422 se cierra).** Otra sesión construyó lo mismo con otro diseño, «Pendiente de registrar» (ADR-0537 act. b: una fase de servicio sin proveedor que no cobra nada y **sí se opera**, con «Registrar quién» después). Las dos usan «servicio con proveedor nulo» con significados opuestos —esta bloqueaba operar la fase—, y la necesidad real de Felipe es **registrar lo que el Taller ya hizo**, que el bloqueo impedía. Queda la de ADR-0537 b. Esta migración se pegó en producción y se deshizo con `supabase/migrations/pegar-en-produccion-deshacer-fase-por-definir-2026-10-28.sql`. Lo que sigue es el razonamiento de entonces, que se conserva por lo que enseña: un proveedor «Pendiente» obliga a inventar una tarifa, y una columna aparte puede contradecir al proveedor.

**Estado:** aceptada, **web y migración en su PR; la migración `20261028034000` está por pegar en producción (una sola parte)** · **Fecha:** 2026-10-28 ·
**Decidió:** Felipe («Sí, constrúyelo», el 2026-10-28, tras elegir esta opción entre tres) · **Sigue a:** ADR-0400 (la orden con sus fases, quién las hace y su tela)

## Contexto

Al registrar una orden de producción —sobre todo una que ya se hizo, o una a medio camino— no siempre se sabe a quién se le manda cada fase. La hoja
«¿Quién hace corte?» decía «Afuera» y pedía **proveedor y tarifa por prenda**, y la base lo obligaba (`produccion_fases_quien`: un servicio lleva
proveedor y tarifa). Quien no sabía quedaba con dos salidas malas: dejar la fase «En el Taller» (que, una vez marcada, no se corrige y le pone el costo
al lugar equivocado) o crear un proveedor llamado «Pendiente».

Lo segundo es lo peligroso. La tarifa de una fase se congela al abrirla, y al registrar la Vuelta se vuelve una **deuda real** (`devengado`, Por pagar).
Un proveedor «Pendiente» con un precio cualquiera convierte un «no sé» en una deuda con nombre y precio falsos, aparece en todas las listas de las siete
fases y no se distingue de un proveedor de verdad.

## Decisión

**1. «Por definir» es un estado real de la fase.** Una fase `quien = 'servicio'` con `proveedor_id` nulo es una fase afuera por definir. Sin columna nueva:
un indicador aparte diría lo mismo que `proveedor_id is null` y podría contradecirlo. El esquema sigue prohibiendo lo imposible: un servicio con tarifa y
SIN proveedor (una deuda sin nombre), o con proveedor y SIN tarifa. Una fase por definir no lleva tarifa, fijo, mínimo ni fecha prometida: eso es del
proveedor y todavía no hay.

**2. Se pide con el vocabulario de siempre.** `fn_produccion_fases_normalizar` —y con ella `abrir_orden_produccion` y `cambiar_quien_fase`— acepta
`quien = 'por_definir'` y lo guarda como `servicio` con todo en nulo. Lo que se mande de más (proveedor, tarifa…) se ignora. «Afuera» sin proveedor sigue
rechazado (`fase_sin_proveedor`): «por definir» es una decisión que se toma, no un campo que se dejó vacío.

**3. Mientras está por definir, no se opera.** `fn_produccion_operar_fase` —la puerta de avance, Salida, Vuelta, marcar y sus anulaciones— rechaza con
`fase_por_definir`. Así no puede nacer una deuda ni un movimiento de prendas sin saber a quién.

**4. Se completa por «Cambiar quién», no por otra puerta.** La fase por definir lleva «Definir quién» en primer plano (el botón negro si es la que sigue);
al elegir proveedor y tarifa pasa por las validaciones de siempre y solo mientras la fase no haya empezado. Pasar de servicio a por definir y de
por definir al Taller también se puede, con las mismas reglas.

**5. La pantalla no lo esconde.** La hoja ofrece el tercer segmento **Taller · Afuera · Por definir**; la ficha de la orden dice «Sigue: definir quién hace
corte» y el chip, «En corte · falta definir quién» (ámbar); la lista dice «Falta definir quién»; **el costo dice «por definir», nunca S/ 0.00, y avisa que el
total no incluye esa fase** (en la orden y en la ficha de Nueva orden); la actividad de apertura nombra «Corte (por definir)» en vez de «todo en el Taller».

## Descarté

- **Un proveedor «Pendiente» en el directorio.** Obliga a inventar la tarifa (la base exige una) y esa tarifa se vuelve deuda real al registrar la Vuelta.
- **Una columna `por_definir boolean`.** Dice lo mismo que `proveedor_id is null` y puede contradecirlo (`true` con proveedor, `false` sin él).
- **Un tercer valor de `quien` guardado.** Todo lo que hoy pregunta `quien = 'servicio'` (devengado, salidas, Por pagar) lo trataría como Taller sin avisar. Con
  `servicio` + proveedor nulo, un camino que olvide mirar el proveedor falla fuerte (la base lo rechaza) en vez de callar.
- **Dejar operar una fase por definir y exigir el proveedor al final.** La Salida y la Vuelta son las que escriben prendas y deuda: el momento de saber a
  quién es antes de ellas, no después.

## Se rompe si

Alguien abre una orden con **todas** sus fases por definir y nadie las completa: la orden queda quieta sin avisar. Por eso la ficha dice qué sigue, la fila
de la fase lleva el botón en primer plano y el chip de la lista va en ámbar. Si en la práctica pasa seguido, lo que falta es un aviso en Inicio («órdenes
con fases por definir»), que **no** se construyó aquí.

## Lo que no cambia

Las fases del Taller y las de un servicio con proveedor y tarifa validan y operan igual que antes (lo prueba `scripts/pruebas/produccion_fase_por_definir.mjs`, caso B4).
Nada se borra: no hay `DELETE` ni se toca un movimiento. La orden «de antes» y el cierre «ya estaba en stock» siguen pendientes (plan del 27-oct).

## Cómo se pega en producción

`supabase/migrations/20261028034000_produccion_fase_afuera_por_definir.sql`: **una sola parte**. Hace un `alter` de `produccion_fases` (reemplaza el CHECK)
y cuatro reemplazos anclados de funciones (no toca políticas, así que no entra en la regla de «Políticas y deadlocks»). Idempotente. Si una de las funciones
cambió en producción desde que se escribió, el reemplazo se detiene con un mensaje y no aplica nada.

## Verificación

- `node scripts/pruebas/produccion_fase_por_definir.mjs` — 16 casos contra Postgres (esquema, abrir, cambiar quién, bloqueo, lectura, permisos), todo con ROLLBACK.
- `apps/web/lib/orden-fases-reglas.test.ts`, `orden-pagina-reglas.test.ts`, `orden-nivel-dos-reglas.test.ts`, `ordenes-lista-reglas.test.ts` y `borrador-orden.test.ts`: las
  reglas de la pantalla, y que el vocabulario sea el de la migración.
