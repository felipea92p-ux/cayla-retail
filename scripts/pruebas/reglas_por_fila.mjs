#!/usr/bin/env node
/**
 * Vigía de las reglas por fila (ADR-0657): la capa 2 sigue sin `security definer` ni `set search_path`.
 *
 * EL PROBLEMA. Casi toda función de `retail` lleva `security definer` y `set search_path`. Para una PUERTA (lo que la web llama) está
 * bien. Para una REGLA (lo que una puerta evalúa dentro de su consulta, a veces por fila) es caro: con cualquiera de esos dos ajustes
 * Postgres no puede meter la función dentro de la consulta y la ejecuta aparte, una vez por fila. El repo lo midió y lo arregló a mano
 * tres veces (20261030170000, 20261031161000: 13×; 20261101004000: 100×) y la cuarta fue `fn_mis_modulos` (20261113195000: 12×). Nada
 * impedía que una migración que recrea la función desde un archivo viejo le devolviera los ajustes: no da error, solo vuelve la
 * lentitud.
 *
 * QUÉ PROMETE. Toda función de `retail` cuyo comentario empieza con «[regla por fila]»:
 *   1. no es `security definer` y no lleva `set …` (ningún `proconfig`);
 *   2. es `language sql`, `stable` o `immutable`, y no es `strict` (con cualquiera de esas, Postgres tampoco la mete en la consulta);
 *   3. no lee `personas`: sin definer, la RLS de Dynamic sobre `public.personas` le respondería «sin acceso» a toda la tienda (las
 *      preguntas de identidad —`fn_es_lider`, `fn_mi_rol_id`…— son puertas y la regla recibe sus respuestas como parámetros);
 *   4. escribe todos sus nombres calificados: su cuerpo se vuelve a compilar con `search_path = pg_catalog` (corre con el search_path
 *      de quien la llama, así que un nombre suelto dependería de eso).
 * Además, las reglas que ya existen (`MARCADAS_HOY`) siguen existiendo y marcadas: quitarle la marca a una para que el vigía calle
 * también falla.
 *
 * CONTROLES. Dentro de un ROLLBACK se crean reglas falsas marcadas con cada ajuste prohibido (definer, search_path, plpgsql, volatile,
 * strict, `public.personas`, un nombre sin calificar) y una sana: el vigía tiene que acusar cada mala con su motivo y callar con la sana.
 *
 * CÓMO SE MARCA UNA REGLA NUEVA. `comment on function retail.fn_x(…) is '[regla por fila] Qué decide, quién la llama…';` en la misma
 * migración que la crea, y súmala a `MARCADAS_HOY`. Convención completa: docs/adr/0657-identidad-en-un-viaje-y-reglas-por-fila.md.
 *
 * USO
 *   pnpm pruebas:reglas-por-fila                 → contra la base `postgres` del stack local
 *   pnpm pruebas:reglas-por-fila --base cayla_x  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

// Las reglas marcadas a la fecha. Solo crece: una regla nueva se suma aquí en el PR que la crea.
const MARCADAS_HOY = [
  "retail.fn_modulos_de(boolean,boolean,uuid)",
  "retail.fn_precios_en_sedes(uuid[],uuid[])",
  "retail.fn_trafico_web_personas(date,date,text,text)",
  "retail.fn_trafico_web_prendas(date,date,text,text)",
];

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

// La revisión, una sola definición para la de verdad y los controles: una fila «firma|motivo» por cada problema.
const REVISAR = `
create function pg_temp.compila_calificada(p_oid oid) returns text language plpgsql as $f$
declare v_def text; v_msg text;
begin
  begin
    -- Se vuelve a crear tal cual, con un search_path vacío de esquemas propios: un nombre sin calificar no se encuentra. La
    -- definición se lee YA con ese search_path, para que Postgres califique los tipos de la firma. El subbloque deshace la
    -- recreación (y el search_path) aunque compile.
    perform set_config('search_path', 'pg_catalog', true);
    v_def := pg_get_functiondef(p_oid);
    execute v_def;
    raise exception using errcode = 'P0001', message = '__compila__';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  return case when v_msg = '__compila__' then null else v_msg end;
end;
$f$;
-- Con search_path fijo: las firmas salen siempre con su esquema («retail.fn_x(…)»), las mire quien las mire.
create function pg_temp.problemas_de_reglas() returns table(firma text, motivo text) language sql set search_path = pg_catalog as $f$
  with marcadas as (
    select p.oid, p.oid::regprocedure::text as firma, p.prosecdef, p.proconfig, l.lanname, p.provolatile, p.proisstrict, p.prosrc
      from pg_proc p join pg_language l on l.oid = p.prolang
     where p.pronamespace = 'retail'::regnamespace and obj_description(p.oid, 'pg_proc') like '[regla por fila]%'
  )
  select firma, 'lleva security definer' from marcadas where prosecdef
  union all select firma, 'lleva set ' || array_to_string(proconfig, '; ') from marcadas where proconfig is not null
  union all select firma, 'es ' || lanname || ', no sql' from marcadas where lanname <> 'sql'
  union all select firma, 'es volatile' from marcadas where provolatile = 'v'
  union all select firma, 'es strict' from marcadas where proisstrict
  union all select firma, 'lee personas (la RLS de Dynamic le diría «sin acceso»)' from marcadas where prosrc ~* '\\mpersonas\\M'
  union all select firma, 'un nombre sin calificar: ' || e from marcadas, lateral (select pg_temp.compila_calificada(oid) as e) c
   where lanname = 'sql' and c.e is not null
  order by 1, 2;
$f$;
`;

let fallas = 0;
let casos = 0;
const bien = (nombre) => {
  casos++;
  console.log(`✓ ${nombre}`);
};
const mal = (nombre, detalle) => {
  casos++;
  fallas++;
  console.log(`✗ ${nombre}\n    ${detalle}`);
};

// 1. Lo de verdad.
{
  const r = psql(`begin;\n${REVISAR}\nselect firma || '|' || motivo from pg_temp.problemas_de_reglas();\nrollback;`);
  if (!r) bien("ninguna regla marcada lleva security definer, set search_path ni lo demás que impide meterla en la consulta");
  else mal("ninguna regla marcada lleva security definer, set search_path ni lo demás", r.split("\n").join("\n    "));
}

// 2. Las de hoy siguen existiendo y marcadas.
{
  const r = psql(
    MARCADAS_HOY.map(
      (f) => `select '${f}' || '|' || case when to_regprocedure('${f}') is null then 'no existe'
                 when coalesce(obj_description(to_regprocedure('${f}'), 'pg_proc'), '') not like '[regla por fila]%' then 'perdió la marca'
                 else 'ok' end;`
    ).join("\n")
  )
    .split("\n")
    .filter((l) => !l.endsWith("|ok"));
  if (!r.length) bien(`las ${MARCADAS_HOY.length} reglas marcadas a la fecha siguen existiendo y con su marca`);
  else mal("las reglas marcadas a la fecha siguen existiendo y con su marca", r.join("\n    "));
}

// 3. Controles: que muerda. Reglas falsas marcadas, cada una con un problema, y una sana.
{
  const marca = (f) => `comment on function ${f} is '[regla por fila] control del vigía';`;
  const CONTROLES = [
    ["retail.zz_regla_definer()", "lleva security definer", "create function retail.zz_regla_definer() returns int language sql stable security definer as $$ select 1 $$;"],
    ["retail.zz_regla_search_path()", "lleva set search_path=retail, public", "create function retail.zz_regla_search_path() returns int language sql stable set search_path = retail, public as $$ select 1 $$;"],
    ["retail.zz_regla_plpgsql()", "es plpgsql, no sql", "create function retail.zz_regla_plpgsql() returns int language plpgsql stable as $$ begin return 1; end $$;"],
    ["retail.zz_regla_volatile()", "es volatile", "create function retail.zz_regla_volatile() returns int language sql volatile as $$ select 1 $$;"],
    ["retail.zz_regla_strict(integer)", "es strict", "create function retail.zz_regla_strict(int) returns int language sql stable strict as $$ select $1 $$;"],
    ["retail.zz_regla_personas()", "lee personas", "create function retail.zz_regla_personas() returns bigint language sql stable as $$ select count(*) from public.personas $$;"],
    ["retail.zz_regla_suelta()", "un nombre sin calificar", "create function retail.zz_regla_suelta() returns bigint language sql stable as $$ select count(*) from modulos $$;"],
  ];
  const SANA = "create function retail.zz_regla_sana(p_clave text) returns boolean language sql stable as $$ select exists (select 1 from retail.modulos m where m.clave = p_clave) $$;";
  const r = psql(
    `begin;\nset local search_path = retail, public, extensions;\n${REVISAR}\n` +
      CONTROLES.map(([f, , sql]) => `${sql}\n${marca(f)}`).join("\n") +
      `\n${SANA}\n${marca("retail.zz_regla_sana(text)")}\n` +
      `select firma || '|' || motivo from pg_temp.problemas_de_reglas() where firma like 'retail.zz_regla_%';\nrollback;`
  ).split("\n");
  for (const [firma, motivo] of CONTROLES) {
    const linea = r.find((l) => l.startsWith(`${firma}|`) && l.includes(motivo));
    if (linea) bien(`control: acusa a la regla que ${motivo.replace(/^es /, "es ").replace(/=.*/, "")} (${firma})`);
    else mal(`control: acusa a ${firma} por «${motivo}»`, `lo que dijo: ${r.filter((l) => l.startsWith(firma)).join(" / ") || "(nada)"}`);
  }
  // La que lleva set search_path también se acusa por eso solo; la sana no aparece.
  if (!r.some((l) => l.startsWith("retail.zz_regla_sana("))) bien("control: calla con la regla sana (sql stable, sin ajustes, nombres calificados)");
  else mal("control: calla con la regla sana", r.filter((l) => l.startsWith("retail.zz_regla_sana(")).join(" / "));
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
