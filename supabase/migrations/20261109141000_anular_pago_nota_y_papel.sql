-- ============================================================================
-- 20261109141000 — Deshacer un pago a proveedor, una nota de crédito, un reembolso o el papel de un gasto (tarea 21 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Nada se podía corregir. Un pago con el monto mal se quedaba: ni el pago ni la factura se anulaban, y Por pagar perdía esa deuda. Una nota de crédito mal digitada bajaba
-- el crédito para siempre, y su disparador pedía «registrar un documento nuevo» que no existía. Un comprobante agregado a un gasto con el RUC equivocado no se quitaba.
--
-- LA DECISIÓN (Felipe, 2026-11-06 y 2026-11-09). Se puede anular, siempre con motivo y con su mes abierto. La fila completa se MUEVE a `documentos_anulados`, con quién, cuándo y por qué, y sale
-- de su tabla. No se marca en su lugar: unas 40 funciones leen los pagos para calcular deudas, banco y diario, y una que olvidara el filtro contaría plata anulada sin que nadie lo note. Nada se
-- pierde: la fila entera queda en el archivo.
--   · `anular_pago_compra`: la factura vuelve a deberse, el banco o el cajón dejan de mostrar esa salida y su egreso del cajón vuelve a «por clasificar». Lo pide Por pagar.
--   · `anular_nota_credito_compra`: la factura vuelve a deber lo que la nota bajaba. Lo pide Notas de crédito.
--   · `anular_reembolso_proveedor`: el saldo a favor vuelve a como estaba. Lo pide Por pagar.
--   · `quitar_comprobante_de_gasto` (lo inverso de ADR-0588): el gasto vuelve a «sin comprobante», con su pago de antes. Si el papel llegó con el mes cerrado (tarea 20), se anula en su lugar.
--
-- NO HACE: no devuelve plata a ningún banco; corrige el registro. No anula lo que tiene otra cosa encima: un pago que usó o dejó saldo a favor, una nota que dejó saldo a favor o que nació de
-- cerrar una línea, una con archivos adjuntos. Esos casos lo dicen y esperan otra decisión.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, DESPUÉS de 20261106170000. Crea una tabla con RLS y sin políticas (se lee solo por funciones). Las funciones existentes se reescriben desde la
-- definición viva; si un ancla no aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:anular-pago-nota-papel`.
--
-- SE ROMPE SI: alguien lee pagos, notas o reembolsos anulados desde sus tablas: ya no están ahí. El historial vive en `documentos_anulados`.
-- ============================================================================
set search_path = retail, public, extensions;
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ── 1. El archivo ────────────────────────────────────────────────────────────
create table if not exists retail.documentos_anulados (
  id uuid primary key default gen_random_uuid(),
  tabla text not null check (tabla in ('compra_pagos', 'compra_notas_credito', 'proveedor_creditos')),
  documento_id uuid not null,
  compra_id uuid,
  fila jsonb not null,
  motivo text not null check (length(btrim(motivo)) >= 3),
  anulado_por uuid,
  anulado_en timestamptz not null default now(),
  unique (tabla, documento_id)
);
alter table retail.documentos_anulados enable row level security;
comment on table retail.documentos_anulados is
  'Tarea 21: la fila completa de un pago, una nota o un reembolso anulado, con su motivo. Sale de su tabla para que ninguna cuenta la sume por error.';
create index if not exists documentos_anulados_compra on retail.documentos_anulados (compra_id) where compra_id is not null;

-- Las notas y los reembolsos siguen sin editarse ni borrarse a mano: solo la función que los anula, con la marca de ESE documento. Se lee el id con to_jsonb porque
-- la misma función cuida tablas sin columna id (los documentos de una nota del proveedor), que nunca se anulan.
select pg_temp.reemplazar('retail.fn_libro_compras_es_inmutable()',
$a$begin
  raise exception
    'Los cierres de línea y las notas de crédito no se editan ni se borran. '$a$,
$n$begin
  -- Tarea 21: `anular_nota_credito_compra` la mueve a `documentos_anulados`, con la marca de esa nota.
  if tg_op = 'DELETE' and coalesce(current_setting('retail.anulando_documento', true), '') = coalesce(to_jsonb(old) ->> 'id', '-') then
    return old;
  end if;
  raise exception
    'Los cierres de línea y las notas de crédito no se editan ni se borran. '$n$, 1);
select pg_temp.reemplazar('retail.fn_libro_creditos_es_inmutable()',
$a$begin
  raise exception
    'El libro del saldo a favor no se edita ni se borra. '$a$,
$n$begin
  -- Tarea 21: `anular_reembolso_proveedor` lo mueve a `documentos_anulados`, con la marca de ese movimiento.
  if tg_op = 'DELETE' and coalesce(current_setting('retail.anulando_documento', true), '') = coalesce(to_jsonb(old) ->> 'id', '-') then
    return old;
  end if;
  raise exception
    'El libro del saldo a favor no se edita ni se borra. '$n$, 1);

-- El pago: se archiva, sale y la factura vuelve a deberlo. La usan anular un pago y quitar el papel de un gasto.
create or replace function retail.fn_archivar_pago_compra(p_pago_id uuid, p_motivo text, p_actor uuid)
returns retail.compra_pagos
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
declare
  v_p retail.compra_pagos%rowtype;
begin
  select * into v_p from retail.compra_pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Ese pago no existe.' using errcode = 'P0001';
  end if;
  perform 1 from retail.compras where id = v_p.compra_id for update;
  if exists (select 1 from retail.proveedor_creditos k where k.compra_pago_id = p_pago_id) then
    raise exception 'Este pago usó o dejó saldo a favor del proveedor: no se anula desde aquí.' using errcode = 'P0001';
  end if;
  insert into retail.documentos_anulados (tabla, documento_id, compra_id, fila, motivo, anulado_por)
  values ('compra_pagos', v_p.id, v_p.compra_id, to_jsonb(v_p), btrim(p_motivo), p_actor);
  -- El candado de la tabla exige su mes abierto.
  delete from retail.compra_pagos where id = p_pago_id;
  update retail.compras set pagado = pagado - v_p.monto where id = v_p.compra_id;
  return v_p;
end $f$;
revoke all on function retail.fn_archivar_pago_compra(uuid, text, uuid) from public, anon, authenticated;

-- ── 2. Las cuatro acciones ───────────────────────────────────────────────────
create or replace function retail.anular_pago_compra(p_pago_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
declare
  v_actor uuid;
  v_p retail.compra_pagos%rowtype;
begin
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Anular un pago a un proveedor necesita el módulo Por pagar en tu rol.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué se anula el pago.' using errcode = 'P0001';
  end if;
  -- Dos toques: el segundo ve que el primero ya lo anuló.
  if not exists (select 1 from retail.compra_pagos where id = p_pago_id)
     and exists (select 1 from retail.documentos_anulados where tabla = 'compra_pagos' and documento_id = p_pago_id) then
    return jsonb_build_object('ya_estaba', true);
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se anula un pago.' using errcode = '42501';
  end if;
  v_p := retail.fn_archivar_pago_compra(p_pago_id, p_motivo, v_actor);
  return jsonb_build_object('ya_estaba', false, 'compra_id', v_p.compra_id, 'monto', v_p.monto);
end $f$;
revoke all on function retail.anular_pago_compra(uuid, text) from public, anon;
grant execute on function retail.anular_pago_compra(uuid, text) to authenticated;

create or replace function retail.anular_nota_credito_compra(p_nota_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
declare
  v_actor uuid;
  v_n retail.compra_notas_credito%rowtype;
begin
  if not retail.fn_puede_registrar_notas_credito() then
    raise exception 'Anular una nota de crédito necesita el módulo Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué se anula la nota.' using errcode = 'P0001';
  end if;
  select * into v_n from retail.compra_notas_credito where id = p_nota_id for update;
  if not found then
    if exists (select 1 from retail.documentos_anulados where tabla = 'compra_notas_credito' and documento_id = p_nota_id) then
      return jsonb_build_object('ya_estaba', true);
    end if;
    raise exception 'Esa nota de crédito no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_compra_es_de_mis_tiendas(v_n.compra_id) then
    raise exception 'Ese comprobante lo gestiona otra tienda: su nota la anula ella (o un líder).' using errcode = '42501';
  end if;
  if v_n.cierre_id is not null or v_n.interna then
    raise exception 'Esta nota nació al cerrar una línea de la factura: se corrige reabriendo esa línea, no aquí.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.proveedor_creditos k where k.nota_credito_id = p_nota_id) then
    raise exception 'Esta nota dejó saldo a favor del proveedor: no se anula desde aquí.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.compra_adjuntos a where a.nota_credito_id = p_nota_id) then
    raise exception 'Esta nota tiene archivos adjuntos: quítalos primero.' using errcode = 'P0001';
  end if;
  perform retail.fn_exigir_mes_abierto((select c.ubicacion_gestion_id from retail.compras c where c.id = v_n.compra_id), v_n.fecha, null, 'anular esta nota');
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se anula una nota.' using errcode = '42501';
  end if;
  perform 1 from retail.compras where id = v_n.compra_id for update;
  insert into retail.documentos_anulados (tabla, documento_id, compra_id, fila, motivo, anulado_por)
  values ('compra_notas_credito', v_n.id, v_n.compra_id, to_jsonb(v_n), btrim(p_motivo), v_actor);
  perform set_config('retail.anulando_documento', p_nota_id::text, true);
  delete from retail.compra_notas_credito where id = p_nota_id;
  perform set_config('retail.anulando_documento', '', true);
  update retail.compras set notas_credito = notas_credito - v_n.aplicado where id = v_n.compra_id;
  return jsonb_build_object('ya_estaba', false, 'compra_id', v_n.compra_id, 'monto', v_n.monto);
end $f$;
revoke all on function retail.anular_nota_credito_compra(uuid, text) from public, anon;
grant execute on function retail.anular_nota_credito_compra(uuid, text) to authenticated;

create or replace function retail.anular_reembolso_proveedor(p_credito_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
declare
  v_actor uuid;
  v_k retail.proveedor_creditos%rowtype;
begin
  if not retail.fn_puede_pagar_compras() then
    raise exception 'Anular un reembolso necesita el módulo Por pagar en tu rol.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué se anula el reembolso.' using errcode = 'P0001';
  end if;
  select * into v_k from retail.proveedor_creditos where id = p_credito_id for update;
  if not found then
    if exists (select 1 from retail.documentos_anulados where tabla = 'proveedor_creditos' and documento_id = p_credito_id) then
      return jsonb_build_object('ya_estaba', true);
    end if;
    raise exception 'Ese reembolso no existe.' using errcode = 'P0001';
  end if;
  if v_k.tipo <> 'reembolso' then
    raise exception 'Solo se anula un reembolso: lo demás del saldo a favor sale de su pago o de su nota.' using errcode = 'P0001';
  end if;
  perform retail.fn_exigir_mes_abierto((select c.ubicacion_gestion_id from retail.compras c where c.id = v_k.compra_id), v_k.fecha, null, 'anular este reembolso');
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se anula un reembolso.' using errcode = '42501';
  end if;
  insert into retail.documentos_anulados (tabla, documento_id, compra_id, fila, motivo, anulado_por)
  values ('proveedor_creditos', v_k.id, v_k.compra_id, to_jsonb(v_k), btrim(p_motivo), v_actor);
  perform set_config('retail.anulando_documento', p_credito_id::text, true);
  delete from retail.proveedor_creditos where id = p_credito_id;
  perform set_config('retail.anulando_documento', '', true);
  return jsonb_build_object('ya_estaba', false, 'monto', v_k.monto);
end $f$;
revoke all on function retail.anular_reembolso_proveedor(uuid, text) from public, anon;
grant execute on function retail.anular_reembolso_proveedor(uuid, text) to authenticated;

-- Quitar el papel de un gasto: el gasto vuelve a como era sin comprobante. Las marcas de ESTE gasto dejan pasar solo ese cambio.
select pg_temp.reemplazar('retail.fn_gastos_solo_anular()',
$a$  if new.estado <> 'anulado' then
    raise exception 'Un gasto solo cambia para anularse.' using errcode = 'P0001';$a$,
$n$  -- Tarea 21: dentro de `quitar_comprobante_de_gasto` el gasto recupera su pago (medio y cuenta) y deja su comprobante, y nada más cambia.
  if new.estado = 'vigente' and coalesce(current_setting('retail.gastos_quitando_comprobante', true), '') = old.id::text then
    if old.compra_id is null or new.compra_id is not null or new.igv <> 0 or new.medio_pago is null
       or (new.id, new.ubicacion_id, new.categoria, new.descripcion, new.fecha, new.monto_total, new.caja_movimiento_id,
           new.registrado_por, new.token_cliente, new.created_at, new.gasto_fijo_id)
          is distinct from
          (old.id, old.ubicacion_id, old.categoria, old.descripcion, old.fecha, old.monto_total, old.caja_movimiento_id,
           old.registrado_por, old.token_cliente, old.created_at, old.gasto_fijo_id) then
      raise exception 'Al quitar su comprobante, el gasto solo recupera su pago.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado <> 'anulado' then
    raise exception 'Un gasto solo cambia para anularse.' using errcode = 'P0001';$n$, 1);
select pg_temp.reemplazar('retail.fn_gastos_sellar()',
$a$    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un gasto se sella al registrarlo: no cambia.' using errcode = 'P0001';$a$,
$n$    -- Tarea 21: al quitar su comprobante, la cuenta vuelve del pago al gasto (`quitar_comprobante_de_gasto`, con la marca de ESTE gasto).
    if old.compra_id is not null and new.compra_id is null
       and coalesce(current_setting('retail.gastos_quitando_comprobante', true), '') = old.id::text then
      return new;
    end if;
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un gasto se sella al registrarlo: no cambia.' using errcode = 'P0001';$n$, 1);

create or replace function retail.quitar_comprobante_de_gasto(p_gasto_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
declare
  v_g retail.gastos%rowtype;
  v_c retail.compras%rowtype;
  v_t retail.gasto_papeles_tardios%rowtype;
  v_p retail.compra_pagos%rowtype;
  v_actor uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_texto text;
begin
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué se quita el comprobante.' using errcode = 'P0001';
  end if;
  select * into v_g from retail.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_g.ubicacion_id) then
    raise exception 'No puedes cambiar gastos de esa tienda.' using errcode = '42501';
  end if;
  if v_g.estado = 'anulado' then
    raise exception 'Ese gasto está anulado.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se cambia un gasto.' using errcode = '42501';
  end if;

  -- El papel que llegó con el mes cerrado (tarea 20): se anula en su lugar; su mes contable tiene que estar abierto.
  select * into v_t from retail.gasto_papeles_tardios where gasto_id = p_gasto_id and anulado_en is null for update;
  if found then
    perform retail.fn_exigir_mes_abierto(v_g.ubicacion_id, v_t.fecha_contable, null, 'quitar este comprobante');
    update retail.gasto_papeles_tardios set anulado_en = now(), anulado_por = v_actor, motivo_anulacion = v_motivo where id = v_t.id;
    v_texto := v_t.serie || '-' || v_t.numero;
  elsif v_g.compra_id is null then
    -- Dos toques: el segundo ya no encuentra papel.
    return jsonb_build_object('ya_estaba', true);
  else
    select * into v_c from retail.compras where id = v_g.compra_id for update;
    if v_c.naturaleza <> 'gasto' or v_c.condicion <> 'contado' then
      raise exception 'Este comprobante quedó a crédito: se corrige desde Por pagar, no aquí.' using errcode = 'P0001';
    end if;
    if (select count(*) from retail.compra_pagos where compra_id = v_c.id) <> 1
       or (select sum(monto) from retail.compra_pagos where compra_id = v_c.id) <> v_g.monto_total then
      raise exception 'Los pagos de este comprobante ya no son los del gasto: se corrige desde Por pagar.' using errcode = 'P0001';
    end if;
    if exists (select 1 from retail.compra_notas_credito where compra_id = v_c.id)
       or exists (select 1 from retail.proveedor_creditos where compra_id = v_c.id) then
      raise exception 'Este comprobante tiene notas o saldo a favor: se corrige desde Compras.' using errcode = 'P0001';
    end if;
    -- 1. El gasto recupera su pago (lo contrario de `agregar_comprobante_a_gasto`).
    select * into v_p from retail.compra_pagos where compra_id = v_c.id;
    perform set_config('retail.gastos_quitando_comprobante', p_gasto_id::text, true);
    update retail.gastos
       set compra_id = null, igv = 0, medio_pago = v_p.metodo,
           cuenta_dinero_id = case when v_g.caja_movimiento_id is null then v_p.cuenta_dinero_id end
     where id = p_gasto_id;
    perform set_config('retail.gastos_quitando_comprobante', '', true);
    -- 2. El pago se archiva y el comprobante se anula: ya no es de este gasto.
    perform retail.fn_archivar_pago_compra(v_p.id, v_motivo, v_actor);
    update retail.compras set estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_actor, anulada_at = now() where id = v_c.id;
    v_texto := coalesce(v_c.documento, v_c.serie || '-' || v_c.numero);
  end if;

  insert into retail.gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
  values (gen_random_uuid(), p_gasto_id, 'comprobante', v_texto, 'Sin comprobante (' || v_motivo || ')', v_actor);
  return jsonb_build_object('ya_estaba', false, 'quitado', v_texto);
end $f$;
revoke all on function retail.quitar_comprobante_de_gasto(uuid, text) from public, anon;
grant execute on function retail.quitar_comprobante_de_gasto(uuid, text) to authenticated;

-- ── 3. Lo anulado, a la vista ────────────────────────────────────────────────
-- Lo anulado de una factura (pagos, notas y reembolsos), con su motivo. La ve quien ve el dinero de Compras.
create or replace function retail.fn_anulados_de_compra(p_compra_id uuid)
returns table (tabla text, documento_id uuid, fecha date, monto numeric, detalle text, motivo text, anulado_en timestamptz, anulado_por text)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
#variable_conflict use_column
begin
  if not retail.fn_puede_ver_dinero_de_compras() then
    return;
  end if;
  return query
  select a.tabla, a.documento_id, (a.fila ->> 'fecha')::date, (a.fila ->> 'monto')::numeric,
         case a.tabla when 'compra_pagos' then coalesce(a.fila ->> 'metodo', '') when 'compra_notas_credito' then coalesce(a.fila ->> 'serie_numero', '') else 'reembolso' end,
         a.motivo, a.anulado_en, trim(concat_ws(' ', pe.nombres, pe.apellidos))
    from retail.documentos_anulados a
    left join public.personas pe on pe.id = a.anulado_por
   where a.compra_id = p_compra_id
   order by a.anulado_en desc;
end $f$;
revoke all on function retail.fn_anulados_de_compra(uuid) from public, anon;
grant execute on function retail.fn_anulados_de_compra(uuid) to authenticated;

reset lock_timeout;
