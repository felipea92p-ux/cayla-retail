-- ADR-0362 · fase 5a (Felipe 2026-10-12, «desarrollar de corrido»): «Nos debe», lo que el proveedor le debe a CAYLA — sin mover plata.
-- Contrato con la pantalla: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md (sección «Fase 5a»). Se apoya en la fase 4:
-- 20261013001000 (las tablas de la recepción) y 20261013002000 (`recibir_despacho`, `fn_envio_detalle`) tienen que estar antes.
--
-- EL PROBLEMA PRIMERO. La recepción de la fase 4 ya anota lo que faltó en cada envío y por qué (`despacho_diferencias`): un faltante
-- «No vino» es una deuda del proveedor «por reponer» (decisiones 14 y 24: «2 polos · S/ 50»). Pero nada la lee, nada dice cuánto queda
-- y nada la cierra: la ficha del proveedor no la muestra, la próxima orden de compra no la recuerda y, cuando la reposición llega en el
-- envío siguiente, la sede solo puede anotarla como un sobrante cualquiera (regalo, se cobra aparte o próxima compra). La deuda quedaría
-- abierta para siempre aunque las prendas ya estén en la tienda, y nadie sabría cuánto le debe de verdad cada proveedor.
--
-- QUÉ HACE (una sola parte, re-pegable). NO mueve plata: «pasar a saldo a favor» y «depositó» (fase 5b) esperan a Felipe y al contador.
--   1. La deuda NO es una tabla nueva: es la fila de `despacho_diferencias` con tipo `faltante` y causa `no_vino`. Lo que se va
--      resolviendo de ella va en `proveedor_deuda_resoluciones` (solo se agregan filas): cuántas, de qué forma (`repuesta`; `saldo_a_favor`
--      y `deposito` quedan reservadas para la 5b), en qué recepción llegó la reposición, quién y cuándo. Su disparador bloquea la deuda
--      (`for update`) e impide que lo resuelto pase de lo debido —aunque dos personas lo marquen a la vez— y que se resuelva algo que no
--      es deuda. Lo pendiente (cantidad − lo resuelto) se calcula, no se guarda: una sola fuente de verdad (principio 4).
--   2. El candado de causas de `despacho_diferencias` suma el sobrante `reposicion_faltante` («Es la reposición de lo que faltó»;
--      no se llama `reposicion` porque esa palabra ya es el motivo de movimiento «Encontré prendas»).
--   3. `recibir_despacho` (REEMPLAZOS ANCLADOS sobre su definición viva) acepta `sobrante_causa = 'reposicion_faltante'` en una línea con más de
--      lo enviado o en algo que no estaba en la guía, solo si ese proveedor debe, por envíos ANTERIORES, al menos eso de esa categoría y
--      marca. La prenda entra a stock como todo lo recibido, la diferencia queda `sobrante`/`reposicion_faltante`, y cada deuda que cubre (la más
--      antigua primero) recibe su resolución `repuesta` con el envío de esta recepción. Un disparador diferido exige que lo marcado como
--      reposición quede repartido entero entre las deudas.
--   4. Lecturas: `fn_proveedor_nos_debe(p_proveedor_id)` (la ficha: abiertas y cerradas de los últimos 90 días, con el monto pendiente y
--      sus resoluciones), `fn_nos_debe_resumen()` (por proveedor: la lista de proveedores, el aviso de la orden nueva, Inicio) y
--      `fn_envio_detalle` (REEMPLAZO ANCLADO), que suma `deuda_pendiente` por línea y `deudas_del_proveedor` en el envío para que la
--      pantalla ofrezca la causa solo cuando aplica. Las piden Proveedores o la plata de Compras (`fn_ve_plata_de_proveedores`, decisión
--      44), Órdenes de compra o Recibir.
--   5. `resolver_deuda_proveedor(...)`: «Llegó la reposición» a mano, con nota, con el módulo Proveedores o Recibir; firma el responsable
--      (`fn_actor_persona_id(true)`, el combo); idempotente por token. `saldo_a_favor` y `deposito` responden «Todavía no».
--
-- POR DEFECTO [provisional, lo revisa Felipe]:
--   · El monto de una deuda es lo pendiente × el costo con que se recibió la línea (sin IGV). Si el papel de esa línea es una factura con
--     IGV, `con_igv` y `monto_pendiente_con_igv` (con la tasa vigente a la fecha del papel) lo dicen al lado: es lo que de verdad se pagó.
--   · La reposición solo salda deudas de envíos ANTERIORES de ese proveedor, de la misma categoría y marca, la más antigua primero (por
--     cuándo se anotó el faltante; a igual fecha, el envío de menor número). Lo que pase de lo debido se rechaza: es un sobrante con otra
--     causa (en una línea, lo que no es reposición va como «algo que no estaba en la guía»).
--   · La reposición entra al costo de su línea (o al que se escribió para lo que no estaba en la guía), como todo lo recibido.
--   · «Llegó la reposición» a mano no mueve stock: si llegó en una recepción sin marcarla, ya entró ahí; si llegó de otra forma, entra
--     por «Llegó mercadería». Pide una nota (hasta 300 letras).
--   · Las cerradas que se muestran son las saldadas en los últimos 90 días; las abiertas van de la más antigua a la más nueva.
--   · Firma con el combo «Responsable», sin clave en `acciones_sin_responsable` (como Recibir).
--   · La Actividad de «Llegó la reposición» a mano va en Proveedores, donde vive el botón (para quien solo tiene Recibir, en Recibir),
--     sin montos. Proveedores anota Actividad desde aquí: la web lo suma a `ANOTAN` (`lib/actividad-reglas.ts`, que lo vigila). La que
--     llega en una recepción ya queda en la de «recibió ENV-…».
--
-- DESCARTÉ:
--   · Una tabla `deudas`: la deuda ya existe (la diferencia «no_vino»); otra tabla repetiría la cantidad y podría descuadrarse.
--   · Guardar `pendiente` o `estado` en una columna: se deriva de las resoluciones, como `stock` de `movimientos`.
--   · Saldar con la reposición una deuda de la MISMA recepción: dentro de un envío, lo que falta en una línea y sobra en otra es un cruce
--     de líneas, no una reposición (decisión 14: «se cuenta en la próxima recepción de ese proveedor»).
--   · Partir lo de más de una línea en dos causas: la fase 4 guarda UNA diferencia por línea (índice único); lo de más que no es
--     reposición va como «algo que no estaba en la guía», con su causa.
--   · `saldo_a_favor` y `deposito` en esta fase: tocan Por pagar, el libro de saldo a favor y el IGV (fase 5b, preguntas del contrato).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013002000 (sus anclas son las que esa deja). Una tabla
-- NUEVA sin políticas (RLS encendido: solo se lee y escribe por funciones `security definer`); el candado de causas de
-- `despacho_diferencias` (tabla de la fase 4, vacía en producción) se cambia solo si todavía no tiene `reposicion_faltante`; un disparador
-- diferido nuevo sobre esa tabla (`create constraint trigger`, guardado con «si no existe»: no admite `or replace`); sin `drop trigger`
-- ni políticas (ADR-0195) y sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si la
-- función viva cambió y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.

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

