## 🧾 Finanzas ▸ Resumen por bloques y el ranking de sus sub-cuentas (2026-11-13, ADR-0661) — rama `claude/resumen-por-bloques`, migración `20261113235000` SIN pegar

- [x] **Medido, en producción y en la copia de un año.** El ranking va abajo. Medidor reproducible: `node scripts/rendimiento/medir-resumen-finanzas.mjs`
      (contra `cayla_carga`, como el líder del seed, mediana de 3 con `explain (analyze, buffers)` por pieza, con los mismos argumentos que usan por dentro).
- [x] **`fn_resumen_finanzas_partes`** + `fn_resumen_finanzas` como su envoltorio, con candado md5 (`061a3cec…`), idempotente. md5 de la salida igual antes y
      después en 16 casos y dos bases. `pnpm pruebas:resumen-por-partes` (26/26, en el CI) y `pnpm pruebas:resumen-finanzas` (68/68) en verde.
- [x] **La página por bloques:** tres lecturas a la vez, la puerta (primero la rápida y el mes), cada bloque con `use()` en su `Suspense` y `EsperaBloque` en
      su lugar. Mismas cifras que `main` en cinco casos (HTML del servidor, misma copia). Copia de un año: lo primero a ~2,1–2,3 s (antes 6,8 s), CLS 0,003
      a 1440 y 0 a 375, claro/oscuro/quieto/vivo. Respaldo probado: sin la función por partes, la página sale entera como hoy.
- [x] **Logs nuevos:** `finanzas_resumen_bloque` (un registro por bloque, ms desde que empezó la página). `finanzas_resumen_ms` sigue con las 13 partes.
- [x] `/milimetro auditar /finanzas/resumen`: 0 hallazgos en lo nuevo (`docs/milimetro/auditorias/2026-11-13-finanzas-resumen-por-bloques.md`).
- [ ] **Pegar `20261113235000` en producción** (OK de Felipe; antes de fusionar; una parte). Verificar md5 `6f5cc4f3…` (envoltorio) y `cb1b94d1…` (por partes).
- [ ] **A las 24 h de publicar:** `vercel logs --query finanzas_resumen_bloque` — ¿`cabecera`/`libre` bajo 1,5 s? ¿qué bloque llega último? Y `tiempo_de_pantalla`
      de `/finanzas/resumen` (el cronómetro del clic ahora mide hasta lo primero útil, no hasta todo).
- [ ] **Sin probar con el panel visible:** con el panel del navegador oculto, React no revela los bloques (espera un cuadro de pintura); la verificación visual
      se hizo con Chromium sin pantalla (Playwright). Mirarlo una vez a ojo en un navegador normal, en claro y oscuro.
- [ ] Las tres propuestas para bajar el total (abajo): esperan a Felipe (dinero).

### El ranking

**`fn_resumen_finanzas` en producción** (su propio `ms`, mediana de 10 cargas mirando CAYLA entera, 12–13 nov; total 4,3 s):

| # | Parte | Mediana | Qué arma |
|---:|---|---:|---|
| 1 | `resultados_mes` | 2.052 ms | `fn_estado_resultados(1 nov, hoy)` en vivo: el mes en curso no tiene foto (ADR-0633) |
| 2 | `presupuesto` | 944 ms | `fn_presupuesto_vs_real`: por dentro vuelve a armar `fn_estado_resultados(1 nov, hoy)` |
| 3 | `resultados_anterior` | 404 ms | `fn_estado_resultados(octubre)`, con su foto (antes de la foto: ~1,35 s) |
| 4 | `flujo` | 335 ms | `fn_flujo_caja_proyeccion(6)` |
| 5 | `campanas` | 99 ms | `fn_campanas_reporte` |
| 6 | `igv` | 68 ms | `fn_impuestos_panel` |
| 7–13 | `cuentas` 39 · `por_pagar` 39 · `sin_cuenta` 23 · `egresos` 15 · `raros` 7 · `fijos` 5 · `cierre` 4 | ≈ 130 ms | |

