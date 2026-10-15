-- ============================================================================
-- 20261015043000_orden_insumo_lo_que_no_llego.sql — CAYLA V2 · ADR-0362, fase 7 parte 2, actividad 4 (lo que no llegó de una orden de
-- insumos, «anotada en la orden»). Va después de 20261015040000_orden_insumo_recepcion_funciones.sql. Contrato:
-- docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 3).
--
-- EL PROBLEMA PRIMERO. Con la actividad 3, lo que llega al Taller entra contra su orden, pero lo que NO va a llegar se quedaba «pendiente»
-- para siempre: la orden seguía apareciendo en Recibir y nadie sabía que el proveedor nos debía esos metros.
--
-- QUÉ HACE («anotada en la orden», Felipe 2026-10-14): quien recibe marca, en la misma recepción, que el resto de una línea no va a llegar
-- (faltó, se devolvió al proveedor u otro motivo). Ese resto deja de estar pendiente y queda anotado en la orden y en la lista como lo que
-- el proveedor nos debe, con el costo que tenía al cerrarse. Cómo se salda (la reposición, el saldo a favor o el reembolso) llega con la
-- fase 5b: aquí solo se anota.
--   1. `orden_insumo_cierres`: el libro de lo que no llegó (de una línea pedida o de lo que el papel trajo fuera de la orden), con su
--      recepción, quién, cuánto, a qué costo y por qué. No se edita ni se borra. RLS encendido y sin políticas (ADR-0195): solo lo leen
--      funciones `security definer`.
--   2. `fn_orden_insumo_por_recibir_lineas`: lo que queda descuenta lo cerrado.
--   3. `recibir_orden_insumo`: cada línea puede traer `cierre: {motivo, nota}` (cierra todo lo que quede después de lo que llega ahora;
--      con «0» solo cierra). La recepción responde también cuántas líneas cerró.
--   4. El detalle de la orden (`fn_orden_insumo`, REEMPLAZO ANCLADO antes de su `return`, sin tocar lo que agregaron 20261015020000 y
--      20261015040000) suma `cierres`; y la lista lee aparte, para las órdenes de su página, lo que nos debe cada una
--      (`fn_ordenes_insumo_nos_debe`): `fn_ordenes_insumo` no cambia de columnas, así su migración se puede volver a pegar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261015040000. Una tabla nueva sin políticas y funciones; sin
-- `drop trigger` (ADR-0195) ni `select … into` dentro de textos entre comillas (ADR-0288). Re-ejecutable: se puede pegar dos veces. El
-- bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261015020000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. El libro de lo que no llegó ----------
create table if not exists retail.orden_insumo_cierres (
  id uuid primary key default gen_random_uuid(),
  orden_insumo_id uuid not null references retail.ordenes_insumo (id),
  orden_insumo_item_id uuid references retail.orden_insumo_items (id),
  comprobante_item_id uuid references retail.comprobantes_produccion_items (id),
  recepcion_id uuid not null references retail.orden_insumo_recepciones (id),
  insumo_id uuid not null references retail.insumos (id),
  cantidad numeric(12, 3) not null,
  costo_unitario numeric(12, 4) not null,
  motivo text not null,
  nota text,
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint orden_insumo_cierres_una_linea check ((orden_insumo_item_id is null) <> (comprobante_item_id is null)),
  constraint orden_insumo_cierres_cantidad check (cantidad > 0 and cantidad < 'Infinity'::numeric),
  constraint orden_insumo_cierres_costo check (costo_unitario >= 0 and costo_unitario < 'Infinity'::numeric),
  constraint orden_insumo_cierres_motivo check (motivo in ('faltante', 'devolucion', 'otro')),
  constraint orden_insumo_cierres_nota_larga check (nota is null or length(nota) <= 300)
);
create index if not exists orden_insumo_cierres_orden_idx on retail.orden_insumo_cierres (orden_insumo_id);
create index if not exists orden_insumo_cierres_item_idx on retail.orden_insumo_cierres (orden_insumo_item_id) where orden_insumo_item_id is not null;
create index if not exists orden_insumo_cierres_papel_idx on retail.orden_insumo_cierres (comprobante_item_id) where comprobante_item_id is not null;
alter table retail.orden_insumo_cierres enable row level security;
comment on table retail.orden_insumo_cierres is
  'Lo que no va a llegar de una orden de insumos (ADR-0362, fase 7 parte 2): lo que el proveedor nos debe, con su costo al cerrarse. No se edita ni se borra.';

