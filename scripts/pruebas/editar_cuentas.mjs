#!/usr/bin/env node
/**
 * Prueba de «Editar y eliminar cuentas» (ADR-0195 F3, actualización 2026-09-25;
 * `20260925210000_finanzas_editar_y_eliminar_cuentas.sql`).
 *
 * QUÉ CUBRE
 *   · una cuenta por la que nunca pasó nada: cambia nombre, número, tipo (con su cuenta contable) y saldo inicial, y se
 *     ELIMINA de verdad; su creación, sus cambios y su eliminación quedan en `configuracion_historial`;
 *   · una cuenta usada (recibe cobros o tiene un movimiento): el nombre y el saldo inicial cambian, el tipo no, y no se
 *     elimina (se archiva); los usos se leen de las llaves foráneas;
 *   · el saldo inicial no se corrige con una conciliación vigente (sí al anularla) ni con su mes cerrado;
 *   · el cajón, la caja fuerte y el efectivo por rendir: solo cambian de nombre, no se eliminan;
 *   · el candado de la tabla sigue cerrado para todo lo demás (update y delete directos) y todo es solo del líder.
 *
 * CÓMO. Igual que `cuentas_dinero.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:editar-cuentas    → con las migraciones ya aplicadas en el local
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

/** Trujillo con su cajón; «Nueva E» (banco, sin uso) y «Usada E» (banco con S/ 1,000 desde hace 20 días). */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' \\gset
select retail.crear_cuenta_dinero('Nueva E', 'banco', 0, retail.fn_hoy_lima() - 5, '•••• 1111') as nueva \\gset
select retail.crear_cuenta_dinero('Usada E', 'banco', 1000, retail.fn_hoy_lima() - 20) as usada \\gset
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Una cuenta sin uso: se corrige todo y se elimina de verdad, con su historia.
{
  const r = correr(`${ESCENA}
select x->>'usada', x->>'puede_eliminar', x->>'puede_cambiar_tipo', x->>'puede_cambiar_saldo', jsonb_array_length(x->'usos') from retail.fn_cuenta_dinero_detalle(:'nueva') x;
select retail.editar_cuenta_dinero(:'nueva', '  POS Niubiz E  ', '•••• 2222', 'por_abonar', 350, retail.fn_hoy_lima() - 3) as _e1 \\gset
select nombre, numero, tipo, cuenta_contable, orden, saldo_inicial, saldo_desde = retail.fn_hoy_lima() - 3 from retail.cuentas_dinero where id = :'nueva';
select detalle->'antes'->>'tipo', detalle->'despues'->>'tipo', detalle->'despues'->>'saldo_inicial', detalle->'antes'->>'nombre' from retail.configuracion_historial where que = 'cuenta_dinero_editada' and detalle->>'cuenta_id' = :'nueva';
select retail.editar_cuenta_dinero(:'nueva', 'POS Niubiz E', '•••• 2222') as _e2 \\gset
select count(*) from retail.configuracion_historial where que = 'cuenta_dinero_editada' and detalle->>'cuenta_id' = :'nueva';
select retail.editar_cuenta_dinero(:'nueva', 'Visa E', null, 'tarjeta_credito', -800) as _e3 \\gset
select tipo, cuenta_contable, orden, saldo_inicial, numero is null from retail.cuentas_dinero where id = :'nueva';
select saldo from retail.fn_cuentas_dinero_saldos() where id = :'nueva';
select retail.eliminar_cuenta_dinero(:'nueva') as _b \\gset
select count(*) from retail.cuentas_dinero where id = :'nueva';
select detalle->>'nombre', detalle->'cuenta'->>'tipo', hecho_por is not null from retail.configuracion_historial where que = 'cuenta_dinero_eliminada' and detalle->>'cuenta_id' = :'nueva';
select count(*) from retail.configuracion_historial where que = 'cuenta_dinero_creada' and detalle->>'cuenta_id' = :'nueva';
select pg_temp.intento(format('select retail.eliminar_cuenta_dinero(%L)', :'nueva'));`);
  const [detalle, tras1, hist1, nCambios, tras3, saldo, quedan, histB, histC, otraVez] = lineas(r);
  esperar("sin uso: no está usada y se puede eliminar, cambiar de tipo y de saldo", r.ok && detalle === "false|true|true|true|0", r);
  esperar("cambia nombre (sin espacios), número, tipo con su cuenta contable (105) y orden, y el saldo inicial con su fecha", r.ok && tras1 === "POS Niubiz E|•••• 2222|por_abonar|105|20|350.00|t", r);
  esperar("el cambio queda en la historia con el antes y el después", r.ok && hist1 === "banco|por_abonar|350.00|Nueva E", r);
  esperar("guardar sin cambios no escribe historia", r.ok && nCambios === "1", r);
  esperar("a tarjeta de crédito: 451, orden 60 y lo que se debe en negativo; el número vacío se borra", r.ok && tras3 === "tarjeta_credito|451|60|-800.00|t", r);
  esperar("el saldo de hoy sale del saldo inicial corregido", r.ok && saldo === "-800.00", r);
  esperar("eliminar una cuenta sin uso la borra de verdad", r.ok && quedan === "0", r);
  esperar("y deja en la historia la fila completa y quién la eliminó", r.ok && histB === "Visa E|tarjeta_credito|t", r);
  esperar("la historia de su creación se queda", r.ok && histC === "1", r);
  esperar("eliminarla otra vez dice que ya no está", r.ok && otraVez.includes("ya no está"), r);
}

