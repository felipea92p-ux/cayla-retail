-- ============================================================================
-- 20261014235000_pedidos_web_modelo.sql — CAYLA V2 · Tienda online (ADR-0408), base de las actividades 7 y 8
--
-- QUÉ HACE. El motor del PEDIDO WEB: lo que el cliente separa en la tienda online y la sede confirma, cobra y entrega.
--   1. Tres tablas nuevas, solo de funciones (RLS encendido, sin políticas, sin permisos de tabla):
--      · `pedidos_web`: el pedido. Número correlativo «W-0001» (uno solo para todas las sedes, como la maqueta), el cliente
--        por su ficha (`clienta_id`), la tienda donde recoge todo (`ubicacion_id`), el estado, el total y lo pagado, y el
--        código de 4 cifras para recoger (propuesta m).
--      · `pedido_web_lineas`: una prenda por línea (`variante_id`), con su precio ya calculado por la tienda (precio web,
--        descuento de campaña y su etiqueta: la actividad 7 lo valida contra la Vitrina). Al confirmar, cada línea queda
--        reservada (con SU apartado), «por conseguir» con fecha, o quitada (sin stock).
--      · `pedido_web_pagos`: sus pagos, listos para una pasarela (origen, proveedor, referencia externa única, estado). Sus
--        funciones van en la migración siguiente (`20261015000000_pedidos_web_cobros.sql`).
--   2. Las funciones internas que llaman la tienda (actividad 7, envueltas en sus `tienda_*`) y el ERP (actividad 8):
--        crear_pedido_web              → la tienda, al tocar «Separar». NO toca el stock.
--        confirmar_pedido_web          → el ERP, línea por línea: reservar (sede y lugar), por conseguir con fecha, o quitar.
--        reservar_linea_pedido_web     → el ERP, cuando llega la prenda «por conseguir».
--        no_confirmar_pedido_web       → el ERP, con su motivo. El stock no cambia (nunca bajó).
--        anular_pedido_web             → el ERP, un pedido confirmado: libera lo reservado.
--        fn_cerrar_pedidos_web_vencidos → la ruta programada (cron): cierra lo que nadie confirmó a tiempo.
--        fn_pedidos_web_sede / fn_pedido_web → el ERP lee la lista y el detalle (con los avisos de 48 h y 7 días).
--        fn_pedidos_web_de_clienta     → la tienda lee «Mis pedidos».
--   3. Dos disparadores sobre tablas que ya existen, sin cambiarles nada más:
--      · `apartados`: una reserva de un pedido web no se libera desde Apartados (solo desde Pedidos web).
--      · `clientas`: si la ficha del cliente se une a otra (`unir_clientas`), sus pedidos web la siguen.
--
-- LA VIDA DE UN PEDIDO (estados de `pedidos_web.estado`):
--
--     «Separar» (tienda)
--            │                     nadie lo confirma a tiempo (24 h corridas; cron)
--            ▼                   ┌──────────────────────────────────────────────────► vencido
--      por_confirmar ────────────┤
--            │                   └─ no se puede confirmar (motivo) ─────────────────► anulado
--            │ confirmar: cada línea reservada (sale primero del almacén), por conseguir o quitada
--            ▼
--       confirmado ───────────────── anular (motivo): lo reservado vuelve ─────────────► anulado
--            │ los pagos aprobados llegan al total (solo, en el mismo instante)
--            ▼
--         pagado ──────────────────── entregar con el código (actividad 10) ───────────► entregado
--
--   Líneas (`pedido_web_lineas.estado`): pendiente → reservada | por_conseguir | quitada al confirmar;
--   por_conseguir → reservada cuando llega; reservada → liberada al anular; reservada → entregada al entregar (actividad 10).
--   Avisos que se CALCULAN AL LEER (no hay proceso): confirmado y sin pagar hace 48 h; pagado, listo y sin recoger hace 7 días.
--   Un pedido «por confirmar» pasado su plazo ya se LEE vencido aunque el cron todavía no haya corrido, y no se confirma.
--
-- POR QUÉ ASÍ.
--   · Reservar es el motor de Apartados (ADR-0141, ADR-0408 DECIDÍ 4), no uno nuevo: el movimiento «apartado» sube
--     `stock.cantidad_apartada` (Vender y los traslados ya no la toman) y la fila de `apartados` la sostiene; anular escribe la
--     «liberacion_apartado». La prenda sale del stock recién al ENTREGAR (Felipe 2026-10-14), así el conteo no la «encuentra».
--   · Una reserva por línea: `pedido_web_lineas.apartado_id` es único, y al confirmar la transacción la base comprueba que
--     cada línea reservada tiene su apartado ABIERTO de esa misma prenda, sede y lugar (y la liberada, el suyo cerrado).
--   · El apartado dice «Pedido web W-0001», nunca el nombre ni el celular del cliente: sus datos viven solo en su ficha y se
--     leen por el pedido. Copiados al apartado, sobrevivirían a la ficha cuando se anonimiza (Ley 29733, ADR-0288). Quien atiende
--     el pedido los ve con el módulo `pedidos_web` (nombre, celular, el DNI a medias y si es del club, como la maqueta), no la
--     ficha entera; por eso `fn_pedido_web` y `fn_pedidos_web_sede` están declaradas en el vigilante de
--     `scripts/pruebas/clientas_por_modulo_y_anonimizar.mjs` con el candado de su módulo, como las de Avisos del club.
--   · «Pagos nunca pasan el total» no cabe en un CHECK de la fila del pago (es una suma). Se guarda la suma en el pedido
--     (`pagado`), la mantiene un disparador sumando la diferencia, y el CHECK `pagado <= total` vive en la fila del pedido:
--     dos pagos a la vez chocan en el candado de ESA fila y el segundo ve la suma del primero. Un control «al final» (diferido)
--     dejaría pasar a los dos (cada uno ve su propia foto). Al confirmar la transacción se recalcula la suma desde los pagos
--     y desde las líneas: si un disparador se equivocara, nada se guarda.
--   · El pedido pasa a «pagado» en la misma operación en que lo pagado llega al total: no depende de que la pantalla se acuerde.
--   · Dos piden la última: confirmar bloquea las filas de stock de esas prendas en orden (ADR-0190, `fn_bloquear_en_orden`) y
--     reserva con el mismo candado de siempre. El segundo espera al primero y, si ya no queda, recibe «sin stock» con la línea
--     (hint `pedido_web_sin_stock`): entonces la sede decide (otra sede, por conseguir o quitarla). Quién separó primero lo dice
--     el número (`numero`, correlativo) y la hora, y lo muestra `fn_pedido_web` (propuesta k).
--   · Los plazos (24 h, 48 h, 7 días) llegan como parámetro con su valor de hoy: la actividad 6 los guarda en Configuración ▸
--     Tienda web y al integrar se conectan. Los topes de cada uno son los mismos que acepta esa pantalla (1–168 h, 1–720 h, 1–60 d).
--   · Las funciones del ERP firman con `fn_actor_persona_id(true)` (el responsable del combo) y preguntan el permiso a la cuenta
--     con `fn_ve_modulo('pedidos_web')`: el módulo lo da de alta la actividad 8; mientras no exista, solo el líder entra.
--   · Ninguna función se le da a `tienda_web`: la tienda las envuelve con sus `tienda_*` (actividad 7). Las internas no las
--     ejecuta nadie más que su dueño; las del ERP, `authenticated` (con el permiso adentro); el cierre, `service_role`.
--   · Nada se borra: un pedido, una línea o un pago se anula y queda (disparador que rechaza DELETE y TRUNCATE).
--
-- QUÉ NO HACE (a propósito).
--   · NO entrega. Crear la venta, sacar la prenda del stock (la «salida» que cierra el apartado con motivo «entregada») y
--     encolar la boleta en Lucode es la actividad 10 (con /rigor: «pagada, por entregar»). Aquí quedan el estado `entregado`
--     (pagado → entregado), la línea `entregada` (con su apartado cerrado «entregada») y el código de 4 cifras.
--   · NO mueve una prenda reservada en OTRA sede hasta la del pedido: la reserva se hace allá (la unidad queda protegida), y
--     traerla (soltar allá, viajar, reservar acá al llegar) es la actividad 8, con el motor de «pedir a otra sede».
--   · NO valida precios contra la Vitrina (actividad 7) ni da de alta el módulo (actividad 8).
--
-- PRODUCCIÓN. NO está aplicada. Se pega en el SQL Editor tal cual (todo lleva `retail.`), y se puede volver a pegar. No crea
-- políticas ni usa `drop trigger`: crear los disparadores de `apartados` y `clientas` toma un candado breve de esas tablas
-- (con `lock_timeout = 3s`: si una tienda las tiene tomadas, falla sin tocar nada y se vuelve a pegar). Ningún `select … into`
-- dentro de un texto entre comillas. Después se pega `20261015000000_pedidos_web_cobros.sql`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. El código de 4 cifras para recoger (propuesta m): del generador de números al azar de Postgres, de 1000 a 9999 (sin
--    cero adelante, que se confunde al dictarlo). No identifica al pedido: lo confirma (el pedido se busca por su número).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_pedido_web_codigo_recojo()
returns text
language sql
volatile
set search_path = retail, public, extensions
as $$
  select (1000 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 9000))::text;
$$;

-- ----------------------------------------------------------------------------
-- 2. Las tablas
-- ----------------------------------------------------------------------------
create sequence if not exists retail.pedidos_web_numero_seq as integer minvalue 1 start 1;

