/**
 * Prueba de RECIBIR insumos contra un comprobante de Producción — ADR-0133, F4d.
 * Migración 20260921140000: `recibir_comprobante_produccion`, `fn_lineas_comprobantes_produccion`, el vínculo
 * lote ↔ línea (`insumo_lotes.comprobante_item_id`) y `anular_comprobante_produccion` con mercadería recibida.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, sin rastro en el Postgres local compartido):
 *   1. Recibir una parte abre UN lote con el costo unitario de la línea, el proveedor y el documento, y sube el saldo del insumo.
 *   2. Recibir el resto abre un segundo lote con código propio; lo recibido nunca supera lo facturado.
 *   3. Un concepto (flete, maquila) no abre lote; una línea no aparece dos veces; un código de lote repetido se rechaza.
 *   4. Lo que no llegará se cierra con su motivo y deja la línea sin pendiente; no se cierra más de lo pendiente.
 *   5. El mismo token no repite la recepción; un comprobante anulado no recibe.
 *   6. Solo en el Taller y solo quien opera el Taller: un colaborador del Taller recibe; uno de una tienda no.
 *   7. Quien recibe NO ve importes: la función de líneas no devuelve ninguna columna de dinero y sus tablas siguen cerradas.
 *   8. Con mercadería recibida o líneas cerradas el comprobante no se puede anular; sin ellas, sí.
 *   9. La lista de proveedores suma los lotes recibidos y lo comprado.
 *
 * USO
 *   pnpm pruebas:recibir-comprobante-produccion   → necesita el stack local (`npx supabase start`)
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
/** Micaela pasa a trabajar en el Taller (solo dentro de la transacción de prueba). */
const MICAELA_AL_TALLER = `update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');\n`;

/** Un proveedor, un insumo y un comprobante a crédito con dos líneas: 100 m de lino a S/ 20 y un flete. `:cid`, `:it1` (lino), `:it2` (flete). */
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select retail.guardar_proveedor_produccion(null, 'Textiles Prueba SAC', 'tela') as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-REC-LINO', 'Lino de prueba', 'tela', 'metro') returning id as ins \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '500', 'credito',
  jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', 100, 'costo_unitario', 20), jsonb_build_object('descripcion', 'Flete', 'cantidad', 1, 'costo_unitario', 100)),
  p_fecha_vencimiento => current_date + 30) as cid \\gset
select id as it1 from retail.comprobantes_produccion_items where comprobante_id = :'cid' and insumo_id is not null \\gset
select id as it2 from retail.comprobantes_produccion_items where comprobante_id = :'cid' and insumo_id is null \\gset
`;

const LINEA = (item, cantidad, extra = "") => `jsonb_build_array(jsonb_build_object('item_id', :'${item}', 'cantidad', ${cantidad}${extra}))`;
const PEND = `select pendiente, recibido, cerrado from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid') where item_id = :'it1';`;

const CASOS = [
  {
    nombre: "1. recibir una parte abre UN lote con el costo, el proveedor y el documento de la línea, y sube el saldo",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 60)}) as _r \\gset
select l.cantidad_ingresada, l.costo_unitario, l.documento, l.codigo_lote, l.origen, l.proveedor_id = :'prov', l.comprobante_item_id = :'it1',
  (select sum(case when tipo = 'compra' then cantidad else -cantidad end) from retail.movimientos_insumo where insumo_id = :'ins')
  from retail.insumo_lotes l where l.insumo_id = :'ins';
rollback;`,
    verificar: (c) => Number(c[0]) === 60 && Number(c[1]) === 20 && c[2] === "F001-500" && c[3] === "F001-500" && c[4] === "compra" && c[5] === "t" && c[6] === "t" && Number(c[7]) === 60,
  },
  {
    nombre: "2. recibir el resto abre un segundo lote con su propio código y deja la línea sin pendiente",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 60)}) as _r1 \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 40)}) as _r2 \\gset
select (select count(*) from retail.insumo_lotes where insumo_id = :'ins'), (select string_agg(codigo_lote, ',' order by codigo_lote) from retail.insumo_lotes where insumo_id = :'ins'),
  pendiente, recibido from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid') where item_id = :'it1';
rollback;`,
    verificar: (c) => Number(c[0]) === 2 && c[1] === "F001-500,F001-500/2" && Number(c[2]) === 0 && Number(c[3]) === 100,
  },
  {
    nombre: "2b. no se recibe más de lo que falta por recibir",
    tipo: "error",
    contiene: "solo faltan 40 por recibir y llegó 41",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 60)}) as _r1 \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 41)});
