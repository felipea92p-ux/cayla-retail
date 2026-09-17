#!/usr/bin/env node
/**
 * Pruebas de "apartar stock" (`retail.fn_aplicar_movimiento` ramas `apartado`/
 * `liberacion_apartado`, y `retail.registrar_movimiento` que las expone) contra el
 * Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. Hallazgo de mayor prioridad de la sesión "Anatomía del
 * Producto": hoy una prenda apartada para una clienta sigue contando como
 * disponible — se puede vender dos veces. `20260917222400_stock_apartado.sql`
 * agrega `stock.cantidad_apartada` y dos tipos de movimiento nuevos; este archivo
 * prueba que el candado es real, no decorativo.
 *
 * MISMO PATRÓN que `registrar_cambio.mjs`/`fn_aplicar_movimiento.mjs` (ver
 * ADR-0066): `docker exec ... psql` + `set local request.jwt.claim.sub` + ROLLBACK
 * siempre — nunca se commitea nada contra el Postgres que comparten ~27 worktrees.
 * No es un `*.test.ts` de vitest por el mismo motivo que los dos scripts hermanos:
 * CI corre sin Docker/Postgres (`.github/workflows/ci.yml`).
 *
 * EL ESCENARIO DE CONCURRENCIA (el más importante de este archivo) NO puede probar
 * "el segundo pierde con tal mensaje" usando dos conexiones reales sin commitear
 * nada — es una limitación real de MVCC, no un atajo: una transacción sin commit es
 * invisible para cualquier otra conexión, así que si la sesión 1 nunca commitea, la
 * sesión 2 jamás puede "ver" que ya se apartó la última unidad. `fn_aplicar_movimiento.mjs`
 * ya resolvió exactamente este mismo problema para `traslado`, con la misma
 * respuesta: probar lo que SÍ es observable sin commitear — que las dos sesiones
 * contienden de verdad por la MISMA fila (bloqueo real, medido con reloj de pared) y
 * que ninguna termina en "deadlock detected". Eso es lo que de verdad impide vender
 * la misma unidad dos veces: el `for update` de la rama `apartado` serializa el
 * acceso a la fila, así que un commit real de la sesión 1 y un commit real de la
 * sesión 2 estando en carrera NUNCA pueden calzar sobre el mismo disponible — physically
 * imposible que ambas ganen. El resultado de negocio exacto ("el segundo falla con
 * 'no hay disponible'") se prueba aparte, de forma determinística y secuencial, en el
 * escenario 5 de abajo: agotar el disponible y, en la MISMA transacción, intentar
 * apartar una unidad más.
 *
 * QUÉ DA POR SENTADO. Que `Tienda Lima`/`Tienda Trujillo`, sus sububicaciones de
 * piso/almacén, y la variante `BLU-EMMA-NEG-M` existen (seed.sql). Cada escenario
 * repone sus propias sububicaciones si faltaran (mismo `insert ... where not
 * exists` que ya usan los scripts hermanos) y arranca desde su propio colchón —
 * nunca asume un `cantidad`/`cantidad_apartada` de partida específico.
 *
 * USO
 *   pnpm pruebas:apartar-stock    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";

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

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado
// que se está probando.
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

// Resuelve ubicación/sububicaciones/variante por NOMBRE (portabilidad si seed.sql
// cambiara los ids), reponiendo piso/almacén si faltaran — mismo patrón que
// fn_aplicar_movimiento.mjs.
const RESOLVER = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sub_almacen from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
`;

const cantidadDe = (sub) =>
  `coalesce((select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id is not distinct from :'${sub}'), 0)`;
const apartadaDe = (sub) =>
  `coalesce((select cantidad_apartada from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id is not distinct from :'${sub}'), 0)`;

function movimiento({ sub, tipo, cantidad, motivo }) {
  return `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'${sub}', '${tipo}', ${cantidad}, '${motivo}') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov') as _d \\gset
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
// 1: apartar baja disponible SIN bajar el conteo físico
// ---------------------------------------------------------------------------

exito(
  "apartar baja disponible (cantidad_apartada sube) sin tocar el stock físico (cantidad)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 50, motivo: "prueba apartar_stock: colchón" })}
select ${cantidadDe("sub_almacen")} as cant_antes, ${apartadaDe("sub_almacen")} as apart_antes \\gset

${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 12, motivo: "prueba apartar_stock: apartado" })}

select (${cantidadDe("sub_almacen")} - :'cant_antes'), (${apartadaDe("sub_almacen")} - :'apart_antes');
rollback;
`
  ),
  ([deltaCantidad, deltaApartada]) => Number(deltaCantidad) === 0 && Number(deltaApartada) === 12
);

// ---------------------------------------------------------------------------
// 2: apartar más de lo disponible se rechaza (con el número real en el mensaje)
// ---------------------------------------------------------------------------

error(
  "apartar más de lo disponible se rechaza",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 10, motivo: "prueba apartar_stock: colchón" })}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 4, motivo: "prueba apartar_stock: apartado previo" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'apartado', 7, 'prueba apartar_stock: apartado imposible (quedan 6 disponibles)') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "No hay stock disponible para apartar"
);

// ---------------------------------------------------------------------------
// 3: liberar sube disponible de vuelta
// ---------------------------------------------------------------------------

exito(
  "liberar un apartado sube disponible de vuelta exactamente lo liberado",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 20, motivo: "prueba apartar_stock: colchón" })}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 12, motivo: "prueba apartar_stock: apartado" })}
select ${apartadaDe("sub_almacen")} as apart_antes \\gset

${movimiento({ sub: "sub_almacen", tipo: "liberacion_apartado", cantidad: 12, motivo: "prueba apartar_stock: liberación" })}

select (${apartadaDe("sub_almacen")} - :'apart_antes');
rollback;
`
  ),
  ([delta]) => Number(delta) === -12
);

// ---------------------------------------------------------------------------
// 4: liberar más de lo apartado se rechaza
// ---------------------------------------------------------------------------

error(
  "liberar más de lo apartado se rechaza",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 20, motivo: "prueba apartar_stock: colchón" })}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 5, motivo: "prueba apartar_stock: apartado" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'liberacion_apartado', 6, 'prueba apartar_stock: liberación imposible') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "No se puede liberar"
);

// ---------------------------------------------------------------------------
// 5: el caso exacto de la última unidad — determinístico y secuencial (la
// contraparte de la prueba de concurrencia de abajo: agota TODO lo disponible y
// prueba que un apartado más, sobre la MISMA fila, en la MISMA transacción,
// se rechaza con el mensaje real — sin depender del azar de dos procesos)
// ---------------------------------------------------------------------------

error(
  "agotar disponible y apartar una unidad más falla — nunca deja cantidad_apartada > cantidad",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 3, motivo: "prueba apartar_stock: colchón última unidad" })}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 3, motivo: "prueba apartar_stock: apartado agota disponible" })}
select ${cantidadDe("sub_almacen")} as cant, ${apartadaDe("sub_almacen")} as apart \\gset
\\echo ESTADO :cant|:apart
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'apartado', 1, 'prueba apartar_stock: sobre la última unidad, ya apartada') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "No hay stock disponible para apartar"
);

// ---------------------------------------------------------------------------
// 6: recalcular_stock() no borra las reservas — replayea apartado/liberación
// desde movimientos, igual que hace con entrada/salida/ajuste/traslado
// ---------------------------------------------------------------------------

exito(
  "recalcular_stock() reconstruye cantidad_apartada desde el historial, no la borra",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 20, motivo: "prueba apartar_stock: colchón" })}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 9, motivo: "prueba apartar_stock: apartado antes de recalcular" })}
select ${apartadaDe("sub_almacen")} as antes \\gset

select retail.recalcular_stock();

select (${apartadaDe("sub_almacen")} - :'antes');
rollback;
`
  ),
  ([delta]) => Number(delta) === 0
);

// ---------------------------------------------------------------------------
// 7: una venta (salida) no puede vender lo que está apartado — sin esto,
// cantidad_apartada sería un contador decorativo (ver cabecera de la migración)
// ---------------------------------------------------------------------------

error(
  "una salida (venta) no puede bajar el stock físico por debajo de lo apartado",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_almacen", tipo: "entrada", cantidad: 5, motivo: "prueba apartar_stock: colchón" })}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 5, motivo: "prueba apartar_stock: se aparta TODO el colchón" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'salida', 1, 'prueba apartar_stock: intento de vender lo apartado') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "Stock insuficiente"
);

// ---------------------------------------------------------------------------
// 8: los dos CHECK de la base existen de verdad (no asumidos por nombre) —
// defensa en profundidad detrás del guard de PL/pgSQL, mismo patrón que ya usa
// fn_aplicar_movimiento.mjs para el candado de cantidad
// ---------------------------------------------------------------------------

exito(
  "el CHECK de cantidad_apartada >= 0 existe de verdad en retail.stock",
  `select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'retail.stock'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%cantidad_apartada%>=%0%';
`,
  ([conname, definicion]) => Boolean(conname) && /cantidad_apartada\s*>=\s*0/.test(definicion ?? "")
);

exito(
  "el CHECK de cantidad_apartada <= cantidad existe de verdad en retail.stock",
  `select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'retail.stock'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%cantidad_apartada%<=%cantidad%';
`,
  ([conname]) => Boolean(conname)
);

// ---------------------------------------------------------------------------
// 9-10: la RPC registrar_movimiento (no fn_aplicar_movimiento directo) — la
// firma de 7 parámetros vigente, sin agregar una tercera sobrecarga (ver
// docs/BACKLOG.md: ya hay dos firmas vivas de 6 y 7 parámetros)
// ---------------------------------------------------------------------------

exito(
  "registrar_movimiento(tipo='apartado') funciona de punta a punta, vía la RPC real",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${movimiento({ sub: "sub_piso", tipo: "entrada", cantidad: 8, motivo: "prueba apartar_stock: colchón vía RPC" })}
select ${apartadaDe("sub_piso")} as antes \\gset

select retail.registrar_movimiento(:'v', :'ubic', 'apartado', 3, 'prueba apartar_stock: RPC', null, :'sub_piso') as mov_id \\gset

select (${apartadaDe("sub_piso")} - :'antes'), (:'mov_id' is not null);
rollback;
`
  ),
  ([delta, huboId]) => Number(delta) === 3 && huboId === "t"
);

exito(
  // Mismo candado que ya exige `registrar_movimiento` para 'ajuste': sin
  // sububicación explícita, en una ubicación que separa piso/almacén, apartar
  // no tiene un "de dónde" seguro — no debe crear una fila fantasma.
  "registrar_movimiento(tipo='apartado') sin sububicación, en una tienda con piso/almacén, se rechaza",
  comoPersona(
    FELIPE,
    `${RESOLVER}
select retail.registrar_movimiento(:'v', :'ubic', 'apartado', 1, 'prueba apartar_stock: sin sububicación', null, null);
`
  ),
  "separa piso y almacén"
);

// ---------------------------------------------------------------------------
// 11: el candado de sede — una colaboradora de otra sede no puede apartar acá
// (mismo patrón que registrar_cambio.mjs, escenario 10)
// ---------------------------------------------------------------------------

error(
  "una colaboradora de otra sede (Micaela, fija a Trujillo) no puede apartar en Lima",
  comoPersona(
    MICAELA,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.registrar_movimiento(:'v', :'ubic', 'apartado', 1, 'prueba apartar_stock', null, null);
`
  ),
  "No tienes permiso"
);

// ---------------------------------------------------------------------------
// 12: concurrencia real — dos conexiones separadas, contendiendo por la MISMA
// fila de stock. Ver la nota larga en la cabecera del archivo: esto prueba que
// el `for update` serializa el acceso (sin deadlock, con espera real medida en
// reloj de pared) — la garantía estructural que hace imposible que dos apartados
// simultáneos ganen los dos sobre la última unidad. El resultado de negocio
// exacto ya se probó determinístico y sin depender de timing en el escenario 5.
// ---------------------------------------------------------------------------

function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    const p = spawn(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => {
      const ms = Date.now() - inicio;
      if (code === 0) resolve({ stdout, stderr, ms });
      else reject(Object.assign(new Error(`psql salió con código ${code}`), { stdout, stderr, ms }));
    });
    p.stdin.write(sql);
    p.stdin.end();
  });
}

function conTimeout(promesa, ms, etiqueta) {
  let temporizador;
  const limite = new Promise((_, reject) => {
    temporizador = setTimeout(() => reject(new Error(`${etiqueta}: no terminó en ${ms}ms (¿deadlock real no detectado?)`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

async function probarConcurrencia() {
  const nombre = "dos apartados simultáneos sobre la misma fila contienden de verdad (lock real, sin deadlock)";

  const meta = await psqlAsync(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${RESOLVER}
\\echo IDS :ubic|:sub_almacen|:v
rollback;
`);
  const linea = meta.stdout.split("\n").find((l) => l.startsWith("IDS "));
  if (!linea) throw new Error(`No se pudo resolver Tienda Lima/sububicación/variante: ${meta.stdout}`);
  const [ubic, subAlmacen, v] = linea.slice(4).trim().split("|");

  // Sesión 1: su propio colchón privado (nunca commiteado) deja disponible = 1,
  // aparta esa única unidad, y se queda despierta 2s sosteniendo el lock de la
  // fila antes de hacer rollback.
  const sesion1 = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subAlmacen}', 'entrada', 1, 'prueba apartar_stock (concurrencia): colchón privado sesión 1') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subAlmacen}', 'apartado', 1, 'prueba apartar_stock (concurrencia): apartado sesión 1') returning id as mov_apartado \\gset
select retail.fn_aplicar_movimiento(:'mov_apartado') as _d2 \\gset
select pg_sleep(2);
rollback;
`;

  // Sesión 2: intenta apartar sobre la MISMA fila — como sesión 1 nunca
  // commiteó su propio colchón, esta sesión no puede "ver" esa unidad (MVCC:
  // ver cabecera del archivo) y su propio intento va a fallar con "no hay
  // stock disponible" contra lo que SÍ existe committeado de antes — lo que
  // importa de este escenario no es ese mensaje puntual, es que 'ms' de abajo
  // demuestre que chocó contra el lock de la sesión 1 antes de poder evaluar
  // nada, no que corrió instantáneo en paralelo sin contención real.
  const sesion2 = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subAlmacen}', 'apartado', 1, 'prueba apartar_stock (concurrencia): apartado sesión 2') returning id as mov \\gset
\\set ON_ERROR_STOP 0
select retail.fn_aplicar_movimiento(:'mov');
\\set ON_ERROR_STOP 1
rollback;
`;

  const p1 = conTimeout(psqlAsync(sesion1), 15000, "sesión 1");
  await new Promise((r) => setTimeout(r, 600));
  const p2 = conTimeout(psqlAsync(sesion2), 15000, "sesión 2");

  const [r1, r2] = await Promise.all([p1, p2]);

  const combinado = `${r1.stdout}${r1.stderr}${r2.stdout}${r2.stderr}`.toLowerCase();
  const sinDeadlock = !combinado.includes("deadlock");
  const huboEsperaReal = r2.ms > 1000;

  const ok = sinDeadlock && huboEsperaReal;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    console.log(
      `    sin_deadlock=${sinDeadlock} espera_real=${huboEsperaReal} (sesión 2 tardó ${r2.ms}ms)\n` +
        `    sesión 1: ${JSON.stringify(r1.stdout).slice(0, 300)}\n` +
        `    sesión 2: ${JSON.stringify(r2.stdout).slice(0, 300)}`
    );
  }
  return ok;
}

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

  probarConcurrencia()
    .catch((e) => {
      console.log(`✗ dos apartados simultáneos sobre la misma fila contienden de verdad (lock real, sin deadlock)\n    ${e.message ?? e}`);
      return false;
    })
    .then((ok) => {
      if (!ok) fallos++;
      console.log(`\n${CASOS.length + 1 - fallos}/${CASOS.length + 1} pruebas en verde.`);
      process.exit(fallos > 0 ? 1 : 0);
    });
}

main();
