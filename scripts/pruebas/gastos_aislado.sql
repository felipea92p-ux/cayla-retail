-- ============================================================================
-- Prueba AISLADA de gastos — CAYLA V2 (ADR-0117)
--
-- QUÉ PRUEBA. `supabase/migrations/20260918193000_gastos.sql`: los tres caminos de entrada
-- (A sin caja, B efectivo desde caja abierta, C clasificar un egreso), que NUNCA se cuente dos
-- veces un egreso, que los estados imposibles de la tabla sean imposibles incluso para el dueño
-- de la fila, que nadie escriba directo, y que la tarjeta de una sede solo se mueva con sus gastos.
--
-- POR QUÉ ES "AISLADA". Tablas mínimas con los mismos nombres y columnas que 0002/0008 y stubs de
-- `fn_es_lider` / `fn_puede_operar_ubicacion` / `auth.uid`. Pero `registrar_movimiento_caja` es la
-- REAL (se carga la migración 20260915202040): así el camino B se prueba contra la regla de caja
-- verdadera, incluido el rechazo de una caja cerrada. LO QUE NO PRUEBA: la `fn_es_lider` verdadera
-- (Dynamic + colaboradores) ni la pantalla; eso queda para el stack local con Docker.
--
-- CÓMO SE CORRE. Lo normal es `node scripts/pruebas/gastos_aislado.mjs`: levanta un Postgres
-- efímero, corre esta prueba, una prueba de CONCURRENCIA con dos sesiones y 10 MUTACIONES (quita un candado a la vez y exige que la
-- prueba falle). A mano, sobre una base vacía y desechable (BORRA el schema `retail`):
--   psql -X -v ON_ERROR_STOP=1 -v migracion=supabase/migrations/20260918193000_gastos.sql \
--        -d gastos_test -f scripts/pruebas/gastos_aislado.sql
-- ============================================================================

drop schema if exists retail cascade;
drop schema if exists auth cascade;
create schema retail;
create schema auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
grant usage on schema retail, public to authenticated, anon;

-- ---------- Ayudantes de prueba (en public, para poder llamarlos como `authenticated`) ----------
create table if not exists public.t_cuenta (n integer not null default 0);
delete from public.t_cuenta; insert into public.t_cuenta values (0);
grant select, update on public.t_cuenta to authenticated;

create or replace function public.t_ok(condicion boolean, mensaje text) returns void language plpgsql as $$
begin
  if condicion is not true then raise exception 'FALLÓ: %', mensaje; end if;
  update public.t_cuenta set n = n + 1;
  raise notice 'ok  %', mensaje;
end $$;

-- Ejecuta `sentencia` y exige que FALLE con un mensaje que contenga `esperado`.
create or replace function public.t_falla(sentencia text, esperado text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute sentencia;
  exception when others then
    v_msg := sqlerrm;
    if position(lower(esperado) in lower(v_msg)) = 0 then
      raise exception 'FALLÓ: [%] falló con otro mensaje. Esperaba «%», llegó «%»', sentencia, esperado, v_msg;
    end if;
    update public.t_cuenta set n = n + 1;
    raise notice 'ok  rechaza: %', esperado;
    return;
  end;
  raise exception 'FALLÓ: se esperaba el error «%» y NO ocurrió: %', esperado, sentencia;
end $$;

-- ---------- Tablas mínimas (mismos nombres y columnas que las migraciones reales) ----------
create table public.personas (id uuid primary key, auth_user_id uuid);
create table retail.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('tienda', 'almacen', 'taller')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table retail.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);
create table retail.cajas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  monto_apertura numeric(12,2) not null default 0
);
create table retail.caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references retail.cajas (id),
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

-- Stubs de identidad: se encienden con set_config.
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function retail.fn_es_lider() returns boolean language sql stable
as $$ select coalesce(nullif(current_setting('test.lider', true), '')::boolean, false) $$;
create function retail.fn_puede_operar_ubicacion(p_ubicacion_id uuid) returns boolean language sql stable
as $$ select retail.fn_es_lider() $$;

