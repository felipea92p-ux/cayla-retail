#!/usr/bin/env node
/**
 * Pruebas del atajo «Completar todo» de una tarjeta de Conteo (ADR-0328; decisión de Felipe, 2026-10-05; migración
 * `20261005233700_conteo_atajo_por_tarjeta.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA (todo en la BASE):
 *   · CUENTA PERO LO DICE. `conteo_completar_tarjeta` cuenta, con `conteo_contar`, las variantes pedidas que siguen sin cifra y las
 *     marca `completada_con_atajo` (no `aplicada_sin_contar`). Esa línea SIGUE contando: un conteo contado entero con el atajo vale
 *     para el arranque, a diferencia de «Aplicar todos completos» (opción C de Felipe: la marca solo informa en Revisar).
 *   · NO PISA lo que otra persona ya contó, es idempotente y deja entrar a las «en reconteo» (como el atajo de siempre).
 *   · CONTAR A MANO apaga la marca (escribir el número ES mirar); des-contar también.
 *   · TODO O NADA: una lista mal formada (cantidad negativa, vacía o con decimales; no es una lista) se rechaza ANTES de escribir.
 *     Un conteo cerrado o una persona de otra sede no pueden completar nada.
 *   · ESTADOS IMPOSIBLES: una línea marcada sin cifra, o marcada «con el atajo» y «aplicada sin contar» a la vez (CHECK).
 *   · CONTROLES: la misma escena contra una versión mutada a propósito (la alternativa descartada) TIENE que dar otro resultado. Si un
 *     control «pasa» igual, la prueba no muerde.
 *
 * CÓMO. Mismo patrón que `conteo_firma_arranque.mjs`: cada escena en su transacción con ROLLBACK, en una tienda propia («ZZ Conteo
 * atajo»), así que no depende de los conteos que otras sesiones dejen en el local.
 *
 * USO
 *   pnpm pruebas:conteo-atajo-tarjeta                              → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:conteo-atajo-tarjeta --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   pnpm pruebas:conteo-atajo-tarjeta --detalle                    → además dice qué dio cada control con la función mutada
 */

import { execFileSync } from "node:child_process";

// Como las pruebas nuevas: `--contenedor <nombre>` apunta a un banco de pruebas propio y, sin él, corre contra el stack local de siempre.
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR_LOCAL = arg("--contenedor", "supabase_db_cayla-retail");
const DETALLE = process.argv.includes("--detalle");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo con cuenta propia (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** La sesión de una cuenta (como la pone PostgREST) y sus encabezados. */
const como = (auth) =>
  `select set_config('request.jwt.claim.sub', '${auth}', true) as _s1, set_config('request.jwt.claims', '{"sub":"${auth}","role":"authenticated"}', true) as _s2 \\gset\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) as _h \\gset\n`;

const PRELUDIO = `
begin;
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
create function pg_temp.mover(p_var uuid, p_ubic uuid, p_sub uuid, p_tipo text, p_cant integer, p_motivo text default 'prueba atajo') returns uuid
language plpgsql as $f$
declare v_id uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
    values (p_var, p_ubic, p_sub, p_tipo, p_cant, p_motivo) returning id into v_id;
  perform retail.fn_aplicar_movimiento(v_id);
  return v_id;
end;
$f$;
`;

/** Una tienda propia con piso y almacén y tres prendas en el PISO: v1 = 5, v2 = 3, v3 = 4. La sesión queda en Felipe (líder). */
const TIENDA = `
${como(FELIPE)}${encabezados({})}
insert into retail.ubicaciones (nombre, tipo) values ('ZZ Conteo atajo', 'tienda') returning id as u \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Piso de venta', 'piso_venta') returning id as piso \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Almacén de tienda', 'almacen_tienda') returning id as alm \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Atajo 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1 returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Atajo 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1 returning id as p2 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Atajo 3', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1 returning id as p3 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-AT-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-AT-2', 100, 40, true) returning id as v2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p3', 'ZZ-AT-3', 100, 40, true) returning id as v3 \\gset
select pg_temp.mover(:'v1', :'u', :'piso', 'entrada', 5, 'carga_inicial') as _m \\gset
select pg_temp.mover(:'v2', :'u', :'piso', 'entrada', 3, 'carga_inicial') as _m \\gset
select pg_temp.mover(:'v3', :'u', :'piso', 'entrada', 4, 'carga_inicial') as _m \\gset
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
`;

/** Arma en `:nombre` la lista que manda la pantalla: [[variante, cantidad], …]. */
const LS = (nombre, pares) =>
  `select jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})::text as ${nombre} \\gset\n`;
const COMPLETAR = (nombre, lista) => `select retail.conteo_completar_tarjeta(:'conteo', :'${lista}'::jsonb)::text as ${nombre} \\gset\n`;
const INTENTO = (nombre, lista) =>
  `select pg_temp.intento(format('select retail.conteo_completar_tarjeta(%L, %L::jsonb)', :'conteo', :'${lista}')) as ${nombre} \\gset\n`;
const ITEM = (v, campos) => `(select ${campos} from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'${v}')`;
const CIFRA_Y_MARCA = "coalesce(cantidad_contada::text, 'NULL') || '/' || completada_con_atajo";

/** Reescribe una función viva cambiando un texto (la «alternativa descartada»). Falla si el texto no está: una mutación que no aplica no controla nada. */
const MUTAR = (firma, desde, hacia) => `
do $mut$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef('${firma}'::regprocedure);
  v_nueva := replace(v_def, $a$${desde}$a$, $b$${hacia}$b$);
  if v_nueva = v_def then raise exception 'la mutación no aplicó: no se encontró el texto a cambiar'; end if;
  execute v_nueva;
end;
$mut$;
`;
const FUNCION = "retail.conteo_completar_tarjeta(uuid,jsonb)";

const escena = (sql) => `${PRELUDIO}\n${TIENDA}\n${sql}\nrollback;\n`;
const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, sql: escena(sql), esperado });
const control = (nombre, sql, esperado) => CASOS.push({ nombre, sql: escena(sql), esperado, muerde: true });

