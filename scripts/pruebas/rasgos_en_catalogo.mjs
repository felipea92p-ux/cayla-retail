#!/usr/bin/env node
/**
 * Prueba de las casillas de la prenda en Catálogo (`20261124183000_rasgos_de_la_prenda_en_catalogo.sql`, ADR-0700, actividad 5 de 6).
 *
 * QUÉ CUBRE
 *   · una prenda sin nada guardado: las tres casillas en «no» y la tela «por su tejido» (nula);
 *   · guardar deja lo marcado, firma quien lo hizo y devuelve lo que la prenda tiene en efecto;
 *   · la tela nula sigue al tejido (lista del Admin); un «no» explícito le gana a un tejido que se nota, y un «sí» a uno que no;
 *   · guardar otra vez reemplaza todo (nunca una mezcla) y la marca conocida sale sola de la lista, sin guardarse;
 *   · una prenda que no existe frena con su motivo; una cuenta sin Productos no guarda; `anon` no ejecuta ninguna de las dos.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK; la sesión es la de Felipe (líder) simulada con `request.jwt.claim.sub` y el rol
 * `authenticated`, sin exigir responsable. Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:rasgos-en-catalogo    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
// Una cuenta del seed sin acceso al ERP (no ve Productos).
const SIN_PRODUCTOS = "22222222-2222-4222-8222-000000000002";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
insert into retail.categorias (nombre, familia) values ('Blusas Catálogo Rasgos', 'accesorios') returning id as cat \\gset
insert into retail.tejidos (nombre, se_nota) values ('Lino Catálogo Rasgos', true) returning id as lino \\gset
insert into retail.tejidos (nombre, se_nota) values ('Poliéster Catálogo Rasgos', false) returning id as poli \\gset
insert into retail.marcas (nombre, conocida) values ('Marca Conocida Rasgos', true) returning id as conocida \\gset
insert into retail.productos (referencia, categoria_id, tejido_id) values ('Blusa de lino Rasgos', :'cat', :'lino') returning id as p_lino \\gset
insert into retail.productos (referencia, categoria_id, tejido_id, marca_id) values ('Blusa poliéster Rasgos', :'cat', :'poli', :'conocida')
  returning id as p_poli \\gset
select set_config('t.p_lino', :'p_lino', true), set_config('t.p_poli', :'p_poli', true) \\g /dev/null

-- La llamada, o «código|hint» de lo que la frenó.
create function pg_temp.guardar(p uuid, a boolean, b boolean, c boolean) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v text[];
begin
  v := retail.guardar_rasgos_de_producto(p, a, b, c);
  return coalesce(nullif(array_to_string(v, ','), ''), '-');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end;
$f$;
grant execute on function pg_temp.guardar(uuid, boolean, boolean, boolean) to authenticated, anon;
`;
const COMO = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
set local role authenticated;
`;
const GUARDADO = (p) => `select retail.fn_producto_rasgos(current_setting('t.${p}')::uuid)::text;`;

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const filas = (r) => (r.ok ? r.salida.split("\n").filter((l) => l !== "") : []);

let casos = 0;
let fallos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 700)}`);
  }
}

// 1. Sin nada guardado; lo que tiene en efecto sale del tejido y de la marca.
{
  const r = correr(`${COMO(FELIPE)}
${GUARDADO("p_lino")}
select array_to_string(retail.fn_rasgos_de_producto(current_setting('t.p_lino')::uuid), ',');
select array_to_string(retail.fn_rasgos_de_producto(current_setting('t.p_poli')::uuid), ',');`);
  const [guardado, lino, poli] = filas(r);
  esperar("una prenda sin nada guardado: no, no y la tela por su tejido", r.ok && guardado === '{"en_tendencia": false, "nadie_la_tiene": false, "tela_que_se_nota": null}', r);
  esperar("la de lino tiene «Tela que se nota» por su tejido", r.ok && lino === "tela_que_se_nota", r);
  esperar("la de poliéster con marca conocida tiene solo la marca", r.ok && poli === "marca_conocida", r);
}

// 2. Guardar: lo marcado queda, firmado, y vuelve lo que la prenda tiene en efecto.
{
  const r = correr(`${COMO(FELIPE)}
select pg_temp.guardar(current_setting('t.p_lino')::uuid, true, false, null);
${GUARDADO("p_lino")}
reset role;
select (r.actualizado_por = (select c.persona_id from retail.colaboradores c join public.personas pe on pe.id = c.persona_id
                               where pe.auth_user_id = '${FELIPE}' limit 1))::text
  from retail.producto_rasgos r where r.producto_id = current_setting('t.p_lino')::uuid;`);
  const [efecto, guardado, firmado] = filas(r);
  esperar("guardar devuelve lo que tiene en efecto (la tela sigue por su tejido)", r.ok && efecto === "nadie_la_tiene,tela_que_se_nota", r);
  esperar("y deja lo marcado, con la tela todavía «por su tejido»", r.ok && guardado === '{"en_tendencia": false, "nadie_la_tiene": true, "tela_que_se_nota": null}', r);
  esperar("firmado por quien lo hizo", r.ok && firmado === "true", r);
}

// 3. Un «no» le gana al tejido que se nota; un «sí», al que no.
{
  const r = correr(`${COMO(FELIPE)}
select pg_temp.guardar(current_setting('t.p_lino')::uuid, false, false, false);
select pg_temp.guardar(current_setting('t.p_poli')::uuid, false, true, true);`);
  const [lino, poli] = filas(r);
  esperar("quitarle la tela a una de lino la deja sin casillas", r.ok && lino === "-", r);
  esperar("ponérsela a una de poliéster suma la tela (y la marca sigue sola)", r.ok && poli === "en_tendencia,tela_que_se_nota,marca_conocida", r);
}

// 4. Guardar otra vez reemplaza todo; la tela nula vuelve a seguir al tejido.
{
  const r = correr(`${COMO(FELIPE)}
select pg_temp.guardar(current_setting('t.p_lino')::uuid, true, true, false);
select pg_temp.guardar(current_setting('t.p_lino')::uuid, false, true, null);
${GUARDADO("p_lino")}`);
  const [, segunda, guardado] = filas(r);
  esperar("la segunda vez manda entera", r.ok && segunda === "en_tendencia,tela_que_se_nota", r);
  esperar("y lo guardado es solo lo de la segunda", r.ok && guardado === '{"en_tendencia": true, "nadie_la_tiene": false, "tela_que_se_nota": null}', r);
}

// 5. Lo que no debe pasar.
{
  const r = correr(`${COMO(FELIPE)}
select pg_temp.guardar(gen_random_uuid(), true, false, null);
${COMO(SIN_PRODUCTOS)}
select pg_temp.guardar(current_setting('t.p_lino')::uuid, true, false, null);
reset role;
select has_function_privilege('anon', 'retail.guardar_rasgos_de_producto(uuid,boolean,boolean,boolean)', 'execute')::text
       || '|' || has_function_privilege('anon', 'retail.fn_producto_rasgos(uuid)', 'execute')::text;
select count(*) from retail.producto_rasgos where producto_id = current_setting('t.p_lino')::uuid;`);
  const [noExiste, sinProductos, anon, filasGuardadas] = filas(r);
  esperar("una prenda que no existe frena con su motivo", r.ok && noExiste === "P0001|producto_no_existe", r);
  esperar("una cuenta sin Productos no guarda", r.ok && sinProductos === "42501|sin_permiso", r);
  esperar("anon no ejecuta ninguna de las dos", r.ok && anon === "false|false", r);
  esperar("y nada quedó escrito", r.ok && filasGuardadas === "0", r);
}

// 6. Varias prendas a la vez (20261124190000): la lista de Productos pide las de su página en una sola consulta.
{
  const r = correr(`${COMO(FELIPE)}
select pg_temp.guardar(current_setting('t.p_lino')::uuid, true, false, false);
select (v ->> current_setting('t.p_lino')) || '|' || (v ->> current_setting('t.p_poli')) || '|' || (select count(*) from jsonb_object_keys(v))
  from (select retail.fn_rasgos_de_productos(array[current_setting('t.p_lino')::uuid, current_setting('t.p_poli')::uuid, gen_random_uuid()]) as v) x;
select array_to_string(retail.fn_rasgos_de_producto(current_setting('t.p_poli')::uuid), ',');
select retail.fn_rasgos_de_productos(array[]::uuid[])::text;`);
  const [, varias, una, vacia] = filas(r);
  esperar("una sola consulta trae lo de cada prenda; la que no existe no viene", r.ok && varias === '["nadie_la_tiene"]|["marca_conocida"]|2', r);
  esperar("la de una prenda es la misma consulta", r.ok && una === "marca_conocida", r);
  esperar("sin prendas, un objeto vacío", r.ok && vacia === "{}", r);
  const muchas = correr(`${COMO(FELIPE)}
select retail.fn_rasgos_de_productos(array(select gen_random_uuid() from generate_series(1, 201)));`);
  esperar("más de 200 a la vez se frenan", !muchas.ok && /rasgos_muchas_prendas/.test(muchas.mensaje), muchas);
}

console.log(`\n${casos - fallos} de ${casos} casos bien.`);
process.exit(fallos ? 1 : 0);