-- «Hoy» en Lima: la definición real de 20260918170000.
create function retail.fn_hoy_lima() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

-- La firma VIEJA de 4 argumentos: la migración de caja la borra antes de crear la de 6.
create function retail.registrar_movimiento_caja(p_caja_id uuid, p_tipo text, p_monto numeric, p_motivo text)
returns uuid language sql as $$ select null::uuid $$;

-- La regla de caja REAL, sin tocar una coma.
\i supabase/migrations/20260915202040_caja_deposito_y_ajuste.sql
-- Lo que se prueba (o su mutante).
\i :migracion

grant select on retail.ubicaciones, retail.proveedores, retail.cajas, retail.caja_movimientos to authenticated;
grant select on public.personas to authenticated;
grant execute on function retail.fn_es_lider() to authenticated;
grant execute on function auth.uid() to authenticated;
grant usage on schema auth to authenticated;

-- Constantes (funciones, para poder usarlas dentro de sentencias en texto)
create function public.k_tru() returns uuid language sql immutable as $$ select 'aaaaaaaa-0000-4000-8000-000000000001'::uuid $$;
create function public.k_aqp() returns uuid language sql immutable as $$ select 'aaaaaaaa-0000-4000-8000-000000000002'::uuid $$;
create function public.k_tal() returns uuid language sql immutable as $$ select 'aaaaaaaa-0000-4000-8000-000000000003'::uuid $$;
create function public.k_c1()  returns uuid language sql immutable as $$ select 'cccccccc-0000-4000-8000-000000000001'::uuid $$;  -- caja abierta TRU
create function public.k_c2()  returns uuid language sql immutable as $$ select 'cccccccc-0000-4000-8000-000000000002'::uuid $$;  -- caja CERRADA AQP
create function public.k_m(n integer) returns uuid language sql immutable
as $$ select ('eeeeeeee-0000-4000-8000-00000000000' || n)::uuid $$;
create function public.k_tok(n integer) returns uuid language sql immutable
as $$ select ('dddddddd-0000-4000-8000-00000000000' || n)::uuid $$;

-- Atajo para llamar a la RPC con valores razonables por defecto (invoker: respeta el rol).
create function public.g(
  p_ubic uuid, p_medio text, p_monto numeric,
  p_caja uuid default null, p_mov uuid default null, p_token uuid default null,
  p_tipo text default 'boleta', p_igv numeric default 0, p_num text default null,
  p_fecha date default null, p_cat text default 'suministros', p_desc text default 'prueba'
) returns uuid language sql as $$
  select retail.registrar_gasto(
    p_ubicacion_id => p_ubic, p_categoria => p_cat, p_descripcion => p_desc,
    p_fecha => coalesce(p_fecha, retail.fn_hoy_lima()), p_monto_total => p_monto,
    p_comprobante_tipo => p_tipo, p_medio_pago => p_medio, p_igv => p_igv, p_comprobante_numero => p_num,
    p_caja_id => p_caja, p_caja_movimiento_id => p_mov, p_token => p_token)
$$;

-- INSERT directo (sin RPC) para probar los candados de la tabla misma.
create function public.ins(
  p_medio text, p_mov uuid, p_monto numeric default 10, p_tipo text default 'boleta', p_igv numeric default 0,
  p_num text default null, p_estado text default 'vigente', p_ubic uuid default null, p_motivo_anul text default null
) returns void language sql as $$
  insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, comprobante_tipo,
                             comprobante_numero, medio_pago, caja_movimiento_id, estado, motivo_anulacion)
  values (p_ubic, 'suministros', 'directo', current_date, p_monto, p_igv, p_tipo, p_num, p_medio, p_mov, p_estado, p_motivo_anul)
$$;

