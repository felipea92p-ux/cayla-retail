#!/usr/bin/env node
/**
 * Prueba de «un producto puede crearse sin marca y/o sin proveedor» (`20260930020000_producto_sin_marca_ni_proveedor.sql`,
 * ADR-0283).
 *
 * QUÉ CUBRE
 *   · el alta acepta sin marca ni proveedor, solo con marca y solo con proveedor;
 *   · lo que SIGUE prohibido: una pareja que nadie registró (`marca_proveedor_invalido`), una marca o un proveedor
 *     desactivados, y —aun saltándose la función, con un INSERT directo— la llave compuesta;
 *   · la edición completa lo que falta (poner la marca, luego el proveedor), NO borra lo que ya estaba (mandar nada = no
 *     tocar: la regla «no empeora») y deja rastro en el historial con «antes» vacío;
 *   · el filtro de Productos entiende el uuid nulo como «sin marca» / «sin proveedor», en la lista y en el resumen;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK y sesión simulada de Felipe (líder): el Postgres local, que otras
 * sesiones comparten, no cambia. `pg_temp.intento` devuelve el resultado o el error (estado, hint, mensaje) como JSON.
 *
 * USO
 *   pnpm pruebas:producto-sin-marca    → con la migración ya aplicada en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930020000_producto_sin_marca_ni_proveedor.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const NIL = "00000000-0000-0000-0000-000000000000";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, lineas: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
-- Crea un producto con UNA variante; devuelve su id o el error como JSON.
create function pg_temp.crear(p_ref text, p_marca uuid, p_prov uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'id', retail.crear_producto_con_variantes(
    p_ref, current_setting('prueba.cat')::uuid,
    jsonb_build_array(jsonb_build_object('talla_id', current_setting('prueba.talla'), 'color_codigo', current_setting('prueba.color'), 'precio', 59, 'costo', 20)),
    null, null, null, null, false, null, p_marca, p_prov));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
-- Guarda una edición como la manda la ficha: los datos actuales del producto + marca/proveedor (o nada).
create function pg_temp.editar(p_producto uuid, p_marca uuid, p_prov uuid) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; p retail.productos%rowtype; v_vars jsonb;
begin
  select * into p from retail.productos where id = p_producto;
  select jsonb_agg(jsonb_build_object('id', v.id, 'color_codigo', v.color_codigo, 'talla_id', v.talla_id, 'sku', v.sku, 'precio', v.precio, 'costo', v.costo, 'activo', v.activo))
    into v_vars from retail.variantes v where v.producto_id = p_producto;
  perform retail.catalogo_actualizar_producto(
    p_producto_id => p_producto, p_referencia => p.referencia, p_estado => p.estado, p_variantes => v_vars,
    p_categoria_id => p.categoria_id, p_descripcion => p.descripcion, p_stock_minimo => p.stock_minimo, p_temporada => p.temporada,
    p_permitir_venta_sin_stock => p.permitir_venta_sin_stock, p_tejido_id => p.tejido_id, p_patron_id => p.patron_id,
    p_marca_id => p_marca, p_proveedor_id => p_prov);
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
-- Una categoría que no exige tejido ni patrón, con una talla; un color.
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as talla from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
select set_config('prueba.cat', :'cat', true) as _1, set_config('prueba.talla', :'talla', true) as _2, set_config('prueba.color', :'color', true) as _3 \\gset
-- Dos proveedores y una marca de prueba que solo trae el primero: la pareja (marca, otro proveedor) NO existe.
select id as andina from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as sur from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select retail.crear_marca('Marca Sin Proveedor Prueba', :'andina') as marca \\gset
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1400)}`);
  }
}
const json = (l) => (l ? JSON.parse(l) : null);
/** De una fila «marca/proveedor» (cada uno un uuid o «-» si está vacío): cuál de los dos hay. */
const hay = (fila) => {
  const [marca = "-", prov = "-"] = fila.split("/");
  return { marca: marca !== "-", prov: prov !== "-" };
};
const marcaYProv = (ref) => `select coalesce(marca_id::text, '-') || '/' || coalesce(proveedor_id::text, '-') from retail.productos where referencia = '${ref}';`;

// 1. El alta acepta cualquier combinación de vacíos.
{
  const r = correr(`select pg_temp.crear('Blusa Vacia Prueba', null, null);
select pg_temp.crear('Blusa Solo Marca Prueba', :'marca', null);
select pg_temp.crear('Blusa Solo Prov Prueba', null, :'andina');
select pg_temp.crear('Blusa Pareja Prueba', :'marca', :'andina');
${marcaYProv("Blusa Vacia Prueba")}
${marcaYProv("Blusa Solo Marca Prueba")}
${marcaYProv("Blusa Solo Prov Prueba")}`);
  const l = r.ok ? r.lineas : [];
  esperar("crear sin marca ni proveedor funciona", r.ok && json(l[0])?.ok === true, r);
  esperar("crear solo con marca funciona", r.ok && json(l[1])?.ok === true, r);
  esperar("crear solo con proveedor funciona", r.ok && json(l[2])?.ok === true, r);
  esperar("crear con una pareja registrada sigue funcionando", r.ok && json(l[3])?.ok === true, r);
  esperar("lo guardado es lo pedido: nada / marca sola / proveedor solo", r.ok && l[4] === "-/-" && hay(l[5]).marca && !hay(l[5]).prov && !hay(l[6]).marca && hay(l[6]).prov, r);
}

