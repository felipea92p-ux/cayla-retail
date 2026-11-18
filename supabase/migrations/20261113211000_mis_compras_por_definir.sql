-- ============================================================================
-- 20261113211000_mis_compras_por_definir.sql — CAYLA V2 · ADR-0660 (Felipe, 2026-11-13)
-- «Algo nuevo» de Mis compras: una prenda se anota con su categoría «por definir» y su precio «a la espera de precio sugerido»
--
-- EL PROBLEMA PRIMERO. La compradora anota en la calle la proforma de un proveedor nuevo: dos docenas con su costo, pagadas. No sabe todavía
-- a qué categoría pertenece cada prenda ni a cuánto se vende, y la hoja no la dejaba guardar: la categoría la exigía la base en cada línea
-- (`orden_compra_items.categoria_id not null`, `fn_orden_compra_validar`) y el precio, la pantalla. La compra se quedaba sin anotar, y con
-- ella el papel y el pago, que sí se saben. Felipe: «Hay que crear esa opción de por definir y un aviso en pantalla. Ejemplo: 3 productos a
-- la espera de definir categoría», y para el precio, «crear opción a la espera de precio sugerido».
--
-- LO QUE ELIGIÓ FELIPE (2026-11-13, con la maqueta docs/maquetas/compras-por-definir-2026-11/):
--   · La prenda «por definir» VIAJA a la tienda igual, y la tienda dice qué es al recibirla (se descartó frenarla antes de mandarla).
--   · Antes de que llegue, la define quien la compró (desde Mis compras) o Compras (desde el aviso de «Revisar compras»).
--   · Sin precio también viaja: la tienda le pone el precio al crearla, como hoy cuando una orden no trae precio sugerido.
--
-- LA DECISIÓN DE DATOS.
--   1. «Por definir» es un ESTADO DE LA LÍNEA, nunca una categoría falsa: `orden_compra_items.categoria_id` y `despacho_items.categoria_id`
--      aceptan vacío. Una categoría «Por definir» crearía productos con ella y se colaría en Análisis, Frescura y el plan del piso (ADR-0377).
--   2. El precio que espera es una marca explícita, `orden_compra_items.precio_por_definir`: un precio vacío solo no basta, porque el
--      2026-11-13 producción ya tenía 37 líneas de Mis compras sin precio (el aviso las habría contado como «a la espera»).
--   3. Candados (lo que no puede existir): una línea sin categoría o con precio a la espera solo en una compra de Mis compras (con papel),
--      nunca en una prenda del catálogo, y nunca de vuelta («ya dice qué es» no vuelve a «por definir»). Una línea de envío sin categoría
--      solo si su línea de la compra tampoco la tiene. Y lo que entra al stock o a una diferencia (`despacho_recibidos`,
--      `despacho_diferencias`) sigue exigiendo categoría: la tienda la dice antes de contar la línea.
--   4. `registrar_compra_rapida` acepta en cada línea `categoria_por_definir` y `precio_por_definir` (verdaderos), y solo así deja vacío lo que
--      falta; lo vacío sin decirlo sigue siendo un error. `fn_orden_compra_validar` acepta la categoría vacía solo cuando una función de Mis
--      compras lo pide dentro de su transacción (`retail.compra_por_definir`).
--   5. `definir_prenda_de_compra`: llena lo que falta (categoría, precio o los dos) de un modelo de una compra (todas sus líneas, una por
--      tienda), mientras no esté en la tienda: Compras cualquiera, la compradora las suyas. Queda en `compra_correcciones` (quién y cuándo).
--   6. `fn_compras_por_definir`: lo que espera, por modelo, para el aviso de «Revisar compras» y de «Te toca».
--   7. Recibir: una línea sin categoría no se cuenta ni se cierra hasta que la tienda dice qué es (`corregir_linea_al_contar`, que además se
--      lo anota a la compra: es su primera definición). El papel pasa a los libros con la categoría que dijo la tienda.
--   8. Las lecturas que unían la categoría con `join` la dejan de saltar (`left join`): «Para mandar», corregir la compra, el detalle de la
--      orden, el envío y su resultado. Las que agrupan por categoría (los proveedores para comprar, el plan de compra) no cuentan lo que espera.
--
-- CONTRATO (Liskov)
--   PROMETE: una compra con prendas por definir se guarda con su papel y su pago; nada de lo que espera llega al stock sin que alguien diga qué
--            es; lo que antes se guardaba con categoría y precio da el mismo resultado.
--   ASUME:   las funciones vivas tienen el texto con que se escribió esto (cada reemplazo lo comprueba y frena si no).
--   NO HACE: no cambia lo que ya está anotado; no deja una prenda del catálogo «por definir»; no le pone categoría a nada por su cuenta.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: dos `alter column … drop not null`, una columna nueva con su valor de fábrica (119 líneas el
-- 2026-11-13), dos `check`, dos disparadores (`create or replace trigger`, sin `drop trigger`) y funciones. Sin políticas (ADR-0195). Sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Pegar ANTES de publicar la web: con la web nueva y la base vieja, guardar «Por
-- definir» da «La línea 1 necesita una categoría activa» y no queda nada a medias.
-- VERIFICACIÓN (→ t | t | t | t):
--   select (select is_nullable = 'YES' from information_schema.columns where table_schema = 'retail' and table_name = 'orden_compra_items' and column_name = 'categoria_id'),
--          to_regprocedure('retail.definir_prenda_de_compra(uuid[],uuid,numeric,uuid)') is not null,
--          position('ADR-0660' in pg_get_functiondef('retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)'::regprocedure)) > 0,
--          position('ADR-0660' in pg_get_functiondef('retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)'::regprocedure)) > 0;
-- CÓMO SE DESHACE: `pegar-en-produccion-deshacer-mis-compras-por-definir-2026-11-13.sql` (en esta carpeta, ensayado): los 23 reemplazos al revés, las tres
-- funciones nuevas fuera y `not null` de vuelta; se detiene si queda alguna línea por definir.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplaza `p_viejo` por `p_nuevo` en la función, exigiendo que el ancla aparezca exactamente `p_veces` veces. Si `p_nuevo` ya está,
-- no hace nada (re-ejecutable).
create or replace function pg_temp.reemplazar_por_definir(p_firma text, p_viejo text, p_nuevo text, p_veces integer default 1)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Las columnas y sus candados ----------
alter table retail.orden_compra_items alter column categoria_id drop not null;
alter table retail.despacho_items alter column categoria_id drop not null;
alter table retail.orden_compra_items add column if not exists precio_por_definir boolean not null default false;
comment on column retail.orden_compra_items.categoria_id is
  'La categoría de la prenda. Vacía solo en una prenda nueva de Mis compras anotada «por definir» (ADR-0660): la define quien compró, Compras o la tienda al recibir.';
