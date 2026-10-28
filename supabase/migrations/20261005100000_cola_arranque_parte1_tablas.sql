-- ============================================================================
-- 20261005100000_cola_arranque_parte1_tablas.sql — CAYLA V2 (ADR-0334, Felipe 2026-10-04)
-- «Cerrar la cola de arranque»: PARTE 1 de 3 — las tablas y el estado nuevo.
--
-- EL PROBLEMA. Durante la adopción la caja vendió prendas que todavía no estaban en el sistema (ADR-0179). Al 2026-10-04:
-- 97 en TRU y 170 en AQP, todas «pendientes». Para casi ninguna se puede decir qué prenda era: AQP tiene 13 prendas cargadas
-- y 167 de sus 170 ventas no tienen ni una candidata en stock. «Regularizar» (elegir la prenda real) no tiene salida para
-- esas, y regularizar antes de cargar es peor: crea un movimiento, y la carga inicial rechaza después cualquier prenda
-- con historia en esa tienda (`carga_con_historia`, 20260926130000).
--
-- LA DECISIÓN (Felipe: «lo doy por hecho», opción B de la conversación del 2026-10-04):
--   · un líder cierra la cola de UNA sede, una sola vez y en bloque, dentro de un plazo, con un motivo de lista cerrada;
--   · las filas pasan a `cerrada_sin_prenda`: sin prenda, sin movimiento de stock. El ingreso de la venta no cambia;
--   · el cierre queda como UN registro (`cierres_cola_arranque`): quién, cuándo, hasta qué venta, cuántas y cuántos soles.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (y por qué el esquema los impide, no el código):
--   1. Una fila cerrada con prenda o forma (`variante_id`/`forma`): cerrar es justamente no saber la prenda.
--   2. Una fila cerrada sin su cierre, o con un cierre de OTRA sede: la clave foránea compuesta (cierre_id, ubicacion_id).
--   3. Una fila pendiente o regularizada que apunte a un cierre: solo cerrada o anulada (una venta cerrada puede anularse).
--   4. Un cierre vacío (`filas > 0`) o de una sede sin plazo (la función lo exige; la tabla de plazos manda).
--
-- QUÉ TOCA. `prendas_por_regularizar` (columna `cierre_id`, estado nuevo y dos candados) — es una tabla EN USO (la escribe
-- `registrar_venta`), por eso esta parte no lleva políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»).
-- Las dos tablas nuevas nacen con RLS encendido y SIN privilegios: se leen por la política de la PARTE 3.
--
-- PRODUCCIÓN: pegar con OK de Felipe, en orden: parte 1 → 2 → 3. Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El plazo: hasta cuándo una sede puede cerrar su cola ----------
-- Sin fila = el botón no existe: la salida de emergencia nace cerrada. Felipe (2026-10-04): «todos los días vamos a empezar a
-- subir todo, máximo hasta el 15»; por eso las tres tiendas arrancan con el 15-oct. (ADR-0328 prevé una «fecha de cierre de la
-- carga inicial por sede»; cuando se construya, esta tabla se une a ella.)
create table if not exists retail.cola_arranque_plazo (
  ubicacion_id uuid primary key references retail.ubicaciones (id),
  hasta date not null,
  fijado_en timestamptz not null default now()
);
comment on table retail.cola_arranque_plazo is
  'ADR-0334: último día (hora de Lima) en que una sede puede cerrar su cola de arranque de ventas sin registrar. Sin fila, no se puede.';

insert into retail.cola_arranque_plazo (ubicacion_id, hasta)
  select u.id, date '2026-10-15' from retail.ubicaciones u where u.tipo = 'tienda' and u.activo
on conflict (ubicacion_id) do nothing;

