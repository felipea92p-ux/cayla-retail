#!/usr/bin/env node
/**
 * Prueba de Finanzas ▸ Gastos con los gastos del viaje (ADR-0362, fase 6): `20261014164000_gastos_lista_papel_del_viaje.sql`, sobre las
 * de la fase (los gastos del viaje, 20261013221000/222000, y el IGV de la actividad 8, 20261014153000, que la base ya tiene que tener).
 *
 * QUÉ PROMETE
 *   · La lista (`fn_gastos_lista`) dice el papel de un gasto del viaje desde su ficha: el hotel con factura dice «factura», su serie y
 *     número, y quien la dio (el proveedor con ese RUC o, si ninguno lo tiene, «RUC …»), junto a su IGV. Antes decía «sin comprobante».
 *     La boleta, el ticket y la planilla de movilidad llegan como tales, sin traducir (las palabras las pone la pantalla).
 *   · Un gasto de Finanzas se lee igual que antes: su tipo, su número y su proveedor salen del comprobante de compra.
 *   · Las cifras (`fn_gastos_panel`) dicen lo mismo que la lista: las boletas son las filas «boleta» y «sin comprobante», las que no traen
 *     papel o traen la planilla de movilidad (decisión 55). Una boleta del viaje cuenta como boleta.
 *   · Las columnas de las dos funciones no cambian (volver a pegar la migración que las creó sigue funcionando), y pegar esta migración
 *     dos veces deja una sola ficha unida.
 *   · Todo lo que la lista puede traer como papel (los candados de `compras.tipo` y `gastos_viaje.papel`) lo sabe decir la pantalla
 *     (`TEXTO_PAPEL_DE_GASTO` de lib/gastos-reglas.ts, en la web). Si la base gana un valor, esta prueba dice cuál falta. (No se escribe
 *     la ruta completa de la web a propósito: `scripts/ci/pruebas-web.mjs` contaría esta prueba como una que lee la web, y no la lee.)
 *
 * CÓMO. Como `igv_fase6.mjs`: carga su migración dos veces dentro de cada caso, sesión simulada con `request.jwt.claim.sub` y ROLLBACK
 * siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:gastos-lista-viaje                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/gastos_lista_viaje.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261014164000_gastos_lista_papel_del_viaje.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed): ve los gastos de todas las tiendas
// Un RUC que ningún proveedor tiene: la lista dice el RUC, porque no sabe la razón social.
const RUC_SUELTO = "20999999993";
// Lo que la pantalla sabe decir (`TEXTO_PAPEL_DE_GASTO`): los tipos de `compras` y los papeles de `gastos_viaje`.
const PAPELES_DE_LA_PANTALLA = ["boleta", "factura", "nota_venta", "planilla_movilidad", "recibo_por_honorarios", "sin_comprobante", "ticket"];
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
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

// Un gasto del viaje pagado por transferencia desde el banco de la prueba (`:'bcp'`), hoy, a la orden de la prueba (`:'oc'`: desde la
// decisión 75, 20261014170000, un gasto del viaje va siempre al menos a una orden). `ruc` puede ser una variable de psql.
const gastoViaje = (alias, { concepto, monto, papel, serie = null, ruc = null }) =>
  `select retail.registrar_gasto_viaje('viaje', '${concepto}', ${monto}, retail.fn_hoy_lima(), '${papel}', 'transferencia', :'bcp', array[:'oc']::uuid[], ${
    serie ? `'${serie}'` : "null"
  }, ${ruc ?? "null"}, null, null) as ${alias} \\gset\n`;

// Las dos cifras del panel de hoy, para medir cuánto CAMBIAN (la base local trae datos).
const panelDeHoy = (sufijo) =>
  `select (p.x ->> 'boletas')::int as boletas${sufijo}, (p.x ->> 'sin_comprobante')::int as sin${sufijo}, (p.x ->> 'n')::int as n${sufijo}
     from (select retail.fn_gastos_panel(retail.fn_hoy_lima(), retail.fn_hoy_lima()) as x) p \\gset\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
${sinCandadosDePegado(MIGRACION)}
set local search_path = retail, public, extensions;

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prov, nombre as prov_nombre, ruc as prov_ruc from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba lista de gastos', 'banco', '104', 90000, retail.fn_hoy_lima() - 60, 64) returning id as bcp \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as oc \\gset
${como(FELIPE)}${firma("gasto_viaje_registrar")}
`;

// Los cinco papeles de un viaje: el hotel con factura de un proveedor conocido, una factura de un RUC que ningún proveedor tiene, una
// boleta, un ticket sin número y el taxi con planilla de movilidad.
const CINCO_PAPELES = `${panelDeHoy("0")}
${gastoViaje("g_hotel", { concepto: "hotel", monto: 2360, papel: "factura", serie: "F001-4321", ruc: ":'prov_ruc'" })}
${gastoViaje("g_ruc", { concepto: "comida", monto: 118, papel: "factura", serie: "F002-15", ruc: `'${RUC_SUELTO}'` })}
${gastoViaje("g_boleta", { concepto: "comida", monto: 50, papel: "boleta", serie: "B001-9" })}
${gastoViaje("g_ticket", { concepto: "pasaje", monto: 30, papel: "ticket" })}
${gastoViaje("g_planilla", { concepto: "taxi", monto: 20, papel: "planilla_movilidad" })}
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;

const CASOS = [
  {
    nombre: "la lista dice el papel de un gasto del viaje: el hotel con factura ya no sale «sin comprobante»",
    sql: `${CINCO_PAPELES}
select 'lista|' || string_agg(
         case l.id when :'g_hotel' then 'hotel' when :'g_ruc' then 'ruc' when :'g_boleta' then 'boleta' when :'g_ticket' then 'ticket' else 'planilla' end
         || ':' || coalesce(l.comprobante_tipo, '-') || ':' || coalesce(l.comprobante, '-') || ':' || coalesce(l.proveedor_nombre, '-') || ':' || l.igv,
         ',' order by l.monto_total desc)
  from retail.fn_gastos_lista(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null, false, 100000) l
 where l.id in (:'g_hotel', :'g_ruc', :'g_boleta', :'g_ticket', :'g_planilla');
select 'proveedor|' || :'prov_nombre';`,
    revisa: (s) => {
      const proveedor = (s.match(/^proveedor\|(.*)$/m)?.[1] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return [
        !proveedor && `falta el proveedor de la siembra «Textiles Andina SAC» con su RUC — ${linea("proveedor")(s)}`,
        !new RegExp(
          `^lista\\|hotel:factura:F001-4321:${proveedor}:360\\.00,ruc:factura:F002-15:RUC ${RUC_SUELTO}:18\\.00,` +
            "boleta:boleta:B001-9:-:0\\.00,ticket:ticket:-:-:0\\.00,planilla:planilla_movilidad:-:-:0\\.00$",
          "m"
        ).test(s) &&
          `el hotel dice factura F001-4321 y su proveedor, con su IGV; la otra factura, «RUC ${RUC_SUELTO}»; boleta, ticket y planilla, tal cual — ${linea("lista")(s)}`,
      ].filter(Boolean);
    },
  },
  {
    nombre: "un gasto de Finanzas se lee igual que antes: tipo, número y proveedor de su comprobante de compra",
    sql: `-- Una factura de luz de Finanzas ▸ Gastos, con su comprobante de proveedor.
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz prueba lista', retail.fn_hoy_lima(), 118,
  jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov', 'serie', 'L777', 'numero', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
                     'condicion', 'contado'), 'transferencia', p_cuenta_id => :'bcp') as g_luz \\gset
${CINCO_PAPELES}
select 'luz|' || l.comprobante_tipo || ':' || (l.comprobante = c.documento) || ':' || (l.proveedor_nombre = :'prov_nombre')
  from retail.fn_gastos_lista(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null, false, 100000) l
  join retail.compras c on c.id = l.compra_id
 where l.id = :'g_luz';
-- Todo gasto que no es del viaje, en el último año: lo mismo que diría su comprobante de compra (o nada, sin comprobante).
select 'iguales|' || count(*) filter (where l.comprobante_tipo is distinct from c.tipo or l.comprobante is distinct from c.documento
                                         or l.proveedor_nombre is distinct from p.nombre) || '|' || (count(*) > 0)
  from retail.fn_gastos_lista(retail.fn_hoy_lima() - 400, retail.fn_hoy_lima(), null, false, 100000) l
  join retail.gastos g on g.id = l.id
  left join retail.compras c on c.id = g.compra_id
  left join retail.proveedores p on p.id = c.proveedor_id
 where not exists (select 1 from retail.gastos_viaje gv where gv.gasto_id = g.id);`,
    revisa: (s) => [
      !/^luz\|factura:true:true$/m.test(s) && `la factura de luz dice «factura», su número y su proveedor, como antes — ${linea("luz")(s)}`,
      !/^iguales\|0\|true$/m.test(s) && `ningún gasto que no es del viaje cambia lo que dice — ${linea("iguales")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "las cifras dicen lo mismo que la lista: la boleta del viaje cuenta como boleta y la planilla como «sin comprobante»",
    sql: `${CINCO_PAPELES}
${panelDeHoy("1")}
select 'cambia|' || (:boletas1 - :boletas0) || '|' || (:sin1 - :sin0) || '|' || (:n1 - :n0);
-- Lo que cuentan las cifras de hoy contra las filas vigentes de la lista de hoy (la misma persona: ve lo mismo).
select 'cuadra|' || ((select count(*) from retail.fn_gastos_lista(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null, false, 100000) l
                       where l.estado = 'vigente' and l.comprobante_tipo = 'boleta') = :boletas1)
       || '|' || ((select count(*) from retail.fn_gastos_lista(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null, false, 100000) l
                    where l.estado = 'vigente' and coalesce(l.comprobante_tipo, 'planilla_movilidad') = 'planilla_movilidad') = :sin1);`,
    revisa: (s) => [
      !/^cambia\|1\|1\|5$/m.test(s) && `cinco gastos más: una boleta más y uno más «sin comprobante» (la planilla) — ${linea("cambia")(s)}`,
      !/^cuadra\|true\|true$/m.test(s) && `las cifras cuentan lo mismo que las filas de la lista — ${linea("cuadra")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "las columnas no cambian, pegarla dos veces deja una sola ficha unida, y la pantalla sabe decir todo papel posible",
    sql: `select 'columnas|' || (pg_get_function_result('retail.fn_gastos_lista(date, date, uuid, boolean, integer)'::regprocedure) = '${COLUMNAS_LISTA}')
       || '|' || pg_get_function_result('retail.fn_gastos_panel(date, date, uuid, boolean)'::regprocedure);
select 'una_vez|' || string_agg(p.proname || ':' || (length(d.def) - length(replace(d.def, 'left join retail.gastos_viaje gv', '')))
                                 / length('left join retail.gastos_viaje gv'), ',' order by p.proname)
  from pg_proc p cross join lateral (select pg_get_functiondef(p.oid) as def) d
 where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_gastos_lista', 'fn_gastos_panel');
select 'papeles|' || string_agg(distinct x.v, ',' order by x.v)
  from (select (regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'))[1] as v
          from pg_constraint c
         where (c.conrelid, c.conname) in (('retail.compras'::regclass, 'compras_tipo_check'), ('retail.gastos_viaje'::regclass, 'gastos_viaje_papel_check'))) x;`,
    revisa: (s) => {
      const papeles = (s.match(/^papeles\|(.*)$/m)?.[1] ?? "").split(",").filter(Boolean);
      const faltan = papeles.filter((p) => !PAPELES_DE_LA_PANTALLA.includes(p));
      return [
        !/^columnas\|true\|jsonb$/m.test(s) && `la lista devuelve las mismas columnas que en producción y el panel sigue siendo jsonb — ${linea("columnas")(s)}`,
        !/^una_vez\|fn_gastos_lista:1,fn_gastos_panel:1$/m.test(s) && `pegada dos veces, cada función une la ficha una sola vez — ${linea("una_vez")(s)}`,
        papeles.length === 0 && `no encontré los candados compras_tipo_check y gastos_viaje_papel_check — ${linea("papeles")(s)}`,
        faltan.length > 0 &&
          `la base acepta ${faltan.map((p) => `«${p}»`).join(", ")} y la pantalla no sabe decirlo: súmalo a TEXTO_PAPEL_DE_GASTO (lib/gastos-reglas.ts, en la web) y a esta lista`,
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
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de la lista de gastos con los gastos del viaje pasan.`);
process.exit(fallas ? 1 : 0);
