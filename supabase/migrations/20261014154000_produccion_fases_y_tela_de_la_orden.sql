-- Producción · la orden con sus fases, quién hace cada una y su tela (ADR-0400, actividad 1).
--
-- EL PROBLEMA PRIMERO. Hoy una etapa de la orden es un bit (`producciones.etapas` jsonb: pendiente | hecho | tercerizado) sobre tres
-- etapas fijas, sin cantidad, sin fecha, sin a quién ni a cuánto; «Enviar a maquila» solo cambia un color, y la orden no sabe qué tela
-- lleva (tres montos tecleados al abrir). Felipe pidió el 2026-10-13 rediseñar el módulo entero: «que se pueda escoger los colores, los
-- tipos de tela, las tallas; al crear una orden indicar si una parte se va a tercerizar: el corte, las costuras, las fases». Y decidió
-- el 2026-10-14 (ADR-0400): la orden de producción es la única entidad y las áreas del Taller son FASES por las que pasa; cada fase
-- tiene UN quién (el Taller o un servicio de afuera) decidido al abrir; la tela se elige al abrir, por metros, con el consumo escrito en
-- el modelo y corregido por lo real. Producción tiene 0 órdenes: nada se migra.
--
-- QUÉ CREA (solo esquema y apertura; avance, Salida y Vuelta llegan en 20261014155000; cierre y costos en 20261014160000).
--   1. `producciones.numero` (OP-000001 en pantalla, como OI-): identifica, no cuenta; lo que ya existe se numera por fecha.
--   2. `insumos.tejido_id` e `insumos.color_codigo`: la tela del estante dice de qué tejido es y de qué color, con el MISMO vocabulario
--      de la prenda (`tejidos`, `colores`): así la orden puede proponer «la tela del color de la prenda».
--   3. `produccion_fases`: una fila por fase de la orden (corte · costura · acabado siempre; bordado, estampado, lavandería si la orden
--      las enciende), con quién la hace, el proveedor y la tarifa CONGELADOS al abrir, la cantidad mínima y la fecha prometida. El
--      estado NO se guarda: se deriva de los avances, las salidas y las vueltas (`fn_fases_de_orden`).
--   4. `produccion_avances`, `produccion_salidas` (+ líneas) y `produccion_vueltas` (+ líneas): las tablas donde se anota lo que se
--      terminó, lo que salió a un servicio y lo que volvió. Nacen aquí con sus candados de forma y su inmutabilidad; las funciones que
--      las escriben llegan en 155000. `bulto`, `operacion` y `operaria_persona_id` nacen vacías: granularidad A hoy, C mañana sin rehacer.
--   5. `produccion_insumos`: la tela (y los avíos) de ESTA orden, con el consumo por prenda y el plan en metros. `producto_consumos`: lo
--      que el modelo dice que lleva (declarado desde Audaces, corregido por lo medido al cerrar). `proveedor_tarifas`: la lista de precios
--      por proveedor y fase, que SUGIERE; la fase copia.
--   6. `abrir_orden_produccion(p_apertura, p_fases, p_insumos)`: envuelve a `abrir_produccion` o a `abrir_produccion_con_modelo_nuevo`
--      (sus firmas y su carga útil NO cambian, ADR-0396) y en la misma transacción escribe las fases y la tela. Valida lo que el ADR dice
--      que se rechaza. `fn_fases_de_orden` (lectura), `cambiar_quien_fase` (solo si la fase no empezó) y `fn_nueva_orden_opciones` (lo que
--      la hoja ofrece elegir: proveedores de servicio con su lista de precios, consumo por modelo, tela comprometida).
--   RLS encendido SIN políticas en todas las tablas nuevas y sin permisos para `anon` ni `authenticated`: se leen y escriben solo por
--   funciones security definer que exigen el módulo `produccion` y estar en el Taller (ADR-0161/0306; Q1 del ADR-0400).
--
-- DESCARTÉ
--   · Guardar el estado de la fase en una columna: dos fuentes de verdad (estado y avances) que se desencuentran al primer Deshacer.
--   · Permitir dos proveedores en una fase (partir la fase): Felipe eligió «una fase entera tiene un quién»; para eso, dos órdenes.
--   · Un catálogo `etapas_taller` con pantalla en Configuración: una lista que cambia una vez al año; va fija en `fn_fase_secuencia`.
--   · La conversión kilo → metro (R-25): CAYLA compra por metros (Felipe, 2026-10-14).
--   · Cambiar la firma de `abrir_produccion`: ADR-0396 la congeló; la envoltura es aditiva y la hoja vieja seguiría funcionando.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: tablas nuevas, dos `alter table add column if not exists` sin
-- políticas en la misma transacción (ADR-0195), `create or replace trigger` (nunca `drop trigger`), sin `select … into` dentro de textos
-- entre comillas (ADR-0288). Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El número de la orden ----------
create sequence if not exists retail.producciones_numero_seq;
alter table retail.producciones add column if not exists numero integer;
-- Lo que ya existe (en producción, nada; en local, la semilla) se numera por fecha de apertura, una sola vez.
do $$
declare v_fila record;
begin
  for v_fila in select id from retail.producciones where numero is null order by created_at, id loop
    update retail.producciones set numero = nextval('retail.producciones_numero_seq') where id = v_fila.id;
  end loop;
end $$;
alter table retail.producciones alter column numero set default nextval('retail.producciones_numero_seq');
alter table retail.producciones alter column numero set not null;
alter sequence retail.producciones_numero_seq owned by retail.producciones.numero;
create unique index if not exists producciones_numero_unico on retail.producciones (numero);
comment on column retail.producciones.numero is 'ADR-0400: el número de la orden (OP-000012 en pantalla). Identifica, no cuenta: anular no lo libera.';
-- `producciones` tiene el candado de columnas del dinero (20260921151000): toda columna NUEVA queda fuera para `authenticated` hasta que se le dé su
-- `grant select (nueva)` (lo dice esa migración, línea 24). El número no es dinero y la pantalla resuelve `/produccion/ordenes/OP-000012` por él.
-- Sin esta línea la página no encuentra la orden en la base de producción (la API responde «permission denied for table producciones»).
grant select (numero) on retail.producciones to authenticated;

