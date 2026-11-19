-- ============================================================================
-- 20261119010000 — Fusionar productos: una oferta por talla y color sigue a la talla que queda (ADR-0682; Felipe 2026-11-18)
--
-- EL PROBLEMA. Desde 20261118232000 una oferta puede elegir tallas y colores sueltos (`campana_regla_variantes`). Al fusionar dos productos
--   repetidos (ADR-0650), la talla que se JUNTA con la del que queda se apaga (`activo = false`, `fusionada_en_id`): una oferta que la había
--   elegido se quedaba apuntando a una prenda que ya no se vende, y dejaba de rebajar sin que nadie lo decidiera. `pruebas:fusionar-productos`
--   (caso 21, «deriva») lo frenó con el nombre de la tabla: toda llave a una variante tiene que decir qué le pasa al fusionar.
--
-- LO QUE HACE. Un reemplazo anclado en `fusionar_productos`, justo después de lo que ya hacía con los modelos de una oferta (ADR-0655):
--   1. La oferta que tenía una talla juntada gana la talla que la absorbió, si no la tenía ya. Se AGREGA y no se repunta: al fusionar tres
--      productos, dos tallas juntadas pueden ir a la misma, y repuntar las dos chocaría con la clave de la tabla.
--   2. La talla juntada sale de la oferta: ya no se vende, y la oferta tiene la que queda.
--   3. Si la oferta tiene ENTERO el modelo que queda, sus tallas sueltas de ese modelo se quitan: el modelo las incluye. Es el estado que
--      `guardar_oferta_completa` nunca deja (20261118232000), y sin esto el cartel contaría el mismo modelo dos veces.
--   La talla que se MUDA conserva su id: su oferta la sigue sin tocar nada.
--   DECIDÍ hacerlo de una vez, después del bucle de variantes, y no talla por talla dentro de él: ahí ya se sabe qué modelos enteros tiene
--     cada oferta (el paso de ADR-0655 va antes), y son tres sentencias en vez de tres por cada talla juntada.
--   DECIDÍ quitar las filas que sobran (2 y 3): son configuración de la oferta, no historia —lo que una oferta rebajó vive en la venta—, y
--     dejarlas haría que la hoja contara una prenda de más. DESCARTÉ dejarlas «en la juntada», como hace ADR-0655 con el modelo: el modelo
--     duplicado sigue existiendo con su nombre; una talla juntada no se ve en ninguna pantalla.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR tras una fusión: una oferta apuntando a una talla juntada del producto que queda; una talla suelta de
--   un modelo que la misma oferta tiene entero.
-- SE ROMPE SI alguien cambia la línea de ADR-0655 en `fusionar_productos` antes de pegar esto: el ancla no aparece y se detiene sin aplicar
--   nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: un reemplazo anclado, sin tablas. Va DESPUÉS de 20261118232000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:fusionar-productos` (casos 21 y 45) y `pnpm pruebas:eliminar-producto` (la tabla es SUYA: se va con la prenda).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.campana_regla_variantes') is null or to_regprocedure('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)') is null then
    raise exception 'Faltan piezas (las ofertas por variante, 20261118232000, o fusionar_productos, 20261112210000): pega antes esas migraciones. No se aplicó nada.';
  end if;
  if position('campana_regla_productos' in pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure)) = 0 then
    raise exception 'fusionar_productos no tiene el paso de las ofertas por modelo (20261113210000): pega antes esa migración. No se aplicó nada.';
  end if;
end;
$$;

create or replace function pg_temp.reemplazar_fusion_por_variante(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_veces integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, v_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_fusion_por_variante(
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $v$     and not exists (select 1 from retail.campana_regla_productos o where o.regla_id = f.regla_id and o.producto_id = p_queda);
$v$,
  $n$     and not exists (select 1 from retail.campana_regla_productos o where o.regla_id = f.regla_id and o.producto_id = p_queda);
  -- ADR-0682: las tallas sueltas de una oferta. La oferta que tenía una talla juntada gana la que la absorbió (si no la tenía ya; con
  -- tres productos, dos juntadas pueden ir a la misma: por eso se agrega, no se repunta)…
  insert into retail.campana_regla_variantes (regla_id, variante_id)
    select distinct f.regla_id, j.fusionada_en_id
      from retail.campana_regla_variantes f
      join retail.variantes j on j.id = f.variante_id
     where j.producto_id = p_queda and j.fusionada_en_id is not null
    on conflict do nothing;
  -- …la juntada sale de la oferta (ya no se vende; la oferta tiene la que queda)…
  delete from retail.campana_regla_variantes f
   using retail.variantes j
   where j.id = f.variante_id and j.producto_id = p_queda and j.fusionada_en_id is not null;
  -- …y si la oferta tiene ENTERO el modelo que queda, sus tallas sueltas de ese modelo sobran: el modelo las incluye.
  delete from retail.campana_regla_variantes f
   using retail.variantes j
   where j.id = f.variante_id and j.producto_id = p_queda
     and exists (select 1 from retail.campana_regla_productos o where o.regla_id = f.regla_id and o.producto_id = p_queda);
$n$
);
