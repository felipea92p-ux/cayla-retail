#!/usr/bin/env node
/**
 * Una prenda de CLAURE solo se ve en la tienda online donde CLAURE opera (ADR-0463, ADR-0465) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261021000000_tienda_empresa_solo_en_sus_sedes.sql`:
 *   A. El catálogo (`tienda_catalogo`): con Lima (donde CLAURE opera) salen las prendas de CAYLA y de CLAURE; con Trujillo, con una
 *      tienda que no es de la web y sin tienda, solo las de CAYLA.
 *   B. La ficha (`tienda_ficha`): la de una prenda de CLAURE responde `null` con otra tienda y sin tienda (como una sin publicar) y se
 *      abre con Lima; la de una prenda de CAYLA se abre en todas.
 *   C. El probador (`tienda_probador`): lo mismo que el catálogo.
 *   D. La regla única: una sede nueva que nadie sumó a `empresa_sedes` es solo-CAYLA (`fn_empresas_de_sede`), y la prueba lo comprueba
 *      sumándole CLAURE a Trujillo: la prenda aparece ahí sin tocar ninguna función de la tienda.
 *   E. La puerta: `tienda_web` no ejecuta el ayudante `fn_tienda_empresa_se_ve`.
 *   F. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK: nunca se commitea nada en el Postgres local que comparten los
 * worktrees. Cada uno arma su punto de partida: Emma (CAYLA) y Carla (CLAURE) publicadas, con su foto, su recorte y su largo; Trujillo y
 * Lima en la web.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivos.sql separados por coma>` mete las migraciones dentro de cada transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:tienda-empresas                       → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-empresas -- --contenedor supabase_db_<mi-pila>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261021000000_tienda_empresa_solo_en_sus_sedes.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

const BASE = "http://127.0.0.1:54421/storage/v1/object/public/retail-productos-fotos/";
const FOTO_E = "fotos/eeeeeeee-0000-4000-8000-000000000001.jpg"; // de Emma (CAYLA)
const FOTO_C = "fotos/eeeeeeee-0000-4000-8000-000000000002.jpg"; // de Carla (CLAURE)
const recorte = (foto) => foto.replace(/^fotos\//, "recortes/").replace(/\.jpg$/, "-1.png");

// ---- El punto de partida: Emma es de CAYLA; Carla, de CLAURE; las dos publicadas, con foto, recorte y largo; Trujillo y Lima en la web ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
update retail.productos set empresa_id = :'cayla' where id = :'emma';
update retail.productos set empresa_id = :'claure' where id = :'carla';
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'emma', :'carla']::uuid[], true) \\gset
update retail.vitrina_productos set largo_cm = 70 where producto_id in (:'emma', :'carla');
delete from retail.producto_fotos where producto_id in (:'emma', :'carla');
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
  (:'emma', '${BASE}${FOTO_E}', 0, true, null),
  (:'carla', '${BASE}${FOTO_C}', 0, true, null);
insert into retail.foto_recortes (foto, recorte, proporcion, estado, motivo) values
  ('${FOTO_E}', '${recorte(FOTO_E)}', 0.8, 'listo', null),
  ('${FOTO_C}', '${recorte(FOTO_C)}', 0.8, 'listo', null)
on conflict (foto) do update set estado = 'listo', recorte = excluded.recorte;
`;

const CIERRE = "\nrollback;\n";
const escenario = (cuerpo) => correr(PREPARAR + cuerpo + CIERRE);

// «Esta prenda sale en esta lista»: sí/no de la lista de prendas de una función.
const enCatalogo = (prenda, sede) =>
  `select exists (select 1 from jsonb_array_elements(retail.tienda_catalogo(${sede}) -> 'prendas') x where (x ->> 'id')::uuid = :'${prenda}');`;
const enProbador = (prenda, sede) =>
  `select exists (select 1 from jsonb_array_elements(retail.tienda_probador(${sede}) -> 'prendas') x where (x ->> 'id')::uuid = :'${prenda}');`;
const ficha = (prenda, sede) => `select retail.tienda_ficha(:'${prenda}', ${sede}) is not null;`;

const LIMA = ":'lim'";
const TRU = ":'tru'";
const SIN_SEDE = "null";
const SEDE_INVENTADA = "'00000000-0000-4000-8000-0000000000aa'::uuid";

console.log("A. El catálogo");
esperarValor("Lima: sale la prenda de CLAURE", escenario(enCatalogo("carla", LIMA)), "t");
esperarValor("Lima: sale la prenda de CAYLA", escenario(enCatalogo("emma", LIMA)), "t");
esperarValor("Trujillo: NO sale la prenda de CLAURE", escenario(enCatalogo("carla", TRU)), "f");
esperarValor("Trujillo: sale la prenda de CAYLA", escenario(enCatalogo("emma", TRU)), "t");
esperarValor("sin tienda: NO sale la prenda de CLAURE", escenario(enCatalogo("carla", SIN_SEDE)), "f");
esperarValor("una tienda inventada: NO sale la prenda de CLAURE", escenario(enCatalogo("carla", SEDE_INVENTADA)), "f");

console.log("B. La ficha");
esperarValor("Lima: se abre la ficha de CLAURE", escenario(ficha("carla", LIMA)), "t");
esperarValor("Trujillo: la ficha de CLAURE no existe", escenario(ficha("carla", TRU)), "f");
esperarValor("sin tienda: la ficha de CLAURE no existe", escenario(ficha("carla", SIN_SEDE)), "f");
esperarValor("Trujillo: se abre la ficha de CAYLA", escenario(ficha("emma", TRU)), "t");
esperarValor("sin tienda: se abre la ficha de CAYLA", escenario(ficha("emma", SIN_SEDE)), "t");

console.log("C. El probador");
esperarValor("Lima: el probador ofrece la prenda de CLAURE", escenario(enProbador("carla", LIMA)), "t");
esperarValor("Trujillo: el probador NO ofrece la prenda de CLAURE", escenario(enProbador("carla", TRU)), "f");
esperarValor("Trujillo: el probador ofrece la prenda de CAYLA", escenario(enProbador("emma", TRU)), "t");

console.log("D. Una sola regla: la lee `empresa_sedes`");
esperarValor(
  "si CLAURE abre en Trujillo (una fila en empresa_sedes), su prenda aparece ahí sin tocar la tienda",
  escenario(`insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'tru');\n${enCatalogo("carla", TRU)}`),
  "t",
);
esperarValor(
  "y su ficha se abre en Trujillo",
  escenario(`insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'tru');\n${ficha("carla", TRU)}`),
  "t",
);

console.log("E. La puerta");
esperarValor(
  "tienda_web no ejecuta el ayudante",
  correr(`select has_function_privilege('tienda_web', 'retail.fn_tienda_empresa_se_ve(uuid, uuid)', 'execute');`),
  "f",
);

console.log("F. La migración se puede pegar dos veces");
{
  const sql = readFileSync(MIGRACION, "utf8");
  const dos = correr(`begin;\n${sql}\n${sql}\nrollback;`);
  esperar("pegada dos veces no falla", dos.ok, dos.mensaje);
}

console.log(fallos === 0 ? `\nTodo bien: ${total} comprobaciones.` : `\n${fallos} de ${total} comprobaciones fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
