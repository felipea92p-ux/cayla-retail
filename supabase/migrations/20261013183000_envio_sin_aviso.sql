-- ADR-0393 · actividad 4, segundo paso: lo que llega sin aviso se recibe con el mismo conteo y los mismos pendientes.
--
-- EL PROBLEMA PRIMERO. Hoy lo que llega sin orden de compra entra por «Llegó mercadería» (`recibir_lote`, ADR-0330): una prenda a la vez,
-- con su talla, al momento. La cara A reemplaza esa puerta (decisión 10 de Felipe) y la decisión 2 del ADR dice cómo: un envío sin orden
-- que la sede abre al llegar, contado por categoría, con lo nuevo y lo sin tallas como pendientes, igual que un envío de Compras. Y el
-- costo sigue la regla de ADR-0330: lo escribe solo quien ve el dinero de Compras; los demás reciben sin costo y el costo llega con la
-- factura.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despachos_sin_aviso`: qué envíos abrió una sede sin aviso y de qué proveedor («¿de quién?», la primera pregunta de la puerta
--      de hoy). Tabla propia de Recibir: las de Compras no cambian.
--   2. `abrir_envio_sin_aviso`: abre un envío SIN GUÍA en la sede, ya abierto. Todo lo que se cuente en él es «lo que no estaba en la
--      guía», y como no hubo guía nada sobra: no deja diferencias ni deudas («Nos debe» no cambia).
--   3. El costo (REEMPLAZOS ANCLADOS): en un envío sin aviso, cerrar_conteo_envio no lo pide y solo lo acepta de quien ve el dinero de
--      Compras; `fn_recepcion_entrar` deja entrar sin costo sin tocar el de la prenda (`despacho_recibidos.costo_unitario` puede quedar
--      vacío).
--   4. El proveedor del envío vale en `guardar_conteo_envio` y en `preparar_prenda_al_recibir` (REEMPLAZOS ANCLADOS), que lo buscaban
--      solo en las órdenes; `recibir_despacho` (el formulario de la fase 4) no cierra un envío sin aviso; `fn_envio_conteos` dice de
--      dónde vino el envío (`origen`) y sus proveedores.
--   5. (Felipe, 2026-10-14) SIN PROVEEDOR: a veces Compras manda sin decir de quién es. El envío sin aviso se abre y se cuenta sin
--      proveedor («por confirmar»); `poner_proveedor_envio` lo pone cuando alguien lo sabe, y `cerrar_conteo_envio` no cierra sin él
--      (`envio_sin_proveedor`): nada entra al stock sin dueño, porque el lote, el costo y la factura se unen por proveedor.
--   6. (Felipe, 2026-10-14) SIN MARCA: hay prendas que no tienen marca. Lo que no estaba en la guía se cuenta sin marca si hace falta,
--      la prenda se crea sin marca (el catálogo ya lo acepta y se completa en Editar producto) y entra al stock así:
--      `despacho_recibidos.marca_id` y `despacho_diferencias.marca_id` dejan de ser obligatorios, y las lecturas que unían la marca
--      (el detalle del envío, el cierre y «Hacer ahora») la unen con LEFT JOIN para no perder esas filas.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Un envío sin aviso con líneas de Compras → nace abierto en la misma transacción, y una línea solo se agrega a un envío en camino
--     (disparador de Compras `despacho_items_al_entrar`).
--   · Una diferencia (o una deuda) en un envío sin aviso → cerrar_conteo_envio mide lo que llegó contra sí mismo.
--   · Un costo escrito por quien no ve el dinero de Compras → cerrar_conteo_envio (`recepcion_costo_sin_permiso`).
--   · El costo de una prenda pisado por una entrada sin costo → fn_recepcion_entrar no promedia lo que entra sin costo.
--   · El mismo envío sin aviso dos veces por un doble clic → `despachos.token_cliente` único.
--   · Una prenda que entra al stock sin proveedor → cerrar_conteo_envio (`envio_sin_proveedor`) y, debajo, `lotes.proveedor_id` y
--     `despacho_recibidos.proveedor_id` obligatorios.
--   · Un proveedor cambiado después de puesto → el disparador `despachos_sin_aviso_fija` solo deja pasar de vacío a uno, una vez.
--
-- CONTRATO de abrir_envio_sin_aviso
--   PROMETE: con el módulo Recibir, la sede (la de la cabecera, que la cuenta puede operar) y quien firma, abre un envío sin guía de
--            ese proveedor, listo para contar. Mismo token: el mismo envío.
--   ASUME:   la mercadería está en la tienda (se abre al llegar).
--   NO HACE: no une la factura (ADR-0330, fase 2), no cuenta ni cierra.
--
-- DESCARTÉ:
--   · Líneas de envío sin orden (`despacho_items.orden_compra_item_id` opcional y su proveedor por línea, lo que decía el ADR): son tablas
--     de Compras, y una docena de lecturas suyas (el detalle, «por recibir», «Nos debe», preparar_prenda_al_recibir) unen la línea con su
--     orden; cada una habría que tocarla para que no la pierda. «Lo que no estaba en la guía» ya es exactamente esto: categoría, marca y
--     proveedor, contado y separado igual.
--   · Que entre al stock sin proveedor (con el lote «por confirmar»): se vendería el mismo día, pero el lote, el costo, la factura y
--     «Nos debe» quedarían sin dueño y unirlos después reescribe historia del núcleo. Felipe eligió (2026-10-14) contar sin proveedor y
--     ponerlo antes de cerrar. Lo que sí queda libre es la PRENDA: sin marca y, si se crea sin saber de quién es, sin proveedor.
--   · «Lo que dijeron» por categoría (cuántas prometió el proveedor por WhatsApp): sin orden no hay deuda que anotar; cabe en la nota.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013180000: una tabla NUEVA sin políticas (RLS encendido),
-- `despacho_recibidos.costo_unitario` y `marca_id`, y `despacho_diferencias.marca_id`, dejan de ser obligatorios (0 filas en producción;
-- solo las escriben estas funciones), el CHECK de lo contado fuera de la guía se afloja (tabla nueva de 171000), disparadores
-- con `create or replace trigger`; sin `drop trigger` ni políticas (ADR-0195) y sin `select … into` dentro de textos entre comillas
-- (ADR-0288). Los reemplazos anclados abortan sin tocar nada si una definición viva cambió y no hacen nada si ya están. Se puede pegar
-- dos veces. El bloque final comprueba todo.

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

-- ---------- 1. Los envíos que llegaron sin aviso ----------
create table if not exists retail.despachos_sin_aviso (
  despacho_id uuid primary key references retail.despachos (id),
  -- «¿De quién?»: el proveedor de todo lo que llegue en este envío. Vacío = por confirmar (Felipe 2026-10-14): se pone una sola vez,
  -- con poner_proveedor_envio, y el envío no se cierra sin él.
  proveedor_id uuid references retail.proveedores (id),
  creado_por uuid not null references public.personas (id),
  creado_en timestamptz not null default now()
);
comment on table retail.despachos_sin_aviso is
  'ADR-0393 (decisión 2): los envíos que una sede abrió al llegar mercadería sin orden de compra, y de qué proveedor. Un envío así no '
  'tiene líneas: todo lo contado es «lo que no estaba en la guía» y nada sobra. No se cambia ni se borra. Solo funciones (RLS sin políticas).';
alter table retail.despachos_sin_aviso alter column proveedor_id drop not null;
alter table retail.despachos_sin_aviso enable row level security;
revoke all on table retail.despachos_sin_aviso from anon, authenticated;

create or replace function retail.fn_despachos_sin_aviso_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- La única escritura: poner el proveedor que faltaba (por confirmar → uno), sin tocar nada más.
  if tg_op = 'UPDATE' and old.proveedor_id is null and new.proveedor_id is not null
     and new.despacho_id = old.despacho_id and new.creado_por = old.creado_por and new.creado_en = old.creado_en then
    return new;
  end if;
  raise exception 'De quién llegó un envío sin aviso no se cambia ni se borra' using errcode = '42501', hint = 'sin_aviso_inmutable';
end;
$$;
revoke all on function retail.fn_despachos_sin_aviso_fija() from public, anon, authenticated;
create or replace trigger despachos_sin_aviso_fija
  before update or delete on retail.despachos_sin_aviso
  for each row execute function retail.fn_despachos_sin_aviso_fija();

-- ---------- 2. Lo que entra sin costo no toca el costo de la prenda ----------
alter table retail.despacho_recibidos alter column costo_unitario drop not null;
comment on column retail.despacho_recibidos.costo_unitario is
  'El costo con el que entró. ADR-0393 (sin aviso) y ADR-0330: vacío si quien recibió no ve el dinero de Compras; el costo llega con la factura.';
select pg_temp.reemplazar(
  'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
  $v$      perform retail.fn_recalcular_costo_variante(v_var, v_buenas + v_danadas, v_costo, 'compra', v_movs[1]);$v$,
  $v$      -- ADR-0393 (sin aviso) y ADR-0330: lo que entra sin costo no toca el costo de la prenda (llega con la factura).
      if v_costo is not null then
        perform retail.fn_recalcular_costo_variante(v_var, v_buenas + v_danadas, v_costo, 'compra', v_movs[1]);
      end if;$v$,
  1);

-- ---------- 2b. Sin marca (Felipe 2026-10-14): lo que no estaba en la guía puede no tener marca ----------
-- Lo de la guía trae la suya (la de la orden); lo agregado al contar puede no tenerla, y entra al stock así.
alter table retail.despacho_recibidos alter column marca_id drop not null;
alter table retail.despacho_diferencias alter column marca_id drop not null;
alter table retail.despacho_conteos drop constraint if exists despacho_conteos_extra_con_que;
-- El proveedor también puede faltar en lo contado de un envío sin aviso por confirmar: el cierre lo exige (sección 3) y
-- poner_proveedor_envio lo completa.
alter table retail.despacho_conteos add constraint despacho_conteos_extra_con_que
  check (extra_posicion is null or categoria_id is not null);
comment on column retail.despacho_recibidos.marca_id is
  'La marca de lo que entró: la de la línea de la guía o, en lo que no estaba en ella, la elegida al contar. Vacía = sin marca (ADR-0393, 2026-10-14).';

-- Las lecturas que unían la marca la unen con LEFT JOIN: con JOIN, una fila sin marca desaparecía sin aviso (el cierre no la habría
-- metido al stock y «Hacer ahora» no habría encontrado su pendiente).
select pg_temp.reemplazar(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)$v$,
  $v$left join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)$v$,
  3);
select pg_temp.reemplazar(
  'retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
  $v$join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)$v$,
  $v$left join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_envio_detalle(uuid)',
  $v$join retail.marcas m on m.id = r.marca_id$v$,
  $v$left join retail.marcas m on m.id = r.marca_id$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_envio_detalle(uuid)',
  $v$join retail.marcas m on m.id = x.marca_id$v$,
  $v$left join retail.marcas m on m.id = x.marca_id$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_envio_detalle(uuid)',
  $v$'marca', jsonb_build_object('id', m.id, 'nombre', m.nombre)$v$,
  $v$'marca', case when m.id is not null then jsonb_build_object('id', m.id, 'nombre', m.nombre) end$v$,
  3);

-- «Ya la tengo» y el buscador de «¿Qué … son?»: sin marca busca las prendas sin marca de esa categoría.
select pg_temp.reemplazar(
  'retail.fn_prendas_para_recibir(uuid,uuid,text)',
  $v$  if p_categoria_id is null or p_marca_id is null then$v$,
  $v$  -- ADR-0393 (Felipe 2026-10-14): sin marca vale: busca las prendas sin marca de esa categoría.
  if p_categoria_id is null then$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_prendas_para_recibir(uuid,uuid,text)',
  $v$           and pr.marca_id = p_marca_id$v$,
  $v$           and pr.marca_id is not distinct from p_marca_id$v$,
  1);

-- ---------- 3. Al cerrar: nada sobra y el costo es de quien ve el dinero de Compras ----------
select pg_temp.reemplazar(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$           di.cantidad as enviado, di.precio_unitario,$v$,
  $v$           -- ADR-0393 (sin aviso): sin guía, lo que llegó es lo que vino: nada falta ni sobra.
           coalesce(di.cantidad, case when exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id)
                                      then k.contadas end) as enviado, di.precio_unitario,$v$,
  1);
select pg_temp.reemplazar(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$    if v_k.despacho_item_id is not null then
      v_costo := coalesce(v_costo, v_k.precio_unitario);
    elsif v_costo is null then$v$,
  $v$    if v_k.despacho_item_id is not null then
      v_costo := coalesce(v_costo, v_k.precio_unitario);
    elsif exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
      -- ADR-0393 (sin aviso) y ADR-0330: el costo lo escribe solo quien ve el dinero de Compras; sin costo, entra sin tocar el de la
      -- prenda y llega con la factura.
      if v_costo is not null and not retail.fn_puede_ver_dinero_de_compras() then
        raise exception 'Tu rol no ve el dinero de Compras: recibe sin costo, llega con la factura' using hint = 'recepcion_costo_sin_permiso';
      end if;
    elsif v_costo is null then$v$,
  1);

select pg_temp.reemplazar(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);$v$,
  $v$  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  -- ADR-0393 (Felipe 2026-10-14): lo que llegó sin aviso se cuenta sin saber de quién es, pero no entra al stock sin proveedor.
  if exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = v_despacho.id and s.proveedor_id is null) then
    raise exception 'Falta de quién llegó: elige el proveedor (pregúntale a Compras) y vuelve a cerrar' using hint = 'envio_sin_proveedor';
  end if;$v$,
  1);

-- ---------- 4. El proveedor del envío vale al contar y al crear una prenda ----------
select pg_temp.reemplazar(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$                            where di.despacho_id = p_despacho_id);
    if p_extra_posicion is not null then$v$,
  $v$                            where di.despacho_id = p_despacho_id)
                     -- ADR-0393: el de un envío sin aviso (si ya se sabe).
                     || array(select s.proveedor_id from retail.despachos_sin_aviso s
                               where s.despacho_id = p_despacho_id and s.proveedor_id is not null);
    if p_extra_posicion is not null then$v$,
  1);
select pg_temp.reemplazar(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$    if v_prov is null then
      if cardinality(v_proveedores) <> 1 then$v$,
  $v$    if v_prov is null and cardinality(v_proveedores) = 0
       and exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
      -- ADR-0393 (Felipe 2026-10-14): un envío sin aviso por confirmar se cuenta sin proveedor; poner_proveedor_envio lo completa.
      v_prov := null;
    elsif v_prov is null then
      if cardinality(v_proveedores) <> 1 then$v$,
  1);
select pg_temp.reemplazar(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$    if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
      raise exception 'Elige una marca activa para lo que no estaba en la guía' using hint = 'recepcion_extra_marca';$v$,
  $v$    -- ADR-0393 (Felipe 2026-10-14): sin marca vale; una marca, activa.
    if v_marca is not null and not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
      raise exception 'Esa marca ya no está activa: elige otra o «Sin marca»' using hint = 'recepcion_extra_marca';$v$,
  1);
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$                           where di.despacho_id = p_despacho_id);
    if p_proveedor_id is not null then$v$,
  $v$                           where di.despacho_id = p_despacho_id)
                    -- ADR-0393: el de un envío sin aviso (si ya se sabe).
                    || array(select s.proveedor_id from retail.despachos_sin_aviso s
                              where s.despacho_id = p_despacho_id and s.proveedor_id is not null);
    if p_proveedor_id is not null then$v$,
  1);
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$    elsif cardinality(v_candidatos) = 1 then
      v_proveedor := v_candidatos[1];$v$,
  $v$    elsif cardinality(v_candidatos) = 0 and exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
      -- ADR-0393 (Felipe 2026-10-14): el envío sin aviso todavía no sabe de quién es: la prenda queda sin proveedor (se completa en
      -- Editar producto). Lo que entra al stock sí lo lleva: el cierre lo exige.
      v_proveedor := null;
    elsif cardinality(v_candidatos) = 1 then
      v_proveedor := v_candidatos[1];$v$,
  1);
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$    if p_marca_id is null or not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
      raise exception 'Elige una marca activa para la prenda' using hint = 'recepcion_marca';$v$,
  $v$    -- ADR-0393 (Felipe 2026-10-14): una prenda puede no tener marca; si la tiene, activa.
    if p_marca_id is not null and not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
      raise exception 'Esa marca ya no está activa: elige otra o «Sin marca»' using hint = 'recepcion_marca';$v$,
  1);
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$    insert into retail.marca_proveedores (marca_id, proveedor_id) values (v_marca, v_proveedor) on conflict do nothing;$v$,
  $v$    if v_marca is not null and v_proveedor is not null then
      insert into retail.marca_proveedores (marca_id, proveedor_id) values (v_marca, v_proveedor) on conflict do nothing;
    end if;$v$,
  1);
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$(select m.nombre from retail.marcas m where m.id = v_marca)
      using hint = 'recepcion_prenda_ajena';$v$,
  $v$coalesce((select m.nombre from retail.marcas m where m.id = v_marca), 'sin marca')
      using hint = 'recepcion_prenda_ajena';$v$,
  1);

-- El formulario de la fase 4 recorre las líneas de la guía: un envío sin aviso no tiene, y se cierra con el conteo.
select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$    raise exception 'Este envío se reabrió: ciérralo desde el conteo' using hint = 'envio_reabierto';
  end if;$v$,
  $v$    raise exception 'Este envío se reabrió: ciérralo desde el conteo' using hint = 'envio_reabierto';
  end if;
  -- ADR-0393: un envío sin aviso no tiene guía que este formulario pueda recorrer.
  if exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Este envío llegó sin aviso: ciérralo desde el conteo' using hint = 'envio_sin_aviso';
  end if;$v$,
  1);

-- ---------- 5. Abrir un envío sin aviso ----------
create or replace function retail.abrir_envio_sin_aviso(
  p_ubicacion_id uuid,
  p_proveedor_id uuid,
  p_numero_guia text default null,
  p_nota text default null,
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
  v_guia text := nullif(btrim(coalesce(p_numero_guia, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_previo record;
  v_id uuid;
  v_numero integer;
  v_version integer;
  v_proveedor text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir mercadería necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Doble clic o reintento sin red: el mismo token devuelve el mismo envío, si es el mismo (sede y proveedor).
  if p_token is not null then
    for v_previo in
      select d.id, d.numero, d.version, d.estado, d.ubicacion_destino_id, s.proveedor_id
        from retail.despachos d
        left join retail.despachos_sin_aviso s on s.despacho_id = d.id
       where d.token_cliente = p_token
    loop
      if v_previo.ubicacion_destino_id = p_ubicacion_id and v_previo.proveedor_id is not distinct from p_proveedor_id then
        return jsonb_build_object('despacho_id', v_previo.id, 'numero', retail.fn_envio_numero_texto(v_previo.numero),
                                  'estado', v_previo.estado, 'version', v_previo.version, 'repetido', true);
      end if;
      raise exception 'Eso ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end loop;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- La sede: la que la cuenta puede operar (no hay órdenes, así que la decisión 17 no aplica).
  perform retail.fn_recepcion_exigir(null, p_ubicacion_id, v_actor);
  -- Sin proveedor = por confirmar (Felipe 2026-10-14): se cuenta igual y se pone antes de cerrar.
  if p_proveedor_id is not null then
    v_proveedor := (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo);
    if v_proveedor is null then
      raise exception 'Elige de quién llegó: un proveedor activo, o «No sé de quién es»' using hint = 'recepcion_proveedor';
    end if;
  end if;
  if v_guia is not null and length(v_guia) > 40 then
    raise exception 'El número de guía es muy largo: hasta 40 letras' using hint = 'recepcion_guia';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recepcion_nota';
  end if;

  -- El envío nace en camino y se abre en el acto (el camino de Compras: en camino → abierto), sin líneas.
  insert into retail.despachos (ubicacion_destino_id, despachado_por, numero_guia, nota, token_cliente)
  values (p_ubicacion_id, v_actor, v_guia, v_nota, p_token)
  returning id, numero into v_id, v_numero;
  update retail.despachos d set estado = 'abierto', abierto_por = v_actor, abierto_en = now() where d.id = v_id;
  insert into retail.despachos_sin_aviso (despacho_id, proveedor_id, creado_por) values (v_id, p_proveedor_id, v_actor);
  v_version := (select d.version from retail.despachos d where d.id = v_id);

  -- Actividad (ADR-0207): «abrió ENV-000062: llegó sin aviso de Proveedor X». Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_aviso', 'abrió ' || retail.fn_envio_numero_texto(v_numero) || ': llegó sin aviso '
        || coalesce('de ' || v_proveedor, '(proveedor por confirmar)'),
      v_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, null,
      'despachos', v_id::text, now(),
      jsonb_build_object('despacho_id', v_id, 'envio', retail.fn_envio_numero_texto(v_numero), 'proveedor_id', p_proveedor_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el envío sin aviso % (%)', v_numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', v_id, 'numero', retail.fn_envio_numero_texto(v_numero), 'estado', 'abierto',
                            'version', v_version, 'repetido', false);
end;
$$;
comment on function retail.abrir_envio_sin_aviso(uuid, uuid, text, text, uuid) is
  'ADR-0393 (decisiones 2 y 10): abre en la sede un envío SIN GUÍA de ese proveedor (o sin proveedor, por confirmar: se pone con '
  'poner_proveedor_envio antes de cerrar), listo para contar con guardar_conteo_envio (todo es «lo que no estaba en la guía» y nada '
  'sobra) y cerrar con cerrar_conteo_envio (sin costo, salvo quien ve el dinero de Compras). Módulo Recibir y la sede; firma el '
  'responsable. Token. Devuelve {despacho_id, numero, estado, version, repetido}.';
revoke all on function retail.abrir_envio_sin_aviso(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function retail.abrir_envio_sin_aviso(uuid, uuid, text, text, uuid) to authenticated, service_role;

-- ---------- 5b. Poner el proveedor que faltaba (Felipe 2026-10-14) ----------
-- CONTRATO de poner_proveedor_envio
--   PROMETE: con el módulo Recibir y la sede, a un envío sin aviso ABIERTO que todavía no sabe de quién es, le pone ese proveedor
--            (activo) y se lo pasa a todo lo contado en él. Si ya tenía ese mismo, no hace nada (reintento).
--   ASUME:   alguien supo de quién es (le preguntó a Compras).
--   NO HACE: no cambia un proveedor ya puesto ni cierra el envío; no sube la versión de lo contado (los números no cambiaron: quien
--            cierra no tiene que volver a mirarlos).
create or replace function retail.poner_proveedor_envio(p_despacho_id uuid, p_proveedor_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_actual uuid;
  v_nombre text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir mercadería necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  -- El envío en exclusiva: guardar_conteo_envio lo toma compartido, así nadie agrega una línea sin proveedor mientras se pone.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  select s.proveedor_id into v_actual from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id for update;
  if not found then
    raise exception 'Este envío vino de Compras: su proveedor es el de sus órdenes' using hint = 'envio_no_es_sin_aviso';
  end if;
  if v_actual = p_proveedor_id then
    return jsonb_build_object('despacho_id', p_despacho_id, 'proveedor',
                              (select jsonb_build_object('id', pr.id, 'nombre', pr.nombre) from retail.proveedores pr where pr.id = v_actual),
                              'repetido', true);
  end if;
  if v_actual is not null then
    raise exception 'Este envío ya tiene su proveedor: no se cambia' using hint = 'envio_proveedor_puesto';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'Este envío ya no se está contando: recarga la pantalla' using hint = 'envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  v_nombre := (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo);
  if v_nombre is null then
    raise exception 'Elige de quién llegó: un proveedor activo' using hint = 'recepcion_proveedor';
  end if;

  update retail.despachos_sin_aviso s set proveedor_id = p_proveedor_id where s.despacho_id = p_despacho_id;
  update retail.despacho_conteos k set proveedor_id = p_proveedor_id
   where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.proveedor_id is null;

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_aviso_proveedor',
      'puso el proveedor de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_nombre,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'proveedor_id', p_proveedor_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el proveedor del envío % (%)', v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'proveedor', jsonb_build_object('id', p_proveedor_id, 'nombre', v_nombre),
                            'repetido', false);
end;
$$;
comment on function retail.poner_proveedor_envio(uuid, uuid) is
  'ADR-0393 (Felipe 2026-10-14): pone el proveedor de un envío sin aviso abierto que se abrió sin saberlo, y se lo pasa a lo contado. '
  'Una sola vez (no cambia uno puesto); el mismo proveedor otra vez no hace nada. Módulo Recibir y la sede; firma el responsable. '
  'Devuelve {despacho_id, proveedor: {id, nombre}, repetido}.';
revoke all on function retail.poner_proveedor_envio(uuid, uuid) from public, anon;
grant execute on function retail.poner_proveedor_envio(uuid, uuid) to authenticated, service_role;

-- ---------- 6. Lo contado de un envío dice de dónde vino y sus proveedores ----------
create or replace function retail.fn_envio_conteos(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_estado text;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;
  select d.estado into v_estado from retail.despachos d where d.id = p_despacho_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'despacho_id', p_despacho_id,
    'estado', v_estado,
    -- ADR-0393: «compra» (lo mandó Compras, con su guía) o «sin_aviso» (lo abrió la sede al llegar).
    'origen', case when exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then 'sin_aviso'
                   else 'compra' end,
    -- Felipe 2026-10-14: un envío sin aviso que se abrió sin saber de quién es (se pone antes de cerrar).
    'proveedor_por_confirmar', exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id and s.proveedor_id is null),
    -- Los proveedores del envío: los de sus órdenes, o el de un envío sin aviso (para lo que no estaba en la guía).
    'proveedores', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'nombre', q.nombre) order by q.nombre)
        from (select pr.id, pr.nombre
                from retail.despacho_items di
                join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                join retail.ordenes_compra o on o.id = i.orden_compra_id
                join retail.proveedores pr on pr.id = o.proveedor_id
               where di.despacho_id = p_despacho_id
              union
              select pr.id, pr.nombre
                from retail.despachos_sin_aviso s
                join retail.proveedores pr on pr.id = s.proveedor_id
               where s.despacho_id = p_despacho_id) q), '[]'::jsonb),
    'conteos', coalesce((
      select jsonb_agg(retail.fn_envio_conteo_json(k) order by k.extra_posicion nulls first, o.numero, i.posicion)
        from retail.despacho_conteos k
        left join retail.despacho_items di on di.id = k.despacho_item_id
        left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        left join retail.ordenes_compra o on o.id = i.orden_compra_id
       where k.despacho_id = p_despacho_id), '[]'::jsonb),
    -- ADR-0393 (actividad 4): «Cerrado a las 10:58 por Mariana · reabierto: encontramos las 2 que faltaban».
    'cierres', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'motivo', c.motivo, 'resultado', c.resultado,
                                          'hecho_por', retail.fn_envio_persona(c.hecho_por), 'hecho_en', c.hecho_en)
                       order by c.hecho_en, c.id)
        from retail.despacho_cierres c where c.despacho_id = p_despacho_id), '[]'::jsonb),
    -- Si se puede reabrir (cerrado y Compras sin tocar lo que faltó) y, si no, por qué (la pista de reabrir_envio).
    'reabrir', case when v_estado = 'cerrado'
                    then jsonb_build_object('se_puede', retail.fn_envio_reabrir_bloqueo(p_despacho_id) is null,
                                            'por_que_no', retail.fn_envio_reabrir_bloqueo(p_despacho_id)) end);
end;
$$;
comment on function retail.fn_envio_conteos(uuid) is
  'ADR-0393: lo contado de un envío: {despacho_id, estado, origen (compra | sin_aviso), proveedor_por_confirmar, proveedores [{id, nombre}], conteos: [como '
  'fn_envio_conteo_json], cierres: [{tipo, motivo, resultado, hecho_por, hecho_en}], reabrir: {se_puede, por_que_no} (solo cerrado)}. '
  'NULL si el envío no existe. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envio_conteos(uuid) from public, anon;
grant execute on function retail.fn_envio_conteos(uuid) to authenticated, service_role;

-- ---------- 7. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
begin
  if to_regclass('retail.despachos_sin_aviso') is null
     or not coalesce((select c.relrowsecurity from pg_class c where c.oid = 'retail.despachos_sin_aviso'::regclass), false)
     or exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despachos_sin_aviso')
     or has_table_privilege('authenticated', 'retail.despachos_sin_aviso', 'select')
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despachos_sin_aviso'::regclass and t.tgname = 'despachos_sin_aviso_fija') then
    raise exception 'retail.despachos_sin_aviso: con RLS, sin políticas, sin lectura directa y con su disparador';
  end if;
  if (select is_nullable from information_schema.columns
       where table_schema = 'retail' and table_name = 'despacho_recibidos' and column_name = 'costo_unitario') <> 'YES' then
    raise exception 'despacho_recibidos.costo_unitario tiene que poder quedar vacío (lo que entra sin costo)';
  end if;
  v_funcion := 'retail.abrir_envio_sin_aviso(uuid,uuid,text,text,uuid)';
  if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure)
     or has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
    raise exception '%: security definer, la ejecuta authenticated y no anon', v_funcion;
  end if;
  if (select is_nullable from information_schema.columns
       where table_schema = 'retail' and table_name = 'despachos_sin_aviso' and column_name = 'proveedor_id') <> 'YES'
     or (select is_nullable from information_schema.columns
          where table_schema = 'retail' and table_name = 'despacho_recibidos' and column_name = 'marca_id') <> 'YES'
     or (select is_nullable from information_schema.columns
          where table_schema = 'retail' and table_name = 'despacho_diferencias' and column_name = 'marca_id') <> 'YES' then
    raise exception 'sin proveedor y sin marca: el proveedor de un envío sin aviso y la marca de lo recibido tienen que poder quedar vacíos';
  end if;
  v_funcion := 'retail.poner_proveedor_envio(uuid,uuid)';
  if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure)
     or has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
    raise exception '%: security definer, la ejecuta authenticated y no anon', v_funcion;
  end if;
  if position('envio_sin_proveedor' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0
     or position('left join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)' in
                 pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0
     or position('left join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)' in
                 pg_get_functiondef('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)'::regprocedure)) = 0
     or position('left join retail.marcas m on m.id = r.marca_id' in pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure)) = 0
     or position('left join retail.marcas m on m.id = x.marca_id' in pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure)) = 0
     or position('«Sin marca»' in pg_get_functiondef(
          'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)'::regprocedure)) = 0
     or position('pr.marca_id is not distinct from p_marca_id' in pg_get_functiondef('retail.fn_prendas_para_recibir(uuid,uuid,text)'::regprocedure)) = 0 then
    raise exception 'falta uno de los reemplazos de «sin proveedor» y «sin marca» (cerrar, resolver, el detalle, guardar o la búsqueda)';
  end if;
  if position('if v_costo is not null then' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) = 0
     or position('recepcion_costo_sin_permiso' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0
     or position('despachos_sin_aviso' in pg_get_functiondef(
          'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)'::regprocedure)) = 0
     or position('despachos_sin_aviso' in pg_get_functiondef(
          'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)'::regprocedure)) = 0
     or position('envio_sin_aviso' in pg_get_functiondef('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'falta uno de los reemplazos del envío sin aviso (entrar sin costo, cerrar, guardar, preparar o el freno de recibir_despacho)';
  end if;
end;
$$;

reset lock_timeout;
