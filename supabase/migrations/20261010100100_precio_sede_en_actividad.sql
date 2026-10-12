-- ============================================================================
-- 20261010100100_precio_sede_en_actividad.sql — CAYLA V2 (Felipe, 2026-10-09; sigue a 20261010100000)
--
-- EL PROBLEMA. Poner o quitar el precio propio de una tienda anota la fila `precio_sede` en el historial de la prenda, y
-- Actividad la escribía cruda: «editó «Blusa Emma»: precio sede {"sede": "6c7c…", "precio": 79.90…} → {…} en 6 variantes».
--
-- LO QUE HACE. `fn_actividad_precio_sede(antes, después)` la dice en palabras de tienda:
--   «precio propio en Tienda Trujillo S/ 79.90 → S/ 89.90» · «quitó el precio propio de Tienda Trujillo (vuelve a S/ 79.90)».
-- Y dos reemplazos ANCLADOS (fallan sin tocar nada si la función viva no es la revisada):
--   · `fn_actividad_producto_cambios`: el campo `precio_sede` usa esa frase (una sola, aunque sean 6 variantes: es la prenda
--     entera);
--   · `fn_actividad_etiqueta_campo`: `precio_sede` se llama «precio de tienda» en los resúmenes de varias prendas.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Se pega DESPUÉS de 20261010100000.
-- Prueba: `pnpm pruebas:precio-sede` (escenario «Actividad lo dice en palabras»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_actividad_precio_sede(p_antes text, p_despues text) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v_antes jsonb := p_antes::jsonb;
  v_despues jsonb := p_despues::jsonb;
  v_tienda text;
begin
  v_tienda := coalesce(v_despues ->> 'tienda', v_antes ->> 'tienda',
                       (select u.nombre from retail.ubicaciones u where u.id::text = v_despues ->> 'sede'), 'una tienda');
  if (v_despues ->> 'propio')::boolean then
    return 'precio propio en ' || v_tienda || ' ' || retail.fn_actividad_soles((v_antes ->> 'precio')::numeric)
      || ' → ' || retail.fn_actividad_soles((v_despues ->> 'precio')::numeric);
  end if;
  return 'quitó el precio propio de ' || v_tienda || ' (vuelve a ' || retail.fn_actividad_soles((v_despues ->> 'precio')::numeric) || ')';
exception when others then
  return 'precio de tienda';
end;
$fn$;
revoke all on function retail.fn_actividad_precio_sede(text, text) from public, anon, authenticated;

-- Reemplazo anclado (el mismo de 20261002120100): falla si la función viva cambió, y es re-ejecutable.
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

select pg_temp.reemplazar(
  'retail.fn_actividad_producto_cambios(uuid, text)',
  $v$      when r.campo = 'descripcion' then 'la descripción'$v$,
  $v$      when r.campo = 'precio_sede' then retail.fn_actividad_precio_sede(r.antes, r.despues)
      when r.campo = 'descripcion' then 'la descripción'$v$,
  1);

select pg_temp.reemplazar(
  'retail.fn_actividad_etiqueta_campo(text)',
  $v$when 'patron_id' then 'patrón'$v$,
  $v$when 'patron_id' then 'patrón' when 'precio_sede' then 'precio de tienda'$v$,
  1);