-- ---------- Datos ----------
insert into public.personas values
  ('bbbbbbbb-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-00000000000a'),   -- líder
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'ffffffff-0000-4000-8000-00000000000b');   -- integrante
insert into retail.ubicaciones (id, nombre, tipo, activo) values
  (public.k_tru(), 'Tienda TRU', 'tienda', true),
  (public.k_aqp(), 'Tienda AQP', 'tienda', true),
  (public.k_tal(), 'Taller', 'taller', true),
  (gen_random_uuid(), 'Tienda vieja cerrada', 'tienda', false);
insert into retail.cajas (id, ubicacion_id, estado) values
  (public.k_c1(), public.k_tru(), 'abierta'),
  (public.k_c2(), public.k_aqp(), 'cerrada');
insert into retail.caja_movimientos (id, caja_id, tipo, monto, motivo) values
  (public.k_m(1), public.k_c1(), 'egreso', 20,  'Compra de insumos'),
  (public.k_m(2), public.k_c1(), 'egreso', 500, 'Depósito bancario'),
  (public.k_m(3), public.k_c1(), 'ingreso', 100, 'Sencillo'),
  (public.k_m(4), public.k_c2(), 'egreso', 30,  'Compra de bolsas'),
  (public.k_m(5), public.k_c1(), 'egreso', 10,  'Movilidad'),
  (public.k_m(6), public.k_c2(), 'egreso', 10,  'Otro');

select set_config('test.lider', 'true', false), set_config('test.uid', 'ffffffff-0000-4000-8000-00000000000a', false);

create function public.n_mov() returns bigint language sql as $$ select count(*) from retail.caja_movimientos $$;
create function public.n_gastos() returns bigint language sql as $$ select count(*) from retail.gastos $$;

-- ============================================================================
-- T1. Las categorías: 7, cerradas, sin «Otros»
-- ============================================================================
select public.t_ok((select count(*) from retail.categorias_gasto) = 7, 'T1 hay 7 categorías sembradas');
select public.t_ok(not exists (select 1 from retail.categorias_gasto where codigo in ('otros', 'otro', 'varios')),
  'T1 no existe categoría cajón de sastre («Otros»): 659 es mermas');
select public.t_ok((select cuenta_pcge from retail.categorias_gasto where codigo = 'alquileres') = '635',
  'T1 alquileres → cuenta 635 (la categoría lleva su cuenta contable)');

-- ============================================================================
-- T2. Camino A: pagado sin caja → un gasto, ni un movimiento de caja
-- ============================================================================
create temp table ids (k text primary key, v uuid);
insert into ids select 'g1', public.g(public.k_tru(), 'transferencia', 118, p_tipo => 'factura', p_igv => 18, p_num => 'F001-1');
select public.t_ok(public.n_gastos() = 1 and public.n_mov() = 6, 'T2 camino A: un gasto y NINGÚN movimiento de caja nuevo');
select public.t_ok((select caja_movimiento_id is null and estado = 'vigente' from retail.gastos where id = (select v from ids where k = 'g1')),
  'T2 camino A: sin egreso de caja, vigente');

-- ============================================================================
-- T3. Rechazos de la RPC y de los checks (todo lo que NO debe entrar)
-- ============================================================================
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 10)$$, 'uno de los dos');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10, p_caja => public.k_c1())$$, 'Solo un gasto en efectivo');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10, p_tipo => 'boleta', p_igv => 5)$$, 'gastos_igv_solo_factura');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10, p_tipo => 'factura', p_igv => 2)$$, 'gastos_factura_con_numero');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10, p_fecha => current_date + 3)$$, 'no puede ser futura');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10, p_cat => 'otros')$$, 'no existe o está desactivada');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 0)$$, 'mayor que cero');
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10, p_desc => '   ')$$, 'descripción');
select public.t_ok(public.n_gastos() = 1 and public.n_mov() = 6, 'T3 los rechazos no dejaron ni un gasto ni un movimiento');

