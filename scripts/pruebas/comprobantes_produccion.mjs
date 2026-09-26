/**
 * Prueba de los comprobantes de PRODUCCIÓN — ADR-0133, F4b (decisión D-H).
 * Migración 20260921100000: `comprobantes_produccion` (+ `_items`, `_pagos`),
 * `registrar_comprobante_produccion`, `anular_comprobante_produccion` y `fn_comprobantes_produccion`.
 *
 * Mismas reglas duras que la factura de Compras (ADR-0035), sobre su propio libro. Qué garantiza
 * (cada caso termina en ROLLBACK, sin rastro en el Postgres local compartido):
 *   1. Crédito con una línea de insumo y un concepto libre: subtotal, IGV 18 % y total salen de las líneas; el saldo se DERIVA.
 *   2. Contado sin pago se rechaza; con un pago distinto del total, también; con dos medios que suman el total, pasa y queda pagada.
 *   3. Crédito sin vencimiento se rechaza; crédito vencido con saldo sale «vencido».
 *   4. Serie-número repetido del mismo proveedor se rechaza; el mismo token devuelve el comprobante que ya existe.
 *   5. El total impreso se cuadra con tolerancia de redondeo, un descuadre real se rechaza; una boleta no lleva IGV.
 *   6. Líneas inválidas (sin insumo ni concepto, cantidad 0, insumo inexistente) y fechas imposibles se rechazan.
 *   7. Anular exige motivo y no se puede con pagos; se anula, jamás se borra.
 *   8. Quien no es líder no registra, no anula, no ve las tablas ni la lista; nadie escribe directo.
 *   9. Líneas y pagos son un libro: no se editan ni se borran.
 *
 * USO
 *   pnpm pruebas:comprobantes-produccion   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const CAMBIA_A = (uid) => `set local request.jwt.claim.sub = '${uid}';\n`;
const AUTENTICADO = "set local role authenticated;\n";

/** Un proveedor de Producción y un insumo (tela) listos. `:prov` y `:ins` quedan disponibles. */
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select retail.guardar_proveedor_produccion(null, 'Textiles Prueba SAC', 'tela') as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-CMP-LINO', 'Lino de prueba', 'tela', 'metro') returning id as ins \\gset
`;

/** Dos líneas: 100 m de lino a S/ 20 (2000) y un flete de 1 × S/ 100 → subtotal 2100, IGV 378, total 2478. */
const ITEMS = `jsonb_build_array(
  jsonb_build_object('insumo_id', :'ins', 'cantidad', 100, 'costo_unitario', 20),
  jsonb_build_object('descripcion', 'Flete', 'cantidad', 1, 'costo_unitario', 100))`;


const CASOS = [
  {
    nombre: "1. crédito: subtotal, IGV y total salen de las líneas y el saldo se deriva",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '100', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30) as cid \\gset
select subtotal, igv, total, saldo, estado_pago, vencido, lineas from retail.fn_comprobantes_produccion() where id = :'cid';
rollback;`,
    verificar: (c) => Number(c[0]) === 2100 && Number(c[1]) === 378 && Number(c[2]) === 2478 && Number(c[3]) === 2478 && c[4] === "pendiente" && c[5] === "f" && Number(c[6]) === 2,
  },
  {
    nombre: "2a. contado sin pago se rechaza",
    tipo: "error",
    contiene: "al contado se registra con su pago",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '101', 'contado', ${ITEMS});
rollback;`,
  },
  {
    nombre: "2b. contado con un pago distinto del total se rechaza",
    tipo: "error",
    contiene: "Al contado el pago debe ser el total",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '102', 'contado', ${ITEMS}, p_pago => '{"metodo":"transferencia","monto":1000}'::jsonb);
rollback;`,
  },
  {
    nombre: "2c. contado con dos medios que suman el total: pasa y queda pagada, sin vencimiento",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '103', 'contado', ${ITEMS},
  p_pago => '[{"metodo":"transferencia","monto":2000,"referencia":"OP-1"},{"metodo":"efectivo","monto":478}]'::jsonb) as cid \\gset
