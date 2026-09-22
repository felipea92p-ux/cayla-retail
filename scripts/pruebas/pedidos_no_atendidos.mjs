#!/usr/bin/env node
/**
 * Pruebas de «pedido no atendido en 1 toque» (`20260922190000_pedidos_no_atendidos.sql`,
 * D-79, ADR-0152) contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. Cuando una clienta pide un modelo/talla que la tienda no tiene, hoy
 * ese dato se pierde. Esta migración agrega la tabla `pedidos_no_atendidos` y dos RPC
 * (`registrar_pedido_no_atendido`/`marcar_pedido_no_atendido_resuelto`) que son la ÚNICA puerta de
 * escritura. Este archivo prueba: que se puede anotar con un producto DEL catálogo o con una
 * descripción libre (para lo que no está en catálogo), que un pedido sin ninguno de los dos se
 * rechaza (en la RPC y en el CHECK de la tabla, defensa en profundidad), que el candado de
 * ubicación es real (no decorativo) en las dos RPC, y que un pedido no se puede resolver dos veces.
 *
 * MISMO PATRÓN que `apartar_stock.mjs`/`registrar_cambio.mjs` (ADR-0066): `docker exec ... psql` +
 * `set local request.jwt.claim.sub` + ROLLBACK siempre — nunca se commitea nada contra el Postgres
 * que comparten varios worktrees. No es un `*.test.ts` de vitest por el mismo motivo: CI corre sin
 * Docker/Postgres.
 *
 * QUÉ DA POR SENTADO. `Tienda Lima`/`Tienda Trujillo` y el producto `Blusa Emma` (supabase/seed.sql).
 *
 * USO
 *   pnpm pruebas:pedidos-no-atendidos    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que los scripts hermanos y supabase/seed.sql.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se está probando.
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
${sqlDespues}
`;
}

function comoAuthenticated(authUserId, sqlPreparacion, sqlComoAuthenticated) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlPreparacion}
set local role authenticated;
${sqlComoAuthenticated}
`;
}

// Resuelve ubicación por nombre y el producto de prueba — mismo patrón que apartar_stock.mjs.
const RESOLVER = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as ubic_t from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prod from retail.productos where referencia = 'Blusa Emma' \\gset
`;

// `producto`/`clienta` van SIN envolver en `(select ...)`: como literal directo el tipo se infiere
// del parámetro de la función (mismo truco que `apartar_stock.mjs` con `:'v'`); envuelto en una
// subconsulta, Postgres lo resuelve a `text` ANTES de mirar la firma de la función, y la llamada
// deja de encontrar el overload (se probó en carne propia armando este archivo).
const registrar = ({
  ubic = "ubic",
  producto = ":'prod'",
  descripcion = "null",
  talla = "null",
  clienta = "null",
} = {}) =>
  `select retail.registrar_pedido_no_atendido(:'${ubic}', ${producto}, ${descripcion}, ${talla}, ${clienta}) as pedido \\gset\n`;

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ===========================================================================
// A. `registrar_pedido_no_atendido`
// ===========================================================================

exito(
  "registrar con un producto DEL catálogo: crea la fila, sin descripción libre, y guarda quién anotó",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${registrar({ talla: "'M'" })}
select (select producto_id from retail.pedidos_no_atendidos where id = :'pedido') = :'prod',
       (select descripcion_libre from retail.pedidos_no_atendidos where id = :'pedido') is null,
       (select talla from retail.pedidos_no_atendidos where id = :'pedido'),
       (select resuelto from retail.pedidos_no_atendidos where id = :'pedido'),
       (select atendido_por is not null from retail.pedidos_no_atendidos where id = :'pedido');
rollback;
`
  ),
  ([conProducto, sinDescripcion, talla, resuelto, conQuien]) =>
    conProducto === "t" && sinDescripcion === "t" && talla === "M" && resuelto === "f" && conQuien === "t"
);

exito(
  "registrar con una DESCRIPCIÓN LIBRE (nada de catálogo): crea la fila sin producto_id",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${registrar({ producto: "null::uuid", descripcion: "'Casaca de jean, marca de otra tienda'" })}
select (select producto_id from retail.pedidos_no_atendidos where id = :'pedido') is null,
       (select descripcion_libre from retail.pedidos_no_atendidos where id = :'pedido');
rollback;
`
  ),
  ([sinProducto, descripcion]) => sinProducto === "t" && descripcion === "Casaca de jean, marca de otra tienda"
);

error(
  "registrar sin producto NI descripción se rechaza — no hay nada que avisar después",
  comoPersona(FELIPE, `${RESOLVER}\n${registrar({ producto: "null::uuid" })}`),
  "Anota el modelo del catálogo o describe lo que pidió la clienta"
);

error(
  "registrar con una descripción libre que es solo espacios se rechaza (se recorta antes de mirar)",
  comoPersona(FELIPE, `${RESOLVER}\n${registrar({ producto: "null::uuid", descripcion: "'   '" })}`),
  "Anota el modelo del catálogo o describe lo que pidió la clienta"
);

error(
  "registrar con un producto que no existe en el catálogo se rechaza con mensaje de negocio",
  comoPersona(FELIPE, `${RESOLVER}\n${registrar({ producto: "gen_random_uuid()" })}`),
  "no existe en el catálogo"
);

error(
  "una colaboradora de otra sede (Micaela, fija a Trujillo) no puede anotar en Lima",
  comoPersona(MICAELA, `${RESOLVER}\n${registrar()}`),
  "No tienes permiso para anotar pedidos"
);

exito(
  "Micaela SÍ puede anotar en su propia tienda (Trujillo)",
  comoPersona(
    MICAELA,
    `${RESOLVER}
${registrar({ ubic: "ubic_t", producto: "null::uuid", descripcion: "'Falda tableada'" })}
select (select ubicacion_id from retail.pedidos_no_atendidos where id = :'pedido') = :'ubic_t';
rollback;
`
  ),
  ([enTrujillo]) => enTrujillo === "t"
);

exito(
  "el `clienta_id` se guarda tal cual (columna sin FK todavía — retail.clientas no existe, ver la migración)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${registrar({ clienta: "gen_random_uuid()" })}
select (select clienta_id from retail.pedidos_no_atendidos where id = :'pedido') is not null;
rollback;
`
  ),
  ([conClienta]) => conClienta === "t"
);

// ===========================================================================
// B. El CHECK de la tabla — defensa en profundidad, no solo la RPC
// ===========================================================================

exito(
  "el CHECK «producto_o_descripcion» existe de verdad en retail.pedidos_no_atendidos",
  `select exists (
  select 1 from pg_constraint
  where conrelid = 'retail.pedidos_no_atendidos'::regclass and contype = 'c'
    and conname = 'pedidos_no_atendidos_producto_o_descripcion'
);`,
  ([existe]) => existe === "t"
);

error(
  "un INSERT directo (como superusuario, saltándose la RPC) sin producto ni descripción igual lo rechaza el CHECK",
  `${RESOLVER}
insert into retail.pedidos_no_atendidos (ubicacion_id) values (:'ubic');
`,
  "pedidos_no_atendidos_producto_o_descripcion"
);

error(
  "un usuario autenticado NO puede insertar directo en pedidos_no_atendidos (solo la RPC)",
  comoAuthenticated(FELIPE, RESOLVER, `insert into retail.pedidos_no_atendidos (ubicacion_id, producto_id) values (:'ubic', :'prod');`),
  "permission denied for table pedidos_no_atendidos"
);

// ===========================================================================
// C. `marcar_pedido_no_atendido_resuelto`
// ===========================================================================

exito(
  "marcar resuelto: pone resuelto=true y resuelto_en=now(), y deja de contar como pendiente",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${registrar()}
select retail.marcar_pedido_no_atendido_resuelto(:'pedido') as _m \\gset
select resuelto, resuelto_en is not null,
       (select count(*) from retail.pedidos_no_atendidos where ubicacion_id = :'ubic' and resuelto = false and id = :'pedido')
from retail.pedidos_no_atendidos where id = :'pedido';
rollback;
`
  ),
  ([resuelto, conFecha, pendientes]) => resuelto === "t" && conFecha === "t" && Number(pendientes) === 0
);

error(
  "marcar resuelto dos veces se rechaza — no se pisa la fecha de la primera vez",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${registrar()}
select retail.marcar_pedido_no_atendido_resuelto(:'pedido') as _m \\gset
select retail.marcar_pedido_no_atendido_resuelto(:'pedido');
`
  ),
  "ya estaba marcado como resuelto"
);

error(
  "marcar resuelto un pedido que no existe se rechaza",
  comoPersona(FELIPE, `select retail.marcar_pedido_no_atendido_resuelto(gen_random_uuid());`),
  "Ese pedido no existe"
);

error(
  "una integrante de otra sede (Micaela) no puede resolver un pedido de Lima — candado va DESPUÉS de leer la fila, pero igual frena",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${registrar()}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.marcar_pedido_no_atendido_resuelto(:'pedido');
`
  ),
  "No tienes permiso para resolver pedidos"
);

exito(
  "la líder (Felipe) SÍ puede resolver un pedido de cualquier sede (Trujillo, anotado por Micaela)",
  comoPersona(
    MICAELA,
    `${RESOLVER}
${registrar({ ubic: "ubic_t", producto: "null::uuid", descripcion: "'Chompa oversize'" })}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.marcar_pedido_no_atendido_resuelto(:'pedido') as _m \\gset
select resuelto from retail.pedidos_no_atendidos where id = :'pedido';
rollback;
`
  ),
  ([resuelto]) => resuelto === "t"
);

// ===========================================================================
// D. RLS — cada quien ve solo los pedidos de su sede
// ===========================================================================

exito(
  "RLS: Micaela ve los pedidos de Trujillo y NO los de Lima",
  comoAuthenticated(
    FELIPE,
    `${RESOLVER}
${registrar({ descripcion: "null" })}
${registrar({ ubic: "ubic_t", producto: "null::uuid", descripcion: "'Solo de Trujillo'" })}
`,
    `set local request.jwt.claim.sub = '${MICAELA}';
select
  (select count(*) from retail.pedidos_no_atendidos where descripcion_libre = 'Solo de Trujillo'),
  (select count(*) from retail.pedidos_no_atendidos where ubicacion_id = '${"00000000-0000-0000-0000-000000000000"}'),
  (select count(*) from retail.pedidos_no_atendidos p join retail.ubicaciones u on u.id = p.ubicacion_id where u.nombre = 'Tienda Lima' and p.descripcion_libre is null and p.producto_id is not null);
rollback;
`
  ),
  ([trujillo, nada, lima]) => Number(trujillo) === 1 && Number(nada) === 0 && Number(lima) === 0
);

error(
  "un usuario anónimo NO puede ejecutar registrar_pedido_no_atendido",
  comoPersona(FELIPE, `${RESOLVER}\nset local role anon;\nselect retail.registrar_pedido_no_atendido(:'ubic', :'prod');`),
  "permission denied for function registrar_pedido_no_atendido"
);

error(
  "un usuario anónimo NO puede ejecutar marcar_pedido_no_atendido_resuelto",
  comoPersona(FELIPE, `set local role anon;\nselect retail.marcar_pedido_no_atendido_resuelto(gen_random_uuid());`),
  "permission denied for function marcar_pedido_no_atendido_resuelto"
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
    } else if (!resultado.ok) {
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

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