-- ============================================================================
-- T4. Camino B: efectivo desde caja abierta → egreso + gasto en UNA transacción
-- ============================================================================
insert into ids select 'g2', public.g(public.k_tru(), 'efectivo', 45.50, p_caja => public.k_c1(), p_cat => 'transporte', p_desc => 'Taxi a Taller');
select public.t_ok(public.n_mov() = 7, 'T4 camino B: se creó UN egreso de caja');
select public.t_ok((select m.tipo = 'egreso' and m.monto = 45.50 and m.motivo like 'Gasto%'
                      from retail.gastos g join retail.caja_movimientos m on m.id = g.caja_movimiento_id
                     where g.id = (select v from ids where k = 'g2')),
  'T4 el gasto señala un egreso del mismo monto, con motivo legible');

-- ============================================================================
-- T5. Camino B es todo-o-nada: si algo falla no queda ni gasto ni egreso huérfano
-- ============================================================================
select public.t_falla($$select public.g(public.k_aqp(), 'efectivo', 10, p_caja => public.k_c2())$$, 'cerrada');
select public.t_falla($$select public.g(public.k_aqp(), 'efectivo', 10, p_caja => public.k_c1())$$, 'otra sede');
-- El fallo que SÍ podría dejar un huérfano: ocurre DESPUÉS de crear el egreso (el check de factura sin número).
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 10, p_caja => public.k_c1(), p_tipo => 'factura')$$, 'gastos_factura_con_numero');
select public.t_ok(public.n_gastos() = 2 and public.n_mov() = 7, 'T5 tras tres fallos del camino B (uno DESPUÉS de crear el egreso) no hay gasto ni egreso huérfano');

-- ============================================================================
-- T6. Camino C: clasificar un egreso existente — y la regla de oro (un egreso, un gasto)
-- ============================================================================
insert into ids select 'g3', public.g(public.k_tru(), 'efectivo', 20, p_mov => public.k_m(1));
select public.t_ok(public.n_mov() = 7 and public.n_gastos() = 3, 'T6 camino C: un gasto y NINGÚN movimiento de caja nuevo');
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 400, p_mov => public.k_m(2))$$, 'no coincide');
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 100, p_mov => public.k_m(3))$$, 'no con un ingreso');
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 20, p_mov => public.k_m(1))$$, 'ya está clasificado');
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 30, p_mov => public.k_m(4))$$, 'otra sede');
insert into ids select 'g4', public.g(public.k_aqp(), 'efectivo', 30, p_mov => public.k_m(4));
select public.t_ok(public.n_gastos() = 4, 'T6 se clasificó el egreso de AQP a su propia sede (aunque su caja ya cerró)');

-- ============================================================================
-- T7. Idempotencia: un doble clic o un reintento de red no duplica nada
-- ============================================================================
insert into ids select 'tk1a', public.g(public.k_tru(), 'transferencia', 10, p_token => public.k_tok(1));
insert into ids select 'tk1b', public.g(public.k_tru(), 'transferencia', 10, p_token => public.k_tok(1));
select public.t_ok((select v from ids where k = 'tk1a') = (select v from ids where k = 'tk1b') and public.n_gastos() = 5,
  'T7 mismo token en camino A: mismo gasto, sin duplicar');
insert into ids select 'tk2a', public.g(public.k_tru(), 'efectivo', 12, p_caja => public.k_c1(), p_token => public.k_tok(2));
insert into ids select 'tk2b', public.g(public.k_tru(), 'efectivo', 12, p_caja => public.k_c1(), p_token => public.k_tok(2));
select public.t_ok((select v from ids where k = 'tk2a') = (select v from ids where k = 'tk2b') and public.n_gastos() = 6 and public.n_mov() = 8,
  'T7 mismo token en camino B: un solo gasto Y un solo egreso de caja');

-- ============================================================================
-- T8. «No es gasto»: un depósito no es un gasto, y no convive con uno
-- ============================================================================
select public.t_ok((select count(*) from retail.fn_egresos_sin_clasificar()) = 3,
  'T8 sin clasificar: el depósito, la movilidad (m5) y el «Otro» de AQP (m6); el ingreso no es un egreso');
