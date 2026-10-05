## 🧹 Ventas sin registrar: cerrar la cola de arranque, reabrir e identificar con sugerencias (2026-10-04, ADR-0334) — **partes 1–3 YA EN PRODUCCIÓN (2026-10-04); `110000` y `120000` POR PEGAR**; rama `claude/unregistered-merchandise-solutions-860786`

Producción el 2026-10-04 (solo lectura): TRU 97 pendientes (20 vencidas), AQP 170 (83 vencidas); AQP tiene 13 prendas cargadas. De las 97 de TRU,
23 tienen UNA prenda posible. Decisión de Felipe: opción B (cierre en bloque, solo líder, con plazo), reabrir solo líder, plazo 15-oct las tres tiendas.

- [x] **1 · Cerrar la cola de una tienda** (`5e261a04`): migración en 3 partes (`20261005100000` tablas y estado, `100100` funciones, `100200`
  políticas), `cerrar_cola_arranque`, botón y hoja con guía de foco, filtro «Cerradas».
- [x] **2 · Reabrir una venta cerrada** (`d3bec2ad`): `20261005110000`, `reabrir_prenda_cerrada`, botón «Reabrir» (solo líder).
- [x] **3 · Identificar con sugerencias** (`70c47bcc`): `20261005120000`, `fn_cola_arranque_candidatas` + `regularizar_prendas_sugeridas`, hoja con casillas.
- [x] **Cierre:** ADR-0334, nota en ADR-0328, `docs/ARQUITECTURA.md`, fila en `SESIONES-ACTIVAS.md`.

### Para pegar en producción — estado: 1, 2 y 3 pegadas y verificadas; faltan 4 y 5 (lo hace Felipe; ninguna migración usa `drop trigger` ni `select … into` dentro de texto entre comillas)

**Orden** (cada archivo en su PROPIA transacción del SQL Editor; todos llevan `retail.` y `set lock_timeout = '3s'`; se pueden pegar dos veces):

1. `supabase/migrations/20261005100000_cola_arranque_parte1_tablas.sql` — `alter table` de una tabla en uso: pegar fuera de la hora punta.
2. `…100100_cola_arranque_parte2_funciones.sql` (reemplaza `fn_exige_prenda_regularizada` y `fn_prendas_por_regularizar_al_anular`).
3. `…100200_cola_arranque_parte3_politicas.sql` — **solo políticas, siempre al final** (si se mezcla con la parte 1, deadlock con el Asesor de seguridad).
4. `…110000_cola_arranque_reabrir.sql`
5. `…120000_cola_arranque_sugerencias.sql`

**La web se fusiona DESPUÉS de las partes 1 y 3 como mínimo (ya cumplido) y, recomendado, también de la 4 y la 5**: la lista de Ventas sin registrar pide `cierres_cola_arranque` en la misma consulta; sin esa
tabla la pantalla entera falla. (Los botones de reabrir y sugerencias fallan solos si faltan las partes 4 y 5; no tumban nada.)

**Sonda previa (solo lectura):**

```sql
select nombre, tipo, activo from retail.ubicaciones order by nombre;   -- 3 tiendas activas: las tres reciben el plazo 15-oct
select to_regclass('retail.cierres_cola_arranque'), to_regclass('retail.cola_arranque_plazo');   -- null, null
select md5(pg_get_functiondef('retail.fn_exige_prenda_regularizada()'::regprocedure)),
       md5(pg_get_functiondef('retail.fn_prendas_por_regularizar_al_anular()'::regprocedure));   -- anotar: cambian con la parte 2
select estado, count(*) from retail.prendas_por_regularizar group by 1 order by 1;   -- anotar: NO debe cambiar al pegar
```

**Comprobación posterior (solo lectura):**

```sql
select count(*) from retail.cola_arranque_plazo;   -- 3
select count(*) from pg_policies where schemaname = 'retail' and tablename in ('cierres_cola_arranque', 'cola_arranque_plazo');   -- 2
select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
  and proname in ('cerrar_cola_arranque', 'reabrir_prenda_cerrada', 'fn_cola_arranque_candidatas', 'regularizar_prendas_sugeridas');   -- 4, una firma cada una
select clave from retail.acciones_sin_responsable where clave like 'cola_arranque_%' order by 1;   -- cerrar, identificar, reabrir
select conname from pg_constraint where conrelid = 'retail.prendas_por_regularizar'::regclass
  and conname in ('prendas_por_regularizar_estado_check', 'prendas_por_regularizar_cierre_fk', 'prendas_por_regularizar_cierre_coherente');   -- 3
select estado, count(*) from retail.prendas_por_regularizar group by 1 order by 1;   -- las mismas cifras de la sonda: pegar no cierra nada
```

Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar` (entran al diccionario las dos tablas y las cuatro funciones).

- [ ] **Verificar en producción tras publicar (con cuenta de líder):** `/inventario/por-regularizar` muestra los tres botones; la hoja de «Identificar con
  sugerencias» en TRU propone unas 23; con una cuenta de colaboradora no sale ninguno. **No cerrar TRU todavía:** primero cuadrar su piso (ADR-0328,
  actividad 3), para que el conteo de arranque absorba la unidad de más que queda en las prendas que eran del sistema.
- [ ] **Decisión de Felipe — cierre de mes de Finanzas y costo desconocido** (tarea aparte lanzada): hoy el cierre de mes excluye la variante «Cargo
  especial» de su aviso de «ventas sin costo»; las cerradas quedan con costo 0 y no se nombran.
- [ ] **Tarea aparte lanzada:** Actividad anota la regularización bajo «Recibir» (`fn_actividad_regularizar`); debe ser `existencias`.
- [ ] **Si AQP o LIM no terminan de cargar el 15-oct:** ampliar `cola_arranque_plazo.hasta` con una migración de una línea (o proponer la pantalla para editarlo).
- [ ] **Deuda anterior que `pnpm focus` vuelve a señalar:** el modal «Regularizar prenda» (`PorRegularizarLista.tsx`) sigue `pendiente` en el registro de la guía de
  foco; lo toca la sesión de ADR-0328 (`inventory-module-redesign`), por eso no se tocó aquí.
- [ ] **Contrato para el motor del piso (`lib/piso-plan.ts`):** la velocidad cuenta `pendiente` y `cerrada_sin_prenda`. Avisado en `SESIONES-ACTIVAS.md` y en ADR-0328.
- [ ] **Regla de orden con el rediseño de Inventario (PR #787, `fn_piso_plan_lectura`):** no cerrar la cola de AQP antes de que ese motor cuente las cerradas, o la velocidad de AQP cae a 0 ese día. El PR que se fusione segundo comprueba el contrato.
- [ ] **Al refrescar el volcado de producción** (`pnpm datos:generar:produccion`, tras pegar la 4 y la 5): `cierres_cola_arranque` y `cola_arranque_plazo` ya tienen pájaro en `scripts/datos/aviario.mjs` (el mismo que `prendas_por_regularizar`); correr `pnpm datos:aviario` y commitear `AVIARIO.md`.
- [x] **Prueba SQL `responsable_omitido.mjs`:** su total pasa de 31 a 34 (mis 3 acciones: cerrar, reabrir, identificar); la detectó la sesión de ADR-0328 en su revisión.
