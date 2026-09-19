-- 20260918193000_gastos.sql — ADR-0117 (aprobado por Felipe, 2026-09-18)
--
-- EL PROBLEMA QUE RESUELVE
-- No existía dónde guardar alquiler, luz, planilla ni publicidad: el Estado de
-- Resultados no tenía de dónde sacarlos. Pero el riesgo no era crear la tabla,
-- era CONTAR DOS VECES: la caja ya recibe egresos (compra de insumos, otro) y
-- otros egresos no son gastos (depósito bancario, retiro, ajuste).
--
-- LA REGLA
--   `gastos` es la única fuente de los gastos. Un egreso de caja es un medio de
--   pago: solo cuenta como gasto si UN gasto vigente lo señala, y ese vínculo es
--   único. `caja_movimientos`, `registrar_movimiento_caja` y `cerrar_caja` NO se
--   tocan (principio 1: el núcleo de dinero no cambia).
--
-- LOS TRES CAMINOS (todos por RPC, solo líder de equipo)
--   A. Pagado sin caja (transferencia, Yape, Plin, tarjeta) → un gasto.
--   B. Efectivo desde una caja abierta → UNA transacción: el egreso de caja
--      (por la misma RPC de siempre, así las reglas de caja viven en un solo
--      lugar) y el gasto que lo señala. Todo o nada.
--   C. Clasificar un egreso que una encargada ya registró → un gasto que lo
--      señala; no se crea ningún movimiento de caja.
--
-- ESTADOS IMPOSIBLES → quién los impide (la base, no la RPC: un constraint vale
-- más que diez validaciones; y aplica también a quien escriba desde una consola)
--   un egreso respaldando dos gastos ........ índice único parcial
--   efectivo sin egreso / Yape con egreso ... check
--   IGV fuera de factura o mayor al total ... check
--   factura sin número ...................... check
--   anulado sin motivo ni responsable ....... check
--   gasto que cambia de monto, categoría .... trigger (solo se puede anular)
--   un gasto borrado ........................ trigger + revoke
--   gasto que señala un ingreso, o con monto
--     distinto al del egreso, o de otra sede  trigger
--   un egreso a la vez gasto y "no es gasto"  trigger con candado por egreso
--   el mismo gasto guardado dos veces ....... token_cliente único

set search_path = retail, public, extensions;

-- ---------- 1. Categorías: lista cerrada, con su cuenta contable ----------
-- Es la única casa de "esta categoría va a esta cuenta"; el Estado de Resultados
-- la lee, no la repite. NO hay categoría "Otros" a propósito: su cuenta natural
-- (659) es la de mermas, que el manual contable resta del margen bruto; un gasto
-- de oficina ahí distorsionaría el margen. Si un gasto no calza en ninguna,
-- falta una categoría y se agrega con una migración.
--
-- PROVISIONAL: las cuentas PCGE están tomadas del manual contable del repo y
-- esperan la confirmación del contador. Corregirlas es un `update` acá, sin
-- tocar ningún gasto ya registrado (los gastos guardan el código, no la cuenta).
create table retail.categorias_gasto (
  codigo text primary key,
  nombre text not null,
  cuenta_pcge text not null,
  activo boolean not null default true,
  orden integer not null,
  check (codigo ~ '^[a-z_]+$'),
  check (trim(nombre) <> '')
);

insert into retail.categorias_gasto (codigo, nombre, cuenta_pcge, orden) values
  ('personal',         'Personal y planilla',              '62',  1),
  ('alquileres',       'Alquileres',                       '635', 2),
  ('servicios_basicos','Servicios básicos (luz, agua, internet)', '636', 3),
  ('transporte',       'Transporte y movilidad',           '631', 4),
  ('mantenimiento',    'Mantenimiento y reparaciones',     '634', 5),
  ('publicidad',       'Publicidad y marketing',           '637', 6),
  ('suministros',      'Suministros y útiles',             '656', 7);

