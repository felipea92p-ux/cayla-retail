-- La rendición del fondo, fase 6 · actividad 5 (ADR-0362, decisiones 32–35, 54 y 69).
--
-- EL PROBLEMA PRIMERO. Quien compra recibe plata, paga y anota los gastos del viaje, pero nada cierra la cuenta: no hay un momento en que
-- diga «esto es lo que tengo en la mano» y otra persona lo revise. Sin eso no se ve un faltante (el control contra el fraude de la
-- decisión 26), el fondo nunca se «limpia» para el próximo viaje y lo que ya se revisó se puede seguir cambiando.
--
-- QUÉ CREA
--   1. `rendiciones_fondo`: lo que dijo el sistema al rendir, CONGELADO (tenías, te entregaron, devolviste, pagaste a proveedores,
--      gastos, otros y «deberías tener»), lo que la persona contó en la mano, el faltante y su explicación, cuántos papeles no tienen foto
--      (decisión 69: las fotos son opcionales y la rendición avisa cuáles faltan), y cómo terminó: aprobada (con la decisión sobre el
--      faltante) o devuelta para corregir. Una sola rendición abierta por fondo.
--   2. `rendicion_fondo_items`: qué filas del libro del fondo entran en cada rendición (su `clave`: `mov:…`, `pago:…`, `gasto:…`). Lo que
--      se anota después entra al ciclo siguiente: el ciclo no se corta por la hora (dos transacciones a la vez dejarían una fila en el
--      limbo), sino por qué filas ya se rindieron. Una fila está en una sola rendición vigente.
--   3. Dos tipos de movimiento nuevos, `faltante_fondo_asumido` y `faltante_fondo_deuda`: al aprobar, el faltante SALE del fondo (que
--      queda con lo que la persona de verdad tiene) y no va a ninguna cuenta de dinero. El Diario lo lleva a la 6599 («Diferencias de
--      caja», la misma de un faltante de caja) si lo asume CAYLA, o a la 1419 (cuenta por cobrar al personal, nueva) si queda como deuda
--      de la persona. Las dos cuentas son provisionales hasta que el contador diga (decisión 57). `movimientos_dinero.rendicion_id` dice
--      de qué rendición es cada faltante.
--   4. `rendir_fondo(efectivo, explicación, token)`: la dueña, con SU cuenta (nunca una terminal) y firmando ella. Congela el ciclo. No
--      acepta más plata de la que dice el fondo (provisional: si sobra, falta anotar algo).
--   5. `aprobar_rendicion_fondo(id, decisión, nota)`: quien tiene Fondos por rendir; nunca la dueña (33), ni quien le entregó plata en
--      esa rendición (35); la de un líder, solo un Admin (33). Un faltante con explicación lo decide quien aprueba («Lo asume CAYLA» o
--      «Queda como deuda de la persona»); sin explicación, deuda (54, 69). Al aprobar, el fondo puede quedar en cero o conservar plata:
--      devolver es otra cosa, aparte (69).
--   6. `devolver_rendicion_fondo(id, motivo)`: quien aprueba la devuelve para corregir, o la dueña la retira; sus filas vuelven al ciclo.
--   7. Las lecturas: `fn_mi_ciclo_fondo()` (lo que la dueña todavía no rindió, con qué papeles tienen foto), `fn_rendicion_fondo_items(id)`
--      y `fn_rendiciones_fondo(estado)` (el tablero de quien aprueba, con si puede aprobar y por qué no).
--   8. `fn_mi_fondo_resumen()` cuenta solo el ciclo abierto (mismas columnas), y `fn_mi_fondo_rendicion()` dice lo que se trajo de la
--      rendición anterior, la rendición por aprobar, cuántos papeles no tienen foto y lo que la persona debe por faltantes.
--   9. Lo rendido queda congelado: un gasto del viaje o una entrega que ya está en una rendición vigente no se anula (reemplazos anclados
--      en `anular_gasto` y `anular_movimiento_fondo`, que toman el candado del fondo para no cruzarse con una rendición).
--  10. Las funciones de dinero aprenden los faltantes (reemplazos anclados que SOLO SUMAN texto: lo que dejaron la 182000 y la 212000
--      sigue igual, así que volver a pegarlas sobre esta funciona): el validador, el texto del movimiento, «Cuentas y dinero» no los
--      anula ni los ofrece para anular, y el Diario los asienta.
--
-- DESCARTÉ
--   · Cortar el ciclo por fecha u hora: un pago guardado mientras se rinde quedaría contado dos veces o ninguna.
--   · Un tipo de cuenta de dinero «deuda de la persona»: «Cuentas y dinero» suma todas sus cuentas como plata de CAYLA, y una deuda no
--     es plata en caja. La deuda vive en la rendición; cobrarla es de la actividad 7.
--   · Aceptar un sobrante: sería plata que el sistema no sabe de dónde salió. Por ahora se frena y se pide revisar (provisional).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (autorización de Felipe para la fase 6). Una sola parte, DESPUÉS de 20261013233000 y 20261013234000:
-- tablas nuevas, `alter` de `movimientos_dinero` (dos restricciones y una columna) y funciones; SIN políticas ni `drop trigger` (ADR-0195)
-- y sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos anclados abortan sin cambiar nada si la función viva
-- cambió. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. La cuenta de la deuda (provisional hasta el contador, decisión 57) ----------
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('1419', 'Otras cuentas por cobrar al personal (faltantes de fondos)', 'activo', null, 4)
on conflict (codigo) do nothing;

