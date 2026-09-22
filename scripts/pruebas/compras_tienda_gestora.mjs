#!/usr/bin/env node
/**
 * Pruebas de la tienda gestora de una factura (ADR-0151, F3) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un comprador de tienda pueda registrar, anular y adjuntar sobre las facturas que SU tienda
 * gestiona, y de ninguna otra manera:
 *   · un comprador registra con SU tienda como gestora, y esa tienda tiene que estar en el reparto (si no está,
 *     se rechaza: registrar así sería registrar deuda de otra tienda);
 *   · un comprador registra SIN pago (pagar es F4); el líder sigue registrando con o sin pago, como siempre;
 *   · un comprador sin permiso de ninguna tienda no registra nada;
 *   · anular y adjuntar: los hace el comprador de la tienda GESTORA, no el de otra tienda con parte en la factura;
 *   · la gestora ve la factura ENTERA aunque traiga mercadería para otras tiendas (la edita y la anula);
 *   · solo el líder cambia la tienda gestora, y la nueva tiene que tener parte en el reparto;
 *   · el candado de «la gestora tiene parte» también protege escribiendo directo en la base (reasignar TODO el
 *     reparto de la gestora sin cambiarla antes se rechaza);
 *   · las facturas ya existentes (antes de esta migración) quedan con una gestora consistente;
 *   · las funciones parchadas quedan con una sola firma (nunca una sobrecarga);
 *   · las migraciones se pueden pegar dos veces.
 *
 * CÓMO. Mismo patrón que las demás suites de Compras: cada escenario en su transacción con ROLLBACK, las facturas
 * se crean DENTRO con la RPC real, y las cuatro migraciones se cargan dentro de cada escenario (re-pegables).
 *
 * USO   pnpm pruebas:compras-tienda-gestora
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
const M1 = leer("20260922120000_compras_compradores_de_tienda.sql");
const M2 = leer("20260922130000_compras_dinero_por_tienda_lectura.sql");
const M3 = leer("20260922150000_compra_parte_por_tienda.sql");
const M4 = leer("20260922160000_compras_tienda_gestora.sql");
const PRELUDIO = `${M1}\n${M2}\n${M3}\n${M4}`;

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

/** Abre la transacción, carga las cuatro migraciones y se pone como esa persona. Termina en ROLLBACK. */
const comoLider = (sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${FELIPE}';
${sql}
rollback;
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\nset local request.jwt.claim.role = 'authenticated';\n";
const COMO_POSTGRES = "reset role;\n";
const COMO_MICAELA = `${cambiaA(MICAELA)}${COMO_AUTENTICADO}`;

const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

const COMPRADORA_DE = (...tiendas) => `${tiendas.map((t) => `select retail.agregar_comprador_de_tienda(:'micaela', :'${t}');`).join("\n")}\n`;

/**
 * Registra una factura con la RPC real. `gestora` es el 5º parámetro (p_ubicacion_destino_id). `dest` es el reparto,
 * p.ej. { lima: 10 } o { lima: 6, trujillo: 4 }. `pago` (opcional) es { monto, metodo }. Deja `:v`.
 */
function compra(v, { gestora, dest, condicion = "credito", pago = null, tipo = "factura", igv = 18 }) {
  const destinos = Object.entries(dest)
    .map(([ub, c]) => `jsonb_build_object('ubicacion_id', :'${ub}', 'cantidad', ${c})`)
    .join(", ");
  const total = Object.values(dest).reduce((a, b) => a + b, 0);
  const pagoArg = pago ? `, p_pago => jsonb_build_object('monto', ${pago.monto}, 'metodo', '${pago.metodo}')` : "";
  return `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), '${condicion}', :'${gestora}',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${total}, 'costo_unitario', 20, 'destinos', jsonb_build_array(${destinos}))),
  p_tipo => '${tipo}', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => ${igv}${pagoArg}) as ${v} \\gset
`;
}

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. Registrar: la gestora es del comprador y tiene que tener parte
// ===========================================================================

exito(
  "comprador de Lima registra con Lima como gestora, sin pago: queda vigente con esa gestora",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}select estado, ubicacion_gestion_id = :'lima', pagado from retail.compras where id = :'f1';`
  ),
  ["vigente", "t", "0.00"]
);

error(
  "comprador de Lima NO puede registrar con Lima como gestora si Lima no tiene parte en el reparto (evita deuda de otra tienda)",
  comoLider(`${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { trujillo: 10 } })}`),
  "La tienda que gestiona la factura tiene que recibir parte de la mercadería"
);

error(
  "comprador de Lima NO puede registrar con OTRA tienda como gestora, aunque tenga parte (la gestora tiene que ser SU tienda)",
  comoLider(`${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "trujillo", dest: { lima: 5, trujillo: 5 } })}`),
  "No tienes permiso para registrar compras"
);

error(
  "un integrante sin fila de comprador no registra nada",
  comoLider(`${BASE}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}`),
  "No tienes permiso para registrar compras"
);

error(
  "un comprador NO puede registrar CON pago: pagar es de F4",
  comoLider(`${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 10 }, condicion: "contado", pago: { monto: 236, metodo: "transferencia" } })}`),
  "Un comprador de tienda registra la factura sin pago"
);

exito(
  "el líder sigue registrando CON pago, como siempre",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 10 }, condicion: "contado", pago: { monto: 236, metodo: "transferencia" } })}select pagado, estado from retail.compras where id = :'f1';`),
  ["236.00", "vigente"]
);