-- ---------- 1. Lo resuelto de cada deuda ----------
create table if not exists retail.proveedor_deuda_resoluciones (
  id uuid primary key default gen_random_uuid(),
  -- La deuda: un faltante «no vino» de una recepción (despacho_diferencias con tipo faltante y causa no_vino; lo exige el disparador).
  diferencia_id uuid not null references retail.despacho_diferencias (id),
  -- `repuesta`: llegó la prenda (en una recepción o a mano). `saldo_a_favor` y `deposito`: reservadas para la fase 5b (dinero).
  forma text not null,
  cantidad integer not null check (cantidad > 0),
  -- La recepción (ENV-…) donde llegó la reposición y su sobrante «reposicion_faltante» que la trajo; las dos nulas si se marcó a mano.
  despacho_id uuid references retail.despachos (id),
  sobrante_id uuid references retail.despacho_diferencias (id),
  nota text,
  -- Doble clic o reintento sin red al marcarla a mano: el mismo token con la misma huella devuelve lo que ya se guardó.
  token_cliente uuid,
  huella text,
  creado_por uuid not null references public.personas (id),
  creado_en timestamptz not null default now(),
  constraint proveedor_deuda_resoluciones_forma check (forma in ('repuesta', 'saldo_a_favor', 'deposito')),
  constraint proveedor_deuda_resoluciones_nota check (nota is null or (btrim(nota) <> '' and length(nota) <= 300)),
  constraint proveedor_deuda_resoluciones_recepcion check (
    (despacho_id is null) = (sobrante_id is null) and (despacho_id is null or forma = 'repuesta')),
  constraint proveedor_deuda_resoluciones_token_key unique (token_cliente)
);
create index if not exists proveedor_deuda_resoluciones_diferencia_idx on retail.proveedor_deuda_resoluciones (diferencia_id);
create index if not exists proveedor_deuda_resoluciones_sobrante_idx on retail.proveedor_deuda_resoluciones (sobrante_id)
  where sobrante_id is not null;
create index if not exists proveedor_deuda_resoluciones_despacho_idx on retail.proveedor_deuda_resoluciones (despacho_id)
  where despacho_id is not null;
comment on table retail.proveedor_deuda_resoluciones is
  'ADR-0362 (fase 5): lo resuelto de cada deuda de un proveedor (un faltante «no vino» de despacho_diferencias): cuántas, de qué forma '
  '(repuesta; saldo_a_favor y deposito, fase 5b), en qué recepción llegó la reposición, quién y cuándo. Lo pendiente = cantidad − lo '
  'resuelto (se calcula). Solo se agregan filas; lo resuelto nunca pasa de lo debido (disparador con for update sobre la deuda). Solo '
  'se lee y escribe por funciones (RLS sin políticas).';

alter table retail.proveedor_deuda_resoluciones enable row level security;
revoke all on table retail.proveedor_deuda_resoluciones from anon, authenticated;

-- Solo se agregan filas; lo resuelto de una deuda nunca pasa de su cantidad; solo es deuda un faltante «no vino»; y una reposición que
-- llegó en una recepción es de ESA recepción (no la del faltante), del mismo proveedor, categoría y marca, y no reparte más de lo que trajo.
create or replace function retail.fn_proveedor_deuda_resoluciones_candado()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_deuda record;
  v_sobrante record;
  v_resuelto integer;
  v_repartido integer;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Lo resuelto de una deuda no se cambia ni se borra: queda como se marcó'
      using errcode = '42501', hint = 'nos_debe_inmutable';
  end if;
  -- La deuda se bloquea: dos personas (o una recepción y una persona) resolviéndola a la vez se ponen en fila, y la segunda ve lo que
  -- dejó la primera.
  select x.id, x.despacho_id, x.proveedor_id, x.categoria_id, x.marca_id, x.tipo, x.causa, x.cantidad
    into v_deuda
    from retail.despacho_diferencias x
   where x.id = new.diferencia_id
     for update;
  if not found then
    raise exception 'Esa deuda no existe: recarga la pantalla' using errcode = '23503', hint = 'nos_debe_no_existe';
  end if;
  if v_deuda.tipo <> 'faltante' or v_deuda.causa <> 'no_vino' then
    raise exception 'Eso no es una deuda del proveedor: solo lo que «no vino» se repone'
      using errcode = '23514', hint = 'nos_debe_no_es_deuda';
  end if;
  v_resuelto := coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = new.diferencia_id), 0);
  if v_resuelto + new.cantidad > v_deuda.cantidad then
    raise exception 'De esta deuda % por reponer: no se puede marcar %',
      case when v_deuda.cantidad - v_resuelto = 1 then 'queda 1' else 'quedan ' || (v_deuda.cantidad - v_resuelto) end, new.cantidad
      using errcode = '23514', hint = 'nos_debe_pasa_de_lo_debido';
  end if;
  if new.sobrante_id is not null then
    select x.id, x.despacho_id, x.proveedor_id, x.categoria_id, x.marca_id, x.tipo, x.causa, x.cantidad
      into v_sobrante
      from retail.despacho_diferencias x
     where x.id = new.sobrante_id
       for update;
    if not found or v_sobrante.tipo <> 'sobrante' or v_sobrante.causa <> 'reposicion_faltante'
       or v_sobrante.despacho_id is distinct from new.despacho_id or v_sobrante.despacho_id = v_deuda.despacho_id
       or v_sobrante.proveedor_id <> v_deuda.proveedor_id or v_sobrante.categoria_id <> v_deuda.categoria_id
       or v_sobrante.marca_id <> v_deuda.marca_id then
      raise exception 'Esa reposición no corresponde a esta deuda: es de otra recepción, otro proveedor, otra categoría u otra marca'
        using errcode = '23514', hint = 'nos_debe_reposicion_ajena';
    end if;
    v_repartido := coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.sobrante_id = new.sobrante_id), 0);
    if v_repartido + new.cantidad > v_sobrante.cantidad then
      raise exception 'La reposición trajo % y ya se repartieron %: no alcanza para %', v_sobrante.cantidad, v_repartido, new.cantidad
        using errcode = '23514', hint = 'nos_debe_reposicion_descuadrada';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_proveedor_deuda_resoluciones_candado() from public, anon, authenticated;
