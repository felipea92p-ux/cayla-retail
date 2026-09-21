#!/usr/bin/env node
/**
 * Prueba de `retail.fn_ventas_del_dia` contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. La lista de lo vendido HOY (hora de Lima) que leen Caja, Vender y Facturación
 * (`20260921103000_ventas_del_dia_una_fila_por_venta_y_sin_anuladas.sql`):
 *   1. UNA fila por venta aunque tenga dos comprobantes (uno liberado o dado de baja y su
 *      reemplazo): sale el vigente, no el muerto, y el total no se cuenta dos veces.
 *   2. Una venta ANULADA no sale (ADR-0110: «venta» es lo cobrado sin las anuladas).
 *   3. Una venta cuyo único comprobante es un «no emitido» sí sale, diciéndolo.
 *   4. Nada más cambió: el rol (una colaboradora solo ve su sede, un líder elige la que
 *      pida), la firma y las columnas, y no nació una sobrecarga.
 *
 * CÓMO. Mismo mecanismo que `registrar_venta.mjs` (léelo primero si esto no tiene sentido):
 * `docker exec ... psql`, `set local request.jwt.claim.sub` para ser Felipe (líder) o Micaela
 * (colaboradora fija a Tienda Trujillo) y una sola transacción que termina SIEMPRE en
 * ROLLBACK — no deja rastro en el Postgres compartido. Las ventas se arman con las RPC reales
 * (`registrar_venta`, `anular_venta`, `marcar_comprobante_no_emitido`, `emitir_comprobante`),
 * no con INSERT a mano, así que si una de ellas cambia de forma, esto avisa.
 *
 * PROBAR UNA MIGRACIÓN ANTES DE APLICARLA. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro
 * de la transacción (que se revierte): sirve para ver el comportamiento nuevo sin tocar la base
 * compartida. Sin la variable, prueba lo que la base ya tiene (lo que hace CI).
 *
 * QUÉ DA POR SENTADO. `Tienda Lima` (con serie de boleta), `Tienda Trujillo` y la variante
 * `BLU-EMMA-NEG-M` (precio 79.90) del seed; lo demás se arma adentro y se revierte. Las cuatro
 * ventas con boleta se hacen en Lima y no en Trujillo porque, en el seed, las dos sedes tienen la
 * MISMA serie `B001` y el número 1 ya existe: una boleta nueva de Trujillo chocaría con la de Lima
 * (`comprobantes_tipo_serie_numero_key`). Para la colaboradora (fija a Trujillo) se hace una venta
 * más, allá y sin comprobante.
 *
 * USO
 *   pnpm pruebas:ventas-del-dia    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y registrar_venta.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora, fija a Tienda Trujillo

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que falla no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Una venta de una unidad, pagada en efectivo, en la sede `s` (sufijo de sus variables psql); con
// boleta reservada junto a la venta si `boleta`.
const venta = (s, boleta) => `retail.registrar_venta(:'ubic_${s}',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio')),
  null, gen_random_uuid()${boleta ? ", 'boleta'" : ""})`;

// Deja una sede lista para vender: piso/almacén (autocuración: este Postgres compartido puede no
// tenerlos), caja limpia y propia (cierra cualquiera abierta con la RPC real, nunca un UPDATE) y
// stock de sobra de la variante.
const sede = (nombre, s) => `
select id as ubic_${s} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic_${s}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic_${s}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic_${s}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic_${s}' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic_${s}' and estado = 'abierta'
) x) as _cerro_${s} \\gset
select retail.abrir_caja(:'ubic_${s}', 100.00) as caja_${s} \\gset
select retail.fn_sububicacion_por_defecto(:'ubic_${s}', 'venta') as sub_${s} \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic_${s}', :'sub_${s}', 'entrada', 1000, 'colchón de prueba') returning id as mov_${s} \\gset
select retail.fn_aplicar_movimiento(:'mov_${s}') as _d_${s} \\gset
`;

/**
 * Cinco ventas de hoy:
 *   En Tienda Lima, todas con boleta:
 *     A  normal.
 *     B  anulada con `anular_venta`.
 *     C  con DOS comprobantes: el primero liberado (`no_emitido`) y su reemplazo pendiente.
 *     D  con un único comprobante, liberado (`no_emitido`).
 *   En Tienda Trujillo:
 *     E  normal, sin comprobante.
 * Termina siendo Felipe; cada escenario cambia de persona si lo necesita.
 */
const FIXTURE = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';

select id as v1, precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
${sede("Tienda Lima", "l")}
${sede("Tienda Trujillo", "t")}

-- A: normal
select ${venta("l", true)} as va \\gset

-- B: anulada por la vía real
select ${venta("l", true)} as vb \\gset
select id as vb_item from retail.venta_items where venta_id = :'vb' \\gset
select retail.anular_venta(:'vb', 'prueba automatizada',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'vb_item', 'condicion', 'vendible'))) as _anulada \\gset

-- C: el primer comprobante se libera y se emite otro para la misma venta
select ${venta("l", true)} as vc \\gset
select id as vc_cmp1 from retail.comprobantes where venta_id = :'vc' \\gset
select retail.marcar_comprobante_no_emitido(:'vc_cmp1', 'prueba automatizada') as _libre_c \\gset
select retail.emitir_comprobante(:'ubic_l', 'boleta',
  round(:'precio' - round(:'precio' - :'precio' / 1.18, 2), 2), round(:'precio' - :'precio' / 1.18, 2), :'precio', :'vc') as vc_cmp2 \\gset

