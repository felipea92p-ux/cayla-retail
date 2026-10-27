#!/usr/bin/env node
/**
 * Prueba de «Pregúntale a CAYLA»: el informe del lunes (ADR-0529, actividad 10; migración `20261027173000_asistente_informes.sql`).
 *
 * Vigila: lo arma el trabajo del lunes (llave de servicio) o el líder con «Preguntas del equipo»; una integrante no, ni con el módulo
 * (el informe junta todas las sedes); una mejora que cita una pregunta inventada o de otra semana se rechaza; una semana tiene UN informe
 * (el segundo pedido devuelve el mismo, no paga dos veces); la lectura arma cada mejora con sus preguntas y sus sedes; el costo del informe
 * entra al tope del mes; la tabla no se toca directo.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con las migraciones del asistente aplicadas dentro.
 *
 * USO: pnpm pruebas:asistente-informes   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = [
  leer("20261026235000_asistente_preguntas.sql"),
  leer("20261027165000_asistente_preguntas_equipo.sql"),
  leer("20261027173000_asistente_informes.sql"),
].join("\n");
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
const SERVICIO = `set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;`;

/** La semana de hoy (`:semana`, `:desde`, `:hasta`), el rol de Micaela (`:rol`) y dos preguntas de hoy (`:q1` en Trujillo, `:q2` en
 *  Lima), más una de hace un mes (`:vieja`, que no es de la semana). */
const BASE = `select date_trunc('week', now())::date::text as semana, (now() - interval '1 day')::text as desde, (now() + interval '1 day')::text as hasta \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select c.rol_id as rol from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' \\gset
${como(MICAELA)}
select retail.registrar_pregunta_asistente(:'tru', '/vender', '¿Cómo aparto sin adelanto?', 'no_existe', 'como_hacer') as q1 \\gset
reset role;
${como(FELIPE)}
select retail.registrar_pregunta_asistente(:'lim', '/vender', '¿Se puede apartar sin pagar?', 'no_existe', 'como_hacer') as q2 \\gset
reset role;
insert into retail.asistente_preguntas (cuenta_id, ruta, pregunta, tipo, creada_en) values ('${FELIPE}', '/', 'una vieja', 'guia', now() - interval '40 days')
  returning id as vieja \\gset`;

/** Una mejora que cita `citas` (lista SQL de ids ya entre comillas). */
const mejoras = (citas) => `jsonb_build_array(jsonb_build_object('tipo', 'funcion_nueva', 'titulo', 'Apartar sin adelanto', 'detalle', 'Dos sedes lo piden.', 'preguntas', jsonb_build_array(${citas})))`;
const GUARDA = (citas) => `select retail.guardar_informe_asistente(:'semana', :'desde', :'hasta', '{"total": 2}', ${mejoras(citas)}, 'claude-sonnet-5-5', 9000, 800, 0.04)`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACIONES}\n${cuerpo}\nrollback;`);

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

caso("el trabajo del lunes (llave de servicio) lee la semana sin nombres de personas",
  da("t", `${BASE}
${SERVICIO}
select (r -> 'cifras' ->> 'total')::int >= 2 and (r -> 'cifras' ->> 'sin_respuesta')::int >= 2
   and r -> 'preguntas' @> jsonb_build_array(jsonb_build_object('id', :'q1'))
   and not (r -> 'preguntas' -> 0 ? 'persona')
  from (select retail.fn_asistente_datos_informe(:'desde', :'hasta') as r) x;`));

caso("el trabajo del lunes lo guarda, sin quién lo pidió", da("t", `${BASE}
${SERVICIO}
${GUARDA(`:'q1', :'q2'`)} as i \\gset
reset role;
select pedido_por is null and costo_usd = 0.04 from retail.asistente_informes where id = :'i';`));

caso("el líder lo arma con el botón, y queda a su nombre", da("t", `${BASE}
${como(FELIPE)}
${GUARDA(`:'q1'`)} as i \\gset
reset role;
select pedido_por is not null from retail.asistente_informes where id = :'i';`));

caso("una integrante no lo arma, ni con el módulo (junta todas las sedes)", rechaza(/del líder/, `${BASE}
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'preguntas_equipo');
${como(MICAELA)}
select retail.fn_asistente_informes(4);`));

caso("una semana tiene un solo informe: el segundo pedido devuelve el mismo", da("t|1", `${BASE}
${SERVICIO}
${GUARDA(`:'q1'`)} as a \\gset
${GUARDA(`:'q2'`)} as b \\gset
reset role;
select case when :'a' = :'b' then 't' else 'f' end || '|' || (select count(*) from retail.asistente_informes where semana = :'semana');`));

caso("una mejora que cita una pregunta inventada se rechaza", rechaza(/no es de esa semana/, `${BASE}
${SERVICIO}
${GUARDA(`gen_random_uuid()::text`)};`));

caso("una mejora que cita una pregunta de otra semana se rechaza", rechaza(/no es de esa semana/, `${BASE}
${SERVICIO}
${GUARDA(`:'q1', :'vieja'`)};`));

caso("una mejora sin preguntas se rechaza", rechaza(/sin preguntas/, `${BASE}
${SERVICIO}
select retail.guardar_informe_asistente(:'semana', :'desde', :'hasta', '{}',
  jsonb_build_array(jsonb_build_object('tipo', 'capacitar', 'titulo', 'Algo', 'detalle', '', 'preguntas', '[]'::jsonb)));`));

caso("una mejora de un tipo que no existe se rechaza", rechaza(/de qué tipo/, `${BASE}
${SERVICIO}
select retail.guardar_informe_asistente(:'semana', :'desde', :'hasta', '{}',
  jsonb_build_array(jsonb_build_object('tipo', 'otra', 'titulo', 'Algo', 'detalle', '', 'preguntas', jsonb_build_array(:'q1'))));`));

caso("la semana empieza en lunes", rechaza(/check constraint|semana/, `${BASE}
${SERVICIO}
select retail.guardar_informe_asistente((:'semana'::date + 2), :'desde', :'hasta', '{}', ${mejoras(`:'q1'`)});`));

caso("al leerlo, cada mejora trae sus preguntas, cuántas son y de qué sedes", da("t", `${BASE}
${SERVICIO}
${GUARDA(`:'q1', :'q2'`)};
reset role;
${como(FELIPE)}
select jsonb_array_length(m -> 'preguntas') = 2 and m -> 'sedes' @> '["Tienda Lima", "Tienda Trujillo"]'
   and m -> 'preguntas' -> 0 ->> 'pregunta' is not null
  from (select retail.fn_asistente_informes(4) -> 0 -> 'mejoras' -> 0 as m) x;`));

caso("lo que costó el informe entra al tope del mes", da("t", `${BASE}
${como(FELIPE)}
select retail.fn_asistente_gasto_del_mes() as antes \\gset
${GUARDA(`:'q1'`)};
select retail.fn_asistente_gasto_del_mes() - :'antes'::numeric = 0.04;`));

caso("la tabla no se lee ni se escribe directo desde la API", rechaza(/permission denied/, `${como(FELIPE)}
select count(*) from retail.asistente_informes;`));

caso("la migración se puede pegar dos veces", () => {
  const n = psql(`begin;\n${MIGRACIONES}\n${MIGRACIONES}\nselect count(*) from pg_proc where proname in ('fn_asistente_ve_informe', 'fn_asistente_datos_informe', 'guardar_informe_asistente', 'fn_asistente_informes');\nrollback;`);
  if (n.split("\n").at(-1) !== "4") return `funciones: ${n}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