-- ---------- 2. Gastos ----------
create table retail.gastos (
  id uuid primary key default gen_random_uuid(),
  -- NULL = "de la empresa" (oficina, contador, software): aparece solo en el consolidado.
  ubicacion_id uuid references retail.ubicaciones (id),
  categoria text not null references retail.categorias_gasto (codigo),
  descripcion text not null check (trim(descripcion) <> ''),
  -- El día en que se pagó, en hora de Lima. Se registra al pagar (no hay "por pagar").
  fecha date not null,
  monto_total numeric(12,2) not null check (monto_total > 0),
  igv numeric(12,2) not null default 0 check (igv >= 0),
  comprobante_tipo text not null
    check (comprobante_tipo in ('factura', 'boleta', 'recibo_por_honorarios', 'sin_comprobante')),
  comprobante_numero text,
  proveedor_id uuid references retail.proveedores (id),
  medio_pago text not null
    check (medio_pago in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')),
  -- El egreso de caja que respalda este gasto. Solo efectivo tiene uno.
  caja_movimiento_id uuid references retail.caja_movimientos (id),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid references public.personas (id),
  anulado_en timestamptz,
  registrado_por uuid references public.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now(),

  -- efectivo ⇔ tiene egreso de caja
  constraint gastos_efectivo_ssi_egreso
    check ((medio_pago = 'efectivo') = (caja_movimiento_id is not null)),
  -- el IGV solo existe con factura (mismo criterio que compras) y nunca supera el total
  constraint gastos_igv_solo_factura
    check (igv = 0 or comprobante_tipo = 'factura'),
  constraint gastos_igv_menor_al_total
    check (igv <= monto_total),
  constraint gastos_factura_con_numero
    check (comprobante_tipo <> 'factura' or (comprobante_numero is not null and trim(comprobante_numero) <> '')),
  -- un gasto anulado siempre dice por qué, quién y cuándo; uno vigente no dice nada de eso
  constraint gastos_anulacion_coherente
    check (
      (estado = 'vigente' and motivo_anulacion is null and anulado_por is null and anulado_en is null)
      or
      (estado = 'anulado' and motivo_anulacion is not null and trim(motivo_anulacion) <> ''
        and anulado_por is not null and anulado_en is not null)
    )
);

-- Un mismo egreso no puede respaldar dos gastos VIGENTES. Al anular el gasto el
-- vínculo se libera: el egreso vuelve a "sin clasificar" (la plata sí salió) y
-- puede clasificarse de nuevo.
create unique index gastos_egreso_vigente_uq
  on retail.gastos (caja_movimiento_id)
  where estado = 'vigente' and caja_movimiento_id is not null;

create index gastos_ubicacion_fecha_idx on retail.gastos (ubicacion_id, fecha);

-- ---------- 3. Egresos de caja que NO son gasto ----------
-- Depósito al banco, retiro, ajuste de conteo. Se marcan aparte en vez de
-- agregar una columna a `caja_movimientos` (que tocaría el núcleo de dinero).
-- Una marca equivocada se REVIERTE (no se borra): el error es del diseño, no de
-- quien hizo clic (Norman) — un clic irreversible que esconde plata no sirve.
create table retail.egresos_no_gasto (
  id uuid primary key default gen_random_uuid(),
  caja_movimiento_id uuid not null references retail.caja_movimientos (id),
  motivo text not null check (trim(motivo) <> ''),
  revisado_por uuid references public.personas (id),
  revisado_en timestamptz not null default now(),
  revertido_por uuid references public.personas (id),
  revertido_en timestamptz,
  check ((revertido_en is null) = (revertido_por is null))
);

create unique index egresos_no_gasto_vigente_uq
  on retail.egresos_no_gasto (caja_movimiento_id)
  where revertido_en is null;

-- ---------- 4. Permisos: solo el líder ve; NADIE escribe directo ----------
-- 0005_grants.sql da select/insert/update/delete a `authenticated` en toda tabla
-- nueva del schema (ADR-0112): sin este revoke explícito, cualquier colaboradora
-- podría insertar un gasto desde la consola del navegador.
alter table retail.categorias_gasto enable row level security;
alter table retail.gastos enable row level security;
alter table retail.egresos_no_gasto enable row level security;

create policy categorias_gasto_select on retail.categorias_gasto for select
  using (retail.fn_es_lider());
create policy gastos_select on retail.gastos for select
  using (retail.fn_es_lider());
create policy egresos_no_gasto_select on retail.egresos_no_gasto for select
  using (retail.fn_es_lider());

revoke all on retail.categorias_gasto, retail.gastos, retail.egresos_no_gasto from authenticated, anon;
grant select on retail.categorias_gasto, retail.gastos, retail.egresos_no_gasto to authenticated;

-- ---------- 5. Triggers: lo que ni un dueño de fila puede hacer ----------

-- 5a. Al insertar un gasto que señala un egreso: el egreso debe ser un egreso,
-- del mismo monto, de la misma sede, y no estar marcado "no es gasto". El candado
-- por egreso serializa esto contra la marca contraria: dos transacciones
-- simultáneas (una clasifica, otra marca "no es gasto") no pueden pasar ambas,
-- porque cada una no vería lo aún no confirmado de la otra.
create function retail.fn_gastos_validar_egreso()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_mov retail.caja_movimientos%rowtype; v_ubic uuid;
begin
  if new.caja_movimiento_id is null or new.estado <> 'vigente' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('egreso:' || new.caja_movimiento_id::text, 0));

  select * into v_mov from retail.caja_movimientos where id = new.caja_movimiento_id;
  if not found then
    raise exception 'El egreso de caja % no existe', new.caja_movimiento_id;
  end if;
  if v_mov.tipo <> 'egreso' then
    raise exception 'Un gasto solo puede respaldarse con un egreso de caja, no con un ingreso';
  end if;
  if v_mov.monto <> new.monto_total then
    raise exception 'El monto del gasto (S/ %) no coincide con el del egreso de caja (S/ %)', new.monto_total, v_mov.monto;
  end if;
  select c.ubicacion_id into v_ubic from retail.cajas c where c.id = v_mov.caja_id;
  if new.ubicacion_id is not null and new.ubicacion_id <> v_ubic then
    raise exception 'El gasto es de otra sede distinta a la de la caja que pagó';
  end if;
  if exists (select 1 from retail.egresos_no_gasto e
              where e.caja_movimiento_id = new.caja_movimiento_id and e.revertido_en is null) then
    raise exception 'Ese egreso está marcado como "no es gasto"; revierte la marca primero';
  end if;
  return new;
