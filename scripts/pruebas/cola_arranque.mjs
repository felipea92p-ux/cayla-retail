#!/usr/bin/env node
/**
 * Pruebas de «Cerrar la cola de arranque» (ADR-0334) contra el Postgres local — CAYLA V2.
 *
 * Un líder cierra en bloque las ventas sin registrar pendientes de UNA sede (`cerrar_cola_arranque`): pasan a
 * `cerrada_sin_prenda`, sin prenda y sin mover stock. Estas pruebas cuidan tres cosas: que el cierre sea todo-o-nada y
 * solo del líder dentro de su plazo, que cerrado no sea un camino a un stock inventado (devolución bloqueada, regularizar
 * bloqueado) y que los estados imposibles lo sean por el esquema y no por el código.
 *
 * Mismo patrón que `scripts/pruebas/prendas_por_regularizar.mjs` (léelo primero): cada caso corre en su propia transacción
 * con ROLLBACK contra el Postgres local compartido, simulando a Felipe (líder) o Micaela (colaboradora de Tienda
 * Trujillo) con `request.jwt.claim.sub`. La carrera con COMMIT real vive en `cola_arranque_concurrencia.mjs`.
 *
 * USO
 *   pnpm pruebas:cola-arranque    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora, fija a Tienda Trujillo
const CENTINELA = "22222222-2222-4222-8222-222222222222";

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
${sqlDespues}
`;
}

/**
 * Sede con piso/almacén, caja abierta y stock de BLU-EMMA-NEG-M. Lo que ya estuviera pendiente en esa sede (restos de otras
 * pruebas o de otra sesión) se aparta un día hacia adelante, dentro de esta transacción: el cierre solo ve lo que la prueba vende.
 */
function fixture(ubicacionNombre = "Tienda Lima") {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
update retail.prendas_por_regularizar set vendido_en = now() + interval '1 day' where ubicacion_id = :'ubic' and estado = 'pendiente';

select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset

select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
`;
}

/** Vende UNA prenda sin registrar a `precio`; deja :venta_<n> e :item_<n>. */
function venderLibre(n, precio = 50) {
  return `
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', ${precio},
    'descuento_unitario', 0, 'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat',
    'talla_id', :'talla', 'color_codigo', :'color')),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${precio})),
  null, gen_random_uuid()) as venta_${n} \\gset
select id as item_${n} from retail.venta_items where venta_id = :'venta_${n}' \\gset
`;
}

/** Cierra la cola de la sede de la prueba; deja :cierre_id. */
const cerrar = (motivo = "no_se_sabe", hasta = "now()") =>
  `select retail.cerrar_cola_arranque(:'ubic', ${hasta}, '${motivo}', null) as cierre_id \\gset\n`;

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ---------------------------------------------------------------------------
// El cierre: todo-o-nada, sin mover stock, sin tocar la venta
// ---------------------------------------------------------------------------

exito(
  "el líder cierra la cola: las dos pasan a cerrada, el cierre cuenta 2 y suma lo cobrado",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${venderLibre("b", 30)}${cerrar()}
select (select count(*) from retail.prendas_por_regularizar where cierre_id = :'cierre_id' and estado = 'cerrada_sin_prenda'),
       (select filas from retail.cierres_cola_arranque where id = :'cierre_id'),
       (select soles from retail.cierres_cola_arranque where id = :'cierre_id');
rollback;`
  ),
  ([cerradas, filas, soles]) => cerradas === "2" && filas === "2" && soles === "80.00"
);

exito(
  "cerrar no mueve stock ni toca la línea de la venta: sin movimientos y la línea sigue en la centinela",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
select (select count(*) from retail.movimientos where venta_item_id = :'item_a'),
       (select count(*) from retail.venta_items where id = :'item_a' and variante_id = '${CENTINELA}'),
       (select variante_id is null and forma is null from retail.prendas_por_regularizar where venta_item_id = :'item_a');
rollback;`
  ),
  ([movs, lineas, sinPrenda]) => movs === "0" && lineas === "1" && sinPrenda === "t"
);

exito(
  "una venta posterior al corte sigue pendiente: lo que el líder no vio no se cierra",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${venderLibre("b", 30)}
update retail.prendas_por_regularizar set vendido_en = now() + interval '1 minute' where venta_item_id = :'item_b';
${cerrar()}
select (select estado from retail.prendas_por_regularizar where venta_item_id = :'item_a'),
       (select estado from retail.prendas_por_regularizar where venta_item_id = :'item_b'),
       (select filas from retail.cierres_cola_arranque where id = :'cierre_id');
rollback;`
  ),
  ([a, b, filas]) => a === "cerrada_sin_prenda" && b === "pendiente" && filas === "1"
);