select saldo, estado_pago, pagado, (select count(*) from retail.comprobantes_produccion_pagos where comprobante_id = :'cid'), fecha_vencimiento is null from retail.fn_comprobantes_produccion() where id = :'cid';
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && c[1] === "pagada" && Number(c[2]) === 2478 && Number(c[3]) === 2 && c[4] === "t",
  },
  {
    nombre: "3a. crédito sin fecha de vencimiento se rechaza",
    tipo: "error",
    contiene: "necesita fecha de vencimiento",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '104', 'credito', ${ITEMS});
rollback;`,
  },
  {
    nombre: "3b. crédito vencido con saldo sale «vencido»",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '105', 'credito', ${ITEMS}, p_fecha_emision => current_date - 40, p_fecha_vencimiento => current_date - 10) as cid \\gset
select vencido, saldo from retail.fn_comprobantes_produccion() where id = :'cid';
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 2478,
  },
  {
    nombre: "4a. serie-número repetido del mismo proveedor se rechaza",
    tipo: "error",
    contiene: "ya está registrado",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'f001', '106', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30) as _a \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '106', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "4b. el mismo token devuelve el comprobante que ya existe, sin duplicar",
    tipo: "exito",
    sql: `${PREPARAR}
select gen_random_uuid() as tok \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '107', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30, p_token => :'tok') as a \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '107', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30, p_token => :'tok') as b \\gset
select :'a' = :'b', (select count(*) from retail.comprobantes_produccion where proveedor_id = :'prov');
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 1,
  },
  {
    nombre: "5a. el total impreso que difiere un centavo de las líneas se acepta y se respeta",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '108', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30, p_total => 2478.01) as cid \\gset
select total, igv, subtotal from retail.comprobantes_produccion where id = :'cid';
rollback;`,
    verificar: (c) => Number(c[0]) === 2478.01 && Number(c[1]) === 378.01 && Number(c[2]) === 2100,
  },
  {
    nombre: "5b. un descuadre real del total se rechaza",
    tipo: "error",
    contiene: "no cuadra con sus líneas",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '109', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30, p_total => 2500);
rollback;`,
  },
  {
    nombre: "5c. una boleta no lleva IGV",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'B001', '110', 'credito', ${ITEMS}, p_tipo => 'boleta', p_fecha_vencimiento => current_date + 30) as cid \\gset
select igv, total from retail.comprobantes_produccion where id = :'cid';
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 2100,
  },
  {
    nombre: "6a. una línea sin insumo ni concepto se rechaza",
    tipo: "error",
    contiene: "elige un insumo del catálogo o escribe qué se compró",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '111', 'credito', '[{"cantidad":1,"costo_unitario":10}]'::jsonb, p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "6b. una cantidad en cero se rechaza",
    tipo: "error",
    contiene: "la cantidad tiene que ser mayor a cero",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '112', 'credito', '[{"descripcion":"Flete","cantidad":0,"costo_unitario":10}]'::jsonb, p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "6c. un insumo que no existe se rechaza",
    tipo: "error",
    contiene: "ese insumo no existe o está archivado",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '113', 'credito', jsonb_build_array(jsonb_build_object('insumo_id', gen_random_uuid(), 'cantidad', 1, 'costo_unitario', 10)), p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "6d. una emisión futura se rechaza",
    tipo: "error",
    contiene: "no puede ser futura",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '114', 'credito', ${ITEMS}, p_fecha_emision => current_date + 3, p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "6e. un pago fechado antes de la emisión se rechaza",
    tipo: "error",
    contiene: "es anterior a la emisión",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '115', 'contado', ${ITEMS}, p_fecha_emision => current_date - 2,
  p_pago => jsonb_build_object('metodo', 'transferencia', 'monto', 2478, 'fecha', (current_date - 5)::text));
