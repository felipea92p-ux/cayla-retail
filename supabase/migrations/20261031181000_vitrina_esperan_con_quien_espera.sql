-- ============================================================================
-- 20261031181000_vitrina_esperan_con_quien_espera.sql — Tienda web ▸ Vitrina ▸ «Esperan una talla»: ahora dice QUIÉN espera
--
-- EL PROBLEMA PRIMERO. La pantalla decía «3 personas esperan la M negra» y ahí se cortaba: para avisarle a alguien, o para decidir
-- si vale la pena traer la talla de otra sede, el equipo tenía que adivinar quiénes eran. Felipe (2026-10-31) pidió ver los datos de
-- quienes tocaron «Avísame»: nombre y contacto.
--
-- DECIDÍ (cambia lo que dijo 20261015030000): `fn_vitrina_esperan()` ahora devuelve, por cada prenda y tienda, `quienes`: una fila
--   por persona con su nombre (de la ficha, leído al momento), su celular, su correo de la cuenta de la tienda y desde cuándo espera.
--   Antes decía «SIN datos personales» y que a cada persona le avisa su cuenta, nunca por WhatsApp (ADR-0288 G-5). Eso lo revierte
--   Felipe a propósito: el equipo puede escribirles.
-- DECIDÍ: el celular sale SIEMPRE, pero con `acepta_whatsapp` al lado (la ficha guarda `whatsapp_consentimiento_en`; Ley 29733: el
--   permiso de marketing es un dato aparte del celular). La pantalla marca «Sin permiso de WhatsApp» a quien no lo dio: un «Avísame» pide
--   que le avisen de esa prenda, no recibir ofertas.
-- DECIDÍ: una ficha anonimizada o una cuenta cerrada sale SIN nombre, celular, correo ni ficha (solo cuenta como persona): lo que se
--   borró no reaparece aquí. El permiso sigue siendo el del módulo `vitrina_web` (el vigilante de fichas lo conoce: ver
--   `DE_VITRINA_ESPERAN` en scripts/pruebas/clientas_por_modulo_y_anonimizar.mjs).
-- NO CAMBIA: las cifras, `libre`, `hay_en`, `se_ve`, ni el orden. Solo agrega `quienes` a cada fila. Una sola función, re-ejecutable,
--   sin tablas ni políticas ni disparadores.
--
-- PRODUCCIÓN. NO está aplicada: espera el OK de Felipe. Va después de 20261015030000 y de cuentas_web con `cerrada_en`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_vitrina_esperan()') is null then
    raise exception 'Falta fn_vitrina_esperan: pega antes 20261015030000_vitrina_esperan_una_talla.sql.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'cuentas_web' and column_name = 'cerrada_en')
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'clientas' and column_name = 'anonimizada') then
    raise exception 'Faltan cuentas_web.cerrada_en o clientas.anonimizada: pega antes las migraciones de recomendaciones (20261015134000).';
  end if;
end
$$;

