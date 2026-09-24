-- ============================================================================
-- 20260924235100 — Gastos, con o sin factura de proveedor (ADR-0195 F2; adapta ADR-0117 del PR #170)
--
-- EL PROBLEMA PRIMERO
--   CAYLA paga luz, alquiler, contador y mototaxis, y hoy nada de eso queda en el sistema: el Estado de Resultados no
--   tiene de dónde sacarlo. El riesgo no es crear la tabla, es CONTAR DOS VECES:
--     · la caja ya registra egresos («Otro», «Compra de insumos») y algunos son gastos y otros no (un depósito al banco);
--     · una factura de luz podría entrar por Compras y por Gastos a la vez, con dos IGV descontables.
--
-- LAS REGLAS
--   1. `gastos` es la ÚNICA fuente de los gastos. Un egreso de caja es un medio de pago: solo es gasto si un gasto lo
--      señala (vínculo único), o se marca «no es gasto» (depósito, retiro, ajuste). Nada se cuenta dos veces.
--   2. Decisión A (ADR-0195): si el gasto llegó con comprobante de un proveedor (factura, boleta o recibo por
--      honorarios), el comprobante vive en la MISMA cabecera que la mercadería: `compras` con `naturaleza = 'gasto'`.
--      Así hay un solo candado contra la factura doble (`unique (proveedor_id, serie, numero)`), un solo IGV descontable,
--      y un gasto a crédito aparece en Por pagar con su saldo, como cualquier factura. El gasto sin comprobante vive solo.
--   3. Decisión B: quien tiene el módulo Gastos registra y ve los gastos de SU tienda; el líder, los de todas y los
--      «de la empresa» (`ubicacion_id` nulo: contador, software).
--   4. Todo firma con el responsable del combo (`fn_actor_persona_id(true)`). Nada se borra: se anula con motivo.
--
-- CÓMO ENTRA UN GASTO (una sola RPC, `registrar_gasto`)
--   Sin comprobante:  A. pagado sin cajón (Yape, transferencia, tarjeta) → un gasto.
--                     B. efectivo del cajón abierto → el egreso de caja y el gasto que lo señala, en una transacción.
--                     C. clasificar un egreso que la tienda ya registró → un gasto que lo señala.
--   Con comprobante:  la cabecera `compras` (naturaleza gasto) + el gasto que la detalla (categoría y tienda).
--                     Al contado, su pago en `compra_pagos` (y si fue en efectivo del cajón, su egreso de caja).
--                     A crédito, queda en Por pagar con su vencimiento.
--
-- LO QUE TOCA DE COMPRAS (y por qué no rompe lo de hoy)
--   · `compras.naturaleza` nace con valor 'mercaderia' en las 164 facturas de hoy: nada cambia para ellas.
--   · Una factura de gasto no tiene prendas: el check `compras_no_mercaderia_sin_unidades` lo impone en la base (si alguien
--     le colgara una prenda, `facturado_cantidad` subiría y el check la rechaza).
--   · `compra_parte_por_tienda` (la parte de cada tienda en cada factura, ADR-0139/0187) suma una rama: la factura de
--     gasto es entera de su tienda. Con eso la visibilidad por tienda, Por pagar y el tope de pago por tienda
--     (`fn_pago_no_supera_tienda`) funcionan para gastos SIN reescribir ninguna función de pago.
--   · Lo que habla de MERCADERÍA solo cuenta mercadería: la lista de Facturas de proveedor (`listar_compras` gana
--     `p_naturaleza`, 'mercaderia' por defecto), las compras e IGV del mes de Compras, las métricas de proveedores y el
--     buscador de facturas para notas de crédito (parches por texto sobre la definición VIVA, con ancla verificada).
--     Recibir ya los excluye solo (no tienen reparto). Lo que habla de DEUDA los incluye: Por pagar, `fn_deuda_visible`
--     y el saldo del proveedor, porque la luz a crédito también se debe.
--   · `compra_pagos` acepta 'tarjeta' (la tarjeta de crédito de CAYLA pagando una factura de luz).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — SEIS EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»):
--   PARTE 1 compras · PARTE 2 compra_pagos · PARTE 3 la parte de cada tienda · PARTE 4 compras_resumen ·
--   PARTE 5 el `gastos` de antes · PARTE 6 lo nuevo (y las lecturas de Compras que solo cuentan mercadería).
--   Cada una toma como mucho una tabla que la tienda usa y espera 3 s: si dice «lock timeout», se repite ESA parte.
--   Todas son idempotentes. Sin políticas (RLS encendido y todo por funciones). Antes: 20260924235000.
--   En local y en el CI el archivo corre entero.
-- SE ROMPE SI: la web nueva se publica antes (Gastos llama funciones que no existirían). La web de hoy no se rompe si
-- esto se pega primero: las pantallas de Compras no ven facturas de gasto hasta que alguien registre una.
-- ============================================================================