-- (m2 500 depósito, m5 10 movilidad, m6 10 «Otro» de la caja cerrada de AQP)
insert into ids select 'nog2', retail.marcar_egreso_no_gasto(public.k_m(2), 'Depósito al banco');
select public.t_ok((select count(*) from retail.fn_egresos_sin_clasificar()) = 2, 'T8 el depósito marcado sale de «sin clasificar»');
select public.t_ok((select count(*) = 1 and bool_and(id = (select v from ids where k = 'nog2') and monto = 500 and total = 1) from retail.fn_egresos_no_gasto_lista()),
  'T8 la marca aparece en la lista de «no es gasto», con su id: se puede llegar a ella para revertirla');
select public.t_falla($$select public.g(public.k_tru(), 'efectivo', 500, p_mov => public.k_m(2))$$, 'no es gasto');
select public.t_falla($$select retail.marcar_egreso_no_gasto(public.k_m(1), 'x')$$, 'ya está clasificado como gasto');
select public.t_falla($$select retail.marcar_egreso_no_gasto(public.k_m(3), 'x')$$, 'Solo un egreso');
select public.t_falla($$select retail.marcar_egreso_no_gasto(public.k_m(2), 'otra vez')$$, 'ya estaba marcado');
select public.t_falla($$select retail.marcar_egreso_no_gasto(public.k_m(5), '  ')$$, 'Di por qué');
select retail.revertir_egreso_no_gasto((select v from ids where k = 'nog2'));
select public.t_ok((select count(*) from retail.fn_egresos_sin_clasificar()) = 3, 'T8 revertir la marca devuelve el egreso a «sin clasificar»');
select public.t_ok((select count(*) from retail.fn_egresos_no_gasto_lista()) = 0, 'T8 la marca revertida sale de la lista');
select public.t_falla($$select retail.revertir_egreso_no_gasto((select v from ids where k = 'nog2'))$$, 'ya fue revertida');
select retail.marcar_egreso_no_gasto(public.k_m(2), 'Depósito al banco, otra vez');   -- vuelve a marcarse tras revertir
select public.t_ok((select count(*) from retail.fn_egresos_sin_clasificar()) = 2, 'T8 tras revertir se puede volver a marcar');

-- ============================================================================
-- T9. Anular: no toca la caja; el egreso vuelve a «sin clasificar» y se puede reclasificar
-- ============================================================================
select public.t_falla($$select retail.anular_gasto((select v from ids where k = 'g2'), '  ')$$, 'exige un motivo');
select retail.anular_gasto((select v from ids where k = 'g2'), 'Monto mal tipeado');
select public.t_ok((select estado = 'anulado' and motivo_anulacion = 'Monto mal tipeado' and anulado_por is not null
                      from retail.gastos where id = (select v from ids where k = 'g2')), 'T9 el gasto quedó anulado con motivo y responsable');
select public.t_ok(public.n_mov() = 8, 'T9 anular NO tocó la caja: el egreso sigue ahí (la plata sí salió)');
select public.t_ok((select count(*) from retail.fn_egresos_sin_clasificar()) = 3, 'T9 su egreso volvió a «sin clasificar»');
select public.t_falla($$select retail.anular_gasto((select v from ids where k = 'g2'), 'otra vez')$$, 'ya estaba anulado');
select public.t_falla($$update retail.gastos set estado = 'vigente', motivo_anulacion = null, anulado_por = null, anulado_en = null
                          where id = (select v from ids where k = 'g2')$$, 'anulado no se puede modificar');
insert into ids select 'g5', public.g(public.k_tru(), 'efectivo', 45.50, p_mov => (select caja_movimiento_id from retail.gastos where id = (select v from ids where k = 'g2')));
select public.t_ok(public.n_gastos() = 7 and public.n_mov() = 8, 'T9 el egreso liberado se reclasifica con un gasto nuevo, sin mover la caja');