// ---------------------------------------------------------------------------
// 1. Cuenta y lo dice
// ---------------------------------------------------------------------------
const ESCENA_COMPLETA = `${LS("l1", [["v1", 5], ["v2", 3]])}${COMPLETAR("r", "l1")}
select concat_ws(',', (:'r'::jsonb) ->> 'completadas', jsonb_array_length((:'r'::jsonb) -> 'lineas'),
  ${ITEM("v1", "cantidad_contada || '/' || completada_con_atajo || '/' || aplicada_sin_contar")},
  ${ITEM("v2", "cantidad_contada || '/' || completada_con_atajo || '/' || aplicada_sin_contar")},
  ${ITEM("v3", CIFRA_Y_MARCA)});`;
const ESPERA_COMPLETA = ["2", "2", "5/true/false", "3/true/false", "NULL/false"];
exito("«Completar todo» de una tarjeta cuenta sus dos tallas y las marca «con el atajo» (no «sin contar»); la tercera talla ni se toca", ESCENA_COMPLETA, ESPERA_COMPLETA);

exito(
  "completar las tres con el atajo sigue valiendo como conteo de arranque (opción C: cuenta y solo informa)",
  `${LS("l1", [["v1", 5], ["v2", 3], ["v3", 4]])}${COMPLETAR("r", "l1")}
select concat_ws(',', (:'r'::jsonb) ->> 'completadas', retail.fn_conteo_vale_como_arranque(:'conteo'));`,
  ["3", "t"],
);

exito(
  "…a diferencia de «Aplicar todos completos», que sí deja al conteo sin valer como arranque (la comparación que justifica la marca nueva)",
  `select retail.conteo_aplicar_completos(:'conteo', array[:'v1', :'v2', :'v3']::uuid[]) as _ap \\gset
select retail.fn_conteo_vale_como_arranque(:'conteo');`,
  ["f"],
);

// ---------------------------------------------------------------------------
// 2. No pisa lo contado, es idempotente, deja entrar a las «en reconteo»
// ---------------------------------------------------------------------------
exito(
  "lo que otra persona ya contó no se pisa (aunque venga en la lista) y repetir el atajo no cambia nada",
  `select retail.conteo_contar(:'conteo', :'v3', 7) as _c \\gset
${LS("l1", [["v1", 5], ["v3", 4]])}${COMPLETAR("r1", "l1")}${COMPLETAR("r2", "l1")}
select concat_ws(',', (:'r1'::jsonb) ->> 'completadas', (:'r2'::jsonb) ->> 'completadas', ${ITEM("v1", CIFRA_Y_MARCA)}, ${ITEM("v3", CIFRA_Y_MARCA)});`,
  ["1", "0", "5/true", "7/false"],
);

