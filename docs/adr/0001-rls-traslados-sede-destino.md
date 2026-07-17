# ADR-0001 — RLS: visibilidad de traslados para la sede que los recibe

**Fecha:** 2026-07-17
**Estado:** Aplicado en producción

## Contexto

`movimientos_select_propia_sede` (0003_rls.sql) solo comparaba `sede_id`, que en un
`traslado` es la sede ORIGEN. Un Integrante en la sede que RECIBE el traslado no podía
ver esa fila en su historial — el stock se actualizaba bien igual, vía el RPC
`security definer` `fn_aplicar_movimiento`, que no depende de RLS para operar. Solo
la fila de auditoría quedaba invisible para esa sede. Era inofensivo en Fase 1 (no
había vista de historial); se volvió visible al construir `/producto/[varianteId]`.

## Decisión

Agregar una policy nueva en vez de modificar la existente, para no arriesgar el
comportamiento ya verificado de líder/sede-origen:

```sql
create policy movimientos_select_sede_destino on movimientos for select
  using (sede_destino_id = fn_sede_actual_persona());
```

Ver `supabase/migrations/0005_movimientos_select_sede_destino.sql`.

## Alternativas descartadas

- Reescribir `movimientos_select_propia_sede` con un `or sede_destino_id = ...`: más
  cambio de lo necesario sobre una policy ya en producción y verificada; una policy
  adicional es más simple de auditar y de revertir si algo sale mal.

## Consecuencias

Un Integrante ahora ve en su historial tanto lo que sale de su sede como lo que
recibe por traslado. Sin cambio de comportamiento para Líder (ya veía todo).
