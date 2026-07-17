-- Corrige un gap de RLS encontrado en revisión (ver project memory /
-- cayla-retail/CLAUDE.md): movimientos_select_propia_sede solo compara sede_id
-- (la sede ORIGEN en un traslado). Un Integrante en la sede que RECIBE el traslado
-- (sede_destino_id) no podía ver esa fila en su historial — el stock se actualiza
-- bien igual (vía el RPC security-definer), solo la fila de auditoría quedaba
-- invisible para esa sede.

create policy movimientos_select_sede_destino on movimientos for select
  using (sede_destino_id = fn_sede_actual_persona());