create table if not exists retail.pedidos_web (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('retail.pedidos_web_numero_seq'),
  codigo text generated always as ('W-' || case when numero < 10000 then lpad(numero::text, 4, '0') else numero::text end) stored,
  clienta_id uuid not null references retail.clientas(id),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  estado text not null default 'por_confirmar',
  total numeric(12,2) not null default 0,
  pagado numeric(12,2) not null default 0,
  codigo_recojo text not null default retail.fn_pedido_web_codigo_recojo(),
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  confirmado_por uuid references public.personas(id),
  pagado_en timestamptz,
  entregado_en timestamptz,
  entregado_por uuid references public.personas(id),
  cerrado_en timestamptz,
  cerrado_por uuid references public.personas(id),
  cierre_motivo text,
  token_cliente uuid,
  constraint pedidos_web_numero_key unique (numero),
  constraint pedidos_web_token_cliente_key unique (token_cliente),
  constraint pedidos_web_numero_positivo check (numero > 0),
  constraint pedidos_web_estado_check check (estado in ('por_confirmar', 'confirmado', 'pagado', 'entregado', 'vencido', 'anulado')),
  constraint pedidos_web_montos_finitos check (abs(total) < 'Infinity' and abs(pagado) < 'Infinity'),
  -- Lo pagado nunca pasa el total. El total puede ser 0 solo un instante, mientras nacen las líneas: al confirmar la
  -- transacción se exige que sea la suma de sus prendas y mayor que cero (`fn_pedido_web_verificar`).
  constraint pedidos_web_pagado_en_rango check (total >= 0 and pagado >= 0 and pagado <= total),
  constraint pedidos_web_pagado_completo check ((estado in ('pagado', 'entregado')) = (total > 0 and pagado = total)),
  constraint pedidos_web_sin_pagos_sin_confirmar check (estado not in ('por_confirmar', 'vencido') or pagado = 0),
  constraint pedidos_web_confirmacion_coherente check (
    (confirmado_en is null) = (confirmado_por is null)
    and (estado not in ('confirmado', 'pagado', 'entregado') or confirmado_en is not null)
    and (estado not in ('por_confirmar', 'vencido') or confirmado_en is null)),
  constraint pedidos_web_pago_coherente check ((estado in ('pagado', 'entregado')) = (pagado_en is not null)),
  constraint pedidos_web_entrega_coherente check (
    (estado = 'entregado') = (entregado_en is not null) and (entregado_en is null) = (entregado_por is null)),
  constraint pedidos_web_cierre_coherente check (
    (estado in ('vencido', 'anulado')) = (cerrado_en is not null)
    and (cerrado_en is null) = (cierre_motivo is null)
    and (cerrado_en is not null or cerrado_por is null)
    and (estado <> 'vencido' or (cierre_motivo = 'sin_confirmar' and cerrado_por is null))
    and (estado <> 'anulado' or (cerrado_por is not null and (
          (confirmado_en is null and cierre_motivo in ('sin_stock', 'cliente_no_respondio', 'cliente_desistio'))
       or (confirmado_en is not null and cierre_motivo in ('cliente_no_pago', 'cliente_desistio', 'error_en_pedido')))))),
  constraint pedidos_web_codigo_recojo_formato check (codigo_recojo ~ '^[1-9][0-9]{3}$')
);

alter sequence retail.pedidos_web_numero_seq owned by retail.pedidos_web.numero;

comment on table retail.pedidos_web is
  'Pedido de la tienda online (ADR-0408): lo separa el cliente, lo confirma, cobra y entrega la sede. Se lee y escribe solo por funciones.';
comment on column retail.pedidos_web.numero is 'Correlativo de todas las sedes: dice también quién separó primero (propuesta k).';
comment on column retail.pedidos_web.codigo is 'W-0001: el número que el cliente manda por WhatsApp.';
comment on column retail.pedidos_web.total is 'Suma de sus prendas no quitadas. La mantiene un disparador; se verifica al confirmar la transacción.';
comment on column retail.pedidos_web.pagado is 'Suma de sus pagos aprobados. La mantiene un disparador; el CHECK pagado <= total vive aquí.';
comment on column retail.pedidos_web.codigo_recojo is 'Código de 4 cifras para recoger (propuesta m). El cliente lo ve cuando está listo para recoger.';

create table if not exists retail.pedido_web_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references retail.pedidos_web(id),
  posicion smallint not null,
  variante_id uuid not null references retail.variantes(id),
  precio_lista numeric(12,2) not null,
  descuento numeric(12,2) not null default 0,
  descuento_etiqueta_id uuid references retail.etiquetas(id),
  precio numeric(12,2) generated always as (precio_lista - descuento) stored,
  estado text not null default 'pendiente',
  ubicacion_id uuid references retail.ubicaciones(id),
  sububicacion_id uuid,
  apartado_id uuid references retail.apartados(id),
  reservada_en timestamptz,
  fecha_compromiso date,
  resuelta_en timestamptz,
  resuelta_por uuid references public.personas(id),
  creado_en timestamptz not null default now(),
  constraint pedido_web_lineas_posicion_unica unique (pedido_id, posicion),
  -- Una reserva sostiene UNA línea, y una línea tiene a lo más una reserva (la columna es una sola).
  constraint pedido_web_lineas_apartado_unico unique (apartado_id),
  constraint pedido_web_lineas_sububicacion_pertenece_fk foreign key (sububicacion_id, ubicacion_id)
    references retail.sububicaciones(id, ubicacion_id),
  constraint pedido_web_lineas_posicion_valida check (posicion between 1 and 20),
  constraint pedido_web_lineas_estado_check check (
    estado in ('pendiente', 'reservada', 'por_conseguir', 'quitada', 'liberada', 'entregada')),
  constraint pedido_web_lineas_montos_finitos check (abs(precio_lista) < 'Infinity' and abs(descuento) < 'Infinity'),
  constraint pedido_web_lineas_precio_valido check (precio_lista > 0 and descuento >= 0 and descuento < precio_lista),
  constraint pedido_web_lineas_descuento_con_campana check ((descuento > 0) = (descuento_etiqueta_id is not null)),
  constraint pedido_web_lineas_reserva_coherente check (
    (estado in ('reservada', 'liberada', 'entregada')) = (apartado_id is not null)
    and (apartado_id is null) = (ubicacion_id is null)
    and (apartado_id is null) = (reservada_en is null)
    and (apartado_id is not null or sububicacion_id is null)),
  constraint pedido_web_lineas_por_conseguir_con_fecha check (estado <> 'por_conseguir' or fecha_compromiso is not null),
  constraint pedido_web_lineas_resolucion_coherente check (
    (estado = 'pendiente') = (resuelta_en is null) and (resuelta_en is null) = (resuelta_por is null))
);

comment on table retail.pedido_web_lineas is
  'Una prenda de un pedido web, con su precio ya calculado. Al confirmar: reservada (con su apartado), por conseguir (con fecha) o quitada.';
comment on column retail.pedido_web_lineas.ubicacion_id is 'Dónde está su reserva. Distinta de la tienda del pedido = hay que traerla (actividad 8).';

create table if not exists retail.pedido_web_pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references retail.pedidos_web(id),
  origen text not null,
  medio text not null,
  monto numeric(12,2) not null,
  estado text not null,
  numero_operacion text,
  proveedor text,
  referencia_externa text,
  caja_movimiento_id uuid references retail.caja_movimientos(id),
  observacion text,
  registrado_por uuid references public.personas(id),
  registrado_en timestamptz not null default now(),
  actualizado_en timestamptz,
  anulado_en timestamptz,
  anulado_por uuid references public.personas(id),
  anulado_motivo text,
  anulado_caja_movimiento_id uuid references retail.caja_movimientos(id),
  token_cliente uuid,
  constraint pedido_web_pagos_token_cliente_key unique (token_cliente),
  -- El mismo aviso de la pasarela dos veces es el MISMO pago: (proveedor, referencia) no se repite.
  constraint pedido_web_pagos_pasarela_unica unique (proveedor, referencia_externa),
  constraint pedido_web_pagos_caja_movimiento_key unique (caja_movimiento_id),
  constraint pedido_web_pagos_anulado_caja_movimiento_key unique (anulado_caja_movimiento_id),
  constraint pedido_web_pagos_origen_check check (origen in ('tienda', 'pasarela')),
  constraint pedido_web_pagos_medio_check check (medio in ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta')),
  constraint pedido_web_pagos_estado_check check (estado in ('pendiente', 'aprobado', 'rechazado', 'por_revisar', 'anulado')),
  constraint pedido_web_pagos_montos_finitos check (abs(monto) < 'Infinity'),
  constraint pedido_web_pagos_monto_positivo check (monto > 0),
  constraint pedido_web_pagos_tienda_coherente check (origen <> 'tienda' or (
    medio in ('efectivo', 'yape', 'plin', 'transferencia') and proveedor is null and referencia_externa is null
    and registrado_por is not null and estado in ('aprobado', 'anulado'))),
  constraint pedido_web_pagos_pasarela_coherente check (origen <> 'pasarela' or (
    medio <> 'efectivo' and proveedor ~ '^[a-z][a-z0-9_]{1,29}$'
    and char_length(referencia_externa) between 1 and 100 and numero_operacion is null)),
  -- Propuesta a: un pago digital que anota la tienda lleva su n.º de operación (de 6 a 12 dígitos, sin espacios).
  constraint pedido_web_pagos_operacion_formato check (
    ((origen = 'tienda' and medio <> 'efectivo') = (numero_operacion is not null))
    and (numero_operacion is null or numero_operacion ~ '^[0-9]{6,12}$')),
  constraint pedido_web_pagos_efectivo_en_caja check ((medio = 'efectivo') = (caja_movimiento_id is not null)),
  constraint pedido_web_pagos_anulacion_coherente check (
    (estado = 'anulado') = (anulado_en is not null)
    and (anulado_en is null) = (anulado_motivo is null)
    and (origen <> 'tienda' or (anulado_en is null) = (anulado_por is null))
    and ((estado = 'anulado' and medio = 'efectivo') = (anulado_caja_movimiento_id is not null))),
  constraint pedido_web_pagos_motivo_anulacion check (
    anulado_motivo is null or anulado_motivo in ('error_al_anotar', 'devuelto_al_cliente', 'reembolso_pasarela')),
  constraint pedido_web_pagos_revision_con_observacion check (
    estado <> 'por_revisar' or char_length(btrim(coalesce(observacion, ''))) between 1 and 300)
);

comment on table retail.pedido_web_pagos is
  'Pagos de un pedido web. Tienda: los anota la sede (digital con n.º de operación único; efectivo a la caja abierta). '
  'Pasarela (futura): un aviso por (proveedor, referencia), idempotente. Solo «aprobado» suma a lo pagado.';

-- Propuesta a: un n.º de operación vivo no se repite en ningún pedido (anulado, se puede volver a anotar bien).
create unique index if not exists pedido_web_pagos_operacion_unica
  on retail.pedido_web_pagos (numero_operacion) where numero_operacion is not null and estado <> 'anulado';
create index if not exists pedido_web_pagos_pedido_idx on retail.pedido_web_pagos (pedido_id);
create index if not exists pedido_web_lineas_pedido_idx on retail.pedido_web_lineas (pedido_id);
create index if not exists pedido_web_lineas_variante_idx on retail.pedido_web_lineas (variante_id) where estado = 'pendiente';
create index if not exists pedidos_web_ubicacion_idx on retail.pedidos_web (ubicacion_id, creado_en);
create index if not exists pedidos_web_clienta_idx on retail.pedidos_web (clienta_id, creado_en);
-- El cierre de las 24 h mira solo lo que espera confirmación, no toda la historia.
create index if not exists pedidos_web_por_confirmar_idx on retail.pedidos_web (creado_en) where estado = 'por_confirmar';

-- Solo por funciones: RLS encendido sin políticas, y sin permisos de tabla para nadie de afuera.
alter table retail.pedidos_web enable row level security;
alter table retail.pedido_web_lineas enable row level security;
alter table retail.pedido_web_pagos enable row level security;
revoke all on retail.pedidos_web, retail.pedido_web_lineas, retail.pedido_web_pagos from public, anon, authenticated;
revoke all on sequence retail.pedidos_web_numero_seq from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_codigo_recojo() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Los candados de cada fila (inmediatos)
-- ----------------------------------------------------------------------------