create or replace function retail.fn_produccion_numero_texto(p_numero integer) returns text
language sql immutable
set search_path = retail, public, extensions
as $$ select 'OP-' || lpad(p_numero::text, 6, '0') $$;

-- ---------- 2. La tela del estante dice de qué tejido y de qué color es ----------
alter table retail.insumos add column if not exists tejido_id uuid references retail.tejidos (id);
alter table retail.insumos add column if not exists color_codigo text references retail.colores (codigo);
create index if not exists insumos_tejido_idx on retail.insumos (tejido_id) where tejido_id is not null;
comment on column retail.insumos.tejido_id is 'ADR-0400: de qué tejido es esta tela (el vocabulario de la prenda). Opcional; la orden filtra por él.';
comment on column retail.insumos.color_codigo is 'ADR-0400: de qué color es esta tela (el vocabulario de la prenda). Opcional; la orden propone la tela del color de la prenda.';

-- ---------- 3. Las fases de la orden ----------
-- El orden de la ruta es fijo (ADR-0400, decisión 2): corte → [bordado/estampado sobre pieza] → costura → [bordado/estampado sobre prenda]
-- → [lavandería] → acabado. Bordado y estampado dicen si van sobre pieza (antes de costura) o sobre prenda (después).
create or replace function retail.fn_fase_secuencia(p_clave text, p_posicion text) returns smallint
language sql immutable
set search_path = retail, public, extensions
as $$
  select case
    when p_clave = 'corte' then 10
    when p_clave = 'bordado' and p_posicion = 'pieza' then 20
    when p_clave = 'estampado' and p_posicion = 'pieza' then 25
    when p_clave = 'costura' then 30
    when p_clave = 'bordado' and p_posicion = 'prenda' then 40
    when p_clave = 'estampado' and p_posicion = 'prenda' then 45
    when p_clave = 'lavanderia' then 50
    when p_clave = 'acabado' then 60
  end::smallint
$$;

create or replace function retail.fn_fase_nombre(p_clave text) returns text
language sql immutable
set search_path = retail, public, extensions
as $$
  select case p_clave
    when 'corte' then 'Corte' when 'costura' then 'Costura' when 'acabado' then 'Acabado'
    when 'bordado' then 'Bordado' when 'estampado' then 'Estampado' when 'lavanderia' then 'Lavandería'
    else p_clave end
$$;

create table if not exists retail.produccion_fases (
  id uuid primary key default gen_random_uuid(),
  produccion_id uuid not null references retail.producciones (id),
  clave text not null check (clave in ('corte', 'costura', 'acabado', 'bordado', 'estampado', 'lavanderia')),
  secuencia smallint not null check (secuencia > 0),
  -- Solo bordado y estampado: sobre la pieza cortada (antes de costura) o sobre la prenda armada (después).
  posicion text check (posicion in ('pieza', 'prenda')),
  quien text not null check (quien in ('taller', 'servicio')),
  proveedor_id uuid references retail.proveedores_produccion (id),
  -- Congelados al abrir (la lista de precios del proveedor solo sugiere): lo que se le debe sale de aquí × las buenas que vuelven.
  tarifa_prenda numeric(10, 2) check (tarifa_prenda is null or tarifa_prenda > 0),
  fijo_orden numeric(10, 2) not null default 0 check (fijo_orden >= 0),
  cantidad_minima integer check (cantidad_minima is null or cantidad_minima > 0),
  fecha_prometida date,
  nota text check (nota is null or btrim(nota) <> ''),
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint produccion_fases_una_por_orden unique (produccion_id, clave),
  constraint produccion_fases_secuencia_unica unique (produccion_id, secuencia),
  -- Un servicio dice quién y a cuánto; el Taller no lleva proveedor, tarifa ni fecha prometida.
  constraint produccion_fases_quien check (
    case when quien = 'servicio'
      then proveedor_id is not null and tarifa_prenda is not null
      else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
    end
  ),
  constraint produccion_fases_posicion check ((clave in ('bordado', 'estampado')) = (posicion is not null)),
  constraint produccion_fases_secuencia_de_la_ruta check (secuencia = retail.fn_fase_secuencia(clave, posicion))
);
create index if not exists produccion_fases_orden_idx on retail.produccion_fases (produccion_id, secuencia);
create index if not exists produccion_fases_proveedor_idx on retail.produccion_fases (proveedor_id) where proveedor_id is not null;
comment on table retail.produccion_fases is
  'ADR-0400: una fila por fase de la orden (corte, costura y acabado siempre; bordado, estampado y lavandería si la orden las enciende), '
  'con quién la hace y, si es un servicio, el proveedor y la tarifa congelados al abrir. El estado se deriva (fn_fases_de_orden). '
  'Solo se lee y escribe por funciones security definer (RLS sin políticas).';

-- ---------- 4. Lo que se anota: avances, salidas y vueltas (las funciones que escriben aquí llegan en 20261014155000) ----------

