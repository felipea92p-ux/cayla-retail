-- ============================================================================
-- 20260925000000 — Activos fijos y gastos fijos del mes (ADR-0195 F2b)
--
-- EL PROBLEMA PRIMERO
--   1. Un mostrador de S/ 3,200 no es un gasto de marzo: sirve diez años. Si se registrara como gasto, marzo «perdería»
--      S/ 3,200 y los otros 119 meses nada. Un ACTIVO se reparte en su vida útil (depreciación). La tabla
--      `activos_fijos` existe desde el 2026-09-12 con 0 filas y sin pantalla; aquí se la conecta con el comprobante del
--      proveedor (decisión A: `compras.naturaleza = 'activo'`, la misma cabecera que la mercadería y los gastos).
--   2. El alquiler, la luz y el contador llegan todos los meses. Si nadie se acuerda de registrarlos, el mes sale con
--      menos gastos de los que tuvo. Un GASTO FIJO dice «cada mes, este día, más o menos este monto»: la pantalla muestra
--      cuáles ya se registraron, cuáles vienen y cuáles faltan, y propone fijos nuevos mirando lo que se repite.
--
-- LAS REGLAS
--   · Gasto y activo comparten el paso «comprobante + pago» (`fn_comprobante_y_pago`): con comprobante, la cabecera en
--     `compras` y su pago o su deuda; sin él, cómo se pagó; en efectivo, sale del cajón abierto (con su egreso) o
--     clasifica un egreso ya registrado. Una sola regla: no hay dos maneras de pagar lo mismo.
--   · Un egreso de caja respalda UNA sola cosa: un gasto, un activo o una marca «no es gasto». Lo cierran los candados de
--     las tres tablas, con el mismo candado por egreso.
--   · El costo de un activo es SIN el IGV de su factura (ese IGV se descuenta, no se deprecia). Se deprecia en línea
--     recta desde el mes siguiente a la compra, hasta que se da de baja o se acaba su vida útil.
--   · Un activo no se edita ni se borra: se da de BAJA (dejó de servir, con fecha y motivo) o se ANULA (se registró por
--     error). Con factura ya pagada no se anula, como un gasto.
--   · Los tipos de activo son una lista cerrada, cada uno con su cuenta y una vida útil sugerida (provisional: la
--     confirma el contador; SUNAT fija topes por tipo).
--   · Un gasto fijo no se borra: se archiva. Cada mes, a lo sumo UN gasto vigente por cada fijo.
--   · Todo dentro del módulo Gastos (ADR-0195: «gastos y activos fijos»): el líder, todas las tiendas y lo de la
--     empresa; con el módulo, su tienda. Firma con el responsable.
--
-- LO QUE CAMBIA DE F2a
--   · `registrar_gasto` gana `p_gasto_fijo_id` (al final, opcional): firma nueva, se quita la anterior.
--   · Los candados de gastos y de «no es gasto», y las lecturas de egresos por clasificar, miran también los activos.
--   · El candado de `compras` que obliga a anular desde Finanzas vale también para la factura de un activo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — TRES EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»):
--   PARTE 1 activos_fijos (vacía y sin uso) · PARTE 2 gastos · PARTE 3 lo nuevo. Cada una espera 3 s un candado: si dice
--   «lock timeout», se repite ESA parte. Idempotentes. Sin políticas: las dos de `activos_fijos` (de 2026-09-12) no se
--   tocan; se le quitan los permisos directos y se lee por funciones. En local y en el CI el archivo corre entero.
-- SE ROMPE SI: la web nueva se publica antes (Activos y Fijos llaman funciones que no existirían; registrar un gasto
-- manda un parámetro que la base aún no conoce).
-- ============================================================================

-- ============================== PARTE 1 · activos_fijos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Cuentas que faltaban para los activos y su depreciación (provisionales hasta el contador).
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('332', 'Edificaciones (mejoras del local)',        'activo', null,               31),
  ('333', 'Maquinarias y equipos de explotación',     'activo', null,               32),
  ('334', 'Unidades de transporte',                   'activo', null,               33),
  ('391', 'Depreciación acumulada',                   'activo', null,               34),
  ('681', 'Depreciación',                             'gasto',  'gastos_operacion', 35)
on conflict (codigo) do nothing;

-- Tipos de activo: lista cerrada, con su cuenta y la vida útil que se sugiere.
create table if not exists retail.tipos_activo (
  codigo text primary key check (codigo ~ '^[a-z_]+$'),
  nombre text not null check (trim(nombre) <> ''),
  ejemplos text not null default '',
  cuenta_pcge text not null references retail.cuentas (codigo),
  vida_util_meses integer not null check (vida_util_meses between 12 and 600),
  activo boolean not null default true,
  orden integer not null
);
comment on table retail.tipos_activo is
  'Lista CERRADA de tipos de activo fijo, con su cuenta y la vida útil sugerida (se puede ajustar al registrar). Provisional hasta que el contador la confirme.';
insert into retail.tipos_activo (codigo, nombre, ejemplos, cuenta_pcge, vida_util_meses, orden) values
  ('muebles',         'Muebles y exhibición',        'Mostrador, estantes, percheros, maniquíes',   '335', 120, 1),
  ('equipos_computo', 'Computadoras y tablets',       'Laptop, computadora, tablet de caja',          '336', 48,  2),
  ('equipos',         'Equipos',                      'Impresora de etiquetas, POS, aire, cámaras',   '336', 120, 3),
  ('maquinaria',      'Máquinas del Taller',          'Máquina de coser, remalladora, plancha',       '333', 120, 4),
  ('mejoras_local',   'Mejoras del local',            'Remodelación, instalación eléctrica, letrero', '332', 120, 5),
  ('vehiculos',       'Vehículos',                    'Moto, camioneta de reparto',                   '334', 60,  6)
on conflict (codigo) do nothing;

alter table retail.activos_fijos add column if not exists tipo text references retail.tipos_activo (codigo);
alter table retail.activos_fijos add column if not exists compra_id uuid references retail.compras (id);
alter table retail.activos_fijos add column if not exists medio_pago text;
alter table retail.activos_fijos add column if not exists caja_movimiento_id uuid references retail.caja_movimientos (id);
alter table retail.activos_fijos add column if not exists fecha_baja date;
alter table retail.activos_fijos add column if not exists motivo_baja text;
alter table retail.activos_fijos add column if not exists motivo_anulacion text;
alter table retail.activos_fijos add column if not exists anulado_por uuid references public.personas (id);
alter table retail.activos_fijos add column if not exists anulado_en timestamptz;
alter table retail.activos_fijos add column if not exists registrado_por uuid references public.personas (id);
alter table retail.activos_fijos add column if not exists token_cliente uuid;

