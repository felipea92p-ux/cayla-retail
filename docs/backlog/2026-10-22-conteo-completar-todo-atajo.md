## «Completar todo» de una tarjeta de Conteo cuenta pero lo dice (2026-10-22, ADR-0328 decisión 10 segunda mitad) — rama `claude/conteo-completar-todo-atajo`

- [x] **SQL en producción:** `20261005233700_conteo_atajo_por_tarjeta.sql` (una sola parte, sin políticas, idempotente) la pegó Felipe; comprobada por efectos el 2026-10-22
  (solo lectura): columna, restricción `conteo_items_atajo_coherente`, disparador, `conteo_completar_tarjeta` (`security definer`, `authenticated` sí / `anon` no) y 0 filas marcadas.
- [x] **Web, prueba SQL y documentación** (ADR-0328 «Actualización 2026-10-22», fila de `docs/ARQUITECTURA.md`, `pruebas:conteo-atajo-tarjeta` en la lista `PRUEBAS` del runner de tandas).
- [ ] **Fusionar la web** (el SQL ya está): el PR debe marcar «SQL pegado en producción» (el check compara producción con lo que el CI vio cambiar a la migración).
- [ ] **Versión de la migración:** hoy es `20261005233700`, «en medio de la historia» (el candado `migraciones:versiones` solo avisa «no está reservado»). El precedente del 2026-10-14
  (ADR-0328, cuarentena) es traerla con una versión nueva reservada (`pnpm reservar migracion`, una etiqueta en el remoto) sin cambiar una línea de SQL, para que el CI la corra después
  de todas las de `main`, igual que en producción; producción no guarda ni su versión ni su nombre (0 filas en `schema_migrations`, consultado el 2026-10-22), así que renombrar es seguro.
  No se hizo porque reservar publica una etiqueta: se hace al subir la rama.
- [ ] **Refrescar el diccionario** (`pnpm datos:generar:produccion`, `pnpm datos:comparar`) y **regenerar `packages/database/src/types.ts`** (la función y la columna están escritas a mano).
- [ ] **Hueco conocido, solo hasta fusionar la web:** una talla contada por el respaldo (web nueva con el SQL aún sin pegar) no lleva marca; la frase de Revisar puede subcontar.
- [ ] **Decisión de Felipe, si algún día hace falta:** si «Completar todo» se usa en casi todo un arranque real, pedir confirmación en Confirmar cuando la mayoría de lo contado vino del atajo
  (hoy solo informa; ADR-0328 «SE ROMPE SI»).
- [ ] **Lo que quedó fuera de esta rama** (sigue en `claude/inventory-screens-redesign-50dda1`, sin publicar): el análisis de la estructura del módulo Inventario
  (`docs/pantallas/inventario-modulo.md`, hecho el 2026-10-05 sobre un `main` de 2620 commits atrás), el aviso de ventas sin prenda en Análisis (los archivos donde se enchufaba ya no existen:
  Análisis se rehízo como «Análisis v4») y `/buscar` con `fn_existencias` (ya está en `main`). El aviso de Análisis hay que volver a pensarlo contra la pantalla nueva si se quiere.
