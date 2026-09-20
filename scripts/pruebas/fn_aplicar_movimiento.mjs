#!/usr/bin/env node
/**
 * Pruebas DIRIGIDAS de `retail.fn_aplicar_movimiento` contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. `fn_aplicar_movimiento` (definida en
 * supabase/migrations/20260914230000_inventario_piso_almacen.sql:91) es el motor
 * mecánico que aplica CUALQUIER movimiento de inventario (entrada/salida/ajuste/
 * traslado) a `stock` — el corazón del principio 4 (una sola fuente de verdad).
 * `scripts/pruebas/registrar_cambio.mjs` y `aprobar_devolucion_caja.mjs` ya la
 * ejercitan, pero solo INDIRECTAMENTE (llaman RPCs de negocio que a su vez hacen
 * `perform fn_aplicar_movimiento(...)`) — ninguno apunta a sus ramas internas de
 * forma dirigida: el candado de no-negativo en `salida`, la atomicidad real de
 * `traslado`, el orden determinístico de bloqueo que evita deadlocks, y el bug
 * histórico de signo en `ajuste` (ADR-0020/ADR-0023). Ese es el hueco que este
 * archivo cierra.
 *
 * QUÉ HACE. Inserta filas en `movimientos` directo (sin pasar por
 * registrar_venta/registrar_cambio/transferir) y llama a `fn_aplicar_movimiento`
 * una por una — exactamente el nivel de la función que se quiere probar, no el de
 * las RPC de negocio que la envuelven. Mismo mecanismo que los dos scripts
 * hermanos: `docker exec ... psql` + `set local request.jwt.claim.sub` + `ROLLBACK`
 * siempre (ver ADR-0066) — nunca se commitea nada, así que corre seguro contra el
 * mismo Postgres local que comparten ~27 worktrees.
 *
 * DÓNDE VIVE HOY EL `traslado` DE VERDAD. 20260916150000_traslados_dos_fases.sql
 * retiró `transferir()` y partió el traslado ENTRE sedes en dos llamadas
 * independientes (`iniciar_traslado` → tipo='salida', `confirmar_traslado` →
 * tipo='entrada', cada una en su propia transacción, potencialmente horas o días
 * después). El ÚNICO llamador que hoy sigue generando una fila `tipo='traslado'`
 * (origen Y destino resueltos en la MISMA llamada, atómica de verdad) es
 * `mover_interno()` — piso de venta ↔ almacén de tienda de una misma sede. Por
 * eso el escenario 3 y 4 usan Piso de venta/Almacén de tienda de Tienda Lima, no
 * dos sedes distintas: es el caso real que sigue vivo, no uno inventado.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. Mismo motivo que los scripts hermanos:
 * `pnpm test`/CI corre sin Postgres ni Docker (ver `.github/workflows/ci.yml`). Vive
 * en `scripts/` y se corre a mano, nunca desde `pnpm test`.
 *
 * ESCENARIO 4 (concurrencia) — por qué NO usa dos sedes reales ni depende de datos
 * ya commiteados. Probar el candado de deadlock de verdad exige DOS conexiones de
 * Postgres separadas contendiendo por la MISMA fila — pero dos transacciones
 * separadas no pueden "verse" datos no commiteados una a la otra (barrera normal de
 * MVCC), así que una prueba de concurrencia genuina, en principio, necesitaría
 * commitear algo real. Eso rompería el único invariante que hace seguro tocar este
 * Postgres compartido (ADR-0066: nunca se commitea nada). La resolución: la sesión
 * 1 aplica un traslado real y privado (su propio colchón, sin commitear) y se queda
 * DESPIERTA (transacción abierta) sosteniendo el lock de la fila de stock destino;
 * la sesión 2, en paralelo real (proceso de SO aparte), intenta una `entrada` real
 * sobre esa MISMA fila. El bloqueo entre inserciones concurrentes que compiten por
 * la MISMA clave única SÍ es visible entre transacciones no commiteadas — es el
 * mismo mecanismo que hace seguro `on conflict` bajo concurrencia — así que esto
 * ejercita contención cruzada de sesiones de verdad, sin commitear nada nunca. Se
 * mide con reloj de pared: si la sesión 2 tarda notablemente más de lo que tardaría
 * sin contención, es porque esperó de verdad a que la sesión 1 soltara el lock (y
 * no una carrera que nunca se cruzó); si ninguna de las dos falla con "deadlock
 * detected", el orden determinístico hizo su trabajo.
 *
 * QUÉ DA POR SENTADO. Que `Tienda Lima`, su Piso de venta/Almacén de tienda, y la
 * variante `BLU-EMMA-NEG-M` existen (los siembra `supabase/seed.sql`, y ya los usan
 * los dos scripts hermanos). Cada escenario deja su propio colchón de stock vía una
 * `entrada` real dentro de su propia transacción con ROLLBACK — nunca asume un
 * stock de partida en cero ni un stock previo específico: siempre calcula el DELTA
 * contra lo que había antes de esa transacción.
 *
 * USO
 *   pnpm pruebas:fn-aplicar-movimiento    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Misma credencial obvia que los scripts hermanos y supabase/seed.sql — líder,
// opera cualquier ubicación. fn_aplicar_movimiento en sí no valida permiso (eso
// vive en las RPC que la envuelven), pero se mantiene por consistencia con el
// resto de la suite y por si algún día gana un chequeo de auth.uid().
const FELIPE = "22222222-2222-4222-8222-000000000001";

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

// Resuelve ubicación/sububicaciones/variante por NOMBRE, nunca UUID fijo — los
// scripts hermanos ya establecen esta convención (portabilidad si seed.sql
// cambiara los ids). Piso de venta/Almacén de tienda de Tienda Lima YA existen en
// este Postgres compartido (a diferencia de lo que encontró ADR-0066 el
// 2026-09-16); por las dudas, cada bloque los repone si faltaran, exactamente
// igual que registrar_cambio.mjs — dentro de la misma transacción que se revierte,
// así que tampoco esto deja rastro.
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

// Cantidad de stock actual (0 si no hay fila) para variante+ubicación+sububicación.
const stockDe = (sub) =>
  `coalesce((select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id is not distinct from :'${sub}'), 0)`;

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1: entrada — sube stock.cantidad, y ACUMULA (on conflict do update suma, no pisa)
// ---------------------------------------------------------------------------

exito(
  "entrada normal sube stock.cantidad, y una segunda entrada se ACUMULA (no pisa la primera)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
select ${stockDe("sub_almacen")} as antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 7, 'prueba fn_aplicar_movimiento: entrada') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 5, 'prueba fn_aplicar_movimiento: entrada acumulada') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2') as _d2 \\gset

select ${stockDe("sub_almacen")} - :'antes';
rollback;
`
  ),
  ([delta]) => Number(delta) === 12
);

// ---------------------------------------------------------------------------
// 2: salida — baja stock.cantidad, y bloquea si dejaría negativo
// ---------------------------------------------------------------------------

exito(
  "salida normal baja stock.cantidad exactamente lo pedido",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 50, 'prueba fn_aplicar_movimiento: colchón para salida') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
select ${stockDe("sub_almacen")} as antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'salida', 12, 'prueba fn_aplicar_movimiento: salida') returning id as mov_salida \\gset
select retail.fn_aplicar_movimiento(:'mov_salida') as _d2 \\gset

select ${stockDe("sub_almacen")} - :'antes';
rollback;
`
  ),
  ([delta]) => Number(delta) === -12
);

error(
  "salida que dejaría stock negativo se rechaza (candado de no-negativo)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
select ${stockDe("sub_almacen")} as actual \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'salida', (:'actual'::integer + 999999), 'prueba fn_aplicar_movimiento: salida imposible') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "Stock insuficiente"
);

exito(
  // "buscá el nombre real de la constraint, no asumas el nombre" (pedido de
  // Felipe): en vez de hardcodear `stock_cantidad_check` como si fuera un hecho,
  // esta prueba le pregunta a pg_constraint y falla si algún día deja de existir
  // una CHECK de no-negativo en retail.stock — la red de seguridad de fondo
  // detrás del guard amigable que ya prueba el caso de arriba (defensa en
  // profundidad: el guard de PL/pgSQL da el mensaje legible, el CHECK crudo es
  // el que de verdad no puede saltarse aunque alguien rompa el guard). El patrón
  // exige `cantidad >= 0` a secas: `stock` también tiene `cantidad_apartada >= 0`
  // (20260920160000) y un `%cantidad%` suelto confundía a las dos.
  "el candado de no-negativo de retail.stock existe de verdad como CHECK (no asumido por nombre)",
  `select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'retail.stock'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ '[( ]cantidad >= 0';
`,
  ([conname, definicion]) => Boolean(conname) && /cantidad\s*>=\s*0/.test(definicion ?? "")
);

// ---------------------------------------------------------------------------
// 3: traslado — atómico en las dos direcciones, y todo-o-nada si el destino falla
// ---------------------------------------------------------------------------

exito(
  "traslado (Almacén → Piso) mueve exactamente la cantidad en ambos lados, en una sola llamada",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 40, 'prueba fn_aplicar_movimiento: colchón traslado') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
select ${stockDe("sub_almacen")} as almacen_antes \\gset
select ${stockDe("sub_piso")} as piso_antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', :'ubic', :'sub_piso', 'traslado', 15, 'prueba fn_aplicar_movimiento: traslado almacen->piso') returning id as mov_traslado \\gset
select retail.fn_aplicar_movimiento(:'mov_traslado') as _d2 \\gset

select (${stockDe("sub_almacen")} - :'almacen_antes'), (${stockDe("sub_piso")} - :'piso_antes');
rollback;
`
  ),
  ([deltaAlmacen, deltaPiso]) => Number(deltaAlmacen) === -15 && Number(deltaPiso) === 15
);

exito(
  "traslado en la dirección contraria (Piso → Almacén) funciona igual — sin asimetría direccional",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_piso', 'entrada', 40, 'prueba fn_aplicar_movimiento: colchón traslado inverso') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
select ${stockDe("sub_almacen")} as almacen_antes \\gset
select ${stockDe("sub_piso")} as piso_antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_piso', :'ubic', :'sub_almacen', 'traslado', 9, 'prueba fn_aplicar_movimiento: traslado piso->almacen') returning id as mov_traslado \\gset
select retail.fn_aplicar_movimiento(:'mov_traslado') as _d2 \\gset

select (${stockDe("sub_almacen")} - :'almacen_antes'), (${stockDe("sub_piso")} - :'piso_antes');
rollback;
`
  ),
  ([deltaAlmacen, deltaPiso]) => Number(deltaAlmacen) === 9 && Number(deltaPiso) === -9
);

exito(
  // Fuerza el fallo EXACTO que teme ADR-0031 ("un traslado hacia almacén que
  // restó del piso sin sumar en ningún lado"): un traslado gigante hace que la
  // resta en origen tenga éxito pero la suma en destino desborde integer (los FK
  // de movimientos ya impiden un destino con datos inválidos — desbordar es la
  // única forma de romper el paso de destino con datos 100% legítimos). SAVEPOINT
  // aísla justo esa llamada: si el origen quedara descontado "a medias" sin haber
  // sumado en destino, el SELECT de después del ROLLBACK TO SAVEPOINT lo
  // mostraría como delta_origen != 0.
  "traslado: si el destino falla (overflow), el origen NO queda descontado a medias — todo o nada",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 2000000000, 'prueba fn_aplicar_movimiento: colchón overflow origen') returning id as mov_o \\gset
select retail.fn_aplicar_movimiento(:'mov_o') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_piso', 'entrada', 2000000000, 'prueba fn_aplicar_movimiento: colchón overflow destino') returning id as mov_d \\gset
select retail.fn_aplicar_movimiento(:'mov_d') as _d2 \\gset

select ${stockDe("sub_almacen")} as origen_antes \\gset
select ${stockDe("sub_piso")} as destino_antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', :'ubic', :'sub_piso', 'traslado', 1000000000, 'prueba fn_aplicar_movimiento: traslado que desborda destino') returning id as mov_overflow \\gset

savepoint antes_overflow;
\\set ON_ERROR_STOP 0
select retail.fn_aplicar_movimiento(:'mov_overflow');
\\set ON_ERROR_STOP 1
rollback to savepoint antes_overflow;

select (${stockDe("sub_almacen")} - :'origen_antes'), (${stockDe("sub_piso")} - :'destino_antes');
rollback;
`
  ),
  ([deltaOrigen, deltaDestino]) => Number(deltaOrigen) === 0 && Number(deltaDestino) === 0
);

// ---------------------------------------------------------------------------
// 5: ajuste — lleva signo (sube o baja), sin el bug histórico de ADR-0020/0023
// ---------------------------------------------------------------------------

exito(
  "ajuste positivo sube stock.cantidad exactamente el delta",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 10, 'prueba fn_aplicar_movimiento: colchón ajuste positivo') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
select ${stockDe("sub_almacen")} as antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'ajuste', 5, 'prueba fn_aplicar_movimiento: ajuste positivo') returning id as mov_ajuste \\gset
select retail.fn_aplicar_movimiento(:'mov_ajuste') as _d2 \\gset

select ${stockDe("sub_almacen")} - :'antes';
rollback;
`
  ),
  ([delta]) => Number(delta) === 5
);

exito(
  // EL regresión-catcher de ADR-0020/ADR-0023. El bug histórico proponía la fila
  // con el delta YA en negativo (`values (..., m.cantidad)` con m.cantidad=-3) y
  // dejaba que `on conflict do update` lo sumara — pero el CHECK se evalúa sobre
  // la fila PROPUESTA antes de resolver el conflicto, así que -3 < 0 fallaba
  // SIEMPRE, aunque el resultado final (10 - 3 = 7) fuera perfectamente válido.
  // Si alguien reintrodujera ese patrón, esta llamada volvería a fallar con un
  // error crudo de constraint en vez de devolver el delta correcto.
  "ajuste negativo baja stock.cantidad exactamente el delta (regresión ADR-0020/ADR-0023)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 10, 'prueba fn_aplicar_movimiento: colchón ajuste negativo') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
select ${stockDe("sub_almacen")} as antes \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'ajuste', -3, 'prueba fn_aplicar_movimiento: ajuste negativo') returning id as mov_ajuste \\gset
select retail.fn_aplicar_movimiento(:'mov_ajuste') as _d2 \\gset

select ${stockDe("sub_almacen")} - :'antes';
rollback;
`
  ),
  ([delta]) => Number(delta) === -3
);

error(
  "ajuste que dejaría stock negativo se rechaza con el mensaje amigable (no un error crudo de constraint)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'entrada', 10, 'prueba fn_aplicar_movimiento: colchón ajuste imposible') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'ajuste', -999, 'prueba fn_aplicar_movimiento: ajuste imposible') returning id as mov_ajuste \\gset
select retail.fn_aplicar_movimiento(:'mov_ajuste');
`
  ),
  "dejaría stock negativo"
);

// ---------------------------------------------------------------------------
// 4: concurrencia — bloqueo determinístico por (ubicacion_id, sububicacion_id),
// nunca deadlock. Async: necesita dos sesiones de Postgres reales en paralelo,
// no encaja en el runner síncrono de arriba. Ver razonamiento completo en la
// cabecera del archivo.
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
  const nombre = "dos traslados concurrentes en sentidos opuestos (Almacén↔Piso) no interbloquean";

  // Resuelve ids una vez, fuera de la carrera — ambas sesiones deben apuntar a
  // EXACTAMENTE el mismo par de filas para que haya contención real. Envuelto en
  // begin/rollback como todo lo demás: RESOLVER puede repone sububicaciones con
  // INSERT si faltaran, y sin una transacción explícita psql las commitearía en
  // autocommit — las variables \gset son del cliente psql, sobreviven igual al
  // rollback porque se leen con \echo ANTES de esa línea.
  const meta = await psqlAsync(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${RESOLVER}
\\echo IDS :ubic|:sub_piso|:sub_almacen|:v
rollback;
`);
  const linea = meta.stdout.split("\n").find((l) => l.startsWith("IDS "));
  if (!linea) throw new Error(`No se pudo resolver Tienda Lima/sububicaciones/variante: ${meta.stdout}`);
  const [ubic, subPiso, subAlmacen, v] = linea.slice(4).trim().split("|");

  // Sesión 1: aplica un traslado real (Almacén → Piso) con SU PROPIO colchón
  // privado (nunca commiteado — solo esta transacción lo ve), y se queda
  // despierta 2s sosteniendo el lock de la fila de stock DESTINO (Piso) antes de
  // hacer rollback. Mientras duerme, sesión 2 debe chocar contra esa fila.
  const sesion1 = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subAlmacen}', 'entrada', 3, 'prueba fn_aplicar_movimiento (concurrencia): colchón privado sesión 1') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subAlmacen}', '${ubic}', '${subPiso}', 'traslado', 1, 'prueba fn_aplicar_movimiento (concurrencia): traslado sesión 1') returning id as mov_traslado \\gset
select retail.fn_aplicar_movimiento(:'mov_traslado') as _d2 \\gset
select pg_sleep(2);
rollback;
`;

  // Sesión 2: una ENTRADA real (no un traslado) al mismo Piso — sin depender de
  // stock previo commiteado. Su INSERT ... ON CONFLICT DO UPDATE apunta a la
  // MISMA clave única que la sesión 1 acaba de tocar (sin commitear), así que
  // choca contra ese lock y debe esperar — sin deadlock, sin error.
  const sesion2 = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subPiso}', 'entrada', 1, 'prueba fn_aplicar_movimiento (concurrencia): entrada sesión 2') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov') as _d \\gset
rollback;
`;

  const p1 = conTimeout(psqlAsync(sesion1), 15000, "sesión 1");
  // Cabeza de inicio: deja que la sesión 1 ya haya aplicado su traslado (unos
  // pocos ms) y esté dormida sosteniendo el lock antes de lanzar la sesión 2.
  await new Promise((r) => setTimeout(r, 600));
  const p2 = conTimeout(psqlAsync(sesion2), 15000, "sesión 2");

  const [r1, r2] = await Promise.all([p1, p2]);

  const combinado = `${r1.stdout}${r1.stderr}${r2.stdout}${r2.stderr}`.toLowerCase();
  const sinDeadlock = !combinado.includes("deadlock");
  // Sesión 2 arrancó con 600ms de cabeza de inicio; si de verdad chocó contra el
  // lock de la sesión 1 (que duerme 2s desde su propio inicio), sesión 2 debería
  // tardar bastante más que una llamada sin contención (que en este Postgres
  // local es cosa de ~100-200ms). 1000ms es un piso conservador con margen.
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

async function main() {
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

  let totalConcurrencia = 0;
  try {
    totalConcurrencia = 1;
    const ok = await probarConcurrencia();
    if (!ok) fallos++;
  } catch (e) {
    fallos++;
    console.log(`✗ dos traslados concurrentes en sentidos opuestos (Almacén↔Piso) no interbloquean\n    ${e.message ?? e}`);
  }

  const total = CASOS.length + totalConcurrencia;
  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