-- ---------- 2. La rendición ----------
create table if not exists retail.rendiciones_fondo (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  persona_id uuid not null references public.personas (id),
  estado text not null default 'por_aprobar' check (estado in ('por_aprobar', 'aprobada', 'devuelta')),
  -- Lo que dijo el sistema al rendir, congelado (del mismo libro que el saldo).
  arrastre numeric(12, 2) not null,
  entregado numeric(12, 2) not null check (entregado >= 0),
  devuelto numeric(12, 2) not null check (devuelto >= 0),
  pagado numeric(12, 2) not null check (pagado >= 0),
  gastos numeric(12, 2) not null check (gastos >= 0),
  otros numeric(12, 2) not null,
  -- Lo que debería tener: arrastre + entregado − devuelto − pagado − gastos + otros. Negativo = CAYLA le debe (decisión 32).
  saldo numeric(12, 2) not null,
  -- Lo que contó en la mano, y lo que falta.
  efectivo numeric(12, 2) not null check (efectivo >= 0),
  faltante numeric(12, 2) not null check (faltante >= 0),
  explicacion text check (explicacion is null or char_length(btrim(explicacion)) between 1 and 500),
  items integer not null check (items > 0),
  sin_foto integer not null default 0 check (sin_foto >= 0),
  rendida_por uuid not null references public.personas (id),
  rendida_en timestamptz not null default now(),
  token_cliente uuid unique,
  -- Al aprobar.
  decision text check (decision in ('asume_cayla', 'deuda_persona')),
  nota text check (nota is null or char_length(nota) <= 500),
  aprobada_por uuid references public.personas (id),
  aprobada_en timestamptz,
  -- Al devolverla para corregir (o al retirarla la dueña).
  motivo_devolucion text check (motivo_devolucion is null or char_length(motivo_devolucion) <= 500),
  devuelta_por uuid references public.personas (id),
  devuelta_en timestamptz,
  constraint rendiciones_fondo_cuadra check (saldo = arrastre + entregado - devuelto - pagado - gastos + otros),
  constraint rendiciones_fondo_faltante check (faltante = greatest(saldo, 0) - efectivo),
  constraint rendiciones_fondo_estados check (
    (estado = 'por_aprobar' and aprobada_en is null and devuelta_en is null and decision is null)
    or (estado = 'aprobada' and aprobada_en is not null and aprobada_por is not null and devuelta_en is null
        and ((faltante = 0 and decision is null) or (faltante > 0 and decision is not null)))
    or (estado = 'devuelta' and devuelta_en is not null and devuelta_por is not null and aprobada_en is null
        and nullif(btrim(coalesce(motivo_devolucion, '')), '') is not null))
);
comment on table retail.rendiciones_fondo is
  'ADR-0362 fase 6: la rendición de un fondo por rendir. Lo que dijo el sistema al rendir queda congelado; la persona dice cuánto tiene en la mano; la aprueba otra persona con Fondos por rendir (la de un líder, un Admin). Solo la escriben rendir_fondo, aprobar_rendicion_fondo y devolver_rendicion_fondo.';
create unique index if not exists rendiciones_fondo_una_abierta on retail.rendiciones_fondo (cuenta_id) where estado = 'por_aprobar';
create index if not exists rendiciones_fondo_persona_idx on retail.rendiciones_fondo (persona_id, rendida_en desc);
alter table retail.rendiciones_fondo enable row level security;

create table if not exists retail.rendicion_fondo_items (
  rendicion_id uuid not null references retail.rendiciones_fondo (id),
  -- La fila del libro del fondo: `mov:<id>`, `pago:<id>` o `gasto:<id>`.
  clave text not null,
  origen text not null,
  monto numeric(12, 2) not null,
  -- false cuando la rendición se devolvió: la fila vuelve al ciclo abierto.
  vigente boolean not null default true,
  primary key (rendicion_id, clave)
);
comment on table retail.rendicion_fondo_items is
  'ADR-0362 fase 6: qué filas del libro de un fondo entran en cada rendición. Una fila está en una sola rendición vigente; lo que no está en ninguna es el ciclo abierto.';
create unique index if not exists rendicion_fondo_items_una_vez on retail.rendicion_fondo_items (clave) where vigente;
alter table retail.rendicion_fondo_items enable row level security;

revoke all on table retail.rendiciones_fondo, retail.rendicion_fondo_items from anon, authenticated;

-- ---------- 3. El faltante: dos tipos de movimiento que salen del fondo y no van a ninguna cuenta ----------
alter table retail.movimientos_dinero add column if not exists rendicion_id uuid references retail.rendiciones_fondo (id);
comment on column retail.movimientos_dinero.rendicion_id is
  'ADR-0362 fase 6: la rendición de la que sale un faltante de fondo (faltante_fondo_asumido / faltante_fondo_deuda).';

alter table retail.movimientos_dinero drop constraint if exists movimientos_dinero_tipo_check;
alter table retail.movimientos_dinero add constraint movimientos_dinero_tipo_check check (tipo = any (array[
  'aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas',
  'entrega_fondo', 'devolucion_fondo', 'faltante_fondo_asumido', 'faltante_fondo_deuda']));
alter table retail.movimientos_dinero drop constraint if exists movimientos_dinero_puntas;
alter table retail.movimientos_dinero add constraint movimientos_dinero_puntas check (
  case
    when tipo = any (array['aporte', 'prestamo']) then cuenta_origen_id is null and cuenta_destino_id is not null
    when tipo = any (array['retiro', 'devolucion_prestamo', 'faltante_fondo_asumido', 'faltante_fondo_deuda'])
      then cuenta_origen_id is not null and cuenta_destino_id is null
    else cuenta_origen_id is not null and cuenta_destino_id is not null and cuenta_origen_id <> cuenta_destino_id
  end);
