#!/usr/bin/env node
/**
 * Pruebas de «partir el dinero de una factura por tienda» (ADR-0179, F2) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que la vista `compra_parte_por_tienda` reparta el dinero de una factura entre las tiendas a las que va su
 * mercadería y que la suma de las partes sea EXACTAMENTE lo facturado, aunque los números sean feos:
 *   · 24 unidades repartidas 12/12: 600 + 108 de IGV = 708 para cada tienda, y las dos suman 1,416.00;
 *   · una línea de costo 33.333 dividida 3/2/2, líneas de S/ 0.07, S/ 12.345, IGV que viene del papel con tolerancia
 *     (S/ 0.01 de más), boletas sin IGV, regalos de costo 0: en TODAS, subtotal, IGV y total de las partes suman la
 *     cabecera al centavo, ninguna parte sale negativa y ninguna tienda se aleja de su parte exacta en más de un centavo;
 *   · una factura de una sola tienda es una sola fila igual a la cabecera;
 *   · el resultado es el mismo en dos lecturas seguidas (los empates de centavos se rompen por id, no al azar);
 *   · la vista respeta los permisos de quien la lee: el líder ve todo; un comprador, solo las facturas que le abre
 *     `fn_compra_es_de_mis_tiendas`; sin fila, nada; `anon`, nada;
 *   · sobre TODAS las facturas del Postgres local con líneas, la suma de partes cuadra con `compras.total`;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que las demás suites de Compras: cada escenario en su transacción con ROLLBACK, las facturas se crean
 * DENTRO con la RPC real `registrar_compra`, y las migraciones se cargan dentro de cada escenario (re-pegables).
 *
 * USO   pnpm pruebas:compras-parte-por-tienda
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const leer = (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8");
// La vista ya está aplicada (20260923180100, junto con las demás de ADR-0179); se vuelve a cargar dentro de cada caso para
// probar SU texto aunque la base vaya atrás, y porque es re-pegable.
const M3 = leer("20260923180100_compra_parte_por_tienda.sql");
const PRELUDIO = M3;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba. El Postgres local lo
// usan ~20 sesiones a la vez y estas migraciones hacen DDL: un deadlock con otra sesión no es un fallo, se reintenta.
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

/** Abre la transacción, carga la vista y se pone como esa persona. Termina en ROLLBACK. */
const como = (authUserId, sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
set local request.jwt.claim.role = 'authenticated';
${sql}
rollback;
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\n";

const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/**
 * Crea una factura con la RPC real. `lineas` = [{ cant, costo, dest }] con `dest` = { lima: 3, trujillo: 2, taller: 2 }
 * (la suma de `dest` es `cant`). `igv` es el porcentaje; `total` (opcional) es el total que dice el papel.
 * Deja `:v` (la factura).
 */
function compra(v, { lineas, igv = 18, total = null, tipo = "factura" }) {
  const items = lineas
    .map((l, i) => {
      const dest = Object.entries(l.dest)
        .map(([ub, c]) => `jsonb_build_object('ubicacion_id', :'${ub}', 'cantidad', ${c})`)
        .join(", ");
      return `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'descripcion', 'L${i + 1}', 'cantidad', ${l.cant}, 'costo_unitario', ${l.costo}, 'destinos', jsonb_build_array(${dest}))`;
    })
    .join(", ");
  const destino = Object.keys(lineas[0].dest)[0];
  const extra = total === null ? "" : `, p_total => ${total}`;
  return `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${destino}',
  jsonb_build_array(${items}),
  p_tipo => '${tipo}', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => ${igv}${extra}) as ${v} \\gset
`;
}

/** Las filas de la vista para una factura, en orden estable. */
const PARTES = (v) => `retail.compra_parte_por_tienda where compra_id = :'${v}'`;

/** Cuántas de las facturas dadas NO cuadran (total, subtotal o IGV) o tienen una parte negativa. Debe dar 0. */
const DESCUADRES = (...vs) => `(select count(*) from (
  select c.id from retail.compras c join retail.compra_parte_por_tienda p on p.compra_id = c.id
  where c.id in (${vs.map((v) => `:'${v}'`).join(", ")})
  group by c.id, c.total, c.subtotal, c.igv
  having sum(p.total) <> c.total or sum(p.subtotal) <> c.subtotal or sum(p.igv) <> c.igv or min(p.subtotal) < 0 or min(p.igv) < 0 or min(p.total) < 0) x)`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. El caso de la conversación: 24 unidades, 12 y 12
// ===========================================================================

exito(
  "24 unidades a S/ 50 repartidas 12/12 (Trujillo y Taller): cada tienda 600.00 + 108.00 de IGV = 708.00, y juntas 1,416.00",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24, costo: 50, dest: { trujillo: 12, taller: 12 } }] })}select
  (select count(*) from ${PARTES("c1")}),
  (select count(*) from ${PARTES("c1")} and subtotal = 600.00 and igv = 108.00 and total = 708.00),
  (select sum(total) from ${PARTES("c1")}),
  (select total from retail.compras where id = :'c1');`
  ),
  ["2", "2", "1416.00", "1416.00"]
);

exito(
  "una factura de UNA sola tienda: una sola fila, igual a la cabecera",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24, costo: 50, dest: { lima: 24 } }] })}select
  count(*), min(subtotal), min(igv), min(total), min(unidades)
  from ${PARTES("c1")};`
  ),
  ["1", "1200.00", "216.00", "1416.00", "24"]
);

