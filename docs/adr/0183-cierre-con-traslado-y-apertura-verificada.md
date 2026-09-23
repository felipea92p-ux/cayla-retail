# ADR-0183 — El cierre de caja registra a dónde va el efectivo y la apertura se compara con lo que quedó

- **Fecha:** 2026-09-23
- **Estado:** construido; migración `20260923200000_caja_cierre_con_traslado_y_apertura_verificada.sql` **por pegar en
  producción ANTES de fusionar la web** (la web nueva llama a `cerrar_caja` con parámetros que la base de hoy no tiene).
- **Origen:** spike `docs/maquetas/caja-cierre-spike-2026-09/`, decisiones de Felipe del 2026-09-23.

## Problema

`cerrar_caja` guardaba cuánto se contó, pero no qué se hizo con ese efectivo. Al día siguiente, quien abría escribía un
monto de memoria y nadie lo comparaba con lo que había quedado: un faltante de la noche terminaba cargado a quien abría.
Además, la vista previa del cuadre (`getResumenCaja` en `lib/caja.ts`) sumaba por su cuenta y ya se había desviado de
`cerrar_caja`: contaba el efectivo de las ventas anuladas.

## Decisión (Felipe, 2026-09-23)

1. **Quien cierra ve el esperado desde el inicio**, junto a lo que cuenta, con la diferencia al instante. Se deja el
   conteo ciego a pedido de Felipe, aunque tenía un costo: si ves el número antes, tiendes a contar hasta llegar a él. El
   esperado sale de `fn_esperado_caja`, que comparte con `cerrar_caja` el mismo cálculo (`fn_calcular_esperado_caja`):
   un solo lugar, sin deriva. Solo lo ve quien puede cerrar (`fn_puede_gestionar_caja`).
2. **Un traslado opcional al cerrar**: un monto y un destino. El cajón para el próximo turno se **calcula**
   (`cajas.monto_fondo` = contado − trasladado), nunca se escribe. Destinos: caja fuerte de la sede, depósito bancario
   (n.º de operación obligatorio) y entregado al líder (a quién, obligatorio). **Otra sede y el Taller quedan fuera**:
   necesitan acuse de recibo en destino, y eso es otra pantalla.
3. **Sin fondo sugerido**: no se avisa si queda «demasiado» en el cajón.
4. **Apertura verificada**: `abrir_caja` compara con el `monto_fondo` del último cierre real de la sede. Si no coincide,
   exige motivo (en la función y con el `check caja_apertura_explica_diferencia` en la tabla), lo guarda, y la apertura
   aparece al líder en Inicio («Aperturas de caja con diferencia») y en Historial de cierres hasta que la marca como
   revisada (`revisar_apertura_caja`, solo líder).

## Por qué una tabla `caja_traslados` y no un egreso en `caja_movimientos`

Un egreso resta del esperado *durante* la caja; el traslado ocurre después de contar, sobre lo contado. Mezclarlos
cambiaría el cuadre. Además, cuando entre «otra sede», el traslado necesita un estado (en camino / recibido) que un
egreso no tiene. La tabla es de solo agregar: solo `cerrar_caja` la escribe; no hay permisos de escritura para nadie.

## Cierres anteriores

No tienen `monto_fondo` (NULL). Sin fondo no hay con qué comparar: la primera apertura después de pegar la migración
no pide motivo, y la tarjeta «Último cierre» dice que ese cierre no anotó cuánto quedó.

## Qué se rompería sin esto

- Sin `fn_calcular_esperado_caja` compartida: la pantalla mostraría un esperado y el cierre guardaría otro (ya pasaba con
  las anuladas).
- Sin el `check` en `cajas`: una escritura directa podría dejar una apertura con diferencia y sin explicación.
- Sin `drop function` de las firmas viejas: `create or replace` con otros parámetros crea una segunda versión y la
  llamada queda ambigua (ADR-0009).

## Verificación

`pnpm pruebas:caja-cierre-traslado` (18 casos, cada uno con ROLLBACK). `candado_lider_caja_y_ajuste` se ajustó: su caso
«pegar dos veces» vuelve primero a la firma que esa migración conocía.
