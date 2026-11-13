#!/usr/bin/env node
/**
 * Prueba de ADR-0588 — corregir la categoría y el «qué fue» de un gasto de Finanzas sin anularlo
 * (`20261031151000_gastos_corregir_categoria_y_que_fue.sql`).
 *
 * QUÉ CUBRE
 *   · corregir la categoría y el «qué fue»: el gasto cambia, el rastro guarda antes y ahora con quién, y se lee con el nombre de la categoría;
 *   · el panel y la lista cuentan el gasto corregido en su categoría nueva (leen la categoría viva);
 *   · un gasto con factura al contado (que no se anula) sí se corrige; su monto, su IGV y su pago no cambian;
 *   · todo o nada: categoría inventada, inactiva o del viaje, «qué fue» vacío o de más de 200 letras; «no cambiaste nada» no escribe;
 *   · el mismo guardado dos veces devuelve lo que ya quedó; el mismo guardado en otro gasto se rechaza;
 *   · lo que no se corrige: anulado, gasto del viaje, y la categoría de un mes cerrado (el «qué fue» sí);
 *   · el disparador: sin la marca, con la marca de otro gasto, o cambiando el monto con la marca, no deja;
 *   · permisos: sin el módulo Gastos nada; con él, su tienda y no otra; sin sesión, nada;
 *   · el rastro no se cambia ni se borra, y nadie lo lee directo.
 *
 * CÓMO. Igual que `gastos.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido), sesión
 * simulada con `request.jwt.claim.sub`, `pg_temp.intento` para leer el error.
 *
 * LAS FECHAS. Septiembre de 2026, un mes que ya pasó (como `gastos.mjs`). El mes cerrado se simula con una fila de `periodos` puesta a mano.
 *
 * USO
 *   pnpm pruebas:gastos-corregir    → con las migraciones ya aplicadas en el local
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

/** Trujillo y Lima, un proveedor de prueba, y tres gastos de septiembre registrados por Felipe: `:yape` (Limpieza, por Yape, sin comprobante),
 *  `:fac` (factura al contado por transferencia: no se anula porque su comprobante ya tiene pagos) y `:lima` (de Lima). */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.proveedores (nombre, activo) values ('Bolsas del Norte (prueba ADR-0588)', true) returning id as prov \\gset
select retail.registrar_gasto(:'tru', 'limpieza', 'Bolsas de papel', '2026-09-20', 120, null, 'yape') as yape \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Cajas para envío', '2026-09-21', 236,
  jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov', 'serie', 'F001', 'numero', '880588', 'condicion', 'contado'), 'transferencia') as fac \\gset
