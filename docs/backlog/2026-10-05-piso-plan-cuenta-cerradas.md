## 📦 El motor del piso cuenta las ventas cerradas sin prenda (2026-10-05, ADR-0334 «Contrato para quien escriba el motor del piso» × ADR-0328 act. 7) — **POR PEGAR**; rama `claude/piso-plan-cuenta-cerradas`

Producción el 2026-10-04 (solo lectura): `fn_piso_plan_lectura` con huella `faff73d2a6db4c0692775c1f6d6e284d` (solo cuenta `pendiente`), 0 filas en
`cierres_cola_arranque`, AQP con 170 anotadas pendientes y TRU con 97; plazo de las tres tiendas hasta el 15-oct.

- [x] **Migración `20261005160000_piso_plan_cuenta_cerradas_sin_prenda.sql`** (una parte; `create or replace` + `comment` + permisos; sin `alter`
  ni políticas). Mismo cuerpo que `20261004213000` salvo los dos filtros (`p.estado in ('pendiente', 'cerrada_sin_prenda')`) y sus comentarios.
  La guarda exige que el cuerpo vivo sea `faff73d2…` o el suyo. Se puede pegar dos veces.
- [x] **`scripts/pruebas/piso_plan_lectura.mjs`:** A8, A9, A10, A11 (control con el cuerpo viejo) y M4 (la guarda frena un cuerpo desconocido);
  F2 pide el comentario nuevo; M1–M3 vigilan la migración nueva. 59/59 en un Postgres desechable armado como el CI; mutación → A8, A9 y A10 en rojo.
- [x] **ADR-0334** («Actualización 2026-10-05»), **ADR-0328** (contrato de la decisión 1), comentarios de `lib/piso-plan.ts`, el paso del CI y
  `docs/ARQUITECTURA.md`.
- [ ] **Pegar en producción (Felipe).** Antes, solo lectura: `select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure;`
  → `faff73d2a6db4c0692775c1f6d6e284d`. Después, la misma consulta → `33dfc4b19e7ab14410a14b2cb7bc50c5`. Si la guarda se detiene diciendo que
  alguien la cambió a mano, no forzar: comparar el cuerpo vivo con el repo.
- [ ] **Regla de orden mientras no esté pegada:** ninguna tienda cierra su cola de arranque desde `/inventario/por-regularizar` (AQP sobre todo).
  Comprobar antes de cada cierre que la huella viva sea `33dfc4b1…`.
- [ ] **Nunca volver a pegar `20261004213000`** después de esta (devolvería el filtro viejo sin error). Ese archivo no se puede editar: el aviso
  vive aquí, en ADR-0334 y en la cabecera de `20261005160000`.
- [ ] Al pegar: refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) para que el diccionario tenga el comentario nuevo de la función.
