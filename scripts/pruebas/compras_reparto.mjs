#!/usr/bin/env node
/**
 * Pruebas del REPARTO de un comprobante entre tiendas (ADR-0139) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que una factura de proveedor se reparta entre tiendas y que cada tienda reciba lo suyo:
 *   · reparto 12/12 entre dos tiendas; una suma distinta de lo facturado se rechaza (por la RPC y por la
 *     base misma, aunque alguien escriba directo);
 *   · una tienda NO puede recibir más de lo suyo, ni comerse la parte de otra;
 *   · reasignar solo lo pendiente (con motivo, con rastro, solo un líder);
 *   · el faltante (cierre de línea) es de una tienda concreta y respeta el tope de esa tienda;
 *   · un integrante no ve la parte de otra tienda (RPC de lectura y RLS);
 *   · lo de siempre sigue igual: un comprobante de una sola tienda, la web vieja (4 argumentos, sin
 *     `destinos`) y la migración re-pegable;
 *   · el filtro «Destino» de Comprobantes y Por pagar (`p_ubicacion_id` en `listar_compras` y `por_pagar_tramos`,
 *     migración 20260921130000): solo trae los comprobantes con mercadería para esa tienda, los subtotales de Por pagar
 *     cuadran con la lista filtrada, sigue cerrado a quien no es líder y no deja dos firmas de cada función.
 *
 * CÓMO. Mismo patrón que `recibir_envio.mjs` y `dinero_compras_solo_lider.mjs`: cada escenario corre en su
 * propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres local que
 * comparten ~20 worktrees. Simula a Felipe (líder, cualquier sede) y a Micaela (integrante, fija a Tienda
 * Trujillo) con `set local request.jwt.claim.sub`, sin JWT real.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción las migraciones del reparto, así se
 * prueban SIN haberlas aplicado a la base compartida. Sin el flag asume que ya están aplicadas.
 *
 * DATOS. Del seed solo lo estable: los proveedores `Textiles Andina SAC` y `Confecciones del Sur EIRL`, las
 * ubicaciones `Taller`, `Tienda Trujillo` y `Tienda Lima`, y la variante `BLU-EMMA-NEG-M`. Los comprobantes
 * (serie `TST`) se crean DENTRO de la transacción con la RPC real `registrar_compra`.
 *
 * USO
 *   pnpm pruebas:compras-reparto            → migraciones ya aplicadas en el local
 *   pnpm pruebas:compras-reparto --en-seco  → las carga en cada escenario, sin aplicarlas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const EN_SECO = process.argv.includes("--en-seco");
const MIGRACIONES = [
  "20260919172000_reparto_compra_por_tienda.sql",
  "20260919173000_reparto_compra_retira_destino_de_cabecera.sql",
  "20260921130000_compras_filtro_por_tienda_destino.sql",
];
const leer = (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8");
const PRELUDIO = EN_SECO ? MIGRACIONES.map(leer).join("\n") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
// El Postgres local lo usan ~20 sesiones a la vez y las migraciones del reparto hacen DDL sobre `compras`:
// un deadlock con el trabajo de otra sesión no es un fallo del escenario, se reintenta.
function correr(sql) {
  let ultimo;
  for (let intento = 1; intento <= 4; intento++) {
    try {
      return { ok: true, salida: psql(sql).trim() };
    } catch (e) {
      ultimo = { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
      if (!/deadlock detected|lock timeout|could not obtain lock/i.test(ultimo.mensaje)) return ultimo;
      esperar(400 * intento);
    }
  }
  return ultimo;
}

const comoPersona = (authUserId, sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;

/** Proveedores, ubicaciones y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/**
 * Crea un comprobante a crédito con la RPC real. `lineas` = [{ cant, dest }] donde `dest` es un reparto
 * { trujillo: 12, taller: 12 } (sin `dest`, la línea va entera a `destino`, como la web de antes).
 * Deja `:v` (el comprobante) y `:v_l1`, `:v_l2`… (sus líneas, en el orden dado).
 */