-- ============================== PARTE 1 · compras (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.compras add column if not exists naturaleza text not null default 'mercaderia';
alter table retail.compras drop constraint if exists compras_naturaleza_check;
alter table retail.compras add constraint compras_naturaleza_check check (naturaleza in ('mercaderia', 'gasto', 'activo'));
comment on column retail.compras.naturaleza is
  'Qué detalla el comprobante (ADR-0195 A): mercaderia (compra_items → Recibir → inventario), gasto (una fila de gastos) o activo (F2b, activos_fijos). Una misma cabecera para los tres: un solo candado contra la factura doble y un solo IGV.';

-- El recibo por honorarios (el contador) solo puede ser un gasto; nunca trae IGV (compras_igv_solo_factura ya lo exige).
alter table retail.compras drop constraint if exists compras_tipo_check;
alter table retail.compras add constraint compras_tipo_check check (tipo in ('factura', 'boleta', 'nota_venta', 'recibo_por_honorarios'));
alter table retail.compras drop constraint if exists compras_honorarios_solo_gasto;
alter table retail.compras add constraint compras_honorarios_solo_gasto check (tipo <> 'recibo_por_honorarios' or naturaleza <> 'mercaderia');

-- La tienda gestora es obligatoria en la mercadería (ADR-0184). En un gasto es la tienda del gasto, y nula si es «de la
-- empresa» (solo el líder la ve y la paga).
alter table retail.compras drop constraint if exists compras_gestora_obligatoria;
alter table retail.compras add constraint compras_gestora_obligatoria
  check (estado <> 'vigente' or ubicacion_gestion_id is not null or naturaleza <> 'mercaderia');

-- Un gasto o un activo no se recibe: sin unidades facturadas, recibidas ni cerradas.
alter table retail.compras drop constraint if exists compras_no_mercaderia_sin_unidades;
alter table retail.compras add constraint compras_no_mercaderia_sin_unidades
  check (naturaleza = 'mercaderia' or (facturado_cantidad = 0 and recibido_cantidad = 0 and cerrado_cantidad = 0));

-- Lo que un comprobante detalla no cambia después: una factura de mercadería no se vuelve gasto (ni al revés).
create or replace function retail.fn_compras_naturaleza_fija() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if new.naturaleza is distinct from old.naturaleza then
    raise exception 'Un comprobante no cambia de naturaleza (mercadería, gasto o activo): anúlalo y regístralo de nuevo.'
      using errcode = '23514';
  end if;
  return new;
end $$;
create or replace trigger compras_naturaleza_fija before update of naturaleza on retail.compras
  for each row execute function retail.fn_compras_naturaleza_fija();
revoke all on function retail.fn_compras_naturaleza_fija() from public, anon, authenticated;

-- La factura de un gasto se anula desde Gastos (que anula el gasto con ella), nunca sola desde Compras: si no, quedaría
-- un gasto vigente colgando de una factura anulada. (La tabla `gastos` nace en la PARTE 6; hasta entonces no hay
-- facturas de gasto y la condición no se cumple.)
create or replace function retail.fn_compras_gasto_se_anula_desde_gastos() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' and new.naturaleza = 'gasto'
     and exists (select 1 from retail.gastos g where g.compra_id = new.id and g.estado = 'vigente') then
    raise exception 'Este comprobante es de un gasto: anúlalo desde Finanzas ▸ Gastos (se anula el gasto con él).'
      using errcode = '23514';
  end if;
  return new;
end $$;
create or replace trigger compras_gasto_se_anula_desde_gastos before update of estado on retail.compras
  for each row execute function retail.fn_compras_gasto_se_anula_desde_gastos();
revoke all on function retail.fn_compras_gasto_se_anula_desde_gastos() from public, anon, authenticated;

reset lock_timeout;

-- ============================== PARTE 2 · compra_pagos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- La tarjeta de crédito de CAYLA también paga facturas (la luz, el software). F3 unifica la lista de medios en todo el
-- sistema; aquí solo se suma 'tarjeta' a los de hoy.
alter table retail.compra_pagos drop constraint if exists compra_pagos_metodo_check;
alter table retail.compra_pagos add constraint compra_pagos_metodo_check
  check (metodo in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'tarjeta', 'otro', 'saldo_a_favor'));

reset lock_timeout;

-- ============================== PARTE 3 · la parte de cada tienda (sola) ==============================
-- Misma vista que hoy (ADR-0139, reparto al centavo) + una rama: el comprobante de un gasto o activo es entero de su
-- tienda. El de «la empresa» (sin tienda) no tiene parte: solo lo ve y lo paga el líder.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace view retail.compra_parte_por_tienda with (security_invoker = true) as
 WITH pesos AS (
         SELECT i.compra_id,
            d.ubicacion_id,
            sum(d.cantidad)::integer AS unidades,
            sum(i.subtotal * d.cantidad::numeric / i.cantidad::numeric) AS peso
           FROM retail.compra_items i
             JOIN retail.compra_item_destinos d ON d.compra_item_id = i.id
          GROUP BY i.compra_id, d.ubicacion_id
        ), con_cabecera AS (
         SELECT p.compra_id,
            p.ubicacion_id,
            p.unidades,
            p.peso,
            c.subtotal AS subtotal_cab,
            c.igv AS igv_cab,
            sum(p.peso) OVER (PARTITION BY p.compra_id) AS peso_compra,
            sum(p.unidades) OVER (PARTITION BY p.compra_id) AS unidades_compra
           FROM pesos p
             JOIN retail.compras c ON c.id = p.compra_id
        ), sub_exacto AS (
         SELECT b.compra_id,
            b.ubicacion_id,
            b.unidades,
            b.peso,
            b.subtotal_cab,
            b.igv_cab,
            b.peso_compra,
            b.unidades_compra,
                CASE
                    WHEN b.peso_compra > 0::numeric THEN b.subtotal_cab * b.peso / b.peso_compra
                    ELSE b.subtotal_cab * b.unidades::numeric / b.unidades_compra::numeric
                END AS exacto
           FROM con_cabecera b
        ), sub_enteros AS (
         SELECT e.compra_id,
            e.ubicacion_id,
            e.unidades,
            e.peso,
            e.subtotal_cab,
            e.igv_cab,
            e.peso_compra,
            e.unidades_compra,
            e.exacto,
            floor(e.exacto * 100::numeric) AS centavos,
            e.exacto * 100::numeric - floor(e.exacto * 100::numeric) AS residuo
           FROM sub_exacto e
        ), sub_puestos AS (
         SELECT e.compra_id,
            e.ubicacion_id,
            e.unidades,
            e.peso,
            e.subtotal_cab,
            e.igv_cab,
            e.peso_compra,
            e.unidades_compra,
            e.exacto,
            e.centavos,
            e.residuo,
            round(e.subtotal_cab * 100::numeric) - sum(e.centavos) OVER (PARTITION BY e.compra_id) AS sobran,
            row_number() OVER (PARTITION BY e.compra_id ORDER BY e.residuo DESC, e.ubicacion_id) AS puesto
           FROM sub_enteros e
        ), sub_final AS (
         SELECT s.compra_id,
            s.ubicacion_id,
            s.unidades,
            s.unidades_compra,
            s.subtotal_cab,
            s.igv_cab,
            (s.centavos +
                CASE
                    WHEN s.puesto::numeric <= s.sobran THEN 1
                    ELSE 0
                END::numeric) / 100::numeric AS subtotal
           FROM sub_puestos s
        ), igv_exacto AS (
         SELECT f.compra_id,
            f.ubicacion_id,
            f.unidades,
            f.unidades_compra,
            f.subtotal_cab,
            f.igv_cab,
            f.subtotal,
                CASE
                    WHEN f.subtotal_cab > 0::numeric THEN f.igv_cab * f.subtotal / f.subtotal_cab
                    ELSE f.igv_cab * f.unidades::numeric / f.unidades_compra::numeric
                END AS exacto
           FROM sub_final f
        ), igv_enteros AS (
         SELECT g.compra_id,
            g.ubicacion_id,
            g.unidades,
            g.unidades_compra,
            g.subtotal_cab,
            g.igv_cab,
            g.subtotal,
            g.exacto,
            floor(g.exacto * 100::numeric) AS centavos,
            g.exacto * 100::numeric - floor(g.exacto * 100::numeric) AS residuo
           FROM igv_exacto g
        ), igv_puestos AS (
         SELECT g.compra_id,
            g.ubicacion_id,
            g.unidades,
            g.unidades_compra,
            g.subtotal_cab,
            g.igv_cab,
            g.subtotal,
            g.exacto,
            g.centavos,
            g.residuo,
            round(g.igv_cab * 100::numeric) - sum(g.centavos) OVER (PARTITION BY g.compra_id) AS sobran,
            row_number() OVER (PARTITION BY g.compra_id ORDER BY g.residuo DESC, g.ubicacion_id) AS puesto
           FROM igv_enteros g
        )
 SELECT compra_id,
    ubicacion_id,
    unidades,
    subtotal::numeric(12,2) AS subtotal,
    ((centavos +
        CASE
            WHEN puesto::numeric <= sobran THEN 1
            ELSE 0
        END::numeric) / 100::numeric)::numeric(12,2) AS igv,
    (subtotal + (centavos +
        CASE
            WHEN puesto::numeric <= sobran THEN 1
            ELSE 0
        END::numeric) / 100::numeric)::numeric(12,2) AS total
   FROM igv_puestos q
