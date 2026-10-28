## «Completar todo» de una tarjeta de Conteo cuenta pero lo dice (2026-10-22, ADR-0328 decisión 10 segunda mitad) — rama `claude/conteo-completar-todo-atajo`

- [x] **SQL en producción:** `20261022145000_conteo_atajo_por_tarjeta.sql` (antes `20261005233700`; una sola parte, sin políticas, idempotente) la pegó Felipe; comprobada por efectos el 2026-10-22
  (solo lectura): columna, restricción `conteo_items_atajo_coherente`, disparador, `conteo_completar_tarjeta` (`security definer`, `authenticated` sí / `anon` no) y 0 filas marcadas.
- [x] **Web, prueba SQL y documentación** (ADR-0328 «Actualización 2026-10-22», nota cruzada en ADR-0282, fila de `docs/ARQUITECTURA.md`, `pruebas:conteo-atajo-tarjeta` en la lista `PRUEBAS` del runner de tandas).
- [x] **Revisión independiente** (solo lectura; SQL, web e integración, con un escéptico por hallazgo): sin BLOQUEA ni ALTA. Atendido: respaldo «talla por talla» quitado (código muerto desde el pegado),
  frase cambiada a «con lo que CAYLA esperaba», comentarios de `conteos.ts` y de la migración (solo cabecera), referencias del ADR y los siete «sin pegar» viejos de Conteo en `ARQUITECTURA.md`.
- [x] **PR abierto antes de la «Deriva diaria» de las 07:00 de Lima del 2026-10-23** (compara producción con `main` MÁS el SQL que los PR **abiertos** declaran pegado, ADR-0402): el PR marca
  «SQL pegado en producción», así que el aviso «Producción ≠ main» no sale por este SQL.
- [x] **Versión de la migración:** se reservó `20261022145000` (`pnpm reservar migracion`, etiqueta `reserva/migracion-20261022145000`) y el archivo se renombró desde `20261005233700` sin cambiar una línea
  de SQL (precedente del 2026-10-14, ADR-0328, cuarentena): así el CI la corre después de todas las de `main`, igual que en producción. Producción no guarda ni la versión vieja ni el nombre
  (0 filas en `schema_migrations`, consultado el 2026-10-22), así que renombrar no deja un hueco allá.
- [ ] **Refrescar el diccionario** (`pnpm datos:generar:produccion`, `pnpm datos:comparar`; la foto de ayer, 21-oct, aún no trae la función ni la columna) y **regenerar `packages/database/src/types.ts`** (la función y la columna están escritas a mano).
- [ ] **`scripts/purga/restaurar-purga.sql` (BAJA, de antes de esta rama):** reinserta respaldos viejos con `jsonb_populate_recordset`; las columnas `not null` que el respaldo no trae llegan como NULL y la restauración
  falla con 23502. Ya pasaba con `aplicada_sin_contar` y ahora también con `completada_con_atajo`. Arreglo en el script: rellenar con `column_default` las columnas `not null` ausentes + un caso en `purgar_producto_de_prueba.mjs`.
- [ ] **Deadlock posible (BAJA, ya existía con `conteo_contar` suelto):** `ajustar_inventario` toma el stock y luego el conteo (vía `registrar_hallazgo_de_conteo`), el atajo toma el conteo y luego el stock. Solo con un conteo reabierto y
  un ajuste enlazado a una línea suya al mismo tiempo; Postgres cancela una, sin corrupción, y ese ajuste habría fallado igual (`hallazgo_conteo_no_cerrado`). Arreglo: en `registrar_hallazgo_de_conteo`, validar el estado antes de tomar candados.
- [ ] **Aviso del fallo de un lote (BAJA):** si `conteo_completar_tarjeta` o `conteo_aplicar_completos` fallan, el aviso es un texto neutro que se va solo (8 s) y las líneas reaparecen pendientes; no pierde nada y Revisar lista
  las pendientes. Mejorarlo (aviso persistente con el nombre de la tarjeta y «Reintentar») es un pulido para los DOS atajos a la vez.
- [ ] **Decisión de Felipe, si algún día hace falta:** si «Completar todo» se usa en casi todo un arranque real, pedir confirmación en Confirmar cuando la mayoría de lo contado vino del atajo
  (hoy solo informa; ADR-0328 «SE ROMPE SI»).
- [ ] **Cuando se rehaga `fn_conteo_detalle`:** sumarle `con_atajo` a su jsonb y quitar el `select` de `getCompletadasConAtajo` (hoy la única lectura de Conteo que no pasa por una función).
- [ ] **Lo que quedó fuera de esta rama** (sigue en `claude/inventory-screens-redesign-50dda1`, sin publicar): el análisis de la estructura del módulo Inventario
  (`docs/pantallas/inventario-modulo.md`, hecho el 2026-10-05 sobre un `main` de 2620 commits atrás), el aviso de ventas sin prenda en Análisis (los archivos donde se enchufaba ya no existen:
  Análisis se rehízo como «Análisis v4») y `/buscar` con `fn_existencias` (ya está en `main`). El aviso de Análisis hay que volver a pensarlo contra la pantalla nueva si se quiere.