function compra(v, { prov = "prov1", lineas = [{ cant: 24, dest: { taller: 24 } }], costo = 50, destino = "taller" } = {}) {
  const items = lineas
    .map((l, i) => {
      const partes = [`'producto_id', :'prod'`, `'variante_id', :'var'`, `'descripcion', 'L${i + 1}'`, `'cantidad', ${l.cant}`, `'costo_unitario', ${costo}`];
      if (l.dest) {
        const dest = Object.entries(l.dest)
          .map(([ub, c]) => `jsonb_build_object('ubicacion_id', :'${ub}', 'cantidad', ${c})`)
          .join(", ");
        partes.push(`'destinos', jsonb_build_array(${dest})`);
      }
      return `jsonb_build_object(${partes.join(", ")})`;
    })
    .join(", ");
  const ids = lineas
    .map((_, i) => `select id as ${v}_l${i + 1} from retail.compra_items where compra_id = :'${v}' and descripcion = 'L${i + 1}' \\gset`)
    .join("\n");
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${destino}',
  jsonb_build_array(${items}),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
${ids}
`;
}

/** Un comprobante de 24 repartido 12 a Trujillo y 12 al Taller: el caso de la conversación. */
const REPARTIDA = (v = "c1") => compra(v, { lineas: [{ cant: 24, dest: { trujillo: 12, taller: 12 } }] });

const ITEM = (linea, cantidad) => `jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad})`;
const LISTA = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const STOCK = (ubic) => `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'var' and ubicacion_id = :'${ubic}')`;
/** «asignado:recibido:cerrado:pendiente» de una tienda en una línea. */
const REP = (linea, ubic) =>
  `(select asignado || ':' || recibido || ':' || cerrado || ':' || pendiente from retail.compra_item_reparto_resumen where compra_item_id = :'${linea}' and ubicacion_id = :'${ubic}')`;
const RECIBIR = (ubic, linea, n) => `select retail.recibir_compras(:'${ubic}', ${LISTA(ITEM(linea, n))}, 'G-' || substr(gen_random_uuid()::text, 1, 6), null);\n`;
const TOKEN = "gen_random_uuid()";

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. EL REPARTO: 12/12 entre dos tiendas
// ===========================================================================

exito(
  "reparto 12/12 entre dos tiendas: la línea de 24 queda repartida y el comprobante lo dice",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select
  (select count(*) from retail.compra_item_destinos where compra_item_id = :'c1_l1'),
  ${REP("c1_l1", "trujillo")},
  ${REP("c1_l1", "taller")},
  (select sum(cantidad) from retail.compra_item_destinos where compra_item_id = :'c1_l1'),
  (select cardinality(ubicaciones_destino) from retail.compras_resumen where id = :'c1'),
  (select estado_recepcion from retail.compras where id = :'c1');
rollback;
`
  ),
  ["2", "12:0:0:12", "12:0:0:12", "24", "2", "sin_recibir"]
);

exito(
  "un comprobante de UNA tienda (la web de siempre, sin `destinos`) queda con un reparto de una sola tienda",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24 }], destino: "trujillo" })}
select
  (select count(*) from retail.compra_item_destinos where compra_item_id = :'c1_l1'),
  ${REP("c1_l1", "trujillo")},
  (select array_agg(ubicacion_id) = array[:'trujillo'::uuid] from retail.compra_item_destinos where compra_item_id = :'c1_l1');
rollback;
`
  ),
  ["1", "24:0:0:24", "t"]
);

error(
  "una suma distinta de lo facturado se rechaza: 12 + 8 de 24",
  comoPersona(FELIPE, `${BASE}${compra("c1", { lineas: [{ cant: 24, dest: { trujillo: 12, taller: 8 } }] })}`),
  "el reparto entre tiendas suma 20"
);

error(
  "una tienda repetida en el reparto se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}
select retail.registrar_compra(:'prov1', 'TST', 'DUP1', 'credito', :'taller',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', 50,
    'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'taller', 'cantidad', 10), jsonb_build_object('ubicacion_id', :'taller', 'cantidad', 14)))),
  p_fecha_vencimiento => retail.fn_hoy_lima() + 10);
`
  ),
  "aparece dos veces"
);

error(
  "una tienda que no existe en el reparto se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}
select retail.registrar_compra(:'prov1', 'TST', 'INEX1', 'credito', :'taller',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', 50,
    'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', gen_random_uuid(), 'cantidad', 24)))),
  p_fecha_vencimiento => retail.fn_hoy_lima() + 10);
`
  ),
  "no existe o está inactiva"
);

error(
  "la base misma rechaza un reparto que no suma, aunque se escriba directo (candado diferido)",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
update retail.compra_item_destinos set cantidad = 5 where compra_item_id = :'c1_l1' and ubicacion_id = :'taller';
set constraints all immediate;
`
  ),
  "tiene que sumar lo facturado"
);

error(
  "nadie escribe directo en el reparto: un usuario autenticado no puede insertar",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
set local role authenticated;
insert into retail.compra_item_destinos (compra_item_id, ubicacion_id, cantidad) values (:'c1_l1', :'lima', 1);
`
  ),
  "permission denied"
);

error(
  "nadie escribe directo en la bitácora de reasignaciones",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
set local role authenticated;
insert into retail.compra_reasignaciones (compra_item_id, desde_ubicacion_id, hacia_ubicacion_id, cantidad, motivo)
  values (:'c1_l1', :'taller', :'trujillo', 1, 'otro');
`
  ),
  "permission denied"
);

// ===========================================================================
// 2. RECIBIR: cada tienda recibe lo suyo, no más
// ===========================================================================