alter table retail.movimientos_dinero drop constraint if exists movimientos_dinero_faltante_de_rendicion;
alter table retail.movimientos_dinero add constraint movimientos_dinero_faltante_de_rendicion check (
  (tipo in ('faltante_fondo_asumido', 'faltante_fondo_deuda')) = (rendicion_id is not null));

-- ---------- 4. Sin combo con la cuenta de una persona (decisión 39, como el resto del fondo) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('fondo_rendir', 'Rendir el propio fondo (solo con la cuenta de su dueña: desde una terminal no se rinde)'),
  ('fondo_rendicion_aprobar', 'Aprobar la rendición de un fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('fondo_rendicion_devolver', 'Devolver para corregir la rendición de un fondo, o retirar la propia (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 5. Piezas internas ----------

-- Las filas del libro de un fondo que todavía no están en ninguna rendición vigente: el ciclo abierto.
create or replace function retail.fn_fondo_ciclo(p_cuenta_id uuid)
returns table (clave text, origen text, monto numeric, fecha date, detalle text)
language sql stable security definer set search_path = retail, public, extensions as $$
  select l.clave, l.origen, l.monto, l.fecha, l.detalle
    from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
   where l.cuenta_id = p_cuenta_id
     and not exists (select 1 from retail.rendicion_fondo_items i where i.clave = l.clave and i.vigente);
$$;

-- El detalle de unas filas del libro de un fondo, para mostrarlas: de qué es cada una y si su papel tiene foto (un pago, si su
-- comprobante tiene adjuntos; un gasto del viaje, si tiene fotos; una entrega o una devolución no lleva papel).
create or replace function retail.fn_fondo_items_detalle(p_claves text[])
returns table (clave text, tipo text, ref_id uuid, compra_id uuid, concepto text, papel text, documento text, con_foto boolean, fotos integer)
language sql stable security definer set search_path = retail, public, extensions as $$
  with c as (
    select x.clave, split_part(x.clave, ':', 1) as tipo,
           case when split_part(x.clave, ':', 2) ~ '^[0-9a-f-]{36}$' then split_part(x.clave, ':', 2)::uuid end as ref_id
      from unnest(coalesce(p_claves, '{}'::text[])) as x(clave)
  )
  select c.clave, c.tipo, c.ref_id,
         p.compra_id,
         v.concepto,
         v.papel,
         case when c.tipo = 'pago' then coalesce(k.documento, concat_ws('-', k.serie, k.numero)) else v.serie_numero end,
         case c.tipo
           when 'pago' then exists (select 1 from retail.compra_adjuntos a where a.compra_id = p.compra_id and a.archivado_en is null)
           when 'gasto' then exists (select 1 from retail.gasto_viaje_fotos f where f.gasto_id = c.ref_id and f.archivada_en is null)
         end,
         case c.tipo
           when 'pago' then (select count(*)::integer from retail.compra_adjuntos a where a.compra_id = p.compra_id and a.archivado_en is null)
           when 'gasto' then (select count(*)::integer from retail.gasto_viaje_fotos f where f.gasto_id = c.ref_id and f.archivada_en is null)
           else 0
         end
    from c
    left join retail.compra_pagos p on c.tipo = 'pago' and p.id = c.ref_id
    left join retail.compras k on k.id = p.compra_id
    left join retail.gastos_viaje v on c.tipo = 'gasto' and v.gasto_id = c.ref_id;
$$;

-- El fondo vivo de quien mira (nunca una terminal).
create or replace function retail.fn_mi_fondo_cuenta() returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if auth.uid() is null or retail.fn_es_terminal() then
    return null;
  end if;
  return (select c.id from retail.cuentas_dinero c
           where c.tipo = 'fondo' and c.archivada_en is null and c.persona_id = retail.fn_persona_de_la_cuenta());
end $$;

-- ---------- 6. Rendir ----------
create or replace function retail.rendir_fondo(p_efectivo numeric, p_explicacion text default null, p_token uuid default null)
returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_fondo uuid;
  v_duena uuid;
  v_actor uuid;
  v_efectivo numeric := round(p_efectivo, 2);
  v_explicacion text := nullif(btrim(coalesce(p_explicacion, '')), '');
  v_saldo numeric;
  v_ciclo numeric;
  v_items integer;
  v_entregado numeric;
  v_devuelto numeric;
  v_pagado numeric;
  v_gastos numeric;
  v_otros numeric;
  v_sin_foto integer;
  v_abierta date;
  v_claves text[];
  v_origenes text[];
  v_montos numeric[];
begin
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('rendicion:' || p_token::text, 0));
    v_id := (select r.id from retail.rendiciones_fondo r where r.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;
  if retail.fn_es_terminal() then
    raise exception 'Tu fondo lo rindes tú, con tu cuenta: desde una terminal no se rinde.' using errcode = '42501', hint = 'fondo_ajeno';
  end if;
  v_fondo := retail.fn_mi_fondo_cuenta();
  if v_fondo is null then
    raise exception 'No tienes un fondo por rendir.' using errcode = 'P0001';
  end if;
  v_duena := (select c.persona_id from retail.cuentas_dinero c where c.id = v_fondo);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is distinct from v_duena then
    raise exception 'Tu fondo lo rindes tú: elige tu nombre en «Responsable».' using errcode = '42501', hint = 'fondo_ajeno';
  end if;
  -- El mismo candado que pagar, anotar un gasto, entregar, devolver y anular: lo que se guarda a la vez entra entero o no entra.
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_duena::text, 0));

  v_abierta := (select (r.rendida_en at time zone 'America/Lima')::date from retail.rendiciones_fondo r
                 where r.cuenta_id = v_fondo and r.estado = 'por_aprobar');
  if v_abierta is not null then
    raise exception 'Ya rendiste el %: esa rendición espera aprobación.', to_char(v_abierta, 'DD/MM') using errcode = 'P0001', hint = 'rendicion_abierta';
  end if;

  -- El ciclo abierto, en UNA pasada por el libro (con el candado tomado nadie le suma ni le quita filas).
  select coalesce(array_agg(c.clave order by c.clave), '{}'), coalesce(array_agg(c.origen order by c.clave), '{}'),
         coalesce(array_agg(c.monto order by c.clave), '{}'), count(*), coalesce(sum(c.monto), 0),
         coalesce(sum(c.monto) filter (where c.origen = 'movimiento' and c.monto > 0), 0),
         coalesce(-sum(c.monto) filter (where c.origen = 'movimiento' and c.monto < 0), 0),
         coalesce(-sum(c.monto) filter (where c.origen = 'pago'), 0),
         coalesce(-sum(c.monto) filter (where c.origen = 'gasto'), 0)
    into v_claves, v_origenes, v_montos, v_items, v_ciclo, v_entregado, v_devuelto, v_pagado, v_gastos
    from retail.fn_fondo_ciclo(v_fondo) c;
  if v_items = 0 then
    raise exception 'No hay nada nuevo que rendir desde tu última rendición.' using errcode = 'P0001';
  end if;
  v_saldo := retail.fn_fondo_saldo(v_fondo);
  v_otros := v_ciclo - (v_entregado - v_devuelto - v_pagado - v_gastos);

  if v_efectivo is null or v_efectivo < 0 then
    raise exception 'Escribe cuánto tienes en la mano (0 si no te queda nada).' using errcode = 'P0001';
  end if;
  if p_efectivo <> v_efectivo then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001';
  end if;
  -- Provisional (revisar con Felipe): más plata de la que dice el fondo es algo sin anotar; no se rinde así.
  if v_efectivo > greatest(v_saldo, 0) then
    raise exception 'Tienes S/ % y tu fondo dice S/ %: si tienes más, falta anotar algo (o un gasto quedó dos veces). Revísalo antes de rendir.',
      to_char(v_efectivo, 'FM999G999G990D00'), to_char(greatest(v_saldo, 0), 'FM999G999G990D00') using errcode = 'P0001', hint = 'rendicion_sobra';
  end if;
  if char_length(coalesce(v_explicacion, '')) > 500 then
    raise exception 'La explicación es muy larga (máximo 500 letras).' using errcode = 'P0001';
  end if;

  v_sin_foto := (select count(*) from retail.fn_fondo_items_detalle(v_claves) d where d.con_foto is false);

  insert into retail.rendiciones_fondo (cuenta_id, persona_id, arrastre, entregado, devuelto, pagado, gastos, otros, saldo, efectivo, faltante,
                                        explicacion, items, sin_foto, rendida_por, token_cliente)
  values (v_fondo, v_duena, v_saldo - v_ciclo, v_entregado, v_devuelto, v_pagado, v_gastos, v_otros, v_saldo, v_efectivo,
          greatest(v_saldo, 0) - v_efectivo, case when greatest(v_saldo, 0) - v_efectivo > 0 then v_explicacion end, v_items, v_sin_foto,
          v_actor, p_token)
  returning id into v_id;
  insert into retail.rendicion_fondo_items (rendicion_id, clave, origen, monto)
  select v_id, x.clave, x.origen, x.monto from unnest(v_claves, v_origenes, v_montos) as x(clave, origen, monto);
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.rendiciones_fondo r where r.token_cliente = p_token) then
    return (select r.id from retail.rendiciones_fondo r where r.token_cliente = p_token);
  end if;
  raise;