alter table retail.activos_fijos drop constraint if exists activos_fijos_estado_check;
alter table retail.activos_fijos add constraint activos_fijos_estado_check check (estado in ('activo', 'baja', 'vendido', 'anulado'));
alter table retail.activos_fijos drop constraint if exists activos_fijos_medio_pago_check;
alter table retail.activos_fijos add constraint activos_fijos_medio_pago_check
  check (medio_pago is null or medio_pago in ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta'));
-- Igual que un gasto: sin comprobante dice cómo se pagó (efectivo ⇔ su egreso de caja); con comprobante, el pago está en
-- la factura.
alter table retail.activos_fijos drop constraint if exists activos_fijos_pago_coherente;
alter table retail.activos_fijos add constraint activos_fijos_pago_coherente check (
  (compra_id is null and medio_pago is not null and ((medio_pago = 'efectivo') = (caja_movimiento_id is not null)))
  or (compra_id is not null and medio_pago is null)
);
alter table retail.activos_fijos drop constraint if exists activos_fijos_baja_coherente;
alter table retail.activos_fijos add constraint activos_fijos_baja_coherente check (
  (estado = 'baja') = (fecha_baja is not null and motivo_baja is not null and trim(motivo_baja) <> '')
);
alter table retail.activos_fijos drop constraint if exists activos_fijos_anulacion_coherente;
alter table retail.activos_fijos add constraint activos_fijos_anulacion_coherente check (
  (estado = 'anulado') = (motivo_anulacion is not null and trim(motivo_anulacion) <> '' and anulado_en is not null)
);
alter table retail.activos_fijos drop constraint if exists activos_fijos_costo_positivo;
alter table retail.activos_fijos add constraint activos_fijos_costo_positivo
  check (costo > 0 and valor_residual >= 0 and valor_residual < costo and vida_util_meses between 1 and 600);

create unique index if not exists activos_fijos_token_uq on retail.activos_fijos (token_cliente) where token_cliente is not null;
create unique index if not exists activos_fijos_compra_uq on retail.activos_fijos (compra_id) where compra_id is not null and estado <> 'anulado';
create unique index if not exists activos_fijos_egreso_uq on retail.activos_fijos (caja_movimiento_id) where caja_movimiento_id is not null and estado <> 'anulado';

-- Nadie la escribe ni la lee directo: todo por las funciones de abajo. Las dos políticas de 2026-09-12 quedan, sin efecto
-- (no se tocan: en Supabase tocar una política bloquea auth y storage).
revoke all on retail.activos_fijos from public, anon, authenticated;
alter table retail.tipos_activo enable row level security;
revoke all on retail.tipos_activo from public, anon, authenticated;
comment on table retail.activos_fijos is
  'Activos fijos (ADR-0195 F2b): lo que sirve varios años. Con comprobante cuelga de compras (naturaleza activo); el costo es sin IGV. Se deprecia en línea recta desde el mes siguiente a la compra. No se edita ni se borra: se da de baja o se anula. Se lee por fn_activos_lista.';

reset lock_timeout;

-- ============================== PARTE 2 · gastos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  -- Nulo = «de la empresa» (el contador, el software): solo el líder.
  ubicacion_id uuid references retail.ubicaciones (id),
  categoria text not null references retail.categorias_gasto (codigo),
  descripcion text not null check (trim(descripcion) <> ''),
  proveedor_id uuid references retail.proveedores (id),
  comprobante_tipo text not null default 'factura'
    check (comprobante_tipo in ('factura', 'boleta', 'recibo_por_honorarios', 'sin_comprobante')),
  monto numeric(12,2) not null check (monto > 0),
  -- La luz cambia cada mes; el alquiler no. Solo cambia cómo se muestra («~S/ 180»).
  monto_variable boolean not null default false,
  -- Hasta el 28, para que exista en todos los meses.
  dia_del_mes smallint not null check (dia_del_mes between 1 and 28),
  activo boolean not null default true,
  creado_por uuid references public.personas (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.personas (id),
  actualizado_en timestamptz not null default now()
);
comment on table retail.gastos_fijos is
  'Lo que se paga todos los meses (alquiler, luz, contador): cuándo llega y cuánto más o menos. Cada mes se ve si ya se registró su gasto (gastos.gasto_fijo_id), si viene o si falta. No se borra: se archiva (activo = false).';
alter table retail.gastos_fijos enable row level security;
revoke all on retail.gastos_fijos from public, anon, authenticated;

alter table retail.gastos add column if not exists gasto_fijo_id uuid references retail.gastos_fijos (id);
-- Cada mes, a lo sumo un gasto vigente por cada fijo.
create unique index if not exists gastos_fijo_mes_uq on retail.gastos (gasto_fijo_id, (date_trunc('month', fecha::timestamp)))
  where estado = 'vigente' and gasto_fijo_id is not null;

reset lock_timeout;

-- ============================== PARTE 3 · lo nuevo ==============================
-- Solo funciones y disparadores sobre tablas nuevas o sin uso; ninguna tabla que use la tienda queda en exclusiva.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

update retail.modulos
   set incluye = 'Registrar y anular los gastos de su tienda (luz, alquiler, movilidad) con o sin factura, sus gastos fijos del mes y sus activos fijos, y decir qué fue cada salida de plata del cajón'
 where clave = 'gastos';

-- ---------- 1. Un egreso de caja respalda una sola cosa ----------
-- ¿Ya lo usa algo? (gasto vigente, activo no anulado o marca «no es gasto» vigente). Los tres candados la preguntan con
-- el mismo candado por egreso tomado antes.
create or replace function retail.fn_egreso_ya_usado(p_caja_movimiento_id uuid, p_salvo text default null) returns text
language sql stable set search_path = retail, public, extensions as $$
  select case
    when p_salvo is distinct from 'gasto' and exists (select 1 from retail.gastos g where g.caja_movimiento_id = p_caja_movimiento_id and g.estado = 'vigente') then 'gasto'
    when p_salvo is distinct from 'activo' and exists (select 1 from retail.activos_fijos a where a.caja_movimiento_id = p_caja_movimiento_id and a.estado <> 'anulado') then 'activo'
    when p_salvo is distinct from 'no_gasto' and exists (select 1 from retail.egresos_no_gasto e where e.caja_movimiento_id = p_caja_movimiento_id and e.revertido_en is null) then 'no_gasto'
  end;
$$;
revoke all on function retail.fn_egreso_ya_usado(uuid, text) from public, anon, authenticated;

-- El candado de gastos (F2a) ahora mira también los activos.
create or replace function retail.fn_gastos_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_mov retail.caja_movimientos%rowtype; v_ubic uuid; v_c retail.compras%rowtype; v_usado text;
begin
  if new.estado <> 'vigente' then
    return new;
  end if;
  if new.caja_movimiento_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('egreso:' || new.caja_movimiento_id::text, 0));
    select * into v_mov from retail.caja_movimientos where id = new.caja_movimiento_id;
    if not found then
      raise exception 'Ese egreso de caja no existe.' using errcode = 'P0001';
    end if;
    if v_mov.tipo <> 'egreso' then
      raise exception 'Un gasto solo se respalda con un egreso de caja, no con un ingreso.' using errcode = 'P0001';
    end if;
    if v_mov.monto <> new.monto_total then
      raise exception 'El gasto (S/ %) no coincide con el egreso de caja (S/ %).', new.monto_total, v_mov.monto using errcode = 'P0001';
    end if;
    select c.ubicacion_id into v_ubic from retail.cajas c where c.id = v_mov.caja_id;
    if new.ubicacion_id is not null and new.ubicacion_id <> v_ubic then
      raise exception 'El gasto es de otra tienda que la caja que lo pagó.' using errcode = 'P0001';
    end if;
    v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'gasto');
    if v_usado = 'no_gasto' then
      raise exception 'Ese egreso está marcado como «no es gasto»: revierte la marca primero.' using errcode = 'P0001';
    elsif v_usado = 'activo' then
      raise exception 'Ese egreso ya es un activo fijo.' using errcode = 'P0001';
    end if;
  end if;
  if new.compra_id is not null then
    select * into v_c from retail.compras where id = new.compra_id;
    if not found or v_c.naturaleza <> 'gasto' or v_c.estado <> 'vigente' then
      raise exception 'El comprobante de un gasto tiene que ser un comprobante de gasto vigente.' using errcode = 'P0001';
    end if;
    if v_c.total <> new.monto_total or v_c.igv <> new.igv or v_c.ubicacion_gestion_id is distinct from new.ubicacion_id then
      raise exception 'El gasto no coincide con su comprobante (total, IGV o tienda).' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- «No es gasto» tampoco convive con un activo.
