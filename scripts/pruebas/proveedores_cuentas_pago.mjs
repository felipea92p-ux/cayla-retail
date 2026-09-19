#!/usr/bin/env node
/**
 * Pruebas de «CCI, Yape/Plin y titular por proveedor» (ADR-0134) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un proveedor pueda guardar dónde se le paga (CCI, celular de billetera con su app,
 * titular) SIN poder quedar en un estado imposible, y que solo un líder lo escriba:
 *   · `guardar_cuentas_proveedor` normaliza («+51 987 654 321» → 987654321, CCI con espacios/guiones → 20
 *     dígitos, billeteras sin repetir y en minúscula) y deja NULL lo vacío;
 *   · rechaza lo inválido con un mensaje entendible (CCI ≠ 20 dígitos, celular que no empieza con 9,
 *     celular sin app, app sin celular, app que no es Yape/Plin, titular de 1 letra, proveedor inexistente);
 *   · un integrante y quien no tiene sesión NO pueden escribir (la RPC exige líder y no tiene EXECUTE para anon);
 *   · los CHECK de la tabla también rechazan por su cuenta (no dependen de la RPC);
 *   · `fn_proveedores()` devuelve las 4 columnas nuevas, con UNA sola firma, y `fn_proveedores_resumen()` sigue
 *     respondiendo (toma columnas por nombre de `fn_proveedores()`);
 *   · la migración se puede pegar dos veces, y el backfill copia SOLO un `cuenta_bancaria` que es un CCI
 *     inequívoco (20 dígitos) — nunca inventa, nunca borra.
 *
 * CÓMO. Mismo patrón que `dinero_compras_solo_lider.mjs`: cada escenario corre en su propia transacción con
 * ROLLBACK, nunca se commitea nada; simula a Felipe (líder) y a Micaela (integrante) con
 * `set local request.jwt.claim.sub`.
 *
 * `--en-seco`: carga la migración DENTRO de cada escenario (sin haberla aplicado a la base compartida).
 *
 * USO
 *   pnpm pruebas:proveedores-cuentas            → migración ya aplicada en el local
 *   pnpm pruebas:proveedores-cuentas --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante

const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260919170000_proveedores_cci_y_billetera.sql"), "utf8");
/**
 * Tras el reparto por tienda (ADR-0138, migración 20260919173000) `compras` ya no tiene `ubicacion_destino_id`. Estas
 * pruebas re-pegan migraciones que corrieron ANTES de eso (y ya están en producción) y cuya definición todavía la usa:
 * lo que se prueba es su re-pegado en ese estado, así que a cada escenario que lo necesita se le devuelve la columna
 * DENTRO de su transacción (que termina en ROLLBACK). No toca la base compartida.
 */
const CABECERA_DE_ANTES = `do $c$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id') then
    alter table retail.compras add column ubicacion_destino_id uuid;
  end if;
end $c$;
`;

const PRELUDIO = EN_SECO ? `${CABECERA_DE_ANTES}${MIGRACION}` : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
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

/** Una transacción con un proveedor propio (`:prov`) y la sesión de quien se indique. Termina sin COMMIT. */
const como = (authUserId, sql) => `
begin;
${PRELUDIO}
insert into retail.proveedores (nombre) values ('Proveedor de prueba cuentas ' || gen_random_uuid()) returning id as prov \\gset
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const guardar = (args) => `select retail.guardar_cuentas_proveedor(:'prov', ${args});\n`;
const VER = `select coalesce(cci,'∅'), coalesce(celular_billetera,'∅'), coalesce(array_to_string(billeteras,','),'∅'), coalesce(titular_cuenta,'∅') from retail.proveedores where id = :'prov';`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. Guardar: normaliza y deja NULL lo vacío
// ===========================================================================

exito(
  "líder guarda CCI con guiones, celular «+51 987 654 321», billeteras repetidas y en mayúscula, y titular con espacios",
  como(FELIPE, `${guardar(`'011-175-000200-123456-73', '+51 987 654 321', array['Yape','plin','YAPE'], '  Textiles Rosita SAC  '`)}${VER}`),
  ["01117500020012345673", "987654321", "plin,yape", "Textiles Rosita SAC"]
);

exito(
  "solo CCI: el resto queda NULL (una billetera es opcional)",
  como(FELIPE, `${guardar(`'00219300214567804558'`)}${VER}`),
  ["00219300214567804558", "∅", "∅", "∅"]
);

exito(
  "solo Yape: sin CCI, con celular y app",
  como(FELIPE, `${guardar(`null, '955443322', array['yape']`)}${VER}`),
  ["∅", "955443322", "yape", "∅"]
);

exito(
  "vaciar: todo NULL borra lo guardado (reemplazo completo) sin tocar el proveedor",
  como(FELIPE, `${guardar(`'00219300214567804558', '987654321', array['yape'], 'Alguien'`)}${guardar("null, null, null, null")}${VER}`),
  ["∅", "∅", "∅", "∅"]
);

exito(
  "guardar cuentas NO toca banco ni cuenta_bancaria (siguen donde estaban)",
  como(
    FELIPE,
    `update retail.proveedores set banco = 'BCP', cuenta_bancaria = '193-2145678-0-45' where id = :'prov';