UNION ALL
 -- ADR-0195 F2: un comprobante de gasto o activo es entero de su tienda (sin prendas, sin reparto).
 SELECT c.id AS compra_id,
    c.ubicacion_gestion_id AS ubicacion_id,
    0 AS unidades,
    c.subtotal::numeric(12,2) AS subtotal,
    c.igv::numeric(12,2) AS igv,
    c.total::numeric(12,2) AS total
   FROM retail.compras c
  WHERE c.naturaleza <> 'mercaderia' AND c.ubicacion_gestion_id IS NOT NULL;

reset lock_timeout;

-- ============================== PARTE 4 · compras_resumen (sola) ==============================
-- La misma vista de hoy + `naturaleza` al final: la lista de Compras filtra la mercadería y Por pagar muestra las dos.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace view retail.compras_resumen with (security_invoker = true) as
 SELECT c.id,
    c.proveedor_id,
    p.nombre AS proveedor_nombre,
    p.ruc AS proveedor_ruc,
    c.tipo,
    c.serie,
    c.numero,
    c.documento,
    c.fecha_emision,
    c.condicion,
    c.fecha_vencimiento,
    c.subtotal,
    c.igv,
    c.total,
    c.estado,
    c.nota,
    c.created_at,
    c.pagado,
    c.saldo,
    c.estado_pago,
    c.facturado_cantidad,
    c.recibido_cantidad,
    c.estado_recepcion,
    c.estado = 'vigente'::text AND c.saldo > 0::numeric AND c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < retail.fn_hoy_lima() AS vencida,
    c.fecha_estimada_llegada,
    c.estado = 'vigente'::text AND (c.estado_recepcion = ANY (ARRAY['sin_recibir'::text, 'parcial'::text])) AND retail.fn_hoy_lima() > COALESCE(c.fecha_estimada_llegada, c.fecha_emision + 7) AS recepcion_atrasada,
    p.telefono AS proveedor_telefono,
    p.banco AS proveedor_banco,
    p.cuenta_bancaria AS proveedor_cuenta_bancaria,
    c.notas_credito,
    c.cerrado_cantidad,
    ( SELECT array_agg(DISTINCT d.ubicacion_id ORDER BY d.ubicacion_id) AS array_agg
           FROM retail.compra_items ci2
             JOIN retail.compra_item_destinos d ON d.compra_item_id = ci2.id
          WHERE ci2.compra_id = c.id) AS ubicaciones_destino,
    c.naturaleza
   FROM retail.compras c
     JOIN retail.proveedores p ON p.id = c.proveedor_id;

reset lock_timeout;

-- ============================== PARTE 5 · el `gastos` de antes (sola) ==============================
-- Producción tiene una tabla `gastos` sin ninguna migración en el repo (de antes de la unificación), con otra forma y
-- 0 filas, y una `registrar_gasto` que la escribe. No se borran: se renombran como legado (con sus índices, cuyos nombres
-- chocarían con los de la tabla nueva) y la función queda sin permiso. En local y en el CI no existe: no hace nada.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare v_idx text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'gastos' and column_name = 'documento_tipo') then
    alter table retail.gastos rename to gastos_legado_2026_09;
    for v_idx in select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'retail.gastos_legado_2026_09'::regclass loop
      execute format('alter index retail.%I rename to %I', v_idx, replace(v_idx, 'gastos_', 'gastos_legado_2026_09_'));
    end loop;
    comment on table retail.gastos_legado_2026_09 is
      'LEGADO (renombrada el 2026-09-24, ADR-0195 F2): la tabla gastos de antes de la unificación, sin migración en el repo y con 0 filas. La de hoy es retail.gastos. No se usa; se quita cuando Felipe lo decida.';
  end if;
  if to_regprocedure('retail.registrar_gasto(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid)') is not null then
    alter function retail.registrar_gasto(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid)
      rename to registrar_gasto_legado_2026_09;
    revoke all on function retail.registrar_gasto_legado_2026_09(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid)
      from public, anon, authenticated;
  end if;
end $$;

reset lock_timeout;

-- ============================== PARTE 6 · lo nuevo ==============================
-- Tablas, funciones y el módulo. Sobre las tablas que ya usa la tienda (compras, caja_movimientos, ubicaciones) solo
-- toma candados compartidos por las FK, compatibles con quien lee.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El módulo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('gastos', 'Finanzas', 'Gastos',
   'Registrar y anular los gastos de su tienda (luz, alquiler, movilidad), con o sin factura, y decir qué fue cada salida de plata del cajón',
   250, false, true)
on conflict (clave) do nothing;

