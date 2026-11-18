#!/usr/bin/env node
/**
 * Prueba de los colores combinados (`20261110222000_colores_combinados.sql`, ADR-0643).
 *
 * QUÉ CUBRE
 *   · `color_combinado` crea «Crudo con azur» con un código libre de 3 letras, la familia y el hex de la base y los
 *     acompañantes ordenados; pedirla otra vez (con los acompañantes en otro orden) devuelve la MISMA, sin crear otra;
 *   · el nombre con dos y tres acompañantes («… con azur y negro», «… con azur, negro y rojo»);
 *   · una colaboradora (no líder) también la crea, con el estado que pone `fn_colores_estado_trigger` (aprobado, ADR-0534);
 *   · el candado rechaza: un solo color, cinco, uno repetido, uno que no existe, un combinado dentro de otro, y un
 *     INSERT directo que se salte la función con un código inexistente;
 *   · familia y hex no se pueden desviar de la base (un UPDATE directo los vuelve a poner);
 *   · una mezcla con prendas no cambia de colores; sin prendas, sí;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Igual que `categorias_candados.mjs`: cada escenario en su transacción con ROLLBACK y sesión simulada con
 * `request.jwt.claim.sub` y `role authenticated` (pasa por RLS como la pantalla). La base local la usan otras
 * sesiones: nada queda escrito. La migración se aplica dentro de cada transacción, así corre aunque la base local
 * todavía no la tenga.
 *
 * USO
 *   pnpm pruebas:colores-combinados
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora (seed)
const MIGRACION = readFileSync(new URL("../../supabase/migrations/20261110222000_colores_combinados.sql", import.meta.url), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (id) => `set local request.jwt.claim.sub = '${id}';
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
set local role authenticated;
`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
`;
// Crudo (neutro), Azur (azul), Negro, Rojo: existen en el seed. La migración va dentro de la transacción.
const ESCENA = `
set client_min_messages = warning;
begin;
${MIGRACION}
reset lock_timeout;
${INTENTO}
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);

// ---------- 1. Crear y volver a pedir la misma ----------
{
  const r = correr(`${ESCENA}
${como(FELIPE)}
select (retail.color_combinado(array['CRU','AZU'])) ->> 'nombre';
select c.codigo ~ '^[A-Z]{3}$', c.familia_color, c.hex = (select hex from retail.colores where codigo = 'CRU'), array_to_string(c.componentes, ','), c.estado
  from retail.colores c where c.componentes = array['CRU','AZU'];
select (retail.color_combinado(array['cru','azu'])) ->> 'creado';
select (retail.color_combinado(array['CRU','NEG','AZU'])) ->> 'nombre';
select (retail.color_combinado(array['CRU','AZU','NEG'])) ->> 'creado';
select (retail.color_combinado(array['CRU','ROJ','NEG','AZU'])) ->> 'nombre';
select count(*) from retail.colores where componentes[1] = 'CRU';`);
  const l = lineas(r);
  esperar("crea «Crudo con azur»", l[0] === "Crudo con azur", r);
  esperar("código de 3 letras, familia y hex de la base, aprobado por ser líder", l[1] === "t|neutro|t|CRU,AZU|aprobado", r);
  esperar("pedirla otra vez devuelve la misma", l[2] === "false", r);
  esperar("dos acompañantes: «Crudo con azur y negro»", l[3] === "Crudo con azur y negro", r);
  esperar("los acompañantes en otro orden son la misma mezcla", l[4] === "false", r);
  esperar("tres acompañantes: «Crudo con azur, negro y rojo»", l[5] === "Crudo con azur, negro y rojo", r);
  esperar("quedan 3 mezclas, no 5", l[6] === "3", r);
}

// ---------- 2. Una colaboradora la crea (el estado lo pone la base: aprobado, ADR-0534) ----------
{
  const r = correr(`${ESCENA}
${como(MICAELA)}
select (retail.color_combinado(array['NEG','ROJ'])) ->> 'estado';`);
  esperar("una colaboradora crea la mezcla, aprobada como todo color nuevo", lineas(r)[0] === "aprobado", r);
}

// ---------- 3. Lo que el candado rechaza ----------
{
  const casosMalos = [
    ["un solo color", `select retail.color_combinado(array['CRU'])`, /1 a 3/],
    ["cinco colores", `select retail.color_combinado(array['CRU','AZU','NEG','ROJ','AZM'])`, /1 a 3/],
    ["un color repetido", `select retail.color_combinado(array['CRU','AZU','AZU'])`, /repetido/],
    ["un color que no existe", `select retail.color_combinado(array['CRU','ZZZ'])`, /ZZZ no existe/],
    [
      "un INSERT directo con un código que no existe",
      `insert into retail.colores (codigo, nombre, componentes) values ('QQQ', 'Prueba mezcla', array['CRU','ZZZ'])`,
      /ZZZ no existe/,
    ],
  ];
  for (const [nombre, sql, patron] of casosMalos) {
    const r = correr(`${ESCENA}
${como(FELIPE)}
select pg_temp.intento($q$${sql}$q$);`);
    esperar(`rechaza ${nombre}`, patron.test(lineas(r)[0] ?? ""), r);
  }
  const r = correr(`${ESCENA}
${como(FELIPE)}
select (retail.color_combinado(array['CRU','AZU'])) ->> 'codigo' as mezcla \\gset
select pg_temp.intento(format($q$select retail.color_combinado(array['NEG', %L])$q$, :'mezcla'));`);
  esperar("rechaza un combinado dentro de otro", /ya es una mezcla/.test(lineas(r)[0] ?? ""), r);
}

// ---------- 4. Familia y hex siguen a la base ----------
{
  const r = correr(`${ESCENA}
${como(FELIPE)}
select (retail.color_combinado(array['CRU','AZU'])) ->> 'codigo' as mezcla \\gset
update retail.colores set familia_color = 'rojo', hex = '#FF0000' where codigo = :'mezcla';
select familia_color, hex = (select hex from retail.colores where codigo = 'CRU') from retail.colores where codigo = :'mezcla';`);
  esperar("un UPDATE no desvía la familia ni el hex de la base", lineas(r)[0] === "neutro|t", r);
}

// ---------- 5. Con prendas, la mezcla no cambia de colores ----------
{
  const r = correr(`${ESCENA}
${como(FELIPE)}
select (retail.color_combinado(array['CRU','AZU'])) ->> 'codigo' as mezcla \\gset
select pg_temp.intento(format($q$update retail.colores set componentes = array['CRU','NEG'] where codigo = %L$q$, :'mezcla'));
reset role;
update retail.variantes set color_codigo = :'mezcla' where id = (select id from retail.variantes order by created_at limit 1);
set local role authenticated;
select pg_temp.intento(format($q$update retail.colores set componentes = array['CRU','ROJ'] where codigo = %L$q$, :'mezcla'));
select pg_temp.intento(format($q$update retail.colores set componentes = null where codigo = %L$q$, :'mezcla'));`);
  const l = lineas(r);
  esperar("sin prendas, la mezcla cambia de colores", l[0] === "SIN_ERROR", r);
  esperar("con prendas, no cambia de colores", /ya tiene prendas/.test(l[1] ?? ""), r);
  esperar("con prendas, no deja de ser mezcla", /ya tiene prendas/.test(l[2] ?? ""), r);
}

// ---------- 6. Idempotente ----------
{
  const r = correr(`${ESCENA}
${MIGRACION}
select count(*) from pg_indexes where indexname = 'colores_componentes_unico';`);
  esperar("la migración se pega dos veces", lineas(r)[0] === "1", r);
}

console.log(`\n${casos - fallos}/${casos} casos`);
process.exit(fallos === 0 ? 0 : 1);