create or replace trigger proveedor_deuda_resoluciones_candado
  before insert or update or delete on retail.proveedor_deuda_resoluciones
  for each row execute function retail.fn_proveedor_deuda_resoluciones_candado();

-- ---------- 2. «Es la reposición de lo que faltó»: la causa de sobrante nueva ----------
-- La tabla es de la fase 4 y en producción está vacía; el candado se cambia solo si todavía no tiene la causa (re-pegar no toca nada).
do $do$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'retail.despacho_diferencias'::regclass and c.conname = 'despacho_diferencias_causa'
                    and pg_get_constraintdef(c.oid) like '%reposicion_faltante%') then
    alter table retail.despacho_diferencias drop constraint if exists despacho_diferencias_causa;
    alter table retail.despacho_diferencias add constraint despacho_diferencias_causa check (
      (tipo = 'faltante' and causa in ('no_vino', 'se_perdio', 'otra_sede'))
      or (tipo = 'sobrante' and causa in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante')));
  end if;
end;
$do$;
comment on table retail.despacho_diferencias is
  'ADR-0362 (fases 4 y 5): lo que faltó o sobró al recibir un envío, con su causa (faltante: no_vino, se_perdio, otra_sede; sobrante: '
  'regalo, cobra_aparte, proxima_compra, reposicion_faltante). Un faltante no_vino es una deuda del proveedor: lo resuelto va en '
  'proveedor_deuda_resoluciones. Solo se agrega, mientras el envío está abierto. Solo se lee y escribe por funciones (RLS sin políticas).';

-- Lo que llegó como reposición se reparte ENTERO entre las deudas que salda (al confirmar la transacción: recibir_despacho escribe el
-- sobrante y después sus resoluciones). Una reposición a medio repartir sería stock que dice saldar una deuda que sigue abierta.
create or replace function retail.fn_reposicion_repartida()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_repartido integer;
begin
  v_repartido := coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.sobrante_id = new.id), 0);
  if v_repartido <> new.cantidad then
    raise exception 'Lo que llegó como reposición (%) tiene que saldar exactamente lo que el proveedor debía (salda %)',
      new.cantidad, v_repartido using errcode = '23514', hint = 'nos_debe_reposicion_descuadrada';
  end if;
  return null;
end;
$$;
revoke all on function retail.fn_reposicion_repartida() from public, anon, authenticated;
do $do$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_diferencias'::regclass and t.tgname = 'despacho_diferencias_reposicion_repartida') then
    create constraint trigger despacho_diferencias_reposicion_repartida
      after insert on retail.despacho_diferencias
      deferrable initially deferred
      for each row when (new.causa = 'reposicion_faltante')
      execute function retail.fn_reposicion_repartida();
  end if;
end;
$do$;

-- ---------- 3. Piezas internas de las lecturas ----------
-- La tasa del IGV a la fecha del papel; si no hay una vigente, nada (la lectura no se cae: el monto con IGV queda sin dato).
create or replace function retail.fn_nos_debe_tasa_igv(p_fecha date)
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  return retail.fn_tasa_igv(coalesce(p_fecha, retail.fn_hoy_lima()));
exception when others then
  return null;
end;
$$;
comment on function retail.fn_nos_debe_tasa_igv(date) is
  'ADR-0362 (fase 5): la tasa del IGV a una fecha (fn_tasa_igv) o NULL si no hay una vigente. Interna.';
revoke all on function retail.fn_nos_debe_tasa_igv(date) from public, anon, authenticated;

-- Lo que un proveedor todavía debe de una categoría y marca (unidades), sin contar las deudas de un envío (el que se está recibiendo:
-- la reposición salda envíos anteriores).
create or replace function retail.fn_nos_debe_pendiente(p_proveedor_id uuid, p_categoria_id uuid, p_marca_id uuid,
                                                        p_excepto_despacho_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(sum(x.cantidad - s.resuelto), 0)::integer
    from retail.despacho_diferencias x
   cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                         from retail.proveedor_deuda_resoluciones r
                        where r.diferencia_id = x.id) s
   where x.tipo = 'faltante' and x.causa = 'no_vino'
     and x.proveedor_id = p_proveedor_id and x.categoria_id = p_categoria_id and x.marca_id = p_marca_id
     and x.despacho_id is distinct from p_excepto_despacho_id;
$$;
comment on function retail.fn_nos_debe_pendiente(uuid, uuid, uuid, uuid) is
  'ADR-0362 (fase 5): las unidades que un proveedor todavía debe de una categoría y marca, sin las deudas de un envío. Interna.';
revoke all on function retail.fn_nos_debe_pendiente(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Lo que deben los proveedores de un envío, por categoría y marca (por envíos anteriores): para ofrecer «Es la reposición de lo que
-- faltó» en una línea con de más y en lo que no estaba en la guía. `costo_unitario`: el de la deuda más antigua (la que se salda primero).
create or replace function retail.fn_nos_debe_del_envio(p_despacho_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'proveedor_id', q.proveedor_id,
           'categoria_id', q.categoria_id,
           'marca_id', q.marca_id,
           'pendiente', q.pendiente,
           'costo_unitario', q.costo_unitario
         ) order by pr.nombre, c.nombre, m.nombre), '[]'::jsonb)
    from (
      select x.proveedor_id, x.categoria_id, x.marca_id,
             sum(x.cantidad - s.resuelto)::integer as pendiente,
             (array_agg(x.costo_unitario order by x.creado_en, d.numero, x.id))[1] as costo_unitario
        from retail.despacho_diferencias x
        join retail.despachos d on d.id = x.despacho_id
       cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                             from retail.proveedor_deuda_resoluciones r
                            where r.diferencia_id = x.id) s
       where x.tipo = 'faltante' and x.causa = 'no_vino'
         and x.cantidad > s.resuelto
         and x.despacho_id <> p_despacho_id
         and x.proveedor_id in (select o.proveedor_id
                                  from retail.despacho_items di
                                  join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                  join retail.ordenes_compra o on o.id = i.orden_compra_id
                                 where di.despacho_id = p_despacho_id)
       group by x.proveedor_id, x.categoria_id, x.marca_id
    ) q
    join retail.proveedores pr on pr.id = q.proveedor_id
    join retail.categorias c on c.id = q.categoria_id
    join retail.marcas m on m.id = q.marca_id;