exito(
  "una tienda recibe lo suyo: Trujillo recibe sus 12 y el stock de Trujillo sube 12; a Taller le siguen faltando 12",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select ${STOCK("trujillo")} as antes \\gset
${RECIBIR("trujillo", "c1_l1", 12)}
select ${STOCK("trujillo")} - :antes,
  ${REP("c1_l1", "trujillo")},
  ${REP("c1_l1", "taller")},
  (select estado_recepcion from retail.compras where id = :'c1'),
  (select recibido_cantidad from retail.compras where id = :'c1');
rollback;
`
  ),
  ["12", "12:12:0:0", "12:0:0:12", "parcial", "12"]
);

error(
  "una tienda NO puede recibir más de lo suyo: Trujillo intenta 13 de sus 12",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}${RECIBIR("trujillo", "c1_l1", 13)}`),
  "le tocan 12"
);

exito(
  "una tienda no se come la parte de otra: Trujillo recibe sus 12 completos y Taller todavía puede recibir los suyos",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select ${STOCK("trujillo")} as antes_t, ${STOCK("taller")} as antes_k \\gset
${RECIBIR("trujillo", "c1_l1", 12)}
${RECIBIR("taller", "c1_l1", 12)}
select ${STOCK("trujillo")} - :antes_t, ${STOCK("taller")} - :antes_k,
  (select estado_recepcion from retail.compras where id = :'c1'),
  ${REP("c1_l1", "trujillo")}, ${REP("c1_l1", "taller")};
rollback;
`
  ),
  ["12", "12", "recibida", "12:12:0:0", "12:12:0:0"]
);

error(
  "recibir de a poco respeta el tope: 8 y 4 sí, un 1 más no",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}${RECIBIR("trujillo", "c1_l1", 8)}${RECIBIR("trujillo", "c1_l1", 4)}${RECIBIR("trujillo", "c1_l1", 1)}`),
  "ya recibió 12"
);

error(
  "una tienda sin reparto en la línea no puede recibirla, ni un líder: primero se reasigna",
  comoPersona(FELIPE, `${BASE}${compra("c1", { lineas: [{ cant: 24, dest: { taller: 24 } }] })}${RECIBIR("lima", "c1_l1", 1)}`),
  "no tiene mercadería asignada a Tienda Lima"
);

error(
  "un integrante solo recibe líneas con reparto para su sede (recibir_envio)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24, dest: { taller: 24 } }] })}
${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_l1", 5))}, p_token => ${TOKEN});
`
  ),
  "no tiene mercadería asignada a esta sede"
);

exito(
  "un integrante recibe SU parte: Micaela recibe los 12 de Trujillo y el comprobante queda parcial para el Taller",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select ${STOCK("trujillo")} as antes \\gset
${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_l1", 12))}, p_numero_guia => 'G-MIC', p_token => ${TOKEN}) as r \\gset
select ${STOCK("trujillo")} - :antes,
  ${REP("c1_l1", "trujillo")},
  ${REP("c1_l1", "taller")},
  (select estado_recepcion from retail.compras where id = :'c1');
rollback;
`
  ),
  ["12", "12:12:0:0", "12:0:0:12", "parcial"]
);

// ===========================================================================
// 3. REASIGNAR: solo lo pendiente, con motivo y con rastro
// ===========================================================================

exito(
  "reasignar 2 de Taller a Trujillo: Trujillo puede recibir 14, la suma sigue en 24 y queda la bitácora",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 2, 'llego_de_mas', 'llegaron 2 más a Trujillo');
${RECIBIR("trujillo", "c1_l1", 14)}
select ${REP("c1_l1", "trujillo")}, ${REP("c1_l1", "taller")},
  (select sum(cantidad) from retail.compra_item_destinos where compra_item_id = :'c1_l1'),
  (select motivo || ':' || cantidad from retail.compra_reasignaciones where compra_item_id = :'c1_l1');
rollback;
`
  ),
  ["14:14:0:0", "10:0:0:10", "24", "llego_de_mas:2"]
);

error(
  "no se reasigna lo ya recibido: Taller recibió 5 (le quedan 7) y se intentan mover 8",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}${RECIBIR("taller", "c1_l1", 5)}
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 8, 'error_de_tienda');
`
  ),
  "le quedan 7"
);

exito(
  "sí se reasigna lo que queda: Taller recibió 5 y se mueven sus 7 pendientes a Trujillo",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}${RECIBIR("taller", "c1_l1", 5)}
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 7, 'error_de_tienda');
select ${REP("c1_l1", "taller")}, ${REP("c1_l1", "trujillo")}, (select sum(cantidad) from retail.compra_item_destinos where compra_item_id = :'c1_l1');
rollback;
`
  ),
  ["5:5:0:0", "19:0:0:19", "24"]
);

exito(
  "reasignar TODO lo pendiente de una tienda la quita del reparto: queda una sola tienda",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 12, 'error_de_tienda');
select (select count(*) from retail.compra_item_destinos where compra_item_id = :'c1_l1'), ${REP("c1_l1", "trujillo")};
rollback;
`
  ),
  ["1", "24:0:0:24"]
);