-- El pedido: lo que ya pasó no se reescribe y solo hay transiciones de la vida del pedido.
create or replace function retail.fn_pedido_web_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if (new.id, new.numero, new.ubicacion_id, new.codigo_recojo, new.creado_en)
     is distinct from (old.id, old.numero, old.ubicacion_id, old.codigo_recojo, old.creado_en)
     or new.token_cliente is distinct from old.token_cliente then
    raise exception 'El número, la tienda, el código para recoger y la fecha de un pedido web no se cambian.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  -- El cliente solo cambia cuando su ficha se une a otra (unir_clientas): el pedido sigue a la ficha que queda.
  if new.clienta_id is distinct from old.clienta_id
     and new.clienta_id is distinct from (select c.fusionada_en_id from retail.clientas c where c.id = old.clienta_id) then
    raise exception 'El cliente de un pedido web no se cambia: solo sigue a su ficha cuando esta se une a otra.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'por_confirmar' and new.estado in ('confirmado', 'anulado', 'vencido'))
    or (old.estado = 'confirmado' and new.estado in ('pagado', 'anulado'))
    or (old.estado = 'pagado' and new.estado = 'entregado')) then
    raise exception 'Un pedido web no pasa de «%» a «%».', old.estado, new.estado
      using errcode = '23514', hint = 'pedido_web_transicion';
  end if;
  if (old.confirmado_en is not null and (new.confirmado_en, new.confirmado_por) is distinct from (old.confirmado_en, old.confirmado_por))
     or (old.pagado_en is not null and new.pagado_en is distinct from old.pagado_en)
     or (old.entregado_en is not null and (new.entregado_en, new.entregado_por) is distinct from (old.entregado_en, old.entregado_por))
     or (old.cerrado_en is not null
         and (new.cerrado_en, new.cerrado_por, new.cierre_motivo) is distinct from (old.cerrado_en, old.cerrado_por, old.cierre_motivo)) then
    raise exception 'Lo que ya pasó en un pedido web (quién lo confirmó, cuándo se pagó o se entregó, por qué se cerró) no se reescribe.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  return new;
end;
$$;

create or replace trigger pedidos_web_reglas
  before update on retail.pedidos_web
  for each row execute function retail.fn_pedido_web_reglas();

-- La línea: nace pendiente en un pedido por confirmar; su prenda y su precio no cambian; su reserva tampoco; y solo pasa de
-- un estado a otro cuando el pedido está donde corresponde.
create or replace function retail.fn_pedido_web_linea_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pedido text;
begin
  select w.estado into v_pedido from retail.pedidos_web w where w.id = new.pedido_id;
  if tg_op = 'INSERT' then
    if v_pedido is distinct from 'por_confirmar' or new.estado <> 'pendiente' or new.fecha_compromiso is not null then
      raise exception 'Una prenda se agrega pendiente y solo a un pedido web que todavía no se confirma.'
        using errcode = '23514', hint = 'pedido_web_transicion';
    end if;
    return new;
  end if;
  if (new.pedido_id, new.posicion, new.variante_id, new.precio_lista, new.descuento, new.descuento_etiqueta_id, new.creado_en)
     is distinct from (old.pedido_id, old.posicion, old.variante_id, old.precio_lista, old.descuento, old.descuento_etiqueta_id, old.creado_en) then
    raise exception 'La prenda de un pedido web y su precio no se cambian.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  if old.apartado_id is not null
     and (new.apartado_id, new.ubicacion_id, new.sububicacion_id, new.reservada_en)
         is distinct from (old.apartado_id, old.ubicacion_id, old.sububicacion_id, old.reservada_en) then
    raise exception 'La reserva de una prenda de un pedido web no se cambia: se libera anulando el pedido.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  if old.resuelta_en is not null and (new.resuelta_en, new.resuelta_por) is distinct from (old.resuelta_en, old.resuelta_por) then
    raise exception 'Quién resolvió una prenda de un pedido web, y cuándo, no se reescribe.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'pendiente' and new.estado in ('reservada', 'por_conseguir', 'quitada') and v_pedido = 'por_confirmar')
    or (old.estado = 'por_conseguir' and new.estado = 'reservada' and v_pedido in ('confirmado', 'pagado'))
    or (old.estado = 'reservada' and new.estado = 'liberada' and v_pedido = 'anulado')
    or (old.estado = 'reservada' and new.estado = 'entregada' and v_pedido in ('pagado', 'entregado'))) then
    raise exception 'En un pedido web «%», una prenda no pasa de «%» a «%».', v_pedido, old.estado, new.estado
      using errcode = '23514', hint = 'pedido_web_transicion';
  end if;
  -- La fecha prometida solo se fija al pasar a «por conseguir» o mientras sigue por conseguir.
  if new.fecha_compromiso is distinct from old.fecha_compromiso and new.estado <> 'por_conseguir' then
    raise exception 'La fecha prometida solo existe mientras la prenda está por conseguir.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  return new;
end;
$$;

create or replace trigger pedido_web_lineas_reglas
  before insert or update on retail.pedido_web_lineas
  for each row execute function retail.fn_pedido_web_linea_reglas();

-- El total del pedido: se le suma la diferencia de cada línea que nace o cambia de estado (una quitada no cuenta).
create or replace function retail.fn_pedido_web_linea_total()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_delta numeric(12,2) := 0;
begin
  if new.estado <> 'quitada' then
    v_delta := new.precio;
  end if;
  if tg_op = 'UPDATE' and old.estado <> 'quitada' then
    v_delta := v_delta - old.precio;
  end if;
  if v_delta <> 0 then
    update retail.pedidos_web w set total = w.total + v_delta where w.id = new.pedido_id;
  end if;
  return null;
end;
$$;

create or replace trigger pedido_web_lineas_total
  after insert or update of estado on retail.pedido_web_lineas
  for each row execute function retail.fn_pedido_web_linea_total();

-- El pago: nace como corresponde a su origen, no se edita (se anula), y solo cambia de estado hacia adelante. Así un aviso
-- viejo de la pasarela que llega tarde no hace retroceder un pago.
create or replace function retail.fn_pedido_web_pago_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    if (new.origen = 'tienda' and new.estado <> 'aprobado')
       or (new.origen = 'pasarela' and new.estado not in ('pendiente', 'aprobado', 'rechazado', 'por_revisar')) then
      raise exception 'Un pago de la tienda nace aprobado; uno de la pasarela, como lo avisó (pendiente, aprobado o rechazado).'
        using errcode = '23514', hint = 'pedido_web_transicion';
    end if;
    return new;
  end if;
  if (new.pedido_id, new.origen, new.medio, new.monto, new.numero_operacion, new.proveedor, new.referencia_externa,
      new.caja_movimiento_id, new.registrado_por, new.registrado_en, new.token_cliente)
     is distinct from (old.pedido_id, old.origen, old.medio, old.monto, old.numero_operacion, old.proveedor, old.referencia_externa,
      old.caja_movimiento_id, old.registrado_por, old.registrado_en, old.token_cliente) then
    raise exception 'Un pago no se edita: si se anotó mal, se anula y se vuelve a anotar.'
      using errcode = '23514', hint = 'pedido_web_pago_inmutable';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'pendiente' and new.estado in ('aprobado', 'rechazado', 'por_revisar'))
    or (old.estado = 'aprobado' and new.estado = 'anulado')
    or (old.estado = 'por_revisar' and new.estado in ('aprobado', 'anulado'))) then
    raise exception 'Un pago no pasa de «%» a «%».', old.estado, new.estado using errcode = '23514', hint = 'pedido_web_transicion';
  end if;
  if (old.anulado_en is not null or new.estado = old.estado)
     and (new.anulado_en, new.anulado_por, new.anulado_motivo, new.anulado_caja_movimiento_id)
         is distinct from (old.anulado_en, old.anulado_por, old.anulado_motivo, old.anulado_caja_movimiento_id) then
    raise exception 'La anulación de un pago no se reescribe.' using errcode = '23514', hint = 'pedido_web_pago_inmutable';
  end if;
  return new;
end;
$$;

create or replace trigger pedido_web_pagos_reglas
  before insert or update on retail.pedido_web_pagos
  for each row execute function retail.fn_pedido_web_pago_reglas();

-- Lo pagado: la diferencia de lo aprobado se suma en la fila del pedido, BAJO SU CANDADO (dos pagos a la vez se ordenan aquí,
-- y el CHECK pagado <= total los ve juntos). Si llega al total, el pedido pasa a «pagado» en la misma operación.
create or replace function retail.fn_pedido_web_pago_suma()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_delta numeric(12,2) := 0;
  p retail.pedidos_web%rowtype;
begin
  if new.estado = 'aprobado' then
    v_delta := new.monto;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'aprobado' then
    v_delta := v_delta - old.monto;
  end if;
  if v_delta = 0 then
    return null;
  end if;
  select * into p from retail.pedidos_web w where w.id = new.pedido_id for update;
  if v_delta > 0 and p.estado <> 'confirmado' then
    raise exception 'El pedido web % está «%»: solo se cobra un pedido confirmado.', p.codigo, p.estado
      using errcode = '23514', hint = 'pedido_web_no_cobrable';
  end if;
  update retail.pedidos_web w
     set pagado = w.pagado + v_delta,
         estado = case when w.estado = 'confirmado' and w.pagado + v_delta = w.total then 'pagado' else w.estado end,
         pagado_en = case when w.estado = 'confirmado' and w.pagado + v_delta = w.total then now() else w.pagado_en end
   where w.id = new.pedido_id;
  return null;
end;
$$;

create or replace trigger pedido_web_pagos_suma
  after insert or update of estado on retail.pedido_web_pagos
  for each row execute function retail.fn_pedido_web_pago_suma();

-- Nada se borra: un pedido, una prenda o un pago se anula y queda la constancia.
create or replace function retail.fn_pedidos_web_sin_borrar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Los pedidos web, sus prendas y sus pagos no se borran: se anulan, y queda la constancia.'
    using errcode = '23514', hint = 'pedido_web_no_se_borra';
end;
$$;

create or replace trigger pedidos_web_sin_borrar before delete on retail.pedidos_web
  for each row execute function retail.fn_pedidos_web_sin_borrar();
create or replace trigger pedidos_web_sin_vaciar before truncate on retail.pedidos_web
  for each statement execute function retail.fn_pedidos_web_sin_borrar();
create or replace trigger pedido_web_lineas_sin_borrar before delete on retail.pedido_web_lineas
  for each row execute function retail.fn_pedidos_web_sin_borrar();