create or replace function retail.fn_vitrina_esperan()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sedes uuid[];
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_sedes := retail.fn_tienda_sedes_web();
  return jsonb_build_object(
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
        from retail.ubicaciones u where u.id = any (v_sedes)), '[]'::jsonb),
    'personas', (select count(distinct e.cuenta_web_id) from retail.esperas_web e where e.quitada_en is null),
    'filas', coalesce((
      -- Por prenda y tienda; la tienda, con la regla con que se anota (una escondida es «cualquier tienda»).
      with base as (
        select e.variante_id, retail.fn_tienda_sede_elegida(e.ubicacion_id, v_sedes) as ubicacion_id, e.cuenta_web_id, e.creada_en
          from retail.esperas_web e
         where e.quitada_en is null
      ),
      vivas as (
        select b.variante_id, b.ubicacion_id,
               count(distinct b.cuenta_web_id)::integer as personas,
               min(b.creada_en) as desde,
               max(b.creada_en) as ultima
          from base b
         group by 1, 2
      ),
      -- Quién espera cada prenda y tienda: una fila por persona (la misma cuenta anotada dos veces en el mismo alcance cuenta una).
      quienes as (
        select q.variante_id, q.ubicacion_id,
               jsonb_agg(jsonb_build_object(
                 'ficha_id', case when c.anonimizada or w.cerrada_en is not null then null else c.id end,
                 'nombre', case when c.anonimizada or w.cerrada_en is not null then null else c.nombre end,
                 'celular', case when c.anonimizada or w.cerrada_en is not null then null else nullif(btrim(c.telefono_whatsapp), '') end,
                 'acepta_whatsapp', (c.whatsapp_consentimiento_en is not null and not c.anonimizada and w.cerrada_en is null),
                 'correo', case when c.anonimizada or w.cerrada_en is not null then null else w.correo end,
                 'desde', q.desde
               ) order by q.desde, c.id) as gente
          from (select b.variante_id, b.ubicacion_id, b.cuenta_web_id, min(b.creada_en) as desde
                  from base b group by 1, 2, 3) q
          join retail.cuentas_web w on w.id = q.cuenta_web_id
          join retail.clientas c on c.id = w.clienta_id
         group by 1, 2
      ),
      -- Lo libre de esas prendas en cada tienda de la web: la regla de «hay» de la ficha, leída una sola vez.
      libres as (
        select d.variante_id, d.ubicacion_id, d.disponible
          from retail.fn_tienda_disponible(array(select distinct va.producto_id
                                                   from vivas x join retail.variantes va on va.id = x.variante_id), v_sedes) d
      )
      select jsonb_agg(jsonb_build_object(
               'variante_id', x.variante_id,
               'producto', jsonb_build_object(
                 'id', p.id, 'nombre', p.referencia, 'codigo', p.codigo,
                 'categoria', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
                 'foto', (select pf.url from retail.producto_fotos pf
                           where pf.producto_id = p.id
                           order by (pf.color_codigo is not distinct from v.color_codigo) desc, pf.es_principal desc,
                                    pf.orden, pf.created_at, pf.id
                           limit 1)),
               'color', case when co.codigo is null then null
                             else jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex) end,
               'talla', t.valor,
               'sede', case when x.ubicacion_id is null then null
                            else jsonb_build_object('id', u.id, 'nombre', u.nombre) end,
               'personas', x.personas,
               'desde', x.desde,
               'ultima', x.ultima,
               'libre', coalesce((select sum(l.disponible) from libres l
                                   where l.variante_id = x.variante_id and (x.ubicacion_id is null or l.ubicacion_id = x.ubicacion_id)), 0),
               'hay_en', coalesce((
                 select jsonb_agg(jsonb_build_object('id', u2.id, 'nombre', u2.nombre, 'libre', l.disponible) order by u2.nombre)
                   from libres l
                   join retail.ubicaciones u2 on u2.id = l.ubicacion_id
                  where l.variante_id = x.variante_id), '[]'::jsonb),
               'se_ve', retail.fn_tienda_modelo_se_ve(p.id),
               'quienes', coalesce((select qq.gente from quienes qq
                                     where qq.variante_id = x.variante_id and qq.ubicacion_id is not distinct from x.ubicacion_id), '[]'::jsonb)
             ) order by x.personas desc, x.desde, p.referencia, x.variante_id, u.nombre nulls first)
        from vivas x
        join retail.variantes v on v.id = x.variante_id
        join retail.productos p on p.id = v.producto_id
        left join retail.categorias c on c.id = p.categoria_id
        left join retail.colores co on co.codigo = v.color_codigo
        left join retail.tallas t on t.id = v.talla_id
        left join retail.ubicaciones u on u.id = x.ubicacion_id), '[]'::jsonb)
  );
end;
$fn$;

comment on function retail.fn_vitrina_esperan() is
  'Tienda web ▸ Vitrina ▸ «Esperan una talla» (ADR-0408 act. 12; con quién espera, 2026-10-31): {tiendas, personas, filas: [{variante_id, producto, color, talla, sede, personas, desde, ultima, libre, hay_en, se_ve, quienes: [{ficha_id, nombre, celular, acepta_whatsapp, correo, desde}]}]}. quienes sale sin datos si la ficha se anonimizó o la cuenta se cerró. Pide el módulo vitrina_web.';

revoke all on function retail.fn_vitrina_esperan() from public, anon;
grant execute on function retail.fn_vitrina_esperan() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'retail.fn_vitrina_esperan()', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_vitrina_esperan()', 'EXECUTE') then
    raise exception 'vitrina esperan: fn_vitrina_esperan es del ERP (authenticated, con el módulo), nunca de anon ni de la tienda';
  end if;
end;
$$;

reset lock_timeout;