exito(
  "el líder registra sin comprador de tienda, sin pago, con cualquier tienda gestora",
  comoLider(`${BASE}${compra("f1", { gestora: "trujillo", dest: { lima: 5, trujillo: 5 } })}select ubicacion_gestion_id = :'trujillo' from retail.compras where id = :'f1';`),
  ["t"]
);

exito(
  "comprador de Lima Y Trujillo: puede registrar con cualquiera de las dos como gestora",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima", "trujillo")}${COMO_MICAELA}${compra("f1", { gestora: "trujillo", dest: { lima: 5, trujillo: 5 } })}select ubicacion_gestion_id = :'trujillo' from retail.compras where id = :'f1';`
  ),
  ["t"]
);

// ===========================================================================
// 2. Anular y adjuntar: solo el líder o el comprador de la GESTORA
// ===========================================================================

exito(
  "el comprador gestor anula su propia factura",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}select retail.anular_compra(:'f1', 'prueba');
select estado from retail.compras where id = :'f1';`
  ),
  ["anulada"]
);

error(
  "el comprador de OTRA tienda (con parte en la factura, pero no gestora) NO puede anularla",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${cambiaA(FELIPE)}${compra("f1", { gestora: "trujillo", dest: { lima: 5, trujillo: 5 } })}${COMO_MICAELA}select retail.anular_compra(:'f1', 'prueba');`
  ),
  "No tienes permiso para anular compras"
);

exito(
  "el comprador gestor adjunta un escaneo a su factura",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}select retail.registrar_adjunto_compra(:'f1', :'f1' || '/x.pdf', 'x.pdf', 'application/pdf', 100) as adj \\gset
select count(*) from retail.compra_adjuntos where id = :'adj';`
  ),
  ["1"]
);

error(
  "el comprador de OTRA tienda (no gestora) no puede adjuntar",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${cambiaA(FELIPE)}${compra("f1", { gestora: "trujillo", dest: { lima: 5, trujillo: 5 } })}${COMO_MICAELA}select retail.registrar_adjunto_compra(:'f1', :'f1' || '/x.pdf', 'x.pdf', 'application/pdf', 100);`
  ),
  "No tienes permiso para adjuntar documentos"
);

exito(
  "el líder puede anular y adjuntar cualquier factura, sea quien sea la gestora",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}${cambiaA(FELIPE)}select retail.registrar_adjunto_compra(:'f1', :'f1' || '/x.pdf', 'x.pdf', 'application/pdf', 100) as adj \\gset
select retail.anular_compra(:'f1', 'prueba');
select (select count(*) from retail.compra_adjuntos where id = :'adj'), (select estado from retail.compras where id = :'f1');`
  ),
  ["1", "anulada"]
);

error(
  "el comprador de OTRA tienda (no gestora, aunque tenga parte) NO puede archivar un adjunto de esa factura",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${cambiaA(FELIPE)}${compra("f1", { gestora: "trujillo", dest: { lima: 5, trujillo: 5 } })}select retail.registrar_adjunto_compra(:'f1', :'f1' || '/x.pdf', 'x.pdf', 'application/pdf', 100) as adj \\gset
${COMO_MICAELA}select retail.archivar_adjunto_compra(:'adj');`
  ),
  "No tienes permiso para quitar adjuntos"
);

