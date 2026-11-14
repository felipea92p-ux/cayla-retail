#!/usr/bin/env node
/**
 * Pruebas de las ofertas por INSIGNIA (`20261114060000_ofertas_por_insignia.sql` y la huella `20261114061000`, ADR-0655; Felipe 2026-11-14)
 * contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · el alcance: una oferta con una insignia rige en las prendas que la llevan (marcadas a mano o por una categoría de la insignia), se
 *     suma a sus categorías y modelos, y con insignias y sin categorías ni modelos ya no cae en las prendas de su campaña; la caja
 *     (`fn_campanas_en_sede`), la regla de una oferta guardada, la de una por una y la de todas de una vez dicen lo mismo;
 *   · un 3x2 por insignia arma sus grupos solo con esas prendas, y la caja lo lee (`ofertas_de_grupo_vigentes`);
 *   · los choques ven las insignias, en la hoja (antes de guardar) y en el candado;
 *   · guardar: las insignias quedan con la oferta y en su historia, una campaña no vale como insignia, un monto de toda la compra no las
 *     lleva, y `campana_reglas()` las devuelve;
 *   · la huella de la tienda web cambia cuando cambian las insignias de una oferta;
 *   · las dos migraciones se pegan dos veces y cada función queda con una sola firma.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Lo que la base local no tenga de las ofertas, lo aplica dentro de cada escenario.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed, con al menos 3 variantes en su modelo y una prenda de otra categoría.
 *
 * USO
 *   pnpm pruebas:ofertas-por-insignia
 *   pnpm pruebas:ofertas-por-insignia -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114060000_ofertas_por_insignia.sql";
const HUELLA = "supabase/migrations/20261114061000_huella_tienda_con_insignias.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? (r.salida.split("\n").filter(Boolean).at(-1) ?? "") : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, r.ok && ultima(r) === esperado, r.ok ? `dio «${ultima(r)}», se esperaba «${esperado}»` : r.mensaje);
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»` : r.mensaje);

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
  process.exit(2);
}

// Lo que la base local todavía no tenga, dentro de cada escenario.
const falta = (sql) => correr(sql).salida === "t";
const leer = (n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8");
const sinFusion = falta("select to_regprocedure('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)') is null;");
const sinProductos = falta("select to_regclass('retail.campana_regla_productos') is null;");
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
  falta("select to_regprocedure('retail.tienda_bolsa_grupos(jsonb, uuid)') is null;") ? leer("20261114041000_tienda_web_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.fn_escalones_validos(jsonb, text)') is null;") ? leer("20261114044000_monto_con_escalones") : "",
  // La huella de la tienda web (20261113202000) va antes de la nueva (la de 20261113232000 la reemplaza esta).
  falta("select to_regprocedure('retail.tienda_catalogo_version()') is null;") ? leer("20261113202000_tienda_catalogo_version") : "",
  falta("select to_regclass('retail.campana_regla_insignias') is null;")
    ? [leer("20261114054000_choques_con_forma_una_sola_firma"), readFileSync(MIGRACION, "utf8"), readFileSync(HUELLA, "utf8")].join("\n")
    : "",
  // Auditoría final (20261114071000): la portada de la tienda web cuenta las ofertas que eligen modelos o insignias.
  falta("select position('campana_regla_insignias' in pg_get_functiondef('retail.fn_campana_portada()'::regprocedure)) = 0;")
    ? leer("20261114071000_portada_con_ofertas_por_modelo_o_insignia")
    : "",
  // Auditoría final (20261114072000): volver a activar una campaña pasa por el candado de los choques.
  falta("select count(*) = 0 from pg_trigger where tgname = 'etiquetas_campana_reactivada_sin_choques';")
    ? leer("20261114072000_campana_reactivada_sin_choques")
    : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Una campaña «ZZ» con la categoría de la Blusa Emma (a1, a2, a3 de su modelo; fuera, de otra categoría) y una insignia «ZZ Rotación» que
// llevan a1 (marcada a mano) y, si se pide, toda la categoría de fuera (por categoría de la insignia).
const PARTIDA = `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
select v.id as fuera, p.categoria_id as cat_fuera from retail.variantes v join retail.productos p on p.id = v.producto_id
 where p.categoria_id <> :'cat' and v.activo
   and p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure') order by v.id limit 1 \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña insignias (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
insert into retail.etiquetas (nombre, estilo) values ('ZZ Rotación (prueba)', 'positivo') returning id as ins \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'a1', :'ins');
`;
const POR_CATEGORIA = "insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'ins', :'cat_fuera');\n";
/** Una oferta con su forma (por defecto, −20 %), sus insignias y, si se pide, categorías «solo». */
const OFERTA = ({ forma = { tipo: "pct", porcentaje: 20 }, insignias = "jsonb_build_array(:'ins')", solo = "'{}'::uuid[]", nombre = "ZZ por insignia", v = "r", activar = "true", cedenA = "'{}'::uuid[]" } = {}) =>
  `select retail.guardar_oferta_completa(null, :'camp', '${nombre}', '${JSON.stringify(forma)}'::jsonb || jsonb_build_object('insignias', ${insignias}),
     ${HOY}, ${HOY} + 3, null, ${solo}, '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], ${cedenA}, ${activar}) as ${v} \\gset\n`;