create or replace function retail.fn_egresos_no_gasto_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_mov retail.caja_movimientos%rowtype; v_usado text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Una marca «no es gasto» no se borra: se revierte.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if old.revertido_en is not null then
      raise exception 'Esa marca ya se revirtió.' using errcode = 'P0001';
    end if;
    if new.revertido_en is null
       or (new.id, new.caja_movimiento_id, new.tipo, new.motivo, new.revisado_por, new.revisado_en)
          is distinct from (old.id, old.caja_movimiento_id, old.tipo, old.motivo, old.revisado_por, old.revisado_en) then
      raise exception 'Una marca «no es gasto» solo cambia para revertirse.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('egreso:' || new.caja_movimiento_id::text, 0));
  select * into v_mov from retail.caja_movimientos where id = new.caja_movimiento_id;
  if not found or v_mov.tipo <> 'egreso' then
    raise exception 'Solo un egreso de caja se marca como «no es gasto».' using errcode = 'P0001';
  end if;
  v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'no_gasto');
  if v_usado = 'gasto' then
    raise exception 'Ese egreso ya es un gasto: anula el gasto primero.' using errcode = 'P0001';
  elsif v_usado = 'activo' then
    raise exception 'Ese egreso ya es un activo fijo: anula el activo primero.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 2. Candados del activo ----------
create or replace function retail.fn_activos_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_mov retail.caja_movimientos%rowtype; v_ubic uuid; v_c retail.compras%rowtype; v_usado text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Un activo no se borra: se da de baja o se anula.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if old.estado in ('anulado', 'baja', 'vendido') then
      raise exception 'Un activo dado de baja o anulado no se modifica.' using errcode = 'P0001';
    end if;
    if new.estado not in ('baja', 'anulado') then
      raise exception 'Un activo solo cambia para darse de baja o anularse.' using errcode = 'P0001';
    end if;
    if (new.id, new.ubicacion_id, new.tipo, new.nombre, new.serie, new.descripcion, new.cuenta_codigo, new.costo,
        new.valor_residual, new.vida_util_meses, new.tasa_anual, new.fecha_adquisicion, new.depreciacion_apertura,
        new.compra_id, new.medio_pago, new.caja_movimiento_id, new.registrado_por, new.token_cliente, new.created_at)
       is distinct from
       (old.id, old.ubicacion_id, old.tipo, old.nombre, old.serie, old.descripcion, old.cuenta_codigo, old.costo,
        old.valor_residual, old.vida_util_meses, old.tasa_anual, old.fecha_adquisicion, old.depreciacion_apertura,
        old.compra_id, old.medio_pago, old.caja_movimiento_id, old.registrado_por, old.token_cliente, old.created_at) then
      raise exception 'Un activo no se edita: se anula y se registra de nuevo.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- INSERT
  if new.caja_movimiento_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('egreso:' || new.caja_movimiento_id::text, 0));
    select * into v_mov from retail.caja_movimientos where id = new.caja_movimiento_id;
    if not found or v_mov.tipo <> 'egreso' then
      raise exception 'Un activo solo se respalda con un egreso de caja.' using errcode = 'P0001';
    end if;
    select c.ubicacion_id into v_ubic from retail.cajas c where c.id = v_mov.caja_id;
    if v_ubic <> new.ubicacion_id then
      raise exception 'El activo es de otra tienda que la caja que lo pagó.' using errcode = 'P0001';
    end if;
    if v_mov.monto <> coalesce((select total from retail.compras where id = new.compra_id), new.costo) then
      raise exception 'El activo no coincide con el egreso de caja (S/ %).', v_mov.monto using errcode = 'P0001';
    end if;
    v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'activo');
    if v_usado is not null then
      raise exception 'Ese egreso de caja ya se usó (%).', case v_usado when 'gasto' then 'es un gasto' else 'está marcado «no es gasto»' end
        using errcode = 'P0001';
    end if;
  end if;
  if new.compra_id is not null then
    select * into v_c from retail.compras where id = new.compra_id;
    if not found or v_c.naturaleza <> 'activo' or v_c.estado <> 'vigente' then
      raise exception 'El comprobante de un activo tiene que ser un comprobante de activo vigente.' using errcode = 'P0001';
    end if;
    if v_c.total - v_c.igv <> new.costo or v_c.ubicacion_gestion_id is distinct from new.ubicacion_id then
      raise exception 'El activo no coincide con su comprobante (costo sin IGV o tienda).' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create or replace trigger activos_fijos_validar before insert or update or delete on retail.activos_fijos
  for each row execute function retail.fn_activos_validar();