// 2. Lo que sigue prohibido: una pareja que nadie registró, y lo desactivado. Y la llave compuesta, aun sin la función.
{
  const r = correr(`select pg_temp.crear('Blusa Pareja Mala Prueba', :'marca', :'sur');
update retail.marcas set activo = false where id = :'marca';
select pg_temp.crear('Blusa Marca Apagada Prueba', :'marca', null);
update retail.marcas set activo = true where id = :'marca';
update retail.proveedores set activo = false where id = :'sur';
select pg_temp.crear('Blusa Prov Apagado Prueba', null, :'sur');
update retail.proveedores set activo = true where id = :'sur';
select pg_temp.intento(format('insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (%L, %L, %L, %L)', :'cat', 'Blusa Directa Prueba', :'marca', :'sur'));`);
  const l = r.ok ? r.lineas : [];
  esperar("una pareja que nadie registró se rechaza con su motivo", r.ok && json(l[0])?.hint === "marca_proveedor_invalido", r);
  esperar("una marca desactivada se rechaza", r.ok && json(l[1])?.hint === "marca_invalida", r);
  esperar("un proveedor desactivado se rechaza", r.ok && json(l[2])?.hint === "proveedor_invalido", r);
  esperar("un INSERT directo con pareja inválida lo frena la llave compuesta (no la pantalla)", r.ok && json(l[3])?.estado === "23503", r);
}

// 3. Editar: completar lo que falta, sin borrar lo que ya estaba, y con rastro.
{
  const r = correr(`select (pg_temp.crear('Blusa Completar Prueba', null, null) ->> 'id') as pid \\gset
select pg_temp.editar(:'pid', :'marca', null);
${marcaYProv("Blusa Completar Prueba")}
select pg_temp.editar(:'pid', null, null);
${marcaYProv("Blusa Completar Prueba")}
select pg_temp.editar(:'pid', null, :'sur');
select pg_temp.editar(:'pid', null, :'andina');
${marcaYProv("Blusa Completar Prueba")}
select count(*) || '|' || coalesce(max(valor_anterior), '(vacío)') from retail.historial_producto_cambios where entidad_id = :'pid' and campo = 'marca_id';`);
  const l = r.ok ? r.lineas : [];
  esperar("poner la marca a un producto que no la tenía funciona", r.ok && json(l[0])?.ok === true && hay(l[1]).marca && !hay(l[1]).prov, r);
  esperar("mandar nada NO borra la marca ya guardada (regla «no empeora»)", r.ok && json(l[2])?.ok === true && l[3] === l[1], r);
  esperar("ponerle un proveedor que no trae esa marca se rechaza", r.ok && json(l[4])?.hint === "marca_proveedor_invalido", r);
  esperar("ponerle el proveedor que sí la trae completa la pareja", r.ok && json(l[5])?.ok === true && hay(l[6]).marca && hay(l[6]).prov, r);
  esperar("el cambio de marca deja rastro, con «antes» vacío", r.ok && l[7] === "1|(vacío)", r);
}

// 4. El filtro de Productos: el uuid nulo = «sin marca» / «sin proveedor» (lista y resumen).
{
  const r = correr(`select (pg_temp.crear('Blusa Filtro Sin Marca Prueba', null, null) ->> 'id') as sin \\gset
select (pg_temp.crear('Blusa Filtro Con Marca Prueba', :'marca', :'andina') ->> 'id') as con \\gset
select count(*) filter (where producto_id = :'sin'::uuid) || '|' || count(*) filter (where producto_id = :'con'::uuid)
  from retail.fn_productos(p_marca_id => '${NIL}'::uuid, p_por_pagina => 500);
select count(*) filter (where producto_id = :'sin'::uuid) || '|' || count(*) filter (where producto_id = :'con'::uuid)
  from retail.fn_productos(p_proveedor_id => '${NIL}'::uuid, p_por_pagina => 500);
select count(*) filter (where producto_id = :'con'::uuid) from retail.fn_productos(p_marca_id => :'marca', p_por_pagina => 500);
select (select total_productos from retail.fn_productos_resumen(p_marca_id => '${NIL}'::uuid)) >= 1;`);
  const l = r.ok ? r.lineas : [];
  esperar("filtrar por «sin marca» trae el producto sin marca y NO el que la tiene", r.ok && l[0] === "1|0", r);
  esperar("filtrar por «sin proveedor» trae el producto sin proveedor y NO el que lo tiene", r.ok && l[1] === "1|0", r);
  esperar("filtrar por una marca real sigue funcionando", r.ok && l[2] === "1", r);
  esperar("el resumen (las tarjetas de arriba) también entiende «sin marca»", r.ok && l[3] === "t", r);
}

// 5. La migración se puede pegar dos veces.
{
  const r = correr(`${MIGRACION}\n${MIGRACION}\nselect 'listo';`);
  esperar("pegar la migración dos veces no falla", r.ok && r.lineas.at(-1) === "listo", r);
}

console.log(`\n${casos - fallos}/${casos} casos verdes`);
process.exit(fallos ? 1 : 0);
