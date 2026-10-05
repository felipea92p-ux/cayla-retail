## 🧹 Cierre de mes: las ventas cerradas sin prenda salen como un aviso que no bloquea (2026-10-04, ADR-0335) — **SQL YA en producción (2026-10-04, verificado por efectos)**; rama `claude/cierre-mes-ventas-cerradas-sin-prenda` (apilada sobre `claude/unregistered-merchandise-solutions-860786`, ADR-0334)

Decisión de Felipe (2026-10-04): opción A — aviso que no bloquea y queda en `periodo_cierres.avisos`. Producción el 2026-10-04 (solo lectura): septiembre tiene 31
ventas sin registrar pendientes (AQP 26 por S/ 1,170.80; TRU 5 por S/ 370.60) que hoy BLOQUEAN el cierre de septiembre; octubre, 236 más.

- [x] **Migración** `20261005130000_cierre_mes_avisa_ventas_cerradas_sin_prenda.sql`: parche anclado a `fn_cierre_mes_estado` (CTE `cs` + chequeo `cerrada_sin_prenda`,
  `diario` 8→9, `huella` 9→10). No toca tablas ni políticas. Independiente de ADR-0334 (compara el estado como texto).
- [x] **Web:** `lib/cierre-reglas.ts` (texto, título, enlace «Ver ventas», `etiquetaEnlace`), `components/finanzas/CierreMes.tsx` (el botón). Arreglado de paso: el enlace del
  chequeo `regularizar` iba a `/recibir` (que desde ADR-0330 ya no muestra la lista) y ahora va a `/inventario/por-regularizar?ubicacion=…`.
- [x] **Pruebas:** `pnpm pruebas:cierre-mes` 124 casos (bloque G nuevo, 20), mutación 8 de 8, `cierre-reglas.test.ts` 26, navegador a 375 px y escritorio.

### Pegado en producción el 2026-10-04 por Felipe (UNA ejecución). Lo de abajo queda como registro y como receta de verificación

- [x] **Pegada y verificada:** la función viva dio `ea9dede5a8c7a70191867b31bd1c6f73` y 13,199 caracteres (lo esperado), la delegación de ADR-0253 sigue en pie y la cola
  quedó igual (267 pendientes, 1 anulada, 0 cerradas: el aviso aparecerá cuando un líder cierre la cola de arranque, ADR-0334).

Se puede pegar en cualquier momento del día (solo reemplaza el texto de una función) y antes o después de las cinco migraciones de ADR-0334. La web de este cambio
puede publicarse antes o después: sin la migración el aviso no aparece y el resto funciona igual.

**Sonda previa (solo lectura)** — la función viva debe ser exactamente la que se probó:

```sql
select md5(pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) as huella,
       length(pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) as largo;
-- esperado: eb662db552768944df408abc3b483778 y 12311 (medido en producción el 2026-10-04). Si es OTRA huella, NO pegar: alguien cambió la función y el parche
-- anclado se abortaría solo (cada ancla debe aparecer exactamente una vez), pero hay que revisar qué cambió antes.
select estado, count(*) from retail.prendas_por_regularizar group by 1 order by 1;   -- anotar: pegar esta migración NO cambia ninguna fila
```

**Comprobación posterior (solo lectura):**

```sql
select md5(pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) as huella,
       length(pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) as largo;
-- esperado: ea9dede5a8c7a70191867b31bd1c6f73 y 13199
select position('fn_puede_cerrar_mes' in pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) > 0;   -- true: la delegación (ADR-0253) sigue
```

(El SQL Editor no tiene sesión, así que `fn_cierre_mes_estado` no se puede llamar desde ahí: pide `fn_puede_cerrar_mes()`. La prueba funcional es entrar con una cuenta de líder.)

- [ ] **Verificar en producción tras pegar (con cuenta de líder):** Finanzas ▸ Cierre de mes de septiembre muestra «Ventas cerradas sin prenda» solo si ya se cerró la cola
  de arranque (ADR-0334); antes, septiembre sigue mostrando «Prendas vendidas regularizadas» como bloqueo.
- [ ] **Tarea aparte — el Estado de resultados tiene la misma exclusión** (`fn_estado_resultados`, `sc` / `unidades_sin_costo`, verificado en producción el 2026-10-04):
  el margen que lee el contador a diario sale inflado sin aviso, y el cierre lo congela. Además `fn_rentabilidad` cuenta la centinela como «sin costo» y
  `fn_estado_resultados` no (dos pantallas dicen distinto). Decidir con Felipe si el reporte avisa siempre (lo recomendable) o solo al cerrar.
- [ ] **Tarea aparte (ADR-0334):** la hoja de «Reabrir» una venta cerrada debería avisar que, si su mes ya está cerrado, regularizarla exige reabrir el mes (el candado de
  `venta_items` frena el cambio de costo).
- [ ] **Quien vuelva a tocar `fn_cierre_mes_estado`:** su texto vivo NO es el del archivo `20260925180000` (ADR-0253 y ADR-0335 la parcharon). Parchea por ancla, no la recrees.