create table if not exists retail.produccion_salidas (
  id uuid primary key default gen_random_uuid(),
  fase_id uuid not null references retail.produccion_fases (id),
  -- El número de la guía de remisión, como texto: el Taller no emite comprobantes (A3).
  guia text check (guia is null or btrim(guia) <> ''),
  nota text check (nota is null or btrim(nota) <> ''),
  hecho_por uuid not null references public.personas (id),
  created_at timestamptz not null default now()
);
create table if not exists retail.produccion_salida_lineas (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references retail.produccion_salidas (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  constraint produccion_salida_lineas_unica unique (salida_id, variante_id)
);
create index if not exists produccion_salidas_fase_idx on retail.produccion_salidas (fase_id);
comment on table retail.produccion_salidas is 'ADR-0400: lo que salió del Taller a un servicio (una fase con quien = servicio), por talla y color. Solo se agrega.';

create table if not exists retail.produccion_vueltas (
  id uuid primary key default gen_random_uuid(),
  fase_id uuid not null references retail.produccion_fases (id),
  guia text check (guia is null or btrim(guia) <> ''),
  nota text check (nota is null or btrim(nota) <> ''),
  hecho_por uuid not null references public.personas (id),
  created_at timestamptz not null default now()
);
create table if not exists retail.produccion_vuelta_lineas (
  id uuid primary key default gen_random_uuid(),
  vuelta_id uuid not null references retail.produccion_vueltas (id),
  variante_id uuid not null references retail.variantes (id),
  buenas integer not null default 0 check (buenas >= 0),
  segundas integer not null default 0 check (segundas >= 0),
  faltantes integer not null default 0 check (faltantes >= 0),
  motivo text check (motivo is null or btrim(motivo) <> ''),
  constraint produccion_vuelta_lineas_unica unique (vuelta_id, variante_id),
  constraint produccion_vuelta_lineas_algo check (buenas + segundas + faltantes > 0),
  -- Lo que no volvió bueno dice por qué.
  constraint produccion_vuelta_lineas_motivo check (segundas + faltantes = 0 or motivo is not null)
);
create index if not exists produccion_vueltas_fase_idx on retail.produccion_vueltas (fase_id);
comment on table retail.produccion_vueltas is 'ADR-0400: lo que volvió de un servicio, por talla y color: buenas, segundas y faltantes con motivo. Solo se agrega.';

create table if not exists retail.produccion_avances (
  id uuid primary key default gen_random_uuid(),
  fase_id uuid not null references retail.produccion_fases (id),
  variante_id uuid not null references retail.variantes (id),
  -- Positiva = terminadas; negativa = un Deshacer (fila nueva, nunca se borra la anterior).
  cantidad integer not null check (cantidad <> 0),
  origen text not null check (origen in ('taller', 'vuelta', 'deshacer')),
  vuelta_id uuid references retail.produccion_vueltas (id),
  deshace_id uuid references retail.produccion_avances (id),
  -- Granularidad C (bulto y operación), cuando haga falta: hoy nacen vacías (ADR-0400, decisión 1).
  bulto text,
  operacion text,
  operaria_persona_id uuid references public.personas (id),
  nota text check (nota is null or btrim(nota) <> ''),
  hecho_por uuid not null references public.personas (id),
  created_at timestamptz not null default now(),
  constraint produccion_avances_origen check (
    case origen
      when 'deshacer' then cantidad < 0 and deshace_id is not null
      when 'vuelta' then cantidad > 0 and vuelta_id is not null
      else cantidad > 0 and vuelta_id is null and deshace_id is null
    end
  )
);
create index if not exists produccion_avances_fase_idx on retail.produccion_avances (fase_id, variante_id);
comment on table retail.produccion_avances is
  'ADR-0400: cada «Terminé N» de una fase, por talla y color (negativo = Deshacer). Solo se agrega: nada se edita ni se borra. '
  'Bulto, operación y operaria nacen vacíos (granularidad A; C sin rehacer).';


-- Nada de lo anotado se edita ni se borra (principio 4: solo se agrega; un error se deshace con otra fila).
create or replace function retail.fn_produccion_anotado_inmutable() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Lo anotado en una orden de producción no se edita ni se borra: se deshace con otra anotación' using errcode = '42501';
end;
$$;
create or replace trigger produccion_avances_inmutable before update or delete on retail.produccion_avances
  for each row execute function retail.fn_produccion_anotado_inmutable();
create or replace trigger produccion_salidas_inmutable before update or delete on retail.produccion_salidas
  for each row execute function retail.fn_produccion_anotado_inmutable();
create or replace trigger produccion_salida_lineas_inmutable before update or delete on retail.produccion_salida_lineas
  for each row execute function retail.fn_produccion_anotado_inmutable();
create or replace trigger produccion_vueltas_inmutable before update or delete on retail.produccion_vueltas
  for each row execute function retail.fn_produccion_anotado_inmutable();
create or replace trigger produccion_vuelta_lineas_inmutable before update or delete on retail.produccion_vuelta_lineas
  for each row execute function retail.fn_produccion_anotado_inmutable();

-- ---------- 5. La tela de la orden, el consumo del modelo y la lista de precios del proveedor ----------
create table if not exists retail.produccion_insumos (
  id uuid primary key default gen_random_uuid(),
  produccion_id uuid not null references retail.producciones (id),
  insumo_id uuid not null references retail.insumos (id),
  -- A qué color de la prenda se aplica (la tela negra para las blusas negras); vacío = a toda la orden (el hilo, los botones).
  color_codigo text references retail.colores (codigo),
  -- En la unidad del insumo (metros para la tela), con tres decimales: 1.250 m por prenda.
  consumo_por_prenda numeric(10, 3) not null check (consumo_por_prenda > 0),
  -- consumo × prendas de ese color × (1 + merma del insumo). Lo calcula la función al abrir.
  cantidad_plan numeric(12, 3) not null check (cantidad_plan > 0),
  nota text check (nota is null or btrim(nota) <> ''),
  created_at timestamptz not null default now()
);
-- La misma tela una sola vez por color (y una sola vez «para toda la orden»).
create unique index if not exists produccion_insumos_unico on retail.produccion_insumos (produccion_id, insumo_id, coalesce(color_codigo, ''));
create index if not exists produccion_insumos_insumo_idx on retail.produccion_insumos (insumo_id);
comment on table retail.produccion_insumos is
  'ADR-0400: la tela y los avíos de ESTA orden, con el consumo por prenda y el plan en su unidad. Lo comprometido = plan − consumido. '
  'Solo se lee y escribe por funciones (RLS sin políticas).';

create table if not exists retail.producto_consumos (
  producto_id uuid primary key references retail.productos (id),
  -- Metros de tela por prenda del modelo (lo que calcula Audaces al plotear la marcada).
  tela_por_prenda numeric(10, 3) not null check (tela_por_prenda > 0),
  -- Por talla, si se tiene: {"S": 1.15, "M": 1.2}. Opcional.
  por_talla jsonb,
  fuente text not null check (fuente in ('declarado', 'medido')),
  nota text check (nota is null or btrim(nota) <> ''),
  actualizado_por uuid references public.personas (id),
  updated_at timestamptz not null default now()
);
comment on table retail.producto_consumos is
  'ADR-0400 (reabre ADR-0133 d.5 con 232 modelos y 0 órdenes): cuánta tela lleva cada prenda del modelo. Declarado una vez (Audaces) y '
  'corregido por lo medido al cerrar cada orden; lo medido gana cuando existe.';

create table if not exists retail.proveedor_tarifas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references retail.proveedores_produccion (id),
  fase_clave text not null check (fase_clave in ('corte', 'costura', 'acabado', 'bordado', 'estampado', 'lavanderia')),
  tarifa_prenda numeric(10, 2) not null check (tarifa_prenda > 0),
  cantidad_minima integer check (cantidad_minima is null or cantidad_minima > 0),
  fijo_orden numeric(10, 2) not null default 0 check (fijo_orden >= 0),
  vigente_desde date not null default retail.fn_hoy_lima(),
  nota text check (nota is null or btrim(nota) <> ''),
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint proveedor_tarifas_unica unique (proveedor_id, fase_clave, vigente_desde)
);
comment on table retail.proveedor_tarifas is
  'ADR-0400: la lista de precios de un servicio por fase (por prenda, con cantidad mínima y fijo por orden). SUGIERE: la fase copia y '
  'congela. Solo se lee y escribe por funciones (RLS sin políticas; la ve quien ve los costos del Taller).';

