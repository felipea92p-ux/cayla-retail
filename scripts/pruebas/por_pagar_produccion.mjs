/**
 * Prueba de Por pagar de PRODUCCIÓN y del consolidado D-I — ADR-0133, F4c.
 * Migración 20260921110000: `registrar_pago_comprobante_produccion`, `fn_deuda_consolidada`, `fn_igv_credito_fiscal`.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, sin rastro en el Postgres local compartido):
 *   1. Un pago parcial baja el saldo y deja el comprobante «parcial»; el resto con DOS medios lo deja «pagada».
 *   2. Nunca se paga más que el saldo, ni sobre un comprobante ya pagado o anulado.
 *   3. El mismo token no repite el pago (un reintento no cobra dos veces); los medios de un pago comparten grupo.
 *   4. Fechas imposibles (futura, anterior a la emisión), medios desconocidos y montos con 3 decimales se rechazan.
 *   5. Quien no es líder no paga, y las dos lecturas del consolidado le dan cero filas.
 *   6. D-I: la deuda consolidada suma lo que se debe en Compras y en Producción por proveedor, con lo vencido aparte.
 *   7. D-I: el IGV del mes suma los dos libros y resta el de las notas de crédito de Compras.
 *
 * USO
 *   pnpm pruebas:por-pagar-produccion   → necesita el stack local (`npx supabase start`)
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

/** Un proveedor de Producción y un comprobante a crédito de S/ 1180 (1000 + IGV 180). `:cid` queda disponible. */
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select retail.guardar_proveedor_produccion(null, 'Textiles Prueba SAC', 'tela') as prov \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '900', 'credito',
  '[{"descripcion":"Lino","cantidad":100,"costo_unitario":10}]'::jsonb, p_fecha_emision => current_date - 10, p_fecha_vencimiento => current_date + 20) as cid \\gset
`;

const ESTADO = `select saldo, estado_pago, pagado from retail.fn_comprobantes_produccion() where id = :'cid';`;

const CASOS = [
  {
    nombre: "1. un pago parcial baja el saldo; el resto con dos medios lo deja pagada",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":500}]'::jsonb) as _g1 \\gset
select saldo as saldo1, estado_pago as estado1 from retail.fn_comprobantes_produccion() where id = :'cid' \\gset
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":600,"referencia":"OP-9"},{"metodo":"efectivo","monto":80}]'::jsonb) as _g2 \\gset
select :'saldo1', :'estado1', saldo, estado_pago, pagado from retail.fn_comprobantes_produccion() where id = :'cid';
rollback;`,
    verificar: (c) => Number(c[0]) === 680 && c[1] === "parcial" && Number(c[2]) === 0 && c[3] === "pagada" && Number(c[4]) === 1180,
  },
  {
    nombre: "2a. no se paga más que el saldo",
    tipo: "error",
    contiene: "supera el saldo del comprobante (S/ 1180",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":1180.01}]'::jsonb);
rollback;`,
  },
  {
    nombre: "2b. un comprobante ya pagado no admite otro pago",
    tipo: "error",
    contiene: "ya está pagado por completo",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":1180}]'::jsonb) as _a \\gset
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"efectivo","monto":1}]'::jsonb);
rollback;`,
  },
  {
    nombre: "2c. un comprobante anulado no admite pagos",
    tipo: "error",
    contiene: "está anulado",
    sql: `${PREPARAR}
select retail.anular_comprobante_produccion(:'cid', 'Error') as _a \\gset
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":100}]'::jsonb);
rollback;`,
  },
  {
    nombre: "3a. el mismo token no repite el pago",
    tipo: "exito",
    sql: `${PREPARAR}
select gen_random_uuid() as tok \\gset
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"yape","monto":300}]'::jsonb, p_token => :'tok') as a \\gset
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"yape","monto":300}]'::jsonb, p_token => :'tok') as b \\gset
select :'a' = :'b', saldo, (select count(*) from retail.comprobantes_produccion_pagos where comprobante_id = :'cid') from retail.fn_comprobantes_produccion() where id = :'cid';
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 880 && Number(c[2]) === 1,
  },
  {
    nombre: "3b. los medios de un mismo pago comparten grupo",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":400},{"metodo":"efectivo","monto":100}]'::jsonb) as g \\gset
select (select count(*) from retail.comprobantes_produccion_pagos where grupo_id = :'g'), (select count(distinct grupo_id) from retail.comprobantes_produccion_pagos where comprobante_id = :'cid');
rollback;`,
    verificar: (c) => Number(c[0]) === 2 && Number(c[1]) === 1,
  },
  {
    nombre: "4a. una fecha futura se rechaza",
    tipo: "error",
    contiene: "no puede ser futura",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":100}]'::jsonb, current_date + 2);
rollback;`,
  },
  {
    nombre: "4b. una fecha anterior a la emisión se rechaza",
    tipo: "error",
    contiene: "es anterior a la emisión",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":100}]'::jsonb, current_date - 30);
rollback;`,
  },
  {
    nombre: "4c. un medio desconocido se rechaza",
    tipo: "error",
    contiene: "Medio de pago no reconocido",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"cheque","monto":100}]'::jsonb);
