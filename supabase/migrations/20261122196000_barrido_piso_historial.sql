-- ============================================================================
-- 20261122196000_barrido_piso_historial.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 9 · el historial
-- Pega DESPUÉS de 20261122195000_barrido_piso_por_resolver.sql (lee barrido_piso_resueltos: «Por resolver» del historial descuenta lo ya
-- resuelto, igual que la pantalla de la actividad 8): lo comprueba la guarda.
--
-- EL PROBLEMA PRIMERO. Felipe pidió que al final de cada conteo «se guarde con hora del conteo de cada prenda y al final salga en alguna
-- parte un historial de conteo total». Las lecturas, lo apartado y lo que se movió ya quedan guardados (nada se borra), pero solo se
-- veían mientras el barrido estaba abierto: confirmado, nadie podía volver a mirar quién contó qué ni qué corrigió. Con un barrido al
-- mes, la pregunta «¿quién contó la blusa que hoy no aparece?» llega semanas después.
--
-- QUÉ CREA. Dos funciones de solo lectura (las lecturas y lo apartado de un barrido ya se leen con `fn_barrido_piso_lecturas` y
-- `fn_barrido_piso_hallazgos`, también cerrado):
--   · `fn_barridos_piso_historial(sede, limite)`: los barridos de la sede, del más nuevo al más viejo, cada uno con su estado, quién lo
--     empezó y lo cerró, cuánto se escaneó, cuántas personas y, si se confirmó, cuántas pasaron al piso, volvieron al almacén y cuántas
--     siguen por resolver HOY (lo no cargado y lo apartado menos lo ya resuelto: la misma cuenta que «Por resolver», 20261122195000).
--   · `fn_barrido_piso_detalle(barrido)`: lo mismo de uno, más lo de cada persona (cuánto y entre qué horas), lo que se movió prenda por
--     prenda y lo que no estaba en la tienda.
-- Las ve quien ve Existencias en la sede (o el líder), como todo el barrido.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, a cualquier hora: dos funciones nuevas, sin tablas ni políticas. Idempotente.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'cuadres_piso' and column_name = 'barrido_id') then
    raise exception 'Falta cuadres_piso.barrido_id: pega antes 20261122193000_barrido_piso_confirmar.sql.';
  end if;
  if to_regclass('retail.barrido_piso_resueltos') is null then
    raise exception 'Falta barrido_piso_resueltos: pega antes 20261122195000_barrido_piso_por_resolver.sql.';
  end if;
end;
$guarda$;

