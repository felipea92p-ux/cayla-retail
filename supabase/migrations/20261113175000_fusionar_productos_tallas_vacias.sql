-- ============================================================================
-- 20261113175000_fusionar_productos_tallas_vacias.sql — Fusionar productos: sacar de la venta las tallas vacías (ADR-0650, act. 2026-11-13)
-- ============================================================================
--
-- EL PROBLEMA. Felipe probó la fusión con fichas reales: hay fichas con tallas que no tienen ninguna prenda (o que nunca
-- tuvieron una: se crearon de más al dar de alta). Al fusionar, esas tallas pasan a la ficha que queda y la llenan de
-- tallas vacías. Pidió: «si no tienen ninguna unidad en alguna talla o de plano nunca se ingresó ninguna prenda en esa
-- talla, que te permita eliminarla de la fusión».
--
-- LA DECISIÓN. «Sacar de la fusión» no borra nada (regla del repo: nunca se borra con historia): la talla se muda o se
-- junta como siempre y queda APAGADA (`variantes.activo = false`, igual que una talla retirada). Sus ventas siguen
-- contando en la que queda; solo deja de venderse y de dibujarse. Se ofrece solo lo que de verdad está vacío: un color ×
-- talla de la ficha final (la variante que absorbe y todas las que se le juntan) con 0 prendas y 0 apartadas en toda la
-- red, y nada en curso (traslado en camino, pedido web sin entregar, producción o conteo abiertos).
--
-- QUÉ CAMBIA
--   · `fn_fusion_productos_plan`: lee `p_elecciones.retirar` (ids de la variante que absorbe cada color × talla) y
--     devuelve `vacias` (cada color × talla vacío, si nunca tuvo prendas y si está elegido para salir). Una talla elegida
--     que ya no está vacía FRENA con su frase. Las elegidas cuentan como apagadas para el resto del cálculo (la mezcla de
--     «Sin color», las tallas que la categoría final no tiene): sacarlas puede destrabar una fusión.
--   · `fusionar_productos`: al final de las variantes, apaga las elegidas. Lo que se ve es lo que pasa: lo decide el plan.
--
-- PARA PEGAR EN PRODUCCIÓN: una parte, solo reemplazos anclados de funciones (sin `alter table` ni políticas).
-- Re-ejecutable: si ya está, no hace nada. Necesita 20261112205000 y 20261112210000. Ensayo primero con `begin; … rollback;`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El plan: qué está vacío y qué se saca ----------