rollback;`,
  },
  {
    nombre: "4d. un monto con tres decimales se rechaza",
    tipo: "error",
    contiene: "máximo 2 decimales",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":10.005}]'::jsonb);
rollback;`,
  },
  {
    nombre: "4e. un pago sin ningún medio se rechaza",
    tipo: "error",
    contiene: "al menos un medio",
    sql: `${PREPARAR}
select retail.registrar_pago_comprobante_produccion(:'cid', '[]'::jsonb);
rollback;`,
  },
  {
    nombre: "5a. quien no es líder no puede pagar",
    tipo: "error",
    contiene: "Solo un Líder",
    sql: `${PREPARAR}
${CAMBIA_A(MICAELA)}
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"efectivo","monto":100}]'::jsonb);
rollback;`,
  },
  {
    nombre: "5b. quien no es líder recibe cero filas en las dos lecturas del consolidado",
    tipo: "exito",
    sql: `${PREPARAR}
${CAMBIA_A(MICAELA)}${AUTENTICADO}
select (select count(*) from retail.fn_deuda_consolidada()), (select count(*) from retail.fn_igv_credito_fiscal());
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 0,
  },
  {
    nombre: "6. la deuda consolidada suma Compras y Producción por proveedor, con lo vencido aparte",
    tipo: "exito",
    sql: `${PREPARAR}
insert into retail.proveedores (nombre) values ('Proveedor Compras Prueba') returning id as pc \\gset
insert into retail.compras (proveedor_id, serie, numero, condicion, fecha_emision, fecha_vencimiento, subtotal, igv, total)
  values (:'pc', 'F777', '1', 'credito', current_date - 40, current_date - 5, 500, 90, 590);
select retail.registrar_pago_comprobante_produccion(:'cid', '[{"metodo":"transferencia","monto":180}]'::jsonb) as _g \\gset
select (select saldo from retail.fn_deuda_consolidada() where origen = 'produccion' and proveedor_id = :'prov'),
       (select vencido from retail.fn_deuda_consolidada() where origen = 'produccion' and proveedor_id = :'prov'),
       (select saldo from retail.fn_deuda_consolidada() where origen = 'compras' and proveedor_id = :'pc'),
       (select vencido from retail.fn_deuda_consolidada() where origen = 'compras' and proveedor_id = :'pc');
rollback;`,
    verificar: (c) => Number(c[0]) === 1000 && Number(c[1]) === 0 && Number(c[2]) === 590 && Number(c[3]) === 590,
  },
  {
    nombre: "7. el IGV del mes suma los dos libros y resta el de las notas de crédito de Compras",
    tipo: "exito",
    sql: `begin;
set local request.jwt.claim.sub = '${FELIPE}';
select retail.guardar_proveedor_produccion(null, 'Textiles Prueba SAC', 'tela') as prov \\gset
select igv_compras as c0, igv_produccion as p0, igv_notas_credito as n0, igv_neto as neto0 from retail.fn_igv_credito_fiscal() \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '901', 'credito', '[{"descripcion":"Lino","cantidad":100,"costo_unitario":10}]'::jsonb, p_fecha_vencimiento => current_date + 20) as _cid \\gset
insert into retail.proveedores (nombre) values ('Proveedor Compras Prueba') returning id as pc \\gset
insert into retail.compras (proveedor_id, serie, numero, condicion, fecha_emision, fecha_vencimiento, subtotal, igv, total)
  values (:'pc', 'F778', '1', 'credito', current_date, current_date + 30, 1000, 180, 1180) returning id as cmp \\gset
insert into retail.compra_notas_credito (compra_id, serie_numero, fecha, subtotal, igv, monto, motivo, aplicado)
  values (:'cmp', 'FC01-1', current_date, 100, 18, 118, 'devolucion', 0);
select igv_produccion - :p0, igv_compras - :c0, igv_notas_credito - :n0, igv_neto - :neto0 from retail.fn_igv_credito_fiscal();
rollback;`,
    // Producción suma 180, Compras suma 180, la nota resta 18: el neto sube 180 + 180 − 18 = 342.
    verificar: (c) => Number(c[0]) === 180 && Number(c[1]) === 180 && Number(c[2]) === 18 && Number(c[3]) === 342,
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
