#!/usr/bin/env node
/**
 * Pruebas de «la tienda web cobra Llevar varias y pagar menos» (`20261114041000_tienda_web_ofertas_de_grupo.sql`, ADR-0655 actividad 7)
 * contra el Postgres local, con la bolsa, «Separar», la confirmación y el pago de verdad.
 *
 * QUÉ PRUEBA.
 *   · `tienda_bolsa_grupos`: lo que ahorra cada prenda de la bolsa con un 3x2 en la tienda elegida (la más barata gratis), y nada sin grupo;
 *   · `tienda_separar`: el pedido nace con la parte de cada prenda DENTRO de su descuento, su oferta y el total sin la regalada; con lo que
 *     mostró la bolsa (`ahorro_grupo`) igual, separa; distinto, no separa (`tienda_separar_precio`); sin él (una tienda vieja), separa igual;
 *   · la parte del grupo de una prenda no se cambia después (`pedido_web_inmutable`);
 *   · si la tienda quita una prenda al confirmar, las demás conservan su precio (la tienda no le cobra más a la clienta por lo que no tuvo);
 *   · al pagarse completo, la venta lleva la parte de cada prenda sin motivo y con su oferta, y `fn_pedido_web_verificar` lo da por bueno;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK, con el piso de `tienda_bolsa.mjs` (Trujillo y Lima en la web, dos prendas de dos
 *   modelos en la Vitrina, un cliente del Club con cuenta web). Si la base local no tiene las migraciones de las ofertas, las aplica dentro.
 *
 * USO
 *   pnpm pruebas:tienda-ofertas-de-grupo
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR = process.argv.includes("--contenedor") ? process.argv[process.argv.indexOf("--contenedor") + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114041000_tienda_web_ofertas_de_grupo.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").filter((l) => !l.startsWith("psql:") || l.includes("ERROR")).slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? (r.salida.split("\n").filter(Boolean).at(-1) ?? "") : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, r.ok && ultima(r) === esperado, r.ok ? `dio «${ultima(r)}», se esperaba «${esperado}»` : r.mensaje);

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR}. Levántalo con: npx supabase start`);
  process.exit(2);
}
const falta = (sql) => correr(sql).salida === "t";
const leer = (n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8");
const sinFusion = falta("select to_regprocedure('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)') is null;");
const sinProductos = falta("select to_regclass('retail.campana_regla_productos') is null;");
const sinTienda = falta("select to_regprocedure('retail.tienda_bolsa_grupos(jsonb, uuid)') is null;");
const ANTES = [
  sinProductos && sinFusion
    ? ["20261112204000_fusionar_productos_base", "20261112205000_fusionar_productos_previsualizar", "20261112210000_fusionar_productos",
        "20261112211000_fusionar_productos_lecturas", "20261113175000_fusionar_productos_tallas_vacias"].map(leer).join("\n")
    : "",
  sinProductos ? leer("20261113210000_oferta_prenda_por_prenda") : "",
  falta("select to_regclass('retail.campana_regla_cesiones') is null;") ? leer("20261113223000_una_oferta_por_prenda_tienda_y_dia") : "",
  falta("select to_regprocedure('retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean)') is null;") ? leer("20261113230000_choques_de_oferta_de_una_vez") : "",
  falta("select to_regprocedure('retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)') is null;") ? leer("20261114003000_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date)') is null;") ? leer("20261114011000_caja_cobra_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null;") ? leer("20261114032000_apartados_con_ofertas_de_grupo") : "",
  sinTienda ? readFileSync(MIGRACION, "utf8") : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
const lugares = (nombre, sufijo) => `
select id as ${sufijo} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta');
select id as ${sufijo}_piso from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta' \\gset
`;
// Una prenda que se muestra en la web, se vende en las dos tiendas y no tiene precio propio de tienda (como en `tienda_bolsa.mjs`).
const elegirPrenda = (alias, excluir = "") => `
select v.id as ${alias}, v.producto_id as prod_${alias}, p.categoria_id as cat_${alias}
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
 where v.activo and v.precio > 0 and p.estado = 'activo' and p.estado_alta <> 'rechazado' and not p.es_prueba
   and p.id <> '11111111-1111-4111-8111-111111111111'
   and retail.fn_variante_permitida_en_sede(v.id, :'tru') and retail.fn_variante_permitida_en_sede(v.id, :'lim')
   and not exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = v.producto_id and ps.archivado_en is null)
   ${excluir}
 order by v.id limit 1 \\gset
`;
const PARTIDA = (activar = "true") => `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;
${elegirPrenda("v")}
${elegirPrenda("v2", "and v.producto_id <> :'prod_v'")}
update retail.vitrina_productos set publicado = false where publicado;
insert into retail.vitrina_productos (producto_id, publicado, publicado_en)
values (:'prod_v', true, now()), (:'prod_v2', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now();
-- Stock de sobra en el piso de Trujillo y las cajas del día (el pago hace nacer la venta).
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
  select x, :'tru', :'tru_piso', 'entrada', 20, 'prueba', 'prueba tienda 3x2: colchón' from unnest(array[:'v', :'v2']::uuid[]) x;
select count(retail.fn_aplicar_movimiento(m.id)) as _ap from retail.movimientos m where m.nota = 'prueba tienda 3x2: colchón' and m.created_at >= now() - interval '1 minute' \\gset
update retail.series_comprobantes
   set serie = case tipo when 'boleta' then 'BT97' else 'FT97' end, siguiente_numero = 1
 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura') and archivada_at is null;
select coalesce((select id from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta'), retail.abrir_caja(:'tru', 0, 'prueba tienda 3x2')) is not null as _caja \\gset
-- Un cliente del Club con cuenta web.
insert into retail.clientas (nombre, telefono_whatsapp, documento_tipo, documento_numero, club_desde, codigo_club)
  values ('ZZ Cliente tienda 3x2', '999888781', 'dni', '09997081', now(), retail.fn_club_codigo_nuevo()) returning id as cli \\gset
select gen_random_uuid() as usr \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values (:'usr', :'cli', 'zz-3x2@prueba-tienda.test', 'prueba');
-- La campaña con el 3x2 en las dos prendas (prenda por prenda).
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña 3x2 web (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat_v', :'cat_v2']::uuid[]);
select retail.guardar_oferta_completa(null, :'camp', 'ZZ 3x2 web', '{"tipo":"nxm","lleva":3,"paga":2}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], array[:'prod_v', :'prod_v2']::uuid[], '{}'::uuid[], ${activar}) as r \\gset
select pr.precio_lista as p_v from retail.fn_tienda_precio_talla(array[:'v']::uuid[], :'tru') pr \\gset
select pr.precio_lista as p_v2 from retail.fn_tienda_precio_talla(array[:'v2']::uuid[], :'tru') pr \\gset
select least(:'p_v'::numeric, :'p_v2'::numeric) as minimo \\gset
-- Lo que la bolsa le muestra (dos de la primera y una de la segunda).
select retail.tienda_bolsa_grupos(jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 2), jsonb_build_object('variante_id', :'v2', 'cantidad', 1)), :'tru') as bg \\gset
select coalesce((:'bg'::jsonb -> 'lineas' -> :'v' ->> 'ahorro')::numeric, 0) as g_v, coalesce((:'bg'::jsonb -> 'lineas' -> :'v2' ->> 'ahorro')::numeric, 0) as g_v2 \\gset
`;
const linea = (v, n, extra = "") => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${n}, 'precio', :'p_${v}'::numeric${extra})`;
const BOLSA = `jsonb_build_array(${linea("v", 2, ", 'ahorro_grupo', :'g_v'::numeric")}, ${linea("v2", 1, ", 'ahorro_grupo', :'g_v2'::numeric")})`;
const separar = (bolsa = BOLSA) => `select (retail.tienda_separar(:'usr', :'tru', ${bolsa}, gen_random_uuid()) ->> 'codigo') as codigo \\gset
select id as ped from retail.pedidos_web where codigo = :'codigo' \\gset
`;
const TOTAL_3X2 = "(2 * :'p_v'::numeric + :'p_v2'::numeric - :'minimo'::numeric)";

console.log("\n— La bolsa —");
esperarValor(
  "tienda_bolsa_grupos: con un 3x2 en la tienda elegida, la bolsa ahorra la prenda más barata, repartida por prenda",
  correr(`${PARTIDA()}select concat_ws('|', (:'bg'::jsonb ->> 'ahorro')::numeric = :'minimo'::numeric, :'g_v'::numeric + :'g_v2'::numeric = :'minimo'::numeric,
    :'bg'::jsonb -> 'lineas' -> :'v' ->> 'tipo', :'bg'::jsonb -> 'lineas' -> :'v' ->> 'lleva', :'bg'::jsonb -> 'lineas' -> :'v' ->> 'campana');\nrollback;`),
  "t|t|nxm|3|ZZ Campaña 3x2 web (prueba)",
);
esperarValor(
  "sin la oferta (en borrador), la bolsa no ahorra nada",
  correr(`${PARTIDA("false")}select (:'bg'::jsonb ->> 'ahorro')::numeric || '|' || (:'bg'::jsonb -> 'lineas')::text;\nrollback;`),
  "0|{}",
);

console.log("\n— Separar —");
esperarValor(
  "el pedido nace con la parte de cada prenda dentro de su descuento, su oferta y el total sin la regalada",
  correr(`${PARTIDA()}${separar()}select concat_ws('|', count(*), sum(l.descuento_grupo) = :'minimo'::numeric, bool_and(l.descuento = l.descuento_grupo),
    bool_and(l.oferta_grupo_id = :'r'), bool_and(l.descuento_etiqueta_id is null),
    (select total from retail.pedidos_web where id = :'ped') = ${TOTAL_3X2})
  from retail.pedido_web_lineas l where l.pedido_id = :'ped';\nrollback;`),
  "3|t|t|t|t|t",
);
esperarValor(
  "si la bolsa mostró otro ahorro (la oferta cambió mientras miraba), no separa nada",
  correr(`${PARTIDA()}create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; begin execute p_sql; return 'ok'; exception when others then get stacked diagnostics v_hint = pg_exception_hint; return v_hint; end $f$;
select pg_temp.probar(format('select retail.tienda_separar(%L, %L, %L, %L)', :'usr', :'tru',
  jsonb_build_array(${linea("v", 2, ", 'ahorro_grupo', 0")}, ${linea("v2", 1, ", 'ahorro_grupo', 0")}), gen_random_uuid())) as h \\gset
select :'h' || '|' || (select count(*) from retail.pedidos_web where clienta_id = :'cli');\nrollback;`),
  "tienda_separar_precio|0",
);
esperarValor(
  "una tienda vieja que no manda lo que mostró: separa igual, con el 3x2",
  correr(`${PARTIDA()}${separar(`jsonb_build_array(${linea("v", 2)}, ${linea("v2", 1)})`)}select (select total from retail.pedidos_web where id = :'ped') = ${TOTAL_3X2};\nrollback;`),
  "t",
);
esperarValor(
  "la parte del grupo de una prenda no se cambia después",
  correr(`${PARTIDA()}${separar()}create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; begin execute p_sql; return 'ok'; exception when others then get stacked diagnostics v_hint = pg_exception_hint; return v_hint; end $f$;
select pg_temp.probar(format('update retail.pedido_web_lineas set descuento_grupo = 0, oferta_grupo_id = null where pedido_id = %L', :'ped'));\nrollback;`),
  "pedido_web_inmutable",
);

console.log("\n— Confirmar y pagar —");
esperarValor(
  "si la tienda quita una prenda al confirmar, las demás conservan su precio (no se le cobra más a la clienta)",
  correr(`${PARTIDA()}${separar()}select sum(l.precio) filter (where l.posicion <> 3) as quedan from retail.pedido_web_lineas l where l.pedido_id = :'ped' \\gset
select retail.confirmar_pedido_web(:'ped', (select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', case when l.posicion = 3 then 'quitar' else 'reservar' end) order by l.posicion)
  from retail.pedido_web_lineas l where l.pedido_id = :'ped')) is not null as _c \\gset
select concat_ws('|', (select total from retail.pedidos_web where id = :'ped') = :'quedan'::numeric,
  (select count(*) from retail.pedido_web_lineas where pedido_id = :'ped' and estado = 'quitada'));\nrollback;`),
  "t|1",
);
esperarValor(
  "pagado completo: la venta lleva la parte de cada prenda sin motivo y con su oferta, y el pedido cuadra",
  correr(`${PARTIDA()}${separar()}select retail.confirmar_pedido_web(:'ped', (select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', 'reservar') order by l.posicion)
  from retail.pedido_web_lineas l where l.pedido_id = :'ped')) is not null as _c \\gset
select retail.registrar_pago_pedido_web(:'ped', (select total from retail.pedidos_web where id = :'ped'), 'yape', '41099001') is not null as _p \\gset
select venta_id from retail.pedidos_web where id = :'ped' \\gset
select retail.fn_pedido_web_verificar(:'ped') is null as _v \\gset
select concat_ws('|', count(*), sum(vi.descuento_grupo_unitario) = :'minimo'::numeric, bool_and(vi.motivo_descuento is null and vi.descuento_etiqueta_id is null),
    bool_and(vi.oferta_grupo_id = :'r'), sum((vi.precio_unitario - vi.descuento_unitario) * vi.cantidad) = ${TOTAL_3X2})
  from retail.venta_items vi where vi.venta_id = :'venta_id';\nrollback;`),
  "3|t|t|t|t",
);

console.log("\n— La migración —");
esperar("se puede pegar dos veces", correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nrollback;`).ok);

console.log(`\n${total - fallos}/${total} pasaron${sinTienda ? " (con las migraciones metidas en cada transacción: la base local no las tiene)" : ""}.`);
process.exit(fallos ? 1 : 0);