create or replace function retail.fn_orden_insumo_cierre_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Lo que no llegó de una orden de insumos queda anotado: no se edita ni se borra' using errcode = '42501';
end;
$$;
create or replace trigger orden_insumo_cierres_inmutable
  before update or delete on retail.orden_insumo_cierres
  for each row execute function retail.fn_orden_insumo_cierre_inmutable();

-- ---------- 2. Lo que queda por recibir, menos lo que se cerró ----------
create or replace function retail.fn_orden_insumo_por_recibir_lineas(p_orden_id uuid)
returns table (
  tipo text, item_id uuid, posicion integer, insumo_id uuid, insumo text, codigo text, unidad text, documento text,
  pedido numeric, facturado numeric, recibido numeric, queda numeric, costo numeric
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select 'orden'::text, i.id, i.posicion, i.insumo_id, n.nombre, n.codigo, i.unidad_medida, null::text,
         i.cantidad, f.cantidad, r.cantidad, greatest(greatest(i.cantidad, f.cantidad) - r.cantidad - k.cantidad, 0),
         -- El del papel si la línea tiene UNO vigente (el costo real, sin IGV); si no, el neto de la orden (precio menos su descuento).
         coalesce(f.costo_unico, round(i.subtotal / i.cantidad, 4))
    from retail.orden_insumo_items i
    join retail.insumos n on n.id = i.insumo_id
    cross join lateral (
      select coalesce(sum(x.cantidad), 0) as cantidad,
             case when count(*) = 1 then min(x.costo_unitario) end as costo_unico
        from retail.comprobantes_produccion_items x
        join retail.comprobantes_produccion y on y.id = x.comprobante_id and y.estado = 'vigente'
       where x.orden_insumo_item_id = i.id
    ) f
    cross join lateral (
      select coalesce(sum(l.cantidad_ingresada), 0) as cantidad from retail.insumo_lotes l where l.orden_insumo_item_id = i.id
    ) r
    -- Lo que se cerró porque no va a llegar (actividad 4).
    cross join lateral (
      select coalesce(sum(c.cantidad), 0) as cantidad from retail.orden_insumo_cierres c where c.orden_insumo_item_id = i.id
    ) k
   where i.orden_insumo_id = p_orden_id
  union all
  select 'papel'::text, x.id, null::integer, x.insumo_id, n.nombre, n.codigo, n.unidad_medida, y.serie || '-' || y.numero,
         null::numeric, x.cantidad, r.cantidad, greatest(x.cantidad - r.cantidad - k.cantidad, 0), x.costo_unitario
    from retail.comprobantes_produccion_items x
    join retail.comprobantes_produccion y on y.id = x.comprobante_id and y.estado = 'vigente'
    join retail.insumos n on n.id = x.insumo_id
    cross join lateral (
      select coalesce(sum(l.cantidad_ingresada), 0) as cantidad from retail.insumo_lotes l where l.comprobante_item_id = x.id
    ) r
    cross join lateral (
      select coalesce(sum(c.cantidad), 0) as cantidad from retail.orden_insumo_cierres c where c.comprobante_item_id = x.id
    ) k
   where y.orden_insumo_id = p_orden_id and x.orden_insumo_item_id is null and x.insumo_id is not null;
$$;

-- ---------- 3. Recibir, y anotar que el resto no va a llegar ----------
create or replace function retail.fn_orden_insumo_recepcion_resultado(p_recepcion_id uuid, p_repetido boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'recepcion_id', r.id,
           'orden_id', r.orden_insumo_id,
           'documento', retail.fn_orden_insumo_numero_texto(o.numero),
           'lotes', (select count(*) from retail.insumo_lotes l where l.orden_insumo_recepcion_id = r.id),
           'cierres', (select count(*) from retail.orden_insumo_cierres c where c.recepcion_id = r.id),
           'queda', exists (select 1 from retail.fn_orden_insumo_por_recibir_lineas(o.id) x where x.queda > 0),
           'repetido', p_repetido)
    from retail.orden_insumo_recepciones r
    join retail.ordenes_insumo o on o.id = r.orden_insumo_id
   where r.id = p_recepcion_id;
$$;

create or replace function retail.recibir_orden_insumo(
  p_orden_id uuid,
  p_ubicacion_id uuid,
  p_lineas jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_orden retail.ordenes_insumo;
  v_existente record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_linea jsonb;
  v_pos integer := 0;
  v_tipo text;
  v_item uuid;
  v_cant numeric;
  v_costo numeric;
  v_fila record;
  v_es_de_la_orden boolean;
  v_cierre jsonb;
  v_motivo text;
  v_nota_cierre text;
  v_cierra numeric;
  v_llegan integer;
  v_cierran integer;
  v_vistos uuid[] := '{}';
  v_lineas jsonb := '[]'::jsonb;
  v_documento text;
  v_codigo text;
  v_n integer;
  v_recepcion uuid;
  v_lote uuid;
  v_restriccion text;
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Recibir insumos necesita el módulo de Producción en tu rol' using errcode = '42501', hint = 'recibir_insumos_sin_modulo';
  end if;
  if p_ubicacion_id is null or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller' and u.activo) then
    raise exception 'Los insumos se reciben en el Taller' using hint = 'recibir_otro_taller';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes recibir insumos en esa ubicación' using errcode = '42501', hint = 'recibir_otro_taller';
  end if;

  -- La orden se bloquea: dos recepciones a la vez (o una recepción y un papel, o una edición) se ponen en fila y la segunda ve lo que dejó
  -- la primera.
  if p_orden_id is not null then
    select o.* into v_orden from retail.ordenes_insumo o where o.id = p_orden_id for update;
  end if;
  if v_orden.id is null then
    raise exception 'Esa orden de insumos no existe' using hint = 'orden_insumo_no_existe';
  end if;

  -- El token sigue al contenido: el mismo token con otras cantidades se rechaza (`token_reusado`); el mismo envío (doble clic, reintento
  -- sin red) devuelve la recepción que ya se guardó.
  perform retail.fn_intento_con_huella('recibir_orden_insumo', p_token, md5(jsonb_build_object(
    'orden', p_orden_id, 'ubicacion', p_ubicacion_id, 'lineas', p_lineas, 'nota', p_nota)::text));
  if p_token is not null then
    for v_existente in select r.id, r.orden_insumo_id from retail.orden_insumo_recepciones r where r.token_cliente = p_token loop
      if v_existente.orden_insumo_id = v_orden.id then
        return retail.fn_orden_insumo_recepcion_resultado(v_existente.id, true);
      end if;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'recibir_orden_insumo_otro_envio';
    end loop;
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se recibe' using hint = 'orden_insumo_anulada';
  end if;
  if v_orden.ubicacion_destino_id <> p_ubicacion_id then
    raise exception 'Esta orden llega a otro taller: la recibe ese taller' using errcode = '42501', hint = 'recibir_otro_taller';
  end if;
  -- Quién recibe: firma el responsable, como la recepción de siempre. Quien hizo la orden no la recibe (decisión 17, ni el líder).
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_orden.creada_por = v_actor then
    raise exception 'Hiciste esta orden: la tiene que recibir otra persona del Taller' using errcode = '42501', hint = 'recibir_quien_compro';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recibir_orden_insumo_nota';
  end if;

  -- Las líneas: se validan TODAS antes de escribir nada.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Escribe cuánto llegó de al menos un insumo, o qué no va a llegar' using hint = 'recibir_orden_insumo_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    raise exception 'Una recepción lleva hasta 200 líneas' using hint = 'recibir_orden_insumo_sin_lineas';
  end if;
  for v_linea in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'recibir_orden_insumo_linea';
    end if;
    -- Lo que no va a llegar (actividad 4, «anotada en la orden»): `cierre` cierra TODO lo que quede después de lo que llega ahora.
    v_cierre := case when jsonb_typeof(v_linea -> 'cierre') = 'object' then v_linea -> 'cierre' end;
    if v_linea ? 'cierre' and jsonb_typeof(v_linea -> 'cierre') <> 'null' and v_cierre is null then
      raise exception 'La línea % trae un cierre que no se entiende', v_pos using hint = 'recibir_orden_insumo_cierre';
    end if;
    begin
      v_item := coalesce(nullif(btrim(v_linea ->> 'orden_insumo_item_id'), ''), nullif(btrim(v_linea ->> 'comprobante_item_id'), ''))::uuid;
      v_tipo := case when nullif(btrim(v_linea ->> 'orden_insumo_item_id'), '') is not null then 'orden' else 'papel' end;
      v_cant := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_costo := nullif(btrim(v_linea ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'recibir_orden_insumo_linea';
    end;
    if nullif(btrim(v_linea ->> 'orden_insumo_item_id'), '') is not null and nullif(btrim(v_linea ->> 'comprobante_item_id'), '') is not null then
      raise exception 'La línea % nombra una línea de la orden y una del papel: elige una', v_pos using hint = 'recibir_orden_insumo_linea';
    end if;
    -- La línea tiene que ser de ESTA orden (pedida, o traída fuera de la orden por uno de sus papeles vigentes).
    v_es_de_la_orden := false;
    for v_fila in select l.* from retail.fn_orden_insumo_por_recibir_lineas(v_orden.id) l where l.tipo = v_tipo and l.item_id = v_item loop
      v_es_de_la_orden := true;
      exit;
    end loop;
    if v_item is null or not v_es_de_la_orden then
      raise exception 'La línea % no es de esta orden: recarga la pantalla', v_pos using hint = 'recibir_orden_insumo_linea_ajena';
    end if;
    if v_item = any (v_vistos) then
      raise exception 'Una línea aparece dos veces en la misma recepción' using hint = 'recibir_orden_insumo_linea';
    end if;
    v_vistos := v_vistos || v_item;
    -- `NaN` no cumple ninguna de las comparaciones de abajo: también se rechaza. Cero vale solo si la línea cierra lo que queda.
    if v_cant is null or not (v_cant >= 0 and v_cant <= 99999.999) or v_cant <> round(v_cant, 3) then
      raise exception 'Lo que llegó de la línea % va de 0.001 a 99 999.999, con hasta tres decimales', v_pos
        using hint = 'recibir_orden_insumo_cantidad';
    end if;
    if v_cant = 0 and v_cierre is null then
      raise exception 'De la línea % no llegó nada: escribe cuánto llegó, o marca que el resto no va a llegar', v_pos
        using hint = 'recibir_orden_insumo_cantidad';
    end if;
    if v_cant > v_fila.queda then
      raise exception 'De %, solo quedan % por recibir y escribiste %', v_fila.insumo, trim_scale(v_fila.queda), trim_scale(v_cant)
        using hint = 'recibir_orden_insumo_de_mas';
    end if;
    -- El costo del lote (decisión 53): el que escribe quien recibe, o el sugerido. Sin IGV, con hasta cuatro decimales.
    v_costo := coalesce(v_costo, v_fila.costo);
    if v_costo is null or not (v_costo >= 0 and v_costo <= 99999.9999) or v_costo <> round(v_costo, 4) then
      raise exception 'El costo de la línea % va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales', v_pos
        using hint = 'recibir_orden_insumo_costo';
    end if;
    v_cierra := null;
    v_motivo := null;
    v_nota_cierre := null;
    if v_cierre is not null then
      v_motivo := coalesce(v_cierre ->> 'motivo', '');
      if v_motivo not in ('faltante', 'devolucion', 'otro') then
        raise exception 'Di por qué no va a llegar el resto de %: faltó, se devolvió al proveedor u otro motivo', v_fila.insumo
          using hint = 'recibir_orden_insumo_cierre';
      end if;
      v_nota_cierre := nullif(btrim(coalesce(v_cierre ->> 'nota', '')), '');
      if v_nota_cierre is not null and length(v_nota_cierre) > 300 then
        raise exception 'La nota de lo que no llega va hasta 300 letras' using hint = 'recibir_orden_insumo_cierre';
      end if;
      v_cierra := v_fila.queda - v_cant;
      if v_cierra <= 0 then
        raise exception 'De %, con lo que llega ahora no queda nada por cerrar', v_fila.insumo using hint = 'recibir_orden_insumo_cierre';
      end if;
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'tipo', v_tipo, 'item_id', v_item, 'insumo_id', v_fila.insumo_id, 'cantidad', v_cant, 'costo', v_costo,
      'codigo', nullif(btrim(coalesce(v_linea ->> 'codigo_lote', '')), ''),
      'cierra', v_cierra, 'motivo', v_motivo, 'nota_cierre', v_nota_cierre);
  end loop;

  -- Todo bien: se escribe. Una carrera con el mismo token termina en la única recepción y se responde igual que arriba.
  begin
    insert into retail.orden_insumo_recepciones (orden_insumo_id, ubicacion_id, nota, usuario_id, token_cliente)
    values (v_orden.id, p_ubicacion_id, v_nota, v_actor, p_token)
    returning id into v_recepcion;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'orden_insumo_recepciones_token_cliente_key' then
      for v_existente in select r.id, r.orden_insumo_id from retail.orden_insumo_recepciones r where r.token_cliente = p_token loop
        if v_existente.orden_insumo_id = v_orden.id then
          return retail.fn_orden_insumo_recepcion_resultado(v_existente.id, true);
        end if;
      end loop;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'recibir_orden_insumo_otro_envio';
    end if;
    raise;
  end;

  -- Un lote por línea con su movimiento de compra, en la misma transacción. El código del lote: el que se escribió (único por insumo) o el
  -- número de la orden, con «/2», «/3»… si ese insumo ya abrió lote con él.
  v_documento := retail.fn_orden_insumo_numero_texto(v_orden.numero);
  for v_linea in select e.value from jsonb_array_elements(v_lineas) e where (e.value ->> 'cantidad')::numeric > 0 loop
    v_codigo := v_linea ->> 'codigo';
    if v_codigo is not null and exists (select 1 from retail.insumo_lotes l where l.insumo_id = (v_linea ->> 'insumo_id')::uuid and l.codigo_lote = v_codigo) then
      raise exception 'Ya hay un lote de ese insumo con el código «%»: usa otro o déjalo en blanco', v_codigo using hint = 'recibir_orden_insumo_codigo';
    end if;
    if v_codigo is null then
      v_n := (select count(*) from retail.insumo_lotes l
               where l.insumo_id = (v_linea ->> 'insumo_id')::uuid and (l.codigo_lote = v_documento or l.codigo_lote like v_documento || '/%'));
      v_codigo := case when v_n = 0 then v_documento else v_documento || '/' || (v_n + 1) end;
    end if;
    insert into retail.insumo_lotes (insumo_id, ubicacion_id, codigo_lote, proveedor_id, cantidad_ingresada, costo_unitario, documento,
                                     fecha_ingreso, origen, nota, comprobante_item_id, orden_insumo_item_id, orden_insumo_recepcion_id)
    values ((v_linea ->> 'insumo_id')::uuid, p_ubicacion_id, v_codigo, v_orden.proveedor_id, (v_linea ->> 'cantidad')::numeric,
            (v_linea ->> 'costo')::numeric, v_documento, v_hoy, 'compra', v_nota,
            case when v_linea ->> 'tipo' = 'papel' then (v_linea ->> 'item_id')::uuid end,
            case when v_linea ->> 'tipo' = 'orden' then (v_linea ->> 'item_id')::uuid end,
            v_recepcion)
    returning id into v_lote;
    insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, nota)
    values ((v_linea ->> 'insumo_id')::uuid, v_lote, p_ubicacion_id, 'compra', (v_linea ->> 'cantidad')::numeric, (v_linea ->> 'costo')::numeric,
            v_actor, 'Recepción de ' || v_documento);
  end loop;

  -- Lo que no va a llegar: queda anotado en la orden, con su costo de hoy, como lo que el proveedor nos debe (actividad 4). Cómo se salda
  -- (reposición, saldo a favor o reembolso) llega con la fase 5b.
  insert into retail.orden_insumo_cierres (orden_insumo_id, orden_insumo_item_id, comprobante_item_id, recepcion_id, insumo_id, cantidad,
                                           costo_unitario, motivo, nota, usuario_id)
  select v_orden.id,
         case when e.value ->> 'tipo' = 'orden' then (e.value ->> 'item_id')::uuid end,
         case when e.value ->> 'tipo' = 'papel' then (e.value ->> 'item_id')::uuid end,
         v_recepcion, (e.value ->> 'insumo_id')::uuid, (e.value ->> 'cierra')::numeric, (e.value ->> 'costo')::numeric,
         e.value ->> 'motivo', e.value ->> 'nota_cierre', v_actor
    from jsonb_array_elements(v_lineas) e
   where e.value ->> 'cierra' is not null;

  -- Actividad (ADR-0207), sin montos como el resto de la orden. Si falla, la recepción igual queda guardada.
  v_llegan := (select count(*) from jsonb_array_elements(v_lineas) e where (e.value ->> 'cantidad')::numeric > 0);
  v_cierran := (select count(*) from jsonb_array_elements(v_lineas) e where e.value ->> 'cierra' is not null);
  begin
    perform retail.fn_actividad_anotar(
      'ordenes_insumos', 'orden_insumo_recibir',
      concat_ws(' y ',
        case when v_llegan > 0 then 'recibió en el Taller ' || v_llegan || case when v_llegan = 1 then ' insumo' else ' insumos' end end,
        case when v_cierran > 0 then 'anotó que no llegará el resto de ' || v_cierran || case when v_cierran = 1 then ' insumo' else ' insumos' end end)
        || ' de la ' || v_documento || ' (' || (select pr.nombre from retail.proveedores_produccion pr where pr.id = v_orden.proveedor_id) || ')',
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_insumo_sede_actividad(v_actor), p_ubicacion_id,
      'ordenes_insumo', v_orden.id::text, now(),
      jsonb_build_object('orden_id', v_orden.id, 'numero', v_orden.numero, 'recepcion_id', v_recepcion, 'lineas', v_llegan, 'cierres', v_cierran),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la recepción de la orden de insumos % (%)', v_orden.numero, sqlerrm;
  end;

  return retail.fn_orden_insumo_recepcion_resultado(v_recepcion, false);
end;
$$;

-- ---------- 4. El detalle de la orden: lo que no llegó ----------
-- Antes de su `return` (fuera de lo que agregaron 20261015020000 y 20261015040000): así esas migraciones se pueden volver a pegar.
select pg_temp.reemplazar(
  'retail.fn_orden_insumo(uuid)',
  $v$  if v_foto is null then
    return null; -- la pantalla dice «no encontrada»
  end if;
$v$,
  $n$  if v_foto is null then
    return null; -- la pantalla dice «no encontrada»
  end if;
  -- Lo que no llegó (ADR-0362, fase 7 parte 2, actividad 4): cada cierre, con lo que el proveedor nos debe a su costo de ese día.
  v_foto := v_foto || jsonb_build_object('cierres', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', k.id, 'item_id', k.orden_insumo_item_id, 'comprobante_item_id', k.comprobante_item_id, 'posicion', i.posicion,
             'insumo', n.nombre, 'unidad', coalesce(i.unidad_medida, n.unidad_medida), 'cantidad', k.cantidad,
             'costo_unitario', k.costo_unitario, 'importe', round(k.cantidad * k.costo_unitario, 2), 'motivo', k.motivo, 'nota', k.nota,
             'creado_en', k.created_at, 'por', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '')
           ) order by k.created_at, i.posicion nulls last, n.nombre)
      from retail.orden_insumo_cierres k
      join retail.insumos n on n.id = k.insumo_id
      left join retail.orden_insumo_items i on i.id = k.orden_insumo_item_id
      left join public.personas pe on pe.id = k.usuario_id
     where k.orden_insumo_id = p_orden_id
  ), '[]'::jsonb));
