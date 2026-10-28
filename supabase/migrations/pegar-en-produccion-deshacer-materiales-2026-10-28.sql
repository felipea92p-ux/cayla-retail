-- ============================================================================
-- pegar-en-produccion-deshacer-materiales-2026-10-28.sql — «una tela con sus colores» (ADR-0554): el camino de VUELTA, escrito y ensayado ANTES de necesitarlo
-- SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI de migraciones y no se pega «por si acaso»). Solo se pega si Felipe decide volver atrás.
--
-- EL PROBLEMA PRIMERO. Producción ya tiene 20261028175000 (la tela, sus colores, el disparador que ata el nombre y el código de cada color a su tela). Volver a «un insumo suelto con su
-- nombre y su código» NO se puede con SQL corriente: el propio disparador `insumos_copias_de_la_tela` reescribe el nombre y el código en cada UPDATE (un `update … set codigo = 'MM-01'` termina
-- bien y no cambia nada), y el atajo más a mano —`alter table retail.insumos drop column material_id`— deja ese disparador vivo y rompe TODO INSERT y UPDATE de insumos («record "new" has no field
-- "material_id"»), incluido «+ Nuevo insumo» de la web vieja. Y `drop trigger` toma en exclusiva las tablas de auth y storage (ADR-0195). Hay un orden que sí funciona; es este.
--
-- QUÉ HACE (PARTE A, la que se pega). Todo o nada, en UNA transacción, sin ningún `drop`. SIRVE CON O SIN `20261028203000` pegada (ensayado en los dos estados):
--   1. Apaga el disparador de copias SOLO durante esta transacción (`alter table … disable trigger`: no toma los candados de auth/storage; se vuelve a encender al final).
--   2. Devuelve cada color a insumo suelto: `material_id` queda nulo y el nombre y el código vuelven a ser los de ANTES, en este orden de preferencia —
--        · los del respaldo que dejó el conversor al aplicar (`respaldo_purgas.filas`, purga «materializar-insumos-…», tabla `insumos`), si existe;
--        · si no (el MM-01 se convirtió antes de que existiera ese respaldo) y es el insumo MÁS ANTIGUO de una tela que nació del conversor (sin token): el nombre y el código que tenía
--          LA TELA el día de la conversión (la foto «estado-tras-conversion-2026-10-28», que se pegó antes de editar nada), y si esa foto no está, los de la tela hoy;
--        · un color sumado después por la web conserva el nombre y el código que ya tenía («Milano Melange · Negro», «MM-01-NEG»), que son únicos y válidos para un insumo suelto.
--      Si el código al que volvería lo usa OTRO insumo, se detiene y dice cuál (no deja un error crudo del índice).
--   3. Vuelve a encender el disparador y le quita a `authenticated` las funciones de alta y edición de telas que existan (la web nueva no puede crear telas mientras tanto).
--   No borra ninguna fila: las telas quedan en `retail.materiales` sin colores (la web vieja no las lee). Lotes, movimientos y costos no se tocan.
--   ⚠ APLICAR LA PARTE A Y PROMOVER LA WEB ANTERIOR EN VERCEL SON UN SOLO PASO: con la web nueva publicada nadie puede crear una tela (la función ya no se les ofrece) pero la web sigue en modo telas.
--
-- ENSAYO PRIMERO. Por defecto NO aplica: hace todo, cuenta, y termina con un error «ENSAYO_OK …» que deshace todo y dice cuántos colores volverían y con qué código y nombre. Cuando el
--   resultado sea el esperado, cambia `false` por `true` en la línea marcada APLICAR y vuelve a pegar. Ensayado en local el 2026-10-28 (`pnpm pruebas:materiales`, grupo R).
-- PARTE B (solo si se ABANDONA el diseño por completo): más abajo, entre marcas, cada paso en su propia pegada. No se pega sin hablarlo.
--
-- PRODUCCIÓN. Sin políticas, sin `drop trigger`, sin `select … into` dentro de textos (ADR-0195, ADR-0288), sin tablas temporales (el SQL Editor no las comparte entre sentencias).
--   `lock_timeout = 3s`: si la tabla está ocupada, falla en vez de esperar.
-- VERIFICACIÓN (solo lectura, después): `select count(*) from retail.insumos where material_id is not null;` → 0, y `select * from retail.insumos where codigo = 'MM-01';` → «Milano Melange».
-- ============================================================================

