-- ============================================================================
-- 20261111175000 — Corregir el proveedor de UNA marca en una recepción «sin aviso» (también cerrada) y unir una compra aunque falte lo que ya
-- entró por otra vía (ADR-0636, act. 2026-11-11 c)
--
-- EL PROBLEMA PRIMERO. ENV-010 de Trujillo (Valeria Mia Peru Moda EIRL, 28 prendas: 15 pantalones y 13 chalecos) quedó en «Seguir recibiendo» con
-- 10 contadas, pero sus prendas ya habían llegado: 15 pantalones y 12 chalecos por la recepción «sin aviso» ENV-005 (cerrada el 7-nov), y el
-- chaleco 13 con «Ajustar stock» el 6-nov a las 4:50 pm, mientras se contaba ENV-005. El stock está bien (28). Dos cosas frenaban la unión:
--   1. ENV-005 (269 prendas de nueve marcas) quedó entera a nombre de «CAYLA SAC». `corregir_proveedor_envio` cambia el envío ENTERO, y
--      `poner_proveedor_de_marca` solo pasa de «por confirmar» a uno, con el envío abierto. No había cómo decir «lo de Valeria Mia es de Valeria Mia
--      Peru Moda EIRL» en una recepción cerrada.
--   2. La unión se niega si llegó menos de lo comprado (`union_llego_menos`): por la recepción llegaron 27 de 28.
--
-- LAS DECISIONES
--   1. `corregir_proveedor_de_marca(despacho, marca, proveedor, motivo)`: lo recibido y lo contado de ESA marca pasan al proveedor real, con sus
--      movimientos movidos al lote de ese proveedor en el mismo envío (como `poner_proveedor_de_marca`). Abierta o cerrada. Mismo permiso que
--      corregir el proveedor del envío (ver el dinero de Compras, Felipe 2026-11-03). Se niega si lo recibido ya está unido a una factura.
--   2. El candado «una recepción unida no cambia de proveedor» se acota: solo se frena mover filas DESDE o HACIA un proveedor ya unido a esa
--      recepción (que es lo que rompería el reparto). Corregir otra marca de la misma recepción ya no queda bloqueado para siempre.
--   3. Felipe, 2026-11-11 («Unir con 27»): un Admin puede unir aunque haya llegado menos, cuando lo que falta ya entró por otra vía. Se pide con la
--      marca de transacción `retail.union_acepta_faltante = 'si'`, que la pantalla no pone: hoy solo lo hace un script revisado. El comprobante
--      queda con 27 «recibido antes»; la prenda 28 no se puede recibir otra vez (la línea no tiene prenda y la compra unida no se manda ni se
--      recibe por otro camino). En contabilidad ese chaleco queda como sobrante del ajuste: lo reclasifica el contador si quiere.
-- QUÉ NO CAMBIA. Stock, movimientos (salvo su lote, que dice de quién vino) ni costos. Las demás reglas de la unión siguen igual.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin políticas ni `alter table` (ADR-0195). Va DESPUÉS de 20261111152000. Los reemplazos anclados
--   abortan si el texto no aparece exactamente una vez.
-- VERIFICACIÓN (solo lectura): select to_regprocedure('retail.corregir_proveedor_de_marca(uuid,uuid,uuid,text)') is not null,
--   position('union_acepta_faltante' in pg_get_functiondef('retail.unir_recepcion_con_compra(uuid,uuid,uuid)'::regprocedure)) > 0;
-- CÓMO SE DESHACE: drop function retail.corregir_proveedor_de_marca(uuid,uuid,uuid,text); y volver a pegar `fn_unida_proveedor_fijo` y la sección
--   7 de 20261110011000 (con 20261111152000 encima).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_175(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió (el ancla aparece % veces): no se reemplaza. Regenera esta migración desde su definición real.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Corregir el proveedor de una marca ----------
create or replace function retail.corregir_proveedor_de_marca(p_despacho_id uuid, p_marca_id uuid, p_proveedor_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_despacho retail.despachos;
  v_actor uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_nombre text;
  v_marca text;
  v_recibidos uuid[];
  v_antes uuid[];
  v_lote_real uuid;
  v_movs uuid[];
  v_modo "char";
  v_pasaron integer := 0;
  v_conteos integer := 0;
  v_prendas uuid[];
begin
  if retail.fn_puede_ver_dinero_de_compras() is not true then
    raise exception 'Corregir el proveedor necesita ver el dinero de Compras' using errcode = '42501', hint = 'sin_dinero_de_compras';
  end if;
  for v_despacho in select * from retail.despachos d where d.id = p_despacho_id for update loop exit; end loop;
  if v_despacho.id is null then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if not exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Este envío vino de Compras: su proveedor es el de sus órdenes' using hint = 'envio_no_es_sin_aviso';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Escribe por qué se corrige (hasta 300 letras)' using hint = 'corregir_motivo';
  end if;
  v_nombre := (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo and not coalesce(pr.por_confirmar, false));
  if v_nombre is null then
    raise exception 'Elige de quién llegó: un proveedor activo' using hint = 'recepcion_proveedor';
  end if;
  v_marca := coalesce((select m.nombre from retail.marcas m where m.id = p_marca_id), 'lo sin marca');

  -- Lo recibido de esa marca que todavía no es de ese proveedor.
  v_recibidos := array(select r.id from retail.despacho_recibidos r
                        where r.despacho_id = p_despacho_id and r.despacho_item_id is null
                          and r.marca_id is not distinct from p_marca_id and r.proveedor_id is distinct from p_proveedor_id
                        order by r.id);
  v_antes := array(select distinct r.proveedor_id from retail.despacho_recibidos r where r.id = any (v_recibidos) and r.proveedor_id is not null);
  if cardinality(v_recibidos) = 0
     and not exists (select 1 from retail.despacho_conteos k where k.despacho_id = p_despacho_id and k.despacho_item_id is null
                       and k.marca_id is not distinct from p_marca_id and k.proveedor_id is distinct from p_proveedor_id) then
    raise exception 'Lo de % en este envío ya es de %', v_marca, v_nombre using hint = 'proveedor_igual';
  end if;
  if exists (select 1 from retail.despacho_recibidos r where r.id = any (v_recibidos) and r.compra_item_id is not null) then
    raise exception 'Lo recibido ya está unido a una factura: el proveedor se corrige en Compras' using hint = 'proveedor_con_factura';
  end if;

  -- Los movimientos de esa marca pasan al lote del proveedor real en este mismo envío (se crea copiando el lote de donde salen).
  if cardinality(v_recibidos) > 0 then
    v_lote_real := (select l.id from retail.lotes l where l.despacho_id = p_despacho_id and l.proveedor_id = p_proveedor_id order by l.id limit 1);
    if v_lote_real is null then
      insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia, fecha_recepcion, recibido_por, nota, despacho_id)
      select l.ubicacion_id, p_proveedor_id, l.numero_guia, l.fecha_recepcion, l.recibido_por, l.nota, l.despacho_id
        from retail.despacho_recibidos r join retail.movimientos m on m.id = r.movimiento_id join retail.lotes l on l.id = m.lote_id
       where r.id = any (v_recibidos)
       order by l.id limit 1
      returning id into v_lote_real;
    end if;
    v_movs := coalesce((
      select array_agg(x.id)
        from retail.despacho_recibidos r
        cross join lateral (values (r.movimiento_id), (r.movimiento_danada_id)) x(id)
       where r.id = any (v_recibidos) and x.id is not null), '{}');

    if v_lote_real is not null and cardinality(v_movs) > 0 then
      perform set_config('lock_timeout', '3s', true);
      begin
        lock table retail.movimientos in share row exclusive mode;
        -- El candado de historial se apaga SOLO dentro de esta transacción, para cambiar el lote (de quién vino), y vuelve a su modo.
        v_modo := (select t.tgenabled from pg_trigger t where t.tgrelid = 'retail.movimientos'::regclass and t.tgname = 'movimientos_inmutables');
        if v_modo is null then
          raise exception 'Falta el candado de historial movimientos_inmutables: no se cambia nada hasta revisar la base.';
        end if;
        alter table retail.movimientos disable trigger movimientos_inmutables;
        update retail.movimientos m set lote_id = v_lote_real
         where m.id = any (v_movs) and m.lote_id is distinct from v_lote_real
           and m.lote_id in (select l.id from retail.lotes l where l.despacho_id = p_despacho_id);
        get diagnostics v_pasaron = row_count;
        execute format('alter table retail.movimientos enable %s trigger movimientos_inmutables',
                       case v_modo when 'A' then 'always' when 'R' then 'replica' else '' end);
        if v_modo = 'D' then
          alter table retail.movimientos disable trigger movimientos_inmutables;
        end if;
        if (select t.tgenabled from pg_trigger t where t.tgrelid = 'retail.movimientos'::regclass and t.tgname = 'movimientos_inmutables')
           is distinct from v_modo then
          raise exception 'El candado movimientos_inmutables no volvió a su modo: no se guarda nada.';
        end if;
      exception when lock_not_available or deadlock_detected then
        raise exception 'En este momento la tienda está registrando un movimiento. Vuelve a intentar en unos segundos.' using hint = 'proveedor_ocupado';
      end;
    end if;
  end if;

  -- Una prenda con marca necesita el vínculo marca-proveedor (`productos_marca_proveedor_fk`).
  if p_marca_id is not null then
    insert into retail.marca_proveedores (marca_id, proveedor_id) values (p_marca_id, p_proveedor_id) on conflict do nothing;
  end if;
  perform set_config('retail.corrige_proveedor', 'si', true);
  update retail.despacho_recibidos r set proveedor_id = p_proveedor_id where r.id = any (v_recibidos);
  update retail.despacho_conteos k set proveedor_id = p_proveedor_id
   where k.despacho_id = p_despacho_id and k.despacho_item_id is null
     and k.marca_id is not distinct from p_marca_id and k.proveedor_id is distinct from p_proveedor_id;
  get diagnostics v_conteos = row_count;
  -- Las prendas de esa marca que nacieron con el proveedor equivocado y solo han entrado por este envío.
  v_prendas := array(
    select p.id from retail.productos p
     where p.proveedor_id = any (v_antes) and p.marca_id is not distinct from p_marca_id
       and exists (select 1 from retail.despacho_recibidos r join retail.variantes v on v.id = r.variante_id
                    where r.despacho_id = p_despacho_id and v.producto_id = p.id)
       and not exists (select 1 from retail.movimientos m join retail.variantes v on v.id = m.variante_id
                        left join retail.lotes l on l.id = m.lote_id
                       where v.producto_id = p.id and m.tipo = 'entrada' and l.despacho_id is distinct from p_despacho_id));
  update retail.productos p set proveedor_id = p_proveedor_id where p.id = any (v_prendas);
  perform set_config('retail.corrige_proveedor', '', true);

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_aviso_proveedor_de_marca_corregido',
      'corrigió de quién llegó ' || v_marca || ' en ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_nombre,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'marca_id', p_marca_id, 'proveedor_id', p_proveedor_id, 'proveedores_antes', to_jsonb(v_antes),
                         'recibidos', cardinality(v_recibidos), 'movimientos', v_pasaron, 'lote', v_lote_real, 'motivo', v_motivo),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección de % en el envío % (%)', v_marca, v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'marca_id', p_marca_id, 'proveedor', jsonb_build_object('id', p_proveedor_id, 'nombre', v_nombre),
                            'recibidos', cardinality(v_recibidos), 'conteos', v_conteos, 'movimientos', v_pasaron, 'prendas', cardinality(v_prendas));