end $$;

-- ---------- 7. Por qué alguien no puede aprobar una rendición (null = sí puede) ----------
create or replace function retail.fn_rendicion_quien_no_aprueba(p_rendicion_id uuid, p_actor uuid) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_duena uuid;
  v_cuenta uuid := retail.fn_persona_de_la_cuenta();
begin
  v_duena := (select r.persona_id from retail.rendiciones_fondo r where r.id = p_rendicion_id);
  if v_duena is null then
    return 'Esa rendición no existe.';
  end if;
  if v_duena = p_actor or v_duena = v_cuenta then
    return 'Es tu fondo: tu rendición la aprueba otra persona.';
  end if;
  -- Decisión 35: quien le entregó plata en esta rendición no la aprueba.
  if exists (select 1 from retail.rendicion_fondo_items i
               join retail.movimientos_dinero d on i.clave = 'mov:' || d.id::text
              where i.rendicion_id = p_rendicion_id and d.tipo = 'entrega_fondo'
                and d.registrado_por in (p_actor, coalesce(v_cuenta, p_actor))) then
    return 'Le entregaste plata en esta rendición: la aprueba otra persona con Fondos por rendir.';
  end if;
  -- Decisión 33: la de un líder la aprueba un Admin (distinto de él: ya lo dijo la primera regla).
  if exists (select 1 from retail.colaboradores c where c.persona_id = v_duena and c.rol = 'lider' and c.estado = 'activo')
     and not retail.fn_es_admin() then
    return 'Es la rendición de un líder: la aprueba un Admin.';
  end if;
  return null;
