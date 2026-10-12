#!/usr/bin/env node
/**
 * Pruebas de la compra «Sin comprobante» de una orden (ADR-0362, decisión 50; Felipe 2026-10-12: «Debe existir 4 tipos de
 * comprobantes: boleta, nota de venta, factura y sin comprobante») — migración `20261012235000_compras_sin_comprobante.sql`, sobre
 * `registrar_comprobante_orden` como la dejan `20261012225000` y `20261012230000` (fase 3).
 *
 * LO QUE VIGILA. Que una compra hecha sin ningún papel se registre desde la orden igual que los otros tres tipos (con solo el módulo
 * «Órdenes de compra», al crédito o al contado), sin pedir serie ni número: la base le pone un número interno de la empresa
 * (`SC-000001`) que un reintento no gasta, sin IGV (el total es la suma de las líneas), y que no entre al Registro de Compras ni al
 * IGV de Impuestos (no hay papel que declarar). Los otros tres tipos siguen pidiendo su serie y su número.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las tres migraciones se cargan DOS veces dentro de cada caso: se pueden pegar
 * dos veces y corren con la base al día o sin ella). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con los módulos que
 * pide el caso); Felipe es líder y Admin. El responsable obligatorio va encendido, como en producción.
 *   SC1  al crédito: número interno SC-######, serie y número escritos se ignoran, sin IGV aunque se pida, total y saldo = las
 *        líneas; el siguiente lleva el número que sigue.
 *   SC2  al contado: el pago de la empresa (sin tienda) por el total, la compra queda pagada.
 *   SC3  el total: si llega, tiene que ser la suma exacta de las líneas.
 *   SC4  el mismo token con la misma huella devuelve la misma compra y NO gasta número.
 *   SC5  lo que no se acepta: un tipo que no existe; una boleta sigue pidiendo serie y número.
 *   SC6  lo que ven los demás: Actividad dice «la compra sin comprobante SC-…»; la orden la lista con su tipo; se anula como
 *        cualquier comprobante sin pagos; Impuestos no la cuenta.
 *   S    la forma: el candado de la tabla acepta el tipo nuevo; la secuencia es de la función (authenticated no la usa).
 *
 * USO
 *   node scripts/pruebas/ordenes_compra_sin_comprobante.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/ordenes_compra_sin_comprobante.mjs --contenedor supabase_db_x     → contra otro stack (un banco propio)
 *   node scripts/pruebas/ordenes_compra_sin_comprobante.mjs --sin-migracion                → sin cargar las migraciones: contra una
 *                                                                                            base sin el cambio, la prueba tiene que FALLAR
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
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACIONES = SIN_MIGRACION
  ? ""
  : ["20261012225000_compras_envios.sql", "20261012230000_compras_por_repartir.sql", "20261012235000_compras_sin_comprobante.sql"]
      .map((f) =>
        readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")
          .replace(/^set lock_timeout.*$/m, "")
          .replace(/^reset lock_timeout;$/m, ""),
      )
      .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) =>
  `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
// Con la cuenta de una persona y sin elegir responsable: la clave soltada del combo (decisión 39).
const SIN_COMBO = encabezados({ "x-responsable-omitido": "orden_compra_comprobante" });

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACIONES}
${MIGRACIONES}
set local search_path = retail, public, extensions;
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
grant execute on function pg_temp.intento(text) to authenticated;
-- Cada llamada devuelve su respuesta (texto JSON) o «<sqlstate>|<mensaje>».
create function pg_temp.registra(p_orden uuid, p_tipo text, p_serie text, p_numero text, p_lineas jsonb, p_emision date,
  p_condicion text, p_vence date, p_suma_igv boolean, p_total numeric, p_pago jsonb, p_nota text, p_token uuid)
returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  return retail.registrar_comprobante_orden(p_orden, p_tipo, p_serie, p_numero, p_lineas, p_emision, p_condicion, p_vence,
    p_suma_igv, p_total, p_pago, p_nota, p_token)::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.registra(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid) to authenticated;

-- Datos propios de la prueba.
insert into retail.proveedores (nombre) values ('Proveedor Sin Comprobante OC Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Sin Comprobante OC') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Sin Comprobante OC', 'indumentaria') returning id as cat \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Como en producción: el responsable obligatorio encendido.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
-- O1 directo a Trujillo: l1 = 10 «Polo básico» a S/ 25.50; l2 = 4 a S/ 100 con S/ 40 de descuento (neto S/ 90). Todo: S/ 615.00.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1, numero as n1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Polo básico', 10, 25.50) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct)
  values (:'o1', 2, :'cat', :'marca', 4, 100, 40, 10) returning id as l2 \\gset
select retail.fn_orden_compra_numero_texto(:n1) as oc1 \\gset
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba sin comprobante OC ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;

const L = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const LINEAS = (...ls) => `jsonb_build_array(${ls.map(L).join(", ")})`;
const TODO = LINEAS(
  { orden_compra_item_id: ":'l1'", cantidad: 10, costo_unitario: "25.50" },
  { orden_compra_item_id: ":'l2'", cantidad: 4, costo_unitario: "90.00" },
);
const UNA = (cantidad, costo = "25.50") => LINEAS({ orden_compra_item_id: ":'l1'", cantidad, costo_unitario: costo });
// La llamada con lo de siempre (sin comprobante de O1, al crédito, vence en 30 días) y lo que cambie cada caso (todo en SQL).
const registra = ({
  tipo = "'sin_comprobante'", serie = "null", numero = "null", lineas = TODO, condicion = "'credito'",
  vence = "retail.fn_hoy_lima() + 30", sumaIgv = "true", total = "null", pago = "null", token = "null",
} = {}) =>
  `pg_temp.registra(:'o1', ${tipo}, ${serie}, ${numero}, ${lineas}, null::date, ${condicion}, (${vence})::date, ${sumaIgv}, ` +
  `(${total})::numeric, (${pago})::jsonb, null::text, (${token})::uuid)`;
const id = (v) => `(:'${v}'::jsonb ->> 'compra_id')::uuid`;
const NUM = (v) => `(select c.numero::integer from retail.compras c where c.id = ${id(v)})`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    // Al final se disparan los candados diferidos (el reparto del papel, la gestora con parte): si algo quedó mal guardado, falla aquí.
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
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

caso(
  "SC1 al crédito con solo «Órdenes de compra»: número interno SC, serie y número escritos se ignoran, sin IGV aunque se pida, el siguiente sigue",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${registra({ serie: "'F001'", numero: "'999'" })} as a \\gset
   select ${registra({ lineas: UNA(2) })} as b \\gset
   reset role;
   select concat_ws(' / ',
     (:'a'::jsonb ->> 'documento') ~ '^SC-[0-9]{6}$',
     (select c.tipo || ':' || c.serie || ':' || c.subtotal || '+' || c.igv || '=' || c.total || ':' || c.saldo || ':' || c.condicion
        from retail.compras c where c.id = ${id("a")}),
     (:'a'::jsonb ->> 'total') || ':' || (:'a'::jsonb ->> 'saldo'),
     ${NUM("b")} - ${NUM("a")},
     (select count(*) from retail.compra_items i where i.compra_id = ${id("a")} and i.producto_id is null));`,
  "t / sin_comprobante:SC:615.00+0.00=615.00:615.00:credito / 615.00:615.00 / 1 / 2",
);

caso(
  "SC2 al contado: el pago de la empresa (sin tienda) por el total y la compra queda pagada",
  `insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco Sin Comprobante OC Prueba', 'banco', '104') returning id as banco \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${registra({ condicion: "'contado'", vence: "null", pago: `jsonb_build_array(jsonb_build_object('monto', 615, 'metodo', 'transferencia', 'cuenta_id', :'banco'))` })} as r \\gset
   reset role;
   set constraints all immediate;
   select concat_ws(' / ',
     (select c.tipo || ':' || c.condicion || ':' || c.pagado || ':' || c.saldo || ':' || c.estado_pago from retail.compras c where c.id = ${id("r")}),
     (select string_agg(g.monto || ':' || g.metodo || ':' || coalesce(g.ubicacion_id::text, 'sin tienda'), ',')
        from retail.compra_pagos g where g.compra_id = ${id("r")}));`,
  "sin_comprobante:contado:615.00:0.00:pagada / 615.00:transferencia:sin tienda",
);

caso(
  "SC3 el total, si llega, es la suma exacta de las líneas (sin IGV)",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${registra({ total: "616" })},
     (${registra({ total: "615" })})::jsonb ->> 'total');`,
  "P0001|Sin IGV, el total tiene que ser la suma de las líneas (S/ 615.00); llegó S/ 616 / 615.00",
);

caso(
  "SC4 el mismo token con la misma huella devuelve la misma compra y no gasta número",
  `${como(FELIPE)}
   select gen_random_uuid() as t \\gset
   select ${registra({ token: ":'t'" })} as a \\gset
   select ${registra({ token: ":'t'" })} as b \\gset
   select ${registra({ lineas: UNA(1) })} as c \\gset
   reset role;
   select concat_ws(' / ', ${id("a")} = ${id("b")}, ${NUM("c")} - ${NUM("a")},
     (select count(*) from retail.compras c where c.orden_compra_id = :'o1'));`,
  "t / 1 / 2",
);

caso(
  "SC5 un tipo que no existe no entra; una boleta sigue pidiendo serie y número",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${registra({ tipo: "'ticket'" })},
     ${registra({ tipo: "'boleta'" })},
     ${registra({ tipo: "'boleta'", serie: "'B001'" })},
     (${registra({ tipo: "'boleta'", serie: "'B001'", numero: "'77'" })})::jsonb ->> 'documento');`,
  "P0001|Elige el tipo: boleta, nota de venta, factura o sin comprobante / P0001|Escribe la serie del comprobante / " +
    "P0001|Escribe el número del comprobante / B001-77",
);

caso(
  "SC6 Actividad la nombra bien, la orden la lista con su tipo, se anula como cualquier comprobante sin pagos e Impuestos no la cuenta",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${registra()} as a \\gset
   select (:'a'::jsonb ->> 'documento') as doc \\gset
   select pg_temp.intento(format('select retail.anular_compra(%L, %L)', ${id("a")}, 'No era de esta orden')) as anulada \\gset
   reset role;
   select replace(replace(a.descripcion, :'doc', 'SC'), :'oc1', 'OC1') as act from retail.actividad a
    where a.accion = 'orden_compra_comprobante' and a.registro_id = :'o1' order by a.ocurrio_at desc limit 1 \\gset
   ${como(FELIPE)}
   select (select string_agg((c ->> 'tipo') || ':' || (c ->> 'documento' = :'doc') || ':' || (c ->> 'estado'), ',')
             from jsonb_array_elements(retail.fn_orden_compra_detalle(:'o1') -> 'comprobantes') c) as det \\gset
   -- Impuestos, como lo pide la pantalla (con la cuenta de Felipe en el JWT): fn_impuestos_compras es interna, se llama sin el rol.
   reset role;
   select concat_ws(' / ',
     :'act',
     :'det',
     :'anulada',
     (select count(*) from retail.fn_impuestos_compras(retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 1) x where x.id = ${id("a")}),
     (select count(*) from retail.fn_impuestos_registro_compras(retail.fn_hoy_lima()) x where x.serie = 'SC'));`,
  "registró la compra sin comprobante SC de la OC1 (Proveedor Sin Comprobante OC Prueba) / sin_comprobante:true:anulada / SIN_ERROR / 0 / 0",
);

caso(
  "S la forma: el candado de la tabla acepta el tipo nuevo y la secuencia es de la función",
  `select concat_ws(' / ',
     (select pg_get_constraintdef(oid) like '%sin_comprobante%' from pg_constraint
       where conname = 'compras_tipo_check' and conrelid = 'retail.compras'::regclass),
     has_sequence_privilege('authenticated', 'retail.compras_sin_comprobante_seq', 'usage'),
     (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname = 'registrar_comprobante_orden'));`,
  "t / f / t",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
