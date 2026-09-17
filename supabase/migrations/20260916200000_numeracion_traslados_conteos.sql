-- ============================================================================
-- 20260916200000_numeracion_traslados_conteos.sql — CAYLA V2
--
-- Número corrido para traslados y conteos (Felipe, 2026-09-16, al integrar
-- sus 4 diseños de Inventario): "Traslado 12", "Conteo 7". Hasta hoy los dos
-- se identificaban solo por su uuid — imposible de decir por WhatsApp
-- ("confirma el traslado 12") y sin forma de distinguir dos traslados
-- Lima → Trujillo del mismo día.
--
-- DECIDÍ: una columna `numero integer` con su propio contador (sequence) en
-- cada tabla, asignada por la base al insertar (default), rellenada para las
-- filas que ya existen en orden de creación. Las RPC que crean
-- (iniciar_traslado, abrir_conteo) no cambian: las dos insertan con lista de
-- columnas explícita, el default hace el trabajo.
-- DESCARTÉ: un número por sede ("TRU-0012") — exige un contador por
-- ubicación y una tabla de contadores; el número global es único en toda la
-- red, que es justo lo que hace falta cuando dos sedes hablan del mismo
-- traslado. También descarté guardar el número formateado ("#TR-0012"): el
-- prefijo es presentación y vive en la pantalla, no en la base.
-- SE ROMPE SI: alguien inserta en `transferencias`/`conteos` con un `numero`
-- explícito repetido — el `unique` lo rechaza, no lo deja pasar. Un hueco en
-- la numeración por una transacción abortada (nextval no se devuelve) es
-- esperado y aceptado: el número identifica, no cuenta.
--
-- También agrega `fn_conteos_resumen`: la lista de conteos de una ubicación
-- con su resultado (sistema, físico, diferencia en unidades y en soles) ya
-- sumado en Postgres. La pantalla de Conteo lo muestra por fila; sumarlo en
-- TypeScript obligaría a traer todos los `conteo_items` de cada conteo solo
-- para pintar un total (3 tiendas × ~8 conteos/mes × ~300 líneas: en 3 años,
-- miles de filas por carga de pantalla para mostrar 20 números).
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

-- ============================================================================
-- 1. Traslados
-- ============================================================================

create sequence retail.transferencias_numero_seq;

alter table retail.transferencias add column numero integer;

-- Las que ya existen se numeran en orden de creación (id desempata dos
-- creadas en el mismo instante — el orden entre esas dos es arbitrario pero
-- estable).
update retail.transferencias t
   set numero = s.rn
  from (select id, row_number() over (order by created_at, id) as rn from retail.transferencias) s
 where s.id = t.id;

select setval('retail.transferencias_numero_seq', coalesce((select max(numero) from retail.transferencias), 0) + 1, false);

alter table retail.transferencias
  alter column numero set not null,
  alter column numero set default nextval('retail.transferencias_numero_seq'),
  add constraint transferencias_numero_unique unique (numero);

-- Si algún día se borra la columna, el contador se va con ella.
alter sequence retail.transferencias_numero_seq owned by retail.transferencias.numero;

-- ============================================================================
-- 2. Conteos — idéntico
-- ============================================================================

create sequence retail.conteos_numero_seq;

alter table retail.conteos add column numero integer;

update retail.conteos c
   set numero = s.rn
  from (select id, row_number() over (order by created_at, id) as rn from retail.conteos) s
 where s.id = c.id;

select setval('retail.conteos_numero_seq', coalesce((select max(numero) from retail.conteos), 0) + 1, false);

alter table retail.conteos
  alter column numero set not null,
  alter column numero set default nextval('retail.conteos_numero_seq'),
  add constraint conteos_numero_unique unique (numero);

alter sequence retail.conteos_numero_seq owned by retail.conteos.numero;

-- ============================================================================
-- 3. fn_conteos_resumen — la lista de conteos de una ubicación, con resultado
-- ============================================================================
--
-- `security invoker` a propósito (no definer): todo lo que lee tiene RLS que
-- ya deja ver a quien opera la ubicación (conteos_select, conteo_items_select,
-- y los catálogos), y no cruza a `public`. No hay razón para saltarse RLS.
--
-- El conteo abierto (si hay) va primero; después los cerrados del más
-- reciente al más antiguo. `diferencia` se calcula de `cantidad_contada -
-- cantidad_sistema` y no de la columna `conteo_items.diferencia`, que solo
-- se llena al cerrar — así el conteo abierto también reporta su diferencia
-- al momento. Los soles usan el costo ACTUAL de la variante, mismo criterio
-- que `resumirVarianza()` (conteo-varianza.ts) en la vista previa de cierre.
create or replace function retail.fn_conteos_resumen(p_ubicacion_id uuid, p_limite integer default 20)
returns table (
  id uuid,
  numero integer,
  estado text,
  created_at timestamptz,
  cerrado_en timestamptz,
  sububicacion_id uuid,
  sububicacion_nombre text,
  sububicacion_tipo text,
  alcance text,
  alcance_categoria_nombre text,
  abierto_por uuid,
  cerrado_por uuid,
  lineas integer,
  lineas_con_diferencia integer,
  sistema integer,
  contado integer,
  diferencia integer,
  soles_diferencia numeric
)
language sql
stable
set search_path = retail, public, extensions
as $$
  select c.id,
         c.numero,
         c.estado,
         c.created_at,
         c.cerrado_en,
         c.sububicacion_id,
         s.nombre,
         s.tipo,
         c.alcance,
         cat.nombre,
         c.abierto_por,
         c.cerrado_por,
         coalesce(agg.lineas, 0),
         coalesce(agg.lineas_con_diferencia, 0),
         coalesce(agg.sistema, 0),
         coalesce(agg.contado, 0),
         coalesce(agg.diferencia, 0),
         coalesce(agg.soles, 0)
    from conteos c
    left join sububicaciones s on s.id = c.sububicacion_id
    left join categorias cat on cat.id = c.alcance_categoria_id
    left join lateral (
      select count(*)::integer as lineas,
             count(*) filter (where ci.cantidad_contada <> ci.cantidad_sistema)::integer as lineas_con_diferencia,
             sum(ci.cantidad_sistema)::integer as sistema,
             sum(ci.cantidad_contada)::integer as contado,
             sum(ci.cantidad_contada - ci.cantidad_sistema)::integer as diferencia,
             sum((ci.cantidad_contada - ci.cantidad_sistema) * v.costo)::numeric as soles
        from conteo_items ci
        join variantes v on v.id = ci.variante_id
       where ci.conteo_id = c.id
    ) agg on true
   where c.ubicacion_id = p_ubicacion_id
   order by (c.estado = 'abierto') desc, c.created_at desc
   limit greatest(p_limite, 1);
$$;

comment on function retail.fn_conteos_resumen(uuid, integer) is
  'Conteos de una ubicación (abierto primero, luego cerrados del más reciente) con líneas, sistema/contado/diferencia y soles ya sumados. Security invoker: RLS de conteos/conteo_items decide qué se ve.';
