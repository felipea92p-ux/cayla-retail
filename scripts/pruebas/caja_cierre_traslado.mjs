#!/usr/bin/env node
/**
 * Prueba de ADR-0185 — cierre con traslado y apertura verificada
 * (`20260923200000_caja_cierre_con_traslado_y_apertura_verificada.sql`).
 *
 * QUÉ CUBRE
 *   · `fn_esperado_caja` devuelve lo mismo que después congela `cerrar_caja`, y una colaboradora no lo puede leer;
 *   · `cerrar_caja` rechaza trasladar más de lo contado, un destino inválido o un depósito sin n.º de operación;
 *   · un cierre con traslado deja la fila en `caja_traslados` y `monto_fondo` = contado − trasladado;
 *   · `abrir_caja` con el mismo fondo abre sin motivo; con otro monto exige motivo y lo guarda;
 *   · `revisar_apertura_caja` solo la usa un líder, y una sola vez.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs`: cada escenario en su transacción con ROLLBACK (nunca se
 * commitea nada en el Postgres local compartido), sesión simulada con `request.jwt.claim.sub`, y `pg_temp.intento`
 * para leer el error sin abortar el escenario.
 *
 * USO
 *   pnpm pruebas:caja-cierre-traslado    → con la migración ya aplicada en el local
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

/**
 * Trujillo con una caja recién abierta por Felipe: S/ 100 de apertura + ingreso de S/ 30 − egreso de S/ 40 → el
 * sistema espera S/ 90. Antes cierra con fondo S/ 100 cualquier caja abierta que haya dejado otra sesión y abre con
 * ese mismo monto (así la apertura coincide y no pide motivo). Deja `:trujillo` y `:caja`.
 */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select (select count(*) from (
  select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta'
) x) as _previa \\gset
select retail.abrir_caja(:'trujillo', 100.00, 'prueba automatizada') as caja \\gset
select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Otro', 'Ingreso de prueba') as _i \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 40, 'Depósito bancario', 'Voucher-TEST-001', false) as _e \\gset
`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 500)}`);
  }
}

// 1. El esperado visible es el mismo que congela el cierre.
{
  const r = correr(`${ESCENA}
select esperado from retail.fn_esperado_caja(:'caja');
select monto_sistema from retail.cerrar_caja(:'caja', 90);`);
  const [previo, congelado] = r.ok ? r.salida.split("\n") : [];
  esperar("fn_esperado_caja da S/ 90 y cerrar_caja congela lo mismo", r.ok && Number(previo) === 90 && Number(congelado) === 90, r);
}

// 2. Una colaboradora cuyo rol no tiene Caja no ve el esperado (con el módulo Caja sí podría cerrar: ADR-0161).
const ROL_SIN_CAJA = `
do $r$
begin
  if to_regclass('retail.rol_modulos') is not null then
    insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000c1', 'Solo vender (prueba de caja)', 'temporal');
    insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000c1', 'vender');
    update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000c1'
      where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
  end if;
end $r$;
`;
{
  const r = correr(`${ESCENA}${ROL_SIN_CAJA}${cambiaA(MICAELA)}
select pg_temp.intento(format('select * from retail.fn_esperado_caja(%L)', :'caja'));`);
  esperar("una colaboradora no lee fn_esperado_caja", r.ok && r.salida.includes("Solo quien puede cerrar"), r);
}

// 3. Candados del traslado.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90, 100, %L)', :'caja', 'caja_fuerte'));
select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90, 50, %L)', :'caja', 'otra_sede'));
select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90, 50, %L, %L)', :'caja', 'banco', ' '));
select pg_temp.intento(format('select * from retail.cerrar_caja(%L, 90, 50, %L)', :'caja', 'lider'));
select estado from retail.cajas where id = :'caja';`);
  const [mas, destino, voucher, lider, estado] = r.ok ? r.salida.split("\n") : [];
  esperar("no se traslada más de lo contado", r.ok && mas.startsWith("No puedes trasladar más"), r);
  esperar("destino fuera de la lista se rechaza", r.ok && destino.startsWith("Elige a dónde"), r);
  esperar("depósito sin n.º de operación se rechaza", r.ok && voucher.startsWith("Escribe el número de operación"), r);
  esperar("entregado al líder sin nombre se rechaza", r.ok && lider.startsWith("Escribe a quién"), r);
  esperar("tras los rechazos la caja sigue abierta", r.ok && estado === "abierta", r);
}

// 4. Cierre con traslado: fila en caja_traslados y fondo calculado.
{
  const r = correr(`${ESCENA}
