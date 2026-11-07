#!/usr/bin/env node
/**
 * Prueba de `20261031013000_registrar_compra_emision_en_dia_de_lima.sql`.
 *
 * EL PROBLEMA QUE PRUEBA. `registrar_compra` tomaba `p_fecha_emision date DEFAULT CURRENT_DATE` (UTC) y rechaza una emisión
 * posterior a `fn_hoy_lima()`: de 19:00 a 24:00 en Lima, toda compra sin fecha de emisión salía «futura» (`emision_futura`).
 * Ahora el default es `retail.fn_hoy_lima()`: una compra sin fecha queda en el día de Lima a cualquier hora, y una fecha
 * futura se sigue rechazando.
 *
 * EL RELOJ. Para no depender de la hora a la que corre, `fn_hoy_lima()` se reemplaza DENTRO de la transacción por
 * `current_date - 1` (UTC ya es «mañana», Lima sigue en «hoy»), como `compras_indicadores.mjs`. El ROLLBACK la restaura.
 * El CONTROL vuelve a poner el default viejo en la misma transacción: con él, la compra sin fecha se rechaza.
 *
 * USO: pnpm pruebas:registrar-compra-emision-lima   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261031013000_registrar_compra_emision_en_dia_de_lima.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const FIRMA = "retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

const RELOJ_UTC_ADELANTADO = `create or replace function retail.fn_hoy_lima() returns date language sql stable as $$ select current_date - 1 $$;\n`;
// El default de antes de la migración, puesto a mano en la transacción (se pega igual sobre una base que ya la tiene).
const DEFAULT_VIEJO = `do $d$ begin execute regexp_replace(pg_get_functiondef('${FIRMA}'::regprocedure),
  'p_fecha_emision date DEFAULT (retail\\.)?fn_hoy_lima\\(\\)', 'p_fecha_emision date DEFAULT CURRENT_DATE'); end $d$;\n`;

function preparar({ conMigracion = true, viejo = false, reloj = true } = {}) {
  return `begin;
set local request.jwt.claim.sub = '${FELIPE}';
${conMigracion ? MIGRACION : ""}
${viejo ? DEFAULT_VIEJO : ""}
${reloj ? RELOJ_UTC_ADELANTADO : ""}
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select p.id as pid, v.id as vid from retail.productos p join retail.variantes v on v.producto_id = p.id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select 'T' || substr(md5(random()::text), 1, 6) as ser \\gset
`;
}

/** Registra una compra; `emision` es una expresión SQL o `null` para no mandarla (el caso que se rompía). */
const comprar = (emision) => `select retail.registrar_compra(
  p_proveedor_id => :'prov', p_serie => :'ser', p_numero => '1', p_condicion => 'credito', p_ubicacion_destino_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('producto_id', :'pid', 'variante_id', :'vid', 'cantidad', 2, 'costo_unitario', 10, 'confirma_costo', true)),
  ${emision === null ? "" : `p_fecha_emision => ${emision}, `}p_fecha_vencimiento => retail.fn_hoy_lima() + 30) as cid \\gset
select (fecha_emision = retail.fn_hoy_lima())::text || '|' || (fecha_emision = current_date)::text from retail.compras where id = :'cid';`;

const rechazaFutura = (r) => !r.ok && /emision_futura/.test(r.error);

let fallas = 0;
function esperar(nombre, ok, detalle) {
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").slice(0, 3).join("\n    ")}`);
  }
}

// CONTROL: con el default de antes y UTC adelantado, la compra sin fecha se rechazaba. Si esto pasa, la prueba no ve nada.
const control = correr(`${preparar({ viejo: true })}${comprar(null)}`);
esperar("CONTROL sin la migración: con UTC ya en «mañana», una compra sin fecha de emisión se rechaza (emision_futura)", rechazaFutura(control), control.error ?? control.salida);

const deNoche = correr(`${preparar()}${comprar(null)}`);
esperar("con UTC ya en «mañana», una compra sin fecha de emisión entra fechada en el día de Lima, no en el de UTC", deNoche.ok && deNoche.salida === "true|false", deNoche.error ?? deNoche.salida);

const deDia = correr(`${preparar({ reloj: false })}${comprar(null)}`);
esperar("a cualquier hora real, una compra sin fecha de emisión queda en fn_hoy_lima()", deDia.ok && deDia.salida.startsWith("true|"), deDia.error ?? deDia.salida);

const futura = correr(`${preparar()}${comprar("retail.fn_hoy_lima() + 1")}`);
esperar("una emisión de mañana (Lima) se sigue rechazando (emision_futura)", rechazaFutura(futura), futura.error ?? futura.salida);

const pasada = correr(`${preparar()}${comprar("retail.fn_hoy_lima() - 3")} select (fecha_emision = retail.fn_hoy_lima() - 3)::text from retail.compras where id = :'cid';`);
esperar("una emisión explícita se guarda tal cual", pasada.ok && pasada.salida.endsWith("true"), pasada.error ?? pasada.salida);

const forma = correr(`${preparar({ reloj: false })}${MIGRACION}
select substring(pg_get_function_arguments('${FIRMA}'::regprocedure) from 'p_fecha_emision date DEFAULT [^,]*') || '|' ||
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'registrar_compra') || '|' ||
  has_function_privilege('authenticated', '${FIRMA}', 'execute') || '|' || has_function_privilege('anon', '${FIRMA}', 'execute');`);
esperar(
  "se puede pegar dos veces: el default queda en fn_hoy_lima(), una sola firma, authenticated la llama y anon no",
  forma.ok && /^p_fecha_emision date DEFAULT (retail\.)?fn_hoy_lima\(\)\|1\|true\|false$/.test(forma.salida.split("\n").pop()),
  forma.error ?? forma.salida
);

const total = 6;
console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