/** Cuánto baja la caja hoy en Lima cada prenda: «a1:20|a2:0|…». */
const CAJA = (vs = ["a1", "a2", "fuera"]) =>
  `select string_agg(x.k || ':' || coalesce((select max(c.descuento_pct)::integer from retail.fn_campanas_en_sede(${HOY}, 0, array[x.v]::uuid[], :'u') c where c.etiqueta_id = :'camp'), 0), '|' order by x.n)
   from (values ${vs.map((k, i) => `(${i}, '${k}', :'${k}'::uuid)`).join(", ")}) x(n, k, v);\n`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);

console.log("\n— El alcance de una oferta por insignia —");
esperarValor("−20 % en la insignia: la prenda marcada baja; la de su mismo modelo sin marca y la de otra categoría, no", caso(`${OFERTA()}${CAJA()}`), "a1:20|a2:0|fuera:0");
esperarValor(
  "la insignia también alcanza por su categoría: toda la categoría de la insignia entra",
  caso(`${POR_CATEGORIA}${OFERTA()}${CAJA()}`),
  "a1:20|a2:0|fuera:20",
);
esperarValor(
  "se suma a las categorías elegidas: la categoría de fuera y la prenda con la insignia",
  caso(`${OFERTA({ solo: "array[:'cat_fuera']::uuid[]" })}${CAJA()}`),
  "a1:20|a2:0|fuera:20",
);
esperarValor(
  "sin insignias ni categorías, rige en las prendas de su campaña (como siempre): las tres de la Blusa Emma",
  caso(`${OFERTA({ insignias: "'[]'::jsonb" })}${CAJA(["a1", "a2", "fuera"])}`),
  "a1:20|a2:20|fuera:0",
);
esperarValor(
  "las cuatro reglas dicen lo mismo: la caja, la de una oferta guardada, la de una por una y la de todas de una vez",
  caso(`${POR_CATEGORIA}${OFERTA()}select concat_ws('|',
  retail.fn_regla_alcanza_variante(:'r', :'a1'), retail.fn_regla_alcanza_variante(:'r', :'a2'), retail.fn_regla_alcanza_variante(:'r', :'fuera'),
  (select count(*) from retail.fn_variantes_de_oferta_con_insignias(:'camp', '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array[:'ins']::uuid[], false) x)
    = (select count(*) from retail.variantes v where v.activo
        and retail.fn_oferta_alcanza_variante_con_insignias(:'camp', '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array[:'ins']::uuid[], false, v.id)),
  (select count(*) from retail.fn_variantes_de_oferta_con_insignias(:'camp', '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array[:'ins']::uuid[], false) x)
    = (select count(*) from retail.variantes v where v.activo and exists (
        select 1 from retail.fn_campanas_en_sede(${HOY}, 0, array[v.id]::uuid[], :'u') c where c.etiqueta_id = :'camp' and c.descuento_pct > 0)));\n`),
  "t|f|t|t|t",
);
esperarValor(
  "las de siempre (sin insignias) siguen diciendo lo mismo que antes",
  caso(`select concat_ws('|',
  retail.fn_oferta_alcanza_variante(:'camp', '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false, :'a2'),
  (select count(*) from retail.fn_variantes_de_oferta(:'camp', array[:'cat_fuera']::uuid[], '{}'::uuid[], '{}'::uuid[], false))
    = (select count(*) from retail.fn_variantes_de_oferta_con_insignias(:'camp', array[:'cat_fuera']::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false)));\n`),
  "t|t",
);