-- RLS sin políticas y sin permisos de la API en todo lo nuevo.
alter table retail.produccion_fases enable row level security;
alter table retail.produccion_avances enable row level security;
alter table retail.produccion_salidas enable row level security;
alter table retail.produccion_salida_lineas enable row level security;
alter table retail.produccion_vueltas enable row level security;
alter table retail.produccion_vuelta_lineas enable row level security;
alter table retail.produccion_insumos enable row level security;
alter table retail.producto_consumos enable row level security;
alter table retail.proveedor_tarifas enable row level security;
revoke all on retail.produccion_fases, retail.produccion_avances, retail.produccion_salidas, retail.produccion_salida_lineas,
  retail.produccion_vueltas, retail.produccion_vuelta_lineas, retail.produccion_insumos, retail.producto_consumos, retail.proveedor_tarifas
  from anon, authenticated;

-- ---------- 6. Quién puede operar la orden (Q1 del ADR-0400: ve el módulo y está en ese Taller; el líder siempre) ----------
create or replace function retail.fn_produccion_exigir_operar(p_ubicacion_id uuid) returns void
language plpgsql stable
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Esta operación necesita el módulo «Producción» en tu rol' using errcode = '42501', hint = 'produccion_sin_modulo';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para operar órdenes en ese Taller' using errcode = '42501', hint = 'produccion_sin_taller';
  end if;
end;
$$;

create or replace function retail.fn_produccion_puede_leer(p_ubicacion_id uuid) returns boolean
language sql stable
set search_path = retail, public, extensions
as $$
  select retail.fn_es_lider() or (retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(p_ubicacion_id))
$$;

-- ---------- 7. Validar y normalizar las fases que manda la pantalla ----------
-- Entra: [{clave, quien, proveedor_id, tarifa_prenda, fijo_orden, cantidad_minima, fecha_prometida, posicion, nota}] (números como texto
-- o número; lo opcional puede faltar). Sale: el mismo arreglo, limpio, con `secuencia` y la tarifa copiada de la lista de precios cuando
-- la pantalla no mandó una. Rechaza con su motivo.
create or replace function retail.fn_produccion_fases_normalizar(p_fases jsonb) returns jsonb
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_f jsonb; v_clave text; v_quien text; v_posicion text; v_prov uuid; v_tarifa numeric; v_fijo numeric; v_min integer;
  v_fecha date; v_nota text; v_rubro text; v_activo boolean; v_salida jsonb := '[]'::jsonb; v_claves text[] := '{}';
begin
  if p_fases is null or jsonb_typeof(p_fases) <> 'array' or jsonb_array_length(p_fases) = 0 then
    raise exception 'La orden necesita sus fases: por lo menos Corte, Costura y Acabado' using hint = 'fases_espina';
  end if;
  for v_f in select * from jsonb_array_elements(p_fases) loop
    v_clave := lower(btrim(coalesce(v_f ->> 'clave', '')));
    if v_clave not in ('corte', 'costura', 'acabado', 'bordado', 'estampado', 'lavanderia') then
      raise exception 'Una de las fases no existe: «%»', v_clave using hint = 'fase_desconocida';
    end if;
    if v_clave = any (v_claves) then
      raise exception 'La fase «%» va una sola vez en la orden', retail.fn_fase_nombre(v_clave) using hint = 'fase_repetida';
    end if;
    v_claves := v_claves || v_clave;
    v_posicion := nullif(lower(btrim(coalesce(v_f ->> 'posicion', ''))), '');
    if v_clave in ('bordado', 'estampado') then
      if v_posicion is null or v_posicion not in ('pieza', 'prenda') then
        raise exception 'El % dice si va sobre la pieza cortada o sobre la prenda armada', retail.fn_fase_nombre(v_clave) using hint = 'fase_sin_posicion';
      end if;
    elsif v_posicion is not null then
      raise exception 'Solo bordado y estampado eligen si van sobre pieza o sobre prenda' using hint = 'fase_con_posicion';
    end if;
    v_quien := lower(btrim(coalesce(v_f ->> 'quien', 'taller')));
    if v_quien not in ('taller', 'servicio') then
      raise exception 'Cada fase la hace el Taller o un servicio de afuera' using hint = 'fase_quien';
    end if;
    v_nota := nullif(btrim(coalesce(v_f ->> 'nota', '')), '');
    v_prov := null; v_tarifa := null; v_fijo := 0; v_min := null; v_fecha := null;
    if v_quien = 'servicio' then
      begin
        v_prov := nullif(v_f ->> 'proveedor_id', '')::uuid;
      exception when others then
        raise exception 'El proveedor de «%» no es válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_proveedor';
      end;
      if v_prov is null then
        raise exception 'Si «%» sale a un servicio, dice a quién', retail.fn_fase_nombre(v_clave) using hint = 'fase_sin_proveedor';
      end if;
      select pr.rubro, pr.activo into v_rubro, v_activo from retail.proveedores_produccion pr where pr.id = v_prov;
      if v_rubro is null or v_activo is not true then
        raise exception 'Ese proveedor no está activo en el directorio del Taller' using hint = 'fase_proveedor_inactivo';
      end if;
      if v_rubro in ('tela', 'avios') then
        raise exception 'Ese proveedor vende tela o avíos; un servicio de «%» es de maquila u otro rubro', retail.fn_fase_nombre(v_clave)
          using hint = 'fase_proveedor_rubro';
      end if;
      begin
        v_tarifa := nullif(btrim(coalesce(v_f ->> 'tarifa_prenda', '')), '')::numeric;
        v_fijo := coalesce(nullif(btrim(coalesce(v_f ->> 'fijo_orden', '')), '')::numeric, 0);
        v_min := nullif(btrim(coalesce(v_f ->> 'cantidad_minima', '')), '')::integer;
      exception when others then
        raise exception 'La tarifa de «%» no es un número válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end;
      -- Sin tarifa escrita: la lista de precios del proveedor para esa fase (la vigente más reciente).
      if v_tarifa is null then
        for v_tarifa, v_min, v_fijo in
          select t.tarifa_prenda, coalesce(v_min, t.cantidad_minima), case when v_fijo > 0 then v_fijo else t.fijo_orden end
          from retail.proveedor_tarifas t
          where t.proveedor_id = v_prov and t.fase_clave = v_clave and t.vigente_desde <= retail.fn_hoy_lima()
          order by t.vigente_desde desc limit 1
        loop exit; end loop;
      end if;
      if v_tarifa is null or v_tarifa <= 0 then
        raise exception 'Falta la tarifa por prenda de «%»: escríbela o guárdala en la lista de precios del proveedor', retail.fn_fase_nombre(v_clave)
          using hint = 'fase_sin_tarifa';
      end if;
      if v_tarifa > 9999.99 or v_fijo < 0 or v_fijo > 99999.99 or (v_min is not null and v_min <= 0) then
        raise exception 'La tarifa de «%» está fuera de rango', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end if;
      begin
        v_fecha := nullif(v_f ->> 'fecha_prometida', '')::date;
      exception when others then
        raise exception 'La fecha prometida de «%» no es válida', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_invalida';
      end;
      if v_fecha is not null and v_fecha < retail.fn_hoy_lima() then
        raise exception 'La fecha prometida de «%» ya pasó', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_pasada';
      end if;
    end if;
    v_salida := v_salida || jsonb_build_object(
      'clave', v_clave, 'posicion', v_posicion, 'secuencia', retail.fn_fase_secuencia(v_clave, v_posicion), 'quien', v_quien,
      'proveedor_id', v_prov, 'tarifa_prenda', v_tarifa, 'fijo_orden', v_fijo, 'cantidad_minima', v_min, 'fecha_prometida', v_fecha, 'nota', v_nota);
  end loop;
  if not ('corte' = any (v_claves) and 'costura' = any (v_claves) and 'acabado' = any (v_claves)) then
    raise exception 'La orden necesita sus fases: por lo menos Corte, Costura y Acabado' using hint = 'fases_espina';
  end if;
  return v_salida;