error(
  "un integrante no puede reasignar",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
${cambiaA(MICAELA)}select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 2, 'llego_de_mas');
`
  ),
  "No tienes permiso"
);

error(
  "reasignar exige un motivo conocido",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 2, 'porque sí');`),
  "Motivo de reasignación no reconocido"
);

error(
  "reasignar exige dos tiendas distintas",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'taller', 2, 'otro');`),
  "dos tiendas distintas"
);

error(
  "no se reasigna un comprobante anulado",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.anular_compra(:'c1', 'prueba');
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 2, 'otro');
`
  ),
  "está anulado"
);

error(
  "la bitácora de reasignaciones no se edita",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 2, 'otro');
update retail.compra_reasignaciones set cantidad = 1 where compra_item_id = :'c1_l1';
`
  ),
  "no se editan ni se borran"
);

error(
  "una tienda no puede quedar con menos de lo que ya recibió, ni escribiendo directo (candado diferido)",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}${RECIBIR("trujillo", "c1_l1", 12)}
update retail.compra_item_destinos set cantidad = 5 where compra_item_id = :'c1_l1' and ubicacion_id = :'trujillo';
update retail.compra_item_destinos set cantidad = 19 where compra_item_id = :'c1_l1' and ubicacion_id = :'taller';
set constraints all immediate;
`
  ),
  "no se puede repartir menos de lo ya recibido o cerrado"
);

// ===========================================================================
// 4. CIERRES: el faltante es de una tienda
// ===========================================================================

exito(
  "cerrar un faltante es de una tienda: Trujillo cierra 4 y su pendiente baja; Taller no cambia",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.cerrar_linea_compra(:'c1_l1', 4, 'no_llego', null, :'trujillo');
select ${REP("c1_l1", "trujillo")}, ${REP("c1_l1", "taller")},
  (select u.nombre from retail.compra_item_cierres k join retail.ubicaciones u on u.id = k.ubicacion_id where k.compra_item_id = :'c1_l1');
rollback;
`
  ),
  ["12:0:4:8", "12:0:0:12", "Tienda Trujillo"]
);

error(
  "no se cierra más de lo pendiente de esa tienda: 13 de los 12 de Trujillo",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}select retail.cerrar_linea_compra(:'c1_l1', 13, 'no_llego', null, :'trujillo');`),
  "le quedan 12 unidades pendientes"
);

error(
  "recibir respeta lo cerrado en esa tienda: 12 − 4 cerrados = 8, y se intentan 9",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}select retail.cerrar_linea_compra(:'c1_l1', 4, 'no_llego', null, :'trujillo');${RECIBIR("trujillo", "c1_l1", 9)}`
  ),
  "cerró 4"
);

exito(
  "recibir 8 sí cabe cuando la tienda cerró 4: queda cerrada su parte (12 = 8 + 4)",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}select retail.cerrar_linea_compra(:'c1_l1', 4, 'no_llego', null, :'trujillo');
${RECIBIR("trujillo", "c1_l1", 8)}
select ${REP("c1_l1", "trujillo")}, ${REP("c1_l1", "taller")}, (select estado_recepcion from retail.compras where id = :'c1');
rollback;
`
  ),
  ["12:8:4:0", "12:0:0:12", "parcial"]
);

error(
  "en una línea repartida hay que decir en qué tienda se cierra el faltante",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}select retail.cerrar_linea_compra(:'c1_l1', 4, 'no_llego');`),
  "repartida entre 2 tiendas"
);

exito(
  "la web de antes sigue funcionando: cerrar con 3 argumentos una línea de UNA tienda la infiere",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24 }], destino: "trujillo" })}
select retail.cerrar_linea_compra(:'c1_l1', 4, 'no_llego');
select (select ubicacion_id = :'trujillo' from retail.compra_item_cierres where compra_item_id = :'c1_l1'), ${REP("c1_l1", "trujillo")};
rollback;
`
  ),
  ["t", "24:0:4:20"]
);

error(
  "un integrante solo cierra faltantes de SU tienda: Micaela no puede cerrar los del Taller",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
${cambiaA(MICAELA)}select retail.cerrar_linea_compra(:'c1_l1', 2, 'no_llego', null, :'taller');
`
  ),
  "No tienes permiso"
);

exito(
  "un integrante cierra el faltante de su tienda: Micaela cierra 4 de Trujillo",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
${cambiaA(MICAELA)}select retail.cerrar_linea_compra(:'c1_l1', 4, 'danada', null, :'trujillo');
select ${REP("c1_l1", "trujillo")};
rollback;
`
  ),
  ["12:0:4:8"]
);