end $$;

-- ---------- 8. Aprobar ----------
create or replace function retail.aprobar_rendicion_fondo(p_id uuid, p_decision text default null, p_nota text default null)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_r retail.rendiciones_fondo%rowtype;
  v_actor uuid;
  v_no text;
  v_decision text;
  v_mov uuid;
  v_cambio integer;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Aprobar una rendición necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  select * into v_r from retail.rendiciones_fondo where id = p_id for update;
  if not found then
    raise exception 'Esa rendición no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_r.estado <> 'por_aprobar' then
    raise exception 'Esa rendición ya está %.', case v_r.estado when 'aprobada' then 'aprobada' else 'devuelta' end using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién aprueba.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_no := retail.fn_rendicion_quien_no_aprueba(p_id, v_actor);
  if v_no is not null then
    raise exception '%', v_no using errcode = '42501', hint = 'rendicion_quien_aprueba';
  end if;
  if char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'La nota es muy larga (máximo 500 letras).' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_r.persona_id::text, 0));

  -- Lo que se rindió sigue siendo lo mismo: cada fila sigue en el libro con el mismo monto (lo rendido no se anula; esto es un candado
  -- más, por si algo se coló).
  v_cambio := (with l as materialized (
                  select l.clave, l.monto from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = v_r.cuenta_id)
                select count(*) from retail.rendicion_fondo_items i
                 where i.rendicion_id = p_id and i.vigente
                   and not exists (select 1 from l where l.clave = i.clave and l.monto = i.monto));
  if v_cambio > 0 then
    raise exception 'Algo de esta rendición cambió después de rendirla: devuélvela para que la rinda de nuevo.' using errcode = 'P0001', hint = 'rendicion_cambio';
  end if;

  if v_r.faltante > 0 then
    if v_r.explicacion is null then
      -- Decisión 54: sin explicación, el faltante es deuda de la persona.
      if p_decision is not null and p_decision <> 'deuda_persona' then
        raise exception 'Sin explicación, el faltante queda como deuda de la persona.' using errcode = 'P0001', hint = 'rendicion_sin_explicacion';
      end if;
      v_decision := 'deuda_persona';
    else
      if p_decision is null or p_decision not in ('asume_cayla', 'deuda_persona') then
        raise exception 'Elige si el faltante lo asume CAYLA o queda como deuda de la persona.' using errcode = 'P0001';
      end if;
      v_decision := p_decision;
    end if;
    insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, referencia, registrado_por, rendicion_id)
    values (case v_decision when 'asume_cayla' then 'faltante_fondo_asumido' else 'faltante_fondo_deuda' end, retail.fn_hoy_lima(),
            v_r.cuenta_id, null, v_r.faltante,
            left('Faltante de la rendición del ' || to_char((v_r.rendida_en at time zone 'America/Lima')::date, 'DD/MM')
                 || coalesce(' · ' || v_r.explicacion, ''), 200),
            v_actor, p_id)
    returning id into v_mov;
    -- El faltante es parte de esta rendición, no del ciclo que sigue.
    insert into retail.rendicion_fondo_items (rendicion_id, clave, origen, monto) values (p_id, 'mov:' || v_mov::text, 'movimiento', -v_r.faltante);
  end if;

  update retail.rendiciones_fondo
     set estado = 'aprobada', decision = v_decision, nota = v_nota, aprobada_por = v_actor, aprobada_en = now()
   where id = p_id;
end $$;

-- ---------- 9. Devolver para corregir (o retirarla la dueña) ----------
create or replace function retail.devolver_rendicion_fondo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_r retail.rendiciones_fondo%rowtype;
  v_actor uuid;
  v_cuenta uuid := retail.fn_persona_de_la_cuenta();
  v_es_duena boolean;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Di por qué se devuelve.' using errcode = 'P0001';
  end if;
  if char_length(btrim(p_motivo)) > 500 then
    raise exception 'El motivo es muy largo (máximo 500 letras).' using errcode = 'P0001';
  end if;
  select * into v_r from retail.rendiciones_fondo where id = p_id for update;
  if not found then
    raise exception 'Esa rendición no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_r.estado <> 'por_aprobar' then
    raise exception 'Esa rendición ya está %.', case v_r.estado when 'aprobada' then 'aprobada: ya no se devuelve' else 'devuelta' end using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién la devuelve.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- La dueña la retira con SU cuenta (nunca desde una terminal); quien aprueba la devuelve con el módulo Fondos por rendir.
  v_es_duena := not retail.fn_es_terminal() and v_cuenta = v_r.persona_id and v_actor = v_r.persona_id;
  if not v_es_duena and not retail.fn_ve_modulo('fondos') then
    raise exception 'Devolver una rendición necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  if not v_es_duena and (v_actor = v_r.persona_id or v_cuenta = v_r.persona_id) then
    raise exception 'Tu propia rendición la retiras con tu cuenta, firmando tú.' using errcode = '42501', hint = 'fondo_ajeno';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_r.persona_id::text, 0));
  update retail.rendicion_fondo_items set vigente = false where rendicion_id = p_id;
  update retail.rendiciones_fondo
     set estado = 'devuelta', motivo_devolucion = btrim(p_motivo), devuelta_por = v_actor, devuelta_en = now()
   where id = p_id;
