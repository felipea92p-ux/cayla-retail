#!/usr/bin/env node
/**
 * Pruebas de «una campaña que solo tiene OFERTAS también sale en la Tienda web»
 * (`20261027221000_campana_con_ofertas_en_tienda_web.sql`, Felipe 2026-10-27) contra el Postgres local.
 *
 * QUÉ PRUEBA. Desde ADR-0496 una campaña guarda su descuento como OFERTAS (`retail.campana_reglas`), no en `etiquetas.descuento_pct`. La caja las
 * lee, pero la lista de Tienda web ▸ Campañas, la portada y el diseño preguntaban solo por `descuento_pct > 0`.
 *   · la lista (`fn_campanas_web`, `fn_campana_web_valida`): sale con descuento de siempre O con una oferta ACTIVA (de cualquier fecha); un
 *     borrador o una oferta retirada no cuentan; su `pct` es el mayor entre las dos cosas;
 *   · la portada (`tienda_portada`, `tienda_diseno_campana`, `fn_campana_portada`): solo cuenta una oferta que rige HOY (fechas y día de la semana,
 *     como la caja); el % es el mayor entre el descuento de siempre y las ofertas de hoy; el «hasta» es el de lo que da ese %; pide prendas;
 *   · el diseño sale de la MISMA campaña que la portada;
 *   · sin ofertas todo queda idéntico a antes (portada, diseño y lista, antes y después de la migración);
 *   · la migración se puede aplicar dos veces seguidas y se niega si una función viva no es la de producción.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (como `campana_reglas.mjs`): la base compartida queda igual. Para que la campaña de
 * prueba sea la que gana la portada, el escenario apaga las demás campañas dentro de su transacción.
 *
 * DA POR SENTADO: la variante `BLU-EMMA-NEG-M` del seed y las migraciones de ofertas (20261023232000) y de Tienda web ▸ Campañas.
 *
 * USO
 *   pnpm pruebas:campana-con-ofertas                       → con la migración ya aplicada en la base `postgres` del local
 *   APLICAR_ANTES=supabase/migrations/20261027221000_campana_con_ofertas_en_tienda_web.sql pnpm pruebas:campana-con-ofertas   → la ensaya dentro de cada escenario
 *   pnpm pruebas:campana-con-ofertas -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const iBase = process.argv.indexOf("--base");
const BASE = iBase > 0 ? process.argv[iBase + 1] : "postgres";
const MIGRACION = "supabase/migrations/20261027221000_campana_con_ofertas_en_tienda_web.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todos los módulos

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 900)}`);
  }
}
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»: ${r.salida}` : r.mensaje);
const ultimaLinea = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, ultimaLinea(r) === esperado, r.ok ? `dio «${ultimaLinea(r)}», se esperaba «${esperado}»` : r.mensaje);

const HOY = "retail.fn_hoy_lima()";
// Como el líder, con una campaña «ZZ …» de ayer a dentro de 10 días, SIN descuento de siempre y con la talla BLU-EMMA-NEG-M marcada (tiene prendas).
const PREPARAR = `begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select v.id as v1 from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
select p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select extract(isodow from ${HOY} + 1)::smallint as dow_manana \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña solo con ofertas (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'camp');
`;
// La campaña de prueba debe ser LA que gana la portada: se apagan las demás (dentro de la transacción, que se deshace).
const AISLAR = `update retail.etiquetas set activo = false where estilo = 'campana' and id <> :'camp';\n`;
const DESCUENTO_DE_SIEMPRE = (pct) => `select retail.actualizar_campana_etiqueta(:'camp', ${pct}, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);\n`;

// Una oferta por la función de siempre. `dias` es SQL (un arreglo o null = todos); `solo`, SQL de uuid[].
const OFERTA = ({ nombre = "ZZ oferta", pct = 30, desde = HOY, hasta = `${HOY} + 3`, dias = "null", solo = "'{}'::uuid[]", activar = "true", var: v = "r" } = {}) =>
  `select retail.guardar_campana_regla(null, :'camp', '${nombre}', ${pct}, ${desde}, ${hasta}, ${dias}, ${solo}, '{}'::uuid[], false, '{}'::uuid[], ${activar}) as ${v} \\gset\n`;

const EN_LISTA = `(select count(*) from jsonb_array_elements(retail.fn_campanas_web() -> 'campanas') c where c ->> 'id' = :'camp')`;
const PCT_EN_LISTA = `(select c ->> 'pct' from jsonb_array_elements(retail.fn_campanas_web() -> 'campanas') c where c ->> 'id' = :'camp')`;
const PORTADA = `(retail.tienda_portada() -> 'campana')`;
const GANA = `coalesce(${PORTADA} ->> 'nombre' = 'ZZ Campaña solo con ofertas (prueba)', false)`;

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.fn_campana_portada()') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la migración: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  // ---------------------------------------------------------------- 1. La lista de Tienda web ▸ Campañas
  console.log("\n— La lista de Tienda web ▸ Campañas —");
  esperarValor("sin descuento y sin ofertas: NO es de la Tienda web", correr(`${PREPARAR}select retail.fn_campana_web_valida(:'camp') || '|' || ${EN_LISTA};\nrollback;`), "false|0");
  esperarValor("con una oferta ACTIVA: sí, y la lista dice su %", correr(`${PREPARAR}${OFERTA({ pct: 30 })}select retail.fn_campana_web_valida(:'camp') || '|' || ${EN_LISTA} || '|' || ${PCT_EN_LISTA};\nrollback;`), "true|1|30.00");
  esperarValor("con una oferta en BORRADOR: no (nunca cobra)", correr(`${PREPARAR}${OFERTA({ activar: "false" })}select retail.fn_campana_web_valida(:'camp') || '|' || ${EN_LISTA};\nrollback;`), "false|0");
  esperarValor("con una oferta RETIRADA: no", correr(`${PREPARAR}${OFERTA()}select retail.retirar_campana_regla(:'r');\nselect retail.fn_campana_web_valida(:'camp') || '|' || ${EN_LISTA};\nrollback;`), "false|0");
  esperarValor(
    "una oferta activa que empieza mañana: la campaña sí está en la lista (el líder la diseña antes de que empiece)",
    correr(`${PREPARAR}${OFERTA({ desde: `${HOY} + 1`, hasta: `${HOY} + 5` })}select ${EN_LISTA};\nrollback;`),
    "1",
  );
  esperarValor(
    "una oferta de otro día de la semana: la campaña sigue en la lista (la lista no mira el día)",
    correr(`${PREPARAR}${OFERTA({ hasta: `${HOY} + 7`, dias: "array[:dow_manana]::smallint[]" })}select ${EN_LISTA};\nrollback;`),
    "1",
  );
  esperarValor(
    "con descuento de siempre 20: sale con pct 20 (como antes)",
    correr(`${PREPARAR}${DESCUENTO_DE_SIEMPRE(20)}select ${EN_LISTA} || '|' || ${PCT_EN_LISTA};\nrollback;`),
    "1|20.00",
  );
  esperarValor(
    "descuento de siempre 20 y oferta 30: la lista dice el mayor (30)",
    correr(`${PREPARAR}${DESCUENTO_DE_SIEMPRE(20)}${OFERTA({ pct: 30 })}select ${PCT_EN_LISTA};\nrollback;`),
    "30.00",
  );
  esperarValor(
    "descuento de siempre 40 y oferta 30: la lista dice 40",
    correr(`${PREPARAR}${DESCUENTO_DE_SIEMPRE(40)}${OFERTA({ pct: 30 })}select ${PCT_EN_LISTA};\nrollback;`),
    "40.00",
  );
  esperarValor(
    "una campaña solo con ofertas se puede abrir para diseñarla (`fn_campana_diseno` no dice «no existe»)",
    correr(`${PREPARAR}${OFERTA({ pct: 30 })}select (retail.fn_campana_diseno(:'camp') -> 'campana' ->> 'pct');\nrollback;`),
    "30.00",
  );
  esperarValor(
    "…y sin ofertas ni descuento, abrirla sigue diciendo «campana_no_existe»",
    (() => {
      const r = correr(`${PREPARAR}select retail.fn_campana_diseno(:'camp');\nrollback;`);
      return r.ok ? { ok: true, salida: "abrió" } : { ok: true, salida: r.mensaje.includes("campana_no_existe") ? "campana_no_existe" : r.mensaje };
    })(),
    "campana_no_existe",
  );

  // ---------------------------------------------------------------- 2. La portada de la tienda online
  console.log("\n— La portada de la tienda online —");
  esperarValor(
    "una oferta que rige HOY: la portada anuncia la campaña con el % de la oferta y hasta cuando termina la oferta",
    correr(`${PREPARAR}${AISLAR}${OFERTA({ pct: 30, hasta: `${HOY} + 3` })}select (${PORTADA} ->> 'pct') || '|' || ((${PORTADA} ->> 'hasta')::date = ${HOY} + 3);\nrollback;`),
    "30.00|true",
  );
  esperarValor("una oferta en BORRADOR: la portada no la anuncia", correr(`${PREPARAR}${AISLAR}${OFERTA({ activar: "false" })}select ${GANA};\nrollback;`), "f");
  esperarValor("una oferta RETIRADA: no", correr(`${PREPARAR}${AISLAR}${OFERTA()}select retail.retirar_campana_regla(:'r');\nselect ${GANA};\nrollback;`), "f");
  esperarValor("una oferta que empieza mañana: hoy NO se anuncia", correr(`${PREPARAR}${AISLAR}${OFERTA({ desde: `${HOY} + 1`, hasta: `${HOY} + 5` })}select ${GANA};\nrollback;`), "f");
  esperarValor(
    "una oferta de «solo mañana de la semana»: hoy NO se anuncia (la tienda anuncia lo que cobra hoy)",
    correr(`${PREPARAR}${AISLAR}${OFERTA({ hasta: `${HOY} + 7`, dias: "array[:dow_manana]::smallint[]" })}select ${GANA};\nrollback;`),
    "f",
  );
  esperarValor(
    "dos ofertas que rigen hoy (10 % y 25 %): anuncia el mayor",
    correr(`${PREPARAR}${AISLAR}${OFERTA({ pct: 10, nombre: "ZZ chica", var: "r1" })}${OFERTA({ pct: 25, nombre: "ZZ grande", var: "r2" })}select ${PORTADA} ->> 'pct';\nrollback;`),
    "25.00",
  );
  esperarValor(
    "descuento de siempre 20 y oferta 30: anuncia 30 y su «hasta» es el de la oferta, no el de la campaña",
    correr(`${PREPARAR}${AISLAR}${DESCUENTO_DE_SIEMPRE(20)}${OFERTA({ pct: 30, hasta: `${HOY} + 3` })}select (${PORTADA} ->> 'pct') || '|' || ((${PORTADA} ->> 'hasta')::date = ${HOY} + 3);\nrollback;`),
    "30.00|true",
  );
  esperarValor(
    "descuento de siempre 40 y oferta 30: anuncia 40 y su «hasta» es el de la campaña",
    correr(`${PREPARAR}${AISLAR}${DESCUENTO_DE_SIEMPRE(40)}${OFERTA({ pct: 30, hasta: `${HOY} + 3` })}select (${PORTADA} ->> 'pct') || '|' || ((${PORTADA} ->> 'hasta')::date = ${HOY} + 10);\nrollback;`),
    "40.00|true",
  );
  esperarValor(
    "solo descuento de siempre (sin ofertas): igual que antes, 20 y el «hasta» de la campaña",
    correr(`${PREPARAR}${AISLAR}${DESCUENTO_DE_SIEMPRE(20)}select (${PORTADA} ->> 'pct') || '|' || ((${PORTADA} ->> 'hasta')::date = ${HOY} + 10);\nrollback;`),
    "20.00|true",
  );
  esperarValor(
    "sin descuento ni ofertas: la portada no la anuncia",
    correr(`${PREPARAR}${AISLAR}select ${GANA};\nrollback;`),
    "f",
  );
  esperarValor(
    "una campaña sin prendas (ni marcadas ni por categoría) con una oferta: no se anuncia",
    correr(`${PREPARAR}${AISLAR}delete from retail.variante_etiquetas where etiqueta_id = :'camp';\n${OFERTA()}select ${GANA};\nrollback;`),
    "f",
  );
  esperarValor(
    "…pero si la oferta es «solo estas categorías» (la oferta dice dónde rige), sí se anuncia",
    correr(`${PREPARAR}${AISLAR}delete from retail.variante_etiquetas where etiqueta_id = :'camp';\n${OFERTA({ solo: "array[:'cat']::uuid[]" })}select ${GANA};\nrollback;`),
    "t",
  );
  esperarValor(
    "gana la campaña que termina primero (la oferta que termina en 3 días le gana a un descuento de siempre que termina en 10)",
    correr(`${PREPARAR}${AISLAR}${OFERTA({ pct: 30, hasta: `${HOY} + 3` })}
insert into retail.etiquetas (nombre, estilo) values ('ZZ Otra con descuento de siempre', 'campana') returning id as otra \\gset
select retail.actualizar_campana_etiqueta(:'otra', 50, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'otra');
select ${PORTADA} ->> 'nombre';
rollback;`),
    "ZZ Campaña solo con ofertas (prueba)",
  );

  // ---------------------------------------------------------------- 3. El diseño sale de la misma campaña
  console.log("\n— El diseño sale de la misma campaña que la portada —");
  esperarValor(
    "`tienda_diseno_campana` y `tienda_portada` nombran la misma campaña (también con solo ofertas)",
    correr(`${PREPARAR}${AISLAR}${OFERTA({ pct: 30 })}select (${PORTADA} ->> 'nombre') = (retail.tienda_diseno_campana() -> 'campana' ->> 'nombre');\nrollback;`),
    "t",
  );
  esperarValor(
    "sin campaña que anunciar, las dos dicen null",
    correr(`${PREPARAR}${AISLAR}update retail.etiquetas set activo = false where id = :'camp';\nselect jsonb_typeof(retail.tienda_portada() -> 'campana') = 'null' and jsonb_typeof(retail.tienda_diseno_campana() -> 'campana') = 'null';\nrollback;`),
    "t",
  );
  esperarValor(
    "la forma de `tienda_portada` no cambió: {campana: {nombre, pct, hasta}}",
    correr(`${PREPARAR}${AISLAR}${OFERTA()}select (select string_agg(k, ',' order by k) from jsonb_object_keys(${PORTADA}) k);\nrollback;`),
    "hasta,nombre,pct",
  );

  // ---------------------------------------------------------------- 4. Sin ofertas, idéntico a antes
  // Solo dice algo con APLICAR_ANTES y la base sin la migración: compara la respuesta de la función VIVA con la de la migración, sobre las campañas reales.
  console.log("\n— Sin ofertas, todo queda idéntico a antes —");
  if (APLICAR_ANTES) {
    const r = correr(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
select to_regprocedure('retail.fn_campana_portada()') is not null as ya_aplicada \\gset
update retail.campana_reglas set estado = 'desactivada' where estado = 'activa';
select retail.tienda_portada()::text as portada_antes, retail.tienda_diseno_campana()::text as diseno_antes, (retail.fn_campanas_web() -> 'campanas')::text as lista_antes \\gset
${APLICAR_ANTES}
select (:'ya_aplicada'::boolean
        or (:'portada_antes' = retail.tienda_portada()::text
            and :'diseno_antes' = retail.tienda_diseno_campana()::text
            and :'lista_antes' = (retail.fn_campanas_web() -> 'campanas')::text));
rollback;`);
    esperarValor("con las campañas reales de la base (se apagan sus ofertas dentro de la transacción), portada, diseño y lista dan lo mismo antes y después de la migración", r, "t");
  } else {
    console.log("  (omitida: corre con APLICAR_ANTES para comparar antes y después)");
  }

  // ---------------------------------------------------------------- 5. La migración
  console.log("\n— La migración —");
  const migracion = APLICAR_ANTES || readFileSync(MIGRACION, "utf8");
  esperar(
    "se puede aplicar dos veces seguidas",
    correr(`begin;\n${migracion}\n${migracion}\nselect 1;\nrollback;`).ok,
    correr(`begin;\n${migracion}\n${migracion}\nselect 1;\nrollback;`).mensaje,
  );
  esperarError(
    "si una función viva no es la de producción (alguien la cambió a mano), no aplica nada",
    correr(`begin;
create or replace function retail.fn_campana_web_valida(p_etiqueta_id uuid) returns boolean language sql stable as $$ select true $$;
${migracion}
rollback;`),
    "no es la de producción",
  );
  esperar(
    "las funciones internas no se pueden llamar desde la web (sin permiso para `authenticated`, `anon` ni `public`)",
    ultimaLinea(correr(`begin;\n${migracion}\nselect bool_or(has_function_privilege(r, f, 'execute'))
      from unnest(array['retail.fn_campana_oferta_hoy(uuid,date)', 'retail.fn_campana_portada()']) f, unnest(array['authenticated', 'anon']) r;\nrollback;`)) === "f",
    "alguna función interna es ejecutable por la web",
  );
  esperar(
    "`tienda_portada` y `tienda_diseno_campana` siguen siendo del rol de la tienda y de nadie más",
    ultimaLinea(correr(`begin;\n${migracion}\nselect has_function_privilege('tienda_web', 'retail.tienda_portada()', 'execute') and has_function_privilege('tienda_web', 'retail.tienda_diseno_campana()', 'execute')
        and not has_function_privilege('authenticated', 'retail.tienda_portada()', 'execute');\nrollback;`)) === "t",
    "los permisos de lo que lee la tienda cambiaron",
  );

  console.log(`\n${total - fallos}/${total} pruebas pasaron.`);
  process.exit(fallos ? 1 : 0);
}

main();