end;
$$;

-- ---------- 8. Validar la tela y los avíos de la orden ----------
-- Entra: [{insumo_id, color_codigo, consumo_por_prenda, nota}] (puede ser vacío o nulo: una orden puede abrirse sin tela declarada).
-- Sale: el arreglo limpio con `cantidad_plan` = consumo × prendas de ese color × (1 + merma del insumo; `merma_pct` es fracción: 0.05).
create or replace function retail.fn_produccion_insumos_normalizar(p_insumos jsonb, p_lineas jsonb, p_producto_id uuid) returns jsonb
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_i jsonb; v_insumo uuid; v_color text; v_consumo numeric; v_nota text; v_merma numeric; v_archivado timestamptz;
  v_prendas integer; v_total integer; v_salida jsonb := '[]'::jsonb;
begin
  if p_insumos is null or jsonb_typeof(p_insumos) <> 'array' then return '[]'::jsonb; end if;
  select coalesce(sum((l ->> 'cantidad')::integer), 0) into v_total from jsonb_array_elements(p_lineas) l;
  for v_i in select * from jsonb_array_elements(p_insumos) loop
    begin
      v_insumo := nullif(v_i ->> 'insumo_id', '')::uuid;
    exception when others then
      raise exception 'Una de las telas o avíos de la orden no es válida' using hint = 'insumo_invalido';
    end;
    if v_insumo is null then
      raise exception 'Una de las telas o avíos de la orden no dice cuál es' using hint = 'insumo_invalido';
    end if;
    select i.merma_pct, i.archivado_at into v_merma, v_archivado from retail.insumos i where i.id = v_insumo;
    if v_merma is null then
      raise exception 'Esa tela o avío no está en Insumos' using hint = 'insumo_invalido';
    end if;
    if v_archivado is not null then
      raise exception 'Esa tela o avío está archivada en Insumos' using hint = 'insumo_archivado';
    end if;
    v_color := nullif(btrim(coalesce(v_i ->> 'color_codigo', '')), '');
    if v_color is not null then
      -- El color tiene que ser uno de los que la orden fabrica.
      select coalesce(sum((l ->> 'cantidad')::integer), 0) into v_prendas
      from jsonb_array_elements(p_lineas) l
      join retail.variantes v on v.id = (l ->> 'variante_id')::uuid
      where v.color_codigo = v_color;
      if v_prendas is null or v_prendas = 0 then
        raise exception 'La orden no fabrica el color «%»: la tela de ese color no tiene a qué aplicarse', v_color using hint = 'insumo_color_ajeno';
      end if;
    else
      v_prendas := v_total;
    end if;
    begin
      v_consumo := nullif(btrim(coalesce(v_i ->> 'consumo_por_prenda', '')), '')::numeric;
    exception when others then
      raise exception 'El consumo por prenda no es un número válido' using hint = 'insumo_consumo_invalido';
    end;
    if v_consumo is null or v_consumo <= 0 or v_consumo > 9999 then
      raise exception 'El consumo por prenda tiene que ser mayor que cero' using hint = 'insumo_consumo_invalido';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_salida) s
      where (s ->> 'insumo_id')::uuid = v_insumo and (s ->> 'color_codigo') is not distinct from v_color
    ) then
      raise exception 'La misma tela va una sola vez por color en la orden' using hint = 'insumo_repetido';
    end if;
    v_nota := nullif(btrim(coalesce(v_i ->> 'nota', '')), '');
    v_salida := v_salida || jsonb_build_object(
      'insumo_id', v_insumo, 'color_codigo', v_color, 'consumo_por_prenda', round(v_consumo, 3),
      'cantidad_plan', round(v_consumo * v_prendas * (1 + coalesce(v_merma, 0)), 3), 'nota', v_nota);
  end loop;
  return v_salida;
