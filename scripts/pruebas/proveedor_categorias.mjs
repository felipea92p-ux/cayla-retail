#!/usr/bin/env node
/**
 * Prueba de `retail.fn_proveedor_categorias()` (migración `20261021201000_proveedor_categorias_para_ordenes.sql`): qué categorías
 * maneja cada proveedor, derivado de lo que ya existe, para el prefiltro de «Nueva orden de compra» (informe
 * `docs/pantallas/compras-ordenes-nueva.md`, tarea #6).
 *
 * LO QUE VIGILA.
 *   · La puerta: solo quien tiene el módulo Órdenes de compra la lee (42501 y `ordenes_compra_sin_modulo` sin él).
 *   · Las cuatro fuentes: un producto con proveedor; un producto SIN proveedor cuya marca trae UN solo proveedor (si la traen dos, no
 *     se atribuye a ninguno); una orden `generada` (una anulada deja de contar sola); un comprobante `vigente` (uno anulado, no).
 *   · Lo que no cuenta: un producto rechazado o de prueba.
 *   · Sin repetidos: el par sale una sola vez aunque venga de varias fuentes.
 *
 * Cada caso corre en una transacción que TERMINA EN ROLLBACK, con la migración cargada dentro (idempotente): el Postgres local no
 * cambia. Los proveedores, marcas y productos de la escena son propios (nombres «ZZ …»): el ruido del seed no los toca.
 *
 * USO: pnpm pruebas:proveedor-categorias [--contenedor <nombre>]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261021201000_proveedor_categorias_para_ordenes.sql"), "utf8");
const LIDER = "22222222-2222-4222-8222-000000000001";
const INTEGRANTE = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** La escena: dos proveedores propios, tres categorías, tres marcas y la tienda para el comprobante. */
const ESCENA = `
insert into retail.proveedores (nombre) values ('ZZ Proveedor Uno') returning id as pu \\gset
insert into retail.proveedores (nombre) values ('ZZ Proveedor Dos') returning id as pd \\gset
select id as c1 from retail.categorias order by nombre limit 1 \\gset
select id as c2 from retail.categorias order by nombre offset 1 limit 1 \\gset
select id as c3 from retail.categorias order by nombre offset 2 limit 1 \\gset
select id as c4 from retail.categorias order by nombre offset 3 limit 1 \\gset
insert into retail.marcas (nombre) values ('ZZ Marca Sola') returning id as m_sola \\gset
insert into retail.marcas (nombre) values ('ZZ Marca Compartida') returning id as m_comp \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'m_sola', :'pu');
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'m_comp', :'pu'), (:'m_comp', :'pd');
select id as tru from retail.ubicaciones where tipo = 'tienda' order by nombre limit 1 \\gset
select c.rol_id as rol_int from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${INTEGRANTE}' \\gset
select id as felipe_p from public.personas where auth_user_id = '${LIDER}' \\gset
-- La escena parte SIN el módulo para la integrante (una base local que lo tenga de antes no debe cambiar el resultado).
delete from retail.rol_modulos where rol_id = :'rol_int' and modulo = 'ordenes_compra';
`;

const como = (quien, cuerpo) =>
  `set local role authenticated;\nset local request.jwt.claim.sub = '${quien}';\nset local request.jwt.claim.role = 'authenticated';\n${cuerpo}\nreset role;`;
/** Marcar un producto como «de prueba» o «rechazado» lo hace solo un líder (la base lo exige): esas filas se insertan con su sesión. */
const comoLider = (sql) => `set local request.jwt.claim.sub = '${LIDER}';\n${sql}\nreset request.jwt.claim.sub;`;
const conModulo = `insert into retail.rol_modulos (rol_id, modulo) values (:'rol_int', 'ordenes_compra') on conflict do nothing;`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${ESCENA}\n${cuerpo}\nrollback;`);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
const pasa = (sql) => () => {
  try {
    const salida = dentro(sql);
    if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida || "(vacía)"}`;
  } catch (e) {
    return `se rechazó y debía pasar: ${String(e.stderr ?? e.message).split("\n")[0]}`;
  }
};
const rechaza = (sql, patron) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!patron.test(String(e.stderr))) throw e;
  }
};

/** Expresiones sobre lo que la función le devuelve al líder. UNA sola consulta por caso (`afirma`): con varias, bastaba que una
 *  imprimiera `t` para que el caso pasara aunque otra dijera `f` (lo descubrió un mutante que sobrevivía). */
const existe = (prov, cat) => `exists (select 1 from retail.fn_proveedor_categorias() where proveedor_id = :'${prov}' and categoria_id = :'${cat}')`;
const hay = (prov, cat) => existe(prov, cat);
const noHay = (prov, cat) => `not ${existe(prov, cat)}`;
const afirma = (...condiciones) => como(LIDER, `select ${condiciones.join(" and ")};`);

// La puerta.
caso(
  "sin el módulo Órdenes de compra, la integrante recibe 42501",
  rechaza(como(INTEGRANTE, `select count(*) from retail.fn_proveedor_categorias();`), /ordenes_compra_sin_modulo|42501/)
);
caso("con el módulo en su rol, la integrante la lee", pasa(`${conModulo}\n${como(INTEGRANTE, `select count(*) >= 0 from retail.fn_proveedor_categorias();`)}`));
caso("el líder la lee", pasa(como(LIDER, `select count(*) >= 0 from retail.fn_proveedor_categorias();`)));
caso("anon no la ejecuta", rechaza(`set local role anon;\nselect * from retail.fn_proveedor_categorias();`, /permission denied/));