exito(
  "recibir_envio: los cierres del envío quedan a nombre de la tienda que recibe",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_l1", 8))},
  p_cierres => jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_l1', 'cantidad', 4, 'motivo', 'no_llego')),
  p_token => ${TOKEN});
select ${REP("c1_l1", "trujillo")}, ${REP("c1_l1", "taller")},
  (select count(*) from retail.compra_item_cierres where compra_item_id = :'c1_l1' and ubicacion_id = :'trujillo');
rollback;
`
  ),
  ["12:8:4:0", "12:0:0:12", "1"]
);

// ===========================================================================
// 5. LECTURAS: un integrante no ve la parte de otra tienda
// ===========================================================================

exito(
  "lineas_compra_operativo: Micaela solo recibe la línea con reparto para su tienda y sin otras tiendas; el líder recibe ambas",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24, dest: { trujillo: 12, taller: 12 } }, { cant: 10, dest: { taller: 10 } }] })}
select count(*) as n_lider from retail.lineas_compra_operativo(array[:'c1']::uuid[], :'trujillo') \\gset
select jsonb_array_length(otras_tiendas) as otras_lider from retail.lineas_compra_operativo(array[:'c1']::uuid[], :'trujillo') where descripcion = 'L1' \\gset
${cambiaA(MICAELA)}
select :n_lider, :otras_lider, count(*), max(asignado_aqui), max(pendiente_aqui), bool_and(otras_tiendas is null), bool_and(descripcion = 'L1'), max(cantidad_facturada)
from retail.lineas_compra_operativo(array[:'c1']::uuid[]);
rollback;
`
  ),
  ["2", "1", "1", "12", "12", "t", "t", "24"]
);

exito(
  "listar_compras_operativo: Micaela solo ve el comprobante con algo para su tienda, y solo su parte; el líder ve los dos sin perspectiva y uno con ella",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA("c1")}${compra("c2", { lineas: [{ cant: 10, dest: { taller: 10 } }] })}
select count(*) as sin_persp from retail.listar_compras_operativo() where id in (:'c1'::uuid, :'c2'::uuid) \\gset
select count(*) as con_persp from retail.listar_compras_operativo(p_ubicacion_id => :'trujillo') where id in (:'c1'::uuid, :'c2'::uuid) \\gset
${cambiaA(MICAELA)}
select :sin_persp, :con_persp, count(*), max(cardinality(ubicaciones_destino)), max(asignado_aqui), max(pendiente_aqui), bool_and(id = :'c1'::uuid)
from retail.listar_compras_operativo() where id in (:'c1'::uuid, :'c2'::uuid);
rollback;
`
  ),
  ["2", "1", "1", "1", "12", "12", "t"]
);

exito(
  "«por recibir» es de cada tienda: cuando Trujillo recibió lo suyo deja de aparecer en su lista, y Taller lo sigue viendo",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}${RECIBIR("trujillo", "c1_l1", 12)}
select count(*) as en_trujillo from retail.listar_compras_operativo(p_por_recibir => true, p_ubicacion_id => :'trujillo') where id = :'c1'::uuid \\gset
select count(*) as en_taller from retail.listar_compras_operativo(p_por_recibir => true, p_ubicacion_id => :'taller') where id = :'c1'::uuid \\gset
select :en_trujillo, :en_taller;
rollback;
`
  ),
  ["0", "1"]
);

exito(
  "RLS: Micaela solo ve la fila del reparto de su tienda y solo los comprobantes con algo para ella",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA("c1")}${compra("c2", { lineas: [{ cant: 10, dest: { taller: 10 } }] })}
select count(*) as filas_lider from retail.compra_item_destinos where compra_item_id = :'c1_l1' \\gset
${cambiaA(MICAELA)}
select retail.fn_puede_ver_compra(:'c1') as ve_c1, retail.fn_puede_ver_compra(:'c2') as ve_c2 \\gset
set local role authenticated;
select :filas_lider, count(*), :'ve_c1', :'ve_c2' from retail.compra_item_destinos where compra_item_id = :'c1_l1';
rollback;
`
  ),
  ["2", "1", "t", "f"]
);

// ===========================================================================
// 5b. PARTE 2: la cabecera se retira y «Recibidas» pasa a ser por tienda
// ===========================================================================

exito(
  "la cabecera ya no tiene destino: la columna desapareció de compras y de compras_resumen",
  comoPersona(
    FELIPE,
    `select
  (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id'),
  (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'compras_resumen' and column_name = 'ubicacion_destino_id'),
  (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'compras_resumen' and column_name = 'ubicaciones_destino');
rollback;
`
  ),
  ["0", "0", "1"]
);

exito(
  "las 10 funciones que leían el destino de la factura siguen ejecutando sin error para un líder (nadie quedó apuntando a la columna)",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}${RECIBIR("trujillo", "c1_l1", 5)}
select count(*) from retail.resumen_compras();
select count(*) from retail.resumen_compras_extra();
select count(*) from retail.deuda_por_vencimiento();
select count(*) from retail.salidas_caja_30d();
select count(*) from retail.por_pagar_tramos();
select count(*) from retail.resumen_recepciones();
select count(*) from retail.listar_recepciones_compras();
select count(*) from retail.fn_proveedores();
select count(*) from retail.fn_proveedor_metricas_compras(:'prov1');
select count(*) from retail.fn_proveedor_costo_evolucion(:'prov1');
select 'ok';
rollback;
`
  ),
  ["ok"]
);