revoke all on function retail.fn_activos_validar() from public, anon, authenticated;

-- La factura de un gasto O de un activo se anula desde Finanzas, con lo que detalla.
create or replace function retail.fn_compras_gasto_se_anula_desde_gastos() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    if new.naturaleza = 'gasto' and exists (select 1 from retail.gastos g where g.compra_id = new.id and g.estado = 'vigente') then
      raise exception 'Este comprobante es de un gasto: anúlalo desde Finanzas ▸ Gastos (se anula el gasto con él).' using errcode = '23514';
    end if;
    if new.naturaleza = 'activo' and exists (select 1 from retail.activos_fijos a where a.compra_id = new.id and a.estado <> 'anulado') then
      raise exception 'Este comprobante es de un activo fijo: anúlalo desde Finanzas ▸ Gastos ▸ Activos fijos.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- ---------- 3. El paso compartido: comprobante + pago ----------
-- Lo usan `registrar_gasto` y `registrar_activo`. Valida el comprobante y el medio, crea el egreso de caja (efectivo del
-- cajón abierto, con la MISMA función de caja de siempre) o valida el egreso a clasificar, crea la cabecera en `compras`
-- (con la naturaleza que corresponde) y su pago al contado. No se llama desde afuera: no tiene permiso para nadie.
create or replace function retail.fn_comprobante_y_pago(
  p_naturaleza text,
  p_ubicacion_id uuid,
  p_fecha date,
  p_monto numeric,
  p_descripcion text,
  p_comprobante jsonb,
  p_medio_pago text,
  p_caja_id uuid,
  p_caja_movimiento_id uuid,
  p_referencia text,
  p_nota_caja text,
  p_actor uuid,
  out o_compra_id uuid,
  out o_caja_movimiento_id uuid,
  out o_igv numeric
)
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_tipo text; v_prov uuid; v_serie text; v_numero text; v_cond text; v_vence date;
  v_ubic_caja uuid;
begin
  o_igv := 0;
  o_caja_movimiento_id := p_caja_movimiento_id;
  if p_comprobante is not null then
    v_tipo := p_comprobante->>'tipo';
    v_prov := nullif(p_comprobante->>'proveedor_id', '')::uuid;
    v_serie := upper(trim(coalesce(p_comprobante->>'serie', '')));
    v_numero := trim(coalesce(p_comprobante->>'numero', ''));
    v_cond := coalesce(p_comprobante->>'condicion', 'contado');
    v_vence := nullif(p_comprobante->>'fecha_vencimiento', '')::date;
    if v_tipo is null or v_tipo not in ('factura', 'boleta', 'recibo_por_honorarios') then
      raise exception 'El comprobante tiene que ser factura, boleta o recibo por honorarios.' using errcode = 'P0001';
    end if;
    if p_naturaleza = 'activo' and v_tipo = 'recibo_por_honorarios' then
      raise exception 'Un activo no llega con recibo por honorarios: es factura o boleta.' using errcode = 'P0001';
    end if;
    if v_prov is null or not exists (select 1 from retail.proveedores where id = v_prov) then
      raise exception 'Elige el proveedor del comprobante.' using errcode = 'P0001';
    end if;
    if v_serie = '' or v_numero = '' then
      raise exception 'Escribe la serie y el número del comprobante.' using errcode = 'P0001';
    end if;
    if v_cond not in ('contado', 'credito') then
      raise exception 'Di si se pagó o si queda a crédito.' using errcode = 'P0001';
    end if;
    if v_cond = 'credito' and (v_vence is null or v_vence < p_fecha) then
      raise exception 'A crédito, di cuándo vence (no antes de la fecha del comprobante).' using errcode = 'P0001';
    end if;
    if v_tipo = 'factura' then
      o_igv := coalesce(round((p_comprobante->>'igv')::numeric, 2), round(p_monto - p_monto / (1 + retail.fn_tasa_igv(p_fecha)), 2));
      if o_igv < 0 or o_igv >= p_monto then
        raise exception 'El IGV tiene que estar entre cero y el total.' using errcode = 'P0001';
      end if;
    end if;
    if exists (select 1 from retail.compras where proveedor_id = v_prov and serie = v_serie and numero = v_numero) then
      raise exception 'Ese comprobante (% %-%) ya está registrado, como mercadería, gasto o activo.', v_tipo, v_serie, v_numero
        using errcode = '23505';
    end if;
    if v_cond = 'credito' then
      if p_medio_pago is not null or p_caja_id is not null or p_caja_movimiento_id is not null then
        raise exception 'A crédito todavía no se paga: se paga desde Por pagar.' using errcode = 'P0001';
      end if;
    elsif p_medio_pago is null or p_medio_pago not in ('efectivo', 'yape', 'plin', 'transferencia', 'deposito', 'tarjeta') then
      raise exception 'Di cómo se pagó.' using errcode = 'P0001';
    end if;
  elsif p_medio_pago is null or p_medio_pago not in ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta') then
    raise exception 'Di cómo se pagó.' using errcode = 'P0001';
  end if;

  if p_medio_pago = 'efectivo' then
    if (p_caja_id is null) = (p_caja_movimiento_id is null) then
      raise exception 'En efectivo, sale de la caja abierta o clasifica un egreso ya registrado (uno de los dos).' using errcode = 'P0001';
    end if;
  elsif p_caja_id is not null or p_caja_movimiento_id is not null then
    raise exception 'Solo lo pagado en efectivo se une a la caja.' using errcode = 'P0001';
  end if;

  if p_caja_movimiento_id is not null then
    select c.ubicacion_id into v_ubic_caja
      from retail.caja_movimientos m join retail.cajas c on c.id = m.caja_id where m.id = p_caja_movimiento_id;
    if v_ubic_caja is null or not retail.fn_gastos_puede(v_ubic_caja) then
      raise exception 'Ese egreso de caja no es de una tienda tuya.' using errcode = '42501';
    end if;
  end if;

  if p_caja_id is not null then
    select ubicacion_id into v_ubic_caja from retail.cajas where id = p_caja_id;
    if v_ubic_caja is null then
      raise exception 'Esa caja no existe.' using errcode = 'P0001';
    end if;
    if p_ubicacion_id is not null and p_ubicacion_id <> v_ubic_caja then
      raise exception 'Es de otra tienda que la caja que lo paga.' using errcode = 'P0001';
    end if;
    o_caja_movimiento_id := retail.registrar_movimiento_caja(p_caja_id, 'egreso', p_monto, 'Otro',
      left(p_nota_caja || case when v_tipo is not null then ' (' || v_serie || '-' || v_numero || ')' else '' end, 200), false, null::uuid);
  end if;

  if p_comprobante is not null then
    insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
                                subtotal, igv, total, estado, nota, usuario_id, naturaleza, ubicacion_gestion_id)
    values (v_prov, v_tipo, v_serie, v_numero, p_fecha, v_cond, case when v_cond = 'credito' then v_vence end,
            p_monto - o_igv, o_igv, p_monto, 'vigente', trim(p_descripcion), p_actor, p_naturaleza, p_ubicacion_id)
    returning id into o_compra_id;
    if v_cond = 'contado' then
      insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id)
      values (o_compra_id, p_fecha, p_monto, p_medio_pago, nullif(trim(coalesce(p_referencia, '')), ''), p_actor, p_ubicacion_id);
    end if;
  end if;