exito(
  "el cierre deja UNA línea en Actividad (no una por prenda)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${venderLibre("b", 30)}${cerrar("aun_no_cargada")}
select count(*), bool_and(descripcion like '%2 prendas vendidas sin registrar%'), bool_and(modulo = 'existencias')
  from retail.actividad where tabla = 'cierres_cola_arranque' and registro_id = :'cierre_id'::text;
rollback;`
  ),
  ([n, texto, modulo]) => n === "1" && texto === "t" && modulo === "t"
);

// ---------------------------------------------------------------------------
// Quién, cuándo y con qué datos
// ---------------------------------------------------------------------------

error(
  "una colaboradora no puede cerrar la cola (la cuenta decide, no el combo)",
  comoPersona(
    MICAELA,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select retail.cerrar_cola_arranque(:'ubic', now(), 'no_se_sabe', null);
rollback;`
  ),
  "cola_solo_lider"
);

error(
  "un motivo fuera de la lista cerrada se rechaza",
  comoPersona(FELIPE, `${fixture()}${venderLibre("a", 50)}${cerrar("porque_si")}rollback;`),
  "cola_motivo_invalido"
);

error(
  "un corte en el futuro se rechaza: solo se cierra lo que ya se vio",
  comoPersona(FELIPE, `${fixture()}${venderLibre("a", 50)}${cerrar("no_se_sabe", "now() + interval '1 hour'")}rollback;`),
  "cola_corte_invalido"
);

error(
  "sin corte no se cierra",
  comoPersona(FELIPE, `${fixture()}${venderLibre("a", 50)}${cerrar("no_se_sabe", "null::timestamptz")}rollback;`),
  "cola_corte_invalido"
);

error(
  "no se cierra una cola vacía: no queda un cierre de cero prendas",
  comoPersona(FELIPE, `${fixture()}${cerrar("no_se_sabe", "now() - interval '10 years'")}rollback;`),
  "cola_vacia"
);

error(
  "una sede sin plazo no puede cerrar (la salida de emergencia nace cerrada)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}
delete from retail.cola_arranque_plazo where ubicacion_id = :'ubic';
${cerrar()}rollback;`
  ),
  "cola_sin_plazo"
);

error(
  "pasado el plazo ya no se puede cerrar",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}
update retail.cola_arranque_plazo set hasta = retail.fn_hoy_lima() - 1 where ubicacion_id = :'ubic';
${cerrar()}rollback;`
  ),
  "cola_plazo_vencido"
);

exito(
  "el último día del plazo todavía se puede cerrar (el plazo es inclusivo)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}
update retail.cola_arranque_plazo set hasta = retail.fn_hoy_lima() where ubicacion_id = :'ubic';
${cerrar()}
select estado from retail.prendas_por_regularizar where venta_item_id = :'item_a';
rollback;`
  ),
  ([estado]) => estado === "cerrada_sin_prenda"
);

// ---------------------------------------------------------------------------
// Cerrada no es un camino a un stock inventado
// ---------------------------------------------------------------------------

error(
  "no se puede cambiar una prenda cuya venta se cerró sin prenda",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad)
  values (:'item_a', :'ubic', :'v1', 1);
rollback;`
  ),
  "prenda_cerrada_sin_prenda"
);