// Fuente 1: productos con proveedor.
caso(
  "un producto con proveedor pone su categoría entre las del proveedor",
  pasa(`insert into retail.productos (referencia, categoria_id, proveedor_id) values ('ZZ P1', :'c1', :'pu');\n${afirma(hay("pu", "c1"))}`)
);
caso(
  "y no se la pone a otro proveedor",
  pasa(`insert into retail.productos (referencia, categoria_id, proveedor_id) values ('ZZ P1', :'c1', :'pu');\n${afirma(noHay("pd", "c1"))}`)
);
caso(
  "un producto de prueba no cuenta",
  pasa(`${comoLider(`insert into retail.productos (referencia, categoria_id, proveedor_id, es_prueba) values ('ZZ P2', :'c2', :'pu', true);`)}\n${afirma(noHay("pu", "c2"))}`)
);
caso(
  "un producto rechazado no cuenta",
  // Sin sesión nace «pendiente» (propuesta de una colaboradora); solo un líder puede rechazar una pendiente.
  pasa(`insert into retail.productos (referencia, categoria_id, proveedor_id) values ('ZZ P3', :'c2', :'pu');
${comoLider(`update retail.productos set estado = 'descontinuado', estado_alta = 'rechazado' where referencia ilike 'zz p3';`)}
select count(*) = 1 as _rechazado from retail.productos where referencia ilike 'zz p3' and estado_alta = 'rechazado' \\gset
${afirma(noHay("pu", "c2"))}`)
);

// Fuente 2: marca de un solo proveedor.
caso(
  "un producto SIN proveedor cuya marca trae un solo proveedor cuenta para ese proveedor",
  pasa(`insert into retail.productos (referencia, categoria_id, marca_id) values ('ZZ M1', :'c2', :'m_sola');\n${afirma(hay("pu", "c2"))}`)
);
caso(
  "con una marca que traen dos proveedores no se atribuye a ninguno (sería adivinar)",
  pasa(`insert into retail.productos (referencia, categoria_id, marca_id) values ('ZZ M2', :'c3', :'m_comp');\n${afirma(noHay("pu", "c3"), noHay("pd", "c3"))}`)
);
caso(
  "si el producto SÍ tiene proveedor, manda ese y no el de la marca",
  pasa(`insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('ZZ M3', :'c3', :'m_comp', :'pd');\n${afirma(noHay("pu", "c3"), hay("pd", "c3"))}`)
);

// Fuente 3: órdenes de compra.
const ORDEN = (estado) => `insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por${estado === "anulada" ? ", estado, anulada_por, anulada_en, motivo_anulacion" : ""})
  values (:'pu', null, :'felipe_p'${estado === "anulada" ? ", 'anulada', :'felipe_p', now(), 'Prueba'" : ""}) returning id as o \\gset
select id as marca_ord from retail.marcas where activo order by nombre limit 1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (:'o', 1, :'c4', :'marca_ord', 1, 10);`;
caso("una orden generada pone su categoría entre las del proveedor", pasa(`${ORDEN("generada")}\n${afirma(hay("pu", "c4"))}`));
caso("una orden ANULADA deja de contar (el par se deriva, no se guarda)", pasa(`${ORDEN("anulada")}\n${afirma(noHay("pu", "c4"))}`));

// Fuente 4: comprobantes.
const COMPRA = (estadoExtra) => `insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (:'pu', 'factura', 'FZZ', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), retail.fn_hoy_lima(), 'credito', retail.fn_hoy_lima() + 20, 100, 18, 118, 'mercaderia', :'tru') returning id as cp \\gset
insert into retail.compra_items (compra_id, descripcion, cantidad, costo_unitario, categoria_id, marca_id) values (:'cp', 'Prenda de prueba', 2, 50, :'c4', :'m_sola');
${estadoExtra}`;
caso("un comprobante vigente pone la categoría de su línea entre las del proveedor", pasa(`${COMPRA("")}\n${afirma(hay("pu", "c4"))}`));
caso(
  "un comprobante ANULADO deja de contar",
  pasa(`${COMPRA("update retail.compras set estado = 'anulada', motivo_anulacion = 'Prueba', anulada_por = :'felipe_p', anulada_at = now() where id = :'cp';")}\n${afirma(noHay("pu", "c4"))}`)
);

// Sin repetidos.
caso(
  "el par sale una sola vez aunque venga de varias fuentes",
  pasa(`insert into retail.productos (referencia, categoria_id, proveedor_id) values ('ZZ R1', :'c1', :'pu'), ('ZZ R2', :'c1', :'pu');
insert into retail.productos (referencia, categoria_id, marca_id) values ('ZZ R3', :'c1', :'m_sola');
${como(LIDER, `select count(*) = 1 from retail.fn_proveedor_categorias() where proveedor_id = :'pu' and categoria_id = :'c1';`)}`)
);

// Re-pegable.
caso("pegar la migración dos veces no cambia nada la segunda", pasa(`${MIGRACION}\nselect true;`));

console.log(`\n${total - fallas}/${total} casos pasan.`);
process.exit(fallas ? 1 : 0);