end $$;
revoke all on function retail.fn_comprobante_y_pago(text, uuid, date, numeric, text, jsonb, text, uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- ---------- 4. registrar_gasto, ahora con su gasto fijo ----------
drop function if exists retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid);
create or replace function retail.registrar_gasto(
  p_ubicacion_id uuid,
  p_categoria text,
  p_descripcion text,
  p_fecha date,
  p_monto_total numeric,
  p_comprobante jsonb default null,
  p_medio_pago text default null,
  p_caja_id uuid default null,
  p_caja_movimiento_id uuid default null,
  p_referencia text default null,
  p_token uuid default null,
  p_gasto_fijo_id uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_cat retail.categorias_gasto%rowtype;
  v_fijo retail.gastos_fijos%rowtype;
  v_id uuid;
  v_monto numeric := round(p_monto_total, 2);
  v_pago record;
begin
  -- Doble clic / reintento: el segundo intento espera al primero y devuelve SU gasto (ADR-0190).
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('gastos:' || p_token::text, 0));
    select id into v_id from retail.gastos where token_cliente = p_token;
    if found then return v_id; end if;
  end if;

  if not retail.fn_gastos_puede(p_ubicacion_id) then
    if p_ubicacion_id is null then
      raise exception 'Solo el líder registra gastos «de la empresa».' using errcode = '42501';
    end if;
    raise exception 'No puedes registrar gastos de esa tienda: necesitas el módulo Gastos en tu rol, y solo de tu tienda.' using errcode = '42501';
  end if;
  select * into v_cat from retail.categorias_gasto where codigo = p_categoria;
  if not found or not v_cat.activo then
    raise exception 'Elige una categoría de la lista.' using errcode = 'P0001';
  end if;
  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Escribe qué se pagó.' using errcode = 'P0001';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha del gasto no puede ser futura.' using errcode = 'P0001';
  end if;
  if p_gasto_fijo_id is not null then
    select * into v_fijo from retail.gastos_fijos where id = p_gasto_fijo_id;
    if not found or not v_fijo.activo then
      raise exception 'Ese gasto fijo no existe o está archivado.' using errcode = 'P0001';
    end if;
    if v_fijo.ubicacion_id is distinct from p_ubicacion_id then
      raise exception 'El gasto fijo es de otra tienda.' using errcode = 'P0001';
    end if;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  select * into v_pago from retail.fn_comprobante_y_pago('gasto', p_ubicacion_id, p_fecha, v_monto, p_descripcion, p_comprobante,
    p_medio_pago, p_caja_id, p_caja_movimiento_id, p_referencia, 'Gasto · ' || v_cat.nombre || ' — ' || trim(p_descripcion), v_actor);

  insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id, medio_pago,
                             caja_movimiento_id, registrado_por, token_cliente, gasto_fijo_id)
  values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_fecha, v_monto, v_pago.o_igv, v_pago.o_compra_id,
          case when v_pago.o_compra_id is null then p_medio_pago end, v_pago.o_caja_movimiento_id, v_actor, p_token, p_gasto_fijo_id)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.gastos where token_cliente = p_token) then
    return (select id from retail.gastos where token_cliente = p_token);
  end if;
  if p_caja_movimiento_id is not null then
    raise exception 'Ese egreso de caja ya se usó.' using errcode = '23505';
  end if;
  if p_gasto_fijo_id is not null then
    raise exception 'Ese gasto fijo ya tiene su gasto de este mes.' using errcode = '23505';
  end if;
  raise;
end $$;

-- ---------- 5. Activos: registrar, anular y dar de baja ----------
create or replace function retail.registrar_activo(
  p_ubicacion_id uuid,
  p_tipo text,
  p_nombre text,
  p_fecha date,
  p_monto_total numeric,
  p_comprobante jsonb default null,
  p_medio_pago text default null,
  p_caja_id uuid default null,
  p_caja_movimiento_id uuid default null,
  p_referencia text default null,
  p_vida_util_meses integer default null,
  p_serie text default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_tipo retail.tipos_activo%rowtype;
  v_vida integer;
  v_id uuid;
  v_monto numeric := round(p_monto_total, 2);
  v_pago record;
begin
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('activos:' || p_token::text, 0));
    select id into v_id from retail.activos_fijos where token_cliente = p_token;
    if found then return v_id; end if;
  end if;
  if p_ubicacion_id is null then
    raise exception 'Un activo está en una tienda, el Taller o el almacén: elige dónde.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(p_ubicacion_id) then
    raise exception 'No puedes registrar activos de esa tienda: necesitas el módulo Gastos en tu rol, y solo de tu tienda.' using errcode = '42501';
  end if;
  select * into v_tipo from retail.tipos_activo where codigo = p_tipo;
  if not found or not v_tipo.activo then
    raise exception 'Elige qué tipo de activo es.' using errcode = 'P0001';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Escribe qué es.' using errcode = 'P0001';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha de compra no puede ser futura.' using errcode = 'P0001';
  end if;
  v_vida := coalesce(p_vida_util_meses, v_tipo.vida_util_meses);
  if v_vida < 12 or v_vida > 600 then
    raise exception 'La vida útil va de 1 a 50 años.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  select * into v_pago from retail.fn_comprobante_y_pago('activo', p_ubicacion_id, p_fecha, v_monto, p_nombre, p_comprobante,
    p_medio_pago, p_caja_id, p_caja_movimiento_id, p_referencia, 'Activo · ' || v_tipo.nombre || ' — ' || trim(p_nombre), v_actor);

  insert into retail.activos_fijos (ubicacion_id, tipo, nombre, serie, cuenta_codigo, costo, valor_residual, vida_util_meses,
                                    tasa_anual, fecha_adquisicion, estado, compra_id, medio_pago, caja_movimiento_id,
                                    registrado_por, token_cliente)
  values (p_ubicacion_id, p_tipo, trim(p_nombre), nullif(trim(coalesce(p_serie, '')), ''), v_tipo.cuenta_pcge,
          v_monto - v_pago.o_igv, 0, v_vida, round(12.0 / v_vida, 4), p_fecha, 'activo', v_pago.o_compra_id,
          case when v_pago.o_compra_id is null then p_medio_pago end, v_pago.o_caja_movimiento_id, v_actor, p_token)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.activos_fijos where token_cliente = p_token) then
    return (select id from retail.activos_fijos where token_cliente = p_token);
  end if;
  if p_caja_movimiento_id is not null then
    raise exception 'Ese egreso de caja ya se usó.' using errcode = '23505';
  end if;
  raise;