**Las tres primeras son ~78 %** (≈ 3,4 s de 4,3 s), y las dos primeras arman lo mismo dos veces.

**En la copia de un año** (`cayla_carga`, 131.000 ventas sintéticas, sin gastos ni dinero; mediana de 3; ms / bloques de 8 kB):

| Pieza | ms | bloques |
|---|---:|---:|
| `fn_resumen_finanzas` entera | 2.573 | 595.005 |
| `flujo` | 665 | 96.012 |
| `resultados_anterior` | 643 | 156.382 |
| `presupuesto` | 402 | 126.150 |
| `igv` | 269 | 90.947 |
| `resultados_mes` | 263 | 110.892 |
| `campanas` | 215 | 23.389 |
| `cuentas` | 119 | 18.128 |
| `sin_cuenta` | 114 | 17.440 |
| `por_pagar` · `raros` · `egresos` · `fijos` · `cierre` | 11 · 4 · 3 · 2 · 2 | 5.067 · 2.676 · 1.978 · 1.721 · 993 |
| `fn_balance_por_tienda` entera | 484 | 133.124 |
| ↳ `fn_estado_resultados` (1 nov, hoy) | 258 | 110.892 |
| ↳ `fn_bal_stock` | 123 | 10.886 |
| ↳ `fn_bal_dinero` | 114 | 17.389 |
| ↳ `fn_bal_activos` · `fn_bal_facturas_de_tienda` | 1 · 1 | 776 · 1.087 |

La copia ordena distinto que producción porque solo tiene ventas: el estado de resultados de producción pesa por el dinero, la caja y las compras de verdad
(`fn_asientos_dinero_y_caja`, ADR-0622 act. 2026-11-09), que la copia no tiene; y la caja que viene y el IGV pesan más en la copia por su año de ventas.
**El orden que manda es el de producción.** En las dos, el balance de cada sede gasta la mitad o más en su propio estado de resultados del mes (en producción
`fn_balance_por_tienda` mide 2,4 s de media y su estado de resultados es el mismo de `resultados_mes`, ~2 s).

**Lo demás que pide la página, en producción** (`pg_stat_statements`, media por llamada): `fn_flujo_caja_real` 696 ms × 6 (Movimientos, un día cada una),
`fn_rendimiento_serie` 948 ms × cada tienda, `fn_estado_resultados` (la comparación) 856 ms, `fn_finanzas_confianza` 727 ms, `fn_planilla_provision` 698 ms
(~2–3 por carga), `fn_costo_estimado_resumen` 327 ms × cada sede. Con 2 núcleos, una carga son ~15–18 s de base: por eso la puerta.

### Propuestas para bajar el total (no hechas; esperan a Felipe)

1. **Armar el estado de resultados del mes una sola vez por carga.** Hoy lo arman `resultados_mes`, `presupuesto` (dentro de `fn_presupuesto_vs_real`) y
   `fn_balance_por_tienda`. Que las dos últimas lo reciban ya armado (un parámetro con las filas, o una tabla temporal de la transacción). Ahorro estimado:
   ~0,9 s (presupuesto) + ~2 s (balance) de base por carga. Toca dinero y dos funciones de Finanzas: con su md5, su igualdad y el OK de Felipe.
2. **Foto de los días ya terminados del mes en curso** (extiende ADR-0633; ya está en `docs/innovacion/2026-11-13-cambiar-de-modulo.md`): el mes en vivo
   pasaría a ser solo hoy, y bajan las tres a la vez. ⚠ Cambia el punto 1 de ADR-0633 (el mes en curso nunca tiene foto).
3. **Pedir de una vez lo que hoy se pide de a uno:** Movimientos (6 llamadas de un día), las ventas por día (una por tienda), el costo estimado (una por sede).
