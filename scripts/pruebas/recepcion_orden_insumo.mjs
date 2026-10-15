#!/usr/bin/env node
/**
 * Pruebas de la recepción en el Taller contra la orden de insumos (ADR-0362, fase 7 parte 2, actividades 3 y 4) — migraciones
 * `20261015035000_orden_insumo_recepcion_esquema.sql` (el libro de recepciones de una orden y la orden en el lote),
 * `20261015040000_orden_insumo_recepcion_funciones.sql` (`fn_ordenes_insumo_por_recibir`, `recibir_orden_insumo`, los candados de editar y
 * anular y lo recibido en el detalle) y `20261015043000_orden_insumo_lo_que_no_llego.sql` (lo que no va a llegar, anotado en la orden y
 * en la lista). Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 3). CAYLA V2.
 *
 * LO QUE VIGILA. Que lo que llega al Taller entre contra su orden aunque el papel no haya llegado (decisión 9), con las reglas de la
 * recepción del Taller: un lote y su movimiento de compra juntos, nunca más de lo que queda (lo mayor entre lo pedido y lo facturado, menos
 * lo recibido), tres decimales, idempotente; que lo que el papel trajo fuera de la orden también entre (decisión 43); que quien recibe vea y
 * corrija el precio de ESA orden (decisión 53); que quien hizo la orden no la reciba (decisión 17); que con algo recibido la orden ya no se
 * edite ni se anule; y que dos personas recibiendo a la vez no metan más de lo que queda.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las cinco migraciones de la fase 7 parte 2 se cargan dentro de cada caso: así se
 * prueba que se pueden pegar otra vez). La orden O1 la hace Micaela (con el módulo «Órdenes de insumos») y la recibe Felipe; la O2 la hace
 * Felipe.
 *   M  las migraciones se vuelven a cargar.
 *   P  PUERTAS: sin el módulo de Producción no se lee ni se recibe; quien hizo la orden no la recibe.
 *   R  RECIBIR: sin papel; hasta lo que queda; el costo sugerido y el corregido; con papel (lo de más y lo de fuera de la orden).
 *   Q  CANTIDADES MALAS: cuatro decimales, cero, NaN, una línea de otra orden, repetida, sin líneas.
 *   I  DOBLE ENVÍO: el mismo token y contenido devuelve la misma recepción; con otro contenido, `token_reusado`.
 *   K  CANDADO: con algo recibido no se edita ni se anula. Orden anulada; una tienda no recibe insumos.
 *   N  LO QUE NO LLEGÓ (actividad 4): se cierra el resto al recibir (o solo se cierra, con «0»), deja de estar pendiente y queda en la
 *      orden y en la lista como lo que el proveedor nos debe, a su costo; los cierres que no se entienden, rechazados.
 *   L  EL LIBRO: no se edita ni se borra (las recepciones y lo que no llegó).
 *   S  LA FORMA: security definer con search_path; `authenticated` sí, `anon` no; lo interno, cerrado.
 *   2S DOS SESIONES A LA VEZ: reciben todo lo que queda de la misma línea; la segunda espera la orden y lee que ya no queda: un solo lote. Hace
 *      COMMIT de una orden de prueba y la borra al terminar, así que NO corre contra la base local compartida: solo en el CI (cada tanda
 *      tiene su base) o con `--contenedor` de un banco propio.
 *
 * USO
 *   node scripts/pruebas/recepcion_orden_insumo.mjs                              → contra el stack local compartido (sin 2S)
 *   node scripts/pruebas/recepcion_orden_insumo.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio), con 2S
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const COMPARTIDO = "supabase_db_cayla-retail";
const CONTENEDOR = arg("--contenedor", COMPARTIDO);
const BASE = arg("--base", "postgres");
const DOS_SESIONES = Boolean(process.env.CI) || CONTENEDOR !== COMPARTIDO || process.argv.includes("--dos-sesiones");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(
  [
    "20261015015000_orden_insumo_comprobante_esquema.sql",
    "20261015020000_orden_insumo_comprobante_funciones.sql",
    "20261015034000_orden_insumo_comprobante_contado.sql",
    "20261015035000_orden_insumo_recepcion_esquema.sql",
    "20261015040000_orden_insumo_recepcion_funciones.sql",
    "20261015043000_orden_insumo_lo_que_no_llego.sql",
  ]
    .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
    .join("\n"),
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed): firma a su nombre sin marcar asistencia
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo, no es Admin (seed)
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder y Admin (seed): recibe en las dos sesiones de 2S

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
const FIRMA_CREAR = encabezados({ "x-responsable-omitido": "orden_insumo_crear" });
const FIRMA_PAPEL = encabezados({ "x-responsable-omitido": "orden_insumo_comprobante" });
const FIRMA_EDITAR = encabezados({ "x-responsable-omitido": "orden_insumo_editar" });
const FIRMA_ANULAR = encabezados({ "x-responsable-omitido": "orden_insumo_anular" });
const SIN_FIRMA = encabezados({});

// Envolturas que nunca abortan el caso: «OK:<resultado>» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create function pg_temp.recibe(p_orden uuid, p_ubicacion uuid, p_lineas jsonb, p_token uuid default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.recibir_orden_insumo(p_orden, p_ubicacion, p_lineas, null, p_token);
  return 'OK:' || v_r::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.j(p text) returns jsonb language sql as $f$ select case when p like 'OK:%' then substr(p, 4)::jsonb end $f$;
`;

const MICAELA_CON_MODULO = `
reset role;
insert into retail.rol_modulos (rol_id, modulo)
  select c.rol_id, 'ordenes_insumos' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Telas Recepción CI Prueba', 'tela') returning id as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CIR-LINO', 'Lino Crudo CI Recepción', 'tela', 'metro') returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CIR-HILO', 'Hilo Algodón CI Recepción', 'avio', 'cono') returning id as hilo \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CIR-BOTON', 'Botón Nácar CI Recepción', 'avio', 'unidad') returning id as boton \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
-- Cada cuenta firma a su nombre (el combo «Responsable» tiene sus propias pruebas).
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
${MICAELA_CON_MODULO}
-- O1, de Micaela: 12.5 m de lino a 10 (S/ 125.00) y 4 conos de hilo a 3.50 con S/ 1.50 de descuento (S/ 12.50: S/ 3.125 el cono).
${como(MICAELA)}${FIRMA_CREAR}
select id as o1 from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, null,
  jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '12.5', 'precio_unitario', '10'),
                    jsonb_build_object('insumo_id', :'hilo', 'cantidad', '4', 'precio_unitario', '3.5', 'descuento', '1.50'))) \\gset
select id as i1 from retail.orden_insumo_items where orden_insumo_id = :'o1' and posicion = 1 \\gset
select id as i2 from retail.orden_insumo_items where orden_insumo_id = :'o1' and posicion = 2 \\gset
-- O2, de Felipe: 5 m de lino.
${como(FELIPE)}${FIRMA_CREAR}
select id as o2 from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, null,
  jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '5', 'precio_unitario', '10'))) \\gset
select id as j1 from retail.orden_insumo_items where orden_insumo_id = :'o2' and posicion = 1 \\gset
${como(FELIPE)}${SIN_FIRMA}
`;

const una = (item, cantidad, extra = "") => `jsonb_build_array(jsonb_build_object('orden_insumo_item_id', ${item}, 'cantidad', '${cantidad}'${extra}))`;

let fallas = 0;
let casos = 0;
function anotar(nombre, ok, esperado, obtenido) {
  casos++;
  if (!ok) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  anotar(nombre, obtenido === esperado, esperado, obtenido);
}

caso(
  "M1 las seis migraciones se vuelven a cargar sin error",
  `select (to_regprocedure('retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid)') is not null)::text;`,
  "true"
);

caso(
  "P1 sin el módulo de Producción no se lee ni se recibe (42501 / recibir_insumos_sin_modulo)",
  `-- El rol de Micaela trae Producción en la siembra: se le quita en esta transacción.
   reset role;
   delete from retail.rol_modulos m where m.modulo = 'produccion'
      and m.rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select concat_ws(',',
     pg_temp.eh(pg_temp.intento($$select retail.fn_ordenes_insumo_por_recibir('$$ || :'taller' || $$')$$)),
     pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "1")})));`,
  "42501|recibir_insumos_sin_modulo,42501|recibir_insumos_sin_modulo"
);
caso(
  "P2 quien hizo la orden no la recibe, ni el líder (42501 / recibir_quien_compro) y no queda nada",
  `select concat_ws('|', pg_temp.eh(pg_temp.recibe(:'o2', :'taller', ${una(":'j1'", "1")})),
     (select count(*) from retail.insumo_lotes l where l.orden_insumo_item_id = :'j1'));`,
  "42501|recibir_quien_compro|0"
);

caso(
  "R1 sin papel (el comprobante no bloquea): 10 m de lino abren un lote con el costo neto de la orden y su movimiento de compra",
  `select pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "10")}) as r \\gset
   select concat_ws('|', pg_temp.j(:'r') ->> 'lotes', pg_temp.j(:'r') ->> 'queda',
     (pg_temp.j(:'r') ->> 'documento' = retail.fn_orden_insumo_numero_texto((select numero from retail.ordenes_insumo where id = :'o1')))::text,
     (select l.cantidad_ingresada || ':' || l.costo_unitario || ':' || (l.codigo_lote = l.documento) || ':' || (l.ubicacion_id = :'taller')
             || ':' || (l.orden_insumo_recepcion_id = (pg_temp.j(:'r') ->> 'recepcion_id')::uuid) || ':' || (l.comprobante_item_id is null)
        from retail.insumo_lotes l where l.orden_insumo_item_id = :'i1'),
     (select m.tipo || ':' || m.cantidad || ':' || m.costo_unitario || ':' || (m.usuario_id = :'felipe_p')
        from retail.movimientos_insumo m join retail.insumo_lotes l on l.id = m.insumo_lote_id where l.orden_insumo_item_id = :'i1'),
     (select f ->> 'recibido' from jsonb_array_elements(retail.fn_orden_insumo(:'o1') -> 'recepcion') f where (f ->> 'posicion')::int = 1));`,
  "1|true|true|10.000:10.0000:true:true:true:true|compra:10.000:10.0000:true|10.000"
);
caso(
  "R2 hasta lo que queda: 3 m más no (recibir_orden_insumo_de_mas); los 2.5 que faltan, sí, y la línea queda en cero",
  `select pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "10")}) \\g /dev/null
   select pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "3")})) as a \\gset
   select pg_temp.j(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "2.5")})) ->> 'lotes' as b \\gset
   select concat_ws('|', :'a', :'b',
     (select l ->> 'queda' from jsonb_array_elements(retail.fn_ordenes_insumo_por_recibir(:'taller')) o, jsonb_array_elements(o -> 'lineas') l
       where (o ->> 'id')::uuid = :'o1' and (l ->> 'item_id')::uuid = :'i1'));`,
  "P0001|recibir_orden_insumo_de_mas|1|0.000"
);
caso(
  "R3 el costo: el sugerido es el neto de la orden (S/ 3.125 el cono); quien recibe lo corrige (S/ 3.20); uno negativo o con 5 decimales, no",
  `select (select l ->> 'costo' from jsonb_array_elements(retail.fn_ordenes_insumo_por_recibir(:'taller')) o, jsonb_array_elements(o -> 'lineas') l
       where (o ->> 'id')::uuid = :'o1' and (l ->> 'item_id')::uuid = :'i2') as sugerido \\gset
   select concat_ws('|',
     pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i2'", "1", ", 'costo_unitario', '-1'")})),
     pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i2'", "1", ", 'costo_unitario', '3.12345'")})),
     pg_temp.j(pg_temp.recibe(:'o1', :'taller', ${una(":'i2'", "4", ", 'costo_unitario', '3.20'")})) ->> 'lotes') as r \\gset
   select concat_ws('|', :'sugerido', :'r', (select l.costo_unitario from retail.insumo_lotes l where l.orden_insumo_item_id = :'i2'));`,
  "3.1250|P0001|recibir_orden_insumo_costo|P0001|recibir_orden_insumo_costo|1|3.2000"
);
caso(
  "R4 con papel: lo de más (15 de 12.5 m, al costo del papel) y lo de fuera de la orden (10 botones) también se reciben",
  `${MICAELA_CON_MODULO}${como(MICAELA)}${FIRMA_PAPEL}
   select retail.registrar_comprobante_orden_insumo(:'o1', 'factura', 'F001', '901', jsonb_build_array(
     jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '15', 'costo_unitario', '9.80'),
     jsonb_build_object('insumo_id', :'boton', 'cantidad', '10', 'costo_unitario', '0.20')), null, 'credito', retail.fn_hoy_lima() + 30) \\g /dev/null
   select x.id as bx from retail.comprobantes_produccion_items x join retail.comprobantes_produccion c on c.id = x.comprobante_id
    where c.orden_insumo_id = :'o1' and x.orden_insumo_item_id is null \\gset
   ${como(FELIPE)}${SIN_FIRMA}
   select (select string_agg(concat_ws(':', l ->> 'tipo', l ->> 'insumo', l ->> 'pedido', l ->> 'facturado', l ->> 'queda', l ->> 'costo', l ->> 'documento'), ',' order by l ->> 'tipo', l ->> 'insumo')
        from jsonb_array_elements(retail.fn_ordenes_insumo_por_recibir(:'taller')) o, jsonb_array_elements(o -> 'lineas') l
       where (o ->> 'id')::uuid = :'o1' and l ->> 'insumo' <> 'Hilo Algodón CI Recepción') as lectura \\gset
   select pg_temp.j(pg_temp.recibe(:'o1', :'taller', jsonb_build_array(
       jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '15'),
       jsonb_build_object('comprobante_item_id', :'bx', 'cantidad', '10')))) ->> 'lotes' as lotes \\gset
   select concat_ws('|', :'lectura', :'lotes',
     (select l.cantidad_ingresada || ':' || l.costo_unitario from retail.insumo_lotes l where l.orden_insumo_item_id = :'i1'),
     (select l.cantidad_ingresada || ':' || l.costo_unitario || ':' || (l.orden_insumo_item_id is null) from retail.insumo_lotes l where l.comprobante_item_id = :'bx'));`,
  "orden:Lino Crudo CI Recepción:12.500:15.000:15.000:9.8000,papel:Botón Nácar CI Recepción:10.000:10.000:0.2000:F001-901|2|15.000:9.8000|10.000:0.2000:true"
);

caso(
  "Q1 cantidades malas: cuatro decimales, cero, NaN, una línea de otra orden, repetida y sin líneas; nada queda escrito",
  `select concat_ws(',',
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "1.2345")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "0")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "NaN")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'j1'", "1")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', jsonb_build_array(jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '1'),
                                                                             jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '1')))), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', '[]'::jsonb)), '|', 2),
     (select count(*) from retail.insumo_lotes l join retail.orden_insumo_items i on i.id = l.orden_insumo_item_id where i.orden_insumo_id = :'o1'));`,
  [
    "recibir_orden_insumo_cantidad",
    "recibir_orden_insumo_cantidad",
    "recibir_orden_insumo_cantidad",
    "recibir_orden_insumo_linea_ajena",
    "recibir_orden_insumo_linea",
    "recibir_orden_insumo_sin_lineas",
    "0",
  ].join(",")
);
caso(
  "I1 doble envío: el mismo token con lo mismo devuelve la misma recepción (repetido) y un solo lote; con otras cantidades, token_reusado",
  `select gen_random_uuid() as tok \\gset
   select pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "5")}, :'tok') as a \\gset
   select pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "5")}, :'tok') as b \\gset
   select concat_ws('|', ((pg_temp.j(:'a') ->> 'recepcion_id') = (pg_temp.j(:'b') ->> 'recepcion_id'))::text, pg_temp.j(:'b') ->> 'repetido',
     (select count(*) from retail.insumo_lotes l where l.orden_insumo_item_id = :'i1'),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "6")}, :'tok')), '|', 2));`,
  "true|true|1|token_reusado"
);

// ---------- Lo que no llegó (actividad 4) ----------
const conCierre = (item, cantidad, motivo, extra = "") =>
  `jsonb_build_array(jsonb_build_object('orden_insumo_item_id', ${item}, 'cantidad', '${cantidad}', 'cierre', jsonb_build_object('motivo', '${motivo}')${extra}))`;
caso(
  "N1 al recibir 8 de 12.5 m, el resto (4.5 m) no va a llegar: deja de estar pendiente y queda en la orden y en la lista como lo que nos debe (S/ 45.00)",
  `select pg_temp.recibe(:'o1', :'taller', ${conCierre(":'i1'", "8", "faltante")}) as r \\gset
   select concat_ws('|', pg_temp.j(:'r') ->> 'lotes', pg_temp.j(:'r') ->> 'cierres',
     (select l.cantidad_ingresada from retail.insumo_lotes l where l.orden_insumo_item_id = :'i1'),
     (select k.cantidad || ':' || k.costo_unitario || ':' || k.motivo || ':' || (k.usuario_id = :'felipe_p') from retail.orden_insumo_cierres k where k.orden_insumo_item_id = :'i1'),
     -- La lectura trae todas las líneas de la orden (la web oculta las que ya no tienen nada que recibir).
     (select coalesce(string_agg(l ->> 'queda', ','), 'ya no aparece') from jsonb_array_elements(retail.fn_ordenes_insumo_por_recibir(:'taller')) o, jsonb_array_elements(o -> 'lineas') l
       where (o ->> 'id')::uuid = :'o1' and (l ->> 'item_id')::uuid = :'i1'),
     (select string_agg(c ->> 'insumo' || ':' || (c ->> 'cantidad') || ':' || (c ->> 'importe') || ':' || (c ->> 'motivo'), ',') from jsonb_array_elements(retail.fn_orden_insumo(:'o1') -> 'cierres') c),
     (select f.cierres || ':' || f.nos_debe from retail.fn_ordenes_insumo_nos_debe(array[:'o1']::uuid[]) f where f.orden_id = :'o1'));`,
  "1|1|8.000|4.500:10.0000:faltante:true|0.000|Lino Crudo CI Recepción:4.500:45.00:faltante|1:45.00"
);
caso(
  "N2 sin que llegue nada («0»), solo se anota que no va a llegar: una recepción sin lotes y su cierre al costo de la orden (4 conos a S/ 3.125)",
  `select pg_temp.recibe(:'o1', :'taller', ${conCierre(":'i2'", "0", "devolucion")}) as r \\gset
   select concat_ws('|', pg_temp.j(:'r') ->> 'lotes', pg_temp.j(:'r') ->> 'cierres',
     (select count(*) from retail.insumo_lotes l where l.orden_insumo_item_id = :'i2'),
     (select k.cantidad || ':' || round(k.cantidad * k.costo_unitario, 2) || ':' || k.motivo from retail.orden_insumo_cierres k where k.orden_insumo_item_id = :'i2'));`,
  "0|1|0|4.000:12.50:devolucion"
);
caso(
  "N3 cierres que no se entienden: «0» sin cierre, cierre sin nada que cerrar, motivo raro, cierre que no es un objeto; nada queda escrito",
  `select concat_ws(',',
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "0")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${conCierre(":'i1'", "12.5", "faltante")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${conCierre(":'i1'", "1", "perdido")})), '|', 2),
     split_part(pg_temp.eh(pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "1", ", 'cierre', 'sí'")})), '|', 2),
     (select count(*) from retail.orden_insumo_cierres k where k.orden_insumo_id = :'o1'),
     (select count(*) from retail.orden_insumo_recepciones r where r.orden_insumo_id = :'o1'));`,
  "recibir_orden_insumo_cantidad,recibir_orden_insumo_cierre,recibir_orden_insumo_cierre,recibir_orden_insumo_cierre,0,0"
);
caso(
  "N4 lo que el papel trajo fuera de la orden también se cierra: de 10 botones llegan 6 y los otros 4 quedan como deuda, ligados a la línea del papel",
  `${MICAELA_CON_MODULO}${como(MICAELA)}${FIRMA_PAPEL}
   select retail.registrar_comprobante_orden_insumo(:'o1', 'boleta', 'B001', '902', jsonb_build_array(
     jsonb_build_object('insumo_id', :'boton', 'cantidad', '10', 'costo_unitario', '0.20')), null, 'credito', retail.fn_hoy_lima() + 30) \\g /dev/null
   select x.id as bx from retail.comprobantes_produccion_items x join retail.comprobantes_produccion c on c.id = x.comprobante_id
    where c.orden_insumo_id = :'o1' and x.orden_insumo_item_id is null \\gset
   ${como(FELIPE)}${SIN_FIRMA}
   select pg_temp.recibe(:'o1', :'taller', jsonb_build_array(jsonb_build_object('comprobante_item_id', :'bx', 'cantidad', '6', 'cierre', jsonb_build_object('motivo', 'otro', 'nota', 'se rompieron')))) \\g /dev/null
   select (select k.cantidad || ':' || k.costo_unitario || ':' || coalesce(k.nota, '') || ':' || (k.orden_insumo_item_id is null) from retail.orden_insumo_cierres k where k.comprobante_item_id = :'bx');`,
  "4.000:0.2000:se rompieron:true"
);

caso(
  "K1 con algo recibido la orden ya no se edita ni se anula (orden_insumo_con_recepcion)",
  `select pg_temp.recibe(:'o1', :'taller', ${una(":'i1'", "1")}) \\g /dev/null
   select version as v from retail.ordenes_insumo where id = :'o1' \\gset
   ${como(MICAELA)}${FIRMA_EDITAR}
   select pg_temp.eh(pg_temp.intento($$select retail.editar_orden_insumo('$$ || :'o1' || $$', $$ || :'v' || $$, '$$ || :'prov' || $$', '$$ || :'taller'
     || $$', null, 'cambio', jsonb_build_array(jsonb_build_object('insumo_id', '$$ || :'lino' || $$', 'cantidad', '20', 'precio_unitario', '10')))$$)) as e \\gset
   ${FIRMA_ANULAR}
   select pg_temp.eh(pg_temp.intento($$select retail.anular_orden_insumo('$$ || :'o1' || $$', $$ || :'v' || $$, 'ya no')$$)) as n \\gset
   select :'e' || ',' || :'n';`,
  "P0001|orden_insumo_con_recepcion,P0001|orden_insumo_con_recepcion"
);
caso(
  "K2 una orden anulada no se recibe (orden_insumo_anulada) y una tienda no recibe insumos (recibir_otro_taller)",
  `${FIRMA_ANULAR}
   select retail.anular_orden_insumo(:'o2', 1, 'prueba') \\g /dev/null
   ${SIN_FIRMA}
   select concat_ws(',',
     pg_temp.eh(pg_temp.recibe(:'o2', :'taller', ${una(":'j1'", "1")})),
     pg_temp.eh(pg_temp.recibe(:'o1', :'tienda', ${una(":'i1'", "1")})));`,
  "P0001|orden_insumo_anulada,P0001|recibir_otro_taller"
);
caso(
  "L1 los libros de una orden no se editan ni se borran: lo recibido y lo que no llegó",
  `select (pg_temp.j(pg_temp.recibe(:'o1', :'taller', ${conCierre(":'i1'", "1", "faltante")})) ->> 'recepcion_id') as r \\gset
   reset role;
   select concat_ws(',',
     pg_temp.eh(pg_temp.intento($$update retail.orden_insumo_recepciones set nota = 'x' where id = '$$ || :'r' || $$'$$)),
     pg_temp.eh(pg_temp.intento($$delete from retail.orden_insumo_recepciones where id = '$$ || :'r' || $$'$$)),
     pg_temp.eh(pg_temp.intento($$update retail.orden_insumo_cierres set cantidad = 1 where recepcion_id = '$$ || :'r' || $$'$$)),
     pg_temp.eh(pg_temp.intento($$delete from retail.orden_insumo_cierres where recepcion_id = '$$ || :'r' || $$'$$)));`,
  "42501|,42501|,42501|,42501|"
);
caso(
  "S1 la forma: security definer con search_path; authenticated lee y recibe, anon no; lo interno, cerrado",
  `reset role;
   select concat_ws(',',
     (select string_agg(p.prosecdef || ':' || (p.proconfig::text like '%search_path%'), ':' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('recibir_orden_insumo', 'fn_ordenes_insumo_por_recibir')),
     has_function_privilege('authenticated', 'retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid)', 'execute')::text,
     has_function_privilege('anon', 'retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid)', 'execute')::text,
     has_function_privilege('authenticated', 'retail.fn_ordenes_insumo_por_recibir(uuid)', 'execute')::text,
     has_function_privilege('authenticated', 'retail.fn_orden_insumo_por_recibir_lineas(uuid)', 'execute')::text,
     has_function_privilege('authenticated', 'retail.fn_orden_insumo_recepcion_resultado(uuid, boolean)', 'execute')::text);`,
  "true:true:true:true,true,false,true,false,false"
);

// 2S. DOS SESIONES A LA VEZ ---------------------------------------------------------------------------------------------------
// Una orden de prueba COMMITEADA (de Felipe, para que la reciba Sandra), sobre la base ya migrada. Se borra entera al terminar —y al
// empezar, si una corrida anterior se cortó—, también sus filas que «solo se agregan» (session_replication_role = replica).
const MARCA_2S = "ZZ OI recepción dos sesiones";
const LIMPIAR_2S = `
set client_min_messages = warning;
begin;
set local session_replication_role = replica;
create temp table _prov on commit drop as select p.id from retail.proveedores_produccion p where p.nombre like '${MARCA_2S}%';
create temp table _ord on commit drop as select o.id from retail.ordenes_insumo o where o.proveedor_id in (select id from _prov);
create temp table _lot on commit drop as select l.id from retail.insumo_lotes l
  where l.orden_insumo_item_id in (select i.id from retail.orden_insumo_items i where i.orden_insumo_id in (select id from _ord));
delete from retail.orden_insumo_cierres k where k.orden_insumo_id in (select id from _ord);
delete from retail.movimientos_insumo m where m.insumo_lote_id in (select id from _lot);
delete from retail.insumo_lotes l where l.id in (select id from _lot);
delete from retail.orden_insumo_recepciones r where r.orden_insumo_id in (select id from _ord);
delete from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id in (select id::text from _ord);
delete from retail.orden_insumo_versiones v where v.orden_insumo_id in (select id from _ord);
delete from retail.orden_insumo_items i where i.orden_insumo_id in (select id from _ord);
delete from retail.ordenes_insumo o where o.id in (select id from _ord);
delete from retail.insumos n where n.codigo like 'ZZOIR2S-%';
delete from retail.proveedores_produccion p where p.id in (select id from _prov);
commit;
select count(*) from retail.proveedores_produccion where nombre like '${MARCA_2S}%';
`;
const CREAR_2S = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}${FIRMA_CREAR}
insert into retail.proveedores_produccion (nombre, rubro) values ('${MARCA_2S} ' || substr(md5(random()::text), 1, 8), 'tela') returning id as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZOIR2S-' || substr(md5(random()::text), 1, 8), 'Lino dos sesiones', 'tela', 'metro')
  returning id as ins \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select r.id as oc from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, null,
  jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', '10', 'precio_unitario', '20'))) r \\gset
select id as it from retail.orden_insumo_items where orden_insumo_id = :'oc' \\gset
commit;
select :'oc' || '|' || :'it' || '|' || :'taller';
`;
// Sandra recibe los 10 m: «OK» o «sqlstate|hint». Con `espera`, se queda con la orden bloqueada ese tiempo antes de confirmar.
const SESION_RECIBE = (x, espera) => `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${como(SANDRA)}${SIN_FIRMA}
select pg_temp.recibe('${x.oc}', '${x.taller}', jsonb_build_array(jsonb_build_object('orden_insumo_item_id', '${x.it}', 'cantidad', '10'))) as r \\gset
select case when :'r' like 'OK:%' then 'OK' else pg_temp.eh(:'r') end;
${espera ? `select pg_sleep(${espera});\ncommit;` : "commit;"}
`;
const ultima = (s) => s.stdout.trim().split("\n").filter(Boolean).at(-1);

async function dosSesiones() {
  const nombre = "2S1 dos sesiones reciben a la vez todo lo que queda de la misma línea: la segunda espera la orden y lee que ya no queda; un solo lote";
  if (!DOS_SESIONES) {
    console.log(`⤳ ${nombre}: se salta en la base local compartida (hace COMMIT); córrela con --contenedor <banco propio>`);
    return;
  }
  try {
    psql(LIMPIAR_2S);
    const [oc, it, taller] = psql(CREAR_2S).trim().split("\n").filter(Boolean).at(-1).split("|");
    const x = { oc, it, taller };
    const p1 = psqlAsync(SESION_RECIBE(x, 1.5));
    await dormir(400);
    const p2 = psqlAsync(SESION_RECIBE(x, null));
    const [s1, s2] = await Promise.all([p1, p2]);
    const lotes = psql(`select count(*) || ':' || coalesce(sum(cantidad_ingresada), 0) from retail.insumo_lotes where orden_insumo_item_id = '${it}';`).trim();
    const esperado = "s1=OK · s2=P0001|recibir_orden_insumo_de_mas · esperó · lotes=1:10.000";
    const obtenido = `s1=${ultima(s1)} · s2=${ultima(s2)} · ${s2.ms > 900 ? "esperó" : `no esperó (${s2.ms} ms)`} · lotes=${lotes}`;
    const ok = s1.code === 0 && s2.code === 0 && obtenido === esperado;
    anotar(nombre, ok, esperado, ok ? obtenido : `${obtenido}\n    s1: ${s1.stderr.trim()}\n    s2: ${s2.stderr.trim()}`);
  } catch (e) {
    anotar("2S dos sesiones", false, "sin error", String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" "));
  } finally {
    try {
      const quedan = psql(LIMPIAR_2S).trim().split("\n").filter(Boolean).at(-1);
      if (quedan !== "0") console.log(`⚠ quedaron ${quedan} proveedores «${MARCA_2S}» sin borrar`);
    } catch (e) {
      console.log(`⚠ no se pudo borrar la orden de prueba de 2S: ${String(e.stderr ?? e.message).split("\n")[0]}`);
    }
  }
}

await dosSesiones();

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