end $$;

-- Se registró por error. Con factura ya pagada no se anula (como un gasto).
create or replace function retail.anular_activo(p_activo_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_a retail.activos_fijos%rowtype; v_actor uuid;
begin
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  select * into v_a from retail.activos_fijos where id = p_activo_id for update;
  if not found then
    raise exception 'Ese activo no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_a.ubicacion_id) then
    raise exception 'No puedes anular activos de esa tienda.' using errcode = '42501';
  end if;
  if v_a.estado <> 'activo' then
    raise exception 'Solo se anula un activo en uso (este está %).', v_a.estado using errcode = 'P0001';
  end if;
  if v_a.compra_id is not null and exists (select 1 from retail.compra_pagos where compra_id = v_a.compra_id) then
    raise exception 'Su comprobante ya tiene pagos: no se anula (como en Compras). Si ya no sirve, dalo de baja.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  update retail.activos_fijos set estado = 'anulado', motivo_anulacion = trim(p_motivo), anulado_por = v_actor, anulado_en = now()
   where id = p_activo_id;
  if v_a.compra_id is not null then
    update retail.compras set estado = 'anulada', motivo_anulacion = trim(p_motivo), anulada_por = v_actor, anulada_at = now()
     where id = v_a.compra_id and estado = 'vigente';
  end if;
end $$;

-- Dejó de servir (se malogró, se regaló, se botó). Desde ese mes ya no se deprecia; su valor pendiente es pérdida (F5).
create or replace function retail.dar_de_baja_activo(p_activo_id uuid, p_fecha date, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_a retail.activos_fijos%rowtype;
begin
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se da de baja.' using errcode = 'P0001';
  end if;
  select * into v_a from retail.activos_fijos where id = p_activo_id for update;
  if not found then
    raise exception 'Ese activo no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_a.ubicacion_id) then
    raise exception 'No puedes dar de baja activos de esa tienda.' using errcode = '42501';
  end if;
  if v_a.estado <> 'activo' then
    raise exception 'Ese activo ya no está en uso.' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha < v_a.fecha_adquisicion or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha de baja va desde la compra hasta hoy.' using errcode = 'P0001';
  end if;
  perform retail.fn_actor_persona_id(true);
  update retail.activos_fijos set estado = 'baja', fecha_baja = p_fecha, motivo_baja = trim(p_motivo) where id = p_activo_id;
end $$;

-- ---------- 6. Depreciación: una sola cuenta ----------
-- Meses depreciados a una fecha de corte: desde el mes SIGUIENTE a la compra, hasta el corte (o la baja), sin pasar la
-- vida útil. Línea recta: (costo − residual) ÷ vida útil por mes.
create or replace function retail.fn_meses_depreciados(p_fecha_adquisicion date, p_vida integer, p_corte date, p_fecha_baja date default null)
returns integer language sql immutable as $$
  select greatest(0, least(p_vida,
    (extract(year from least(p_corte, coalesce(p_fecha_baja, p_corte)))::int * 12 + extract(month from least(p_corte, coalesce(p_fecha_baja, p_corte)))::int)
    - (extract(year from p_fecha_adquisicion)::int * 12 + extract(month from p_fecha_adquisicion)::int)));
$$;

create or replace function retail.fn_activos_lista(p_corte date default null, p_ubicacion_id uuid default null)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, tipo text, tipo_nombre text, cuenta text, nombre text, serie text,
  fecha_adquisicion date, costo numeric, vida_util_meses integer, depreciacion_mensual numeric, meses_depreciados integer,
  depreciacion_acumulada numeric, valor_hoy numeric, estado text, fecha_baja date, motivo_baja text, compra_id uuid,
  comprobante text, comprobante_tipo text, proveedor_nombre text, condicion text, saldo numeric, tiene_pagos boolean,
  medio_pago text, caja_movimiento_id uuid, motivo_anulacion text, registrado_por_nombre text, creado_en timestamptz
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los activos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select a.id, a.ubicacion_id, u.nombre, a.tipo, t.nombre, a.cuenta_codigo, a.nombre, a.serie, a.fecha_adquisicion, a.costo,
         a.vida_util_meses,
         round((a.costo - a.valor_residual) / a.vida_util_meses, 2),
         m.meses,
         least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * m.meses, 2) + a.depreciacion_apertura),
         a.costo - least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * m.meses, 2) + a.depreciacion_apertura),
         a.estado, a.fecha_baja, a.motivo_baja, a.compra_id, c.documento, c.tipo, p.nombre, c.condicion, c.saldo,
         exists (select 1 from retail.compra_pagos x where x.compra_id = a.compra_id), a.medio_pago, a.caja_movimiento_id,
         a.motivo_anulacion, trim(concat_ws(' ', pe.nombres, pe.apellidos)), a.created_at
    from retail.activos_fijos a
    cross join lateral (select retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, v_corte, a.fecha_baja) as meses) m
    left join retail.tipos_activo t on t.codigo = a.tipo
    left join retail.ubicaciones u on u.id = a.ubicacion_id
    left join retail.compras c on c.id = a.compra_id
    left join retail.proveedores p on p.id = c.proveedor_id
    left join public.personas pe on pe.id = a.registrado_por
   where a.ubicacion_id = any (v_ubics)
     and (p_ubicacion_id is null or a.ubicacion_id = p_ubicacion_id)
   order by (a.estado = 'activo') desc, a.fecha_adquisicion desc, a.created_at desc;
end $$;

