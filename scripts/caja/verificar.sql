-- ============================================================================
-- scripts/caja/verificar.sql — pruebas de abrir_caja/cerrar_caja contra Postgres real
--
-- EL PROBLEMA QUE RESUELVE. abrir_caja/registrar_movimiento_caja/cerrar_caja son el
-- núcleo del dinero (0008_caja_y_pagos.sql) y no tenían ninguna prueba automatizada —
-- cada sesión que tocó Caja (ADR-0052/0053/0056) las verificó a mano con psql en una
-- transacción con rollback, y esa verificación se perdió apenas se cerró la sesión.
-- Este archivo la deja escrita, para volver a correrla cada vez que algo en Caja cambie.
--
-- CÓMO SIMULA "QUIÉN SOY". Igual que supabase/seed.sql: `auth.uid()` lee la variable de
-- sesión `request.jwt.claim.sub` (normalmente la pone PostgREST desde el JWT real). Acá
-- se simula con `set_config('request.jwt.claim.sub', ..., true)` — el `true` final es
-- "local a la transacción", el mismo efecto que `set local`, pero llamable como función
-- desde dentro de un bloque `do $$ $$`, cosa que la sentencia `set local` no permite.
--
-- IDENTIDADES YA SEMBRADAS (supabase/seed.sql) — nada de esto se inventa acá:
--   Felipe:  22222222-2222-4222-8222-000000000001 — líder, cualquier sede.
--   Micaela: 22222222-2222-4222-8222-000000000003 — colaboradora, fija a Tienda Trujillo.
--
-- CÓMO SE REPORTA CADA ESCENARIO. `raise notice 'RESULTADO|...'`, no una tabla. Se probó
-- primero con una tabla temporal + `insert` por escenario, y salía vacía: `rollback to
-- savepoint` deshace TODO lo escrito después del savepoint, tabla de resultados incluida
-- — no solo los efectos del RPC bajo prueba. Un `raise notice` es un mensaje al cliente,
-- no una escritura, así que sobrevive al rollback (del grupo, y al `rollback` final).
-- `scripts/caja/verificar.mjs` lee estas líneas desde stderr (psql manda NOTICE ahí).
--
-- CERO HUELLA. Todo el archivo corre en una única transacción que termina en `rollback`
-- — ni siquiera si algo falla a medio camino queda escrito: el Postgres local lo
-- comparten ~27 worktrees (CLAUDE.md), así que una prueba que ensucia datos ajenos sería
-- peor que no tener la prueba. Cada grupo además tiene su propio `savepoint`: si un grupo
-- revienta por un bug de ESTE script (no del RPC que prueba), los demás grupos igual
-- corren y reportan — un solo error no debe apagar todo el semáforo.
--
-- QUÉ NO CUBRE, a propósito. `cerrar_caja` también suma ventas en efectivo (0008 original)
-- y reembolsos/diferencias de cambio (ADR-0052/0053) — armar esos fixtures requiere
-- producto+variante+venta/devolución/cambio completos, fuera del alcance que pidió Felipe
-- ("abrir_caja ni cerrar_caja, el núcleo del dinero"). Esas tres sesiones ya se cerraron y
-- verificaron por separado; acá quedan en cero (ninguna venta/devolución/cambio referencia
-- las cajas de prueba), así que la aritmética de cada escenario es exacta sin esos términos.
--
-- USO
--   pnpm caja:verificar
-- ============================================================================

begin;

-- El Postgres local lo comparten ~27 worktrees (CLAUDE.md) — a menudo hay una caja
-- de verdad abierta en alguna sede cuando esta prueba arranca (`cajas_ubicacion_
-- abierta_unica` la rechazaría). Se cierran acá TODAS a la fuerza, sin pasar por
-- cerrar_caja (no importa su aritmética, solo liberar el índice único) — inocuo
-- porque nada de esto sale de esta transacción: el `rollback` final las revive
-- exactamente como estaban. Efecto secundario aceptado: mientras corre esta
-- prueba (milisegundos), otra sesión que intente escribir esa MISMA fila espera
-- a que termine — se libera solo en cuanto el `rollback` cierra la transacción.
update retail.cajas set estado = 'cerrada', cerrada_en = now() where estado = 'abierta';

