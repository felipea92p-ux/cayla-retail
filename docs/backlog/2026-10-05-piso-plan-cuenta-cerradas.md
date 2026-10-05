## 📦 El motor del piso cuenta las ventas cerradas sin prenda (2026-10-05, ADR-0334 «Contrato para quien escriba el motor del piso» × ADR-0328 act. 7) — **SQL EN PRODUCCIÓN (pegado por Felipe, 2026-10-05; verificado en solo lectura)**; rama `claude/piso-plan-cuenta-cerradas`

Producción el 2026-10-04 (solo lectura): `fn_piso_plan_lectura` con huella `faff73d2a6db4c0692775c1f6d6e284d` (solo cuenta `pendiente`), 0 filas en
`cierres_cola_arranque`, AQP con 170 anotadas pendientes y TRU con 97; plazo de las tres tiendas hasta el 15-oct.

- [x] **Migración `20261005160000_piso_plan_cuenta_cerradas_sin_prenda.sql`** (una parte; `create or replace` + `comment` + permisos; sin `alter`
  ni políticas). Mismo cuerpo que `20261004213000` salvo los dos filtros (`p.estado in ('pendiente', 'cerrada_sin_prenda')`) y sus comentarios.
  La guarda exige que el cuerpo vivo sea `faff73d2…` o el suyo. Se puede pegar dos veces.
- [x] **`scripts/pruebas/piso_plan_lectura.mjs`:** A8, A9, A10, A11 (control con el cuerpo viejo) y M4 (la guarda frena un cuerpo desconocido);
  F2 pide el comentario nuevo; M1–M3 vigilan la migración nueva. 59/59 en un Postgres desechable armado como el CI; mutación → A8, A9 y A10 en rojo.
- [x] **ADR-0334** («Actualización 2026-10-05»), **ADR-0328** (contrato de la decisión 1), comentarios de `lib/piso-plan.ts`, el paso del CI y
  `docs/ARQUITECTURA.md`.
- [x] **Pegada en producción por Felipe (2026-10-05).** Verificada en solo lectura después: huella `33dfc4b19e7ab14410a14b2cb7bc50c5` (antes
  `faff73d2…`), los dos filtros `in ('pendiente', 'cerrada_sin_prenda')`, el comentario nuevo, `security definer` y `search_path` fijo, anon sin
  EXECUTE y authenticated con EXECUTE, una sola firma, NULL sin sesión, y todavía 0 cierres de cola. Consulta:
  `select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure;`
- [x] **Regla de orden levantada (2026-10-05):** con la huella `33dfc4b1…` viva, una tienda ya puede cerrar su cola de arranque sin que el motor
  la pierda.
- [ ] **Nunca volver a pegar `20261004213000`** después de esta (devolvería el filtro viejo sin error). Ese archivo no se puede editar: el aviso
  vive aquí, en ADR-0334 y en la cabecera de `20261005160000`.
- [ ] Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) para que el diccionario tenga el comentario nuevo de la función.
- [ ] **Abierto, decisión de Felipe — las bolsas de papel entran como «sin registrar» con una categoría inventada.** Producción el 2026-10-05
  (solo lectura): 27 anotadas pendientes de AQP cobradas a menos de S/ 5 (casi todas S/ 0.50; ~S/ 15 en total), y casi todas dicen «bolsa
  papel», «BOLSA COMPRAS»… La caja exige categoría, talla y color, así que quedaron como Bolsos y Carteras · Única · Nude (10), Anillos · 7 ·
  Crudo (9), Aretes, etc. No hay un producto «bolsa» en el catálogo (0 ventas escaneadas de bolsa). Para el motor del piso son DEMANDA: piden
  colgar carteras nude y anillos talla 7 que nadie compró, pendientes o cerradas (antes y después de esta migración). Y nunca se van a poder
  regularizar: no hay prenda que encontrar. Hay que decidir cómo se cobra la bolsa (un producto propio en Vender, u otra vía) antes de que la
  caja de AQP siga anotándolas así; las 27 de hoy salen de la ventana de 14 días sola hacia el 17-oct.
- [x] **Colas de arranque cerradas por Felipe (2026-10-05), las dos con «La prenda aún no está cargada»:** AQP 170 ventas (S/ 7,749.68) y TRU
  99 (S/ 5,795.18). Verificado en solo lectura: el motor ya tenía la huella `33dfc4b1…` (cuenta las cerradas); ninguna línea dejó la centinela
  y 0 movimientos de las cerradas (el contrato se cumple en producción). Felipe: «eran prendas de arranque que aún no estaban en sistema; por la
  prisa vendieron así, sin registrar».
- [ ] **Vigilar en el próximo conteo de TRU:** 59 de sus 99 cerradas coinciden en categoría × talla × color con prendas que TRU sí tiene en
  stock (en AQP, 3). No prueba que sean la misma prenda (puede ser otro modelo igual), pero si alguna sí estaba cargada, el sistema la tiene con
  1 unidad de más. Un faltante del conteo que calce con una venta de la pestaña «Cerradas» es esa venta, no una pérdida: el cruce automático del
  conteo con las ventas sin registrar (ADR-0328, decisión 9) solo mira las pendientes, así que hay que mirarlo a mano.
