## 🔢 Versión de migración repetida en `main` (2026-09-30): Conteo pasa a `20260930050100`; sin migración nueva; rama `claude/exciting-mestorf-97eacb`

`20260930050000` la tenían dos archivos a la vez, Conteo (#643) y Terminales (#642), y todo `supabase start` desde cero caía por
llave duplicada en `schema_migrations`. Terminales ya estaba en producción y Conteo no, así que se renombró la de Conteo.

- [x] **Producción consultada (solo lectura, 2026-09-30):** Terminales aplicada (`20260930143821 terminales_pasan_la_puerta_de_lectura`,
  md5 de `fn_tiene_acceso_retail()` = `709e7723…`). Conteo sin aplicar (no hay `movimientos_conteo_item_idx`, `fn_conteo_lineas_json`
  no trae `ajustado_antes`).
- [x] **Renombre:** `20260930050000_conteo_ajuste_previo_en_la_nota.sql` → `20260930050100_…`. El SQL es el mismo (comparado sin
  los comentarios) y la cabecera dice «RENOMBRADA desde …». También se corrigieron `conteo-reglas.ts`, ADR-0282 y la bitácora y el
  backlog de `inventory-count-logic-6d804c`.
- [x] **Candados:** `versiones.test.mjs` (6 casos, corre en el paso «Versiones de migración»). `sql-pegado.mjs` acepta un renombre
  que solo cambia la cabecera de comentarios: el parche tiene que ser un tramo que empieza en la línea 1 y es todo `--` hasta el
  último cambio, porque un `--` dentro de `$$ … $$` cambia la función. Suma 2 casos, 13 en total.
- [x] **Desde cero:** stack desechable propio (`project_id = cayla-mig-unicas`, puertos 574xx; el compartido no se tocó). Con `main`
  cae con el mismo error; con el arreglo arranca, siembra, quedan 372 versiones = 372 archivos (con nombre), y los objetos de las
  dos migraciones están (huella de Terminales igual a producción). Después se bajó con `stop --no-backup`.
- [ ] **POR PEGAR (sigue de #643):** `supabase/migrations/20260930050100_conteo_ajuste_previo_en_la_nota.sql`, una sola parte,
  después de `20260930010100` y `20260930020100`. Crea un índice sobre `movimientos`: pegarla fuera de la hora de venta.
- [ ] **Decisión de Felipe: `strict: true` en el ruleset `main-protegida`.** El candado de versiones sí corrió, pero el CI de #643
  se había terminado antes de que #642 entrara a `main`, y el ruleset acepta un verde viejo. Con `strict` un PR tiene que traer
  `main` y volver a pasar antes de fusionarse: se cierra este choque, y cualquier otro entre dos PR que pasan cada uno por su lado.
  El costo es una vuelta más de CI (~7 min) cuando `main` se movió. CONTRIBUTING §2 trae el comando (cambiar `false` → `true`) y
  dice que se sube «si aparecen choques entre dos PR que pasan cada uno por su lado». La alternativa es la cola de fusión de
  GitHub: hace lo mismo sin trabajo manual, pero cambia cómo se fusiona.
- [ ] **PR #639** (`claude/accesos-rol-terminal-3e62ba`, metas por persona) trae `20260930040000_mis_ventas_del_dia.sql` y
  `20260930050000_metas_por_persona.sql`, que chocan con `main`. Hoy está en rojo y no se puede fusionar; al traer `main`, su
  sesión tiene que renombrar esos dos archivos a versiones libres (después de `20260930050100`).