$$;
comment on function retail.fn_nos_debe_del_envio(uuid) is
  'ADR-0362 (fase 5): lo que deben los proveedores de un envío por envíos anteriores: [{proveedor_id, categoria_id, marca_id, '
  'pendiente, costo_unitario}]. Interna (la lee fn_envio_detalle).';
revoke all on function retail.fn_nos_debe_del_envio(uuid) from public, anon, authenticated;

-- Una deuda por dentro (abierta o saldada): de dónde salió, cuánto queda, cuánto vale y cómo se fue resolviendo. NULL si no es deuda.
create or replace function retail.fn_nos_debe_deuda(p_diferencia_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'diferencia_id', x.id,
           'despacho_id', x.despacho_id,
           'envio', retail.fn_envio_numero_texto(d.numero),
           'sede', jsonb_build_object('id', u.id, 'nombre', u.nombre),
           'fecha', x.creado_en,
           'orden', jsonb_build_object('id', o.id, 'numero', retail.fn_orden_compra_numero_texto(o.numero)),
           'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
           'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),
           'marca', jsonb_build_object('id', m.id, 'nombre', m.nombre),
           'descripcion', di.descripcion,
           'cantidad', x.cantidad,
           'resuelto', s.resuelto,
           'pendiente', x.cantidad - s.resuelto,
           'estado', case when x.cantidad > s.resuelto then 'por_reponer' else 'saldada' end,
           'saldada_en', case when x.cantidad <= s.resuelto then s.ultima end,
           'costo_unitario', x.costo_unitario,
           'monto', round(x.cantidad * x.costo_unitario, 2),
           -- [provisional] Sin IGV: el costo con que se recibió la línea. Si su papel es una factura con IGV, lo pagado de verdad lleva
           -- la tasa vigente a la fecha del papel, y se dice al lado.
           'monto_pendiente', round((x.cantidad - s.resuelto) * x.costo_unitario, 2),
           'con_igv', coalesce(pa.con_igv, false),
           'monto_pendiente_con_igv', case when pa.con_igv then
             round((x.cantidad - s.resuelto) * x.costo_unitario * (1 + retail.fn_nos_debe_tasa_igv(pa.fecha_emision)), 2) end,
           'papel', case when pa.id is not null then
             jsonb_build_object('compra_id', pa.id, 'tipo', pa.tipo, 'serie', pa.serie, 'numero', pa.numero) end,
           'nota', x.nota,
           'anotado_por', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
           'resoluciones', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', r.id,
                      'forma', r.forma,
                      'cantidad', r.cantidad,
                      'despacho_id', r.despacho_id,
                      'envio', retail.fn_envio_numero_texto(rd.numero),
                      'nota', r.nota,
                      'creado_por', nullif(btrim(concat_ws(' ', rp.nombres, rp.apellidos)), ''),
                      'creado_en', r.creado_en
                    ) order by r.creado_en, r.id)
               from retail.proveedor_deuda_resoluciones r
               left join retail.despachos rd on rd.id = r.despacho_id
               left join public.personas rp on rp.id = r.creado_por
              where r.diferencia_id = x.id
           ), '[]'::jsonb)
         )
    from retail.despacho_diferencias x
    join retail.despachos d on d.id = x.despacho_id
    join retail.ubicaciones u on u.id = d.ubicacion_destino_id
    join retail.despacho_items di on di.id = x.despacho_item_id
    join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    join retail.ordenes_compra o on o.id = i.orden_compra_id
    join retail.proveedores pr on pr.id = x.proveedor_id
    join retail.categorias c on c.id = x.categoria_id
    join retail.marcas m on m.id = x.marca_id
    left join public.personas pe on pe.id = x.creado_por
   cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto, max(r.creado_en) as ultima
                         from retail.proveedor_deuda_resoluciones r
                        where r.diferencia_id = x.id) s
    -- El papel de la línea: el comprobante vigente que nombra el envío; si no, el más reciente de esa línea pedida.
    left join lateral (
      select cp.id, cp.tipo, cp.serie, cp.numero, cp.fecha_emision, (cp.tipo = 'factura' and coalesce(cp.igv, 0) > 0) as con_igv
        from retail.compra_items ci
        join retail.compras cp on cp.id = ci.compra_id and cp.estado = 'vigente'
       where ci.orden_compra_item_id = di.orden_compra_item_id
       order by (ci.id = di.compra_item_id) desc nulls last, cp.created_at desc, ci.id
       limit 1
    ) pa on true
   where x.id = p_diferencia_id
     and x.tipo = 'faltante' and x.causa = 'no_vino';
$$;
comment on function retail.fn_nos_debe_deuda(uuid) is
  'ADR-0362 (fase 5): una deuda de proveedor (faltante no_vino) con su envío, sede, orden, categoría, marca, cantidad, resuelto, '
  'pendiente, estado, costo y montos (con IGV al lado si el papel es factura con IGV) y sus resoluciones. NULL si no es deuda. Interna.';
revoke all on function retail.fn_nos_debe_deuda(uuid) from public, anon, authenticated;

-- ---------- 4. Lecturas para la pantalla ----------
-- 4a. La ficha del proveedor: lo que debe hoy y lo que saldó en los últimos 90 días.
create or replace function retail.fn_proveedor_nos_debe(p_proveedor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_resultado jsonb;
begin
  if not (retail.fn_ve_plata_de_proveedores() or retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('recibir')) then
    raise exception 'Ver lo que te debe un proveedor necesita el módulo «Proveedores», la plata de Compras, «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'nos_debe_sin_modulo';
  end if;

  with deudas as (
    select x.id, x.creado_en, d.numero, x.cantidad - s.resuelto as pendiente, s.ultima, retail.fn_nos_debe_deuda(x.id) as j
      from retail.despacho_diferencias x
      join retail.despachos d on d.id = x.despacho_id
     cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto, max(r.creado_en) as ultima
                           from retail.proveedor_deuda_resoluciones r
                          where r.diferencia_id = x.id) s
     where x.proveedor_id = p_proveedor_id
       and x.tipo = 'faltante' and x.causa = 'no_vino'
       and (x.cantidad > s.resuelto or s.ultima >= now() - interval '90 days')
  )
  select jsonb_build_object(
           'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
           'deudas', (select count(*) from deudas where pendiente > 0)::integer,
           'unidades', coalesce((select sum(pendiente) from deudas where pendiente > 0), 0)::integer,
           'monto', coalesce((select sum((j ->> 'monto_pendiente')::numeric) from deudas where pendiente > 0), 0),
           'monto_con_igv', coalesce((select sum(coalesce((j ->> 'monto_pendiente_con_igv')::numeric, (j ->> 'monto_pendiente')::numeric))
                                        from deudas where pendiente > 0), 0),
           'abiertas', coalesce((select jsonb_agg(j order by creado_en, numero, id) from deudas where pendiente > 0), '[]'::jsonb),
           'cerradas', coalesce((select jsonb_agg(j order by ultima desc, id) from deudas where pendiente = 0), '[]'::jsonb)
         )
    into v_resultado
    from retail.proveedores pr
   where pr.id = p_proveedor_id;

  return v_resultado;