end $$;

-- ---------- 10. Lo que la dueña todavía no rindió ----------
create or replace function retail.fn_mi_ciclo_fondo()
returns table (clave text, origen text, monto numeric, fecha date, detalle text, tipo text, ref_id uuid, compra_id uuid, concepto text,
               papel text, documento text, con_foto boolean, fotos integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_fondo uuid := retail.fn_mi_fondo_cuenta();
begin
  if v_fondo is null then
    return;
  end if;
  return query
  with c as materialized (select * from retail.fn_fondo_ciclo(v_fondo))
  select c.clave, c.origen, c.monto, c.fecha, c.detalle, d.tipo, d.ref_id, d.compra_id, d.concepto, d.papel, d.documento, d.con_foto, d.fotos
    from c
    join retail.fn_fondo_items_detalle((select array_agg(x.clave) from c x)) d on d.clave = c.clave
   order by c.fecha, c.clave;
end $$;

-- ---------- 11. Lo que entró en una rendición ----------
create or replace function retail.fn_rendicion_fondo_items(p_rendicion_id uuid)
returns table (clave text, origen text, monto numeric, fecha date, detalle text, tipo text, ref_id uuid, compra_id uuid, concepto text,
               papel text, documento text, con_foto boolean, fotos integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_r retail.rendiciones_fondo%rowtype;
begin
  select * into v_r from retail.rendiciones_fondo where id = p_rendicion_id;
  if not found then
    return;
  end if;
  if not retail.fn_ve_modulo('fondos') and v_r.cuenta_id is distinct from retail.fn_mi_fondo_cuenta() then
    raise exception 'Ver una rendición necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return query
  with i as materialized (
    select i.clave, i.origen, i.monto from retail.rendicion_fondo_items i where i.rendicion_id = p_rendicion_id
  ),
  l as materialized (
    select l.clave, l.fecha, l.detalle from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = v_r.cuenta_id
  )
  select i.clave, i.origen, i.monto, l.fecha, l.detalle, d.tipo, d.ref_id, d.compra_id, d.concepto, d.papel, d.documento, d.con_foto, d.fotos
    from i
    left join l on l.clave = i.clave
    join retail.fn_fondo_items_detalle((select array_agg(x.clave) from i x)) d on d.clave = i.clave
   order by l.fecha nulls last, i.clave;
end $$;

-- ---------- 12. El tablero de quien aprueba ----------
create or replace function retail.fn_rendiciones_fondo(p_estado text default null, p_limite integer default 100)
returns table (
  id uuid, cuenta_id uuid, persona_id uuid, persona_nombre text, estado text, arrastre numeric, entregado numeric, devuelto numeric,
  pagado numeric, gastos numeric, otros numeric, saldo numeric, efectivo numeric, faltante numeric, explicacion text, items integer,
  sin_foto integer, rendida_en timestamptz, rendida_por_nombre text, decision text, nota text, aprobada_en timestamptz,
  aprobada_por_nombre text, motivo_devolucion text, devuelta_en timestamptz, devuelta_por_nombre text, por_que_no_aprueba text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  -- Una lectura no pide el combo «Responsable»: la pista de quién puede aprobar se calcula con la persona de la cuenta (la que vale es la
  -- de `aprobar_rendicion_fondo`, con quien de verdad firma).
  v_yo uuid := coalesce(retail.fn_persona_de_la_cuenta(), '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver las rendiciones necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return query
  select r.id, r.cuenta_id, r.persona_id, trim(concat_ws(' ', pe.nombres, pe.apellidos)), r.estado, r.arrastre, r.entregado, r.devuelto,
         r.pagado, r.gastos, r.otros, r.saldo, r.efectivo, r.faltante, r.explicacion, r.items, r.sin_foto, r.rendida_en,
         trim(concat_ws(' ', pr.nombres, pr.apellidos)), r.decision, r.nota, r.aprobada_en, trim(concat_ws(' ', pa.nombres, pa.apellidos)),
         r.motivo_devolucion, r.devuelta_en, trim(concat_ws(' ', pd.nombres, pd.apellidos)),
         case when r.estado = 'por_aprobar' then retail.fn_rendicion_quien_no_aprueba(r.id, v_yo) end
    from retail.rendiciones_fondo r
    join public.personas pe on pe.id = r.persona_id
    left join public.personas pr on pr.id = r.rendida_por
    left join public.personas pa on pa.id = r.aprobada_por
    left join public.personas pd on pd.id = r.devuelta_por
   where p_estado is null or r.estado = p_estado
   order by case r.estado when 'por_aprobar' then 0 else 1 end, r.rendida_en desc
   limit greatest(coalesce(p_limite, 100), 1);
end $$;

-- ---------- 13. «Tu fondo» cuenta el ciclo abierto ----------
-- `fn_mi_fondo_resumen` (20261013231000) conserva sus columnas —cambiarlas obligaría a borrarla, y una prueba que vuelve a cargar la
-- 231000 sobre esta ya no podría—, pero ahora cuenta solo el ciclo abierto: lo que todavía no está en una rendición vigente. Lo nuevo
-- (lo que se trajo de la rendición anterior, la rendición por aprobar, los papeles sin foto y la deuda) viene en `fn_mi_fondo_rendicion`.
create or replace function retail.fn_mi_fondo_resumen()
returns table (
  cuenta_id uuid, nombre text, saldo numeric, entregado numeric, devuelto numeric, pagado numeric, gastos numeric, otros numeric,
  desde date, para_que text, ultima_entrega date
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_fondo uuid := retail.fn_mi_fondo_cuenta();
begin
  if v_fondo is null then
    return;
  end if;
  return query
  with libro as materialized (
    select l.clave, l.origen, l.monto, l.fecha from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = v_fondo
  ),
  ciclo as materialized (
    select l.* from libro l where not exists (select 1 from retail.rendicion_fondo_items i where i.clave = l.clave and i.vigente)
  ),
  sumas as (
    select coalesce(sum(c.monto) filter (where c.origen = 'movimiento' and c.monto > 0), 0) as entregado,
           coalesce(-sum(c.monto) filter (where c.origen = 'movimiento' and c.monto < 0), 0) as devuelto,
           coalesce(-sum(c.monto) filter (where c.origen = 'pago'), 0) as pagado,
           coalesce(-sum(c.monto) filter (where c.origen = 'gasto'), 0) as gastos,
           coalesce(sum(c.monto), 0) as total
      from ciclo c
  ),
  s as (
    select coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = v_fondo), 0) + coalesce(sum(l.monto), 0) as saldo
      from libro l
  ),
  entregas as (
    select d.fecha, d.created_at, d.referencia from retail.movimientos_dinero d
     where d.tipo = 'entrega_fondo' and d.estado = 'vigente' and d.cuenta_destino_id = v_fondo
  )
  select v_fondo, (select c.nombre from retail.cuentas_dinero c where c.id = v_fondo), s.saldo,
         su.entregado, su.devuelto, su.pagado, su.gastos,
         -- Lo que falta para cuadrar el ciclo: (saldo − lo que se trajo) − (entregado − devuelto − pagado − gastos). Hoy siempre 0.
         su.total - (su.entregado - su.devuelto - su.pagado - su.gastos),
         -- Desde cuándo: la última rendición aprobada o, si no hay, la primera fila del ciclo.
         coalesce((select (max(r.aprobada_en) at time zone 'America/Lima')::date from retail.rendiciones_fondo r
                    where r.cuenta_id = v_fondo and r.estado = 'aprobada'),
                  (select min(c.fecha) from ciclo c)),
         (select e.referencia from entregas e order by e.fecha desc, e.created_at desc limit 1),
         (select max(e.fecha) from entregas e)
    from sumas su, s;
end $$;

-- Lo que la tarjeta suma por la rendición: lo que se trajo de la anterior (el saldo menos el ciclo abierto), cuántas filas lleva el
-- ciclo y cuántos papeles no tienen foto, la rendición por aprobar y lo que la persona debe por faltantes (decisión 54; cobrarlo es
-- de la actividad 7).
create or replace function retail.fn_mi_fondo_rendicion()
returns table (
  arrastre numeric, items integer, sin_foto integer, rendicion_id uuid, rendicion_en timestamptz, rendicion_faltante numeric, deuda numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_fondo uuid := retail.fn_mi_fondo_cuenta();
begin
  if v_fondo is null then
    return;
  end if;
  return query
  with libro as materialized (
    select l.clave, l.monto from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = v_fondo
  ),
  ciclo as materialized (
    select l.* from libro l where not exists (select 1 from retail.rendicion_fondo_items i where i.clave = l.clave and i.vigente)
  ),
  abierta as (
    select r.id, r.rendida_en, r.faltante from retail.rendiciones_fondo r where r.cuenta_id = v_fondo and r.estado = 'por_aprobar'
  )
  select coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = v_fondo), 0)
           + coalesce((select sum(l.monto) from libro l), 0) - coalesce((select sum(c.monto) from ciclo c), 0),
         (select count(*)::integer from ciclo),
         (select count(*)::integer from retail.fn_fondo_items_detalle((select array_agg(c.clave) from ciclo c)) d where d.con_foto is false),
         (select a.id from abierta a), (select a.rendida_en from abierta a), (select a.faltante from abierta a),
         coalesce((select sum(r.faltante) from retail.rendiciones_fondo r
                    where r.cuenta_id = v_fondo and r.estado = 'aprobada' and r.decision = 'deuda_persona'), 0);
end $$;

-- ---------- 14. Lo rendido queda congelado ----------
-- Un gasto pagado desde un fondo que ya está en una rendición vigente no se anula. Se toma el candado del fondo antes de mirar, para no
-- cruzarse con una rendición que se guarda a la vez.
select pg_temp.reemplazar('retail.anular_gasto(uuid, text)',
$v$  v_actor := retail.fn_actor_persona_id(true);
  if v_g.compra_id is not null then$v$,
$n$  v_actor := retail.fn_actor_persona_id(true);
  -- ADR-0362 fase 6 · actividad 5: lo rendido queda congelado.
  if exists (select 1 from retail.cuentas_dinero f where f.id = v_g.cuenta_dinero_id and f.tipo = 'fondo') then
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || (select f.persona_id from retail.cuentas_dinero f where f.id = v_g.cuenta_dinero_id)::text, 0));
    if exists (select 1 from retail.rendicion_fondo_items i where i.clave = 'gasto:' || p_gasto_id::text and i.vigente) then
      raise exception 'Ese gasto ya está en una rendición del fondo: ya no se anula. Si la rendición está por aprobar, que la devuelvan para corregirla.'
        using errcode = 'P0001', hint = 'en_rendicion';
    end if;
  end if;
  if v_g.compra_id is not null then$n$,
1);

