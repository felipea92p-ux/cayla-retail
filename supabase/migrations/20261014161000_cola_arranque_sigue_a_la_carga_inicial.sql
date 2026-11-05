-- ============================================================================
-- 20261014161000_cola_arranque_sigue_a_la_carga_inicial.sql — CAYLA V2 (ADR-0334, act. 2026-10-14; Felipe 2026-10-14)
-- El plazo para cerrar la cola de arranque de una sede es la fecha de cierre de su carga inicial. Una sola fecha por sede.
--
-- EL PROBLEMA. 20261005100000 sembró el 15-oct como plazo en las tres tiendas y dejó escrito: «ADR-0328 prevé una fecha de cierre
-- de la carga inicial por sede; cuando se construya, esta tabla se une a ella». La fecha se construyó el mismo día
-- (20261004210000, `ubicaciones.carga_inicial_hasta`) y nunca se unieron. Al 2026-10-14 (solo lectura en producción) la carga
-- inicial sigue abierta hasta el 18-oct (TRU), el 21-oct (AQP) y el 31-oct (LIM), pero `cola_arranque_plazo.hasta` dice 15-oct en
-- las tres: desde el 16 un líder ya no podría cerrar en bloque las ventas sin registrar de una prenda que todavía no se cargó —la
-- razón de ser de esa salida— mientras la tienda sigue cargando. Dos fechas para una sola cosa: hasta cuándo dura el arranque.
--
-- LA DECISIÓN (Felipe, 2026-10-14, auditoría del ERP): el plazo de la cola SIGUE a la fecha de carga inicial. La fija
-- `fijar_cierre_carga_inicial` (el líder la aprieta, solo un Admin la afloja; ADR-0328) y la cola la toma de ahí.
--
-- QUÉ HACE.
--   1. `fijar_cierre_carga_inicial`: al escribir una fecha deja la misma en `cola_arranque_plazo` (alta o cambio). Quitar la
--      fecha (carga abierta sin tope, solo Admin) NO toca el plazo: la tabla exige una fecha, y una cola «sin tope» sería una
--      salida de emergencia que nunca vence, que no es lo decidido. Por reemplazo anclado: la función vive en producción (misma
--      definición que el repo, md5 verificado el 2026-10-14) y así no se pisa un parche vivo.
--   2. Una vez: toda sede activa con fecha de carga inicial queda con ese plazo (TRU 18-oct, AQP 21-oct, LIM 31-oct); una sede
--      con fecha y sin fila de plazo la recibe. Idempotente: la segunda pegada no cambia nada.
--
-- ESTADO QUE DEJA DE SER POSIBLE: una sede con la carga inicial abierta y la cola de arranque ya sin salida (o al revés).
--
-- DESCARTÉ: que `cerrar_cola_arranque` y la web leyeran `ubicaciones.carga_inicial_hasta` y retirar la tabla. Cambia una función
-- con 53 casos de prueba y la lectura de la pantalla para ganar lo mismo, y deja sin plazo a una sede sin fecha de carga (una
-- tienda nueva nacería sin salida). Quedan las dos tablas y UNA sola puerta que escribe la fecha.
--
-- PRODUCCIÓN: solo el reemplazo de una función y un `insert … on conflict` sobre una tabla que nadie toma; sin políticas ni
-- `drop trigger` (CLAUDE.md, «Políticas y deadlocks»). Ya lleva `retail.`. Se puede pegar dos veces. La firma no cambia: no hace
-- falta recargar PostgREST.
-- SE ROMPE SI: alguien vuelve a pegar 20261004210100 (recrea `fijar_cierre_carga_inicial` desde el archivo, sin el enlace). La
--   prueba `cierre_carga_inicial.mjs` (caso 6c) pega las cuatro migraciones dos veces, en orden, y comprueba que el enlace queda.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Reemplazo anclado (el mismo helper de 20261010233000) ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo de abajo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Al fijar la fecha, el plazo de la cola la sigue ----------
-- Sin `select … into` dentro del texto entre comillas (ADR-0288): un `insert … on conflict`.
select pg_temp.reemplazar_anclado(
  'retail.fijar_cierre_carga_inicial(uuid, date)',
  $v$  update retail.ubicaciones set carga_inicial_hasta = p_fecha where id = p_ubicacion_id;
$v$,
  $n$  update retail.ubicaciones set carga_inicial_hasta = p_fecha where id = p_ubicacion_id;
  -- ADR-0334 (act. 2026-10-14): el plazo para cerrar la cola de arranque es esta misma fecha. Sin fecha, el plazo queda como estaba.
  if p_fecha is not null then
    insert into retail.cola_arranque_plazo (ubicacion_id, hasta)
      values (p_ubicacion_id, p_fecha)
    on conflict (ubicacion_id) do update set hasta = excluded.hasta, fijado_en = now();
  end if;
$n$
);

-- ---------- 2. Hoy: toda sede con fecha de carga inicial queda con ese plazo ----------
insert into retail.cola_arranque_plazo as p (ubicacion_id, hasta)
  select u.id, u.carga_inicial_hasta
    from retail.ubicaciones u
   where u.activo and u.carga_inicial_hasta is not null
on conflict (ubicacion_id) do update
  set hasta = excluded.hasta, fijado_en = now()
  where p.hasta is distinct from excluded.hasta;

comment on table retail.cola_arranque_plazo is
  'ADR-0334: último día (hora de Lima) en que una sede puede cerrar su cola de arranque de ventas sin registrar. Sin fila, no se puede. Desde 20261014161000 sigue a ubicaciones.carga_inicial_hasta: la escribe fijar_cierre_carga_inicial.';

-- ---------- 3. Validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if position('ADR-0334 (act. 2026-10-14)' in pg_get_functiondef('retail.fijar_cierre_carga_inicial(uuid, date)'::regprocedure)) = 0 then
    raise exception 'cola de arranque: fijar_cierre_carga_inicial no quedó enlazada al plazo';
  end if;
  if exists (
    select 1
      from retail.ubicaciones u
      left join retail.cola_arranque_plazo p on p.ubicacion_id = u.id
     where u.activo and u.carga_inicial_hasta is not null and p.hasta is distinct from u.carga_inicial_hasta
  ) then
    raise exception 'cola de arranque: una sede con fecha de carga inicial quedó con otro plazo';
  end if;
end
$v$;

reset lock_timeout;
