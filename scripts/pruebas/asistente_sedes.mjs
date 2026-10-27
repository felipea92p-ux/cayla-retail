#!/usr/bin/env node
/**
 * Prueba de «Pregúntale a CAYLA»: el interruptor de cada sede (ADR-0529, actividad 8; migración `20261027163000_asistente_sedes.sql`).
 *
 * Vigila: el asistente nace apagado en todas las sedes; quien ve Configuración lo enciende y lo apaga (Felipe 2026-10-27: no solo un
 * líder), y una integrante sin ese módulo no; sin sesión nada sale encendido; en CAYLA Global (sin sede) sale si alguna sede lo
 * tiene; apagar no borra la fila y guarda desde cuándo corrió; guardar lo mismo no ensucia la historia; la tabla no se toca directo.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * USO: pnpm pruebas:asistente-sedes   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261027163000_asistente_sedes.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed (cuenta)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (cuenta), sin Configuración

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

/** Una tienda activa del seed (`:t`) y otra (`:o`), elegidas antes de tomar el rol de la cuenta. */
const TIENDAS = `select id as t from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select id as o from retail.ubicaciones where tipo = 'tienda' and activo order by nombre desc limit 1 \\gset`;

/** Felipe enciende la primera tienda. */
const ENCIENDE = `${TIENDAS}
${como(FELIPE)}
select retail.guardar_asistente_sede(:'t', true);`;

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

caso("nace apagado: ninguna sede lo tiene, tampoco en CAYLA Global",
  da("false|false", `${TIENDAS}
${como(FELIPE)}
select retail.fn_asistente_encendido(:'t')::text || '|' || retail.fn_asistente_encendido(null)::text;`));

caso("quien ve Configuración lo enciende: su sede sí, la otra no, y CAYLA Global sí",
  da("true|false|true", `${ENCIENDE}
select retail.fn_asistente_encendido(:'t')::text || '|' || retail.fn_asistente_encendido(:'o')::text || '|' || retail.fn_asistente_encendido(null)::text;`));

caso("una integrante de la sede lo ve encendido (el botón le sale)",
  da("t", `${ENCIENDE}
${como(MICAELA)}
select retail.fn_asistente_encendido(:'t');`));

caso("una integrante sin Configuración no lo cambia", rechaza(/módulo «Configuración»/, `${TIENDAS}
${como(MICAELA)}
select retail.guardar_asistente_sede(:'t', true);`));

caso("una integrante sin Configuración no ve la lista de sedes", rechaza(/módulo «Configuración»/, `${como(MICAELA)}
select retail.fn_asistente_sedes();`));

caso("sin sesión nada sale encendido", da("f", `${ENCIENDE}
reset role;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';
set local role authenticated;
select retail.fn_asistente_encendido(:'t');`));

caso("apagar no borra la fila: queda en false y guarda desde cuándo corrió",
  da("t", `${ENCIENDE}
select retail.guardar_asistente_sede(:'t', false);
reset role;
select not encendido and desde is not null and cambiado_por is not null from retail.asistente_sedes where ubicacion_id = :'t';`));

caso("cada cambio va a la historia, y guardar lo mismo (un doble clic) no la ensucia",
  da("2", `${ENCIENDE}
select retail.guardar_asistente_sede(:'t', true);
select retail.guardar_asistente_sede(:'t', false);
select retail.guardar_asistente_sede(:'t', false);
reset role;
select count(*) from retail.configuracion_historial where que = 'asistente_sede' and detalle ->> 'ubicacion_id' = :'t';`));

caso("la lista de Configuración trae las sedes activas con su interruptor",
  da("t", `${ENCIENDE}
select exists (select 1 from jsonb_array_elements(retail.fn_asistente_sedes()) e where e ->> 'id' = :'t' and (e ->> 'encendido')::boolean)
   and not exists (select 1 from jsonb_array_elements(retail.fn_asistente_sedes()) e where e ->> 'id' = :'o' and (e ->> 'encendido')::boolean);`));

caso("una sede que no existe se rechaza", rechaza(/no existe/, `${como(FELIPE)}
select retail.guardar_asistente_sede(gen_random_uuid(), true);`));

caso("la tabla no se lee ni se escribe directo desde la API", rechaza(/permission denied/, `${como(FELIPE)}
select count(*) from retail.asistente_sedes;`));

caso("la migración se puede pegar dos veces", () => {
  const n = psql(`begin;\n${MIGRACION}\n${MIGRACION}\nselect count(*) from pg_proc where proname in ('fn_asistente_encendido', 'fn_asistente_sedes', 'guardar_asistente_sede');\nrollback;`);
  if (n !== "3") return `funciones: ${n}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
