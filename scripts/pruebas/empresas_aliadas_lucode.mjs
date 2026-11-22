#!/usr/bin/env node
/**
 * Prueba de `20261122213000_aliadas_conexion_con_lucode.sql` (ADR-0683): la llave de Lucode de una empresa aliada va al Vault y nunca vuelve.
 *
 * Lo que importa: (1) la migración se aplica dos veces; (2) solo el Admin guarda, y la llave va cifrada al Vault (en `empresas` quedan solo el id
 * del secreto y sus 4 últimos caracteres); (3) guardar otra vez la REEMPLAZA (un solo secreto por aliada) y la deja «sin probar»; (4) dejar la
 * llave vacía guarda el domicilio y no toca la llave; (5) una llave con espacios o muy corta se rechaza; (6) `fn_empresas_aliadas` nunca trae la
 * llave y a quien no es Admin no le dice ni cómo está la conexión; (7) leerla (`fn_llave_lucode_aliada`) y anotar la prueba
 * (`anotar_prueba_lucode_aliada`) no los puede llamar una cuenta: solo el servidor; (8) a CAYLA no se le guarda llave aquí (la suya vive en Vercel).
 * Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK: nada queda en el Vault.
 *
 * USO: pnpm pruebas:empresas-aliadas-lucode   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = [
  "supabase/migrations/20261121152000_empresas_aliadas_desde_configuracion.sql",
  "supabase/migrations/20261121203000_guardar_empresa_aliada_nombre_y_choques.sql",
  "supabase/migrations/20261122213000_aliadas_conexion_con_lucode.sql",
]
  .map((f) => readFileSync(join(RAIZ, f), "utf8"))
  .join("\n");
const ADMIN = "22222222-2222-4222-8222-000000000001"; // Felipe (seed): líder y Admin
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed), no es Admin

const LLAVE = "prueba_lucode_llave_0123456789ABCD"; // termina en «ABCD»
const OTRA = "prueba_lucode_otra_llave_98765WXYZ"; // termina en «WXYZ»

const sesion = (id) =>
  `set local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;
const servidor = `reset role;\nset local role service_role;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Una aliada de prueba creada dentro de la transacción; `:id` queda en la variable `aliada` de psql. */
const ALIADA = `
insert into retail.empresas (id, clave, nombre, orden, activo) values (gen_random_uuid(), 'prueba_lucode', 'Aliada Lucode Prueba', 99, true);
select id as aliada from retail.empresas where clave = 'prueba_lucode' \\gset
`;

function caso(cuerpo) {
  try {
    const salida = psql(`begin;\n${MIGRACION}\n${ALIADA}\n${cuerpo}\nrollback;`);
    const lineas = salida.split("\n").filter((l) => l && l !== "QUEDÓ BIEN");
    return { ok: true, salida: lineas.at(-1) ?? "" };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message) };
  }
}

let fallas = 0;
function esperar(nombre, r, condicion) {
  const pasa = condicion(r);
  if (!pasa) fallas++;
  console.log(`${pasa ? "✓" : "✗"} ${nombre}${pasa ? "" : `\n    ${r.ok ? `salió: ${r.salida}` : `error: ${r.error.split("\n").find((l) => l.includes("ERROR")) ?? r.error}`}`}`);
}
const fallaCon = (texto) => (r) => !r.ok && r.error.includes(texto);
const da = (esperado) => (r) => r.ok && r.salida === esperado;
const guardar = (llave, domicilio = "Av. Prueba 123, Lima") =>
  `select retail.guardar_comprobantes_aliada(:'aliada', '${domicilio}', ${llave === null ? "null" : `'${llave}'`});`;

// 1. Dos veces
esperar("la migración se aplica dos veces", caso(`${MIGRACION}\nselect 'ok';`), da("ok"));

// 2. Solo el Admin, y la llave va al Vault
esperar("quien no es Admin no guarda la llave", caso(`${sesion(MICAELA)}\n${guardar(LLAVE)}`), fallaCon("Solo un Admin"));
esperar(
  "el Admin la guarda: devuelve solo «termina en» y el estado",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}`),
  da('{"estado": "sin_probar", "termina": "ABCD"}'),
);
esperar(
  "en `empresas` no queda la llave; en el Vault sí, cifrada",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nreset role;
   select (select count(*) from retail.empresas e where e.id = :'aliada' and to_jsonb(e)::text like '%${LLAVE}%')
     || '/' || (select count(*) from vault.secrets s join retail.empresas e on e.lucode_secreto_id = s.id where e.id = :'aliada' and s.secret <> '${LLAVE}')
     || '/' || (select count(*) from vault.decrypted_secrets d join retail.empresas e on e.lucode_secreto_id = d.id where e.id = :'aliada' and d.decrypted_secret = '${LLAVE}');`),
  da("0/1/1"),
);

