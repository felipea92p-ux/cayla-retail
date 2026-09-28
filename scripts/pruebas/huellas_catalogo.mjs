#!/usr/bin/env node
/**
 * Huellas del catálogo con llave propia (20260928210000, ADR-0251) contra la base REAL.
 *
 * EL PROBLEMA. GitHub compara cada mañana las huellas del catálogo de producción con las de `main`. Producción las entrega
 * por `retail.huellas_catalogo(p_llave)`, la única función de retail que la llave pública (anon) puede ejecutar. Si esa
 * función devolviera otra cosa que `scripts/migraciones/deriva.sql`, la deriva diaria diría «distinto» de todo (o peor,
 * «igual» de lo que no lo es); y si dejara pasar sin la llave, cualquiera con la llave pública leería las huellas.
 *
 * PROMETE (sale con 1 si algo no se cumple; cada caso termina en ROLLBACK):
 *   1. Con la llave, llamada como anon, devuelve EXACTAMENTE la celda de deriva.sql (misma huella md5 del texto entero).
 *   2. Sin la llave, con otra llave o con null: 42501 con la pista 'huellas_llave'.
 *   3. Una llave nueva deja sin efecto a la anterior.
 *   4. anon y authenticated no crean llaves ni leen la tabla de la llave; authenticated tampoco llama a huellas_catalogo.
 *   5. La huella MIRA lo que promete: cambiar un objeto de cada grupo (cuerpo, EXECUTE y configuración de una función,
 *      política, disparador, permisos, RLS, columna, candado, índice, vista) cambia la línea de ese objeto y ninguna
 *      otra; cambiar solo comentarios o espacios de un cuerpo no cambia nada. Sin esto, una consulta que dijera «igual»
 *      de todo (la huella del grupo en vez de la del objeto, o sin los permisos) pasaba las pruebas 1-4.
 * USO: pnpm pruebas:huellas-catalogo   (necesita el stack local: `npx supabase start`)
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVO_DERIVA = readFileSync(join(RAIZ, "scripts", "migraciones", "deriva.sql"), "utf8");
// La consulta sola (desde su select), para usarla de subconsulta; su search_path se fija aparte, igual que en el archivo.
const DERIVA = ARCHIVO_DERIVA.slice(ARCHIVO_DERIVA.indexOf("select string_agg(")).trim().replace(/;\s*$/, "");
const SEARCH_PATH = ARCHIVO_DERIVA.match(/^set search_path = ([^;]+);$/m)?.[1];
if (!SEARCH_PATH) throw new Error("deriva.sql debe fijar su search_path (set search_path = …;)");

function psql(sql) {
  const r = spawnSync(
    "docker",
    ["exec", "-i", "supabase_db_cayla-retail", "psql", "-q", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return { ok: r.status === 0, salida: (r.stdout ?? "").trim(), avisos: r.stderr ?? "" };
}

let fallas = 0;
function esperar(nombre, cumple, detalle = "") {
  console.log(`${cumple ? "✓" : "✗"} ${nombre}${cumple ? "" : ` · ${detalle}`}`);
  if (!cumple) fallas++;
}

/**
 * Corre `llamada` como `rol` en un sub-bloque que SIEMPRE se deshace (así el rol vuelve a postgres) y deja un aviso:
 * «R|OK» si pasó, o «R|ERR|sqlstate|pista» si falló.
 */
function intento(llamada, rol) {
  return `do $$ declare e text; h text; begin
  begin
    set local role ${rol};
    ${llamada};
    raise exception using errcode = 'P0001', message = 'R_OK';
  exception when others then
    get stacked diagnostics e = returned_sqlstate, h = pg_exception_hint;
    if sqlerrm = 'R_OK' then raise notice 'R|OK'; else raise notice 'R|ERR|%|%', e, coalesce(h, ''); end if;
  end;
end $$;`;
}
const resultados = (avisos) => [...avisos.matchAll(/R\|([^\n]*)/g)].map((m) => m[1].trim());