create or replace trigger pedido_web_lineas_sin_vaciar before truncate on retail.pedido_web_lineas
  for each statement execute function retail.fn_pedidos_web_sin_borrar();
create or replace trigger pedido_web_pagos_sin_borrar before delete on retail.pedido_web_pagos
  for each row execute function retail.fn_pedidos_web_sin_borrar();
create or replace trigger pedido_web_pagos_sin_vaciar before truncate on retail.pedido_web_pagos
  for each statement execute function retail.fn_pedidos_web_sin_borrar();

-- ----------------------------------------------------------------------------
-- 4. El pedido entero cuadra al confirmar la transacción (diferido): prendas según el estado, cada reserva con su apartado,
--    total y pagado iguales a sus sumas, y el efectivo con su movimiento de caja en la tienda del pedido.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_pedido_web_verificar(p_pedido_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  v_lineas integer;
  v_vivas integer;
  v_total numeric;
  v_pagado numeric;
  v_mal integer;
begin
  select * into p from retail.pedidos_web w where w.id = p_pedido_id;
  if not found then
    return;
  end if;

  select count(*), count(*) filter (where l.estado <> 'quitada'), coalesce(sum(l.precio) filter (where l.estado <> 'quitada'), 0)
    into v_lineas, v_vivas, v_total
    from retail.pedido_web_lineas l where l.pedido_id = p.id;
  if v_vivas = 0 then
    raise exception 'El pedido web % quedaría sin ninguna prenda.', p.codigo using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;
  if p.total <> v_total then
    raise exception 'El total del pedido web % (S/ %) no es la suma de sus prendas (S/ %).', p.codigo, p.total, v_total
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;

  select coalesce(sum(g.monto) filter (where g.estado = 'aprobado'), 0) into v_pagado
    from retail.pedido_web_pagos g where g.pedido_id = p.id;
  if p.pagado <> v_pagado then
    raise exception 'Lo pagado del pedido web % (S/ %) no es la suma de sus pagos aprobados (S/ %).', p.codigo, p.pagado, v_pagado
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;

  -- Las prendas, según el estado del pedido.
  select count(*) into v_mal
    from retail.pedido_web_lineas l
   where l.pedido_id = p.id
     and case
           when p.estado in ('por_confirmar', 'vencido') or (p.estado = 'anulado' and p.confirmado_en is null)
             then l.estado <> 'pendiente'
           when p.estado in ('confirmado', 'pagado') then l.estado in ('pendiente', 'liberada', 'entregada')
           when p.estado = 'anulado' then l.estado in ('pendiente', 'reservada', 'entregada')
           when p.estado = 'entregado' then l.estado not in ('quitada', 'entregada')
           else true
         end;
  if v_mal > 0 then
    raise exception 'El pedido web % está «%» y tiene % prenda(s) en un estado que no corresponde.', p.codigo, p.estado, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;

  -- Una reserva por línea: la reservada tiene SU apartado abierto, de esa prenda, una unidad, en esa sede y ese lugar; la
  -- liberada, el suyo cerrado; la entregada, cerrado como «entregada».
  select count(*) into v_mal
    from retail.pedido_web_lineas l
    left join retail.apartados a on a.id = l.apartado_id
   where l.pedido_id = p.id
     and l.apartado_id is not null
     and (a.id is null
          or a.variante_id <> l.variante_id or a.cantidad <> 1 or a.ubicacion_id <> l.ubicacion_id
          or a.sububicacion_id is distinct from l.sububicacion_id
          or (l.estado = 'reservada' and a.estado <> 'abierto')
          or (l.estado = 'liberada' and a.estado <> 'liberado')
          or (l.estado = 'entregada' and (a.estado <> 'liberado' or a.cierre_motivo <> 'entregada')));
  if v_mal > 0 then
    raise exception 'En el pedido web %, % prenda(s) no tienen la reserva que dicen tener.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;

  -- El efectivo: su entrada (y la salida de su anulación) es de la caja de la tienda del pedido y por el mismo monto.
  select count(*) into v_mal
    from retail.pedido_web_pagos g
    join retail.caja_movimientos cm on cm.id = g.caja_movimiento_id
    join retail.cajas c on c.id = cm.caja_id
   where g.pedido_id = p.id
     and (cm.tipo <> 'ingreso' or cm.monto <> g.monto or c.ubicacion_id <> p.ubicacion_id);
  select v_mal + count(*) into v_mal
    from retail.pedido_web_pagos g
    join retail.caja_movimientos cm on cm.id = g.anulado_caja_movimiento_id
    join retail.cajas c on c.id = cm.caja_id
   where g.pedido_id = p.id
     and (cm.tipo <> 'egreso' or cm.monto <> g.monto or c.ubicacion_id <> p.ubicacion_id);
  if v_mal > 0 then
    raise exception 'En el pedido web %, el efectivo de % pago(s) no cuadra con la caja de su tienda.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;
end;
$$;

create or replace function retail.fn_pedido_web_coherente()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_table_name = 'pedidos_web' then
    perform retail.fn_pedido_web_verificar(new.id);
  else
    perform retail.fn_pedido_web_verificar(new.pedido_id);
  end if;
  return null;
end;
$$;

-- `create or replace` no existe para un disparador de restricción: se crea solo si falta (nunca `drop trigger`).
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.pedidos_web'::regclass and tgname = 'pedidos_web_coherente') then
    create constraint trigger pedidos_web_coherente
      after insert or update on retail.pedidos_web
      deferrable initially deferred
      for each row execute function retail.fn_pedido_web_coherente();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.pedido_web_lineas'::regclass and tgname = 'pedido_web_lineas_coherente') then
    create constraint trigger pedido_web_lineas_coherente
      after insert or update on retail.pedido_web_lineas
      deferrable initially deferred
      for each row execute function retail.fn_pedido_web_coherente();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.pedido_web_pagos'::regclass and tgname = 'pedido_web_pagos_coherente') then
    create constraint trigger pedido_web_pagos_coherente
      after insert or update on retail.pedido_web_pagos
      deferrable initially deferred
      for each row execute function retail.fn_pedido_web_coherente();
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Las dos puertas de afuera
-- ----------------------------------------------------------------------------

-- `apartados`: la reserva de un pedido web se libera (y se entrega) desde Pedidos web, no desde Apartados: si alguien
-- liberara la prenda por ahí, el pedido diría «reservada» y el stock estaría libre. Tampoco se cambia de prenda ni de lugar.
create or replace function retail.fn_apartado_de_pedido_web()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_estado text;
  v_codigo text;
begin
  select l.estado, w.codigo into v_estado, v_codigo
    from retail.pedido_web_lineas l join retail.pedidos_web w on w.id = l.pedido_id
   where l.apartado_id = old.id;
  if not found then
    return new;
  end if;
  if (new.variante_id, new.ubicacion_id, new.cantidad) is distinct from (old.variante_id, old.ubicacion_id, old.cantidad)
     or new.sububicacion_id is distinct from old.sububicacion_id
     or (old.estado = 'abierto' and new.estado <> 'abierto' and v_estado = 'reservada')
     or (old.estado <> 'abierto' and new.estado = 'abierto') then
    raise exception 'Esta prenda está reservada para el pedido web %: se entrega o se libera desde Pedidos web.', v_codigo
      using errcode = '23514', hint = 'apartado_de_pedido_web';
  end if;
  return new;
end;
$$;

create or replace trigger apartados_de_pedidos_web
  before update on retail.apartados
  for each row
  when (old.estado is distinct from new.estado or old.variante_id is distinct from new.variante_id
        or old.ubicacion_id is distinct from new.ubicacion_id or old.sububicacion_id is distinct from new.sububicacion_id
        or old.cantidad is distinct from new.cantidad)
  execute function retail.fn_apartado_de_pedido_web();

-- `clientas`: si la ficha se une a otra (unir_clientas la deja anonimizada con `fusionada_en_id`), sus pedidos web pasan a la
-- ficha que queda, así el cliente los sigue viendo en «Mis pedidos». Sin tocar `unir_clientas`.
create or replace function retail.fn_pedidos_web_siguen_a_la_ficha()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update retail.pedidos_web w set clienta_id = new.fusionada_en_id where w.clienta_id = new.id;
  return null;
end;
$$;

create or replace trigger clientas_pedidos_web_siguen_a_la_ficha
  after update of fusionada_en_id on retail.clientas
  for each row
  when (new.fusionada_en_id is not null and old.fusionada_en_id is distinct from new.fusionada_en_id)
  execute function retail.fn_pedidos_web_siguen_a_la_ficha();

-- ----------------------------------------------------------------------------
-- 6. Piezas internas que comparten las funciones
-- ----------------------------------------------------------------------------

-- Los plazos llegan de Configuración ▸ Tienda web (actividad 6); aquí, con su valor de hoy y los mismos topes de esa pantalla.
create or replace function retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar integer, p_horas_aviso_sin_pagar integer,
                                                               p_dias_aviso_sin_recoger integer)
returns void
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
begin
  if p_horas_para_confirmar is null or p_horas_para_confirmar not between 1 and 168 then
    raise exception 'Las horas para confirmar van de 1 a 168.' using errcode = '22023', hint = 'pedido_web_plazo';
  end if;
  if p_horas_aviso_sin_pagar is null or p_horas_aviso_sin_pagar not between 1 and 720 then
    raise exception 'El aviso si no paga va de 1 a 720 horas.' using errcode = '22023', hint = 'pedido_web_plazo';
  end if;
  if p_dias_aviso_sin_recoger is null or p_dias_aviso_sin_recoger not between 1 and 60 then
    raise exception 'El aviso si no recoge va de 1 a 60 días.' using errcode = '22023', hint = 'pedido_web_plazo';
  end if;
end;
$$;

-- El permiso de las funciones del ERP: el módulo (de la CUENTA) y la tienda que atiende.
create or replace function retail.fn_pedido_web_exigir(p_ubicacion_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not coalesce(retail.fn_ve_modulo('pedidos_web'), false) then
    raise exception 'Tu rol no tiene «Pedidos web».' using errcode = '42501', hint = 'pedido_web_sin_modulo';
  end if;
  if not coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id), false) then
    raise exception 'No atiendes los pedidos web de esa tienda.' using errcode = '42501', hint = 'pedido_web_otra_tienda';
  end if;
end;
$$;

create or replace function retail.fn_pedido_web_actor()
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid := retail.fn_actor_persona_id(true);
begin
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador.' using errcode = '42501', hint = 'pedido_web_sin_persona';
  end if;
  return v_persona;
end;
$$;

