-- ADR-0507 · Observaciones al contar un envío: «prenda rota», «prenda faltante»… con su mensaje, guardadas en el envío.
--
-- EL PROBLEMA PRIMERO. Al contar un envío, el sistema solo sabe «llegaron 15 de 15». Si una prenda llegó rota, manchada o distinta a lo
-- pedido, la colaboradora no tiene dónde decirlo: lo cuenta de palabra, o lo escribe en un papel, o lo olvida. Y cuando Compras reclama al
-- proveedor meses después, nadie recuerda qué pasó con ese fardo. Lo que se vio al abrir la caja tiene que quedar escrito en el envío,
-- junto a quién lo vio y cuándo.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despacho_observaciones`: una fila por observación (tipo de una lista corta + mensaje libre), de una línea del envío o, si no es de
--      una línea en particular, del envío entero. Quién la anotó y cuándo. Se escribe SOLO con el envío abierto y NO se borra ni se edita
--      nunca (una observación es un hecho: si te equivocaste, anotas otra).
--   2. `registrar_observacion_envio`: anota una observación. El token hace seguro el doble clic y el reintento tras un corte (la misma
--      observación no se anota dos veces).
--   3. `fn_envio_observaciones`: las observaciones de un envío con quién las anotó, en cualquier estado del envío (se siguen leyendo al
--      cerrarlo: es lo que Compras necesita para reclamar).
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Una observación en un envío en camino, cerrado o anulado → disparador `despacho_observaciones_fija`.
--   · Una observación de una línea de OTRO envío → el mismo disparador.
--   · Una observación borrada o cambiada → el mismo disparador.
--   · Un tipo que no está en la lista, o un mensaje vacío o de más de 300 letras → CHECKs de la tabla.
--   · Dos veces la misma observación por un reintento → único parcial por token.
--
-- CONTRATO de registrar_observacion_envio
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (el responsable, que no hizo ninguna de sus órdenes, decisión 17), deja
--            la observación a nombre de quien firma y la devuelve. Repetir con el mismo token devuelve la misma sin anotar otra.
--   ASUME:   el envío está abierto («Empezar a recibir» es `abrir_despacho`).
--   NO HACE: no cambia lo contado, no mueve stock, no crea ni cierra diferencias (los faltantes y sobrantes siguen naciendo al cerrar, con
--            su causa); la observación es un texto para las personas, no una regla.
--
-- DESCARTÉ:
--   · Guardar la observación dentro de `despacho_conteos` (una columna `nota`): el conteo se pisa («gana el último, con aviso», decisión 9)
--     y una línea puede tener varias observaciones («una rota» y «una faltante») de personas distintas. Un hecho aparte no se pisa.
--   · Reutilizar `despacho_diferencias.nota`: esa fila nace al cerrar, solo para faltantes y sobrantes con causa de la lista de Compras,
--     y trae el costo que alimenta «Nos debe». Una prenda rota que llegó no es una deuda del proveedor hasta que Compras lo decida.
--   · Una tabla de tipos editable por el líder: la lista es corta y cada tipo la entiende la pantalla («Prenda rota» lleva un ícono); un
--     tipo nuevo es una decisión de producto, no un dato. `otro` + mensaje cubre lo imprevisto.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013171000. Una tabla NUEVA sin políticas (RLS encendido, se lee
-- y escribe por funciones `security definer`); sin `drop trigger` (el disparador va con `create or replace trigger`), sin `select … into`
-- dentro de textos entre comillas (ADR-0288). Se puede pegar dos veces.

set lock_timeout = '3s';

-- ---------- 1. Las observaciones ----------
create table if not exists retail.despacho_observaciones (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  -- La línea del envío a la que se refiere; nula si es del envío en general (o de algo que no estaba en la guía).
  despacho_item_id uuid references retail.despacho_items (id),
  tipo text not null,
  mensaje text not null,
  creado_por uuid not null references public.personas (id),
  creado_en timestamptz not null default clock_timestamp(),
  -- El token del navegador: el doble clic o el reintento tras un corte no anotan dos veces lo mismo.
  token_cliente uuid,
  constraint despacho_observaciones_tipo check (
    tipo in ('prenda_rota', 'prenda_faltante', 'prenda_manchada', 'prenda_distinta', 'prenda_de_mas', 'empaque_danado', 'otro')),
  constraint despacho_observaciones_mensaje check (btrim(mensaje) <> '' and length(mensaje) <= 300)
);
create unique index if not exists despacho_observaciones_token_unico on retail.despacho_observaciones (despacho_id, token_cliente)
  where token_cliente is not null;
create index if not exists despacho_observaciones_despacho_idx on retail.despacho_observaciones (despacho_id, creado_en);
comment on table retail.despacho_observaciones is
  'ADR-0507: lo que la persona vio al contar un envío (prenda rota, faltante, manchada, distinta, de más, empaque dañado u otro), con su '
  'mensaje, de una línea del envío o del envío entero. Solo con el envío abierto; no se borra ni se edita. Solo se lee y escribe por '
  'funciones (RLS sin políticas).';

alter table retail.despacho_observaciones enable row level security;
revoke all on table retail.despacho_observaciones from anon, authenticated;

-- Solo con el envío abierto, con una línea de ESE envío; no se borra ni se edita.
create or replace function retail.fn_despacho_observaciones_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    raise exception 'Una observación no se borra ni se cambia: si te equivocaste, anota otra' using errcode = '42501', hint = 'observacion_inmutable';
  end if;
  if not exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado = 'abierto') then
    raise exception 'Solo se anotan observaciones en un envío abierto' using errcode = '23514', hint = 'observacion_envio_no_abierto';
  end if;
  if new.despacho_item_id is not null and not exists (
    select 1 from retail.despacho_items di where di.id = new.despacho_item_id and di.despacho_id = new.despacho_id
  ) then
    raise exception 'Esa línea no es de este envío' using errcode = '23514', hint = 'observacion_linea_ajena';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_despacho_observaciones_fija() from public, anon, authenticated;
create or replace trigger despacho_observaciones_fija
  before insert or update or delete on retail.despacho_observaciones
  for each row execute function retail.fn_despacho_observaciones_fija();

-- Una observación como la lee la pantalla.
create or replace function retail.fn_envio_observacion_json(p_fila retail.despacho_observaciones)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'id', p_fila.id,
    'despacho_id', p_fila.despacho_id,
    'despacho_item_id', p_fila.despacho_item_id,
    'tipo', p_fila.tipo,
    'mensaje', p_fila.mensaje,
    'creado_por', retail.fn_envio_persona(p_fila.creado_por),
    'creado_en', p_fila.creado_en);
$$;
comment on function retail.fn_envio_observacion_json(retail.despacho_observaciones) is 'ADR-0507: una observación con quién la anotó, como la lee la pantalla. Interna.';
revoke all on function retail.fn_envio_observacion_json(retail.despacho_observaciones) from public, anon, authenticated;

-- ---------- 2. Anotar una observación ----------
create or replace function retail.registrar_observacion_envio(
  p_despacho_id uuid,
  p_despacho_item_id uuid,
  p_tipo text,
  p_mensaje text,
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
  v_mensaje text := nullif(btrim(coalesce(p_mensaje, '')), '');
  v_fila retail.despacho_observaciones;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Anotar una observación necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  -- El envío se bloquea en modo compartido: varias personas anotan a la vez, pero nadie lo cierra ni lo anula a mitad de un guardado.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for share;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Abrir el fardo»' using hint = 'envio_sin_abrir';
  end if;
  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió: para anotar algo, reábrelo' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  if p_tipo is null or p_tipo not in ('prenda_rota', 'prenda_faltante', 'prenda_manchada', 'prenda_distinta', 'prenda_de_mas', 'empaque_danado', 'otro') then
    raise exception 'Elige qué pasó con la prenda' using hint = 'observacion_tipo';
  end if;
  if v_mensaje is null then
    raise exception 'Escribe qué viste: un mensaje corto para quien lea esto después' using hint = 'observacion_mensaje';
  end if;
  if length(v_mensaje) > 300 then
    raise exception 'El mensaje es muy largo: hasta 300 letras' using hint = 'observacion_mensaje_largo';
  end if;
  if p_despacho_item_id is not null and not exists (
    select 1 from retail.despacho_items di where di.id = p_despacho_item_id and di.despacho_id = v_despacho.id
  ) then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'observacion_linea_ajena';
  end if;

  -- El reintento (doble clic, corte de red): la misma observación, sin anotar otra.
  if p_token is not null then
    select o.* into v_fila from retail.despacho_observaciones o where o.despacho_id = v_despacho.id and o.token_cliente = p_token;
    if found then
      return retail.fn_envio_observacion_json(v_fila);
    end if;
  end if;

  insert into retail.despacho_observaciones (despacho_id, despacho_item_id, tipo, mensaje, creado_por, token_cliente)
  values (v_despacho.id, p_despacho_item_id, p_tipo, v_mensaje, v_actor, p_token)
  returning * into v_fila;
  return retail.fn_envio_observacion_json(v_fila);
end;
$$;
comment on function retail.registrar_observacion_envio(uuid, uuid, text, text, uuid) is
  'ADR-0507: anota una observación (tipo de la lista + mensaje) de una línea del envío o del envío entero, a nombre de quien firma. Solo '
  'con el envío abierto, módulo Recibir, sede del envío, y quien firma no hizo ninguna de sus órdenes. El token evita anotarla dos veces.';
revoke all on function retail.registrar_observacion_envio(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function retail.registrar_observacion_envio(uuid, uuid, text, text, uuid) to authenticated, service_role;

-- ---------- 3. Leer las observaciones de un envío ----------
create or replace function retail.fn_envio_observaciones(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;
  if not exists (select 1 from retail.despachos d where d.id = p_despacho_id) then
    return null;
  end if;
  return jsonb_build_object(
    'despacho_id', p_despacho_id,
    'observaciones', coalesce((
      select jsonb_agg(retail.fn_envio_observacion_json(o) order by o.creado_en, o.id)
        from retail.despacho_observaciones o
       where o.despacho_id = p_despacho_id), '[]'::jsonb));
end;
$$;
comment on function retail.fn_envio_observaciones(uuid) is
  'ADR-0507: las observaciones de un envío, en el orden en que se anotaron: {despacho_id, observaciones: [{id, despacho_item_id, tipo, '
  'mensaje, creado_por {id, nombre}, creado_en}]}. NULL si el envío no existe. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envio_observaciones(uuid) from public, anon;
grant execute on function retail.fn_envio_observaciones(uuid) to authenticated, service_role;

-- ---------- 4. Comprobación final ----------
do $$
begin
  if to_regclass('retail.despacho_observaciones') is null then
    raise exception 'ADR-0507: falta la tabla despacho_observaciones';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('registrar_observacion_envio', 'fn_envio_observaciones')) <> 2 then
    raise exception 'ADR-0507: faltan funciones de observaciones';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'retail.despacho_observaciones'::regclass) then
    raise exception 'ADR-0507: despacho_observaciones sin RLS';
  end if;
end;
$$;

reset lock_timeout;
