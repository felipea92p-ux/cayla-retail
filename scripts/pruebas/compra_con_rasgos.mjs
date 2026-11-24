#!/usr/bin/env node
/**
 * Prueba de «Compré ropa» con lo que la prenda tiene (`20261124174000_compra_con_rasgos_de_la_prenda.sql`, ADR-0700, actividad 3 de 6).
 *
 * QUÉ CUBRE
 *   · una compra guarda en cada línea sus casillas (en el orden de la hoja y sin repetir) y el precio que se vio afuera, también con
 *     dos tiendas (dos órdenes: cada línea con las suyas, por su posición);
 *   · una línea sin casillas ni precio visto queda en nulo, y una lista vacía también;
 *   · una prenda «a la espera de precio» (ADR-0660) guarda sus casillas igual;
 *   · lo que no se entiende frena TODA la compra y no deja nada: un código que no existe, una lista que no es lista, un precio visto
 *     negativo, de texto o sobre S/ 5 000;
 *   · los candados de la tabla valen aunque alguien escriba directo (un código que no está en la lista de casillas, una lista vacía);
 *   · `fn_reglas_de_precio` trae las listas de marcas y tejidos (ids).
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK; la sesión es la de Felipe (líder) simulada con `request.jwt.claim.sub` y el rol
 * `authenticated`, con la ronda de compras abierta y sin exigir responsable. Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:compra-con-rasgos    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";

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
-- La respuesta de registrar, o el hint de lo que la frenó.
create function pg_temp.compra(p_lineas jsonb) returns text language plpgsql as $f$
declare v_hint text; v_estado text; v_r jsonb;
begin
  v_r := retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'nota_venta', 300, 'papeles/rasgos.jpg', p_lineas, 300, 'yape', null, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_estado = returned_sqlstate;
  return coalesce(nullif(v_hint, ''), v_estado);
end;
$f$;
grant execute on function pg_temp.compra(jsonb) to authenticated;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
insert into retail.proveedores (nombre) values ('Proveedor Rasgos') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Rasgos') returning id as marca \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.categorias (nombre, familia) values ('Blusas Rasgos', 'accesorios') returning id as cat \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select set_config('t.prov', :'prov', true), set_config('t.marca', :'marca', true), set_config('t.cat', :'cat', true),
       set_config('t.tru', :'tru', true), set_config('t.lim', :'lim', true) \\g /dev/null
`;
const COMO_FELIPE = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
`;
/** Una línea de prenda nueva, con lo que se le agregue. */
const linea = (extra = "", tienda = "tru") =>
  `jsonb_build_object('categoria_id', current_setting('t.cat'), 'marca_id', current_setting('t.marca'), 'descripcion', 'Blusa Rasgos ' || substr(md5(random()::text), 1, 4), 'cantidad', 3, 'costo', 30.9, 'precio_venta', 57.9, 'destino_id', current_setting('t.${tienda}'))${extra}`;
/** Lo guardado de las líneas de la última compra del proveedor, en orden de tienda y posición. */
const GUARDADO = `reset role;
select coalesce(array_to_string(i.rasgos, ','), '-') || '|' || coalesce(i.precio_visto_afuera::text, '-')
  from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.proveedor_id = current_setting('t.prov')::uuid
 order by (o.ubicacion_destino_id = current_setting('t.tru')::uuid) desc, i.posicion;`;

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter((l) => l !== "") : []);

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

// 1. Casillas y precio visto, con dos tiendas; la línea sin nada y la lista vacía quedan en nulo.
{
  const r = correr(`${COMO_FELIPE}
select pg_temp.compra(jsonb_build_array(
  ${linea(` || jsonb_build_object('rasgos', jsonb_build_array('en_tendencia', 'nadie_la_tiene', 'en_tendencia'), 'precio_visto_afuera', '79.9')`)},
  ${linea()},
  ${linea(` || jsonb_build_object('rasgos', jsonb_build_array())`)},
  ${linea(` || jsonb_build_object('rasgos', jsonb_build_array('tela_que_se_nota', 'marca_conocida'))`, "lim")}));
${GUARDADO}`);
  const [res, a, b, c, d] = lineas(r);
  esperar("la compra se registra", r.ok && res === "OK", r);
  esperar("la primera guarda sus casillas en el orden de la hoja, sin repetir, y el precio visto", r.ok && a === "nadie_la_tiene,en_tendencia|79.90", r);
  esperar("la que no trae nada queda en nulo", r.ok && b === "-|-", r);
  esperar("una lista vacía también", r.ok && c === "-|-", r);
  esperar("la de otra tienda (otra orden) guarda las suyas", r.ok && d === "tela_que_se_nota,marca_conocida|-", r);
}

