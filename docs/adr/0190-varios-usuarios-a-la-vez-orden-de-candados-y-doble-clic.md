# ADR-0190 — Varios usuarios a la vez: candados en orden fijo y doble clic en traslados, lotes y caja

- **Fecha:** 2026-09-23
- **Estado:** construido y probado en local; migración `20260924130000_concurrencia_orden_y_doble_clic.sql` **por pegar en
  producción**. Orden: `20260924110000` (ADR-0188) → esta migración → recién entonces la web.
- **Contexto:** etapa 2b de la auditoría de concurrencia (etapa 1: ADR-0188). La etapa 2a (cambios, devoluciones y
  conteos simultáneos) va en paralelo con su propio ADR.

## Problema

1. **Dos ventas a la vez se podían cancelar entre sí.** `registrar_venta`, `iniciar_traslado`, `recibir_lote`,
   `recibir_compras`, `separar_prendas` y `aprobar_devolucion` recorren las prendas en el orden en que llegan y bloquean el
   stock fila por fila. La caja 1 vende [A, B] y la caja 2 vende [B, A] al mismo tiempo: la 1 toma A, la 2 toma B, cada
   una espera la de la otra y Postgres cancela una (bloqueo mutuo, `40P01`). La clienta de esa caja ve un error y se le
   vuelve a cobrar. Se reprodujo en el local con dos sesiones reales, con `iniciar_traslado` y con `registrar_venta`.
2. **Un doble clic movía stock o dinero dos veces.** `iniciar_traslado`, `recibir_lote`, `registrar_movimiento_caja`,
   `apartar_stock` y `recibir_insumo` no tenían idempotencia: dos clics en «Mover» descontaban el stock dos veces; un
   retiro de caja de S/ 200 quedaba dos veces en el arqueo. Ventas, cambios, separaciones, envíos y compras ya estaban
   protegidos con `token_cliente`.

## Decisión

1. **Todas las funciones que mueven varias prendas toman sus candados en un orden fijo, antes de mover nada**, con una
   pieza nueva: `fn_bloquear_en_orden(ubicación, variantes, bloquear_variantes, líneas_de_compra)`. El orden es el
   contrato: **líneas de compra → variantes → stock**, cada grupo ordenado por id. Dos operaciones que comparten prendas ya
   no pueden esperarse en círculo: la segunda espera a la primera entera, sin tener nada tomado. La llaman
   `registrar_venta`, `separar_prendas`, `entregar_separacion`, `aprobar_devolucion` (justo después de leer la caja con
   `for share`), e `iniciar_traslado`, `recibir_lote`, `recibir_compras` y `recibir_envio` (al empezar). **Regla para
   funciones nuevas: si mueve más de una prenda, llama a `fn_bloquear_en_orden` antes de su bucle.**
2. **No se reordena el bucle, se pre-bloquea.** El orden del carrito importa para otra cosa: es el orden de las líneas en
   la boleta y en el detalle de la venta. Recorrer ordenado por variante lo habría cambiado; el pre-bloqueo deja el bucle
   igual y solo le antepone una línea.
3. **Las recepciones y la devolución bloquean también la variante** (`for no key update`, el mismo candado del costo
   promedio de ADR-0188). Una prenda que llega por primera vez a una sede no tiene fila de stock que bloquear (se crea al
   recibir); ordenar por la variante cubre ese caso. Ese candado no choca con las ventas.
4. **Doble clic: `token_cliente` + índice único parcial** en `transferencias`, `lotes`, `caja_movimientos`, `apartados` e
   `insumo_lotes`, y `p_token uuid default null` al final de las 5 funciones. Con token, la función toma un candado sobre
   ese token (`pg_advisory_xact_lock`) y, si ya hay una fila con él, devuelve SU id: el segundo clic recibe el mismo
   resultado, no un error. El segundo clic que llega mientras el primero guarda espera ese candado y luego encuentra la
   fila. Un intento que falla (sin stock, por ejemplo) no gasta el token: se corrige y el mismo token guarda.
