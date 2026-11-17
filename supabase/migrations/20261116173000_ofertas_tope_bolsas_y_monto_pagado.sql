-- ============================================================================
-- 20261116173000 — Campañas y ofertas: el tope de 70 % para todas las formas, las bolsas fuera del monto y el monto sobre lo que se paga
--                  (ADR-0655, decisiones de Felipe del 2026-11-16)
--
-- EL PROBLEMA. La casuística del 2026-11-16 (docs/backlog/2026-11-16-ofertas-promociones-casos.md) dejó tres reglas de dinero que Felipe
--   decidió ese día:
--   1. TOPES DISTINTOS. Una rebaja y un monto en % topan en 70 %, pero un «10 x 1» (90 % menos) o un «4 x 1» (75 %) se guardaban y activaban,
--      y un monto en soles podía ahorrar S/ 299 desde S/ 300. Felipe: «el mismo 70 %».
--   2. BOLSAS EN EL MONTO. Las bolsas (familia con «Cuenta en Análisis, Frescura y el plan del piso» apagado, ADR-0377; hasta S/ 5.90) contaban
--      para llegar a un monto de toda la compra y recibían su parte. Felipe: «no cuentan».
--   3. EL MONTO A PRECIO DE LISTA. Una prenda de S/ 400 con −35 % a mano (paga S/ 260) llegaba a «desde S/ 300» y además recibía la parte del
--      monto. Felipe: «con lo que paga».
--
-- LO QUE HACE.
--   1. «Lleva N, paga M» no puede regalar más del 70 % (M ≥ 30 % de N): el candado `campana_reglas_tope_70` y su mensaje en
--      `guardar_oferta_completa`. «La N.ª al X %» ya topa en 50 % (con N ≥ 2). Un escalón en soles ahorra hasta el 70 % de su «desde»
--      (`fn_escalones_validos`). Un «N por S/ X» depende de los precios del día: lo avisa la hoja al guardarlo, no la base.
--   2. Un monto de toda la compra no alcanza a una prenda de una familia fuera de los motores (`fn_categoria_entra_a_motores`): en la caja
--      (`fn_regla_alcanza_variante`, que también lee `ofertas_de_monto_vigentes`) y en los choques (`fn_choques_de_oferta_con_forma_sin_llave`).
--   3. `fn_ofertas_de_grupo` lee de cada línea su `descuento_manual` (por prenda; sin la clave, 0) y en un monto cuenta y reparte sobre
--      precio − descuento a mano. `fn_exigir_ofertas_de_grupo` (lo que exige `registrar_venta`) se lo pasa: el descuento de la línea menos la
--      parte del Club y la del grupo. Así la parte del monto nunca pasa lo que la prenda paga.
--
-- QUÉ NO HACE. Los apartados (`separar_prendas`, `editar_separacion`, `previsualizar_edicion_separacion`, `fn_grupos_de_separacion`) siguen
--   midiendo el monto a precio de lista: arman sus líneas sin `descuento_manual` y siguen cuadrando con su pantalla. Queda en el backlog.
--   En producción no hay ninguna oferta todavía (2026-11-16): ningún dato existente queda fuera del candado.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: reemplazos anclados (cada ancla aparece una sola vez o no se aplica nada) y
--   un `alter table … add constraint` en `campana_reglas` (que ninguna pantalla escribe a cada rato), sin políticas en la misma parte (ADR-0195).
--   Va DESPUÉS de 20261116172000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-tope-y-monto` (scripts/pruebas/ofertas_tope_y_monto.mjs).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_tope_monto(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 1. El tope de 70 %
-- ---------------------------------------------------------------------------------------------------------------------------------------

select pg_temp.reemplazar_tope_monto(
  'retail.fn_escalones_validos(jsonb, text)',
  $v$(p_ahorro_en = 'soles' and (t.e ->> 'ahorra')::numeric >= (t.e ->> 'desde')::numeric)$v$,
  $n$(p_ahorro_en = 'soles' and (t.e ->> 'ahorra')::numeric > round((t.e ->> 'desde')::numeric * 0.7, 2))$n$
);

select pg_temp.reemplazar_tope_monto(
  'retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean)',
  $v$'De 1 a 3 escalones: cada uno desde más y ahorrando más que el anterior, y el ahorro menor que su monto.'$v$,
  $n$'De 1 a 3 escalones: cada uno desde más y ahorrando más que el anterior, y cada ahorro hasta el 70 % de su monto.'$n$
);

select pg_temp.reemplazar_tope_monto(
  'retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean)',
  $v$    if v_tipo = 'n_por_monto' and (v_monto is null or v_monto <= 0) then$v$,
  $n$    -- Felipe 2026-11-16: el mismo tope de 70 % que la rebaja. «Lleva N, paga M» regala (N − M) / N.
    if v_tipo = 'nxm' and v_paga * 10 < v_lleva * 3 then
      raise exception 'Un «lleva %, paga %» regala el % %%, y una oferta regala hasta el 70 %%: que pague al menos %.',
        v_lleva, v_paga, round((v_lleva - v_paga) * 100.0 / v_lleva), ceil(v_lleva * 0.3)
        using hint = 'oferta_forma';
    end if;
    if v_tipo = 'n_por_monto' and (v_monto is null or v_monto <= 0) then$n$
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.campana_reglas'::regclass and conname = 'campana_reglas_tope_70') then
    alter table retail.campana_reglas
      add constraint campana_reglas_tope_70 check (tipo <> 'nxm' or coalesce(paga * 10 >= lleva * 3, false));
  end if;
end;
$$;

comment on constraint campana_reglas_tope_70 on retail.campana_reglas is
  'ADR-0655 (Felipe 2026-11-16): «lleva N, paga M» no regala más del 70 % (M ≥ 30 % de N), el mismo tope que una rebaja.';

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 2. Las bolsas no cuentan para un monto de toda la compra
-- ---------------------------------------------------------------------------------------------------------------------------------------

select pg_temp.reemplazar_tope_monto(
  'retail.fn_regla_alcanza_variante(uuid, uuid)',
  $v$        and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)$v$,
  $n$        and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
        -- Felipe 2026-11-16: lo que no es mercadería de piso (bolsas, ADR-0377) no cuenta para el monto ni recibe su parte.
        and retail.fn_categoria_entra_a_motores(p.categoria_id)$n$
);

select pg_temp.reemplazar_tope_monto(
  'retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)',
  $v$      and not coalesce(p.categoria_id = any (p_fuera), false)$v$,
  $n$      and not coalesce(p.categoria_id = any (p_fuera), false)
      and retail.fn_categoria_entra_a_motores(p.categoria_id)$n$
);

select pg_temp.reemplazar_tope_monto(
  'retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)',
  $v$             where not coalesce(p.categoria_id = any (o.fuera), false)$v$,
  $n$             where not coalesce(p.categoria_id = any (o.fuera), false)
               and retail.fn_categoria_entra_a_motores(p.categoria_id)$n$
);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 3. El monto se mide sobre lo que la prenda paga (precio − descuento a mano)
-- ---------------------------------------------------------------------------------------------------------------------------------------

select pg_temp.reemplazar_tope_monto(
  'retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)',
  $v$           round((o.x ->> 'precio_unitario')::numeric * 100)::bigint as cent,$v$,
  $n$           round((o.x ->> 'precio_unitario')::numeric * 100)::bigint as cent,
           -- Felipe 2026-11-16: el descuento a mano de cada prenda (sin la clave, 0); un monto cuenta y reparte sobre lo que la prenda paga.
           least(greatest(round(coalesce((o.x ->> 'descuento_manual')::numeric, 0) * 100)::bigint, 0),
                 round((o.x ->> 'precio_unitario')::numeric * 100)::bigint) as manual,$n$
);

select pg_temp.reemplazar_tope_monto(
  'retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)',
  $v$    select l.linea, l.variante_id, l.cent, g.u from lineas l$v$,
  $n$    select l.linea, l.variante_id, l.cent, l.manual, g.u from lineas l$n$
);

select pg_temp.reemplazar_tope_monto(
  'retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)',
  $v$jsonb_build_object('linea', c.linea, 'cent', c.cent, 'regla_id', c.regla_id,$v$,
  $n$jsonb_build_object('linea', c.linea, 'cent', case when c.tipo = 'monto' then c.cent - c.manual else c.cent end, 'regla_id', c.regla_id,$n$
);

-- Lo que exige registrar_venta: el descuento a mano de cada línea es su descuento menos la parte del Club y la del grupo.
select pg_temp.reemplazar_tope_monto(
  'retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date)',
  $v$    select coalesce(jsonb_agg(jsonb_build_object('variante_id', x ->> 'variante_id', 'precio_unitario', x ->> 'precio_unitario',
                                                 'cantidad', coalesce((x ->> 'cantidad')::integer, 1)) order by n), '[]'::jsonb)$v$,
  $n$    select coalesce(jsonb_agg(jsonb_build_object('variante_id', x ->> 'variante_id', 'precio_unitario', x ->> 'precio_unitario',
                                                 'cantidad', coalesce((x ->> 'cantidad')::integer, 1),
                                                 'descuento_manual', greatest(coalesce((x ->> 'descuento_unitario')::numeric, 0)
                                                                              - coalesce((x ->> 'descuento_club_unitario')::numeric, 0)
                                                                              - coalesce((x ->> 'descuento_grupo_unitario')::numeric, 0), 0)) order by n), '[]'::jsonb)$n$
);