-- ---------- 2. Gastos ----------
create table if not exists retail.gastos (
  id uuid primary key default gen_random_uuid(),
  -- Nulo = «de la empresa» (contador, software): aparece solo en el consolidado y solo lo registra el líder.
  ubicacion_id uuid references retail.ubicaciones (id),
  categoria text not null references retail.categorias_gasto (codigo),
  descripcion text not null check (trim(descripcion) <> ''),
  -- El día del gasto (o la fecha de emisión de su comprobante), en hora de Lima.
  fecha date not null,
  monto_total numeric(12,2) not null check (monto_total > 0),
  igv numeric(12,2) not null default 0 check (igv >= 0),
  -- El comprobante del proveedor, si lo hubo (decisión A). Sin él, el gasto va solo y sin IGV.
  compra_id uuid references retail.compras (id),
  -- Cómo se pagó un gasto SIN comprobante. Con comprobante, el pago vive en compra_pagos (y el saldo en compras).
  medio_pago text check (medio_pago in ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta')),
  -- El egreso de caja que respalda el gasto (efectivo del cajón). Único por gasto vigente.
  caja_movimiento_id uuid references retail.caja_movimientos (id),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid references public.personas (id),
  anulado_en timestamptz,
  registrado_por uuid references public.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now(),

  -- Sin comprobante: dice cómo se pagó, y efectivo ⇔ tiene su egreso de caja. Con comprobante: el pago está en la factura.
  constraint gastos_pago_coherente check (
    (compra_id is null and medio_pago is not null and ((medio_pago = 'efectivo') = (caja_movimiento_id is not null)))
    or (compra_id is not null and medio_pago is null)
  ),
  -- El IGV solo existe con comprobante (y ahí lo manda la factura) y nunca alcanza al total.
  constraint gastos_igv_solo_con_comprobante check (igv = 0 or compra_id is not null),
  constraint gastos_igv_menor_al_total check (igv < monto_total),
  constraint gastos_anulacion_coherente check (
    (estado = 'vigente' and motivo_anulacion is null and anulado_por is null and anulado_en is null)
    or (estado = 'anulado' and motivo_anulacion is not null and trim(motivo_anulacion) <> '' and anulado_en is not null)
  )
);
comment on table retail.gastos is
  'ÚNICA fuente de los gastos (ADR-0117, ADR-0195 F2). Con comprobante cuelga de compras (naturaleza gasto); sin él, dice cómo se pagó. Un egreso de caja solo es gasto si un gasto lo señala. No se edita ni se borra: se anula con motivo.';

create unique index if not exists gastos_egreso_vigente_uq on retail.gastos (caja_movimiento_id)
  where estado = 'vigente' and caja_movimiento_id is not null;
create unique index if not exists gastos_compra_vigente_uq on retail.gastos (compra_id)
  where estado = 'vigente' and compra_id is not null;
create index if not exists gastos_ubicacion_fecha_idx on retail.gastos (ubicacion_id, fecha);
create index if not exists gastos_fecha_idx on retail.gastos (fecha);

-- ---------- 3. Egresos de caja que NO son gasto ----------
-- Depósito al banco, retiro del dueño, ajuste de conteo. Una tabla aparte, no una columna en caja_movimientos (el núcleo
-- de dinero no cambia). Una marca equivocada se REVIERTE, nunca se borra.
create table if not exists retail.egresos_no_gasto (
  id uuid primary key default gen_random_uuid(),
  caja_movimiento_id uuid not null references retail.caja_movimientos (id),
  tipo text not null check (tipo in ('deposito', 'retiro', 'ajuste', 'otro')),
  motivo text,
  revisado_por uuid references public.personas (id),
  revisado_en timestamptz not null default now(),
  revertido_por uuid references public.personas (id),
  revertido_en timestamptz,
  check (tipo <> 'otro' or (motivo is not null and trim(motivo) <> '')),
  check ((revertido_en is null) or (revertido_en >= revisado_en))
);
comment on table retail.egresos_no_gasto is
  'Egresos de caja que no son gasto (depósito, retiro del dueño, ajuste). Solo se agregan filas; una marca se revierte, no se borra. En F3 el depósito se une a su movimiento de dinero.';
create unique index if not exists egresos_no_gasto_vigente_uq on retail.egresos_no_gasto (caja_movimiento_id)
  where revertido_en is null;

-- ---------- 4. Candados que ni el dueño de la fila salta ----------

-- 4a. Al nacer un gasto: su egreso de caja (si lo tiene) es un egreso, del mismo monto, de su tienda, y no está marcado
-- «no es gasto»; su comprobante (si lo tiene) es un gasto vigente con el mismo total, IGV y tienda. El candado por
-- egreso serializa «clasificar como gasto» contra «marcar no es gasto» (tocan tablas distintas).
create or replace function retail.fn_gastos_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_mov retail.caja_movimientos%rowtype; v_ubic uuid; v_c retail.compras%rowtype;
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
    if exists (select 1 from retail.egresos_no_gasto e where e.caja_movimiento_id = new.caja_movimiento_id and e.revertido_en is null) then
      raise exception 'Ese egreso está marcado como «no es gasto»: revierte la marca primero.' using errcode = 'P0001';
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
create or replace trigger gastos_validar before insert on retail.gastos
  for each row execute function retail.fn_gastos_validar();

-- 4b. Un gasto no se edita ni se borra: solo se anula (vigente → anulado, con motivo).
create or replace function retail.fn_gastos_solo_anular() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un gasto no se borra: se anula con un motivo.' using errcode = 'P0001';
  end if;
  if old.estado = 'anulado' then
    raise exception 'Un gasto anulado no se modifica.' using errcode = 'P0001';
  end if;
  if new.estado <> 'anulado' then
    raise exception 'Un gasto solo cambia para anularse.' using errcode = 'P0001';
  end if;
  if (new.id, new.ubicacion_id, new.categoria, new.descripcion, new.fecha, new.monto_total, new.igv, new.compra_id,
      new.medio_pago, new.caja_movimiento_id, new.registrado_por, new.token_cliente, new.created_at)
     is distinct from
     (old.id, old.ubicacion_id, old.categoria, old.descripcion, old.fecha, old.monto_total, old.igv, old.compra_id,
      old.medio_pago, old.caja_movimiento_id, old.registrado_por, old.token_cliente, old.created_at) then
    raise exception 'Un gasto no se edita: se anula y se registra uno nuevo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger gastos_solo_anular before update or delete on retail.gastos
  for each row execute function retail.fn_gastos_solo_anular();

-- 4c. La marca «no es gasto» no convive con un gasto vigente del mismo egreso, y solo se revierte.
create or replace function retail.fn_egresos_no_gasto_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_mov retail.caja_movimientos%rowtype;
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
  if exists (select 1 from retail.gastos g where g.caja_movimiento_id = new.caja_movimiento_id and g.estado = 'vigente') then
    raise exception 'Ese egreso ya es un gasto: anula el gasto primero.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger egresos_no_gasto_validar before insert or update or delete on retail.egresos_no_gasto
  for each row execute function retail.fn_egresos_no_gasto_validar();

-- ---------- 5. Quién ve y registra qué (decisión B) ----------
-- El líder: todas las ubicaciones activas (y los gastos «de la empresa»). Con el módulo Gastos: su tienda. Sin él, nada.
create or replace function retail.fn_gastos_ubicaciones() returns uuid[]
language sql stable security definer set search_path = retail, public, extensions as $$
  select case
    when retail.fn_es_lider() then
      (select coalesce(array_agg(u.id order by u.id), '{}') from retail.ubicaciones u where u.activo)
    when retail.fn_capacidad_por_modulos(array['gastos']) and retail.fn_ubicacion_actual_persona() is not null then
      array[retail.fn_ubicacion_actual_persona()]
    else '{}'::uuid[]
  end;
$$;
comment on function retail.fn_gastos_ubicaciones() is 'Las ubicaciones cuyos gastos ve y registra la cuenta: todas para el líder, la suya con el módulo Gastos, ninguna sin él.';

create or replace function retail.fn_gastos_puede(p_ubicacion_id uuid) returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  select case
    when p_ubicacion_id is null then retail.fn_es_lider()   -- «de la empresa»: solo el líder
    else p_ubicacion_id = any (retail.fn_gastos_ubicaciones())
  end;
$$;

-- ---------- 6. Registrar un gasto ----------
-- CONTRATO. Promete: un gasto vigente y, según el caso, su comprobante (compras), su pago (compra_pagos) y su egreso de
-- caja, todo o nada. Asume: la cuenta ve Gastos de esa tienda (o es líder); en efectivo, la caja está abierta (lo valida
-- `registrar_movimiento_caja`, la misma regla de siempre). Idempotente por `p_token`.
-- `p_ubicacion_id` es OBLIGATORIO a propósito (null = «de la empresa»): con default, olvidarlo cargaría el gasto a la
-- empresa en silencio.
-- p_comprobante (null = sin comprobante): {"tipo": factura|boleta|recibo_por_honorarios, "proveedor_id", "serie",
--   "numero", "igv" (opcional: sin él, con factura se calcula de la tasa vigente), "condicion": contado|credito,
--   "fecha_vencimiento" (a crédito)}.
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
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_cat retail.categorias_gasto%rowtype;
  v_mov uuid := p_caja_movimiento_id;
  v_ubic_caja uuid;
  v_id uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_monto numeric := round(p_monto_total, 2);
  v_tipo text; v_prov uuid; v_serie text; v_numero text; v_cond text; v_vence date; v_igv numeric := 0;
  v_compra uuid;
  v_nota_caja text;
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
  if p_fecha is null or p_fecha > v_hoy then
    raise exception 'La fecha del gasto no puede ser futura.' using errcode = 'P0001';
  end if;

  -- Con comprobante: sus datos. Sin él: el medio.
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
      v_igv := coalesce(round((p_comprobante->>'igv')::numeric, 2),
                        round(v_monto - v_monto / (1 + retail.fn_tasa_igv(p_fecha)), 2));
      if v_igv < 0 or v_igv >= v_monto then
        raise exception 'El IGV tiene que estar entre cero y el total.' using errcode = 'P0001';
      end if;
    end if;
    if exists (select 1 from retail.compras where proveedor_id = v_prov and serie = v_serie and numero = v_numero) then
      raise exception 'Ese comprobante (% %-%) ya está registrado, como mercadería o como gasto.', v_tipo, v_serie, v_numero
        using errcode = '23505';
    end if;
    if v_cond = 'credito' then
      if p_medio_pago is not null or p_caja_id is not null or p_caja_movimiento_id is not null then
        raise exception 'Un gasto a crédito todavía no se paga: se paga desde Por pagar.' using errcode = 'P0001';
      end if;
    elsif p_medio_pago is null or p_medio_pago not in ('efectivo', 'yape', 'plin', 'transferencia', 'deposito', 'tarjeta') then
      raise exception 'Di cómo se pagó.' using errcode = 'P0001';
    end if;
  elsif p_medio_pago is null or p_medio_pago not in ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta') then
    raise exception 'Di cómo se pagó.' using errcode = 'P0001';
  end if;

  -- Efectivo: sale de una caja abierta (B) o clasifica un egreso ya registrado (C), uno de los dos.
  if p_medio_pago = 'efectivo' then
    if (p_caja_id is null) = (p_caja_movimiento_id is null) then
      raise exception 'En efectivo, el gasto sale de la caja abierta o clasifica un egreso ya registrado (uno de los dos).' using errcode = 'P0001';
    end if;
  elsif p_caja_id is not null or p_caja_movimiento_id is not null then
    raise exception 'Solo un gasto en efectivo se une a la caja.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);

  -- Camino C: el egreso tiene que ser de una caja que la cuenta ve.
  if p_caja_movimiento_id is not null then
    select c.ubicacion_id into v_ubic_caja
      from retail.caja_movimientos m join retail.cajas c on c.id = m.caja_id where m.id = p_caja_movimiento_id;
    if v_ubic_caja is null or not retail.fn_gastos_puede(v_ubic_caja) then
      raise exception 'Ese egreso de caja no es de una tienda tuya.' using errcode = '42501';
    end if;
  end if;

  -- Camino B: el egreso lo crea la MISMA función de siempre (caja abierta, permiso, firma): las reglas de caja viven en
  -- un solo lugar. Motivo «Otro» con la nota, del vocabulario cerrado de la caja.
  if p_caja_id is not null then
    select ubicacion_id into v_ubic_caja from retail.cajas where id = p_caja_id;
    if v_ubic_caja is null then
      raise exception 'Esa caja no existe.' using errcode = 'P0001';
    end if;
    if p_ubicacion_id is not null and p_ubicacion_id <> v_ubic_caja then
      raise exception 'El gasto es de otra tienda que la caja que lo paga.' using errcode = 'P0001';
    end if;
    v_nota_caja := left('Gasto · ' || v_cat.nombre || ' — ' || trim(p_descripcion)
                        || case when v_tipo is not null then ' (' || v_serie || '-' || v_numero || ')' else '' end, 200);
    v_mov := retail.registrar_movimiento_caja(p_caja_id, 'egreso', v_monto, 'Otro', v_nota_caja, false, null::uuid);
  end if;

  -- El comprobante: la misma cabecera que la mercadería, con naturaleza gasto y sin prendas.
  if p_comprobante is not null then
    insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
                                subtotal, igv, total, estado, nota, usuario_id, naturaleza, ubicacion_gestion_id)
    values (v_prov, v_tipo, v_serie, v_numero, p_fecha, v_cond, case when v_cond = 'credito' then v_vence end,
            v_monto - v_igv, v_igv, v_monto, 'vigente', trim(p_descripcion), v_actor, 'gasto', p_ubicacion_id)
    returning id into v_compra;
    if v_cond = 'contado' then
      insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id)
      values (v_compra, p_fecha, v_monto, p_medio_pago, nullif(trim(coalesce(p_referencia, '')), ''), v_actor, p_ubicacion_id);
    end if;
  end if;

  insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id, medio_pago,
                             caja_movimiento_id, registrado_por, token_cliente)
  values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_fecha, v_monto, v_igv, v_compra,
          case when v_compra is null then p_medio_pago end, v_mov, v_actor, p_token)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  -- El bloque entero se deshace (también el egreso y el comprobante): no queda nada a medias.
  if p_token is not null and exists (select 1 from retail.gastos where token_cliente = p_token) then
    return (select id from retail.gastos where token_cliente = p_token);
  end if;
  if p_caja_movimiento_id is not null then
    raise exception 'Ese egreso de caja ya es un gasto.' using errcode = '23505';
  end if;
  raise;
