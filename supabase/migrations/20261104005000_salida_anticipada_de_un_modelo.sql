-- ============================================================================
-- 20261104005000_salida_anticipada_de_un_modelo.sql — CAYLA V2 · ADR-0393 (act. 2026-11-03)
-- Recibir: un modelo sale a la venta sin cerrar todo el envío, y lo demás se sigue contando.
--
-- EL PROBLEMA PRIMERO. Felipe, 2026-11-03: empiezo a contar un envío de Compras y unos polos tienen que salir ya. Hasta hoy el único camino al stock
-- era cerrar el envío entero, y el cierre exige contar todas las líneas: los polos esperaban a que terminara de contarse todo lo demás.
--
-- QUÉ CAMBIA
--   1. `llevar_al_stock_ahora`: mete al stock lo repartido de UNA prenda de UNA línea, con el mismo y único camino que escribe stock de un envío
--      (`fn_recepcion_entrar`). Lo contado no cambia y lo que entró sale de lo separado: es la forma en que un envío reabierto ya queda, así que el
--      cierre final, `fn_envio_cuentas` y la pantalla no aprenden nada nuevo. Lo que falta o sobra se mide solo al cierre final, contando lo que ya salió.
--   2. `despacho_salidas`: el rastro de cada tanda, con su token (un doble clic no mete dos veces), quién, cuánto y a qué costo.
--   3. `corregir_salida`: deshace una tanda con un movimiento de salida, con quién y por qué, solo mientras siga en el almacén y el envío siga abierto.
--      Lo recibido de esa tanda se mueve a su fila de `despacho_salidas` (nada se pierde) y las unidades vuelven a lo separado.
--   5. Compras ve «12 de 70 ya en stock» (`fn_orden_compra_detalle`) y lo que quedó a medias se ve en Te toca y en Recibir (`fn_envios_a_medias`); a los 3 días, resaltado y también para el líder.
--   4. Proveedor «Por confirmar»: lo que llegó sin aviso y sin saber de quién también sale; su lote queda a nombre de ese proveedor, inactivo: no se elige
--      en ninguna lista. `poner_proveedor_envio` lo cambia al real. El envío sigue sin cerrar hasta tenerlo. Cambia lo descartado el 2026-10-14.
--
-- LO QUE NO CAMBIA
--   · El costo: el de la orden, o el que escriba quien ve el dinero; uno fuera de lo normal pide confirmar (lo hace `fn_recepcion_entrar`).
--   · Con algo en el stock, el envío no se cancela: se cierra con lo que hay (20261104000000).
--
-- DESCARTÉ
--   · Cerrar y reabrir por debajo: dejaría una deuda de lo que aún no se contó, y un cierre que nadie hizo.
--   · Una fila negativa en lo recibido para corregir: `cantidad > 0` es un candado, y todos los que suman lo recibido tendrían que aprender a restarla.
--   · Corregir una tanda unida a una factura o con dañadas: su cupo y su cuarentena no se deshacen limpio. Eso va a Ajustar stock.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente. RLS encendido sin políticas: la tabla
-- nueva solo se lee por funciones `security definer`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El proveedor «Por confirmar» ----------
alter table retail.proveedores add column if not exists por_confirmar boolean not null default false;
comment on column retail.proveedores.por_confirmar is
  'ADR-0393 (act. 2026-11-03): el único proveedor de lo que salió al stock sin saber de quién era. Inactivo: no se elige en ninguna lista y se cambia por el real.';
create unique index if not exists proveedores_uno_por_confirmar on retail.proveedores (por_confirmar) where por_confirmar;
insert into retail.proveedores (nombre, activo, por_confirmar)
select 'Por confirmar', false, true
 where not exists (select 1 from retail.proveedores p where p.por_confirmar);