end;
$$;

-- ---------- 9. Abrir la orden con sus fases y su tela ----------
-- `p_apertura` trae lo que ya recibían las funciones de hoy, con la misma forma:
--   modelo que existe: {ubicacion_id, producto_id, lineas: [{variante_id, cantidad}], es_muestra, fecha_entrega, nota, token}
--   modelo nuevo:      {modelo_nuevo: true, ubicacion_id, referencia, categoria_id, variantes: [{talla_id, color_codigo, cantidad}],
--                       precio, es_muestra, fecha_entrega, nota, confirmo_distinto, token}
-- Los tres costos tecleados ya no existen: se mandan en 0 a la función de hoy (el costo real sale del consumo y del devengado, ADR-0133 d.4).
create or replace function retail.abrir_orden_produccion(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null)
returns table (id uuid, numero integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid; v_token uuid; v_fecha date; v_es_muestra boolean; v_nota text; v_id uuid; v_numero integer; v_producto uuid;
  v_fases jsonb; v_insumos jsonb; v_lineas jsonb; v_f jsonb; v_i jsonb; v_actor uuid; v_plan integer; v_referencia text;
  v_servicios text; v_existia boolean := false; v_tipo text;
begin
  if p_apertura is null or jsonb_typeof(p_apertura) <> 'object' then
    raise exception 'Falta lo que abre la orden' using hint = 'apertura_invalida';
  end if;
  begin
    v_ubicacion := nullif(p_apertura ->> 'ubicacion_id', '')::uuid;
    v_token := nullif(p_apertura ->> 'token', '')::uuid;
    v_fecha := nullif(p_apertura ->> 'fecha_entrega', '')::date;
  exception when others then
    raise exception 'Los datos de la orden no son válidos' using hint = 'apertura_invalida';
  end;
  if v_ubicacion is null then
    raise exception 'La orden dice en qué Taller se abre' using hint = 'apertura_sin_taller';
  end if;
  perform retail.fn_produccion_exigir_operar(v_ubicacion);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién abre esta orden' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  select u.tipo into v_tipo from retail.ubicaciones u where u.id = v_ubicacion and u.activo;
  if v_tipo is distinct from 'taller' then
    raise exception 'Solo el Taller abre órdenes de producción' using hint = 'apertura_sin_taller';
  end if;
  -- La fecha de entrega promete que las prendas salen del Taller ese día: una fecha pasada no promete nada (ADR-0400, supuestos).
  if v_fecha is not null and v_fecha < retail.fn_hoy_lima() then
    raise exception 'La fecha de entrega ya pasó: elige una de hoy en adelante' using hint = 'entrega_pasada';
  end if;
  v_es_muestra := coalesce((p_apertura ->> 'es_muestra')::boolean, false);
  v_nota := nullif(btrim(coalesce(p_apertura ->> 'nota', '')), '');

  -- Las fases se validan ANTES de abrir: una orden sin fases válidas no se abre (y no gasta número).
  v_fases := retail.fn_produccion_fases_normalizar(p_fases);

  -- Doble clic o reintento: la función de hoy devuelve la orden ya abierta por el mismo token; si ya tiene fases, no se duplican.
  if v_token is not null then
    for v_id in select p.id from retail.producciones p where p.token_cliente = v_token loop v_existia := true; end loop;
  end if;

  if coalesce((p_apertura ->> 'modelo_nuevo')::boolean, false) then
    v_id := retail.abrir_produccion_con_modelo_nuevo(
      v_ubicacion, p_apertura ->> 'referencia', nullif(p_apertura ->> 'categoria_id', '')::uuid, p_apertura -> 'variantes',
      coalesce(nullif(btrim(coalesce(p_apertura ->> 'precio', '')), '')::numeric, 0), 0, 0, 0, v_es_muestra, v_fecha, v_nota,
      coalesce((p_apertura ->> 'confirmo_distinto')::boolean, false), v_token);
  else
    v_producto := nullif(p_apertura ->> 'producto_id', '')::uuid;
    v_id := retail.abrir_produccion(v_ubicacion, v_producto, p_apertura -> 'lineas', 0, 0, 0, v_es_muestra, v_fecha, v_nota, v_token);
  end if;

  select p.numero, p.producto_id, p.cantidad_plan into v_numero, v_producto, v_plan from retail.producciones p where p.id = v_id;
  if v_existia or exists (select 1 from retail.produccion_fases f where f.produccion_id = v_id) then
    return query select v_id, v_numero;
    return;
  end if;

  -- Las líneas reales de la orden (las que la función de hoy escribió), para repartir la tela por color.
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'cantidad', l.cantidad_plan)), '[]'::jsonb)
    into v_lineas from retail.produccion_lineas l where l.produccion_id = v_id;
  v_insumos := retail.fn_produccion_insumos_normalizar(p_insumos, v_lineas, v_producto);

  for v_f in select * from jsonb_array_elements(v_fases) loop
    insert into retail.produccion_fases (produccion_id, clave, secuencia, posicion, quien, proveedor_id, tarifa_prenda, fijo_orden,
      cantidad_minima, fecha_prometida, nota, creado_por)
    values (v_id, v_f ->> 'clave', (v_f ->> 'secuencia')::smallint, v_f ->> 'posicion', v_f ->> 'quien',
      nullif(v_f ->> 'proveedor_id', '')::uuid, nullif(v_f ->> 'tarifa_prenda', '')::numeric, coalesce((v_f ->> 'fijo_orden')::numeric, 0),
      nullif(v_f ->> 'cantidad_minima', '')::integer, nullif(v_f ->> 'fecha_prometida', '')::date, v_f ->> 'nota', v_actor);
  end loop;

  for v_i in select * from jsonb_array_elements(v_insumos) loop
    insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, cantidad_plan, nota)
    values (v_id, (v_i ->> 'insumo_id')::uuid, v_i ->> 'color_codigo', (v_i ->> 'consumo_por_prenda')::numeric,
      (v_i ->> 'cantidad_plan')::numeric, v_i ->> 'nota');
    -- Se escribe una vez en el modelo (ADR-0400, decisión 6): la primera tela de la primera orden deja declarado cuánto lleva la prenda.
    -- Lo medido al cerrar lo corrige; lo declarado nunca pisa lo medido.
    if exists (select 1 from retail.insumos i where i.id = (v_i ->> 'insumo_id')::uuid and i.tipo = 'tela') then
      insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
      values (v_producto, (v_i ->> 'consumo_por_prenda')::numeric, 'declarado', v_actor)
      on conflict (producto_id) do nothing;
    end if;
  end loop;

  -- Actividad (ADR-0207): sin montos. Si falla, la orden igual queda abierta.
  begin
    select p.referencia into v_referencia from retail.productos p where p.id = v_producto;
    select string_agg(retail.fn_fase_nombre(f ->> 'clave') || ' con ' || pr.nombre, ', ' order by (f ->> 'secuencia')::int)
      into v_servicios
      from jsonb_array_elements(v_fases) f join retail.proveedores_produccion pr on pr.id = (f ->> 'proveedor_id')::uuid
      where f ->> 'quien' = 'servicio';
    perform retail.fn_actividad_anotar(
      'produccion', 'orden_produccion_abierta',
      'abrió la ' || retail.fn_produccion_numero_texto(v_numero) || ' de ' || coalesce(v_referencia, 'un modelo') || ': '
        || retail.fn_actividad_cuantas(v_plan, 'prenda', 'prendas')
        || case when v_es_muestra then ' (muestra)' else '' end
        || coalesce(' · afuera: ' || v_servicios, ' · todo en el Taller'),
      v_actor, retail.fn_actividad_terminal_ahora(), v_ubicacion, v_ubicacion,
      'produccion', v_id::text, now(),
      jsonb_build_object('produccion_id', v_id, 'numero', v_numero, 'fases', jsonb_array_length(v_fases), 'insumos', jsonb_array_length(v_insumos)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la apertura de la orden % (%)', v_numero, sqlerrm;
  end;

  return query select v_id, v_numero;
end;
$$;

-- ---------- 10. Las fases de una orden, con su estado derivado ----------
-- Devuelve un arreglo ordenado por secuencia. Por fase: entrada (lo que puede entrar: el plan en Corte, las terminadas de la fase anterior
-- en las demás), hechas, afuera, segundas, faltantes, estado (pendiente · en_curso · hecha), si es la actual, si empezó, desde cuándo y
-- cuántos días lleva, y el devengado del servicio (buenas que volvieron × tarifa + fijo). NULL si la orden no existe o no se puede leer.
create or replace function retail.fn_fases_de_orden(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid; v_plan integer; v_abierta timestamptz; v_f record; v_salida jsonb := '[]'::jsonb;
  v_entrada integer; v_hechas integer; v_salieron integer; v_volvieron integer; v_buenas integer; v_segundas integer; v_faltantes integer;
  v_prev_hecha boolean := true; v_prev_hechas integer; v_prev_fin timestamptz; v_estado text; v_actual boolean; v_hay_actual boolean := false;
  v_empezada boolean; v_desde timestamptz; v_desde_a timestamptz; v_desde_s timestamptz; v_fin timestamptz; v_devengado numeric;
begin
  select p.ubicacion_id, p.cantidad_plan, p.created_at into v_ubicacion, v_plan, v_abierta
    from retail.producciones p where p.id = p_produccion_id;
  if v_ubicacion is null or not retail.fn_produccion_puede_leer(v_ubicacion) then return null; end if;
  v_prev_hechas := v_plan; v_prev_fin := v_abierta;
  for v_f in
    select f.*, pr.nombre as proveedor_nombre
    from retail.produccion_fases f left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
    where f.produccion_id = p_produccion_id order by f.secuencia
  loop
    select coalesce(sum(a.cantidad), 0), min(a.created_at), max(a.created_at) into v_hechas, v_desde_a, v_fin
      from retail.produccion_avances a where a.fase_id = v_f.id;
    select coalesce(sum(l.cantidad), 0), min(s.created_at) into v_salieron, v_desde_s
      from retail.produccion_salidas s join retail.produccion_salida_lineas l on l.salida_id = s.id where s.fase_id = v_f.id;
    -- La fase empezó con lo primero que se anotó: un avance o una salida (least ignora los nulos).
    v_desde := least(v_desde_a, v_desde_s);
    select coalesce(sum(l.buenas), 0), coalesce(sum(l.segundas), 0), coalesce(sum(l.faltantes), 0)
      into v_buenas, v_segundas, v_faltantes
      from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas l on l.vuelta_id = vu.id where vu.fase_id = v_f.id;
    v_volvieron := v_buenas + v_segundas + v_faltantes;
    v_entrada := v_prev_hechas;
    v_empezada := v_desde is not null;
    if v_prev_hecha and v_entrada > 0 and v_hechas >= v_entrada then v_estado := 'hecha';
    elsif v_empezada then v_estado := 'en_curso';
    else v_estado := 'pendiente'; end if;
    v_actual := (v_estado <> 'hecha') and not v_hay_actual;
    if v_actual then v_hay_actual := true; end if;
    v_devengado := case when v_f.quien = 'servicio' and v_volvieron > 0 then round(v_buenas * v_f.tarifa_prenda + v_f.fijo_orden, 2)
                        when v_f.quien = 'servicio' then 0 else null end;
    v_salida := v_salida || jsonb_build_object(
      'id', v_f.id, 'clave', v_f.clave, 'nombre', retail.fn_fase_nombre(v_f.clave), 'secuencia', v_f.secuencia, 'posicion', v_f.posicion,
      'quien', v_f.quien, 'proveedor_id', v_f.proveedor_id, 'proveedor_nombre', v_f.proveedor_nombre,
      'tarifa_prenda', v_f.tarifa_prenda, 'fijo_orden', v_f.fijo_orden, 'cantidad_minima', v_f.cantidad_minima,
      'fecha_prometida', v_f.fecha_prometida, 'nota', v_f.nota,
      'entrada', v_entrada, 'hechas', v_hechas, 'afuera', greatest(v_salieron - v_volvieron, 0), 'salieron', v_salieron,
      'segundas', v_segundas, 'faltantes', v_faltantes,
      'estado', v_estado, 'actual', v_actual, 'empezada', v_empezada,
      'desde', coalesce(v_desde, case when v_actual then v_prev_fin end),
      'dias_en_fase', case when v_estado = 'hecha' then null
                           else floor(extract(epoch from (now() - coalesce(v_desde, case when v_actual then v_prev_fin end))) / 86400)::int end,
      'devengado', v_devengado);
    v_prev_hecha := (v_estado = 'hecha');
    v_prev_hechas := v_hechas;
    v_prev_fin := coalesce(v_fin, v_prev_fin);
  end loop;
  return v_salida;
end;
$$;

-- ---------- 11. Cambiar quién hace una fase (solo si no empezó) ----------
create or replace function retail.cambiar_quien_fase(
  p_fase_id uuid, p_quien text, p_proveedor_id uuid default null, p_tarifa_prenda numeric default null,
  p_fijo_orden numeric default null, p_cantidad_minima integer default null, p_fecha_prometida date default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_ubicacion uuid; v_estado text; v_n jsonb; v_actor uuid;
begin
  select f.*, p.ubicacion_id, p.estado as estado_orden into v_f
    from retail.produccion_fases f join retail.producciones p on p.id = f.produccion_id where f.id = p_fase_id;
  if v_f.id is null then
    raise exception 'Esa fase no existe' using hint = 'fase_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_f.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_f.estado_orden <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  if exists (select 1 from retail.produccion_avances a where a.fase_id = p_fase_id)
     or exists (select 1 from retail.produccion_salidas s where s.fase_id = p_fase_id) then
    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', p_quien, 'proveedor_id', p_proveedor_id, 'tarifa_prenda', p_tarifa_prenda,
    'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', p_fecha_prometida, 'nota', v_f.nota))
    || case when v_f.clave = 'corte' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('clave', 'corte', 'quien', 'taller')) end
    || case when v_f.clave = 'costura' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('clave', 'costura', 'quien', 'taller')) end
    || case when v_f.clave = 'acabado' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('clave', 'acabado', 'quien', 'taller')) end
  ) -> 0;
  update retail.produccion_fases f set
    quien = v_n ->> 'quien', proveedor_id = nullif(v_n ->> 'proveedor_id', '')::uuid,
    tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric, fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0),
    cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer, fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;