error(
  "una prenda cerrada no se regulariza por el camino de siempre (hay que reabrirla)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
select retail.regularizar_prenda(p.id, :'v1', 'ya_registrada') from retail.prendas_por_regularizar p where venta_item_id = :'item_a';
rollback;`
  ),
  "prenda_ya_regularizada"
);

exito(
  "anular la venta de una prenda cerrada la pasa a anulada, conserva su cierre y no devuelve nada al stock",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
select retail.anular_venta(:'venta_a', 'prueba',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_a', 'condicion', 'vendible'))) as _a \\gset
select estado, cierre_id = :'cierre_id'::uuid, (select count(*) from retail.movimientos where venta_item_id = :'item_a')
  from retail.prendas_por_regularizar where venta_item_id = :'item_a';
rollback;`
  ),
  ([estado, conserva, movs]) => estado === "anulada" && conserva === "t" && movs === "0"
);

// ---------------------------------------------------------------------------
// Estados imposibles: los impide el esquema, no el código
// ---------------------------------------------------------------------------

error(
  "imposible: una fila «cerrada» sin su cierre",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}
update retail.prendas_por_regularizar set estado = 'cerrada_sin_prenda' where venta_item_id = :'item_a';
rollback;`
  ),
  "prendas_por_regularizar_cierre_coherente"
);

error(
  "imposible: una fila cerrada con prenda (cerrar es no saber la prenda)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
update retail.prendas_por_regularizar set variante_id = :'v1' where venta_item_id = :'item_a';
rollback;`
  ),
  "prendas_por_regularizar_cierre_coherente"
);

error(
  "imposible: una fila pendiente que apunta a un cierre",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
update retail.prendas_por_regularizar set estado = 'pendiente' where venta_item_id = :'item_a';
rollback;`
  ),
  "prendas_por_regularizar_cierre_coherente"
);

error(
  "imposible: una fila de una sede cerrada con el cierre de OTRA sede",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}
select id as otra from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.cierres_cola_arranque (ubicacion_id, corte, motivo, filas, soles, cerrado_por)
  values (:'otra', now(), 'no_se_sabe', 1, 10, (select id from public.personas where auth_user_id = '${FELIPE}')) returning id as cierre_ajeno \\gset
update retail.prendas_por_regularizar set estado = 'cerrada_sin_prenda', cierre_id = :'cierre_ajeno' where venta_item_id = :'item_a';
rollback;`
  ),
  "prendas_por_regularizar_cierre_fk"
);

error(
  "imposible: un cierre de cero prendas",
  comoPersona(
    FELIPE,
    `${fixture()}
insert into retail.cierres_cola_arranque (ubicacion_id, corte, motivo, filas, soles, cerrado_por)
  values (:'ubic', now(), 'no_se_sabe', 0, 10, (select id from public.personas where auth_user_id = '${FELIPE}'));
rollback;`
  ),
  "cierres_cola_arranque_filas_check"
);

// ---------------------------------------------------------------------------
// Lectura: quien opera la sede ve su cierre; quien no, no
// ---------------------------------------------------------------------------

exito(
  "una colaboradora de OTRA sede no ve el cierre (la política es por sede)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
set local role authenticated;
set local request.jwt.claim.sub = '${MICAELA}';
select count(*) from retail.cierres_cola_arranque where id = :'cierre_id';
rollback;`
  ),
  ([n]) => n === "0"
);

exito(
  "el líder sí ve el cierre que hizo",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
set local role authenticated;
select count(*) from retail.cierres_cola_arranque where id = :'cierre_id';
rollback;`
  ),
  ([n]) => n === "1"
);

// ---------------------------------------------------------------------------
// Reabrir: la salida cuando una cliente devuelve una prenda cuya venta se cerró sin prenda
// ---------------------------------------------------------------------------

const reabrir = (item, motivo = "devolucion_o_cambio") =>
  `select retail.reabrir_prenda_cerrada(p.id, '${motivo}') from retail.prendas_por_regularizar p where p.venta_item_id = :'${item}';\n`;
const STOCK_V1 = `coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'), 0)`;

exito(
  "el líder reabre una venta cerrada: vuelve a pendiente, suelta su cierre y deja una línea en Actividad con el motivo",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}${reabrir("item_a")}
select estado, cierre_id is null,
       (select count(*) from retail.actividad where accion = 'prenda_reabierta' and registro_id = p.id::text and descripcion like '%quiere devolver o cambiar%')
  from retail.prendas_por_regularizar p where venta_item_id = :'item_a';