-- La depreciación de un mes, por ubicación: lo que el Estado de Resultados (F5) suma como gasto 681. Es lo acumulado a fin
-- de mes menos lo acumulado a fin del mes anterior (cada uno redondeado desde la tasa exacta): así los meses de un activo
-- suman exactamente su costo, sin arrastrar redondeos (16.67 + 16.66 + 16.67…, no 120 × 16.67).
create or replace function retail.fn_depreciacion_mes(p_mes date)
returns table (ubicacion_id uuid, monto numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  with cortes as (
    select (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fin, (date_trunc('month', p_mes) - interval '1 day')::date as fin_anterior
  ), por_activo as (
    select a.ubicacion_id,
           least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, k.fin, a.fecha_baja), 2))
           - least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, k.fin_anterior, a.fecha_baja), 2)) as monto
      from retail.activos_fijos a cross join cortes k
     where a.estado in ('activo', 'baja')
       and a.ubicacion_id = any (retail.fn_gastos_ubicaciones())
  )
  select ubicacion_id, sum(monto)::numeric(12,2) from por_activo where monto > 0 group by ubicacion_id;
$$;

create or replace function retail.fn_tipos_activo()
returns table (codigo text, nombre text, ejemplos text, cuenta text, cuenta_nombre text, vida_util_meses integer)
language sql stable security definer set search_path = retail, public, extensions as $$
  select t.codigo, t.nombre, t.ejemplos, t.cuenta_pcge, k.nombre, t.vida_util_meses
    from retail.tipos_activo t join retail.cuentas k on k.codigo = t.cuenta_pcge
   where t.activo order by t.orden;
$$;

-- ---------- 7. Gastos fijos ----------
create or replace function retail.guardar_gasto_fijo(
  p_id uuid,
  p_ubicacion_id uuid,
  p_categoria text,
  p_descripcion text,
  p_proveedor_id uuid,
  p_comprobante_tipo text,
  p_monto numeric,
  p_monto_variable boolean,
  p_dia_del_mes integer
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actual retail.gastos_fijos%rowtype; v_actor uuid; v_id uuid := p_id;
begin
  if not retail.fn_gastos_puede(p_ubicacion_id) then
    raise exception 'No puedes guardar gastos fijos de esa tienda.' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.categorias_gasto where codigo = p_categoria and activo) then
    raise exception 'Elige una categoría de la lista.' using errcode = 'P0001';
  end if;
  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Escribe qué se paga.' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_dia_del_mes is null or p_dia_del_mes not between 1 and 28 then
    raise exception 'El día va del 1 al 28 (para que exista en todos los meses).' using errcode = 'P0001';
  end if;
  if p_proveedor_id is not null and not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if p_id is null then
    insert into retail.gastos_fijos (ubicacion_id, categoria, descripcion, proveedor_id, comprobante_tipo, monto, monto_variable,
                                     dia_del_mes, creado_por, actualizado_por)
    values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_proveedor_id, coalesce(p_comprobante_tipo, 'factura'),
            round(p_monto, 2), coalesce(p_monto_variable, false), p_dia_del_mes, v_actor, v_actor)
    returning id into v_id;
  else
    select * into v_actual from retail.gastos_fijos where id = p_id for update;
    if not found or not v_actual.activo then
      raise exception 'Ese gasto fijo no existe o está archivado.' using errcode = 'P0001';
    end if;
    if not retail.fn_gastos_puede(v_actual.ubicacion_id) then
      raise exception 'Ese gasto fijo es de otra tienda.' using errcode = '42501';
    end if;
    update retail.gastos_fijos
       set ubicacion_id = p_ubicacion_id, categoria = p_categoria, descripcion = trim(p_descripcion), proveedor_id = p_proveedor_id,
           comprobante_tipo = coalesce(p_comprobante_tipo, 'factura'), monto = round(p_monto, 2),
           monto_variable = coalesce(p_monto_variable, false), dia_del_mes = p_dia_del_mes, actualizado_por = v_actor, actualizado_en = now()
     where id = p_id;
  end if;
  return v_id;
end $$;

