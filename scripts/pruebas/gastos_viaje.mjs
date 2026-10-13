#!/usr/bin/env node
/**
 * Prueba de los gastos del viaje (ADR-0362, fase 6 · actividad 3): `20261013221000_gastos_del_viaje_esquema.sql` y
 * `20261013222000_gastos_del_viaje_funciones.sql` (sobre las del fondo: 20261013181000, 182000 y 212000). Y de «Tu fondo» (actividad 4,
 * `20261013231000_tu_fondo_resumen.sql`), que junta todo lo que mueve el fondo.
 *
 * QUÉ PROMETE
 *   · El módulo Órdenes de compra es la llave: sin él no se registra ni se leen los gastos de una orden (42501).
 *   · Un gasto del viaje es un gasto: «Traer la mercadería» (609, la línea de fletes del Estado de resultados) o «Viaje de compra»
 *     (631), con su ficha de viaje (concepto y papel). Pagado desde «Mi fondo», baja el fondo y el Diario lo saca de la 1413; desde una
 *     cuenta de siempre (la caja fuerte), el fondo no cambia y el Diario lo saca de la 101.
 *   · A una o varias órdenes: con varias, el monto se reparte según el total de cada una, a céntimos, y lo que sobra va a la de mayor
 *     total; la suma es el gasto. Cada orden dice lo que costó traerla; un gasto anulado no cuenta y devuelve la plata al fondo.
 *   · Sin comprobante solo taxi o cargador, con planilla de movilidad (decisión 55), sin serie ni RUC; sin tope todavía.
 *   · Desde un fondo paga solo su dueña (tampoco el líder); el mismo token no duplica; lo inválido no se guarda.
 *   · La firma de la decisión 39: con el responsable obligatorio, una persona sin la clave `gasto_viaje_registrar` no guarda; con ella,
 *     firma ella.
 *   · «Tu fondo» (`fn_mi_fondo_resumen`): lo que le entregaron, lo que pagó a proveedores, lo que salió en gastos del viaje y lo que le
 *     queda, del mismo libro que el saldo (cuadra con él, «otros» en 0); si pagó de su bolsillo, el saldo en negativo. Solo lo suyo:
 *     otra persona no ve su fondo, una terminal no tiene.
 *
 * CÓMO. Como `fondos.mjs`: carga las migraciones dentro de cada caso (se pueden pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:gastos-viaje                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/gastos_viaje.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
const MIGRACION = [
  "20261013181000_fondos_por_rendir_esquema.sql",
  "20261013182000_fondos_por_rendir_funciones.sql",
  "20261013212000_fondos_pagar_desde_mi_fondo.sql",
  "20261013221000_gastos_del_viaje_esquema.sql",
  "20261013222000_gastos_del_viaje_funciones.sql",
  "20261013231000_tu_fondo_resumen.sql",
]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
// Solo de esta prueba: la cuenta de Ana, que compra y paga desde su fondo, y una terminal de Trujillo (no tiene fondo).
const ANA = "44444444-4444-4444-8444-0000000000a2";
const TERMINAL = "44444444-4444-4444-8444-0000000000f2";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const firma = (clave) => `select set_config('request.headers', '${JSON.stringify({ "x-responsable-omitido": clave })}', true) \\g /dev/null\n`;
const sinFirma = `select set_config('request.headers', '{}', true) \\g /dev/null\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
${sinCandadosDePegado(MIGRACION)}
set local search_path = retail, public, extensions;

-- «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- Lo que tiene una cuenta hoy, del mismo libro que «Cuentas y dinero».
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = p_id), 0)
       + coalesce((select sum(l.monto) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
                    where l.cuenta_id = p_id
                      and l.fecha >= coalesce((select c.saldo_desde from retail.cuentas_dinero c where c.id = p_id), '1900-01-01')), 0);
$f$;
-- Registrar un gasto del viaje: «OK» o «<sqlstate>|<hint>|<mensaje>» (lo fallido no deja nada).
create function pg_temp.gv(p_tipo text, p_concepto text, p_monto numeric, p_papel text, p_cuenta uuid, p_ordenes uuid[] default null,
                           p_medio text default 'efectivo', p_nota text default null, p_serie text default null, p_ruc text default null,
                           p_fecha date default null, p_token uuid default null) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_gasto_viaje(p_tipo, p_concepto, p_monto, coalesce(p_fecha, retail.fn_hoy_lima()), p_papel, p_medio, p_cuenta,
                                       p_ordenes, p_serie, p_ruc, p_nota, p_token);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- El asiento del Diario de un gasto: «cuenta:debe:haber», en orden de cuenta.
create function pg_temp.asiento(p_gasto uuid) returns text language sql as $f$
  select string_agg(a.cuenta || ':' || a.debe::numeric(12, 2) || ':' || a.haber::numeric(12, 2), ',' order by a.cuenta)
    from retail.fn_asientos(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), null) a where a.asiento = 'gasto:' || p_gasto;
$f$;

-- Como en producción: el responsable obligatorio. Se apaga en los casos de pago (Ana firma con su cuenta sin marcar asistencia) y se
-- prende en el de la firma.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba gastos del viaje', 'banco', '104', 5000, retail.fn_hoy_lima() - 30, 60) returning id as bcp \\gset
-- Ana, integrante de Trujillo con cuenta propia, con Órdenes de compra en su rol; Felipe le entrega S/ 500 a su fondo.
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
insert into auth.users (id, aud, role, email) values ('${ANA}', 'authenticated', 'authenticated', 'ana-gastos-viaje@prueba.local');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id) values ('Ana', 'Prueba Viaje', :'sede_base', '${ANA}') returning id as ana_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'ana_p', 'colaborador', retail.fn_rol_por_clave('integrante'), :'tru', 'activo');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra') on conflict do nothing;
${como(FELIPE)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 500, 'Viaje a Gamarra', null, null) as entrega \\gset
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
-- Las órdenes de la prueba: O1 = 3 × 100 = 300, O2 = 1 × 100 = 100, O4 = 1 × 50 = 50 (a Trujillo) y O3 anulada.
insert into retail.proveedores (nombre) values ('GV Proveedor Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('GV Marca Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('GV Polos Prueba', 'indumentaria') returning id as cat \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'ana_p') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (:'o1', 1, :'cat', :'marca', 3, 100);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'ana_p') returning id as o2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (:'o2', 1, :'cat', :'marca', 1, 100);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'ana_p') returning id as o4 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (:'o4', 1, :'cat', :'marca', 1, 50);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'tru', :'ana_p', 'anulada', :'felipe_p', now(), 'Se pidió dos veces') returning id as o3 \\gset
${como(ANA)}${sinFirma}
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;
// Los gastos escritos en ESTE caso (dentro de la transacción `now()` no cambia).
const NUEVOS = "(select count(*) from retail.gastos g where g.created_at = now())";
// El último gasto del viaje de la prueba.
const ULTIMO = "(select g.id from retail.gastos g join retail.gastos_viaje v on v.gasto_id = g.id where g.created_at = now() order by g.descripcion desc limit 1)";

const CASOS = [
  {
    nombre: "sin el módulo Órdenes de compra no se registra ni se leen los gastos de una orden (42501)",
    sql: `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'ordenes_compra';
select 'registrar|' || pg_temp.gv('mercaderia', 'flete', 60, 'boleta', :'fondo', array[:'o1']::uuid[]);
select 'leer|' || pg_temp.intento(format('select * from retail.fn_gastos_viaje_de_orden(%L)', :'o1'));
select 'ordenes|' || pg_temp.intento('select * from retail.fn_gastos_viaje_ordenes()');`,
    revisa: (s) =>
      ["registrar", "leer", "ordenes"].filter((k) => !new RegExp(`^${k}\\|42501\\|`, "m").test(s)).map((k) => `${k}: se esperaba 42501 — ${linea(k)(s)}`),
  },
  {
    nombre: "desde «Mi fondo», ligado a una orden: baja el fondo, es «Traer la mercadería» (609) y el Diario lo saca de la 1413",
    sql: `select pg_temp.saldo(:'fondo') as antes \\gset
select retail.registrar_gasto_viaje('mercaderia', 'flete', 60, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', array[:'o1']::uuid[],
  'b001-77', null, 'Shalom a Trujillo', null) as g \\gset
select 'gasto|' || g.categoria || '|' || g.descripcion || '|' || g.monto_total || '|' || coalesce(g.medio_pago, '-') || '|' || (g.cuenta_dinero_id = :'fondo')::text
  || '|' || (g.caja_movimiento_id is null)::text || '|' || (g.registrado_por = :'ana_p')::text || '|' || (g.ubicacion_id = :'tru')::text
  from retail.gastos g where g.id = :'g';
select 'ficha|' || v.tipo || '|' || v.concepto || '|' || v.papel || '|' || coalesce(v.serie_numero, '-') from retail.gastos_viaje v where v.gasto_id = :'g';
select 'fondo|' || (:'antes'::numeric - pg_temp.saldo(:'fondo'));
select 'orden|' || count(*) || '|' || coalesce(sum(o.monto), 0) || '|' || bool_and(o.de_fondo)::text || '|' || string_agg(o.concepto, ',')
  from retail.fn_gastos_viaje_de_orden(:'o1') o;
${como(FELIPE)}${sinFirma}
select 'diario|' || pg_temp.asiento(:'g');
select 'tablero|' || f.gastado from retail.fn_fondos() f where f.persona_id = :'ana_p';`,
    revisa: (s) => {
      const e = [];
      if (!/^gasto\|traer_mercaderia\|Flete · Shalom a Trujillo\|60\.00\|efectivo\|true\|true\|true\|true$/m.test(s)) e.push(`gasto — ${linea("gasto")(s)}`);
      if (!/^ficha\|mercaderia\|flete\|boleta\|B001-77$/m.test(s)) e.push(`ficha — ${linea("ficha")(s)}`);
      if (!/^fondo\|60\.00$/m.test(s)) e.push(`el fondo debía bajar 60 — ${linea("fondo")(s)}`);
      if (!/^orden\|1\|60\.00\|true\|flete$/m.test(s)) e.push(`la orden debía decir que traerla costó 60 — ${linea("orden")(s)}`);
      if (!/^diario\|1413:0\.00:60\.00,609:60\.00:0\.00$/m.test(s)) e.push(`el Diario debía ser 609 contra 1413 — ${linea("diario")(s)}`);
      if (!/^tablero\|60\.00$/m.test(s)) e.push(`el tablero de Fondos debía decir que gastó 60 — ${linea("tablero")(s)}`);
      return e;
    },
  },
  {
    nombre: "a varias órdenes: se reparte según el total de cada una, a céntimos, y lo que sobra va a la de mayor total",
    sql: `select retail.registrar_gasto_viaje('mercaderia', 'cargador', 100, retail.fn_hoy_lima(), 'ticket', 'efectivo', :'fondo',
  array[:'o1', :'o2']::uuid[], null, null, null, null) as g1 \\gset
select retail.registrar_gasto_viaje('mercaderia', 'embalaje', 10, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo',
  array[:'o1', :'o2', :'o4', :'o1']::uuid[], null, null, null, null) as g2 \\gset
select 'dos|' || string_agg(case x.orden_compra_id when :'o1' then 'O1' when :'o2' then 'O2' end || ':' || x.monto, ',' order by x.monto desc)
  from retail.gastos_viaje_ordenes x where x.gasto_id = :'g1';
select 'tres|' || string_agg(case x.orden_compra_id when :'o1' then 'O1' when :'o2' then 'O2' when :'o4' then 'O4' end || ':' || x.monto, ',' order by x.monto desc)
  || '|' || sum(x.monto) from retail.gastos_viaje_ordenes x where x.gasto_id = :'g2';
select 'o2|' || coalesce(sum(o.monto), 0) || '|' || string_agg(o.ordenes::text, ',' order by o.monto) from retail.fn_gastos_viaje_de_orden(:'o2') o;`,
    revisa: (s) => [
      !/^dos\|O1:75\.00,O2:25\.00$/m.test(s) && `100 entre 300 y 100: 75 y 25 — ${linea("dos")(s)}`,
      !/^tres\|O1:6\.67,O2:2\.22,O4:1\.11\|10\.00$/m.test(s) && `10 entre 300, 100 y 50: 6.67, 2.22, 1.11 (suma 10) — ${linea("tres")(s)}`,
      !/^o2\|27\.22\|3,2$/m.test(s) && `O2 recibe 2.22 + 25 de dos gastos (de 3 y 2 órdenes) — ${linea("o2")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el papel: planilla de movilidad solo para taxi o cargador (sin serie ni RUC); el viaje va a «Viaje de compra» (631)",
    sql: `select 'taxi|' || pg_temp.gv('viaje', 'taxi', 15, 'planilla_movilidad', :'fondo');
select 'cargador|' || pg_temp.gv('mercaderia', 'cargador', 20, 'planilla_movilidad', :'fondo', array[:'o1']::uuid[]);
select 'comida|' || pg_temp.gv('viaje', 'comida', 20, 'planilla_movilidad', :'fondo');
select 'flete|' || pg_temp.gv('mercaderia', 'flete', 20, 'planilla_movilidad', :'fondo');
select 'con_serie|' || pg_temp.gv('viaje', 'taxi', 15, 'planilla_movilidad', :'fondo', null, 'efectivo', null, 'B1-1');
select retail.registrar_gasto_viaje('viaje', 'hotel', 120, retail.fn_hoy_lima(), 'factura', 'efectivo', :'fondo', null, 'f001-55', '20123456789',
  'Hostal Gamarra', null) as h \\gset
select 'hotel|' || g.categoria || '|' || v.papel || '|' || v.serie_numero || '|' || v.ruc_emisor || '|' || g.igv
  from retail.gastos g join retail.gastos_viaje v on v.gasto_id = g.id where g.id = :'h';
select 'sin_orden|' || count(*) from retail.gastos_viaje_ordenes where gasto_id = :'h';
${como(FELIPE)}${sinFirma}
select 'diario|' || pg_temp.asiento(:'h');`,
    revisa: (s) => {
      const e = [];
      if (!/^taxi\|OK$/m.test(s)) e.push(`taxi con planilla — ${linea("taxi")(s)}`);
      if (!/^cargador\|OK$/m.test(s)) e.push(`cargador con planilla — ${linea("cargador")(s)}`);
      for (const k of ["comida", "flete"]) if (!new RegExp(`^${k}\\|P0001\\|gasto_viaje_sin_papel\\|Sin comprobante solo se acepta taxi o cargador`, "m").test(s)) e.push(`${k} — ${linea(k)(s)}`);
      if (!/^con_serie\|P0001\|\|Una planilla de movilidad no lleva serie ni RUC/m.test(s)) e.push(`con_serie — ${linea("con_serie")(s)}`);
      if (!/^hotel\|viaje_compra\|factura\|F001-55\|20123456789\|0\.00$/m.test(s)) e.push(`hotel — ${linea("hotel")(s)}`);
      if (!/^sin_orden\|0$/m.test(s)) e.push(`un gasto del viaje puede no ir a ninguna orden — ${linea("sin_orden")(s)}`);
      if (!/^diario\|1413:0\.00:120\.00,631:120\.00:0\.00$/m.test(s)) e.push(`el Diario del hotel debía ser 631 contra 1413 — ${linea("diario")(s)}`);
      return e;
    },
  },
  {
    nombre: "desde una cuenta de siempre (la caja fuerte de su tienda): el fondo no cambia y el Diario lo saca de la 101",
    sql: `select pg_temp.saldo(:'fondo') as antes \\gset
select retail.registrar_gasto_viaje('mercaderia', 'agencia', 45, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fuerte_tru',
  array[:'o2']::uuid[], null, null, null, null) as g \\gset
select 'cuenta|' || (g.cuenta_dinero_id = :'fuerte_tru')::text || '|' || (pg_temp.saldo(:'fondo') = :'antes'::numeric)::text from retail.gastos g where g.id = :'g';
select 'orden|' || bool_or(o.de_fondo)::text || '|' || string_agg(o.cuenta_nombre, ',') from retail.fn_gastos_viaje_de_orden(:'o2') o where o.gasto_id = :'g';
${como(FELIPE)}${sinFirma}
select 'diario|' || pg_temp.asiento(:'g');`,
    revisa: (s) => [
      !/^cuenta\|true\|true$/m.test(s) && `cuenta — ${linea("cuenta")(s)}`,
      !/^orden\|false\|Caja fuerte/m.test(s) && `orden — ${linea("orden")(s)}`,
      !/^diario\|101:0\.00:45\.00,609:45\.00:0\.00$/m.test(s) && `diario — ${linea("diario")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "desde un fondo paga solo su dueña: el líder no anota un gasto en el fondo de Ana",
    sql: `${como(FELIPE)}${sinFirma}
select 'lider|' || pg_temp.gv('mercaderia', 'flete', 30, 'boleta', :'fondo', array[:'o1']::uuid[]);
select 'nuevos|' || ${NUEVOS};`,
    revisa: (s) => [
      !/^lider\|42501\|fondo_ajeno\|Desde un fondo paga solo su dueña/m.test(s) && `lider — ${linea("lider")(s)}`,
      !/^nuevos\|0$/m.test(s) && `no debía escribirse ningún gasto — ${linea("nuevos")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el mismo token no duplica; lo inválido no se guarda",
    sql: `select gen_random_uuid() as tok \\gset
select retail.registrar_gasto_viaje('viaje', 'pasaje', 35, retail.fn_hoy_lima(), 'ticket', 'efectivo', :'fondo', null, null, null, null, :'tok') as a \\gset
select retail.registrar_gasto_viaje('viaje', 'pasaje', 35, retail.fn_hoy_lima(), 'ticket', 'efectivo', :'fondo', null, null, null, null, :'tok') as b \\gset
select 'igual|' || (:'a' = :'b')::text || '|' || (select count(*) from retail.gastos where token_cliente = :'tok');
select 'cero|' || pg_temp.gv('viaje', 'pasaje', 0, 'ticket', :'fondo');
select 'futura|' || pg_temp.gv('viaje', 'pasaje', 10, 'ticket', :'fondo', null, 'efectivo', null, null, null, retail.fn_hoy_lima() + 1);
select 'otro|' || pg_temp.gv('viaje', 'otro', 10, 'ticket', :'fondo');
select 'cruzado|' || pg_temp.gv('mercaderia', 'hotel', 10, 'boleta', :'fondo');
select 'anulada|' || pg_temp.gv('mercaderia', 'flete', 10, 'boleta', :'fondo', array[:'o3']::uuid[]);
select 'ruc|' || pg_temp.gv('mercaderia', 'flete', 10, 'factura', :'fondo', null, 'efectivo', null, 'F1-1', '2012345');
select 'tarjeta|' || pg_temp.gv('mercaderia', 'flete', 10, 'boleta', :'fondo', null, 'tarjeta');
select 'nuevos|' || ${NUEVOS};`,
    revisa: (s) => {
      const espera = {
        cero: "El monto tiene que ser mayor que cero",
        futura: "La fecha del gasto no puede ser futura",
        otro: "Con «Otro», escribe qué se pagó",
        cruzado: "Elige qué se pagó",
        anulada: "Una de las órdenes está anulada",
        ruc: "El RUC tiene 11 números",
        tarjeta: "Desde un fondo se paga en efectivo, Yape, Plin, transferencia o depósito",
      };
      const e = Object.entries(espera).filter(([k, txt]) => !linea(k)(s).includes(txt)).map(([k]) => linea(k)(s));
      if (!/^igual\|true\|1$/m.test(s)) e.push(`el segundo intento debía devolver el mismo gasto — ${linea("igual")(s)}`);
      if (!/^nuevos\|1$/m.test(s)) e.push(`solo debía quedar el gasto del token — ${linea("nuevos")(s)}`);
      return e;
    },
  },
  {
    nombre: "un gasto anulado no cuenta en la orden y le devuelve la plata al fondo",
    sql: `select pg_temp.saldo(:'fondo') as antes \\gset
select retail.registrar_gasto_viaje('mercaderia', 'flete', 80, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', array[:'o4']::uuid[],
  null, null, null, null) as g \\gset
select 'con|' || coalesce(sum(o.monto), 0) || '|' || (:'antes'::numeric - pg_temp.saldo(:'fondo')) from retail.fn_gastos_viaje_de_orden(:'o4') o;
${como(FELIPE)}${sinFirma}
select retail.anular_gasto(:'g', 'Se anotó dos veces') as _a \\gset
${como(ANA)}${sinFirma}
select 'sin|' || coalesce(sum(o.monto), 0) || '|' || (:'antes'::numeric - pg_temp.saldo(:'fondo')) from retail.fn_gastos_viaje_de_orden(:'o4') o;`,
    revisa: (s) => [
      !/^con\|80\.00\|80\.00$/m.test(s) && `con — ${linea("con")(s)}`,
      !/^sin\|0\|0\.00$/m.test(s) && `anulado no cuenta y la plata vuelve — ${linea("sin")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "las órdenes para elegir: las que no están anuladas, con su número y su total",
    sql: `select 'elegir|' || string_agg(case o.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' when :'o4' then 'O4' end || ':' || o.total,
  ',' order by o.total desc) || '|' || bool_and(o.numero like 'OC-%')::text
  from retail.fn_gastos_viaje_ordenes() o where o.id in (:'o1', :'o2', :'o3', :'o4');`,
    revisa: (s) => [!/^elegir\|O1:300\.00,O2:100\.00,O4:50\.00\|true$/m.test(s) && `elegir — ${linea("elegir")(s)}`].filter(Boolean),
  },
  {
    nombre: "la firma (decisión 39): con el responsable obligatorio, sin la clave de la acción no se guarda; con ella, firma ella",
    sql: `update retail.configuracion_empresa set exige_responsable = true;
select 'sin_clave|' || pg_temp.gv('viaje', 'pasaje', 30, 'ticket', :'fondo');
${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'pasaje', 30, retail.fn_hoy_lima(), 'ticket', 'efectivo', :'fondo', null, null, null, null, null) as g \\gset
select 'firma|' || (registrado_por = :'ana_p')::text from retail.gastos where id = :'g';
select 'clave|' || count(*) from retail.acciones_sin_responsable where clave = 'gasto_viaje_registrar';`,
    revisa: (s) => [
      !/^sin_clave\|42501\|responsable_requerido\|/m.test(s) && `sin la clave debía pedir el responsable — ${linea("sin_clave")(s)}`,
      !/^firma\|true$/m.test(s) && `el gasto debía quedar firmado por Ana — ${linea("firma")(s)}`,
      !/^clave\|1$/m.test(s) && `falta la clave gasto_viaje_registrar — ${linea("clave")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "«Tu fondo»: le entregaron, pagó a proveedores, gastos del viaje y le queda, del mismo libro que el saldo; solo lo suyo",
    sql: `-- Un comprobante a crédito de Trujillo que Ana paga desde su fondo (Por pagar en su rol), y un flete del viaje.
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'por_pagar') on conflict do nothing;
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (:'prov', 'factura', 'FGV', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), retail.fn_hoy_lima() - 2, 'credito',
          retail.fn_hoy_lima() + 20, 1000, 180, 1180, 'mercaderia', :'tru') returning id as compra \\gset
select (retail.registrar_pagos_compra(:'compra', jsonb_build_array(jsonb_build_object('monto', 300, 'metodo', 'efectivo', 'cuenta_id', :'fondo')),
                                      null, gen_random_uuid()))[1] as pago \\gset
select retail.registrar_gasto_viaje('mercaderia', 'flete', 80, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', array[:'o1']::uuid[],
  null, null, null, null) as g \\gset
select 'tu|' || r.saldo || '|' || r.entregado || '|' || r.devuelto || '|' || r.pagado || '|' || r.gastos || '|' || r.otros || '|' || r.para_que
  || '|' || (r.desde = retail.fn_hoy_lima())::text || '|' || (r.saldo = pg_temp.saldo(:'fondo'))::text || '|' || (r.cuenta_id = :'fondo')::text
  from retail.fn_mi_fondo_resumen() r;
-- De su bolsillo: otros 300 con 120 en el fondo → el saldo queda en −180 (CAYLA le debe).
select (retail.registrar_pagos_compra(:'compra', jsonb_build_array(jsonb_build_object('monto', 300, 'metodo', 'efectivo', 'cuenta_id', :'fondo')),
                                      null, gen_random_uuid()))[1] as pago2 \\gset
select 'debe|' || r.saldo || '|' || r.pagado || '|' || r.otros from retail.fn_mi_fondo_resumen() r;
${como(FELIPE)}${sinFirma}
select 'otra|' || count(*) from retail.fn_mi_fondo_resumen() r where r.cuenta_id = :'fondo';
insert into auth.users (id, aud, role, email) values ('${TERMINAL}', 'authenticated', 'authenticated', 'terminal-gastos-viaje@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'tru', 'ZZ Terminal gastos del viaje', retail.fn_rol_por_clave('terminal_administrativa'), '${TERMINAL}');
${como(TERMINAL)}${sinFirma}
select 'terminal|' || count(*) from retail.fn_mi_fondo_resumen() r;`,
    revisa: (s) => [
      !/^tu\|120\.00\|500\.00\|0\|300\.00\|80\.00\|0\.00\|Viaje a Gamarra\|true\|true\|true$/m.test(s) &&
        `le entregaron 500, pagó 300 y gastó 80: le quedan 120, igual que el saldo — ${linea("tu")(s)}`,
      !/^debe\|-180\.00\|600\.00\|0\.00$/m.test(s) && `pagando de su bolsillo el saldo queda en −180 — ${linea("debe")(s)}`,
      !/^otra\|0$/m.test(s) && `otra persona no ve el fondo de Ana — ${linea("otra")(s)}`,
      !/^terminal\|0$/m.test(s) && `una terminal no tiene fondo — ${linea("terminal")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el Estado de resultados: el flete va a la línea de fletes y el viaje a gastos de operación (la prenda no cambia)",
    sql: `${como(FELIPE)}${sinFirma}
select coalesce(sum(e.fletes), 0) as fl0, coalesce(sum(e.gastos_operacion), 0) as go0
  from retail.fn_estado_resultados(date_trunc('month', retail.fn_hoy_lima())::date, retail.fn_hoy_lima(), :'tru') e \\gset
select coalesce(sum(costo), 0) as costo0 from retail.variantes \\gset
${como(ANA)}${sinFirma}
select retail.registrar_gasto_viaje('mercaderia', 'flete', 70, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', array[:'o1']::uuid[], null, null, null, null) as _f \\gset
select retail.registrar_gasto_viaje('viaje', 'comida', 25, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', null, null, null, null, null) as _c \\gset
${como(FELIPE)}${sinFirma}
select 'resultados|' || (coalesce(sum(e.fletes), 0) - :'fl0'::numeric) || '|' || (coalesce(sum(e.gastos_operacion), 0) - :'go0'::numeric)
  from retail.fn_estado_resultados(date_trunc('month', retail.fn_hoy_lima())::date, retail.fn_hoy_lima(), :'tru') e;
select 'prenda|' || ((select coalesce(sum(costo), 0) from retail.variantes) = :'costo0'::numeric)::text;`,
    revisa: (s) => [
      !/^resultados\|70\.00\|25\.00$/m.test(s) && `fletes +70 y gastos de operación +25 en Trujillo — ${linea("resultados")(s)}`,
      !/^prenda\|true$/m.test(s) && `el costo de las prendas no debía cambiar — ${linea("prenda")(s)}`,
    ].filter(Boolean),
  },
];

let fallas = 0;
for (const caso of CASOS) {
  const r = correr(`${PRELUDIO}\n${caso.sql}\nrollback;\n`);
  if (!r.ok) {
    fallas++;
    console.log(`✗ ${caso.nombre}\n    la base respondió con error:\n    ${r.mensaje.split("\n").slice(0, 6).join("\n    ")}`);
    continue;
  }
  const errores = caso.revisa(r.salida);
  if (errores.length) {
    fallas++;
    console.log(`✗ ${caso.nombre}\n    ${errores.join("\n    ")}`);
  } else {
    console.log(`✓ ${caso.nombre}`);
  }
}
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de gastos del viaje pasan.`);
process.exit(fallas ? 1 : 0);