console.log("\n— Un 3x2 por insignia —");
const TRES_A1 = `insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'a2', :'ins'), (:'a3', :'ins');\n`;
esperarValor(
  "arma el grupo solo con las prendas de la insignia, y la caja lo lee por prenda",
  caso(`${TRES_A1}${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 2 } })}select concat_ws('|',
  (select sum(descuento) from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(
     jsonb_build_object('variante_id', :'a1', 'precio_unitario', 50, 'cantidad', 1), jsonb_build_object('variante_id', :'a2', 'precio_unitario', 50, 'cantidad', 1),
     jsonb_build_object('variante_id', :'a3', 'precio_unitario', 50, 'cantidad', 1)))),
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') o where o.regla_id = :'r'));\n`),
  "50.00|3",
);

console.log("\n— Los choques ven las insignias —");
esperarError(
  "una rebaja en la categoría de la Blusa Emma choca con una oferta en la insignia que lleva a1",
  caso(`${OFERTA()}${OFERTA({ insignias: "'[]'::jsonb", solo: "array[:'cat']::uuid[]", nombre: "ZZ Blusas", v: "r2" })}`),
  "choca",
);
esperarValor(
  "…y la hoja lo ve antes de guardar (fn_choques_de_oferta_con_forma con las insignias)",
  caso(`${OFERTA()}select count(distinct c.otra_id) from retail.fn_choques_de_oferta_con_forma(null, :'camp', ${HOY}, ${HOY} + 3, array[1,2,3,4,5,6,7]::smallint[],
  '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], array[:'ins']::uuid[], false, '{}'::uuid[], 'pct', null, false) c where c.otra_id = :'r';\n`),
  "1",
);
esperarValor(
  "una oferta en otra categoría no choca con la de la insignia",
  caso(`${OFERTA()}${OFERTA({ insignias: "'[]'::jsonb", solo: "array[:'cat_fuera']::uuid[]", nombre: "ZZ Otra categoría", v: "r2" })}select 'ok';\n`),
  "ok",
);

console.log("\n— Guardar —");
esperarValor(
  "las insignias quedan con la oferta y campana_reglas() las devuelve",
  caso(`${OFERTA()}select concat_ws('|', (select count(*) from retail.campana_regla_insignias where regla_id = :'r'),
  (select insignias = array[:'ins']::uuid[] from retail.campana_reglas() where id = :'r'));\n`),
  "1|t",
);
esperarValor(
  "quitarlas deja las de antes en la historia; sin la clave «insignias» no se tocan",
  caso(`${OFERTA()}select retail.guardar_oferta_completa(:'r', :'camp', 'ZZ por insignia', '{"tipo":"pct","porcentaje":20}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true);
select (select count(*) from retail.campana_regla_insignias where regla_id = :'r') as sigue \\gset
${OFERTA({ insignias: "'[]'::jsonb", v: "r_mismo" }).replace("guardar_oferta_completa(null", "guardar_oferta_completa(:'r'")}select concat_ws('|', :'sigue',
  (select count(*) from retail.campana_regla_insignias where regla_id = :'r'),
  (select h.antes -> 'insignias' ->> 0 = :'ins' from retail.campana_regla_historial h where h.regla_id = :'r' and h.antes ? 'insignias'));\n`),
  "1|0|t",
);
esperarError(
  "una campaña no vale como insignia",
  caso(`${OFERTA({ insignias: "jsonb_build_array(:'camp')" })}`),
  "es una campaña",
);
esperarValor(
  "un monto de toda la compra no lleva insignias",
  caso(`${OFERTA({ forma: { tipo: "monto", ahorro_en: "soles", cuenta: "compra", cede_a_otras: true, escalones: [{ desde: 300, ahorra: 30 }] } })}select count(*) from retail.campana_regla_insignias where regla_id = :'r';\n`),
  "0",
);

console.log("\n— La tienda web —");
esperarValor(
  "la huella del catálogo cambia cuando cambian las insignias de una oferta",
  caso(`${OFERTA()}select retail.tienda_catalogo_version() as h0 \\gset
delete from retail.campana_regla_insignias where regla_id = :'r';
select retail.tienda_catalogo_version() <> :'h0';\n`),
  "t",
);

