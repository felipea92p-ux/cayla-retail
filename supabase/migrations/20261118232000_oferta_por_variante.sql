-- ============================================================================
-- 20261118232000 — Una oferta también puede elegir una VARIANTE en concreto de una prenda (ADR-0682; Felipe 2026-11-18)
--
-- EL PROBLEMA. Felipe, al usar la hoja de una oferta: «poder aplicar a una variante en concreto de una prenda». Una oferta elegía sus prendas
--   por categoría (`campana_regla_categorias`), por modelo entero (`campana_regla_productos`) o por insignia (`campana_regla_insignias`).
--   Un «−30 % en la Blusa Emma negra, tallas S y M» (lo que queda de un color) no se podía armar: bajaba el modelo completo, con todas sus
--   tallas y colores.
--
-- LO QUE HACE.
--   1. `retail.campana_regla_variantes` (regla_id, variante_id): las tallas y colores sueltos que alcanza una oferta. Se SUMAN a sus
--      categorías, modelos e insignias. Una oferta con variantes y sin nada más rige SOLO en ellas, no en las prendas de su campaña (lo
--      mismo que ya pasa con las insignias). «Dejar fuera», Claurè y las tiendas siguen igual.
--   2. La regla de alcance de una oferta GUARDADA las lee, en sus tres caras: `fn_regla_alcanza_variante` (una prenda: el 3x2, el monto y
--      sus cesiones), `fn_variantes_de_regla` (todas, de una vez) y `fn_campanas_en_sede` (la caja, la tienda web, los apartados, el club y
--      las etiquetas de precio, para un «% menos»).
--   3. `guardar_oferta_completa` las guarda (`p_forma.variantes`: así no cambia su firma), con la historia de las de antes; un monto de
--      toda la compra no las lleva y las tallas de un modelo elegido entero no se guardan (sobran). `campana_reglas()` las devuelve.
--
-- DECIDÍ que todo cambio a una función que ya existe solo AGREGUE texto, sin tocar una línea de las que hay: las pruebas de las migraciones
--   anteriores las vuelven a pegar y buscan sus propias anclas (20261114060000, 20261114130000, 20261116173000, 20261116175000). Por eso:
--   · `fn_regla_alcanza_variante` envuelve su respuesta de siempre en `fn_regla_con_variantes(regla, prenda, respuesta)`;
--   · `fn_variantes_de_regla` y `fn_campanas_en_sede` ganan una rama más (`union`) y una condición que apaga la caída a «las prendas de
--     la campaña» cuando la oferta solo tiene variantes. En la caja, las dos van ANTES del final de su bloque de ofertas: ese final es el
--     ancla de 20261113223000 (medido el 2026-11-18 en una base limpia: con el texto después, `pruebas:campana-reglas` daba 106 de 107).
-- DESCARTÉ un dato más en `fn_oferta_alcanza_variante_con_insignias` / `fn_variantes_de_oferta_con_insignias` (las de listas): cambiarles la
--   firma dejaría dos vivas mientras las pruebas vuelvan a crear la de antes (`pruebas:una-sola-firma`), y sus líneas son anclas de
--   20261114130000. Las de listas las necesita la hoja ANTES de guardar (los choques): van en 20261118234000, con funciones nuevas.
-- DESCARTÉ guardar «todo un color» como una fila (producto, color): la base no tiene otra regla por color, y una oferta dura días. «Todo el
--   color» lo arma la hoja con las tallas de ese momento; una talla que nazca después no entra sola (el modelo entero sí la incluye).
-- DESCARTÉ una insignia interna por oferta (reusar `campana_regla_insignias`): la insignia se ve en la prenda (Existencias, la tienda web) y
--   habría que esconderla en cada pantalla.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema y la función que guarda): una variante repetida en la misma oferta (clave
--   primaria); una oferta borrada o una variante eliminada que deja filas sueltas (cascada); un monto de toda la compra con variantes; una
--   variante suelta de un modelo que la oferta ya eligió entero.
--
-- SE ROMPE SI: alguien cambia el bloque de ofertas de `fn_campanas_en_sede`, o el final de `fn_variantes_de_regla` o de `fn_regla_alcanza_variante`, antes de pegar
--   esto: el ancla no aparece y se detiene sin aplicar nada. Y si la regla cambia en una de las tres caras y no en las otras: la prueba las
--   compara.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una tabla NUEVA (RLS encendido sin políticas: solo la leen funciones
--   security definer, ADR-0195), funciones y reemplazos anclados; sin `alter` de tablas en uso. Va DESPUÉS de 20261116180000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-variante`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_variantes_de_regla(uuid)') is null or to_regclass('retail.campana_regla_insignias') is null then
    raise exception 'Faltan piezas (las ofertas por insignia, 20261114060000, o fn_variantes_de_regla, 20261116175000): pega antes esas migraciones. No se aplicó nada.';
  end if;
end;
$$;

-- 1. Las variantes sueltas de una oferta --------------------------------------------------------------------------------------------------

create table if not exists retail.campana_regla_variantes (
  regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  -- Elegir una talla y color es configuración de la oferta, como sus modelos: si la variante se elimina (solo se puede sin historia), se va
  -- de la oferta con ella.
  variante_id uuid not null references retail.variantes (id) on delete cascade,
  primary key (regla_id, variante_id)
);
create index if not exists campana_regla_variantes_variante_idx on retail.campana_regla_variantes (variante_id);

alter table retail.campana_regla_variantes enable row level security;
revoke all on table retail.campana_regla_variantes from public, anon, authenticated;

comment on table retail.campana_regla_variantes is
  'ADR-0682. Las tallas y colores sueltos que alcanza una oferta (además de sus categorías, modelos e insignias). Con variantes y sin nada más, la oferta rige solo en ellas. Solo la leen y la escriben funciones security definer.';

-- 2. Las piezas de la regla ---------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_regla_solo_variantes(p_regla_id uuid)
returns boolean
language sql
stable
as $function$
  -- La oferta eligió variantes sueltas y nada más: no cae en «las prendas de su campaña».
  select exists (select 1 from retail.campana_regla_variantes rv where rv.regla_id = p_regla_id)
     and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = p_regla_id and rc.modo = 'solo')
     and not exists (select 1 from retail.campana_regla_productos rp where rp.regla_id = p_regla_id)
     and not exists (select 1 from retail.campana_regla_insignias ri where ri.regla_id = p_regla_id)
$function$;

comment on function retail.fn_regla_solo_variantes(uuid) is
  'ADR-0682. ¿La oferta eligió solo variantes sueltas (ni categorías, ni modelos, ni insignias)? Entonces rige solo en ellas, no en las prendas de su campaña.';
revoke all on function retail.fn_regla_solo_variantes(uuid) from public, anon, authenticated;

create or replace function retail.fn_variantes_sueltas_de_regla(p_regla_id uuid)
returns table (variante_id uuid)
language sql
stable
as $function$
  -- Las variantes sueltas de la oferta que están a la venta, sin lo que deja fuera y sin Claurè (si no la incluye).
  select v.id
  from retail.campana_regla_variantes rv
  join retail.campana_reglas r on r.id = rv.regla_id
  join retail.variantes v on v.id = rv.variante_id and v.activo
  join retail.productos p on p.id = v.producto_id
  where rv.regla_id = p_regla_id and coalesce(r.cuenta, '') <> 'compra'
    and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
    and (coalesce(r.incluye_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
$function$;

comment on function retail.fn_variantes_sueltas_de_regla(uuid) is
  'ADR-0682. Las variantes sueltas de una oferta guardada que están a la venta (sin lo que deja fuera ni Claurè, si no la incluye). La suma fn_variantes_de_regla.';
revoke all on function retail.fn_variantes_sueltas_de_regla(uuid) from public, anon, authenticated;

create or replace function retail.fn_regla_con_variantes(p_regla_id uuid, p_variante_id uuid, p_base boolean)
returns boolean
language sql
stable
as $function$
  -- `p_base` es la respuesta de siempre (categorías, modelos, insignias o las prendas de la campaña). Sin variantes sueltas, vale tal cual.
  -- Con ellas: la prenda entra si es una de las sueltas, o por lo demás que la oferta eligió (nunca por la caída a su campaña).
  select case
    when not exists (select 1 from retail.campana_regla_variantes rv where rv.regla_id = p_regla_id) then p_base
    else (coalesce(p_base, false) and not retail.fn_regla_solo_variantes(p_regla_id))
      or exists (
        select 1
        from retail.campana_regla_variantes rv
        join retail.campana_reglas r on r.id = rv.regla_id
        join retail.variantes v on v.id = rv.variante_id
        join retail.productos p on p.id = v.producto_id
        where rv.regla_id = p_regla_id and rv.variante_id = p_variante_id and coalesce(r.cuenta, '') <> 'compra'
          and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
          and (coalesce(r.incluye_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
      )
  end
$function$;

comment on function retail.fn_regla_con_variantes(uuid, uuid, boolean) is
  'ADR-0682. La respuesta de fn_regla_alcanza_variante con las variantes sueltas de la oferta: entra si es una de ellas o por lo demás que la oferta eligió; con variantes y nada más, no cae en las prendas de la campaña.';
revoke all on function retail.fn_regla_con_variantes(uuid, uuid, boolean) from public, anon, authenticated;

-- 3. Los reemplazos anclados: solo AGREGAN texto ------------------------------------------------------------------------------------------

create or replace function pg_temp.reemplazar_por_variante(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_veces integer;
begin
  -- Ya aplicado = el texto nuevo está (el nuevo CONTIENE al viejo: por eso se mira primero).
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, v_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Los dos van JUNTOS, en una sola vuelta: con uno solo la función quedaría con un paréntesis abierto.
create or replace function pg_temp.reemplazar_par_por_variante(p_firma text, p_viejo_a text, p_nuevo_a text, p_viejo_b text, p_nuevo_b text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_a integer;
  v_b integer;
begin
  if position(p_nuevo_a in v_def) > 0 and position(p_nuevo_b in v_def) > 0 then
    return;
  end if;
  v_a := (length(v_def) - length(replace(v_def, p_viejo_a, ''))) / length(p_viejo_a);
  v_b := (length(v_def) - length(replace(v_def, p_viejo_b, ''))) / length(p_viejo_b);
  if v_a <> 1 or v_b <> 1 then
    raise exception '% cambió desde que se escribió esta migración: las anclas aparecen % y % veces (se esperaba 1 y 1). Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, v_a, v_b;
  end if;
  execute replace(replace(v_def, p_viejo_a, p_nuevo_a), p_viejo_b, p_nuevo_b);
end;
$f$;

-- (a) Una prenda (el 3x2, el monto y sus cesiones): la respuesta de siempre pasa por las variantes sueltas.
select pg_temp.reemplazar_par_por_variante(
  'retail.fn_regla_alcanza_variante(uuid, uuid)',
  $v$
  select case
$v$,
  $n$
  select retail.fn_regla_con_variantes(p_regla_id, p_variante_id, case
$n$,
  $v$
  end
  from retail.campana_reglas r
  where r.id = p_regla_id
$v$,
  $n$
  end)
  from retail.campana_reglas r
  where r.id = p_regla_id
$n$
);

-- (b) Todas, de una vez: con variantes y nada más no cae en las prendas de la campaña, y las sueltas se suman (sin repetir).
select pg_temp.reemplazar_por_variante(
  'retail.fn_variantes_de_regla(uuid)',
  $v$
  where r.id = p_regla_id and coalesce(r.cuenta, '') <> 'compra'
$v$,
  $n$
  where r.id = p_regla_id and coalesce(r.cuenta, '') <> 'compra'
    -- ADR-0682: con variantes sueltas y nada más, la oferta no cae en las prendas de su campaña; las sueltas se suman abajo.
    and not retail.fn_regla_solo_variantes(r.id)
  union
  select s.variante_id from retail.fn_variantes_sueltas_de_regla(p_regla_id) s
$n$
);

-- (c) La caja (un «% menos»): una rama más con las variantes sueltas y la misma condición en el bloque de siempre. Los dos textos van
--     ANTES del final del bloque 2 y no después: ese final (la línea de Claurè, las cesiones y `) x`) es el ancla de 20261113223000, y
--     `pruebas:campana-reglas` la vuelve a pegar. Con una línea más ahí, esa migración ya no se reconocería como aplicada.
select pg_temp.reemplazar_par_por_variante(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$    union all
    -- 2. Las ofertas activas de campañas aprobadas, activas, vigentes y que rigen en la sede.$v$,
  $n$    union all
    -- ADR-0682: las variantes sueltas de las ofertas activas (una talla y color en concreto), con las mismas condiciones del bloque 2.
    select v.id, e.id, e.nombre, r.porcentaje
    from retail.campana_reglas r
    join retail.etiquetas e
      on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
     and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
     and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
     and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
    join retail.campana_regla_variantes rv on rv.regla_id = r.id
    join retail.variantes v on v.id = rv.variante_id and (p_variante_ids is null or v.id = any (p_variante_ids))
    join retail.productos p on p.id = v.producto_id
    where r.estado = 'activa' and r.tipo = 'pct'
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, p_hoy, p_tolerancia_dias)
      and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
      and (r.incluye_claure or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
      and not exists (select 1 from calladas k where k.cede_regla_id = r.id and k.variante_id = v.id)
    union all
    -- 2. Las ofertas activas de campañas aprobadas, activas, vigentes y que rigen en la sede.$n$,
  $v$      -- Las prendas de Claurè no entran, salvo que la oferta las incluya a propósito.$v$,
  $n$      -- ADR-0682: una oferta con variantes sueltas y nada más (ni categorías, ni modelos, ni insignias) no cae en las prendas de su campaña.
      and not (
        exists (select 1 from retail.campana_regla_variantes rv where rv.regla_id = r.id)
        and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
        and not exists (select 1 from retail.campana_regla_productos rp where rp.regla_id = r.id)
        and not exists (select 1 from retail.campana_regla_insignias ri where ri.regla_id = r.id)
      )
      -- Las prendas de Claurè no entran, salvo que la oferta las incluya a propósito.$n$
);

-- (d) Guardar: las variantes van en la forma (`p_forma.variantes`), después de la forma y antes de las cesiones (que revisan los choques con
--     la oferta como queda). Sin la clave, no se tocan.
select pg_temp.reemplazar_por_variante(
  'retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean)',
  $v$
  perform retail.ceder_ofertas(v_id, p_cede_regla_ids);
$v$,
  $n$
  -- ADR-0682 (oferta por variante): las tallas y colores sueltos que alcanza, en la forma para no cambiar la firma.
  if p_forma ? 'variantes' or v_cuenta = 'compra' then
    declare
      v_variantes uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(
                              case when jsonb_typeof(p_forma -> 'variantes') = 'array' then p_forma -> 'variantes' else '[]'::jsonb end) x), '{}'::uuid[]);
      v_antes_variantes uuid[] := coalesce((select array_agg(rv.variante_id order by rv.variante_id) from retail.campana_regla_variantes rv where rv.regla_id = v_id), '{}'::uuid[]);
    begin
      -- Toda la compra no elige prendas.
      if v_cuenta = 'compra' then
        v_variantes := '{}'::uuid[];
      end if;
      if cardinality(v_variantes) > 2000 then
        raise exception 'Una oferta puede elegir hasta 2000 tallas sueltas. Para más, elige el modelo entero o su categoría.' using hint = 'oferta_forma';
      end if;
      if exists (select 1 from unnest(v_variantes) x where not exists (select 1 from retail.variantes v where v.id = x)) then
        raise exception 'Una de las prendas elegidas ya no existe. Vuelve a abrir la hoja y elígelas de nuevo.' using hint = 'oferta_forma';
      end if;
      -- Un modelo elegido entero ya trae todas sus tallas y colores: sus tallas sueltas sobran.
      v_variantes := coalesce((select array_agg(x order by x) from unnest(v_variantes) x join retail.variantes v on v.id = x
                               where not (v.producto_id = any (coalesce(v_productos, '{}'::uuid[])))), '{}'::uuid[]);
      delete from retail.campana_regla_variantes rv where rv.regla_id = v_id and not (rv.variante_id = any (v_variantes));
      insert into retail.campana_regla_variantes (regla_id, variante_id)
        select v_id, x from unnest(v_variantes) x
        on conflict (regla_id, variante_id) do nothing;
      -- La historia (solo se agrega) guarda las variantes de antes cuando cambiaron.
      if p_regla_id is not null and v_antes_variantes is distinct from v_variantes then
        insert into retail.campana_regla_historial (regla_id, antes, por)
          values (v_id, jsonb_build_object('variantes', to_jsonb(v_antes_variantes)), retail.fn_actor_persona_id(true));
      end if;
    end;
  end if;

  perform retail.ceder_ofertas(v_id, p_cede_regla_ids);
$n$
);

-- 4. La pantalla: las variantes sueltas de cada oferta ------------------------------------------------------------------------------------
--    La hoja sabe que la base ya entiende variantes porque esta columna llega: sin ella (una base sin esta migración) no las ofrece.

drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb,
  productos_solo uuid[], ceden uuid[], lleva smallint, paga smallint, monto numeric, agrupa text,
  escalones jsonb, ahorro_en text, cuenta text, cede_a_otras boolean, insignias uuid[], variantes uuid[]
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select r.id, r.etiqueta_id, r.nombre, r.tipo, r.porcentaje, r.desde, r.hasta, r.dias_semana, r.incluye_claure, r.estado,
         coalesce((select array_agg(rc.categoria_id order by rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]),
         coalesce((select array_agg(rc.categoria_id order by rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]),
         coalesce((select array_agg(rs.ubicacion_id order by rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = r.id), '{}'::uuid[]),
         r.creada_por, r.creada_en, r.activada_por, r.activada_en,
         -- «Cambios» son las EDICIONES: solo las filas de la historia que guardaron cómo estaba (llevan el porcentaje).
         (select count(*)::integer from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje'),
         (select h.antes from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje' order by h.en desc, h.id desc limit 1),
         coalesce((select array_agg(rp.producto_id order by rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
         coalesce((select array_agg(c.cede_regla_id order by c.cede_regla_id) from retail.campana_regla_cesiones c where c.gana_regla_id = r.id), '{}'::uuid[]),
         r.lleva, r.paga, r.monto, r.agrupa, r.escalones, r.ahorro_en, r.cuenta, r.cede_a_otras,
         coalesce((select array_agg(ri.etiqueta_id order by ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]),
         coalesce((select array_agg(rv.variante_id order by rv.variante_id) from retail.campana_regla_variantes rv where rv.regla_id = r.id), '{}'::uuid[])
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas; sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, sus modelos elegidos (productos_solo), sus insignias (insignias), sus variantes sueltas (variantes, ADR-0682), las que le ceden (ceden), su forma y su historia. Solo con la llave de las campañas.';

revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;