// ===========================================================================
// 3. La gestora ve la factura entera
// ===========================================================================

exito(
  "el comprador gestor ve la factura entera aunque traiga mercadería para otra tienda que no es suya",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}${compra("f1", { gestora: "lima", dest: { lima: 6, trujillo: 4 } })}select
  (select count(*) from retail.compras where id = :'f1'),
  (select count(*) from retail.compra_items where compra_id = :'f1'),
  (select count(*) from retail.compra_item_destinos d join retail.compra_items i on i.id = d.compra_item_id where i.compra_id = :'f1');`
  ),
  ["1", "1", "2"]
);

exito(
  "el comprador de la OTRA tienda con parte (no gestora) sigue sin ver la factura (hasta F3-b, la vista de su parte)",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima", "trujillo")}${cambiaA(FELIPE)}${compra("f1", { gestora: "lima", dest: { lima: 6, trujillo: 4 } })}${COMO_MICAELA}select count(*) from retail.compras where id = :'f1';`
  ),
  ["1"]
);

// ===========================================================================
// 4. Cambiar la tienda gestora: solo el líder
// ===========================================================================

exito(
  "el líder cambia la gestora a otra tienda que tiene parte",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 6, trujillo: 4 } })}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');
select ubicacion_gestion_id = :'trujillo' from retail.compras where id = :'f1';`
  ),
  ["t"]
);

error(
  "el líder NO puede poner como gestora una tienda sin parte en el reparto",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');`),
  "La tienda que gestiona la factura tiene que recibir parte"
);

error(
  "un comprador (no líder) no puede cambiar la tienda gestora",
  comoLider(
    `${BASE}${COMPRADORA_DE("lima")}${cambiaA(FELIPE)}${compra("f1", { gestora: "lima", dest: { lima: 10 } })}${COMO_MICAELA}select retail.cambiar_tienda_gestora_compra(:'f1', :'lima');`
  ),
  "Solo un líder puede cambiar la tienda que gestiona una factura"
);

// ===========================================================================
// 5. El candado también protege escribiendo directo en la base
// ===========================================================================

error(
  "quitar TODO el reparto de la tienda gestora se rechaza (dejaría a la gestora sin parte), aunque se escriba directo — el candado es diferido, se fuerza antes del rollback",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 6, trujillo: 4 } })}delete from retail.compra_item_destinos where compra_item_id = (select id from retail.compra_items where compra_id = :'f1') and ubicacion_id = :'lima';
set constraints all immediate;`
  ),
  "La tienda que gestiona la factura tiene que conservar parte"
);

exito(
  "reasignar TODO lo pendiente de la gestora a otra tienda SÍ funciona si antes se cambia la gestora (el orden correcto)",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 6, trujillo: 4 } })}select id as l1 from retail.compra_items where compra_id = :'f1' \\gset
select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');
select retail.reasignar_reparto_compra(:'l1', :'lima', :'trujillo', 6, 'error_de_tienda');
select ubicacion_gestion_id = :'trujillo' from retail.compras where id = :'f1';`
  ),
  ["t"]
);

// ===========================================================================
// 6. Facturas ya existentes y sanidad de la migración
// ===========================================================================

exito(
  "toda factura vigente con reparto queda con una gestora que tiene parte en él (rellenado por la migración)",
  comoLider(
    `select count(*) from retail.compras c
  where c.estado = 'vigente'
    and exists (select 1 from retail.compra_items i where i.compra_id = c.id)
    and (
      c.ubicacion_gestion_id is null
      or not exists (
        select 1 from retail.compra_items i join retail.compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = c.id and d.ubicacion_id = c.ubicacion_gestion_id
      )
    );`
  ),
  ["0"]
);

exito(
  "ninguna función parchada quedó con dos firmas vivas",
  comoLider(
    `select count(*) from (
  select proname from pg_proc where pronamespace = 'retail'::regnamespace
    and proname in ('registrar_compra', 'anular_compra', 'registrar_adjunto_compra', 'archivar_adjunto_compra')
  group by proname having count(*) > 1) x;`
  ),
  ["0"]
);

exito(
  "las cuatro migraciones se pueden pegar DOS veces sin romper nada",
  `begin;
${PRELUDIO}
${M4}
select (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra'),
       (select count(*) from pg_constraint where conname = 'compras_gestora_obligatoria');
rollback;`,
  ["1", "1"]
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