end;
$$;

create trigger gastos_validar_egreso
  before insert on retail.gastos
  for each row execute function retail.fn_gastos_validar_egreso();

-- 5b. Un gasto no se edita ni se borra: solo se ANULA (vigente → anulado, con motivo).
create function retail.fn_gastos_solo_anular()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un gasto no se borra: se anula con un motivo';
  end if;
  if old.estado = 'anulado' then
    raise exception 'Un gasto anulado no se puede modificar';
  end if;
  if new.estado <> 'anulado' then
    raise exception 'Un gasto solo puede cambiar para anularse';
  end if;
  if (new.id, new.ubicacion_id, new.categoria, new.descripcion, new.fecha, new.monto_total, new.igv,
      new.comprobante_tipo, new.comprobante_numero, new.proveedor_id, new.medio_pago,
      new.caja_movimiento_id, new.registrado_por, new.token_cliente, new.created_at)
     is distinct from
     (old.id, old.ubicacion_id, old.categoria, old.descripcion, old.fecha, old.monto_total, old.igv,
      old.comprobante_tipo, old.comprobante_numero, old.proveedor_id, old.medio_pago,
      old.caja_movimiento_id, old.registrado_por, old.token_cliente, old.created_at) then
    raise exception 'Un gasto no se edita: se anula y se registra uno nuevo';
  end if;
  return new;
end;
$$;

create trigger gastos_solo_anular
  before update or delete on retail.gastos
  for each row execute function retail.fn_gastos_solo_anular();

-- 5c. La marca "no es gasto": no puede convivir con un gasto vigente del mismo
-- egreso, y solo se puede revertir (nunca editar ni borrar).
create function retail.fn_egresos_no_gasto_validar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_mov retail.caja_movimientos%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Una marca "no es gasto" no se borra: se revierte';
  end if;

  if tg_op = 'UPDATE' then
    if old.revertido_en is not null then
      raise exception 'Esta marca ya fue revertida';
    end if;
    if new.revertido_en is null
       or (new.id, new.caja_movimiento_id, new.motivo, new.revisado_por, new.revisado_en)
          is distinct from (old.id, old.caja_movimiento_id, old.motivo, old.revisado_por, old.revisado_en) then
      raise exception 'Una marca "no es gasto" solo puede cambiar para revertirse';
    end if;
    return new;
  end if;

  -- INSERT
  perform pg_advisory_xact_lock(hashtextextended('egreso:' || new.caja_movimiento_id::text, 0));
  select * into v_mov from retail.caja_movimientos where id = new.caja_movimiento_id;
  if not found or v_mov.tipo <> 'egreso' then
    raise exception 'Solo un egreso de caja puede marcarse como "no es gasto"';
  end if;
  if exists (select 1 from retail.gastos g
              where g.caja_movimiento_id = new.caja_movimiento_id and g.estado = 'vigente') then
    raise exception 'Ese egreso ya está clasificado como gasto; anula el gasto primero';
  end if;
  return new;
