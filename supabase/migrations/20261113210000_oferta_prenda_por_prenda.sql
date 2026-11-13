-- ============================================================================
-- 20261113210000 — Una oferta puede elegir prendas sueltas, no solo categorías (ADR-0655, actividad 3; Felipe 2026-11-13)
--
-- EL PROBLEMA. En la hoja de una oferta, «¿En qué prendas?» solo deja elegir categorías enteras (`campana_regla_categorias`, modo
--   `solo`). Felipe, mirando la maqueta (`docs/maquetas/campanas-y-ofertas-2026-11/`): «Me pide por categoría, pero si quiero seleccionar
--   las prendas, ¿cómo hago?». Un 3x2 en tres modelos de polo, o un −20 % en dos blusas, hoy no se pueden armar.
--
-- LO QUE HACE.
--   1. `retail.campana_regla_productos`: los MODELOS que alcanza una oferta (un modelo = el producto con todas sus tallas y colores, la
--      unidad con que Felipe mide, 2026-10-10). Sin filas, nada cambia.
--   2. `fn_campanas_en_sede` (LA función que lee la caja, la tienda web, los apartados, el club y las etiquetas de precio) suma una
--      condición por reemplazo anclado: una oferta con categorías «solo» O con modelos elegidos alcanza a las prendas de ESAS categorías
--      Y de ESOS modelos; sin ninguna de las dos, a las de su campaña (como siempre). «Dejar fuera», las tiendas y Claurè siguen igual.
--   3. `campana_reglas()` (la lee la pantalla) devuelve también `productos_solo`.
--   4. `guardar_oferta(...)`: la misma firma de `guardar_campana_regla` más `p_producto_ids`. Llama a `guardar_campana_regla` (que sigue
--      siendo la que valida y firma) y, en la MISMA transacción, deja los modelos de la oferta. Si algo falla, no queda ni la oferta ni sus
--      prendas a medias. Si la oferta ya existía y sus modelos cambian, el historial suma una fila con los de antes (solo se agrega).
--
-- QUÉ NO HACE. No cambia `registrar_venta` (sigue preguntando a `fn_campanas_en_sede`), ni `guardar_campana_regla`, ni los tipos de oferta
--   (sigue solo «un % menos»). La web llama a `guardar_oferta` solo si la oferta trae modelos: sin ellos sigue con `guardar_campana_regla`,
--   así la web nueva funciona aunque esta migración todavía no esté en producción (salvo para elegir prendas sueltas).
--
-- DESCARTÉ: agregar `p_producto_ids` a `guardar_campana_regla`: otra firma obliga a soltarla y reescribir su cuerpo entero desde producción
--   (20261023232000 + los anclajes de 20261027164000); el envoltorio la usa tal cual.
-- DESCARTÉ: guardar las prendas con una segunda llamada desde la web: si la segunda falla, la oferta queda guardada sin sus prendas (y rige
--   en toda la campaña). Una sola función = una sola transacción.
-- DESCARTÉ: elegir por variante (talla y color sueltos): Felipe mide por modelo; una oferta en «la talla M de Polo Brisa» no se pidió.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema): un modelo repetido en la misma oferta (clave primaria); un modelo que no existe
--   (llave foránea); una oferta borrada que deja modelos sueltos (`on delete cascade`, aunque una oferta nunca se borra: se retira).
--
-- SE ROMPE SI: alguien cambia el bloque de categorías de `fn_campanas_en_sede` antes de pegar esto: el ancla no aparece y la migración se
--   detiene sin tocar nada (`pg_temp.reemplazar_anclado`). Y si `campana_reglas()` cambió desde 20261023232000: la guarda de md5 se detiene.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una tabla NUEVA (nadie la usa todavía), RLS encendido sin políticas (solo la
--   leen funciones security definer, ADR-0195), reemplazos anclados y funciones. Sin `alter` de tablas en uso, sin `drop trigger`, sin
--   `select … into` dentro de un texto entre comillas (ADR-0288). Pegar ANTES de publicar la web que elige prendas sueltas.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:campana-reglas` (escenarios «prenda por prenda»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. Las guardas -------------------------------------------------------------------------------------------------------------------

do $$
declare
  v_cuerpo text;
begin
  if to_regprocedure('retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean)') is null then
    raise exception 'retail.guardar_campana_regla no existe con la firma de 20261023232000: esta migración va después. No se aplicó nada.';
  end if;
  v_cuerpo := (select prosrc from pg_proc where oid = to_regprocedure('retail.campana_reglas()'));
  if v_cuerpo is null then
    raise exception 'retail.campana_reglas() no existe: esta migración va después de 20261023232000. No se aplicó nada.';
  end if;
  if position('campana_regla_productos' in v_cuerpo) = 0 and md5(v_cuerpo) <> '26b9c321252c7e2df2522896573d68b5' then
    raise exception 'retail.campana_reglas() cambió desde 20261023232000 (md5 %): regenera esta migración desde su definición real. No se aplicó nada.', md5(v_cuerpo);
  end if;
end;
$$;

-- 1. La tabla ---------------------------------------------------------------------------------------------------------------------

create table if not exists retail.campana_regla_productos (
  regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  producto_id uuid not null references retail.productos (id),
  primary key (regla_id, producto_id)
);

create index if not exists campana_regla_productos_producto_idx on retail.campana_regla_productos (producto_id);

alter table retail.campana_regla_productos enable row level security;
revoke all on table retail.campana_regla_productos from public, anon, authenticated;

comment on table retail.campana_regla_productos is
  'De una oferta: los modelos (productos, con todas sus tallas y colores) a los que alcanza, además de sus categorías «solo». Sin filas ni categorías «solo»: todas las prendas de la campaña. Se escribe con guardar_oferta y se lee con campana_reglas() y fn_campanas_en_sede (ADR-0655).';

-- 2. La caja: una oferta alcanza también a sus modelos elegidos ------------------------------------------------------------------------

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  -- Ya aplicado = el ancla no está y el texto nuevo sí.
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$        exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo' and rc.categoria_id = p.categoria_id)
        or (
          not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
          and ($v$,
  $n$        exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo' and rc.categoria_id = p.categoria_id)
        -- ADR-0655: o uno de los modelos elegidos de la oferta (prenda por prenda).
        or exists (select 1 from retail.campana_regla_productos rp where rp.regla_id = r.id and rp.producto_id = p.id)
        or (
          not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
          and not exists (select 1 from retail.campana_regla_productos rp where rp.regla_id = r.id)
          and ($n$
);

comment on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) is
  'Las campañas (aprobadas, activas, vigentes) que alcanzan a cada variante EN esa sede, con su mayor %: el descuento de siempre de la campaña (por etiqueta manual o por categoría) o una de sus ofertas activas (fechas, días de la semana; con «solo estas categorías» o modelos elegidos rige en ellos aunque la campaña no los tenga; sin ellos, en las prendas de la campaña menos las que deja fuera). UNA fila por prenda y campaña. Fuente única de la regla; la caja, registrar_venta, los apartados, la tienda web, el club y las etiquetas de precio la leen.';

-- 3. La pantalla: cada oferta dice sus modelos ------------------------------------------------------------------------------------

-- Cambia lo que devuelve (suma `productos_solo`): no se puede reemplazar, se suelta y se crea. `drop function` no toma los candados de las políticas.
drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb,
  productos_solo uuid[]
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
         -- «Cambios» son las EDICIONES (la historia guarda también cada activación y retiro, pero eso no es «cambiarla»): solo las filas que
         -- guardaron cómo estaba (llevan el porcentaje).
         (select count(*)::integer from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje'),
         (select h.antes from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje' order by h.en desc, h.id desc limit 1),
         coalesce((select array_agg(rp.producto_id order by rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[])
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas (la misma de quien ve la pantalla); sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, sus modelos elegidos (productos_solo, ADR-0655), cuántas veces cambiaron y cómo estaban antes del último cambio. Las lee quien tiene la llave de las campañas (fn_puede_campanas); sin ella, ninguna fila.';

revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;

-- 4. Guardar una oferta con sus modelos, en una sola transacción ---------------------------------------------------------------------

create or replace function retail.guardar_oferta(
  p_regla_id uuid,
  p_etiqueta_id uuid,
  p_nombre text,
  p_porcentaje numeric,
  p_desde date,
  p_hasta date,
  p_dias_semana smallint[],
  p_categorias_solo uuid[],
  p_categorias_fuera uuid[],
  p_incluye_claure boolean,
  p_sede_ids uuid[],
  p_producto_ids uuid[],
  p_activar boolean
) returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_id uuid;
  v_productos uuid[];
  v_antes uuid[];
begin
  v_productos := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_producto_ids, '{}'::uuid[])) x where x is not null), '{}'::uuid[]);
  if cardinality(v_productos) > 500 then
    raise exception 'Una oferta puede elegir hasta 500 modelos sueltos. Para más, elige sus categorías.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_productos) x where not exists (select 1 from retail.productos pr where pr.id = x)) then
    raise exception 'Una de las prendas elegidas ya no existe. Vuelve a abrir la hoja y elígelas de nuevo.' using errcode = 'P0001';
  end if;
  v_antes := coalesce((select array_agg(rp.producto_id order by rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = p_regla_id), '{}'::uuid[]);

  -- La oferta en sí: la misma función de siempre valida (la llave de las campañas, fechas, días, categorías, tiendas) y firma.
  v_id := retail.guardar_campana_regla(p_regla_id, p_etiqueta_id, p_nombre, p_porcentaje, p_desde, p_hasta, p_dias_semana,
                                        p_categorias_solo, p_categorias_fuera, p_incluye_claure, p_sede_ids, p_activar);

  -- Sus modelos. Es configuración de la oferta (como sus categorías y tiendas), no historia: se reemplaza entera; el historial guarda los de antes.
  if v_antes is distinct from v_productos then
    delete from retail.campana_regla_productos where regla_id = v_id;
    insert into retail.campana_regla_productos (regla_id, producto_id) select v_id, x from unnest(v_productos) x;
    -- Una oferta que ya existía: el historial (solo se agrega, nunca se edita) suma una fila con los modelos de antes. Sin la clave
    -- `porcentaje` no cuenta como otra «edición» en campana_reglas(): es el detalle de esta.
    if p_regla_id is not null then
      insert into retail.campana_regla_historial (regla_id, antes, por)
      values (v_id, jsonb_build_object('productos_solo', to_jsonb(v_antes)), retail.fn_actor_persona_id(true));
    end if;
  end if;

  return v_id;
end;
$function$;

comment on function retail.guardar_oferta(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], boolean) is
  'Guarda una oferta de una campaña CON sus modelos elegidos (ADR-0655): llama a guardar_campana_regla (que valida y firma) y deja sus modelos en campana_regla_productos, todo en una transacción. La web la usa solo cuando la oferta trae modelos.';

revoke all on function retail.guardar_oferta(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], boolean) from public, anon;
grant execute on function retail.guardar_oferta(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], boolean) to authenticated;
