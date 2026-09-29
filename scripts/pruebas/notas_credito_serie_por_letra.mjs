#!/usr/bin/env node
/**
 * Prueba de que una tienda puede tener DOS series de nota de crédito —BC.. para boletas, FC.. para facturas— y que
 * cada nota sale con la letra del documento que corrige — CAYLA V2
 * (`20260929170000_notas_de_credito_una_serie_por_letra.sql`).
 *
 * EL HUECO. SUNAT rechaza una nota cuya serie no lleve la letra del documento que corrige (B… boletas, F… facturas).
 * Con «una serie activa por tienda y tipo» una tienda solo podía tener una nota de crédito, y la que producción tenía
 * (`NC01`) no empieza ni con B ni con F. Además la base aceptaba cualquier nombre de serie: lo comprobaba solo la pantalla.
 *
 * QUÉ PRUEBA.
 *   1. Lo que debe andar: registrar BC.. y FC.. en la misma tienda; una nota de una boleta sale con la BC.., la de una
 *      factura con la FC.., cada una con su propio correlativo; boleta y factura siguen reservando como siempre.
 *   2. Lo que no debe pasar: una segunda serie con la misma letra; nombres que SUNAT rechaza (`NC01`, `X001`, cinco
 *      caracteres); una nota cuya letra no tiene serie no reserva ningún número; y el índice lo impide aunque se salte la RPC.
 *   3. Lo que no cambia: la nota de venta sigue con nombre libre, y la reserva sigue sin ser llamable desde la app.
 *
 * CÓMO. Mismo mecanismo que `comprobante_venta_anulada.mjs` (léelo primero): `docker exec ... psql`, `set local
 * request.jwt.claim.sub` para ser Felipe (líder) y una sola transacción que termina SIEMPRE en ROLLBACK.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción (que se revierte). Sin la
 * variable, prueba lo que la base ya tiene (lo que hace CI).
 *
 * USO
 *   pnpm pruebas:notas-credito-serie-por-letra    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

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

// Tienda Lima sin ninguna serie de nota (las archiva DENTRO de la transacción, que se revierte) y sin la nota de venta
// para poder probar su nombre libre. Las boletas y facturas de siempre no se tocan.
const FIXTURE = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
update retail.series_comprobantes
   set archivada_at = now(), motivo_archivo = 'prueba automatizada'
 where ubicacion_id = :'ubic' and tipo in ('nota_credito', 'nota_debito', 'nota_venta') and archivada_at is null;
select set_config('t.ubic', :'ubic', true) as _g \\gset
create temp table _r (clave text, valor text);
`;

// Intenta algo que debe fallar y guarda el mensaje (o «(no falló)»): un bloque `do` se revierte solo, y el estado de
// después se puede mirar.
const INTENTA = (clave, sql) => `do $$ begin
  begin
    ${sql};
    insert into _r values ('${clave}', '(no falló)');
  exception when others then
    insert into _r values ('${clave}', sqlerrm);
  end;
end $$;`;

const REGISTRAR = (tipo, serie) => `retail.registrar_serie_comprobante(current_setting('t.ubic')::uuid, '${tipo}', '${serie}')`;
// Dentro de un bloque `do` una llamada suelta necesita `perform`.
const PERFORM_REGISTRAR = (tipo, serie) => `perform ${REGISTRAR(tipo, serie)}`;

let fallos = 0;
let total = 0;

// `resultado` se imprime solo si falla: distingue «la regla no se cumple» de «el fixture se rompió».
function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 700)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- Escenario 1: dos series de nota en la misma tienda, y cada nota con la letra de su original ----
  const r1 = correr(`${FIXTURE}
select ${REGISTRAR("nota_credito", "bc91")} as _bc \\gset
select ${REGISTRAR("nota_credito", "FC91")} as _fc \\gset

-- una boleta y una factura manuales (sin venta), y sus notas
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as bol \\gset
select retail.emitir_comprobante(:'ubic', 'factura', 84.75, 15.25, 100.00, null, 'ruc', '20605964550', 'CAYLA S.A.C.') as fac \\gset
-- SUNAT solo admite notas sobre lo que ya aceptó (fn_valida_nota_referencia_aceptada)
select retail.actualizar_transmision_comprobante(:'bol', 'aceptado', 'sandbox', '{"prueba": true}'::jsonb) as _ab \\gset
select retail.actualizar_transmision_comprobante(:'fac', 'aceptado', 'sandbox', '{"prueba": true}'::jsonb) as _af \\gset
select retail.emitir_nota(:'bol', 'nota_credito', '06', 84.75, 15.25, 100.00) as nota_b \\gset
select retail.emitir_nota(:'fac', 'nota_credito', '06', 84.75, 15.25, 100.00) as nota_f \\gset
select retail.emitir_nota(:'bol', 'nota_credito', '07', 8.47, 1.53, 10.00) as nota_b2 \\gset

select 'activas|' || count(*) from retail.series_comprobantes
 where ubicacion_id = :'ubic' and tipo = 'nota_credito' and archivada_at is null;
select 'nota_boleta|' || serie || '-' || numero from retail.comprobantes where id = :'nota_b';
select 'nota_factura|' || serie || '-' || numero from retail.comprobantes where id = :'nota_f';
select 'nota_boleta_2|' || serie || '-' || numero from retail.comprobantes where id = :'nota_b2';
select 'boleta|' || (serie like 'B%')::text || '|' || numero from retail.comprobantes where id = :'bol';
select 'factura|' || (serie like 'F%')::text || '|' || numero from retail.comprobantes where id = :'fac';
select 'reservar_authenticated|' || has_function_privilege('authenticated', 'retail.fn_reservar_numero_serie(uuid, text, text)', 'execute')::text;
select 'reservar_anon|' || has_function_privilege('anon', 'retail.fn_reservar_numero_serie(uuid, text, text)', 'execute')::text;
select 'reservar_firmas|' || count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_reservar_numero_serie';
rollback;
`);

  if (!r1.ok) {
    console.log("✗ el escenario de lo que debe andar falló antes de poder probar nada");
    console.log(`    ${r1.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l1 = r1.salida.split("\n");
  const dato1 = (clave) => l1.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar("una tienda registra BC.. y FC.. a la vez (la letra se escribe en minúscula y se guarda en mayúscula)", dato1("activas") === "2", r1.salida);
  esperar("la nota de una BOLETA sale con la serie B… de nota, desde el 1", dato1("nota_boleta") === "BC91-1", r1.salida);
  esperar("la nota de una FACTURA sale con la serie F… de nota, desde el 1", dato1("nota_factura") === "FC91-1", r1.salida);
  esperar("cada serie lleva su propio correlativo", dato1("nota_boleta_2") === "BC91-2", r1.salida);
  esperar("una boleta y una factura siguen reservando su serie como siempre", dato1("boleta")?.startsWith("true|") && dato1("factura")?.startsWith("true|"), r1.salida);
  esperar("la reserva de números no es llamable desde la app (ni con sesión ni sin ella)", dato1("reservar_authenticated") === "false" && dato1("reservar_anon") === "false", r1.salida);
  esperar("queda UNA sola firma de fn_reservar_numero_serie (sin sobrecarga que ambigüe la llamada)", dato1("reservar_firmas") === "1", r1.salida);

  // ---- Escenario 2: lo que NO debe pasar ----
  const r2 = correr(`${FIXTURE}
select ${REGISTRAR("nota_credito", "BC91")} as _bc \\gset

${INTENTA("segunda_misma_letra", PERFORM_REGISTRAR("nota_credito", "BC92"))}
${INTENTA("nombre_nc01", PERFORM_REGISTRAR("nota_credito", "NC91"))}
${INTENTA("boleta_con_f", PERFORM_REGISTRAR("boleta", "F991"))}
${INTENTA("factura_con_b", PERFORM_REGISTRAR("factura", "B991"))}
${INTENTA("cinco_caracteres", PERFORM_REGISTRAR("nota_credito", "FC901"))}
${INTENTA("boleta_repetida", PERFORM_REGISTRAR("boleta", "B001"))}
-- el índice manda aunque se salte la RPC: dos notas activas con la misma letra, en la misma tienda
${INTENTA("indice", "insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero) values (current_setting('t.ubic')::uuid, 'nota_credito', 'BC93', 1)")}

-- una nota de FACTURA sin serie F… de nota: se niega, dice qué falta y NO gasta ningún número de la B…
select retail.emitir_comprobante(:'ubic', 'factura', 84.75, 15.25, 100.00, null, 'ruc', '20605964550', 'CAYLA S.A.C.') as fac \\gset
select retail.actualizar_transmision_comprobante(:'fac', 'aceptado', 'sandbox', '{"prueba": true}'::jsonb) as _af \\gset
select set_config('t.fac', :'fac', true) as _g2 \\gset
select siguiente_numero as bc_antes from retail.series_comprobantes where ubicacion_id = :'ubic' and serie = 'BC91' \\gset
${INTENTA("nota_sin_serie_f", "perform retail.emitir_nota(current_setting('t.fac')::uuid, 'nota_credito', '06', 84.75, 15.25, 100.00)")}
select siguiente_numero as bc_despues from retail.series_comprobantes where ubicacion_id = :'ubic' and serie = 'BC91' \\gset

-- la nota de venta no es de SUNAT: su nombre es libre
select ${REGISTRAR("nota_venta", "ZZ01")} as _nv \\gset

select 'segunda_misma_letra|' || valor from _r where clave = 'segunda_misma_letra';
select 'nombre_nc01|' || valor from _r where clave = 'nombre_nc01';
select 'boleta_con_f|' || valor from _r where clave = 'boleta_con_f';
select 'factura_con_b|' || valor from _r where clave = 'factura_con_b';
select 'cinco_caracteres|' || valor from _r where clave = 'cinco_caracteres';
select 'boleta_repetida|' || valor from _r where clave = 'boleta_repetida';
select 'indice|' || valor from _r where clave = 'indice';
select 'nota_sin_serie_f|' || valor from _r where clave = 'nota_sin_serie_f';
select 'bc_intacta|' || (:'bc_antes' = :'bc_despues')::text;
select 'nota_venta_libre|' || count(*) from retail.series_comprobantes
 where ubicacion_id = :'ubic' and tipo = 'nota_venta' and serie = 'ZZ01' and archivada_at is null;
rollback;
`);

  if (!r2.ok) {
    console.log("✗ el escenario de lo que no debe pasar falló antes de poder probar nada");
    console.log(`    ${r2.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l2 = r2.salida.split("\n");
  const dato2 = (clave) => l2.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1) ?? "";

  esperar("una segunda serie de nota con la MISMA letra se niega y dice cuál ya está activa", /ya tiene la serie BC91 activa/.test(dato2("segunda_misma_letra")), r2.salida);
  esperar("NC91 no se registra: una nota lleva B o F de primera letra", /empieza con B si corrige boletas o con F si corrige facturas/.test(dato2("nombre_nc01")), r2.salida);
  esperar("una boleta con serie F… no se registra", /empieza con B/.test(dato2("boleta_con_f")), r2.salida);
  esperar("una factura con serie B… no se registra", /empieza con F/.test(dato2("factura_con_b")), r2.salida);
  esperar("una serie de cinco caracteres no se registra", /cuatro caracteres/.test(dato2("cinco_caracteres")), r2.salida);
  esperar("una boleta repetida sigue negándose: una activa por tienda y tipo", /ya tiene la serie B001 activa/.test(dato2("boleta_repetida")), r2.salida);
  esperar("el índice lo impide aunque se salte la RPC", /series_comprobantes_activa_por_tienda_tipo_y_letra/.test(dato2("indice")), r2.salida);
  esperar("la nota de una factura sin serie F… se niega y dice qué registrar", /No hay una serie de nota_credito que corrija facturas.*empieza con F/.test(dato2("nota_sin_serie_f")), r2.salida);
  esperar("y no gasta ni un número de la serie B… de nota", dato2("bc_intacta") === "true", r2.salida);
  esperar("la nota de venta conserva su nombre libre", dato2("nota_venta_libre") === "1", r2.salida);

  console.log(`\n${total - fallos}/${total} pruebas pasaron`);
  process.exit(fallos ? 1 : 0);
}

main();