${guardar(`'00219300214567804558'`)}select banco, cuenta_bancaria from retail.proveedores where id = :'prov';`
  ),
  ["BCP", "193-2145678-0-45"]
);

// ===========================================================================
// 2. Rechazos con mensaje entendible
// ===========================================================================

error("CCI de 19 dígitos: «El CCI tiene que ser de 20 dígitos»", como(FELIPE, guardar(`'0021930021456780455'`)), "El CCI tiene que ser de 20 dígitos");
error("CCI con letras: rechazado", como(FELIPE, guardar(`'0021930021456780455A'`)), "El CCI tiene que ser de 20 dígitos");
error("celular que no empieza con 9: «tiene que ser de 9 dígitos y empezar con 9»", como(FELIPE, guardar(`null, '812345678', array['yape']`)), "tiene que ser de 9 dígitos y empezar con 9");
error("celular de 8 dígitos: rechazado", como(FELIPE, guardar(`null, '98765432', array['yape']`)), "tiene que ser de 9 dígitos y empezar con 9");
error("celular sin app: «Indica si ese celular es Yape, Plin o ambos»", como(FELIPE, guardar(`null, '987654321', null`)), "Indica si ese celular es Yape, Plin o ambos");
error("app sin celular: «Escribe el celular de la billetera»", como(FELIPE, guardar(`null, null, array['plin']`)), "Escribe el celular de la billetera");
error("app que no es Yape ni Plin: «Solo se aceptan Yape o Plin»", como(FELIPE, guardar(`null, '987654321', array['bitcoin']`)), "Solo se aceptan Yape o Plin");
error("titular de una letra: «entre 2 y 120 caracteres»", como(FELIPE, guardar(`null, null, null, 'A'`)), "entre 2 y 120 caracteres");
error("titular de 121 caracteres: rechazado", como(FELIPE, guardar(`null, null, null, repeat('a', 121)`)), "entre 2 y 120 caracteres");
error(
  "proveedor inexistente: «ya no existe»",
  como(FELIPE, `select retail.guardar_cuentas_proveedor(gen_random_uuid(), '00219300214567804558');`),
  "Ese proveedor ya no existe"
);

// ===========================================================================
// 3. Quién puede escribir
// ===========================================================================

error("integrante: «Solo un Líder puede editar las cuentas de un proveedor»", como(MICAELA, guardar(`'00219300214567804558'`)), "Solo un Líder puede editar las cuentas de un proveedor");
error(
  "sin sesión de líder (rol anon): no tiene EXECUTE sobre la RPC",
  como(FELIPE, `set local role anon;\n${guardar(`'00219300214567804558'`)}`),
  "permission denied"
);

// ===========================================================================
// 4. Los candados de la tabla no dependen de la RPC
// ===========================================================================

error("CHECK: un CCI de 3 dígitos no entra ni por UPDATE directo (proveedores_cci_formato)", como(FELIPE, `update retail.proveedores set cci = '123' where id = :'prov';`), "proveedores_cci_formato");
error("CHECK: celular que no empieza con 9 no entra (proveedores_celular_billetera_formato)", como(FELIPE, `update retail.proveedores set celular_billetera = '812345678', billeteras = '{yape}' where id = :'prov';`), "proveedores_celular_billetera_formato");
error("CHECK: celular sin app no entra (proveedores_billetera_coherente)", como(FELIPE, `update retail.proveedores set celular_billetera = '987654321' where id = :'prov';`), "proveedores_billetera_coherente");
error("CHECK: app sin celular no entra (proveedores_billetera_coherente)", como(FELIPE, `update retail.proveedores set billeteras = '{yape}' where id = :'prov';`), "proveedores_billetera_coherente");
error("CHECK: app inventada no entra (proveedores_billeteras_validas)", como(FELIPE, `update retail.proveedores set celular_billetera = '987654321', billeteras = '{zelle}' where id = :'prov';`), "proveedores_billeteras_validas");
error("CHECK: billeteras vacía no entra (proveedores_billeteras_validas)", como(FELIPE, `update retail.proveedores set celular_billetera = '987654321', billeteras = '{}' where id = :'prov';`), "proveedores_billeteras_validas");

// ===========================================================================
// 5. Lectura: fn_proveedores() y su resumen
// ===========================================================================

exito(
  "fn_proveedores() devuelve las 4 columnas nuevas con lo guardado",
  como(FELIPE, `${guardar(`'00219300214567804558', '987654321', array['yape','plin'], 'Rosita'`)}select cci, celular_billetera, array_to_string(billeteras, ','), titular_cuenta from retail.fn_proveedores() where id = :'prov';`),
  ["00219300214567804558", "987654321", "plin,yape", "Rosita"]
);

exito(
  "fn_proveedores() y las RPC nuevas tienen UNA sola firma (sin sobrecargas vivas)",
  como(
    FELIPE,
    `select count(*) filter (where proname = 'fn_proveedores'), count(*) filter (where proname = 'guardar_cuentas_proveedor'), count(*) filter (where proname = 'registrar_proveedor'), count(*) filter (where proname = 'actualizar_proveedor')
       from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_proveedores','guardar_cuentas_proveedor','registrar_proveedor','actualizar_proveedor');`
  ),
  ["1", "1", "1", "1"]
);