-- ---------- 2. El cierre: un registro por decisión del líder ----------
create table if not exists retail.cierres_cola_arranque (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  -- Lo cerrado es lo vendido HASTA este instante (el que vio el líder en la hoja): una venta que entra después sigue pendiente.
  corte timestamptz not null,
  motivo text not null check (motivo in ('no_se_sabe', 'aun_no_cargada', 'ultima_unidad')),
  nota text check (nota is null or btrim(nota) <> ''),
  filas integer not null check (filas > 0),
  soles numeric(12, 2) not null check (soles > 0),
  cerrado_por uuid not null references public.personas (id),
  cerrado_en timestamptz not null default now(),
  -- Para que una fila de la cola solo pueda apuntar a un cierre DE SU MISMA SEDE (clave foránea compuesta).
  constraint cierres_cola_arranque_id_sede_key unique (id, ubicacion_id)
);
comment on table retail.cierres_cola_arranque is
  'ADR-0334: el líder cerró en bloque las ventas sin registrar de una sede sin identificar la prenda. Solo se agrega: nunca se edita ni se borra. filas y soles son lo que el líder aceptó ese día.';
comment on column retail.cierres_cola_arranque.motivo is
  'no_se_sabe = nadie recuerda cuál era · aun_no_cargada = la prenda todavía no está cargada en el sistema · ultima_unidad = se vendió la última unidad de un modelo que nadie cargó.';

-- ---------- 3. La cola: el estado nuevo y su vínculo con el cierre ----------
alter table retail.prendas_por_regularizar add column if not exists cierre_id uuid;

alter table retail.prendas_por_regularizar drop constraint if exists prendas_por_regularizar_estado_check;
alter table retail.prendas_por_regularizar add constraint prendas_por_regularizar_estado_check
  check (estado in ('pendiente', 'regularizada', 'anulada', 'cerrada_sin_prenda'));

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'prendas_por_regularizar_cierre_fk' and conrelid = 'retail.prendas_por_regularizar'::regclass) then
    alter table retail.prendas_por_regularizar add constraint prendas_por_regularizar_cierre_fk
      foreign key (cierre_id, ubicacion_id) references retail.cierres_cola_arranque (id, ubicacion_id);
  end if;
  -- Cerrada ⇔ trae su cierre y NO trae prenda. Fuera de cerrada, el cierre solo sobrevive en una venta anulada.
  if not exists (select 1 from pg_constraint where conname = 'prendas_por_regularizar_cierre_coherente' and conrelid = 'retail.prendas_por_regularizar'::regclass) then
    alter table retail.prendas_por_regularizar add constraint prendas_por_regularizar_cierre_coherente check (
      (estado = 'cerrada_sin_prenda' and cierre_id is not null and variante_id is null and forma is null)
      or (estado <> 'cerrada_sin_prenda' and (cierre_id is null or estado = 'anulada'))
    );
  end if;
end
$c$;

comment on column retail.prendas_por_regularizar.cierre_id is
  'ADR-0334: el cierre de arranque que dejó esta venta sin prenda (estado cerrada_sin_prenda, o anulada después de cerrada).';

-- ---------- 4. Privilegios: las tablas nuevas no se tocan desde el navegador ----------
alter table retail.cola_arranque_plazo enable row level security;
alter table retail.cierres_cola_arranque enable row level security;
revoke all on retail.cola_arranque_plazo from public, anon, authenticated;
revoke all on retail.cierres_cola_arranque from public, anon, authenticated;
-- La lectura (grant select + política) viene en la PARTE 3; la escritura es solo de `cerrar_cola_arranque` (security definer).

-- ---------- 5. Validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'prendas_por_regularizar' and column_name = 'cierre_id') then
    raise exception 'cola de arranque: falta la columna cierre_id';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'retail.prendas_por_regularizar'::regclass
        and conname in ('prendas_por_regularizar_estado_check', 'prendas_por_regularizar_cierre_fk', 'prendas_por_regularizar_cierre_coherente')) <> 3 then
    raise exception 'cola de arranque: faltan candados en prendas_por_regularizar';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'prendas_por_regularizar_estado_check' and conrelid = 'retail.prendas_por_regularizar'::regclass)) not like '%cerrada_sin_prenda%' then
    raise exception 'cola de arranque: el estado nuevo no quedó';
  end if;
end
$v$;