// 1. La función con la llave, como anon, es deriva.sql al pie de la letra.
{
  const r = psql(`begin;
select retail.fn_huellas_nueva_llave() as llave \\gset
set local role anon;
select 'F|' || md5(retail.huellas_catalogo(:'llave'));
reset role;
set local search_path = ${SEARCH_PATH};
select 'D|' || md5(huellas) from (${DERIVA}) d;
rollback;`);
  const f = r.salida.match(/^F\|(\w+)$/m)?.[1];
  const d = r.salida.match(/^D\|(\w+)$/m)?.[1];
  esperar("con la llave, anon recibe EXACTAMENTE la celda de deriva.sql", r.ok && f && f === d, `ok=${r.ok} función=${f} deriva=${d} ${r.avisos.slice(0, 300)}`);
}

// 2 y 3. Sin la llave, con otra, con null, y con la llave vieja después de cambiarla: 42501 'huellas_llave'.
{
  const r = psql(`begin;
select set_config('prueba.vieja', retail.fn_huellas_nueva_llave(), true);
${intento("perform retail.huellas_catalogo('no-es-la-llave')", "anon")}
${intento("perform retail.huellas_catalogo(null)", "anon")}
${intento("perform retail.huellas_catalogo(current_setting('prueba.vieja'))", "anon")}
select set_config('prueba.nueva', retail.fn_huellas_nueva_llave(), true);
${intento("perform retail.huellas_catalogo(current_setting('prueba.vieja'))", "anon")}
${intento("perform retail.huellas_catalogo(current_setting('prueba.nueva'))", "anon")}
rollback;`);
  const [otra, nula, vigente, vieja, nueva] = resultados(r.avisos);
  esperar("otra llave: 42501 con la pista huellas_llave", otra === "ERR|42501|huellas_llave", otra);
  esperar("llave null: 42501 con la pista huellas_llave", nula === "ERR|42501|huellas_llave", nula);
  esperar("la llave vigente pasa", vigente === "OK", vigente);
  esperar("una llave nueva deja sin efecto a la anterior", vieja === "ERR|42501|huellas_llave", vieja);
  esperar("y la nueva pasa", nueva === "OK", nueva);
}

// 4. Nadie más crea llaves ni lee la tabla; authenticated no llama a huellas_catalogo.
// Se exige el 42501 SIN pista: el de «permiso denegado». La propia función lanza 42501 (con la pista 'huellas_llave')
// ante una llave mala, así que un 42501 cualquiera no distingue «sin permiso» de «llave mala»: por eso authenticated
// llama con la llave VIGENTE, y además se pregunta el permiso directo (en producción, las funciones nuevas de retail
// nacen con EXECUTE para authenticated: lo único que se lo quita es el revoke de la migración).
{
  const r = psql(`begin;
select set_config('prueba.llave', retail.fn_huellas_nueva_llave(), true);
${intento("perform retail.fn_huellas_nueva_llave()", "anon")}
${intento("perform retail.fn_huellas_nueva_llave()", "authenticated")}
${intento("perform count(*) from retail.huellas_llave", "anon")}
${intento("perform count(*) from retail.huellas_llave", "authenticated")}
${intento("perform retail.huellas_catalogo(current_setting('prueba.llave'))", "authenticated")}
select 'P|' || string_agg(r || '.' || f || '=' || has_function_privilege(r, f, 'EXECUTE'), ' ' order by r, f)
from unnest(array['anon', 'authenticated', 'service_role', 'public']) r,
     unnest(array['retail.huellas_catalogo(text)', 'retail.fn_huellas_nueva_llave()']) f;
rollback;`);
  const rs = resultados(r.avisos);
  const nombres = [
    "anon no crea llaves",
    "authenticated no crea llaves",
    "anon no lee la tabla de la llave",
    "authenticated no lee la tabla de la llave",
    "authenticated no llama a huellas_catalogo, ni con la llave vigente",
  ];
  nombres.forEach((n, i) => esperar(n, rs[i] === "ERR|42501|", rs[i] ?? "sin resultado"));
  const permisos = r.salida.match(/^P\|(.*)$/m)?.[1] ?? "";
  const esperado = [
    "anon.retail.fn_huellas_nueva_llave()=false",
    "anon.retail.huellas_catalogo(text)=true",
    "authenticated.retail.fn_huellas_nueva_llave()=false",
    "authenticated.retail.huellas_catalogo(text)=false",
    "public.retail.fn_huellas_nueva_llave()=false",
    "public.retail.huellas_catalogo(text)=false",
    "service_role.retail.fn_huellas_nueva_llave()=false",
    "service_role.retail.huellas_catalogo(text)=false",
  ].join(" ");
  esperar("EXECUTE: solo anon llama a huellas_catalogo y nadie crea llaves desde la API", permisos === esperado, permisos || r.avisos.slice(0, 300));
}