select monto_trasladado, monto_fondo, diferencia from retail.cerrar_caja(:'caja', 85, 60, 'banco', 'OP-778899');
select destino, monto, referencia from retail.caja_traslados where caja_id = :'caja';
select monto_fondo from retail.cajas where id = :'caja';`);
  const [ret, tras, fondo] = r.ok ? r.salida.split("\n") : [];
  esperar("cerrar_caja devuelve trasladado 60, fondo 25 y diferencia −5", r.ok && ret.split("|").map(Number).join("|") === "60|25|-5", r);
  esperar("queda el traslado al banco con su voucher", r.ok && tras === "banco|60.00|OP-778899", r);
  esperar("cajas.monto_fondo = 25", r.ok && Number(fondo) === 25, r);
}

// 5. Cierre sin traslado: todo queda en el cajón.
{
  const r = correr(`${ESCENA}
select monto_trasladado, monto_fondo from retail.cerrar_caja(:'caja', 90);
select count(*) from retail.caja_traslados where caja_id = :'caja';`);
  esperar("sin traslado, el fondo es todo lo contado y no hay fila", r.ok && r.salida === "0|90\n0", r);
}

// 6. Apertura verificada contra el fondo del último cierre.
{
  const r = correr(`${ESCENA}
select monto_fondo from retail.cerrar_caja(:'caja', 90, 60, 'caja_fuerte') \\gset
select pg_temp.intento(format('select retail.abrir_caja(%L, 25)', :'trujillo'));
select retail.abrir_caja(:'trujillo', 30) as igual \\gset
select monto_apertura_esperado, coalesce(motivo_diferencia_apertura, '-') from retail.cajas where id = :'igual';`);
  const [sinMotivo, igual] = r.ok ? r.salida.split("\n") : [];
  esperar("abrir con otro monto sin motivo se rechaza y dice cuánto debería haber", r.ok && sinMotivo.includes("S/ 30.00"), r);
  esperar("abrir con el mismo fondo no pide motivo", r.ok && igual === "30.00|-", r);
}
{
  const r = correr(`${ESCENA}
select monto_fondo from retail.cerrar_caja(:'caja', 90, 60, 'caja_fuerte') \\gset
select retail.abrir_caja(:'trujillo', 25, 'se usó S/ 5 para vuelto') as dif \\gset
select monto_apertura_esperado, motivo_diferencia_apertura from retail.cajas where id = :'dif';
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.revisar_apertura_caja(%L)', :'dif'));
${cambiaA(FELIPE)}
select pg_temp.intento(format('select retail.revisar_apertura_caja(%L)', :'dif'));
select pg_temp.intento(format('select retail.revisar_apertura_caja(%L)', :'dif'));`);
  const [guardada, colaboradora, primera, segunda] = r.ok ? r.salida.split("\n") : [];
  esperar("abrir con motivo guarda esperado y motivo", r.ok && guardada === "30.00|se usó S/ 5 para vuelto", r);
  esperar("una colaboradora no marca la apertura como revisada", r.ok && colaboradora.startsWith("Solo un líder"), r);
  esperar("el líder la marca como revisada", r.ok && primera === "SIN_ERROR", r);
  esperar("no se revisa dos veces", r.ok && segunda.startsWith("Esa apertura no tiene"), r);
}

// 7. El candado de la tabla: aunque alguien escriba directo, una diferencia sin motivo no entra.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('update retail.cajas set monto_apertura_esperado = 5 where id = %L', :'caja'));`);
  esperar("check caja_apertura_explica_diferencia frena la escritura directa", r.ok && r.salida.includes("caja_apertura_explica_diferencia"), r);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