-- ---------- 2. El rastro de cada tanda ----------
create table if not exists retail.despacho_salidas (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  despacho_item_id uuid references retail.despacho_items (id),
  extra_posicion integer,
  producto_id uuid not null references retail.productos (id),
  unidades integer not null check (unidades > 0),
  -- [{variante_id, cantidad, danadas, costo_antes, costo_despues}]
  lineas jsonb not null,
  recibidos uuid[] not null,
  token uuid not null unique,
  huella text not null,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  corregida_en timestamptz,
  corregida_por uuid,
  corregida_motivo text,
  corregida_token uuid unique,
  -- Lo recibido de esta tanda, tal como estaba, cuando se corrige: se mueve aquí, no se pierde.
  recibidos_archivados jsonb,
  constraint despacho_salidas_linea_o_extra check ((despacho_item_id is null) <> (extra_posicion is null))
);
create index if not exists despacho_salidas_despacho on retail.despacho_salidas (despacho_id);
alter table retail.despacho_salidas enable row level security;
revoke all on retail.despacho_salidas from public, anon, authenticated;
comment on table retail.despacho_salidas is
  'ADR-0393 (act. 2026-11-03): cada tanda que salió al stock antes de cerrar el envío. Sin políticas: se lee y se escribe solo por funciones.';

-- ---------- 3. Lo recibido de una tanda se puede archivar, y solo así ----------
select pg_temp.reemplazar('retail.fn_recepcion_despacho_fija()',
$v$  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró'$v$,
$n$  -- Corregir una tanda (20261104005000): la fila se mueve a `despacho_salidas.recibidos_archivados`, en la misma transacción.
  if tg_op = 'DELETE' and tg_table_name = 'despacho_recibidos' and coalesce(current_setting('retail.corrigiendo_salida', true), '') = 'si' then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró'$n$,
1);

-- ---------- 4. Llevar al stock ahora ----------
create or replace function retail.fn_salida_resultado(p_salida_id uuid, p_repetido boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'salida_id', s.id, 'despacho_id', s.despacho_id, 'producto_id', s.producto_id, 'unidades', s.unidades, 'repetido', p_repetido,
           'lineas', (select jsonb_agg(jsonb_build_object('variante_id', l ->> 'variante_id', 'cantidad', (l ->> 'cantidad')::integer, 'danadas', (l ->> 'danadas')::integer))
                        from jsonb_array_elements(s.lineas) l))
    from retail.despacho_salidas s
   where s.id = p_salida_id;
$$;
revoke all on function retail.fn_salida_resultado(uuid, boolean) from public, anon, authenticated;

