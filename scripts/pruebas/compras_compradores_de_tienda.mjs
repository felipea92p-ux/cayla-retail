#!/usr/bin/env node
/**
 * Pruebas del permiso «comprador de tienda» (ADR-0150, F1 paso 1) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que `compradores_de_tienda` y sus funciones digan exactamente a qué tiendas llega cada quien, y que
 * agregar el permiso NO abra ninguna puerta todavía:
 *   · el líder llega a TODAS las ubicaciones activas y no necesita fila; un integrante sin fila, a ninguna;
 *   · un comprador llega solo a las suyas (una o varias) y `fn_puede_comprar_en` lo confirma tienda por tienda;
 *   · una fila de alguien que ya no es colaborador no da nada (no hay que limpiarla para cerrar el acceso);
 *   · dar y quitar el permiso es solo del líder, dice la verdad (falla si ya estaba / no estaba) y no admite
 *     escribir la tabla directo;
 *   · cada persona lee solo sus filas; el líder lee todas; sin sesión y `anon` no llegan a nada;
 *   · las dos puertas de ADR-0126 (`fn_puede_registrar_compras`, `fn_puede_ver_dinero_de_compras`) siguen siendo
 *     «solo el líder»: tener fila NO abre el dinero de Compras, porque las lecturas aún no filtran por tienda;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `dinero_compras_solo_lider.mjs`: cada escenario corre en su transacción con ROLLBACK, así
 * que nunca se commitea nada y es seguro contra el Postgres local que comparten los worktrees. La migración se
 * carga DENTRO de cada escenario (es re-pegable), así que se prueba sin aplicarla a la base compartida.
 *
 * USO   pnpm pruebas:compras-compradores
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo
const NADIE = "22222222-2222-4222-8222-0000000000ff"; // una cuenta que no existe

const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260922120000_compras_compradores_de_tienda.sql"), "utf8");

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

/**
 * Abre la transacción, carga la migración y se pone como esa persona. Todo termina en ROLLBACK.
 * `nombres_ubic` es un mapa id → nombre hecho ANTES de cambiar de rol: la RLS de `ubicaciones` le oculta a un
 * integrante las tiendas que no son suyas, y aquí se quiere ver a qué tiendas LLEGA `fn_compras_ubicaciones`,
 * no cuáles alcanza a leer por su cuenta.
 */