end $$;
comment on function retail.corregir_proveedor_de_marca(uuid, uuid, uuid, text) is
  'ADR-0636 act. 2026-11-11 c: corrige de quién llegó UNA marca en una recepción «sin aviso», abierta o cerrada; lo recibido, lo contado y el lote de sus movimientos pasan al proveedor real. No toca stock ni costos.';
revoke all on function retail.corregir_proveedor_de_marca(uuid, uuid, uuid, text) from public, anon;
grant execute on function retail.corregir_proveedor_de_marca(uuid, uuid, uuid, text) to authenticated;

-- ---------- 2. El candado de una recepción unida, acotado a sus proveedores unidos ----------
select pg_temp.reemplazar_175(
  'retail.fn_unida_proveedor_fijo()',
  $v$     and exists (select 1 from retail.compra_papel_llegadas l where l.despacho_id = old.despacho_id) then$v$,
  $n$     and exists (select 1 from retail.compra_papel_llegadas l where l.despacho_id = old.despacho_id
                   -- ADR-0636 act. 2026-11-11 c: solo frena mover filas desde o hacia un proveedor ya unido (lo que rompería el reparto).
                   and l.proveedor_id in (old.proveedor_id, new.proveedor_id)) then$n$,
  'ADR-0636 act. 2026-11-11 c'
);

