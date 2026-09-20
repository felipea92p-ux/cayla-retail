#!/usr/bin/env node
/**
 * Pruebas de "apartar stock" (`20260920160000_apartar_stock.sql`, ADR-0141) contra el
 * Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. Una prenda apartada para una clienta seguía contando como
 * disponible: se podía vender dos veces. La migración agrega `stock.cantidad_apartada`,
 * la tabla `apartados` (clienta, contacto, fecha límite) y dos RPC — `apartar_stock` y
 * `liberar_apartado` — que son la ÚNICA puerta al contador. Este archivo prueba que el
 * candado es real y no decorativo: que una venta, un traslado o un ajuste normales NO
 * pueden llevarse lo apartado, que los permisos son los que decidió Felipe, y que el
 * contador de cada fila de stock siempre cuadra con la suma de sus apartados abiertos.
 *
 * MISMO PATRÓN que `registrar_cambio.mjs`/`fn_aplicar_movimiento.mjs` (ADR-0066):
 * `docker exec ... psql` + `set local request.jwt.claim.sub` + ROLLBACK siempre — nunca
 * se commitea nada contra el Postgres que comparten varios worktrees. No es un
 * `*.test.ts` de vitest por el mismo motivo: CI corre sin Docker/Postgres.
 *
 * SOBRE LA CONCURRENCIA. Con solo ROLLBACK no se puede probar "el segundo pierde con tal
 * mensaje" con dos conexiones reales (una transacción sin commit es invisible para la
 * otra — límite real de MVCC). Se prueba lo observable: que dos sesiones CONTIENDEN de
 * verdad por la MISMA fila (espera medida con reloj de pared) y que ninguna termina en
 * `deadlock detected`. El resultado de negocio exacto ("el segundo falla: no hay
 * disponible") se prueba aparte, determinístico y secuencial (escenario "agotar...").
 *
 * QUÉ DA POR SENTADO. `Tienda Lima`/`Tienda Trujillo`, sus sububicaciones de piso/almacén
 * (se reponen si faltaran) y la variante `BLU-EMMA-NEG-M` (supabase/seed.sql). Ningún
 * escenario asume un `cantidad`/`cantidad_apartada` de partida: cada uno arma su colchón
 * y mide DELTAS.
 *
 * USO
 *   pnpm pruebas:apartar-stock    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que los scripts hermanos y supabase/seed.sql.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

// Mensajes de Postgres siempre en inglés, sin importar el locale de quien corre esto:
// las pruebas de permisos comparan "permission denied".
const PREFIJO = "set lc_messages = 'C';\n";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: PREFIJO + sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
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

// Lo mismo, pero con el rol `authenticated` de verdad (RLS y privilegios de tabla se
// aplican; el superusuario `postgres` se los salta). El colchón de stock se arma ANTES
// del cambio de rol, como superusuario.
function comoAuthenticated(authUserId, sqlPreparacion, sqlComoAuthenticated) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlPreparacion}
set local role authenticated;
${sqlComoAuthenticated}
`;
}

// Resuelve ubicación/sububicaciones/variante por NOMBRE, reponiendo piso/almacén si
// faltaran — mismo patrón que fn_aplicar_movimiento.mjs. `ubic`/`sub_piso`/`sub_almacen`
// son Tienda Lima; `ubic_t`/`sub_piso_t` son Tienda Trujillo.
const resolverTienda = (nombre, sufijo) => `
select id as ubic${sufijo} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic${sufijo}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic${sufijo}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic${sufijo}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic${sufijo}' and tipo = 'almacen_tienda');
select id as sub_piso${sufijo} from retail.sububicaciones where ubicacion_id = :'ubic${sufijo}' and tipo = 'piso_venta' \\gset
select id as sub_almacen${sufijo} from retail.sububicaciones where ubicacion_id = :'ubic${sufijo}' and tipo = 'almacen_tienda' \\gset
`;
const RESOLVER = `${resolverTienda("Tienda Lima", "")}
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
`;
const RESOLVER_AMBAS = `${RESOLVER}${resolverTienda("Tienda Trujillo", "_t")}`;

const cantidadDe = (sub, ubic = "ubic") =>
  `coalesce((select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'${ubic}' and sububicacion_id is not distinct from :'${sub}'), 0)`;
const apartadaDe = (sub, ubic = "ubic") =>
  `coalesce((select cantidad_apartada from retail.stock where variante_id = :'v' and ubicacion_id = :'${ubic}' and sububicacion_id is not distinct from :'${sub}'), 0)`;
// La variante YA tiene stock sembrado: nunca asumir que una fila arranca en 0.
const disponibleDe = (sub, ubic = "ubic") => `(${cantidadDe(sub, ubic)} - ${apartadaDe(sub, ubic)})`;

function movimiento({ sub, tipo, cantidad, motivo, ubic = "ubic", destino = null }) {
  const cols = destino ? ", ubicacion_destino_id, sububicacion_destino_id" : "";
  const vals = destino ? `, :'${destino.ubic}', :'${destino.sub}'` : "";
  return `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo${cols})
  values (:'v', :'${ubic}', :'${sub}', '${tipo}', ${cantidad}, '${motivo}'${vals}) returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov') as _d \\gset
`;
}

// Colchón: deja `n` unidades ENTRANDO a la fila, encima de lo que ya hubiera.
const colchon = (sub, n, ubic = "ubic") =>
  movimiento({ sub, tipo: "entrada", cantidad: n, motivo: "prueba apartar_stock: colchón", ubic });

// Llamada a la RPC real. Devuelve el id del apartado en :ap.
const apartar = ({ ubic = "ubic", sub = "sub_piso", cantidad = 1, nombre = "Ana Torres", contacto = "999111222", dias = 3, nota = "null" } = {}) =>
  `select retail.apartar_stock(:'v', :'${ubic}', ${cantidad}, '${nombre}', '${contacto}', (retail.fn_hoy_lima() + ${dias}), ${nota}, :'${sub}') as ap \\gset
`;

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ===========================================================================
// A. EL MOTOR (`fn_aplicar_movimiento`) — el candado es real
// ===========================================================================

exito(
  "apartar baja el disponible (cantidad_apartada sube) sin tocar el stock físico (cantidad)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 50)}
select ${cantidadDe("sub_almacen")} as cant_antes, ${apartadaDe("sub_almacen")} as apart_antes \\gset
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 12, motivo: "prueba apartar_stock: apartado" })}
select (${cantidadDe("sub_almacen")} - :'cant_antes'), (${apartadaDe("sub_almacen")} - :'apart_antes');
rollback;
`
  ),
  ([deltaCantidad, deltaApartada]) => Number(deltaCantidad) === 0 && Number(deltaApartada) === 12
);

error(
  "apartar más de lo disponible se rechaza",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 10)}
select ${disponibleDe("sub_almacen")} as disponible \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'apartado', (:'disponible'::integer + 1), 'prueba apartar_stock: uno más de lo disponible') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "No hay stock disponible para apartar"
);

exito(
  "liberar un apartado sube el disponible de vuelta exactamente lo liberado",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 20)}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 12, motivo: "prueba apartar_stock: apartado" })}
select ${apartadaDe("sub_almacen")} as apart_antes \\gset
${movimiento({ sub: "sub_almacen", tipo: "liberacion_apartado", cantidad: 12, motivo: "prueba apartar_stock: liberación" })}
select (${apartadaDe("sub_almacen")} - :'apart_antes');
rollback;
`
  ),
  ([delta]) => Number(delta) === -12
);

error(
  "liberar más de lo apartado se rechaza",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 20)}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 5, motivo: "prueba apartar_stock: apartado" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'liberacion_apartado', 6, 'prueba apartar_stock: liberación imposible') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov');
`
  ),
  "No se puede liberar"
);

error(
  "agotar el disponible y apartar una unidad más falla — nunca deja cantidad_apartada > cantidad",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 3)}
select ${disponibleDe("sub_almacen")} as disponible \\gset
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: ":'disponible'", motivo: "prueba apartar_stock: se aparta TODO el disponible" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'apartado', 1, 'prueba apartar_stock: sobre la última unidad, ya apartada') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2');
`
  ),
  "No hay stock disponible para apartar"
);

// --- lo que hace que apartar signifique algo: las salidas normales NO se llevan lo apartado ---

error(
  "una VENTA (salida) no puede llevarse lo apartado — sin esto el contador sería decorativo",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 5)}
select ${disponibleDe("sub_almacen")} as disponible \\gset
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: ":'disponible'", motivo: "prueba apartar_stock: se aparta TODO el disponible" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'salida', 1, 'prueba apartar_stock: intento de vender lo apartado') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2');
`
  ),
  "apartadas para clientas"
);

exito(
  "una venta SÍ puede llevarse lo que no está apartado, y nada más",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 10)}
select ${disponibleDe("sub_almacen")} as disp0, ${apartadaDe("sub_almacen")} as apart0 \\gset
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 3, motivo: "prueba apartar_stock: apartado" })}
${movimiento({ sub: "sub_almacen", tipo: "salida", cantidad: ":'disp0'::integer - 3", motivo: "prueba apartar_stock: vende todo lo NO apartado" })}
select ${disponibleDe("sub_almacen")}, (${apartadaDe("sub_almacen")} - :'apart0');
rollback;
`
  ),
  ([disponible, apartadaExtra]) => Number(disponible) === 0 && Number(apartadaExtra) === 3
);

error(
  "un TRASLADO no puede sacar lo apartado de la fila de origen",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 5)}
select ${disponibleDe("sub_almacen")} as disponible \\gset
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: ":'disponible'", motivo: "prueba apartar_stock: se aparta TODO el disponible" })}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', :'ubic', :'sub_piso', 'traslado', 1, 'prueba apartar_stock: mover lo apartado') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2');
`
  ),
  "Stock insuficiente en origen"
);

error(
  "un AJUSTE (conteo) no deja el stock por debajo de lo apartado — mensaje de negocio, no error crudo",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 5)}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 4, motivo: "prueba apartar_stock: apartado" })}
-- delta que deja el stock UNA unidad por debajo de lo apartado (sin llegar a negativo)
select (${apartadaDe("sub_almacen")} - 1 - ${cantidadDe("sub_almacen")}) as delta \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_almacen', 'ajuste', :'delta', 'prueba apartar_stock: ajuste bajo lo apartado') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2');
`
  ),
  "apartadas para clientas"
);

exito(
  "un ajuste dentro de lo disponible sigue funcionando igual que antes",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 10)}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 4, motivo: "prueba apartar_stock: apartado" })}
select ${cantidadDe("sub_almacen")} as antes \\gset
${movimiento({ sub: "sub_almacen", tipo: "ajuste", cantidad: -2, motivo: "prueba apartar_stock: ajuste chico" })}
select (${cantidadDe("sub_almacen")} - :'antes');
rollback;
`
  ),
  ([delta]) => Number(delta) === -2
);

exito(
  "recalcular_stock() reconstruye cantidad_apartada desde el historial, no la borra",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_almacen", 20)}
${movimiento({ sub: "sub_almacen", tipo: "apartado", cantidad: 9, motivo: "prueba apartar_stock: apartado antes de recalcular" })}
select ${apartadaDe("sub_almacen")} as antes \\gset
select retail.recalcular_stock() as _r \\gset
select (${apartadaDe("sub_almacen")} - :'antes');
rollback;
`
  ),
  ([delta]) => Number(delta) === 0
);

exito(
  "los CHECK de la base existen de verdad en retail.stock (defensa en profundidad tras el guard)",
  `select
  exists (select 1 from pg_constraint where conrelid = 'retail.stock'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'cantidad_apartada >= 0'),
  exists (select 1 from pg_constraint where conrelid = 'retail.stock'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'cantidad_apartada <= cantidad');
`,
  ([noNegativa, noExcede]) => noNegativa === "t" && noExcede === "t"
);

error(
  "registrar_movimiento NO acepta 'apartado' suelto — la única puerta al contador son las RPC",
  comoPersona(
    FELIPE,
    `${RESOLVER}
select retail.registrar_movimiento(:'v', :'ubic', 'apartado', 1, 'prueba apartar_stock: puerta lateral', null, :'sub_piso');
`
  ),
  "entrada/salida/ajuste"
);

// ===========================================================================
// B. `apartar_stock` — la RPC real
// ===========================================================================

exito(
  "apartar_stock crea el apartado, sube el contador y deja el movimiento con quién y para quién",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 6)}
select ${apartadaDe("sub_piso")} as antes \\gset
${apartar({ cantidad: 2, nombre: "Ana Torres", contacto: "999111222", dias: 3, nota: "'talla M, la pasa a recoger'" })}
select (${apartadaDe("sub_piso")} - :'antes'),
       (select estado from retail.apartados where id = :'ap'),
       (select clienta_nombre from retail.apartados where id = :'ap'),
       (select count(*) from retail.movimientos m join retail.apartados a on a.movimiento_id = m.id
         where a.id = :'ap' and m.tipo = 'apartado' and m.usuario_id is not null and m.nota like 'Apartado para Ana Torres hasta el %'),
       (select count(*) from retail.fn_verificar_apartados());
rollback;
`
  ),
  ([delta, estado, clienta, movimientos, descuadres]) =>
    Number(delta) === 2 && estado === "abierto" && clienta === "Ana Torres" && Number(movimientos) === 1 && Number(descuadres) === 0
);

error(
  "apartar_stock exige el nombre de la clienta",
  comoPersona(FELIPE, `${RESOLVER}\n${colchon("sub_piso", 3)}\n${apartar({ nombre: "   " })}`),
  "Anota el nombre de la clienta"
);

error(
  "apartar_stock exige un contacto (teléfono o WhatsApp)",
  comoPersona(FELIPE, `${RESOLVER}\n${colchon("sub_piso", 3)}\n${apartar({ contacto: "" })}`),
  "Anota un teléfono o WhatsApp"
);

error(
  "apartar_stock rechaza una cantidad menor a 1",
  comoPersona(FELIPE, `${RESOLVER}\n${colchon("sub_piso", 3)}\n${apartar({ cantidad: 0 })}`),
  "al menos 1"
);

error(
  "apartar_stock rechaza una fecha límite que ya pasó",
  comoPersona(FELIPE, `${RESOLVER}\n${colchon("sub_piso", 3)}\n${apartar({ dias: -1 })}`),
  "La fecha límite debe estar entre hoy"
);

error(
  "apartar_stock rechaza una fecha límite de más de 60 días (un typo de año no deja una reserva de años)",
  comoPersona(FELIPE, `${RESOLVER}\n${colchon("sub_piso", 3)}\n${apartar({ dias: 61 })}`),
  "La fecha límite debe estar entre hoy"
);

error(
  "apartar_stock rechaza apartar más de lo disponible, con el número real",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 2)}
select ${disponibleDe("sub_piso")} + 1 as uno_mas \\gset
select retail.apartar_stock(:'v', :'ubic', :'uno_mas'::integer, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 2, null, :'sub_piso');
`
  ),
  "No hay stock disponible para apartar"
);

error(
  "apartar_stock rechaza una prenda que no existe o está descontinuada",
  comoPersona(
    FELIPE,
    `${RESOLVER}
select retail.apartar_stock(gen_random_uuid(), :'ubic', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 2, null, :'sub_piso');
`
  ),
  "no existe o está descontinuada"
);

error(
  "apartar_stock rechaza una sububicación que no es de esa tienda",
  comoPersona(
    FELIPE,
    `${RESOLVER_AMBAS}
${colchon("sub_piso", 3)}
select retail.apartar_stock(:'v', :'ubic', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 2, null, :'sub_piso_t');
`
  ),
  "no pertenece a la ubicación"
);

error(
  "una colaboradora de otra sede (Micaela, fija a Trujillo) no puede apartar en Lima",
  comoPersona(MICAELA, `${RESOLVER}\n${apartar({})}`),
  "No tienes permiso para apartar"
);

exito(
  "Micaela SÍ puede apartar en su propia tienda (Trujillo)",
  comoPersona(
    MICAELA,
    `${RESOLVER_AMBAS}
${colchon("sub_piso_t", 4, "ubic_t")}
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 1, nombre: "Rosa Quispe" })}
select estado, cantidad from retail.apartados where id = :'ap';
rollback;
`
  ),
  ([estado, cantidad]) => estado === "abierto" && Number(cantidad) === 1
);

// ===========================================================================
// C. `liberar_apartado` — permisos de Felipe: cualquiera aparta, solo la líder libera el ajeno
// ===========================================================================

exito(
  "quien apartó puede liberar su propio apartado: el contador vuelve y el cierre queda registrado",
  comoPersona(
    MICAELA,
    `${RESOLVER_AMBAS}
${colchon("sub_piso_t", 4, "ubic_t")}
select ${apartadaDe("sub_piso_t", "ubic_t")} as antes \\gset
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 2 })}
select retail.liberar_apartado(:'ap', 'clienta_no_vino') as _l \\gset
select (${apartadaDe("sub_piso_t", "ubic_t")} - :'antes'),
       (select estado from retail.apartados where id = :'ap'),
       (select cierre_motivo from retail.apartados where id = :'ap'),
       (select count(*) from retail.movimientos m join retail.apartados a on a.movimiento_cierre_id = m.id
         where a.id = :'ap' and m.tipo = 'liberacion_apartado'),
       (select count(*) from retail.fn_verificar_apartados());
rollback;
`
  ),
  ([delta, estado, motivo, movs, descuadres]) =>
    Number(delta) === 0 && estado === "liberado" && motivo === "clienta_no_vino" && Number(movs) === 1 && Number(descuadres) === 0
);

error(
  "una integrante NO puede liberar el apartado de otra persona (Micaela vs. el de Felipe)",
  comoPersona(
    FELIPE,
    `${RESOLVER_AMBAS}
${colchon("sub_piso_t", 4, "ubic_t")}
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 1 })}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.liberar_apartado(:'ap', 'otro');
`
  ),
  "Solo quien apartó la prenda o una líder"
);

exito(
  "la líder SÍ puede liberar el apartado de una integrante",
  comoPersona(
    MICAELA,
    `${RESOLVER_AMBAS}
${colchon("sub_piso_t", 4, "ubic_t")}
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 1 })}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.liberar_apartado(:'ap', 'error_de_carga') as _l \\gset
select estado from retail.apartados where id = :'ap';
rollback;
`
  ),
  ([estado]) => estado === "liberado"
);

error(
  "liberar dos veces el mismo apartado se rechaza (no se devuelve el stock dos veces)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 3)}
${apartar({ cantidad: 1 })}
select retail.liberar_apartado(:'ap', 'entregada') as _l \\gset
select retail.liberar_apartado(:'ap', 'entregada');
`
  ),
  "ya estaba cerrado"
);

error(
  "liberar exige un motivo válido",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 3)}
${apartar({ cantidad: 1 })}
select retail.liberar_apartado(:'ap', 'porque sí');
`
  ),
  "Elige por qué se libera"
);

exito(
  "tras liberar con «entregada», la prenda vuelve a poder venderse (el flujo de la Fase 1: liberar, luego cobrar en Vender)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 1)}
select ${disponibleDe("sub_piso")} as disp0 \\gset
${apartar({ cantidad: ":'disp0'" })}
select retail.liberar_apartado(:'ap', 'entregada') as _l \\gset
${movimiento({ sub: "sub_piso", tipo: "salida", cantidad: 1, motivo: "prueba apartar_stock: venta tras entregar" })}
select 'vendida';
rollback;
`
  ),
  ([r]) => r === "vendida"
);

// ===========================================================================
// D. RLS y privilegios — nadie escribe directo, y cada quien ve lo de su tienda
// ===========================================================================

exito(
  "RLS: Micaela ve los apartados de Trujillo y NO los de Lima",
  comoAuthenticated(
    FELIPE,
    `${RESOLVER_AMBAS}
${colchon("sub_piso", 3)}
${colchon("sub_piso_t", 3, "ubic_t")}
${apartar({ cantidad: 1, nombre: "Clienta de Lima" })}
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 1, nombre: "Clienta de Trujillo" })}
`,
    `set local request.jwt.claim.sub = '${MICAELA}';
select
  (select count(*) from retail.apartados where clienta_nombre = 'Clienta de Trujillo'),
  (select count(*) from retail.apartados where clienta_nombre = 'Clienta de Lima');
rollback;
`
  ),
  ([trujillo, lima]) => Number(trujillo) === 1 && Number(lima) === 0
);

// --- `listar_apartados`: lo que lee la pantalla, con el permiso de liberar ya resuelto en SQL ---

const APARTADOS_MIXTOS = `${RESOLVER_AMBAS}
${colchon("sub_piso_t", 6, "ubic_t")}
${colchon("sub_piso", 3)}
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 1, nombre: "De Felipe", dias: 5 })}
set local request.jwt.claim.sub = '${MICAELA}';
${apartar({ ubic: "ubic_t", sub: "sub_piso_t", cantidad: 1, nombre: "De Micaela", dias: 2 })}
set local request.jwt.claim.sub = '${FELIPE}';
${apartar({ cantidad: 1, nombre: "De Lima", dias: 1 })}
`;

exito(
  "listar_apartados: Micaela ve solo los de Trujillo, ordenados por vencimiento, y solo puede liberar el suyo",
  comoAuthenticated(
    FELIPE,
    APARTADOS_MIXTOS,
    `set local request.jwt.claim.sub = '${MICAELA}';
select
  (select string_agg(clienta_nombre || ':' || puede_liberar::text, ',' order by vence_el) from retail.listar_apartados(:'ubic_t') where clienta_nombre in ('De Felipe', 'De Micaela')),
  (select count(*) from retail.listar_apartados(:'ubic') where clienta_nombre = 'De Lima');
rollback;
`
  ),
  ([trujillo, lima]) => trujillo === "De Micaela:true,De Felipe:false" && Number(lima) === 0
);

exito(
  "listar_apartados: la líder (Felipe) puede liberar todos y ve los de cualquier tienda",
  comoAuthenticated(
    FELIPE,
    APARTADOS_MIXTOS,
    `select
  (select string_agg(puede_liberar::text, ',') from retail.listar_apartados(:'ubic_t') where clienta_nombre in ('De Felipe', 'De Micaela')),
  (select count(*) from retail.listar_apartados(:'ubic') where clienta_nombre = 'De Lima');
rollback;
`
  ),
  ([liberables, lima]) => liberables === "true,true" && Number(lima) === 1
);

exito(
  "listar_apartados: trae la prenda (SKU) y quién apartó, y no lista los ya liberados",
  comoAuthenticated(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 5)}
${apartar({ cantidad: 1, nombre: "Vigente" })}
${apartar({ cantidad: 1, nombre: "Cerrada" })}
select retail.liberar_apartado(:'ap', 'clienta_no_vino') as _l \\gset
`,
    `select count(*), min(sku), bool_and(creado_por_nombre is not null), min(clienta_nombre)
from retail.listar_apartados(:'ubic') where clienta_nombre in ('Vigente', 'Cerrada');
rollback;
`
  ),
  ([n, sku, conNombre, cual]) => Number(n) === 1 && sku === "BLU-EMMA-NEG-M" && conNombre === "t" && cual === "Vigente"
);

error(
  "un usuario anónimo NO puede ejecutar listar_apartados",
  comoPersona(FELIPE, `${RESOLVER}\nset local role anon;\nselect count(*) from retail.listar_apartados(:'ubic');`),
  "permission denied"
);

error(
  "un usuario autenticado NO puede insertar directo en apartados (solo las RPC)",
  comoAuthenticated(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 3)}
`,
    `insert into retail.apartados (variante_id, ubicacion_id, sububicacion_id, cantidad, clienta_nombre, clienta_contacto, vence_el, movimiento_id)
  select :'v', :'ubic', :'sub_piso', 1, 'Directo', '111', retail.fn_hoy_lima() + 1, id from retail.movimientos limit 1;
`
  ),
  "permission denied"
);

error(
  "un usuario autenticado NO puede ejecutar el diagnóstico fn_verificar_apartados()",
  comoAuthenticated(FELIPE, "", `select count(*) from retail.fn_verificar_apartados();`),
  "permission denied"
);

error(
  "un usuario autenticado NO puede ejecutar el motor fn_aplicar_movimiento() directo",
  comoAuthenticated(FELIPE, "", `select retail.fn_aplicar_movimiento(gen_random_uuid());`),
  "permission denied"
);

// ===========================================================================
// E. El invariante: el contador de cada fila = la suma de sus apartados abiertos
// ===========================================================================

exito(
  "invariante: tras apartar varias veces, liberar una y reconstruir el stock, ninguna fila descuadra",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 10)}
${apartar({ cantidad: 2, nombre: "Ana" })}
${apartar({ cantidad: 3, nombre: "Beatriz" })}
${apartar({ cantidad: 1, nombre: "Carla" })}
select retail.liberar_apartado(:'ap', 'clienta_no_vino') as _l \\gset
select (select count(*) from retail.fn_verificar_apartados()) as antes_recalculo \\gset
select retail.recalcular_stock() as _r \\gset
select :'antes_recalculo', (select count(*) from retail.fn_verificar_apartados()),
       (select sum(cantidad) from retail.apartados where variante_id = :'v' and estado = 'abierto' and clienta_nombre in ('Ana', 'Beatriz', 'Carla'));
rollback;
`
  ),
  ([antes, despues, abiertos]) => Number(antes) === 0 && Number(despues) === 0 && Number(abiertos) === 5
);

exito(
  "el diagnóstico SÍ detecta un descuadre (si alguien tocara el contador a mano)",
  comoPersona(
    FELIPE,
    `${RESOLVER}
${colchon("sub_piso", 5)}
${apartar({ cantidad: 2 })}
update retail.stock set cantidad_apartada = cantidad_apartada + 1
  where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'sub_piso';
select count(*) from retail.fn_verificar_apartados();
rollback;
`
  ),
  ([n]) => Number(n) === 1
);

// ===========================================================================
// F. Concurrencia real — dos conexiones contendiendo por la MISMA fila
// ===========================================================================

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
    p.stdin.write(PREFIJO + sql);
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
  const nombre = "un apartado y una venta sobre la misma fila contienden de verdad (lock real, sin deadlock)";

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

  // Sesión 1: su propio colchón privado (nunca commiteado), aparta esa unidad y se
  // queda despierta 2s sosteniendo el lock de la fila antes de hacer rollback.
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

  // Sesión 2: una SALIDA sobre la misma fila. Lo que importa no es su mensaje puntual
  // (la sesión 1 nunca commitea, así que no puede "ver" su unidad — MVCC), sino que
  // `ms` demuestre que chocó contra el lock antes de poder evaluar nada.
  const sesion2 = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values ('${v}', '${ubic}', '${subAlmacen}', 'salida', 1, 'prueba apartar_stock (concurrencia): salida sesión 2') returning id as mov \\gset
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

  probarConcurrencia()
    .catch((e) => {
      console.log(`✗ un apartado y una venta sobre la misma fila contienden de verdad (lock real, sin deadlock)\n    ${e.message ?? e}`);
      return false;
    })
    .then((ok) => {
      if (!ok) fallos++;
      console.log(`\n${CASOS.length + 1 - fallos}/${CASOS.length + 1} pruebas en verde.`);
      process.exit(fallos > 0 ? 1 : 0);
    });
}

main();
