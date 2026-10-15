#!/usr/bin/env node
/**
 * El aviso al entrar de la tienda online (ADR-0408; Felipe 2026-10-14: «si no le llegan los avisos por WhatsApp, cuando inicie sesión
 * igual le debe salir algún mensaje») contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015045000_tienda_avisos_al_entrar.sql` (`retail.tienda_mis_avisos_del_club`):
 *   E. Estructura: security definer, con su search_path, `stable` (no escribe nada) y solo de `tienda_web` (ni anon, ni authenticated,
 *      ni public).
 *   C. El cumpleaños sale solo DISPONIBLE (es su mes y no lo usó este año), con el % de `fn_club_beneficios` y hasta el último día del
 *      mes; con un canje vivo no sale y, si se anula, vuelve; otro mes, sin cumpleaños en la ficha, ficha archivada: no sale. Sin cuenta
 *      o sin usuario: null.
 *   V. El vale sale solo DISPONIBLE, con el monto, el vencimiento y el aniversario de `fn_club_aniversario_calculo` (la cuenta de la caja).
 *   L. «Llegó»: una espera viva cuya prenda se ve en la web y tiene algo libre en SU tienda (o en alguna, si le daba igual), con dónde
 *      hay. Lo de otra tienda, lo de Cuarentena, lo apartado, lo que no se ve en la web, lo quitado y lo de otra cuenta no salen.
 *   X. Dice lo MISMO que «Mi cuenta» (`tienda_mi_club`), ficha por ficha: cumpleaños disponible, vale disponible y lo que llegó. Si una
 *      de las dos cambia su regla y la otra no, esta prueba lo dice.
 *   W. No anota la visita de «Mi cuenta» (`cuentas_web_visitas`): `tienda_mi_club` sí la anota; esta no toca nada.
 *   M. Mutantes: el candado del canje y el de «se ve en la web», rotos a propósito dentro de la transacción, se notan.
 *   P. Se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: muestra Trujillo y Lima en la web («ZZ …»), deja publicadas solo Blusa Emma y
 * Falda Renata, deja sin nada libre las dos prendas de la prueba y crea sus fichas (DNI 0996xxxx) y sus cuentas web. Nada queda en el
 * Postgres local que comparten los worktrees. Para actuar como `tienda_web`, quien corre la prueba se da ese rol dentro de la
 * transacción (se revierte).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete la migración dentro de cada transacción (que se revierte). Sin la variable, prueba lo
 * que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed (Blusa Emma con BLU-EMMA-NEG-M y BLU-EMMA-BEI-M, Falda Renata; Tienda Trujillo y Tienda Lima), la tienda
 * (20261014220000…231000), el Club en la cuenta (20261015024000 y 20261015025000) y el Club (ADR-0288: `fn_club_beneficios`,
 * `fn_club_aniversario_calculo`, `club_canjes`).
 *
 * USO
 *   pnpm pruebas:tienda-avisos    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-avisos -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261015045000_tienda_avisos_al_entrar.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES === "1" ? readFileSync(MIGRACION, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 10).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

// ---- Los datos de esta corrida ----
const CORRIDA = Date.now().toString(36);
const U = { ana: randomUUID(), bea: randomUUID(), ceci: randomUUID(), dora: randomUUID(), eva: randomUUID(), nadie: randomUUID() };
const CORREO = (quien) => `zz.aviso.${quien}.${CORRIDA}@ejemplo.com`;
const DNI = { ana: "09960001", bea: "09960002", ceci: "09960003", dora: "09960004", eva: "09960005" };

const AYUDAS = `
-- Deja n unidades más en un lugar (una «entrada» del libro).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer, p_motivo text default 'prueba') returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, p_motivo, 'prueba tienda avisos') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
-- Deja SIN nada libre una prenda en una tienda: aparta (en el libro) lo libre del piso, el almacén y la fila sin lugar.
create function pg_temp.vaciar(p_v uuid, p_u uuid) returns void language plpgsql as $f$
declare r record; v_mov uuid;
begin
  for r in select st.sububicacion_id, st.cantidad - st.cantidad_apartada as libres
             from retail.stock st left join retail.sububicaciones s on s.id = st.sububicacion_id
            where st.variante_id = p_v and st.ubicacion_id = p_u and st.cantidad - st.cantidad_apartada > 0
              and (s.id is null or s.tipo in ('almacen_tienda', 'piso_venta'))
  loop
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba tienda avisos: piso de partida') returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;
end $f$;
-- Una compra de la ficha el día p_dia (Lima, al mediodía), directo en las tablas (como club_aniversario.mjs).
create function pg_temp.compra(p_cli uuid, p_ubic uuid, p_dia date, p_precio numeric) returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, cliente_id, created_at, estado, es_prueba)
  values (p_ubic, p_cli, (p_dia::timestamp + interval '12 hours') at time zone 'America/Lima', 'completada', false)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  select v, va.id, 1, p_precio, 1 from retail.variantes va order by va.id limit 1;
  return v;
end $f$;
-- Una espera viva, directo en la tabla (lo que hace «Avísame» cuando no hay; aquí no importa si hay o no al anotarla).
create function pg_temp.esperar(p_cuenta uuid, p_v uuid, p_u uuid) returns uuid language sql as $f$
  insert into retail.esperas_web (cuenta_web_id, variante_id, ubicacion_id) values (p_cuenta, p_v, p_u) returning id;
$f$;
-- La versión viva de una función con un pedazo cambiado (un MUTANTE). Si el pedazo no está, falla: el mutante no sería tal.
create function pg_temp.mutar(p_firma text, p_de text, p_a text) returns void language plpgsql as $f$
declare v text := pg_get_functiondef(p_firma::regprocedure);
begin
  if position(p_de in v) = 0 then
    raise exception 'mutante vacío: % no tiene «%»', p_firma, p_de;
  end if;
  execute replace(v, p_de, p_a);
end $f$;
`;

// Cada escenario parte con Trujillo y Lima en la web, solo Blusa Emma y Falda Renata publicadas, v1 y v2 sin nada libre, nadie esperando
// nada, y cinco fichas con su cuenta web: Ana (socia hace 400 días, cumple este mes), Bea (socia, cumple otro mes), Ceci (archivada, cumple
// este mes), Dora (socia sin cumpleaños) y Eva (socia hace 1 año y 3 días, con 6 compras en su primer año: su vale está disponible).
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0996%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0996xxxx en esta base.';
  end if;
end $$;
${AYUDAS}
select retail.fn_hoy_lima() as hoy \\gset
select extract(month from retail.fn_hoy_lima())::int as mes_hoy \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, n, t from (values (:'tru'::uuid, 'Piso de venta', 'piso_venta'), (:'tru'::uuid, 'Cuarentena', 'cuarentena'),
                              (:'lim'::uuid, 'Piso de venta', 'piso_venta')) x(u, n, t)
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = x.u and s.tipo = x.t);
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' order by id limit 1 \\gset
select id as tru_cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' order by id limit 1 \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' order by id limit 1 \\gset
update retail.vitrina_productos set publicado = false where publicado;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
insert into retail.vitrina_productos (producto_id, publicado, publicado_en) values (:'emma', true, now()), (:'falda', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now(), en_lo_nuevo = 'automatico';
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2 from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select pg_temp.vaciar(:'v1', :'tru') as _v1, pg_temp.vaciar(:'v1', :'lim') as _v2, pg_temp.vaciar(:'v2', :'tru') as _v3, pg_temp.vaciar(:'v2', :'lim') as _v4 \\gset
update retail.esperas_web set quitada_en = now() where quitada_en is null;
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, club_desde, codigo_club)
values ('dni', '${DNI.ana}', 'Ana Prueba Aviso', '987000801', 3, :mes_hoy, now() - interval '400 days', retail.fn_club_codigo_nuevo())
returning id as ana_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, club_desde, codigo_club)
values ('dni', '${DNI.bea}', 'Bea Prueba Aviso', '987000802', 9, (:mes_hoy % 12) + 1, now() - interval '10 days', retail.fn_club_codigo_nuevo())
returning id as bea_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, cumple_dia, cumple_mes, archivada_en, motivo_archivo)
values ('dni', '${DNI.ceci}', 'Ceci Prueba Archivada', 5, :mes_hoy, now(), 'prueba de la tienda') returning id as ceci_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club)
values ('dni', '${DNI.dora}', 'Dora Prueba Sin Cumple', '987000804', now() - interval '20 days', retail.fn_club_codigo_nuevo())
returning id as dora_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, club_desde, codigo_club)
values ('dni', '${DNI.eva}', 'Eva Prueba Vale', '987000805', 1, (:mes_hoy % 12) + 1,
        ((retail.fn_hoy_lima() - interval '1 year' - interval '3 days')::date::timestamp + interval '12 hours') at time zone 'America/Lima',
        retail.fn_club_codigo_nuevo())
returning id as eva_c \\gset
select count(pg_temp.compra(:'eva_c', :'lim', (retail.fn_hoy_lima() - interval '1 year' + make_interval(days => 5 + k))::date, 50))
  from generate_series(1, 6) k \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values
  ('${U.ana}', :'ana_c', '${CORREO("ana")}', 'borrador-2026-10-14'),
  ('${U.bea}', :'bea_c', '${CORREO("bea")}', 'borrador-2026-10-14'),
  ('${U.ceci}', :'ceci_c', '${CORREO("ceci")}', 'borrador-2026-10-14'),
  ('${U.dora}', :'dora_c', '${CORREO("dora")}', 'borrador-2026-10-14'),
  ('${U.eva}', :'eva_c', '${CORREO("eva")}', 'borrador-2026-10-14');
select id as ana_w from retail.cuentas_web where usuario_web_id = '${U.ana}' \\gset
select id as bea_w from retail.cuentas_web where usuario_web_id = '${U.bea}' \\gset
select id as ceci_w from retail.cuentas_web where usuario_web_id = '${U.ceci}' \\gset
`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
const COMO_POSTGRES = `reset role;\n`;
const FIN = "rollback;\n";
const escenario = (cuerpo) => correr(`${PREPARAR}${cuerpo}\n${FIN}`);

/** Lo que dice el aviso de una cuenta, guardado en una variable de psql (como `tienda_web`). */
const AVISOS = (u, alias) => `${COMO_TIENDA}select retail.tienda_mis_avisos_del_club('${u}') as ${alias} \\gset\n${COMO_POSTGRES}`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (correr("select to_regprocedure('retail.tienda_mi_club(uuid)') is not null;").salida !== "t") {
    console.error("Falta el Club en la cuenta (20261015024000 y 20261015025000): esta prueba lo da por sentado.");
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regprocedure('retail.tienda_mis_avisos_del_club(uuid)') is not null;").salida !== "t") {
    console.error(`Falta el aviso al entrar: aplica ${MIGRACION} o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const preparado = correr(`${PREPARAR}select 'listo';\n${FIN}`);
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  // =================================================================================================================
  console.log("— E. Estructura —");
  esperarValor(
    "security definer, con su search_path, stable (no escribe) y solo para tienda_web",
    correr(`begin;\n${APLICAR_ANTES}
      select concat_ws(':', (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text,
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text,
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))::text,
             p.provolatile)
        from pg_proc p where p.oid = 'retail.tienda_mis_avisos_del_club(uuid)'::regprocedure;
      ${FIN}`),
    "true:true:false:s",
  );

  // =================================================================================================================
  console.log("— C. El cumpleaños —");
  esperarValor(
    "es su mes y no lo usó: sale, con el % de la caja y hasta el último día del mes; sin vale (todavía en camino) ni nada que llegó",
    escenario(`${AVISOS(U.ana, "a")}
      select concat_ws('|', (:'a'::jsonb -> 'cumple' ->> 'pct')::numeric = (select pct from retail.fn_club_beneficios()),
        (:'a'::jsonb -> 'cumple' ->> 'hasta')::date = (date_trunc('month', :'hoy'::date) + interval '1 month - 1 day')::date,
        jsonb_typeof(:'a'::jsonb -> 'vale'), jsonb_array_length(:'a'::jsonb -> 'llegaron'));`),
    "t|t|null|0",
  );
  esperarValor(
    "con un canje de cumpleaños vivo este año no sale; si el canje se anula, vuelve a salir",
    escenario(`select pg_temp.compra(:'ana_c', :'lim', retail.fn_hoy_lima(), 80) as venta \\gset
      insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto)
      values (:'ana_c', :'venta', 'cumpleanos', extract(year from retail.fn_hoy_lima()), 10, 8) returning id as canje \\gset
      ${AVISOS(U.ana, "a1")}
      update retail.club_canjes set anulado_en = now() where id = :'canje';
      ${AVISOS(U.ana, "a2")}
      select jsonb_typeof(:'a1'::jsonb -> 'cumple') || '|' || jsonb_typeof(:'a2'::jsonb -> 'cumple');`),
    "null|object",
  );
  esperarValor(
    "otro mes, sin cumpleaños en la ficha o con la ficha archivada (aunque sea su mes): no sale; sin cuenta o sin usuario: null",
    escenario(`${AVISOS(U.bea, "b")}${AVISOS(U.dora, "d")}${AVISOS(U.ceci, "c")}
      select concat_ws('|', jsonb_typeof(:'b'::jsonb -> 'cumple'), jsonb_typeof(:'d'::jsonb -> 'cumple'), jsonb_typeof(:'c'::jsonb -> 'cumple'),
                       jsonb_typeof(:'c'::jsonb -> 'vale'));
      ${COMO_TIENDA}
      select (retail.tienda_mis_avisos_del_club('${U.nadie}') is null)::text || '|' || (retail.tienda_mis_avisos_del_club(null) is null)::text;`),
    "null|null|null|null\ntrue|true",
  );

  // =================================================================================================================
  console.log("— V. El vale por aniversario —");
  esperarValor(
    "con 6 compras en su primer año, el vale disponible: el monto, el vencimiento y el aniversario de la cuenta de la caja",
    escenario(`${AVISOS(U.eva, "e")}
      select concat_ws('|',
        (:'e'::jsonb -> 'vale' ->> 'monto')::numeric = (select vale_monto from retail.fn_club_aniversario_calculo(:'eva_c')),
        (:'e'::jsonb -> 'vale' ->> 'vence')::date = (select vale_vence from retail.fn_club_aniversario_calculo(:'eva_c')),
        (:'e'::jsonb -> 'vale' ->> 'aniversario')::date = (select vale_aniversario from retail.fn_club_aniversario_calculo(:'eva_c')),
        (select vale_disponible from retail.fn_club_aniversario_calculo(:'eva_c')),
        jsonb_typeof(:'e'::jsonb -> 'cumple'));`),
    "t|t|t|t|null",
  );

  // =================================================================================================================
  console.log("— L. Lo que esperaba y ya llegó —");
  esperarValor(
    "esperaba la M negra en Trujillo: sin nada ahí no sale (aunque haya en Lima); con una libre en Trujillo sale, con dónde hay",
    escenario(`select pg_temp.esperar(:'ana_w', :'v1', :'tru') as e1 \\gset
      ${AVISOS(U.ana, "a1")}
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      ${AVISOS(U.ana, "a2")}
      select pg_temp.dejar(:'v1', :'tru', :'tru_piso', 1) as _x \\gset
      ${AVISOS(U.ana, "a3")}
      select jsonb_array_length(:'a1'::jsonb -> 'llegaron') || '|' || jsonb_array_length(:'a2'::jsonb -> 'llegaron');
      select concat_ws('|', x ->> 'id' = :'e1', x ->> 'producto_id' = :'emma', x ->> 'producto', x ->> 'talla', x ->> 'sede', x ->> 'hay_en')
        from jsonb_array_elements(:'a3'::jsonb -> 'llegaron') x;`),
    '0|0\nt|t|Blusa Emma|M|ZZ Trujillo|["ZZ Lima", "ZZ Trujillo"]',
  );
  esperarValor(
    "esperaba en cualquier tienda: sale con lo libre de Lima, sin tienda propia; lo de Cuarentena y lo apartado no cuentan",
    escenario(`select pg_temp.esperar(:'ana_w', :'v1', null) as e1 \\gset
      select pg_temp.dejar(:'v1', :'tru', :'tru_cua', 3, 'devolucion') as _x \\gset
      select pg_temp.dejar(:'v1', :'tru', :'tru_piso', 1) as _x \\gset
      select pg_temp.vaciar(:'v1', :'tru') as _x \\gset
      ${AVISOS(U.ana, "a1")}
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 1) as _x \\gset
      ${AVISOS(U.ana, "a2")}
      select jsonb_array_length(:'a1'::jsonb -> 'llegaron');
      select concat_ws('|', coalesce(x ->> 'sede', 'cualquiera'), x ->> 'hay_en') from jsonb_array_elements(:'a2'::jsonb -> 'llegaron') x;`),
    '0\ncualquiera|["ZZ Lima"]',
  );
  esperarValor(
    "no sale lo quitado, lo que ya no se ve en la web, ni la espera de otra cuenta",
    escenario(`select pg_temp.esperar(:'ana_w', :'v1', null) as e_quitada \\gset
      update retail.esperas_web set quitada_en = now() where id = :'e_quitada';
      select pg_temp.esperar(:'ana_w', :'v2', null) as e_oculta \\gset
      select pg_temp.esperar(:'bea_w', :'v1', null) as e_bea \\gset
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      select pg_temp.dejar(:'v2', :'lim', :'lim_piso', 2) as _x \\gset
      ${AVISOS(U.ana, "a1")}
      update retail.vitrina_productos set publicado = false where producto_id = :'emma';
      ${AVISOS(U.ana, "a2")}${AVISOS(U.bea, "b")}
      select concat_ws('|', (select string_agg(x ->> 'id', ',') from jsonb_array_elements(:'a1'::jsonb -> 'llegaron') x) = :'e_oculta',
                       jsonb_array_length(:'a2'::jsonb -> 'llegaron'), jsonb_array_length(:'b'::jsonb -> 'llegaron'));`),
    "t|0|0",
  );

  // =================================================================================================================
  console.log("— X. Dice lo mismo que «Mi cuenta» —");
  esperarValor(
    "ficha por ficha (Ana, Bea, Ceci, Dora, Eva, y Ana con un canje): cumpleaños disponible, vale disponible y lo que llegó, igual que tienda_mi_club",
    escenario(`select pg_temp.esperar(:'ana_w', :'v1', :'tru') as _a \\gset
      select pg_temp.esperar(:'ana_w', :'v2', null) as _b \\gset
      select pg_temp.esperar(:'bea_w', :'v1', null) as _c \\gset
      select pg_temp.dejar(:'v1', :'tru', :'tru_piso', 1) as _x \\gset
      select pg_temp.dejar(:'v2', :'lim', :'lim_piso', 1) as _x \\gset
      create temp table pg_temp.comparar (quien text, avisos jsonb, club jsonb) on commit drop;
      insert into pg_temp.comparar
        select q, retail.tienda_mis_avisos_del_club(u), retail.tienda_mi_club(u)
          from (values ('ana', '${U.ana}'::uuid), ('bea', '${U.bea}'::uuid), ('ceci', '${U.ceci}'::uuid),
                       ('dora', '${U.dora}'::uuid), ('eva', '${U.eva}'::uuid)) x (q, u);
      ${COMO_POSTGRES}
      select pg_temp.compra(:'ana_c', :'lim', retail.fn_hoy_lima(), 80) as venta \\gset
      insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto)
      values (:'ana_c', :'venta', 'cumpleanos', extract(year from retail.fn_hoy_lima()), 10, 8);
      insert into pg_temp.comparar select 'ana-canje', retail.tienda_mis_avisos_del_club('${U.ana}'), retail.tienda_mi_club('${U.ana}');
      select string_agg(quien || ':' || (
               ((avisos -> 'cumple') <> 'null'::jsonb) = (club -> 'club' -> 'cumple' ->> 'estado' = 'disponible')
           and ((avisos -> 'vale') <> 'null'::jsonb) = (club -> 'club' -> 'aniversario' ->> 'estado' = 'vale')
           and coalesce((avisos -> 'cumple' ->> 'hasta')::date = (club -> 'club' -> 'cumple' ->> 'hasta')::date, true)
           and coalesce((avisos -> 'vale' ->> 'monto')::numeric = (club -> 'club' -> 'aniversario' ->> 'vale_monto')::numeric, true)
           and coalesce((avisos -> 'vale' ->> 'vence')::date = (club -> 'club' -> 'aniversario' ->> 'vale_vence')::date, true)
           and coalesce((select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(avisos -> 'llegaron') x), '{}')
             = coalesce((select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(club -> 'esperas') x
                          where (x ->> 'llego')::boolean and (x ->> 'se_ve')::boolean), '{}'))::text, ',' order by quien)
        from pg_temp.comparar;
      select string_agg(quien || ':' || ((avisos -> 'cumple') <> 'null'::jsonb)::text || '/' || ((avisos -> 'vale') <> 'null'::jsonb)::text
                        || '/' || jsonb_array_length(avisos -> 'llegaron'), ',' order by quien)
        from pg_temp.comparar;`),
    "ana:true,ana-canje:true,bea:true,ceci:true,dora:true,eva:true\nana:true/false/2,ana-canje:false/false/2,bea:false/false/1,ceci:false/false/0,dora:false/false/0,eva:false/true/0",
  );

  // =================================================================================================================
  console.log("— W. No anota la visita de «Mi cuenta» —");
  esperarValor(
    "llamarla no escribe en cuentas_web_visitas (tienda_mi_club sí anota la visita)",
    escenario(`${COMO_TIENDA}
      select retail.tienda_mis_avisos_del_club('${U.ana}') is not null as _a \\gset
      select retail.tienda_mis_avisos_del_club('${U.ana}') is not null as _b \\gset
      ${COMO_POSTGRES}
      select count(*) as antes from retail.cuentas_web_visitas where cuenta_web_id = :'ana_w' \\gset
      ${COMO_TIENDA}
      select retail.tienda_mi_club('${U.ana}') is not null as _c \\gset
      ${COMO_POSTGRES}
      select :'antes' || '|' || (select count(*) from retail.cuentas_web_visitas where cuenta_web_id = :'ana_w');`),
    "0|1",
  );

  // =================================================================================================================
  console.log("— M. Mutantes: cada candado, roto a propósito, se nota —");
  esperarValor(
    "MUTANTE el cumpleaños sin mirar el canje: después de usarlo sigue saliendo (la prueba C lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_mis_avisos_del_club(uuid)', 'and k.anulado_en is null) then', 'and k.anulado_en is null and false) then');
      select pg_temp.compra(:'ana_c', :'lim', retail.fn_hoy_lima(), 80) as venta \\gset
      insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto)
      values (:'ana_c', :'venta', 'cumpleanos', extract(year from retail.fn_hoy_lima()), 10, 8);
      ${AVISOS(U.ana, "a")}
      select jsonb_typeof(:'a'::jsonb -> 'cumple');`),
    "object",
  );
  esperarValor(
    "MUTANTE «llegó» sin mirar si se ve en la web: un modelo oculto sale igual (la prueba L lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_mis_avisos_del_club(uuid)', 'and retail.fn_tienda_modelo_se_ve(v.producto_id)', '');
      select pg_temp.esperar(:'ana_w', :'v1', null) as _e \\gset
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      update retail.vitrina_productos set publicado = false where producto_id = :'emma';
      ${AVISOS(U.ana, "a")}
      select jsonb_array_length(:'a'::jsonb -> 'llegaron');`),
    "1",
  );

  // =================================================================================================================
  console.log("— P. Se puede pegar dos veces —");
  const sql = readFileSync(MIGRACION, "utf8");
  esperarValor(
    "la migración, dos veces seguidas (como un segundo pegado): no falla y deja una sola función",
    correr(`begin;\n${sql}\n${sql}
      select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'tienda_mis_avisos_del_club';
      ${FIN}`),
    "1",
  );
}

main();
console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);
