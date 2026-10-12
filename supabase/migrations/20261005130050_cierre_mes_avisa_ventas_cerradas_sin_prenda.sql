-- ============================================================================
-- 20261005130050_cierre_mes_avisa_ventas_cerradas_sin_prenda.sql — CAYLA V2 (ADR-0337, Felipe 2026-10-04)
-- Finanzas ▸ Cierre de mes: las ventas «cerradas sin prenda» (ADR-0334) aparecen como un AVISO que no bloquea.
--
-- EL PROBLEMA PRIMERO. Un líder puede dar por hechas, en bloque, las ventas sin registrar que ya no se pueden identificar
-- (ADR-0334, estado `cerrada_sin_prenda`). Esas ventas conservan su línea en la variante «Cargo especial» con costo 0: el
-- ingreso es real, el costo NO existe, y el margen del mes sale inflado en esa parte. El cierre de mes no lo decía:
--   · el chequeo `regularizar` solo cuenta las `pendiente` (y BLOQUEA el cierre mientras haya una);
--   · el chequeo `sin_costo` excluye a propósito la variante «Cargo especial» (`vi.variante_id <> c_cargo_especial`),
--     porque hasta hoy esas líneas eran siempre pendientes y ya las frenaba `regularizar`.
-- Resultado: cerrar la cola de arranque convertía un bloqueo en silencio. Medido en producción el 2026-10-04: septiembre
-- tiene 31 ventas sin registrar (AQP 26 por S/ 1,170.80; TRU 5 por S/ 370.60) que hoy bloquean el cierre de septiembre; si
-- el líder cierra la cola antes, septiembre se cerraría y se congelaría (con huella) con ese margen inflado sin que nadie
-- lo supiera.
--
-- LA DECISIÓN (Felipe, 2026-10-04, opción A de tres): un chequeo propio, `cerrada_sin_prenda`, que AVISA y no bloquea.
--   DECIDÍ: «N ventas (S/ X) cerradas sin prenda: su costo es desconocido». Va en `periodo_cierres.avisos` al cerrar, así el
--           mes congelado dice lo que no sabía. Es un chequeo aparte de `sin_costo` porque tienen CURA distinta: a un costo
--           faltante se le carga el costo; una venta cerrada sin prenda no tiene cura (la prenda ya no se puede identificar).
--   DESCARTÉ: (B) bloquear el cierre: un mes con cola cerrada no se podría cerrar jamás (la prenda no se puede identificar y
--           regularizar después choca con el candado del mes cerrado) y deshace en la práctica lo que ADR-0334 permite.
--           (C) estimar un costo por categoría: inventa un número que parece real y queda congelado con huella en el diario;
--           ADR-0334 (decisión 7) ya lo descartó y el principio es «dinero exacto».
--   SE ROMPE SI: un líder cierra un mes leyendo solo los números y no el aviso: el margen queda inflado a sabiendas pero
--           sin que él lo supiera (el aviso es visible en la pantalla y en el modal «Cierras con un aviso», no es un candado).
--
-- QUÉ TOCA (solo la función, ninguna tabla ni política):
--   `retail.fn_cierre_mes_estado(date)`: una CTE nueva `cs` (las cerradas sin prenda del mes, por sede) y una fila nueva en
--   los chequeos (`cerrada_sin_prenda`, orden 8, `ok = false`, `bloquea = false`). `diario` pasa de orden 8 a 9 y `huella` de
--   9 a 10 (solo cambia el orden en que se muestran). `cerrar_periodo` y `fn_cierre_panel` no cambian: el aviso entra solo en
--   `v_avisos` porque no bloquea y no es `huella`.
--
-- POR QUÉ SE PARCHA Y NO SE REESCRIBE. La versión VIVA de `fn_cierre_mes_estado` no es la del archivo 20260925180000:
-- `20260928220000_finanzas_modulos_delegables.sql` le cambió la puerta (`fn_es_lider()` → `fn_puede_cerrar_mes()`) editando su
-- definición viva. Copiarla desde el archivo borraría esa delegación. Se insertan solo los bloques de ADR-0337, cada ancla
-- debe aparecer EXACTAMENTE una vez o se aborta todo (verificado en producción el 2026-10-04, sin escrituras).
--
-- INDEPENDIENTE DE ADR-0334. Compara `r.estado = 'cerrada_sin_prenda'` como TEXTO: antes de que se pegue la cola de arranque
-- no hay filas así y el chequeo no aparece; después aparece solo. Se puede pegar antes o después de las cinco migraciones
-- `20261005100000`–`20261005120000`.
--
-- PRODUCCIÓN: UNA sola ejecución en el SQL Editor, con el OK de Felipe. No toca tablas, índices ni políticas (nada que tome
-- candados exclusivos; CLAUDE.md «Políticas y deadlocks»). Ya lleva `retail.`. Re-ejecutable: cada reemplazo se salta si su
-- texto nuevo ya está. Ningún texto entre comillas lleva una lectura con destino a variable (CLAUDE.md, «El SQL Editor
-- agrega líneas por su cuenta»): el texto que se inserta en la función es solo CTE y filas de chequeo.
--
-- RENOMBRADA el 2026-10-04 desde `20261005130000_cierre_mes_avisa_ventas_cerradas_sin_prenda.sql`: esa versión la usa
-- `20261005130000_pedidos_que_no_se_pierden_parte1_tablas.sql` (PR #799) y Supabase toma el prefijo como llave del historial.
-- Esta migración YA corrió en producción (2026-10-04, pegada en el SQL Editor, verificada por efectos): pegar ahí no registra
-- versiones, así que el nombre del archivo no está en ningún historial y renombrarlo es seguro. Y el ADR era 0335 y pasó a
-- 0337 (0335 lo tomó «Activos ya lo teníamos», #802): donde este archivo dice ADR-0337 antes decía ADR-0335.
-- OJO, a propósito: el comentario «(ADR-0335)» del bloque 1 (el de la CTE `cs`) va DENTRO del texto que se
-- inserta en la función viva y se dejó igual. Léelo como ADR-0337. Cambiarlo rompería la re-ejecución: el reemplazo
-- mira primero si su texto nuevo ya está y lo compara byte a byte; con una letra distinta no lo reconocería, volvería a
-- insertar `cs` y la función quedaría con la CTE duplicada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Cambia `p_viejo` por `p_nuevo` en la única función `retail.<p_nombre>`. Si `p_nuevo` ya está, no hace nada (se aplicó antes);
-- si no, `p_viejo` debe aparecer exactamente una vez, o se aborta sin tocar nada. OJO: se mira primero `p_nuevo`, porque el
-- texto nuevo de la CTE `cs` CONTIENE a su ancla (`pm as (`): al revés se duplicaría al re-ejecutar.
create function pg_temp.reemplazar_cierre_sc(p_nombre text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $$
declare
  v_oids oid[];
  v_def text;
  v_veces int;
begin
  select array_agg(p.oid) into v_oids from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = p_nombre;
  if coalesce(cardinality(v_oids), 0) <> 1 then
    raise exception 'ADR-0337: se esperaba una sola función retail.% y hay %', p_nombre, coalesce(cardinality(v_oids), 0);
  end if;
  v_def := pg_get_functiondef(v_oids[1]);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception 'ADR-0337: retail.% trae % veces el ancla «%» (se esperaba 1): la base no es la que se revisó, no se toca nada',
      p_nombre, v_veces, left(p_viejo, 60);
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- 1. La CTE `cs`: las ventas sin registrar que un líder cerró sin prenda, del mes y por sede. Solo las que siguen vivas: una
--    venta anulada (su fila pasa a `anulada`) o marcada de prueba no cuenta. Mismo mes que usa el diario (`v.created_at`).
select pg_temp.reemplazar_cierre_sc(
  'fn_cierre_mes_estado',
  E'  pm as (\n    select p.ubicacion_id as uid,\n',
  $n$  -- Ventas sin registrar que un líder dio por hechas sin identificar la prenda (ADR-0334): su línea sigue en «Cargo especial»
  -- con costo 0, así que el ingreso es real y el costo no existe (ADR-0335). Avisa; no bloquea.
  cs as (
    select r.ubicacion_id as uid, count(*) as n, sum(r.precio_cobrado) as monto
      from retail.prendas_por_regularizar r
      join retail.venta_items vi on vi.id = r.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
     where r.estado = 'cerrada_sin_prenda'
       and v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and v.created_at >= v_ini_ts and v.created_at < v_fin_ts
     group by r.ubicacion_id
  ),
  pm as (
    select p.ubicacion_id as uid,
$n$);

-- 2. El chequeo, justo después de `sin_costo`. `diario` pasa de orden 8 a 9 (en el mismo reemplazo, para que no queden dos con 8).
select pg_temp.reemplazar_cierre_sc(
  'fn_cierre_mes_estado',
  E'    select uni.alc, uni.uid, 8, ''diario'', coalesce(dz.n, 0) = 0, true,\n',
  $n$    select uni.alc, uni.uid, 8, 'cerrada_sin_prenda', false, false, jsonb_build_object('n', cs.n, 'monto', cs.monto)
      from uni join cs on cs.uid = uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 9, 'diario', coalesce(dz.n, 0) = 0, true,
$n$);

-- 3. `huella` pasa de orden 9 a 10.
select pg_temp.reemplazar_cierre_sc(
  'fn_cierre_mes_estado',
  E'    select uni.alc, uni.uid, 9, ''huella'', hv.h = (per.cie ->> ''huella''), false,',
  E'    select uni.alc, uni.uid, 10, ''huella'', hv.h = (per.cie ->> ''huella''), false,');

drop function pg_temp.reemplazar_cierre_sc(text, text, text);

-- 4. Validación final: si algo no quedó, se deshace todo.
do $v$
declare v_def text := pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure);
begin
  if position('''cerrada_sin_prenda''' in v_def) = 0 or position('  cs as (' in v_def) = 0 then
    raise exception 'ADR-0337: fn_cierre_mes_estado no quedó con el chequeo cerrada_sin_prenda';
  end if;
  -- El parche de la delegación (ADR-0253) tiene que seguir en pie: no se recreó la función desde el archivo.
  if position('fn_puede_cerrar_mes' in v_def) = 0 then
    raise exception 'ADR-0337: fn_cierre_mes_estado perdió la puerta fn_puede_cerrar_mes (ADR-0253)';
  end if;
  -- Los órdenes del chequeo no se repiten: sin_costo 7, cerrada_sin_prenda 8, diario 9, huella 10.
  if position('uni.uid, 10, ''huella''' in v_def) = 0 or position('uni.uid, 9, ''diario''' in v_def) = 0 then
    raise exception 'ADR-0337: el orden de diario y huella no quedó';
  end if;
end
$v$;
