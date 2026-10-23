#!/usr/bin/env node
/**
 * Prueba de «la tienda recibe mirando la foto» (ADR-0480, actividad 6): `20261023121000_compras_simple_recibir_con_la_foto.sql`.
 *
 * QUÉ PROMETE
 *   · El detalle del envío de una compra anotada desde el celular trae sus papeles (de quién, qué papel, la foto y quién compró), sin montos.
 *   · Cada línea trae la prenda del catálogo que eligió la compradora; una prenda sin catálogo viene sin ella.
 *   · Quien tiene Recibir lee las fotos de `papeles/`, pero no los vouchers (`plata/`) ni los gastos (`gastos/`); sin Recibir ni Compras,
 *     nada.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces y ROLLBACK siempre. Usa «Compré ropa» y «Mandar a la
 * tienda» (actividades 3 y 5), que ya tienen que estar en la base.
 *
 * USO
 *   pnpm pruebas:compras-simple-recibir                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_recibir.mjs --contenedor <otro>  → contra otro contenedor
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
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261023121000_compras_simple_recibir_con_la_foto.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: compra
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo: recibe

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth, clave) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n` +
  `set local role authenticated;\n`;

// Felipe compra seis de una prenda del catálogo y tres de una sin catálogo, todo para Trujillo, con boleta, y lo manda.
const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select p.proveedor_id as prov from retail.productos p where p.proveedor_id is not null and p.estado = 'activo' and not p.es_prueba
 group by p.proveedor_id order by count(*) desc limit 1 \\gset
select id as p1, categoria_id as cat, marca_id as marca from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia limit 1 \\gset
select set_config('t.prov', :'prov', true), set_config('t.p1', :'p1', true), set_config('t.tru', :'tru', true), set_config('t.cat', :'cat', true),
       set_config('t.marca', :'marca', true) \\g /dev/null
-- Micaela solo con Recibir.
insert into retail.roles (nombre) values ('ZZ Recibe ADR-0480') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'recibir');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
${como(FELIPE, "compra_rapida")}
select retail.registrar_compra_rapida('aaaaaaaa-0480-4000-8000-0000000006a1', current_setting('t.prov')::uuid, 'boleta', 330, 'papeles/boleta-prueba.jpg', jsonb_build_array(
  jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 6, 'costo', 40, 'precio_venta', 99.90, 'destino_id', current_setting('t.tru')::uuid),
  jsonb_build_object('descripcion', 'Polera capucha prueba', 'categoria_id', current_setting('t.cat')::uuid, 'marca_id', current_setting('t.marca')::uuid, 'cantidad', 3, 'costo', 30, 'destino_id', current_setting('t.tru')::uuid))) \\g /dev/null
${como(FELIPE, "compra_mandar")}
select retail.mandar_compras_a_tienda(current_setting('t.tru')::uuid, 1, 'aaaaaaaa-0480-4000-8000-0000000006b1') ->> 'despacho_id' as envio \\gset
select set_config('t.envio', :'envio', true) \\g /dev/null
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).join(" / ");
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "quien recibe ve el papel de la compra, con su foto y quién compró, sin montos",
  `${como(MICAELA, null)}
select jsonb_array_length(d -> 'papeles'), d -> 'papeles' -> 0 ->> 'tipo', d -> 'papeles' -> 0 ->> 'foto_ruta',
       d -> 'papeles' -> 0 ->> 'compradora' is not null, (d -> 'papeles' -> 0) ? 'monto'
  from retail.fn_envio_detalle(current_setting('t.envio')::uuid) d;`,
  "1|boleta|papeles/boleta-prueba.jpg|t|f",
);

caso(
  "la línea de la prenda elegida trae su prenda del catálogo; la de una sin catálogo, no",
  `${como(MICAELA, null)}
select string_agg(coalesce(l -> 'producto' ->> 'id' = current_setting('t.p1'), false)::text || ':' || (l ->> 'cantidad'), ',' order by (l ->> 'cantidad')::int desc)
  from retail.fn_envio_detalle(current_setting('t.envio')::uuid) d, jsonb_array_elements(d -> 'lineas') l;`,
  "true:6,false:3",
);

caso(
  "Recibir lee las fotos de papeles/, no los vouchers ni los gastos; sin Recibir, nada",
  `${como(MICAELA, null)}
select retail.fn_puede_ver_foto_gasto_viaje('papeles/x.jpg'), retail.fn_puede_ver_foto_gasto_viaje('plata/x.jpg'),
       retail.fn_puede_ver_foto_gasto_viaje('gastos/x.jpg');
reset role;
delete from retail.rol_modulos where rol_id = :'rol';
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'existencias');
${como(MICAELA, null)}
select retail.fn_puede_ver_foto_gasto_viaje('papeles/x.jpg');`,
  "t|f|f / f",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