select pg_temp.reemplazar('retail.anular_movimiento_fondo(uuid, text)',
$v$  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_duena::text, 0));$v$,
$n$  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_duena::text, 0));
  -- ADR-0362 fase 6 · actividad 5: lo rendido queda congelado.
  if exists (select 1 from retail.rendicion_fondo_items i where i.clave = 'mov:' || p_id::text and i.vigente) then
    raise exception 'Ese movimiento ya está en una rendición del fondo: ya no se anula. Si la rendición está por aprobar, que la devuelvan para corregirla.'
      using errcode = 'P0001', hint = 'en_rendicion';
  end if;$n$,
1);

-- ---------- 15. Las funciones de dinero aprenden los faltantes ----------
-- El faltante tiene sus propias puntas y va ANTES de las reglas generales (que no lo conocen): un bloque que se SUMA, sin tocar lo que
-- escribió la 182000 (si se tocara, volver a pegar la 182000 sobre esta ya no encontraría su texto).
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$  -- Qué va en cada punta.$v$,
$n$  -- ADR-0362 fase 6 · actividad 5: el faltante de una rendición sale del fondo y no va a ninguna cuenta (el Diario lo lleva a la
  -- 6599 si lo asume CAYLA o a la 1419 si es deuda de la persona). Ni cajón ni caja: no pasa por las reglas de abajo.
  if new.tipo in ('faltante_fondo_asumido', 'faltante_fondo_deuda') then
    if coalesce(v_o.tipo, '') <> 'fondo' or new.cuenta_destino_id is not null or new.caja_movimiento_id is not null
       or new.caja_ingreso_id is not null or new.rendicion_id is null then
      raise exception 'El faltante de una rendición sale de un fondo y no va a ninguna cuenta.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := v_o.ubicacion_id;
    return new;
  end if;

  -- Qué va en cada punta.$n$,