rollback;`,
  },
  {
    nombre: "3a. un concepto (flete) no abre lote",
    tipo: "error",
    contiene: "es un concepto, no un insumo",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it2", 1)});
rollback;`,
  },
  {
    nombre: "3b. una línea repetida en la misma recepción se rechaza",
    tipo: "error",
    contiene: "aparece dos veces",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', jsonb_build_array(jsonb_build_object('item_id', :'it1', 'cantidad', 10), jsonb_build_object('item_id', :'it1', 'cantidad', 10)));
rollback;`,
  },
  {
    nombre: "3c. un código de lote repetido del mismo insumo se rechaza",
    tipo: "error",
    contiene: "Ya hay un lote de ese insumo con el código",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 10, ", 'codigo_lote', 'L-1'")}) as _r1 \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 10, ", 'codigo_lote', 'L-1'")});
rollback;`,
  },
  {
    nombre: "3d. una línea de otro comprobante se rechaza",
    tipo: "error",
    contiene: "no pertenece a este comprobante",
    sql: `${PREPARAR}
select retail.registrar_comprobante_produccion(:'prov', 'F001', '501', 'credito', jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', 5, 'costo_unitario', 1)), p_fecha_vencimiento => current_date + 30) as otro \\gset
select id as it_otro from retail.comprobantes_produccion_items where comprobante_id = :'otro' \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it_otro", 1)});
rollback;`,
  },
  {
    nombre: "4a. lo que no llegará se cierra con su motivo y la línea queda sin pendiente",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 60)}, jsonb_build_array(jsonb_build_object('item_id', :'it1', 'cantidad', 40, 'motivo', 'faltante'))) as _r \\gset
select pendiente, recibido, cerrado, (select motivo from retail.comprobantes_produccion_cierres where item_id = :'it1') from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid') where item_id = :'it1';
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 60 && Number(c[2]) === 40 && c[3] === "faltante",
  },
  {
    nombre: "4b. no se cierra más de lo pendiente (lo de esta misma recepción también cuenta)",
    tipo: "error",
    contiene: "solo faltan 40 por recibir y quieres cerrar 41",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 60)}, jsonb_build_array(jsonb_build_object('item_id', :'it1', 'cantidad', 41, 'motivo', 'faltante')));