end $$;

-- ---------- 7. Anular un gasto ----------
-- No toca la caja: si el gasto salió del cajón, la plata SÍ salió; el egreso vuelve a «por clasificar». Con comprobante,
-- se anula también la factura, salvo que ya tenga pagos: igual que en Compras, un comprobante pagado no se anula.
create or replace function retail.anular_gasto(p_gasto_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_g retail.gastos%rowtype; v_actor uuid;
begin
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  select * into v_g from retail.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_g.ubicacion_id) then
    raise exception 'No puedes anular gastos de esa tienda.' using errcode = '42501';
  end if;
  if v_g.estado = 'anulado' then
    raise exception 'Ese gasto ya estaba anulado.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_g.compra_id is not null then
    perform 1 from retail.compras where id = v_g.compra_id for update;
    if exists (select 1 from retail.compra_pagos where compra_id = v_g.compra_id) then
      raise exception 'Su comprobante ya tiene pagos: no se anula (como en Compras). Si el proveedor corrige el monto, pide una nota de crédito.'
        using errcode = 'P0001';
    end if;
  end if;
  -- Primero el gasto y después su factura: el candado de `compras` solo deja anular la factura de un gasto ya anulado.
  update retail.gastos set estado = 'anulado', motivo_anulacion = trim(p_motivo), anulado_por = v_actor, anulado_en = now()
   where id = p_gasto_id;
  if v_g.compra_id is not null then
    update retail.compras set estado = 'anulada', motivo_anulacion = trim(p_motivo), anulada_por = v_actor, anulada_at = now()
     where id = v_g.compra_id and estado = 'vigente';
  end if;
