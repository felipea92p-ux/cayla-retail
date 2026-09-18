-- ============================================================================
-- 0015_previsualizar_conteo.sql — CAYLA V2
--
-- Devoluciones y conteos (Felipe, 2026-09-14): auditoría previa encontró que
-- el backend de los dos procesos ya existía completo (0002/0003) y sigue
-- funcionando intacto tras la integración con Dynamic — probado en vivo
-- creando ventas/devoluciones/conteos reales contra la base local, no
-- asumido. El único hueco real era este: `apps/web/lib/conteo-varianza.ts`
-- (lógica pura, ya con 7 pruebas) espera una función `previsualizar_cierre_conteo`
-- que nunca se escribió — el paso "revisar antes de cerrar" que pide el
-- flujo de conteo no tenía de dónde traer los datos.
--
-- DECISIÓN: esta función es de SOLO LECTURA — recalcula lo mismo que
-- `cerrar_conteo()` calcularía, sin escribir nada, para que el líder pueda
-- ver la varianza (y su valor en soles) antes de decidir cerrar. No cambia
-- `cerrar_conteo()` en absoluto: esa sigue exactamente como está, probada y
-- funcionando, tocando solo lo que alguien contó de verdad.
--
-- Incluye además las variantes con stock en esa ubicación que NADIE contó
-- (origen='no_contado', contada=0) — información para que el líder decida
-- si de verdad terminó, nunca una escritura: cerrar_conteo jamás las toca.
-- ============================================================================

set search_path = retail, public, extensions;

create function retail.previsualizar_cierre_conteo(p_conteo_id uuid)
returns table (
  variante_id uuid, codigo text, referencia text, talla text, color text,
  contada integer, sistema integer, diferencia integer, origen text
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  -- Al ser security definer, esto NO pasa por conteos_select/conteo_items_select
  -- (RLS) — el permiso se repite acá a mano, igual que ya hace cerrar_conteo().
  select * from (
  -- Lo contado de verdad: mismo cálculo que hace cerrar_conteo() para cada
  -- línea, pero sin persistir nada.
  select
    ci.variante_id,
    (select cb.codigo from codigos_barras cb where cb.variante_id = ci.variante_id order by cb.created_at limit 1),
    p.referencia, v.talla, co.nombre,
    ci.cantidad_contada, ci.cantidad_sistema,
    ci.cantidad_contada - ci.cantidad_sistema,
    'contado'
  from conteo_items ci
  join variantes v on v.id = ci.variante_id
  join productos p on p.id = v.producto_id
  left join colores co on co.codigo = v.color_codigo
  where ci.conteo_id = p_conteo_id

  union all

  -- Lo que tiene stock en esa ubicación pero nadie escaneó todavía — aviso,
  -- no ajuste. cerrar_conteo() no procesa estas filas (no están en
  -- conteo_items), así que cerrar el conteo nunca las toca.
  select
    s.variante_id,
    (select cb.codigo from codigos_barras cb where cb.variante_id = s.variante_id order by cb.created_at limit 1),
    p.referencia, v.talla, co.nombre,
    0, s.cantidad, -s.cantidad,
    'no_contado'
  from stock s
  join variantes v on v.id = s.variante_id
  join productos p on p.id = v.producto_id
  left join colores co on co.codigo = v.color_codigo
  where s.ubicacion_id = (select ubicacion_id from conteos where id = p_conteo_id)
    and s.cantidad <> 0
    and not exists (select 1 from conteo_items ci where ci.conteo_id = p_conteo_id and ci.variante_id = s.variante_id)
  ) t
  where fn_puede_operar_ubicacion((select ubicacion_id from conteos where id = p_conteo_id));
$$;

grant execute on function retail.previsualizar_cierre_conteo to authenticated;