// 2. «A la espera de precio» guarda lo que la prenda tiene.
{
  const r = correr(`${COMO_FELIPE}
select pg_temp.compra(jsonb_build_array(
  jsonb_build_object('categoria_id', current_setting('t.cat'), 'marca_id', current_setting('t.marca'), 'descripcion', 'Blusa en espera', 'cantidad', 2,
                     'costo', 25, 'destino_id', current_setting('t.tru'), 'precio_por_definir', true, 'rasgos', jsonb_build_array('en_tendencia'))));
${GUARDADO}`);
  const [res, a] = lineas(r);
  esperar("una prenda a la espera de precio se registra", r.ok && res === "OK", r);
  esperar("y guarda sus casillas sin precio", r.ok && a === "en_tendencia|-", r);
}

// 3. Lo que no se entiende frena toda la compra y no deja nada.
{
  const r = correr(`${COMO_FELIPE}
select pg_temp.compra(jsonb_build_array(${linea()}, ${linea(` || jsonb_build_object('rasgos', jsonb_build_array('barata'))`)}));
select pg_temp.compra(jsonb_build_array(${linea(` || jsonb_build_object('rasgos', 'en_tendencia')`)}));
select pg_temp.compra(jsonb_build_array(${linea(` || jsonb_build_object('precio_visto_afuera', -5)`)}));
select pg_temp.compra(jsonb_build_array(${linea(` || jsonb_build_object('precio_visto_afuera', 'mucho')`)}));
select pg_temp.compra(jsonb_build_array(${linea(` || jsonb_build_object('precio_visto_afuera', 6000)`)}));
reset role;
select count(*) from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.proveedor_id = current_setting('t.prov')::uuid;`);
  const [codigo, noLista, negativo, texto, caro, quedaron] = lineas(r);
  esperar("un código que no existe: compra_rapida_rasgos", r.ok && codigo === "compra_rapida_rasgos", r);
  esperar("una lista que no es lista: lo mismo", r.ok && noLista === "compra_rapida_rasgos", r);
  esperar("un precio visto negativo: compra_rapida_visto", r.ok && negativo === "compra_rapida_visto", r);
  esperar("uno de texto: lo mismo", r.ok && texto === "compra_rapida_visto", r);
  esperar("uno sobre S/ 5 000: lo mismo", r.ok && caro === "compra_rapida_visto", r);
  esperar("y ninguna de esas compras dejó una línea", r.ok && quedaron === "0", r);
}

// 4. Los candados de la tabla, aunque alguien escriba directo como dueño.
{
  const r = correr(`${COMO_FELIPE}
select pg_temp.compra(jsonb_build_array(${linea()}));
reset role;
select id as item from retail.orden_compra_items i where i.orden_compra_id in (select id from retail.ordenes_compra where proveedor_id = current_setting('t.prov')::uuid) limit 1 \\gset
select pg_temp.intento(format('update retail.orden_compra_items set rasgos = %L where id = %L', '{barata}', :'item'));
select pg_temp.intento(format('update retail.orden_compra_items set rasgos = %L where id = %L', '{}', :'item'));
select pg_temp.intento(format('update retail.orden_compra_items set precio_visto_afuera = 0 where id = %L', :'item'));`);
  const [, codigo, vacia, cero] = lineas(r);
  esperar("candado: solo códigos de la lista de casillas", r.ok && codigo === "23514|La casilla «barata» no está en la lista.", r);
  esperar("candado: una lista vacía no (es nulo)", r.ok && vacia?.startsWith("23514|"), r);
  esperar("candado: el precio visto es mayor que cero", r.ok && cero?.startsWith("23514|") && cero.includes("orden_compra_items_visto_afuera"), r);
}

// 5. La regla trae las listas.
{
  const r = correr(`reset role;
update retail.marcas set conocida = true where id = current_setting('t.marca')::uuid;
${COMO_FELIPE}
select (retail.fn_reglas_de_precio() -> 'marcas_conocidas') ? current_setting('t.marca');
select jsonb_typeof(retail.fn_reglas_de_precio() -> 'tejidos_que_se_notan');`);
  const [marca, tejidos] = lineas(r);
  esperar("la marca de la lista viene entre las conocidas", r.ok && marca === "t", r);
  esperar("los tejidos que se notan vienen como lista", r.ok && tejidos === "array", r);
}

console.log(`\n${casos - fallos} de ${casos} casos bien.`);
if (fallos > 0) process.exit(1);