create or replace function retail.llevar_al_stock_ahora(
  p_despacho_id uuid,
  p_despacho_item_id uuid,
  p_extra_posicion integer,
  p_version_conteo integer,
  p_producto_id uuid,
  p_variantes jsonb,
  p_costo numeric,
  p_confirma boolean,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_huella text;
  v_salida retail.despacho_salidas;
  v_k record;
  v_sin_aviso boolean;
  v_prov uuid;
  v_sep jsonb;
  v_prenda jsonb;
  v_vars jsonb;
  v_unidades integer;
  v_ids uuid[];
  v_cp jsonb;
  v_costo numeric;
  v_lineas jsonb;
  v_antes uuid[];
  v_id uuid;
  v_nombre text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Llevar al stock necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_token is null then
    raise exception 'Falta el código de esta acción: recarga la pantalla' using hint = 'salida_sin_token';
  end if;
  -- Candados, en el orden de `cerrar_conteo_envio` (ADR-0190): el envío → sus órdenes → sus líneas → (al entrar) el papel, las variantes y el stock.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: la misma tanda devuelve lo mismo. El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('item', p_despacho_item_id, 'extra', p_extra_posicion, 'producto', p_producto_id, 'variantes', p_variantes, 'costo', p_costo)::text);
  select s.* into v_salida from retail.despacho_salidas s where s.token = p_token;
  if found then
    if v_salida.despacho_id = p_despacho_id and v_salida.huella = v_huella then
      return retail.fn_salida_resultado(v_salida.id, true);
    end if;
    raise exception 'Esa tanda ya se guardó con otros datos: recarga la pantalla' using hint = 'salida_otros_datos';
  end if;

  if v_despacho.estado <> 'abierto' then
    raise exception 'Este envío ya no se está contando: recarga la pantalla' using hint = 'envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  perform 1
     from retail.ordenes_compra o
    where o.id in (select i.orden_compra_id
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by o.id
      for share;
  perform 1
     from retail.orden_compra_items i
    where i.id in (select di.orden_compra_item_id from retail.despacho_items di where di.despacho_id = p_despacho_id)
    order by i.id
      for update;

  select k.id, k.despacho_item_id, k.extra_posicion, k.contadas, k.separado, k.costo_unitario, k.costos_prendas, k.version,
         di.precio_unitario, di.compra_item_id, di.orden_compra_item_id, i.posicion, o.numero as orden_numero,
         coalesce(o.proveedor_id, k.proveedor_id) as proveedor_id, coalesce(di.categoria_id, k.categoria_id) as categoria_id,
         coalesce(di.marca_id, k.marca_id) as marca_id,
         case when k.despacho_item_id is not null then concat_ws(' · ', c.nombre, m.nombre, di.descripcion)
              else concat_ws(' · ', c.nombre, m.nombre) || ' (fuera de la guía)' end as donde,
         retail.fn_envio_persona(k.contado_por) ->> 'nombre' as quien
    into v_k
    from retail.despacho_conteos k
    left join retail.despacho_items di on di.id = k.despacho_item_id
    left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    left join retail.ordenes_compra o on o.id = i.orden_compra_id
    join retail.categorias c on c.id = coalesce(di.categoria_id, k.categoria_id)
    left join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)
   where k.despacho_id = p_despacho_id
     and (k.despacho_item_id = p_despacho_item_id or k.extra_posicion = p_extra_posicion);
  if not found then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;
  if p_version_conteo is null or v_k.version <> p_version_conteo then
    raise exception '% cambió mientras lo llevabas al stock (lo guardó %): revisa y vuelve a intentar', v_k.donde, coalesce(v_k.quien, 'otra persona')
      using errcode = 'PT409', hint = 'conteo_cambiado';
  end if;

  v_sin_aviso := exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id);
  v_prov := v_k.proveedor_id;
  -- Sin aviso y sin saber de quién: sale igual, a nombre de «Por confirmar». El envío no cierra hasta tener el real (20261104005000).
  if v_prov is null and v_sin_aviso then
    v_prov := (select p.id from retail.proveedores p where p.por_confirmar);
  end if;

  v_sep := retail.fn_envio_leer_separado(v_k.separado, v_k.donde);
  v_prenda := (select x from jsonb_array_elements(v_sep -> 'prendas') x where (x ->> 'producto_id')::uuid = p_producto_id limit 1);
  if v_prenda is null then
    raise exception 'Esa prenda no está contada en %: recarga la pantalla', v_k.donde using hint = 'salida_prenda_no_esta';
  end if;

  v_vars := retail.fn_recepcion_leer_variantes(coalesce(p_variantes, '[]'::jsonb), v_k.donde);
  v_vars := coalesce((select jsonb_agg(v) from jsonb_array_elements(v_vars) v where (v ->> 'cantidad')::integer > 0), '[]'::jsonb);
  v_unidades := coalesce((select sum((v ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) v), 0)::integer;
  if v_unidades = 0 then
    raise exception 'Reparte en tallas y colores lo que va a salir' using hint = 'salida_vacia';
  end if;
  if v_unidades > (v_prenda ->> 'cantidad')::integer then
    raise exception 'De esa prenda contaste %, y quieres llevar %: corrige el reparto', (v_prenda ->> 'cantidad')::integer, v_unidades using hint = 'salida_de_mas';
  end if;
  v_ids := array(select (v ->> 'variante_id')::uuid from jsonb_array_elements(v_vars) v);
  if exists (select 1 from unnest(v_ids) x left join retail.variantes vr on vr.id = x where vr.producto_id is distinct from p_producto_id) then
    raise exception 'Una talla o color no es de esa prenda: recarga la pantalla' using hint = 'recepcion_prenda_ajena';
  end if;

  -- El costo: el de esta prenda o el de su línea (el de la orden). Lo que está fuera de la guía sin aviso lo escribe solo quien ve el dinero de Compras.
  v_cp := coalesce(v_k.costos_prendas, '{}'::jsonb);
  if p_costo is not null then
    if p_costo < 0 or p_costo > 99999.99 or p_costo <> round(p_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_k.donde using hint = 'recepcion_costo';
    end if;
    if v_k.despacho_item_id is null and v_sin_aviso and not retail.fn_puede_ver_dinero_de_compras() then
      raise exception 'Tu rol no ve el dinero de Compras: recibe sin costo, llega con la factura' using hint = 'recepcion_costo_sin_permiso';
    end if;
    v_cp := v_cp || jsonb_build_object(lower(p_producto_id::text), p_costo);
  end if;
  v_costo := coalesce(v_k.costo_unitario, v_k.precio_unitario);
  if v_k.despacho_item_id is null and not v_sin_aviso and v_costo is null and not (v_cp ? lower(p_producto_id::text)) then
    raise exception 'Escribe el costo de %', v_k.donde using hint = 'recepcion_costo';
  end if;

  -- Lo que costaba cada talla antes de entrar: para que corregir la tanda lo devuelva.
  v_lineas := (select jsonb_agg(v || jsonb_build_object('costo_antes', vr.costo))
                 from jsonb_array_elements(v_vars) v join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid);

  v_antes := array(select r.id from retail.despacho_recibidos r where r.despacho_id = p_despacho_id);
  -- `enviado` y `contado` en 0: lo que falta o sobra se mide solo al cierre final, con todo lo contado.
  perform retail.fn_recepcion_entrar(p_despacho_id, v_despacho.ubicacion_destino_id, v_despacho.numero_guia, v_envio, v_actor,
    jsonb_build_array(jsonb_build_object(
      'tipo', case when v_k.despacho_item_id is null then 'extra' else 'linea' end,
      'despacho_item_id', v_k.despacho_item_id, 'extra', v_k.extra_posicion, 'orden_numero', v_k.orden_numero, 'posicion', v_k.posicion,
      'orden_compra_item_id', v_k.orden_compra_item_id, 'compra_item_id', v_k.compra_item_id,
      'proveedor_id', v_prov, 'categoria_id', v_k.categoria_id, 'marca_id', v_k.marca_id,
      'enviado', 0, 'contado', 0, 'costo', v_costo, 'confirma', coalesce(p_confirma, false),
      'variantes', retail.fn_recepcion_costos_a_variantes(v_vars, v_cp), 'faltante_causa', null, 'sobrante_causa', null, 'nota', null,
      'donde', v_k.donde)),
    v_ids, null);

  v_lineas := (select jsonb_agg(l || jsonb_build_object('costo_despues', vr.costo))
                 from jsonb_array_elements(v_lineas) l join retail.variantes vr on vr.id = (l ->> 'variante_id')::uuid);

  -- Lo contado no cambia: lo que entró sale de lo separado, como queda un envío reabierto. Lo demás de esa prenda sigue por repartir.
  update retail.despacho_conteos k
     set separado = jsonb_build_object(
           'prendas', coalesce((select jsonb_agg(case when (x ->> 'producto_id')::uuid = p_producto_id
                                                      then x || jsonb_build_object('cantidad', (x ->> 'cantidad')::integer - v_unidades, 'variantes', null)
                                                      else x end)
                                  from jsonb_array_elements(v_sep -> 'prendas') x
                                 where (x ->> 'producto_id')::uuid <> p_producto_id or (x ->> 'cantidad')::integer > v_unidades), '[]'::jsonb),
           'nuevas', v_sep -> 'nuevas'),
         costos_prendas = v_cp,
         version = k.version + 1
   where k.id = v_k.id;

  insert into retail.despacho_salidas (despacho_id, despacho_item_id, extra_posicion, producto_id, unidades, lineas, recibidos, token, huella, creado_por)
  values (p_despacho_id, v_k.despacho_item_id, v_k.extra_posicion, p_producto_id, v_unidades, v_lineas,
          array(select r.id from retail.despacho_recibidos r where r.despacho_id = p_despacho_id and r.id <> all (v_antes)),
          p_token, v_huella, v_actor)
  returning id into v_id;

  begin
    v_nombre := (select p.referencia from retail.productos p where p.id = p_producto_id);
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_salida_anticipada',
      'llevó al stock ' || v_unidades || ' de ' || v_nombre || ' sin cerrar ' || v_envio,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'salida_id', v_id, 'producto_id', p_producto_id, 'unidades', v_unidades),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la salida del envío % (%)', v_envio, sqlerrm;
  end;

  return retail.fn_salida_resultado(v_id);
end;
$$;
comment on function retail.llevar_al_stock_ahora(uuid, uuid, integer, integer, uuid, jsonb, numeric, boolean, uuid) is
  'ADR-0393 (act. 2026-11-03): mete al stock lo repartido de una prenda sin cerrar el envío. Lo contado no cambia; lo que falta o sobra se mide al cierre final.';
revoke all on function retail.llevar_al_stock_ahora(uuid, uuid, integer, integer, uuid, jsonb, numeric, boolean, uuid) from public, anon;
grant execute on function retail.llevar_al_stock_ahora(uuid, uuid, integer, integer, uuid, jsonb, numeric, boolean, uuid) to authenticated, service_role;

-- ---------- 5. Corregir una tanda ----------
create or replace function retail.corregir_salida(p_salida_id uuid, p_motivo text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_salida retail.despacho_salidas;
  v_despacho retail.despachos;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_sub uuid;
  v_ids uuid[];
  v_l jsonb;
  v_lote uuid;
  v_mov uuid;
  v_sep jsonb;
  v_nombre text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Corregir una tanda necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_token is null then
    raise exception 'Falta el código de esta acción: recarga la pantalla' using hint = 'salida_sin_token';
  end if;
  select d.* into v_despacho from retail.despachos d
   where d.id = (select s.despacho_id from retail.despacho_salidas s where s.id = p_salida_id)
     for update;
  if not found then
    raise exception 'Esa tanda no existe: recarga la pantalla' using hint = 'salida_no_existe';
  end if;
  select s.* into v_salida from retail.despacho_salidas s where s.id = p_salida_id for update;
  if v_salida.corregida_token = p_token then
    return jsonb_build_object('salida_id', v_salida.id, 'despacho_id', v_salida.despacho_id, 'unidades', v_salida.unidades, 'repetido', true);
  end if;
  if v_salida.corregida_en is not null then
    raise exception 'Esa tanda ya se corrigió: recarga la pantalla' using hint = 'salida_ya_corregida';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'El envío ya se cerró: si sobró o faltó algo, usa «Ajustar stock»' using hint = 'salida_envio_cerrado';
  end if;
  if length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Escribe por qué se corrige (hasta 300 letras)' using hint = 'corregir_motivo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  if exists (select 1 from retail.despacho_recibidos r where r.id = any (v_salida.recibidos) and (r.compra_item_id is not null or r.danadas > 0)) then
    raise exception 'Esta tanda está unida a una factura o trae dañadas: corrígela con «Ajustar stock»' using hint = 'salida_no_se_deshace';
  end if;

  v_ids := array(select (l ->> 'variante_id')::uuid from jsonb_array_elements(v_salida.lineas) l);
  perform retail.fn_bloquear_en_orden(v_despacho.ubicacion_destino_id, v_ids, true, '{}'::uuid[]);
  v_sub := retail.fn_sububicacion_por_defecto(v_despacho.ubicacion_destino_id, 'entrada');
  -- Solo mientras siga en el almacén: si ya bajó al piso, se vendió o está apartada, esto no la puede sacar.
  if exists (
    select 1
      from jsonb_array_elements(v_salida.lineas) l
      left join retail.stock s on s.variante_id = (l ->> 'variante_id')::uuid
                              and s.ubicacion_id = v_despacho.ubicacion_destino_id
                              and s.sububicacion_id is not distinct from v_sub
     where coalesce(s.cantidad, 0) - coalesce(s.cantidad_apartada, 0) < (l ->> 'cantidad')::integer
  ) then
    raise exception 'Parte de esta tanda ya no está en el almacén: corrígela con «Ajustar stock»' using hint = 'salida_ya_bajo';
  end if;

  for v_l in select l from jsonb_array_elements(v_salida.lineas) l loop
    v_lote := (select m.lote_id
                 from retail.despacho_recibidos r
                 join retail.movimientos m on m.id = r.movimiento_id
                where r.id = any (v_salida.recibidos) and r.variante_id = (v_l ->> 'variante_id')::uuid
                limit 1);
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id, nota)
    values ((v_l ->> 'variante_id')::uuid, v_despacho.ubicacion_destino_id, v_sub, 'salida', (v_l ->> 'cantidad')::integer, 'correccion_recepcion', v_lote,
            v_actor, 'Se corrigió lo que salió de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_motivo)
    returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
    -- El costo vuelve a lo que era, si nadie lo cambió después.
    update retail.variantes vr set costo = (v_l ->> 'costo_antes')::numeric
     where vr.id = (v_l ->> 'variante_id')::uuid
       and vr.costo is not distinct from (v_l ->> 'costo_despues')::numeric
       and vr.costo is distinct from (v_l ->> 'costo_antes')::numeric;
  end loop;

  update retail.despacho_salidas s
     set corregida_en = now(), corregida_por = v_actor, corregida_motivo = v_motivo, corregida_token = p_token,
         recibidos_archivados = (select jsonb_agg(to_jsonb(r)) from retail.despacho_recibidos r where r.id = any (v_salida.recibidos))
   where s.id = p_salida_id;
  perform set_config('retail.corrigiendo_salida', 'si', true);
  delete from retail.despacho_recibidos r where r.id = any (v_salida.recibidos);
  perform set_config('retail.corrigiendo_salida', '', true);

  -- Las unidades vuelven a lo separado, por repartir.
  v_sep := (select retail.fn_envio_leer_separado(k.separado, 'el envío') from retail.despacho_conteos k
             where k.despacho_id = v_salida.despacho_id
               and k.despacho_item_id is not distinct from v_salida.despacho_item_id
               and k.extra_posicion is not distinct from v_salida.extra_posicion);
  update retail.despacho_conteos k
     set separado = jsonb_build_object(
           'prendas', case when exists (select 1 from jsonb_array_elements(v_sep -> 'prendas') x where (x ->> 'producto_id')::uuid = v_salida.producto_id)
                           then (select jsonb_agg(case when (x ->> 'producto_id')::uuid = v_salida.producto_id
                                                       then x || jsonb_build_object('cantidad', (x ->> 'cantidad')::integer + v_salida.unidades, 'variantes', null)
                                                       else x end)
                                   from jsonb_array_elements(v_sep -> 'prendas') x)
                           else (v_sep -> 'prendas') || jsonb_build_array(jsonb_build_object('producto_id', v_salida.producto_id, 'cantidad', v_salida.unidades, 'variantes', null))
                      end,
           'nuevas', v_sep -> 'nuevas'),
         version = k.version + 1
   where k.despacho_id = v_salida.despacho_id
     and k.despacho_item_id is not distinct from v_salida.despacho_item_id
     and k.extra_posicion is not distinct from v_salida.extra_posicion;

  begin
    v_nombre := (select p.referencia from retail.productos p where p.id = v_salida.producto_id);
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_salida_corregida',
      'corrigió lo que salió de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_salida.unidades || ' de ' || v_nombre || '. ' || v_motivo,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', v_despacho.id::text, now(),
      jsonb_build_object('despacho_id', v_despacho.id, 'salida_id', v_salida.id, 'motivo', v_motivo),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección de la salida (%)', sqlerrm;
  end;

  return jsonb_build_object('salida_id', v_salida.id, 'despacho_id', v_salida.despacho_id, 'unidades', v_salida.unidades, 'repetido', false);
end;
$$;
comment on function retail.corregir_salida(uuid, text, uuid) is
  'ADR-0393 (act. 2026-11-03): deshace una tanda con un movimiento de salida, con quién y por qué, mientras siga en el almacén y el envío esté abierto.';
revoke all on function retail.corregir_salida(uuid, text, uuid) from public, anon;
grant execute on function retail.corregir_salida(uuid, text, uuid) to authenticated, service_role;

-- ---------- 6. Las tandas de un envío, para la pantalla ----------
create or replace function retail.fn_salidas_del_envio(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver lo que salió necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'producto_id', s.producto_id, 'prenda', p.referencia, 'unidades', s.unidades, 'creado_en', s.creado_en,
             'quien', retail.fn_envio_persona(s.creado_por) ->> 'nombre',
             'lineas', (select jsonb_agg(jsonb_build_object('variante_id', l ->> 'variante_id', 'cantidad', (l ->> 'cantidad')::integer)) from jsonb_array_elements(s.lineas) l))
             order by s.creado_en)
      from retail.despacho_salidas s
      join retail.productos p on p.id = s.producto_id
     where s.despacho_id = p_despacho_id and s.corregida_en is null), '[]'::jsonb);