// 2. Una cuenta usada: nombre y saldo sí; tipo no; eliminar no (se archiva). Los usos salen de las llaves foráneas.
{
  const r = correr(`${ESCENA}
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'usada') as _g \\gset
select retail.registrar_movimiento_dinero('aporte', 500, null, :'usada') as _a \\gset
select x->>'usada', x->>'puede_eliminar', x->>'puede_cambiar_tipo', x->>'puede_cambiar_saldo',
       (select string_agg(u->>'tabla' || ':' || (u->>'n'), ',' order by u->>'tabla') from jsonb_array_elements(x->'usos') u),
       (select string_agg(e->>'medio', ',') from jsonb_array_elements(x->'recibe') e)
  from retail.fn_cuenta_dinero_detalle(:'usada') x;
select pg_temp.intento(format('select retail.eliminar_cuenta_dinero(%L)', :'usada'));
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Usada E'', null, ''por_abonar'')', :'usada'));
select saldo as antes from retail.fn_cuentas_dinero_saldos() where id = :'usada' \\gset
select retail.editar_cuenta_dinero(:'usada', 'BCP · Cta. corriente E', '191-555', null, 1200, retail.fn_hoy_lima() - 20) as _e \\gset
select nombre, numero, tipo, saldo_inicial from retail.cuentas_dinero where id = :'usada';
select saldo - :antes from retail.fn_cuentas_dinero_saldos() where id = :'usada';
select count(*) from retail.cuentas_dinero where id = :'usada';
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Otra'', null, null, 1200, retail.fn_hoy_lima() + 1)', :'usada'));
select retail.crear_cuenta_dinero('Interbank E', 'banco') as ibk \\gset
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''interbank e'')', :'usada'));`);
  const [detalle, eliminar, tipo, tras, saldo, sigue, futura, repetido] = lineas(r);
  esperar("usada: no se elimina ni cambia de tipo, pero su saldo sí; los usos vienen de las llaves (cobros y movimientos) y dice que recibe el Yape", r.ok && detalle === "true|false|false|true|medios_de_cobro:1,movimientos_dinero:1|yape", r);
  esperar("eliminar una cuenta usada: no se elimina, se archiva", r.ok && eliminar.includes("no se elimina, se archiva"), r);
  esperar("cambiar el tipo de una cuenta usada: su tipo queda", r.ok && tipo.includes("su tipo queda"), r);
  esperar("el nombre, el número y el saldo inicial sí cambian", r.ok && tras === "BCP · Cta. corriente E|191-555|banco|1200.00", r);
  esperar("el saldo de hoy sube exactamente lo que se corrigió el inicial (+200)", r.ok && saldo === "200.00", r);
  esperar("y la cuenta sigue ahí", r.ok && sigue === "1", r);
  esperar("la fecha del saldo inicial no puede ser futura", r.ok && futura.includes("no puede ser futura"), r);
  esperar("no hay dos cuentas activas con el mismo nombre (sin importar mayúsculas)", r.ok && repetido.includes("Ya hay otra cuenta activa"), r);
}

// 3. El saldo inicial no se corrige con una conciliación vigente (sí al anularla) ni con su mes cerrado.
{
  const r = correr(`${ESCENA}
select retail.registrar_conciliacion(:'usada', retail.fn_hoy_lima(), 1000, 'banca por internet') as c \\gset
select x->>'puede_cambiar_saldo', x->>'motivo_saldo' like 'Esta cuenta se concilió%' from retail.fn_cuenta_dinero_detalle(:'usada') x;
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Usada E'', null, null, 900)', :'usada'));
select retail.editar_cuenta_dinero(:'usada', 'Usada E renombrada') as _n \\gset
select nombre, saldo_inicial from retail.cuentas_dinero where id = :'usada';
select retail.anular_conciliacion(:'c', 'Cifra mal copiada') as _x \\gset
select retail.editar_cuenta_dinero(:'usada', 'Usada E renombrada', null, null, 900) as _s \\gset
select saldo_inicial from retail.cuentas_dinero where id = :'usada';
-- Un mes cerrado de la empresa (se inserta directo, sin sus disparadores: aquí solo importa que figure cerrado).
set local session_replication_role = replica;
insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id) values ('2025-03-01', 'empresa', null, 'cerrado', gen_random_uuid());
set local session_replication_role = origin;
select retail.crear_cuenta_dinero('Antigua E', 'banco', 100, '2025-03-10') as antigua \\gset
select x->>'puede_cambiar_saldo', x->>'motivo_saldo' like '%cerrado%' from retail.fn_cuenta_dinero_detalle(:'antigua') x;
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Antigua E'', null, null, 150)', :'antigua'));
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Antigua E'', null, null, null, ''2025-04-02'')', :'antigua'));
select retail.editar_cuenta_dinero(:'antigua', 'Antigua E con nombre nuevo') as _n2 \\gset
select nombre from retail.cuentas_dinero where id = :'antigua';`);
  const [detConc, conConc, nombre, anulada, detMes, conMes, moverFecha, nombreMes] = lineas(r);
  esperar("con una conciliación vigente, el saldo no se ofrece y dice por qué", r.ok && detConc === "false|t", r);
  esperar("ni se deja cambiar: pide anular la conciliación", r.ok && conConc.includes("anula esa conciliación"), r);
  esperar("el nombre sí cambia aunque esté conciliada", r.ok && nombre === "Usada E renombrada|1000.00", r);
  esperar("anulada la conciliación, el saldo inicial se corrige", r.ok && anulada === "900.00", r);
  esperar("con su mes cerrado, el saldo no se ofrece", r.ok && detMes === "false|t", r);
  esperar("ni se deja cambiar: pide reabrir el mes", r.ok && conMes.includes("está cerrado") && conMes.includes("corregir el saldo inicial"), r);
  esperar("moverle la fecha también toca el mes cerrado", r.ok && moverFecha.includes("está cerrado"), r);
  esperar("el nombre sí cambia con el mes cerrado", r.ok && nombreMes === "Antigua E con nombre nuevo", r);
}