-- Por qué un pedido no admite una acción, en palabras de tienda.
create or replace function retail.fn_pedido_web_no_admite(p retail.pedidos_web, p_accion text)
returns text
language sql
stable
set search_path = retail, public, extensions
as $$
  select format('El pedido web %s %s: no se puede %s.', p.codigo,
    case p.estado
      when 'por_confirmar' then 'todavía no está confirmado'
      when 'confirmado' then 'ya está confirmado'
      when 'pagado' then 'ya está pagado completo'
      when 'entregado' then 'ya se entregó'
      when 'vencido' then 'se cerró solo, porque nadie lo confirmó a tiempo'
      when 'anulado' then 'está anulado'
      else 'está ' || p.estado
    end, p_accion);
$$;

-- El resumen que devuelven las funciones que escriben.
create or replace function retail.fn_pedido_web_resumen(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'pedido_id', w.id, 'codigo', w.codigo, 'numero', w.numero, 'estado', w.estado, 'ubicacion_id', w.ubicacion_id,
    'total', w.total, 'pagado', w.pagado, 'falta', w.total - w.pagado, 'creado_en', w.creado_en,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'linea_id', l.id, 'posicion', l.posicion, 'variante_id', l.variante_id, 'precio', l.precio, 'estado', l.estado,
               'ubicacion_id', l.ubicacion_id, 'sububicacion_id', l.sububicacion_id,
               'lugar', case s.tipo when 'almacen_tienda' then 'almacen' when 'piso_venta' then 'piso' end,
               'apartado_id', l.apartado_id, 'fecha_compromiso', l.fecha_compromiso)
             order by l.posicion)
        from retail.pedido_web_lineas l
        left join retail.sububicaciones s on s.id = l.sububicacion_id
       where l.pedido_id = w.id), '[]'::jsonb))
  from retail.pedidos_web w
  where w.id = p_pedido_id;
$$;

-- Reservar UNA unidad para una línea: el movimiento «apartado» (que rechaza si no hay disponible) y su fila de `apartados`,
-- en la misma transacción. Dónde: el lugar elegido, o el almacén primero y después el piso (propuesta j); en una tienda sin
-- piso ni almacén, la fila sin lugar. Nunca Cuarentena. Quien llama ya bloqueó las filas de stock en orden (ADR-0190).
create or replace function retail.fn_pedido_web_reservar(p_linea_id uuid, p_ubicacion_id uuid, p_sububicacion_id uuid, p_persona uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  l retail.pedido_web_lineas%rowtype;
  p retail.pedidos_web%rowtype;
  v_sub uuid;
  v_hay boolean := false;
  v_mov uuid;
  v_ap uuid;
  v_sede text;
  v_sede_pedido text;
  v_prenda text;
  v_cliente text;
  v_celular text;
  r record;
begin
  select * into l from retail.pedido_web_lineas x where x.id = p_linea_id for update;
  select * into p from retail.pedidos_web w where w.id = l.pedido_id;
  select u.nombre into v_sede from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda' and u.activo;
  if v_sede is null then
    raise exception 'Una prenda de un pedido web se reserva en una tienda abierta.' using errcode = '22023', hint = 'pedido_web_tienda';
  end if;
  select coalesce(pr.referencia, 'Prenda') || coalesce(' ' || t.valor, '') || coalesce(' ' || c.nombre, '') into v_prenda
    from retail.variantes v
    join retail.productos pr on pr.id = v.producto_id
    left join retail.tallas t on t.id = v.talla_id
    left join retail.colores c on c.codigo = v.color_codigo
   where v.id = l.variante_id;
  if not exists (select 1 from retail.variantes v where v.id = l.variante_id and v.activo) then
    raise exception '«%» está descontinuada: quítala del pedido o déjala por conseguir.', v_prenda
      using errcode = '22023', hint = 'pedido_web_descontinuada', detail = l.id::text;
  end if;
  if p_sububicacion_id is not null and not exists (
       select 1 from retail.sububicaciones s
        where s.id = p_sububicacion_id and s.ubicacion_id = p_ubicacion_id and s.tipo in ('almacen_tienda', 'piso_venta')) then
    raise exception 'Ese lugar no es el almacén ni el piso de %.', v_sede using errcode = '22023', hint = 'pedido_web_lugar';
  end if;

  for r in
    select st.sububicacion_id
      from retail.stock st
      left join retail.sububicaciones s on s.id = st.sububicacion_id
     where st.variante_id = l.variante_id
       and st.ubicacion_id = p_ubicacion_id
       and st.cantidad - st.cantidad_apartada >= 1
       and (s.id is null or s.tipo in ('almacen_tienda', 'piso_venta'))
       and (p_sububicacion_id is null or st.sububicacion_id = p_sububicacion_id)
     order by case s.tipo when 'almacen_tienda' then 0 when 'piso_venta' then 1 else 2 end
     limit 1
  loop
    v_sub := r.sububicacion_id;
    v_hay := true;
  end loop;
  if not v_hay then
    raise exception 'No queda «%» libre en %: se vendió, se apartó o se reservó para otro pedido. Elige otra tienda, déjala por conseguir o quítala.',
      v_prenda, v_sede || case when p_sububicacion_id is not null then ' (en ese lugar)' else '' end
      using errcode = 'P0001', hint = 'pedido_web_sin_stock', detail = l.id::text;
  end if;

  -- Quién la espera: el NÚMERO del pedido, nunca el nombre ni el celular del cliente. Sus datos viven solo en su ficha y se
  -- leen por el pedido; copiados al apartado, sobrevivirían a la ficha cuando se anonimiza (Ley 29733, ADR-0288). En otra
  -- sede, además, para qué tienda es (como el pedido a otra sede, ADR-0328 act. 17).
  select u.nombre into v_sede_pedido from retail.ubicaciones u where u.id = p.ubicacion_id;
  if p_ubicacion_id = p.ubicacion_id then
    v_cliente := 'Pedido web ' || p.codigo;
    v_celular := 'Pedidos web';
  else
    v_cliente := left('Pedido web ' || p.codigo || ' para ' || coalesce(v_sede_pedido, 'otra tienda'), 200);
    v_celular := coalesce(v_sede_pedido, 'Otra tienda');
  end if;

  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (l.variante_id, p_ubicacion_id, v_sub, 'apartado', 1, 'apartado', p_persona,
            left('Reservada para el pedido web ' || p.codigo, 500))
    returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);

  insert into retail.apartados (variante_id, ubicacion_id, sububicacion_id, cantidad, clienta_nombre, clienta_contacto, nota,
                                vence_el, creado_por, movimiento_id)
    values (l.variante_id, p_ubicacion_id, v_sub, 1, v_cliente, v_celular,
            case when p_ubicacion_id = p.ubicacion_id
                 then 'Pedido web ' || p.codigo || ': se entrega o se libera desde Pedidos web.'
                 else 'Pedido web ' || p.codigo || ': viaja a ' || coalesce(v_sede_pedido, 'la tienda del pedido') || '. Se libera desde Pedidos web.'
            end,
            null, p_persona, v_mov)
    returning id into v_ap;

  update retail.pedido_web_lineas x
     set estado = 'reservada', apartado_id = v_ap, ubicacion_id = p_ubicacion_id, sububicacion_id = v_sub, reservada_en = now(),
         resuelta_en = coalesce(x.resuelta_en, now()), resuelta_por = coalesce(x.resuelta_por, p_persona)
   where x.id = l.id;
  return v_ap;
end;
$$;

-- Soltar la reserva de una línea (anular): la «liberacion_apartado» y el apartado cerrado. La línea ya pasó a «liberada».
create or replace function retail.fn_pedido_web_soltar(p_linea_id uuid, p_persona uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  a retail.apartados%rowtype;
  v_mov uuid;
begin
  select ap.* into a
    from retail.apartados ap join retail.pedido_web_lineas l on l.apartado_id = ap.id
   where l.id = p_linea_id
     for update of ap;
  if a.id is null or a.estado <> 'abierto' then
    raise exception 'La reserva de esa prenda ya no estaba abierta.' using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'liberacion_apartado', a.cantidad, 'liberacion_apartado', p_persona,
            left(p_nota, 500))
    returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
  update retail.apartados ap
     set estado = 'liberado', cerrado_por = p_persona, cerrado_en = now(), cierre_motivo = 'otro', movimiento_cierre_id = v_mov
   where ap.id = a.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Las funciones del pedido
-- ----------------------------------------------------------------------------