end;
$$;

create trigger egresos_no_gasto_validar
  before insert or update or delete on retail.egresos_no_gasto
  for each row execute function retail.fn_egresos_no_gasto_validar();

-- ---------- 6. RPC: registrar un gasto ----------
-- CONTRATO. Promete: un gasto vigente y, en el camino B, su egreso de caja, todo o
-- nada. Asume: quien llama es líder; en B la caja está abierta (la valida
-- `registrar_movimiento_caja`); en C el egreso existe, no tiene ya un gasto
-- vigente y su monto coincide (lo valida el trigger).
-- Idempotente por `p_token`: un doble clic o un reintento de red devuelve el
-- mismo gasto en vez de crear otro (mismo patrón que `registrar_venta`).
create function retail.registrar_gasto(
  p_ubicacion_id uuid,
  p_categoria text,
  p_descripcion text,
  p_fecha date,
  p_monto_total numeric,
  p_igv numeric,
  p_comprobante_tipo text,
  p_comprobante_numero text,
  p_proveedor_id uuid,
  p_medio_pago text,
  p_caja_id uuid default null,
  p_caja_movimiento_id uuid default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_cat retail.categorias_gasto%rowtype;
  v_existente uuid;
  v_mov uuid := p_caja_movimiento_id;
  v_ubic_caja uuid;
  v_id uuid;
  v_cons text;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede registrar gastos';
  end if;

  if p_token is not null then
    select id into v_existente from retail.gastos where token_cliente = p_token;
    if found then return v_existente; end if;
  end if;

  select * into v_cat from retail.categorias_gasto where codigo = p_categoria;
  if not found or not v_cat.activo then
    raise exception 'La categoría "%" no existe o está desactivada', p_categoria;
  end if;
  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Todo gasto necesita una descripción';
  end if;
  if p_monto_total is null or p_monto_total <= 0 then
    raise exception 'El monto del gasto debe ser mayor que cero';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha del gasto';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha del gasto no puede ser futura: se registra cuando se paga';
  end if;

  -- Cuál camino: A (sin caja), B (efectivo desde caja abierta) o C (clasificar un egreso).
  if p_medio_pago = 'efectivo' then
    if (p_caja_id is null) = (p_caja_movimiento_id is null) then
      raise exception 'Un gasto en efectivo sale de una caja abierta o clasifica un egreso ya registrado (uno de los dos, no ambos)';
    end if;
  elsif p_caja_id is not null or p_caja_movimiento_id is not null then
    raise exception 'Solo un gasto en efectivo se vincula con la caja';
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();

  begin
    if p_caja_id is not null then
      -- Camino B. El egreso lo crea la MISMA RPC de siempre: las reglas de caja
      -- (abierta, motivo, permiso) siguen viviendo en un solo lugar.
      select ubicacion_id into v_ubic_caja from retail.cajas where id = p_caja_id;
      if p_ubicacion_id is not null and p_ubicacion_id is distinct from v_ubic_caja then
        raise exception 'El gasto es de otra sede distinta a la de la caja que lo paga';
      end if;
      v_mov := retail.registrar_movimiento_caja(
        p_caja_id, 'egreso', p_monto_total,
        left('Gasto · ' || v_cat.nombre || ' — ' || trim(p_descripcion), 200));
    end if;

    insert into retail.gastos (
      ubicacion_id, categoria, descripcion, fecha, monto_total, igv, comprobante_tipo,
      comprobante_numero, proveedor_id, medio_pago, caja_movimiento_id, registrado_por, token_cliente
    ) values (
      p_ubicacion_id, p_categoria, trim(p_descripcion), p_fecha, p_monto_total, coalesce(p_igv, 0),
      p_comprobante_tipo, nullif(trim(p_comprobante_numero), ''), p_proveedor_id, p_medio_pago,
      v_mov, v_persona, p_token
    ) returning id into v_id;
  exception when unique_violation then
    -- El bloque deshace también el egreso del camino B: no queda uno huérfano.
    get stacked diagnostics v_cons = constraint_name;
    if v_cons = 'gastos_token_cliente_key' then
      select id into v_existente from retail.gastos where token_cliente = p_token;
      if found then return v_existente; end if;
    end if;
    raise exception 'Ese egreso de caja ya está clasificado como gasto';
  end;

  return v_id;
end;
$$;

-- ---------- 7. RPC: anular un gasto ----------
-- No toca la caja: si el gasto había creado su egreso, la plata SÍ salió; el
-- egreso vuelve a "sin clasificar". Un error de monto en la caja se corrige en
-- la caja (movimiento de ajuste), no aquí.
-- PENDIENTE (tarea 8, cierre de mes): rechazar si el período del gasto está cerrado.
create function retail.anular_gasto(p_gasto_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_g retail.gastos%rowtype; v_persona uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede anular gastos';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Anular un gasto exige un motivo';
  end if;
  select * into v_g from retail.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'El gasto no existe';
  end if;
  if v_g.estado = 'anulado' then
    raise exception 'Ese gasto ya estaba anulado';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  update retail.gastos
     set estado = 'anulado', motivo_anulacion = trim(p_motivo),
         anulado_por = v_persona, anulado_en = now()
   where id = p_gasto_id;
end;
$$;

-- ---------- 8. RPC: marcar / revertir "no es gasto" ----------
create function retail.marcar_egreso_no_gasto(p_caja_movimiento_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_persona uuid; v_id uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede clasificar egresos de caja';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué no es un gasto (ej. depósito al banco, retiro del dueño)';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  begin
    insert into retail.egresos_no_gasto (caja_movimiento_id, motivo, revisado_por)
      values (p_caja_movimiento_id, trim(p_motivo), v_persona)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'Ese egreso ya estaba marcado como "no es gasto"';
  end;
  return v_id;
end;
$$;

create function retail.revertir_egreso_no_gasto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_persona uuid; v_n integer;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede clasificar egresos de caja';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  update retail.egresos_no_gasto
     set revertido_en = now(), revertido_por = v_persona
   where id = p_id and revertido_en is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Esa marca no existe o ya fue revertida';
  end if;
end;
$$;

-- ---------- 9. Lecturas de la pantalla (solo líder; solo leen) ----------

-- Gastos vigentes por sede + "de la empresa" en un rango de fechas. Una fila por
-- sede activa AUNQUE no tenga gastos (una tarjeta en cero es información: nadie
-- registró nada), más la fila de la empresa. Los anulados no suman.
create function retail.fn_egresos_resumen(p_desde date, p_hasta date)
returns table (
  ubicacion_id uuid, nombre text, total numeric, n_gastos integer, igv numeric, por_categoria jsonb
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ver los gastos';
  end if;
  return query
  with base as (
    select g.ubicacion_id, g.categoria, sum(g.monto_total) as monto, count(*) as n, sum(g.igv) as igv
      from retail.gastos g
     where g.estado = 'vigente' and g.fecha between p_desde and p_hasta
     group by g.ubicacion_id, g.categoria
  ),
  por_ub as (
    select b.ubicacion_id, sum(b.monto) as total, sum(b.n) as n, sum(b.igv) as igv,
           jsonb_agg(jsonb_build_object('categoria', b.categoria, 'nombre', c.nombre, 'monto', b.monto)
                     order by b.monto desc) as por_categoria
      from base b join retail.categorias_gasto c on c.codigo = b.categoria
     group by b.ubicacion_id
  ),
  filas as (
    select u.id, u.nombre, 1 as ord from retail.ubicaciones u
     where u.activo or exists (select 1 from por_ub p where p.ubicacion_id = u.id)
    union all
    select null::uuid, 'De la empresa', 2
  )
  select f.id, f.nombre, coalesce(p.total, 0), coalesce(p.n, 0)::integer, coalesce(p.igv, 0),
         coalesce(p.por_categoria, '[]'::jsonb)
    from filas f
    left join por_ub p on p.ubicacion_id is not distinct from f.id
   order by f.ord, f.nombre;
end;
$$;

-- Egresos de caja que todavía no son gasto ni están marcados "no es gasto".
-- Nunca se esconden: son plata que salió y nadie dijo en qué. `total` es el
-- conteo completo aunque la lista se recorte con p_limite.
create function retail.fn_egresos_sin_clasificar(p_limite integer default 100)
returns table (
  id uuid, caja_id uuid, ubicacion_id uuid, ubicacion_nombre text, monto numeric,
  motivo text, nota text, es_ajuste boolean, registrado_por uuid, creado_en timestamptz, total bigint
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ver los egresos de caja sin clasificar';
  end if;
  return query
  select m.id, m.caja_id, c.ubicacion_id, u.nombre, m.monto, m.motivo, m.nota, m.es_ajuste,
         m.usuario_id, m.created_at, count(*) over ()
    from retail.caja_movimientos m
    join retail.cajas c on c.id = m.caja_id
    join retail.ubicaciones u on u.id = c.ubicacion_id
   where m.tipo = 'egreso'
     and not exists (select 1 from retail.gastos g
                      where g.caja_movimiento_id = m.id and g.estado = 'vigente')
     and not exists (select 1 from retail.egresos_no_gasto e
                      where e.caja_movimiento_id = m.id and e.revertido_en is null)
   order by m.created_at desc
   limit greatest(p_limite, 1);
end;
$$;

-- Lista de gastos del rango (vigentes y anulados, para poder auditar).
create function retail.fn_gastos_lista(
  p_desde date, p_hasta date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false,
  p_limite integer default 200
)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text,
  descripcion text, fecha date, monto_total numeric, igv numeric, comprobante_tipo text,
  comprobante_numero text, proveedor_id uuid, proveedor_nombre text, medio_pago text,
  caja_movimiento_id uuid, estado text, motivo_anulacion text, registrado_por uuid, creado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ver los gastos';
  end if;
  return query
  select g.id, g.ubicacion_id, u.nombre, g.categoria, c.nombre, g.descripcion, g.fecha, g.monto_total,
         g.igv, g.comprobante_tipo, g.comprobante_numero, g.proveedor_id, p.nombre, g.medio_pago,
         g.caja_movimiento_id, g.estado, g.motivo_anulacion, g.registrado_por, g.created_at
    from retail.gastos g
    join retail.categorias_gasto c on c.codigo = g.categoria
    left join retail.ubicaciones u on u.id = g.ubicacion_id
    left join retail.proveedores p on p.id = g.proveedor_id
   where g.fecha between p_desde and p_hasta
     and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
     and (not p_solo_empresa or g.ubicacion_id is null)
   order by g.fecha desc, g.created_at desc
   limit greatest(p_limite, 1);
end;
$$;

-- ---------- 10. Permisos de las funciones ----------
-- Las funciones nacen ejecutables por `public` (y 0005 da execute a authenticated
-- por defecto). Las abrimos solo a `authenticated`; adentro cada una exige líder.
-- Los dos triggers son internos: nadie los llama.
revoke all on function retail.registrar_gasto(uuid, text, text, date, numeric, numeric, text, text, uuid, text, uuid, uuid, uuid) from public, anon;
revoke all on function retail.anular_gasto(uuid, text) from public, anon;
revoke all on function retail.marcar_egreso_no_gasto(uuid, text) from public, anon;
revoke all on function retail.revertir_egreso_no_gasto(uuid) from public, anon;
revoke all on function retail.fn_egresos_resumen(date, date) from public, anon;
revoke all on function retail.fn_egresos_sin_clasificar(integer) from public, anon;
revoke all on function retail.fn_gastos_lista(date, date, uuid, boolean, integer) from public, anon;
revoke all on function retail.fn_gastos_validar_egreso() from public, anon, authenticated;
revoke all on function retail.fn_gastos_solo_anular() from public, anon, authenticated;
revoke all on function retail.fn_egresos_no_gasto_validar() from public, anon, authenticated;

grant execute on function retail.registrar_gasto(uuid, text, text, date, numeric, numeric, text, text, uuid, text, uuid, uuid, uuid) to authenticated;
grant execute on function retail.anular_gasto(uuid, text) to authenticated;
grant execute on function retail.marcar_egreso_no_gasto(uuid, text) to authenticated;
grant execute on function retail.revertir_egreso_no_gasto(uuid) to authenticated;
grant execute on function retail.fn_egresos_resumen(date, date) to authenticated;
grant execute on function retail.fn_egresos_sin_clasificar(integer) to authenticated;
grant execute on function retail.fn_gastos_lista(date, date, uuid, boolean, integer) to authenticated;

comment on table retail.gastos is
  'Única fuente de los gastos generales (ADR-0117). Un egreso de caja solo es gasto si un gasto vigente lo señala por caja_movimiento_id. Sin DELETE: se anula con motivo.';
comment on table retail.egresos_no_gasto is
  'Egresos de caja que no son gasto (depósito, retiro, ajuste). Se revierten, no se borran.';
comment on table retail.categorias_gasto is
  'Lista cerrada de categorías con su cuenta PCGE. Cuentas PROVISIONALES hasta que el contador las confirme. Sin "Otros" a propósito (659 es mermas).';