// 4. Las cuentas que nacen con cada sede: solo el nombre.
{
  const r = correr(`${ESCENA}
select x->>'automatica', x->>'puede_eliminar', x->>'puede_cambiar_tipo', x->>'puede_cambiar_saldo' from retail.fn_cuenta_dinero_detalle(:'cajon_tru') x;
select pg_temp.intento(format('select retail.eliminar_cuenta_dinero(%L)', :'cajon_tru'));
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Cajón TRU'', null, ''banco'')', :'cajon_tru'));
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''Por rendir'', null, null, 50, retail.fn_hoy_lima())', :'rendir'));
select retail.editar_cuenta_dinero(:'cajon_tru', 'Cajón de Trujillo', '123') as _e \\gset
select nombre, numero is null, tipo from retail.cuentas_dinero where id = :'cajon_tru';`);
  const [detalle, eliminar, tipo, saldo, tras] = lineas(r);
  esperar("el cajón: automática, no se elimina ni cambia tipo ni saldo", r.ok && detalle === "true|false|false|false", r);
  esperar("eliminar el cajón: nace con la sede", r.ok && eliminar.includes("no se eliminan"), r);
  esperar("cambiarle el tipo: no", r.ok && tipo.includes("su tipo no cambia"), r);
  esperar("el efectivo por rendir no lleva saldo inicial", r.ok && saldo.includes("no llevan saldo inicial"), r);
  esperar("el nombre sí cambia (el número se ignora)", r.ok && tras === "Cajón de Trujillo|t|cajon", r);
}

// 5. El candado de la tabla sigue cerrado fuera de las funciones, y todo es solo del líder.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('update retail.cuentas_dinero set tipo = ''por_abonar'', cuenta_contable = ''105'' where id = %L', :'nueva'));
select pg_temp.intento(format('update retail.cuentas_dinero set saldo_inicial = 5 where id = %L', :'nueva'));
select pg_temp.intento(format('delete from retail.cuentas_dinero where id = %L', :'nueva'));
select coalesce(current_setting('retail.editando_cuenta', true), '');
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.fn_cuenta_dinero_detalle(%L)', :'nueva'));
select pg_temp.intento(format('select retail.editar_cuenta_dinero(%L, ''X'')', :'nueva'));
select pg_temp.intento(format('select retail.eliminar_cuenta_dinero(%L)', :'nueva'));
set local role authenticated;
select pg_temp.intento(format('select count(*) from retail.fn_usos_cuenta_dinero(%L)', :'nueva'));`);
  const [tipo, saldo, borrar, bandera, detalle, editar, eliminar, usos] = lineas(r);
  esperar("un update directo del tipo sigue prohibido", r.ok && tipo.includes("su tipo y su saldo inicial quedan"), r);
  esperar("un update directo del saldo inicial sigue prohibido", r.ok && saldo.includes("su tipo y su saldo inicial quedan"), r);
  esperar("un delete directo sigue prohibido", r.ok && borrar.includes("no se borra"), r);
  esperar("la puerta de las funciones no queda abierta después", r.ok && bandera === "", r);
  esperar("ver el detalle es solo del líder", r.ok && detalle.includes("solo del líder"), r);
  esperar("editar es solo del líder", r.ok && editar.includes("solo del líder"), r);
  esperar("eliminar es solo del líder", r.ok && eliminar.includes("solo del líder"), r);
  esperar("los usos son de uso interno: nadie los llama", r.ok && usos.includes("permission denied"), r);
}

console.log(fallos ? `\n${fallos} de ${casos} caso(s) fallaron` : `\nTodo en orden (${casos} casos)`);
process.exit(fallos ? 1 : 0);