end;
$$;
comment on function retail.fn_proveedor_nos_debe(uuid) is
  'ADR-0362 (fase 5): lo que un proveedor le debe a CAYLA por faltantes «no vino»: {proveedor, deudas, unidades, monto, monto_con_igv, '
  'abiertas (de la más antigua a la más nueva), cerradas (saldadas en los últimos 90 días)}; cada deuda como fn_nos_debe_deuda. NULL si '
  'el proveedor no existe. Proveedores o la plata de Compras (fn_ve_plata_de_proveedores), Órdenes de compra o Recibir.';
revoke all on function retail.fn_proveedor_nos_debe(uuid) from public, anon;
grant execute on function retail.fn_proveedor_nos_debe(uuid) to authenticated, service_role;

-- 4b. Por proveedor, lo que debe hoy: la lista de proveedores, el aviso de la orden nueva («te debe 2 polos (S/ 50)») e Inicio.
create or replace function retail.fn_nos_debe_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not (retail.fn_ve_plata_de_proveedores() or retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('recibir')) then
    raise exception 'Ver lo que te deben los proveedores necesita el módulo «Proveedores», la plata de Compras, «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'nos_debe_sin_modulo';
  end if;

  return coalesce((
    with abiertas as (
      select x.proveedor_id, x.categoria_id, x.marca_id, retail.fn_nos_debe_deuda(x.id) as j
        from retail.despacho_diferencias x
       cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                             from retail.proveedor_deuda_resoluciones r
                            where r.diferencia_id = x.id) s
       where x.tipo = 'faltante' and x.causa = 'no_vino'
         and x.cantidad > s.resuelto
    )
    select jsonb_agg(jsonb_build_object(
             'proveedor_id', p.proveedor_id,
             'proveedor', pr.nombre,
             'deudas', p.deudas,
             'unidades', p.unidades,
             'monto', p.monto,
             'monto_con_igv', p.monto_con_igv,
             'detalle', (
               select jsonb_agg(jsonb_build_object(
                        'categoria_id', g.categoria_id, 'categoria', c.nombre,
                        'marca_id', g.marca_id, 'marca', m.nombre,
                        'unidades', g.unidades, 'monto', g.monto
                      ) order by g.unidades desc, c.nombre, m.nombre)
                 from (select a.categoria_id, a.marca_id,
                              sum((a.j ->> 'pendiente')::integer)::integer as unidades,
                              sum((a.j ->> 'monto_pendiente')::numeric) as monto
                         from abiertas a
                        where a.proveedor_id = p.proveedor_id
                        group by a.categoria_id, a.marca_id) g
                 join retail.categorias c on c.id = g.categoria_id
                 join retail.marcas m on m.id = g.marca_id)
           ) order by pr.nombre, p.proveedor_id)
      from (select a.proveedor_id,
                   count(*)::integer as deudas,
                   sum((a.j ->> 'pendiente')::integer)::integer as unidades,
                   sum((a.j ->> 'monto_pendiente')::numeric) as monto,
                   sum(coalesce((a.j ->> 'monto_pendiente_con_igv')::numeric, (a.j ->> 'monto_pendiente')::numeric)) as monto_con_igv
              from abiertas a
             group by a.proveedor_id) p
      join retail.proveedores pr on pr.id = p.proveedor_id
  ), '[]'::jsonb);
end;
$$;
comment on function retail.fn_nos_debe_resumen() is
  'ADR-0362 (fase 5): por proveedor que debe algo: [{proveedor_id, proveedor, deudas, unidades, monto, monto_con_igv, detalle: '
  '[{categoria_id, categoria, marca_id, marca, unidades, monto}]}] (monto sin IGV; monto_con_igv con su IGV donde el papel fue factura '
  'con IGV). Proveedores o la plata de Compras (fn_ve_plata_de_proveedores), Órdenes de compra o Recibir.';
revoke all on function retail.fn_nos_debe_resumen() from public, anon;
grant execute on function retail.fn_nos_debe_resumen() to authenticated, service_role;