exito(
  "una variante que no es de la foto del conteo se ignora: ni se crea ni se cuenta",
  `select gen_random_uuid() as fantasma \\gset
select jsonb_build_array(jsonb_build_object('variante_id', :'fantasma', 'cantidad', 2), jsonb_build_object('variante_id', :'v1', 'cantidad', 5))::text as l1 \\gset
${COMPLETAR("r", "l1")}
select concat_ws(',', (:'r'::jsonb) ->> 'completadas', (select count(*) from retail.conteo_items where conteo_id = :'conteo'));`,
  ["1", "3"],
);

exito(
  "una línea «en reconteo» (alguien vio una diferencia y mandó a recontar) SÍ entra al atajo, como siempre",
  `select retail.conteo_contar(:'conteo', :'v1', 4) as _c \\gset
select retail.conteo_recontar(:'conteo', :'v1') as _rc \\gset
${LS("l1", [["v1", 5]])}${COMPLETAR("r", "l1")}
select concat_ws(',', (:'r'::jsonb) ->> 'completadas', ${ITEM("v1", "cantidad_contada || '/' || completada_con_atajo || '/' || contada_anterior")});`,
  ["1", "5/true/4"],
);

// ---------------------------------------------------------------------------
// 3. Escribir el número a mano ES mirar
// ---------------------------------------------------------------------------
const CONTAR_A_MANO = `${ESCENA_COMPLETA.split("select concat_ws")[0]}
select retail.conteo_contar(:'conteo', :'v1', 5) as _c1 \\gset
select retail.conteo_contar(:'conteo', :'v2', null) as _c2 \\gset
select concat_ws(',', ${ITEM("v1", CIFRA_Y_MARCA)}, ${ITEM("v2", CIFRA_Y_MARCA)});`;
exito("contar a mano una línea del atajo (aunque sea la misma cifra) le quita la marca; des-contarla también", CONTAR_A_MANO, ["5/false", "NULL/false"]);

// ---------------------------------------------------------------------------
// 4. Todo o nada, y quién puede
// ---------------------------------------------------------------------------
exito(
  "una lista mal formada se rechaza ANTES de escribir: negativa, vacía, con decimales y «no es una lista»; la línea buena no queda contada",
  `${LS("neg", [["v1", 5], ["v2", -1]])}${INTENTO("r_neg", "neg")}
select jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', null))::text as nulo \\gset
${INTENTO("r_nulo", "nulo")}
${LS("dec", [["v1", 2.5]])}${INTENTO("r_dec", "dec")}
select '{"variante_id": "x"}' as noarr \\gset
${INTENTO("r_noarr", "noarr")}
select concat_ws(',', split_part(:'r_neg', '|', 2), split_part(:'r_nulo', '|', 2), split_part(:'r_dec', '|', 2), split_part(:'r_noarr', '|', 2), ${ITEM("v1", CIFRA_Y_MARCA)});`,
  ["lineas_invalidas", "lineas_invalidas", "lineas_invalidas", "lineas_invalidas", "NULL/false"],
);

exito(
  "un conteo ya cerrado no deja completar nada",
  `select retail.conteo_contar(:'conteo', :'v1', 5) as _c \\gset
select retail.cerrar_conteo(:'conteo', true) as _cierre \\gset
${LS("l1", [["v2", 3]])}${INTENTO("r", "l1")}
select concat_ws(',', split_part(:'r', '|', 3), ${ITEM("v2", CIFRA_Y_MARCA)});`,
  ["Ese conteo ya está cerrado", "NULL/false"],
);

exito(
  "una integrante de OTRA sede (Micaela, de Trujillo) no puede completar el conteo de una tienda que no es la suya",
  `${como(MICAELA)}${LS("l1", [["v1", 5]])}${INTENTO("r", "l1")}
select concat_ws(',', split_part(:'r', '|', 3), ${ITEM("v1", CIFRA_Y_MARCA)});`,
  ["No tienes permiso para contar en esa ubicación", "NULL/false"],
);