comment on column retail.orden_compra_items.precio_por_definir is
  'ADR-0660: la prenda se anotó «a la espera de precio sugerido» (sin precio de venta, a propósito). Se apaga al ponerle precio.';
comment on column retail.despacho_items.categoria_id is
  'La categoría de la línea del envío. Vacía solo si su línea de la compra está «por definir» (ADR-0660): la tienda la dice antes de contarla.';

do $c$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.orden_compra_items'::regclass and conname = 'orden_compra_items_precio_por_definir') then
    alter table retail.orden_compra_items add constraint orden_compra_items_precio_por_definir
      check (not precio_por_definir or precio_venta_sugerido is null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.orden_compra_items'::regclass and conname = 'orden_compra_items_por_definir_sin_catalogo') then
    alter table retail.orden_compra_items add constraint orden_compra_items_por_definir_sin_catalogo
      check (producto_id is null or (categoria_id is not null and not precio_por_definir));
  end if;
end $c$;

-- Lo «por definir» solo vive en una compra de Mis compras, y lo definido no vuelve atrás.
create or replace function retail.fn_orden_compra_items_por_definir()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if (new.categoria_id is null or new.precio_por_definir)
     and not exists (select 1 from retail.ordenes_compra o where o.id = new.orden_compra_id and o.papel_id is not null) then
    raise exception 'Solo una compra de «Mis compras» lleva una prenda por definir: elige su categoría' using errcode = '23514', hint = 'por_definir_solo_mis_compras';
  end if;
  if tg_op = 'UPDATE' then
    if old.categoria_id is not null and new.categoria_id is null then
      raise exception 'Una prenda que ya dice qué es no vuelve a «por definir»' using errcode = '23514', hint = 'por_definir_no_vuelve';
    end if;
    if not old.precio_por_definir and new.precio_por_definir then
      raise exception 'Una prenda con su precio no vuelve a «a la espera de precio»' using errcode = '23514', hint = 'por_definir_no_vuelve';
    end if;
  end if;
  return new;
end $$;

create or replace trigger orden_compra_items_por_definir
  before insert or update of categoria_id, precio_por_definir, orden_compra_id on retail.orden_compra_items
  for each row execute function retail.fn_orden_compra_items_por_definir();

create or replace function retail.fn_despacho_items_por_definir()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.categoria_id is null
     and exists (select 1 from retail.orden_compra_items i where i.id = new.orden_compra_item_id and i.categoria_id is not null) then
    raise exception 'Esta prenda ya dice qué es en la compra: su línea del envío lleva la misma categoría' using errcode = '23514', hint = 'por_definir_envio';
  end if;
  if tg_op = 'UPDATE' and old.categoria_id is not null and new.categoria_id is null then
    raise exception 'Una línea del envío que ya dice qué es no vuelve a «por definir»' using errcode = '23514', hint = 'por_definir_no_vuelve';
  end if;
  return new;
end $$;

create or replace trigger despacho_items_por_definir
  before insert or update of categoria_id on retail.despacho_items
  for each row execute function retail.fn_despacho_items_por_definir();

revoke all on function retail.fn_orden_compra_items_por_definir() from public, anon, authenticated;
revoke all on function retail.fn_despacho_items_por_definir() from public, anon, authenticated;

-- ---------- 2. Anotar la compra: lo por definir, dicho de forma explícita ----------
-- Revisa las líneas antes de que las valide la regla de las órdenes: una prenda del catálogo no queda por definir; una prenda que dice estar
-- por definir no trae a la vez su categoría o su precio; y una prenda nueva sin categoría tiene que decirlo. Devuelve si alguna espera su
-- categoría (la regla de las órdenes la deja pasar solo entonces). Lo que no es un arreglo u objeto lo dice la función de siempre.
create or replace function retail.fn_compra_lineas_por_definir(p_lineas jsonb)
returns boolean
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_l jsonb;
  v_pos integer := 0;
  v_cat boolean;
  v_pre boolean;
  v_hay boolean := false;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    return false;
  end if;
  for v_l in select value from jsonb_array_elements(p_lineas) loop
    v_pos := v_pos + 1;
    continue when jsonb_typeof(v_l) <> 'object';
    begin
      v_cat := coalesce((v_l ->> 'categoria_por_definir')::boolean, false);
      v_pre := coalesce((v_l ->> 'precio_por_definir')::boolean, false);
    exception when others then
      raise exception 'Lo «por definir» de la prenda % no se entiende: recarga la pantalla', v_pos using errcode = 'P0001', hint = 'compra_por_definir';
    end;
    if (v_cat or v_pre) and nullif(v_l ->> 'producto_id', '') is not null then
      raise exception 'La prenda % es del catálogo: ya dice qué es y a cuánto se vende', v_pos using errcode = 'P0001', hint = 'compra_por_definir_catalogo';
    end if;
    if v_cat and nullif(v_l ->> 'categoria_id', '') is not null then
      raise exception 'La prenda % trae su categoría y a la vez dice que está por definir: elige una de las dos', v_pos
        using errcode = 'P0001', hint = 'compra_por_definir';
    end if;
    if not v_cat and nullif(v_l ->> 'producto_id', '') is null and nullif(v_l ->> 'categoria_id', '') is null then
      raise exception 'Elige qué es la prenda %, o di que está por definir', v_pos using errcode = 'P0001', hint = 'orden_compra_categoria';
    end if;
    if v_pre and nullif(btrim(coalesce(v_l ->> 'precio_venta', '')), '') is not null then
      raise exception 'La prenda % trae su precio de venta y a la vez dice que espera su precio: elige una de las dos', v_pos
        using errcode = 'P0001', hint = 'compra_por_definir';
    end if;
    v_hay := v_hay or v_cat;
  end loop;
  return v_hay;
end $$;
revoke all on function retail.fn_compra_lineas_por_definir(jsonb) from public, anon, authenticated;

-- La regla de las órdenes: la categoría vacía vale solo cuando una función de Mis compras lo pide (lo pone en su propia transacción).
select pg_temp.reemplazar_por_definir(
  'retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)',
  $v$    if v_categoria is null or not exists ($v$,
  $n$    -- ADR-0660: en una compra de Mis compras, una prenda nueva puede ir «por definir» (sin categoría) si su función lo pide.
    if (v_categoria is null and coalesce(current_setting('retail.compra_por_definir', true), '') <> 'si') or v_categoria is not null and not exists ($n$);

select pg_temp.reemplazar_por_definir(
  'retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text,text,text)',
  $v$  -- La serie y el número del papel: los mismos que pide `completar_papel_compra`.$v$,
  $n$  -- ADR-0660: lo «por definir» de cada prenda (la categoría de una nueva, el precio de venta), dicho de forma explícita.
  if retail.fn_compra_lineas_por_definir(p_lineas) then
    perform set_config('retail.compra_por_definir', 'si', true);
  end if;

  -- La serie y el número del papel: los mismos que pide `completar_papel_compra`.$n$);

-- El cuerpo de siempre guarda la marca del precio que espera.
select pg_temp.reemplazar_por_definir(
  'retail.fn_registrar_compra_rapida_base(uuid,uuid,text,numeric,text,jsonb)',
  $v$                                           precio_venta_sugerido, producto_id)
    select v_orden, row_number() over (order by (v ->> 'posicion')::integer), (v -> 'linea' ->> 'categoria_id')::uuid,
           (v -> 'linea' ->> 'marca_id')::uuid, nullif(btrim(coalesce(v -> 'linea' ->> 'descripcion', '')), ''),
           (v -> 'linea' ->> 'cantidad')::numeric::integer, (v -> 'linea' ->> 'costo')::numeric, 0,
           nullif(btrim(coalesce(v -> 'linea' ->> 'precio_venta', '')), '')::numeric, nullif(v -> 'linea' ->> 'producto_id', '')::uuid$v$,
  $n$                                           precio_venta_sugerido, producto_id, precio_por_definir)
    select v_orden, row_number() over (order by (v ->> 'posicion')::integer), nullif(v -> 'linea' ->> 'categoria_id', '')::uuid,
           (v -> 'linea' ->> 'marca_id')::uuid, nullif(btrim(coalesce(v -> 'linea' ->> 'descripcion', '')), ''),
           (v -> 'linea' ->> 'cantidad')::numeric::integer, (v -> 'linea' ->> 'costo')::numeric, 0,
           nullif(btrim(coalesce(v -> 'linea' ->> 'precio_venta', '')), '')::numeric, nullif(v -> 'linea' ->> 'producto_id', '')::uuid,
           coalesce((v -> 'linea' ->> 'precio_por_definir')::boolean, false) /* ADR-0660 */$n$);

-- ---------- 3. Corregir la compra: lo por definir sigue pasando la regla, y poner el precio apaga la espera ----------
select pg_temp.reemplazar_por_definir(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$    perform retail.fn_orden_compra_validar(v_papel.proveedor_id, v_destino, null, null, v_lineas,$v$,
  $n$    -- ADR-0660: una prenda de la compra puede seguir «por definir».
    perform set_config('retail.compra_por_definir', 'si', true);
    perform retail.fn_orden_compra_validar(v_papel.proveedor_id, v_destino, null, null, v_lineas,$n$);

select pg_temp.reemplazar_por_definir(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$           descripcion = v_descripcion, categoria_id = v_categoria, marca_id = v_marca$v$,
  $n$           descripcion = v_descripcion, categoria_id = v_categoria, marca_id = v_marca,
           precio_por_definir = (v_item.precio_por_definir and v_venta is null) /* ADR-0660 */$n$);

select pg_temp.reemplazar_por_definir(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$      v_nombre_cat := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);$v$,
  $n$      v_nombre_cat := coalesce((select c.nombre from retail.categorias c where c.id = v_item.categoria_id), 'Por definir' /* ADR-0660 */);$n$);

-- ---------- 4. Definir lo que falta antes de que llegue a la tienda ----------
create or replace function retail.definir_prenda_de_compra(p_item_ids uuid[], p_categoria_id uuid, p_precio_venta numeric, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_es_compras boolean := retail.fn_ve_modulo('fondos') is true;
  v_actor uuid;
  v_ids uuid[];
  v_papel retail.compra_papeles;
  v_papel_id uuid;
  v_item record;
  v_precio numeric := round(p_precio_venta, 2);
  v_cat_nombre text;
  v_nombre text;
  v_n integer := 0;
begin
  if not v_es_compras and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Definir una prenda necesita «Revisar compras» o «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'por_definir_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién define la prenda' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_token is null then
    raise exception 'Falta el identificador: vuelve a abrir la prenda' using errcode = 'P0001', hint = 'por_definir_sin_token';
  end if;
  v_ids := array(select distinct x from unnest(coalesce(p_item_ids, '{}'::uuid[])) x where x is not null order by x);
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 50 then
    raise exception 'Elige la prenda que vas a definir' using errcode = 'P0001', hint = 'por_definir_linea';
  end if;
  if p_categoria_id is null and p_precio_venta is null then
    raise exception 'Elige qué es o escribe a cuánto se vende' using errcode = 'P0001', hint = 'por_definir_nada';
  end if;

  -- Todas las líneas son de una misma compra de Mis compras.
  if (select count(distinct o.papel_id) from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
       where i.id = any (v_ids)) <> 1
     or (select count(*) from retail.orden_compra_items i where i.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'Esa prenda no es de una compra de Mis compras: recarga la pantalla' using errcode = 'P0001', hint = 'por_definir_linea';
  end if;
  v_papel_id := (select o.papel_id from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
                  where i.id = v_ids[1]);
  if v_papel_id is null then
    raise exception 'Esa prenda no es de una compra de Mis compras: recarga la pantalla' using errcode = 'P0001', hint = 'por_definir_linea';
  end if;

  -- Candados en el orden de siempre: mandar a la tienda de quien compró, el papel, los envíos que la llevan, sus líneas.
  for v_papel in select * from retail.compra_papeles p where p.id = v_papel_id loop
    exit;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('compra_mandar:' || v_papel.persona_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('compra_papel:' || v_papel_id::text, 0));

  -- El mismo guardado otra vez (doble clic, corte): devuelve lo que ya quedó.
  if exists (select 1 from retail.compra_correcciones c where c.lote = p_token and c.papel_id = v_papel_id) then
    return jsonb_build_object('papel_id', v_papel_id, 'ya_estaba', true);
  end if;
  if exists (select 1 from retail.compra_correcciones c where c.lote = p_token) then
    raise exception 'Eso ya se guardó en otra compra: vuelve a abrir la prenda' using errcode = 'P0001', hint = 'por_definir_otro_lote';
  end if;

  if not v_es_compras and v_papel.persona_id <> v_actor then
    raise exception 'Esa compra no es tuya: la define Compras' using errcode = '42501', hint = 'por_definir_ajena';
  end if;
  for v_papel in select * from retail.compra_papeles p where p.id = v_papel_id for update loop
    exit;
  end loop;
  if v_papel.estado <> 'por_completar' then
    raise exception 'Esa compra ya pasó a los libros o se anuló: lo que dice la tienda es lo que vale' using errcode = 'P0001', hint = 'por_definir_cerrada';
  end if;
  if exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = v_papel_id) then
    raise exception 'Esa compra ya llegó a la tienda: allí se dijo qué es' using errcode = 'P0001', hint = 'por_definir_en_tienda';
  end if;
  perform 1 from retail.despachos d
   where d.id in (select di.despacho_id from retail.despacho_items di where di.orden_compra_item_id = any (v_ids))
   order by d.id
     for update;
  if exists (select 1 from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
              where di.orden_compra_item_id = any (v_ids) and d.estado in ('abierto', 'cerrado')) then
    raise exception 'Esa prenda ya está en la tienda: la define quien la recibe' using errcode = 'P0001', hint = 'por_definir_en_tienda';
  end if;

  if p_categoria_id is not null and not exists (select 1 from retail.categorias c where c.id = p_categoria_id and c.activo) then
    raise exception 'Elige una categoría activa' using errcode = 'P0001', hint = 'orden_compra_categoria';
  end if;
  if p_precio_venta is not null and (v_precio = 'NaN'::numeric or v_precio <> p_precio_venta) then
    raise exception 'El precio de venta admite como máximo 2 decimales' using errcode = 'P0001', hint = 'orden_compra_sugerido';
  end if;
  v_cat_nombre := (select c.nombre from retail.categorias c where c.id = p_categoria_id);

  for v_item in
    select i.*, o.estado as orden_estado
      from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
     where i.id = any (v_ids)
     order by i.id
       for update of i
  loop
    v_nombre := coalesce(nullif(btrim(v_item.descripcion), ''), 'la prenda');
    if v_item.orden_estado = 'anulada' then
      raise exception '«%» es de una orden anulada: ya no se define', v_nombre using errcode = 'P0001', hint = 'por_definir_anulada';
    end if;
    if p_categoria_id is not null and v_item.categoria_id is not null then
      raise exception '«%» ya dice qué es: si está mal, corrige la compra', v_nombre using errcode = 'P0001', hint = 'por_definir_ya_definida';
    end if;
    if p_precio_venta is not null and not v_item.precio_por_definir then
      raise exception '«%» ya tiene su precio de venta: si está mal, corrige la compra', v_nombre using errcode = 'P0001', hint = 'por_definir_ya_definida';
    end if;
    -- El precio, con la regla de las órdenes (de 0 a 5 000; el 0 solo donde la categoría lo admite).
    if p_precio_venta is not null then
      perform retail.fn_orden_compra_validar_sugerido(1, jsonb_build_object('precio_venta_sugerido', v_precio),
                                                      coalesce(p_categoria_id, v_item.categoria_id));
    end if;

    update retail.orden_compra_items i
       set categoria_id = coalesce(i.categoria_id, p_categoria_id),
           precio_venta_sugerido = case when p_precio_venta is not null then v_precio else i.precio_venta_sugerido end,
           precio_por_definir = i.precio_por_definir and p_precio_venta is null
     where i.id = v_item.id;
    -- Si ya salió en un envío que todavía no se abre, su línea del envío lo sabe también.
    if p_categoria_id is not null then
      update retail.despacho_items di set categoria_id = p_categoria_id
       where di.orden_compra_item_id = v_item.id and di.categoria_id is null
         and exists (select 1 from retail.despachos d where d.id = di.despacho_id and d.estado = 'en_camino');
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_token, v_papel_id, v_item.id, 'categoria', 'Por definir', v_cat_nombre, v_actor);
    end if;
    if p_precio_venta is not null then
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_token, v_papel_id, v_item.id, 'precio_venta', null, v_precio::text, v_actor);
    end if;
    v_n := v_n + 1;
  end loop;

  -- Actividad (ADR-0207), sin montos. Si falla, la definición igual queda.
  begin
    perform retail.fn_actividad_anotar(case when v_es_compras then 'fondos' else 'ordenes_compra' end, 'compra_prenda_definida',
      'definió ' || retail.fn_actividad_cuantas(v_n, 'línea', 'líneas') || ' de una compra a '
        || (select pr.nombre from retail.proveedores pr where pr.id = v_papel.proveedor_id) || ': '
        || concat_ws(' y ', case when p_categoria_id is not null then 'qué es' end, case when p_precio_venta is not null then 'su precio' end),
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_papeles', v_papel_id::text, now(),
      jsonb_build_object('papel_id', v_papel_id, 'lote', p_token, 'lineas', v_n), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la definición de la compra %: %', v_papel_id, sqlerrm;
  end;

  return jsonb_build_object('papel_id', v_papel_id, 'ya_estaba', false, 'lineas', v_n);
end $$;
comment on function retail.definir_prenda_de_compra(uuid[], uuid, numeric, uuid) is
  'ADR-0660: llena la categoría y/o el precio de venta que una prenda de Mis compras dejó «por definir», mientras no esté en la tienda. Compras cualquiera; la compradora, las suyas.';
revoke all on function retail.definir_prenda_de_compra(uuid[], uuid, numeric, uuid) from public, anon;
grant execute on function retail.definir_prenda_de_compra(uuid[], uuid, numeric, uuid) to authenticated;

-- Firma con la cuenta de una persona sin combo (desde una terminal, el combo), como corregir la compra.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('compra_definir', 'Definir la categoría o el precio de una prenda de Mis compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 5. Lo que espera, por modelo: el aviso de «Revisar compras» y de «Te toca» ----------
-- Un modelo = las líneas de una compra con el mismo nombre, marca y lo mismo por definir (una por tienda). Solo lo que todavía se puede
-- definir desde aquí: ni lo que ya está en la tienda (lo define quien recibe) ni lo de una compra anulada, completada o ya llegada.
create or replace function retail.fn_compras_por_definir()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_es_compras boolean := retail.fn_ve_modulo('fondos') is true;
  v_persona uuid;
begin
  if not v_es_compras and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver lo que espera definirse necesita «Revisar compras» o «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'por_definir_sin_modulo';
  end if;
  v_persona := retail.fn_persona_de_la_cuenta();
  return coalesce((
    with lineas as (
      select i.id, i.categoria_id, i.precio_por_definir, i.marca_id, i.cantidad, i.precio_unitario,
             coalesce(nullif(btrim(i.descripcion), ''), 'Sin nombre') as nombre, o.ubicacion_destino_id,
             p.id as papel_id, p.persona_id, p.proveedor_id, p.fecha, p.created_at,
             exists (select 1 from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                      where di.orden_compra_item_id = i.id and d.estado = 'en_camino') as en_camino
        from retail.orden_compra_items i
        join retail.ordenes_compra o on o.id = i.orden_compra_id and o.estado <> 'anulada'
        join retail.compra_papeles p on p.id = o.papel_id and p.estado = 'por_completar'
       where (i.categoria_id is null or i.precio_por_definir)
         and (v_es_compras or p.persona_id = v_persona)
         and not exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = p.id)
         and not exists (select 1 from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                          where di.orden_compra_item_id = i.id and d.estado in ('abierto', 'cerrado'))
    ),
    modelos as (
      select l.papel_id, lower(l.nombre) as clave, l.marca_id, l.categoria_id, l.precio_por_definir,
             min(l.nombre) as nombre, array_agg(l.id order by l.id) as ids, sum(l.cantidad)::integer as cantidad,
             max(l.precio_unitario) as costo, bool_or(l.en_camino) as en_camino,
             array_agg(distinct l.ubicacion_destino_id) as destinos,
             min(l.persona_id::text)::uuid as persona_id, min(l.proveedor_id::text)::uuid as proveedor_id,
             min(l.fecha) as fecha, min(l.created_at) as creado_en
        from lineas l
       group by l.papel_id, lower(l.nombre), l.marca_id, l.categoria_id, l.precio_por_definir
    )
    select jsonb_agg(jsonb_build_object(
             'ids', to_jsonb(m.ids), 'papel_id', m.papel_id, 'nombre', m.nombre, 'cantidad', m.cantidad, 'costo', m.costo,
             'categoria_por_definir', m.categoria_id is null, 'precio_por_definir', m.precio_por_definir,
             'categoria_id', m.categoria_id, 'categoria', c.nombre, 'marca', ma.nombre,
             'admite_precio_cero', coalesce(retail.fn_categoria_admite_precio_cero(m.categoria_id), false),
             'proveedor', pr.nombre,
             'compradora', coalesce((select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = m.persona_id), 'Compras'),
             'mia', m.persona_id = v_persona,
             'tiendas', coalesce((select jsonb_agg(u.nombre order by u.nombre) from retail.ubicaciones u where u.id = any (m.destinos)), '[]'::jsonb),
             'en_camino', m.en_camino, 'fecha', m.fecha, 'creado_en', m.creado_en)
           order by m.creado_en, m.nombre)
      from modelos m
      join retail.proveedores pr on pr.id = m.proveedor_id
      left join retail.categorias c on c.id = m.categoria_id
      left join retail.marcas ma on ma.id = m.marca_id), '[]'::jsonb);
end $$;
comment on function retail.fn_compras_por_definir() is
  'ADR-0660: las prendas de Mis compras que esperan su categoría o su precio, por modelo, que todavía se pueden definir antes de llegar a la tienda. Compras ve todas; la compradora, las suyas.';
revoke all on function retail.fn_compras_por_definir() from public, anon;
grant execute on function retail.fn_compras_por_definir() to authenticated;

-- ---------- 6. Recibir: la tienda dice qué es antes de contar ----------
select pg_temp.reemplazar_por_definir(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$      from retail.despacho_items di
      join retail.categorias c on c.id = di.categoria_id
      left join retail.marcas m on m.id = di.marca_id
     where di.id = p_despacho_item_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'conteo_linea_ajena';
    end if;$v$,
  $n$      from retail.despacho_items di
      left join retail.categorias c on c.id = di.categoria_id
      left join retail.marcas m on m.id = di.marca_id
     where di.id = p_despacho_item_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'conteo_linea_ajena';
    end if;
    if v_cat is null then
      -- ADR-0660: la prenda llegó «por definir»: primero se dice qué es (corregir_linea_al_contar) y después se cuenta.
      raise exception 'Primero di qué es «%»: elige su categoría y después cuéntala', coalesce(nullif(v_donde, ''), 'esta prenda')
        using hint = 'recepcion_por_definir';
    end if;$n$);

select pg_temp.reemplazar_por_definir(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$  -- Toda línea del envío se contó, aunque sea en 0 («no llegó nada» también es un número).$v$,
  $n$  -- ADR-0660: una prenda que llegó «por definir» no se cierra sin decir qué es (lo recibido y lo que faltó llevan su categoría).
  for v_k in
    select coalesce(nullif(btrim(di.descripcion), ''), 'una prenda sin nombre') as etiqueta, i.posicion, o.numero as orden_numero
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
     where di.despacho_id = p_despacho_id and di.categoria_id is null
     order by o.numero, i.posicion
     limit 1
  loop
    raise exception 'Falta decir qué es «%» (línea % de la %): elige su categoría y cuéntala', v_k.etiqueta, v_k.posicion,
      retail.fn_orden_compra_numero_texto(v_k.orden_numero) using hint = 'recepcion_por_definir';
  end loop;

  -- Toda línea del envío se contó, aunque sea en 0 («no llegó nada» también es un número).$n$);

-- La recepción de un solo paso (la de antes del conteo por líneas): tampoco recibe lo que no dice qué es.
select pg_temp.reemplazar_por_definir(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.$v$,
  $n$  -- ADR-0660: una prenda «por definir» se recibe contándola, después de decir qué es.
  if exists (select 1 from retail.despacho_items di where di.despacho_id = p_despacho_id and di.categoria_id is null) then
    raise exception 'Este envío trae prendas por definir: recíbelo contando, y di qué es cada una' using hint = 'recepcion_por_definir';
  end if;

  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.$n$);

-- Decir qué es al contar: si la compra la anotó «por definir», esta es su primera definición y la compra la guarda.
select pg_temp.reemplazar_por_definir(
  'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $v$    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;$v$,
  $n$    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;
    -- ADR-0660: la prenda venía «por definir» desde la compra: lo que dice la tienda es su categoría también en la compra.
    update retail.orden_compra_items oc set categoria_id = p_categoria_id
     where oc.id = v_item.orden_compra_item_id and oc.categoria_id is null;$n$);

select pg_temp.reemplazar_por_definir(
  'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $v$    v_cat_antes := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);$v$,
  $n$    v_cat_antes := coalesce((select c.nombre from retail.categorias c where c.id = v_item.categoria_id), 'Por definir' /* ADR-0660 */);$n$);

-- El papel pasa a los libros con la categoría que dijo la tienda (la compra ya la guarda; esto es la red, por si no).
select pg_temp.reemplazar_por_definir(
  'retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
  $v$           'oci', i.id, 'cat', i.categoria_id,$v$,
  $n$           'oci', i.id, 'cat', coalesce(i.categoria_id, (select di.categoria_id from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                                                        where di.orden_compra_item_id = i.id and d.estado = 'cerrado' and di.categoria_id is not null
                                                        order by d.numero desc limit 1)) /* ADR-0660 */,$n$);

-- ---------- 7. Las lecturas que unían la categoría dejan de saltarse la prenda ----------
select pg_temp.reemplazar_por_definir(
  'retail.fn_envio_detalle(uuid)',
  $v$                      'categoria_id', di.categoria_id,
                      'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),$v$,
  $n$                      'categoria_id', di.categoria_id,
                      -- ADR-0660: una prenda «por definir» llega sin categoría: la tienda la dice al contar.
                      'categoria', case when c.id is not null then jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia) end,$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_envio_detalle(uuid)',
  $v$               join retail.categorias c on c.id = di.categoria_id
               left join retail.marcas m on m.id = di.marca_id
              where di.despacho_id = d.id$v$,
  $n$               left join retail.categorias c on c.id = di.categoria_id /* ADR-0660 */
               left join retail.marcas m on m.id = di.marca_id
              where di.despacho_id = d.id$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_mis_envios()',
  $v$                     join retail.categorias c on c.id = di.categoria_id$v$,
  $n$                     left join retail.categorias c on c.id = di.categoria_id /* ADR-0660 */$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_envio_resultado(uuid)',
  $v$               join retail.categorias cat on cat.id = i.categoria_id$v$,
  $n$               left join retail.categorias cat on cat.id = i.categoria_id /* ADR-0660 */$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_mi_plata_compras()',
  $v$            join retail.categorias cat on cat.id = i.categoria_id$v$,
  $n$            left join retail.categorias cat on cat.id = i.categoria_id /* ADR-0660 */$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_compra_para_corregir(uuid)',
  $v$        join retail.categorias c on c.id = i.categoria_id$v$,
  $n$        left join retail.categorias c on c.id = i.categoria_id /* ADR-0660 */$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_compra_para_corregir(uuid)',
  $v$               'cantidad', i.cantidad, 'costo', i.precio_unitario, 'precio_venta', i.precio_venta_sugerido,$v$,
  $n$               'cantidad', i.cantidad, 'costo', i.precio_unitario, 'precio_venta', i.precio_venta_sugerido,
               'precio_por_definir', i.precio_por_definir /* ADR-0660 */,$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$               join retail.categorias c on c.id = i.categoria_id$v$,
  $n$               left join retail.categorias c on c.id = i.categoria_id /* ADR-0660 */$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_comprobante_orden_resultado(uuid,boolean)',
  $v$                   join retail.categorias cat on cat.id = oi.categoria_id$v$,
  $n$                   left join retail.categorias cat on cat.id = oi.categoria_id /* ADR-0660 */$n$);

-- Lo que agrupa por categoría no cuenta lo que espera: no es de ninguna todavía.
select pg_temp.reemplazar_por_definir(
  'retail.fn_proveedores_para_comprar()',
  $v$       where o.estado <> 'anulada'
    ),$v$,
  $n$       where o.estado <> 'anulada' and i.categoria_id is not null /* ADR-0660 */
    ),$n$);

