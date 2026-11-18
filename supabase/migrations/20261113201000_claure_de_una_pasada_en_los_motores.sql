-- ============================================================================
-- 20261113201000 — CLAURE se pregunta de una pasada en el plan del piso y el plan de compra (ADR-0658, cambiar-de-modulo#13)
--
-- EL PROBLEMA PRIMERO. Cambiar al plan del piso tarda ~0,9 s de media en producción (hasta 2,8 s) y el plan de compra ~2,3 s
-- (pg_stat_statements, 2026-11-13). Las dos preguntan `fn_item_es_de_claure` UNA VEZ POR LÍNEA de venta, en todas las sedes,
-- aunque solo una sede vende de CLAURE. Esa función es `security definer` con `set search_path`: no se pliega en la consulta y
-- cada llamada busca el dueño de la línea en `movimientos`. El plan de compra lo hace en tres ventanas (90 días, 30 días y la
-- campaña) sobre toda la red.
--
-- LO QUE HACE.
--   1. `fn_lineas_de_claure(desde, hasta, sede)`: las líneas de CLAURE de una ventana, de una pasada. Junta primero SOLO las
--      líneas de las sedes donde opera CLAURE desde el arranque de su cuenta y a esas les pregunta el dueño con
--      `fn_dueno_de_la_linea`, la misma de siempre. Es la regla de `fn_item_es_de_claure` escrita para muchas líneas a la vez:
--      `pnpm pruebas:lineas-de-claure` exige que las dos digan lo mismo línea por línea (sedes con y sin CLAURE, antes y después
--      del arranque, una línea de CLAURE en una sede de CAYLA, devoluciones, cambios y prendas regularizadas). Si una cambia, la
--      otra también.
--   2. Los dos motores cambian `and not retail.fn_item_es_de_claure(vi.id, …)` por `and vi.id not in (select … fn_lineas_de_claure(…))`
--      con su misma ventana: 1 reemplazo anclado en `fn_piso_plan_lectura` y 6 en `fn_plan_compra`. Nada más cambia.
--
-- MEDIDO (copia de main con el año sintético de `pnpm carga:preparar` y una sede ligada a CLAURE, como líder, mediana de 5–7
-- corridas intercaladas; la máquina estaba cargada por otras sesiones, así que vale la proporción):
--   fn_plan_compra(null)                      1.378–1.436 ms → 271–311 ms
--   fn_piso_plan_lectura, sede de CLAURE        613–658 ms → 415–458 ms
--   fn_piso_plan_lectura, sede sin CLAURE       429–458 ms → igual (ya no pregunta nada)
--   el ayudante, 90 días de toda la red          37.000 bloques, 26–31 ms
--
-- IDÉNTICO. md5 de la salida de las dos funciones, nueva contra vieja, en las 7 sedes de la copia (piso) y con la campaña de la
-- copia (plan de compra): coinciden. Ver ADR-0658 «Cómo se comprobó».
--
-- CANDADO. Corre primero: el md5 del cuerpo vivo de cada función tiene que ser el de main o el de este archivo; si no, aborta
-- todo diciendo cuál (alguien la parchó en vivo o una migración de otra rama la tocó después). Además cada reemplazo es anclado:
-- si su texto no está exactamente una vez, aborta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Una función nueva y dos `create or replace` (por los reemplazos): sin tablas,
-- sin políticas, sin disparadores; no toma ninguna tabla de la tienda. Idempotente: se puede pegar dos veces. Termina con «QUEDÓ BIEN».
-- PARA VOLVER ATRÁS: `scripts/pruebas/_deshacer_claure.mjs` (`sqlDeshacer`) arma el SQL que aplica estos reemplazos al revés.
-- SE ROMPE SI: `fn_item_es_de_claure` cambia su regla de sede o de fecha y nadie cambia el ayudante (lo ataja la prueba).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ============================== CANDADO (corre primero) ==============================
do $candado$
declare r record; v_md5 text;
begin
  for r in select * from (values
    ('retail.fn_piso_plan_lectura(uuid)', 'e573216a8ea3c47ee8fabd97d5c46619', '9d9c96979c6a92f2b34f57e3563ffc66'),
    ('retail.fn_plan_compra(uuid)', 'ff74d5a95a47e6858862666261812198', 'b43d6631b4b0ff469ddf371d498772d2')
  ) as t(firma, md5_main, md5_nuevo) loop
    v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is null then
      raise exception 'Falta %: esta migración no la crea, solo la parcha.', r.firma;
    end if;
    if v_md5 not in (r.md5_main, r.md5_nuevo) then
      raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main ni el de este archivo. Regenera los reemplazos desde su definición real antes de pegar.', r.firma, v_md5;
    end if;
  end loop;
end
$candado$;

-- ---------- 1. Las líneas de CLAURE de una ventana, de una pasada ----------
create or replace function retail.fn_lineas_de_claure(p_desde timestamptz, p_hasta timestamptz default 'infinity', p_ubicacion_id uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- ADR-0658. La regla de `fn_item_es_de_claure` (ADR-0560/0583) para muchas líneas a la vez: una línea es de CLAURE si su venta es
  -- de una sede donde opera CLAURE (activa, con cuenta desde una fecha), desde ese día de Lima, y su dueño es CLAURE. Las dos
  -- primeras condiciones se piden aquí de una pasada; el dueño se le pregunta a `fn_dueno_de_la_linea` solo a las líneas que
  -- quedan. `materialized`: sin él, el planificador busca el dueño de TODAS las líneas de la base antes de filtrar (2,2 millones
  -- de bloques medidos). Si cambia la regla de `fn_item_es_de_claure`, cambia esta: `pnpm pruebas:lineas-de-claure` las compara.
  with candidatas as materialized (
    select vi.id, e.id as claure_id
      from retail.empresas e
      join retail.empresa_sedes es on es.empresa_id = e.id
      join retail.ventas v on v.ubicacion_id = es.ubicacion_id
                          and v.created_at >= greatest(coalesce(p_desde, '-infinity'), (e.cuenta_corriente_desde::timestamp at time zone 'America/Lima'))
                          and v.created_at < coalesce(p_hasta, 'infinity')
      join retail.venta_items vi on vi.venta_id = v.id
     where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
       and (p_ubicacion_id is null or es.ubicacion_id = p_ubicacion_id)
  )
  select c.id from candidatas c where retail.fn_dueno_de_la_linea(c.id) = c.claure_id
$$;
comment on function retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid) is
  'ADR-0658: las líneas de venta de CLAURE de una ventana (y de una sede, si se pide), de una pasada. La misma regla que fn_item_es_de_claure; la usan los motores que leen muchas líneas.';
revoke all on function retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Reemplazo anclado: el texto viejo tiene que estar exactamente las veces dichas; si el nuevo ya está, no hace nada.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 2. Plan del piso: lo que se llevó el cliente, solo de CAYLA (una pregunta por sede, no una por línea) ----------
select pg_temp.reemplazar('retail.fn_piso_plan_lectura(uuid)',
$v$        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
        -- ADR-0560 (6d): lo vendido de CLAURE no es demanda de CAYLA.
        and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)$v$,
$n$        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
        -- ADR-0560 (6d): lo vendido de CLAURE no es demanda de CAYLA. ADR-0658: la misma regla que `fn_item_es_de_claure`, preguntada de
        -- una pasada: solo las líneas de esta sede, si es de CLAURE y desde su arranque, buscan su dueño (antes, cada línea, en toda sede).
        and vi.id not in (select l from retail.fn_lineas_de_claure(v_desde_ts, 'infinity', p_ubicacion_id) l)$n$,
1);