const como = (authUserId, sql) => `
begin;
${MIGRACION}
create temp table nombres_ubic as select id, nombre from retail.ubicaciones;
grant select on nombres_ubic to authenticated, anon;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
rollback;
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\n";

const UBICACIONES = `
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
`;

/** Los nombres de las tiendas a las que llega quien consulta, ordenados y separados por coma. */
const MIS_TIENDAS = `(select coalesce(string_agg(u.nombre, ',' order by u.nombre), '') from nombres_ubic u where u.id in (select retail.fn_compras_ubicaciones()))`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. A qué tiendas llega cada quien
// ===========================================================================

exito(
  "líder: llega a TODAS las ubicaciones activas sin necesitar fila",
  como(FELIPE, `${COMO_AUTENTICADO}select ${MIS_TIENDAS}, (select count(*) from retail.compradores_de_tienda);`),
  ["Taller,Tienda Lima,Tienda Trujillo", "0"]
);

exito(
  "integrante sin fila: no llega a ninguna tienda",
  como(MICAELA, `${COMO_AUTENTICADO}select ${MIS_TIENDAS}, retail.fn_puede_comprar_en((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'));`),
  ["", "f"]
);

exito(
  "el líder le da a Micaela solo Tienda Lima: ve solo Lima, y fn_puede_comprar_en lo confirma tienda por tienda (Trujillo, su sede fija, NO cuenta)",
  como(
    FELIPE,
    `${UBICACIONES}${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
${cambiaA(MICAELA)}select ${MIS_TIENDAS},
  retail.fn_puede_comprar_en(:'lima'), retail.fn_puede_comprar_en(:'trujillo'), retail.fn_puede_comprar_en(:'taller'), retail.fn_puede_comprar_en(null);`
  ),
  ["Tienda Lima", "t", "f", "f", "f"]
);

exito(
  "una persona puede comprar para varias tiendas (la persona de Compras de R-10): Lima y Taller, no Trujillo",
  como(
    FELIPE,
    `${UBICACIONES}${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
select retail.agregar_comprador_de_tienda(:'micaela', :'taller');
${cambiaA(MICAELA)}select ${MIS_TIENDAS};`
  ),
  ["Taller,Tienda Lima"]
);

exito(
  "quitar el permiso lo cierra: Micaela vuelve a no llegar a ninguna tienda",
  como(
    FELIPE,
    `${UBICACIONES}${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
select retail.quitar_comprador_de_tienda(:'micaela', :'lima');
${cambiaA(MICAELA)}select ${MIS_TIENDAS};`
  ),
  [""]
);

exito(
  "una fila de alguien que ya no es colaborador no da nada (no hace falta limpiarla para cerrar el acceso)",
  como(
    FELIPE,
    `${UBICACIONES}insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima');
delete from retail.colaboradores where persona_id = :'micaela';
${cambiaA(MICAELA)}${COMO_AUTENTICADO}select ${MIS_TIENDAS};`
  ),
  [""]
);

exito(
  "una fila de una persona que dejó de estar activa en Dynamic no da nada",
  como(
    FELIPE,
    `${UBICACIONES}insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima');
update public.personas set estado = 'inactivo' where id = :'micaela';
${cambiaA(MICAELA)}${COMO_AUTENTICADO}select ${MIS_TIENDAS};`
  ),
  [""]
);

exito(
  "una tienda desactivada deja de contar, aunque la fila siga",
  como(
    FELIPE,
    `${UBICACIONES}insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima'), (:'micaela', :'taller');
update retail.ubicaciones set activo = false where id = :'taller';
${cambiaA(MICAELA)}${COMO_AUTENTICADO}select ${MIS_TIENDAS};`
  ),
  ["Tienda Lima"]
);

exito(
  "sin sesión (auth.uid() nulo): no llega a ninguna tienda",
  como(FELIPE, `${cambiaA("")}${COMO_AUTENTICADO}select ${MIS_TIENDAS};`),
  [""]
);

exito(
  "una cuenta que no existe en personas: no llega a ninguna tienda",
  como(NADIE, `${COMO_AUTENTICADO}select ${MIS_TIENDAS};`),
  [""]
);

// ===========================================================================
// 2. Dar y quitar el permiso: solo el líder, y dice la verdad
// ===========================================================================

error(
  "un integrante NO puede darse el permiso a sí mismo: «Solo un líder puede asignar compradores de tienda»",
  como(MICAELA, `${UBICACIONES}${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');`),
  "Solo un líder puede asignar compradores de tienda"
);

error(
  "un integrante NO puede quitar el permiso de otro: «Solo un líder puede quitar compradores de tienda»",
  como(MICAELA, `${UBICACIONES}${COMO_AUTENTICADO}select retail.quitar_comprador_de_tienda(:'felipe', :'lima');`),
  "Solo un líder puede quitar compradores de tienda"
);

error(
  "no se escribe la tabla directo: authenticated no tiene INSERT (solo las RPC)",
  como(FELIPE, `${UBICACIONES}${COMO_AUTENTICADO}insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima');`),
  "permission denied"
);

error(
  "no se borra la tabla directo: authenticated no tiene DELETE (solo las RPC)",
  como(FELIPE, `${UBICACIONES}insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima');
${COMO_AUTENTICADO}delete from retail.compradores_de_tienda;`),
  "permission denied"
);

error(
  "agregar dos veces lo mismo falla y lo dice: «ya es compradora de esa tienda»",
  como(
    FELIPE,
    `${UBICACIONES}${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
select retail.agregar_comprador_de_tienda(:'micaela', :'lima');`
  ),
  "ya es compradora de esa tienda"
);

error(
  "quitar lo que no existía falla y lo dice: «no era compradora de esa tienda»",
  como(FELIPE, `${UBICACIONES}${COMO_AUTENTICADO}select retail.quitar_comprador_de_tienda(:'micaela', :'lima');`),
  "no era compradora de esa tienda"
);

error(
  "no se le da el permiso a una persona sin ficha de colaborador",
  como(
    FELIPE,
    `${UBICACIONES}insert into public.personas (nombres, apellidos, sede_base_id) select 'Sin', 'Acceso', sede_base_id from public.personas where id = :'felipe' returning id as ajena \\gset
${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'ajena', :'lima');`
  ),
  "no es colaboradora activa de retail"
);

error(
  "no se asigna una ubicación desactivada",
  como(
    FELIPE,
    `${UBICACIONES}update retail.ubicaciones set activo = false where id = :'taller';
${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'taller');`
  ),
  "no existe o está inactiva"
);

// ===========================================================================
// 3. Quién lee la tabla
// ===========================================================================

exito(
  "RLS: cada persona lee solo sus filas; el líder lee todas",
  como(
    FELIPE,
    `${UBICACIONES}insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima'), (:'felipe', :'taller');
${COMO_AUTENTICADO}select count(*) as del_lider from retail.compradores_de_tienda \\gset
${cambiaA(MICAELA)}select :del_lider, (select count(*) from retail.compradores_de_tienda), (select count(*) from retail.compradores_de_tienda where persona_id = :'felipe');`
  ),
  ["2", "1", "0"]
);

error(
  "anon no ejecuta fn_compras_ubicaciones",
  como(FELIPE, "set local role anon;\nselect retail.fn_compras_ubicaciones();"),
  "permission denied"
);

// ===========================================================================
// 4. Lo que NO cambió: las puertas del dinero siguen siendo solo del líder
// ===========================================================================

exito(
  "con fila de comprador, Micaela NO ve dinero de Compras todavía: las dos puertas de ADR-0126 siguen cerradas (se abren junto con los filtros por tienda)",
  como(
    FELIPE,
    `${UBICACIONES}${COMO_AUTENTICADO}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
${cambiaA(MICAELA)}select retail.fn_puede_registrar_compras(), retail.fn_puede_ver_dinero_de_compras(),
  (select count(*) from retail.compras), retail.fn_es_lider();`
  ),
  ["f", "f", "0", "f"]
);

exito(
  "el líder sigue con las dos puertas abiertas",
  como(FELIPE, `${COMO_AUTENTICADO}select retail.fn_puede_registrar_compras(), retail.fn_puede_ver_dinero_de_compras();`),
  ["t", "t"]
);

// ===========================================================================
// 5. La migración
// ===========================================================================

exito(
  "la migración se puede pegar DOS veces sin romper nada ni perder filas",
  `begin;
${MIGRACION}
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.compradores_de_tienda (persona_id, ubicacion_id) values (:'micaela', :'lima');
${MIGRACION}
select count(*) from retail.compradores_de_tienda;
rollback;`,
  ["1"]
);

// ===========================================================================
// Corredor
// ===========================================================================

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
