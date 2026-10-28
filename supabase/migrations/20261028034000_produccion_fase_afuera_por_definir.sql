-- ============================================================================
-- 20261028034000_produccion_fase_afuera_por_definir.sql — CAYLA V2 (ADR-0550, Producción · «Afuera, por definir» · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. Una fase que sale afuera (Corte, Costura…) exigía desde el primer día el proveedor Y la tarifa por prenda
-- (`produccion_fases_quien`). Quien registra una orden y todavía no sabe a quién se la va a mandar —ni a cuánto— no podía guardarla, y la
-- salida «de fábrica» era inventar un proveedor «Pendiente» con un precio cualquiera: esa tarifa se congela en la fase, y al registrar la
-- Vuelta se vuelve una deuda real con un nombre que no existe (Por pagar).
--
-- LA DECISIÓN. «Por definir» es un estado REAL de la fase, no un proveedor falso:
--   · Una fase `quien = 'servicio'` con `proveedor_id` NULO es una fase afuera por definir. No hay columna nueva: dos datos que se contradicen
--     (un indicador y un proveedor) no pueden coexistir si el segundo no existe. Estado imposible que el esquema sigue prohibiendo: un servicio
--     con tarifa y SIN proveedor (una deuda sin nombre), o con proveedor y SIN tarifa.
--   · Una fase por definir no lleva tarifa, fijo, cantidad mínima ni fecha prometida: eso es del proveedor y todavía no hay.
--   · Se pide con el mismo vocabulario de siempre: `fn_produccion_fases_normalizar` (y con ella `abrir_orden_produccion` y `cambiar_quien_fase`)
--     acepta `quien = 'por_definir'` y lo guarda como `servicio` con todo en nulo. «Cambiar quién» sigue siendo la única puerta para completarla,
--     con las mismas validaciones de siempre y solo mientras la fase no haya empezado.
--   · MIENTRAS ESTÁ POR DEFINIR NO SE OPERA: `fn_produccion_operar_fase` (la puerta de avance, Salida, Vuelta, marcar y sus anulaciones) rechaza
--     con `fase_por_definir`. Así no puede nacer una deuda ni un movimiento de prendas sin saber a quién.
--   · La actividad de apertura de la orden nombra la fase («Corte (por definir)») en vez de callarla y decir «todo en el Taller».
--
-- CONTRATO (Liskov)
--   PROMETE: una fase por definir se guarda sin proveedor ni tarifa; no se puede avanzar, mandar, recibir ni marcar hasta que tenga proveedor y
--            tarifa (o pase al Taller); nada de lo que ya existía cambia (las fases con proveedor y las del Taller validan igual que antes).
--   ASUME:   las funciones vivas tal como las dejaron 20261019192000 (`fn_produccion_fases_normalizar`) y 20261026152000 (`abrir_orden_produccion`),
--            y `fn_produccion_operar_fase` de 20261014155000. Los reemplazos son ANCLADOS: si una cambió, se detienen sin tocar nada.
--   NO HACE: no define un «proveedor genérico»; no deja operar una fase por definir; no avisa por sí sola (la pantalla dice «Falta definir quién
--            hace Corte» y su ruta lo lleva a «Definir quién»).
--
-- DESCARTÉ
--   · Un proveedor «Pendiente» en el directorio: obliga a inventar la tarifa, convierte «no sé» en una deuda con nombre y precio falsos, aparece en
--     todas las listas y no se distingue de uno real.
--   · Una columna `por_definir boolean` en `produccion_fases`: dice lo mismo que `proveedor_id is null` y puede contradecirlo.
--   · Un tercer valor de `quien` guardado: todo lo que hoy pregunta `quien = 'servicio'` (devengado, salidas, Por pagar) lo trataría como Taller sin
--     avisar; con `servicio` + proveedor nulo, un camino que olvide mirar el proveedor falla fuerte en vez de callar.
--
-- SE ROMPE SI   alguien abre una orden con todas sus fases por definir y nadie las completa: la orden queda quieta sin avisar. Por eso la ficha dice
--   «Sigue: definir quién hace …» y la fila de la fase lleva el botón «Definir quién» en primer plano.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte (un `alter` de `produccion_fases`, sin políticas; ver «Políticas y deadlocks» de CLAUDE.md). Idempotente.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El candado: un servicio dice a quién y a cuánto, o es una fase afuera por definir (sin proveedor ni nada de eso) ----------
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then case when proveedor_id is null
           then tarifa_prenda is null and fijo_orden = 0 and cantidad_minima is null and fecha_prometida is null
           else tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0)
         end
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);
comment on constraint produccion_fases_quien on retail.produccion_fases is
  'ADR-0550: el Taller no lleva proveedor ni tarifa; un servicio lleva proveedor y tarifa (o, en el ploteo, un fijo por orden); y un servicio SIN proveedor es una fase afuera «por definir»: sin tarifa, fijo, mínimo ni fecha.';

-- ---------- 2. Pedirla: `quien = 'por_definir'` se guarda como servicio sin proveedor ----------
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$if v_quien not in ('taller', 'servicio') then$v$,
  $v$if v_quien not in ('taller', 'servicio', 'por_definir') then$v$
);
-- Una fase por definir no entra al bloque que valida proveedor y tarifa (v_quien todavía es 'por_definir'); recién al armar su fila pasa a 'servicio'.
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$v_salida := v_salida || jsonb_build_object($v$,
  $v$if v_quien = 'por_definir' then
      v_quien := 'servicio';
    end if;
    v_salida := v_salida || jsonb_build_object($v$
);

-- ---------- 3. Mientras esté por definir no se opera ----------
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_operar_fase(uuid)',
  $v$return query select v_f.id, v_f.produccion_id, v_f.ubicacion_id, v_f.clave, v_f.secuencia, v_f.quien,$v$,
  $v$if v_f.quien = 'servicio' and v_f.proveedor_id is null then
    raise exception 'Falta definir quién hace «%»: elige el proveedor y su tarifa antes de seguir', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_por_definir';
  end if;
  return query select v_f.id, v_f.produccion_id, v_f.ubicacion_id, v_f.clave, v_f.secuencia, v_f.quien,$v$
);

-- ---------- 4. La actividad de apertura nombra la fase por definir en vez de decir «todo en el Taller» ----------
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$retail.fn_fase_nombre(f ->> 'clave') || ' con ' || pr.nombre$v$,
  $v$retail.fn_fase_nombre(f ->> 'clave') || coalesce(' con ' || pr.nombre, ' (por definir)')$v$
);
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$join retail.proveedores_produccion pr on pr.id = (f ->> 'proveedor_id')::uuid$v$,
  $v$left join retail.proveedores_produccion pr on pr.id = nullif(f ->> 'proveedor_id', '')::uuid$v$
);

reset lock_timeout;