exito(
  "listar_compras (líder) sigue funcionando sobre la vista nueva y trae las tiendas del reparto",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select cardinality(ubicaciones_destino) from retail.listar_compras(p_limite => 200) where id = :'c1';
rollback;
`
  ),
  ["2"]
);

error(
  "el candado de dinero sigue en pie tras el re-llaveo: un integrante no puede pedir el resumen de Compras",
  comoPersona(FELIPE, `${cambiaA(MICAELA)}select * from retail.resumen_compras();`),
  "Solo un líder puede ver"
);

exito(
  "«Recibidas» es por tienda: Micaela solo suma lo recibido en Trujillo y solo le falta lo de Trujillo",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
${cambiaA(MICAELA)}select unidades_recibidas as u0, faltante_unidades as f0 from retail.resumen_recepciones() \\gset
${cambiaA(FELIPE)}${RECIBIR("taller", "c1_l1", 12)}
${cambiaA(MICAELA)}select unidades_recibidas as u1, faltante_unidades as f1 from retail.resumen_recepciones() \\gset
${cambiaA(FELIPE)}${RECIBIR("trujillo", "c1_l1", 12)}
${cambiaA(MICAELA)}select unidades_recibidas as u2, faltante_unidades as f2 from retail.resumen_recepciones() \\gset
select :u1 - :u0, :f1 - :f0, :u2 - :u1, :f2 - :f1;
rollback;
`
  ),
  ["0", "12", "12", "-12"]
);

exito(
  "el listado de «Recibidas»: el líder ve los dos lotes del comprobante repartido; Micaela solo el de su tienda, con lo asignado a ella",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}${RECIBIR("taller", "c1_l1", 12)}${RECIBIR("trujillo", "c1_l1", 12)}
select count(*) as lotes_lider from retail.listar_recepciones_compras(p_limite => 200) where compra_id = :'c1' \\gset
select max(unidades_facturadas) as fact_lider from retail.listar_recepciones_compras(p_limite => 200) where compra_id = :'c1' \\gset
${cambiaA(MICAELA)}
select :lotes_lider, :fact_lider, count(*), max(unidades_facturadas), max(faltante), max(ubicacion_nombre)
from retail.listar_recepciones_compras(p_limite => 200) where compra_id = :'c1';
rollback;
`
  ),
  ["2", "24", "1", "12", "0", "Tienda Trujillo"]
);

// ===========================================================================
// 6. LO DE SIEMPRE Y LA MIGRACIÓN
// ===========================================================================

error(
  "anular sigue negándose si una tienda ya recibió mercadería",
  comoPersona(FELIPE, `${BASE}${REPARTIDA()}${RECIBIR("trujillo", "c1_l1", 3)}select retail.anular_compra(:'c1', 'prueba');`),
  "ya tiene mercadería recibida"
);

exito(
  "un comprobante repartido sin recepciones sí se anula",
  comoPersona(
    FELIPE,
    `${BASE}${REPARTIDA()}
select retail.anular_compra(:'c1', 'prueba');
select estado from retail.compras where id = :'c1';
rollback;
`
  ),
  ["anulada"]
);

exito(
  "el relleno dejó a TODA línea existente con un reparto que suma lo facturado y a todo cierre con su tienda",
  comoPersona(
    FELIPE,
    `select
  (select count(*) from retail.compra_items i where i.cantidad <> coalesce((select sum(d.cantidad) from retail.compra_item_destinos d where d.compra_item_id = i.id), 0)),
  (select count(*) from retail.compra_item_cierres where ubicacion_id is null);
rollback;
`
  ),
  ["0", "0"]
);

if (EN_SECO) {
  // Sin PRELUDIO: este escenario arma su propia secuencia. Cada parte se pega dos veces, en su orden.
  const [M1, M2] = MIGRACIONES.map(leer);
  exito(
    "las migraciones son re-pegables: cada una corrida dos veces, en su orden, no rompe ni cambia el reparto",
    `