-- ============================================================================
-- GRUPO A — abrir_caja: permisos por ubicación, unicidad, monto de apertura
-- ============================================================================
savepoint grupo_a;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000003', true); -- Micaela

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Tienda Trujillo';
  v_id := retail.abrir_caja(v_ubic, 50);
  raise notice 'RESULTADO|%|%|%', 'A1 colaboradora abre caja en su propia sede', v_id is not null, 'id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'A1 colaboradora abre caja en su propia sede', false, sqlerrm;
end $$;

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Tienda Trujillo';
  v_id := retail.abrir_caja(v_ubic, 10);
  raise notice 'RESULTADO|%|%|%', 'A2 doble apertura en la misma sede debe RECHAZAR', false, 'no debio permitir: id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'A2 doble apertura en la misma sede debe RECHAZAR',
    sqlerrm ilike '%duplicate key%' or sqlerrm ilike '%unique%', sqlerrm;
end $$;

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Tienda Lima';
  v_id := retail.abrir_caja(v_ubic, 10);
  raise notice 'RESULTADO|%|%|%', 'A3 colaboradora intenta abrir en otra sede debe RECHAZAR', false, 'no debio permitir: id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'A3 colaboradora intenta abrir en otra sede debe RECHAZAR', sqlerrm ilike '%permiso%', sqlerrm;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true); -- Felipe

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Tienda Lima';
  v_id := retail.abrir_caja(v_ubic, 10);
  raise notice 'RESULTADO|%|%|%', 'A4 lider abre caja en una sede que no es la suya', v_id is not null, 'id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'A4 lider abre caja en una sede que no es la suya', false, sqlerrm;
end $$;

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Taller'; -- sede libre, Lima ya la abrio A4
  v_id := retail.abrir_caja(v_ubic, -5);
  raise notice 'RESULTADO|%|%|%', 'A5 monto de apertura negativo debe RECHAZAR', false, 'no debio permitir: id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'A5 monto de apertura negativo debe RECHAZAR', sqlerrm ilike '%negativ%', sqlerrm;
end $$;

rollback to savepoint grupo_a;

-- ============================================================================
-- GRUPO B — cerrar_caja: aritmetica con deposito + ajuste, y el candado de lider
-- ============================================================================
savepoint grupo_b;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true); -- Felipe

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Tienda Lima';
  v_id := retail.abrir_caja(v_ubic, 100);
  perform set_config('pruebas.caja_b', v_id::text, true);
  raise notice 'RESULTADO|%|%|%', 'B1 Felipe abre caja en Lima con apertura 100', v_id is not null, 'id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B1 Felipe abre caja en Lima con apertura 100', false, sqlerrm;
end $$;

do $$
begin
  perform retail.registrar_movimiento_caja(current_setting('pruebas.caja_b')::uuid, 'ingreso', 30, 'Ingreso vario de prueba');
  raise notice 'RESULTADO|%|%|%', 'B2 ingreso libre S/30', true, 'ok';
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B2 ingreso libre S/30', false, sqlerrm;
end $$;

do $$
begin
  perform retail.registrar_movimiento_caja(
    current_setting('pruebas.caja_b')::uuid, 'egreso', 40, 'Deposito bancario', 'Voucher-TEST-001', false);
  raise notice 'RESULTADO|%|%|%', 'B3 deposito bancario S/40 (egreso)', true, 'ok';
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B3 deposito bancario S/40 (egreso)', false, sqlerrm;
end $$;

-- Aislamos el candado de LIDER (no el de ubicacion): reasignamos a Micaela
-- temporalmente a Tienda Lima. El `rollback to savepoint grupo_b` del final
-- deshace este update igual que deshace todo lo demas del grupo.
update retail.colaboradores set ubicacion_asignada_id = (select id from retail.ubicaciones where nombre = 'Tienda Lima')
  where persona_id = (select id from public.personas where auth_user_id = '22222222-2222-4222-8222-000000000003');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000003', true); -- Micaela, ahora en Lima pero sigue sin ser lider