-- ============================================================================
-- T10. La pantalla: cada tarjeta solo se mueve con SUS gastos y nada se cuenta doble
-- ============================================================================
insert into ids select 'g6', public.g(null, 'transferencia', 300, p_cat => 'alquileres', p_desc => 'Oficina');
create temp table res as
  select * from retail.fn_egresos_resumen(current_date - 30, current_date + 1);
select public.t_ok((select count(*) from res) = 4, 'T10 4 tarjetas: TRU, AQP, Taller y «De la empresa» (la sede inactiva no sale)');
-- TRU: g1 118 + g3 20 + tk1 10 + tk2 12 + g5 45.50 = 205.50 ; g2 (anulado) NO suma
select public.t_ok((select total = 205.50 and n_gastos = 5 from res where ubicacion_id = public.k_tru()),
  'T10 TRU = 205.50 con 5 gastos: el anulado no suma');
select public.t_ok((select total = 30 from res where ubicacion_id = public.k_aqp()), 'T10 AQP = 30 (solo su gasto)');
select public.t_ok((select total = 0 and n_gastos = 0 from res where ubicacion_id = public.k_tal()), 'T10 el Taller sin gastos aparece en 0 (nadie registró nada)');
select public.t_ok((select total = 300 and por_categoria -> 0 ->> 'categoria' = 'alquileres' from res where ubicacion_id is null),
  'T10 «De la empresa» = 300, con su categoría');
select public.t_ok((select sum(total) from res) = (select sum(monto_total) from retail.gastos where estado = 'vigente'),
  'T10 la suma de las tarjetas es EXACTAMENTE la suma de gastos vigentes: los egresos de caja no se cuentan encima');
select public.t_ok((select sum(total) from res) = 535.50, 'T10 total = 535.50 (los egresos de caja sumaban más: no entran)');
select public.t_ok((select igv = 18 from res where ubicacion_id = public.k_tru()), 'T10 el IGV de la factura se suma en su sede');
select public.t_ok((select count(*) from retail.fn_gastos_lista(current_date - 30, current_date + 1)) = 8, 'T10 la lista trae vigentes y anulado (8)');
select public.t_ok((select count(*) from retail.fn_gastos_lista(current_date - 30, current_date + 1, p_solo_empresa => true)) = 1, 'T10 filtro «solo de la empresa»');
select public.t_ok((select count(*) from retail.fn_gastos_lista(current_date - 30, current_date + 1, public.k_tru())) = 6, 'T10 filtro por sede TRU (6, con el anulado)');
select public.t_ok((select count(*) from retail.fn_egresos_resumen(current_date + 5, current_date + 9) where total <> 0) = 0,
  'T10 un rango sin gastos deja todas las tarjetas en 0');

-- ============================================================================
-- T11. Permisos: solo el líder, y NADIE escribe directo
-- ============================================================================
select set_config('test.lider', 'false', false), set_config('test.uid', 'ffffffff-0000-4000-8000-00000000000b', false);
select public.t_falla($$select public.g(public.k_tru(), 'yape', 10)$$, 'Solo un líder');
select public.t_falla($$select retail.fn_egresos_resumen(current_date, current_date)$$, 'Solo un líder');
select public.t_falla($$select retail.fn_egresos_sin_clasificar()$$, 'Solo un líder');
select public.t_falla($$select retail.fn_gastos_lista(current_date, current_date)$$, 'Solo un líder');
select public.t_falla($$select retail.fn_egresos_no_gasto_lista()$$, 'Solo un líder');
select public.t_falla($$select retail.anular_gasto((select v from ids where k = 'g1'), 'x')$$, 'Solo un líder');
select public.t_falla($$select retail.marcar_egreso_no_gasto(public.k_m(5), 'x')$$, 'Solo un líder');
select public.t_falla($$select retail.revertir_egreso_no_gasto(gen_random_uuid())$$, 'Solo un líder');
set role authenticated;
select public.t_ok((select count(*) from retail.gastos) = 0, 'T11 una colaboradora NO ve ningún gasto (RLS)');
select public.t_ok((select count(*) from retail.categorias_gasto) = 0, 'T11 ni las categorías');
select set_config('test.lider', 'true', false);
select public.t_ok((select count(*) from retail.gastos) = 8, 'T11 un líder ve los 8');
select public.t_falla($$select public.ins('transferencia', null)$$, 'permission denied');
select public.t_falla($$update retail.gastos set descripcion = 'x'$$, 'permission denied');
select public.t_falla($$delete from retail.gastos$$, 'permission denied');
select public.t_falla($$insert into retail.egresos_no_gasto (caja_movimiento_id, motivo) values (public.k_m(5), 'x')$$, 'permission denied');
select public.t_falla($$insert into retail.categorias_gasto (codigo, nombre, cuenta_pcge, orden) values ('otros', 'Otros', '659', 8)$$, 'permission denied');
reset role;
select set_config('test.lider', 'true', false), set_config('test.uid', 'ffffffff-0000-4000-8000-00000000000a', false);