1);

select pg_temp.reemplazar('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'devolucion_fondo' then 'Devolución de fondo'$v$,
$n$    when 'devolucion_fondo' then 'Devolución de fondo'
    when 'faltante_fondo_asumido' then 'Faltante de fondo (lo asume CAYLA)'
    when 'faltante_fondo_deuda' then 'Faltante de fondo (deuda de la persona)'$n$,
1);

select pg_temp.reemplazar('retail.anular_movimiento_dinero(uuid, text)',
$v$  if v_m.tipo in ('entrega_fondo', 'devolucion_fondo') then$v$,
$n$  if v_m.tipo in ('faltante_fondo_asumido', 'faltante_fondo_deuda') then
    raise exception 'El faltante de una rendición aprobada no se anula: la rendición está cerrada.' using errcode = 'P0001';
  end if;
  if v_m.tipo in ('entrega_fondo', 'devolucion_fondo') then$n$,
1);

select pg_temp.reemplazar('retail.fn_movimientos_dinero(uuid, integer)',
$v$           and (v_lider or (d.tipo = 'deposito' and d.ubicacion_id = any (v_ubics)))$v$,
$n$           and (v_lider or (d.tipo = 'deposito' and d.ubicacion_id = any (v_ubics)))
           and d.tipo not in ('faltante_fondo_asumido', 'faltante_fondo_deuda')$n$,
1);

-- El Diario: el faltante sale de la 1413 hacia la 6599 (lo asume CAYLA) o la 1419 (deuda de la persona). Provisional hasta el contador.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$(case md.tipo when 'retiro' then '591' when 'devolucion_prestamo' then '47' else md.c_d end)::text as cuenta,$v$,
$n$(case md.tipo when 'retiro' then '591' when 'devolucion_prestamo' then '47'
                 when 'faltante_fondo_asumido' then '6599' when 'faltante_fondo_deuda' then '1419' else md.c_d end)::text as cuenta,$n$,
1);

-- ---------- 16. Permisos ----------
revoke all on function retail.fn_fondo_ciclo(uuid) from public, anon, authenticated;
revoke all on function retail.fn_fondo_items_detalle(text[]) from public, anon, authenticated;
revoke all on function retail.fn_mi_fondo_cuenta() from public, anon, authenticated;
revoke all on function retail.fn_rendicion_quien_no_aprueba(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.rendir_fondo(numeric, text, uuid) from public, anon;
revoke all on function retail.aprobar_rendicion_fondo(uuid, text, text) from public, anon;
revoke all on function retail.devolver_rendicion_fondo(uuid, text) from public, anon;
revoke all on function retail.fn_mi_ciclo_fondo() from public, anon;
revoke all on function retail.fn_rendicion_fondo_items(uuid) from public, anon;
revoke all on function retail.fn_rendiciones_fondo(text, integer) from public, anon;
revoke all on function retail.fn_mi_fondo_resumen() from public, anon;
revoke all on function retail.fn_mi_fondo_rendicion() from public, anon;
grant execute on function retail.rendir_fondo(numeric, text, uuid) to authenticated, service_role;
grant execute on function retail.aprobar_rendicion_fondo(uuid, text, text) to authenticated, service_role;
grant execute on function retail.devolver_rendicion_fondo(uuid, text) to authenticated, service_role;
grant execute on function retail.fn_mi_ciclo_fondo() to authenticated, service_role;
grant execute on function retail.fn_rendicion_fondo_items(uuid) to authenticated, service_role;
grant execute on function retail.fn_rendiciones_fondo(text, integer) to authenticated, service_role;
grant execute on function retail.fn_mi_fondo_resumen() to authenticated, service_role;
grant execute on function retail.fn_mi_fondo_rendicion() to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