end;
$$;
comment on function retail.fn_salidas_del_envio(uuid) is 'ADR-0393 (act. 2026-11-03): las tandas vigentes que salieron al stock antes de cerrar este envío.';
revoke all on function retail.fn_salidas_del_envio(uuid) from public, anon;
grant execute on function retail.fn_salidas_del_envio(uuid) to authenticated, service_role;

-- ---------- 7. Poner el proveedor cambia «Por confirmar» por el real ----------
select pg_temp.reemplazar('retail.poner_proveedor_envio(uuid,uuid)',
$v$   where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.proveedor_id is null;
$v$,
$n$   where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.proveedor_id is null;
  -- Lo que ya salió a nombre de «Por confirmar» pasa al real (20261104005000); `fn_actividad_anotar`, abajo, deja el rastro.
  perform set_config('retail.corrige_proveedor', 'si', true);
  update retail.despacho_recibidos r set proveedor_id = p_proveedor_id
   where r.despacho_id = p_despacho_id and r.proveedor_id = (select p.id from retail.proveedores p where p.por_confirmar);
  update retail.lotes l set proveedor_id = p_proveedor_id
   where l.despacho_id = p_despacho_id and l.proveedor_id = (select p.id from retail.proveedores p where p.por_confirmar);
  perform set_config('retail.corrige_proveedor', '', true);
$n$,
1);