-- Una fila del historial (interna): el barrido con sus cifras.
create or replace function retail.fn_barrido_piso_fila(p_barrido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select jsonb_build_object(
    'id', b.id,
    'ubicacion_id', b.ubicacion_id,
    'estado', b.estado,
    'abierto_en', b.abierto_en,
    'abierto_por', fn_actividad_nombre(b.abierto_por),
    'cerrado_en', b.cerrado_en,
    'cerrado_por', case when b.cerrado_por is null then null else fn_actividad_nombre(b.cerrado_por) end,
    'unidades', x.unidades,
    'lecturas', x.lecturas,
    'quitadas', x.quitadas,
    'personas', x.personas,
    -- Lo apartado que sigue sin resolver (cada apartado, menos lo que «Por resolver» ya cerró).
    'aparte', coalesce((select sum(greatest(h.cantidad - coalesce((select sum(z.cantidad) from barrido_piso_resueltos z where z.hallazgo_id = h.id), 0), 0))
                          from barrido_piso_hallazgos h where h.barrido_id = b.id and h.anulada_en is null), 0),
    'al_piso', (c.resumen ->> 'prendas_al_piso')::integer,
    'al_almacen', (c.resumen ->> 'prendas_al_almacen')::integer,
    -- Lo no cargado que sigue sin resolver (cada prenda de la foto al confirmar, menos lo ya resuelto de ella).
    'no_cargadas', case when c.id is null then null else coalesce((
        select sum(greatest((l ->> 'no_cargadas')::integer
                              - coalesce((select sum(z.cantidad) from barrido_piso_resueltos z
                                           where z.barrido_id = b.id and z.pendiente_variante_id = (l ->> 'variante_id')::uuid), 0), 0))
          from jsonb_array_elements(coalesce(c.no_cargado, '[]'::jsonb)) l), 0) end,
    'cuadre_id', c.id)
    from barridos_piso b
    left join cuadres_piso c on c.barrido_id = b.id
    -- Una sola pasada por las lecturas del barrido (antes eran cuatro: 2,1 s con 100 barridos de 5.000 lecturas; así, 0,8 s).
    cross join lateral (
      select coalesce(sum(l.cantidad) filter (where l.anulada_en is null), 0)::integer as unidades,
             (count(*) filter (where l.anulada_en is null))::integer as lecturas,
             (count(*) filter (where l.anulada_en is not null))::integer as quitadas,
             (count(distinct l.persona_id) filter (where l.anulada_en is null))::integer as personas
        from barrido_piso_lecturas l where l.barrido_id = b.id) x
   where b.id = p_barrido_id;
$fn$;

comment on function retail.fn_barrido_piso_fila(uuid) is
  'ADR-0690 (actividad 9): un barrido con sus cifras para el historial (sede, estado, quién y cuándo, lo escaneado y lo quitado, personas con lecturas vigentes, lo apartado que sigue sin resolver y, si se confirmó, lo que se movió y lo no cargado que sigue sin resolver). Interna.';

create or replace function retail.fn_barridos_piso_historial(p_ubicacion_id uuid, p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'Para ver el barrido del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using errcode = '42501', hint = 'barrido_sin_permiso';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from barridos_piso b where b.ubicacion_id = p_ubicacion_id),
    'barridos', coalesce((
      select jsonb_agg(fn_barrido_piso_fila(x.id) order by x.abierto_en desc, x.id)
        from (select b.id, b.abierto_en from barridos_piso b where b.ubicacion_id = p_ubicacion_id
               order by b.abierto_en desc, b.id limit v_limite) x), '[]'::jsonb));
end;
$fn$;

comment on function retail.fn_barridos_piso_historial(uuid, integer) is
  'ADR-0690 (actividad 9): los barridos del piso de la sede, del más nuevo al más viejo (hasta p_limite, de 1 a 200; 50 por defecto), cada uno con fn_barrido_piso_fila, y cuántos hay en total. Quien ve Existencias en la sede (o el líder). Solo lectura.';

create or replace function retail.fn_barrido_piso_detalle(p_barrido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sede uuid;
begin
  v_sede := (select b.ubicacion_id from barridos_piso b where b.id = p_barrido_id);
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(v_sede)) then
    raise exception 'Para ver el barrido del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using errcode = '42501', hint = 'barrido_sin_permiso';
  end if;
  return fn_barrido_piso_fila(p_barrido_id) || jsonb_build_object(
    'sede', (select u.nombre from ubicaciones u where u.id = v_sede),
    -- Cada persona con lecturas vigentes (la misma cuenta que «personas»): lo que sigue contando y entre qué horas escaneó (la hora del
    -- aparato si la trajo). Lo que quitó o le quitaron se ve en «Ver cada lectura».
    'por_persona', coalesce((
      select jsonb_agg(jsonb_build_object('persona_id', p.persona_id, 'nombre', fn_actividad_nombre(p.persona_id),
                                          'unidades', p.unidades, 'lecturas', p.lecturas, 'quitadas', p.quitadas,
                                          'desde', p.desde, 'hasta', p.hasta)
                       order by p.unidades desc, p.desde)
        from (select l.persona_id,
                     coalesce(sum(l.cantidad) filter (where l.anulada_en is null), 0) as unidades,
                     count(*) filter (where l.anulada_en is null) as lecturas,
                     count(*) filter (where l.anulada_en is not null) as quitadas,
                     min(coalesce(l.leida_en_aparato, l.leida_en)) filter (where l.anulada_en is null) as desde,
                     max(coalesce(l.leida_en_aparato, l.leida_en)) filter (where l.anulada_en is null) as hasta
                from barrido_piso_lecturas l where l.barrido_id = p_barrido_id
               group by l.persona_id
              having count(*) filter (where l.anulada_en is null) > 0) p), '[]'::jsonb),
    -- Lo que movió el barrido al confirmarse, prenda por prenda.
    'movidas', coalesce((
      select jsonb_agg(jsonb_build_object('variante_id', i.variante_id, 'prenda', coalesce(fn_prenda_corta(i.variante_id), 'Una prenda'),
                                          'sentido', i.sentido, 'cantidad', i.cantidad)
                       order by i.sentido, fn_prenda_corta(i.variante_id))
        from cuadres_piso c join cuadre_piso_items i on i.cuadre_id = c.id
       where c.barrido_id = p_barrido_id), '[]'::jsonb),
    -- Lo que no estaba en la tienda (no se movió), como quedó al confirmar.
    'no_cargado', coalesce((select c.no_cargado from cuadres_piso c where c.barrido_id = p_barrido_id), '[]'::jsonb));
end;
$fn$;

comment on function retail.fn_barrido_piso_detalle(uuid) is
  'ADR-0690 (actividad 9): un barrido del piso para su historial: fn_barrido_piso_fila más la sede, lo de cada persona (unidades, lecturas, quitadas, desde y hasta), lo que movió al confirmarse (cuadre_piso_items) y lo no cargado. Las lecturas y lo apartado se leen con fn_barrido_piso_lecturas y fn_barrido_piso_hallazgos. Quien ve Existencias en la sede (o el líder). Solo lectura.';

revoke all on function retail.fn_barrido_piso_fila(uuid) from public, anon, authenticated;
revoke all on function retail.fn_barridos_piso_historial(uuid, integer) from public, anon;
grant execute on function retail.fn_barridos_piso_historial(uuid, integer) to authenticated;
revoke all on function retail.fn_barrido_piso_detalle(uuid) from public, anon;
grant execute on function retail.fn_barrido_piso_detalle(uuid) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