select pg_temp.reemplazar_por_definir(
  'retail.fn_plan_compra_pedido(uuid)',
  $v$from lineas l group by l.categoria_id) g)$v$,
  $n$from lineas l where l.categoria_id is not null /* ADR-0660 */ group by l.categoria_id) g)$n$);

-- ---------- 8. Comprobación final ----------
do $comprueba$
declare
  v text;
begin
  foreach v in array array[
    'retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)',
    'retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text,text,text)',
    'retail.fn_registrar_compra_rapida_base(uuid,uuid,text,numeric,text,jsonb)',
    'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
    'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
    'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
    'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
    'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
    'retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
    'retail.fn_envio_detalle(uuid)', 'retail.fn_mis_envios()', 'retail.fn_envio_resultado(uuid)', 'retail.fn_mi_plata_compras()',
    'retail.fn_compra_para_corregir(uuid)', 'retail.fn_orden_compra_detalle(uuid)', 'retail.fn_comprobante_orden_resultado(uuid,boolean)',
    'retail.fn_proveedores_para_comprar()', 'retail.fn_plan_compra_pedido(uuid)'] loop
    if position('ADR-0660' in pg_get_functiondef(v::regprocedure)) = 0 then
      raise exception 'La migración 20261113211000 no quedó aplicada en %: revisa antes de seguir.', v;
    end if;
  end loop;
end $comprueba$;

reset lock_timeout;