-- ---------- 8. Compras ve cuánto ya salió, y lo que quedó a medias no se olvida ----------
select pg_temp.reemplazar('retail.fn_orden_compra_detalle(uuid)',
$v$                      'unidades', x.unidades,
                      'version', dd.version$v$,
$n$                      'unidades', x.unidades,
                      -- Lo de esta orden que ya está en el stock, para «12 de 70 ya en stock · se sigue contando» (20261104005000).
                      'en_stock', (select coalesce(sum(r.cantidad), 0)::integer
                                     from retail.despacho_recibidos r
                                     join retail.despacho_items ri on ri.id = r.despacho_item_id
                                     join retail.orden_compra_items roi on roi.id = ri.orden_compra_item_id
                                    where r.despacho_id = dd.id and roi.orden_compra_id = o.id),
                      'version', dd.version$n$,
1);

create or replace function retail.fn_envios_a_medias(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_es_lider() is not true then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'numero', retail.fn_envio_numero_texto(d.numero), 'sede', u.nombre, 'en_stock', c.en_stock, 'contadas', c.contadas, 'desde', s.desde)
             order by s.desde)
      from retail.despachos d
      join retail.ubicaciones u on u.id = d.ubicacion_destino_id
      join lateral (select min(x.creado_en) as desde from retail.despacho_salidas x where x.despacho_id = d.id and x.corregida_en is null) s on s.desde is not null
     cross join lateral (select sum(k.contadas)::integer as contadas, sum(k.en_stock)::integer as en_stock from retail.fn_envio_cuentas(array[d.id]) k) c
     where d.estado = 'abierto'
       -- Un líder también ve los de las otras sedes que llevan 3 días o más a medias; quien recibe, los de su sede.
       and (d.ubicacion_destino_id = p_ubicacion_id or (retail.fn_es_lider() is true and s.desde < now() - interval '3 days'))), '[]'::jsonb);
end;
$$;
comment on function retail.fn_envios_a_medias(uuid) is
  'ADR-0393 (act. 2026-11-03): los envíos abiertos con algo ya en el stock: que no se olvide cerrarlos. A los 3 días también le aparecen al líder.';
revoke all on function retail.fn_envios_a_medias(uuid) from public, anon;
grant execute on function retail.fn_envios_a_medias(uuid) to authenticated, service_role;

-- ---------- 9. Comprobación ----------
do $$
begin
  if (select count(*) from retail.proveedores p where p.por_confirmar) <> 1 then
    raise exception 'Tiene que haber un solo proveedor «Por confirmar»';
  end if;
  if position('(20261104005000)' in pg_get_functiondef('retail.fn_recepcion_despacho_fija()'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_despacho_fija no quedó dejando archivar lo recibido de una tanda';
  end if;
  if position('(20261104005000)' in pg_get_functiondef('retail.poner_proveedor_envio(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'poner_proveedor_envio no quedó cambiando «Por confirmar» por el real';
  end if;
end;
$$;

reset lock_timeout;