create or replace function retail.archivar_gasto_fijo(p_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_f retail.gastos_fijos%rowtype;
begin
  select * into v_f from retail.gastos_fijos where id = p_id for update;
  if not found then
    raise exception 'Ese gasto fijo no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_f.ubicacion_id) then
    raise exception 'Ese gasto fijo es de otra tienda.' using errcode = '42501';
  end if;
  update retail.gastos_fijos set activo = false, actualizado_por = retail.fn_actor_persona_id(true), actualizado_en = now() where id = p_id;
end $$;

-- Los fijos de un mes: ya registrado, viene (su día todavía no llega) o falta (pasó su día y no hay gasto).
create or replace function retail.fn_gastos_fijos_mes(p_mes date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text, descripcion text,
  proveedor_id uuid, proveedor_nombre text, comprobante_tipo text, monto numeric, monto_variable boolean,
  dia_del_mes smallint, fecha_esperada date, estado text, gasto_id uuid, gasto_monto numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_es_lider();
        v_ini date := date_trunc('month', p_mes)::date; v_hoy date := retail.fn_hoy_lima();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos fijos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select f.id, f.ubicacion_id, coalesce(u.nombre, 'De la empresa'), f.categoria, k.nombre, f.descripcion, f.proveedor_id, p.nombre,
         f.comprobante_tipo, f.monto, f.monto_variable, f.dia_del_mes, (v_ini + (f.dia_del_mes - 1))::date,
         case when g.id is not null then 'registrado' when (v_ini + (f.dia_del_mes - 1)) < v_hoy then 'falta' else 'por_llegar' end,
         g.id, g.monto_total
    from retail.gastos_fijos f
    join retail.categorias_gasto k on k.codigo = f.categoria
    left join retail.ubicaciones u on u.id = f.ubicacion_id
    left join retail.proveedores p on p.id = f.proveedor_id
    left join lateral (
      select x.id, x.monto_total from retail.gastos x
       where x.gasto_fijo_id = f.id and x.estado = 'vigente'
         and x.fecha >= v_ini and x.fecha < (v_ini + interval '1 month')::date
       limit 1
    ) g on true
   where f.activo
     and ((f.ubicacion_id is null and v_lider) or f.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or f.ubicacion_id = p_ubicacion_id)
     and (not p_solo_empresa or f.ubicacion_id is null)
   order by (g.id is not null), f.dia_del_mes, f.descripcion;
end $$;

-- Lo que se repite y todavía no es un fijo: el mismo proveedor (o la misma categoría sin proveedor) en la misma tienda, en
-- al menos 2 de los últimos 3 meses cerrados. Se propone con el monto promedio y el día más común.
create or replace function retail.fn_gastos_fijos_sugeridos()
returns table (ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text, proveedor_id uuid,
               proveedor_nombre text, descripcion text, comprobante_tipo text, monto numeric, dia_del_mes integer, meses integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_es_lider();
        v_hasta date := date_trunc('month', retail.fn_hoy_lima())::date; v_desde date := (date_trunc('month', retail.fn_hoy_lima()) - interval '3 months')::date;
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos fijos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  with base as (
    select g.ubicacion_id, g.categoria, c.proveedor_id, coalesce(c.tipo, 'sin_comprobante') as comprobante_tipo, g.descripcion,
           g.monto_total, g.fecha, date_trunc('month', g.fecha::timestamp) as mes
      from retail.gastos g left join retail.compras c on c.id = g.compra_id
     where g.estado = 'vigente' and g.gasto_fijo_id is null
       and g.fecha >= v_desde and g.fecha < v_hasta
       and ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
  ), grupos as (
    select b.ubicacion_id, b.categoria, b.proveedor_id,
           count(distinct b.mes)::int as meses,
           round(avg(b.monto_total), 2) as monto,
           least(28, mode() within group (order by extract(day from b.fecha)::int)) as dia,
           (array_agg(b.descripcion order by b.fecha desc))[1] as descripcion,
           (array_agg(b.comprobante_tipo order by b.fecha desc))[1] as comprobante_tipo
      from base b
     group by b.ubicacion_id, b.categoria, b.proveedor_id
    having count(distinct b.mes) >= 2
  )
  select x.ubicacion_id, coalesce(u.nombre, 'De la empresa'), x.categoria, k.nombre, x.proveedor_id, p.nombre, x.descripcion,
         x.comprobante_tipo, x.monto, x.dia, x.meses
    from grupos x
    join retail.categorias_gasto k on k.codigo = x.categoria
    left join retail.ubicaciones u on u.id = x.ubicacion_id
    left join retail.proveedores p on p.id = x.proveedor_id
   where not exists (
     select 1 from retail.gastos_fijos f
      where f.activo and f.ubicacion_id is not distinct from x.ubicacion_id and f.categoria = x.categoria
        and f.proveedor_id is not distinct from x.proveedor_id
   )
   order by x.meses desc, x.monto desc;
end $$;

-- ---------- 8. Las lecturas de egresos por clasificar también saltan los activos ----------
create or replace function retail.fn_egresos_sin_clasificar(p_ubicacion_id uuid default null, p_limite integer default 200)
returns table (id uuid, caja_id uuid, ubicacion_id uuid, ubicacion_nombre text, monto numeric, motivo text, nota text,
               registrado_por_nombre text, creado_en timestamptz, caja_abierta boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones();
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los egresos de caja necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select m.id, m.caja_id, k.ubicacion_id, u.nombre, m.monto, m.motivo, m.nota, trim(concat_ws(' ', pe.nombres, pe.apellidos)),
         m.created_at, k.estado = 'abierta'
    from retail.caja_movimientos m
    join retail.cajas k on k.id = m.caja_id
    join retail.ubicaciones u on u.id = k.ubicacion_id
    left join public.personas pe on pe.id = m.usuario_id
   where m.tipo = 'egreso'
     and k.ubicacion_id = any (v_ubics)
     and (p_ubicacion_id is null or k.ubicacion_id = p_ubicacion_id)
     and retail.fn_egreso_ya_usado(m.id) is null
   order by m.created_at desc
   limit greatest(p_limite, 1);
end $$;

-- El panel de gastos: el conteo de egresos por clasificar salta también los activos (el resto, igual que F2a).
do $$
declare v_def text; v_hay integer;
begin
  v_def := pg_get_functiondef('retail.fn_gastos_panel(date, date, uuid, boolean)'::regprocedure);
  if position('fn_egreso_ya_usado' in v_def) > 0 then
    return;
  end if;
  select count(*) into v_hay from regexp_matches(v_def,
    'and not exists \(select 1 from retail\.gastos g where g\.caja_movimiento_id = m\.id and g\.estado = ''vigente''\)\s+and not exists \(select 1 from retail\.egresos_no_gasto e where e\.caja_movimiento_id = m\.id and e\.revertido_en is null\)', 'g');
  if v_hay <> 1 then
    raise exception 'fn_gastos_panel cambió en la base: revisar antes de pegar (anclas: %).', v_hay;
  end if;
  execute regexp_replace(v_def,
    'and not exists \(select 1 from retail\.gastos g where g\.caja_movimiento_id = m\.id and g\.estado = ''vigente''\)\s+and not exists \(select 1 from retail\.egresos_no_gasto e where e\.caja_movimiento_id = m\.id and e\.revertido_en is null\)',
    'and retail.fn_egreso_ya_usado(m.id) is null');
end $$;

-- ---------- Permisos ----------
revoke all on function retail.fn_meses_depreciados(date, integer, date, date) from public, anon;
revoke all on function retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid) from public, anon;
revoke all on function retail.registrar_activo(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, integer, text, uuid) from public, anon;
revoke all on function retail.anular_activo(uuid, text) from public, anon;
revoke all on function retail.dar_de_baja_activo(uuid, date, text) from public, anon;
revoke all on function retail.fn_activos_lista(date, uuid) from public, anon;
revoke all on function retail.fn_depreciacion_mes(date) from public, anon;
revoke all on function retail.fn_tipos_activo() from public, anon;
revoke all on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer) from public, anon;
revoke all on function retail.archivar_gasto_fijo(uuid) from public, anon;
revoke all on function retail.fn_gastos_fijos_mes(date, uuid, boolean) from public, anon;
revoke all on function retail.fn_gastos_fijos_sugeridos() from public, anon;
grant execute on function retail.fn_meses_depreciados(date, integer, date, date) to authenticated;
grant execute on function retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function retail.registrar_activo(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, integer, text, uuid) to authenticated;
grant execute on function retail.anular_activo(uuid, text) to authenticated;
grant execute on function retail.dar_de_baja_activo(uuid, date, text) to authenticated;
grant execute on function retail.fn_activos_lista(date, uuid) to authenticated;
grant execute on function retail.fn_depreciacion_mes(date) to authenticated;
grant execute on function retail.fn_tipos_activo() to authenticated;
grant execute on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer) to authenticated;
grant execute on function retail.archivar_gasto_fijo(uuid) to authenticated;
grant execute on function retail.fn_gastos_fijos_mes(date, uuid, boolean) to authenticated;
grant execute on function retail.fn_gastos_fijos_sugeridos() to authenticated;

reset lock_timeout;