// ---------------------------------------------------------------------------
// 5. Estados que no pueden existir
// ---------------------------------------------------------------------------
exito(
  "una línea sin cifra no puede estar marcada «con el atajo»; y una contada con el atajo no puede ser también «sin contar» (CHECK)",
  `select pg_temp.intento(format('update retail.conteo_items set completada_con_atajo = true where conteo_id = %L and variante_id = %L', :'conteo', :'v3')) as x1 \\gset
${LS("l1", [["v1", 5]])}${COMPLETAR("r", "l1")}
select pg_temp.intento(format('update retail.conteo_items set aplicada_sin_contar = true where conteo_id = %L and variante_id = %L', :'conteo', :'v1')) as x2 \\gset
select concat_ws(',', split_part(:'x1', '|', 1), (:'x1' like '%conteo_items_atajo_coherente%'), split_part(:'x2', '|', 1));`,
  ["23514", "t", "23514"],
);

// ---------------------------------------------------------------------------
// CONTROLES: la alternativa descartada TIENE que dar otro resultado
// ---------------------------------------------------------------------------
control(
  "CONTROL · si el atajo no marcara las líneas, Revisar no tendría nada que decir: la prueba lo detecta",
  `${MUTAR(FUNCION, "set completada_con_atajo = true", "set completada_con_atajo = false")}\n${ESCENA_COMPLETA}`,
  ESPERA_COMPLETA,
);

control(
  "CONTROL · sin el disparador que apaga la marca, una línea contada a mano seguiría diciendo «con el atajo»: la prueba lo detecta",
  `alter table retail.conteo_items disable trigger conteo_items_atajo_se_apaga;
${ESCENA_COMPLETA.split("select concat_ws")[0]}
select retail.conteo_contar(:'conteo', :'v1', 5) as _c1 \\gset
select concat_ws(',', ${ITEM("v1", CIFRA_Y_MARCA)});`,
  ["5/false"],
);

control(
  "CONTROL · si el atajo no respetara lo ya contado, pisaría la cifra que otra persona escribió: la prueba lo detecta",
  `${MUTAR(FUNCION, "and ci.cantidad_contada is null);", ");")}
select retail.conteo_contar(:'conteo', :'v3', 7) as _c \\gset
${LS("l1", [["v1", 5], ["v3", 4]])}${COMPLETAR("r1", "l1")}${COMPLETAR("r2", "l1")}
select concat_ws(',', (:'r1'::jsonb) ->> 'completadas', (:'r2'::jsonb) ->> 'completadas', ${ITEM("v1", CIFRA_Y_MARCA)}, ${ITEM("v3", CIFRA_Y_MARCA)});`,
  ["1", "0", "5/true", "7/false"],
);

control(
  "CONTROL · si el atajo escribiera lo de «Aplicar todos completos» (sin contar), el conteo dejaría de valer como arranque: la prueba lo detecta",
  `${MUTAR(FUNCION, "set completada_con_atajo = true", "set aplicada_sin_contar = true")}
${LS("l1", [["v1", 5], ["v2", 3], ["v3", 4]])}${COMPLETAR("r", "l1")}
select concat_ws(',', (:'r'::jsonb) ->> 'completadas', retail.fn_conteo_vale_como_arranque(:'conteo'));`,
  ["3", "t"],
);

// ---------------------------------------------------------------------------
function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    // La última línea de salida es la fila de verificación: una sola columna con los valores unidos por comas.
    const ultima = resultado.ok ? (resultado.salida.split("\n").filter(Boolean).pop() ?? "") : "";
    const igual = resultado.ok && ultima === caso.esperado.join(",");

    if (caso.muerde) {
      // El control pasa cuando la versión mutada NO da el resultado bueno (o ni siquiera termina): la prueba muerde.
      if (igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    la mutación dio el MISMO resultado que la función buena: esta prueba no muerde`);
      } else {
        // Con `--detalle` se ve QUÉ dio la mutación: un control que «muerde» porque la mutación ni se aplicó no controla nada.
        const dio = resultado.ok ? ultima : `error: ${resultado.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? resultado.mensaje}`;
        console.log(`✓ ${caso.nombre}${DETALLE ? `\n    con la mutación salió: ${dio}` : ""}`);
      }
      continue;
    }

    if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").filter((l) => !l.includes("NOTICE")).join("\n    ")}`);
      continue;
    }
    if (!igual) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado.join(","))}\n    salió:    ${JSON.stringify(ultima)}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde (contenedor: ${CONTENEDOR_LOCAL}).`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
