-- ============================================================================
-- 20261014175000_traslado_sobrantes_parte1_tabla.sql — CAYLA V2 (ADR-0404, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Cuando una sede cuenta MÁS de lo que se le envió (le mandan 2 blusas y cuenta 3), o una prenda que
-- no venía en la caja, el líder cerraba el traslado con la diferencia y TODO lo contado entraba a su stock. Esa prenda de
-- más no salía de ninguna sede: stock que aparece de la nada (/chaos 2026-10-13 y 2026-10-14, la invariante INV-08), y
-- además se podía vender antes de que nadie supiera de dónde vino.
--
-- LA DECISIÓN (Felipe, 2026-10-14). Lo de más entra como SOBRANTE A REVISAR: no suma al stock ni se puede cobrar hasta que
-- un líder decida qué pasó, con tres salidas:
--   · salio_del_origen — salió de la sede que envió sin anotarse: se descuenta allá y entra a la que recibió.
--   · encontrada       — no se sabe de dónde salió: entra a la que recibió como prenda encontrada, con su nota.
--   · error_de_conteo  — se contó mal: no entra nada.
-- Esta parte crea la tabla donde vive cada sobrante; la parte 2 (`20261014180000`) cambia el cierre y agrega la revisión.
--
-- CONTRATO (Liskov)
--   PROMETE: una fila por prenda de más de cada traslado (`unique (transferencia_id, variante_id)`), con su cantidad y un
--            estado que dice si ya se revisó. El candado `traslado_sobrantes_revision_coherente` hace imposible un sobrante
--            «revisado» sin quién ni cuándo, o una decisión sin los movimientos que la cumplen (o con movimientos que no le
--            tocan).
--   ASUME:   `transferencias`, `transferencia_recepciones`, `movimientos`, `variantes`, `ubicaciones` y `public.personas`.
--   NO HACE: no toca ninguna tabla que la tienda usa hoy (es nueva). RLS encendido y SIN políticas: solo la leen y escriben
--            funciones `security definer` (parte 2), que preguntan por la sede.
--
-- CÓMO SE PEGA. Una sola parte, ANTES de `20261014180000`. Sin políticas ni `drop trigger` (ADR-0195). Idempotente.
-- En producción no había ninguna prenda de más al 2026-10-14 (4 traslados): no hay filas que crear para el pasado.
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.traslado_sobrantes (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references retail.transferencias(id),
  -- La línea contada de donde salió: el sobrante es «lo contado de más» de esa línea.
  transferencia_recepcion_id uuid not null references retail.transferencia_recepciones(id),
  variante_id uuid not null references retail.variantes(id),
  -- La sede que recibió (el destino) y la que envió (el origen), para no leer el traslado en cada consulta.
  ubicacion_id uuid not null references retail.ubicaciones(id),
  ubicacion_origen_id uuid not null references retail.ubicaciones(id),
  cantidad integer not null check (cantidad > 0),
  estado text not null default 'por_revisar'
    check (estado in ('por_revisar', 'salio_del_origen', 'encontrada', 'error_de_conteo')),
  creado_en timestamptz not null default now(),
  creado_por uuid references public.personas(id),
  revisado_en timestamptz,
  revisado_por uuid references public.personas(id),
  nota_revision text check (nota_revision is null or length(nota_revision) <= 200),
  -- Los movimientos que cumplen la decisión: la salida del origen y la entrada al destino.
  movimiento_salida_id uuid references retail.movimientos(id),
  movimiento_entrada_id uuid references retail.movimientos(id),
  unique (transferencia_id, variante_id),
  constraint traslado_sobrantes_revision_coherente check (
       (estado = 'por_revisar'      and revisado_en is null     and movimiento_salida_id is null     and movimiento_entrada_id is null)
    or (estado = 'salio_del_origen' and revisado_en is not null and movimiento_salida_id is not null and movimiento_entrada_id is not null)
    or (estado = 'encontrada'       and revisado_en is not null and movimiento_salida_id is null     and movimiento_entrada_id is not null)
    or (estado = 'error_de_conteo'  and revisado_en is not null and movimiento_salida_id is null     and movimiento_entrada_id is null)
  )
);

comment on table retail.traslado_sobrantes is
  'Lo contado de más al recibir un traslado (ADR-0404): no entra al stock hasta que un líder lo revisa (salió del origen, encontrada o error de conteo).';

-- La lista de «por revisar» de una sede (Traslados la pide en cada carga).
create index if not exists traslado_sobrantes_por_revisar on retail.traslado_sobrantes (ubicacion_id) where estado = 'por_revisar';
create index if not exists traslado_sobrantes_transferencia on retail.traslado_sobrantes (transferencia_id);

alter table retail.traslado_sobrantes enable row level security;
revoke all on table retail.traslado_sobrantes from anon, authenticated;
