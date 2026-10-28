## 🧾 Actividad: regularizar una venta sin registrar se anota en Existencias (2026-10-04, ADR-0207 act. 2026-10-04) — **SQL EN PRODUCCIÓN (pegado por Felipe, 2026-10-04; verificado en solo lectura)**; rama `claude/nifty-sinoussi-5a0044`

La anotación de `fn_actividad_regularizar` decía `recibir` desde antes de que ADR-0330 mudara la lista a Existencias. Producción el 2026-10-04
(solo lectura): 0 líneas `prenda_regularizada`, 0 líneas `recibir`, 267 prendas pendientes, función viva = la del repo (md5 `ac3c874e…`).

- [x] **Migración `20261004233000_actividad_regularizar_anota_en_existencias.sql`** (una parte; `create or replace` + comprobación; sin `alter`
  ni políticas). Probada en una base clonada: la aplicó dos veces sin error y conserva `security definer`, `search_path` y los permisos.
- [x] **`scripts/pruebas/actividad_gestion.mjs`, caso 6:** filtra por acción, comprueba que la línea cae en `existencias` y que no se escribió
  ninguna en `recibir`. Control: contra la función vieja el chequeo nuevo falla (`modulo: recibir`).
- [x] **ADR-0207:** actualización 2026-10-04 (H1–H3).
- [x] **Pegada en producción por Felipe (2026-10-04), antes de la primera regularización real.** Verificada en solo lectura después: la función
  dice `existencias` y ya no `recibir` (md5 nuevo `46e66861…`, `security definer` y `search_path` intactos), 0 líneas `prenda_regularizada` y
  0 líneas `recibir` en `retail.actividad`, y las 267 prendas siguen pendientes (ninguna regularizada). Sonda previa que se usó (debía dar 0):
  `select count(*) from retail.actividad where accion = 'prenda_regularizada';`. Verificación después (solo lectura):
  `select position('''existencias'', ''prenda_regularizada''' in prosrc) > 0 from pg_proc where oid = 'retail.fn_actividad_regularizar(uuid,text)'::regprocedure;` → `t`.
  Si la sonda diera más de 0, esas líneas quedan como `recibir` (la actividad no se edita); reetiquetarlas es decisión de Felipe y pide
  apagar `trg_actividad_inmutable` como la sección 13 de `20260928190000`.
- [ ] **Abierto, sin tocar:** `recibir` sigue en `MODULOS_CON_ACTIVIDAD` (`apps/web/lib/actividad-reglas.ts`) y su prueba lo exige mientras la
  migración `20261003210000` lo cite; el filtro «Recibir» de Actividad queda sin nada nuevo. Retirarlo es un cambio de web + de la prueba.