// ===========================================================================
// 2. Números feos: la suma de las partes es exactamente lo facturado
// ===========================================================================

exito(
  "costo 33.333 en 7 unidades repartidas 3/2/2: las tres partes suman la cabecera al centavo y ninguna se aleja de su parte exacta en más de 0.01",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 7, costo: 33.333, dest: { lima: 3, trujillo: 2, taller: 2 } }] })}select
  ${DESCUADRES("c1")},
  (select count(*) from ${PARTES("c1")}),
  (select max(abs(p.subtotal - (select subtotal from retail.compras where id = :'c1') * p.unidades / 7.0)) < 0.011 from retail.compra_parte_por_tienda p where p.compra_id = :'c1');`
  ),
  ["0", "3", "t"]
);

exito(
  "las líneas y la cabecera NO suman lo mismo (costos de 3 decimales: la línea guarda 2, la cabecera se calcula con 3): las partes suman la CABECERA, que es lo que se debe",
  como(
    FELIPE,
    `${BASE}${compra("c1", {
      lineas: [
        { cant: 7, costo: 33.333, dest: { lima: 3, trujillo: 2, taller: 2 } },
        { cant: 11, costo: 99.99, dest: { lima: 1, trujillo: 5, taller: 5 } },
        { cant: 3, costo: 1.005, dest: { lima: 1, trujillo: 1, taller: 1 } },
      ],
    })}select
  (select subtotal from retail.compras where id = :'c1'),
  (select sum(subtotal) from retail.compra_items where compra_id = :'c1'),
  (select sum(subtotal) from ${PARTES("c1")}),
  (select sum(total) from ${PARTES("c1")}) = (select total from retail.compras where id = :'c1'),
  ${DESCUADRES("c1")};`
  ),
  ["1336.24", "1336.23", "1336.24", "t", "0"]
);

exito(
  "más unidades, más plata: con el mismo costo, la tienda con 3 unidades nunca recibe menos que la de 2",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 7, costo: 33.333, dest: { lima: 3, trujillo: 2, taller: 2 } }] })}select
  (select min(total) from ${PARTES("c1")} and unidades = 3) >= (select max(total) from ${PARTES("c1")} and unidades = 2);`
  ),
  ["t"]
);