-- ============================================================================
-- T12. Estados imposibles: la TABLA los rechaza, incluso al dueño (una consola, un script)
-- ============================================================================
select public.t_falla($$select public.ins('efectivo', null)$$, 'gastos_efectivo_ssi_egreso');
select public.t_falla($$select public.ins('yape', public.k_m(5))$$, 'gastos_efectivo_ssi_egreso');
select public.t_falla($$select public.ins('transferencia', null, 10, 'boleta', 5)$$, 'gastos_igv_solo_factura');
select public.t_falla($$select public.ins('transferencia', null, 10, 'factura', 20, 'F001-9')$$, 'gastos_igv_menor_al_total');
select public.t_falla($$select public.ins('transferencia', null, 10, 'factura', 0, null)$$, 'gastos_factura_con_numero');
select public.t_falla($$select public.ins('transferencia', null, 10, 'boleta', 0, null, 'anulado')$$, 'gastos_anulacion_coherente');
select public.t_falla($$select public.ins('efectivo', public.k_m(3), 100)$$, 'no con un ingreso');
select public.t_falla($$select public.ins('efectivo', public.k_m(5), 99)$$, 'no coincide');
select public.t_falla($$select public.ins('efectivo', public.k_m(6), 10, p_ubic => public.k_tru())$$, 'otra sede');
select public.ins('efectivo', public.k_m(5), 10);
select public.t_ok(true, 'T12 un egreso válido entra directo (control: los rechazos de arriba no son por casualidad)');
select public.t_falla($$select public.ins('efectivo', public.k_m(5), 10)$$, 'gastos_egreso_vigente_uq');
select public.t_falla($$insert into retail.egresos_no_gasto (caja_movimiento_id, motivo) values (public.k_m(5), 'x')$$, 'ya está clasificado como gasto');
select public.t_falla($$delete from retail.gastos where id = (select v from ids where k = 'g1')$$, 'no se borra');
select public.t_falla($$update retail.gastos set monto_total = 1 where id = (select v from ids where k = 'g1')$$, 'solo puede cambiar para anularse');
select public.t_falla($$update retail.gastos set descripcion = 'otro' where id = (select v from ids where k = 'g1')$$, 'solo puede cambiar para anularse');
select public.t_falla($$update retail.gastos set estado = 'anulado', motivo_anulacion = 'x', anulado_por = 'bbbbbbbb-0000-4000-8000-00000000000a',
                          anulado_en = now(), monto_total = 999 where id = (select v from ids where k = 'g1')$$, 'no se edita');
select public.t_falla($$delete from retail.egresos_no_gasto$$, 'no se borra');
select public.t_falla($$update retail.egresos_no_gasto set motivo = 'cambiado' where revertido_en is null$$, 'solo puede cambiar para revertirse');
select public.t_ok((select count(*) from retail.gastos) = 9, 'T12 tras todos los intentos solo entró el gasto válido de control');

select 'TOTAL DE VERIFICACIONES OK: ' || n as resultado from public.t_cuenta;
