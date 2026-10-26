#!/usr/bin/env node
/**
 * Prueba de «Pregúntale a CAYLA»: cada pregunta queda anotada (ADR-0529, actividad 5; migración
 * `20261026235000_asistente_preguntas.sql`).
 *
 * Vigila: una pregunta se anota con la cuenta y la persona; sin sesión no; el costo de una fila tiene techo (nadie infla el tope
 * del mes); el gasto del mes suma; «¿Te sirvió?» solo lo contesta la cuenta que preguntó, una vez (repetir lo mismo no falla,
 * cambiar de opinión sí), y el comentario es solo para un «no»; la tabla no se lee ni se escribe directo desde la API.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * USO: pnpm pruebas:asistente-preguntas   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261026235000_asistente_preguntas.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed (cuenta)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (cuenta)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const como = (cuenta) => `set local request.jwt.claim.sub = '${cuenta}';
set local request.jwt.claims = '{"sub":"${cuenta}","role":"authenticated"}';
set local role authenticated;`;

/** Una pregunta de Felipe, ya anotada: deja `:p`. */
const PREGUNTA = `${como(FELIPE)}
select retail.registrar_pregunta_asistente(null, '/caja', '  ¿Cómo cierro la caja?  ', 'guia', 'como_hacer', null,
  '[{"guiaId":"caja","pasoId":"barra-cierre","href":"/caja"}]'::jsonb, 'caja', null, 'claude-haiku-5-5', 11000, 100, 1040, 0.0013, 2100) as p \\gset`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${cuerpo}\nrollback;`);

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
const da = (esperado, sql) => () => {
  const salida = dentro(sql).split("\n").filter(Boolean).at(-1);
  if (salida !== esperado) return `esperaba «${esperado}» y salió «${salida}»`;
};
const rechaza = (patron, sql) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!patron.test(String(e.stderr))) throw e;
  }
};

caso("una pregunta se anota con la cuenta, la persona de la sesión y la pregunta sin espacios de más",
  da("t", `${PREGUNTA}
reset role;
select cuenta_id = '${FELIPE}' and persona_id is not null and pregunta = '¿Cómo cierro la caja?' and tipo = 'guia'
  from retail.asistente_preguntas where id = :'p';`));

caso("sin sesión no se anota nada", rechaza(/Sin acceso a retail/, `set local role authenticated;
select retail.registrar_pregunta_asistente(null, '/', 'hola mundo', 'basico');`));

caso("el costo de una fila tiene techo: nadie infla el gasto del mes y deja a todas las tiendas sin IA",
  rechaza(/costo_usd|check constraint/, `${como(FELIPE)}
select retail.registrar_pregunta_asistente(null, '/', 'hola mundo', 'guia', null, null, '[]', null, null, null, 0, 0, 0, 30);`));

caso("un tipo o un tema que no existe se rechaza", rechaza(/check constraint/, `${como(FELIPE)}
select retail.registrar_pregunta_asistente(null, '/', 'hola mundo', 'inventado');`));

caso("más de tres tramos se rechaza", rechaza(/check constraint/, `${como(FELIPE)}
select retail.registrar_pregunta_asistente(null, '/', 'hola mundo', 'guia', null, null, '[{},{},{},{}]');`));

caso("el gasto del mes suma lo de este mes", da("t", `${PREGUNTA}
select retail.registrar_pregunta_asistente(null, '/', 'otra pregunta', 'guia', null, null, '[]', null, null, null, 0, 0, 0, 0.002) as q \\gset
select retail.fn_asistente_gasto_del_mes() >= 0.0033;`));

caso("«¿Te sirvió?»: la misma cuenta contesta, y repetir lo mismo (un doble clic) no falla",
  da("t", `${PREGUNTA}
select retail.responder_pregunta_asistente(:'p', true);
select retail.responder_pregunta_asistente(:'p', true);
reset role;
select sirvio and respondida_en is not null from retail.asistente_preguntas where id = :'p';`));

caso("cambiar de opinión no se puede", rechaza(/Ya contestaste/, `${PREGUNTA}
select retail.responder_pregunta_asistente(:'p', true);
select retail.responder_pregunta_asistente(:'p', false);`));

caso("otra cuenta no contesta una pregunta ajena", rechaza(/no es tuya/, `${PREGUNTA}
${como(MICAELA)}
select retail.responder_pregunta_asistente(:'p', false);`));

caso("«¿Qué buscabas?» va con un «no», una sola vez (el primero queda)",
  da("Quería anular la de ayer", `${PREGUNTA}
select retail.responder_pregunta_asistente(:'p', false, '  Quería anular la de ayer ');
select retail.responder_pregunta_asistente(:'p', false, 'otra cosa');
reset role;
select comentario from retail.asistente_preguntas where id = :'p';`));

caso("un comentario con un «sí» se rechaza", rechaza(/solo para cuando no sirvió/, `${PREGUNTA}
select retail.responder_pregunta_asistente(:'p', true, 'genial');`));

caso("la tabla no se lee ni se escribe directo desde la API", rechaza(/permission denied/, `${como(FELIPE)}
select count(*) from retail.asistente_preguntas;`));

caso("la migración se puede pegar dos veces", () => {
  const n = psql(`begin;\n${MIGRACION}\n${MIGRACION}\nselect count(*) from pg_proc where proname in ('registrar_pregunta_asistente', 'responder_pregunta_asistente', 'fn_asistente_gasto_del_mes');\nrollback;`);
  if (n !== "3") return `funciones: ${n}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