-- «Separar» (la tienda, actividad 7): crea el pedido por confirmar con sus prendas y precios ya calculados. NO toca el stock.
-- `p_lineas`: [{variante_id, precio_lista, descuento?, descuento_etiqueta_id?}], una unidad por elemento (dos iguales = dos).
-- `p_token`: la marca del intento; un segundo «Separar» con la misma marca devuelve el MISMO pedido (ADR-0190).
create or replace function retail.crear_pedido_web(p_clienta_id uuid, p_ubicacion_id uuid, p_lineas jsonb, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_max_lineas constant integer := 20;  -- tope de cordura de una bolsa (no es regla de negocio: frena un pedido de juguete)
  v_existente retail.pedidos_web%rowtype;
  v_id uuid;
  v_linea jsonb;
  v_pos integer := 0;
  v_variante uuid;
  v_precio numeric;
  v_descuento numeric;
  v_etiqueta uuid;
begin
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedidos_web:' || p_token::text, 0));
    select * into v_existente from retail.pedidos_web w where w.token_cliente = p_token;
    if found then
      if v_existente.clienta_id <> p_clienta_id then
        raise exception 'Esa marca de «Separar» es de otro cliente.' using errcode = '22023', hint = 'pedido_web_token';
      end if;
      return retail.fn_pedido_web_resumen(v_existente.id);
    end if;
  end if;

  if not exists (select 1 from retail.clientas c
                  where c.id = p_clienta_id and c.archivada_en is null and not c.anonimizada) then
    raise exception 'Esa ficha de cliente no existe o está archivada.' using errcode = '22023', hint = 'pedido_web_clienta';
  end if;
  if not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda' and u.activo) then
    raise exception 'Un pedido web se recoge en una tienda abierta.' using errcode = '22023', hint = 'pedido_web_tienda';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La bolsa está vacía.' using errcode = '22023', hint = 'pedido_web_bolsa_vacia';
  end if;
  if jsonb_array_length(p_lineas) > c_max_lineas then
    raise exception 'Un pedido web lleva hasta % prendas.', c_max_lineas using errcode = '22023', hint = 'pedido_web_muchas_prendas';
  end if;

  insert into retail.pedidos_web (clienta_id, ubicacion_id, token_cliente)
    values (p_clienta_id, p_ubicacion_id, p_token)
    returning id into v_id;

  for v_linea in select e.valor from jsonb_array_elements(p_lineas) with ordinality as e(valor, n) order by e.n loop
    v_pos := v_pos + 1;
    begin
      v_variante := (v_linea ->> 'variante_id')::uuid;
      v_precio := (v_linea ->> 'precio_lista')::numeric;
      v_descuento := coalesce((v_linea ->> 'descuento')::numeric, 0);
      v_etiqueta := nullif(v_linea ->> 'descuento_etiqueta_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'La prenda % de la bolsa viene mal escrita.', v_pos using errcode = '22023', hint = 'pedido_web_linea_invalida';
    end;
    if v_variante is null or not exists (select 1 from retail.variantes v where v.id = v_variante and v.activo) then
      raise exception 'La prenda % de la bolsa no existe o está descontinuada.', v_pos using errcode = '22023', hint = 'pedido_web_linea_invalida';
    end if;
    if not retail.fn_variante_permitida_en_sede(v_variante, p_ubicacion_id) then
      raise exception 'La prenda % de la bolsa no se vende en esa tienda.', v_pos using errcode = '22023', hint = 'pedido_web_linea_invalida';
    end if;
    if v_precio is null or not (abs(v_precio) < 'Infinity') or v_precio <= 0 or round(v_precio, 2) <> v_precio
       or not (abs(v_descuento) < 'Infinity') or v_descuento < 0 or v_descuento >= v_precio or round(v_descuento, 2) <> v_descuento then
      raise exception 'El precio de la prenda % de la bolsa no es válido.', v_pos using errcode = '22023', hint = 'pedido_web_linea_invalida';
    end if;
    if (v_descuento > 0) <> (v_etiqueta is not null)
       or (v_etiqueta is not null and not exists (select 1 from retail.etiquetas e where e.id = v_etiqueta)) then
      raise exception 'El descuento de la prenda % de la bolsa no trae su campaña.', v_pos using errcode = '22023', hint = 'pedido_web_linea_invalida';
    end if;
    insert into retail.pedido_web_lineas (pedido_id, posicion, variante_id, precio_lista, descuento, descuento_etiqueta_id)
      values (v_id, v_pos, v_variante, v_precio, v_descuento, v_etiqueta);
  end loop;

  return retail.fn_pedido_web_resumen(v_id);
end;
$$;

-- Confirmar (el ERP, actividad 8). `p_lineas`: una decisión por cada prenda pendiente, todas:
--   {linea_id, decision: 'reservar', ubicacion_id?, sububicacion_id?}   → la reserva; sin tienda, la del pedido; sin lugar,
--                                                                         el almacén y después el piso
--   {linea_id, decision: 'por_conseguir', fecha: 'AAAA-MM-DD'}          → sin reserva, con la fecha que se le promete
--   {linea_id, decision: 'quitar'}                                      → sin stock: sale del pedido (y del total)
-- Todo o nada: si una prenda ya no está libre, no se confirma ninguna (hint `pedido_web_sin_stock`, detail = la línea).
create or replace function retail.confirmar_pedido_web(p_pedido_id uuid, p_lineas jsonb, p_horas_para_confirmar integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_max_dias constant integer := 60;  -- tope de cordura de una fecha prometida, el mismo de un apartado
  p retail.pedidos_web%rowtype;
  v_persona uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_decisiones jsonb := '{}'::jsonb;
  d jsonb;
  l record;
  v_linea uuid;
  v_decision text;
  v_ubic uuid;
  v_sub uuid;
  v_fecha date;
  r record;
begin
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado <> 'por_confirmar' then
    raise exception '%', retail.fn_pedido_web_no_admite(p, 'confirmar') using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  if now() >= p.creado_en + make_interval(hours => p_horas_para_confirmar) then
    raise exception 'Pasaron % horas desde que se separó el pedido web %: se cierra solo y no se confirma.', p_horas_para_confirmar, p.codigo
      using errcode = 'P0001', hint = 'pedido_web_vencido';
  end if;
  v_persona := retail.fn_pedido_web_actor();

  -- Las decisiones: una por cada prenda del pedido, sin repetir ni sobrar, leídas y validadas ANTES de bloquear o mover nada.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Falta decidir qué pasa con cada prenda.' using errcode = '22023', hint = 'pedido_web_decisiones';
  end if;
  for d in select e.value from jsonb_array_elements(p_lineas) e loop
    begin
      v_linea := (d ->> 'linea_id')::uuid;
      v_ubic := coalesce(nullif(d ->> 'ubicacion_id', '')::uuid, p.ubicacion_id);
      v_sub := nullif(d ->> 'sububicacion_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Una de las decisiones trae la prenda, la tienda o el lugar mal escritos.' using errcode = '22023', hint = 'pedido_web_decisiones';
    end;
    if v_linea is null or not exists (select 1 from retail.pedido_web_lineas x where x.id = v_linea and x.pedido_id = p.id) then
      raise exception 'Una de las decisiones no es de una prenda de este pedido.' using errcode = '22023', hint = 'pedido_web_decisiones';
    end if;
    if v_decisiones ? v_linea::text then
      raise exception 'Una prenda tiene dos decisiones.' using errcode = '22023', hint = 'pedido_web_decisiones';
    end if;
    v_decision := coalesce(d ->> 'decision', '');
    if v_decision = 'reservar' then
      d := jsonb_build_object('decision', v_decision, 'ubicacion_id', v_ubic, 'sububicacion_id', v_sub);
    elsif v_decision = 'por_conseguir' then
      begin
        v_fecha := (d ->> 'fecha')::date;
      exception when invalid_text_representation or datetime_field_overflow then
        v_fecha := null;
      end;
      if v_fecha is null or v_fecha < v_hoy or v_fecha > v_hoy + c_max_dias then
        raise exception 'Una prenda por conseguir lleva la fecha que se le promete, de hoy a % días.', c_max_dias
          using errcode = '22023', hint = 'pedido_web_fecha', detail = v_linea::text;
      end if;
      d := jsonb_build_object('decision', v_decision, 'fecha', v_fecha);
    elsif v_decision = 'quitar' then
      d := jsonb_build_object('decision', v_decision);
    else
      raise exception 'Cada prenda se reserva, se deja por conseguir o se quita.' using errcode = '22023', hint = 'pedido_web_decisiones';
    end if;
    v_decisiones := v_decisiones || jsonb_build_object(v_linea::text, d);
  end loop;
  if exists (select 1 from retail.pedido_web_lineas x where x.pedido_id = p.id and not v_decisiones ? x.id::text) then
    raise exception 'Falta decidir qué pasa con alguna prenda.' using errcode = '22023', hint = 'pedido_web_decisiones';
  end if;

  -- ADR-0190: las filas de stock que se van a reservar, bloqueadas antes de mover nada, sede por sede y en orden.
  for r in
    select (x.d ->> 'ubicacion_id')::uuid as ubic, array_agg(distinct l2.variante_id) as variantes
      from (select e.key::uuid as linea_id, e.value as d from jsonb_each(v_decisiones) e) x
      join retail.pedido_web_lineas l2 on l2.id = x.linea_id
     where x.d ->> 'decision' = 'reservar'
     group by 1
     order by 1
  loop
    perform retail.fn_bloquear_en_orden(r.ubic, r.variantes);
  end loop;

  for l in select * from retail.pedido_web_lineas x where x.pedido_id = p.id order by x.posicion loop
    d := v_decisiones -> l.id::text;
    v_decision := d ->> 'decision';
    if v_decision = 'reservar' then
      perform retail.fn_pedido_web_reservar(l.id, (d ->> 'ubicacion_id')::uuid, nullif(d ->> 'sububicacion_id', '')::uuid, v_persona);
    elsif v_decision = 'por_conseguir' then
      update retail.pedido_web_lineas x
         set estado = 'por_conseguir', fecha_compromiso = (d ->> 'fecha')::date, resuelta_en = now(), resuelta_por = v_persona
       where x.id = l.id;
    else
      update retail.pedido_web_lineas x
         set estado = 'quitada', resuelta_en = now(), resuelta_por = v_persona
       where x.id = l.id;
    end if;
  end loop;

  if not exists (select 1 from retail.pedido_web_lineas x where x.pedido_id = p.id and x.estado <> 'quitada') then
    raise exception 'Si no queda ninguna prenda, el pedido no se confirma: ciérralo con «No se puede confirmar».'
      using errcode = '22023', hint = 'pedido_web_sin_prendas';
  end if;

  update retail.pedidos_web w set estado = 'confirmado', confirmado_en = now(), confirmado_por = v_persona where w.id = p.id;
  return retail.fn_pedido_web_resumen(p.id);
end;
$$;

-- Llegó una prenda «por conseguir» (o la sede decide reservarla ahora): la reserva, como al confirmar.
create or replace function retail.reservar_linea_pedido_web(p_linea_id uuid, p_ubicacion_id uuid default null, p_sububicacion_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  l retail.pedido_web_lineas%rowtype;
  v_persona uuid;
  v_ubic uuid;
begin
  select w.* into p
    from retail.pedidos_web w join retail.pedido_web_lineas x on x.pedido_id = w.id
   where x.id = p_linea_id
     for update of w;
  if not found then
    raise exception 'Esa prenda de pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado not in ('confirmado', 'pagado') then
    raise exception '%', retail.fn_pedido_web_no_admite(p, 'reservar sus prendas') using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  select * into l from retail.pedido_web_lineas x where x.id = p_linea_id;
  if l.estado <> 'por_conseguir' then
    raise exception 'Esa prenda no está por conseguir: está «%».', l.estado using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  v_persona := retail.fn_pedido_web_actor();
  v_ubic := coalesce(p_ubicacion_id, p.ubicacion_id);
  perform retail.fn_bloquear_en_orden(v_ubic, array[l.variante_id]);
  perform retail.fn_pedido_web_reservar(l.id, v_ubic, p_sububicacion_id, v_persona);
  return retail.fn_pedido_web_resumen(p.id);
end;
$$;

-- «No se puede confirmar» (el ERP): se cierra con su motivo. El stock no cambia: nunca bajó.
create or replace function retail.no_confirmar_pedido_web(p_pedido_id uuid, p_motivo text, p_horas_para_confirmar integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  v_persona uuid;
begin
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado <> 'por_confirmar' then
    raise exception '%', retail.fn_pedido_web_no_admite(p, 'cerrar sin confirmar') using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  if now() >= p.creado_en + make_interval(hours => p_horas_para_confirmar) then
    raise exception 'El pedido web % ya pasó su plazo: se cierra solo, sin confirmar.', p.codigo using errcode = 'P0001', hint = 'pedido_web_vencido';
  end if;
  if p_motivo is null or p_motivo not in ('sin_stock', 'cliente_no_respondio', 'cliente_desistio') then
    raise exception 'Elige por qué no se confirma: no hay stock, el cliente no respondió o desistió.'
      using errcode = '22023', hint = 'pedido_web_motivo';
  end if;
  v_persona := retail.fn_pedido_web_actor();
  update retail.pedidos_web w
     set estado = 'anulado', cerrado_en = now(), cerrado_por = v_persona, cierre_motivo = p_motivo
   where w.id = p.id;
  return retail.fn_pedido_web_resumen(p.id);
end;
$$;

-- Anular un pedido confirmado (el ERP): lo reservado vuelve a estar disponible. Si ya pagó una parte, sus pagos siguen
-- aprobados (el dinero es del cliente) hasta que la sede los devuelva con `anular_pago_pedido_web`. Un pedido pagado completo
-- ya tiene su boleta: devolverlo no es anularlo (nota de crédito, actividad 10).
create or replace function retail.anular_pedido_web(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  v_persona uuid;
  l record;
  r record;
begin
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado = 'por_confirmar' then
    raise exception 'El pedido web % todavía no está confirmado: ciérralo con «No se puede confirmar».', p.codigo
      using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  if p.estado <> 'confirmado' then
    raise exception '%', retail.fn_pedido_web_no_admite(p, 'anular') using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  if p_motivo is null or p_motivo not in ('cliente_no_pago', 'cliente_desistio', 'error_en_pedido') then
    raise exception 'Elige por qué se anula: el cliente no pagó, desistió o hubo un error en el pedido.'
      using errcode = '22023', hint = 'pedido_web_motivo';
  end if;
  v_persona := retail.fn_pedido_web_actor();

  for r in
    select x.ubicacion_id as ubic, array_agg(distinct x.variante_id) as variantes
      from retail.pedido_web_lineas x
     where x.pedido_id = p.id and x.estado = 'reservada'
     group by x.ubicacion_id
     order by x.ubicacion_id
  loop
    perform retail.fn_bloquear_en_orden(r.ubic, r.variantes);
  end loop;

  update retail.pedidos_web w
     set estado = 'anulado', cerrado_en = now(), cerrado_por = v_persona, cierre_motivo = p_motivo
   where w.id = p.id;
  for l in select * from retail.pedido_web_lineas x where x.pedido_id = p.id and x.estado = 'reservada' order by x.posicion loop
    update retail.pedido_web_lineas x set estado = 'liberada' where x.id = l.id;
    perform retail.fn_pedido_web_soltar(l.id, v_persona, 'Pedido web ' || p.codigo || ' anulado: la prenda vuelve a estar disponible');
  end loop;
  return retail.fn_pedido_web_resumen(p.id);
end;
$$;

-- El cierre de lo que nadie confirmó a tiempo (la ruta programada de la actividad 7). Seguro de correr dos veces a la vez: lo
-- que otra sesión está tocando se salta (`skip locked`) y la próxima corrida lo cierra. Devuelve cuántos cerró.
create or replace function retail.fn_cerrar_pedidos_web_vencidos(p_horas_para_confirmar integer default 24)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, 7);
  for v_id in
    select w.id from retail.pedidos_web w
     where w.estado = 'por_confirmar' and w.creado_en + make_interval(hours => p_horas_para_confirmar) <= now()
     order by w.creado_en
     for update skip locked
  loop
    update retail.pedidos_web w
       set estado = 'vencido', cerrado_en = now(), cierre_motivo = 'sin_confirmar'
     where w.id = v_id and w.estado = 'por_confirmar';
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Las lecturas (los avisos de 48 h y 7 días se calculan aquí, al leer)
-- ----------------------------------------------------------------------------

-- Lo que dice cada pedido hoy: su estado (un «por confirmar» pasado su plazo ya se lee vencido), cuánto falta, si lleva
-- prendas por conseguir o por traer de otra sede, y los dos avisos. «Listo para recoger» = pagado, sin nada por conseguir y
-- todo en su tienda; desde entonces corren los días para recoger. Se filtra ADENTRO (un pedido, una tienda o una ficha): una
-- función security definer no se funde con la consulta de afuera, y sin el filtro cada lectura recorrería toda la historia.
create or replace function retail.fn_pedidos_web_estado_hoy(p_horas_para_confirmar integer, p_horas_aviso_sin_pagar integer,
                                                            p_dias_aviso_sin_recoger integer, p_pedido_id uuid,
                                                            p_ubicacion_id uuid, p_clienta_id uuid)
returns table (
  pedido_id uuid, estado text, falta numeric, prendas integer, por_conseguir integer, por_traer integer,
  vence_en timestamptz, sin_pagar boolean, listo_para_recoger boolean, recoger_hasta timestamptz, sin_recoger boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select w.id,
         case when w.estado = 'por_confirmar' and now() >= w.creado_en + make_interval(hours => p_horas_para_confirmar)
              then 'vencido' else w.estado end,
         w.total - w.pagado,
         x.vivas, x.por_conseguir, x.por_traer,
         case when w.estado = 'por_confirmar' then w.creado_en + make_interval(hours => p_horas_para_confirmar) end,
         w.estado = 'confirmado' and now() > w.confirmado_en + make_interval(hours => p_horas_aviso_sin_pagar),
         w.estado = 'pagado' and x.por_conseguir = 0 and x.por_traer = 0,
         case when w.estado = 'pagado' and x.por_conseguir = 0 and x.por_traer = 0
              then greatest(w.pagado_en, x.ultima_reserva) + make_interval(days => p_dias_aviso_sin_recoger) end,
         w.estado = 'pagado' and x.por_conseguir = 0 and x.por_traer = 0
           and now() > greatest(w.pagado_en, x.ultima_reserva) + make_interval(days => p_dias_aviso_sin_recoger)
    from retail.pedidos_web w
    cross join lateral (
      select count(*) filter (where l.estado <> 'quitada')::integer as vivas,
             count(*) filter (where l.estado = 'por_conseguir')::integer as por_conseguir,
             count(*) filter (where l.estado = 'reservada' and l.ubicacion_id <> w.ubicacion_id)::integer as por_traer,
             max(l.reservada_en) filter (where l.estado = 'reservada') as ultima_reserva
        from retail.pedido_web_lineas l where l.pedido_id = w.id
    ) x
   where (p_pedido_id is null or w.id = p_pedido_id)
     and (p_ubicacion_id is null or w.ubicacion_id = p_ubicacion_id)
     and (p_clienta_id is null or w.clienta_id = p_clienta_id);
$$;

-- La lista de una tienda (el ERP): lo abierto y lo cerrado de los últimos días.
create or replace function retail.fn_pedidos_web_sede(
  p_ubicacion_id uuid,
  p_horas_para_confirmar integer default 24,
  p_horas_aviso_sin_pagar integer default 48,
  p_dias_aviso_sin_recoger integer default 7,
  p_dias_cerrados integer default 30)
returns table (
  pedido_id uuid, codigo text, numero integer, estado text, clienta_id uuid, clienta_nombre text, clienta_celular text,
  total numeric, pagado numeric, falta numeric, prendas integer, por_conseguir integer, por_traer integer,
  creado_en timestamptz, vence_en timestamptz, confirmado_en timestamptz, pagado_en timestamptz, entregado_en timestamptz,
  cerrado_en timestamptz, cierre_motivo text, sin_pagar boolean, listo_para_recoger boolean, recoger_hasta timestamptz,
  sin_recoger boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger);
  if p_dias_cerrados is null or p_dias_cerrados not between 0 and 366 then
    raise exception 'Los días de pedidos cerrados van de 0 a 366.' using errcode = '22023', hint = 'pedido_web_plazo';
  end if;
  perform retail.fn_pedido_web_exigir(p_ubicacion_id);
  return query
  select w.id, w.codigo, w.numero, h.estado, w.clienta_id, c.nombre, c.telefono_whatsapp,
         w.total, w.pagado, h.falta, h.prendas, h.por_conseguir, h.por_traer,
         w.creado_en, h.vence_en, w.confirmado_en, w.pagado_en, w.entregado_en, w.cerrado_en, w.cierre_motivo,
         h.sin_pagar, h.listo_para_recoger, h.recoger_hasta, h.sin_recoger
    from retail.pedidos_web w
    join retail.fn_pedidos_web_estado_hoy(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger,
                                          null, p_ubicacion_id, null) h
      on h.pedido_id = w.id
    join retail.clientas c on c.id = w.clienta_id
   where w.ubicacion_id = p_ubicacion_id
     and (w.estado in ('por_confirmar', 'confirmado', 'pagado')
          or coalesce(w.entregado_en, w.cerrado_en) >= now() - make_interval(days => p_dias_cerrados))
   order by w.creado_en, w.numero;
end;
$$;

-- El detalle de un pedido (el ERP): sus prendas con lo que hay de cada una (en su tienda por lugar, y en las otras), quién más
-- la pidió y si la separó antes (propuesta k), y sus pagos.
create or replace function retail.fn_pedido_web(
  p_pedido_id uuid,
  p_horas_para_confirmar integer default 24,
  p_horas_aviso_sin_pagar integer default 48,
  p_dias_aviso_sin_recoger integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  v jsonb;
begin
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger);
  select * into p from retail.pedidos_web w where w.id = p_pedido_id;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);

  select jsonb_build_object(
    'pedido_id', p.id, 'codigo', p.codigo, 'numero', p.numero, 'estado', h.estado,
    'ubicacion_id', p.ubicacion_id, 'tienda', u.nombre,
    'cliente', jsonb_build_object(
      'clienta_id', c.id, 'nombre', c.nombre, 'celular', c.telefono_whatsapp,
      'documento', case when c.documento_numero is not null then '••••' || right(c.documento_numero, 4) end,
      'miembro_del_club', c.club_desde is not null),
    'total', p.total, 'pagado', p.pagado, 'falta', h.falta,
    'creado_en', p.creado_en, 'vence_en', h.vence_en, 'confirmado_en', p.confirmado_en, 'pagado_en', p.pagado_en,
    'entregado_en', p.entregado_en, 'cerrado_en', p.cerrado_en, 'cierre_motivo', p.cierre_motivo,
    'sin_pagar', h.sin_pagar, 'listo_para_recoger', h.listo_para_recoger, 'recoger_hasta', h.recoger_hasta,
    'sin_recoger', h.sin_recoger,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'linea_id', l.id, 'posicion', l.posicion, 'variante_id', l.variante_id, 'sku', va.sku, 'referencia', pr.referencia,
               'talla', t.valor, 'color', co.nombre, 'color_codigo', va.color_codigo,
               'precio_lista', l.precio_lista, 'descuento', l.descuento, 'precio', l.precio, 'estado', l.estado,
               'ubicacion_id', l.ubicacion_id, 'tienda_reserva', ur.nombre,
               'lugar', case s.tipo when 'almacen_tienda' then 'almacen' when 'piso_venta' then 'piso' end,
               'por_traer', l.estado = 'reservada' and l.ubicacion_id <> p.ubicacion_id,
               'fecha_compromiso', l.fecha_compromiso,
               -- Lo que hay HOY de esa prenda (libre: lo que no está apartado ni reservado).
               'disponible', (
                 select jsonb_build_object(
                   'almacen', coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.ubicacion_id = p.ubicacion_id and ss.tipo = 'almacen_tienda'), 0),
                   'piso', coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.ubicacion_id = p.ubicacion_id and ss.tipo = 'piso_venta'), 0),
                   'sin_lugar', coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.ubicacion_id = p.ubicacion_id and st.sububicacion_id is null), 0),
                   'otras_tiendas', coalesce((
                     select jsonb_agg(jsonb_build_object('ubicacion_id', o.ubicacion_id, 'tienda', o.nombre, 'libres', o.libres) order by o.nombre)
                       from (select st2.ubicacion_id, u2.nombre, sum(st2.cantidad - st2.cantidad_apartada) as libres
                               from retail.stock st2
                               join retail.ubicaciones u2 on u2.id = st2.ubicacion_id and u2.tipo = 'tienda' and u2.activo
                               left join retail.sububicaciones ss2 on ss2.id = st2.sububicacion_id
                              where st2.variante_id = l.variante_id and st2.ubicacion_id <> p.ubicacion_id
                                and (ss2.id is null or ss2.tipo in ('almacen_tienda', 'piso_venta'))
                              group by st2.ubicacion_id, u2.nombre
                             having sum(st2.cantidad - st2.cantidad_apartada) > 0) o), '[]'::jsonb))
                   from retail.stock st
                   left join retail.sububicaciones ss on ss.id = st.sububicacion_id
                  where st.variante_id = l.variante_id and st.ubicacion_id = p.ubicacion_id
                    and (ss.id is null or ss.tipo in ('almacen_tienda', 'piso_venta'))),
               -- Propuesta k: otros pedidos de esta tienda que esperan confirmación con esa misma prenda.
               'compiten', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'pedido_id', w2.id, 'codigo', w2.codigo, 'creado_en', w2.creado_en,
                          'separo_antes', (w2.creado_en, w2.numero) < (p.creado_en, p.numero))
                        order by w2.creado_en, w2.numero)
                   from retail.pedidos_web w2
                  where w2.id <> p.id and w2.ubicacion_id = p.ubicacion_id and w2.estado = 'por_confirmar'
                    and now() < w2.creado_en + make_interval(hours => p_horas_para_confirmar)
                    and exists (select 1 from retail.pedido_web_lineas l2
                                 where l2.pedido_id = w2.id and l2.variante_id = l.variante_id and l2.estado = 'pendiente')), '[]'::jsonb))
             order by l.posicion)
        from retail.pedido_web_lineas l
        join retail.variantes va on va.id = l.variante_id
        join retail.productos pr on pr.id = va.producto_id
        left join retail.tallas t on t.id = va.talla_id
        left join retail.colores co on co.codigo = va.color_codigo
        left join retail.ubicaciones ur on ur.id = l.ubicacion_id
        left join retail.sububicaciones s on s.id = l.sububicacion_id
       where l.pedido_id = p.id), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pago_id', g.id, 'origen', g.origen, 'medio', g.medio, 'monto', g.monto, 'estado', g.estado,
               'numero_operacion', g.numero_operacion, 'proveedor', g.proveedor, 'observacion', g.observacion,
               'registrado_en', g.registrado_en, 'registrado_por', pe.nombres, 'en_caja', g.caja_movimiento_id is not null,
               'anulado_en', g.anulado_en, 'anulado_motivo', g.anulado_motivo)
             order by g.registrado_en, g.id)
        from retail.pedido_web_pagos g
        left join public.personas pe on pe.id = g.registrado_por
       where g.pedido_id = p.id), '[]'::jsonb))
  into v
  from retail.fn_pedidos_web_estado_hoy(p_horas_para_confirmar, p_horas_aviso_sin_pagar, p_dias_aviso_sin_recoger,
                                        p.id, null, null) h
  join retail.clientas c on c.id = p.clienta_id
  join retail.ubicaciones u on u.id = p.ubicacion_id
  where h.pedido_id = p.id;
  return v;
