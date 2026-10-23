#!/usr/bin/env node
/**
 * Prueba de «Revisar compras» (ADR-0480, actividad 7): `20261023143000_compras_simple_revisar.sql`.
 *
 * QUÉ PROMETE
 *   · El papel se completa recién cuando la tienda cerró el conteo; nadie completa el suyo.
 *   · Manda el papel: el comprobante y el pago del fondo quedan por lo que dice el papel; en factura, las líneas van sin IGV y suman exacto
 *     (el céntimo que sobra va en una unidad aparte). Nace «recibido» por lo que ya llegó, y lo que no vino sigue faltando.
 *   · Reintentar con lo mismo devuelve lo mismo; con otros datos, no. El envío ya no se reabre; `recalcular_compras` no borra lo recibido.
 *   · El cierre del día: «Lo devuelvo» vuelve a la cuenta que elige Compras y «CAYLA me debe» sale de ella; con plata por confirmar, espera.
 *   · Un gasto que no es ropa pasa a los gastos del viaje desde su fondo, a su compra del día y en la sede de la compra; sin papel solo el
 *     taxi y el cargador; nadie revisa los suyos; sin ninguna compra, espera.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, las migraciones de las actividades 6 y 7 pegadas dos veces y ROLLBACK siempre.
 * Sandra compra y manda, Micaela (solo Recibir) recibe, Felipe (líder) revisa.
 *
 * USO
 *   pnpm pruebas:compras-simple-revisar                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_revisar.mjs --contenedor <otro>  → contra otro contenedor
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
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const leer = (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8").replace(/^set lock_timeout.*$/gm, "");
const MIGRACIONES = [leer("20261023121000_compras_simple_recibir_con_la_foto.sql"), leer("20261023143000_compras_simple_revisar.sql")].join("\n");

const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder: compra y manda
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo: recibe
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: revisa

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
// Con la cuenta de una persona; `clave` firma sin combo (acciones soltadas) y `combo` elige el responsable en una sede.
const como = (auth, { clave = null, combo = null } = {}) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  (combo
    ? `select set_config('request.headers', json_build_object('x-responsable', :'${combo}', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`
    : `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n`) +
  `set local role authenticated;\n`;
const REVISA = (clave) => como(FELIPE, { clave });

// «OK» o «hint|mensaje».
const ATRAPA = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;`;

// Sandra compra para Trujillo con FACTURA de S/ 300: 6 polos del catálogo a S/ 40 y 2 poleras sin catálogo a S/ 10 (anotó S/ 260).
const COMPRA = `
set client_min_messages = warning;
begin;
${MIGRACIONES}
${MIGRACIONES}
set local search_path = retail, public, extensions;
${ATRAPA}
select set_config('request.jwt.claim.sub', '${SANDRA}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Revisar Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Revisar Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Revisar', 'accesorios') returning id as cat \\gset
select id as t_s from retail.tallas where valor = 'S' order by id limit 1 \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Polo Revisar', :'marca', :'prov')
  returning id as polo \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'polo', :'t_s', :'c1', 99.90, 40)
  returning id as vs \\gset
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Polera Revisar', :'marca', :'prov')
  returning id as polera \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'polera', :'t_s', :'c1', 39.90, 10)
  returning id as vp \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as banco from retail.cuentas_dinero where tipo = 'banco' and archivada_en is null order by nombre limit 1 \\gset
select p.id as compradora_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select set_config('t.prov', :'prov', true), set_config('t.polo', :'polo', true), set_config('t.tru', :'tru', true),
       set_config('t.cat', :'cat', true), set_config('t.marca', :'marca', true), set_config('t.compradora', :'compradora_p', true),
       set_config('t.banco', :'banco', true) \\g /dev/null
-- Micaela solo con Recibir, con su entrada marcada en Trujillo (el responsable obligatorio, como en producción).
insert into retail.roles (nombre) values ('ZZ Recibe ADR-0480 rev') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'recibir');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela_p';
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
${como(SANDRA, { clave: "compra_rapida" })}
select retail.registrar_compra_rapida('aaaaaaaa-0480-4000-8000-0000000007a1', current_setting('t.prov')::uuid, 'factura', 300, 'papeles/factura-prueba.jpg', jsonb_build_array(
  jsonb_build_object('producto_id', current_setting('t.polo')::uuid, 'cantidad', 6, 'costo', 40, 'precio_venta', 99.90, 'destino_id', current_setting('t.tru')::uuid),
  jsonb_build_object('descripcion', 'Polera revisar', 'categoria_id', current_setting('t.cat')::uuid, 'marca_id', current_setting('t.marca')::uuid, 'cantidad', 2, 'costo', 10, 'destino_id', current_setting('t.tru')::uuid))) \\g /dev/null
reset role;
select id as papel from retail.compra_papeles where id = 'aaaaaaaa-0480-4000-8000-0000000007a1' \\gset
`;

const MANDA = `
${como(SANDRA, { clave: "compra_mandar" })}
select retail.mandar_compras_a_tienda(current_setting('t.tru')::uuid, 1, 'aaaaaaaa-0480-4000-8000-0000000007b1') ->> 'despacho_id' as envio \\gset
reset role;
select version as v_envio from retail.despachos where id = :'envio' \\gset
select di.id as di_polo from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
 where di.despacho_id = :'envio' and i.producto_id is not null \\gset
select di.id as di_polera from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
 where di.despacho_id = :'envio' and i.producto_id is null \\gset
`;

// Micaela abre y recibe: los 6 polos y 1 de las 2 poleras (la otra «no vino»).
const RECIBE = `
${como(MICAELA, { combo: "micaela_p" })}
select (retail.abrir_despacho(:'envio', :v_envio) ->> 'version')::int as v_envio \\gset
select retail.recibir_despacho(:'envio', :v_envio, jsonb_build_array(
  jsonb_build_object('despacho_item_id', :'di_polo', 'costo_unitario', null::numeric, 'confirma_costo', false, 'faltante_causa', null::text,
    'sobrante_causa', null::text, 'variantes', jsonb_build_array(jsonb_build_object('variante_id', :'vs', 'cantidad', 6, 'danadas', 0, 'danada_solucion', null::text))),
  jsonb_build_object('despacho_item_id', :'di_polera', 'costo_unitario', null::numeric, 'confirma_costo', false, 'faltante_causa', 'no_vino',
    'sobrante_causa', null::text, 'variantes', jsonb_build_array(jsonb_build_object('variante_id', :'vp', 'cantidad', 1, 'danadas', 0, 'danada_solucion', null::text)))),
  '[]'::jsonb, null, gen_random_uuid()) \\g /dev/null
reset role;
`;

const COMPLETA = (serie = "f001", numero = "123", extra = "") =>
  `retail.completar_papel_compra(%L, null, '${serie}', '${numero}'${extra})`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${sql}\nrollback;`).trim().split("\n").filter(Boolean).join(" / ");
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}
const intento = (llamada) => `select pg_temp.intento(format($q$select ${llamada}$q$, :'papel'));`;

caso(
  "no se completa antes de mandar ni antes de que la tienda cierre el conteo",
  `${COMPRA}
${REVISA("papel_completar")}${intento(COMPLETA())}
${MANDA}
${REVISA("papel_completar")}${intento(COMPLETA())}`,
  (o) => /^papel_por_mandar\|/.test(o.split(" / ")[0]) && /^papel_sin_recibir\|/.test(o.split(" / ")[1]),
);

caso(
  "nadie completa el papel de su propia compra",
  `${COMPRA}${MANDA}${RECIBE}
${como(SANDRA, { clave: "papel_completar" })}${intento(COMPLETA())}`,
  (o) => o.startsWith("fondo_propio|"),
);

caso(
  "manda el papel: factura de S/ 300 → líneas sin IGV que suman exacto, pagada del fondo y recibida por lo que llegó",
  `${COMPRA}${MANDA}${RECIBE}
${REVISA("papel_completar")}
select (retail.completar_papel_compra(:'papel', null, 'f001', '123') ->> 'compra_id') as compra \\gset
reset role;
select c.documento, c.tipo, c.total, c.subtotal, c.igv, c.pagado, c.estado_pago, c.recibido_cantidad || '/' || c.facturado_cantidad,
       (select sum(ci.subtotal) from retail.compra_items ci where ci.compra_id = c.id),
       (select string_agg(ci.cantidad || 'x' || ci.costo_unitario, ',' order by ci.costo_unitario desc, ci.cantidad) from retail.compra_items ci where ci.compra_id = c.id),
       (select estado from retail.compra_papeles where id = :'papel'),
       retail.fn_fondo_saldo(retail.fn_fondo_de(current_setting('t.compradora')::uuid, false))
  from retail.compras c where c.id = :'compra';`,
  "F001-123|factura|300.00|254.24|45.76|300.00|pagada|7/8|254.24|1x39.13,5x39.11,2x9.78|completado|-300.00",
);

caso(
  "reintentar con lo mismo devuelve lo mismo; con otro número se rechaza",
  `${COMPRA}${MANDA}${RECIBE}
${REVISA("papel_completar")}
select (retail.completar_papel_compra(:'papel', null, 'F001', '123') ->> 'compra_id') as compra \\gset
select (r ->> 'compra_id') = :'compra', r ->> 'ya_estaba' from retail.completar_papel_compra(:'papel', null, 'F001', '123') r;
${intento(COMPLETA("F001", "124"))}`,
  (o) => o.startsWith("t|true / papel_ya_completado|"),
);

caso(
  "un papel que dice otro monto que lo anotado manda el papel; el envío ya no se reabre (ni llamando a reabrir) y recalcular no borra lo recibido",
  `${COMPRA}${MANDA}${RECIBE}
${REVISA("papel_completar")}
select (retail.completar_papel_compra(:'papel', null, 'F001', '77', 250) ->> 'ajustado') as aj \\gset
reset role;
select retail.recalcular_compras();
select :'aj', c.total, c.recibido_cantidad, retail.fn_envio_reabrir_bloqueo(:'envio')
  from retail.compras c where c.token_cliente = :'papel';
select version as v_envio from retail.despachos where id = :'envio' \\gset
${como(MICAELA, { combo: "micaela_p" })}
select split_part(pg_temp.intento(format($q$select retail.reabrir_envio(%L, %s, 'quiero recontar', gen_random_uuid())$q$, :'envio', :v_envio)), '|', 1);`,
  // /chaos 2026-10-23: `reabrir_envio` no frenaba con este motivo y el envío se reabría.
  (o) => o.split(" / ").slice(-2).join(" / ") === "true|250.00|7|reabrir_papel_completado / reabrir_papel_completado",
);

caso(
  "la lectura muestra el papel con sus prendas, lo que faltó y si llegó; completado, ya no",
  `${COMPRA}${MANDA}
${REVISA(null)}
select (p ->> 'llego'), jsonb_array_length(p -> 'lineas') from jsonb_array_elements(retail.fn_revisar_compras() -> 'papeles') p where p ->> 'id' = :'papel';
${RECIBE}
${REVISA(null)}
select (p ->> 'llego'), string_agg((l ->> 'cantidad') || ':' || (l ->> 'mandadas') || ':' || coalesce(l -> 'faltan' -> 0 ->> 'causa', ''), ',' order by (l ->> 'cantidad')::int desc)
  from jsonb_array_elements(retail.fn_revisar_compras() -> 'papeles') p, jsonb_array_elements(p -> 'lineas') l where p ->> 'id' = :'papel' group by 1;
${REVISA("papel_completar")}
select retail.completar_papel_compra(:'papel', null, 'F001', '5') \\g /dev/null
select count(*) from jsonb_array_elements(retail.fn_revisar_compras() -> 'papeles') p where p ->> 'id' = :'papel';`,
  "false|2 / true|6:6:,2:2:no_vino / 0",
);

// El cierre del día: Sandra anota S/ 500 (Felipe la confirma desde el banco), compra S/ 300 y devuelve lo que le queda (S/ 200).
const CIERRE_DEVUELVE = `
${como(SANDRA, { clave: "plata_anotar" })}
select retail.anotar_plata_compras('transferencia', 500, null, gen_random_uuid()) as plata \\gset
${como(SANDRA, { clave: "compra_terminar_dia" })}
select retail.terminar_dia_compras('devuelve') \\g /dev/null
reset role;
select id as cierre from retail.compra_cierres where persona_id = current_setting('t.compradora')::uuid \\gset
`;

caso(
  "con plata por confirmar, el cierre espera; confirmada, «lo devuelvo» vuelve al banco (y no se anula aparte) y el fondo cuadra con el papel completado",
  `${COMPRA}${MANDA}${RECIBE}${CIERRE_DEVUELVE}
${REVISA("compra_cierre_recibir")}
select pg_temp.intento(format($q$select retail.recibir_cierre_compras(%L, %L)$q$, :'cierre', current_setting('t.banco')));
${REVISA("plata_confirmar")}
select retail.confirmar_plata_compras(:'plata', null, current_setting('t.banco')::uuid) \\g /dev/null
${REVISA("compra_cierre_recibir")}
select r ->> 'monto' as monto, r ->> 'movimiento_id' as mov from retail.recibir_cierre_compras(:'cierre', current_setting('t.banco')::uuid) r \\gset
select :'monto';
select (retail.recibir_cierre_compras(:'cierre', current_setting('t.banco')::uuid) ->> 'ya_estaba');
${REVISA(null)}
select split_part(pg_temp.intento(format($q$select retail.anular_movimiento_fondo(%L, 'prueba')$q$, :'mov')), '|', 1);
reset role;
select retail.fn_fondo_saldo(retail.fn_fondo_de(current_setting('t.compradora')::uuid, false)), (select resuelto_en is not null from retail.compra_cierres where id = :'cierre');
${REVISA("papel_completar")}
select retail.completar_papel_compra(:'papel', null, 'F001', '9') \\g /dev/null
reset role;
select retail.fn_fondo_saldo(retail.fn_fondo_de(current_setting('t.compradora')::uuid, false));`,
  (o) => {
    const p = o.split(" / ");
    return p[0].startsWith("cierre_plata_por_confirmar|") && p.slice(1).join(" / ") === "200.00 / true / movimiento_de_cierre / 300.00|t / 0.00";
  },
);

caso(
  "si pagó de su bolsillo, Compras le paga desde la cuenta que elige y su fondo vuelve a cero",
  `${COMPRA}${MANDA}${RECIBE}
${como(SANDRA, { clave: "compra_terminar_dia" })}
select retail.terminar_dia_compras('se_queda') \\g /dev/null
reset role;
select id as cierre, decision, monto from retail.compra_cierres where persona_id = current_setting('t.compradora')::uuid \\gset
${REVISA("compra_cierre_recibir")}
select :'decision', :'monto', retail.recibir_cierre_compras(:'cierre', current_setting('t.banco')::uuid) ->> 'monto';
${REVISA("papel_completar")}
select retail.completar_papel_compra(:'papel', null, 'F001', '10') \\g /dev/null
reset role;
select retail.fn_fondo_saldo(retail.fn_fondo_de(current_setting('t.compradora')::uuid, false));`,
  "le_deben|300.00|300.00 / 0.00",
);

// Sandra anota un taxi de S/ 15 el día de su compra (sin papel) y una comida de S/ 12 sin papel.
const GASTOS = `
${como(SANDRA, { clave: "gasto_rapido" })}
select retail.registrar_gasto_rapido('aaaaaaaa-0480-4000-8000-0000000007c1', 'taxi', null, 15, null) \\g /dev/null
select retail.registrar_gasto_rapido('aaaaaaaa-0480-4000-8000-0000000007c2', 'comida', null, 12, null) \\g /dev/null
reset role;
`;
const REVISA_GASTO = (id, papel) => `retail.revisar_gasto_compra('${id}', '${papel}')`;

caso(
  "el taxi pasa a los gastos del viaje: pagado desde su fondo, a su compra del día y en la sede de la compra; repetir devuelve lo mismo",
  `${COMPRA}${GASTOS}
${REVISA("gasto_revisar")}
select (${REVISA_GASTO("aaaaaaaa-0480-4000-8000-0000000007c1", "planilla_movilidad")} ->> 'gasto_id') as gasto \\gset
select (${REVISA_GASTO("aaaaaaaa-0480-4000-8000-0000000007c1", "planilla_movilidad")} ->> 'gasto_id') = :'gasto';
reset role;
select gv.tipo || ':' || gv.concepto || ':' || gv.papel, g.monto_total, g.categoria, u.nombre,
       g.cuenta_dinero_id = retail.fn_fondo_de(current_setting('t.compradora')::uuid, false),
       (select count(*) from retail.gastos_viaje_ordenes x join retail.ordenes_compra o on o.id = x.orden_compra_id where x.gasto_id = g.id and o.papel_id = :'papel'),
       (select estado from retail.compra_gastos where id = 'aaaaaaaa-0480-4000-8000-0000000007c1'),
       retail.fn_fondo_saldo(retail.fn_fondo_de(current_setting('t.compradora')::uuid, false))
  from retail.gastos g join retail.gastos_viaje gv on gv.gasto_id = g.id join retail.ubicaciones u on u.id = g.ubicacion_id
 where g.id = :'gasto';`,
  "t / viaje:taxi:planilla_movilidad|15.00|viaje_compra|Tienda Trujillo|t|1|completado|-15.00",
);

caso(
  "la comida sin papel no pasa (solo taxi y cargador van con planilla); nadie revisa sus propios gastos; sin ninguna compra, espera",
  `${COMPRA}${GASTOS}
${REVISA("gasto_revisar")}
select split_part(pg_temp.intento($q$select ${REVISA_GASTO("aaaaaaaa-0480-4000-8000-0000000007c2", "planilla_movilidad")}$q$), '|', 1);
${como(SANDRA, { clave: "gasto_revisar" })}
select split_part(pg_temp.intento($q$select ${REVISA_GASTO("aaaaaaaa-0480-4000-8000-0000000007c1", "ticket")}$q$), '|', 1);
reset role;
insert into retail.compra_gastos (id, persona_id, concepto, monto, fecha, huella, registrado_por)
values ('aaaaaaaa-0480-4000-8000-0000000007c3', :'micaela_p', 'taxi', 10, retail.fn_hoy_lima(), 'x', :'micaela_p');
${REVISA("gasto_revisar")}
select split_part(pg_temp.intento($q$select ${REVISA_GASTO("aaaaaaaa-0480-4000-8000-0000000007c3", "planilla_movilidad")}$q$), '|', 1);`,
  "gasto_viaje_sin_papel / fondo_propio / gasto_sin_compra",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