do $do$
declare
  v_def text := pg_get_functiondef('retail.fn_fusion_productos_plan(uuid, uuid[], jsonb)'::regprocedure);
  v_ancla_declare constant text := $a$  v_el jsonb := coalesce(p_elecciones, '{}'::jsonb);$a$;
  v_ancla_curso constant text := $a$  -- Lo que está en curso sobre una variante que se JUNTA no tiene a dónde ir: se cierra antes.$a$;
  v_ancla_salida constant text := $a$    'avisos', v_avisos);$a$;
  v_vacias constant text := $n$
  -- Tallas vacías (20261113175000): cada color × talla de la ficha final con 0 prendas y 0 apartadas en toda la red y nada en
  -- curso. La persona puede sacarlas de la venta (`retirar`): se mudan o se juntan igual y quedan apagadas; su historia sigue.
  v_retirar := array(select (x)::uuid from jsonb_array_elements_text(coalesce(v_el -> 'retirar', '[]'::jsonb)) x);
  v_vacias := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'variante_id', a.variante_id, 'producto_id', a.producto_id,
             'color', coalesce(c.nombre, 'Sin color'), 'color_codigo', a.color_codigo, 'color_hex', c.hex, 'talla', t.valor,
             'nunca_tuvo', not exists (select 1 from retail.movimientos m join pg_temp.fusion_variantes x on x.variante_id = m.variante_id
                                        where x.variante_id = a.variante_id or x.con_variante_id = a.variante_id),
             'retirada', a.variante_id = any (v_retirar))
           order by c.nombre nulls first, t.valor), '[]'::jsonb)
      from pg_temp.fusion_variantes a
      left join retail.colores c on c.codigo = a.color_codigo
      left join retail.tallas t on t.id = a.talla_id
     where a.activo and not a.fusionada and a.trato in ('queda', 'muda')
       and (select coalesce(sum(x.stock), 0) + coalesce(sum(x.apartada), 0) from pg_temp.fusion_variantes x
             where x.variante_id = a.variante_id or x.con_variante_id = a.variante_id) = 0
       and not exists (
         select 1 from pg_temp.fusion_variantes x
          where (x.variante_id = a.variante_id or x.con_variante_id = a.variante_id)
            and (exists (select 1 from retail.transferencia_items ti join retail.transferencias tr on tr.id = ti.transferencia_id
                          where ti.variante_id = x.variante_id and tr.estado = 'en_transito')
              or exists (select 1 from retail.pedido_web_lineas l join retail.pedidos_web pw on pw.id = l.pedido_id
                          where l.variante_id = x.variante_id and pw.estado in ('por_confirmar', 'confirmado', 'pagado'))
              or exists (select 1 from retail.produccion_lineas pl join retail.producciones pr on pr.id = pl.produccion_id
                          where pl.variante_id = x.variante_id and pr.estado = 'en_proceso')
              or exists (select 1 from retail.conteo_items ci join retail.conteos co on co.id = ci.conteo_id
                          where ci.variante_id = x.variante_id and co.estado = 'abierto'))));

  -- Una talla elegida que ya no está vacía (entró una prenda, se abrió un traslado) frena: no se apaga algo que se vende.
  for r in
    select x.id, coalesce(c.nombre, 'Sin color') || coalesce(' ' || t.valor, '') as nombre
      from unnest(v_retirar) as x(id)
      left join retail.variantes v on v.id = x.id
      left join retail.colores c on c.codigo = v.color_codigo
      left join retail.tallas t on t.id = v.talla_id
     where not exists (select 1 from jsonb_array_elements(v_vacias) e where (e ->> 'variante_id')::uuid = x.id)
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'retirar_no_vacia', 'variante_id', r.id,
      'mensaje', 'La talla «' || r.nombre || '» ya no está vacía (tiene prendas o algo en curso): déjala a la venta para fusionar.');
  end loop;

  -- Las elegidas cuentan como apagadas para lo que sigue (la mezcla de «Sin color», las tallas de la categoría final).
  update pg_temp.fusion_variantes f set activo = false
   where f.variante_id = any (v_retirar)
     and exists (select 1 from jsonb_array_elements(v_vacias) e where (e ->> 'variante_id')::uuid = f.variante_id);

$n$;
begin
  if position('v_retirar uuid[]' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla_declare, ''))) / length(v_ancla_declare) <> 1
     or (length(v_def) - length(replace(v_def, v_ancla_curso, ''))) / length(v_ancla_curso) <> 1
     or (length(v_def) - length(replace(v_def, v_ancla_salida, ''))) / length(v_ancla_salida) <> 1 then
    raise exception '20261113175000: fn_fusion_productos_plan cambió y un ancla no aparece una sola vez. Revisar antes de pegar.';
  end if;
  v_def := replace(v_def, v_ancla_declare, v_ancla_declare || E'\n  v_retirar uuid[];\n  v_vacias jsonb := ''[]''::jsonb;');
  v_def := replace(v_def, v_ancla_curso, v_vacias || v_ancla_curso);
  v_def := replace(v_def, v_ancla_salida, $s$    'avisos', v_avisos,
    'vacias', v_vacias);$s$);
  execute v_def;
end;
$do$;

-- ---------- 2. La fusión: apagar las elegidas ----------

do $do$
declare
  v_def text := pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure);
  v_ancla constant text := $a$    v_juntadas := v_juntadas + 1;
  end loop;$a$;
  -- Después de juntar: al juntar, una talla absorbente apagada vuelve a la venta si la juntada lo estaba; las elegidas se
  -- apagan al final para que nada las reactive.
  v_nuevo constant text := $n$

  -- Las tallas vacías que la persona sacó de la venta (20261113175000): ya se mudaron o se juntaron; quedan apagadas.
  update retail.variantes set activo = false
   where activo
     and id in (select (e ->> 'variante_id')::uuid from jsonb_array_elements(coalesce(v_plan -> 'vacias', '[]'::jsonb)) e
                 where (e ->> 'retirada')::boolean);$n$;
begin
  if position('20261113175000' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception '20261113175000: fusionar_productos cambió y el ancla no aparece una sola vez. Revisar antes de pegar.';
  end if;
  execute replace(v_def, v_ancla, v_ancla || v_nuevo);
end;
$do$;
