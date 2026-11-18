#!/usr/bin/env node
/**
 * Pruebas del motivo de la venta sin registrar (20261106233000) contra el Postgres local — CAYLA V2.
 *
 * Vender pide «¿por qué la anotas a mano?» antes de agregar una «Prenda sin registrar» al ticket. `registrar_venta` guarda ese motivo
 * en `prendas_por_regularizar.motivo` (y, con «otro», el texto en `motivo_detalle`). Estas pruebas cuidan que se guarde tal cual, que
 * un motivo raro o ausente NUNCA tumbe la venta (queda null), que el detalle solo viva con «otro» y no pase de 120 letras, y que la
 * tabla rechace un motivo fuera de la lista si alguien lo escribe por otro camino.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y vuelve a pegar la migración adentro (es idempotente: en el CI, donde ya
 * está, no cambia nada; en una base local atrasada, la prueba la trae y la deshace). Simula a Felipe (líder) con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:prenda-sin-registrar-motivo    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const MIGRACION = readFileSync("supabase/migrations/20261106233000_motivo_de_la_venta_sin_registrar.sql", "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Abre la transacción, trae la migración (idempotente) y se pone en la piel de Felipe. */
const comoFelipe = (sqlDespues) => `
begin;
${MIGRACION}
reset role;
set local request.jwt.claim.sub = '${FELIPE}';
${sqlDespues}
`;

/** Una caja abierta en Tienda Lima y una venta con UNA línea sin registrar; `extra` se mezcla en esa línea. Deja :fila. */
function venta(extra = {}) {
  const pares = Object.entries(extra)
    .map(([k, v]) => `, '${k}', ${v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`}`)
    .join("");
  return `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', 50,
    'descuento_unitario', 0, 'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat',
    'talla_id', :'talla', 'color_codigo', :'color'${pares})),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50)),
  null, gen_random_uuid()) as venta_id \\gset
select p.id as fila from retail.prendas_por_regularizar p join retail.venta_items vi on vi.id = p.venta_item_id
 where vi.venta_id = :'venta_id' \\gset
`;
}

const leer = `select coalesce(motivo, '∅'), coalesce(motivo_detalle, '∅'), estado from retail.prendas_por_regularizar where id = :'fila';\nrollback;`;

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

for (const motivo of ["pistola_no_lee", "sin_etiqueta", "sistema_sin_stock", "cola"]) {
  exito(
    `guarda el motivo «${motivo}» y deja la venta pendiente como siempre`,
    comoFelipe(`${venta({ motivo_sin_registrar: motivo })}${leer}`),
    ([m, d, estado]) => m === motivo && d === "∅" && estado === "pendiente",
  );
}

exito(
  "con «otro» guarda lo que escribió la caja, sin los blancos de los bordes",
  comoFelipe(`${venta({ motivo_sin_registrar: "otro", motivo_sin_registrar_detalle: "  La clienta la trajo de otra tienda  " })}${leer}`),
  ([m, d]) => m === "otro" && d === "La clienta la trajo de otra tienda",
);

exito(
  "con «otro», un texto de 200 letras se guarda recortado a 120",
  comoFelipe(`${venta({ motivo_sin_registrar: "otro", motivo_sin_registrar_detalle: "x".repeat(200) })}${leer}`),
  ([m, d]) => m === "otro" && d.length === 120,
);

exito(
  "con «otro» y el texto vacío, el motivo queda y el detalle no",
  comoFelipe(`${venta({ motivo_sin_registrar: "otro", motivo_sin_registrar_detalle: "   " })}${leer}`),
  ([m, d]) => m === "otro" && d === "∅",
);

exito(
  "el detalle de un motivo que no es «otro» se ignora",
  comoFelipe(`${venta({ motivo_sin_registrar: "sin_etiqueta", motivo_sin_registrar_detalle: "no debería quedar" })}${leer}`),
  ([m, d]) => m === "sin_etiqueta" && d === "∅",
);

exito(
  "un motivo fuera de la lista no tumba la venta: queda sin motivo",
  comoFelipe(`${venta({ motivo_sin_registrar: "me dio flojera" })}${leer}`),
  ([m, d, estado]) => m === "∅" && d === "∅" && estado === "pendiente",
);

exito(
  "sin motivo (una pestaña de antes, la cola sin conexión) la venta se guarda igual, sin motivo",
  comoFelipe(`${venta()}${leer}`),
  ([m, d, estado]) => m === "∅" && d === "∅" && estado === "pendiente",
);

exito(
  "el motivo no cambia el dinero ni el stock: la línea sigue en la centinela, a S/ 50 y sin movimientos",
  comoFelipe(`${venta({ motivo_sin_registrar: "cola" })}
select (select precio_cobrado from retail.prendas_por_regularizar where id = :'fila'),
       (select count(*) from retail.movimientos m join retail.venta_items vi on vi.id = m.venta_item_id where vi.venta_id = :'venta_id'),
       (select count(*) from retail.venta_items where venta_id = :'venta_id' and variante_id = '${CENTINELA}');
rollback;`),
  ([precio, movs, lineas]) => precio === "50.00" && movs === "0" && lineas === "1",
);

error(
  "la tabla rechaza un motivo fuera de la lista escrito por otro camino",
  comoFelipe(`${venta({ motivo_sin_registrar: "cola" })}
reset role;
update retail.prendas_por_regularizar set motivo = 'raro' where id = :'fila';
rollback;`),
  "prendas_por_regularizar_motivo_valido",
);

error(
  "la tabla rechaza un detalle sin «otro»",
  comoFelipe(`${venta({ motivo_sin_registrar: "cola" })}
reset role;
update retail.prendas_por_regularizar set motivo_detalle = 'algo' where id = :'fila';
rollback;`),
  "prendas_por_regularizar_motivo_detalle",
);

exito(
  "pegar la migración dos veces deja el motivo una sola vez en registrar_venta",
  comoFelipe(`${MIGRACION}
reset role;
select (length(d) - length(replace(d, 'motivo_sin_registrar_detalle', ''))) / length('motivo_sin_registrar_detalle')
  from (select pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta') x;
rollback;`),
  ([veces]) => veces === "1",
);

let fallas = 0;
for (const c of CASOS) {
  const r = correr(c.sql);
  let bien;
  let detalle = "";
  if (c.tipo === "exito") {
    const columnas = r.ok ? (r.salida.split("\n").pop() ?? "").split("|") : [];
    bien = r.ok && c.verificar(columnas);
    detalle = r.ok ? `salida: ${r.salida.split("\n").pop()}` : r.mensaje;
  } else {
    bien = !r.ok && r.mensaje.includes(c.contiene);
    detalle = r.ok ? "no falló" : r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje;
  }
  console.log(`${bien ? "✓" : "✗"} ${c.nombre}${bien ? "" : `\n    ${detalle}`}`);
  if (!bien) fallas++;
}
console.log(`\n${CASOS.length - fallas} de ${CASOS.length} casos bien.`);
process.exit(fallas ? 1 : 0);