exito(
  "fn_proveedores_resumen() sigue respondiendo (lee fn_proveedores() por nombre de columna)",
  como(FELIPE, `select (count(*) = 1)::text from retail.fn_proveedores_resumen();`),
  ["true"]
);

// ===========================================================================
// 6. La migración: se puede pegar dos veces y el backfill no inventa
// ===========================================================================

exito(
  "pegar la migración dos veces no falla ni pierde lo guardado",
  `begin;
${CABECERA_DE_ANTES}${MIGRACION}
insert into retail.proveedores (nombre) values ('Proveedor doble pegado ' || gen_random_uuid()) returning id as prov \\gset
set local request.jwt.claim.sub = '${FELIPE}';
${guardar(`'00219300214567804558', '987654321', array['yape'], 'Rosita'`)}
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
${VER}`,
  ["00219300214567804558", "987654321", "yape", "Rosita"]
);

exito(
  "backfill: un cuenta_bancaria de 20 dígitos (con espacios) pasa a cci; una cuenta local de 10 dígitos NO se copia",
  `begin;
insert into retail.proveedores (nombre, cuenta_bancaria) values ('Backfill CCI ' || gen_random_uuid(), '002 193 002145678045 58') returning id as p20 \\gset
insert into retail.proveedores (nombre, cuenta_bancaria) values ('Backfill local ' || gen_random_uuid(), '193-2145678-0-45') returning id as p10 \\gset
insert into retail.proveedores (nombre, cuenta_bancaria) values ('Backfill basura ' || gen_random_uuid(), 'BCP cuenta corriente 00219300214567804558') returning id as pbasura \\gset
${CABECERA_DE_ANTES}${MIGRACION}
select (select cci from retail.proveedores where id = :'p20'),
       coalesce((select cci from retail.proveedores where id = :'p10'), '∅'),
       coalesce((select cci from retail.proveedores where id = :'pbasura'), '∅'),
       (select cuenta_bancaria from retail.proveedores where id = :'p20');`,
  ["00219300214567804558", "∅", "∅", "002 193 002145678045 58"]
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: la migración se carga dentro de cada escenario (no se aplica a la base).\n");

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      // La última línea de salida es la fila de verificación.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
