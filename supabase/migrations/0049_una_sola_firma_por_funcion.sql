-- ============================================================================
-- 0049 — Una sola firma por función
--
-- QUÉ ARREGLA
--   Cuatro funciones tienen dos o tres firmas VIVAS al mismo tiempo. No es una
--   rareza del catálogo: rompe llamadas reales. Postgres identifica una función
--   por nombre MÁS firma, así que `create or replace function` con un argumento
--   nuevo no reemplaza nada — crea una segunda y deja viva la vieja. Nadie las
--   borró, y ahora una llamada que solo nombra los parámetros COMUNES no puede
--   resolverse:
--
--     explain select registrar_movimiento(p_variante_id => …, p_sede_id => …,
--                                         p_tipo => …, p_cantidad => …);
--     → ERROR: function registrar_movimiento(...) is not unique
--
--   En la práctica, hoy, en local: una devolución al almacén funciona y un
--   ajuste, una merma o un traslado normal NO. `MovimientoModal` solo manda
--   `p_contenedor_id` cuando es devolución, y `supabase-js` borra del JSON las
--   claves `undefined` — así que la llamada normal nombra solo los comunes y
--   cae en la ambigüedad. Lo mismo explica que `recibir_lote` no aparezca en
--   los tipos generados y que `RecibirLoteForm` "siempre falla cuando se usa".
--
--   Encontrado el 2026-09-09 por `pnpm migraciones:verificar`, en su primera
--   corrida. Ya estaba documentado en ADR-0009 como anécdota de una migración;
--   resultó ser un patrón repetido cuatro veces. Ver ADR-0026.
--
-- QUÉ SE QUEDA Y QUÉ SE VA
--   Se queda SIEMPRE la firma más nueva, que es la que la app llama hoy:
--     · registrar_movimiento          12 args (manda `p_contenedor_id`)
--     · recibir_lote                   8 args (manda `p_orden_produccion_id`)
--     · registrar_produccion          15 args (manda `p_costo_maquila`, `p_fecha_entrega`)
--     · crear_producto_con_variantes   8 args (manda `p_proveedor_id`)
--
-- EL CANDADO, y es lo que hace que este archivo se pueda correr sin miedo:
--   antes de borrar la vieja se comprueba que la nueva EXISTE. Si no existiera
--   —porque esta base recibió otra combinación de migraciones— no se borra nada
--   y se avisa. Borrar la única implementación viva para "limpiar duplicados"
--   sería exactamente el estado imposible que el principio 2 prohíbe.
--
--   Sin `cascade`, a propósito: si algo depende de una de estas firmas, quiero
--   que falle y me lo diga, no que se lleve el dependiente por delante.
-- ============================================================================

do $$
declare
  -- nombre, cuántos argumentos tiene la que SE QUEDA, y la firma de la que se va.
  v record;
begin
  for v in
    select * from (values
      ('registrar_movimiento', 12,
       'registrar_movimiento(uuid, uuid, text, integer, text, text, uuid, numeric, uuid, text)'),
      ('recibir_lote', 8,
       'recibir_lote(uuid, text, jsonb, text, text, text)'),
      ('recibir_lote', 8,
       'recibir_lote(uuid, text, jsonb, text, text, text, uuid)'),
      ('registrar_produccion', 15,
       'registrar_produccion(uuid, integer, numeric, numeric, numeric, uuid, text, uuid, text, boolean, text)'),
      ('registrar_produccion', 15,
       'registrar_produccion(uuid, integer, numeric, numeric, numeric, jsonb, uuid, text, uuid, text, boolean, boolean, text)'),
      ('crear_producto_con_variantes', 8,
       'crear_producto_con_variantes(text, text, jsonb, uuid, text, text, text)')
    ) as t(nombre, args_que_se_queda, firma_que_se_va)
  loop
    if exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = current_schema() and p.proname = v.nombre and p.pronargs = v.args_que_se_queda
    ) then
      execute format('drop function if exists %s', v.firma_que_se_va);
      raise notice 'Borrada la firma vieja: %', v.firma_que_se_va;
    else
      raise warning 'NO se borró % — la firma de % argumentos que debía quedarse no existe en esta base. Revisar antes de seguir.',
        v.firma_que_se_va, v.args_que_se_queda;
    end if;
  end loop;
end $$;

-- Verificación: después de esto, ninguna de las cuatro debería tener más de una
-- firma. Si alguna sigue duplicada, el candado de arriba lo avisó por `warning`.
do $$
declare
  v_duplicadas text;
begin
  select string_agg(proname || ' × ' || cnt, ', ')
  into v_duplicadas
  from (
    select p.proname, count(*) as cnt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = current_schema()
      and p.proname in ('registrar_movimiento', 'recibir_lote', 'registrar_produccion', 'crear_producto_con_variantes')
    group by p.proname
    having count(*) > 1
  ) d;

  if v_duplicadas is null then
    raise notice 'Listo: una sola firma por función.';
  else
    raise warning 'Siguen duplicadas: %', v_duplicadas;
  end if;
end $$;