end $$;

-- ---------- 8. Marcar / revertir «no es gasto» ----------
create or replace function retail.marcar_egreso_no_gasto(p_caja_movimiento_id uuid, p_tipo text, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid; v_id uuid;
begin
  select c.ubicacion_id into v_ubic
    from retail.caja_movimientos m join retail.cajas c on c.id = m.caja_id where m.id = p_caja_movimiento_id;
  if v_ubic is null or not retail.fn_gastos_puede(v_ubic) then
    raise exception 'Ese egreso de caja no es de una tienda tuya.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('deposito', 'retiro', 'ajuste', 'otro') then
    raise exception 'Di qué fue: depósito, retiro, ajuste u otro.' using errcode = 'P0001';
  end if;
  if p_tipo = 'otro' and (p_motivo is null or trim(p_motivo) = '') then
    raise exception 'Escribe qué fue.' using errcode = 'P0001';
  end if;
  begin
    insert into retail.egresos_no_gasto (caja_movimiento_id, tipo, motivo, revisado_por)
    values (p_caja_movimiento_id, p_tipo, nullif(trim(coalesce(p_motivo, '')), ''), retail.fn_actor_persona_id(true))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ese egreso ya estaba marcado.' using errcode = '23505';
  end;
  return v_id;
end $$;

create or replace function retail.revertir_egreso_no_gasto(p_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid;
begin
  select c.ubicacion_id into v_ubic
    from retail.egresos_no_gasto e join retail.caja_movimientos m on m.id = e.caja_movimiento_id
    join retail.cajas c on c.id = m.caja_id
   where e.id = p_id and e.revertido_en is null;
  if v_ubic is null then
    raise exception 'Esa marca no existe o ya se revirtió.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_ubic) then
    raise exception 'Ese egreso de caja no es de una tienda tuya.' using errcode = '42501';
  end if;
  update retail.egresos_no_gasto set revertido_en = now(), revertido_por = retail.fn_actor_persona_id(true)
   where id = p_id and revertido_en is null;
end $$;

-- ---------- 8b. El proveedor de un gasto, sin salir del formulario ----------
-- Hidrandina o el contador casi nunca están en el directorio (es de mercadería), y dar de alta proveedores es del módulo
-- Proveedores. Quien registra gastos puede sumar uno con lo mínimo (nombre y RUC); si ya existe (mismo RUC o mismo
-- nombre), se usa ese: nunca dos fichas del mismo proveedor. Sus cuentas y contactos se completan luego en Proveedores.
create or replace function retail.registrar_proveedor_de_gasto(p_nombre text, p_ruc text default null) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_nombre text := retail.fn_texto_o_null(p_nombre); v_ruc text := retail.fn_texto_o_null(p_ruc); v_id uuid;
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_gastos_ubicaciones()), 0) = 0 then
    raise exception 'Sumar el proveedor de un gasto necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.' using errcode = 'P0001';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene que ser de 11 dígitos. Si no tiene RUC, déjalo en blanco.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('proveedor:' || coalesce(v_ruc, retail.fn_clave_texto(v_nombre)), 0));
  if v_ruc is not null then
    select id into v_id from retail.proveedores where ruc = v_ruc limit 1;
    if found then return v_id; end if;
  end if;
  select id into v_id from retail.proveedores where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre) limit 1;
  if found then return v_id; end if;
  insert into retail.proveedores (nombre, ruc, rubro) values (v_nombre, v_ruc, 'Gastos') returning id into v_id;
  return v_id;
end $$;

-- ---------- 9. Lecturas de la pantalla (cada una mira solo lo que la cuenta ve) ----------
-- «Ver»: p_ubicacion_id nulo = todo lo que ve la cuenta (el líder, además, lo «de la empresa»); p_solo_empresa = solo
-- lo de la empresa (líder).

