#!/usr/bin/env node
/**
 * Prueba de ADR-0588 — «No emite comprobante»: un gasto sin comprobante que no lo tendrá se marca con su motivo y deja de pedir algo
 * (`20261031155000_gastos_no_emite_comprobante.sql`).
 *
 * QUÉ CUBRE
 *   · marcar con un motivo: la fila, el rastro y la lectura de la lista; el mismo motivo dos veces devuelve lo que ya quedó; otro se rechaza;
 *   · «otro» pide su nota; motivo inventado y nota de más de 200 letras se rechazan;
 *   · lo que no se marca: anulado, con comprobante, del viaje; un mes cerrado sí (no cambia cifras);
 *   · si después llega el papel, la lista ya no lo trae como «no emite»;
 *   · no se cambia ni se borra; nadie lo lee directo;
 *   · permisos por tienda, al marcar y al leer.
 *
 * CÓMO. Igual que `gastos.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`, `pg_temp.intento`.
 *
 * USO
 *   pnpm pruebas:gastos-no-emite    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;

/** Trujillo y Lima, un proveedor de prueba y dos gastos de septiembre sin comprobante: `:g` (Trujillo, S/ 450) y `:lima` (Lima, S/ 320). */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.proveedores (nombre, activo) values ('Gasfitería (prueba ADR-0588)', true) returning id as prov \\gset
select retail.registrar_gasto(:'tru', 'mantenimiento', 'Gasfitero', '2026-09-20', 450, null, 'yape') as g \\gset
select retail.registrar_gasto(:'lim', 'mantenimiento', 'Pintor', '2026-09-21', 320, null, 'plin') as lima \\gset
`;
const marcar = (gasto, motivo, nota = "null") => `select pg_temp.intento(format('select retail.marcar_gasto_no_emite(%L, %L, %L)', ${gasto}, ${motivo}, ${nota}))`;
const MES = `'2026-09-01'::date, '2026-09-30'::date`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Marcar: la fila, el rastro y la lista; el mismo motivo dos veces; otro motivo se rechaza.
{
  const r = correr(`${ESCENA}
select retail.marcar_gasto_no_emite(:'g', 'no_emite');
select retail.marcar_gasto_no_emite(:'g', 'no_emite');
${marcar(`:'g'`, "'se_perdio'")};
select motivo || '|' || (nota is null) from retail.gastos_no_emiten where gasto_id = :'g';
select campo || ':' || antes || '>' || despues from retail.gasto_correcciones where gasto_id = :'g';
select string_agg(motivo, ',') from retail.fn_gastos_no_emiten(${MES}, :'tru');
select count(*) from retail.fn_gastos_no_emiten(${MES}, :'lim');`);
  const [primero, segundo, otro, fila, rastro, enLista, enLima] = lineas(r);
  esperar("marca el gasto", r.ok && primero === '{"ya_estaba": false}', r);
  esperar("el mismo motivo dos veces devuelve lo que ya quedó", r.ok && segundo === '{"ya_estaba": true}', r);
  esperar("otro motivo después se rechaza", r.ok && otro.includes("ya está marcado"), r);
  esperar("queda su fila, sin nota", r.ok && fila === "no_emite|true", r);
  esperar("y su rastro", r.ok && rastro === "comprobante:Sin comprobante>No emite: el proveedor no emite comprobante", r);
  esperar("la lista de Trujillo lo trae", r.ok && enLista === "no_emite", r);
  esperar("la de Lima no", r.ok && enLima === "0", r);
}

// 2. «otro» pide su nota; motivo inventado y nota larga se rechazan.
{
  const r = correr(`${ESCENA}
${marcar(`:'g'`, "'otro'")};
${marcar(`:'g'`, "'otro'", "'   '")};
${marcar(`:'g'`, "'inventado'")};
${marcar(`:'g'`, "'otro'", "repeat('a', 201)")};
select retail.marcar_gasto_no_emite(:'g', 'otro', '  El maestro trabaja sin RUC ');
select nota from retail.gastos_no_emiten where gasto_id = :'g';`);
  const [sinNota, blanco, inventado, larga, conNota, nota] = lineas(r);
  esperar("«otro» sin nota se rechaza", r.ok && sinNota.includes("Cuenta en una línea"), r);
  esperar("«otro» con nota en blanco se rechaza", r.ok && blanco.includes("Cuenta en una línea"), r);
  esperar("un motivo inventado se rechaza", r.ok && inventado.includes("Elige por qué"), r);
  esperar("una nota de más de 200 letras se rechaza", r.ok && larga.includes("200 letras"), r);
  esperar("con nota, se marca", r.ok && conNota === '{"ya_estaba": false}', r);
  esperar("y la nota queda sin espacios de más", r.ok && nota === "El maestro trabaja sin RUC", r);
}

// 3. Lo que no se marca (anulado, con comprobante, del viaje); un mes cerrado sí.
{
  const r = correr(`${ESCENA}
