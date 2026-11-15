#!/usr/bin/env node
/**
 * Pruebas del costo dudoso (ADR-0668, A4) — migraciones `20261115204000_costo_dudoso_reglas.sql` (PARTE 1) y
 * `20261115205000_costo_dudoso_candados.sql` (PARTE 2).
 *
 * LO QUE VIGILA. Que un costo raro al recibir (440 por 44, lo de la orden sin IGV, fuera de lo que suele costar su categoría) pida
 * confirmar y solo se acepte con el MONTO que la persona confirmó; que los motivos de siempre sigan aceptando el «sí» suelto (la web
 * publicada y la cola sin conexión); que «antes» se compare en la base del papel; y que la regla de la base y la de la web digan lo mismo.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos partes se cargan DOS veces dentro de cada caso: se pueden pegar dos veces).
 *   R  LA REGLA: los casos de `apps/web/lib/costo-dudoso-casos.json` (los mismos que corre la web) contra `fn_motivo_de_costo_con`.
 *   C  LA CONFIRMACIÓN: por monto, al céntimo; el «sí» suelto solo para los motivos de antes.
 *   A  EL ANTERIOR EN PAPEL: × 1.18 si la última entrada pasó por una factura; si no, el guardado.
 *   B  LA BANDA: por modelos de la categoría, con 5 o más; si no, la familia; una familia fuera de los motores, ninguna.
 *   L  «LLEGÓ MERCADERÍA» (`recibir_lote`), de punta a punta: frena, el «sí» suelto no alcanza para una duda nueva, el monto sí.
 *   P  LA LECTURA DE REFERENCIA: solo quien ve el costo de una prenda; su forma.
 *   S  LA FORMA: las seis funciones de la PARTE 2 llevan la regla nueva y ninguna firma cambió.
 *
 * USO
 *   node scripts/pruebas/costo_dudoso.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/costo_dudoso.mjs --contenedor supabase_db_x   → contra otro stack
 *   node scripts/pruebas/costo_dudoso.mjs --sin-migracion              → sin cargar las migraciones: contra una base sin el cambio,
 *                                                                         la prueba tiene que FALLAR
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
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const leer = (archivo) =>
  readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8")
    .replace(/^set lock_timeout.*$/m, "")
    .replace(/^reset lock_timeout;$/m, "");
const MIGRACIONES = SIN_MIGRACION ? "" : `${leer("20261115204000_costo_dudoso_reglas.sql")}\n${leer("20261115205000_costo_dudoso_candados.sql")}`;
const CASOS = JSON.parse(readFileSync(join(RAIZ, "apps", "web", "lib", "costo-dudoso-casos.json"), "utf8")).casos;

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (semilla)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante (semilla), de Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACIONES}
${MIGRACIONES}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_det text; v_r text;
begin
  execute p_sql into v_r;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_det = pg_exception_detail;
  return v_estado || '|' || v_msg || '|' || coalesce(v_det, '');
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

const num = (v) => (v === null ? "null::numeric" : `${v}::numeric`);

// R. LA REGLA: la misma tabla que la web --------------------------------------------------------------------------------------
caso(
  `R1 los ${CASOS.length} casos compartidos con la web dan el mismo motivo en la base`,
  `select string_agg(coalesce(retail.fn_motivo_de_costo_con(t.c, t.a, t.o, t.l, t.h, 0.18), '-'), ',' order by t.n) from (values ${CASOS.map(
    (c, i) => `(${i}, ${num(c.costo)}, ${num(c.anterior)}, ${num(c.deLaOrden)}, ${num(c.banda?.lo ?? null)}, ${num(c.banda?.hi ?? null)})`,
  ).join(", ")}) t(n, c, a, o, l, h);`,
  CASOS.map((c) => c.motivo ?? "-").join(","),
);

// C. LA CONFIRMACIÓN ----------------------------------------------------------------------------------------------------------
caso(
  "C1 por monto, al céntimo: 440 confirmado vale para 440 y no para 4400; el «sí» suelto, solo para los motivos de antes",
  `select concat_ws(',',
     retail.fn_costo_confirmado(440, 'fuera_de_banda', false, '[440]'),
     retail.fn_costo_confirmado(4400, 'fuera_de_banda', true, '[440]'),
     retail.fn_costo_confirmado(18.5, 'sin_igv', true, null),
     retail.fn_costo_confirmado(18.5, 'sin_igv', false, '[18.50]'),
     retail.fn_costo_confirmado(70, 'sube', true, null),
     retail.fn_costo_confirmado(0, 'sin_costo', true, null),
     retail.fn_costo_confirmado(70, 'sube', false, '["70"]'),
     retail.fn_costo_confirmado(70, 'sube', false, '{"a": 70}'));`,
  "t,f,f,t,t,t,f,f",
);

// A. EL ANTERIOR EN PAPEL -----------------------------------------------------------------------------------------------------
// Una variante con su última entrada por una línea de orden con papel del tipo dado (sin claves foráneas: replica).
const ENTRADA_CON = (tipo) => `
set local session_replication_role = replica;
select id as var from retail.variantes where costo > 0 order by id limit 1 \\gset
update retail.variantes set costo = 30.51 where id = :'var';
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, fecha, estado, huella, registrado_por)
  values ('bbbbbbbb-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid(), '${tipo}', 36, 0, current_date, 'por_completar', 'prueba', gen_random_uuid());
insert into retail.ordenes_compra (id, numero, proveedor_id, ubicacion_destino_id, fecha_emision, estado, creada_por, papel_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 999998, gen_random_uuid(), gen_random_uuid(), current_date, 'generada', gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000001');
insert into retail.orden_compra_items (id, orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento)
  values ('bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 1, gen_random_uuid(), gen_random_uuid(), 1, 36, 0);
insert into retail.despacho_items (id, despacho_id, orden_compra_item_id, cantidad, precio_unitario)
  values ('bbbbbbbb-0000-4000-8000-000000000004', gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000003', 1, 36);
insert into retail.despacho_recibidos (despacho_id, despacho_item_id, proveedor_id, categoria_id, variante_id, cantidad, creado_por, movimiento_id)
  values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000004', gen_random_uuid(), gen_random_uuid(), :'var', 1, gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000005');
-- \`orden\` lo pone la base (crece): esta es la última fila de la variante.
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id)
  values (:'var', 0, 0, 1, 30.51, 30.51, 'compra', 'bbbbbbbb-0000-4000-8000-000000000005');
`;
caso("A1 la última entrada pasó por una factura: el anterior en papel es lo guardado × 1.18", `${ENTRADA_CON("factura")}select retail.fn_costo_anterior_en_papel(:'var');`, "36.00");
caso("A2 por una nota de venta: lo guardado tal cual", `${ENTRADA_CON("nota_venta")}select retail.fn_costo_anterior_en_papel(:'var');`, "30.51");
caso(
  "A3 contra el papel (S/ 36) y no contra lo guardado (S/ 30.51): S/ 65 ya no es falsa alarma de «sube», y S/ 23 sí es «baja»",
  `${ENTRADA_CON("factura")}select concat_ws(',',
     coalesce(retail.fn_motivo_de_costo(65, :'var', null, null), '-'), coalesce(retail.fn_motivo_de_costo(23, :'var', null, null), '-'),
     coalesce(retail.fn_costo_fuera_de_banda(65, 30.51, null), '-'), coalesce(retail.fn_costo_fuera_de_banda(23, 30.51, null), '-'));`,
  "-,baja,sube,-",
);

// B. LA BANDA -----------------------------------------------------------------------------------------------------------------
// Una categoría nueva con N modelos de costos dados, en la familia indicada.
const CATEGORIA_CON = (costos, familia = "indumentaria") => `
insert into retail.categorias (nombre, familia, activo) values ('ZZ Banda ' || substr(md5(random()::text), 1, 6), '${familia}', true) returning id as cat \\gset
${costos
  .map(
    (c, i) => `insert into retail.productos (referencia, categoria_id, estado) values ('ZZ banda ${i}', :'cat', 'activo') returning id as p${i} \\gset
insert into retail.variantes (producto_id, precio, costo, activo) values (:'p${i}', 99, ${c}, true);`,
  )
  .join("\n")}
`;
caso(
  "B1 con 5 modelos, la banda es de la mitad del p10 al doble del p90",
  `${CATEGORIA_CON([20, 25, 30, 35, 40])}select lo || '-' || hi || '-' || modelos || '-' || de from retail.fn_banda_de_costo(:'cat');`,
  "11.00-76.00-5-categoria",
);
caso(
  "B2 con 4 modelos no alcanza: cae a la familia",
  `${CATEGORIA_CON([20, 25, 30, 35])}select de from retail.fn_banda_de_costo(:'cat');`,
  (o) => o === "familia",
);
caso(
  "B3 una familia fuera de los motores (bolsas, empaque) no tiene banda",
  `${CATEGORIA_CON([20, 25, 30, 35, 40])}update retail.familias set entra_a_motores = false where codigo = 'indumentaria';
   select count(*) from retail.fn_banda_de_costo(:'cat');`,
  "0",
);

// L. «LLEGÓ MERCADERÍA» de punta a punta --------------------------------------------------------------------------------------
// Una prenda NUEVA (sin costo) de una categoría con banda conocida: 400 queda fuera de lo que suele costar.
const LOTE = (item) => `
${CATEGORIA_CON([20, 25, 30, 35, 40])}
insert into retail.productos (referencia, categoria_id, estado) values ('ZZ nueva', :'cat', 'activo') returning id as pn \\gset
insert into retail.variantes (producto_id, precio, costo, activo) values (:'pn', 999, 0, true) returning id as vn \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select set_config('prueba.items', jsonb_build_array(jsonb_build_object('variante_id', :'vn', 'cantidad', 2) || '${JSON.stringify(item)}'::jsonb)::text, true) \\g /dev/null
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) \\g /dev/null
set local role authenticated;
select pg_temp.intento(format('select retail.recibir_lote(p_ubicacion_id => %L, p_proveedor_id => %L, p_items => %L::jsonb, p_numero_guia => null, p_nota => null, p_token => gen_random_uuid())',
  :'tru', :'prov', current_setting('prueba.items')));`;
const motivoDe = (o) => {
  const det = o.split("|")[2] ?? "";
  try {
    return JSON.parse(det).items.map((x) => x.motivo).join(",");
  } catch {
    return o;
  }
};
caso("L1 una prenda nueva a S/ 400 en una categoría de S/ 20 a 40: pide confirmar, por «fuera_de_banda»", LOTE({ costo_unitario: 400 }), (o) => o.startsWith("P0001|costo_atipico|") && motivoDe(o) === "fuera_de_banda");
caso("L2 el «sí» suelto no alcanza para una duda nueva", LOTE({ costo_unitario: 400, confirma_costo: true }), (o) => o.startsWith("P0001|costo_atipico|"));
caso("L3 con el monto confirmado, entra", LOTE({ costo_unitario: 400, confirma_costo: true, confirma_montos: [400] }), "OK");
caso("L4 confirmar OTRO monto no vale", LOTE({ costo_unitario: 400, confirma_montos: [40] }), (o) => o.startsWith("P0001|costo_atipico|"));
caso("L5 un costo normal para su categoría entra sin preguntar", LOTE({ costo_unitario: 30 }), "OK");

// P. LA LECTURA DE REFERENCIA ------------------------------------------------------------------------------------------------
const MICAELA_CON = (...modulos) => `
insert into retail.roles (nombre) values ('ZZ Prueba ref ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
set local role authenticated;
`;
caso(
  "P1 un rol de mostrador no lee la referencia del costo",
  `${MICAELA_CON("vender", "caja")}select split_part(pg_temp.intento('select retail.fn_precio_referencia()::text'), '|', 1);`,
  "42501",
);
caso(
  "P2 quien recibe la lee, con sus cuatro partes",
  `${CATEGORIA_CON([20, 25, 30, 35, 40])}${MICAELA_CON("recibir")}
   select string_agg(k, ',' order by k) from jsonb_object_keys(retail.fn_precio_referencia(p_categorias => array[:'cat'::uuid])) k;`,
  "anterior,bandas,lineas,tasa_igv",
);
caso(
  "P3 la banda que lee la hoja es la misma del candado",
  `${CATEGORIA_CON([20, 25, 30, 35, 40])}${MICAELA_CON("recibir")}
   select (retail.fn_precio_referencia(p_categorias => array[:'cat'::uuid]) -> 'bandas' -> :'cat' ->> 'lo') || '-' ||
          (retail.fn_precio_referencia(p_categorias => array[:'cat'::uuid]) -> 'bandas' -> :'cat' ->> 'hi');`,
  "11.00-76.00",
);

// S. LA FORMA -----------------------------------------------------------------------------------------------------------------
caso(
  "S1 las puertas de Recibir llevan la regla nueva y los montos viajan hasta el candado; ninguna firma cambió",
  `select string_agg(p.proname || ':' || regexp_count(pg_get_functiondef(p.oid), 'fn_motivo_de_costo') || ':' || regexp_count(pg_get_functiondef(p.oid), 'confirma_montos'), ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.oid in (
       'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure,
       'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)'::regprocedure,
       'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure,
       'retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)'::regprocedure,
       'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure,
       'retail.llevar_al_stock_ahora(uuid,uuid,integer,integer,uuid,jsonb,numeric,boolean,uuid)'::regprocedure);`,
  "cerrar_conteo_envio:0:2,fn_recepcion_entrar:1:1,llevar_al_stock_ahora:0:1,recibir_despacho:0:4,recibir_lote:1:1,resolver_pendiente_envio:0:2",
);
caso(
  "S2 las reglas internas no las ejecuta una cuenta con sesión; la lectura y la confirmación, sí; anon nada",
  `select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute'), ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in
       ('fn_costo_anterior_en_papel', 'fn_banda_de_costo', 'fn_motivo_de_costo', 'fn_motivo_de_costo_con', 'fn_costo_confirmado', 'fn_precio_referencia');`,
  "fn_banda_de_costo:false:false,fn_costo_anterior_en_papel:false:false,fn_costo_confirmado:true:false,fn_motivo_de_costo:false:false,fn_motivo_de_costo_con:false:false,fn_precio_referencia:true:false",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
