-- ============================================================================
-- Compradores lee la plata del fondo de cada persona (ADR-0704, actualización del 2026-11-26)
--
-- EL PROBLEMA (Felipe, 2026-11-26: «¿por qué sale que Bhekam no tiene nada? Claudia tiene fondos y no aparece»)
--   La tarjeta de Compradores decía «Le diste S/ 0 · Le queda S/ 0» a quien tenía S/ 13,800 en la mano, y no listaba a quien tenía plata
--   sin haber abierto su ronda. Dos causas, las dos de lectura (la plata estaba bien en los libros):
--     1. «Le diste» salía de `fn_ronda_compras_cuenta`, que solo suma la plata que la persona ANOTÓ dentro de su ronda
--        (`fondo_plata_anotada.ronda_id`). Lo que la oficina entrega con «Entregar plata» va directo a su fondo (`movimientos_dinero`,
--        `entrega_fondo`) y no deja fila ahí; tampoco cuenta lo anotado unos segundos antes de abrir la ronda, ni lo que quedó de la anterior.
--        De ahí salían también dos avisos falsos de «pagó más de lo que le diste».
--     2. `fn_compradores` recorre `compra_rondas`: sin ronda, no hay tarjeta.
--
-- QUÉ HACE (dos lecturas; ninguna tabla, política ni dato cambia)
--   1. `fn_compradores()`: cada ronda ABIERTA suma `tiene`, lo que la persona tiene hoy en la mano (`fn_mi_plata_tiene`, la misma cifra
--      que ella ve en «Mis compras»). Con eso la pantalla hace la cuenta como «Mis compras»: le queda = tiene; le diste = tiene + lo que
--      gastó. Una ronda cerrada manda `tiene` nulo y conserva su cuaderno. Todo lo demás, igual que en 20261126152000.
--   2. `fn_compradores_sin_ronda()` (módulo `fondos`): quién tiene plata de CAYLA en la mano y no tiene una ronda abierta, con cuánto y
--      cuándo fue su última entrega. Solo saldos a favor: lo que CAYLA le debe a alguien ya sale en su ronda cerrada.
--
-- Se pega tal cual en producción: solo `create or replace function`, idempotente. La web vieja ignora el dato nuevo y la nueva, sin esta
-- migración, sigue con la cuenta de antes (y lo dice el registro del servidor): no importa cuál llegue primero.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 1. Compradores: la misma lectura de 20261126152000, más lo que cada persona tiene hoy en la mano.
create or replace function retail.fn_compradores()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver a los compradores necesita el módulo Compradores en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'texto', retail.fn_ronda_compras_texto(r.id),
             'persona_id', r.persona_id, 'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
             'abierta_en', r.abierta_en, 'cerrada_en', r.cerrada_en,
             'cierre', (select jsonb_build_object('decision', ci.decision, 'monto', ci.monto, 'resuelto', ci.resuelto_en is not null)
                          from retail.compra_cierres ci where ci.id = r.cierre_id),
             'cuenta', retail.fn_ronda_compras_cuenta(r.id),
             -- Lo que tiene hoy en la mano, de su fondo (20261126223000). Solo con la ronda abierta: una cerrada ya hizo su cuenta.
             'tiene', case when r.cerrada_en is null then retail.fn_mi_plata_tiene(r.persona_id) end,
             'ultima_compra_en', (select max(cp.created_at) from retail.compra_papeles cp where cp.ronda_id = r.id and cp.estado <> 'anulado'),
             'compras', coalesce((select jsonb_agg(retail.fn_compra_de_papel(cp.id) order by cp.fecha desc, cp.created_at desc)
                                    from retail.compra_papeles cp where cp.ronda_id = r.id and cp.estado <> 'anulado'), '[]'::jsonb))
           order by r.cerrada_en is not null, coalesce(r.cerrada_en, r.abierta_en) desc)
      from retail.compra_rondas r
      left join public.personas pe on pe.id = r.persona_id
     where r.cerrada_en is null or r.cerrada_en >= now() - interval '60 days'), '[]'::jsonb);
end;
$function$;
revoke all on function retail.fn_compradores() from public, anon;
grant execute on function retail.fn_compradores() to authenticated;

-- 2. Quién tiene plata en la mano y todavía no abrió su ronda. Candidatos: quien tiene un fondo vivo o plata anotada por confirmar.
create or replace function retail.fn_compradores_sin_ronda()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver a los compradores necesita el módulo Compradores en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'persona_id', x.persona_id, 'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
             'tiene', x.tiene, 'ultima_entrega', x.ultima_entrega)
           order by x.tiene desc, pe.nombres, x.persona_id)
      from (select q.persona_id, retail.fn_mi_plata_tiene(q.persona_id) as tiene,
                   greatest(
                     (select max(d.fecha) from retail.movimientos_dinero d
                       where d.tipo = 'entrega_fondo' and d.estado = 'vigente'
                         and d.cuenta_destino_id = retail.fn_fondo_de(q.persona_id, false)),
                     (select max(a.fecha) from retail.fondo_plata_anotada a
                       where a.persona_id = q.persona_id and a.estado = 'por_confirmar')) as ultima_entrega
              from (select c.persona_id from retail.cuentas_dinero c
                     where c.tipo = 'fondo' and c.archivada_en is null and c.persona_id is not null
                    union
                    select a.persona_id from retail.fondo_plata_anotada a where a.estado = 'por_confirmar') q
             where not exists (select 1 from retail.compra_rondas r where r.persona_id = q.persona_id and r.cerrada_en is null)) x
      left join public.personas pe on pe.id = x.persona_id
     where x.tiene > 0.005), '[]'::jsonb);
end;
$function$;
revoke all on function retail.fn_compradores_sin_ronda() from public, anon;
grant execute on function retail.fn_compradores_sin_ronda() to authenticated;