select retail.registrar_gasto(:'lim', 'limpieza', 'Detergente', '2026-09-22', 35, null, 'plin') as lima \\gset
`;
const conModuloGastos = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'gastos') on conflict do nothing;\n`;
const MES = `'2026-09-01'::date, '2026-09-30'::date`;
const corregir = (gasto, lote, categoria, descripcion) =>
  `select pg_temp.intento(format('select retail.corregir_gasto(%L, %L, %L, %L)', ${gasto}, ${lote}, ${categoria}, ${descripcion}))`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Corregir categoría y «qué fue»: el gasto cambia, el rastro guarda antes y ahora, y se lee con el nombre.
{
  const r = correr(`${ESCENA}
select gen_random_uuid() as lote \\gset
select retail.corregir_gasto(:'yape', :'lote', 'bolsas', 'Bolsas de papel kraft');
select categoria || '|' || descripcion || '|' || monto_total || '|' || medio_pago from retail.gastos where id = :'yape';
-- Quien corrige es la misma persona que lo registró (Felipe, firmando con su cuenta).
select count(*) || '|' || string_agg(c.campo || ':' || c.antes || '>' || c.despues, ',' order by c.campo) || '|' || bool_and(c.corregida_por = g.registrado_por)
  from retail.gasto_correcciones c join retail.gastos g on g.id = c.gasto_id where c.gasto_id = :'yape';
select jsonb_array_length(c) || '|' || (c->0->>'quien' is not null) || '|' ||
       (select string_agg(x->>'campo' || ':' || (x->>'antes') || '>' || (x->>'despues'), ',' order by x->>'campo') from jsonb_array_elements(c->0->'cambios') x)
  from retail.fn_correcciones_de_gasto(:'yape') c;
select count(*) from retail.fn_gastos_lista(${MES}, :'tru') l where l.id = :'yape' and l.categoria = 'bolsas';`);
  const [ret, fila, rastro, leido, enLista] = lineas(r);
  esperar("devuelve 2 cambios", r.ok && ret === '{"cambios": 2, "ya_estaba": false}', r);
  esperar("el gasto cambia su categoría y su «qué fue»; el monto y el pago no", r.ok && fila === "bolsas|Bolsas de papel kraft|120.00|yape", r);
  esperar("el rastro guarda antes y ahora de cada dato, con quién", r.ok && rastro === "2|categoria:limpieza>bolsas,descripcion:Bolsas de papel>Bolsas de papel kraft|true", r);
  esperar(
    "el rastro se lee en un lote, con el nombre de la categoría",
    r.ok && leido === "1|true|categoria:Limpieza>Bolsas y empaque,descripcion:Bolsas de papel>Bolsas de papel kraft",
    r
  );
  esperar("la lista lo cuenta en su categoría nueva", r.ok && enLista === "1", r);
}

// 2. Una factura al contado no se anula (su comprobante tiene pagos), pero sí se corrige; su monto, IGV, comprobante y pago no cambian.
{
  const r = correr(`${ESCENA}
select monto_total || '|' || igv || '|' || compra_id as antes from retail.gastos where id = :'fac' \\gset
select pg_temp.intento(format('select retail.anular_gasto(%L, %L)', :'fac', 'prueba'));
select retail.corregir_gasto(:'fac', gen_random_uuid(), 'bolsas', 'Cajas para envío');
select (monto_total || '|' || igv || '|' || compra_id) = :'antes' and categoria = 'bolsas' and estado = 'vigente' from retail.gastos where id = :'fac';
select count(*) from retail.compra_pagos where compra_id = (select compra_id from retail.gastos where id = :'fac');`);
  const [anular, ret, igual, pagos] = lineas(r);
  esperar("antes: anularla no se puede", r.ok && anular.includes("ya tiene pagos"), r);
  esperar("se corrige su categoría (1 cambio)", r.ok && ret === '{"cambios": 1, "ya_estaba": false}', r);
  esperar("su monto, su IGV y su comprobante siguen iguales", r.ok && igual === "t", r);
  esperar("y su pago sigue siendo uno", r.ok && pagos === "1", r);
}

// 3. Todo o nada, y «no cambiaste nada» no escribe.
{
  const r = correr(`${ESCENA}
${cambiaA(FELIPE)}
update retail.categorias_gasto set activo = false where codigo = 'seguros';
${corregir(`:'yape'`, "gen_random_uuid()", "'inventada'", "'Bolsas'")};
${corregir(`:'yape'`, "gen_random_uuid()", "'seguros'", "'Bolsas'")};
${corregir(`:'yape'`, "gen_random_uuid()", "'viaje_compra'", "'Bolsas'")};
${corregir(`:'yape'`, "gen_random_uuid()", "'bolsas'", "'   '")};
${corregir(`:'yape'`, "gen_random_uuid()", "'bolsas'", "repeat('a', 201)")};
select retail.corregir_gasto(:'yape', gen_random_uuid(), 'limpieza', '  Bolsas de papel ');
select count(*) from retail.gasto_correcciones where gasto_id = :'yape';
select categoria || '|' || descripcion from retail.gastos where id = :'yape';`);
  const [inventada, inactiva, viaje, vacia, larga, nada, filas, fila] = lineas(r);
  esperar("una categoría inventada se rechaza", r.ok && inventada.includes("Elige una categoría"), r);
  esperar("una categoría desactivada se rechaza", r.ok && inactiva.includes("Elige una categoría"), r);
  esperar("una categoría del viaje se rechaza", r.ok && viaje.includes("Elige una categoría"), r);
  esperar("«qué fue» vacío se rechaza", r.ok && vacia.includes("Escribe qué se pagó"), r);
  esperar("«qué fue» de más de 200 letras se rechaza", r.ok && larga.includes("200 letras"), r);
  esperar("lo mismo (con espacios de más) no cuenta como cambio", r.ok && nada === '{"cambios": 0, "ya_estaba": false}', r);
  esperar("y nada quedó escrito", r.ok && filas === "0" && fila === "limpieza|Bolsas de papel", r);
}