end;
$$;

-- «Mis pedidos» (la tienda, actividad 7): los pedidos de una ficha, con sus prendas. El código para recoger sale solo cuando el
-- pedido está listo para recoger.
create or replace function retail.fn_pedidos_web_de_clienta(
  p_clienta_id uuid,
  p_horas_para_confirmar integer default 24,
  p_dias_aviso_sin_recoger integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  perform retail.fn_pedido_web_plazos_validos(p_horas_para_confirmar, 48, p_dias_aviso_sin_recoger);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'pedido_id', w.id, 'codigo', w.codigo, 'estado', h.estado, 'tienda', u.nombre, 'ubicacion_id', w.ubicacion_id,
             'total', w.total, 'pagado', w.pagado, 'falta', h.falta,
             'creado_en', w.creado_en, 'vence_en', h.vence_en, 'confirmado_en', w.confirmado_en, 'pagado_en', w.pagado_en,
             'entregado_en', w.entregado_en, 'cerrado_en', w.cerrado_en, 'cierre_motivo', w.cierre_motivo,
             'listo_para_recoger', h.listo_para_recoger, 'recoger_hasta', h.recoger_hasta,
             'codigo_recojo', case when h.listo_para_recoger then w.codigo_recojo end,
             'lineas', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'variante_id', l.variante_id, 'referencia', pr.referencia, 'talla', t.valor, 'color', co.nombre,
                        'color_codigo', va.color_codigo, 'precio', l.precio, 'precio_lista', l.precio_lista, 'estado', l.estado,
                        'viene_de', case when l.estado = 'reservada' and l.ubicacion_id <> w.ubicacion_id then ur.nombre end,
                        'fecha_compromiso', l.fecha_compromiso)
                      order by l.posicion)
                 from retail.pedido_web_lineas l
                 join retail.variantes va on va.id = l.variante_id
                 join retail.productos pr on pr.id = va.producto_id
                 left join retail.tallas t on t.id = va.talla_id
                 left join retail.colores co on co.codigo = va.color_codigo
                 left join retail.ubicaciones ur on ur.id = l.ubicacion_id
                where l.pedido_id = w.id), '[]'::jsonb))
           order by w.creado_en desc, w.numero desc)
      from retail.pedidos_web w
      join retail.fn_pedidos_web_estado_hoy(p_horas_para_confirmar, 48, p_dias_aviso_sin_recoger, null, null, p_clienta_id) h
        on h.pedido_id = w.id
      join retail.ubicaciones u on u.id = w.ubicacion_id
     where w.clienta_id = p_clienta_id), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Quién ejecuta qué. Postgres le da EXECUTE a PUBLIC a toda función nueva, y `0005_grants.sql` a `authenticated`: se
