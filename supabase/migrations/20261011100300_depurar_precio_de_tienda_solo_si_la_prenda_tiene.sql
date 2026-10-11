-- ============================================================================
-- 20261011100300_depurar_precio_de_tienda_solo_si_la_prenda_tiene.sql — CAYLA V2 (2026-10-11; ADR-0370, sigue a 20261011100000)
--
-- EL PROBLEMA (CI del PR #948, «Pruebas de RPC contra Postgres»). El disparador diferido `variantes_depurar_precio_de_tienda`
-- (20261011100000) se encolaba en CUALQUIER alta o cambio de precio/estado de `variantes`, aunque la prenda no tuviera precio de
-- tienda: la función lo descartaba recién al final. Un evento diferido pendiente hace que Postgres rechace un `alter table variantes`
-- en la misma transacción («cannot ALTER TABLE "variantes" because it has pending trigger events»). Lo pisaron dos suites
-- (corregir-variantes, talla-con-prendas) al armar sus datos, y lo pisaría una migración que toque `variantes` y después la altere
-- en el mismo pegado.
--
-- LO QUE HACE. Un disparador nuevo, igual de diferido, con `when (retail.fn_producto_tiene_precio_de_tienda(new.producto_id))`: en
-- un disparador de restricción el WHEN se evalúa AL MOMENTO y, si da falso, el evento no se encola. Solo las prendas con un precio de
-- tienda vigente (hoy 2 en producción) dejan algo pendiente. El viejo se APAGA (no se borra: `drop trigger` toma las tablas de `auth`
-- y `storage`, CLAUDE.md «Políticas y deadlocks»; y Postgres no deja reemplazar un disparador de restricción).
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, `lock_timeout = 3s`, sin políticas. Toma un candado breve de `variantes` (apagar y crear
-- un disparador). Prueba: `pnpm pruebas:precio-sede`, `pnpm pruebas:corregir-variantes`, `pnpm pruebas:talla-con-prendas`.
-- Verificación: `select tgname, tgenabled from pg_trigger where tgrelid = 'retail.variantes'::regclass and tgname like
-- 'variantes_depurar%';` → `variantes_depurar_precio_de_tienda | D` y `variantes_depurar_precio_de_tienda_si_tiene | O`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ¿La prenda tiene un precio de tienda vigente? (índice único parcial por prenda y tienda: barato). Lo pregunta el WHEN del disparador
-- al momento de cada fila; quien actualiza `variantes` puede ser una sesión (RLS), así que la puede ejecutar `authenticated`.
create or replace function retail.fn_producto_tiene_precio_de_tienda(p_producto_id uuid) returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  select exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = p_producto_id and ps.archivado_en is null);
$$;
revoke all on function retail.fn_producto_tiene_precio_de_tienda(uuid) from public, anon;
grant execute on function retail.fn_producto_tiene_precio_de_tienda(uuid) to authenticated;

do $do$
begin
  -- El viejo, apagado (sigue en el catálogo para que la historia cuadre con 20261011100000).
  if exists (select 1 from pg_trigger where tgrelid = 'retail.variantes'::regclass
               and tgname = 'variantes_depurar_precio_de_tienda' and tgenabled <> 'D') then
    alter table retail.variantes disable trigger variantes_depurar_precio_de_tienda;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.variantes'::regclass
                   and tgname = 'variantes_depurar_precio_de_tienda_si_tiene') then
    create constraint trigger variantes_depurar_precio_de_tienda_si_tiene
      after insert or update of precio, activo on retail.variantes
      deferrable initially deferred
      for each row
      when (retail.fn_producto_tiene_precio_de_tienda(new.producto_id))
      execute function retail.fn_variantes_depurar_precio_de_tienda();
  end if;
end;
$do$;
