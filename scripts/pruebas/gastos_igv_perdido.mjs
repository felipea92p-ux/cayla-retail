#!/usr/bin/env node
/**
 * Prueba de Finanzas ▸ Gastos con el IGV perdido por pagar sin banco (ADR-0362, fase 6, decisión 76): `20261014174000_gastos_igv_perdido.sql`,
 * sobre las de la fase (los gastos del viaje, lo no deducible y el IGV de la actividad 8, 20261014153000, que la base ya tiene que tener).
 *
 * QUÉ PROMETE
 *   · La lista (`fn_gastos_igv_perdido`) dice qué gasto perdió IGV, cuánto, cuándo y cómo se pagó: el hotel de S/ 2 360 con factura pagado
 *     en efectivo pierde sus 360 (todo su IGV); desde un fondo, igual, con «fondo»; por el banco o bajo S/ 2 000, nada.
 *   · Una factura de Finanzas pagada en parte en efectivo en OTRO mes: su fila (en el mes de la factura) dice la parte perdida
 *     (360 × 1 180 ÷ 2 360 = 180) con la fecha del pago; la tarjeta (`fn_gastos_panel`, clave `igv_perdido`) la resta en el mes del PAGO,
 *     marcada como «de otros meses», y no en el de la factura (decisión 72).
 *   · Gastos e Impuestos cuentan lo mismo: lo que se mueve el crédito de gastos de Impuestos en cada mes es lo que se mueve `igv` menos
 *     `igv_perdido` de la tarjeta, en el mes de la factura y en el del pago.
 *   · La misma visibilidad que la lista de gastos: quien no la ve recibe el mismo error; «Ver» una tienda o «la empresa» filtra igual.
 *   · Lo que `fn_igv_perdido` sabe perder (sus orígenes) llega a un gasto o está descartado a propósito (el Taller): si gana un origen,
 *     esta prueba dice cuál falta unir.
 *   · Se puede pegar dos veces (la clave entra una sola vez), las columnas de la lista no cambian y la interna no la llama la web.
 *
 * CÓMO. Como `gastos_lista_viaje.mjs`: carga su migración dos veces dentro de cada caso, sesión simulada con `request.jwt.claim.sub` y
 * ROLLBACK siempre: nada queda escrito. Mide cuánto CAMBIAN las cifras (la base local trae datos).
 *
 * USO
 *   pnpm pruebas:gastos-igv-perdido                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/gastos_igv_perdido.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261014174000_gastos_igv_perdido.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed): ve los gastos de todas las tiendas y los de la empresa
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const ANA = "44444444-4444-4444-8444-0000000000d7"; // solo de esta prueba: compra con su fondo (nadie se entrega plata a sí mismo)
// Un RUC que ningún proveedor tiene (una factura con RUC separa su IGV, actividad 8).
const RUC = "20999999994";
// Los orígenes de `fn_igv_perdido` que llegan a un gasto, y los que no a propósito (el Taller no es un gasto de Finanzas ▸ Gastos).
const ORIGENES_UNIDOS = ["compra", "gasto_viaje"];
const ORIGENES_FUERA = ["taller"];
// Las columnas de la lista, como las devuelve producción (comprobado el 2026-10-14): no deben cambiar.
const COLUMNAS_LISTA =
  "TABLE(id uuid, ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text, cuenta text, descripcion text, fecha date, " +
  "monto_total numeric, igv numeric, medio_pago text, caja_movimiento_id uuid, compra_id uuid, comprobante_tipo text, comprobante text, " +
  "proveedor_nombre text, condicion text, fecha_vencimiento date, saldo numeric, tiene_pagos boolean, estado text, motivo_anulacion text, " +
  "registrado_por_nombre text, creado_en timestamp with time zone)";

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

// Un gasto del viaje de hoy, a la orden de la prueba (decisión 75: siempre al menos a una orden), con factura y RUC si no se dice otra cosa.
const gastoViaje = (alias, { concepto = "hotel", monto, papel = "factura", medio, cuenta, serie = "F001-4321" }) =>
  `select retail.registrar_gasto_viaje('viaje', '${concepto}', ${monto}, retail.fn_hoy_lima(), '${papel}', '${medio}', :'${cuenta}', array[:'oc']::uuid[], ${
    serie ? `'${serie}'` : "null"
  }, '${RUC}', null, null) as ${alias} \\gset\n`;

// Las cifras de un mes (`ini`/`fin` son variables de psql): la tarjeta (como Felipe, «todas») y el crédito de gastos de Impuestos.
const cifras = (sufijo, ini, fin) =>
  `select (p.x ->> 'igv')::numeric as igv${sufijo}, (p.x -> 'igv_perdido' ->> 'igv')::numeric as perdido${sufijo},
          (p.x -> 'igv_perdido' ->> 'n')::int as n${sufijo}, (p.x -> 'igv_perdido' ->> 'de_otros_meses')::numeric as otros${sufijo},
          coalesce((select sum(m.credito_gastos) from retail.fn_impuestos_igv_meses(:'${ini}', :'${fin}') m), 0) as cg${sufijo}
     from (select retail.fn_gastos_panel(:'${ini}', :'${fin}') as x) p \\gset\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
${sinCandadosDePegado(MIGRACION)}
set local search_path = retail, public, extensions;

create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || ':' || v_msg;
end;
$f$;

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as otra from retail.ubicaciones where activo and tipo = 'tienda' and id <> :'tru' order by nombre limit 1 \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba IGV perdido', 'banco', '104', 90000, retail.fn_hoy_lima() - 90, 65) returning id as bcp \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as oc \\gset
-- El mes de hoy y el de hace 40 días (siempre otro mes).
select date_trunc('month', retail.fn_hoy_lima())::date as hoy_ini, (date_trunc('month', retail.fn_hoy_lima()) + interval '1 month - 1 day')::date as hoy_fin,
       retail.fn_hoy_lima() - 40 as antes, date_trunc('month', retail.fn_hoy_lima() - 40)::date as antes_ini,
       (date_trunc('month', retail.fn_hoy_lima() - 40) + interval '1 month - 1 day')::date as antes_fin \\gset
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
insert into auth.users (id, aud, role, email) values ('${ANA}', 'authenticated', 'authenticated', 'ana-igv-perdido@prueba.local');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id, rol)
  values ('Ana', 'Prueba IGV perdido', :'sede_base', '${ANA}', 'integrante') returning id as ana_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'ana_p', 'colaborador', retail.fn_rol_por_clave('integrante'), :'tru', 'activo');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra') on conflict do nothing;
${como(FELIPE)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 3000, 'Compras Gamarra', null, null) \\g /dev/null
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
${firma("gasto_viaje_registrar")}
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;

const CASOS = [
  {
    nombre: "un gasto del viaje con factura de S/ 2 000 o más pagado en efectivo o desde un fondo pierde todo su IGV; por el banco o bajo S/ 2 000, nada",
    sql: `${cifras("0", "hoy_ini", "hoy_fin")}
${gastoViaje("g_efe", { monto: 2360, medio: "efectivo", cuenta: "fuerte_tru" })}
${como(ANA)}${gastoViaje("g_fondo", { monto: 2360, medio: "efectivo", cuenta: "fondo", serie: "F001-4322" })}${como(FELIPE)}
${gastoViaje("g_banco", { monto: 2360, medio: "transferencia", cuenta: "bcp", serie: "F001-4323" })}
${gastoViaje("g_chico", { concepto: "comida", monto: 1180, medio: "efectivo", cuenta: "fuerte_tru", serie: "F001-4324" })}
${cifras("1", "hoy_ini", "hoy_fin")}
select 'filas|' || coalesce(string_agg(
         case x.gasto_id when :'g_efe' then 'efe' when :'g_fondo' then 'fondo' when :'g_banco' then 'banco' else 'chico' end
         || ':' || x.igv || ':' || x.monto || ':' || x.como || ':' || (x.fecha = retail.fn_hoy_lima()), ',' order by x.como, x.igv), '-')
  from retail.fn_gastos_igv_perdido(:'hoy_ini', :'hoy_fin') x where x.gasto_id in (:'g_efe', :'g_fondo', :'g_banco', :'g_chico');
select 'igv_de_ellos|' || string_agg(g.igv::text, ',' order by g.monto_total desc, g.igv) from retail.gastos g where g.id in (:'g_efe', :'g_fondo', :'g_banco', :'g_chico');
select 'tarjeta|' || (:igv1 - :igv0)::numeric(12, 2) || '|' || (:perdido1 - :perdido0)::numeric(12, 2) || '|' || (:n1 - :n0) || '|' || (:otros1 - :otros0)::numeric(12, 2);
select 'impuestos|' || (:cg1 - :cg0)::numeric(12, 2) || '|' || ((:igv1 - :perdido1)::numeric(12, 2) - (:igv0 - :perdido0)::numeric(12, 2));`,
    revisa: (s) => [
      !/^filas\|efe:360\.00:2360\.00:efectivo:true,fondo:360\.00:2360\.00:fondo:true$/m.test(s) &&
        `el de la caja fuerte y el del fondo pierden sus 360 hoy, con cómo se pagaron; el del banco y el de S/ 1 180, nada — ${linea("filas")(s)}`,
      !/^igv_de_ellos\|360\.00,360\.00,360\.00,180\.00$/m.test(s) && `los cuatro separan su IGV (factura con RUC) — ${linea("igv_de_ellos")(s)}`,
      !/^tarjeta\|1260\.00\|720\.00\|2\|0\.00$/m.test(s) &&
        `la tarjeta suma 1 260 de IGV de facturas y 720 perdidos en 2 pagos de este mes, ninguno de otro mes — ${linea("tarjeta")(s)}`,
      !/^impuestos\|540\.00\|540\.00$/m.test(s) && `Impuestos y la tarjeta se mueven igual: 1 260 − 720 = 540 — ${linea("impuestos")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "una factura de Finanzas pagada en parte en efectivo en OTRO mes: la fila lo dice en el mes de la factura; la tarjeta lo resta en el del pago",
    sql: `${cifras("a0", "antes_ini", "antes_fin")}
${cifras("h0", "hoy_ini", "hoy_fin")}
-- La factura de hace 40 días, a crédito (S/ 2 360, IGV 360): hoy se paga la mitad en efectivo y la mitad por el banco.
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Alquiler prueba IGV perdido', :'antes', 2360,
  jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov', 'serie', 'FIP', 'numero', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
                     'condicion', 'credito', 'fecha_vencimiento', retail.fn_hoy_lima() + 20)) as g_fin \\gset
select compra_id as compra from retail.gastos where id = :'g_fin' \\gset
${comoPostgres}
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id) values (:'compra', retail.fn_hoy_lima(), 1180, 'efectivo', :'tru');
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id, cuenta_dinero_id) values (:'compra', retail.fn_hoy_lima(), 1180, 'transferencia', :'tru', :'bcp');
${como(FELIPE)}
${cifras("a1", "antes_ini", "antes_fin")}
${cifras("h1", "hoy_ini", "hoy_fin")}
select 'fila|' || coalesce(string_agg(x.igv || ':' || x.monto || ':' || x.como || ':' || (x.fecha = retail.fn_hoy_lima()), ','), '-')
  from retail.fn_gastos_igv_perdido(:'antes_ini', :'antes_fin') x where x.gasto_id = :'g_fin';
select 'fila_hoy|' || count(*) from retail.fn_gastos_igv_perdido(:'hoy_ini', :'hoy_fin') x where x.gasto_id = :'g_fin';
select 'mes_factura|' || (:igva1 - :igva0)::numeric(12, 2) || '|' || (:perdidoa1 - :perdidoa0)::numeric(12, 2) || '|' || (:cga1 - :cga0)::numeric(12, 2);
select 'mes_pago|' || (:igvh1 - :igvh0)::numeric(12, 2) || '|' || (:perdidoh1 - :perdidoh0)::numeric(12, 2) || '|' || (:otrosh1 - :otrosh0)::numeric(12, 2) || '|' || (:cgh1 - :cgh0)::numeric(12, 2);`,
    revisa: (s) => [
      !/^fila\|180\.00:1180\.00:efectivo:true$/m.test(s) &&
        `en el mes de la factura, su fila dice 180 perdidos (360 × 1 180 ÷ 2 360) por el pago en efectivo de hoy; el del banco no — ${linea("fila")(s)}`,
      !/^fila_hoy\|0$/m.test(s) && `la fila vive en el mes de la factura, no en el del pago — ${linea("fila_hoy")(s)}`,
      !/^mes_factura\|360\.00\|0\.00\|360\.00$/m.test(s) &&
        `el mes de la factura suma sus 360 y no resta nada; Impuestos, igual (decisión 72) — ${linea("mes_factura")(s)}`,
      !/^mes_pago\|0\.00\|180\.00\|180\.00\|-180\.00$/m.test(s) &&
        `el mes del pago resta 180, de un gasto de otro mes; Impuestos baja lo mismo — ${linea("mes_pago")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "la misma visibilidad que la lista de gastos: el mismo error a quien no la ve, y «Ver» una tienda o «la empresa» filtra igual",
    sql: `${gastoViaje("g_efe", { monto: 2360, medio: "efectivo", cuenta: "fuerte_tru" })}
select ubicacion_id is null as de_la_empresa from retail.gastos where id = :'g_efe' \\gset
select 'ver|' || :'de_la_empresa'
  || '|' || (select count(*) from retail.fn_gastos_igv_perdido(:'hoy_ini', :'hoy_fin') x where x.gasto_id = :'g_efe')
  || '|' || (select count(*) from retail.fn_gastos_igv_perdido(:'hoy_ini', :'hoy_fin', null, true) x where x.gasto_id = :'g_efe')
  || '|' || (select count(*) from retail.fn_gastos_igv_perdido(:'hoy_ini', :'hoy_fin', :'otra') x where x.gasto_id = :'g_efe')
  || '|' || (select count(*) from retail.fn_gastos_lista(:'hoy_ini', :'hoy_fin', null, true, 100000) l where l.id = :'g_efe')
  || '|' || (select count(*) from retail.fn_gastos_lista(:'hoy_ini', :'hoy_fin', :'otra', false, 100000) l where l.id = :'g_efe');
-- Lo que alguien ve con IGV perdido es de gastos que su lista le muestra («error» si no ve los gastos).
create function pg_temp.fuera_de_su_lista(p_ini date, p_fin date) returns text language plpgsql as $f$
begin
  return (select count(*)::text from retail.fn_gastos_igv_perdido(p_ini, p_fin) x
           where not exists (select 1 from retail.fn_gastos_lista(p_ini, p_fin, null, false, 100000) l where l.id = x.gasto_id));
exception when others then
  return 'error';
end $f$;
${como(MICAELA)}
select 'micaela|' || split_part(pg_temp.intento(format('select count(*) from retail.fn_gastos_lista(%L, %L)', :'hoy_ini', :'hoy_fin')), ':', 1)
  || '|' || split_part(pg_temp.intento(format('select count(*) from retail.fn_gastos_igv_perdido(%L, %L)', :'hoy_ini', :'hoy_fin')), ':', 1)
  || '|' || pg_temp.fuera_de_su_lista(:'hoy_ini', :'hoy_fin');`,
    revisa: (s) => {
      const ver = s.match(/^ver\|(t|f)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)$/m);
      const mic = s.match(/^micaela\|([^|]*)\|([^|]*)\|([^|]*)$/m);
      const errores = [];
      if (!ver) errores.push(`no salió la línea de «Ver» — ${linea("ver")(s)}`);
      else {
        const [, empresa, todas, soloEmpresa, otra, listaEmpresa, listaOtra] = ver;
        if (todas !== "1") errores.push(`el líder con «todas» ve el pago perdido — ${linea("ver")(s)}`);
        if (soloEmpresa !== listaEmpresa) errores.push(`«la empresa» filtra igual que la lista (${soloEmpresa} contra ${listaEmpresa}) — ${linea("ver")(s)}`);
        if (otra !== listaOtra || otra !== "0") errores.push(`otra tienda no lo ve, como en la lista — ${linea("ver")(s)}`);
        if (empresa === "t" && soloEmpresa !== "1") errores.push(`un gasto del viaje de la empresa sale con «la empresa» — ${linea("ver")(s)}`);
      }
      if (!mic) errores.push(`no salió la línea de Micaela — ${linea("micaela")(s)}`);
      else {
        if (mic[1] !== mic[2]) errores.push(`Micaela recibe lo mismo de las dos (lista ${mic[1]}, IGV perdido ${mic[2]}) — ${linea("micaela")(s)}`);
        const esperado = mic[1] === "SIN_ERROR" ? "0" : "error";
        if (mic[3] !== esperado) errores.push(`Micaela no ve un IGV perdido de un gasto que su lista no le muestra — ${linea("micaela")(s)}`);
      }
      return errores;
    },
  },
  {
    nombre: "lo que fn_igv_perdido sabe perder llega a un gasto (o queda fuera a propósito); pegarla dos veces deja una clave; columnas y permisos",
    sql: `select 'origenes|' || string_agg(distinct m[1], ',' order by m[1])
  from regexp_matches(pg_get_functiondef('retail.fn_igv_perdido(date, date)'::regprocedure), 'select\\s+''([a-z_]+)''(?:::text)?\\s*,', 'g') m;
select 'unidos|' || string_agg(distinct m[1], ',' order by m[1])
  from regexp_matches(pg_get_functiondef('retail.fn_igv_perdido_de_gastos(date, date)'::regprocedure), 'x\\.origen\\s*=\\s*''([a-z_]+)''', 'g') m;
select 'una_vez|' || (length(d) - length(replace(d, '''igv_perdido''', ''))) / length('''igv_perdido''')
  from (select pg_get_functiondef('retail.fn_gastos_panel(date, date, uuid, boolean)'::regprocedure) d) s;
select 'columnas|' || (pg_get_function_result('retail.fn_gastos_lista(date, date, uuid, boolean, integer)'::regprocedure) = '${COLUMNAS_LISTA}')
  || '|' || pg_get_function_result('retail.fn_gastos_panel(date, date, uuid, boolean)'::regprocedure);
select 'permisos|' || has_function_privilege('authenticated', 'retail.fn_gastos_igv_perdido(date, date, uuid, boolean)', 'execute')
  || '|' || has_function_privilege('authenticated', 'retail.fn_igv_perdido_de_gastos(date, date)', 'execute')
  || '|' || has_function_privilege('anon', 'retail.fn_gastos_igv_perdido(date, date, uuid, boolean)', 'execute')
  || '|' || (select p.prosecdef from pg_proc p where p.oid = 'retail.fn_gastos_igv_perdido(date, date, uuid, boolean)'::regprocedure);`,
    revisa: (s) => {
      const origenes = (s.match(/^origenes\|(.*)$/m)?.[1] ?? "").split(",").filter(Boolean);
      const unidos = (s.match(/^unidos\|(.*)$/m)?.[1] ?? "").split(",").filter(Boolean);
      const sinUnir = origenes.filter((o) => !ORIGENES_UNIDOS.includes(o) && !ORIGENES_FUERA.includes(o));
      return [
        origenes.length === 0 && `no encontré los orígenes de fn_igv_perdido — ${linea("origenes")(s)}`,
        sinUnir.length > 0 &&
          `fn_igv_perdido pierde también ${sinUnir.map((o) => `«${o}»`).join(", ")} y Gastos no lo une a ningún gasto: súmalo a fn_igv_perdido_de_gastos (o a ORIGENES_FUERA de esta prueba, con su porqué)`,
        unidos.join(",") !== ORIGENES_UNIDOS.join(",") && `fn_igv_perdido_de_gastos une compra y gasto_viaje — ${linea("unidos")(s)}`,
        !/^una_vez\|1$/m.test(s) && `pegada dos veces, el panel tiene una sola clave igv_perdido — ${linea("una_vez")(s)}`,
        !/^columnas\|true\|jsonb$/m.test(s) && `la lista devuelve las mismas columnas y el panel sigue siendo jsonb — ${linea("columnas")(s)}`,
        !/^permisos\|true\|false\|false\|true$/m.test(s) &&
          `la web llama fn_gastos_igv_perdido (security definer); la interna y anon, no — ${linea("permisos")(s)}`,
      ].filter(Boolean);
    },
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
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos del IGV perdido en Finanzas ▸ Gastos pasan.`);
process.exit(fallas ? 1 : 0);