--    quita a todos y se da solo lo que corresponde. `tienda_web` no recibe nada (actividad 7: sus `tienda_*`).
-- ----------------------------------------------------------------------------
revoke all on function retail.fn_pedido_web_reglas() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_linea_reglas() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_linea_total() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_pago_reglas() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_pago_suma() from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_sin_borrar() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_verificar(uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_coherente() from public, anon, authenticated;
revoke all on function retail.fn_apartado_de_pedido_web() from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_siguen_a_la_ficha() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_plazos_validos(integer, integer, integer) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_exigir(uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_actor() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_no_admite(retail.pedidos_web, text) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_resumen(uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_reservar(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_soltar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_estado_hoy(integer, integer, integer, uuid, uuid, uuid) from public, anon, authenticated;

-- La tienda (envueltas en sus tienda_*, actividad 7): solo su dueño.
revoke all on function retail.crear_pedido_web(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_de_clienta(uuid, integer, integer) from public, anon, authenticated;

-- La ruta programada: como las del ERP (`fn_club_anonimizar_inactivas`), con la llave de servicio.
revoke all on function retail.fn_cerrar_pedidos_web_vencidos(integer) from public, anon, authenticated;
grant execute on function retail.fn_cerrar_pedidos_web_vencidos(integer) to service_role;

-- El ERP: `authenticated`, con el permiso (módulo y tienda) adentro de cada una.
revoke all on function retail.confirmar_pedido_web(uuid, jsonb, integer) from public, anon;
revoke all on function retail.reservar_linea_pedido_web(uuid, uuid, uuid) from public, anon;
revoke all on function retail.no_confirmar_pedido_web(uuid, text, integer) from public, anon;
revoke all on function retail.anular_pedido_web(uuid, text) from public, anon;
revoke all on function retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer) from public, anon;
revoke all on function retail.fn_pedido_web(uuid, integer, integer, integer) from public, anon;
grant execute on function retail.confirmar_pedido_web(uuid, jsonb, integer) to authenticated;
grant execute on function retail.reservar_linea_pedido_web(uuid, uuid, uuid) to authenticated;
grant execute on function retail.no_confirmar_pedido_web(uuid, text, integer) to authenticated;
grant execute on function retail.anular_pedido_web(uuid, text) to authenticated;
grant execute on function retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer) to authenticated;
grant execute on function retail.fn_pedido_web(uuid, integer, integer, integer) to authenticated;

comment on function retail.crear_pedido_web(uuid, uuid, jsonb, uuid) is
  'Tienda online (ADR-0408): «Separar». Crea el pedido por confirmar con sus prendas y precios ya calculados; no toca el stock. Interna: la envuelve tienda_*.';
comment on function retail.confirmar_pedido_web(uuid, jsonb, integer) is
  'Pedidos web (ADR-0408): confirma línea por línea (reservar en una sede y lugar —almacén primero—, por conseguir con fecha o quitar). Todo o nada.';
comment on function retail.reservar_linea_pedido_web(uuid, uuid, uuid) is
  'Pedidos web: reserva una prenda que estaba por conseguir (llegó), como al confirmar.';
comment on function retail.no_confirmar_pedido_web(uuid, text, integer) is
  'Pedidos web: cierra un pedido por confirmar con su motivo (sin_stock, cliente_no_respondio, cliente_desistio). El stock no cambia.';
comment on function retail.anular_pedido_web(uuid, text) is
  'Pedidos web: anula un pedido confirmado (cliente_no_pago, cliente_desistio, error_en_pedido) y libera lo reservado.';
comment on function retail.fn_cerrar_pedidos_web_vencidos(integer) is
  'Pedidos web: la ruta programada cierra lo que nadie confirmó en su plazo (24 h por defecto). Devuelve cuántos cerró.';
comment on function retail.fn_pedidos_web_sede(uuid, integer, integer, integer, integer) is
  'Pedidos web: la lista de una tienda, con los avisos calculados al leer (sin pagar a las 48 h, sin recoger a los 7 días).';
comment on function retail.fn_pedido_web(uuid, integer, integer, integer) is
  'Pedidos web: el detalle de un pedido, con lo disponible de cada prenda, quién más la pidió y si la separó antes, y sus pagos.';
comment on function retail.fn_pedidos_web_de_clienta(uuid, integer, integer) is
  'Tienda online: «Mis pedidos» de una ficha. El código para recoger sale solo cuando está listo. Interna: la envuelve tienda_*.';