$n$,
  1);

-- ---------- 5. La lista: lo que el proveedor nos debe, orden por orden ----------
-- Una lectura aparte, para las órdenes de la página que se mira: la lista (`fn_ordenes_insumo`) no cambia de columnas, así su migración
-- (20261013040000) se puede volver a pegar.
create or replace function retail.fn_ordenes_insumo_nos_debe(p_ids uuid[])
returns table (orden_id uuid, cierres integer, nos_debe numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Ver las órdenes de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  if cardinality(coalesce(p_ids, '{}'::uuid[])) > 200 then
    raise exception 'Se preguntan 200 órdenes como máximo' using errcode = 'P0001';
  end if;
  return query
  select k.orden_insumo_id, count(*)::integer, sum(round(k.cantidad * k.costo_unitario, 2))::numeric
    from retail.orden_insumo_cierres k
   where k.orden_insumo_id = any (coalesce(p_ids, '{}'::uuid[]))
   group by k.orden_insumo_id;
end;
$$;
comment on function retail.fn_ordenes_insumo_nos_debe(uuid[]) is
  'ADR-0362 fase 7 parte 2 (actividad 4): de las órdenes de insumos pedidas, cuántas líneas se cerraron porque no van a llegar y lo que el '
  'proveedor nos debe, a su costo. Exige el módulo ordenes_insumos.';

-- ---------- 6. Permisos ----------
revoke all on function retail.fn_ordenes_insumo_nos_debe(uuid[]) from public, anon;
grant execute on function retail.fn_ordenes_insumo_nos_debe(uuid[]) to authenticated, service_role;
revoke all on function retail.fn_orden_insumo_por_recibir_lineas(uuid) from public, anon, authenticated;
grant execute on function retail.fn_orden_insumo_por_recibir_lineas(uuid) to service_role;
revoke all on function retail.fn_orden_insumo_recepcion_resultado(uuid, boolean) from public, anon, authenticated;
grant execute on function retail.fn_orden_insumo_recepcion_resultado(uuid, boolean) to service_role;
revoke all on function retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid) to authenticated, service_role;

reset lock_timeout;

-- ---------- Comprobación: si algo no quedó, el pegado falla y no se aplica nada ----------
do $$
begin
  if to_regclass('retail.orden_insumo_cierres') is null then
    raise exception 'falta retail.orden_insumo_cierres';
  end if;
  if position('orden_insumo_cierres' in pg_get_functiondef('retail.fn_orden_insumo_por_recibir_lineas(uuid)'::regprocedure)) = 0
     or position('recibir_orden_insumo_cierre' in pg_get_functiondef('retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid)'::regprocedure)) = 0 then
    raise exception 'falta cerrar lo que no va a llegar en la recepción contra la orden';
  end if;
  if position('''cierres''' in pg_get_functiondef('retail.fn_orden_insumo(uuid)'::regprocedure)) = 0
     or to_regprocedure('retail.fn_ordenes_insumo_nos_debe(uuid[])') is null then
    raise exception 'falta lo que no llegó en el detalle o en la lista de órdenes de insumos';
  end if;
end;
$$;
