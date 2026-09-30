-- ============================================================================
-- 20260930240300_club_paso1d_parte4_regalo_ficha.sql — CAYLA V2 · Club de clientas · tanda 1d · PARTE 4 de 4
-- ADR-0288 (D-7, D-101). «ES PARA REGALO» — EN ESPERA, como la PARTE 3 (la cabecera completa y el orden de pegado están
-- en la PARTE 2, 20260930240100_club_paso1d_parte2_se_probo.sql). Si la marca sale, este archivo se borra antes de pegarlo.
-- `fn_clienta_compras` devuelve `es_regalo` por prenda, para que la ficha no deduzca la talla de lo que se compró para
-- regalar (`deducirTallas`, apps/web/lib/clienta-actividad-reglas.ts). Cambia su tipo de retorno: `drop` y `create`, con
-- la misma lectura, el mismo candado del módulo «Clientas» y los mismos permisos (EXECUTE solo para `authenticated`). No
-- toma ninguna tabla en exclusiva: al crear la función, Postgres solo las lee (modo compartido), así que no espera a una
-- venta ni la hace esperar. Se pega sola en el SQL Editor, después de la PARTE 3; se puede pegar dos veces.
-- ============================================================================

-- ============================== PARTE 4 · la ficha lee es_regalo ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'es_regalo') then
    raise exception 'Falta la PARTE 3 de esta migración (venta_items.es_regalo): pégala antes que esta.';
  end if;
  for r in
    select * from (values
      -- firma                                                                   antes (producción, 2026-09-30)      despues (este archivo)
      ('retail.fn_clienta_compras(uuid)',                                         '4e70112f67b81461aad1fc813bdd057e', 'dbe1a8808f4c1d4fef7ed7bc7d5e4344')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      -- Que no exista es «después» para la firma vieja (este archivo la suelta) y «antes» para la nueva.
      if r.antes is not null and r.despues is not null then
        raise exception '% no existe en esta base: pega antes las migraciones de Clientas (20260928190000).', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. fn_clienta_compras devuelve es_regalo ----------
-- Cambia el tipo de retorno: Postgres no deja hacerlo con `create or replace`, así que se suelta y se crea. La lectura es la
-- de 20260928190000 más `vi.es_regalo`: el mismo candado del módulo, las mismas ventas (completadas, en cualquier sede).
drop function if exists retail.fn_clienta_compras(uuid);

create or replace function retail.fn_clienta_compras(p_id uuid)
returns table (
  venta_id uuid, fecha timestamptz, ubicacion text, categoria text, talla text,
  cantidad integer, subtotal numeric, es_regalo boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Solo con el módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select v.id, v.created_at, u.nombre, cat.nombre, ta.valor, vi.cantidad, vi.subtotal, vi.es_regalo
  from retail.ventas v
  join retail.ubicaciones u on u.id = v.ubicacion_id
  join retail.venta_items vi on vi.venta_id = v.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos pr on pr.id = va.producto_id
  left join retail.categorias cat on cat.id = pr.categoria_id
  left join retail.tallas ta on ta.id = va.talla_id
  where v.cliente_id = p_id and v.estado = 'completada'
  order by v.created_at desc;
$$;

comment on function retail.fn_clienta_compras(uuid) is
  'Una fila por prenda comprada por esta clienta, en cualquier sede (security definer, ver cabecera de 20260928180000). Base de "talla deducida por tipo de prenda" (D-101, que salta las prendas con es_regalo: ADR-0288 D-7) y "te falta N para frecuente" (D-103) — el cálculo vive en TypeScript, esta función solo entrega los hechos.';

revoke execute on function retail.fn_clienta_compras(uuid) from public, anon;
grant execute on function retail.fn_clienta_compras(uuid) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 4 ==============================
