## Carga de Finanzas ▸ Resumen — etapa 1 hecha, lo que sigue (2026-11-09)

- [ ] **Medir en producción una semana después**: `vercel logs --query finanzas_resumen_ms` (qué pieza del resumen pesa más) y la memoria comprometida
      en Observability ▸ Database al abrir Resumen. Con eso, afinar `CUPOS_PESADOS` (3) en `app/(app)/finanzas/resumen/page.tsx`.
- [x] **El flujo de caja se calcula una sola vez** (2026-11-09, `20261109175000` + `flujoDelResumen`).
- [ ] **El Observatorio** (Inicio del administrador, `lib/observatorio.ts`): `getAvisosObservatorio` lanza más de 14 lecturas a la vez, varias
      tienda por tienda. La pieza cara es `fn_resumen_variantes_json` (medido en producción el 2026-11-09: 1,5 s de promedio, picos de 6,6 s,
      ~31.000 bloques por llamada y 31.584 bloques temporales a disco). Las de liquidaciones que coinciden en el mismo minuto son de Dynamic.
- [ ] **«Movimientos» de Resumen** (`fn_flujo_caja_real`, en su `Suspense`) no pasa por el turnero: medir cuánto pesa.