set lock_timeout = '3s';

do $f$
declare
  r record;
  r2 record;
  v_aplicar boolean := false; -- APLICAR: cambia false por true para aplicar de verdad
  v_colores integer := 0;
  v_con_respaldo integer := 0;
  v_con_su_tela integer := 0;
  v_con_el_suyo integer := 0;
  v_nombre text;
  v_codigo text;
  v_choca record;
  v_lista text := '';
  v_en_lista integer := 0;
begin
  alter table retail.insumos disable trigger insumos_copias_de_la_tela;
  for r in
    select i.id, i.nombre as nombre_actual, i.codigo as codigo_actual, m.nombre as tela_nombre, m.codigo as tela_codigo,
           (m.token_cliente is null) as de_el_conversor,
           (row_number() over (partition by i.material_id order by i.created_at, i.codigo) = 1) as es_el_primero,
           (select b.fila ->> 'nombre' from respaldo_purgas.filas b where b.tabla = 'insumos' and b.purga like 'materializar-insumos-2%' and b.fila ->> 'id' = i.id::text order by b.id limit 1) as nombre_antes,
           (select b.fila ->> 'codigo' from respaldo_purgas.filas b where b.tabla = 'insumos' and b.purga like 'materializar-insumos-2%' and b.fila ->> 'id' = i.id::text order by b.id limit 1) as codigo_antes,
           (select b.fila ->> 'nombre' from respaldo_purgas.filas b where b.tabla = 'materiales' and b.purga = 'estado-tras-conversion-2026-10-28' and b.fila ->> 'id' = m.id::text order by b.id limit 1) as tela_nombre_foto,
           (select b.fila ->> 'codigo' from respaldo_purgas.filas b where b.tabla = 'materiales' and b.purga = 'estado-tras-conversion-2026-10-28' and b.fila ->> 'id' = m.id::text order by b.id limit 1) as tela_codigo_foto
      from retail.insumos i
      join retail.materiales m on m.id = i.material_id
     order by i.created_at, i.codigo
  loop
    if r.nombre_antes is not null and r.codigo_antes is not null then
      v_nombre := r.nombre_antes;
      v_codigo := r.codigo_antes;
      v_con_respaldo := v_con_respaldo + 1;
    elsif r.de_el_conversor and r.es_el_primero then
      v_nombre := coalesce(r.tela_nombre_foto, r.tela_nombre);
      v_codigo := coalesce(r.tela_codigo_foto, r.tela_codigo);
      v_con_su_tela := v_con_su_tela + 1;
    else
      v_nombre := r.nombre_actual;
      v_codigo := r.codigo_actual;
      v_con_el_suyo := v_con_el_suyo + 1;
    end if;
    -- Si el código al que vuelve ya lo usa OTRO insumo (alguien lo reutilizó), se dice cuál: sin esto el índice único responde con un error que no nombra a nadie.
    for v_choca in select x.codigo, x.nombre from retail.insumos x where x.id <> r.id and retail.fn_clave_texto(x.codigo) = retail.fn_clave_texto(v_codigo) loop
      raise exception 'No se puede devolver «%» con el código %: ya lo usa «%» (%). Cámbiale el código a ese insumo y vuelve a intentar.', v_nombre, v_codigo, v_choca.nombre, v_choca.codigo;
    end loop;
    update retail.insumos set nombre = v_nombre, codigo = v_codigo, material_id = null where id = r.id;
    v_colores := v_colores + 1;
    if v_codigo is distinct from r.codigo_actual and v_en_lista < 12 then
      v_lista := v_lista || case when v_lista = '' then '' else ', ' end || v_codigo || ' «' || v_nombre || '»';
      v_en_lista := v_en_lista + 1;
    end if;
  end loop;
  alter table retail.insumos enable trigger insumos_copias_de_la_tela;

  -- Las funciones de telas que existan (con o sin 20261028203000): quitárselas a `authenticated` no falla si alguna todavía no se creó.
  for r2 in
    select p.oid::regprocedure::text as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'retail' and p.proname in ('crear_material', 'agregar_colores_a_material', 'editar_material')
  loop
    execute format('revoke execute on function %s from authenticated', r2.firma);
  end loop;

  if not v_aplicar then
    raise exception 'ENSAYO_OK: % colores volverían a ser insumos sueltos (% con su nombre y código del respaldo, % con los de su tela, % con los suyos). Con código nuevo: %. Nada cambió. Para aplicar: cambia false por true en la línea APLICAR.',
      v_colores, v_con_respaldo, v_con_su_tela, v_con_el_suyo, coalesce(nullif(v_lista, ''), '(ninguno)');
  end if;
  raise notice 'Deshecho: % colores volvieron a ser insumos sueltos (% del respaldo, % con los de su tela, % con los suyos).', v_colores, v_con_respaldo, v_con_su_tela, v_con_el_suyo;
