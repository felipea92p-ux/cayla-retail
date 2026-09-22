-- ============================================================================
-- 20260923090000_separaciones.sql — Separar prendas con adelanto (ADR-0166)
--
-- EL PROBLEMA. Una clienta quiere una prenda, deja un adelanto y vuelve en unos días. Hasta hoy el
-- ERP solo sabía «apartar» (ADR-0141, Fase 1): bloquear la prenda para que ninguna caja la venda,
-- con nombre y fecha. No sabía nada del DINERO: el adelanto no quedaba registrado, no había boleta
-- de anticipo (que SUNAT exige al cobrar), no se sabía qué dinero era «de la clienta» y no de
-- CAYLA, y nadie devolvía el adelanto cuando la clienta no volvía.
--
-- ANALOGÍA CAYLA. Es la prenda que la encargada guarda en una bolsa con el nombre de la clienta
-- detrás del mostrador, y el sobre con su adelanto que no se mezcla con la venta del día. Esta
-- migración le da a esa bolsa y a ese sobre una fila en la base: el sobre no es venta hasta que la
-- clienta recoge; si no vuelve, la prenda regresa a la tienda y el sobre se le devuelve entero.
--
-- DECISIONES (Felipe, 2026-09-22 — docs/maquetas/separaciones-2026-09/ANALISIS.md §7):
--   D1 boleta (o factura) de ANTICIPO al cobrar el adelanto; la boleta final la deduce.
--   D2 adelanto de monto libre (mayor a cero, hasta el total).
--   D3 7 días calendario; aviso a 2 días; 2 días de gracia tras vencer; UNA extensión de +7.
--   D4 devolución del 100%, preferentemente por Yape/Plin/transferencia (se anota al separar).
--   D5 (propuesta, pendiente de confirmar): entregar lo hace cualquiera que opere la tienda;
--      extender, liberar y registrar la devolución, quien puede gestionar la caja
--      (líder o terminal de ventas, `fn_puede_gestionar_caja`).
--
-- CÓMO SE ARMA (piezas pequeñas sobre lo que ya existe):
--   · `separaciones` es el DOCUMENTO de negocio; cada prenda es una fila de `separacion_items`
--     que apunta a su `apartado` (ADR-0141). El candado de stock NO se reescribe: se reutiliza
--     `apartar_stock`, y al cerrar se escribe el mismo movimiento `liberacion_apartado`.
--   · El adelanto va a `separacion_pagos`. Solo el EFECTIVO toca el cajón: además deja un ingreso
--     en `caja_movimientos`, que `cerrar_caja` ya suma. Así el arqueo cuadra sin tocar el cierre.
--   · Al entregar se crea una `venta` por el TOTAL con el precio congelado de la separación; el
--     adelanto aparece como un pago `anticipo` (no es efectivo: el cajón ya lo contó el día 1).
--     La venta la escribe `entregar_separacion`, NO `registrar_venta`: esa función exige el
--     precio y la campaña de HOY y rechazaría el precio que la clienta ya tiene congelado.
--   · El vencimiento no necesita `pg_cron`: `fn_vencer_separaciones` se llama al abrir la
--     pantalla de la tienda y libera lo vencido hace más de 2 días. Es idempotente.
--
-- SE ROMPE SI: alguien escribe `separaciones`/`apartados` sin pasar por estas funciones (la RLS
-- no da escritura a nadie), o se transmite a SUNAT un comprobante de anticipo sin el soporte de
-- anticipos en `lib/lucode.ts` (la ruta de emisión lo bloquea; ver ADR-0166).
--
-- Se pega ENTERA en el SQL Editor de producción (lleva `retail.` en cada objeto), DESPUÉS de
-- ADR-0141 (`20260920160000_apartar_stock.sql`), de la que depende. Re-ejecutable.
-- ============================================================================

set search_path to retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

-- Correlativo por tienda: SEP-TRU-0001, SEP-TRU-0002… Una fila por ubicación, bloqueada con
-- `for update` al reservar: dos cajas de la misma tienda nunca sacan el mismo número.
create table if not exists retail.separacion_correlativos (
  ubicacion_id uuid primary key references retail.ubicaciones (id),
  siguiente integer not null default 1 check (siguiente > 0)
);