rollback;`,
  },
  {
    nombre: "6f. un proveedor que no es de Producción se rechaza",
    tipo: "error",
    contiene: "no existe en el directorio de Producción",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(gen_random_uuid(), 'F001', '116', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "7a. anular sin motivo se rechaza",
    tipo: "error",
    contiene: "necesita un motivo",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '117', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30) as cid \\gset
select retail.anular_comprobante_produccion(:'cid', '  ');
rollback;`,
  },
  {
    nombre: "7b. anular con motivo: queda anulada, con saldo 0, y no se borra",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '118', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30) as cid \\gset
select retail.anular_comprobante_produccion(:'cid', 'Se facturó doble') as _a \\gset
select estado, saldo, estado_pago, (select count(*) from retail.comprobantes_produccion where id = :'cid') from retail.fn_comprobantes_produccion() where id = :'cid';
rollback;`,
    verificar: (c) => c[0] === "anulada" && Number(c[1]) === 0 && c[2] === "anulada" && Number(c[3]) === 1,
  },
  {
    nombre: "7c. un comprobante con pagos no se puede anular",
    tipo: "error",
    contiene: "tiene pagos registrados",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '119', 'contado', ${ITEMS}, p_pago => '{"metodo":"efectivo","monto":2478}'::jsonb) as cid \\gset
select retail.anular_comprobante_produccion(:'cid', 'Error de digitación');
rollback;`,
  },
  {
    nombre: "8a. quien no es líder no puede registrar",
    tipo: "error",
    contiene: "Solo un Líder",
    sql: `${PREPARAR}
${CAMBIA_A(MICAELA)}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '120', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30);
rollback;`,
  },
  {
    nombre: "8b. quien no es líder no puede anular",
    tipo: "error",
    contiene: "Solo un Líder",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '121', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30) as cid \\gset
${CAMBIA_A(MICAELA)}
select retail.anular_comprobante_produccion(:'cid', 'x');
rollback;`,
  },
  {
    nombre: "8c. un colaborador no ve tablas ni lista (RLS real)",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '122', 'contado', ${ITEMS}, p_pago => '{"metodo":"efectivo","monto":2478}'::jsonb) as _a \\gset
${CAMBIA_A(MICAELA)}${AUTENTICADO}
select (select count(*) from retail.comprobantes_produccion), (select count(*) from retail.comprobantes_produccion_items),
       (select count(*) from retail.comprobantes_produccion_pagos), (select count(*) from retail.fn_comprobantes_produccion());
rollback;`,
    verificar: (c) => c.every((x) => Number(x) === 0),
  },
  {
    nombre: "8d. nadie escribe directo en las tablas: solo por las RPC",
    tipo: "error",
    contiene: "permission denied",
    sql: `${PREPARAR}
${AUTENTICADO}
insert into retail.comprobantes_produccion_pagos (comprobante_id, monto, metodo) values (gen_random_uuid(), 10, 'efectivo');
rollback;`,
  },
  {
    nombre: "9a. las líneas no se editan",
    tipo: "error",
    contiene: "no se editan ni se borran",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '123', 'credito', ${ITEMS}, p_fecha_vencimiento => current_date + 30) as cid \\gset
update retail.comprobantes_produccion_items set costo_unitario = 1 where comprobante_id = :'cid';
rollback;`,
  },
  {
    nombre: "9b. los pagos no se borran",
    tipo: "error",
    contiene: "no se editan ni se borran",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '124', 'contado', ${ITEMS}, p_pago => '{"metodo":"efectivo","monto":2478}'::jsonb) as cid \\gset
delete from retail.comprobantes_produccion_pagos where comprobante_id = :'cid';
rollback;`,
  },
];

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "ROLLBACK");
      const columnas = filas[filas.length - 1].split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