-- ---------- 3. Plan de compra · 8a. La curva de tallas (90 días) ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and vi.variante_id <> c_centinela and v.created_at >= v_curva_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
                      union all$v$,
$n$                         and vi.variante_id <> c_centinela and v.created_at >= v_curva_desde and v.created_at < now()
                         and vi.id not in (select l from retail.fn_lineas_de_claure(v_curva_desde, now()) l)
                      union all$n$,
1);

-- ---------- 3. Plan de compra · 8b. La curva, lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_curva_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) z$v$,
$n$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_curva_desde and v.created_at < now()
                         and vi.id not in (select l from retail.fn_lineas_de_claure(v_curva_desde, now()) l)) z$n$,
1);

-- ---------- 3. Plan de compra · 8c. Lo vendido dentro de las fechas de la campaña ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
                      union all$v$,
$n$                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                         and vi.id not in (select l from retail.fn_lineas_de_claure(v_desde_ts, v_hasta_ts) l)
                      union all$n$,
1);

-- ---------- 3. Plan de compra · 8d. La campaña, lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.estado = 'completada' and not v.es_prueba
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) q$v$,
$n$                         and v.estado = 'completada' and not v.es_prueba
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                         and vi.id not in (select l from retail.fn_lineas_de_claure(v_desde_ts, v_hasta_ts) l)) q$n$,
1);

-- ---------- 3. Plan de compra · 8e. Lo vendido en 30 días ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and vi.variante_id <> c_centinela and v.created_at >= v_30_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
                      union all$v$,
$n$                         and vi.variante_id <> c_centinela and v.created_at >= v_30_desde and v.created_at < now()
                         and vi.id not in (select l from retail.fn_lineas_de_claure(v_30_desde, now()) l)
                      union all$n$,
1);

-- ---------- 3. Plan de compra · 8f. 30 días, lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_30_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) t$v$,
$n$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_30_desde and v.created_at < now()
                         and vi.id not in (select l from retail.fn_lineas_de_claure(v_30_desde, now()) l)) t$n$,
1);

-- ============================== COMPROBAR ==============================
do $comprobar$
declare r record; v_md5 text;
begin
  for r in select * from (values
    ('retail.fn_piso_plan_lectura(uuid)', '9d9c96979c6a92f2b34f57e3563ffc66', 1),
    ('retail.fn_plan_compra(uuid)', 'b43d6631b4b0ff469ddf371d498772d2', 6)
  ) as t(firma, md5_nuevo, veces) loop
    v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is distinct from r.md5_nuevo then
      raise exception '20261113201000: % no quedó como se esperaba (md5 %).', r.firma, v_md5;
    end if;
    if position('not retail.fn_item_es_de_claure(' in pg_get_functiondef(r.firma::regprocedure)) > 0
       or (length(pg_get_functiondef(r.firma::regprocedure)) - length(replace(pg_get_functiondef(r.firma::regprocedure), 'retail.fn_lineas_de_claure(', '')))
          / length('retail.fn_lineas_de_claure(') <> r.veces then
      raise exception '20261113201000: % no quedó preguntando CLAURE de una pasada.', r.firma;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid)', 'execute') then
    raise exception '20261113201000: fn_lineas_de_claure no debe poder llamarse desde la web.';
  end if;
end
$comprobar$;

reset lock_timeout;

select '20261113201000 · QUEDÓ BIEN: el plan del piso y el plan de compra preguntan CLAURE de una pasada' as resultado;