-- ---------- 5. «Llegó la reposición» a mano ----------
-- Cuando la reposición llegó pero se recibió sin marcarla, o el proveedor la entregó de otra forma. No mueve stock (ver «Por defecto»).
create or replace function retail.resolver_deuda_proveedor(
  p_diferencia_id uuid,
  p_forma text,
  p_cantidad integer,
  p_nota text,
  p_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_forma text := lower(nullif(btrim(coalesce(p_forma, '')), ''));
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_huella text;
  v_deuda record;
  v_existente record;
  v_actor uuid;
  v_pendiente integer;
  v_id uuid;
  v_restriccion text;
  v_desc text;
  v_detalle jsonb;
begin
  if retail.fn_ve_modulo('proveedores') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Marcar lo que repuso un proveedor necesita el módulo «Proveedores» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'nos_debe_sin_modulo';
  end if;
  -- Fase 5b: pasar a saldo a favor o marcar que depositó mueve plata, toca Por pagar y el IGV. Espera a Felipe y al contador.
  if v_forma in ('saldo_a_favor', 'deposito') then
    raise exception 'Todavía no: lo decide Felipe con el contador' using hint = 'nos_debe_todavia_no';
  end if;
  if v_forma is distinct from 'repuesta' then
    raise exception 'No se entiende cómo se resolvió la deuda: elige «Llegó la reposición»' using hint = 'nos_debe_forma';
  end if;

  -- La deuda se bloquea ANTES de mirar el token: un doble clic con el mismo token se pone en fila y el segundo devuelve lo del primero;
  -- dos personas marcando la misma deuda a la vez, también, y la segunda ve lo que ya quedó.
  select x.id, x.despacho_id, x.proveedor_id, x.tipo, x.causa, x.cantidad, d.numero as envio_numero, d.ubicacion_destino_id,
         pr.nombre as proveedor, concat_ws(' · ', c.nombre, m.nombre) as que
    into v_deuda
    from retail.despacho_diferencias x
    join retail.despachos d on d.id = x.despacho_id
    join retail.proveedores pr on pr.id = x.proveedor_id
    join retail.categorias c on c.id = x.categoria_id
    join retail.marcas m on m.id = x.marca_id
   where x.id = p_diferencia_id
     for update of x;
  if not found then
    raise exception 'Esa deuda no existe: recarga la pantalla' using hint = 'nos_debe_no_existe';
  end if;
  if v_deuda.tipo <> 'faltante' or v_deuda.causa <> 'no_vino' then
    raise exception 'Eso no es una deuda del proveedor: solo lo que «no vino» se repone' using hint = 'nos_debe_no_es_deuda';
  end if;

  -- Doble clic o reintento sin red: lo mismo ya se guardó y se devuelve, aunque quien lo hizo ya no esté de turno (comprobar algo
  -- guardado no escribe nada). El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('diferencia_id', p_diferencia_id, 'forma', v_forma, 'cantidad', p_cantidad, 'nota', v_nota)::text);
  if p_token is not null then
    for v_existente in select r.id, r.huella from retail.proveedor_deuda_resoluciones r where r.token_cliente = p_token loop
      if v_existente.huella = v_huella then
        return jsonb_build_object('resolucion_id', v_existente.id, 'deuda', retail.fn_nos_debe_deuda(p_diferencia_id));
      end if;
      raise exception 'Esa reposición ya se guardó con otros datos: recarga la pantalla' using hint = 'nos_debe_otros_datos';
    end loop;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'Escribe cuántas llegaron: desde 1' using hint = 'nos_debe_cantidad';
  end if;
  if v_nota is null then
    raise exception 'Escribe una nota: cómo llegó la reposición' using hint = 'nos_debe_nota';
  end if;
  if length(v_nota) > 300 then
    raise exception 'La nota es muy larga: hasta 300 letras' using hint = 'nos_debe_nota';
  end if;
  v_pendiente := v_deuda.cantidad
    - coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = p_diferencia_id), 0)::integer;
  if v_pendiente <= 0 then
    raise exception 'Esta deuda ya está saldada: no queda nada por reponer' using hint = 'nos_debe_saldada';
  end if;
  if p_cantidad > v_pendiente then
    raise exception 'De esta deuda % por reponer: no puedes marcar %',
      case when v_pendiente = 1 then 'queda 1' else 'quedan ' || v_pendiente end, p_cantidad
      using hint = 'nos_debe_pasa_de_lo_debido';
  end if;

  begin
    insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, token_cliente, huella, creado_por)
    values (p_diferencia_id, 'repuesta', p_cantidad, v_nota, p_token, v_huella, v_actor)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'proveedor_deuda_resoluciones_token_key' then
      for v_existente in select r.id, r.huella, r.diferencia_id from retail.proveedor_deuda_resoluciones r where r.token_cliente = p_token loop
        if v_existente.huella = v_huella then
          return jsonb_build_object('resolucion_id', v_existente.id, 'deuda', retail.fn_nos_debe_deuda(v_existente.diferencia_id));
        end if;
      end loop;
      raise exception 'Esa reposición ya se guardó con otros datos: recarga la pantalla' using hint = 'nos_debe_otros_datos';
    end if;
    raise;
  end;

  -- Actividad (ADR-0207), sin montos: «marcó que Textiles Andina repuso 2 de Polos · CAYLA (faltaron en la ENV-000061)». Va en el
  -- módulo donde vive el botón: Proveedores (la ficha del proveedor); quien solo tiene Recibir, en Recibir. Dos llamadas con el módulo
  -- escrito: así `actividad-reglas.test.ts` ve en qué módulos anota la base. Si falla, igual queda.
  begin
    v_desc := 'marcó que ' || v_deuda.proveedor || ' repuso ' || p_cantidad || ' de ' || v_deuda.que || ' (faltaron en la '
      || retail.fn_envio_numero_texto(v_deuda.envio_numero) || ')';
    v_detalle := jsonb_build_object('diferencia_id', p_diferencia_id, 'despacho_id', v_deuda.despacho_id,
                                    'envio', retail.fn_envio_numero_texto(v_deuda.envio_numero), 'proveedor_id', v_deuda.proveedor_id,
                                    'forma', 'repuesta', 'cantidad', p_cantidad);
    if retail.fn_ve_modulo('proveedores') then
      perform retail.fn_actividad_anotar('proveedores', 'deuda_repuesta', v_desc, v_actor, retail.fn_actividad_terminal_ahora(),
                                         v_deuda.ubicacion_destino_id, null, 'proveedor_deuda_resoluciones', v_id::text, now(),
                                         v_detalle, 'vivo');
    else
      perform retail.fn_actividad_anotar('recibir', 'deuda_repuesta', v_desc, v_actor, retail.fn_actividad_terminal_ahora(),
                                         v_deuda.ubicacion_destino_id, null, 'proveedor_deuda_resoluciones', v_id::text, now(),
                                         v_detalle, 'vivo');
    end if;
  exception when others then
    raise warning 'actividad: no se anotó la reposición de la deuda % (%)', p_diferencia_id, sqlerrm;
  end;

  return jsonb_build_object('resolucion_id', v_id, 'deuda', retail.fn_nos_debe_deuda(p_diferencia_id));
end;
$$;
comment on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) is
  'ADR-0362 (fase 5): «Llegó la reposición» a mano: marca como repuestas p_cantidad unidades de una deuda (faltante no_vino), con nota '
  'obligatoria (hasta 300). No mueve stock. p_forma = repuesta; saldo_a_favor y deposito: «Todavía no» (hint nos_debe_todavia_no, fase '
  '5b). Módulo Proveedores o Recibir; firma el responsable (fn_actor_persona_id(true)). Idempotente por token + huella. Devuelve '
  '{resolucion_id, deuda} (deuda como fn_nos_debe_deuda).';
revoke all on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) from public, anon;
grant execute on function retail.resolver_deuda_proveedor(uuid, text, integer, text, uuid) to authenticated, service_role;

-- ---------- 6. «Llegó la reposición» en la recepción: recibir_despacho (reemplazos anclados sobre su definición viva) ----------
-- 6a. La causa nueva vale en una línea con más de lo enviado y en lo que no estaba en la guía (las dos validaciones de la fase 4).
select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra')$v$,
  $v$v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante')$v$,
  2);