exito(
  "batería de facturas feas (costos de 0.07, 12.345, 33.333, 99.99, 1.005; 2 y 3 tiendas; 1 y 3 líneas): TODAS cuadran al centavo",
  como(
    FELIPE,
    `${BASE}${compra("f1", { lineas: [{ cant: 13, costo: 0.07, dest: { lima: 5, trujillo: 8 } }] })}${compra("f2", { lineas: [{ cant: 101, costo: 12.345, dest: { lima: 33, trujillo: 34, taller: 34 } }] })}${compra("f3", {
      lineas: [
        { cant: 7, costo: 33.333, dest: { lima: 3, trujillo: 2, taller: 2 } },
        { cant: 11, costo: 99.99, dest: { lima: 1, trujillo: 5, taller: 5 } },
        { cant: 3, costo: 1.005, dest: { lima: 1, trujillo: 1, taller: 1 } },
      ],
    })}${compra("f4", { lineas: [{ cant: 1000, costo: 0.333, dest: { lima: 333, trujillo: 333, taller: 334 } }] })}${compra("f5", {
      lineas: [
        { cant: 3, costo: 19.99, dest: { lima: 1, trujillo: 2 } },
        { cant: 5, costo: 7.777, dest: { lima: 4, taller: 1 } },
      ],
    })}${compra("f6", { lineas: [{ cant: 9, costo: 55.55, dest: { lima: 2, trujillo: 3, taller: 4 } }], igv: 10 })}select
  ${DESCUADRES("f1", "f2", "f3", "f4", "f5", "f6")},
  (select count(*) from retail.compra_parte_por_tienda where compra_id in (:'f1', :'f2', :'f3', :'f4', :'f5', :'f6'));`
  ),
  ["0", "17"]
);

exito(
  "el IGV que viene del PAPEL (total de S/ 1,416.01 en vez de 1,416.00): el IGV de la cabecera es 216.01 y las dos partes lo suman exacto",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24, costo: 50, dest: { trujillo: 12, taller: 12 } }], total: 1416.01 })}select
  (select igv from retail.compras where id = :'c1'),
  (select sum(igv) from ${PARTES("c1")}),
  (select sum(total) from ${PARTES("c1")}),
  ${DESCUADRES("c1")};`
  ),
  ["216.01", "216.01", "1416.01", "0"]
);

exito(
  "sin IGV (boleta): todas las partes con IGV 0.00 y el total de cada una es su subtotal",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 10, costo: 5.55, dest: { lima: 4, trujillo: 6 } }], igv: 0, tipo: "boleta" })}select
  count(*), sum(igv), bool_and(total = subtotal), ${DESCUADRES("c1")}
  from ${PARTES("c1")};`
  ),
  ["2", "0.00", "t", "0"]
);

exito(
  "un regalo de costo 0 junto a una línea con costo: las partes cuadran y la tienda que solo recibe el regalo queda en 0.00",
  como(
    FELIPE,
    `${BASE}${compra("c1", {
      lineas: [
        { cant: 10, costo: 20, dest: { lima: 10 } },
        { cant: 4, costo: 0, dest: { trujillo: 4 } },
      ],
    })}select
  ${DESCUADRES("c1")},
  (select total from ${PARTES("c1")} and ubicacion_id = :'trujillo'),
  (select total from ${PARTES("c1")} and ubicacion_id = :'lima');`
  ),
  ["0", "0.00", "236.00"]
);

exito(
  "una factura toda de costo 0 (regalo): las partes existen, valen 0.00 y cuadran",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 6, costo: 0, dest: { lima: 2, trujillo: 4 } }] })}select
  count(*), sum(total), ${DESCUADRES("c1")}
  from ${PARTES("c1")};`
  ),
  ["2", "0.00", "0"]
);

exito(
  "el resultado es el mismo en dos lecturas seguidas (los empates de centavos se rompen por id, no al azar)",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 7, costo: 33.333, dest: { lima: 3, trujillo: 2, taller: 2 } }] })}select md5(string_agg(ubicacion_id::text || total::text, ',' order by ubicacion_id)) as a from ${PARTES("c1")} \\gset
select md5(string_agg(ubicacion_id::text || total::text, ',' order by ubicacion_id)) = :'a' from ${PARTES("c1")};`
  ),
  ["t"]
);

