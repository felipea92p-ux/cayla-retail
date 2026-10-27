#!/usr/bin/env node
/**
 * Prueba de «Pregúntale a CAYLA»: la pantalla «Preguntas del equipo» (ADR-0536, actividad 9; migración
 * `20261027182000_asistente_preguntas_equipo.sql`).
 *
 * Vigila: el módulo nace solo para el líder (ningún rol lo trae) y es «solo personas» (una terminal nunca lo tiene); el líder ve las
 * cifras y la lista con QUIÉN preguntó; una integrante sin el módulo no ve nada; con el módulo ve solo su sede (ni otra, ni todas);
 * todas las sedes juntas piden CAYLA Global; el período tiene tope; las cifras cuentan todo el período y no solo la lista.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con las dos migraciones del asistente aplicadas dentro: el Postgres
 * local compartido no cambia.
 *
 * USO: pnpm pruebas:asistente-preguntas-equipo   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = [leer("20261027181000_asistente_preguntas.sql"), leer("20261027182000_asistente_preguntas_equipo.sql")].join("\n");
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

/** Las sedes (`:tru`, `:lim`), el rol de Micaela (`:rol`) y dos preguntas de hoy: una de Micaela en Trujillo que no le sirvió y una
 *  de Felipe en Lima que pidió un acceso. Deja la ventana de hoy en `:desde` / `:hasta`. */
const PREGUNTAS = `select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select c.rol_id as rol from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' \\gset
select (now() - interval '1 day')::text as desde, (now() + interval '1 day')::text as hasta \\gset
${como(MICAELA)}
select retail.registrar_pregunta_asistente(:'tru', '/vender', '¿Cómo aparto una prenda?', 'no_existe', 'como_hacer') as q1 \\gset
select retail.responder_pregunta_asistente(:'q1', false, 'Quería apartar sin adelanto');
reset role;
${como(FELIPE)}
select retail.registrar_pregunta_asistente(:'lim', '/caja', '¿Dónde veo lo que debo?', 'sin_acceso', 'como_hacer', null, '[]', 'por-pagar', 'por_pagar') as q2 \\gset
reset role;`;

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

caso("el módulo nace solo para el líder: ningún rol lo trae",
  da("0", `select count(*) from retail.rol_modulos where modulo = 'preguntas_equipo';`));

caso("es «solo personas»: la lista de la terminal lo trae",
  da("t", `select position('''preguntas_equipo''' in pg_get_functiondef('retail.fn_exigir_rol_de_terminal(uuid, text)'::regprocedure)) > 0;`));

caso("el líder ve en Trujillo quién preguntó, qué no encontró y qué buscaba",
  da("t", `${PREGUNTAS}
${como(FELIPE)}
select r -> 'cifras' ->> 'total' = '1' and r -> 'cifras' ->> 'sirvio_no' = '1'
   and r -> 'preguntas' -> 0 ->> 'persona' is not null and r -> 'preguntas' -> 0 ->> 'sede' = 'Tienda Trujillo'
   and r -> 'preguntas' -> 0 ->> 'comentario' = 'Quería apartar sin adelanto'
  from (select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', :'tru') as r) x;`));

caso("en CAYLA Global (todas las sedes) el líder ve las dos y el acceso que se pidió",
  da("t", `${PREGUNTAS}
${como(FELIPE)}
select (r -> 'cifras' ->> 'total')::int >= 2 and r -> 'accesos' @> '[{"modulo": "por_pagar"}]'
   and r -> 'clases' @> '[{"tipo": "no_existe", "tema": "como_hacer"}]'
  from (select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', null) as r) x;`));

caso("una integrante sin el módulo no ve nada", rechaza(/módulo «Preguntas del equipo»/, `${PREGUNTAS}
${como(MICAELA)}
select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', :'tru');`));

caso("con el módulo, una integrante ve su sede", da("1", `${PREGUNTAS}
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'preguntas_equipo');
${como(MICAELA)}
select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', :'tru') -> 'cifras' ->> 'total';`));

caso("con el módulo, una integrante no ve otra sede", rechaza(/Solo ves las preguntas de tu sede/, `${PREGUNTAS}
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'preguntas_equipo');
${como(MICAELA)}
select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', :'lim');`));

caso("con el módulo, una integrante no ve todas las sedes juntas", rechaza(/CAYLA Global/, `${PREGUNTAS}
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'preguntas_equipo');
${como(MICAELA)}
select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', null);`));

caso("el período tiene tope de 3 meses", rechaza(/de 1 día a 3 meses/, `${como(FELIPE)}
select retail.fn_asistente_preguntas_equipo(now() - interval '1 year', now(), null);`));

caso("las cifras cuentan todo el período aunque la lista corte en 300",
  da("t", `${PREGUNTAS}
${como(FELIPE)}
select count(retail.registrar_pregunta_asistente(:'lim', '/', 'pregunta ' || g, 'guia')) from generate_series(1, 300) g;
select retail.fn_asistente_preguntas_equipo(:'desde', :'hasta', :'lim') as r \\gset
reset role;
-- La base local puede traer preguntas de hoy de antes: la cifra se compara con la tabla, no con un número fijo.
select (:'r'::jsonb -> 'cifras' ->> 'total')::int = (select count(*) from retail.asistente_preguntas
                                                       where ubicacion_id = :'lim' and creada_en >= :'desde' and creada_en < :'hasta')
   and (:'r'::jsonb -> 'cifras' ->> 'total')::int > 300
   and jsonb_array_length(:'r'::jsonb -> 'preguntas') = 300;`));

caso("la migración se puede pegar dos veces", () => {
  const n = psql(`begin;\n${MIGRACIONES}\n${MIGRACIONES}\nselect count(*) from retail.modulos where clave = 'preguntas_equipo';\nrollback;`);
  if (n.split("\n").at(-1) !== "1") return `módulos: ${n}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
