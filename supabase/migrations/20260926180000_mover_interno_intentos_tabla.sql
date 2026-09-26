-- ============================================================================
-- 20260926180000_mover_interno_intentos_tabla.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · marca de mover_interno
-- PARTE 1 de 2 (la tabla). La PARTE 2 es 20260926180100_mover_interno_con_marca.sql.
--
-- EL PROBLEMA PRIMERO. «Reponer» y «Retirar del piso» (Existencias) llaman a `mover_interno`, que no tenía marca contra
-- el doble envío. Si la conexión se corta DESPUÉS de que la base guardó y antes de que llegue la respuesta, la
-- colaboradora no sabe si se guardó; si vuelve a confirmar, la prenda se mueve dos veces: el piso queda con menos (o
-- más) de lo que hay colgado, la caja deja de cobrar una prenda que sí está a la vista y Frescura cuenta una bajada o
-- un retiro que no pasó. `bajar_al_piso` (bloque 1) ya tenía su marca; esta es la de los otros dos caminos.
--
-- QUÉ HACE. Crea `retail.movimientos_internos_intentos`: una fila por marca usada, con el movimiento que produjo y la
-- huella de los datos. La lee y la escribe SOLO `mover_interno` (security definer): RLS encendido sin políticas y sin
-- privilegios para nadie de afuera. Las filas no se editan, no se borran ni se vacían (como `movimientos`).
--
-- ESTADOS QUE DEJAN DE SER POSIBLES: una marca que produjo dos movimientos (PK = la marca); un movimiento citado por
-- dos marcas (unique); una marca sin movimiento (not null + FK).
--
-- ORDEN AL PEGAR: esta (180000) → 20260926180100 → recién entonces fusionar/publicar la web que manda `p_token`.
-- Si la web sale antes, «Reponer» y «Retirar» mandarían un parámetro que la base todavía no acepta y fallarían.
-- La FK hacia `movimientos` toma un candado breve sobre esa tabla: pegar fuera de hora pico (lock_timeout 3 s: si no
-- lo consigue, falla sin daño y se vuelve a pegar). Sin políticas ni `drop trigger` (ADR-0195). Re-ejecutable.
--
-- SE ROMPE SI alguien escribe en esta tabla por fuera de `mover_interno` (nadie más tiene privilegios), o si se borra
-- un movimiento citado aquí (imposible: `movimientos` es de solo agregar).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.movimientos_internos_intentos (
  token_cliente uuid primary key,
  movimiento_id uuid not null unique references retail.movimientos (id),
  huella text not null check (length(huella) = 32),
  created_at timestamptz not null default now()
);

comment on table retail.movimientos_internos_intentos is
  'ADR-0208: la marca de cada intento de mover_interno («Reponer», «Retirar del piso»). El reintento con la misma marca y los mismos datos devuelve el mismo movimiento sin mover nada. Solo la escribe mover_interno.';
comment on column retail.movimientos_internos_intentos.token_cliente is 'La marca que generó la pantalla para ese intento.';
comment on column retail.movimientos_internos_intentos.movimiento_id is 'El movimiento que produjo ese intento.';
comment on column retail.movimientos_internos_intentos.huella is 'md5 de tienda, prenda, cantidad, origen, destino y nota: con otros datos, la marca no se reutiliza.';

create or replace function retail.fn_intento_interno_es_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'La marca de un movimiento interno no se edita ni se borra.';
end;
$fn$;

create or replace trigger movimientos_internos_intentos_inmutables
  before update or delete on retail.movimientos_internos_intentos
  for each row execute function retail.fn_intento_interno_es_inmutable();

create or replace trigger movimientos_internos_intentos_sin_truncate
  before truncate on retail.movimientos_internos_intentos
  for each statement execute function retail.fn_historial_sin_truncate();

alter table retail.movimientos_internos_intentos enable row level security;
revoke all on table retail.movimientos_internos_intentos from public, anon, authenticated;
