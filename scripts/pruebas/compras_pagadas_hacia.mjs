#!/usr/bin/env node
/**
 * Prueba de ADR-0636, paso 1 — las compras pagadas que vienen a una tienda (`20261110004000_compras_pagadas_hacia_la_tienda.sql`).
 *
 * QUÉ CUBRE: una compra pagada y todavía sin mandar aparece para su sede como «por mandar»; al mandarla aparece con su envío en camino;
 * no aparece para otra sede; no trae montos; quien recibe (solo módulo Recibir) la lee y quien no tiene el módulo no; al completarse el
 * papel deja de aparecer.
 * CÓMO: una transacción con ROLLBACK, con las funciones reales de Mis compras (`registrar_compra_rapida`, `mandar_compras_a_tienda`),
 * armada como `compras_simple_revisar.mjs` pero sin volver a pegar migraciones viejas. Nada queda escrito.
 * USO: pnpm pruebas:compras-pagadas-hacia   (RETAIL_CONTENEDOR_PG=<contenedor> para otra base)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261110004000_compras_pagadas_hacia_la_tienda.sql"), "utf8");
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder: compra y manda
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: recibe

const como = (auth, clave = null) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\nset local role authenticated;\n`;

const INTENTO = `
create function pg_temp.intento() returns text language plpgsql as $f$
begin
  perform retail.fn_compras_pagadas_hacia(current_setting('t.tru')::uuid);
  return 'OK';
exception when others then
  return sqlstate;
end;
$f$;
grant execute on function pg_temp.intento() to authenticated;`;

const SQL = `
set client_min_messages = warning;
begin;
${MIGRACION}
${INTENTO}
set local search_path = retail, public, extensions;
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
insert into retail.proveedores (nombre) values ('Proveedor Pagadas Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Pagadas Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Pagadas', 'accesorios') returning id as cat \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as otra from retail.ubicaciones where tipo = 'tienda' and nombre <> 'Tienda Trujillo' order by nombre limit 1 \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select set_config('t.prov', :'prov', true), set_config('t.tru', :'tru', true), set_config('t.otra', :'otra', true),
       set_config('t.cat', :'cat', true), set_config('t.marca', :'marca', true) \\g /dev/null
insert into retail.roles (nombre) values ('ZZ Recibe ADR-0636') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'recibir');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela_p';
insert into retail.roles (nombre) values ('ZZ Sin nada ADR-0636') returning id as rol_nada \\gset
${como(SANDRA, "compra_rapida")}
select retail.registrar_compra_rapida('aaaaaaaa-0636-4000-8000-0000000000a1', current_setting('t.prov')::uuid, 'nota_venta', 80, 'papeles/prueba-0636.jpg', jsonb_build_array(
  jsonb_build_object('descripcion', 'Polo prueba', 'categoria_id', current_setting('t.cat')::uuid, 'marca_id', current_setting('t.marca')::uuid, 'cantidad', 8, 'costo', 10, 'destino_id', current_setting('t.tru')::uuid))) \\g /dev/null
${como(MICAELA)}
-- 1: sin mandar
select jsonb_array_length(x), x -> 0 ->> 'prendas', x -> 0 ->> 'por_mandar', jsonb_array_length(x -> 0 -> 'envios'), x -> 0 ->> 'proveedor', (x::text ~ 'monto|pagado|precio|costo')
  from (select retail.fn_compras_pagadas_hacia(current_setting('t.tru')::uuid) x) t;
-- 2: otra sede no la ve
select jsonb_array_length(retail.fn_compras_pagadas_hacia(current_setting('t.otra')::uuid));
${como(SANDRA, "compra_mandar")}
select retail.mandar_compras_a_tienda(current_setting('t.tru')::uuid, 1, 'aaaaaaaa-0636-4000-8000-0000000000b1') \\g /dev/null
${como(MICAELA)}
-- 3: mandada
select x -> 0 ->> 'por_mandar', jsonb_array_length(x -> 0 -> 'envios'), x -> 0 -> 'envios' -> 0 ->> 'estado', (x -> 0 -> 'envios' -> 0 ->> 'numero') is not null
  from (select retail.fn_compras_pagadas_hacia(current_setting('t.tru')::uuid) x) t;
reset role;
-- 4: sin el módulo no se lee
update retail.colaboradores set rol_id = :'rol_nada' where persona_id = :'micaela_p';
${como(MICAELA)}
select pg_temp.intento();
reset role;
-- 5: completado deja de aparecer
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela_p';
update retail.compra_papeles set estado = 'completado' where id = 'aaaaaaaa-0636-4000-8000-0000000000a1';
${como(MICAELA)}
select jsonb_array_length(retail.fn_compras_pagadas_hacia(current_setting('t.tru')::uuid));
rollback;
`;

let salida;
try {
  salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: SQL,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (e) {
  console.error(`✗ la escena no corrió:\n${e.stderr ?? e.message}`);
  process.exit(1);
}
const [sinMandar, otraSede, mandada, sinModulo, completado] = salida.split("\n").filter((l) => l !== "");
let fallos = 0;
let casos = 0;
const esperar = (nombre, ok) => {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) fallos++;
};
esperar("pagada y sin mandar: aparece con 8 prendas, 8 por mandar y sin envío", sinMandar?.startsWith("1|8|8|0|Proveedor Pagadas Prueba|"));
esperar("no trae montos", sinMandar?.endsWith("|f"));
esperar("otra sede no la ve", otraSede === "0");
esperar("al mandarla: nada por mandar y un envío en camino con su número", mandada === "0|1|en_camino|t");
esperar("sin el módulo Recibir no se lee (42501)", sinModulo === "42501");
esperar("al completarse el papel deja de aparecer", completado === "0");
console.log(`\n${casos - fallos}/${casos} casos en verde.`);
if (fallos) {
  console.log(salida);
  process.exit(1);
}
