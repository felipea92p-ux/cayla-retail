-- Proveedores no cargaba en las terminales de Almacén (2026-11-16): `fn_proveedores()` preguntaba el permiso de la plata una vez
-- por proveedor, y la terminal se pasaba de los 8 s que Supabase le da a una cuenta con sesión. Una sola parte, sin políticas.
--
-- QUÉ SE VEÍA. La terminal «Almacén Trujillo» entraba a Compras ▸ Proveedores y le salía «Esta pantalla no está mostrando datos».
-- El log de Postgres decía `57014 canceling statement due to statement timeout` en `fn_proveedores` y en
-- `fn_proveedores_resumen` (que la llama), con `fn_terminal_actual` en el rastro. Sentry lo venía contando desde el 23 de octubre:
-- CAYLA-RETAIL-9 (el directorio) y CAYLA-RETAIL-Q (el resumen).
--
-- POR QUÉ. Las 13 columnas de plata de `fn_proveedores()` llevan `case when retail.fn_ve_plata_de_proveedores() then …` (ADR-0387,
-- 20261012204000). Escrito así, Postgres evalúa la función en CADA fila del resultado: 13 × 139 proveedores ≈ 1.800 veces por
-- lectura, y cada vez recorre la cadena de permisos, que no se puede incrustar en la consulta porque cada función lleva
-- `security definer` o `set search_path`. Para un líder la cadena corta en la primera pregunta (`fn_es_lider()` dice sí); para una
-- terminal, o para cualquier integrante con el módulo Proveedores, sigue hasta el final: `fn_es_lider` → `fn_capacidad_por_modulos`
-- → `fn_mi_rol_id` → `fn_terminal_actual`. En local, con 25 proveedores: 327 llamadas al permiso y 2.979 a `fn_terminal_actual`
-- por lectura.
--
-- MEDIDO EN PRODUCCIÓN (2026-11-16, solo lectura, `explain analyze` con la sesión de la terminal, 139 proveedores):
--   · `fn_proveedores()` tal como está, terminal:                        12.051 ms (se corta a los 8.000)
--   · el mismo cuerpo escrito fuera de la función, terminal (control):   11.721 ms
--   · ese cuerpo con el permiso en `(select …)`, terminal:                   146 ms
--   · `fn_proveedores()` tal como está, un líder:                          1.104 ms
--
-- LA SALIDA. Las 13 apariciones pasan a `case when (select retail.fn_ve_plata_de_proveedores()) then …`. Con `(select …)` el
-- permiso es un InitPlan: Postgres lo calcula UNA vez por consulta y reusa el resultado en todas las filas. Es el mismo arreglo que
-- 20261013161000 ya les hizo a las seis columnas bancarias de esta función (1,3 ms contra 462 ms). La regla de quién ve qué NO
-- cambia: la función es `stable`, así que en una consulta responde siempre lo mismo; solo cambia cuántas veces se pregunta.
--
-- DECIDÍ: el reemplazo anclado de las 13 apariciones, idénticas en local y en producción (huella md5 de la función:
-- f0f21db3f2171413f49a0dd5b1fad362 en las dos, 2026-11-16).
-- DESCARTÉ: (1) quitar `security definer` / `set search_path` de toda la cadena de permisos, que abarata cada pregunta: toca
-- funciones de las que dependen todos los módulos y su seguridad, y no hace falta para esto (preguntar 15 veces y no 1.800 ya
-- baja a 146 ms). (2) Tocar `fn_proveedores_resumen()`: sus 10 preguntas van en una consulta de una sola fila, así que corren 10
-- veces y no 10 por proveedor; era lenta porque llama a `fn_proveedores()`, y ese arreglo la alcanza. (3) Subir el tope de 8 s:
-- escondería el problema y lo devolvería con cada proveedor nuevo.
-- SE ROMPE SI: alguien vuelve a escribir `case when retail.fn_ve_plata_de_proveedores() then` (sin el `select`) en una columna de
-- `fn_proveedores()`. Lo vigila `pnpm pruebas:proveedores-permiso-una-vez`, que cuenta las llamadas al permiso con 25 y con 45
-- proveedores y falla si crecen con la lista.
--
-- PRODUCCIÓN. Se pega sola, en cualquier orden respecto de la web (la web no cambia). Solo reemplaza una función: no toma tablas
-- ni políticas, así que no hay riesgo de deadlock. Re-pegable: si el arreglo ya está puesto, no vuelve a parchear. Si la función
-- cambió desde el 2026-11-16, se detiene con un mensaje y no toca nada. La última línea dice «QUEDÓ BIEN».

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-ejecutable: si el texto nuevo ya está puesto, no se vuelve a parchear.
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

-- Las 13 columnas de plata: el permiso, una vez por consulta.
select pg_temp.reemplazar(
  'retail.fn_proveedores()',
  $viejo$case when retail.fn_ve_plata_de_proveedores() then$viejo$,
  $nuevo$case when (select retail.fn_ve_plata_de_proveedores()) then$nuevo$,
  13
);

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», es seguro volver a pegarlo completo.
select '20261116223000 · proveedores: el permiso, una vez' as parte,
       case when position('case when retail.fn_ve_plata_de_proveedores() then' in pg_get_functiondef('retail.fn_proveedores()'::regprocedure)) = 0
             and (length(d) - length(replace(d, 'case when (select retail.fn_ve_plata_de_proveedores()) then', '')))
                 / length('case when (select retail.fn_ve_plata_de_proveedores()) then') = 13
            then 'QUEDÓ BIEN' else 'REVISAR: el reemplazo no quedó completo' end as resultado
  from (select pg_get_functiondef('retail.fn_proveedores()'::regprocedure) as d) x;