create table if not exists retail.separaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  caja_id uuid not null references retail.cajas (id),               -- la caja que recibió el adelanto
  clienta_id uuid references retail.clientas (id),
  clienta_nombres text not null check (btrim(clienta_nombres) <> ''),
  clienta_apellidos text not null check (btrim(clienta_apellidos) <> ''),
  clienta_celular text not null check (clienta_celular ~ '^[0-9]{9}$'),
  clienta_dni text check (clienta_dni is null or clienta_dni ~ '^[0-9]{8}$'),
  comprobante_tipo text not null check (comprobante_tipo in ('boleta', 'factura')),
  cliente_ruc text check (cliente_ruc is null or cliente_ruc ~ '^(10|20)[0-9]{9}$'),
  cliente_razon_social text,
  asesora_id uuid references public.personas (id),
  creado_por uuid not null references public.personas (id),
  nota text check (nota is null or char_length(nota) <= 200),
  total numeric(12, 2) not null check (total > 0),
  adelanto numeric(12, 2) not null check (adelanto > 0 and adelanto <= total),
  vence_el date not null,
  extensiones smallint not null default 0 check (extensiones between 0 and 1),
  -- D4: cómo se le devuelve si no recoge. Se anota AL SEPARAR, para no tener que llamarla.
  devolucion_medio text not null check (devolucion_medio in ('yape', 'plin', 'transferencia')),
  devolucion_numero text,
  devolucion_cci text,
  estado text not null default 'abierta' check (estado in ('abierta', 'entregada', 'liberada', 'devuelta')),
  comprobante_anticipo_id uuid references retail.comprobantes (id),
  venta_id uuid references retail.ventas (id),
  entregada_en timestamptz,
  entregada_por uuid references public.personas (id),
  liberada_en timestamptz,
  liberada_por uuid references public.personas (id),               -- NULL = la liberó el sistema al vencer
  liberada_motivo text check (liberada_motivo in ('vencio', 'clienta_desistio', 'error_de_carga')),
  devuelta_en timestamptz,
  devuelta_por uuid references public.personas (id),
  devolucion_medio_real text check (devolucion_medio_real in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')),
  devolucion_operacion text,
  devolucion_caja_movimiento_id uuid references retail.caja_movimientos (id),
  nota_credito_id uuid references retail.comprobantes (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now(),
  constraint separaciones_factura_con_ruc check (
    comprobante_tipo <> 'factura' or (cliente_ruc is not null and btrim(coalesce(cliente_razon_social, '')) <> '')
  ),
  constraint separaciones_devolucion_destino check (
    (devolucion_medio = 'transferencia' and devolucion_cci ~ '^[0-9]{20}$' and devolucion_numero is null)
    or (devolucion_medio in ('yape', 'plin') and devolucion_numero ~ '^[0-9]{9}$' and devolucion_cci is null)
  ),
  -- Cero estados imposibles: cada estado lleva exactamente sus marcas, ni una más ni una menos.
  constraint separaciones_estado_coherente check (
    (estado = 'abierta' and venta_id is null and entregada_en is null and liberada_en is null and devuelta_en is null)
    or (estado = 'entregada' and venta_id is not null and entregada_en is not null and liberada_en is null and devuelta_en is null)
    or (estado = 'liberada' and venta_id is null and entregada_en is null and liberada_en is not null
        and liberada_motivo is not null and devuelta_en is null)
    or (estado = 'devuelta' and venta_id is null and entregada_en is null and liberada_en is not null
        and liberada_motivo is not null and devuelta_en is not null and devolucion_medio_real is not null)
  ),
  constraint separaciones_devolucion_efectivo_en_caja check (
    (devolucion_medio_real = 'efectivo') = (devolucion_caja_movimiento_id is not null)
  )
);
create index if not exists separaciones_abiertas_idx on retail.separaciones (ubicacion_id, vence_el) where estado = 'abierta';
create index if not exists separaciones_por_devolver_idx on retail.separaciones (ubicacion_id) where estado = 'liberada';
create index if not exists separaciones_dni_idx on retail.separaciones (clienta_dni) where clienta_dni is not null;
create index if not exists separaciones_celular_idx on retail.separaciones (clienta_celular);

-- Cada prenda separada, con su precio CONGELADO (el de la campaña vigente el día que se separó).
create table if not exists retail.separacion_items (
  id uuid primary key default gen_random_uuid(),
  separacion_id uuid not null references retail.separaciones (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null check (precio_unitario > 0),
  descuento_unitario numeric(12, 2) not null default 0 check (descuento_unitario >= 0 and descuento_unitario < precio_unitario),
  descuento_etiqueta_id uuid,
  apartado_id uuid not null unique references retail.apartados (id),
  constraint separacion_items_descuento_con_etiqueta check ((descuento_unitario > 0) = (descuento_etiqueta_id is not null))
);
create index if not exists separacion_items_separacion_idx on retail.separacion_items (separacion_id);

-- Cómo dejó el adelanto. Solo el efectivo entra al cajón: por eso, y solo por eso, lleva su
-- ingreso de caja (lo exige el CHECK).
create table if not exists retail.separacion_pagos (
  id uuid primary key default gen_random_uuid(),
  separacion_id uuid not null references retail.separaciones (id),
  metodo text not null check (metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')),
  monto numeric(12, 2) not null check (monto > 0),
  recibido numeric(12, 2),
  caja_movimiento_id uuid references retail.caja_movimientos (id),
  created_at timestamptz not null default now(),
  constraint separacion_pagos_recibido_coherente check (recibido is null or (metodo = 'efectivo' and recibido >= monto)),
  constraint separacion_pagos_efectivo_en_caja check ((metodo = 'efectivo') = (caja_movimiento_id is not null))
);
create index if not exists separacion_pagos_separacion_idx on retail.separacion_pagos (separacion_id);

-- Trazabilidad en las tablas que ya existen (columnas nuevas, todas opcionales).
alter table retail.apartados add column if not exists separacion_id uuid references retail.separaciones (id);
create index if not exists apartados_separacion_idx on retail.apartados (separacion_id) where separacion_id is not null;
alter table retail.caja_movimientos add column if not exists separacion_id uuid references retail.separaciones (id);

-- El comprobante sabe si es un anticipo, o cuánto anticipo deduce y de qué comprobante.
alter table retail.comprobantes add column if not exists separacion_id uuid references retail.separaciones (id);
alter table retail.comprobantes add column if not exists es_anticipo boolean not null default false;
alter table retail.comprobantes add column if not exists anticipo_deducido numeric(12, 2) not null default 0;
alter table retail.comprobantes add column if not exists anticipo_comprobante_id uuid references retail.comprobantes (id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comprobantes_anticipo_coherente' and conrelid = 'retail.comprobantes'::regclass) then
    alter table retail.comprobantes add constraint comprobantes_anticipo_coherente check (
      anticipo_deducido >= 0
      and (anticipo_deducido > 0) = (anticipo_comprobante_id is not null)
      and not (es_anticipo and anticipo_deducido > 0)
    );
  end if;
end $$;

-- La venta de una separación entregada registra el adelanto como un pago más, de medio `anticipo`.
-- No es efectivo: `cerrar_caja` filtra `metodo = 'efectivo'` y no lo cuenta dos veces.
alter table retail.venta_pagos drop constraint if exists venta_pagos_metodo_check;
alter table retail.venta_pagos add constraint venta_pagos_metodo_check
  check (metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'anticipo'));

-- ---------------------------------------------------------------------------
-- 2. Seguridad de las tablas nuevas: se leen por tienda, se escriben solo por las RPC.
-- ---------------------------------------------------------------------------
alter table retail.separaciones enable row level security;
alter table retail.separacion_items enable row level security;
alter table retail.separacion_pagos enable row level security;
alter table retail.separacion_correlativos enable row level security;

drop policy if exists separaciones_select on retail.separaciones;
create policy separaciones_select on retail.separaciones for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
drop policy if exists separacion_items_select on retail.separacion_items;
create policy separacion_items_select on retail.separacion_items for select
  using (exists (select 1 from retail.separaciones s where s.id = separacion_id and retail.fn_puede_operar_ubicacion(s.ubicacion_id)));
drop policy if exists separacion_pagos_select on retail.separacion_pagos;
create policy separacion_pagos_select on retail.separacion_pagos for select
  using (exists (select 1 from retail.separaciones s where s.id = separacion_id and retail.fn_puede_operar_ubicacion(s.ubicacion_id)));

revoke all on retail.separaciones, retail.separacion_items, retail.separacion_pagos, retail.separacion_correlativos from anon, authenticated;
grant select on retail.separaciones, retail.separacion_items, retail.separacion_pagos to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ayudante interno: cierra el apartado de una prenda separada (no lo llama nadie de afuera).
--    Mismo movimiento que `liberar_apartado`, sin su regla «solo quien apartó o una líder»: aquí
--    decide la función de separación que lo llama, con su propia regla de permisos.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cerrar_apartado_de_separacion(p_apartado_id uuid, p_motivo text, p_persona uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  a apartados%rowtype;
  v_mov uuid;
begin
  select * into a from apartados where id = p_apartado_id for update;
  if not found or a.estado <> 'abierto' then
    raise exception 'El apartado % ya no está abierto: la separación quedó inconsistente', p_apartado_id;
  end if;
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'liberacion_apartado', a.cantidad, 'liberacion_apartado', p_persona,
            'Separación de ' || a.clienta_nombre || ': '
              || case p_motivo when 'entregada' then 'se entrega a la clienta'
                               when 'clienta_no_vino' then 'la clienta no recogió'
                               when 'error_de_carga' then 'error al separar'
                               else 'otro motivo' end)
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);
  update apartados
     set estado = 'liberado', cerrado_por = p_persona, cerrado_en = now(),
         cierre_motivo = p_motivo, movimiento_cierre_id = v_mov
   where id = a.id;
  return v_mov;
end;
$$;
revoke all on function retail.fn_cerrar_apartado_de_separacion(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. separar_prendas — la clienta deja un adelanto y las prendas quedan guardadas para ella.
-- ---------------------------------------------------------------------------
create or replace function retail.separar_prendas(
  p_ubicacion_id uuid,
  p_items jsonb,                    -- [{variante_id, cantidad, precio_unitario, descuento_unitario?}]
  p_pagos jsonb,                    -- [{metodo, monto, recibido?}] — suma = el adelanto
  p_clienta_nombres text,
  p_clienta_apellidos text,
  p_clienta_celular text,
  p_devolucion_medio text,          -- 'yape' | 'plin' | 'transferencia'
  p_clienta_dni text default null,
  p_devolucion_numero text default null,   -- vacío = el mismo celular
  p_devolucion_cci text default null,
  p_comprobante_tipo text default 'boleta',
  p_cliente_ruc text default null,
  p_cliente_razon_social text default null,
  p_asesora_id uuid default null,
  p_clienta_id uuid default null,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_plazo_dias constant integer := 7;                  -- D3
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  c_tope_boleta_sin_dni constant numeric := 700;       -- SUNAT: boleta de más de S/700 identifica a la compradora
  v_hoy date := fn_hoy_lima();
  v_persona uuid;
  v_caja uuid;
  v_id uuid;
  v_existente uuid;
  v_item record;
  v_pago jsonb;
  v_precio numeric; v_ref text; v_sku text;
  v_c_etq uuid; v_c_pct numeric; v_c_unit numeric;
  v_desc numeric;
  v_total numeric := 0;
  v_adelanto numeric := 0;
  v_nombres text := btrim(coalesce(p_clienta_nombres, ''));
  v_apellidos text := btrim(coalesce(p_clienta_apellidos, ''));
  v_celular text := regexp_replace(coalesce(p_clienta_celular, ''), '\D', '', 'g');
  v_dni text := nullif(regexp_replace(coalesce(p_clienta_dni, ''), '\D', '', 'g'), '');
  v_ruc text := nullif(regexp_replace(coalesce(p_cliente_ruc, ''), '\D', '', 'g'), '');
  v_dev_num text := nullif(regexp_replace(coalesce(p_devolucion_numero, ''), '\D', '', 'g'), '');
  v_dev_cci text := nullif(regexp_replace(coalesce(p_devolucion_cci, ''), '\D', '', 'g'), '');
  v_sede text; v_n integer; v_codigo text;
  v_vence date := v_hoy + c_plazo_dias;
  v_apartado uuid; v_cm uuid;
  v_igv numeric; v_subtotal numeric; v_comp uuid; v_detalle text;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para separar prendas en esa ubicación';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- Idempotencia: un reintento con el mismo token (doble clic, red que se cae) no separa dos veces.
  if p_token is not null then
    select id into v_existente from separaciones where token_cliente = p_token;
    if found then return v_existente; end if;
  end if;

  select id into v_caja from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja is null then
    raise exception 'No hay una caja abierta en esta tienda — ábrela antes de separar';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Escanea al menos una prenda para separar';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo dejó el adelanto';
  end if;
  if v_nombres = '' or v_apellidos = '' then
    raise exception 'Anota los nombres y apellidos de la clienta';
  end if;
  if v_celular !~ '^[0-9]{9}$' then
    raise exception 'El celular de la clienta tiene 9 dígitos: por ahí se le avisa y se le devuelve';
  end if;
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI tiene 8 dígitos';
  end if;
  if p_comprobante_tipo not in ('boleta', 'factura') then
    raise exception 'Una separación se documenta con boleta o factura de anticipo (se pidió %)', p_comprobante_tipo;
  end if;
  if p_comprobante_tipo = 'factura' and (v_ruc is null or v_ruc !~ '^(10|20)[0-9]{9}$' or btrim(coalesce(p_cliente_razon_social, '')) = '') then
    raise exception 'Para factura de anticipo anota el RUC (11 dígitos, empieza en 10 o 20) y la razón social';
  end if;
  if p_devolucion_medio not in ('yape', 'plin', 'transferencia') then
    raise exception 'Elige cómo se le devolvería el adelanto: Yape, Plin o transferencia';
  end if;
  if p_devolucion_medio = 'transferencia' then
    if v_dev_cci is null or v_dev_cci !~ '^[0-9]{20}$' then
      raise exception 'Para devolver por transferencia anota el CCI de la clienta (20 dígitos)';
    end if;
    v_dev_num := null;
  else
    v_dev_num := coalesce(v_dev_num, v_celular);
    if v_dev_num !~ '^[0-9]{9}$' then
      raise exception 'El número de % tiene 9 dígitos', initcap(p_devolucion_medio);
    end if;
    v_dev_cci := null;
  end if;
  if p_asesora_id is not null and not exists (select 1 from personas where id = p_asesora_id) then
    raise exception 'Quien atendió no está registrada como colaboradora';
  end if;
  if p_clienta_id is not null and not exists (select 1 from clientas where id = p_clienta_id) then
    raise exception 'Esa ficha de clienta no existe';
  end if;

  -- Las prendas: se agrupan por variante (escanear dos veces la misma suma cantidad) y el precio se
  -- valida contra el catálogo de HOY. El único descuento permitido es la campaña vigente, y es
  -- obligatorio si existe: el mismo candado que el Punto de Venta, sin descuentos manuales.
  for v_item in
    select (e ->> 'variante_id')::uuid as variante_id,
           sum((e ->> 'cantidad')::integer) as cantidad,
           max((e ->> 'precio_unitario')::numeric) as precio_unitario,
           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario
      from jsonb_array_elements(p_items) e
     group by 1
  loop
    if v_item.variante_id = c_cargo_especial then
      raise exception 'El monto manual no se puede separar: separa la prenda escaneando su etiqueta';
    end if;
    if v_item.cantidad is null or v_item.cantidad < 1 then
      raise exception 'La cantidad a separar debe ser al menos 1';
    end if;
    select v.precio, p.referencia, v.sku into v_precio, v_ref, v_sku
      from variantes v join productos p on p.id = v.producto_id
     where v.id = v_item.variante_id and v.activo;
    if v_precio is null then
      raise exception 'Esa prenda no existe o está descontinuada';
    end if;
    if not fn_variante_permitida_en_sede(v_item.variante_id, p_ubicacion_id) then
      raise exception 'venta_variante_restringida_a_otra_sede' using detail = v_ref || ' (' || v_sku || ')';
    end if;
    if round(v_item.precio_unitario, 2) <> round(v_precio, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_ref || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio, v_item.precio_unitario);
    end if;
    v_c_etq := null; v_c_pct := null;
    select c.etiqueta_id, c.descuento_pct into v_c_etq, v_c_pct
      from fn_campanas_por_variante(v_hoy, 0, array[v_item.variante_id]) c
     order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
     limit 1;
    v_c_unit := case when v_c_pct is null then 0 else round(v_precio * v_c_pct / 100, 2) end;
    if abs(v_item.descuento_unitario - v_c_unit) > 0.011 then
      raise exception 'separacion_descuento_no_coincide'
        using detail = v_ref || ' (' || v_sku || ')',
              hint = format('Hoy corresponde S/%s de descuento (campaña) y la caja mandó S/%s', v_c_unit, v_item.descuento_unitario);
    end if;
    v_total := v_total + (v_precio - v_c_unit) * v_item.cantidad;
  end loop;

  if p_comprobante_tipo = 'boleta' and v_total > c_tope_boleta_sin_dni and v_dni is null then
    raise exception 'La separación pasa de S/% : la boleta lleva el DNI de la clienta', c_tope_boleta_sin_dni;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    if coalesce(v_pago ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
      raise exception 'Medio de pago no reconocido: %', v_pago ->> 'metodo';
    end if;
    if coalesce((v_pago ->> 'monto')::numeric, 0) <= 0 then
      raise exception 'Cada medio de pago lleva un monto mayor a cero';
    end if;
    v_adelanto := v_adelanto + (v_pago ->> 'monto')::numeric;
  end loop;
  v_adelanto := round(v_adelanto, 2);
  v_total := round(v_total, 2);
  if v_adelanto > v_total then
    raise exception 'El adelanto (S/%) no puede pasar el total de las prendas (S/%)', v_adelanto, v_total;
  end if;

  -- Código correlativo por tienda.
  select s.codigo into v_sede from ubicaciones u left join public.sedes s on s.id = u.sede_dynamic_id where u.id = p_ubicacion_id;
  insert into separacion_correlativos (ubicacion_id) values (p_ubicacion_id) on conflict (ubicacion_id) do nothing;
  select siguiente into v_n from separacion_correlativos where ubicacion_id = p_ubicacion_id for update;
  update separacion_correlativos set siguiente = v_n + 1 where ubicacion_id = p_ubicacion_id;
  v_codigo := 'SEP-' || coalesce(v_sede, 'X') || '-' || lpad(v_n::text, 4, '0');

  begin
    insert into separaciones (
      codigo, ubicacion_id, caja_id, clienta_id, clienta_nombres, clienta_apellidos, clienta_celular, clienta_dni,
      comprobante_tipo, cliente_ruc, cliente_razon_social, asesora_id, creado_por, nota, total, adelanto, vence_el,
      devolucion_medio, devolucion_numero, devolucion_cci, token_cliente
    ) values (
      v_codigo, p_ubicacion_id, v_caja, p_clienta_id, v_nombres, v_apellidos, v_celular, v_dni,
      p_comprobante_tipo, case when p_comprobante_tipo = 'factura' then v_ruc end,
      case when p_comprobante_tipo = 'factura' then btrim(p_cliente_razon_social) end,
      p_asesora_id, v_persona, nullif(btrim(coalesce(p_nota, '')), ''), v_total, v_adelanto, v_vence,
      p_devolucion_medio, v_dev_num, v_dev_cci, p_token
    ) returning id into v_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select id into v_existente from separaciones where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente;
  end;

  -- Cada prenda se aparta con la puerta de ADR-0141 (valida disponible bajo el candado de la fila).
  for v_item in
    select (e ->> 'variante_id')::uuid as variante_id, sum((e ->> 'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) e group by 1
  loop
    v_apartado := apartar_stock(v_item.variante_id, p_ubicacion_id, v_item.cantidad,
                                v_nombres || ' ' || v_apellidos, v_celular, v_vence,
                                'Separación ' || v_codigo, null::uuid);
    update apartados set separacion_id = v_id where id = v_apartado;
    select v.precio into v_precio from variantes v where v.id = v_item.variante_id;
    v_c_etq := null; v_c_pct := null;
    select c.etiqueta_id, c.descuento_pct into v_c_etq, v_c_pct
      from fn_campanas_por_variante(v_hoy, 0, array[v_item.variante_id]) c
     order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
     limit 1;
    v_desc := case when v_c_pct is null then 0 else round(v_precio * v_c_pct / 100, 2) end;
    insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id)
      values (v_id, v_item.variante_id, v_item.cantidad, v_precio, v_desc, case when v_desc > 0 then v_c_etq end, v_apartado);
  end loop;

  -- El adelanto. Solo el efectivo entra al cajón (ingreso de caja, que `cerrar_caja` ya suma).
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_cm := null;
    if v_pago ->> 'metodo' = 'efectivo' then
      insert into caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota, separacion_id)
        values (v_caja, 'ingreso', (v_pago ->> 'monto')::numeric, 'Adelanto de separación ' || v_codigo, v_persona,
                'En custodia hasta que la clienta recoja: no es venta', v_id)
        returning id into v_cm;
    end if;
    insert into separacion_pagos (separacion_id, metodo, monto, recibido, caja_movimiento_id)
      values (v_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
              case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end, v_cm);
  end loop;

  -- D1: comprobante de ANTICIPO por el monto del adelanto (SUNAT: se emite al cobrar).
  v_igv := round((v_adelanto - v_adelanto / 1.18) * 100) / 100;
  v_subtotal := round((v_adelanto - v_igv) * 100) / 100;
  select string_agg(p.referencia || ' ' || v.sku, ', ' order by v.sku) into v_detalle
    from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
   where si.separacion_id = v_id;
  v_comp := emitir_comprobante(
    p_ubicacion_id, p_comprobante_tipo, v_subtotal, v_igv, v_adelanto, null,
    case when p_comprobante_tipo = 'factura' then 'ruc' when v_dni is not null then 'dni' else 'sin_documento' end,
    case when p_comprobante_tipo = 'factura' then v_ruc else v_dni end,
    case when p_comprobante_tipo = 'factura' then btrim(p_cliente_razon_social) else v_nombres || ' ' || v_apellidos end,
    jsonb_build_array(jsonb_build_object(
      'descripcion', left('Anticipo por separación ' || v_codigo || ': ' || coalesce(v_detalle, ''), 250),
      'cantidad', 1, 'precio_unitario', v_subtotal))
  );
  update comprobantes set separacion_id = v_id, es_anticipo = true where id = v_comp;
  update separaciones set comprobante_anticipo_id = v_comp where id = v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. entregar_separacion — la clienta recoge: se cobra el saldo y nace la venta por el total.
-- ---------------------------------------------------------------------------
create or replace function retail.entregar_separacion(p_separacion_id uuid, p_pagos jsonb default '[]'::jsonb, p_token uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s separaciones%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_venta uuid;
  v_existente uuid;
  v_it record;
  v_item_id uuid; v_mov uuid; v_costo numeric;
  v_pago jsonb;
  v_saldo numeric;
  v_pagado numeric := 0;
  v_ap apartados%rowtype;
  v_igv numeric; v_subtotal numeric; v_comp uuid; v_ant comprobantes%rowtype;
  v_items_comp jsonb;
begin
  if p_token is not null then
    select id into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente; end if;
  end if;

  -- `for update`: dos cajas entregando la misma separación — la segunda espera y la ve entregada.
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then
    raise exception 'Esa separación no existe';
  end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso para entregar separaciones de esa tienda';
  end if;
  if s.estado = 'entregada' then
    raise exception 'La separación % ya se entregó', s.codigo;
  elsif s.estado in ('liberada', 'devuelta') then
    raise exception 'La separación % venció y se liberó: las prendas volvieron a la tienda. Si la clienta aún las quiere, sepáralas de nuevo', s.codigo;
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  select id into v_caja from cajas where ubicacion_id = s.ubicacion_id and estado = 'abierta';
  if v_caja is null then
    raise exception 'No hay una caja abierta en esta tienda — ábrela antes de entregar';
  end if;

  v_saldo := round(s.total - s.adelanto, 2);
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Los pagos del saldo vienen mal formados';
  end if;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    if coalesce(v_pago ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
      raise exception 'Medio de pago no reconocido: %', v_pago ->> 'metodo';
    end if;
    if coalesce((v_pago ->> 'monto')::numeric, 0) <= 0 then
      raise exception 'Cada medio de pago lleva un monto mayor a cero';
    end if;
    v_pagado := v_pagado + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_pagado, 2) <> v_saldo then
    raise exception 'Los pagos (S/%) no cuadran con el saldo de la separación (S/%)', round(v_pagado, 2), v_saldo;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota, asesora_id, emisor)
      values (s.ubicacion_id, s.clienta_id, v_caja, v_persona, p_token, 'Entrega de la separación ' || s.codigo, s.asesora_id, 'retail')
      returning id into v_venta;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select id into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente;
  end;

  -- En una sola transacción: se cierra cada apartado y sale la prenda. No queda ventana en la que
  -- otra caja pueda llevarse la unidad liberada (la que dejó abierta la Fase 1 de ADR-0141).
  for v_it in select * from separacion_items where separacion_id = s.id order by id loop
    select * into v_ap from apartados where id = v_it.apartado_id;
    perform fn_cerrar_apartado_de_separacion(v_it.apartado_id, 'entregada', v_persona);
    select costo into v_costo from variantes where id = v_it.variante_id;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                             motivo_descuento, descuento_etiqueta_id)
      values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
              case when v_it.descuento_unitario > 0 then 'campana' end, v_it.descuento_etiqueta_id)
      returning id into v_item_id;
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values (v_it.variante_id, s.ubicacion_id, v_ap.sububicacion_id, 'salida', v_it.cantidad, 'venta', v_item_id, v_persona)
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);
  end loop;

  -- El adelanto es un pago más de esta venta (medio `anticipo`); el saldo, lo que paga hoy.
  insert into venta_pagos (venta_id, metodo, monto) values (v_venta, 'anticipo', s.adelanto);
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto, recibido)
      values (v_venta, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
              case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end);
  end loop;

  -- D1: el comprobante final DEDUCE el anticipo. Si el adelanto cubrió el 100%, no hay saldo que
  -- documentar: el comprobante del anticipo ya cubrió toda la operación (validar con el contador).
  if v_saldo > 0 then
    select * into v_ant from comprobantes where id = s.comprobante_anticipo_id;
    v_igv := round((v_saldo - v_saldo / 1.18) * 100) / 100;
    v_subtotal := round((v_saldo - v_igv) * 100) / 100;
    select jsonb_agg(jsonb_build_object(
             'variante_id', si.variante_id, 'descripcion', p.referencia || ' ' || v.sku, 'cantidad', si.cantidad,
             'precio_unitario', si.precio_unitario - si.descuento_unitario) order by v.sku)
      into v_items_comp
      from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
     where si.separacion_id = s.id;
    v_comp := emitir_comprobante(
      s.ubicacion_id, s.comprobante_tipo, v_subtotal, v_igv, v_saldo, v_venta,
      coalesce(v_ant.cliente_tipo_doc, 'sin_documento'), v_ant.cliente_num_doc, v_ant.cliente_nombre, v_items_comp
    );
    update comprobantes
       set separacion_id = s.id, anticipo_deducido = s.adelanto, anticipo_comprobante_id = s.comprobante_anticipo_id
     where id = v_comp;
  end if;

  update separaciones
     set estado = 'entregada', venta_id = v_venta, entregada_en = now(), entregada_por = v_persona
   where id = s.id;
  return v_venta;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. extender_separacion — una sola vez, +7 días desde hoy (o desde el vencimiento, si aún no llegó).
-- ---------------------------------------------------------------------------
create or replace function retail.extender_separacion(p_separacion_id uuid)
returns date
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s separaciones%rowtype;
  v_vence date;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo una líder o la cuenta de ventas de la tienda puede extender una separación' using errcode = '42501';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then raise exception 'Esa separación no existe'; end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre las separaciones de esa tienda';
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se extiende una separación abierta (esta está %)', s.estado;
  end if;
  if s.extensiones >= 1 then
    raise exception 'La separación % ya se extendió una vez', s.codigo;
  end if;
  v_vence := greatest(s.vence_el, fn_hoy_lima()) + 7;
  update separaciones set vence_el = v_vence, extensiones = extensiones + 1 where id = s.id;
  update apartados set vence_el = v_vence where separacion_id = s.id and estado = 'abierto';
  return v_vence;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. liberar_separacion — las prendas vuelven a la tienda; el adelanto queda POR DEVOLVER.
-- ---------------------------------------------------------------------------
create or replace function retail.liberar_separacion(p_separacion_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s separaciones%rowtype;
  v_persona uuid;
  v_ap uuid;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo una líder o la cuenta de ventas de la tienda puede liberar una separación' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('vencio', 'clienta_desistio', 'error_de_carga') then
    raise exception 'Elige por qué se libera: venció, la clienta desistió o fue un error al separar';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then raise exception 'Esa separación no existe'; end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre las separaciones de esa tienda';
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se libera una separación abierta (esta está %)', s.estado;
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  for v_ap in select apartado_id from separacion_items where separacion_id = s.id loop
    perform fn_cerrar_apartado_de_separacion(v_ap, case when p_motivo = 'error_de_carga' then 'error_de_carga' else 'clienta_no_vino' end, v_persona);
  end loop;
  update separaciones
     set estado = 'liberada', liberada_en = now(), liberada_por = v_persona, liberada_motivo = p_motivo
   where id = s.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. fn_vencer_separaciones — D3: vencida hace MÁS de 2 días y nadie decidió → se libera sola.
--    Se llama al abrir la pantalla de la tienda (sin pg_cron). Idempotente; devuelve cuántas liberó.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_vencer_separaciones(p_ubicacion_id uuid)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_gracia_dias constant integer := 2;
  v_hoy date := fn_hoy_lima();
  s separaciones%rowtype;
  v_ap uuid;
  v_n integer := 0;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso sobre las separaciones de esa tienda';
  end if;
  for s in
    select * from separaciones
     where ubicacion_id = p_ubicacion_id and estado = 'abierta' and vence_el + c_gracia_dias < v_hoy
     order by vence_el
     for update skip locked            -- si una caja la está entregando ahora mismo, no se pisa
  loop
    for v_ap in select apartado_id from separacion_items where separacion_id = s.id loop
      perform fn_cerrar_apartado_de_separacion(v_ap, 'clienta_no_vino', null);
    end loop;
    update separaciones
       set estado = 'liberada', liberada_en = now(), liberada_por = null, liberada_motivo = 'vencio'
     where id = s.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. registrar_devolucion_separacion — el adelanto vuelve a la clienta. Cierra la separación.
--    La nota de crédito se intenta emitir; si todavía no se puede (el anticipo aún no fue aceptado
--    por SUNAT, o la tienda no tiene serie), la devolución se registra igual y avisa: el dinero de
--    la clienta nunca espera a un trámite (principio 9).
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_devolucion_separacion(
  p_separacion_id uuid,
  p_medio text,                    -- 'efectivo' | 'tarjeta' | 'yape' | 'plin' | 'transferencia'
  p_operacion text default null,   -- N.º de operación (obligatorio salvo efectivo)
  p_cci text default null          -- solo si el medio real es transferencia y cambió el CCI
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s separaciones%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_cm uuid;
  v_nc uuid;
  v_aviso text;
  v_op text := nullif(btrim(coalesce(p_operacion, '')), '');
  v_cci text := nullif(regexp_replace(coalesce(p_cci, ''), '\D', '', 'g'), '');
  v_ant comprobantes%rowtype;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo una líder o la cuenta de ventas de la tienda puede registrar una devolución' using errcode = '42501';
  end if;
  if p_medio is null or p_medio not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
    raise exception 'Elige cómo se devolvió el adelanto';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then raise exception 'Esa separación no existe'; end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre las separaciones de esa tienda';
  end if;
  if s.estado = 'abierta' then
    raise exception 'Primero libera la separación %: las prendas siguen guardadas para la clienta', s.codigo;
  elsif s.estado <> 'liberada' then
    raise exception 'La separación % no tiene devolución pendiente (está %)', s.codigo, s.estado;
  end if;
  if p_medio <> 'efectivo' and v_op is null then
    raise exception 'Anota el N.º de operación: es la prueba de que se le devolvió';
  end if;
  if p_medio = 'transferencia' and coalesce(v_cci, s.devolucion_cci) is null then
    raise exception 'Anota el CCI de la clienta (20 dígitos)';
  end if;
  if v_cci is not null and v_cci !~ '^[0-9]{20}$' then
    raise exception 'El CCI tiene 20 dígitos';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  if p_medio = 'efectivo' then
    select id into v_caja from cajas where ubicacion_id = s.ubicacion_id and estado = 'abierta';
    if v_caja is null then
      raise exception 'Para devolver en efectivo tiene que haber una caja abierta en la tienda';
    end if;
    insert into caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota, separacion_id)
      values (v_caja, 'egreso', s.adelanto, 'Devolución de separación ' || s.codigo, v_persona,
              'Adelanto devuelto a ' || s.clienta_nombres || ' ' || s.clienta_apellidos, s.id)
      returning id into v_cm;
  end if;

  if s.comprobante_anticipo_id is not null then
    select * into v_ant from comprobantes where id = s.comprobante_anticipo_id;
    begin
      v_nc := emitir_nota(v_ant.id, 'nota_credito', 'Anulación de la operación: separación ' || s.codigo || ' no recogida',
                          v_ant.subtotal, v_ant.igv, v_ant.total, v_ant.items);
      update comprobantes set separacion_id = s.id where id = v_nc;
    exception when others then
      v_nc := null;
      v_aviso := 'La nota de crédito queda pendiente: ' || sqlerrm;
    end;
  end if;

  update separaciones
     set estado = 'devuelta', devuelta_en = now(), devuelta_por = v_persona, devolucion_medio_real = p_medio,
         devolucion_operacion = v_op, devolucion_caja_movimiento_id = v_cm, nota_credito_id = v_nc,
         devolucion_cci = case when p_medio = 'transferencia' and v_cci is not null and devolucion_medio = 'transferencia' then v_cci else devolucion_cci end
   where id = s.id;
  return jsonb_build_object('nota_credito_id', v_nc, 'aviso', v_aviso);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Lecturas para la pantalla (prefijos de lectura de `lib/espera-reglas.ts`: `buscar_`, `resumen_`).
-- ---------------------------------------------------------------------------
create or replace function retail.buscar_separaciones(p_ubicacion_id uuid, p_texto text default null, p_estados text[] default null)
returns table (
  id uuid, codigo text, estado text, clienta_nombres text, clienta_apellidos text, clienta_celular text, clienta_dni text,
  asesora text, total numeric, adelanto numeric, saldo numeric, vence_el date, extensiones smallint, creada_en timestamptz,
  devolucion_medio text, devolucion_numero text, devolucion_cci_final text, liberada_sola boolean,
  comprobante_anticipo text, comprobante_final text, nota_credito text, items jsonb, pagos jsonb
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select s.id, s.codigo, s.estado, s.clienta_nombres, s.clienta_apellidos, s.clienta_celular, s.clienta_dni,
         nullif(btrim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')), ''),
         s.total, s.adelanto, case when s.estado = 'abierta' then s.total - s.adelanto else 0 end,
         s.vence_el, s.extensiones, s.created_at,
         s.devolucion_medio, s.devolucion_numero, right(s.devolucion_cci, 4),
         (s.liberada_en is not null and s.liberada_por is null),
         ca.serie || '-' || lpad(ca.numero::text, 6, '0'),
         (select cf.serie || '-' || lpad(cf.numero::text, 6, '0') from comprobantes cf where cf.venta_id = s.venta_id and s.venta_id is not null order by cf.created_at limit 1),
         cn.serie || '-' || lpad(cn.numero::text, 6, '0'),
         (select jsonb_agg(jsonb_build_object('variante_id', si.variante_id, 'sku', v.sku, 'referencia', p.referencia,
                                              'cantidad', si.cantidad, 'precio_unitario', si.precio_unitario,
                                              'descuento_unitario', si.descuento_unitario) order by v.sku)
            from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
           where si.separacion_id = s.id),
         (select jsonb_agg(jsonb_build_object('metodo', sp.metodo, 'monto', sp.monto) order by sp.created_at)
            from separacion_pagos sp where sp.separacion_id = s.id)
    from separaciones s
    left join public.personas pa on pa.id = s.asesora_id
    left join comprobantes ca on ca.id = s.comprobante_anticipo_id
    left join comprobantes cn on cn.id = s.nota_credito_id
   where s.ubicacion_id = p_ubicacion_id
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (p_estados is null or s.estado = any (p_estados))
     and (
       nullif(btrim(coalesce(p_texto, '')), '') is null
       or s.codigo ilike '%' || btrim(p_texto) || '%'
       or (s.clienta_nombres || ' ' || s.clienta_apellidos) ilike '%' || btrim(p_texto) || '%'
       or s.clienta_dni = regexp_replace(p_texto, '\D', '', 'g')
       or s.clienta_celular = regexp_replace(p_texto, '\D', '', 'g')
       or (ca.serie || '-' || lpad(ca.numero::text, 6, '0')) ilike '%' || btrim(p_texto) || '%'
     )
   order by case s.estado when 'liberada' then 0 when 'abierta' then 1 else 2 end, s.vence_el, s.created_at
   limit 200;
$$;

create or replace function retail.resumen_separaciones(p_ubicacion_id uuid)
returns table (por_recoger integer, prendas_guardadas integer, en_custodia numeric, en_custodia_efectivo numeric,
               por_devolver integer, monto_por_devolver numeric, vencen_pronto integer, vencidas integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select
    count(*) filter (where s.estado = 'abierta')::integer,
    coalesce((select sum(si.cantidad) from separacion_items si join separaciones x on x.id = si.separacion_id
               where x.ubicacion_id = p_ubicacion_id and x.estado = 'abierta'), 0)::integer,
    coalesce(sum(s.adelanto) filter (where s.estado = 'abierta'), 0),
    coalesce((select sum(sp.monto) from separacion_pagos sp join separaciones x on x.id = sp.separacion_id
               where x.ubicacion_id = p_ubicacion_id and x.estado = 'abierta' and sp.metodo = 'efectivo'), 0),
    count(*) filter (where s.estado = 'liberada')::integer,
    coalesce(sum(s.adelanto) filter (where s.estado = 'liberada'), 0),
    count(*) filter (where s.estado = 'abierta' and s.vence_el between fn_hoy_lima() and fn_hoy_lima() + 2)::integer,
    count(*) filter (where s.estado = 'abierta' and s.vence_el < fn_hoy_lima())::integer
  from separaciones s
  where s.ubicacion_id = p_ubicacion_id and fn_puede_operar_ubicacion(p_ubicacion_id);
$$;

-- ---------------------------------------------------------------------------
-- 11. fn_verificar_separaciones — el invariante, para pruebas y para mirar producción.
--     Debe devolver CERO filas.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_verificar_separaciones()
returns table (separacion_id uuid, codigo text, problema text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- abierta ⇔ todos sus apartados abiertos
  select s.id, s.codigo, 'abierta con un apartado cerrado'
    from separaciones s join separacion_items si on si.separacion_id = s.id join apartados a on a.id = si.apartado_id
   where s.estado = 'abierta' and a.estado <> 'abierto'
  union all
  select s.id, s.codigo, 'cerrada con un apartado todavía abierto'
    from separaciones s join separacion_items si on si.separacion_id = s.id join apartados a on a.id = si.apartado_id
   where s.estado <> 'abierta' and a.estado = 'abierto'
  union all
  select s.id, s.codigo, 'los pagos no suman el adelanto'
    from separaciones s
   where s.adelanto <> coalesce((select sum(monto) from separacion_pagos where separacion_id = s.id), 0)
  union all
  select s.id, s.codigo, 'el total no cuadra con sus prendas'
    from separaciones s
   where s.total <> coalesce((select sum((precio_unitario - descuento_unitario) * cantidad) from separacion_items where separacion_id = s.id), 0)
  union all
  select s.id, s.codigo, 'sin prendas'
    from separaciones s where not exists (select 1 from separacion_items where separacion_id = s.id)
  union all
  select s.id, s.codigo, 'entregada: la venta no suma el total'
    from separaciones s
   where s.estado = 'entregada'
     and s.total <> coalesce((select sum(monto) from venta_pagos where venta_id = s.venta_id), 0)
  union all
  select s.id, s.codigo, 'sin comprobante de anticipo'
    from separaciones s where s.comprobante_anticipo_id is null;
$$;

-- ---------------------------------------------------------------------------
-- 12. Permisos: solo `authenticated` ejecuta, y cada función decide quién puede qué.
-- ---------------------------------------------------------------------------
revoke all on function retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) from public, anon;
revoke all on function retail.entregar_separacion(uuid, jsonb, uuid) from public, anon;
revoke all on function retail.extender_separacion(uuid) from public, anon;
revoke all on function retail.liberar_separacion(uuid, text) from public, anon;
revoke all on function retail.fn_vencer_separaciones(uuid) from public, anon;
revoke all on function retail.registrar_devolucion_separacion(uuid, text, text, text) from public, anon;
revoke all on function retail.buscar_separaciones(uuid, text, text[]) from public, anon;
revoke all on function retail.resumen_separaciones(uuid) from public, anon;
revoke all on function retail.fn_verificar_separaciones() from public, anon, authenticated;

grant execute on function retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) to authenticated;
grant execute on function retail.entregar_separacion(uuid, jsonb, uuid) to authenticated;
grant execute on function retail.extender_separacion(uuid) to authenticated;
grant execute on function retail.liberar_separacion(uuid, text) to authenticated;
grant execute on function retail.fn_vencer_separaciones(uuid) to authenticated;
grant execute on function retail.registrar_devolucion_separacion(uuid, text, text, text) to authenticated;
grant execute on function retail.buscar_separaciones(uuid, text, text[]) to authenticated;
grant execute on function retail.resumen_separaciones(uuid) to authenticated;