-- ---------- 3. Unir con faltante, solo un Admin y con la marca de transacción ----------
select pg_temp.reemplazar_175(
  'retail.unir_recepcion_con_compra(uuid,uuid,uuid)',
  $v$  if v_recibidas < v_prendas_papel then
    raise exception 'De esa compra llegaron % de % prendas: se une cuando llegue todo (o la cierra Compras)', v_recibidas, v_prendas_papel$v$,
  $n$  -- ADR-0636 act. 2026-11-11 c (Felipe, «Unir con 27»): un Admin puede unir con faltante cuando lo que falta ya entró por otra vía.
  if v_recibidas < v_prendas_papel
     and not (coalesce(current_setting('retail.union_acepta_faltante', true), '') = 'si' and retail.fn_es_admin()) then
    raise exception 'De esa compra llegaron % de % prendas: se une cuando llegue todo (o la cierra Compras)', v_recibidas, v_prendas_papel$n$,
  'union_acepta_faltante'
);

-- ---------- Comprobación ----------
do $comprueba$
begin
  if to_regprocedure('retail.corregir_proveedor_de_marca(uuid,uuid,uuid,text)') is null
     or position('union_acepta_faltante' in pg_get_functiondef('retail.unir_recepcion_con_compra(uuid,uuid,uuid)'::regprocedure)) = 0
     or position('ADR-0636 act. 2026-11-11 c' in pg_get_functiondef('retail.fn_unida_proveedor_fijo()'::regprocedure)) = 0 then
    raise exception 'La migración 20261111175000 no quedó aplicada entera: revisa antes de seguir.';
  end if;
end $comprueba$;

reset lock_timeout;
