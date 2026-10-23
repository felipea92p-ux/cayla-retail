-- ============================================================================
-- 20261023223000_terminales_de_lima_firman_claudia.sql — CAYLA V2 (ADR-0454, actualización 2026-10-23; pedido de Felipe)
--
-- CAMBIA DE QUIÉN ES la firma de respaldo de las dos terminales de la Tienda LIM —«Caja Lima» y «Almacén Lima»—: de
-- Felipe Alvarez (20261019190000) a Claudia Pereyra, que es quien está en Lima. Desde que esto corre, lo que guardan esas
-- dos cuentas sin pedir «Responsable» queda firmado por ella (el aparato sigue en `terminal_id`).
--
-- NO ENCIENDE NADA: solo toca las terminales que YA tienen firma de respaldo. Si Lima ya volvió a pedir responsable
-- (`firma_respaldo_id` vacío), pegar esto no la apaga de nuevo.
--
-- NO REESCRIBE LA HISTORIA: lo firmado a nombre de Felipe entre el 2026-10-19 y hoy queda como está (`movimientos` es
-- append-only; esas filas se distinguen por `terminal_id`).
--
-- ORDEN: va DESPUÉS de 20261019190000. Si alguien vuelve a pegar esa (pone a Felipe), hay que pegar esta otra vez.
--
-- PARA VOLVER a pedir responsable en Lima (una línea, sin tocar la web):
--   update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;
--
-- En una base sin esa persona (local, CI) no hace nada y avisa. Re-ejecutable. Una sola parte: un `update` de datos
-- sobre `terminales`, sin políticas (ADR-0195).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  c_claudia constant uuid := '079e4764-6056-4fca-abb9-eaabd297e1ca'; -- public.personas: Claudia Pereyra (activa, con acceso a retail)
  v_filas integer;
begin
  -- Falla cerrado como fn_terminal_firma_respaldo_id: solo se nombra a quien está activa y tiene fila en colaboradores.
  if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                 where p.id = c_claudia and p.estado = 'activo') then
    raise notice 'ADR-0454: esta base no tiene a Claudia Pereyra activa en retail (no es producción); no se cambia ninguna terminal.';
    return;
  end if;

  update retail.terminales t
     set firma_respaldo_id = c_claudia
    from retail.ubicaciones u
   where u.id = t.ubicacion_id
     and u.nombre = 'Tienda LIM'
     and t.activo
     and t.firma_respaldo_id is not null
     and t.firma_respaldo_id is distinct from c_claudia;
  get diagnostics v_filas = row_count;
  raise notice 'ADR-0454: % terminal(es) de Tienda LIM firman ahora a nombre de Claudia Pereyra.', v_filas;
end $$;
