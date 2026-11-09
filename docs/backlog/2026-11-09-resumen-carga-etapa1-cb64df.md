## Carga de Finanzas ▸ Resumen — etapa 1 hecha, lo que sigue (2026-11-09)

- [ ] **Medir en producción una semana después**: `vercel logs --query finanzas_resumen_ms` (qué pieza del resumen pesa más) y la memoria comprometida
      en Observability ▸ Database al abrir Resumen. Con eso, afinar `CUPOS_PESADOS` (3) en `app/(app)/finanzas/resumen/page.tsx`.
- [ ] **El flujo de caja se calcula dos veces por carga**: `fn_resumen_finanzas` lo arma sin cobros y la página pide el completo
      (`getFlujoProximo`). Quitar uno pide cambiar `fn_resumen_finanzas` (un parámetro para no armarlo, o que traiga los cobros): migración.
- [ ] **El Observatorio** (Inicio del administrador) lanza cuatro lecturas de 1,6 a 2,8 s a la vez (liquidaciones vencidas ×2, la tienda, el
      resumen de variantes): el mismo turnero cuando se mida.
- [ ] **«Movimientos» de Resumen** (`fn_flujo_caja_real`, en su `Suspense`) no pasa por el turnero: medir cuánto pesa.