exito(
  "las unidades de cada parte son las del reparto (compra_item_destinos)",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [{ cant: 24, costo: 50, dest: { lima: 5, trujillo: 7, taller: 12 } }] })}select
  (select unidades from ${PARTES("c1")} and ubicacion_id = :'lima'),
  (select unidades from ${PARTES("c1")} and ubicacion_id = :'trujillo'),
  (select unidades from ${PARTES("c1")} and ubicacion_id = :'taller');`
  ),
  ["5", "7", "12"]
);

// ===========================================================================
// 3. Quién puede leer la vista
// ===========================================================================

const ESCENA = `${BASE}${compra("c3", { lineas: [{ cant: 24, costo: 50, dest: { lima: 24 } }] })}${compra("c4", { lineas: [{ cant: 24, costo: 50, dest: { lima: 12, trujillo: 12 } }] })}`;
// ADR-0161 + ADR-0179: QUIÉN = un módulo de Compras en el rol (aquí, «integrante», el de Micaela); DÓNDE = su tienda
// (Trujillo) más las extra de compradores_de_tienda. Una factura se ve entera si la gestiona una tienda suya (la gestora es
// el destino de la primera línea en \`compra()\`: Lima, para c3 y c4).
const CON_MODULO = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'facturas_compra') on conflict do nothing;\n`;
const EXTRA = (...tiendas) => `${tiendas.map((t) => `select retail.agregar_comprador_de_tienda(:'micaela', :'${t}');`).join("\n")}\n`;
const COMO_MICAELA = `${cambiaA(MICAELA)}${COMO_AUTENTICADO}`;

exito(
  "líder: ve las partes de las dos facturas (1 + 2 filas)",
  como(FELIPE, `${ESCENA}${COMO_AUTENTICADO}select count(*) from retail.compra_parte_por_tienda where compra_id in (:'c3', :'c4');`),
  ["3"]
);

exito(
  "con el módulo y Lima como tienda extra: ve la parte de c3 y las DOS de c4 (la gestiona Lima, así que la ve entera)",
  como(
    FELIPE,
    `${ESCENA}${CON_MODULO}${EXTRA("lima")}${COMO_MICAELA}select
  (select count(*) from retail.compra_parte_por_tienda where compra_id = :'c3'),
  (select count(*) from retail.compra_parte_por_tienda where compra_id = :'c4');`
  ),
  ["1", "2"]
);

exito(
  "con el módulo y solo su tienda (Trujillo): no ve ninguna de las dos por la vista (su parte de c4 sale por fn_mis_partes_de_compras)",
  como(FELIPE, `${ESCENA}${CON_MODULO}${COMO_MICAELA}select count(*) from retail.compra_parte_por_tienda where compra_id in (:'c3', :'c4');`),
  ["0"]
);

exito(
  "integrante sin módulo de Compras, aunque tenga fila extra: no ve ninguna parte",
  como(FELIPE, `${ESCENA}${EXTRA("lima")}${COMO_MICAELA}select count(*) from retail.compra_parte_por_tienda where compra_id in (:'c3', :'c4');`),
  ["0"]
);

error(
  "anon no puede leer la vista",
  como(FELIPE, `set local role anon;\nselect count(*) from retail.compra_parte_por_tienda;`),
  "permission denied"
);

exito(
  "la vista es security_invoker (lee con los permisos de quien pregunta, no con los del dueño)",
  como(FELIPE, `select coalesce(reloptions::text, '') like '%security_invoker=true%' from pg_class where oid = 'retail.compra_parte_por_tienda'::regclass;`),
  ["t"]
);

// ===========================================================================
// 4. Sobre TODO lo que hay en la base, y la migración
// ===========================================================================

exito(
  "sobre TODAS las facturas del Postgres local que tienen líneas: la suma de partes cuadra con compras.total, .subtotal y .igv",
  como(
    FELIPE,
    `select count(*) from (
  select c.id from retail.compras c join retail.compra_parte_por_tienda p on p.compra_id = c.id
  group by c.id, c.total, c.subtotal, c.igv
  having sum(p.total) <> c.total or sum(p.subtotal) <> c.subtotal or sum(p.igv) <> c.igv) x;`
  ),
  ["0"]
);

exito(
  "la migración se puede pegar DOS veces sin romper nada",
  `begin;
${PRELUDIO}
${M3}
select count(*) from pg_views where schemaname = 'retail' and viewname = 'compra_parte_por_tienda';
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
