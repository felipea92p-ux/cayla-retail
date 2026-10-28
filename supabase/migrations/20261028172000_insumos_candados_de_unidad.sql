-- ============================================================================
-- 20261028172000_insumos_candados_de_unidad.sql — CAYLA V2 (ADR-0554, actividad 0 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. Hoy una tela se puede crear «en Kilos»: el combo «Se mide en» ofrece las seis unidades para cualquier tipo y la base no lo impide. Pero todo lo que el
-- sistema APRENDE del consumo habla en metros: `cerrar_produccion` solo suma telas en `metro` para «lo medido» (20261014160000), «Nueva orden» sugiere el consumo del modelo
-- (metros) y `abrir_orden_produccion` lo guarda en `producto_consumos.tela_por_prenda` desde cualquier tela. Una tela en kilos queda fuera de lo medido SIN AVISAR y puede
-- escribir kilos como si fueran metros en el modelo. Felipe (2026-10-28) decidió: el stock de la tela se lleva en METROS; el kilo y el rollo son unidades de COMPRA que se
-- convierten al recibir (ADR-0554; la conversión llega en la actividad 4).
-- Hay dos huecos más, del mismo tipo: (a) un líder puede cambiar `unidad_medida` o `tipo` de un insumo que ya tiene historia (la política `insumos_update_lider` no tiene
-- `WITH CHECK`) y reinterpretar de un golpe todo su libro; (b) `UNIQUE (codigo)` distingue 'MM-01' de 'mm-01' y de ' MM-01 ': la misma tela pasa dos veces.
--
-- QUÉ HACE (sin tablas nuevas, sin políticas, sin tocar ninguna fila)
--   1. CHECK `insumos_tela_en_metros`: una tela se mide en metros. Un avío sigue pudiendo medirse en cualquier unidad.
--   2. Disparador `insumos_unidad_firme`: ni `unidad_medida` ni `tipo` cambian cuando el insumo ya tiene historia. «Historia» = CUALQUIER fila de CUALQUIER tabla que lo apunte con
--      una llave foránea (hoy siete: lotes, movimientos, plan de la orden, líneas y cierres de las órdenes de insumos, facturas de producción y avíos del modelo). La lista sale
--      del catálogo de Postgres en el momento, no de una lista escrita aquí: una tabla nueva que apunte a `insumos` queda cubierta sola (`producto_avios` nació el 2026-10-26).
--   3. Índice único `insumos_codigo_clave_unico` sobre `fn_clave_texto(codigo)` (minúsculas, sin tildes, sin espacios repetidos) + CHECK `insumos_codigo_no_vacio`: un código en
--      blanco da clave NULL y escaparía del índice.
--
-- PROMETE: una tela nueva o editada siempre queda en metros; el tipo y la unidad de un insumo con historia no cambian (tampoco por la API directa ni por el SQL Editor); dos códigos
--   que se escriben distinto pero se leen igual no conviven; un código en blanco no entra.
-- ASUME:   las telas que ya existen están en metros y los códigos que ya existen no chocan entre sí (si no, la migración se DETIENE, dice cuáles y no cambia nada);
--   `fn_clave_texto` es IMMUTABLE (lo es: se creó así para poder indexar, 20260912235500).
-- NO HACE: no cambia ninguna fila; no toca `recibir_insumo`, `registrar_consumo_insumo` ni ninguna otra función; no agrega la unidad de compra (kilo, rollo) ni la tabla de telas
--   (actividades 1 y 4); no cambia el combo de la web (lo hace la misma rama).
--
-- DECIDÍ: el candado va en la BASE (CHECK + disparador + índice) y no solo en la pantalla: la pantalla de hoy ofrece Kilos y hay otros caminos (la API directa, el SQL Editor).
-- DESCARTÉ: (a) quitar «Kilos» del combo y nada más: la puerta de la API sigue abierta; (b) una lista escrita a mano de «tablas con historia»: queda vieja el día que otra tabla
--   apunte a `insumos`; (c) `NOT VALID` en los CHECK: con un puñado de filas no ahorra nada y deja una promesa a medias.
-- SE ROMPE SI: alguien crea una tela en kilos entre la prueba y el pegado (la migración se detiene y lo dice, sin cambiar nada: se corrige esa fila y se vuelve a pegar). O si más
--   adelante se decide llevar el punto en kilos en el libro (ADR-0554 lo descartó el 2026-10-28): el CHECK pasaría a ser por tela y no por tipo.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: dos `alter table … add constraint`, un índice, dos funciones y un `create or replace trigger`.
--   Sin políticas, así que no choca con el Asesor de seguridad (ADR-0195), y `create or replace trigger` (nunca `drop trigger`) no toma las tablas de `auth` ni de `storage`.
--   Dentro de los textos no hay ningún `select … into` (ADR-0288). Antes de pegar, para ver lo mismo que va a mirar la migración (debe dar 0 filas las dos):
--     select codigo, unidad_medida from retail.insumos where tipo = 'tela' and unidad_medida <> 'metro';
--     select retail.fn_clave_texto(codigo) as clave, count(*) from retail.insumos group by 1 having count(*) > 1 or retail.fn_clave_texto(codigo) is null;
--   Prueba: `pnpm pruebas:insumos-candados`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 0. Antes de tocar nada: ¿hay filas que los candados dejarían fuera? ----------
-- Una tela medida en otra unidad o dos códigos que se leen igual no se corrigen solos: los tiene que mirar una persona. Se dice cuáles y no se cambia nada.
do $f$
declare
  v_telas text;
  v_codigos text;
begin
  v_telas := (select string_agg(codigo || ' (' || unidad_medida || ')', ', ' order by codigo) from retail.insumos where tipo = 'tela' and unidad_medida <> 'metro');
  if v_telas is not null then
    raise exception 'Hay telas medidas en otra unidad que metro: %. Corrígelas antes (si no tienen historia, basta pasarlas a metro) y vuelve a pegar esta migración.', v_telas using errcode = 'P0001';
  end if;
  v_codigos := (select string_agg(coalesce(clave, '(en blanco)'), ', ' order by clave) from (
                  select retail.fn_clave_texto(codigo) as clave from retail.insumos group by 1 having count(*) > 1 or retail.fn_clave_texto(codigo) is null) d);
  if v_codigos is not null then
    raise exception 'Hay códigos de insumo repetidos o en blanco (comparados sin mayúsculas, tildes ni espacios sobrantes): %. Corrígelos antes y vuelve a pegar esta migración.', v_codigos using errcode = 'P0001';
  end if;
end
$f$;

-- ---------- 1. Una tela se mide en metros ----------
do $f$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_tela_en_metros' and conrelid = 'retail.insumos'::regclass) then
    alter table retail.insumos add constraint insumos_tela_en_metros check (tipo <> 'tela' or unidad_medida = 'metro');
  end if;
end
$f$;
comment on constraint insumos_tela_en_metros on retail.insumos is
  'ADR-0554: el libro de una tela va en metros (el kilo y el rollo son unidades de compra que se convierten al recibir). Un avío puede medirse en cualquier unidad.';

-- ---------- 2. Un código no se repite aunque cambien mayúsculas, tildes o espacios ----------
do $f$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_codigo_no_vacio' and conrelid = 'retail.insumos'::regclass) then
    alter table retail.insumos add constraint insumos_codigo_no_vacio check (retail.fn_clave_texto(codigo) is not null);
  end if;
end
$f$;
create unique index if not exists insumos_codigo_clave_unico on retail.insumos (retail.fn_clave_texto(codigo));
comment on index retail.insumos_codigo_clave_unico is
  'ADR-0554: el código de un insumo es único comparado sin mayúsculas, tildes ni espacios sobrantes (retail.fn_clave_texto). Complementa a insumos_codigo_key, que solo compara el texto exacto.';

-- ---------- 3. La unidad y el tipo no cambian cuando el insumo ya tiene historia ----------
-- «Historia» es cualquier fila de cualquier tabla que apunte al insumo con una llave foránea. Se lee del catálogo en el momento: no hay una lista que mantener ni que se quede vieja.
-- SECURITY DEFINER para ver las tablas sin que la política de lectura de cada una (por ubicación) esconda filas; solo la llama el disparador de abajo.
create or replace function retail.fn_insumo_tiene_historia(p_insumo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  r record;
  v_hay boolean;
begin
  for r in
    select c.conrelid::regclass::text as tabla, a.attname::text as columna
      from pg_constraint c
      join pg_class k on k.oid = c.conrelid and k.relpersistence <> 't'  -- una tabla temporal de OTRA sesión no se puede leer (y no es historia de nadie)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'retail.insumos'::regclass and cardinality(c.conkey) = 1
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabla, r.columna) into v_hay using p_insumo_id;
    if v_hay then
      return true;
    end if;
  end loop;
  return false;
end;
$f$;
revoke all on function retail.fn_insumo_tiene_historia(uuid) from public, anon, authenticated;
comment on function retail.fn_insumo_tiene_historia(uuid) is
  'ADR-0554: ¿alguna fila de alguna tabla apunta a este insumo? Lee las llaves foráneas del catálogo, así que una tabla nueva queda cubierta sola. Solo la usa el disparador insumos_unidad_firme.';

create or replace function retail.fn_insumos_unidad_firme()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  if (new.unidad_medida is distinct from old.unidad_medida or new.tipo is distinct from old.tipo) and retail.fn_insumo_tiene_historia(old.id) then
    raise exception 'Este insumo ya se usa (tiene lotes, movimientos, órdenes o fichas): no se le puede cambiar el tipo ni la unidad. Crea otro insumo con la unidad correcta.'
      using errcode = '23514', hint = 'insumo_unidad_firme';
  end if;
  return new;
end;
$f$;
revoke all on function retail.fn_insumos_unidad_firme() from public, anon, authenticated;

create or replace trigger insumos_unidad_firme
  before update of unidad_medida, tipo on retail.insumos
  for each row execute function retail.fn_insumos_unidad_firme();