// 3. Reemplazar
esperar(
  "guardar otra llave la reemplaza en el mismo secreto y vuelve a «sin probar»",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nreset role; ${servidor}\nselect retail.anotar_prueba_lucode_aliada(:'aliada', true);\nreset role; ${sesion(ADMIN)}\n${guardar(OTRA)}\nreset role;
   select (select count(*) from vault.secrets where name = 'lucode_empresa_' || :'aliada') || '/' || e.lucode_estado || '/' || e.lucode_termina
     || '/' || (select d.decrypted_secret = '${OTRA}' from vault.decrypted_secrets d where d.id = e.lucode_secreto_id)
     from retail.empresas e where e.id = :'aliada';`),
  da("1/sin_probar/WXYZ/true"),
);

// 4. Sin llave: solo el domicilio
esperar(
  "dejar la llave vacía guarda el domicilio y no toca la llave",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nreset role; ${servidor}\nselect retail.anotar_prueba_lucode_aliada(:'aliada', true);\nreset role; ${sesion(ADMIN)}\n${guardar("", "Jr. Nuevo 45")}\nreset role;
   select e.domicilio_fiscal || '/' || e.lucode_estado || '/' || e.lucode_termina from retail.empresas e where e.id = :'aliada';`),
  da("Jr. Nuevo 45/conectada/ABCD"),
);
esperar(
  "sin llave nunca escrita, guardar el domicilio no crea secreto",
  caso(`${sesion(ADMIN)}\n${guardar(null)}\nreset role;\nselect coalesce(e.lucode_secreto_id::text, 'sin') || '/' || coalesce(e.lucode_estado, 'sin') from retail.empresas e where e.id = :'aliada';`),
  da("sin/sin"),
);

// 5. Llaves mal copiadas
esperar("una llave con espacios se rechaza", caso(`${sesion(ADMIN)}\n${guardar("prueba lucode llave 0123456789")}`), fallaCon("no parece una llave"));
esperar("una llave muy corta se rechaza", caso(`${sesion(ADMIN)}\n${guardar("corta123")}`), fallaCon("no parece una llave"));

// 6. Lo que lee la pantalla
esperar(
  "fn_empresas_aliadas nunca trae la llave; al Admin le dice cómo está",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nselect (retail.fn_empresas_aliadas()::text like '%${LLAVE}%')::text || '/'
     || (select a->'comprobantes'->>'estado' from jsonb_array_elements(retail.fn_empresas_aliadas()->'aliadas') a where a->>'id' = :'aliada');`),
  da("false/sin_probar"),
);
esperar(
  "a quien no es Admin no le dice ni cómo está la conexión",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nreset role;\n${sesion("22222222-2222-4222-8222-000000000002")}
   select coalesce((select a->>'comprobantes' from jsonb_array_elements(retail.fn_empresas_aliadas()->'aliadas') a where a->>'id' = :'aliada'), 'nada');`),
  (r) => (r.ok && r.salida === "nada") || fallaCon("necesita el módulo Configuración")(r),
);

// 7. Solo el servidor la lee y anota la prueba
esperar("una cuenta (aunque sea Admin) no lee la llave", caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nselect retail.fn_llave_lucode_aliada(:'aliada');`), fallaCon("permission denied"));
esperar("una cuenta no anota que la llave funciona", caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nselect retail.anotar_prueba_lucode_aliada(:'aliada', true);`), fallaCon("permission denied"));
esperar(
  "el servidor (service_role) la lee y anota la prueba",
  caso(`${sesion(ADMIN)}\n${guardar(LLAVE)}\nreset role; ${servidor}\nselect retail.anotar_prueba_lucode_aliada(:'aliada', false);
   select (retail.fn_llave_lucode_aliada(:'aliada') = '${LLAVE}')::text || '/' || (select lucode_estado from retail.empresas where id = :'aliada');`),
  da("true/rechazada"),
);

// 8. CAYLA no
esperar(
  "a CAYLA no se le guarda llave aquí (la suya vive en el servidor)",
  caso(`${sesion(ADMIN)}\nselect retail.guardar_comprobantes_aliada(retail.fn_empresa_casa_id(), null, '${LLAVE}');`),
  fallaCon("no existe o está dada de baja"),
);

if (fallas) {
  console.error(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodo en orden.");