end
$f$;

select (select count(*) from retail.insumos where material_id is not null) as colores_con_tela,
       (select count(*) from retail.materiales) as telas_que_quedan_sin_colores;

-- ============================================================================
-- PARTE B — SOLO SI SE ABANDONA EL DISEÑO. Cada paso va en su PROPIA pegada, con `set lock_timeout = '3s';` antes, y SOLO después de la parte A.
--   Nunca `drop table … cascade` ni `drop column` antes de B1: el disparador seguiría vivo y rompería todo INSERT y UPDATE de insumos.
--   Ensayada en local el 2026-10-28 (grupo R de `pnpm pruebas:materiales`: la parte entre las marcas se corre tal cual, sin los `-- `).
-- PARTE-B-INICIO
-- -- B1. Neutraliza el disparador sin `drop trigger` (el disparador sigue puesto pero ya no hace nada).
-- create or replace function retail.fn_insumos_copias_de_la_tela() returns trigger language plpgsql as $g$ begin return new; end $g$;
-- -- B2. Quita la columna (se lleva la llave compuesta y los dos índices).
-- alter table retail.insumos drop column material_id;
-- -- B3. Quita las funciones de las telas, con su firma (`drop function` no toma los candados de auth/storage). Las dos versiones del conversor: la de cero argumentos (PARTE 1 de 175000) y la de 203000.
-- drop function if exists retail.crear_material(uuid, jsonb, jsonb, uuid);
-- drop function if exists retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid);
-- drop function if exists retail.editar_material(uuid, uuid, jsonb);
-- drop function if exists retail.fn_material_agregar_colores(uuid, uuid, jsonb, uuid);
-- drop function if exists retail.fn_material_leer(jsonb, text, text);
-- drop function if exists retail.fn_material_como_json(uuid);
-- drop function if exists retail.fn_material_exigir_taller(uuid);
-- drop function if exists retail.fn_material_anotar(text, text, uuid, uuid, uuid, jsonb);
-- drop function if exists retail.fn_codigo_de_material(text, text);
-- drop function if exists retail.fn_materializar_insumos_sueltos(boolean);
-- drop function if exists retail.fn_materializar_insumos_sueltos();
-- drop function if exists retail.fn_materiales_propagar_a_colores() cascade;
-- drop function if exists retail.fn_materiales_set_updated_at() cascade;
-- drop function if exists retail.fn_materiales_tipo_firme() cascade;
-- -- B4. Por último, y SOLA, la tabla de las telas (mide antes en local que no toma los candados de auth/storage por su política).
-- drop table retail.materiales;
-- PARTE-B-FIN
-- ============================================================================
