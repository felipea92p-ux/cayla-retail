#!/usr/bin/env node
/**
 * Prueba de la rendición del fondo (ADR-0362, fase 6 · actividad 5): `20261013233000_gastos_viaje_fotos.sql`,
 * `20261013234000_gastos_viaje_fotos_bucket.sql` (sin Storage solo avisa) y `20261013235000_rendicion_del_fondo.sql`, sobre las del fondo
 * y los gastos del viaje (181000, 182000, 212000, 221000, 222000 y 231000).
 *
 * QUÉ PROMETE
 *   · Rendir congela lo que dijo el sistema (tenías, te entregaron, pagaste, gastos, deberías tener), cuenta los papeles sin foto y deja
 *     lo que se anota después para el ciclo siguiente (el ciclo se corta por qué filas se rindieron, no por la hora). Una sola abierta.
 *   · Aprobar sin faltante no mueve el fondo y el ciclo siguiente arranca con lo que la persona se quedó. Un faltante con explicación lo
 *     decide quien aprueba (lo asume CAYLA → 6599; deuda de la persona → 1419); sin explicación, siempre deuda (decisión 54). El faltante
 *     sale del fondo y es parte de su rendición, no del ciclo que sigue. «Cuentas y dinero» no lo anula.
 *   · No aprueba: la dueña (33), quien le entregó plata en esa rendición (35), quien no tiene Fondos por rendir; la de un líder, solo un
 *     Admin (33).
 *   · Lo rendido queda congelado: ni el gasto ni la entrega se anulan mientras estén en una rendición vigente; devuelta, sí.
 *   · Devolver: quien aprueba la devuelve con motivo y la dueña la retira con su cuenta; sus filas vuelven al ciclo.
 *   · No se rinde: más plata de la que dice el fondo, desde una terminal, sin nada nuevo. El mismo token no duplica.
 *   · Con el fondo en negativo (CAYLA le debe, decisión 32) rinde en cero, sin faltante.
 *   · Las fotos de un gasto del viaje: las suma la dueña o quien tiene Órdenes de compra, en la carpeta de su gasto; la rendición las
 *     cuenta. El tablero de quien aprueba dice por qué alguien no puede aprobar.
 *
 * CÓMO. Como `fondos.mjs`: carga las migraciones dentro de cada caso (se pueden pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:rendicion-fondo                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/rendicion_fondo.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
  "20261013233000_gastos_viaje_fotos.sql",
  "20261013234000_gastos_viaje_fotos_bucket.sql",
  "20261013235000_rendicion_del_fondo.sql",
  // /formidable 2026-10-14, cambio 3: quién aprueba en palabras de tienda y «Ver tu rendición» con su explicación.
  "20261014222000_fondos_rendicion_textos.sql",
]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo, sin Fondos por rendir
// Solo de esta prueba: Ana compra (integrante con su cuenta); Beto le entrega la plata y tiene su propio fondo (líder, no Admin); Carla
// es líder y Admin; Dani es líder y no es Admin; y una terminal de Trujillo.
const ANA = "44444444-4444-4444-8444-0000000000a3";
const BETO = "44444444-4444-4444-8444-0000000000b3";
const CARLA = "44444444-4444-4444-8444-0000000000c3";
const DANI = "44444444-4444-4444-8444-0000000000d3";
const TERMINAL = "44444444-4444-4444-8444-0000000000f3";

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

const persona = (auth, nombre, email, { rolPersona = "integrante", rolColab = "colaborador", clave = "integrante" } = {}) => `
insert into auth.users (id, aud, role, email) values ('${auth}', 'authenticated', 'authenticated', '${email}');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id, rol) values ('${nombre}', 'Prueba Rendición', :'sede_base', '${auth}', '${rolPersona}') returning id as ${nombre.toLowerCase()}_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'${nombre.toLowerCase()}_p', '${rolColab}', retail.fn_rol_por_clave('${clave}'), :'tru', 'activo');
`;

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
       + coalesce((select sum(l.monto) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = p_id), 0);
$f$;
-- El asiento del Diario de un movimiento de dinero: «cuenta:debe:haber», en orden de cuenta.
create function pg_temp.asiento(p_mov uuid) returns text language sql as $f$
  select string_agg(a.cuenta || ':' || a.debe::numeric(12, 2) || ':' || a.haber::numeric(12, 2), ',' order by a.cuenta)
    from retail.fn_asientos(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), null) a where a.asiento = 'dinero:' || p_mov;
$f$;

-- Como en producción el responsable puede ser obligatorio: se apaga para que cada persona firme con su cuenta sin marcar asistencia.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba rendición', 'banco', '104', 9000, retail.fn_hoy_lima() - 30, 60) returning id as bcp \\gset
${persona(ANA, "Ana", "ana-rendicion@prueba.local")}
${persona(BETO, "Beto", "beto-rendicion@prueba.local", { rolColab: "lider", clave: "lider" })}
${persona(CARLA, "Carla", "carla-rendicion@prueba.local", { rolPersona: "admin", rolColab: "lider", clave: "lider" })}
${persona(DANI, "Dani", "dani-rendicion@prueba.local", { rolColab: "lider", clave: "lider" })}
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra'), (retail.fn_rol_por_clave('integrante'), 'por_pagar')
  on conflict do nothing;
-- Beto le entrega S/ 500 a Ana. Ana paga S/ 300 de un comprobante y anota un flete de S/ 80, las dos cosas desde su fondo.
${como(BETO)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 500, 'Compras Gamarra', null, null) as entrega \\gset
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (:'prov', 'factura', 'FRF', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), retail.fn_hoy_lima() - 2, 'credito',
          retail.fn_hoy_lima() + 20, 1000, 180, 1180, 'mercaderia', :'tru') returning id as compra \\gset
${como(ANA)}${sinFirma}
select (retail.registrar_pagos_compra(:'compra', jsonb_build_array(jsonb_build_object('monto', 300, 'metodo', 'efectivo', 'cuenta_id', :'fondo')),
                                      null, gen_random_uuid()))[1] as pago \\gset
select retail.registrar_gasto_viaje('mercaderia', 'flete', 80, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', null, null, null, null, null) as g80 \\gset
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;
// Rendir como Ana (firma «fondo_rendir»): «<id>» o el error.
const rinde = (efectivo, explicacion = "null", token = "null") =>
  `${como(ANA)}${firma("fondo_rendir")}select retail.rendir_fondo(${efectivo}, ${explicacion}, ${token}) as r \\gset\n`;
// Aprobar la rendición `:r` como otra persona (firma «fondo_rendicion_aprobar»): la línea «<etiqueta>|SIN_ERROR» o el error.
const aprueba = (etiqueta, auth, decision = "null", nota = "null") =>
  `${como(auth)}${firma("fondo_rendicion_aprobar")}select '${etiqueta}|' || pg_temp.intento(format('select retail.aprobar_rendicion_fondo(%L, %s, %s)', :'r', ${
    decision === "null" ? "'null'" : `quote_literal(${decision})`
  }, ${nota === "null" ? "'null'" : `quote_literal(${nota})`}));\n`;

const CASOS = [
  {
    nombre: "rendir congela lo que dijo el sistema, cuenta los papeles sin foto, y lo de después va al ciclo siguiente; una sola abierta",
    sql: `${rinde(120)}
select 'r|' || r.estado || '|' || r.arrastre || '|' || r.entregado || '|' || r.devuelto || '|' || r.pagado || '|' || r.gastos || '|' || r.otros
  || '|' || r.saldo || '|' || r.efectivo || '|' || r.faltante || '|' || r.items || '|' || r.sin_foto || '|' || (r.rendida_por = :'ana_p')::text
  from retail.rendiciones_fondo r where r.id = :'r';
select 'tu|' || t.items || '|' || t.arrastre || '|' || (t.rendicion_id = :'r')::text || '|' || (select x.saldo from retail.fn_mi_fondo_resumen() x)
  from retail.fn_mi_fondo_rendicion() t;
select retail.registrar_gasto_viaje('viaje', 'taxi', 15, retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) as taxi \\gset
select 'despues|' || (select count(*) from retail.rendicion_fondo_items i where i.rendicion_id = :'r' and i.clave = 'gasto:' || :'taxi')
  || '|' || (select t.items from retail.fn_mi_fondo_rendicion() t) || '|' || (select string_agg(c.clave, ',') from retail.fn_mi_ciclo_fondo() c);
${firma("fondo_rendir")}
select 'otra|' || pg_temp.intento('select retail.rendir_fondo(105, null, null)');`,
    revisa: (s) => [
      !/^r\|por_aprobar\|0\.00\|500\.00\|0\.00\|300\.00\|80\.00\|0\.00\|120\.00\|120\.00\|0\.00\|3\|2\|true$/m.test(s) &&
        `la rendición debía congelar 500 − 300 − 80 = 120, sin faltante, 3 filas y 2 papeles sin foto — ${linea("r")(s)}`,
      !/^tu\|0\|120\.00\|true\|120\.00$/m.test(s) && `«Tu fondo» debía decir ciclo vacío, que trae 120 y la rendición por aprobar — ${linea("tu")(s)}`,
      !/^despues\|0\|1\|gasto:/m.test(s) && `el taxi de después no entra en la rendición: va al ciclo que sigue — ${linea("despues")(s)}`,
      !/^otra\|P0001\|rendicion_abierta\|Ya rendiste/m.test(s) && `con una abierta no se rinde otra — ${linea("otra")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "aprobar sin faltante: queda aprobada, el fondo no se mueve y el ciclo siguiente arranca con lo que se quedó",
    sql: `${rinde(120)}
${aprueba("aprueba", FELIPE, "null", "'Todo en orden'")}
select 'r|' || r.estado || '|' || coalesce(r.decision, '-') || '|' || r.nota || '|' || (r.aprobada_por = (select p.id from public.personas p where p.auth_user_id = '${FELIPE}'))::text
  from retail.rendiciones_fondo r where r.id = :'r';
select 'faltantes|' || count(*) from retail.movimientos_dinero d where d.rendicion_id = :'r';
${como(ANA)}${sinFirma}
select 'tu|' || t.saldo || '|' || x.arrastre || '|' || x.items || '|' || coalesce(x.rendicion_id::text, '-') || '|' || (t.desde = retail.fn_hoy_lima())::text
  from retail.fn_mi_fondo_resumen() t, retail.fn_mi_fondo_rendicion() x;`,
    revisa: (s) => [
      !/^aprueba\|SIN_ERROR$/m.test(s) && `Felipe (no entregó, tiene Fondos) aprueba — ${linea("aprueba")(s)}`,
      !/^r\|aprobada\|-\|Todo en orden\|true$/m.test(s) && `r — ${linea("r")(s)}`,
      !/^faltantes\|0$/m.test(s) && `sin faltante no hay movimiento — ${linea("faltantes")(s)}`,
      !/^tu\|120\.00\|120\.00\|0\|-\|true$/m.test(s) && `el ciclo nuevo trae los 120 que se quedó, desde hoy — ${linea("tu")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "faltante con explicación: lo decide quien aprueba; si lo asume CAYLA sale del fondo hacia la 6599 y es parte de su rendición",
    sql: `${rinde(100, "'Se me cayó un billete'")}
select 'falta|' || r.faltante || '|' || r.explicacion from retail.rendiciones_fondo r where r.id = :'r';
${aprueba("sin_decidir", FELIPE)}
${aprueba("asume", FELIPE, "'asume_cayla'")}
select d.id as mov from retail.movimientos_dinero d where d.rendicion_id = :'r' \\gset
select 'mov|' || d.tipo || '|' || d.monto || '|' || (d.cuenta_origen_id = :'fondo')::text || '|' || (d.cuenta_destino_id is null)::text
  from retail.movimientos_dinero d where d.id = :'mov';
select 'saldo|' || pg_temp.saldo(:'fondo');
select 'diario|' || pg_temp.asiento(:'mov');
select 'cuadra|' || count(*) from retail.fn_asientos_descuadrados(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima()) d where d.asiento = 'dinero:' || :'mov';
select 'cuentas|' || pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, %L)', :'mov', 'error'));
${como(ANA)}${sinFirma}
select 'tu|' || t.saldo || '|' || x.arrastre || '|' || x.items || '|' || x.deuda from retail.fn_mi_fondo_resumen() t, retail.fn_mi_fondo_rendicion() x;`,
    revisa: (s) => [
      !/^falta\|20\.00\|Se me cayó un billete$/m.test(s) && `falta — ${linea("falta")(s)}`,
      !/^sin_decidir\|P0001\|\|Elige si el faltante lo asume CAYLA/m.test(s) && `con explicación hay que decidir — ${linea("sin_decidir")(s)}`,
      !/^asume\|SIN_ERROR$/m.test(s) && `asume — ${linea("asume")(s)}`,
      !/^mov\|faltante_fondo_asumido\|20\.00\|true\|true$/m.test(s) && `el faltante sale del fondo y no va a ninguna cuenta — ${linea("mov")(s)}`,
      !/^saldo\|100\.00$/m.test(s) && `el fondo queda con lo que de verdad tiene — ${linea("saldo")(s)}`,
      !/^diario\|1413:0\.00:20\.00,6599:20\.00:0\.00$/m.test(s) && `el Diario debía ser 6599 contra 1413 — ${linea("diario")(s)}`,
      !/^cuadra\|0$/m.test(s) && `el asiento del faltante debía cuadrar — ${linea("cuadra")(s)}`,
      !/^cuentas\|P0001\|\|El faltante de una rendición aprobada no se anula/m.test(s) && `«Cuentas y dinero» no anula un faltante — ${linea("cuentas")(s)}`,
      !/^tu\|100\.00\|100\.00\|0\|0$/m.test(s) && `el faltante no vuelve al ciclo y no es deuda — ${linea("tu")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "faltante sin explicación: deuda de la persona (1419), aunque quien aprueba quiera asumirlo; «Tu fondo» la muestra",
    sql: `${rinde(100)}
${aprueba("asume", FELIPE, "'asume_cayla'")}
${aprueba("deuda", FELIPE)}
select 'r|' || r.decision from retail.rendiciones_fondo r where r.id = :'r';
select d.id as mov from retail.movimientos_dinero d where d.rendicion_id = :'r' \\gset
select 'diario|' || pg_temp.asiento(:'mov');
${como(ANA)}${sinFirma}
select 'tu|' || x.deuda || '|' || t.saldo from retail.fn_mi_fondo_resumen() t, retail.fn_mi_fondo_rendicion() x;`,
    revisa: (s) => [
      !/^asume\|P0001\|rendicion_sin_explicacion\|Sin explicación, el faltante queda como deuda/m.test(s) && `sin explicación no se asume — ${linea("asume")(s)}`,
      !/^deuda\|SIN_ERROR$/m.test(s) && `deuda — ${linea("deuda")(s)}`,
      !/^r\|deuda_persona$/m.test(s) && `r — ${linea("r")(s)}`,
      !/^diario\|1413:0\.00:20\.00,1419:20\.00:0\.00$/m.test(s) && `el Diario debía ser 1419 contra 1413 — ${linea("diario")(s)}`,
      !/^tu\|20\.00\|100\.00$/m.test(s) && `«Tu fondo» debía decir que debe 20 — ${linea("tu")(s)}`,
    ].filter(Boolean),
  },
  {
    // /formidable 2026-10-14 (cambio 3): «Ver tu rendición» decía «quien la revisa decide» aunque no hubiera explicación (y sin ella es
    // deuda, sin elegir). La hoja lee la explicación de SU rendición abierta; y quien le entregó plata lee un motivo en palabras de tienda.
    nombre: "«Ver tu rendición» lee su explicación (solo la de quien pregunta); el motivo de no aprobar, en palabras de tienda",
    sql: `${rinde(100, "'Se me cayó un billete'")}
${como(ANA)}${sinFirma}
select 'ana|' || (x ->> 'id' = :'r')::text || '|' || (x ->> 'faltante') || '|' || coalesce(x ->> 'explicacion', '-') from retail.fn_mi_rendicion_abierta() x;
${como(BETO)}${sinFirma}
select 'beto|' || coalesce(retail.fn_mi_rendicion_abierta()::text, 'nada');
select 'motivo|' || retail.fn_rendicion_quien_no_aprueba(:'r', :'beto_p');`,
    revisa: (s) => [
      !/^ana\|true\|20\.00\|Se me cayó un billete$/m.test(s) && `la dueña lee su rendición abierta con su explicación — ${linea("ana")(s)}`,
      !/^beto\|nada$/m.test(s) && `otra persona no lee la rendición de Ana por aquí — ${linea("beto")(s)}`,
      !/^motivo\|Le entregaste plata en esta rendición: la aprueba otra persona que revise los fondos\. Si algo no cuadra, devuélvela para que la corrija\.$/m.test(s) &&
        `el motivo, sin el nombre del módulo y con qué hacer — ${linea("motivo")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "no aprueba: quien le entregó plata, quien no tiene el módulo, el dueño (un líder con el módulo); la de un líder, solo un Admin que no le entregó",
    sql: `${rinde(120)}
${aprueba("entrego", BETO)}
${como(MICAELA)}${firma("fondo_rendicion_aprobar")}
select 'sin_modulo|' || pg_temp.intento(format('select retail.aprobar_rendicion_fondo(%L, null, null)', :'r'));
-- El fondo de un líder: Felipe le entrega a Beto y Beto rinde.
${como(FELIPE)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'beto_p', :'bcp', 200, 'Viaje a Lima', null, null) as _e \\gset
${como(BETO)}${firma("fondo_rendir")}
select retail.rendir_fondo(200, null, null) as rb \\gset
select :'rb' as r \\gset
${aprueba("duena", BETO)}
${aprueba("lider_no_admin", DANI)}
${aprueba("lider_entrego", FELIPE)}
${aprueba("lider_admin", CARLA)}`,
    revisa: (s) => [
      !/^duena\|42501\|rendicion_quien_aprueba\|Es tu fondo/m.test(s) && `duena — ${linea("duena")(s)}`,
      !/^entrego\|42501\|rendicion_quien_aprueba\|Le entregaste plata/m.test(s) && `entrego — ${linea("entrego")(s)}`,
      !/^sin_modulo\|42501\|/m.test(s) && `sin_modulo — ${linea("sin_modulo")(s)}`,
      !/^lider_no_admin\|42501\|rendicion_quien_aprueba\|Es la rendición de un líder/m.test(s) && `lider_no_admin — ${linea("lider_no_admin")(s)}`,
      !/^lider_entrego\|42501\|rendicion_quien_aprueba\|Le entregaste plata/m.test(s) && `lider_entrego — ${linea("lider_entrego")(s)}`,
      !/^lider_admin\|SIN_ERROR$/m.test(s) && `una Admin que no entregó aprueba la de un líder — ${linea("lider_admin")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "lo rendido queda congelado: ni el gasto ni la entrega se anulan mientras están en una rendición; devuelta, sí",
    sql: `${rinde(120)}
${como(FELIPE)}${sinFirma}
select 'gasto|' || pg_temp.intento(format('select retail.anular_gasto(%L, %L)', :'g80', 'error'));
${firma("fondo_anular")}
select 'entrega|' || pg_temp.intento(format('select retail.anular_movimiento_fondo(%L, %L)', :'entrega', 'error'));
${firma("fondo_rendicion_devolver")}
select 'devuelve|' || pg_temp.intento(format('select retail.devolver_rendicion_fondo(%L, %L)', :'r', 'Falta la foto del flete'));
${sinFirma}
select 'gasto_ya|' || pg_temp.intento(format('select retail.anular_gasto(%L, %L)', :'g80', 'Se anotó mal'));`,
    revisa: (s) => [
      !/^gasto\|P0001\|en_rendicion\|Ese gasto ya está en una rendición/m.test(s) && `gasto — ${linea("gasto")(s)}`,
      !/^entrega\|P0001\|en_rendicion\|Ese movimiento ya está en una rendición/m.test(s) && `entrega — ${linea("entrega")(s)}`,
      !/^devuelve\|SIN_ERROR$/m.test(s) && `devuelve — ${linea("devuelve")(s)}`,
      !/^gasto_ya\|SIN_ERROR$/m.test(s) && `devuelta, el gasto ya se puede anular — ${linea("gasto_ya")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "devolver: la dueña la retira con su cuenta y vuelve a rendir; sin motivo no; sus filas vuelven al ciclo",
    sql: `${rinde(120)}
${firma("fondo_rendicion_devolver")}
select 'sin_motivo|' || pg_temp.intento(format('select retail.devolver_rendicion_fondo(%L, %L)', :'r', ' '));
select 'retira|' || pg_temp.intento(format('select retail.devolver_rendicion_fondo(%L, %L)', :'r', 'Me faltó anotar un taxi'));
select 'r|' || r.estado || '|' || (r.devuelta_por = :'ana_p')::text || '|' || (select count(*) from retail.rendicion_fondo_items i where i.rendicion_id = :'r' and i.vigente)
  from retail.rendiciones_fondo r where r.id = :'r';
select 'ciclo|' || (select t.items from retail.fn_mi_fondo_rendicion() t);
${rinde(120)}
select 'otra_vez|' || r.estado || '|' || r.items from retail.rendiciones_fondo r where r.id = :'r';`,
    revisa: (s) => [
      !/^sin_motivo\|P0001\|\|Di por qué se devuelve/m.test(s) && `sin_motivo — ${linea("sin_motivo")(s)}`,
      !/^retira\|SIN_ERROR$/m.test(s) && `retira — ${linea("retira")(s)}`,
      !/^r\|devuelta\|true\|0$/m.test(s) && `r — ${linea("r")(s)}`,
      !/^ciclo\|3$/m.test(s) && `las 3 filas vuelven al ciclo — ${linea("ciclo")(s)}`,
      !/^otra_vez\|por_aprobar\|3$/m.test(s) && `otra_vez — ${linea("otra_vez")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "no se rinde: más plata de la que dice el fondo, desde una terminal, sin nada nuevo; el mismo token no duplica",
    sql: `${como(ANA)}${firma("fondo_rendir")}
select 'sobra|' || pg_temp.intento('select retail.rendir_fondo(999, null, null)');
select gen_random_uuid() as tok \\gset
select retail.rendir_fondo(120, null, :'tok') as a \\gset
select retail.rendir_fondo(120, null, :'tok') as b \\gset
select 'token|' || (:'a' = :'b')::text || '|' || (select count(*) from retail.rendiciones_fondo r where r.token_cliente = :'tok');
select :'a' as r \\gset
${aprueba("aprueba", FELIPE)}
${como(ANA)}${firma("fondo_rendir")}
select 'nada|' || pg_temp.intento('select retail.rendir_fondo(120, null, null)');
${como(FELIPE)}${sinFirma}
insert into auth.users (id, aud, role, email) values ('${TERMINAL}', 'authenticated', 'authenticated', 'terminal-rendicion@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'tru', 'ZZ Terminal rendición', retail.fn_rol_por_clave('terminal_administrativa'), '${TERMINAL}');
${como(TERMINAL)}${firma("fondo_rendir")}
select 'terminal|' || pg_temp.intento('select retail.rendir_fondo(0, null, null)');`,
    revisa: (s) => [
      !/^sobra\|P0001\|rendicion_sobra\|Tienes S\/ 999\.00 y tu fondo dice S\/ 120\.00/m.test(s) && `sobra — ${linea("sobra")(s)}`,
      !/^token\|true\|1$/m.test(s) && `token — ${linea("token")(s)}`,
      !/^aprueba\|SIN_ERROR$/m.test(s) && `aprueba — ${linea("aprueba")(s)}`,
      !/^nada\|P0001\|\|No hay nada nuevo que rendir/m.test(s) && `nada — ${linea("nada")(s)}`,
      !/^terminal\|42501\|fondo_ajeno\|/m.test(s) && `terminal — ${linea("terminal")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "con el fondo en negativo (CAYLA le debe) rinde en cero, sin faltante; aprobada, el ciclo siguiente trae el negativo",
    sql: `${como(ANA)}${sinFirma}
select (retail.registrar_pagos_compra(:'compra', jsonb_build_array(jsonb_build_object('monto', 400, 'metodo', 'efectivo', 'cuenta_id', :'fondo')),
                                      null, gen_random_uuid()))[1] as pago2 \\gset
${firma("fondo_rendir")}
select 'diez|' || pg_temp.intento('select retail.rendir_fondo(10, null, null)');
${rinde(0)}
select 'r|' || r.saldo || '|' || r.efectivo || '|' || r.faltante from retail.rendiciones_fondo r where r.id = :'r';
${aprueba("aprueba", FELIPE)}
${como(ANA)}${sinFirma}
select 'tu|' || t.saldo || '|' || x.arrastre || '|' || x.deuda from retail.fn_mi_fondo_resumen() t, retail.fn_mi_fondo_rendicion() x;`,
    revisa: (s) => [
      !/^diez\|P0001\|rendicion_sobra\|/m.test(s) && `con el fondo en negativo no se rinde plata en la mano — ${linea("diez")(s)}`,
      !/^r\|-280\.00\|0\.00\|0\.00$/m.test(s) && `r — ${linea("r")(s)}`,
      !/^aprueba\|SIN_ERROR$/m.test(s) && `aprueba — ${linea("aprueba")(s)}`,
      !/^tu\|-280\.00\|-280\.00\|0$/m.test(s) && `CAYLA le sigue debiendo 280, sin deuda de ella — ${linea("tu")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "fotos de un gasto del viaje: las suma la dueña en la carpeta de su gasto; quien no puede, no; la rendición las cuenta",
    sql: `${como(ANA)}${firma("gasto_viaje_foto")}
select retail.registrar_foto_gasto_viaje(:'g80', :'g80' || '/abc-boleta.jpg', 'boleta.jpg', 'image/jpeg', 1000) as foto \\gset
select retail.registrar_foto_gasto_viaje(:'g80', :'g80' || '/abc-boleta.jpg', 'boleta.jpg', 'image/jpeg', 1000) as foto2 \\gset
select 'dos_veces|' || (:'foto' = :'foto2')::text;
select 'ver|' || count(*) from retail.fn_fotos_gasto_viaje(array[:'g80']::uuid[]);
select 'ciclo|' || string_agg(c.tipo || ':' || coalesce(c.con_foto::text, '-'), ',' order by c.tipo) from retail.fn_mi_ciclo_fondo() c;
-- Sin Órdenes de compra en el rol integrante: Micaela ya no puede; Ana sí, porque el gasto salió de SU fondo.
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'ordenes_compra';
select 'otra_carpeta|' || pg_temp.intento(format('select retail.registrar_foto_gasto_viaje(%L, %L, %L, %L, %s)', :'g80', gen_random_uuid() || '/x.jpg', 'x.jpg', 'image/jpeg', 10));
select 'tipo|' || pg_temp.intento(format('select retail.registrar_foto_gasto_viaje(%L, %L, %L, %L, %s)', :'g80', :'g80' || '/x.txt', 'x.txt', 'text/plain', 10));
${como(MICAELA)}${firma("gasto_viaje_foto")}
select 'ajena|' || pg_temp.intento(format('select retail.registrar_foto_gasto_viaje(%L, %L, %L, %L, %s)', :'g80', :'g80' || '/m.jpg', 'm.jpg', 'image/jpeg', 10));
select 'ajena_ver|' || count(*) from retail.fn_fotos_gasto_viaje(array[:'g80']::uuid[]);
select 'ruta_ajena|' || retail.fn_puede_ver_foto_gasto_viaje(:'g80' || '/abc-boleta.jpg')::text || '|' || retail.fn_puede_ver_foto_gasto_viaje('basura')::text;
${rinde(120)}
select 'sin_foto|' || r.sin_foto from retail.rendiciones_fondo r where r.id = :'r';
${como(ANA)}${firma("gasto_viaje_foto")}
select 'archiva|' || pg_temp.intento(format('select retail.archivar_foto_gasto_viaje(%L)', :'foto'));
select 'ver_despues|' || count(*) from retail.fn_fotos_gasto_viaje(array[:'g80']::uuid[]);`,
    revisa: (s) => [
      !/^dos_veces\|true$/m.test(s) && `la misma foto dos veces devuelve la misma fila — ${linea("dos_veces")(s)}`,
      !/^ver\|1$/m.test(s) && `ver — ${linea("ver")(s)}`,
      !/^ciclo\|gasto:true,mov:-,pago:false$/m.test(s) && `el ciclo dice qué papel tiene foto — ${linea("ciclo")(s)}`,
      !/^otra_carpeta\|P0001\|\|El archivo tiene que estar en la carpeta de este gasto/m.test(s) && `otra_carpeta — ${linea("otra_carpeta")(s)}`,
      !/^tipo\|P0001\|\|Solo se aceptan fotos/m.test(s) && `tipo — ${linea("tipo")(s)}`,
      !/^ajena\|42501\|/m.test(s) && `quien no tiene el módulo ni es la dueña no suma fotos — ${linea("ajena")(s)}`,
      !/^ajena_ver\|0$/m.test(s) && `ni las ve — ${linea("ajena_ver")(s)}`,
      !/^ruta_ajena\|false\|false$/m.test(s) && `la lectura del bucket tampoco — ${linea("ruta_ajena")(s)}`,
      !/^sin_foto\|1$/m.test(s) && `con la foto del flete solo falta la del pago — ${linea("sin_foto")(s)}`,
      !/^archiva\|SIN_ERROR$/m.test(s) && `archiva — ${linea("archiva")(s)}`,
      !/^ver_despues\|0$/m.test(s) && `archivada no se ve — ${linea("ver_despues")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el tablero de quien aprueba: lo por aprobar primero, con por qué alguien no puede; las filas de la rendición, con su detalle",
    sql: `${rinde(120)}
${como(FELIPE)}${sinFirma}
select 'felipe|' || r.estado || '|' || coalesce(r.por_que_no_aprueba, 'puede') || '|' || r.persona_nombre from retail.fn_rendiciones_fondo('por_aprobar') r where r.id = :'r';
${como(BETO)}${sinFirma}
select 'beto|' || coalesce(r.por_que_no_aprueba, 'puede') from retail.fn_rendiciones_fondo('por_aprobar') r where r.id = :'r';
${como(FELIPE)}${sinFirma}
select 'items|' || string_agg(i.tipo || ':' || i.monto, ',' order by i.tipo) from retail.fn_rendicion_fondo_items(:'r') i;
${como(MICAELA)}${sinFirma}
select 'micaela|' || pg_temp.intento('select * from retail.fn_rendiciones_fondo(null, 10)');`,
    revisa: (s) => [
      !/^felipe\|por_aprobar\|puede\|Ana Prueba Rendición$/m.test(s) && `felipe — ${linea("felipe")(s)}`,
      !/^beto\|Le entregaste plata/m.test(s) && `beto — ${linea("beto")(s)}`,
      !/^items\|gasto:-80\.00,mov:500\.00,pago:-300\.00$/m.test(s) && `items — ${linea("items")(s)}`,
      !/^micaela\|42501\|/m.test(s) && `sin el módulo no se ve el tablero — ${linea("micaela")(s)}`,
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
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de la rendición del fondo pasan.`);
process.exit(fallas ? 1 : 0);