select retail.registrar_gasto(:'tru', 'suministros', 'Cajas', '2026-09-21', 118,
  jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov', 'serie', 'F001', 'numero', '880600', 'condicion', 'contado'), 'yape') as conpapel \\gset
select retail.anular_gasto(:'lima', 'se registró dos veces') as _a \\gset
${marcar(`:'lima'`, "'no_emite'")};
${marcar(`:'conpapel'`, "'no_emite'")};
${cambiaA("")}
set local session_replication_role = replica;
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, medio_pago) values (:'tru', 'viaje_compra', 'Pasaje', '2026-09-20', 40, 'yape') returning id as viaje \\gset
insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id) values ('2026-09-01', 'ubicacion', :'tru', 'cerrado', gen_random_uuid());
set local session_replication_role = origin;
${cambiaA(FELIPE)}
${marcar(`:'viaje'`, "'no_emite'")};
select retail.marcar_gasto_no_emite(:'g', 'se_perdio');`);
  const [anulado, conPapel, viaje, cerrado] = lineas(r);
  esperar("un anulado no se marca", r.ok && anulado.includes("anulado"), r);
  esperar("uno con comprobante no se marca", r.ok && conPapel.includes("ya tiene su comprobante"), r);
  esperar("uno del viaje no se marca", r.ok && viaje.includes("viaje de compra"), r);
  esperar("en un mes cerrado sí (no cambia ninguna cifra)", r.ok && cerrado === '{"ya_estaba": false}', r);
}

// 4. Si después llega el papel, la lista ya no lo trae como «no emite».
{
  const r = correr(`${ESCENA}
select retail.marcar_gasto_no_emite(:'g', 'se_perdio') as _m \\gset
select retail.agregar_comprobante_a_gasto(:'g', jsonb_build_object('tipo', 'boleta', 'proveedor_id', :'prov', 'serie', 'B001', 'numero', '77')) as _c \\gset
select count(*) from retail.fn_gastos_no_emiten(${MES}, :'tru');`);
  const [cuenta] = lineas(r);
  esperar("con su papel ya no cuenta como «no emite»", r.ok && cuenta === "0", r);
}

// 5. No se cambia ni se borra; nadie lo lee directo.
{
  const r = correr(`${ESCENA}
select retail.marcar_gasto_no_emite(:'g', 'no_emite') as _m \\gset
${cambiaA("")}
select pg_temp.intento(format('update retail.gastos_no_emiten set motivo = %L where gasto_id = %L', 'se_perdio', :'g'));
select pg_temp.intento(format('delete from retail.gastos_no_emiten where gasto_id = %L', :'g'));
set local role authenticated;
${cambiaA(FELIPE)}
select pg_temp.intento('select count(*) from retail.gastos_no_emiten');`);
  const [cambiar, borrar, leer] = lineas(r);
  esperar("no se cambia", r.ok && cambiar.includes("no se cambia ni se borra"), r);
  esperar("no se borra", r.ok && borrar.includes("no se cambia ni se borra"), r);
  esperar("nadie lo lee directo", r.ok && leer.includes("permission denied"), r);
}

// 6. Permisos por tienda, al marcar y al leer.
{
  const r = correr(`${ESCENA}
select retail.marcar_gasto_no_emite(:'lima', 'no_emite') as _m \\gset
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'gastos') on conflict do nothing;
${cambiaA(MICAELA)}
${marcar(`:'g'`, "'no_emite'")};
select count(*) from retail.fn_gastos_no_emiten(${MES});
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.marcar_gasto_no_emite(%L, %L)', :'lima', 'se_perdio'));`);
  const [suTienda, ve, otraTienda] = lineas(r);
  esperar("con el módulo, marca un gasto de su tienda", r.ok && suTienda === "SIN_ERROR", r);
  esperar("y solo ve los de su tienda", r.ok && ve === "1", r);
  esperar("no toca uno de otra tienda", r.ok && otraTienda.includes("No puedes cambiar"), r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} ${fallos === 1 ? "falla" : "fallas"}.`);
process.exit(fallos === 0 ? 0 : 1);