rollback;`,
  },
  {
    nombre: "4c. un cierre sin motivo válido se rechaza",
    tipo: "error",
    contiene: "faltante, devolución u otro",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', '[]'::jsonb, jsonb_build_array(jsonb_build_object('item_id', :'it1', 'cantidad', 10, 'motivo', 'porque sí')));
rollback;`,
  },
  {
    nombre: "5a. el mismo token no repite la recepción",
    tipo: "exito",
    sql: `${PREPARAR}
select gen_random_uuid() as tok \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 30)}, p_token => :'tok') as a \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 30)}, p_token => :'tok') as b \\gset
select :'a' = :'b', (select count(*) from retail.insumo_lotes where insumo_id = :'ins'), recibido from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid') where item_id = :'it1';
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 1 && Number(c[2]) === 30,
  },
  {
    nombre: "5b. un comprobante anulado no recibe",
    tipo: "error",
    contiene: "está anulado",
    sql: `${PREPARAR}
select retail.anular_comprobante_produccion(:'cid', 'Error') as _a \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 10)});
rollback;`,
  },
  {
    nombre: "5c. una recepción vacía se rechaza",
    tipo: "error",
    contiene: "qué llegó o qué no va a llegar",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller');
rollback;`,
  },
  {
    nombre: "6a. solo se recibe en el Taller",
    tipo: "error",
    contiene: "se reciben en el Taller",
    sql: `${PREPARAR}
select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo limit 1 \\gset
select retail.recibir_comprobante_produccion(:'cid', :'tienda', ${LINEA("it1", 10)});
rollback;`,
  },
  {
    nombre: "6b. un colaborador del Taller SÍ recibe, sin ser líder",
    tipo: "exito",
    sql: `${PREPARAR}
${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 25)}) as _r \\gset
select recibido from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid') where item_id = :'it1';
rollback;`,
    verificar: (c) => Number(c[0]) === 25,
  },
  {
    nombre: "6c. un colaborador de una tienda no puede recibir en el Taller",
    tipo: "error",
    contiene: "No tienes permiso para recibir insumos",
    sql: `${PREPARAR}
${CAMBIA_A(MICAELA)}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 10)});
rollback;`,
  },
  {
    nombre: "7a. quien recibe no ve ningún importe: la función de líneas no devuelve columnas de dinero",
    tipo: "exito",
    sql: `${PREPARAR}
select pg_get_function_result('retail.fn_lineas_comprobantes_produccion(uuid, uuid)'::regprocedure) !~* '(costo|monto|total|igv|subtotal|precio|importe|saldo)';
rollback;`,
    verificar: (c) => c[0] === "t",
  },
  {
    nombre: "7b. un colaborador del Taller ve las líneas por la función, pero no los comprobantes ni sus tablas",
    tipo: "exito",
    sql: `${PREPARAR}
${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}
select (select count(*) from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid')), (select count(*) from retail.comprobantes_produccion),
  (select count(*) from retail.comprobantes_produccion_items), (select count(*) from retail.fn_comprobantes_produccion());
rollback;`,
    verificar: (c) => Number(c[0]) === 1 && Number(c[1]) === 0 && Number(c[2]) === 0 && Number(c[3]) === 0,
  },
  {
    nombre: "7c. un colaborador de una tienda recibe cero líneas",
    tipo: "exito",
    sql: `${PREPARAR}
${CAMBIA_A(MICAELA)}${AUTENTICADO}
select count(*) from retail.fn_lineas_comprobantes_produccion(:'taller', :'cid');
rollback;`,
    verificar: (c) => Number(c[0]) === 0,
  },
  {
    nombre: "8a. con mercadería recibida no se puede anular",
    tipo: "error",
    contiene: "ya tiene mercadería recibida",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 10)}) as _r \\gset
select retail.anular_comprobante_produccion(:'cid', 'Error');
rollback;`,
  },
  {
    nombre: "8b. con una línea cerrada por faltante no se puede anular",
    tipo: "error",
    contiene: "líneas cerradas por faltante",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', '[]'::jsonb, jsonb_build_array(jsonb_build_object('item_id', :'it1', 'cantidad', 100, 'motivo', 'devolucion'))) as _r \\gset
select retail.anular_comprobante_produccion(:'cid', 'Error');
rollback;`,
  },
  {
    nombre: "8c. sin nada recibido, anular sigue funcionando",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.anular_comprobante_produccion(:'cid', 'Se facturó doble') as _a \\gset
select estado from retail.comprobantes_produccion where id = :'cid';
rollback;`,
    verificar: (c) => c[0] === "anulada",
  },
  {
    nombre: "9. la lista de proveedores suma los lotes recibidos y lo comprado (costo × cantidad)",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 60)}) as _r1 \\gset
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 40)}) as _r2 \\gset
select lotes, total_comprado from retail.fn_proveedores_produccion() where id = :'prov';
rollback;`,
    verificar: (c) => Number(c[0]) === 2 && Number(c[1]) === 2000,
  },
  {
    nombre: "10. recepciones y cierres son un libro: no se editan ni se borran",
    tipo: "error",
    contiene: "no se editan ni se borran",
    sql: `${PREPARAR}
select retail.recibir_comprobante_produccion(:'cid', :'taller', ${LINEA("it1", 10)}) as rid \\gset
delete from retail.comprobantes_produccion_recepciones where id = :'rid';
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
