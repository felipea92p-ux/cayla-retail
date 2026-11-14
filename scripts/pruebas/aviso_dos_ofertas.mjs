#!/usr/bin/env node
/**
 * Pruebas del aviso de Campañas: qué prendas tienen dos ofertas y cuál se queda (`20261114170000_aviso_de_dos_ofertas.sql`, ADR-0655,
 * decisión 2 de Felipe, parte 3) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · `campanas_ofertas_que_chocan()` dice cada par una vez (dos ofertas, o una oferta y un descuento de siempre), con sus prendas y modelos;
 *   · `elegir_oferta_que_queda(gana, cede)` resuelve un par aunque la que gana tenga otro choque abierto (`ceder_ofertas` lo rechazaba: es el
 *     control), queda en la historia de la oferta, no deja cederse en los dos sentidos, y la caja cobra la que quedó;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. La segunda oferta llega «por una puerta de fuera»: se activa a mano dentro de la
 * transacción, donde el candado diferido no alcanza a mirar (como al reactivar una campaña). Si la base local no tiene las migraciones de
 * las ofertas, las aplica dentro.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed.
 *
 * USO
 *   pnpm pruebas:aviso-dos-ofertas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR = process.argv.includes("--contenedor") ? process.argv[process.argv.indexOf("--contenedor") + 1] : "supabase_db_cayla-retail";
const MIGRACION = "20261114170000_aviso_de_dos_ofertas";
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? (r.salida.split("\n").filter(Boolean).at(-1) ?? "") : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, r.ok && ultima(r) === esperado, r.ok ? `dio «${ultima(r)}», se esperaba «${esperado}»` : r.mensaje);
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»` : r.mensaje);

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR}. Levántalo con: npx supabase start`);
  process.exit(2);
}
const falta = (sql) => correr(sql).salida === "t";
const leer = (n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8");
// La base local puede no tener la obra de las ofertas: se pega entera, en su orden, dentro de cada escenario (en el CI ya está).
const OBRA = [
  "20261112204000_fusionar_productos_base", "20261112205000_fusionar_productos_previsualizar", "20261112210000_fusionar_productos",
  "20261112211000_fusionar_productos_lecturas", "20261113175000_fusionar_productos_tallas_vacias",
  "20261113210000_oferta_prenda_por_prenda", "20261113223000_una_oferta_por_prenda_tienda_y_dia", "20261113230000_choques_de_oferta_de_una_vez",
  "20261114003000_ofertas_de_grupo", "20261114011000_caja_cobra_ofertas_de_grupo", "20261114032000_apartados_con_ofertas_de_grupo",
  "20261114041000_tienda_web_ofertas_de_grupo", "20261114044000_monto_con_escalones", "20261113202000_tienda_catalogo_version",
  "20261114054000_choques_con_forma_una_sola_firma", "20261114060000_ofertas_por_insignia", "20261114061000_huella_tienda_con_insignias",
  "20261114064000_finanzas_campanas_con_ofertas_de_grupo", "20261114071000_portada_con_ofertas_por_modelo_o_insignia",
  "20261114072000_campana_reactivada_sin_choques", "20261114125000_cambio_mismo_modelo_conserva_descuento",
  "20261114130000_oferta_no_llega_por_insignia_desactivada", "20261114131000_frescura_ofertas_y_club_como_campana",
  "20261114132000_venta_sin_conexion_con_las_ofertas_de_su_hora", "20261114142000_huella_tienda_con_insignia_viva",
  "20261114155000_dos_ofertas_la_que_mas_ahorra",
];
const sinObra = falta("select to_regprocedure('retail.fn_cuenta_de_grupos(jsonb)') is null;");
const ANTES = [
  sinObra ? OBRA.map(leer).join("\n") : "",
  falta("select to_regprocedure('retail.campanas_ofertas_que_chocan()') is null;") ? leer(MIGRACION) : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Tienda Lima, la Blusa Emma (a1; su categoría, cat) con un 3x2 activo en la campaña «ZZ 3x2» (r) y un «20 % menos» de la campaña «ZZ Navidad»
// (p) en la misma categoría, que nace en borrador (la hoja no la deja chocar) y se activa a mano: la puerta de fuera.
const PARTIDA = `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat, p.referencia as ref from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ 3x2 (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
select retail.guardar_oferta_completa(null, :'camp', 'ZZ 3x2', '{"tipo":"nxm","lleva":3,"paga":2}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as r \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Navidad (prueba)', 'campana') returning id as camp2 \\gset
select retail.actualizar_campana_etiqueta(:'camp2', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
select retail.guardar_oferta_completa(null, :'camp2', 'ZZ 20 %', '{"tipo":"pct","porcentaje":20}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false) as p \\gset
update retail.campana_reglas set estado = 'activa', activada_en = now(), activada_por = creada_por where id = :'p';
`;
// El par de las dos ofertas, como lo dice el aviso (cualquiera sea el orden).
const PAR = `(select count(*) from retail.campanas_ofertas_que_chocan() c
   where c.otra_tipo = 'oferta' and ((c.oferta_id = :'r' and c.otra_id = :'p') or (c.oferta_id = :'p' and c.otra_id = :'r')))`;
// Un descuento de siempre (otra campaña con su % en la misma categoría): otra puerta de fuera.
const DESCUENTO = `insert into retail.etiquetas (nombre, estilo) values ('ZZ Liquidar (prueba)', 'campana') returning id as liq \\gset
select retail.actualizar_campana_etiqueta(:'liq', 30, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
`;

console.log("\n— Lo que dice el aviso —");
esperarValor(
  "dos ofertas en las mismas prendas: el par sale una sola vez, con su tienda, sus prendas y el modelo",
  correr(`${PARTIDA}select concat_ws('|', ${PAR}, (select bool_and(c.prendas > 0 and 'Lima' = any (c.tiendas)
      and exists (select 1 from jsonb_array_elements(c.modelos) m where m ->> 'id' = :'modelo' and m ->> 'nombre' = :'ref'))
    from retail.campanas_ofertas_que_chocan() c where c.otra_tipo = 'oferta' and :'r' in (c.oferta_id, c.otra_id)));\nrollback;`),
  "1|t",
);
esperarValor(
  "un descuento de siempre en las mismas prendas también sale, como «descuento», desde cada oferta",
  correr(`${PARTIDA}${DESCUENTO}select count(*) from retail.campanas_ofertas_que_chocan() c where c.otra_tipo = 'descuento' and c.otra_id = :'liq' and c.oferta_id in (:'r', :'p');\nrollback;`),
  "2",
);
esperarValor(
  "sin la segunda oferta activa, no hay nada que avisar de ellas",
  correr(`${PARTIDA}update retail.campana_reglas set estado = 'borrador' where id = :'p';\nselect ${PAR};\nrollback;`),
  "0",
);

console.log("\n— Elegir cuál se queda —");
esperarValor(
  "elegir el 3x2 resuelve el par: deja de avisarse, la cesión queda guardada y la oferta lo cuenta en su historia",
  correr(`${PARTIDA}select retail.elegir_oferta_que_queda(:'r', :'p');\nselect concat_ws('|', ${PAR},
    (select count(*) from retail.campana_regla_cesiones where gana_regla_id = :'r' and cede_regla_id = :'p'),
    (select count(*) from retail.campana_regla_historial where regla_id = :'r' and antes ? 'ceden'));\nrollback;`),
  "0|1|1",
);
esperarValor(
  "resuelve ese par aunque la que gana tenga otro choque abierto (un descuento de siempre), que sigue en el aviso",
  correr(`${PARTIDA}${DESCUENTO}select retail.elegir_oferta_que_queda(:'r', :'p');\nselect concat_ws('|', ${PAR},
    (select count(*) from retail.campanas_ofertas_que_chocan() c where c.otra_tipo = 'descuento' and c.oferta_id = :'r'));\nrollback;`),
  "0|1",
);
esperarError(
  "CONTROL: con ese otro choque abierto, ceder_ofertas no podía resolver el par (pedía todos de una vez)",
  correr(`${PARTIDA}${DESCUENTO}select retail.ceder_ofertas(:'r', array[:'p']::uuid[]);\nrollback;`),
  "choca con",
);
esperarError(
  "no se puede elegir la otra después: dos ofertas no se ceden una a la otra",
  correr(`${PARTIDA}select retail.elegir_oferta_que_queda(:'r', :'p');\nselect retail.elegir_oferta_que_queda(:'p', :'r');\nrollback;`),
  "Ya elegiste la otra",
);
esperarValor(
  "elegir la rebaja: la caja ya no le da parte del 3x2 a esa prenda, aunque sean tres",
  correr(`${PARTIDA}select retail.elegir_oferta_que_queda(:'p', :'r');\nselect coalesce(sum(g.descuento), 0) from retail.fn_ofertas_de_grupo(${HOY}, :'u',
    jsonb_build_array(jsonb_build_object('variante_id', :'a1', 'precio_unitario', 100, 'cantidad', 3)), 0) g;\nrollback;`),
  "0",
);

console.log("\n— La migración —");
esperar("se puede pegar dos veces", correr(`begin;\n${ANTES}\n${leer(MIGRACION)}\n${leer(MIGRACION)}\nrollback;`).ok);

console.log(`\n${total - fallos}/${total} pasaron${sinObra ? " (con las migraciones metidas en cada transacción: la base local no las tiene)" : ""}.`);
process.exit(fallos ? 1 : 0);