// 4. El mismo guardado dos veces devuelve lo que ya quedó; en otro gasto se rechaza.
{
  const r = correr(`${ESCENA}
select gen_random_uuid() as lote \\gset
select retail.corregir_gasto(:'yape', :'lote', 'bolsas', 'Bolsas de papel');
select retail.corregir_gasto(:'yape', :'lote', 'bolsas', 'Bolsas de papel');
select count(*) from retail.gasto_correcciones where lote = :'lote';
${corregir(`:'lima'`, `:'lote'`, "'bolsas'", "'Detergente'")};`);
  const [primero, segundo, filas, otro] = lineas(r);
  esperar("el primero corrige", r.ok && primero === '{"cambios": 1, "ya_estaba": false}', r);
  esperar("el segundo devuelve lo que ya quedó", r.ok && segundo === '{"cambios": 1, "ya_estaba": true}', r);
  esperar("y el rastro tiene una sola fila", r.ok && filas === "1", r);
  esperar("el mismo guardado en otro gasto se rechaza", r.ok && otro.includes("ya se usó en otro gasto"), r);
}

// 5. Lo que no se corrige: un anulado, un gasto del viaje, y la categoría de un mes cerrado (el «qué fue» sí).
{
  const r = correr(`${ESCENA}
select retail.anular_gasto(:'lima', 'se registró dos veces');
${corregir(`:'lima'`, "gen_random_uuid()", "'bolsas'", "'Detergente'")};
${cambiaA("")}
set local session_replication_role = replica;
update retail.gastos set categoria = 'viaje_compra' where id = :'fac';
insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id) values ('2026-09-01', 'ubicacion', :'tru', 'cerrado', gen_random_uuid());
set local session_replication_role = origin;
${cambiaA(FELIPE)}
${corregir(`:'fac'`, "gen_random_uuid()", "'bolsas'", "'Cajas'")};
${corregir(`:'yape'`, "gen_random_uuid()", "'bolsas'", "'Bolsas de papel'")};
select retail.corregir_gasto(:'yape', gen_random_uuid(), 'limpieza', 'Bolsas de papel para la vitrina');
select categoria || '|' || descripcion from retail.gastos where id = :'yape';`);
  const [anulado, viaje, cerrado, soloQueFue, fila] = lineas(r);
  esperar("un gasto anulado no se corrige", r.ok && anulado.includes("anulado"), r);
  esperar("un gasto del viaje se corrige en Compras", r.ok && viaje.includes("viaje de compra"), r);
  esperar("la categoría de un mes cerrado no cambia (pide reabrirlo)", r.ok && cerrado.includes("cerrado") && cerrado.includes("reábrelo"), r);
  esperar("el «qué fue» sí se corrige en un mes cerrado", r.ok && soloQueFue === '{"cambios": 1, "ya_estaba": false}', r);
  esperar("y la categoría quedó como estaba", r.ok && fila === "limpieza|Bolsas de papel para la vitrina", r);
}

