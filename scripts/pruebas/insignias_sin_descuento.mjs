#!/usr/bin/env node
/**
 * Pruebas de «una insignia nunca baja el precio» (`20261113234000_insignias_sin_descuento.sql`, ADR-0655 actividad 5) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · una insignia con descuento pasa a campaña con TODO igual: el %, las fechas, las prendas marcadas, sus categorías y sus tiendas, y la
 *     caja (`fn_campanas_en_sede`) cobra lo mismo antes y después; una insignia sin descuento no cambia;
 *   · el candado `etiquetas_descuento_solo_campana`: una insignia con descuento se rechaza (al crearla, al ponérselo y por
 *     `actualizar_campana_etiqueta`), y volver insignia a una campaña con descuento también; una campaña con descuento sigue valiendo;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK: la base compartida queda igual. Si la base local no tiene la migración, la
 * aplica dentro de cada escenario (después de preparar la insignia con descuento, que con el candado puesto ya no se podría crear).
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed.
 *
 * USO
 *   pnpm pruebas:insignias-sin-descuento
 *   pnpm pruebas:insignias-sin-descuento -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261113234000_insignias_sin_descuento.sql";
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

const TEXTO = readFileSync(MIGRACION, "utf8");
const YA_ESTA = correr("select count(*) from pg_constraint where conrelid = 'retail.etiquetas'::regclass and conname = 'etiquetas_descuento_solo_campana';").salida === "1";
// Con el candado ya puesto en la base, la insignia con descuento del punto de partida no se puede crear: se suelta dentro de la transacción.
const SOLTAR = YA_ESTA ? "alter table retail.etiquetas drop constraint etiquetas_descuento_solo_campana;\n" : "";

// Una insignia con descuento como las de producción: −15 %, fechas, una prenda marcada, una categoría y una tienda.
const PARTIDA = `begin;
${SOLTAR}set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as v1, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.etiquetas (nombre, estilo, descuento_pct, vigente_desde, vigente_hasta)
  values ('ZZ Insignia con descuento', 'urgencia', 15, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 30) returning id as ins \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Insignia sin descuento', 'positivo') returning id as plana \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'ins');
insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'ins', :'cat');
insert into retail.campana_sedes (etiqueta_id, ubicacion_id) values (:'ins', :'lima');
select coalesce(max(descuento_pct), 0) as antes from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[], :'lima') where etiqueta_id = :'ins' \\gset
`;
const MIGRAR = `${TEXTO}\n`;
const CON_CANDADO = `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${YA_ESTA ? "" : MIGRAR}`;

console.log("\n— Las insignias con descuento pasan a campañas —");
esperarValor(
  "la insignia con descuento pasa a campaña con el mismo %, las mismas fechas, prendas, categorías y tiendas, y la caja cobra lo mismo",
  correr(`${PARTIDA}${MIGRAR}select concat_ws('|', e.estilo, e.descuento_pct, e.vigente_hasta - e.vigente_desde,
  (select count(*) from retail.variante_etiquetas where etiqueta_id = :'ins'),
  (select count(*) from retail.etiqueta_categorias where etiqueta_id = :'ins'),
  (select count(*) from retail.campana_sedes where etiqueta_id = :'ins'),
  (select coalesce(max(descuento_pct), 0) from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[], :'lima') where etiqueta_id = :'ins') = :'antes'::numeric, :'antes')
from retail.etiquetas e where e.id = :'ins';\nrollback;`),
  "campana|15.00|31|1|1|1|t|15.00",
);
esperarValor(
  "una insignia sin descuento sigue siendo insignia",
  correr(`${PARTIDA}${MIGRAR}select estilo from retail.etiquetas where id = :'plana';\nrollback;`),
  "positivo",
);
esperarValor(
  "después, ninguna insignia tiene descuento",
  correr(`${PARTIDA}${MIGRAR}select count(*) from retail.etiquetas where descuento_pct is not null and estilo <> 'campana';\nrollback;`),
  "0",
);

console.log("\n— El candado —");
esperarError(
  "crear una insignia con descuento se rechaza",
  correr(`${CON_CANDADO}insert into retail.etiquetas (nombre, estilo, descuento_pct) values ('ZZ Nueva con descuento', 'neutral', 10);\nrollback;`),
  "etiquetas_descuento_solo_campana",
);
esperarError(
  "ponerle descuento a una insignia se rechaza",
  correr(`${CON_CANDADO}insert into retail.etiquetas (nombre, estilo) values ('ZZ Plana', 'neutral') returning id as p \\gset\nupdate retail.etiquetas set descuento_pct = 10 where id = :'p';\nrollback;`),
  "etiquetas_descuento_solo_campana",
);
esperarError(
  "…también por actualizar_campana_etiqueta",
  correr(`${CON_CANDADO}insert into retail.etiquetas (nombre, estilo) values ('ZZ Plana', 'neutral') returning id as p \\gset\nselect retail.actualizar_campana_etiqueta(:'p', 10, null, null, '{}'::uuid[]);\nrollback;`),
  "etiquetas_descuento_solo_campana",
);
esperarError(
  "volver insignia a una campaña con descuento se rechaza",
  correr(`${CON_CANDADO}insert into retail.etiquetas (nombre, estilo, descuento_pct) values ('ZZ Camp', 'campana', 10) returning id as c \\gset\nupdate retail.etiquetas set estilo = 'neutral' where id = :'c';\nrollback;`),
  "etiquetas_descuento_solo_campana",
);
esperarValor(
  "una campaña con descuento sigue valiendo, también sin fecha de fin",
  correr(`${CON_CANDADO}insert into retail.etiquetas (nombre, estilo) values ('ZZ Camp', 'campana') returning id as c \\gset\nselect retail.actualizar_campana_etiqueta(:'c', 10, retail.fn_hoy_lima(), null, '{}'::uuid[]);\nselect descuento_pct || '|' || (vigente_hasta is null) from retail.etiquetas where id = :'c';\nrollback;`),
  "10.00|true",
);

console.log("\n— «Anunciar en la portada» —");
// La portada de la tienda online: solo con la campaña ZZ (las demás se apagan dentro de la transacción).
const SOLO_ZZ = "update retail.etiquetas set activo = false where activo and nombre not like 'ZZ %' and estilo = 'campana';\n";
const PORTADA = "select coalesce((select nombre from retail.fn_campana_portada()), 'ninguna');\n";
esperarValor(
  "la insignia que pasa a campaña nace sin anunciarse: la portada no la anuncia",
  correr(`${PARTIDA}${MIGRAR}${SOLO_ZZ}update retail.campana_sedes set ubicacion_id = ubicacion_id where false;\nselect anunciar_en_portada::text from retail.etiquetas where id = :'ins';\n${PORTADA}rollback;`),
  "ninguna",
);
esperarValor(
  "una campaña de siempre se sigue anunciando; apagada, no; encendida otra vez, sí",
  correr(`${CON_CANDADO}${SOLO_ZZ}select v.id as v1 from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Camp anunciada', 'campana') returning id as c \\gset
select retail.actualizar_campana_etiqueta(:'c', 10, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[]);
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'c');
select coalesce((select nombre from retail.fn_campana_portada()), 'ninguna') as a \\gset
select retail.fijar_anuncio_campana(:'c', false);
select coalesce((select nombre from retail.fn_campana_portada()), 'ninguna') as b \\gset
select retail.fijar_anuncio_campana(:'c', true);
select :'a' || '|' || :'b' || '|' || coalesce((select nombre from retail.fn_campana_portada()), 'ninguna');\nrollback;`),
  "ZZ Camp anunciada|ninguna|ZZ Camp anunciada",
);
esperarError(
  "una insignia no se anuncia en la portada",
  correr(`${CON_CANDADO}insert into retail.etiquetas (nombre, estilo) values ('ZZ Plana', 'neutral') returning id as p \\gset\nselect retail.fijar_anuncio_campana(:'p', true);\nrollback;`),
  "Solo una campaña se anuncia",
);

console.log("\n— La migración —");
esperar("se puede pegar dos veces", correr(`${PARTIDA}${MIGRAR}${MIGRAR}rollback;`).ok);

console.log(`\n${total - fallos}/${total} pasaron${YA_ESTA ? "" : " (con la migración metida en cada transacción: la base local no la tiene)"}.`);
process.exit(fallos ? 1 : 0);
