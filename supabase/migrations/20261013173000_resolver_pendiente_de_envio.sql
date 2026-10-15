-- ADR-0393 · actividad 3, segundo paso: «Hacer ahora» con lo que quedó pendiente de un envío cerrado, y el número que lo recuerda.
--
-- EL PROBLEMA PRIMERO. Al cerrar el conteo (20261013172000) lo que no tenía tallas quedó pendiente y lo que nadie separó quedó «sin
-- separar». Esas prendas están en el almacén pero no en el stock: Vender no las ve y Colgar no las ofrece. Hace falta (1) una puerta
-- para terminarlas —poner tallas y colores, decir qué prendas eran, crear las nuevas— que las meta al stock EXACTAMENTE como el cierre,
-- con el costo que se fijó al cerrar y el papel de Compras hasta el cupo que quede, sin entrar dos veces con un doble clic; y (2) un
-- número que no deje olvidarlas (decisión 4: Inicio, la cabecera de Recibir y Catálogo ▸ Productos ▸ Por crear).
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despacho_separaciones`: cada «Hacer ahora» guardado (de qué línea, de qué pendiente o de lo sin separar, quién, cuándo) con su
--      token y su huella: el mismo envío dos veces no entra dos veces.
--   2. `resolver_pendiente_envio`: con el envío CERRADO, toma de un pendiente (solo tallas y colores) o de lo sin separar de una línea
--      (prendas con tallas, prendas sin tallas, nuevas). Lo que trae tallas entra por la puerta única (fn_recepcion_entrar) con el costo
--      del conteo; lo demás queda como pendiente nuevo. Pedir más de lo que queda se rechaza: el número de lo contado tiene una sola
--      puerta, reabrir (actividad 4).
--   3. `preparar_prenda_al_recibir` (REEMPLAZO ANCLADO): con el envío cerrado, crea o completa una prenda mientras al envío le quede
--      algo por detallar (antes: «Este envío ya se recibió»).
--   4. Lecturas: `fn_envio_conteo_json` suma por línea lo que está en el stock, lo sin separar y sus pendientes; `fn_recepcion_pendientes`
--      da por sede lo que queda por separar, detallar y crear, y desde cuándo (el número de la decisión 4).
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Entrar más de lo que quedaba (de un pendiente o de lo sin separar) → resolver_pendiente_envio, y si una función futura se
--     equivoca, el candado diferido `despacho_*_cuadra` de 20261013172000.
--   · La misma separación dos veces por un doble clic → `despacho_separaciones.token` único + la huella.
--   · Un pendiente resuelto sin que entrara todo → el mismo candado diferido.
--   · Una separación que cambia o se borra → disparador `despacho_separaciones_fija`.
--
-- CONTRATO de resolver_pendiente_envio
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (que no hizo ninguna de sus órdenes, decisión 17), deja entrar lo
--            separado con tallas como entra al cerrar (lote del envío y su proveedor, o uno nuevo; almacén y cuarentena; costo
--            promediado; papel hasta su cupo) y anota lo demás como pendiente; si el pendiente quedó vacío, queda resuelto. Todo o nada.
--            Mismo token y mismos datos: responde sin escribir de nuevo.
--   ASUME:   el envío está cerrado. La pantalla manda lo separado con la forma del conteo ({prendas, nuevas}).
--   NO HACE: no cambia lo contado ni lo que faltó o sobró (eso es reabrir), no crea la prenda nueva (preparar_prenda_al_recibir, antes).
--
-- DESCARTÉ:
--   · Que «Hacer ahora» sobre un pendiente acepte prendas sin tallas o nuevas (volver a separar un pendiente): un pendiente tendría hijos
--     y su «queda» dependería de un árbol. Un pendiente se termina con tallas; si lo separado estaba mal, se reabre.
--   · Pedir la versión de la línea en vez de un token: un doble clic devolvería «alguien cambió esto» a quien ya guardó bien.
--   · Atar el pendiente «detalle» a SU prenda al resolverlo: al poner las tallas se descubre a veces que 3 de las 18 «Aurora» eran
--     «Lina». Cualquier prenda de la categoría y marca de la línea vale; lo que no puede cambiar es cuántas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013172000. Una tabla NUEVA sin políticas (RLS encendido),
-- disparadores con `create or replace trigger`, sin `drop trigger` ni políticas (ADR-0195) y sin `select … into` dentro de textos entre
-- comillas (ADR-0288). El reemplazo de preparar_prenda_al_recibir aborta sin tocar nada si su definición viva cambió y no hace nada si
-- ya está. Se puede pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Cada «Hacer ahora» guardado ----------
create table if not exists retail.despacho_separaciones (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  despacho_item_id uuid references retail.despacho_items (id),
  extra_posicion integer check (extra_posicion is null or extra_posicion > 0),
  -- De qué pendiente se tomó; nulo si se tomó de lo sin separar de la línea.
  pendiente_id uuid references retail.despacho_pendientes (id),
  -- Doble clic o reintento sin red: el mismo token con la misma huella responde sin escribir; con otra, se rechaza.
  token uuid not null unique,
  huella text not null,
  entraron integer not null check (entraron >= 0),
  quedaron_pendientes integer not null check (quedaron_pendientes >= 0),
  hecho_por uuid not null references public.personas (id),
  hecho_en timestamptz not null default now(),
  constraint despacho_separaciones_linea_o_extra check ((despacho_item_id is null) <> (extra_posicion is null))
);
create index if not exists despacho_separaciones_despacho_idx on retail.despacho_separaciones (despacho_id);
comment on table retail.despacho_separaciones is
  'ADR-0393: cada «Hacer ahora» de un envío cerrado —de qué línea, de qué pendiente (o de lo sin separar), cuántas entraron al stock, '
  'cuántas quedaron pendientes, quién y cuándo— con su token y su huella (un doble clic no entra dos veces). No se cambia ni se borra. '
  'Solo se lee y escribe por funciones (RLS sin políticas).';

alter table retail.despacho_separaciones enable row level security;
revoke all on table retail.despacho_separaciones from anon, authenticated;

create or replace function retail.fn_despacho_separaciones_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Lo que se separó de un envío no se cambia ni se borra' using errcode = '42501', hint = 'separacion_inmutable';
end;
$$;
revoke all on function retail.fn_despacho_separaciones_fija() from public, anon, authenticated;
create or replace trigger despacho_separaciones_fija
  before update or delete on retail.despacho_separaciones
  for each row execute function retail.fn_despacho_separaciones_fija();

-- ---------- 2. Una línea como la lee la pantalla: también lo que está en el stock, lo sin separar y sus pendientes ----------
create or replace function retail.fn_envio_conteo_json(p_fila retail.despacho_conteos)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'despacho_id', p_fila.despacho_id,
    'despacho_item_id', p_fila.despacho_item_id,
    'extra_posicion', p_fila.extra_posicion,
    'proveedor', (select jsonb_build_object('id', pr.id, 'nombre', pr.nombre) from retail.proveedores pr where pr.id = p_fila.proveedor_id),
    'categoria', (select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia)
                    from retail.categorias c where c.id = p_fila.categoria_id),
    'marca', (select jsonb_build_object('id', m.id, 'nombre', m.nombre) from retail.marcas m where m.id = p_fila.marca_id),
    'contadas', p_fila.contadas,
    'separadas', retail.fn_envio_total_separado(p_fila.separado),
    'separado', retail.fn_envio_separado_con_nombres(p_fila.separado),
    'costo_unitario', p_fila.costo_unitario,
    'version', p_fila.version,
    'contado_por', retail.fn_envio_persona(p_fila.contado_por),
    'contado_en', p_fila.contado_en,
    -- ADR-0393 (actividad 3): lo que de esta línea ya está en el stock y, con el envío cerrado, lo que nadie dijo qué es (sin
    -- separar) y lo pendiente, con lo que queda de cada uno. Con el envío abierto, «sin separar» es lo contado que el borrador no separó.
    'en_stock', coalesce(c.en_stock, 0),
    'sin_separar', case when d.estado = 'cerrado' then coalesce(c.sin_separar, 0)
                        else p_fila.contadas - coalesce(c.en_stock, 0) - retail.fn_envio_total_separado(p_fila.separado) end,
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'tipo', x.tipo, 'cantidad', x.cantidad, 'quedan', x.cantidad - e.entro,
               'producto', (select jsonb_build_object('id', pr.id, 'nombre', pr.referencia, 'codigo', pr.codigo)
                              from retail.productos pr where pr.id = x.producto_id),
               'descripcion', x.descripcion, 'estado', x.estado,
               'anotado_por', retail.fn_envio_persona(x.anotado_por), 'anotado_en', x.anotado_en,
               'resuelto_por', retail.fn_envio_persona(x.resuelto_por), 'resuelto_en', x.resuelto_en)
             order by x.anotado_en, x.id)
        from retail.despacho_pendientes x
       cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as entro
                             from retail.despacho_recibidos r where r.pendiente_id = x.id) e
       where x.despacho_id = p_fila.despacho_id
         and x.despacho_item_id is not distinct from p_fila.despacho_item_id
         and x.extra_posicion is not distinct from p_fila.extra_posicion), '[]'::jsonb))
    from retail.despachos d
    left join retail.fn_envio_cuentas(array[p_fila.despacho_id]) c
      on c.despacho_item_id is not distinct from p_fila.despacho_item_id and c.extra_posicion is not distinct from p_fila.extra_posicion
   where d.id = p_fila.despacho_id;
$$;
comment on function retail.fn_envio_conteo_json(retail.despacho_conteos) is
  'ADR-0393: un conteo con sus nombres, como lo lee la pantalla: lo contado, lo separado, quién y cuándo, y (actividad 3) en_stock, '
  'sin_separar y sus pendientes [{id, tipo, cantidad, quedan, producto, descripcion, estado, anotado_por, anotado_en, resuelto_por, '
  'resuelto_en}]. Interna.';
revoke all on function retail.fn_envio_conteo_json(retail.despacho_conteos) from public, anon, authenticated;

-- ---------- 3. Lo que queda por terminar en una sede: el número de la decisión 4 ----------
create or replace function retail.fn_recepcion_pendientes(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_ve_modulo('ordenes_compra') is not true
     and retail.fn_ve_modulo('productos') is not true then
    raise exception 'Ver lo pendiente de lo recibido necesita el módulo «Recibir mercadería», «Órdenes de compra» o «Productos» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  return (
    with envios as (
      select d.id, d.numero, d.cerrado_en
        from retail.despachos d
       where d.ubicacion_destino_id = p_ubicacion_id and d.estado = 'cerrado'
    ), cuentas as (
      select c.despacho_id, sum(greatest(c.sin_separar, 0))::integer as por_separar
        from retail.fn_envio_cuentas(array(select e.id from envios e)) c
       group by 1
    ), pend as (
      select x.despacho_id,
             sum(case when x.tipo = 'detalle' then x.cantidad - coalesce(r.entro, 0) else 0 end)::integer as por_detallar,
             sum(case when x.tipo = 'crear' then x.cantidad - coalesce(r.entro, 0) else 0 end)::integer as por_crear
        from retail.despacho_pendientes x
        left join lateral (select sum(rr.cantidad)::integer as entro from retail.despacho_recibidos rr where rr.pendiente_id = x.id) r on true
       where x.estado = 'pendiente' and x.despacho_id in (select e.id from envios e)
       group by 1
    ), por_envio as (
      select e.id, e.numero, e.cerrado_en, coalesce(c.por_separar, 0) as por_separar, coalesce(p.por_detallar, 0) as por_detallar,
             coalesce(p.por_crear, 0) as por_crear
        from envios e
        left join cuentas c on c.despacho_id = e.id
        left join pend p on p.despacho_id = e.id
       where coalesce(c.por_separar, 0) + coalesce(p.por_detallar, 0) + coalesce(p.por_crear, 0) > 0
    )
    select jsonb_build_object(
             'ubicacion_id', p_ubicacion_id,
             'por_separar', coalesce(sum(x.por_separar), 0)::integer,
             'por_detallar', coalesce(sum(x.por_detallar), 0)::integer,
             'por_crear', coalesce(sum(x.por_crear), 0)::integer,
             'total', coalesce(sum(x.por_separar + x.por_detallar + x.por_crear), 0)::integer,
             'desde', min(x.cerrado_en),
             'envios', coalesce(jsonb_agg(jsonb_build_object(
                         'despacho_id', x.id, 'numero', retail.fn_envio_numero_texto(x.numero), 'cerrado_en', x.cerrado_en,
                         'por_separar', x.por_separar, 'por_detallar', x.por_detallar, 'por_crear', x.por_crear)
                       order by x.cerrado_en, x.numero), '[]'::jsonb))
      from por_envio x);
end;
$$;
comment on function retail.fn_recepcion_pendientes(uuid) is
  'ADR-0393 (decisión 4): lo recibido en una sede que todavía no está en el stock: {ubicacion_id, por_separar, por_detallar, por_crear, '
  'total, desde (el cierre más antiguo con algo pendiente), envios: [{despacho_id, numero, cerrado_en, por_separar, por_detallar, '
  'por_crear}]}, del más antiguo al más nuevo. Siempre calculado. Módulo Recibir, Órdenes de compra o Productos.';
revoke all on function retail.fn_recepcion_pendientes(uuid) from public, anon;
grant execute on function retail.fn_recepcion_pendientes(uuid) to authenticated, service_role;

-- ---------- 4. «Hacer ahora»: terminar lo pendiente de una línea de un envío cerrado ----------
create or replace function retail.resolver_pendiente_envio(
  p_despacho_id uuid,
  p_despacho_item_id uuid,
  p_extra_posicion integer,
  p_pendiente_id uuid,
  p_separado jsonb,
  p_confirma_costo boolean default false,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_huella text;
  v_token uuid := coalesce(p_token, gen_random_uuid());
  v_previa retail.despacho_separaciones;
  v_k record;
  v_pend retail.despacho_pendientes;
  v_quedan integer;
  v_sep jsonb;
  v_total integer;
  v_vars jsonb;
  v_variantes uuid[];
  v_p jsonb;
  v_prenda record;
  v_nuevos jsonb := '[]'::jsonb;
  v_entran integer;
  v_quedaron integer;
  v_fila retail.despacho_conteos;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Terminar lo pendiente de un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados en el orden de siempre (ADR-0190): el envío (dos personas terminando el mismo envío se ponen en fila; reabrir también
  -- espera) → su orden y su línea pedida → (en la puerta única) el papel, las variantes y el stock.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: la misma separación (mismo token, misma huella) responde sin escribir.
  v_huella := md5(jsonb_build_object('despacho', p_despacho_id, 'item', p_despacho_item_id, 'extra', p_extra_posicion,
                                     'pendiente', p_pendiente_id, 'separado', p_separado,
                                     'confirma', coalesce(p_confirma_costo, false))::text);
  if p_token is not null then
    select s.* into v_previa from retail.despacho_separaciones s where s.token = p_token;
    if found then
      if v_previa.despacho_id = p_despacho_id and v_previa.huella = v_huella then
        select k.* into v_fila from retail.despacho_conteos k
         where k.despacho_id = p_despacho_id
           and k.despacho_item_id is not distinct from v_previa.despacho_item_id
           and k.extra_posicion is not distinct from v_previa.extra_posicion;
        return jsonb_build_object('despacho_id', p_despacho_id, 'entraron', v_previa.entraron,
                                  'quedaron_pendientes', v_previa.quedaron_pendientes, 'repetido', true,
                                  'linea', retail.fn_envio_conteo_json(v_fila));
      end if;
      raise exception 'Eso ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
  end if;

  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  if v_despacho.estado = 'abierto' then
    raise exception 'Este envío todavía se está contando: sepáralo en el conteo' using hint = 'pendiente_envio_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  -- La línea (de la guía o de fuera de ella) y su conteo.
  if (p_despacho_item_id is null) = (p_extra_posicion is null) then
    raise exception 'No se entiende de qué línea es: recarga la pantalla' using hint = 'recepcion_lineas';
  end if;
  select k.id, k.despacho_item_id, k.extra_posicion, k.costo_unitario,
         di.precio_unitario, di.compra_item_id, di.orden_compra_item_id, i.posicion, o.numero as orden_numero, i.orden_compra_id,
         coalesce(o.proveedor_id, k.proveedor_id) as proveedor_id, coalesce(di.categoria_id, k.categoria_id) as categoria_id,
         coalesce(di.marca_id, k.marca_id) as marca_id,
         case when k.despacho_item_id is not null then concat_ws(' · ', c.nombre, m.nombre, di.descripcion)
              else concat_ws(' · ', c.nombre, m.nombre) || ' (fuera de la guía)' end as donde
    into v_k
    from retail.despacho_conteos k
    left join retail.despacho_items di on di.id = k.despacho_item_id
    left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    left join retail.ordenes_compra o on o.id = i.orden_compra_id
    join retail.categorias c on c.id = coalesce(di.categoria_id, k.categoria_id)
    join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)
   where k.despacho_id = p_despacho_id
     and (k.despacho_item_id = p_despacho_item_id or k.extra_posicion = p_extra_posicion);
  if not found then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;
  -- Su orden (nadie la anula ni le registra papel mientras entra) y su línea pedida.
  if v_k.orden_compra_id is not null then
    perform 1 from retail.ordenes_compra o where o.id = v_k.orden_compra_id for share;
    perform 1 from retail.orden_compra_items i where i.id = v_k.orden_compra_item_id for update;
  end if;

  -- De dónde se toma: un pendiente (lo que todavía no entró de él) o lo sin separar de la línea.
  if p_pendiente_id is not null then
    select x.* into v_pend from retail.despacho_pendientes x where x.id = p_pendiente_id for update;
    if not found or v_pend.despacho_id <> p_despacho_id
       or v_pend.despacho_item_id is distinct from v_k.despacho_item_id or v_pend.extra_posicion is distinct from v_k.extra_posicion then
      raise exception 'Ese pendiente no es de esta línea: recarga la pantalla' using hint = 'pendiente_ajeno';
    end if;
    if v_pend.estado <> 'pendiente' then
      raise exception 'Ese pendiente ya salió de la lista: recarga la pantalla' using hint = 'pendiente_ya_resuelto';
    end if;
    v_quedan := v_pend.cantidad
      - coalesce((select sum(r.cantidad) from retail.despacho_recibidos r where r.pendiente_id = p_pendiente_id), 0)::integer;
  else
    v_quedan := coalesce((select c.sin_separar from retail.fn_envio_cuentas(array[p_despacho_id]) c
                           where c.despacho_item_id is not distinct from v_k.despacho_item_id
                             and c.extra_posicion is not distinct from v_k.extra_posicion), 0);
  end if;

  -- Lo separado, con la forma del conteo; nunca más de lo que queda.
  v_sep := retail.fn_envio_leer_separado(p_separado, v_k.donde);
  v_total := retail.fn_envio_total_separado(v_sep);
  if v_total = 0 then
    raise exception 'Di qué prendas son: al menos una' using hint = 'pendiente_vacio';
  end if;
  if p_pendiente_id is not null and (
       jsonb_array_length(v_sep -> 'nuevas') > 0
       or exists (select 1 from jsonb_array_elements(v_sep -> 'prendas') x where jsonb_typeof(x -> 'variantes') is distinct from 'array')) then
    raise exception 'Aquí van las tallas y colores de lo pendiente: si eran otras prendas, reabre el conteo'
      using hint = 'pendiente_solo_tallas';
  end if;
  if v_total > v_quedan then
    if p_pendiente_id is not null then
      raise exception 'De este pendiente quedan % y pusiste %: si llegaron más, reabre el conteo', v_quedan, v_total
        using hint = 'pendiente_de_mas';
    end if;
    raise exception 'De % quedan % sin separar y pusiste %: si llegaron más, reabre el conteo', v_k.donde, v_quedan, v_total
      using hint = 'separado_de_mas';
  end if;

  -- Lo que trae tallas y colores entra; lo demás (solo desde lo sin separar) queda pendiente.
  v_vars := retail.fn_recepcion_leer_variantes(
    coalesce((select jsonb_agg(w.v order by p.po, w.vo)
                from jsonb_array_elements(v_sep -> 'prendas') with ordinality p(x, po)
               cross join lateral jsonb_array_elements(case when jsonb_typeof(p.x -> 'variantes') = 'array' then p.x -> 'variantes'
                                                            else '[]'::jsonb end) with ordinality w(v, vo)), '[]'::jsonb),
    v_k.donde);
  for v_p in
    select p.x from jsonb_array_elements(v_sep -> 'prendas') with ordinality p(x, po)
     where jsonb_typeof(p.x -> 'variantes') is distinct from 'array'
     order by p.po
  loop
    select pr.estado, pr.estado_alta,
           (pr.categoria_id is not distinct from v_k.categoria_id and pr.marca_id is not distinct from v_k.marca_id) as de_la_linea
      into v_prenda
      from retail.productos pr
     where pr.id = (v_p ->> 'producto_id')::uuid;
    if not found then
      raise exception 'Una de las prendas de % ya no existe: recarga la pantalla', v_k.donde using hint = 'recepcion_prenda_no_existe';
    end if;
    if not v_prenda.de_la_linea then
      raise exception 'Una de las prendas de % es de otra categoría o marca: elígela de nuevo', v_k.donde
        using hint = 'recepcion_prenda_ajena';
    end if;
    if v_prenda.estado <> 'activo' or v_prenda.estado_alta = 'rechazado' then
      raise exception 'Una de las prendas de % no está activa: elígela de nuevo', v_k.donde using hint = 'recepcion_prenda_inactiva';
    end if;
    v_nuevos := v_nuevos || jsonb_build_object('tipo', 'detalle', 'cantidad', (v_p ->> 'cantidad')::integer,
                                               'producto_id', (v_p ->> 'producto_id')::uuid, 'descripcion', null);
  end loop;
  v_nuevos := v_nuevos || coalesce((
    select jsonb_agg(jsonb_build_object('tipo', 'crear', 'cantidad', (n.x ->> 'cantidad')::integer, 'producto_id', null,
                                        'descripcion', n.x ->> 'descripcion') order by n.no)
      from jsonb_array_elements(v_sep -> 'nuevas') with ordinality n(x, no)), '[]'::jsonb);

  v_entran := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
  if v_entran > 0 then
    -- La puerta única al stock, con el costo que fijó el cierre (decisión 6) y sin «enviado» ni «contado»: lo que faltó o sobró ya
    -- se anotó al cerrar. Avisa al candado de lo recibido que esta entrada llega con el envío cerrado.
    v_variantes := array(select distinct (x ->> 'variante_id')::uuid from jsonb_array_elements(v_vars) x);
    perform set_config('retail.resolviendo_pendiente', 'si', true);
    begin
      perform retail.fn_recepcion_entrar(
        p_despacho_id, v_despacho.ubicacion_destino_id, v_despacho.numero_guia, v_envio, v_actor,
        jsonb_build_array(jsonb_build_object(
          'tipo', case when v_k.despacho_item_id is null then 'extra' else 'linea' end,
          'despacho_item_id', v_k.despacho_item_id, 'extra', v_k.extra_posicion, 'orden_numero', v_k.orden_numero,
          'posicion', v_k.posicion, 'orden_compra_item_id', v_k.orden_compra_item_id, 'compra_item_id', v_k.compra_item_id,
          'proveedor_id', v_k.proveedor_id, 'categoria_id', v_k.categoria_id, 'marca_id', v_k.marca_id,
          'enviado', 0, 'costo', coalesce(v_k.costo_unitario, v_k.precio_unitario),
          'confirma', coalesce(p_confirma_costo, false), 'variantes', v_vars, 'contado', 0,
          'faltante_causa', null, 'sobrante_causa', null, 'nota', null, 'donde', v_k.donde,
          'pendiente_id', p_pendiente_id)),
        v_variantes, null);
    exception when others then
      perform set_config('retail.resolviendo_pendiente', '', true);
      raise;
    end;
    perform set_config('retail.resolviendo_pendiente', '', true);
  end if;

  insert into retail.despacho_pendientes (despacho_id, despacho_item_id, extra_posicion, tipo, cantidad, producto_id, descripcion,
                                          anotado_por)
  select p_despacho_id, v_k.despacho_item_id, v_k.extra_posicion, x ->> 'tipo', (x ->> 'cantidad')::integer,
         (x ->> 'producto_id')::uuid, nullif(btrim(coalesce(x ->> 'descripcion', '')), ''), v_actor
    from jsonb_array_elements(v_nuevos) with ordinality t(x, ord)
   order by ord;
  v_quedaron := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_nuevos) x), 0);

  -- Un pendiente que ya entró entero sale de la lista.
  if p_pendiente_id is not null and v_entran = v_quedan then
    update retail.despacho_pendientes x
       set estado = 'resuelto', resuelto_por = v_actor, resuelto_en = now()
     where x.id = p_pendiente_id;
  end if;

  insert into retail.despacho_separaciones (despacho_id, despacho_item_id, extra_posicion, pendiente_id, token, huella, entraron,
                                            quedaron_pendientes, hecho_por)
  values (p_despacho_id, v_k.despacho_item_id, v_k.extra_posicion, p_pendiente_id, v_token, v_huella, v_entran, v_quedaron, v_actor);

  -- Actividad (ADR-0207), sin montos: «detalló 12 prendas de ENV-000061». Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_pendiente_resuelto',
      case when v_entran > 0 then 'detalló ' || v_entran || case when v_entran = 1 then ' prenda' else ' prendas' end || ' de ' || v_envio
           else 'separó ' || v_quedaron || case when v_quedaron = 1 then ' prenda' else ' prendas' end || ' de ' || v_envio end
        || case when v_entran > 0 and v_quedaron > 0 then ' (' || v_quedaron || ' siguen pendientes)' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'entraron', v_entran, 'quedaron_pendientes', v_quedaron,
                         'pendiente_id', p_pendiente_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó lo separado del envío % (%)', v_envio, sqlerrm;
  end;

  select k.* into v_fila from retail.despacho_conteos k where k.id = v_k.id;
  return jsonb_build_object('despacho_id', p_despacho_id, 'entraron', v_entran, 'quedaron_pendientes', v_quedaron, 'repetido', false,
                            'linea', retail.fn_envio_conteo_json(v_fila));
end;
$$;
comment on function retail.resolver_pendiente_envio(uuid, uuid, integer, uuid, jsonb, boolean, uuid) is
  'ADR-0393: «Hacer ahora» en un envío CERRADO. De un pendiente (p_pendiente_id) solo tallas y colores; de lo sin separar de la línea '
  '(p_pendiente_id null) prendas con o sin tallas y nuevas. p_separado con la forma del conteo {prendas, nuevas}. Lo que trae tallas '
  'entra por fn_recepcion_entrar con el costo del conteo (costo atípico: p_confirma_costo); lo demás queda pendiente. Más de lo que '
  'queda: hint pendiente_de_mas o separado_de_mas. Módulo Recibir, su sede y la decisión 17; firma el responsable. Token + huella. '
  'Devuelve {despacho_id, entraron, quedaron_pendientes, repetido, linea (como fn_envio_conteos)}.';
revoke all on function retail.resolver_pendiente_envio(uuid, uuid, integer, uuid, jsonb, boolean, uuid) from public, anon;
grant execute on function retail.resolver_pendiente_envio(uuid, uuid, integer, uuid, jsonb, boolean, uuid) to authenticated, service_role;

-- ---------- 5. Crear o completar una prenda con el envío cerrado, mientras le quede algo por detallar (reemplazo anclado) ----------
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;$v$,
  $v$  -- ADR-0393: con el envío cerrado, solo mientras le quede algo por detallar (crear o completar la prenda de un pendiente).
  if v_despacho.estado = 'cerrado' and not exists (
    select 1 from retail.fn_envio_cuentas(array[v_despacho.id]) c where c.contadas > c.en_stock
  ) then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;$v$,
  1);

-- ---------- 6. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
begin
  if to_regclass('retail.despacho_separaciones') is null then
    raise exception 'falta retail.despacho_separaciones';
  end if;
  if not coalesce((select c.relrowsecurity from pg_class c where c.oid = 'retail.despacho_separaciones'::regclass), false) then
    raise exception 'retail.despacho_separaciones tiene que tener RLS encendido';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despacho_separaciones') then
    raise exception 'retail.despacho_separaciones no lleva políticas: solo se lee y escribe por funciones';
  end if;
  if has_table_privilege('authenticated', 'retail.despacho_separaciones', 'select')
     or has_table_privilege('anon', 'retail.despacho_separaciones', 'select') then
    raise exception 'retail.despacho_separaciones: ni anon ni authenticated la leen directo';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_separaciones'::regclass and t.tgname = 'despacho_separaciones_fija') then
    raise exception 'falta el disparador despacho_separaciones_fija';
  end if;
  foreach v_funcion in array array[
    'retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)', 'retail.fn_recepcion_pendientes(uuid)'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
      raise exception '% tiene que ser security definer', v_funcion;
    end if;
    if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
      raise exception '%: la ejecuta authenticated y no anon', v_funcion;
    end if;
  end loop;
  foreach v_funcion in array array['retail.fn_envio_conteo_json(retail.despacho_conteos)', 'retail.fn_despacho_separaciones_fija()'] loop
    if has_function_privilege('authenticated', v_funcion, 'execute') or has_function_privilege('anon', v_funcion, 'execute') then
      raise exception '% es interna: ni authenticated ni anon la ejecutan', v_funcion;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.proname in ('resolver_pendiente_envio', 'fn_recepcion_pendientes')
              group by p.proname having count(*) > 1) then
    raise exception 'resolver_pendiente_envio o fn_recepcion_pendientes quedó con dos versiones';
  end if;
  if position('retail.fn_envio_cuentas(array[v_despacho.id])' in pg_get_functiondef(
       'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'preparar_prenda_al_recibir no deja crear con el envío cerrado y algo por detallar';
  end if;
end;
$$;

reset lock_timeout;
