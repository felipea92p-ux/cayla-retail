-- ============================================================================
-- 20261002120000_bajada_y_ajuste_dentro_de_existencias.sql — CAYLA V2 · ADR-0306
-- «Bajada al piso» y «Ajustar stock» dejan de ser módulos: son funciones de Existencias.
--
-- EL PROBLEMA PRIMERO. El 2026-10-02 el «Terminal de ventas» tenía Existencias, Conteos y Traslados pero «Reponer» no le
-- funcionaba: ADR-0208/0240 hicieron que reponer, subir y retirar pidieran el módulo «Bajada al piso», y ADR-0250 que
-- ajustar pidiera «Ajustar stock». Ninguno de los dos tiene pantalla en el menú; ambos nacieron SIN rol. Resultado: la
-- tienda bajaba prendas del almacén al piso sin registrarlo, el piso no sumaba y Vender no las dejaba vender.
--
-- LA REGLA (Felipe, 2026-10-02; CLAUDE.md «Módulos y roles»): (1) un módulo de Roles y accesos es una entrada del menú
-- izquierdo; lo que vive dentro de una pantalla es una función de ese módulo, no otro módulo; (2) quien ve un módulo hace
-- TODO lo que hay dentro, salvo lo «solo del líder» (`fn_es_lider()`).
--
-- QUÉ HACE.
--   · `bajar_al_piso`, `mover_entre_piso_y_almacen` y `retirar_del_piso` piden `fn_ve_modulo('existencias')`.
--   · `fn_puede_ajustar_stock()` vuelve a «líder, o Existencias / Conteos / Traslados» (lo que era antes de ADR-0250; es lo
--     mismo que `fn_puede_ajustar_inventario()`). Sus tres llamadores (`registrar_movimiento`, `ajustar_inventario`,
--     `registrar_hallazgo_de_conteo`) no cambian, salvo el texto del error, que ya no manda a un módulo que no existe.
--   · Retira del catálogo los módulos `bajada_piso` y `ajustar_stock`. Producción (consultada 2026-10-02): 3 asignaciones
--     de rol (Integrante: bajada_piso; Terminal Almacén: bajada_piso y ajustar_stock) y TODOS esos roles ya tienen
--     Existencias, así que nadie pierde nada; `actividad`, `lider_modulos_ocultos` y `roles.pantalla_principal` no los
--     nombran. Las asignaciones son configuración de roles, no historia: `movimientos` y `bajada_piso_items` no se tocan.
--
-- ESTADO QUE DEJA DE SER POSIBLE: una cuenta que ve Existencias y no puede reponer, subir, retirar ni ajustar.
--
-- POR QUÉ SE REEMPLAZA POR ANCLA. Las tres funciones de bajada viven en producción con parches en vivo; reescribirlas desde
-- un archivo los borraría. `pg_temp.reemplazar_unico` cambia un texto que debe aparecer UNA sola vez y aborta si no
-- (re-pegable: si el texto nuevo ya está, no hace nada). Sin `select … into` dentro de textos entre comillas (ADR-0288).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (ya trae `retail.`), DESPUÉS de publicar la web de este PR (si no,
-- el menú aún pregunta por los módulos viejos). Sin políticas ni `alter` de tablas: ADR-0195 no aplica. Idempotente.
--
-- SE ROMPE SI alguien vuelve a pegar 20260926000200, 20260927180000, 20261001150000 o 20260928130000 (recrean las
-- funciones desde el archivo y devuelven el candado «Bajada al piso» / «Ajustar stock»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar_unico(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_viejo in v_def) = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Bajar, mover entre piso y almacén y retirar del piso: el candado es Existencias.
select pg_temp.reemplazar_unico(
  'retail.bajar_al_piso(uuid, jsonb, uuid)',
  $v$if not fn_ve_modulo('bajada_piso') then
    raise exception 'No puedes bajar prendas al piso: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.'$v$,
  $n$if not fn_ve_modulo('existencias') then
    raise exception 'No puedes bajar prendas al piso: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'$n$
);

select pg_temp.reemplazar_unico(
  'retail.mover_entre_piso_y_almacen(uuid, uuid, integer, uuid, uuid, text, uuid)',
  $v$if not fn_ve_modulo('bajada_piso') then
    raise exception 'No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.'$v$,
  $n$if not fn_ve_modulo('existencias') then
    raise exception 'No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'$n$
);

select pg_temp.reemplazar_unico(
  'retail.retirar_del_piso(uuid, jsonb, text, uuid)',
  $v$if not fn_ve_modulo('bajada_piso') then
    raise exception 'No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.'$v$,
  $n$if not fn_ve_modulo('existencias') then
    raise exception 'No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'$n$
);

-- 2. Ajustar stock: líder, o quien ve Existencias, Conteos o Traslados (como antes de ADR-0250).
create or replace function retail.fn_puede_ajustar_stock() returns boolean
language sql stable
set search_path to retail, public, extensions
as $function$
  select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['existencias', 'conteos', 'traslados']);
$function$;

comment on function retail.fn_puede_ajustar_stock() is
  'ADR-0306: líder, o su rol ve Existencias, Conteos o Traslados. Ajustar stock es una función de esos módulos, no un módulo (ADR-0250 queda reemplazado en esto). La usan registrar_movimiento (candado real), ajustar_inventario (falla rápido) y registrar_hallazgo_de_conteo.';

revoke all on function retail.fn_puede_ajustar_stock() from public, anon;
grant execute on function retail.fn_puede_ajustar_stock() to authenticated;

-- El texto del error ya no manda a un módulo que no existe (el hint `ajuste_sin_modulo` no cambia).
select pg_temp.reemplazar_unico(
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  $v$'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste'$v$,
  $n$'Tu rol no puede ajustar stock — pídele a una líder de tu sede que lo ajuste'$n$
);
select pg_temp.reemplazar_unico(
  'retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)',
  $v$'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste'$v$,
  $n$'Tu rol no puede ajustar stock — pídele a una líder de tu sede que lo ajuste'$n$
);
select pg_temp.reemplazar_unico(
  'retail.registrar_hallazgo_de_conteo(uuid, uuid, uuid, integer, uuid, text)',
  $v$'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste'$v$,
  $n$'Tu rol no puede ajustar stock — pídele a una líder de tu sede que lo ajuste'$n$
);

-- 3. Fuera del catálogo y de los roles: bajada_piso y ajustar_stock ya no son módulos.
delete from retail.rol_modulos where modulo in ('bajada_piso', 'ajustar_stock');
delete from retail.modulos where clave in ('bajada_piso', 'ajustar_stock');

-- Existencias dice lo que incluye (el texto de Roles y accesos).
update retail.modulos
   set incluye = 'Consultar stock, reponer el piso (bajar del almacén, subir y retirar), apartar prendas y ajustar stock'
 where clave = 'existencias';

notify pgrst, 'reload schema';