-- Las cifras de arriba y el reparto por tienda y categoría.
create or replace function retail.fn_gastos_panel(p_desde date, p_hasta date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns jsonb language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_es_lider();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return (
    with vis as (
      select g.* from retail.gastos g
       where g.estado = 'vigente' and g.fecha between p_desde and p_hasta
         and ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
         and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
         and (not p_solo_empresa or g.ubicacion_id is null)
    ),
    comp as (
      select v.*, c.tipo as comprobante_tipo from vis v left join retail.compras c on c.id = v.compra_id
    ),
    deuda as (
      select coalesce(sum(c.saldo), 0) as monto, count(*) as n
        from retail.compras c
       where c.naturaleza = 'gasto' and c.estado = 'vigente' and c.saldo > 0
         and ((c.ubicacion_gestion_id is null and v_lider) or c.ubicacion_gestion_id = any (v_ubics))
         and (p_ubicacion_id is null or c.ubicacion_gestion_id = p_ubicacion_id)
         and (not p_solo_empresa or c.ubicacion_gestion_id is null)
    ),
    egresos as (
      select count(*) as n, coalesce(sum(m.monto), 0) as monto
        from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
       where m.tipo = 'egreso' and k.ubicacion_id = any (v_ubics)
         and (p_ubicacion_id is null or k.ubicacion_id = p_ubicacion_id)
         and not p_solo_empresa
         and not exists (select 1 from retail.gastos g where g.caja_movimiento_id = m.id and g.estado = 'vigente')
         and not exists (select 1 from retail.egresos_no_gasto e where e.caja_movimiento_id = m.id and e.revertido_en is null)
    )
    select jsonb_build_object(
      'total', (select coalesce(sum(monto_total), 0) from comp),
      'igv', (select coalesce(sum(igv), 0) from comp),
      'n', (select count(*) from comp),
      'boletas', (select count(*) from comp where comprobante_tipo = 'boleta'),
      'sin_comprobante', (select count(*) from comp where compra_id is null),
      'por_pagar', (select monto from deuda),
      'n_por_pagar', (select n from deuda),
      'egresos_sin_clasificar', (select n from egresos),
      'egresos_sin_clasificar_monto', (select monto from egresos),
      'por_categoria', coalesce((
        select jsonb_agg(jsonb_build_object('categoria', x.categoria, 'nombre', k.nombre, 'cuenta', k.cuenta_pcge, 'monto', x.monto, 'n', x.n)
                         order by x.monto desc)
          from (select categoria, sum(monto_total) as monto, count(*) as n from comp group by categoria) x
          join retail.categorias_gasto k on k.codigo = x.categoria), '[]'::jsonb),
      'por_ubicacion', coalesce((
        select jsonb_agg(jsonb_build_object('ubicacion_id', x.ubicacion_id, 'nombre', coalesce(u.nombre, 'De la empresa'), 'monto', x.monto, 'n', x.n)
                         order by x.monto desc)
          from (select ubicacion_id, sum(monto_total) as monto, count(*) as n from comp group by ubicacion_id) x
          left join retail.ubicaciones u on u.id = x.ubicacion_id), '[]'::jsonb)
    )
  );
end $$;

-- La lista de gastos (vigentes y anulados: los anulados se quedan a la vista).
create or replace function retail.fn_gastos_lista(p_desde date, p_hasta date, p_ubicacion_id uuid default null,
                                                  p_solo_empresa boolean default false, p_limite integer default 300)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text, cuenta text,
  descripcion text, fecha date, monto_total numeric, igv numeric, medio_pago text, caja_movimiento_id uuid,
  compra_id uuid, comprobante_tipo text, comprobante text, proveedor_nombre text, condicion text,
  fecha_vencimiento date, saldo numeric, tiene_pagos boolean, estado text, motivo_anulacion text,
  registrado_por_nombre text, creado_en timestamptz
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_es_lider();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select g.id, g.ubicacion_id, u.nombre, g.categoria, k.nombre, k.cuenta_pcge, g.descripcion, g.fecha, g.monto_total,
         g.igv, g.medio_pago, g.caja_movimiento_id, g.compra_id, c.tipo, c.documento, p.nombre, c.condicion,
         c.fecha_vencimiento, c.saldo, exists (select 1 from retail.compra_pagos x where x.compra_id = g.compra_id),
         g.estado, g.motivo_anulacion, trim(concat_ws(' ', pe.nombres, pe.apellidos)), g.created_at
    from retail.gastos g
    join retail.categorias_gasto k on k.codigo = g.categoria
    left join retail.ubicaciones u on u.id = g.ubicacion_id
    left join retail.compras c on c.id = g.compra_id
    left join retail.proveedores p on p.id = c.proveedor_id
    left join public.personas pe on pe.id = g.registrado_por
   where g.fecha between p_desde and p_hasta
     and ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
     and (not p_solo_empresa or g.ubicacion_id is null)
   order by g.fecha desc, g.created_at desc
   limit greatest(p_limite, 1);
end $$;

-- Egresos de caja que todavía nadie dijo qué fueron. Nunca se esconden: son plata que salió.
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
  select m.id, m.caja_id, k.ubicacion_id, u.nombre, m.monto, m.motivo, m.nota, trim(concat_ws(' ', pe.nombres, pe.apellidos)), m.created_at, k.estado = 'abierta'
    from retail.caja_movimientos m
    join retail.cajas k on k.id = m.caja_id
    join retail.ubicaciones u on u.id = k.ubicacion_id
    left join public.personas pe on pe.id = m.usuario_id
   where m.tipo = 'egreso'
     and k.ubicacion_id = any (v_ubics)
     and (p_ubicacion_id is null or k.ubicacion_id = p_ubicacion_id)
     and not exists (select 1 from retail.gastos g where g.caja_movimiento_id = m.id and g.estado = 'vigente')
     and not exists (select 1 from retail.egresos_no_gasto e where e.caja_movimiento_id = m.id and e.revertido_en is null)
   order by m.created_at desc
   limit greatest(p_limite, 1);
end $$;

-- Los egresos marcados «no es gasto» (vigentes), para poder revertir una marca equivocada.
create or replace function retail.fn_egresos_no_gasto_lista(p_ubicacion_id uuid default null, p_limite integer default 200)
returns table (id uuid, caja_movimiento_id uuid, ubicacion_nombre text, monto numeric, motivo_egreso text, nota_egreso text,
               tipo text, motivo text, revisado_por_nombre text, revisado_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones();
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los egresos de caja necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select e.id, e.caja_movimiento_id, u.nombre, m.monto, m.motivo, m.nota, e.tipo, e.motivo, trim(concat_ws(' ', pe.nombres, pe.apellidos)), e.revisado_en
    from retail.egresos_no_gasto e
    join retail.caja_movimientos m on m.id = e.caja_movimiento_id
    join retail.cajas k on k.id = m.caja_id
    join retail.ubicaciones u on u.id = k.ubicacion_id
    left join public.personas pe on pe.id = e.revisado_por
   where e.revertido_en is null
     and k.ubicacion_id = any (v_ubics)
     and (p_ubicacion_id is null or k.ubicacion_id = p_ubicacion_id)
   order by e.revisado_en desc
   limit greatest(p_limite, 1);
end $$;

-- ---------- 10. Lo que habla de MERCADERÍA en Compras solo cuenta mercadería ----------
-- 10a. `listar_compras` gana `p_naturaleza` ('mercaderia' por defecto: la lista de Facturas de proveedor, su exportación y
-- las últimas facturas del proveedor). Por pagar la llama con 'todas' (o null): ahí va todo lo que se debe. Mismo cuerpo que hoy
-- (idéntico en producción y en local al 2026-09-24) + una condición en cada rama. Firma nueva: se quita la anterior para
-- que no queden dos (PostgREST no sabría a cuál llamar).
drop function if exists retail.listar_compras(integer, date, timestamp with time zone, uuid, text, text, uuid, text, text, text, boolean, boolean, boolean, boolean, date, date, text, uuid);
create or replace function retail.listar_compras(p_limite integer DEFAULT 50, p_cursor_fecha date DEFAULT NULL::date, p_cursor_creado_en timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_orden text DEFAULT 'emision'::text, p_busqueda text DEFAULT NULL::text, p_proveedor_id uuid DEFAULT NULL::uuid, p_estado_pago text DEFAULT NULL::text, p_estado_recepcion text DEFAULT NULL::text, p_condicion text DEFAULT NULL::text, p_solo_vigentes boolean DEFAULT false, p_con_saldo boolean DEFAULT false, p_solo_vencidas boolean DEFAULT false, p_por_recibir boolean DEFAULT false, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_naturaleza text DEFAULT 'mercaderia'::text)
 RETURNS SETOF retail.compras_resumen
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
  v_hoy date := fn_hoy_lima();
begin
  if v_busqueda is not null then
    select coalesce(array_agg(id), '{}') into v_proveedores from proveedores where nombre ilike '%' || v_busqueda || '%';
  end if;
  if p_orden = 'vencimiento' then
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (p_tipo is null or r.tipo = p_tipo)
        and (p_naturaleza is null or p_naturaleza = 'todas' or r.naturaleza = p_naturaleza)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < v_hoy))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_ubicacion_id is null or p_ubicacion_id = any(r.ubicaciones_destino))
        and (p_cursor_id is null or (r.fecha_vencimiento, r.id) > (p_cursor_fecha, p_cursor_id))
      order by r.fecha_vencimiento asc nulls last, r.id asc
      limit v_limite;
  else
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (p_tipo is null or r.tipo = p_tipo)
        and (p_naturaleza is null or p_naturaleza = 'todas' or r.naturaleza = p_naturaleza)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < v_hoy))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_ubicacion_id is null or p_ubicacion_id = any(r.ubicaciones_destino))
        and (p_cursor_id is null or (r.fecha_emision, r.created_at, r.id) < (p_cursor_fecha, p_cursor_creado_en, p_cursor_id))
      order by r.fecha_emision desc, r.created_at desc, r.id desc
      limit v_limite;
  end if;
