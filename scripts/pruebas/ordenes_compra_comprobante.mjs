#!/usr/bin/env node
/**
 * Pruebas del comprobante de una orden de compra (ADR-0362, fase 2, actividades 3 a 8; Felipe 2026-10-12) — migración
 * `20261012211000_compras_comprobante_de_orden.sql`. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-comprobante-de-orden.md.
 *
 * LO QUE VIGILA. Que la compradora registre la boleta, nota de venta o factura de una orden con SOLO el módulo «Órdenes de compra»
 * (también al contado, decisión 42), que lo guardado cuadre (líneas sin prenda, todo a «Llega a», el pago de la empresa sin tienda,
 * el IGV y el total impreso), que lo de más y lo que no estaba en la orden se acepte y se avise (decisión 43), que un reintento no
 * duplique, que el mismo papel vigente no entre dos veces, y que la orden con comprobante no se edite ni se anule por debajo.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se
 * puede pegar dos veces y corre con la base al día o sin ella). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con los
 * módulos que pide cada caso); Felipe es líder y Admin. El responsable obligatorio va encendido, como en producción.
 *   P  PERMISOS: con solo «Órdenes de compra» registra; sin él, 42501; con solo Facturas de proveedor, tampoco. Quien no es Admin firma
 *      sin combo con la clave `orden_compra_comprobante` (sin ella le pide el combo); una terminal sin elegir a alguien, no.
 *   B  BOLETA AL CRÉDITO: total exacto, gestora = «Llega a», la orden y cada línea pedida guardadas, líneas sin prenda, todo a la
 *      gestora, sin pagos ni movimientos.
 *   F  IGV: factura que suma el 18 %, el total impreso dentro de la tolerancia (y fuera, no), factura sin IGV, boleta y nota sin IGV.
 *   C  CONTADO: el pago sin tienda y con su cuenta, suma = total, sin el módulo Por pagar; y lo que no cuadra o no corresponde.
 *   A  AVISOS: «de más» y «fuera de la orden» con su forma exacta, sin bloquear; y las líneas que no se aceptan.
 *   D  DOS COMPROBANTES: el detalle muestra facturado y pendiente por línea, los comprobantes (el más reciente primero) y el papel
 *      (sin_comprobante → en_parte → completa → en_parte al anular uno).
 *   T  EL MISMO TOKEN: con la misma huella devuelve lo mismo y no duplica; con otra, error.
 *   R  EL MISMO PAPEL: vigente repetido, error; anulado, se vuelve a registrar.
 *   O  LA ORDEN: «Por repartir», anulada o inexistente, error.
 *   E  LA ORDEN CON COMPROBANTE: no se edita (ni con el comprobante anulado) y no se anula mientras el comprobante esté vigente.
 *   N  ANULAR EL COMPROBANTE: con solo Órdenes de compra, el de una orden sí; una factura suelta, no.
 *   S  LA FORMA: una sola función, security definer, authenticated la ejecuta y anon no; la respuesta interna no se ejecuta desde fuera.
 *
 * USO
 *   node scripts/pruebas/ordenes_compra_comprobante.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/ordenes_compra_comprobante.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/ordenes_compra_comprobante.mjs --sin-migracion                → sin cargar la migración: contra una base sin el
 *                                                                                        cambio, la prueba tiene que FALLAR
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
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261012211000_compras_comprobante_de_orden.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Una terminal de prueba (se crea dentro de cada caso y se va con el ROLLBACK).
const T_VENTAS = "33333333-3333-4333-8333-0000000000c7";

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
const SIN_ENCABEZADOS = `select set_config('request.headers', '', true) \\g /dev/null\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
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
-- La llamada a la función, que devuelve su respuesta (texto JSON) o «<sqlstate>|<mensaje>».
create function pg_temp.registra(p_orden uuid, p_tipo text, p_serie text, p_numero text, p_lineas jsonb, p_emision date, p_condicion text,
  p_vence date, p_suma_igv boolean, p_total numeric, p_pago jsonb, p_nota text, p_token uuid) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  return retail.registrar_comprobante_orden(p_orden, p_tipo, p_serie, p_numero, p_lineas, p_emision, p_condicion, p_vence, p_suma_igv,
    p_total, p_pago, p_nota, p_token)::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.registra(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid) to authenticated;

-- Datos propios de la prueba.
insert into retail.proveedores (nombre) values ('Proveedor Comprobante OC Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Comprobante OC') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Comprobante OC', 'indumentaria') returning id as cat \\gset
insert into retail.categorias (nombre, familia, activo) values ('Inactiva Comprobante OC', 'indumentaria', false) returning id as cat_off \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Como en producción: el responsable obligatorio encendido (sin él, cualquiera firmaría sin combo y la clave no probaría nada).
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
-- O1 a Trujillo, entrega en 7 días: línea 1 = 10 «Polo básico» a S/ 25.50; línea 2 = 4 a S/ 100 con 10 % (sin descripción).
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Polo básico', 10, 25.50) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct)
  values (:'o1', 2, :'cat', :'marca', 4, 100, 40, 10) returning id as l2 \\gset
-- O2 «Por repartir» y O3 anulada.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', null, :'felipe_p') returning id as o2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o2', 1, :'cat', :'marca', 3, 50) returning id as l_o2 \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'tru', :'felipe_p', 'anulada', :'felipe_p', now(), 'Prueba') returning id as o3 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o3', 1, :'cat', :'marca', 2, 10);
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba comprobante OC') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;
// La terminal de ventas de Trujillo, con el módulo en su rol (para llegar al candado del responsable y no al del módulo).
const TERMINAL = `
reset role;
insert into auth.users (id, aud, role, email) values ('${T_VENTAS}', 'authenticated', 'authenticated', 'oc-comprobante-terminal@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'tru', 'Terminal comprobante OC Prueba', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'ordenes_compra') on conflict do nothing;
`;

// Una línea de \`p_lineas\` (valores en SQL) y la lista.
const L = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const LINEAS = (...ls) => `jsonb_build_array(${ls.map(L).join(", ")})`;
// La boleta de siempre: lo pedido completo, la línea 2 al costo neto de la orden (S/ 90) y con números como TEXTO, como puede
// mandarlos la pantalla. 10 × 25.50 + 4 × 90 = S/ 615.00.
const BOLETA = LINEAS(
  { orden_compra_item_id: ":'l1'", cantidad: 10, costo_unitario: "25.50", precio_venta_sugerido: "59.90" },
  { orden_compra_item_id: ":'l2'", cantidad: "'4'", costo_unitario: "'90.00'" },
);
const UNA = (cantidad, costo = "25.50") => LINEAS({ orden_compra_item_id: ":'l1'", cantidad, costo_unitario: costo });
// La llamada con lo de siempre (boleta B001 de O1, al crédito, vence en 30 días) y lo que cambie cada caso (todo en SQL).
const registra = ({
  orden = ":'o1'", tipo = "'boleta'", serie = "'B001'", numero = "'100'", lineas = BOLETA, emision = "null", condicion = "'credito'",
  vence = "retail.fn_hoy_lima() + 30", sumaIgv = "true", total = "null", pago = "null", nota = "null", token = "null",
} = {}) =>
  `pg_temp.registra(${orden}, ${tipo}, ${serie}, ${numero}, ${lineas}, (${emision})::date, ${condicion}, (${vence})::date, ${sumaIgv}, ` +
  `(${total})::numeric, (${pago})::jsonb, (${nota})::text, (${token})::uuid)`;
const id = (v) => `(:'${v}'::jsonb ->> 'compra_id')::uuid`;
const anular = (compraSql, motivo) => `pg_temp.intento(format('select retail.anular_compra(%L, %L)', ${compraSql}, '${motivo}'))`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    // Al final se disparan los candados diferidos (el reparto cuadra, la gestora con parte, el pago por tienda): si algo quedó mal
    // guardado, el caso falla aquí.
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

const SIN_MODULO = "42501|Registrar el comprobante de una orden necesita el módulo «Órdenes de compra» en tu rol";
const ELIGE = "42501|Elige quién hace esta operación";

// P. PERMISOS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 con solo «Órdenes de compra», sin ser líder, registra el comprobante",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${registra()} as r \\gset
   select (:'r'::jsonb ->> 'documento') || ':' || (:'r'::jsonb ->> 'total');`,
  "B001-100:615.00",
);
for (const [modulo, nombre] of [["existencias", "sin el módulo"], ["facturas_compra", "con solo Facturas de proveedor"]]) {
  caso(
    `P2 ${nombre}: 42501 que nombra «Órdenes de compra»`,
    `${rolDeMicaela(modulo)}
     ${como(MICAELA)}
     ${SIN_COMBO}
     select ${registra()};`,
    SIN_MODULO,
  );
}
caso(
  "P3 quien no es Admin firma sin combo con «orden_compra_comprobante» (sin la clave le pide el combo); el Admin firma igual",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   select ${registra({ numero: "'101'" })} as sin_clave \\gset
   ${SIN_COMBO}
   select ${registra({ numero: "'102'" })} as con_clave \\gset
   ${como(FELIPE)}
   ${SIN_ENCABEZADOS}
   select ${registra({ numero: "'103'" })} as felipe \\gset
   reset role;
   select :'sin_clave' || ',' || (select (c.usuario_id = :'micaela_p') from retail.compras c where c.id = ${id("con_clave")})
     || ',' || (select (c.usuario_id = :'felipe_p') from retail.compras c where c.id = ${id("felipe")});`,
  `${ELIGE},true,true`,
);
caso(
  "P4 una terminal no registra sin elegir a alguien: ni mandando la clave (un comprobante siempre tiene quién) ni sin nada",
  `${TERMINAL}
   ${como(T_VENTAS)}
   select ${registra({ numero: "'104'" })} as sin_nada \\gset
   ${SIN_COMBO}
   select ${registra({ numero: "'105'" })} as con_clave \\gset
   reset role;
   select :'sin_nada' || ' / ' || :'con_clave' || ' / ' || (select count(*) from retail.compras where orden_compra_id = :'o1');`,
  `${ELIGE} / ${ELIGE} / 0`,
);

// B. BOLETA AL CRÉDITO ----------------------------------------------------------------------------------------------------
caso(
  "B1 boleta al crédito: total exacto, gestora = «Llega a», la orden y cada línea pedida, líneas sin prenda, todo a la gestora, nada más",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select gen_random_uuid() as tok \\gset
   select ${registra({ serie: "' b001 '", numero: "' 123 '", token: ":'tok'" })} as r \\gset
   reset role;
   set constraints all immediate;
   select concat_ws(' / ',
     (:'r'::jsonb ->> 'documento') || ':' || (:'r'::jsonb ->> 'total') || ':' || (:'r'::jsonb ->> 'saldo') || ':'
       || (:'r'::jsonb -> 'avisos')::text || ':' || (${id("r")} = c.id),
     c.tipo || ':' || c.condicion || ':' || c.subtotal || '+' || c.igv || '=' || c.total || ':' || (c.fecha_vencimiento = retail.fn_hoy_lima() + 30)
       || ':' || (c.fecha_emision = retail.fn_hoy_lima()),
     (c.ubicacion_gestion_id = :'tru') || ':' || (c.orden_compra_id = :'o1') || ':' || c.naturaleza || ':'
       || (c.fecha_estimada_llegada = retail.fn_hoy_lima() + 7) || ':' || (c.usuario_id = :'micaela_p') || ':' || (c.token_cliente = :'tok')
       || ':' || (length(c.huella_envio) = 32) || ':' || c.facturado_cantidad || ':' || c.estado_recepcion || ':' || c.estado_pago,
     (select string_agg(case ci.orden_compra_item_id when :'l1' then 'l1' when :'l2' then 'l2' else 'otra' end
                        || ':' || coalesce(ci.producto_id::text, 'sin prenda') || ':' || coalesce(ci.variante_id::text, '-')
                        || ':' || (ci.categoria_id = :'cat' and ci.marca_id = :'marca') || ':' || coalesce(ci.descripcion, '-')
                        || ':' || ci.cantidad || 'x' || ci.costo_unitario || ':' || coalesce(ci.precio_venta_sugerido::text, '-')
                        || ':' || (select string_agg(d.cantidad || '@' || case when d.ubicacion_id = :'tru' then 'tru' else 'otra' end, ',')
                                     from retail.compra_item_destinos d where d.compra_item_id = ci.id),
                        ' ' order by ci.cantidad desc)
        from retail.compra_items ci where ci.compra_id = c.id),
     (select count(*) from retail.compra_pagos g where g.compra_id = c.id) || ' pagos',
     (select count(*) from retail.movimientos m join retail.compra_items ci on ci.id = m.compra_item_id where ci.compra_id = c.id) || ' movimientos',
     (select count(*) from retail.actividad a where a.accion = 'orden_compra_comprobante' and a.registro_id = :'o1'
         and a.descripcion like 'registró la boleta B001-123 de la OC-% (Proveedor Comprobante OC Prueba)') || ' en Actividad')
   from retail.compras c where c.id = ${id("r")};`,
  "B001-123:615.00:615.00:[]:true / boleta:credito:615.00+0.00=615.00:true:true / " +
    "true:true:mercaderia:true:true:true:true:14:sin_recibir:pendiente / " +
    "l1:sin prenda:-:true:Polo básico:10x25.50:59.90:10@tru l2:sin prenda:-:true:-:4x90.00:-:4@tru / 0 pagos / 0 movimientos / 1 en Actividad",
);

// F. IGV Y TOTAL ----------------------------------------------------------------------------------------------------------
// 3 × S/ 33.33 = S/ 99.99; el 18 % redondeado es S/ 18.00 (17.9982): S/ 117.99. Tolerancia con 1 línea y 3 unidades: 0.038.
const TRES = UNA(3, "33.33");
const SUMAS = (v) => `(select c.tipo || ':' || c.subtotal || '+' || c.igv || '=' || c.total from retail.compras c where c.id = ${id(v)})`;
caso(
  "F1 factura que suma el IGV, el total impreso dentro de la tolerancia (y fuera, no), factura sin IGV, y boleta y nota sin IGV",
  `${como(FELIPE)}
   select ${registra({ tipo: "'factura'", serie: "'F001'", numero: "'1'", lineas: TRES })} as a \\gset
   select ${registra({ tipo: "'factura'", serie: "'F001'", numero: "'2'", lineas: TRES, total: "118.00" })} as b \\gset
   select ${registra({ tipo: "'factura'", serie: "'F001'", numero: "'3'", lineas: TRES, total: "120" })} as c \\gset
   select ${registra({ tipo: "'factura'", serie: "'F001'", numero: "'4'", lineas: TRES, sumaIgv: "false" })} as d \\gset
   select ${registra({ tipo: "'boleta'", serie: "'B001'", numero: "'5'", lineas: TRES, total: "100" })} as e \\gset
   select ${registra({ tipo: "'nota_venta'", serie: "'NV01'", numero: "'6'", lineas: TRES, total: "99.99" })} as f \\gset
   reset role;
   select concat_ws(' / ', ${SUMAS("a")}, ${SUMAS("b")}, :'c', ${SUMAS("d")}, :'e', ${SUMAS("f")});`,
  "factura:99.99+18.00=117.99 / factura:99.99+18.01=118.00 / " +
    "P0001|El total del comprobante (S/ 120) no cuadra con sus líneas (S/ 117.99): revisa los costos / factura:99.99+0.00=99.99 / " +
    "P0001|Sin IGV, el total tiene que ser la suma de las líneas (S/ 99.99); llegó S/ 100 / nota_venta:99.99+0.00=99.99",
);

// C. CONTADO --------------------------------------------------------------------------------------------------------------
caso(
  "C1 al contado con solo «Órdenes de compra» (sin Por pagar): el pago de la empresa, sin tienda, con su cuenta, y suma el total",
  `insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco Comprobante OC Prueba', 'banco', '104') returning id as banco \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${registra({ condicion: "'contado'", vence: "null", pago: `jsonb_build_array(jsonb_build_object('monto', 615, 'metodo', 'transferencia', 'referencia', 'OP-77', 'cuenta_id', :'banco'))` })} as r \\gset
   reset role;
   set constraints all immediate;
   select concat_ws(' / ',
     (:'r'::jsonb ->> 'total') || ':' || (:'r'::jsonb ->> 'saldo'),
     (select c.condicion || ':' || coalesce(c.fecha_vencimiento::text, 'sin vencimiento') || ':' || c.pagado || ':' || c.saldo || ':' || c.estado_pago
        from retail.compras c where c.id = ${id("r")}),
     (select string_agg(g.monto || ':' || g.metodo || ':' || coalesce(g.ubicacion_id::text, 'sin tienda') || ':' || (g.cuenta_dinero_id = :'banco')
                        || ':' || (g.usuario_id = :'micaela_p') || ':' || g.referencia || ':' || (g.fecha = retail.fn_hoy_lima()), ',')
        from retail.compra_pagos g where g.compra_id = ${id("r")}));`,
  "615.00:0.00 / contado:sin vencimiento:615.00:0.00:pagada / 615.00:transferencia:sin tienda:true:true:OP-77:true",
);
const PAGO = (monto, metodo = "transferencia") => `jsonb_build_array(jsonb_build_object('monto', ${monto}, 'metodo', '${metodo}'))`;
caso(
  "C2 contado sin pago, pago que no suma, pago al crédito, saldo a favor que no alcanza, crédito sin vencimiento o vencido antes de emitir",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${registra({ numero: "'201'", condicion: "'contado'", vence: "null" })},
     ${registra({ numero: "'202'", condicion: "'contado'", vence: "null", pago: PAGO(600) })},
     ${registra({ numero: "'203'", pago: PAGO(100) })},
     ${registra({ numero: "'204'", condicion: "'contado'", vence: "null", pago: PAGO(615, "saldo_a_favor") })},
     ${registra({ numero: "'205'", vence: "null" })},
     ${registra({ numero: "'206'", vence: "retail.fn_hoy_lima() - 1" })});`,
  "P0001|Al contado, el comprobante se registra con su pago / " +
    "P0001|Al contado, el pago tiene que ser el total del comprobante (S/ 615.00); suma S/ 600 / " +
    "P0001|Al crédito, el comprobante se registra sin pago: se paga después, desde Por pagar / " +
    "P0001|El saldo a favor con este proveedor es S/ 0.00 y se intenta usar S/ 615 / " +
    "P0001|Al crédito, elige cuándo vence: desde la fecha de emisión en adelante / " +
    "P0001|Al crédito, elige cuándo vence: desde la fecha de emisión en adelante",
);

// A. AVISOS ---------------------------------------------------------------------------------------------------------------
const AVISOS = (v) => `jsonb_array_elements(:'${v}'::jsonb -> 'avisos') with ordinality x(a, o)`;
caso(
  "A1 «de más» y «fuera de la orden» se avisan con su forma exacta y NO bloquean: el comprobante queda guardado",
  `${como(FELIPE)}
   select ${registra({ numero: "'300'", lineas: LINEAS(
     { orden_compra_item_id: ":'l1'", cantidad: 12, costo_unitario: "25.50" },
     { categoria_id: ":'cat'", marca_id: ":'marca'", descripcion: "'Short'", cantidad: 2, costo_unitario: 15 }) })} as r \\gset
   reset role;
   select concat_ws(' / ',
     (select string_agg((a ->> 'tipo') || '{' || (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(a) k) || '}', ' ' order by o)
        from ${AVISOS("r")}),
     (select string_agg((a ->> 'tipo') || ':' || coalesce(a ->> 'posicion', '-') || ':' || (a ->> 'descripcion') || ':' || coalesce(a ->> 'pedido', '-')
                        || ':' || coalesce(a ->> 'facturado_antes', '-') || ':' || (a ->> 'esta_vez') || ':'
                        || coalesce(((a ->> 'orden_compra_item_id') = :'l1')::text, '-'), ' | ' order by o)
        from ${AVISOS("r")}),
     (:'r'::jsonb ->> 'total'),
     (select count(*) from retail.compra_items ci where ci.compra_id = ${id("r")} and ci.orden_compra_item_id is null and ci.producto_id is null
         and ci.categoria_id = :'cat' and ci.marca_id = :'marca' and ci.descripcion = 'Short') || ' fuera');`,
  "de_mas{descripcion,esta_vez,facturado_antes,orden_compra_item_id,pedido,posicion,tipo} fuera_de_orden{descripcion,esta_vez,tipo} / " +
    "de_mas:1:Polos Comprobante OC · Marca Comprobante OC · Polo básico:10:0:12:true | " +
    "fuera_de_orden:-:Polos Comprobante OC · Marca Comprobante OC · Short:-:-:2:- / 336.00 / 1 fuera",
);
caso(
  "A2 lo que no se acepta: categoría inactiva, sin marca, línea de otra orden, cantidad o costo raros, sin líneas, dato ilegible, y el papel",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${registra({ numero: "'301'", lineas: LINEAS({ orden_compra_item_id: ":'l1'", cantidad: 1, costo_unitario: 1 }, { categoria_id: ":'cat_off'", marca_id: ":'marca'", cantidad: 1, costo_unitario: 1 }) })},
     ${registra({ numero: "'302'", lineas: LINEAS({ categoria_id: ":'cat'", cantidad: 1, costo_unitario: 1 }) })},
     ${registra({ numero: "'303'", lineas: LINEAS({ orden_compra_item_id: ":'l_o2'", cantidad: 1, costo_unitario: 1 }) })},
     ${registra({ numero: "'304'", lineas: UNA("1.5", 1) })},
     ${registra({ numero: "'305'", lineas: UNA(1, "10.555") })},
     ${registra({ numero: "'306'", lineas: LINEAS({ orden_compra_item_id: ":'l1'", cantidad: 1, costo_unitario: 1, precio_venta_sugerido: -1 }) })},
     ${registra({ numero: "'307'", lineas: "'[]'" })},
     ${registra({ numero: "'308'", lineas: LINEAS({ orden_compra_item_id: "'no-es-uuid'", cantidad: 1, costo_unitario: 1 }) })},
     ${registra({ numero: "'309'", tipo: "'recibo'" })},
     ${registra({ numero: "' '" })},
     replace(${registra({ numero: "'310'", emision: "retail.fn_hoy_lima() + 1" })}, to_char(retail.fn_hoy_lima(), 'DD/MM/YYYY'), 'HOY'));`,
  [
    "P0001|La línea 2 necesita una categoría activa",
    "P0001|La línea 1 necesita una marca activa",
    "P0001|La línea 1 no es de esta orden: recarga la pantalla",
    "P0001|La cantidad de la línea 1 va de 1 a 99 999 unidades, sin decimales",
    "P0001|El costo de la línea 1 va de S/ 0 a S/ 99 999.99, con hasta dos decimales",
    "P0001|El precio de venta sugerido de la línea 1 va de S/ 0 a S/ 99 999.99, con hasta dos decimales",
    "P0001|Agrega al menos una línea al comprobante",
    "P0001|La línea 1 tiene un número o un dato que no se entiende",
    "P0001|Elige si el comprobante es boleta, nota de venta o factura",
    "P0001|Escribe el número del comprobante",
    "P0001|La fecha de emisión no puede ser futura: hoy es HOY",
  ].join(" / "),
);

// D. DOS COMPROBANTES DE LA MISMA ORDEN -------------------------------------------------------------------------------------
// Por línea: «posición:facturado/pendiente:id»; luego el papel y los comprobantes en el orden en que los da el detalle.
const DETALLE = (d) => `(
  (select string_agg((l ->> 'posicion') || ':' || (l ->> 'facturado') || '/' || (l ->> 'pendiente') || ':'
                     || ((l ->> 'id') = case (l ->> 'posicion') when '1' then :'l1' else :'l2' end), ' ' order by (l ->> 'posicion')::int)
     from jsonb_array_elements(:'${d}'::jsonb -> 'lineas') l)
  || ' ' || (:'${d}'::jsonb ->> 'papel') || ' '
  || coalesce((select string_agg((c ->> 'documento') || ':' || (c ->> 'estado'), ',' order by o)
                 from jsonb_array_elements(:'${d}'::jsonb -> 'comprobantes') with ordinality x(c, o)), '-'))`;
caso(
  "D1 dos comprobantes: facturado y pendiente por línea, el papel pasa a en_parte y a completa, el más reciente primero; uno más avisa «de más»; anular uno lo devuelve a en_parte",
  `${como(FELIPE)}
   select retail.fn_orden_compra_detalle(:'o1') as d0 \\gset
   select ${registra({ numero: "'401'", lineas: UNA(6) })} as r1 \\gset
   reset role;
   update retail.compras set created_at = created_at - interval '1 hour' where id = ${id("r1")};
   ${como(FELIPE)}
   select retail.fn_orden_compra_detalle(:'o1') as d1 \\gset
   select ${registra({ numero: "'402'", lineas: LINEAS(
     { orden_compra_item_id: ":'l1'", cantidad: 4, costo_unitario: "25.50" },
     { orden_compra_item_id: ":'l2'", cantidad: 3, costo_unitario: "90.00" },
     { orden_compra_item_id: ":'l2'", cantidad: 1, costo_unitario: "90.01" }) })} as r2 \\gset
   select retail.fn_orden_compra_detalle(:'o1') as d2 \\gset
   select ${registra({ numero: "'403'", lineas: UNA(1) })} as r3 \\gset
   select ${anular(`:'r1'::jsonb ->> 'compra_id'`, "Prueba")} as anula \\gset
   select retail.fn_orden_compra_detalle(:'o1') as d3 \\gset
   select concat_ws(' / ', ${DETALLE("d0")}, ${DETALLE("d1")}, ${DETALLE("d2")},
     (:'r2'::jsonb -> 'avisos')::text,
     (select string_agg((a ->> 'tipo') || ':' || (a ->> 'pedido') || ':' || (a ->> 'facturado_antes') || ':' || (a ->> 'esta_vez'), ',') from ${AVISOS("r3")}),
     :'anula',
     (select string_agg((l ->> 'posicion') || ':' || (l ->> 'facturado') || '/' || (l ->> 'pendiente'), ' ' order by (l ->> 'posicion')::int)
        from jsonb_array_elements(:'d3'::jsonb -> 'lineas') l) || ' ' || (:'d3'::jsonb ->> 'papel'),
     (select string_agg((c ->> 'documento') || ':' || (c ->> 'estado'), ',' order by c ->> 'documento') from jsonb_array_elements(:'d3'::jsonb -> 'comprobantes') c)
       || ' último ' || (:'d3'::jsonb -> 'comprobantes' -> 2 ->> 'documento'),
     (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(:'d3'::jsonb -> 'comprobantes' -> 0) k),
     (select (c ->> 'total') || ':' || (c ->> 'saldo') || ':' || (c ->> 'tipo') || ':' || (c ->> 'condicion') || ':' || (c ->> 'estado_pago')
        from jsonb_array_elements(:'d3'::jsonb -> 'comprobantes') c where c ->> 'documento' = 'B001-402'));`,
  [
    "1:0/10:true 2:0/4:true sin_comprobante -",
    "1:6/4:true 2:0/4:true en_parte B001-401:vigente",
    "1:10/0:true 2:4/0:true completa B001-402:vigente,B001-401:vigente",
    "[]",
    "de_mas:10:10:1",
    "SIN_ERROR",
    "1:5/5 2:4/0 en_parte",
    "B001-401:anulada,B001-402:vigente,B001-403:vigente último B001-401",
    "condicion,documento,estado,estado_pago,fecha_emision,id,saldo,tipo,total",
    "462.01:462.01:boleta:credito:pendiente",
  ].join(" / "),
);

// T. EL MISMO TOKEN -------------------------------------------------------------------------------------------------------
caso(
  "T1 el mismo token con la misma huella devuelve lo mismo y no duplica; con otros datos, error",
  `${como(FELIPE)}
   select gen_random_uuid() as tok \\gset
   select ${registra({ numero: "'500'", token: ":'tok'" })} as r1 \\gset
   select ${registra({ numero: "'500'", token: ":'tok'" })} as r2 \\gset
   select ${registra({ numero: "'501'", token: ":'tok'" })} as r3 \\gset
   reset role;
   select (:'r1' = :'r2') || ',' || (select count(*) from retail.compras where token_cliente = :'tok') || ',' || :'r3';`,
  "true,1,P0001|Ese envío ya se guardó con otros datos: recarga la pantalla",
);

// R. EL MISMO PAPEL -------------------------------------------------------------------------------------------------------
caso(
  "R1 el mismo papel vigente (aunque se escriba distinto) no entra dos veces; anulado, se vuelve a registrar",
  `${como(FELIPE)}
   select ${registra({ serie: "'B002'", numero: "'77'" })} as r1 \\gset
   select ${registra({ serie: "' b002'", numero: "'77 '" })} as r2 \\gset
   select ${anular(`:'r1'::jsonb ->> 'compra_id'`, "Número mal tipeado")} as anula \\gset
   select ${registra({ serie: "'B002'", numero: "'77'" })} as r3 \\gset
   reset role;
   select :'r2' || ',' || :'anula' || ',' || (:'r3'::jsonb ->> 'documento') || ','
     || (select count(*) filter (where estado = 'vigente') || '/' || count(*) from retail.compras
          where proveedor_id = :'prov' and serie = 'B002' and numero = '77');`,
  "P0001|Ese comprobante ya está registrado,SIN_ERROR,B002-77,1/2",
);

// O. LA ORDEN -------------------------------------------------------------------------------------------------------------
caso(
  "O1 una orden «Por repartir», anulada o que no existe no registra comprobante",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${registra({ orden: ":'o2'", lineas: LINEAS({ orden_compra_item_id: ":'l_o2'", cantidad: 3, costo_unitario: 50 }) })},
     ${registra({ orden: ":'o3'" })},
     ${registra({ orden: "gen_random_uuid()" })},
     ${registra({ orden: "null" })});`,
  "P0001|Esta orden es «Por repartir»: su comprobante todavía no se puede registrar / " +
    "P0001|Esta orden está anulada: ya no se le registra comprobante / P0001|Esa orden de compra no existe / P0001|Esa orden de compra no existe",
);

// E. LA ORDEN CON COMPROBANTE ---------------------------------------------------------------------------------------------
const EDITA = `pg_temp.intento(format('select * from retail.editar_orden_compra(%L, %s, %L, %L, %L, null, %L::jsonb)', :'o1', :'v', :'prov', :'tru',
  retail.fn_hoy_lima() + 7, jsonb_build_array(jsonb_build_object('categoria_id', :'cat', 'marca_id', :'marca', 'cantidad', 10, 'precio_unitario', 25.50))::text))`;
const ANULA_ORDEN = `pg_temp.intento(format('select * from retail.anular_orden_compra(%L, %s, %L)', :'o1', :'v', 'Ya no va'))`;
caso(
  "E1 la orden con comprobante no se edita (tampoco con el comprobante anulado) y no se anula mientras el comprobante esté vigente",
  `select version as v from retail.ordenes_compra where id = :'o1' \\gset
   ${como(FELIPE)}
   select ${registra({ numero: "'600'" })} as r \\gset
   select ${EDITA} as edita1 \\gset
   select ${ANULA_ORDEN} as anula_orden1 \\gset
   select ${anular(`:'r'::jsonb ->> 'compra_id'`, "Papel mal")} as anula_compra \\gset
   select ${EDITA} as edita2 \\gset
   select ${ANULA_ORDEN} as anula_orden2 \\gset
   reset role;
   select concat_ws(' / ', :'edita1', :'anula_orden1', :'anula_compra', :'edita2', :'anula_orden2',
     (select estado from retail.ordenes_compra where id = :'o1'));`,
  "P0001|Esta orden ya tiene comprobante: no se edita. Si el papel está mal, anúlalo y regístralo de nuevo / " +
    "P0001|Esta orden tiene comprobante vigente (B001-600): anula primero el comprobante y después la orden / SIN_ERROR / " +
    "P0001|Esta orden ya tiene comprobante: no se edita. Si el papel está mal, anúlalo y regístralo de nuevo / SIN_ERROR / anulada",
);

// N. ANULAR EL COMPROBANTE CON SOLO ÓRDENES DE COMPRA -----------------------------------------------------------------------
caso(
  "N1 con solo «Órdenes de compra» se anula el comprobante de una orden; una factura que no sale de una orden, no (42501)",
  `${como(FELIPE)}
   select ${registra({ numero: "'700'" })} as r \\gset
   reset role;
   select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
   select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
   set local request.jwt.claim.sub = '${FELIPE}';
   set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
   select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'tru',
     jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', 50)),
     p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as suelta \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${anular(`:'r'::jsonb ->> 'compra_id'`, "El proveedor cambió el papel")} as a1 \\gset
   select ${anular(`:'suelta'`, "No es de una orden")} as a2 \\gset
   reset role;
   select :'a1' || ',' || (select c.estado || ':' || (c.anulada_por = :'micaela_p') from retail.compras c where c.id = ${id("r")})
     || ',' || :'a2' || ',' || (select estado from retail.compras where id = :'suelta');`,
  "SIN_ERROR,anulada:true,42501|Anular un comprobante de compra necesita el módulo Facturas de compra en tu rol,vigente",
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------
const FIRMA = "retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)";
caso(
  "S1 una sola función, security definer, authenticated la ejecuta y anon no; la respuesta interna no; la clave del combo está",
  `select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'registrar_comprobante_orden'),
     (select p.prosecdef from pg_proc p where p.oid = '${FIRMA}'::regprocedure),
     has_function_privilege('authenticated', '${FIRMA}', 'execute'),
     has_function_privilege('anon', '${FIRMA}', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_comprobante_orden_resultado(uuid,boolean)', 'execute'),
     (select count(*) from retail.acciones_sin_responsable where clave = 'orden_compra_comprobante'),
     (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute'), ' ' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('editar_orden_compra', 'anular_orden_compra', 'anular_compra', 'fn_orden_compra_detalle')));`,
  "1,t,t,f,f,1,anular_compra:true anular_orden_compra:true editar_orden_compra:true fn_orden_compra_detalle:true",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