-- ---------- 12. Lo que la hoja «Nueva orden» ofrece elegir ----------
-- En UNA lectura: los proveedores que hacen servicios (activos, con rubro distinto de tela y avíos) con su lista de precios vigente por
-- fase; cuánta tela lleva cada modelo (declarado o medido); y los metros de cada tela ya comprometidos por las órdenes en proceso
-- (plan − lo ya descontado), para que dos órdenes no digan «alcanza» contra los mismos metros (ADR-0400, supuestos). Lo lee quien puede
-- leer Producción en ese Taller (el líder o quien ve el módulo parado ahí); los datos bancarios del proveedor no viajan.
create or replace function retail.fn_nueva_orden_opciones(p_ubicacion_id uuid) returns jsonb
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select case when retail.fn_produccion_puede_leer(p_ubicacion_id) then jsonb_build_object(
    'proveedores', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', pr.id, 'nombre', pr.nombre, 'rubro', pr.rubro, 'activo', pr.activo,
          'tarifas', coalesce((
            select jsonb_agg(jsonb_build_object('fase_clave', t.fase_clave, 'tarifa_prenda', t.tarifa_prenda, 'cantidad_minima', t.cantidad_minima,
                                                'fijo_orden', t.fijo_orden, 'vigente_desde', t.vigente_desde) order by t.fase_clave, t.vigente_desde desc)
            from retail.proveedor_tarifas t where t.proveedor_id = pr.id and t.vigente_desde <= retail.fn_hoy_lima()), '[]'::jsonb))
        order by pr.nombre)
      from retail.proveedores_produccion pr where pr.activo and pr.rubro not in ('tela', 'avios')), '[]'::jsonb),
    'consumos', coalesce((
      select jsonb_agg(jsonb_build_object('producto_id', c.producto_id, 'tela_por_prenda', c.tela_por_prenda, 'por_talla', c.por_talla, 'fuente', c.fuente))
      from retail.producto_consumos c), '[]'::jsonb),
    'comprometido', coalesce((
      select jsonb_agg(jsonb_build_object('insumo_id', x.insumo_id, 'cantidad', x.cantidad))
      from (
        select pi.insumo_id,
               greatest(sum(pi.cantidad_plan) - coalesce((
                 select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end)
                 from retail.movimientos_insumo mi
                 where mi.insumo_id = pi.insumo_id and mi.tipo in ('consumo', 'devolucion')
                   and mi.produccion_id in (select p2.id from retail.producciones p2 where p2.ubicacion_id = p_ubicacion_id and p2.estado = 'en_proceso')), 0), 0) as cantidad
        from retail.produccion_insumos pi
        join retail.producciones p on p.id = pi.produccion_id
        where p.ubicacion_id = p_ubicacion_id and p.estado = 'en_proceso'
        group by pi.insumo_id
      ) x), '[]'::jsonb)
  ) end