5. **La web genera el token una vez por intento** (`useRef(crypto.randomUUID())`, como Vender): en Mover mercadería y
   Recibir sin factura se renueva al guardar bien (así «recibir otro lote» es otro lote); en las ventanas (movimiento de
   caja, apartar, ingresar insumo) hay uno por cada vez que se abre. Los botones ya se deshabilitaban mientras guardan.
6. **Se parcha con anclas estructurales**, como ADR-0188: la primera línea `begin` del cuerpo, el cierre de la lista de
   parámetros, la línea `return <id>;` y la lectura de la caja con `for share` de ADR-0188. Cada ancla exactamente una
   vez o aborta; una función con la marca «ADR-0190» se salta (re-pegable). Las 5 con parámetro nuevo se recrean con drop +
   create en la misma transacción, sin sobrecarga y con los mismos permisos y comentario.

## Alternativas descartadas

- **Recorrer el carrito ordenado por variante:** más simple, pero cambia el orden de las líneas en la boleta.
- **`on conflict do nothing` en el insert de cada cabecera** (el patrón de `recibir_envio`): obliga a reescribir cada
  insert con anclas sobre el cuerpo, que difiere entre el local y producción; y en `apartar_stock` la fila se inserta
  DESPUÉS de mover el stock, así que el choque llegaría tarde. El candado del token + marcar la fila al final cubre las 5
  igual, con anclas estables. El índice único sigue siendo la última red.
- **Aislamiento `serializable` o reintentar en la web:** protege, pero obliga a reintentar transacciones desde cada
  pantalla; el orden fijo elimina el bloqueo mutuo en su origen.

## Lo que queda fuera (pendiente)

- `registrar_cambio`, `crear_devolucion`, `conteo_contar` y `cerrar_conteo` son de la etapa 2a; si mueven varias prendas,
  deberían llamar a `fn_bloquear_en_orden` igual.
- `mover_interno` y `registrar_movimiento` (Reponer piso y Ajustar inventario) mueven UNA prenda por llamada: no forman
  bloqueos mutuos por orden. Siguen sin token: un doble clic en Ajustar inventario (solo líder) sigue ajustando dos veces.
  `transferir` no la llama la web.
- `cerrar_produccion` y los otros llamadores de `fn_recalcular_costo_variante` siguen recorriendo en su orden; el ciclo
  con una recepción ya existía antes de este cambio y no empeora.
- `recibir_lote` y `registrar_movimiento_caja` siguen con permiso de ejecución para `PUBLIC` (así estaban; la función
  rechaza a quien no opera la sede). Se conservó tal cual para no mezclar un cambio de permisos con este.

## Cómo se verificó

- Antes de aplicar: la prueba nueva de dos sesiones reproduce el bloqueo mutuo en `iniciar_traslado` y en
  `registrar_venta` (`deadlock detected`). Después: las dos esperan y terminan bien.
- Migración aplicada dos veces seguidas en local: la segunda no cambia nada («0 funciones parchadas, 11 ya lo estaban»).
- `pnpm pruebas:concurrencia-orden-doble-clic` 15/15: forma (una sola versión, permisos, pre-bloqueo en las 8), doble token
  en las 5 funciones, token que no se gasta si el intento falla, dos sesiones con el mismo token.
- Suites existentes: `registrar-venta` 25/25, `fn-aplicar-movimiento` 11/11, `apartar-stock` 46/46, `separaciones` 46/46,
  `caja-cierre-traslado`, `recibir-envio` 29/29, `compras-reparto` 57/57, `insumos-devolucion` 10/10, `actor-firma` 30/30,
  `candado-lider` 22/22. `aprobar-devolucion-caja` da 2/5 por la cuenta de prueba (previo, igual que en ADR-0188); con
  Felipe como quien aprueba da 5/5.