begin;
${M1}
${M1}
set local request.jwt.claim.sub = '${FELIPE}';
${BASE}${REPARTIDA()}
set constraints all immediate;
select count(*) as antes from retail.compra_item_destinos \\gset
${M2}
${M2}
select (select count(*) from retail.compra_item_destinos) - :antes,
  (select count(*) from retail.compra_item_destinos where compra_item_id = :'c1_l1'),
  (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id');
rollback;
`,
    ["0", "2", "0"]
  );
}


// ===========================================================================
// 9. FILTRO «DESTINO» en Comprobantes y Por pagar (migración 20260921130000)
// ===========================================================================
// Tres comprobantes de importes distintos para que cada tienda tenga una suma propia y comprobable:
//   c1 = 24 u. a S/ 50 repartidas 12 Trujillo + 12 Taller → S/ 1 416.00 con IGV
//   c2 = 10 u. a S/ 50, todo a Trujillo (proveedor 2)     → S/   590.00
//   c3 =  5 u. a S/ 50, todo al Taller                    → S/   295.00
const TRES_DESTINOS = `${compra("c1", { lineas: [{ cant: 24, dest: { trujillo: 12, taller: 12 } }] })}${compra("c2", { prov: "prov2", lineas: [{ cant: 10, dest: { trujillo: 10 } }] })}${compra("c3", { lineas: [{ cant: 5, dest: { taller: 5 } }] })}`;
const SOLO_MIOS = `id in (:'c1', :'c2', :'c3')`;
const LISTA_DE = (ub, extra = "") => `select count(*) filter (where id = :'c1'), count(*) filter (where id = :'c2'), count(*) filter (where id = :'c3') from retail.listar_compras(p_limite => 200, p_ubicacion_id => ${ub}${extra});`;

exito(
  "filtro «Destino» = Trujillo: la lista trae los comprobantes con algo para Trujillo (el repartido y el de Trujillo) y no el del Taller",
  comoPersona(FELIPE, `${BASE}${TRES_DESTINOS}\n${LISTA_DE(":'trujillo'")}\nrollback;\n`),
  ["1", "1", "0"]
);

exito(
  "filtro «Destino» = Taller: el repartido y el del Taller, no el de Trujillo",
  comoPersona(FELIPE, `${BASE}${TRES_DESTINOS}\n${LISTA_DE(":'taller'")}\nrollback;\n`),
  ["1", "0", "1"]
);

exito(
  "sin tienda (null) la lista es la de siempre: trae los tres",
  comoPersona(
    FELIPE,
    `${BASE}${TRES_DESTINOS}
select count(*) filter (where ${SOLO_MIOS}) from retail.listar_compras(p_limite => 200);
select count(*) filter (where ${SOLO_MIOS}) from retail.listar_compras(p_limite => 200, p_ubicacion_id => null);
rollback;
`
  ),
  ["3"]
);

exito(
  "una tienda sin ninguno de estos comprobantes (Tienda Lima) o una que no existe: no trae ninguno",
  comoPersona(
    FELIPE,
    `${BASE}${TRES_DESTINOS}
select count(*) filter (where ${SOLO_MIOS}) as en_lima from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'lima') \\gset
select :en_lima, count(*) filter (where ${SOLO_MIOS}) from retail.listar_compras(p_limite => 200, p_ubicacion_id => gen_random_uuid());
rollback;
`
  ),
  ["0", "0"]
);

exito(
  "el filtro se combina con los demás: Trujillo + proveedor 2 deja solo c2; Taller + con saldo + orden por vencimiento (la otra rama) deja c1 y c3",
  comoPersona(
    FELIPE,
    `${BASE}${TRES_DESTINOS}
select
  (select count(*) from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'trujillo', p_proveedor_id => :'prov2') where id = :'c1'),
  (select count(*) from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'trujillo', p_proveedor_id => :'prov2') where id = :'c2'),
  (select count(*) from retail.listar_compras(p_limite => 200, p_orden => 'vencimiento', p_con_saldo => true, p_ubicacion_id => :'taller') where id = :'c1'),
  (select count(*) from retail.listar_compras(p_limite => 200, p_orden => 'vencimiento', p_con_saldo => true, p_ubicacion_id => :'taller') where id = :'c2'),
  (select count(*) from retail.listar_compras(p_limite => 200, p_orden => 'vencimiento', p_con_saldo => true, p_ubicacion_id => :'taller') where id = :'c3');
rollback;
`
  ),
  ["0", "1", "1", "0", "1"]
);

exito(
  "el filtro sigue al reparto: si se reasigna TODA la parte del Taller a Trujillo, c1 deja de aparecer bajo «Taller» (c3 sigue) y queda entero bajo «Trujillo»",
  comoPersona(
    FELIPE,
    `${BASE}${TRES_DESTINOS}