console.log("\n— Volver a activar una campaña —");
// La campaña «ZZ» tiene «−20 % en la insignia» (a1) y se apaga; otra campaña activa su propio «−10 % en la insignia» sobre a1, que no choca
// porque la primera está apagada. Volver a encender la primera dejaría a a1 con dos ofertas.
const DOS_CAMPANAS = `${OFERTA()}set constraints all immediate;
set constraints all deferred;
update retail.etiquetas set activo = false where id = :'camp';
insert into retail.etiquetas (nombre, estilo) values ('ZZ Otra campaña (prueba)', 'campana') returning id as camp3 \\gset
select retail.actualizar_campana_etiqueta(:'camp3', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
select retail.guardar_oferta_completa(null, :'camp3', 'ZZ otra', '{"tipo":"pct","porcentaje":10}'::jsonb || jsonb_build_object('insignias', jsonb_build_array(:'ins')),
  ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as r3 \\gset
set constraints all immediate;
set constraints all deferred;
`;
esperarError(
  "volver a activar una campaña cuya oferta choca con otra activa se frena: la prenda tendría dos ofertas",
  caso(`${DOS_CAMPANAS}update retail.etiquetas set activo = true where id = :'camp';
set constraints all immediate;\n`),
  "choca con",
);
esperarValor(
  "sin choque, se vuelve a activar como siempre",
  caso(`${DOS_CAMPANAS}update retail.campana_reglas set estado = 'desactivada' where id = :'r3';
update retail.etiquetas set activo = true where id = :'camp';
set constraints all immediate;
select activo from retail.etiquetas where id = :'camp';\n`),
  "t",
);

console.log("\n— La portada —");
// Una campaña sin prendas propias (sin categorías ni marcadas) con «−20 % en la insignia» y las demás campañas apagadas en la transacción.
const SOLO_INSIGNIA = `insert into retail.etiquetas (nombre, estilo) values ('ZZ Solo insignia (prueba)', 'campana') returning id as camp2 \\gset
select retail.actualizar_campana_etiqueta(:'camp2', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
update retail.etiquetas set activo = false where estilo = 'campana' and id <> :'camp2';
select retail.guardar_oferta_completa(null, :'camp2', 'ZZ portada', '{"tipo":"pct","porcentaje":20}'::jsonb || jsonb_build_object('insignias', jsonb_build_array(:'ins')),
  ${HOY}, ${HOY} + 2, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as r2 \\gset
`;
esperarValor(
  "una campaña sin prendas propias con «−20 % en una insignia» sale en la portada de la tienda web",
  caso(`${SOLO_INSIGNIA}select concat_ws('|', (select id from retail.fn_campana_portada()) = :'camp2', (select pct::integer from retail.fn_campana_portada()));\n`),
  "t|20",
);
esperarValor(
  "sin la oferta, la misma campaña no tiene prendas y no sale",
  caso(`${SOLO_INSIGNIA}update retail.campana_reglas set estado = 'desactivada' where id = :'r2';
select count(*) from retail.fn_campana_portada() where id = :'camp2';\n`),
  "0",
);

console.log("\n— Pegar —");
esperarValor(
  "las dos migraciones se pegan dos veces, y cada función de la regla y de los choques queda con una sola firma",
  correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(HUELLA, "utf8")}\n${readFileSync(HUELLA, "utf8")}
select string_agg(proname || ':' || n, ',' order by proname) from (
  select p.proname, count(*) as n from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('fn_choques_de_oferta', 'fn_choques_de_oferta_sin_llave', 'fn_choques_de_oferta_con_forma', 'fn_choques_de_oferta_con_forma_sin_llave',
                     'fn_oferta_alcanza_variante', 'fn_oferta_alcanza_variante_con_insignias', 'fn_variantes_de_oferta', 'fn_variantes_de_oferta_con_insignias')
  group by p.proname) x;\nrollback;`),
  "fn_choques_de_oferta:1,fn_choques_de_oferta_con_forma:1,fn_choques_de_oferta_con_forma_sin_llave:1,fn_choques_de_oferta_sin_llave:1,fn_oferta_alcanza_variante:1,fn_oferta_alcanza_variante_con_insignias:1,fn_variantes_de_oferta:1,fn_variantes_de_oferta_con_insignias:1",
);

esperar(
  "las de la auditoría (la portada y volver a activar una campaña) se pegan dos veces",
  correr(`begin;\n${ANTES}\n${["20261114071000_portada_con_ofertas_por_modelo_o_insignia", "20261114072000_campana_reactivada_sin_choques"].flatMap((m) => [leer(m), leer(m)]).join("\n")}\nrollback;`).ok,
);

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
