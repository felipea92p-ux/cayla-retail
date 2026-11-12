-- ============================================================================
-- 20261112212000_productos_posibles_duplicados.sql — Fusionar productos duplicados, parte 5: los que parecen repetidos (ADR-0650)
-- ============================================================================
--
-- EL PROBLEMA. Las fichas repetidas ya creadas no se encuentran solas: alguien tiene que acordarse de que «Blusa Ema» y
-- «Blusa Emma» son la misma prenda. Felipe (decisión 3): el sistema SUGIERE las que parecen repetidas y la persona decide;
-- nunca fusiona solo.
--
-- QUÉ AGREGA. `fn_productos_posibles_duplicados(p_limite)`: pares de fichas activas que parecen la misma prenda, con el porqué:
--   · `mismo_nombre`: el mismo nombre (sin tildes, mayúsculas ni espacios), en marcas distintas. Dentro de una misma marca no
--     puede pasar: lo impide el nombre único por marca (ADR-0294).
--   · `una_letra`: la misma marca y el nombre a una letra de distancia («Blusa Ema» / «Blusa Emma»), la misma regla con la que
--     Nuevo producto avisa «¿no es esta?» (`buscar_productos_parecidos`).
--   · `parecido`: la misma marca y la misma categoría, y el nombre muy parecido (trigramas ≥ 0,75: «Blusa Emma» / «Blusa Emma Lino»).
-- No sugiere dos fichas de categorías distintas con otro nombre (una «Capa Emma» y una «Blusa Emma»): los modelos de CAYLA se
-- llaman como personas y se repiten a propósito entre categorías («Blusa Sofía», «Vestido Sofía»), y la lista se llenaría de
-- falsos parecidos. Esas se fusionan igual, a mano, desde «Fusionar».
-- Fuera: lo ya fusionado, lo rechazado, lo de prueba y la pieza del sistema. Lectura con los permisos de quien llama (RLS): ve
-- solo las fichas que ya ve.
--
-- PARA PEGAR EN PRODUCCIÓN: una parte, una función. Necesita 20261112204000 (`fusionado_en_id`).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_productos_posibles_duplicados(p_limite integer default 50)
returns table (
  producto_a uuid, referencia_a text, producto_b uuid, referencia_b text, motivo text, similitud real
)
language sql
stable
security invoker
set search_path = retail, public, extensions
as $$
  with p as (
    select p.id, p.referencia, p.marca_id, p.categoria_id, p.created_at,
           retail.fn_clave_referencia(p.referencia) as k,
           retail.fn_clave_texto(p.referencia) as t
      from retail.productos p
     where p.fusionado_en_id is null
       and p.estado = 'activo'
       and p.estado_alta <> 'rechazado'
       and not p.es_prueba
       and p.id <> '11111111-1111-4111-8111-111111111111'
  ),
  pares as (
    select a.id as producto_a, a.referencia as referencia_a, b.id as producto_b, b.referencia as referencia_b,
           case
             when a.k = b.k then 'mismo_nombre'
             when a.marca_id is not distinct from b.marca_id and abs(length(a.k) - length(b.k)) <= 1
                  and retail.fn_dentro_de_una_edicion(a.k, b.k) then 'una_letra'
             when a.marca_id is not distinct from b.marca_id and a.categoria_id is not distinct from b.categoria_id
                  and similarity(a.t, b.t) >= 0.75 then 'parecido'
           end as motivo,
           similarity(a.t, b.t) as similitud,
           least(a.created_at, b.created_at) as desde
      from p a
      join p b on a.id < b.id
     where a.k = b.k
        or (a.marca_id is not distinct from b.marca_id and (abs(length(a.k) - length(b.k)) <= 1 or a.categoria_id is not distinct from b.categoria_id))
  )
  select producto_a, referencia_a, producto_b, referencia_b, motivo, similitud
    from pares
   where motivo is not null
   order by case motivo when 'mismo_nombre' then 0 when 'una_letra' then 1 else 2 end, similitud desc, referencia_a
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

comment on function retail.fn_productos_posibles_duplicados(integer) is
  'ADR-0650: pares de fichas activas que parecen la misma prenda (mismo nombre en otra marca, una letra de diferencia o muy parecido en la misma marca y categoría), para sugerir fusionarlas. Solo lee, con RLS.';

revoke all on function retail.fn_productos_posibles_duplicados(integer) from public, anon;
grant execute on function retail.fn_productos_posibles_duplicados(integer) to authenticated;