rollback;`
  ),
  ([estado, sinCierre, actividad]) => estado === "pendiente" && sinCierre === "t" && actividad === "1"
);

exito(
  "reabrir no toca el registro del cierre: sigue diciendo lo que el líder aceptó ese día",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${venderLibre("b", 30)}${cerrar()}${reabrir("item_a")}
select filas, soles from retail.cierres_cola_arranque where id = :'cierre_id';
rollback;`
  ),
  ([filas, soles]) => filas === "2" && soles === "80.00"
);

error(
  "una colaboradora no puede reabrir (la cuenta decide)",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
set local request.jwt.claim.sub = '${MICAELA}';
${reabrir("item_a")}rollback;`
  ),
  "cola_solo_lider"
);

error(
  "un motivo fuera de la lista se rechaza al reabrir",
  comoPersona(FELIPE, `${fixture()}${venderLibre("a", 50)}${cerrar()}${reabrir("item_a", "porque_si")}rollback;`),
  "reabrir_motivo_invalido"
);

error(
  "una venta pendiente no se «reabre»: no hay nada que deshacer",
  comoPersona(FELIPE, `${fixture()}${venderLibre("a", 50)}${reabrir("item_a")}rollback;`),
  "prenda_no_cerrada"
);

error(
  "una venta ya regularizada no se reabre",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}
select retail.regularizar_prenda(p.id, :'v1', 'ya_registrada') from retail.prendas_por_regularizar p where venta_item_id = :'item_a';
${reabrir("item_a")}rollback;`
  ),
  "prenda_no_cerrada"
);

exito(
  "tras reabrir, la prenda se regulariza como siempre (baja 1 del stock) y la devolución o el cambio ya no se bloquean",
  comoPersona(
    FELIPE,
    `${fixture()}select ${STOCK_V1} as antes \\gset
${venderLibre("a", 50)}${cerrar()}${reabrir("item_a")}
select retail.regularizar_prenda(p.id, :'v1', 'ya_registrada') from retail.prendas_por_regularizar p where venta_item_id = :'item_a';
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad) values (:'item_a', :'ubic', :'v1', 1);
select ${STOCK_V1} - :'antes', (select estado from retail.prendas_por_regularizar where venta_item_id = :'item_a');
rollback;`
  ),
  ([delta, estado]) => estado === "regularizada" && delta === "-1"
);

exito(
  "una reabierta que nadie identificó se puede volver a cerrar con otro cierre, sin quedar apuntando al primero",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}${reabrir("item_a")}
select cierre_id as primero from retail.prendas_por_regularizar where venta_item_id = :'item_a' \\gset
${cerrar("aun_no_cargada")}
select estado, cierre_id = :'cierre_id'::uuid, (select filas from retail.cierres_cola_arranque where id = :'cierre_id')
  from retail.prendas_por_regularizar where venta_item_id = :'item_a';
rollback;`
  ),
  ([estado, segundo, filas]) => estado === "cerrada_sin_prenda" && segundo === "t" && filas === "1"
);

exito(
  "reabrir no exige el plazo del cierre: una devolución puede llegar pasado el 15-oct",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre("a", 50)}${cerrar()}
update retail.cola_arranque_plazo set hasta = retail.fn_hoy_lima() - 30 where ubicacion_id = :'ubic';
${reabrir("item_a")}
select estado from retail.prendas_por_regularizar where venta_item_id = :'item_a';
rollback;`
  ),
  ([estado]) => estado === "pendiente"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const r = correr(caso.sql);
    let falla = null;
    if (caso.tipo === "error") {
      if (r.ok) falla = `se esperaba un error ("${caso.contiene}") y no hubo ninguno`;
      else if (!r.mensaje.includes(caso.contiene)) falla = `se esperaba "${caso.contiene}", salió:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    } else if (!r.ok) {
      falla = `se esperaba éxito, falló:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    } else if (!caso.verificar(r.salida.split("\n").pop().split("|"))) {
      falla = `valores inesperados: ${JSON.stringify(r.salida)}`;
    }
    if (falla) fallos++;
    console.log(falla ? `✗ ${caso.nombre}\n    ${falla}` : `✓ ${caso.nombre}`);
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