-- 6b. Antes del papel y del stock: lo marcado como reposición cabe en lo que ese proveedor debe, y sus deudas quedan bloqueadas.
select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$  v_variantes := array(select distinct (v ->> 'variante_id')::uuid$v$,
  $v$  -- ---- ADR-0362 (fase 5, decisión 14): «Es la reposición de lo que faltó». Lo de más marcado así salda lo que ese proveedor debe
  -- de esa categoría y marca por envíos ANTERIORES (no por este). Sus deudas se bloquean aquí (en orden de id), antes que el papel y el
  -- stock: dos recepciones del mismo proveedor, o una reposición marcada a mano, se ponen en fila y la segunda ve lo que la primera ya
  -- saldó. Lo que pase de lo debido no es reposición: es un sobrante con otra causa. El reparto se escribe al final. ----
  declare
    v_rep record;
  begin
    perform 1
       from retail.despacho_diferencias x
      where x.tipo = 'faltante' and x.causa = 'no_vino' and x.despacho_id <> p_despacho_id
        and (x.proveedor_id, x.categoria_id, x.marca_id) in (
              select (u ->> 'proveedor_id')::uuid, (u ->> 'categoria_id')::uuid, (u ->> 'marca_id')::uuid
                from jsonb_array_elements(v_unidades) u
               where u ->> 'sobrante_causa' = 'reposicion_faltante')
      order by x.id
        for update;
    for v_rep in
      select g.repuesto, pr.nombre as proveedor, concat_ws(' · ', c.nombre, m.nombre) as que,
             retail.fn_nos_debe_pendiente(g.proveedor_id, g.categoria_id, g.marca_id, p_despacho_id) as debe
        from (select (u ->> 'proveedor_id')::uuid as proveedor_id, (u ->> 'categoria_id')::uuid as categoria_id,
                     (u ->> 'marca_id')::uuid as marca_id,
                     sum((u ->> 'contado')::integer - (u ->> 'enviado')::integer)::integer as repuesto
                from jsonb_array_elements(v_unidades) u
               where u ->> 'sobrante_causa' = 'reposicion_faltante'
               group by 1, 2, 3) g
        join retail.proveedores pr on pr.id = g.proveedor_id
        join retail.categorias c on c.id = g.categoria_id
        join retail.marcas m on m.id = g.marca_id
       order by pr.nombre, c.nombre, m.nombre
    loop
      if v_rep.debe = 0 then
        raise exception '% no debe nada de %: elige otra causa para lo de más', v_rep.proveedor, v_rep.que
          using hint = 'recepcion_reposicion_sin_deuda';
      end if;
      if v_rep.repuesto > v_rep.debe then
        raise exception 'Marcaste % como reposición de %, pero % solo debe %: lo que pase de eso es un sobrante con otra causa',
          v_rep.repuesto, v_rep.que, v_rep.proveedor, v_rep.debe using hint = 'recepcion_reposicion_de_mas';
      end if;
    end loop;
  end;

  v_variantes := array(select distinct (v ->> 'variante_id')::uuid$v$,
  1);

-- 6c. Al final, con las diferencias ya escritas: cada reposición salda las deudas de su proveedor, categoría y marca, de la más antigua
-- a la más nueva, con el envío de esta recepción.
select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$  update retail.despachos d
     set estado = 'cerrado',$v$,
  $v$  -- ---- ADR-0362 (fase 5, decisión 14): lo de más marcado como reposición salda las deudas de ese proveedor, de esa categoría y
  -- marca, de la más antigua a la más nueva (por cuándo se anotó el faltante; a igual fecha, el envío de menor número), con el envío de
  -- esta recepción y su sobrante. Las deudas ya están bloqueadas y lo marcado cabe en lo debido (arriba). ----
  declare
    v_sob record;
    v_deu record;
    v_resto integer;
    v_toma integer;
  begin
    for v_sob in
      select x.id, x.proveedor_id, x.categoria_id, x.marca_id, x.cantidad
        from retail.despacho_diferencias x
        left join retail.despacho_items xd on xd.id = x.despacho_item_id
        left join retail.orden_compra_items xi on xi.id = xd.orden_compra_item_id
        left join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
       where x.despacho_id = p_despacho_id and x.tipo = 'sobrante' and x.causa = 'reposicion_faltante'
       order by x.extra_posicion nulls first, xo.numero, xi.posicion
    loop
      v_resto := v_sob.cantidad;
      for v_deu in
        select x.id, x.cantidad - s.resuelto as pendiente
          from retail.despacho_diferencias x
          join retail.despachos dd on dd.id = x.despacho_id
         cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                               from retail.proveedor_deuda_resoluciones r
                              where r.diferencia_id = x.id) s
         where x.tipo = 'faltante' and x.causa = 'no_vino' and x.despacho_id <> p_despacho_id
           and x.proveedor_id = v_sob.proveedor_id and x.categoria_id = v_sob.categoria_id and x.marca_id = v_sob.marca_id
           and x.cantidad > s.resuelto
         order by x.creado_en, dd.numero, x.id
      loop
        exit when v_resto = 0;
        v_toma := least(v_resto, v_deu.pendiente);
        insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por)
        values (v_deu.id, 'repuesta', v_toma, p_despacho_id, v_sob.id, v_actor);
        v_resto := v_resto - v_toma;
      end loop;
      if v_resto > 0 then
        raise exception 'Lo marcado como reposición en % ya no cabe en lo que el proveedor debe: recarga la pantalla', v_envio
          using hint = 'recepcion_reposicion_de_mas';
      end if;
    end loop;
  end;

  update retail.despachos d
     set estado = 'cerrado',$v$,
  1);

comment on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) is
  'ADR-0362 (fases 4 y 5): cierra la recepción de un envío abierto. Por línea (todas, una vez): lo contado talla por talla (buenas al '
  'almacén, dañadas a la cuarentena con su fila en prendas_danadas), el costo corregido (promedio ponderado), lo que faltó o sobró '
  'con su causa; y lo que no estaba en la guía. Un sobrante «reposicion_faltante» (fase 5) solo vale si ese proveedor debe eso de esa categoría '
  'y marca por envíos anteriores, y salda sus deudas de la más antigua a la más nueva (proveedor_deuda_resoluciones). Un lote por '
  'proveedor; las entradas llevan la línea del papel hasta su cupo. Costo atípico: hint recepcion_costo_atipico con el detalle en '
  'JSON. Módulo Recibir, su sede y la decisión 17. Token + huella; versión vieja: PT409. Devuelve {despacho_id, numero, lotes, '
  'unidades, buenas, danadas, faltan, sobran}.';

