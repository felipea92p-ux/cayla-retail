#!/usr/bin/env node
/**
 * Pruebas de `retail.buscar_clienta`/`retail.registrar_clienta` contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. La ficha de clienta v1 (D-76/D-77,
 * 20260922140000_ficha_de_clienta_v1_backend.sql) es la primera vez que el sistema puede
 * identificar a una clienta. Dos cosas legalmente sensibles dependen de que esto no falle
 * en silencio: el consentimiento de WhatsApp es un dato APARTE del teléfono (Ley 29733 — nunca
 * se asume por dar el número), y un upsert sin volver a preguntar por WhatsApp NUNCA debe
 * revocar un consentimiento ya dado (ver «LA OBJECIÓN» en la cabecera de la migración).
 *
 * QUÉ HACE. Mismo patrón que `scripts/pruebas/registrar_venta.mjs`: cada escenario en su
 * propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres
 * local que comparten ~20 sesiones, sin dejar rastro ni pisar datos de otra sesión. Simula a
 * Felipe (líder) o Micaela (colaboradora) con `set local request.jwt.claim.sub`, igual que
 * `supabase/seed.sql`.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. `pnpm test` corre sobre un checkout limpio sin
 * Postgres ni Docker — mismo criterio que ya documenta `registrar_cambio.mjs`.
 *
 * QUÉ DA POR SENTADO. Que `retail.clientas` existe (20260922140000 aplicada) y que
 * `supabase/seed.sql` corrió (usa DNIs que el seed no siembra, así que no choca con él).
 *
 * USO
 *   pnpm pruebas:clientas    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y registrar_venta.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — la ficha de clienta no distingue rol

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
set local request.jwt.claim.role = 'authenticated';
${sqlDespues}
`;
}

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1: alta con consentimiento — el permiso queda con fecha
// ---------------------------------------------------------------------------

exito(
  "alta con p_acepta_whatsapp=true guarda whatsapp_consentimiento_en",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('90111222', 'Prueba Uno', '987000111', true, 15::smallint, 3::smallint) as id \\gset
select (whatsapp_consentimiento_en is not null), dni, nombre, cumple_dia, cumple_mes from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([tienePermiso, dni, nombre, dia, mes]) =>
    tienePermiso === "t" && dni === "90111222" && nombre === "Prueba Uno" && dia === "15" && mes === "3"
);

// ---------------------------------------------------------------------------
// 2: alta sin consentimiento — aunque venga el teléfono, no se asume permiso
// ---------------------------------------------------------------------------

exito(
  "alta con p_acepta_whatsapp=false deja whatsapp_consentimiento_en NULL aunque venga el teléfono",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('90111223', 'Prueba Dos', '987000112', false, null, null) as id \\gset
select whatsapp_consentimiento_en is null from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([esNulo]) => esNulo === "t"
);

// ---------------------------------------------------------------------------
// 3: upsert por DNI — un segundo alta con el mismo DNI actualiza, no duplica
// ---------------------------------------------------------------------------

exito(
  "el mismo DNI dos veces no duplica: la segunda llamada actualiza la fila",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('90111224', 'Prueba Tres', null, false, null, null) as id1 \\gset
select retail.registrar_clienta('90111224', 'Prueba Tres Actualizada', null, false, null, null) as id2 \\gset
select (:'id1' = :'id2'), (select count(*) from retail.clientas where dni = '90111224'), nombre
  from retail.clientas where id = :'id2'::uuid;
rollback;
`
  ),
  ([mismoId, total, nombre]) => mismoId === "t" && Number(total) === 1 && nombre === "Prueba Tres Actualizada"
);

// ---------------------------------------------------------------------------
// 4: LA OBJECIÓN — un upsert que no vuelve a preguntar por WhatsApp (default
// false) NO debe revocar un consentimiento ya dado
// ---------------------------------------------------------------------------

exito(
  "un upsert con p_acepta_whatsapp=false (el default) conserva un consentimiento ya dado",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('90111225', 'Prueba Cuatro', '987000113', true, null, null) as id \\gset
select retail.registrar_clienta('90111225', 'Prueba Cuatro Editada', null, false, null, null) as id2 \\gset
select (:'id' = :'id2'), (whatsapp_consentimiento_en is not null), nombre from retail.clientas where id = :'id2'::uuid;
rollback;
`
  ),
  ([mismoId, siguePermiso, nombre]) => mismoId === "t" && siguePermiso === "t" && nombre === "Prueba Cuatro Editada"
);

exito(
  "un upsert con p_acepta_whatsapp=true SÍ (re)confirma el consentimiento (nunca lo deja NULL)",
  comoPersona(
    FELIPE,
    // `now()` es fijo dentro de una misma transacción (transaction_timestamp): dos llamadas acá
    // adentro comparten el mismo instante, así que esto prueba "sigue confirmado, nunca NULL",
    // no "con fecha más nueva" — esa parte solo se ve entre transacciones distintas (uso real).
    `select retail.registrar_clienta('90111226', 'Prueba Cinco', '987000114', true, null, null) as id \\gset
select retail.registrar_clienta('90111226', 'Prueba Cinco', '987000114', true, null, null) as id2 \\gset
select (:'id' = :'id2'), (whatsapp_consentimiento_en is not null) from retail.clientas where id = :'id2'::uuid;
rollback;
`
  ),
  ([mismoId, siguePermiso]) => mismoId === "t" && siguePermiso === "t"
);

// ---------------------------------------------------------------------------
// 5: dni vacío o solo espacios se normaliza a NULL — no choca con otra clienta sin dni
// ---------------------------------------------------------------------------

exito(
  "un DNI vacío o solo espacios se guarda como NULL, sin chocar con otra clienta sin DNI",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('   ', 'Sin Dni Uno', null, false, null, null) as id1 \\gset
select retail.registrar_clienta('', 'Sin Dni Dos', null, false, null, null) as id2 \\gset
select
  (select dni from retail.clientas where id = :'id1'::uuid),
  (select dni from retail.clientas where id = :'id2'::uuid);
rollback;
`
  ),
  ([dni1, dni2]) => dni1 === "" && dni2 === ""
);

// ---------------------------------------------------------------------------
// 6: candados de rango — cumple_dia/cumple_mes fuera de 1-31/1-12
// ---------------------------------------------------------------------------

error(
  "cumple_dia fuera de 1-31 se rechaza (candado clientas_cumple_dia_valido)",
  comoPersona(FELIPE, `select retail.registrar_clienta(null, 'Prueba Rango', null, false, 32::smallint, null);\n`),
  "clientas_cumple_dia_valido"
);

error(
  "cumple_mes fuera de 1-12 se rechaza (candado clientas_cumple_mes_valido)",
  comoPersona(FELIPE, `select retail.registrar_clienta(null, 'Prueba Rango', null, false, null, 13::smallint);\n`),
  "clientas_cumple_mes_valido"
);

// ---------------------------------------------------------------------------
// 7: un DNI repetido por INSERT directo (sin pasar por la RPC) también choca
// ---------------------------------------------------------------------------

error(
  "un DNI repetido por insert directo se rechaza (candado clientas_dni_unico)",
  comoPersona(
    FELIPE,
    `insert into retail.clientas (dni, nombre) values ('90111299', 'Directo Uno');
insert into retail.clientas (dni, nombre) values ('90111299', 'Directo Dos');
`
  ),
  "clientas_dni_unico"
);

// ---------------------------------------------------------------------------
// 8: buscar_clienta — DNI y WhatsApp exactos, nombre con ILIKE
// ---------------------------------------------------------------------------

exito(
  "buscar_clienta encuentra por DNI exacto",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('90222111', 'Buscable Uno', '987222001', false, null, null) as id \\gset
select count(*), (select nombre from retail.buscar_clienta('90222111') limit 1) from retail.buscar_clienta('90222111');
rollback;
`
  ),
  ([total, nombre]) => Number(total) === 1 && nombre === "Buscable Uno"
);

exito(
  "buscar_clienta encuentra por WhatsApp exacto",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta(null, 'Buscable Dos', '987222002', false, null, null) as id \\gset
select count(*) from retail.buscar_clienta('987222002');
rollback;
`
  ),
  ([total]) => Number(total) === 1
);

exito(
  "buscar_clienta encuentra por nombre parcial, sin distinguir mayúsculas",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta(null, 'Buscable Tres Rodríguez', null, false, null, null) as id \\gset
select count(*) from retail.buscar_clienta('rodríguez');
rollback;
`
  ),
  ([total]) => Number(total) === 1
);

exito(
  "buscar_clienta con término vacío no devuelve filas — no es un listado",
  comoPersona(FELIPE, `select count(*) from retail.buscar_clienta('');\n`),
  ([total]) => Number(total) === 0
);

// ---------------------------------------------------------------------------
// 9: cualquier colaborador con sesión, no solo el líder — Micaela también puede
// ---------------------------------------------------------------------------

exito(
  "Micaela (colaboradora, no líder) también puede registrar y buscar — retail no tiene noción de \"mi clienta\"",
  comoPersona(
    MICAELA,
    `select retail.registrar_clienta('90333111', 'De Micaela', null, false, null, null) as id \\gset
select count(*) from retail.buscar_clienta('90333111');
rollback;
`
  ),
  ([total]) => Number(total) === 1
);

// ---------------------------------------------------------------------------
// 10: sin sesión (anon), ni la tabla ni las RPC responden
// ---------------------------------------------------------------------------

error(
  "sin sesión (anon) no puede leer la tabla directo",
  `begin;
set local role anon;
select * from retail.clientas;
rollback;
`,
  "permission denied for table clientas"
);

error(
  "sin sesión (anon) no puede llamar buscar_clienta",
  `begin;
set local role anon;
select retail.buscar_clienta('cualquier cosa');
rollback;
`,
  "permission denied for function buscar_clienta"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(
      `No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`
    );
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(
          `✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`
        );
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else {
      if (!resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        const columnas = resultado.salida.split("|");
        if (!caso.verificar(columnas)) {
          fallos++;
          console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
        } else {
          console.log(`✓ ${caso.nombre}`);
        }
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