// 5. Sensibilidad: cada cambio mueve la huella de SU objeto y de ningún otro. Objetos de prueba propios (zz_huella*),
// creados y deshechos en la misma transacción. Cada paso se compara con el anterior.
{
  const F = "retail.zz_huella_f(p int) returns int language sql";
  const PASOS = [
    ["crear los objetos de prueba", `create table retail.zz_huella (id int primary key, n int default 1, t text);
      create function ${F} as $f$ select p + 1 $f$;
      create function retail.zz_huella_trg() returns trigger language plpgsql as $f$ begin return new; end $f$;
      create trigger zz_huella_t before insert on retail.zz_huella for each row execute function retail.zz_huella_trg();
      create policy zz_huella_p on retail.zz_huella for select to authenticated using (n > 0);
      create index zz_huella_i on retail.zz_huella (n);
      create view retail.zz_huella_v as select id, n from retail.zz_huella where n > 0;
      alter table retail.zz_huella add constraint zz_huella_c check (n >= 0);
      grant select on retail.zz_huella to anon;
      grant update (t) on retail.zz_huella to authenticated;`, null],
    ["cuerpo de una función", `create or replace function ${F} as $f$ select p + 2 $f$;`, ["fn:zz_huella_f(p integer)"]],
    ["solo comentarios y espacios del cuerpo", `create or replace function ${F} as $f$ -- suma dos (it's)
        select   p /* uno */ + /* dos */
        2 $f$;`, []],
    // Un -- dentro de un texto no es un comentario: lo que sigue en la línea es código. fn_aplicar_candado_de_dinero arma
    // su candado con format(E'…\n  -- CANDADO…\n  select retail.fn_exige_dinero_de_compras(%L);', …): el \n es texto,
    // así que borrar «hasta el fin de la línea» se llevaba la llamada al candado y un cambio ahí salía «igual».
    ["un texto con -- adentro", `create or replace function ${F} as $f$ select p + 2 + length(format(E'begin\\n  -- CANDADO\\n  perform retail.fn_a(%L);', 'x')) $f$;`, ["fn:zz_huella_f(p integer)"]],
    ["código después de un -- dentro de un texto", `create or replace function ${F} as $f$ select p + 2 + length(format(E'begin\\n  -- CANDADO\\n  perform retail.fn_b(%L);', 'x')) $f$;`, ["fn:zz_huella_f(p integer)"]],
    ["lo que va entre /* */ dentro de un texto", `create or replace function ${F} as $f$ select p + 2 + length(format(E'begin\\n  -- CANDADO\\n  perform retail.fn_b(%L);', 'x'))
        + length('a /* b */ c') $f$;`, ["fn:zz_huella_f(p integer)"]],
    ["…y cambia", `create or replace function ${F} as $f$ select p + 2 + length(format(E'begin\\n  -- CANDADO\\n  perform retail.fn_b(%L);', 'x'))
        + length('a /* zz */ c') $f$;`, ["fn:zz_huella_f(p integer)"]],
    ["comentarios alrededor de esos textos", `create or replace function ${F} as $f$ select p + 2 -- ya no es texto: it's
        + length(format(E'begin\\n  -- CANDADO\\n  perform retail.fn_b(%L);', 'x')) /* otro */
        + length('a /* zz */ c') /* y otro */ $f$;`, []],
    ["EXECUTE de una función", "grant execute on function retail.zz_huella_f(int) to anon;", ["fn:zz_huella_f(p integer)"]],
    ["configuración de una función", "alter function retail.zz_huella_f(int) set search_path = pg_catalog;", ["fn:zz_huella_f(p integer)"]],
    ["política", "alter policy zz_huella_p on retail.zz_huella using (n > 1);", ["politica:zz_huella.zz_huella_p"]],
    ["disparador", "create or replace trigger zz_huella_t before update on retail.zz_huella for each row execute function retail.zz_huella_trg();", ["disparador:zz_huella.zz_huella_t"]],
    ["permiso de tabla", "grant insert on retail.zz_huella to anon;", ["permiso:zz_huella.anon"]],
    ["RLS", "alter table retail.zz_huella enable row level security;", ["rls:zz_huella"]],
    ["permiso de columna", "grant insert (t) on retail.zz_huella to authenticated;", ["permiso_columna:zz_huella.t.authenticated"]],
    ["permiso del schema", "grant create on schema retail to anon;", ["schema:retail.anon"]],
    ["valor por defecto de una columna", "alter table retail.zz_huella alter column n set default 2;", ["columna:zz_huella.n"]],
    ["candado", "alter table retail.zz_huella drop constraint zz_huella_c, add constraint zz_huella_c check (n >= 1);", ["candado:zz_huella.zz_huella_c"]],
    ["índice", "drop index retail.zz_huella_i; create index zz_huella_i on retail.zz_huella (t);", ["indice:zz_huella_i"]],
    ["vista", "create or replace view retail.zz_huella_v as select id, n from retail.zz_huella where n > 1;", ["vista:zz_huella_v"]],
  ];
  const foto = (n, paso) => `insert into zz_pasos select ${n}, '${paso}', split_part(l, E'\\t', 1), split_part(l, E'\\t', 2), split_part(l, E'\\t', 3)
  from (${DERIVA}) d, regexp_split_to_table(d.huellas, E'\\n') l;`;
  const r = psql(`begin;
set local search_path = ${SEARCH_PATH};
create temp table zz_pasos (n int, paso text, g text, k text, h text) on commit drop;
${foto(0, "antes")}
${PASOS.map(([paso, sql], i) => `${sql}\n${foto(i + 1, paso)}`).join("\n")}
select 'S|' || b.paso || '|' || coalesce((
  select string_agg(coalesce(x.g, y.g) || ':' || coalesce(x.k, y.k), ' ; ' order by coalesce(x.g, y.g), coalesce(x.k, y.k))
  from (select * from zz_pasos where n = b.n - 1) x full join (select * from zz_pasos where n = b.n) y on x.g = y.g and x.k = y.k
  where x.h is distinct from y.h), '')
from (select distinct n, paso from zz_pasos where n > 0) b order by b.n;
rollback;`);
  const cambios = new Map([...r.salida.matchAll(/^S\|([^|]*)\|(.*)$/gm)].map((m) => [m[1], m[2] ? m[2].split(" ; ") : []]));
  esperar("sensibilidad: la consulta corre con los objetos de prueba", r.ok && cambios.size === PASOS.length, `ok=${r.ok} ${r.avisos.slice(0, 300)}`);
  const [creados, ...resto] = PASOS;
  const nuevos = cambios.get(creados[0]) ?? [];
  esperar("crear objetos solo agrega sus propias líneas", nuevos.length > 10 && nuevos.every((k) => k.includes("zz_huella")), nuevos.join(", "));
  for (const [paso, , esperado] of resto) {
    const visto = cambios.get(paso) ?? ["(sin resultado)"];
    const texto = esperado.length ? `cambia la huella de ${esperado.join(", ")} y de nada más` : "no cambia ninguna huella";
    esperar(`${paso}: ${texto}`, JSON.stringify(visto) === JSON.stringify(esperado), `cambió: ${visto.join(", ") || "nada"}`);
  }
}

// CONTROL: el caso 1 muerde. Una función que devuelve otra cosa (una línea de menos) tiene otra huella.
{
  const r = psql(`begin;
set local search_path = ${SEARCH_PATH};
select 'D|' || md5(huellas) from (${DERIVA}) d;
select 'X|' || md5(regexp_replace(huellas, E'\\n[^\\n]*$', '')) from (${DERIVA}) d;
rollback;`);
  const d = r.salida.match(/^D\|(\w+)$/m)?.[1];
  const x = r.salida.match(/^X\|(\w+)$/m)?.[1];
  esperar("CONTROL: una celda con una línea de menos tiene otra huella", r.ok && d && x && d !== x, `${d} ${x}`);
}

if (fallas) {
  console.error(`\n${fallas} caso(s) en rojo.`);
  process.exit(1);
}
console.log("\nTodos los casos de huellas_catalogo en verde.");
