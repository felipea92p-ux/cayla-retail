#!/usr/bin/env node
/**
 * El Club en la cuenta de la tienda online (ADR-0408, actividad 12) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015024000_tienda_favoritos_y_esperas.sql`, `20261015025000_tienda_mi_club.sql` y
 * `20261015030000_vitrina_esperan_una_talla.sql`:
 *   E. Estructura: `favoritos_web`, `esperas_web` y `cuentas_web_visitas` con RLS, sin políticas y sin permisos para nadie (ni
 *      `tienda_web`); las cinco `tienda_*` nuevas son security definer, con su search_path y solo de `tienda_web`; las piezas
 *      internas no las ejecuta nadie de la API; `fn_vitrina_esperan` es del ERP (authenticated), nunca de anon ni de la tienda.
 *   F. Favoritos: guardar y quitar son idempotentes (nunca «alternan»), quitar no borra y volver a guardar reactiva; solo se guarda
 *      lo que se ve en la web; sin cuenta, con datos vacíos o con la ficha archivada no se agrega nada (pero quitar sí); el tope de
 *      100; cada cuenta ve solo lo suyo.
 *   A. «Avísame»: se anota por prenda y tienda (o cualquier tienda) una sola vez; si HAY libre en ese alcance responde `hay` sin
 *      escribir; una tienda que no se ve en la web se lee como «cualquier tienda»; lo de Cuarentena y lo apartado no cuentan como
 *      «hay»; lo que no se ve en la web, la ficha archivada y la cuenta que no existe no anotan nada; el tope de 30.
 *   Q. Quitar una espera: la ajena (o una que no existe) responde `no_esta` sin tocarla; la propia se marca (no se borra), dos
 *      veces da lo mismo y después se puede volver a pedir.
 *   C. `tienda_mi_club`: el cumpleaños con la MISMA regla que cobra la caja (disponible en su mes, canjeado este año con su fecha,
 *      próximo, sin fecha, sin club), el aniversario con `fn_club_aniversario_calculo` (en camino, con su vale disponible y su
 *      vencimiento), los favoritos y las esperas con su prenda, su tienda, si llegó y dónde hay; «Novedades para ti» con la
 *      primera llegada a una tienda de la web (sin la carga inicial, sin lo quitado de Lo nuevo, sin lo que no tiene nada libre, y
 *      una reposición de algo que ya estaba no es novedad) y «desde tu última visita» (la de antes, no la de hoy).
 *   V. `fn_vitrina_esperan` (ERP): sin el módulo `vitrina_web`, 42501; con él, cuántas personas esperan cada prenda y tienda, desde
 *      cuándo, si llegó y dónde hay, sin ningún dato personal; lo quitado no cuenta.
 *   D. Un modelo sin historia que se elimina (`eliminar_producto`) se lleva sus favoritos y sus esperas: son SUYAS (on delete
 *      cascade, como su fila de la Vitrina; clasificadas así en scripts/pruebas/eliminar_producto.mjs).
 *   M. Mutantes: cada candado se rompe a propósito dentro de la transacción (la función viva con una línea menos) y la prueba lo
 *      nota. Si un mutante pasara, la prueba de arriba no estaría mirando nada.
 *   P. Las tres partes se pueden pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: muestra Trujillo y Lima en la web («ZZ …»), deja publicadas solo Blusa Emma
 * y Falda Renata, deja sin nada libre las dos prendas de la prueba (apartando en el libro lo libre) y crea sus fichas (DNI
 * 0997xxxx) y sus cuentas web. Nada queda en el Postgres local que comparten los worktrees. Para actuar como `tienda_web`, quien
 * corre la prueba se da ese rol dentro de la transacción (se revierte). Lo que NO se prueba aquí: dos pestañas a la vez en dos
 * conexiones (los datos de la prueba no se commitean, y otra conexión no los ve); lo cubren el `for update` de la cuenta y el
 * índice único de las esperas vivas, que la base hace cumplir sola.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete las tres partes dentro de cada transacción (que se revierte). Sin la variable,
 * prueba lo que la base ya tiene (lo que hace el CI). `APLICAR_ANTES=<p1>,<p2>,<p3>` prueba otras (una copia rota a propósito).
 *
 * DA POR SENTADO: el seed (Felipe líder; Micaela integrante sin la Vitrina web; Blusa Emma con BLU-EMMA-NEG-M y BLU-EMMA-BEI-M,
 * Falda Renata y Vestido Sofía; Tienda Trujillo y Tienda Lima), la tienda (20261014220000…231000), los pedidos web no hacen falta,
 * y el Club (ADR-0288: `fn_club_beneficios`, `fn_club_aniversario_calculo`, `club_canjes`, `club_aniversario_escala`).
 *
 * USO
 *   pnpm pruebas:tienda-club    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-club -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261015024000_tienda_favoritos_y_esperas.sql",
  "supabase/migrations/20261015025000_tienda_mi_club.sql",
  "supabase/migrations/20261015030000_vitrina_esperan_una_talla.sql",
];
const ANTES = process.env.APLICAR_ANTES ?? "";
const APLICAR_ANTES = ANTES ? (ANTES === "1" ? MIGRACIONES : ANTES.split(",")).map((m) => readFileSync(m.trim(), "utf8")).join("\n") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante: su rol no tiene la Vitrina web

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
const CORREO = (quien) => `zz.${quien}.${CORRIDA}@ejemplo.com`;
const DNI = { ana: "09970001", bea: "09970002", ceci: "09970003", dora: "09970004", eva: "09970005" };

const AYUDAS = `
-- Corre una sentencia y devuelve 'ok' o '<sqlstate>|<hint>' (lo que hizo se queda si salió bien).
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end $f$;
-- Deja n unidades más en un lugar (una «entrada» del libro), con su hora y su motivo.
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer, p_motivo text default 'prueba',
                              p_en timestamptz default now()) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota, created_at)
    values (p_v, p_u, p_sub, 'entrada', p_n, p_motivo, 'prueba tienda club', p_en) returning id into v_mov;
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
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba tienda club: piso de partida') returning id into v_mov;
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
-- Un modelo nuevo de una talla (el color y la talla de otra prenda), publicado en la vitrina. Devuelve su prenda.
create function pg_temp.modelo(p_nombre text, p_como uuid, p_en_lo_nuevo text default 'automatico') returns uuid language plpgsql as $f$
declare v_p uuid; v_v uuid;
begin
  insert into retail.productos (referencia, categoria_id)
    select p_nombre, p.categoria_id from retail.productos p join retail.variantes v on v.producto_id = p.id where v.id = p_como
  returning id into v_p;
  insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo, activo)
    select v_p, v.color_codigo, v.talla_id, 50, 10, true from retail.variantes v where v.id = p_como
  returning id into v_v;
  insert into retail.vitrina_productos (producto_id, publicado, publicado_en, en_lo_nuevo) values (v_p, true, now(), p_en_lo_nuevo);
  return v_v;
end $f$;
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

// Cada escenario parte con Trujillo y Lima en la web, solo Blusa Emma y Falda Renata publicadas, v1 y v2 sin nada libre, y cinco
// fichas con su cuenta web: Ana (socia hace 400 días, cumple este mes), Bea (socia, cumple otro mes), Ceci (archivada), Dora
// (socia sin cumpleaños) y Eva (socia hace 1 año y 3 días, con 6 compras en su primer año: su vale está disponible).
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0997%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0997xxxx en esta base.';
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
  select u, n, t from (values (:'tru'::uuid, 'Piso de venta', 'piso_venta'), (:'tru'::uuid, 'Almacén de tienda', 'almacen_tienda'),
                              (:'tru'::uuid, 'Cuarentena', 'cuarentena'), (:'lim'::uuid, 'Piso de venta', 'piso_venta')) x(u, n, t)
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = x.u and s.tipo = x.t);
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' order by id limit 1 \\gset
select id as tru_cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' order by id limit 1 \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' order by id limit 1 \\gset
update retail.vitrina_productos set publicado = false where publicado;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as vestido from retail.productos where referencia = 'Vestido Sofía' \\gset
insert into retail.vitrina_productos (producto_id, publicado, publicado_en) values (:'emma', true, now()), (:'falda', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now(), en_lo_nuevo = 'automatico';
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2 from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select id as v_vestido from retail.variantes where producto_id = :'vestido' and activo order by id limit 1 \\gset
select pg_temp.vaciar(:'v1', :'tru') as _v1, pg_temp.vaciar(:'v1', :'lim') as _v2, pg_temp.vaciar(:'v2', :'tru') as _v3, pg_temp.vaciar(:'v2', :'lim') as _v4 \\gset
-- Nadie espera nada todavía (lo que hubiera en la base, quitado dentro de la transacción): «Esperan una talla» cuenta solo lo de aquí.
update retail.esperas_web set quitada_en = now() where quitada_en is null;
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, club_desde, codigo_club)
values ('dni', '${DNI.ana}', 'Ana Prueba Club', '987000701', 3, :mes_hoy, now() - interval '400 days', retail.fn_club_codigo_nuevo())
returning id as ana_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, club_desde, codigo_club)
values ('dni', '${DNI.bea}', 'Bea Prueba Club', '987000702', 9, (:mes_hoy % 12) + 1, now() - interval '10 days', retail.fn_club_codigo_nuevo())
returning id as bea_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
values ('dni', '${DNI.ceci}', 'Ceci Prueba Archivada', now(), 'prueba de la tienda') returning id as ceci_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club)
values ('dni', '${DNI.dora}', 'Dora Prueba Sin Cumple', '987000704', now() - interval '20 days', retail.fn_club_codigo_nuevo())
returning id as dora_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, club_desde, codigo_club)
values ('dni', '${DNI.eva}', 'Eva Prueba Vale', '987000705', 1, (:mes_hoy % 12) + 1,
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
/** Como una cuenta del ERP (claims reales y el rol authenticated, para que fn_exigir_modulo pregunte de verdad). */
const COMO = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
set local role authenticated;
`;
const FIN = "rollback;\n";
const escenario = (cuerpo) => correr(`${PREPARAR}${cuerpo}\n${FIN}`);

/** Un campo de la respuesta de una función tienda_* (como texto). */
const fav = (u, prod, guardar) => `retail.tienda_favorito('${u}', ${prod}, ${guardar})`;
const avisa = (u, v, sede) => `retail.tienda_avisame('${u}', ${v}, ${sede})`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regclass('retail.esperas_web') is not null and to_regprocedure('retail.fn_vitrina_esperan()') is not null;").salida !== "t") {
    console.error(`Falta el Club en la cuenta: aplica ${MIGRACIONES.join(", ")} o corre con APLICAR_ANTES=1`);
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
    "favoritos_web, esperas_web y cuentas_web_visitas: RLS, ninguna política y ningún permiso para public, anon, authenticated ni tienda_web",
    correr(`begin;\n${APLICAR_ANTES}
      select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || (select count(*) from pg_policy p where p.polrelid = c.oid) || ':' ||
             (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE'))::text, ',' order by c.relname)
        from pg_class c where c.oid in ('retail.favoritos_web'::regclass, 'retail.esperas_web'::regclass, 'retail.cuentas_web_visitas'::regclass);
      ${FIN}`),
    "cuentas_web_visitas:true:0:false,esperas_web:true:0:false,favoritos_web:true:0:false",
  );
  const DE_LA_TIENDA = [
    "tienda_avisame(uuid,uuid,uuid)",
    "tienda_favorito(uuid,uuid,boolean)",
    "tienda_mi_club(uuid)",
    "tienda_mis_favoritos_y_esperas(uuid)",
    "tienda_quitar_avisame(uuid,uuid)",
  ];
  esperarValor(
    "las cinco tienda_* nuevas: security definer, con su search_path, solo para tienda_web",
    correr(`begin;\n${APLICAR_ANTES}
      select string_agg(f || ':' || (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text || ':' ||
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text || ':' ||
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))::text, ',' order by f collate "C")
        from unnest(array[${DE_LA_TIENDA.map((f) => `'${f}'`).join(", ")}]) f
        join pg_proc p on p.oid = ('retail.' || f)::regprocedure;
      ${FIN}`),
    DE_LA_TIENDA.map((f) => `${f}:true:true:false`).join(","),
  );
  esperarValor(
    "las piezas internas no las ejecuta nadie de la API (tampoco tienda_web); fn_vitrina_esperan es de authenticated y no de anon ni de la tienda",
    correr(`begin;\n${APLICAR_ANTES}
      select bool_or(has_function_privilege(r, f, 'EXECUTE'))::text
        from unnest(array['retail.fn_tienda_sedes_ids()', 'retail.fn_tienda_libre(uuid, uuid[])', 'retail.fn_tienda_modelo_se_ve(uuid)',
                          'retail.fn_tienda_novedades(timestamptz, uuid[])']) f,
             unnest(array['tienda_web', 'anon', 'authenticated']) r;
      select concat_ws('|', has_function_privilege('authenticated', 'retail.fn_vitrina_esperan()', 'EXECUTE'),
                       has_function_privilege('anon', 'retail.fn_vitrina_esperan()', 'EXECUTE'),
                       has_function_privilege('tienda_web', 'retail.fn_vitrina_esperan()', 'EXECUTE'));
      ${FIN}`),
    "false\nt|f|f",
  );

  // =================================================================================================================
  console.log("— F. Favoritos —");
  esperarValor(
    "guardar dos veces deja uno; quitar dos veces lo deja quitado (sin borrar la fila); volver a guardar lo reactiva",
    escenario(`${COMO_TIENDA}
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado';
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado';
      select (retail.tienda_mis_favoritos_y_esperas('${U.ana}') -> 'favoritos') = jsonb_build_array(:'emma');
      select ${fav(U.ana, ":'emma'", false)} ->> 'estado';
      select ${fav(U.ana, ":'emma'", false)} ->> 'estado';
      select jsonb_array_length(retail.tienda_mis_favoritos_y_esperas('${U.ana}') -> 'favoritos');
      ${COMO_POSTGRES}
      select count(*) || ':' || count(quitado_en) from retail.favoritos_web where cuenta_web_id = :'ana_w';
      ${COMO_TIENDA}
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado';
      ${COMO_POSTGRES}
      select count(*) || ':' || count(quitado_en) from retail.favoritos_web where cuenta_web_id = :'ana_w';`),
    "guardado\nguardado\nt\nquitado\nquitado\n0\n1:1\nguardado\n1:0",
  );
  esperarValor(
    "no se guarda lo que no se ve en la web, ni sin cuenta, ni con datos vacíos, ni con la ficha archivada (y nada queda escrito)",
    escenario(`${COMO_TIENDA}
      select ${fav(U.ana, ":'vestido'", true)} ->> 'estado';
      select ${fav(U.ana, "gen_random_uuid()", true)} ->> 'estado';
      select ${fav(U.nadie, ":'emma'", true)} ->> 'estado';
      select retail.tienda_favorito(null, :'emma', true) ->> 'estado';
      select ${fav(U.ana, ":'emma'", "null")} ->> 'estado';
      select ${fav(U.ceci, ":'emma'", true)} ->> 'estado';
      ${COMO_POSTGRES}
      select count(*) from retail.favoritos_web where cuenta_web_id in (:'ana_w', :'ceci_w');`),
    "no_disponible\nno_disponible\nsin_cuenta\ninvalido\ninvalido\ncuenta_inactiva\n0",
  );
  esperarValor(
    "con la ficha archivada sí se puede QUITAR lo que ya estaba guardado",
    escenario(`insert into retail.favoritos_web (cuenta_web_id, producto_id) values (:'ceci_w', :'emma');
      ${COMO_TIENDA}
      select ${fav(U.ceci, ":'emma'", false)} ->> 'estado';
      ${COMO_POSTGRES}
      select count(quitado_en) from retail.favoritos_web where cuenta_web_id = :'ceci_w';`),
    "quitado\n1",
  );
  esperarValor(
    "el tope de 100: con 100 guardados el 101 dice «tope»; quitando uno, entra",
    escenario(`with nuevos as (
        insert into retail.productos (referencia) select 'ZZ Tope club ' || g || ' ${CORRIDA}' from generate_series(1, 100) g returning id)
      insert into retail.favoritos_web (cuenta_web_id, producto_id) select :'ana_w', id from nuevos;
      select producto_id as uno from retail.favoritos_web where cuenta_web_id = :'ana_w' order by producto_id limit 1 \\gset
      ${COMO_TIENDA}
      select (${fav(U.ana, ":'emma'", true)}) ->> 'estado';
      select ${fav(U.ana, ":'uno'", false)} ->> 'estado';
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado';`),
    "tope\nquitado\nguardado",
  );
  esperarValor(
    "cada cuenta ve solo lo suyo",
    escenario(`${COMO_TIENDA}
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado' as _a \\gset
      select ${fav(U.bea, ":'falda'", true)} ->> 'estado' as _b \\gset
      select (retail.tienda_mis_favoritos_y_esperas('${U.ana}') -> 'favoritos') = jsonb_build_array(:'emma');
      select (retail.tienda_mis_favoritos_y_esperas('${U.bea}') -> 'favoritos') = jsonb_build_array(:'falda');
      select retail.tienda_mis_favoritos_y_esperas('${U.nadie}') is null;`),
    "t\nt\nt",
  );

  // =================================================================================================================
  console.log("— A. «Avísame cuando llegue» —");
  esperarValor(
    "en una tienda sin nada libre se anota una vez (la segunda devuelve la misma, sin otra fila)",
    escenario(`${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", ":'tru'")} as r1 \\gset
      select ${avisa(U.ana, ":'v1'", ":'tru'")} as r2 \\gset
      select concat_ws('|', :'r1'::jsonb ->> 'estado', :'r1'::jsonb ->> 'nueva', (:'r1'::jsonb ->> 'sede') = :'tru');
      select concat_ws('|', :'r2'::jsonb ->> 'estado', :'r2'::jsonb ->> 'nueva', (:'r2'::jsonb ->> 'id') = (:'r1'::jsonb ->> 'id'));
      ${COMO_POSTGRES}
      select count(*) from retail.esperas_web where cuenta_web_id = :'ana_w';`),
    "anotada|true|t\nanotada|false|t\n1",
  );
  esperarValor(
    "si HAY libre en ese alcance responde «hay» sin escribir: con Lima surtida, «cualquier tienda» y Lima dicen hay; Trujillo, no",
    escenario(`select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      ${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", "null")} ->> 'estado';
      select ${avisa(U.ana, ":'v1'", ":'lim'")} ->> 'estado';
      select ${avisa(U.ana, ":'v1'", ":'tru'")} ->> 'estado';
      ${COMO_POSTGRES}
      select count(*) || ':' || count(*) filter (where ubicacion_id = :'tru') from retail.esperas_web where cuenta_web_id = :'ana_w';`),
    "hay\nhay\nanotada\n1:1",
  );
  esperarValor(
    "«cualquier tienda» es una espera aparte; una tienda que no se ve en la web (o un id cualquiera) se lee como «cualquier tienda»",
    escenario(`${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", ":'tru'")} ->> 'estado' as _t \\gset
      select concat_ws('|', r ->> 'estado', r ->> 'nueva', coalesce(r ->> 'sede', 'cualquiera')) from (select ${avisa(U.ana, ":'v1'", "null")} r) x;
      select concat_ws('|', r ->> 'estado', r ->> 'nueva', coalesce(r ->> 'sede', 'cualquiera')) from (select ${avisa(U.ana, ":'v1'", "gen_random_uuid()")} r) x;
      ${COMO_POSTGRES}
      update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      ${COMO_TIENDA}
      select concat_ws('|', r ->> 'estado', r ->> 'nueva', coalesce(r ->> 'sede', 'cualquiera')) from (select ${avisa(U.bea, ":'v1'", ":'lim'")} r) x;
      ${COMO_POSTGRES}
      select count(*) from retail.esperas_web where cuenta_web_id in (:'ana_w', :'bea_w');`),
    "anotada|true|cualquiera\nanotada|false|cualquiera\nanotada|true|cualquiera\n3",
  );
  esperarValor(
    "lo que está en Cuarentena y lo apartado no son «hay»: con 3 en Cuarentena y 1 apartado en Trujillo, se anota igual",
    escenario(`select pg_temp.dejar(:'v1', :'tru', :'tru_cua', 3, 'devolucion') as _x \\gset
      select pg_temp.dejar(:'v1', :'tru', :'tru_piso', 1) as _x \\gset
      select pg_temp.vaciar(:'v1', :'tru') as _x \\gset
      ${COMO_TIENDA}
      select ${avisa(U.bea, ":'v1'", ":'tru'")} ->> 'estado';`),
    "anotada",
  );
  esperarValor(
    "no se espera lo que no se ve en la web, ni sin cuenta, ni con datos vacíos, ni con la ficha archivada (y nada queda escrito)",
    escenario(`select pg_temp.modelo('ZZ Inactiva club ${CORRIDA}', :'v1') as v_activa \\gset
      insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo, activo)
        select (select producto_id from retail.variantes where id = :'v_activa'), v.color_codigo, v.talla_id, 50, 10, false
          from retail.variantes v where v.id = :'v2'
      returning id as v_inactiva \\gset
      ${COMO_TIENDA}
      select ${avisa(U.ana, ":'v_vestido'", "null")} ->> 'estado';
      select ${avisa(U.ana, ":'v_inactiva'", "null")} ->> 'estado';
      select ${avisa(U.ana, "gen_random_uuid()", "null")} ->> 'estado';
      select ${avisa(U.nadie, ":'v1'", "null")} ->> 'estado';
      select retail.tienda_avisame(null, :'v1', null) ->> 'estado';
      select ${avisa(U.ceci, ":'v1'", "null")} ->> 'estado';
      ${COMO_POSTGRES}
      select count(*) from retail.esperas_web where cuenta_web_id in (:'ana_w', :'ceci_w');`),
    "no_disponible\nno_disponible\nno_disponible\nsin_cuenta\ninvalido\ncuenta_inactiva\n0",
  );
  esperarValor(
    "el tope de 30 esperas vivas: la 31 dice «tope» y no se anota",
    escenario(`insert into retail.esperas_web (cuenta_web_id, variante_id, ubicacion_id)
      select :'bea_w', x.v, x.u from (
        select v.id as v, s.u from retail.variantes v
        cross join (values (null::uuid), (:'tru'::uuid), (:'lim'::uuid)) s (u)
        where v.producto_id in (:'emma', :'falda') and v.activo and not (v.id = :'v1' and s.u = :'tru')
        order by v.id, s.u nulls first limit 30) x;
      ${COMO_TIENDA}
      select ${avisa(U.bea, ":'v1'", ":'tru'")} ->> 'estado';
      ${COMO_POSTGRES}
      select count(*) from retail.esperas_web where cuenta_web_id = :'bea_w';`),
    "tope\n30",
  );

  // =================================================================================================================
  console.log("— Q. Quitar una espera —");
  esperarValor(
    "la ajena y una que no existe responden «no_esta» sin tocarla; la propia se marca (no se borra), dos veces igual, y se puede volver a pedir",
    escenario(`${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", ":'tru'")} ->> 'id' as e1 \\gset
      select retail.tienda_quitar_avisame('${U.bea}', :'e1') ->> 'estado';
      select retail.tienda_quitar_avisame('${U.ana}', gen_random_uuid()) ->> 'estado';
      ${COMO_POSTGRES}
      select (quitada_en is null)::text from retail.esperas_web where id = :'e1';
      ${COMO_TIENDA}
      select retail.tienda_quitar_avisame('${U.ana}', :'e1') ->> 'estado';
      select retail.tienda_quitar_avisame('${U.ana}', :'e1') ->> 'estado';
      select retail.tienda_quitar_avisame('${U.nadie}', :'e1') ->> 'estado';
      ${COMO_POSTGRES}
      select count(*) || ':' || count(quitada_en) from retail.esperas_web where cuenta_web_id = :'ana_w';
      ${COMO_TIENDA}
      select concat_ws('|', r ->> 'estado', r ->> 'nueva') from (select ${avisa(U.ana, ":'v1'", ":'tru'")} r) x;`),
    "no_esta\nno_esta\ntrue\nquitada\nquitada\nsin_cuenta\n1:1\nanotada|true",
  );

  // =================================================================================================================
  console.log("— C. «Mi cuenta»: el Club, las novedades, los favoritos y las esperas —");
  const CLUB = (u, alias) => `select retail.tienda_mi_club('${u}') as ${alias} \\gset\n`;
  esperarValor(
    "cumpleaños en su mes y sin canje: «disponible», con el % de la caja y hasta el último día del mes; aniversario «en camino» con la cuenta de la caja",
    escenario(`${COMO_TIENDA}${CLUB(U.ana, "m")}${COMO_POSTGRES}
      select concat_ws('|', :'m'::jsonb -> 'club' ->> 'activa', :'m'::jsonb -> 'club' -> 'cumple' ->> 'estado',
        (:'m'::jsonb -> 'club' -> 'cumple' ->> 'pct')::numeric = (select pct from retail.fn_club_beneficios()),
        (:'m'::jsonb -> 'club' -> 'cumple' ->> 'hasta')::date = (date_trunc('month', :'hoy'::date) + interval '1 month - 1 day')::date,
        :'m'::jsonb -> 'club' -> 'cumple' ->> 'dia', :'m'::jsonb -> 'club' -> 'aniversario' ->> 'estado',
        :'m'::jsonb -> 'club' -> 'aniversario' ->> 'compras',
        (:'m'::jsonb -> 'club' -> 'aniversario' ->> 'proximo')::date = (select proximo_aniversario from retail.fn_club_aniversario_calculo(:'ana_c')),
        (:'m'::jsonb -> 'club' -> 'aniversario' ->> 'siguiente_monto')::numeric = (select monto from retail.club_aniversario_escala where anio = 1),
        (:'m'::jsonb -> 'club' -> 'aniversario' ->> 'compras_meta')::int = (select compras from retail.fn_club_beneficios()),
        :'m'::jsonb -> 'club' ->> 'con_publicidad');`),
    "true|disponible|t|t|3|en_camino|0|t|t|t|false",
  );
  esperarValor(
    "con un canje de cumpleaños vivo este año: «canjeado» con su fecha; si se anula, vuelve a estar disponible",
    escenario(`select pg_temp.compra(:'ana_c', :'lim', retail.fn_hoy_lima(), 80) as venta \\gset
      insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto)
      values (:'ana_c', :'venta', 'cumpleanos', extract(year from retail.fn_hoy_lima()), 10, 8) returning id as canje \\gset
      ${COMO_TIENDA}${CLUB(U.ana, "m1")}${COMO_POSTGRES}
      select (:'m1'::jsonb -> 'club' -> 'cumple' ->> 'estado') || '|' || ((:'m1'::jsonb -> 'club' -> 'cumple' ->> 'canjeado_el')::date = :'hoy'::date)::text
             || '|' || coalesce(:'m1'::jsonb -> 'club' -> 'cumple' ->> 'hasta', 'sin hasta');
      update retail.club_canjes set anulado_en = now() where id = :'canje';
      ${COMO_TIENDA}${CLUB(U.ana, "m2")}${COMO_POSTGRES}
      select :'m2'::jsonb -> 'club' -> 'cumple' ->> 'estado';`),
    "canjeado|true|sin hasta\ndisponible",
  );
  esperarValor(
    "otro mes: «proximo»; sin cumpleaños en la ficha: «sin_fecha»; ficha archivada: «sin_club» en los dos beneficios",
    escenario(`${COMO_TIENDA}${CLUB(U.bea, "b")}${CLUB(U.dora, "d")}${CLUB(U.ceci, "c")}${COMO_POSTGRES}
      select :'b'::jsonb -> 'club' -> 'cumple' ->> 'estado';
      select :'d'::jsonb -> 'club' -> 'cumple' ->> 'estado';
      select concat_ws('|', :'c'::jsonb -> 'club' ->> 'activa', :'c'::jsonb -> 'club' -> 'cumple' ->> 'estado',
                       :'c'::jsonb -> 'club' -> 'aniversario' ->> 'estado');
      select retail.tienda_mi_club('${U.nadie}') is null;`),
    "proximo\nsin_fecha\nfalse|sin_club|sin_club\nt",
  );
  esperarValor(
    "con 6 compras en su primer año, el vale de aniversario: «vale», el monto de la escala y su vencimiento, los de la caja",
    escenario(`${COMO_TIENDA}${CLUB(U.eva, "e")}${COMO_POSTGRES}
      select concat_ws('|', :'e'::jsonb -> 'club' -> 'aniversario' ->> 'estado',
        (:'e'::jsonb -> 'club' -> 'aniversario' ->> 'vale_monto')::numeric = (select vale_monto from retail.fn_club_aniversario_calculo(:'eva_c')),
        (:'e'::jsonb -> 'club' -> 'aniversario' ->> 'vale_vence')::date = (select vale_vence from retail.fn_club_aniversario_calculo(:'eva_c')),
        (select vale_disponible from retail.fn_club_aniversario_calculo(:'eva_c')));`),
    "vale|t|t|t",
  );
  esperarValor(
    "favoritos y esperas en «Mi cuenta»: la prenda, su color, su talla y su tienda; si llegó y dónde hay",
    escenario(`${COMO_TIENDA}
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado' as _f \\gset
      select ${avisa(U.ana, ":'v1'", ":'tru'")} ->> 'estado' as _e \\gset
      ${CLUB(U.ana, "m1")}
      ${COMO_POSTGRES}
      select (:'m1'::jsonb -> 'favoritos') = jsonb_build_array(:'emma');
      select concat_ws('|', x ->> 'producto', x -> 'color' ->> 'codigo', x ->> 'talla', x -> 'sede' ->> 'nombre', x ->> 'se_ve', x ->> 'llego', x ->> 'hay_en')
        from jsonb_array_elements(:'m1'::jsonb -> 'esperas') x;
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      ${COMO_TIENDA}${CLUB(U.ana, "m2")}${COMO_POSTGRES}
      select concat_ws('|', x ->> 'llego', x ->> 'hay_en') from jsonb_array_elements(:'m2'::jsonb -> 'esperas') x;
      select pg_temp.dejar(:'v1', :'tru', :'tru_piso', 1) as _x \\gset
      ${COMO_TIENDA}${CLUB(U.ana, "m3")}${COMO_POSTGRES}
      select concat_ws('|', x ->> 'llego', x ->> 'hay_en') from jsonb_array_elements(:'m3'::jsonb -> 'esperas') x;`),
    't\nBlusa Emma|NEG|M|ZZ Trujillo|true|false|[]\nfalse|["ZZ Lima"]\ntrue|["ZZ Lima", "ZZ Trujillo"]',
  );
  esperarValor(
    "Novedades: un modelo que llegó por primera vez sí; uno de carga inicial, uno quitado de Lo nuevo, uno sin nada libre y una reposición de algo que ya estaba, no",
    escenario(`select pg_temp.modelo('ZZ Nuevo club ${CORRIDA}', :'v1') as v_nuevo \\gset
      select pg_temp.modelo('ZZ Carga club ${CORRIDA}', :'v1') as v_carga \\gset
      select pg_temp.modelo('ZZ Quitado club ${CORRIDA}', :'v1', 'quitado') as v_quitado \\gset
      select pg_temp.modelo('ZZ Agotado club ${CORRIDA}', :'v1') as v_agotado \\gset
      select pg_temp.dejar(:'v_nuevo', :'tru', :'tru_piso', 2) as _x \\gset
      select pg_temp.dejar(:'v_carga', :'tru', :'tru_piso', 2, 'carga_inicial') as _x \\gset
      select pg_temp.dejar(:'v_quitado', :'tru', :'tru_piso', 2) as _x \\gset
      select pg_temp.dejar(:'v_agotado', :'tru', :'tru_piso', 1) as _x \\gset
      select pg_temp.vaciar(:'v_agotado', :'tru') as _x \\gset
      select pg_temp.dejar(:'v2', :'lim', :'lim_piso', 2) as _x \\gset
      select producto_id as p_nuevo from retail.variantes where id = :'v_nuevo' \\gset
      ${COMO_TIENDA}${CLUB(U.ana, "m")}${COMO_POSTGRES}
      select concat_ws('|', :'m'::jsonb -> 'novedades' ->> 'primera', :'m'::jsonb -> 'novedades' ->> 'total',
                       (:'m'::jsonb -> 'novedades' -> 'productos') = jsonb_build_array(:'p_nuevo'));`),
    "true|1|t",
  );
  esperarValor(
    "«desde tu última visita»: volver antes de 30 min no la mueve; pasadas 2 h, lo que llegó antes de la visita anterior ya no es novedad y lo nuevo sí",
    escenario(`select pg_temp.modelo('ZZ Antes club ${CORRIDA}', :'v1') as v_antes \\gset
      select pg_temp.dejar(:'v_antes', :'tru', :'tru_piso', 2, 'prueba', now() - interval '3 hours') as _x \\gset
      ${COMO_TIENDA}${CLUB(U.ana, "m1")}${CLUB(U.ana, "m2")}${COMO_POSTGRES}
      select concat_ws('|', :'m1'::jsonb -> 'novedades' ->> 'primera', :'m1'::jsonb -> 'novedades' ->> 'total',
                       :'m2'::jsonb -> 'novedades' ->> 'primera', :'m2'::jsonb -> 'novedades' ->> 'total');
      update retail.cuentas_web_visitas set visita_en = now() - interval '2 hours', visita_anterior_en = null where cuenta_web_id = :'ana_w';
      select pg_temp.modelo('ZZ Despues club ${CORRIDA}', :'v1') as v_despues \\gset
      select pg_temp.dejar(:'v_despues', :'tru', :'tru_piso', 2) as _x \\gset
      select producto_id as p_despues from retail.variantes where id = :'v_despues' \\gset
      ${COMO_TIENDA}${CLUB(U.ana, "m3")}${COMO_POSTGRES}
      select concat_ws('|', :'m3'::jsonb -> 'novedades' ->> 'primera', :'m3'::jsonb -> 'novedades' ->> 'total',
                       (:'m3'::jsonb -> 'novedades' -> 'productos') = jsonb_build_array(:'p_despues'),
                       (select (visita_anterior_en between now() - interval '2 hours 1 minute' and now() - interval '119 minutes')::text
                          from retail.cuentas_web_visitas where cuenta_web_id = :'ana_w'));`),
    "true|1|true|1\nfalse|1|t|true",
  );

  // =================================================================================================================
  console.log("— V. «Esperan una talla» (ERP) —");
  const ESPERAS_DE_PRUEBA = `${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", ":'tru'")} ->> 'estado' as _1 \\gset
      select ${avisa(U.bea, ":'v1'", ":'tru'")} ->> 'estado' as _2 \\gset
      select ${avisa(U.ana, ":'v1'", "null")} ->> 'estado' as _3 \\gset
      select ${avisa(U.bea, ":'v2'", ":'tru'")} ->> 'id' as e_quitada \\gset
      select retail.tienda_quitar_avisame('${U.bea}', :'e_quitada') ->> 'estado' as _4 \\gset
      ${COMO_POSTGRES}`;
  esperarValor(
    "sin el módulo vitrina_web, 42501 (vitrina_web_sin_modulo) y no se lee nada",
    escenario(`${ESPERAS_DE_PRUEBA}${COMO(MICAELA)}
      select pg_temp.intento('select retail.fn_vitrina_esperan()');`),
    "42501|vitrina_web_sin_modulo",
  );
  esperarValor(
    "con el módulo: cuántas personas por prenda y tienda (lo quitado no cuenta), el total de personas distintas, si llegó y dónde hay",
    escenario(`${ESPERAS_DE_PRUEBA}
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      ${COMO(FELIPE)}
      select retail.fn_vitrina_esperan() as r \\gset
      ${COMO_POSTGRES}
      select (:'r'::jsonb ->> 'personas')::int >= 2;
      select string_agg(concat_ws('|', x -> 'producto' ->> 'nombre', x -> 'color' ->> 'codigo', x ->> 'talla', coalesce(x -> 'sede' ->> 'nombre', 'cualquiera'),
                                  x ->> 'personas', x ->> 'libre', (select string_agg(h ->> 'nombre' || ':' || (h ->> 'libre'), ',') from jsonb_array_elements(x -> 'hay_en') h),
                                  x ->> 'se_ve'), ' # ' order by x ->> 'personas' desc, coalesce(x -> 'sede' ->> 'nombre', 'cualquiera'))
        from jsonb_array_elements(:'r'::jsonb -> 'filas') x
       where x ->> 'variante_id' in (:'v1', :'v2');`),
    "t\nBlusa Emma|NEG|M|Tienda Trujillo|2|0|Tienda Lima:2|true # Blusa Emma|NEG|M|cualquiera|1|2|Tienda Lima:2|true",
  );
  esperarValor(
    "sin datos personales: ni nombres, ni correos, ni DNI, ni celulares de quienes esperan; y si el modelo se oculta de la web, lo dice",
    escenario(`${ESPERAS_DE_PRUEBA}
      update retail.vitrina_productos set publicado = false where producto_id = :'emma';
      ${COMO(FELIPE)}
      select retail.fn_vitrina_esperan()::text as r \\gset
      ${COMO_POSTGRES}
      select (:'r' ~* '(Ana Prueba|Bea Prueba|${CORREO("ana").replace(/\./g, "\\.")}|${DNI.ana}|${DNI.bea}|987000701|987000702|${U.ana}|${U.bea})')::text;
      select string_agg(distinct x ->> 'se_ve', ',') from jsonb_array_elements(:'r'::jsonb -> 'filas') x where x ->> 'variante_id' = :'v1';`),
    "false\nfalse",
  );

  // =================================================================================================================
  console.log("— M. Mutantes: cada candado, roto a propósito, se nota —");
  esperarValor(
    "MUTANTE quitar sin el filtro de la cuenta: Bea quita la espera de Ana (la prueba Q lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_quitar_avisame(uuid, uuid)', 'where id = p_espera_id and cuenta_web_id = v_cuenta and quitada_en is null',
                                    'where id = p_espera_id and quitada_en is null');
      ${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", ":'tru'")} ->> 'id' as e1 \\gset
      select retail.tienda_quitar_avisame('${U.bea}', :'e1') ->> 'estado';`),
    "quitada",
  );
  esperarValor(
    "MUTANTE avisame sin «si hay, no se espera»: con Lima surtida se anota igual (la prueba A lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_avisame(uuid, uuid, uuid)', 'end) > 0 then', 'end) > 999999 then');
      select pg_temp.dejar(:'v1', :'lim', :'lim_piso', 2) as _x \\gset
      ${COMO_TIENDA}
      select ${avisa(U.ana, ":'v1'", "null")} ->> 'estado';`),
    "anotada",
  );
  esperarValor(
    "MUTANTE «libre» sin dejar fuera la Cuarentena: lo dañado cuenta como «hay» (la prueba A lo nota)",
    escenario(`select pg_temp.mutar('retail.fn_tienda_libre(uuid, uuid[])', 'and (su.id is null or su.tipo in (''almacen_tienda'', ''piso_venta''))', '');
      select pg_temp.dejar(:'v1', :'tru', :'tru_cua', 3, 'devolucion') as _x \\gset
      ${COMO_TIENDA}
      select ${avisa(U.bea, ":'v1'", ":'tru'")} ->> 'estado';`),
    "hay",
  );
  esperarValor(
    "MUTANTE favoritos sin tope: con 100 guardados entra el 101 (la prueba F lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_favorito(uuid, uuid, boolean)', '>= 100 then', '>= 1000000 then');
      with nuevos as (
        insert into retail.productos (referencia) select 'ZZ Tope club ' || g || ' ${CORRIDA}' from generate_series(1, 100) g returning id)
      insert into retail.favoritos_web (cuenta_web_id, producto_id) select :'ana_w', id from nuevos;
      ${COMO_TIENDA}
      select ${fav(U.ana, ":'emma'", true)} ->> 'estado';`),
    "guardado",
  );
  esperarValor(
    "MUTANTE cumpleaños sin mirar el canje: después de usarlo sigue «disponible» (la prueba C lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_mi_club(uuid)', 'when v_canje is not null then ''canjeado''', 'when false then ''canjeado''');
      select pg_temp.compra(:'ana_c', :'lim', retail.fn_hoy_lima(), 80) as venta \\gset
      insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto)
      values (:'ana_c', :'venta', 'cumpleanos', extract(year from retail.fn_hoy_lima()), 10, 8);
      ${COMO_TIENDA}${CLUB(U.ana, "m")}${COMO_POSTGRES}
      select :'m'::jsonb -> 'club' -> 'cumple' ->> 'estado';`),
    "disponible",
  );
  esperarValor(
    "MUTANTE «Esperan una talla» sin el candado del módulo: Micaela lee (la prueba V lo nota)",
    escenario(`select pg_temp.mutar('retail.fn_vitrina_esperan()', 'perform retail.fn_exigir_modulo(''vitrina_web'');', '');
      ${ESPERAS_DE_PRUEBA}${COMO(MICAELA)}
      select pg_temp.intento('select retail.fn_vitrina_esperan()');`),
    "ok",
  );

  // =================================================================================================================
  console.log("— D. Eliminar un modelo sin historia —");
  esperarValor(
    "un modelo sin historia que se elimina se lleva sus favoritos y sus esperas (son SUYAS: on delete cascade, como su fila de la Vitrina)",
    escenario(`select pg_temp.modelo('ZZ Eliminar club ${CORRIDA}', :'v1') as v_e \\gset
      select producto_id as p_e from retail.variantes where id = :'v_e' \\gset
      ${COMO_TIENDA}
      select ${fav(U.ana, ":'p_e'", true)} ->> 'estado' as _f \\gset
      select ${avisa(U.ana, ":'v_e'", "null")} ->> 'estado' as _a \\gset
      ${COMO_POSTGRES}
      select (select count(*) from retail.favoritos_web where producto_id = :'p_e') || ':' || (select count(*) from retail.esperas_web where variante_id = :'v_e');
      set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
      select (retail.eliminar_producto(:'p_e') is not null)::text;
      select (select count(*) from retail.favoritos_web where producto_id = :'p_e') || ':' || (select count(*) from retail.esperas_web where variante_id = :'v_e');`),
    "1:1\ntrue\n0:0",
  );

  // =================================================================================================================
  console.log("— P. Se puede pegar dos veces —");
  const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
  esperarValor(
    "las tres partes, dos veces seguidas (como un segundo pegado): no fallan y no duplican nada",
    correr(`begin;\n${sql}\n${sql}
      select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
         and proname in ('tienda_favorito', 'tienda_avisame', 'tienda_quitar_avisame', 'tienda_mis_favoritos_y_esperas', 'tienda_mi_club', 'fn_vitrina_esperan');
      select count(*) from pg_indexes where schemaname = 'retail' and tablename = 'esperas_web';
      ${FIN}`),
    "6\n3",
  );
}

main();
console.log(`\n${total - fallos}/${total} escenarios en verde.`);
if (fallos > 0) process.exit(1);