$$;

-- ---------- 13. Permisos ----------
revoke all on function retail.abrir_orden_produccion(jsonb, jsonb, jsonb) from public, anon;
revoke all on function retail.fn_fases_de_orden(uuid) from public, anon;
revoke all on function retail.cambiar_quien_fase(uuid, text, uuid, numeric, numeric, integer, date) from public, anon;
revoke all on function retail.fn_produccion_numero_texto(integer) from public, anon;
revoke all on function retail.fn_nueva_orden_opciones(uuid) from public, anon;
grant execute on function retail.abrir_orden_produccion(jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function retail.fn_fases_de_orden(uuid) to authenticated, service_role;
grant execute on function retail.cambiar_quien_fase(uuid, text, uuid, numeric, numeric, integer, date) to authenticated, service_role;
grant execute on function retail.fn_produccion_numero_texto(integer) to authenticated, service_role;
grant execute on function retail.fn_nueva_orden_opciones(uuid) to authenticated, service_role;
-- Internas: nadie las llama desde la API.
revoke all on function retail.fn_fase_secuencia(text, text) from public, anon, authenticated;
revoke all on function retail.fn_fase_nombre(text) from public, anon, authenticated;
revoke all on function retail.fn_produccion_exigir_operar(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_puede_leer(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_fases_normalizar(jsonb) from public, anon, authenticated;
revoke all on function retail.fn_produccion_insumos_normalizar(jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_anotado_inmutable() from public, anon, authenticated;

reset lock_timeout;
