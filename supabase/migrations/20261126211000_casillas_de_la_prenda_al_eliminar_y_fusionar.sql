-- ============================================================================
-- 20261126211000 — Las casillas de la prenda al eliminarla y al fusionarla (ADR-0700; revisión del PR 2004, 2026-11-26)
--
-- EL PROBLEMA. `retail.producto_rasgos` (20261124180000) guarda una fila por prenda con sus casillas de precio, y su llave a `productos`
--   nació sin trato para dos operaciones del catálogo. Las dos pruebas de «deriva» lo frenaron con el nombre de la tabla:
--   1. ELIMINAR. Una prenda sin historia (nunca se vendió ni se movió) a la que alguien le marcó una casilla ya no se podía eliminar: la
--      llave, sin cascada, respondía con el error crudo de Postgres en vez de borrar la ficha.
--   2. FUSIONAR. Al fusionar dos fichas repetidas (ADR-0650), las casillas del duplicado se quedaban en él: si la ficha que queda no tenía
--      ninguna, perdía el margen objetivo que alguien ya había decidido y su ámbar volvía a medir contra la base, sin que nadie lo eligiera.
--
-- LO QUE HACE.
--   1. La llave `producto_rasgos.producto_id → productos` pasa a `on delete cascade`. Las casillas son configuración de la ficha, como si
--      lleva ojales (`producto_taller`) o su vitrina: no son historia y se van con ella. Quién las marcó no se pierde por esto: una prenda
--      con historia no se elimina (`fn_producto_se_puede_eliminar`), se desactiva.
--   2. Un reemplazo anclado en `fusionar_productos`, junto a `producto_taller`: «uno por producto». Las casillas del que queda mandan; las
--      del duplicado pasan solo si el que queda no tiene fila. Lo que no pasa se queda en el duplicado.
--   DECIDÍ no mezclar las dos listas (unir lo marcado en ambas): una casilla sube el precio sugerido, y sumar las de dos fichas daría un
--     objetivo que nadie marcó. Es el mismo trato que ya tienen la ficha del Taller y la vitrina.
--   DECIDÍ mover la fila (`update` de `producto_id`) y no copiarla: el disparador `producto_rasgos_casillas_existen` solo mira `marcados`
--     y `quitados`, así que una casilla que hoy está apagada pasa igual con su código, como pide el ADR-0700 (se apaga, no se borra).
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR: una prenda sin historia que no se puede eliminar por tener casillas; dos filas de casillas para la
--   misma prenda (lo impide la clave primaria; el `not exists` evita llegar a ese error).
-- SE ROMPE SI alguien cambia la línea de `producto_taller` en `fusionar_productos` antes de pegar esto: el ancla no aparece una sola vez y
--   se detiene sin aplicar nada.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s. Sin políticas ni disparadores. No depende de 20261124201000 (no nombra
--   columnas de la tabla): va después de 20261124180000, antes o después de la de las casillas editables.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:eliminar-producto` (la tabla es SUYA) y `pnpm pruebas:fusionar-productos` (caso 21 y el de las casillas).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.producto_rasgos') is null or to_regprocedure('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)') is null then
    raise exception 'Faltan piezas (producto_rasgos, 20261124180000, o fusionar_productos, 20261112210000): pega antes esas migraciones. No se aplicó nada.';
  end if;
end;
$$;

-- ---------- 1. Las casillas se van con la ficha ----------

do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'retail.producto_rasgos'::regclass and c.contype = 'f'
       and c.confrelid = 'retail.productos'::regclass and c.confdeltype <> 'c'
  loop
    execute format(
      'alter table retail.producto_rasgos drop constraint %I, add constraint %I foreign key (producto_id) references retail.productos (id) on delete cascade',
      r.conname, r.conname);
  end loop;
end;
$$;

-- ---------- 2. Al fusionar: uno por producto ----------

create or replace function pg_temp.reemplazar_fusion_con_casillas(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_veces integer;
begin
  if position('retail.producto_rasgos' in v_def) > 0 then
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

select pg_temp.reemplazar_fusion_con_casillas(
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $v$     where producto_id = r.id and not exists (select 1 from retail.producto_taller where producto_id = p_queda);
$v$,
  $n$     where producto_id = r.id and not exists (select 1 from retail.producto_taller where producto_id = p_queda);
    -- ADR-0700: las casillas de precio de la prenda. Las del que queda mandan; las del duplicado pasan solo si el que queda no tiene.
    update retail.producto_rasgos set producto_id = p_queda
     where producto_id = r.id and not exists (select 1 from retail.producto_rasgos where producto_id = p_queda);
$n$
);
