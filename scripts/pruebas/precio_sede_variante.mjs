#!/usr/bin/env node
/**
 * Prueba de la capa de precio por combinación en la tienda (`20261028230000_precio_de_tienda_por_combinacion_capa.sql`, ADR-0370 act.
 * 2026-10-28, Felipe: «el precio de una combinación puede ser distinto en una tienda»).
 *
 * QUÉ CUBRE (actividad 1: la tabla y la regla que la lee; nadie la escribe todavía, así que se inserta como superusuario)
 *   · con la capa VACÍA, `fn_precio_en_sede` devuelve lo mismo que devolvía antes para TODAS las combinaciones en TODAS las sedes
 *     (se compara una a una contra la regla de ayer escrita aquí) — y un MUTANTE que rompe la regla hace saltar esa comparación;
 *   · la excepción de una combinación gana al precio de la prenda en esa tienda; sus hermanas siguen con el de la prenda; otra tienda sigue
 *     con el general; sin precio de prenda, la excepción gana al general y las hermanas siguen con el general;
 *   · una excepción archivada no vale; la talla de OBSEQUIO sigue en 0 aunque tenga excepción;
 *   · la tabla no se borra, no se edita y se archiva una sola vez; una sola vigente por combinación y tienda; precio de 0, de más de S/ 5 000
 *     y NaN rechazados;
 *   · quienes cobran (Apartar y Proformas, de punta a punta) cobran el precio de la combinación, y el general se rechaza;
 *   · ninguna función que fija un precio lee la tabla directo: todas preguntan a `fn_precio_en_sede`.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (como `precio_sede.mjs`): la base compartida queda igual.
 *
 * USO
 *   node scripts/pruebas/precio_sede_variante.mjs               → con las migraciones ya aplicadas en la base `postgres` del local
 *   node scripts/pruebas/precio_sede_variante.mjs --base otra   → contra otra base del mismo contenedor
 *   node scripts/pruebas/precio_sede_variante.mjs --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const iBase = process.argv.indexOf("--base");
const BASE = iBase > 0 ? process.argv[iBase + 1] : "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo, ve Productos (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// Sesión de una persona operando en Trujillo.
const sesion = (uid) => `
set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', json_build_object('x-ubicacion', :'tru')::text, true) as _h \\gset
`;

const PRELUDIO = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
-- Una prenda de ROPA con al menos dos variantes activas al mismo precio general.
select v.producto_id as p1, min(v.precio) as general from retail.variantes v join retail.productos pr on pr.id = v.producto_id
 where v.activo and retail.fn_categoria_entra_a_motores(pr.categoria_id)
 group by v.producto_id having count(*) >= 2 and min(v.precio) = max(v.precio) and min(v.precio) > 10
 order by v.producto_id limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'p1' and activo order by id limit 1 \\gset
select id as v2 from retail.variantes where producto_id = :'p1' and activo and id <> :'v1' order by id limit 1 \\gset
`;

function correr(uid, sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sesion(uid)}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");
const fallaCon = (r, texto) => !r.ok && r.mensaje.includes(texto);

// La regla de AYER (sin capa de combinación), escrita aparte: el patrón contra el que se compara la regla viva.
const REGLA_DE_AYER = `
(case when v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id) then v.precio
      else coalesce((select ps.precio from retail.precios_sede_prenda ps
                      where ps.producto_id = v.producto_id and ps.ubicacion_id = u.id and ps.archivado_en is null), v.precio) end)`;
const DIFERENCIAS = `
select count(*) from retail.variantes v join retail.productos pr on pr.id = v.producto_id cross join retail.ubicaciones u
 where not exists (select 1 from retail.precios_sede_variante x where x.variante_id = v.id and x.ubicacion_id = u.id and x.archivado_en is null)
   and retail.fn_precio_en_sede(v.id, u.id) is distinct from ${REGLA_DE_AYER};`;

// 1. Capa vacía: nada cambió, para ninguna combinación en ninguna sede. Y el detector no está ciego (MUTANTE).
{
  const r = correr(FELIPE, `
select concat_ws('|', (${DIFERENCIAS.replace(/;\s*$/, "")})::text,
  (select count(*) from retail.variantes v cross join retail.ubicaciones u)::text);`);
  const [dif, total] = ultima(r).split("|");
  esperar("con la capa vacía, fn_precio_en_sede da lo mismo que ayer en TODAS las combinaciones y sedes", r.ok && dif === "0" && Number(total) > 0, r);
  const mutante = correr(FELIPE, `
create or replace function retail.fn_precio_en_sede(p_variante_id uuid, p_ubicacion_id uuid) returns numeric
language sql stable as $$ select 0::numeric $$;
${DIFERENCIAS}`);
  esperar("MUTANTE (una regla rota): la comparación lo ve", mutante.ok && Number(ultima(mutante)) > 0, mutante);
}

// 2. La excepción gana al precio de la prenda; las hermanas siguen con el de la prenda; la otra tienda, con el general.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Precio de la prenda en Trujillo') as _n \\gset
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', :general + 25, 'Talla extra');
select concat_ws('|',
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 25)::text,
  (retail.fn_precio_en_sede(:'v2', :'tru') = :general + 10)::text,
  (retail.fn_precio_en_sede(:'v1', :'lima') = :general)::text);`);
  esperar("la excepción gana al precio de la prenda; la hermana conserva el de la prenda; otra tienda, el general", ultima(r) === "true|true|true", r);
}

// 3. Sin precio de prenda: la excepción gana al general solo en su tienda y solo en su combinación.
{
  const r = correr(FELIPE, `
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', :general + 25, 'Talla extra');
select concat_ws('|',
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 25)::text,
  (retail.fn_precio_en_sede(:'v2', :'tru') = :general)::text,
  (retail.fn_precio_en_sede(:'v1', :'lima') = :general)::text);`);
  esperar("sin precio de prenda: la excepción vale solo en su tienda y su combinación", ultima(r) === "true|true|true", r);
}

// 4. Una excepción archivada no vale.
{
  const r = correr(FELIPE, `
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, archivado_en, archivado_motivo)
  values (:'v1', :'tru', :general + 25, 'Talla extra', now(), 'Se quitó');
select (retail.fn_precio_en_sede(:'v1', :'tru') = :general)::text;`);
  esperar("una excepción archivada no se cobra", ultima(r) === "true", r);
}

// 5. La talla de obsequio sigue en 0 aunque tenga excepción. Esta base puede no tener una bolsa: se arma dentro de la transacción (la familia de
//    la prenda deja de entrar a los motores y una de sus tallas queda en S/ 0), y el ROLLBACK lo deshace todo.
{
  const r = correr(FELIPE, `
update retail.familias set entra_a_motores = false
 where codigo = (select c.familia from retail.categorias c join retail.productos pr on pr.categoria_id = c.id where pr.id = :'p1');
update retail.variantes set precio = 0 where id = :'v1';
select (retail.fn_categoria_admite_precio_cero((select categoria_id from retail.productos where id = :'p1')))::text as _admite \\gset
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', 9.90, 'No debe cobrarse');
select concat_ws('|', :'_admite', (retail.fn_precio_en_sede(:'v1', :'tru') = 0)::text,
  -- La otra talla de la prenda (no obsequio) no se ve afectada por la excepción de su hermana.
  (retail.fn_precio_en_sede(:'v2', :'tru') = :general)::text);`);
  esperar("la talla de obsequio vale 0 aunque tenga una excepción", ultima(r) === "true|true|true", r);
  // MUTANTE: sin la regla del obsequio primero, la excepción SÍ la cobraría y el caso lo ve.
  const mutante = correr(FELIPE, `
update retail.familias set entra_a_motores = false
 where codigo = (select c.familia from retail.categorias c join retail.productos pr on pr.categoria_id = c.id where pr.id = :'p1');
update retail.variantes set precio = 0 where id = :'v1';
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', 9.90, 'No debe cobrarse');
create or replace function retail.fn_precio_en_sede(p_variante_id uuid, p_ubicacion_id uuid) returns numeric
language sql stable as $$ select coalesce((select pv.precio from retail.precios_sede_variante pv
  where pv.variante_id = p_variante_id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null), 0::numeric) $$;
select (retail.fn_precio_en_sede(:'v1', :'tru') = 0)::text;`);
  esperar("MUTANTE (la excepción cobra el obsequio): el caso lo ve", ultima(mutante) === "false", mutante);
}

// 6. La tabla no se borra, no se edita, y se archiva una sola vez.
{
  const base = `insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', :general + 25, 'Talla extra');`;
  const borrar = correr(FELIPE, `${base}\ndelete from retail.precios_sede_variante where variante_id = :'v1';`);
  esperar("una excepción no se borra", fallaCon(borrar, "no se borra"), borrar);
  const editar = correr(FELIPE, `${base}\nupdate retail.precios_sede_variante set precio = precio + 1 where variante_id = :'v1';`);
  esperar("una excepción no se edita", fallaCon(editar, "no se edita"), editar);
  const archivar = correr(FELIPE, `${base}
update retail.precios_sede_variante set archivado_en = now(), archivado_motivo = 'Se quitó' where variante_id = :'v1';
select (retail.fn_precio_en_sede(:'v1', :'tru') = :general)::text;`);
  esperar("archivarla la saca de la regla", ultima(archivar) === "true", archivar);
  const dosVeces = correr(FELIPE, `${base}
update retail.precios_sede_variante set archivado_en = now(), archivado_motivo = 'Se quitó' where variante_id = :'v1';
update retail.precios_sede_variante set archivado_motivo = 'Otro motivo' where variante_id = :'v1';`);
  esperar("una excepción archivada no se vuelve a tocar", fallaCon(dosVeces, "no se edita"), dosVeces);
}

// 7. Candados de la tabla: una sola vigente por par, precio de 1 a 5 000 (sin 0 ni NaN), motivo con sentido.
{
  const fila = (precio, motivo = "Talla extra") =>
    `insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', ${precio}, '${motivo}');`;
  const doble = correr(FELIPE, `${fila(":general + 5")}\n${fila(":general + 6")}`);
  esperar("solo una excepción vigente por combinación y tienda", fallaCon(doble, "precios_sede_variante_vigente_unico"), doble);
  for (const [nombre, precio] of [["0", "0"], ["más de S/ 5 000", "5000.01"], ["NaN", "'NaN'::numeric"], ["negativo", "-3"]]) {
    const r = correr(FELIPE, fila(precio));
    esperar(`un precio ${nombre} se rechaza`, fallaCon(r, "precios_sede_variante_precio_con_tope"), r);
  }
  const motivo = correr(FELIPE, fila(":general + 5", "ab"));
  esperar("un motivo de menos de 3 letras se rechaza", fallaCon(motivo, "precios_sede_variante_motivo_no_vacio"), motivo);
}

// 8. Quienes cobran, de punta a punta: cobran el precio de la COMBINACIÓN y rechazan el general.
{
  const cotizar = (precio) => `
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', :general + 25, 'Cotizar');
select retail.crear_proforma(:'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', ${precio})), 'Cliente de prueba') as pf \\gset
select (total = :general + 25)::text from retail.proformas where id = :'pf';`;
  const propio = correr(FELIPE, cotizar(":general + 25"));
  esperar("una proforma en Trujillo cotiza al precio de la combinación", ultima(propio) === "true", propio);
  const general = correr(FELIPE, cotizar(":general"));
  esperar("una proforma al precio general, con una excepción vigente, se rechaza", !general.ok, general);

  const apartar = (precio) => `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba precio por combinación') as caja_id \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT99' when 'factura' then 'FT99' else serie end, siguiente_numero = 1
 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select id as vv, precio as vv_general from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'tru', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vv', :'tru', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo) values (:'vv', :'tru', :vv_general + 10, 'Apartado de prueba');
select retail.separar_prendas(
  p_ubicacion_id => :'tru',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 1, 'precio_unitario', ${precio})),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 30)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
  p_devolucion_medio => 'yape') as sep \\gset
select (precio_unitario = :vv_general + 10)::text from retail.separacion_items where separacion_id = :'sep';`;
  const sep = correr(MICAELA, apartar(":vv_general + 10"));
  esperar("Apartar en Trujillo guarda la línea al precio de la combinación", ultima(sep) === "true", sep);
  const sepGeneral = correr(MICAELA, apartar(":vv_general"));
  esperar("Apartar al precio general, con una excepción vigente, se rechaza", !sepGeneral.ok, sepGeneral);
}

// 9. Guardián: ninguna función que fija un precio lee las tablas de precio de tienda directo; todas preguntan a `fn_precio_en_sede`.
{
  const r = correr(FELIPE, `
select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail'
   and p.proname in ('registrar_venta', 'separar_prendas', 'editar_separacion', 'registrar_cambio', 'crear_proforma', 'regularizar_prenda',
                     'fn_precio_para_cambio', 'fn_tienda_precio_talla')
   and (pg_get_functiondef(p.oid) like '%precios_sede_variante%' or pg_get_functiondef(p.oid) like '%precios_sede_prenda%');`);
  esperar("quienes cobran no leen las tablas de precio de tienda directo (solo fn_precio_en_sede)", r.ok && (ultima(r) === "" || ultima(r) === "-"), r);
}

// 10. El índice de la lectura existe (la regla corre miles de veces por carga de la tienda web).
{
  const r = correr(FELIPE, `
select (exists (select 1 from pg_indexes where schemaname = 'retail' and tablename = 'precios_sede_variante'
                  and indexname = 'precios_sede_variante_vigente_unico'
                  and indexdef like '%(variante_id, ubicacion_id)%' and indexdef like '%archivado_en IS NULL%'))::text;`);
  esperar("hay un índice parcial por (combinación, tienda) para la lectura", ultima(r) === "true", r);
}

if (fallos) {
  console.log(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo en verde.");