end;
$function$;
revoke all on function retail.listar_compras(integer, date, timestamp with time zone, uuid, text, text, uuid, text, text, text, boolean, boolean, boolean, boolean, date, date, text, uuid, text) from public, anon;
grant execute on function retail.listar_compras(integer, date, timestamp with time zone, uuid, text, text, uuid, text, text, text, boolean, boolean, boolean, boolean, date, date, text, uuid, text) to authenticated;

-- 10b. Parches por texto sobre la definición VIVA (varias migraciones ya las parchan así): cada ancla tiene que aparecer
-- exactamente una vez, o la migración se detiene y avisa. Si la marca ya está, no se toca (se puede repetir).
create or replace function pg_temp.solo_mercaderia(p_firma text, p_patron text, p_nuevo text, p_marca text)
returns void language plpgsql as $$
declare v_def text; v_hay integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  select count(*) into v_hay from regexp_matches(v_def, p_patron, 'g');
  if v_hay <> 1 then
    raise exception '%: se esperaba 1 aparición de «%» y hay %. La función cambió en la base: revisar antes de pegar.', p_firma, p_patron, v_hay;
  end if;
  execute regexp_replace(v_def, p_patron, p_nuevo);
end $$;

do $$
begin
  -- Compras e IGV del mes (tarjetas de Compras): mercadería.
  perform pg_temp.solo_mercaderia('retail.resumen_compras_extra()',
  'and c\.fecha_emision >= v_mes_ant and c\.fecha_emision < v_mes_sig',
  E'and c.fecha_emision >= v_mes_ant and c.fecha_emision < v_mes_sig\n    and c.naturaleza = \'mercaderia\'',
  'c.naturaleza = ''mercaderia''');
  -- Facturas, total facturado y entregas de cada proveedor: mercadería (su saldo sigue siendo TODO lo que se le debe).
  perform pg_temp.solo_mercaderia('retail.fn_proveedores()',
  'and fn_compra_es_de_mis_tiendas\(c\.id\)(\s+)where retail\.fn_tiene_acceso_retail\(\)',
  E'and fn_compra_es_de_mis_tiendas(c.id)\n    and c.naturaleza = \'mercaderia\'\\1where retail.fn_tiene_acceso_retail()',
  'c.naturaleza = ''mercaderia''');
  perform pg_temp.solo_mercaderia('retail.fn_proveedores_serie_12m()',
  'and c\.estado <> ''anulada''',
  E'and c.estado <> \'anulada\'\n     and c.naturaleza = \'mercaderia\'',
  'c.naturaleza = ''mercaderia''');
  perform pg_temp.solo_mercaderia('retail.fn_proveedor_metricas_compras(uuid)',
  'where c2\.proveedor_id = p_proveedor_id and fn_compra_es_de_mis_tiendas\(c2\.id\)',
  'where c2.proveedor_id = p_proveedor_id and fn_compra_es_de_mis_tiendas(c2.id) and c2.naturaleza = ''mercaderia''',
  'c2.naturaleza = ''mercaderia''');
  -- Las facturas a las que se les puede colgar una nota de crédito: mercadería.
  perform pg_temp.solo_mercaderia('retail.fn_facturas_para_nota_credito(text, uuid, text, integer)',
  'and retail\.fn_compra_es_de_mis_tiendas\(c\.id\)',
  E'and retail.fn_compra_es_de_mis_tiendas(c.id)\n      and c.naturaleza = \'mercaderia\'',
  'c.naturaleza = ''mercaderia''');
end $$;

-- El candado de dinero de Compras (ADR-0126) sigue en sus 5 funciones: `resumen_compras_extra` se reescribió arriba.
do $$
declare v_pendientes text;
begin
  select retail.fn_aplicar_candado_de_dinero()::text into v_pendientes;
  if v_pendientes <> '{}' then
    raise exception 'Quedaron funciones sin el candado de dinero: %', v_pendientes;
  end if;
end $$;

-- ---------- Permisos: nada se lee ni se escribe por fuera de las funciones ----------
-- RLS encendido y SIN políticas (sin `create policy`: bloquearía auth y storage al pegar).
alter table retail.gastos enable row level security;
alter table retail.egresos_no_gasto enable row level security;
revoke all on retail.gastos, retail.egresos_no_gasto from public, anon, authenticated;

revoke all on function retail.fn_gastos_validar() from public, anon, authenticated;
revoke all on function retail.fn_gastos_solo_anular() from public, anon, authenticated;
revoke all on function retail.fn_egresos_no_gasto_validar() from public, anon, authenticated;
revoke all on function retail.fn_gastos_ubicaciones() from public, anon;
revoke all on function retail.fn_gastos_puede(uuid) from public, anon;
revoke all on function retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid) from public, anon;
revoke all on function retail.anular_gasto(uuid, text) from public, anon;
revoke all on function retail.marcar_egreso_no_gasto(uuid, text, text) from public, anon;
revoke all on function retail.revertir_egreso_no_gasto(uuid) from public, anon;
revoke all on function retail.fn_gastos_panel(date, date, uuid, boolean) from public, anon;
revoke all on function retail.fn_gastos_lista(date, date, uuid, boolean, integer) from public, anon;
revoke all on function retail.fn_egresos_sin_clasificar(uuid, integer) from public, anon;
revoke all on function retail.fn_egresos_no_gasto_lista(uuid, integer) from public, anon;
revoke all on function retail.registrar_proveedor_de_gasto(text, text) from public, anon;
grant execute on function retail.fn_gastos_ubicaciones() to authenticated;
grant execute on function retail.fn_gastos_puede(uuid) to authenticated;
grant execute on function retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid) to authenticated;
grant execute on function retail.anular_gasto(uuid, text) to authenticated;
grant execute on function retail.marcar_egreso_no_gasto(uuid, text, text) to authenticated;
grant execute on function retail.revertir_egreso_no_gasto(uuid) to authenticated;
grant execute on function retail.fn_gastos_panel(date, date, uuid, boolean) to authenticated;
grant execute on function retail.fn_gastos_lista(date, date, uuid, boolean, integer) to authenticated;
grant execute on function retail.fn_egresos_sin_clasificar(uuid, integer) to authenticated;
grant execute on function retail.fn_egresos_no_gasto_lista(uuid, integer) to authenticated;
grant execute on function retail.registrar_proveedor_de_gasto(text, text) to authenticated;

reset lock_timeout;
