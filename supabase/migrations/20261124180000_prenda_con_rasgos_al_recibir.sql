-- Margen por rasgos (ADR-0700), actividad 4 de 6 (la base): lo que la prenda tenía en su compra pasa a la prenda al recibirla. Una sola parte.
--
-- EL PROBLEMA PRIMERO. Quien compra marca en «Compré ropa» lo que la prenda tiene (20261124174000), pero la prenda nace al recibirla
-- (`preparar_prenda_al_recibir`), y ahí nadie sabía de esas casillas: Catálogo, Recibir y la propuesta de precio no tendrían de dónde
-- leerlas, y cada prenda volvería a medirse solo con la base.
--
-- QUÉ CREA.
--   1. `retail.producto_rasgos`: lo que una prenda tiene, una fila por prenda. «Nadie la tiene» y «En tendencia» se guardan como sí/no;
--      «Tela que se nota» puede quedar sin decir (nulo = la decide el tejido, con la lista del Admin), para que una prenda de lino la tenga
--      sola y alguien pueda quitársela a una que no la merezca. La marca NO se guarda: sale siempre de la lista de marcas (si el Admin la
--      cambia, cambia para todas). Tabla al costado de `productos` (no columnas en el núcleo): se lee y escribe por funciones.
--   2. `fn_rasgos_de_producto(uuid)`: lo que la prenda tiene en efecto, en el orden de la hoja (la misma regla que `rasgosEfectivos`).
--   3. REEMPLAZO ANCLADO de `fn_envio_detalle`: cada línea del envío trae `rasgos` y `precio_visto_afuera` de su línea de compra, para que
--      quien recibe vea lo que marcó quien compró y el sugerido salga igual.
--   4. REEMPLAZO ANCLADO de `preparar_prenda_al_recibir`: al recibir, deja en la prenda las casillas de su línea si todavía no tiene las
--      suyas (una prenda que ya existe conserva lo que le pusieron en Catálogo). Lo recibido fuera de la guía (sin línea) no trae. Va en un
--      bloque propio, después del de 20261107191000, sin tocar texto que otras migraciones anclen.
--
-- DECIDÍ: una tabla propia, con la tela de tres estados y la marca siempre por la lista.
-- DESCARTÉ: (a) columnas en `productos`: es el núcleo (ADR-0700 lo pide al costado); (b) guardar la lista de códigos tal cual (`text[]`):
-- no distingue «la tela no se dijo» de «se la quitaron», y la marca quedaría congelada aunque el Admin la saque de la lista; (c) copiar en
-- cada recepción: la segunda pisaría lo que alguien corrigió en Catálogo.
-- SE ROMPE SI: dos envíos de la misma prenda nueva llegan con casillas distintas: gana el primero que se recibe (los demás no pisan).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Después de 20261124174000. Una parte: una tabla nueva sin políticas, una función
-- nueva y dos reemplazos anclados que se detienen si el texto vivo cambió. `fn_envio_detalle` tiene el mismo md5 en el local y en
-- producción (838820974d64…, 2026-11-24); el ancla de `preparar_prenda_al_recibir` está en la versión de producción (más nueva que la de
-- algunos locales). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Lo que la prenda tiene ----------

create table if not exists retail.producto_rasgos (
  producto_id uuid primary key references retail.productos (id),
  nadie_la_tiene boolean not null default false,
  en_tendencia boolean not null default false,
  -- Nulo: la decide el tejido de la prenda (`tejidos.se_nota`). Sí o no: alguien lo dijo y manda.
  tela_que_se_nota boolean,
  actualizado_por uuid references public.personas (id),
  actualizado_en timestamptz not null default now()
);
comment on table retail.producto_rasgos is
  'Lo que una prenda tiene y le sube el margen objetivo (ADR-0700). La marca no va aquí: sale de marcas.conocida.';
comment on column retail.producto_rasgos.tela_que_se_nota is
  'Nulo = por su tejido (tejidos.se_nota). Sí o no = alguien lo dijo y manda sobre el tejido.';

alter table retail.producto_rasgos enable row level security;
revoke all on retail.producto_rasgos from public, anon, authenticated;

-- ---------- 2. Lo que la prenda tiene en efecto ----------

create or replace function retail.fn_rasgos_de_producto(p_producto_id uuid)
returns text[]
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v text[];
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  select array_remove(array[
           case when coalesce(r.nadie_la_tiene, false) then 'nadie_la_tiene' end,
           case when coalesce(r.en_tendencia, false) then 'en_tendencia' end,
           case when coalesce(r.tela_que_se_nota, t.se_nota, false) then 'tela_que_se_nota' end,
           case when coalesce(m.conocida, false) then 'marca_conocida' end], null)
    into v
    from retail.productos p
    left join retail.producto_rasgos r on r.producto_id = p.id
    left join retail.tejidos t on t.id = p.tejido_id
    left join retail.marcas m on m.id = p.marca_id
   where p.id = p_producto_id;
  return coalesce(v, '{}'::text[]);
end $$;

revoke all on function retail.fn_rasgos_de_producto(uuid) from public, anon;
grant execute on function retail.fn_rasgos_de_producto(uuid) to authenticated;

-- ---------- 3 y 4. Los reemplazos anclados ----------

create or replace function pg_temp.reemplazar_rasgos_recibir(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- El envío: cada línea trae lo que marcó quien compró y lo que vio afuera.
select pg_temp.reemplazar_rasgos_recibir(
  'retail.fn_envio_detalle(uuid)',
  $v$                      'compra_item_id', di.compra_item_id,$v$,
  $n$                      'compra_item_id', di.compra_item_id,
                      -- ADR-0700: lo que la prenda tiene según quien la compró, y el precio que vio afuera (techo del sugerido).
                      'rasgos', to_jsonb(i.rasgos),
                      'precio_visto_afuera', i.precio_visto_afuera,$n$);

-- Recibir: la prenda (nueva o ya existente) se queda con las casillas de su línea si todavía no tiene las suyas. El bloque va DESPUÉS del de
-- 20261107191000 y lee la línea con su propia consulta: no toca ningún texto que anclen otras migraciones (las pruebas de Recibir las
-- vuelven a pegar, y un ancla movida las haría detenerse).
-- El ancla (un comentario de la función viva) se vuelve a poner al final con `||`: escrita en su propia línea, la herramienta de Supabase
-- que transporta el SQL borra las líneas que empiezan con `--`, y con ella se iría el cierre del texto.
select pg_temp.reemplazar_rasgos_recibir(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$  -- La prenda (nueva o ya existente) se bloquea: dos personas sumándole la misma talla a la vez se ponen en fila.$v$,
  $n$  -- ADR-0700: lo que la prenda tenía en su compra pasa a la prenda, si todavía no tiene lo suyo (lo de Catálogo no se pisa). La tela
  -- que no se marcó queda «por su tejido». Lo recibido fuera de la guía no trae línea ni casillas.
  if p_despacho_item_id is not null then
    insert into retail.producto_rasgos (producto_id, nadie_la_tiene, en_tendencia, tela_que_se_nota, actualizado_por)
    select v_producto_id, 'nadie_la_tiene' = any (i.rasgos), 'en_tendencia' = any (i.rasgos),
           case when 'tela_que_se_nota' = any (i.rasgos) then true end, v_actor
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
     where di.id = p_despacho_item_id and i.rasgos is not null
    on conflict (producto_id) do nothing;
  end if;

$n$ || $v$  -- La prenda (nueva o ya existente) se bloquea: dos personas sumándole la misma talla a la vez se ponen en fila.$v$);