do $$
begin
  perform retail.registrar_movimiento_caja(
    current_setting('pruebas.caja_b')::uuid, 'ingreso', 15, 'Ajuste de caja (sobrante)', 'sobrante', true);
  raise notice 'RESULTADO|%|%|%', 'B4 colaboradora (no lider) intenta un ajuste debe RECHAZAR', false, 'no debio permitir el ajuste';
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B4 colaboradora (no lider) intenta un ajuste debe RECHAZAR', sqlerrm ilike '%líder%', sqlerrm;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true); -- Felipe otra vez

do $$
begin
  perform retail.registrar_movimiento_caja(
    current_setting('pruebas.caja_b')::uuid, 'ingreso', 15, 'Ajuste de caja (sobrante)', 'sobrante detectado', true);
  raise notice 'RESULTADO|%|%|%', 'B5 lider SI puede registrar el ajuste', true, 'ok';
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B5 lider SI puede registrar el ajuste', false, sqlerrm;
end $$;

do $$
declare v_sistema numeric; v_esperado numeric := 100 + 30 - 40 + 15; -- 105
begin
  select monto_sistema into v_sistema from retail.cerrar_caja(current_setting('pruebas.caja_b')::uuid, v_esperado);
  raise notice 'RESULTADO|%|%|%', 'B6 cerrar_caja calcula 100+30-40+15=105',
    v_sistema = v_esperado, 'sistema=' || v_sistema || ' esperado=' || v_esperado;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B6 cerrar_caja calcula 100+30-40+15=105', false, sqlerrm;
end $$;

do $$
declare v_x numeric;
begin
  select monto_sistema into v_x from retail.cerrar_caja(current_setting('pruebas.caja_b')::uuid, 105);
  raise notice 'RESULTADO|%|%|%', 'B7 cerrar una caja ya cerrada debe RECHAZAR', false, 'no debio permitir: ' || v_x;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'B7 cerrar una caja ya cerrada debe RECHAZAR', sqlerrm ilike '%cerrada%', sqlerrm;
end $$;

rollback to savepoint grupo_b;

-- ============================================================================
-- GRUPO C — cerrar_caja: permiso por ubicacion y monto contado invalido
-- ============================================================================
savepoint grupo_c;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true); -- Felipe

do $$
declare v_id uuid; v_ubic uuid;
begin
  select id into v_ubic from retail.ubicaciones where nombre = 'Tienda Lima';
  v_id := retail.abrir_caja(v_ubic, 20);
  perform set_config('pruebas.caja_c', v_id::text, true);
  raise notice 'RESULTADO|%|%|%', 'C1 Felipe abre caja en Lima con apertura 20', v_id is not null, 'id=' || v_id;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'C1 Felipe abre caja en Lima con apertura 20', false, sqlerrm;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000003', true); -- Micaela, sigue fija a Trujillo (grupo B ya se deshizo)

do $$
declare v_x numeric;
begin
  select monto_sistema into v_x from retail.cerrar_caja(current_setting('pruebas.caja_c')::uuid, 20);
  raise notice 'RESULTADO|%|%|%', 'C2 colaboradora sin acceso a Lima intenta cerrarla debe RECHAZAR', false, 'no debio permitir: ' || v_x;
exception when others then
  -- Desde 20260921100000 (D-13) el primer candado de cerrar_caja es el de LÍDER, no el de ubicación:
  -- una colaboradora ya no llega a preguntarse si la caja es de su sede. El mensaje ahora nombra al líder.
  raise notice 'RESULTADO|%|%|%', 'C2 colaboradora sin acceso a Lima intenta cerrarla debe RECHAZAR', sqlerrm ilike '%líder%', sqlerrm;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true); -- Felipe

do $$
declare v_x numeric;
begin
  select monto_sistema into v_x from retail.cerrar_caja(current_setting('pruebas.caja_c')::uuid, -1);
  raise notice 'RESULTADO|%|%|%', 'C3 monto contado negativo debe RECHAZAR', false, 'no debio permitir: ' || v_x;
exception when others then
  raise notice 'RESULTADO|%|%|%', 'C3 monto contado negativo debe RECHAZAR', sqlerrm ilike '%negativ%', sqlerrm;
end $$;

rollback to savepoint grupo_c;

rollback;