select count(*) filter (where id = :'c1') as antes from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'taller') \\gset
select retail.reasignar_reparto_compra(:'c1_l1', :'taller', :'trujillo', 12, 'otro', 'prueba del filtro');
select :antes,
  (select count(*) from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'taller') where id = :'c1'),
  (select count(*) from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'taller') where id = :'c3'),
  (select count(*) from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'trujillo') where id = :'c1');
rollback;
`
  ),
  ["1", "0", "1", "1"]
);

exito(
  "los subtotales de Por pagar cuadran con la lista filtrada y suman lo que se espera: Trujillo = c1 + c2, Taller = c1 + c3, sin filtro = los tres",
  comoPersona(
    FELIPE,
    `${BASE}
select coalesce(sum(saldo), 0) as t0 from retail.por_pagar_tramos(p_ubicacion_id => :'trujillo') \\gset
select coalesce(sum(saldo), 0) as k0 from retail.por_pagar_tramos(p_ubicacion_id => :'taller') \\gset
select coalesce(sum(saldo), 0) as n0 from retail.por_pagar_tramos() \\gset
${TRES_DESTINOS}
select coalesce(sum(saldo), 0) as t1 from retail.por_pagar_tramos(p_ubicacion_id => :'trujillo') \\gset
select coalesce(sum(saldo), 0) as k1 from retail.por_pagar_tramos(p_ubicacion_id => :'taller') \\gset
select coalesce(sum(saldo), 0) as n1 from retail.por_pagar_tramos() \\gset
select :t1 - :t0, :k1 - :k0, :n1 - :n0,
  (select coalesce(sum(comprobantes), 0) from retail.por_pagar_tramos(p_ubicacion_id => :'trujillo'))
    = (select count(*) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_ubicacion_id => :'trujillo')),
  (select coalesce(sum(saldo), 0) from retail.por_pagar_tramos(p_ubicacion_id => :'trujillo'))
    = (select coalesce(sum(saldo), 0) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_ubicacion_id => :'trujillo'));
rollback;
`
  ),
  ["2006.00", "1711.00", "2301.00", "t", "t"]
);

error(
  "el candado de dinero sigue: un integrante no puede pedir los subtotales de Por pagar ni con la tienda puesta",
  comoPersona(FELIPE, `${BASE}${cambiaA(MICAELA)}select * from retail.por_pagar_tramos(p_ubicacion_id => :'trujillo');`),
  "Solo un líder puede ver"
);

exito(
  "un integrante (con la seguridad por fila puesta) no ve NINGUNO de los comprobantes por la lista de líder, aunque pida su tienda",
  comoPersona(
    FELIPE,
    `${BASE}${TRES_DESTINOS}
${cambiaA(MICAELA)}set local role authenticated;
select count(*) filter (where ${SOLO_MIOS}) from retail.listar_compras(p_limite => 200, p_ubicacion_id => :'trujillo');
rollback;
`
  ),
  ["0"]
);

exito(
  "las dos funciones quedaron con UNA sola firma (sin sobrecargas), cerradas a anon y abiertas a authenticated",
  comoPersona(
    FELIPE,
    `select
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'listar_compras'),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'por_pagar_tramos'),
  bool_or(has_function_privilege('anon', p.oid, 'execute')),
  bool_and(has_function_privilege('authenticated', p.oid, 'execute')),
  bool_and(p.proname <> 'por_pagar_tramos' or pg_get_functiondef(p.oid) like '%fn_exige_dinero_de_compras%')
from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('listar_compras', 'por_pagar_tramos');
`
  ),
  ["1", "1", "f", "t", "t"]
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) {
    // Las dos migraciones van EN ORDEN y la 173000 elimina la columna que la 172000 rellena: con el reparto ya aplicado,
    // cargar la 172000 otra vez falla (y revierte, sin daño). `--en-seco` solo sirve ANTES de aplicarlas.
    const aplicado = correr(
      "select to_regclass('retail.compra_item_destinos') is not null and not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id');"
    );
    if (aplicado.ok && aplicado.salida.trim() === "t") {
      console.error(
        "El reparto por tienda YA está aplicado en esta base (compras ya no tiene ubicacion_destino_id): --en-seco solo sirve antes de aplicarlo.\nCorre la suite sin el flag:  pnpm pruebas:compras-reparto"
      );
      process.exit(2);
    }
    console.log("Modo --en-seco: las migraciones del reparto se cargan dentro de cada escenario (no se aplican a la base).\n");
  }

  if (!EN_SECO) {
    const filtro = correr("select to_regprocedure('retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid)') is not null;");
    if (filtro.ok && filtro.salida.trim() === "f") {
      console.error("Falta aplicar la migración del filtro «Destino» (20260921130000_compras_filtro_por_tienda_destino.sql) en esta base: las pruebas de la sección 9 no pueden correr.");
      process.exit(2);
    }
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
