#!/usr/bin/env node
/**
 * Prueba del IGV de la fase 6 · actividad 8 (ADR-0362, decisiones 56, 70 y 72): `20261014153000_igv_gastos_viaje_y_perdido.sql`, sobre
 * las del fondo, los gastos del viaje y lo no deducible (181000 … 20261014145000, que la base ya tiene que tener).
 *
 * QUÉ PROMETE
 *   · La FACTURA de un gasto del viaje con el RUC de quien la dio separa su IGV: el Diario lo lleva a la 4011, Impuestos lo suma al crédito
 *     de los gastos y el registro de compras la lista. Sin RUC, una boleta o una planilla, no hay crédito.
 *   · El pago en efectivo o desde un fondo de una factura de S/ 2 000 o más pierde su parte del IGV EN EL MES DEL PAGO (no en el de la
 *     factura): una fila negativa en Impuestos, el aviso del panel y, en el Diario, 64 contra 4011. Lo pagado por el banco no pierde nada.
 *   · Un gasto del viaje no deducible pierde todo su IGV el mismo día; uno pagado por el banco, no.
 *   · El del Taller se resta en Impuestos pero no se asienta (el Diario tampoco tiene su IGV).
 *   · El 4011 cuenta lo mismo por los dos caminos: lo que suma Impuestos de estos papeles es lo que mueve el Diario.
 *
 * CÓMO. Como `no_deducible.mjs`: carga su migración dentro de cada caso (se puede pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:igv-fase6                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/igv_fase6.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
// Solo la suya, dos veces: las anteriores de la fase ya están aplicadas en la base (en el CI, todas; en local, actualízala).
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261014153000_igv_gastos_viaje_y_perdido.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const ANA = "44444444-4444-4444-8444-0000000000a8"; // solo de esta prueba: compra con su fondo
// Un RUC que ningún proveedor tiene: el registro dice que falta la razón social.
const RUC = "20999999991";

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
const comoPostgres = `reset request.jwt.claim.sub;\nreset request.jwt.claims;\nselect set_config('request.headers', '{}', true) \\g /dev/null\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

const gastoViaje = (alias, { concepto = "hotel", monto, papel = "factura", medio = "transferencia", cuenta = "bcp", ruc = RUC, serie = "F001-77" }) =>
  `select retail.registrar_gasto_viaje('viaje', '${concepto}', ${monto}, retail.fn_hoy_lima(), '${papel}', '${medio}', :'${cuenta}', array[:'oc']::uuid[], ${
    serie ? `'${serie}'` : "null"
  }, ${ruc ? `'${ruc}'` : "null"}, null, null) as ${alias} \\gset\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
${sinCandadosDePegado(MIGRACION)}
set local search_path = retail, public, extensions;

-- El asiento del Diario de un papel: «cuenta:debe:haber», en orden de cuenta.
create function pg_temp.asiento(p_asiento text) returns text language sql as $f$
  select coalesce(string_agg(a.cuenta || ':' || a.debe::numeric(12, 2) || ':' || a.haber::numeric(12, 2), ',' order by a.cuenta), '-')
    from retail.fn_asientos(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), null) a where a.asiento = p_asiento;
$f$;

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba IGV', 'banco', '104', 90000, retail.fn_hoy_lima() - 60, 63) returning id as bcp \\gset
insert into auth.users (id, aud, role, email) values ('${ANA}', 'authenticated', 'authenticated', 'ana-igv@prueba.local');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id, rol) values ('Ana', 'Prueba IGV', :'sede_base', '${ANA}', 'integrante') returning id as ana_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'ana_p', 'colaborador', retail.fn_rol_por_clave('integrante'), :'tru', 'activo');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra') on conflict do nothing;
-- Un gasto del viaje va siempre al menos a una orden (decisión 75): la de esta prueba.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'ana_p') returning id as oc \\gset
${como(FELIPE)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 3000, 'Compras Gamarra', null, null) \\g /dev/null
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
-- Lo que la base ya tenía este mes (el banco local trae datos): las pruebas miran cuánto CAMBIA.
select coalesce((select m.credito_gastos from retail.fn_impuestos_igv_meses(retail.fn_hoy_lima(), retail.fn_hoy_lima()) m), 0) as cg0,
       coalesce((select m.credito_mercaderia from retail.fn_impuestos_igv_meses(retail.fn_hoy_lima(), retail.fn_hoy_lima()) m), 0) as cm0,
       coalesce((select (p.panel -> 'revisar' -> 'igv_perdido' ->> 'igv')::numeric from (select retail.fn_impuestos_panel(retail.fn_hoy_lima()) as panel) p), 0) as perdido0 \\gset
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;

const CASOS = [
  {
    nombre: "la factura de un gasto del viaje con RUC separa su IGV (Diario, Impuestos y registro); sin RUC, boleta o planilla, no",
    sql: `${como(FELIPE)}${firma("gasto_viaje_registrar")}
${gastoViaje("g_fac", { monto: 1180 })}
${gastoViaje("g_sin_ruc", { monto: 590, ruc: null, serie: "F001-78" })}
${gastoViaje("g_bol", { monto: 100, papel: "boleta", ruc: null, serie: "B001-9" })}
${gastoViaje("g_pla", { concepto: "taxi", monto: 20, papel: "planilla_movilidad", ruc: null, serie: null })}
select 'igv|' || string_agg(case g.id when :'g_fac' then 'fac' when :'g_sin_ruc' then 'sin_ruc' when :'g_bol' then 'bol' else 'pla' end || ':' || g.igv, ',' order by g.monto_total desc)
  from retail.gastos g where g.id in (:'g_fac', :'g_sin_ruc', :'g_bol', :'g_pla');
select 'diario|' || pg_temp.asiento('gasto:' || :'g_fac');
select 'impuestos|' || string_agg(c.tipo || ':' || c.igv || ':' || c.da_credito, ',' order by c.total desc)
  from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) c where c.id in (:'g_fac', :'g_sin_ruc', :'g_bol', :'g_pla');
select 'mes|' || ((select m.credito_gastos from retail.fn_impuestos_igv_meses(retail.fn_hoy_lima(), retail.fn_hoy_lima()) m) - :'cg0')::numeric(12, 2);
select 'registro|' || r.tipo || '|' || r.serie || '|' || r.numero || '|' || r.proveedor_ruc || '|' || r.proveedor || '|' || r.base || '|' || r.igv || '|' || r.da_credito
  from retail.fn_impuestos_registro_compras(retail.fn_hoy_lima()) r where r.origen = 'gasto_viaje' and r.proveedor_ruc = '${RUC}' and r.igv > 0;`,
    revisa: (s) => [
      !/^igv\|fac:180\.00,sin_ruc:0\.00,bol:0\.00,pla:0\.00$/m.test(s) && `solo la factura con RUC separa IGV (1180 → 180) — ${linea("igv")(s)}`,
      !/^diario\|104:0\.00:1180\.00,4011:180\.00:0\.00,631:1000\.00:0\.00$/m.test(s) && `el Diario: 631 por la base, 4011 por el IGV — ${linea("diario")(s)}`,
      !/^impuestos\|factura:180\.00:true,factura:0\.00:false,boleta:0\.00:false$/m.test(s) &&
        `Impuestos: la factura con RUC da crédito; sin RUC y la boleta, no; la planilla no es comprobante — ${linea("impuestos")(s)}`,
      !/^mes\|180\.00$/m.test(s) && `el crédito de gastos del mes sube 180 — ${linea("mes")(s)}`,
      !/^registro\|factura\|F001\|77\|20999999991\|Sin razón social \(ver el RUC\)\|1000\.00\|180\.00\|true$/m.test(s) &&
        `el registro de compras la lista, con su RUC y sin razón social — ${linea("registro")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el IGV perdido: un pago en efectivo de una factura de S/ 2 000 o más pierde su parte, en el mes del PAGO; el del banco no",
    sql: `${comoPostgres}
-- Una factura del mes pasado (S/ 2 360, IGV 360) que se paga hoy: 500 en efectivo y 1 000 por el banco.
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (:'prov', 'factura', 'FIG', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), retail.fn_hoy_lima() - 40, 'credito',
          retail.fn_hoy_lima() + 20, 2000, 360, 2360, 'mercaderia', :'tru') returning id as compra \\gset
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id) values (:'compra', retail.fn_hoy_lima(), 500, 'efectivo', :'tru') returning id as p_efe \\gset
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id, cuenta_dinero_id) values (:'compra', retail.fn_hoy_lima(), 1000, 'transferencia', :'tru', :'bcp') returning id as p_trf \\gset
${como(FELIPE)}${firma("gasto_viaje_registrar")}
select 'perdido|' || string_agg(x.origen || ':' || x.igv || ':' || (x.fecha = retail.fn_hoy_lima()), ',') from retail.fn_igv_perdido(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x where x.comprobante_id = :'compra';
select 'impuestos|' || string_agg(c.tipo || ':' || c.igv, ',') from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) c where c.id in (:'p_efe', :'p_trf');
select 'factura_hoy|' || count(*) from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) c where c.id = :'compra';
select 'mes|' || ((select m.credito_mercaderia from retail.fn_impuestos_igv_meses(retail.fn_hoy_lima(), retail.fn_hoy_lima()) m) - :'cm0')::numeric(12, 2);
select 'panel|' || (((p.panel -> 'revisar' -> 'igv_perdido' ->> 'igv')::numeric) - :'perdido0')::numeric(12, 2)
  from (select retail.fn_impuestos_panel(retail.fn_hoy_lima()) as panel) p;
select 'diario|' || pg_temp.asiento('igv_perdido:' || :'p_efe') || '|' || pg_temp.asiento('igv_perdido:' || :'p_trf');`,
    revisa: (s) => [
      !/^perdido\|compra:76\.27:true$/m.test(s) && `pierde 360 × 500 ÷ 2360 = 76.27, hoy (el mes del pago) — ${linea("perdido")(s)}`,
      !/^impuestos\|igv_perdido:-76\.27$/m.test(s) && `Impuestos resta 76.27 por el pago en efectivo y nada por el del banco — ${linea("impuestos")(s)}`,
      !/^factura_hoy\|0$/m.test(s) && `la factura sigue en su mes (decisión 72) — ${linea("factura_hoy")(s)}`,
      !/^mes\|-76\.27$/m.test(s) && `el crédito de mercadería de este mes baja 76.27 — ${linea("mes")(s)}`,
      !/^panel\|76\.27$/m.test(s) && `el panel avisa el IGV perdido del mes — ${linea("panel")(s)}`,
      !/^diario\|4011:0\.00:76\.27,64:76\.27:0\.00\|-$/m.test(s) && `el Diario: 64 contra 4011; el pago del banco no asienta nada — ${linea("diario")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "un gasto del viaje no deducible pierde todo su IGV el mismo día; uno por el banco no; el 4011 cuenta igual en Impuestos y en el Diario",
    sql: `${como(ANA)}${firma("gasto_viaje_registrar")}
${gastoViaje("g_fondo", { monto: 2360, cuenta: "fondo", serie: "F001-90" })}
${como(FELIPE)}${firma("gasto_viaje_registrar")}
${gastoViaje("g_banco", { monto: 2360, serie: "F001-91" })}
select 'perdido|' || coalesce(string_agg(case x.id when :'g_fondo' then 'fondo' else 'banco' end || ':' || x.igv, ','), '-')
  from retail.fn_igv_perdido(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x where x.id in (:'g_fondo', :'g_banco');
-- Los dos caminos del 4011, para estos dos gastos: lo que suma Impuestos (lo que da crédito) contra lo que mueve el Diario.
select 'dos_caminos|' ||
  (select coalesce(sum(c.igv), 0) from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) c where c.da_credito and c.id in (:'g_fondo', :'g_banco'))
  || '|' ||
  (select coalesce(sum(a.debe - a.haber), 0) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a
    where a.cuenta = '4011' and a.asiento in ('gasto:' || :'g_fondo', 'gasto:' || :'g_banco', 'igv_perdido:' || :'g_fondo', 'igv_perdido:' || :'g_banco'));`,
    revisa: (s) => [
      !/^perdido\|fondo:360\.00$/m.test(s) && `el del fondo pierde sus 360; el del banco, nada — ${linea("perdido")(s)}`,
      !/^dos_caminos\|360\.00\|360\.00$/m.test(s) && `Impuestos y el Diario dicen lo mismo del 4011: 360 + 360 − 360 — ${linea("dos_caminos")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el Taller: el IGV perdido se resta en Impuestos pero no se asienta (el Diario no tiene el IGV del Taller)",
    sql: `${comoPostgres}
insert into retail.proveedores_produccion (nombre, rubro) values ('Taller Prueba IGV', 'maquila') returning id as pprov \\gset
insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total)
  values (:'pprov', 'factura', 'TIG', '1', 'contado', 2118.64, 381.36, 2500) returning id as cprod \\gset
-- La fecha va explícita, en hora de Lima: el default de la columna es current_date (UTC) y, de 7 p. m. a medianoche en Lima, ya es
-- el día siguiente, así que fn_impuestos_compras(hoy_lima, hoy_lima) no veía el pago y la prueba caía (main en rojo, 2026-10-14).
insert into retail.comprobantes_produccion_pagos (comprobante_id, monto, metodo, fecha) values (:'cprod', 2500, 'efectivo', retail.fn_hoy_lima()) returning id as pp \\gset
${como(FELIPE)}${firma("gasto_viaje_registrar")}
select 'taller|' || c.origen || ':' || c.tipo || ':' || c.igv from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) c where c.id = :'pp';
select 'diario|' || pg_temp.asiento('igv_perdido:' || :'pp');`,
    revisa: (s) => [
      !/^taller\|taller:igv_perdido:-381\.36$/m.test(s) && `Impuestos resta el IGV del Taller pagado en efectivo — ${linea("taller")(s)}`,
      !/^diario\|-$/m.test(s) && `y el Diario no lo asienta — ${linea("diario")(s)}`,
    ].filter(Boolean),
  },
];

let fallas = 0;
for (const caso of CASOS) {
  const r = correr(`${PRELUDIO}\n${caso.sql}\nrollback;\n`);
  if (!r.ok) {
    fallas++;
    console.log(`✗ ${caso.nombre}\n    la base respondió con error:\n    ${r.mensaje.split("\n").filter((l) => !/NOTICE/.test(l)).slice(0, 6).join("\n    ")}`);
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
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos del IGV de la fase 6 pasan.`);
process.exit(fallas ? 1 : 0);