// 6. El disparador: sin la marca no se edita; la marca de otro gasto no sirve; con la marca, el monto no cambia.
{
  const r = correr(`${ESCENA}
${cambiaA("")}
select pg_temp.intento(format('update retail.gastos set categoria = %L where id = %L', 'bolsas', :'yape'));
select set_config('retail.gastos_corrigiendo', :'lima', true);
select pg_temp.intento(format('update retail.gastos set categoria = %L where id = %L', 'bolsas', :'yape'));
select set_config('retail.gastos_corrigiendo', :'yape', true);
select pg_temp.intento(format('update retail.gastos set monto_total = 1 where id = %L', :'yape'));
select pg_temp.intento(format('update retail.gastos set categoria = %L where id = %L', 'bolsas', :'yape'));
select set_config('retail.gastos_corrigiendo', '', true);
select pg_temp.intento(format('delete from retail.gastos where id = %L', :'yape'));`);
  const [sinMarca, _a, deOtro, _b, monto, conMarca, _c, borrar] = lineas(r);
  esperar("sin la marca, un gasto no se edita", r.ok && sinMarca.includes("solo cambia para anularse"), r);
  esperar("la marca de otro gasto no sirve", r.ok && deOtro.includes("solo cambia para anularse"), r);
  esperar("con la marca, el monto no cambia", r.ok && monto.includes("solo cambian su categoría y qué fue"), r);
  esperar("con la marca, la categoría sí", r.ok && conMarca === "SIN_ERROR", r);
  esperar("un gasto sigue sin borrarse", r.ok && borrar.includes("no se borra"), r);
}

// 7. Permisos: sin el módulo Gastos nada; con él, su tienda y no otra; sin sesión, nada. El rastro tampoco se lee desde otra tienda.
{
  const r = correr(`${ESCENA}
select retail.corregir_gasto(:'lima', gen_random_uuid(), 'bolsas', 'Detergente') as _l \\gset
${cambiaA(MICAELA)}
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'gastos';
${corregir(`:'yape'`, "gen_random_uuid()", "'bolsas'", "'Bolsas'")};
${conModuloGastos}
${corregir(`:'lima'`, "gen_random_uuid()", "'limpieza'", "'Detergente'")};
select jsonb_array_length(retail.fn_correcciones_de_gasto(:'lima'));
${corregir(`:'yape'`, "gen_random_uuid()", "'bolsas'", "'Bolsas de papel'")};
${cambiaA("")}
set local request.jwt.claim.sub = '';
${corregir(`:'yape'`, "gen_random_uuid()", "'suministros'", "'Bolsas de papel'")};`);
  const [sinModulo, otraTienda, rastroAjeno, suTienda, sinSesion] = lineas(r);
  esperar("sin el módulo Gastos no corrige", r.ok && sinModulo.includes("No puedes corregir"), r);
  esperar("con el módulo, no corrige otra tienda", r.ok && otraTienda.includes("No puedes corregir"), r);
  esperar("ni lee el rastro de otra tienda", r.ok && rastroAjeno === "0", r);
  esperar("con el módulo, corrige su tienda", r.ok && suTienda === "SIN_ERROR", r);
  esperar("sin sesión, nada", r.ok && sinSesion !== "SIN_ERROR", r);
}

// 8. El rastro no se cambia ni se borra, y nadie lo lee directo.
{
  const r = correr(`${ESCENA}
select retail.corregir_gasto(:'yape', gen_random_uuid(), 'bolsas', 'Bolsas de papel');
${cambiaA("")}
select pg_temp.intento(format('update retail.gasto_correcciones set despues = %L where gasto_id = %L', 'seguros', :'yape'));
select pg_temp.intento(format('delete from retail.gasto_correcciones where gasto_id = %L', :'yape'));
set local role authenticated;
${cambiaA(FELIPE)}
select pg_temp.intento('select count(*) from retail.gasto_correcciones');`);
  const [, cambiar, borrar, leer] = lineas(r);
  esperar("el rastro no se cambia", r.ok && cambiar.includes("no se cambia ni se borra"), r);
  esperar("el rastro no se borra", r.ok && borrar.includes("no se cambia ni se borra"), r);
  esperar("nadie lo lee directo (solo por la función)", r.ok && leer.includes("permission denied"), r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} ${fallos === 1 ? "falla" : "fallas"}.`);
process.exit(fallos === 0 ? 0 : 1);