-- D: su único comprobante queda liberado
select ${venta("l", true)} as vd \\gset
select id as vd_cmp from retail.comprobantes where venta_id = :'vd' \\gset
select retail.marcar_comprobante_no_emitido(:'vd_cmp', 'prueba automatizada') as _libre_d \\gset

-- E: en Trujillo, sin comprobante
select ${venta("t", false)} as ve \\gset
`;

let fallos = 0;
let total = 0;

// `resultado` se imprime solo si falla: distingue «la regla no se cumple» de «el fixture se rompió».
function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 600)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  const IDS = ":'va', :'vb', :'vc', :'vd', :'ve'";
  const LETRA = (columna) => `case ${columna} when :'va' then 'A' when :'vb' then 'B' when :'vc' then 'C' when :'vd' then 'D' when :'ve' then 'E' end`;

  const r = correr(`${FIXTURE}
-- Lo que devuelve la función para estas cinco ventas (un líder, sin filtro de sede), con la letra de cada una.
select 'fila|' || ${LETRA("f.venta_id")}
  || '|' || coalesce(f.comprobante_estado, '') || '|' || coalesce(f.comprobante_texto, '') || '|' || f.total::text
from retail.fn_ventas_del_dia(null) f
where f.venta_id in (${IDS})
order by 1;
select 'reemplazo_c|' || serie || '-' || lpad(numero::text, 6, '0') from retail.comprobantes where id = :'vc_cmp2';
select 'suma|' || coalesce(sum(f.total), 0)::text from retail.fn_ventas_del_dia(null) f where f.venta_id in (${IDS});
select 'precio|' || :'precio';
-- Un líder que pide una sede ve solo las de esa sede.
select 'lima|' || count(*) from retail.fn_ventas_del_dia(:'ubic_l') f where f.venta_id in (${IDS});
select 'trujillo|' || count(*) from retail.fn_ventas_del_dia(:'ubic_t') f where f.venta_id in (${IDS});
-- La firma y las columnas no cambian; no hay sobrecarga.
select 'forma|' || pg_get_function_result('retail.fn_ventas_del_dia(uuid)'::regprocedure);
select 'firmas|' || count(*) from pg_proc where proname = 'fn_ventas_del_dia' and pronamespace = 'retail'::regnamespace;
-- Micaela (colaboradora fija a Trujillo) ve solo la de su sede.
set local request.jwt.claim.sub = '${MICAELA}';
select 'micaela|' || ${LETRA("f.venta_id")} from retail.fn_ventas_del_dia(null) f where f.venta_id in (${IDS}) order by 1;
rollback;
`);

  if (!r.ok) {
    console.log("✗ el fixture o la consulta fallaron antes de poder probar nada");
    console.log(`    ${r.mensaje.slice(0, 1200)}`);
    process.exit(1);
  }

  const lineas = r.salida.split("\n");
  const filas = lineas.filter((l) => l.startsWith("fila|")).map((l) => l.split("|").slice(1)); // [letra, estado, texto, total]
  const dato = (clave) => lineas.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);
  const porLetra = Object.fromEntries(filas.map(([letra, estado, texto, monto]) => [letra, { estado, texto, monto }]));
  const precio = Number(dato("precio"));
  const deMicaela = lineas.filter((l) => l.startsWith("micaela|")).map((l) => l.slice("micaela|".length));

  esperar("una venta normal sale una vez, con su comprobante", filas.filter((f) => f[0] === "A").length === 1 && porLetra.A?.estado === "pendiente", r.salida);
  esperar("una venta ANULADA no sale", !("B" in porLetra), r.salida);
  esperar("una venta con dos comprobantes sale UNA sola vez", filas.filter((f) => f[0] === "C").length === 1, r.salida);
  esperar(
    "de los dos comprobantes sale el vigente (el reemplazo pendiente), no el liberado",
    filas.some((f) => f[0] === "C") && filas.filter((f) => f[0] === "C").every((f) => f[1] === "pendiente" && f[2] === dato("reemplazo_c")),
    r.salida
  );
  esperar(
    "una venta cuyo único comprobante está liberado sale, diciendo «no_emitido»",
    filas.filter((f) => f[0] === "D").length === 1 && porLetra.D?.estado === "no_emitido",
    r.salida
  );
  esperar("una venta sin comprobante sale sin estado (la lista dice «Sin comprobante»)", filas.filter((f) => f[0] === "E").length === 1 && porLetra.E?.estado === "", r.salida);
  esperar(
    "el total no se cuenta dos veces: A, C, D y E suman cuatro ventas, sin la anulada",
    filas.length === 4 && Number(dato("suma")) === Math.round(precio * 4 * 100) / 100 && ["A", "C", "D", "E"].every((l) => Number(porLetra[l]?.monto) === precio),
    r.salida
  );
  esperar("un líder que pide Lima ve A, C y D (no la anulada ni la de Trujillo)", dato("lima") === "3", r.salida);
  esperar("un líder que pide Trujillo ve solo la de Trujillo", dato("trujillo") === "1", r.salida);
  esperar("una colaboradora fija a Trujillo ve solo la de su sede", deMicaela.length === 1 && deMicaela[0] === "E", r.salida);
  esperar(
    "la firma y las columnas no cambiaron, y no nació una sobrecarga",
    dato("forma") ===
      "TABLE(venta_id uuid, hora text, ubicacion_nombre text, vendedor text, cliente_nombre text, items jsonb, total numeric, metodos_pago text, comprobante_tipo text, comprobante_texto text, comprobante_estado text, nota text)" &&
      dato("firmas") === "1",
    r.salida
  );

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