-- ---------- 7. El detalle del envío dice cuándo ofrecer «Es la reposición de lo que faltó» (reemplazos anclados) ----------
-- 7a. Por línea: lo que su proveedor todavía debe de esa categoría y marca (por envíos anteriores).
select pg_temp.reemplazar(
  'retail.fn_envio_detalle(uuid)',
  $v$                          limit 1))
                    ) order by o.numero, i.posicion)$v$,
  $v$                          limit 1)),
                      -- ADR-0362 (fase 5): lo que el proveedor de esta línea todavía debe de esta categoría y marca por envíos
                      -- anteriores; con más de 0, la pantalla ofrece «Es la reposición de lo que faltó».
                      'deuda_pendiente', retail.fn_nos_debe_pendiente(pr.id, di.categoria_id, di.marca_id, d.id)
                    ) order by o.numero, i.posicion)$v$,
  1);

-- 7b. En el envío: lo que deben sus proveedores, por categoría y marca (para lo que no estaba en la guía).
select pg_temp.reemplazar(
  'retail.fn_envio_detalle(uuid)',
  $v$           'recepcion', case when d.estado = 'cerrado' then retail.fn_recepcion_resultado(d.id) end
         )$v$,
  $v$           'recepcion', case when d.estado = 'cerrado' then retail.fn_recepcion_resultado(d.id) end,
           -- ADR-0362 (fase 5): lo que deben los proveedores de este envío por envíos anteriores, por categoría y marca
           -- ([{proveedor_id, categoria_id, marca_id, pendiente, costo_unitario}]): para lo que no estaba en la guía.
           'deudas_del_proveedor', retail.fn_nos_debe_del_envio(d.id)
         )$v$,
  1);

comment on function retail.fn_envio_detalle(uuid) is
  'ADR-0362 (fases 3, 4 y 5): un envío con su cabecera (versión, creado_por_mi, proveedores) y sus líneas (orden {id, numero}, proveedor, '
  'categoria {id, nombre, prefijo, familia}, marca {id, nombre}, descripción, cantidad, precio congelado, precio_venta_sugerido, '
  'deuda_pendiente); deudas_del_proveedor [{proveedor_id, categoria_id, marca_id, pendiente, costo_unitario}] (fase 5: lo que deben sus '
  'proveedores por envíos anteriores); y, si está cerrado, cómo se cerró (recibidos, diferencias, recepcion). NULL si no existe. Módulo '
  'Órdenes de compra o Recibir mercadería.';

-- ---------- 8. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
  v_def text;
begin
  if to_regclass('retail.proveedor_deuda_resoluciones') is null then
    raise exception 'falta retail.proveedor_deuda_resoluciones';
  end if;
  if not coalesce((select c.relrowsecurity from pg_class c where c.oid = 'retail.proveedor_deuda_resoluciones'::regclass), false) then
    raise exception 'retail.proveedor_deuda_resoluciones tiene que tener RLS encendido';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'proveedor_deuda_resoluciones') then
    raise exception 'retail.proveedor_deuda_resoluciones no lleva políticas: solo se lee y escribe por funciones';
  end if;
  if has_table_privilege('authenticated', 'retail.proveedor_deuda_resoluciones', 'select')
     or has_table_privilege('anon', 'retail.proveedor_deuda_resoluciones', 'select') then
    raise exception 'retail.proveedor_deuda_resoluciones: ni anon ni authenticated la leen directo';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.proveedor_deuda_resoluciones'::regclass and t.tgname = 'proveedor_deuda_resoluciones_candado') then
    raise exception 'falta el disparador proveedor_deuda_resoluciones_candado';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_diferencias'::regclass and t.tgname = 'despacho_diferencias_reposicion_repartida'
                    and t.tgdeferrable and t.tginitdeferred) then
    raise exception 'falta el disparador diferido despacho_diferencias_reposicion_repartida';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'retail.despacho_diferencias'::regclass and c.conname = 'despacho_diferencias_causa'
                    and pg_get_constraintdef(c.oid) like '%reposicion_faltante%') then
    raise exception 'el candado despacho_diferencias_causa no tiene la causa reposicion_faltante';
  end if;
  foreach v_funcion in array array[
    'retail.fn_proveedor_nos_debe(uuid)',
    'retail.fn_nos_debe_resumen()',
    'retail.resolver_deuda_proveedor(uuid,text,integer,text,uuid)'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
      raise exception '% tiene que ser security definer', v_funcion;
    end if;
    if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
      raise exception '%: la ejecuta authenticated y no anon', v_funcion;
    end if;
  end loop;
  foreach v_funcion in array array[
    'retail.fn_nos_debe_deuda(uuid)', 'retail.fn_nos_debe_pendiente(uuid,uuid,uuid,uuid)', 'retail.fn_nos_debe_del_envio(uuid)',
    'retail.fn_nos_debe_tasa_igv(date)', 'retail.fn_proveedor_deuda_resoluciones_candado()', 'retail.fn_reposicion_repartida()'] loop
    if has_function_privilege('authenticated', v_funcion, 'execute') or has_function_privilege('anon', v_funcion, 'execute') then
      raise exception '% es interna: ni authenticated ni anon la ejecutan', v_funcion;
    end if;
  end loop;
  -- Ninguna sobrecarga: la web llama por nombre.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail'
                and p.proname in ('fn_proveedor_nos_debe', 'fn_nos_debe_resumen', 'resolver_deuda_proveedor', 'recibir_despacho',
                                  'fn_envio_detalle')
              group by p.proname having count(*) > 1) then
    raise exception 'una de las funciones de «Nos debe» quedó con dos versiones';
  end if;
  v_def := pg_get_functiondef('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $t$'proxima_compra', 'reposicion_faltante')$t$, ''))) / length($t$'proxima_compra', 'reposicion_faltante')$t$) <> 2
     or position('retail.fn_nos_debe_pendiente(g.proveedor_id' in v_def) = 0
     or position('insert into retail.proveedor_deuda_resoluciones' in v_def) = 0 then
    raise exception 'recibir_despacho no quedó con la reposición';
  end if;
  v_def := pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure);
  if position($t$'deuda_pendiente'$t$ in v_def) = 0 or position($t$'deudas_del_proveedor'$t$ in v_def) = 0 then
    raise exception 'fn_envio_detalle no quedó con lo que deben los proveedores';
  end if;
end;
$$;

reset lock_timeout;
