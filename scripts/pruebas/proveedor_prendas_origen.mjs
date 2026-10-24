#!/usr/bin/env node
/**
 * Prueba de «Lo que le compré» de Proveedores (ADR-0502, act. 2026-10-24 (b)): `20261024231000_proveedor_prendas_origen_compras_y_carga.sql`.
 *
 * QUÉ PROMETE
 *   · El enlace con Compras: una compra registrada y recibida cuenta como origen COMPRAS, con el costo de su FACTURA y atribuida al
 *     proveedor de la factura, NO al habitual de la prenda. Si Compras cambia cómo enlaza la recepción (`compra_item_id` en la entrada
 *     de `fn_recepcion_entrar`), esta prueba se pone roja antes de que la ficha quede ciega.
 *   · Una entrada sin factura (un envío sin guía) cuenta como Compras «sin factura»: proveedor del lote y costo de `costo_historial`.
 *   · Lo que no llegó por una recepción es carga inicial (estimado) y solo del proveedor habitual; nunca se suma a lo de Compras.
 *   · La llave: sin sesión de quien ve la plata de proveedores, las lecturas se rechazan; la función base no la ejecuta nadie.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada, y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:proveedor-prendas-origen                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/proveedor_prendas_origen.mjs --contenedor <otro>   → contra otro contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261024231000_proveedor_prendas_origen_compras_y_carga.sql"), "utf8").replace(/^set lock_timeout.*$/gm, "");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const ARGS = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

let fallas = 0;
function esperar(nombre, ok, detalle) {
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}

// Todo sale del seed por su nombre o su código (los ids cambian en cada base).
const PREPARAR = `
begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as bei_l, producto_id as emma from retail.variantes where sku = 'BLU-EMMA-BEI-L' \\gset
insert into retail.proveedores (nombre, ruc) values ('Habitual de Prueba SAC', '20999999991') returning id as hab \\gset
-- La prenda es habitual de OTRO proveedor: lo recibido por factura NO debe irse a él.
insert into retail.marca_proveedores (marca_id, proveedor_id) select marca_id, :'hab' from retail.productos where id = :'emma' on conflict do nothing;
update retail.productos set proveedor_id = :'hab' where id = :'emma';
select retail.registrar_compra(:'prov', 'FORI', 'O1', 'credito', :'lima',
  jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'variante_id', :'bei_l', 'descripcion', 'L1', 'cantidad', 3, 'costo_unitario', 31.5, 'confirma_costo', true)),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10) as compra \\gset
select id as linea from retail.compra_items where compra_id = :'compra' \\gset
insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por) values (:'lima', :'prov', 'T-ORI-1', :'yo') returning id as lote \\gset
select coalesce(sum(unidades_compras), 0) as u0, coalesce(sum(gasto_compras), 0) as g0 from retail.fn_proveedor_prendas(:'prov') where producto_id = :'emma' \\gset
-- Lo mismo que escribe fn_recepcion_entrar: la entrada lleva su línea de factura y su lote.
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id, usuario_id, nota)
  values (:'bei_l', :'lima', 'entrada', 3, 'recepcion', :'lote', :'linea', :'yo', 'prueba origen') returning id as mov_f \\gset
`;

// 1. La función de Compras sigue enlazando la entrada con su línea de factura: si cambia, esta lectura quedaría ciega.
const guarda = correr(`select position('compra_item_id' in substring(pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure) from position('insert into retail.movimientos' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) for 220)) > 0;`);
esperar("fn_recepcion_entrar sigue escribiendo compra_item_id en la entrada que deja (el enlace con Compras)", guarda.ok && guarda.salida.endsWith("t"), guarda.salida || guarda.error);

// 2. Una compra recibida cuenta como origen Compras, con el costo de la factura, para el proveedor de la factura.
const r = correr(`${PREPARAR}
select 'compras|' || (unidades_compras - :u0) || '|' || (gasto_compras - :g0) || '|' || con_factura from retail.fn_proveedor_prendas(:'prov') where producto_id = :'emma';
select 'habitual|' || coalesce((select unidades_compras from retail.fn_proveedor_prendas(:'hab') where producto_id = :'emma'), 0);
select 'taller|' || retail.fn_proveedor_es_taller(:'prov');
`);
esperar("la compra recibida cuenta 3 unidades de origen Compras a S/ 31.50 (costo de la factura) = S/ 94.50, con factura", r.ok && r.salida.includes("compras|3|94.50|true"), r.salida || r.error);
esperar("se atribuye al proveedor de la factura, no al habitual de la prenda (el habitual no recibe unidades de Compras)", r.ok && r.salida.includes("habitual|0"), r.salida || r.error);
esperar("un proveedor externo no es el Taller", r.ok && r.salida.includes("taller|false"), r.salida || r.error);

// 3. Una entrada sin factura: proveedor del lote, costo de costo_historial, aparte como «sin factura».
const sf = correr(`${PREPARAR}
insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por) values (:'lima', :'hab', 'T-ORI-2', :'yo') returning id as lote2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, lote_id, usuario_id, nota)
  values (:'bei_l', :'lima', 'entrada', 2, 'recepcion', :'lote2', :'yo', 'prueba sin factura') returning id as mov_s \\gset
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id)
  values (:'bei_l', 0, 10, 2, 20, 15, 'compra', :'mov_s');
select 'sinfactura|' || unidades_compras || '|' || unidades_sin_factura || '|' || gasto_compras from retail.fn_proveedor_prendas(:'hab') where producto_id = :'emma';
`);
esperar("una entrada sin factura cuenta como Compras «sin factura»: proveedor del lote y costo del historial (2 × S/ 20 = S/ 40)", sf.ok && sf.salida.includes("sinfactura|2|2|40.00"), sf.salida || sf.error);

// 4. Lo no recibido es carga inicial, estimado, y de nadie más que el habitual: el rendimiento nunca suma los dos orígenes a escondidas.
const carga = correr(`${PREPARAR}
select 'suma|' || bool_and(unidades_compradas = unidades_compras + unidades_carga) || '|' || bool_and(abs(gasto - (gasto_compras + gasto_carga)) < 0.01) from retail.fn_proveedores_prendas();
`);
esperar("en cada fila, lo comprado es exactamente Compras + Carga inicial (unidades y soles)", carga.ok && carga.salida.includes("suma|true|true"), carga.salida || carga.error);

// 5. La llave: sin la sesión de quien ve la plata de proveedores, se rechaza; y la función base no la ejecuta nadie.
const sin = correr(`begin;\n${MIGRACION}\nset local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000000';\nselect count(*) from retail.fn_proveedores_rendimiento();`);
esperar("sin la llave de la plata de proveedores, el rendimiento se rechaza", !sin.ok && /necesita Proveedores/.test(sin.error), sin.salida || sin.error);
const base = correr(`select has_function_privilege('authenticated', 'retail.fn_proveedor_prendas_base(uuid)', 'execute') as base, has_function_privilege('anon', 'retail.fn_proveedores_prendas()', 'execute') as anon;`);
esperar("la función base no la ejecuta ninguna cuenta, y anon no lee las prendas de los proveedores", base.ok && base.salida === "f|f" , base.salida || base.error);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
