#!/usr/bin/env node
/**
 * Pruebas de «Corregir lo anotado» de una venta sin registrar (ADR-0369) contra el Postgres local — CAYLA V2.
 *
 * La caja anota a ojo categoría, talla y color de la prenda que vende sin registrar; `corregir_prenda_sin_registrar` deja cambiar
 * eso después de la venta. Estas pruebas cuidan que cambie SOLO lo anotado (ni precio, ni stock, ni la línea de venta), que deje
 * su foto de antes y después y su línea en Actividad, que no se pueda corregir lo que ya tiene prenda real, y que la colaboradora
 * de otra tienda no alcance.
 *
 * Mismo patrón que `scripts/pruebas/cola_arranque.mjs`: cada caso corre en su propia transacción con ROLLBACK contra el Postgres
 * local compartido, simulando a Felipe (líder) o Micaela (colaboradora de Tienda Trujillo) con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:corregir-prenda-sin-registrar    → necesita el stack local (`npx supabase start`)
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

const comoPersona = (authUserId, sqlDespues) => `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlDespues}
`;

/** Una caja abierta en la sede y una venta sin registrar de S/ 50; deja :ubic, :item, :fila y dos juegos de categoría/talla/color. */
function venta(ubicacionNombre = "Tienda Lima") {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as cat2 from retail.categorias where activo order by nombre desc limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select id as talla2 from retail.tallas where activo and estado = 'aprobado' order by valor desc limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
select codigo as color2 from retail.colores where activo order by codigo desc limit 1 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', 50,
    'descuento_unitario', 0, 'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat',
    'talla_id', :'talla', 'color_codigo', :'color')),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50)),
  null, gen_random_uuid()) as venta_id \\gset
select id as item from retail.venta_items where venta_id = :'venta_id' \\gset
select id as fila from retail.prendas_por_regularizar where venta_item_id = :'item' \\gset
`;
}

const corregir = (desc = "Vestido largo crema") =>
  `select retail.corregir_prenda_sin_registrar(:'fila', '${desc}', :'cat2', :'talla2', :'color2') as _r \\gset\n`;

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

exito(
  "corrige descripción, categoría, talla y color; el precio cobrado y el estado no cambian",
  comoPersona(
    FELIPE,
    `${venta()}${corregir()}
select descripcion, categoria_id = :'cat2', talla_id = :'talla2', color_codigo = :'color2', precio_cobrado, estado
  from retail.prendas_por_regularizar where id = :'fila';
rollback;`,
  ),
  ([desc, cat, talla, color, precio, estado]) => desc === "Vestido largo crema" && cat === "t" && talla === "t" && color === "t" && precio === "50.00" && estado === "pendiente",
);

exito(
  "no mueve stock ni toca la línea de la venta: sin movimientos y la línea sigue en la centinela",
  comoPersona(
    FELIPE,
    `${venta()}${corregir()}
select (select count(*) from retail.movimientos where venta_item_id = :'item'),
       (select count(*) from retail.venta_items where id = :'item' and variante_id = '${CENTINELA}');
rollback;`,
  ),
  ([movs, lineas]) => movs === "0" && lineas === "1",
);

exito(
  "deja la foto de antes y después, y una línea en Actividad (Existencias) con quién firmó",
  comoPersona(
    FELIPE,
    `${venta()}${corregir()}
select (select antes ->> 'descripcion' from retail.prendas_por_regularizar_correcciones where prenda_id = :'fila'),
       (select despues ->> 'descripcion' from retail.prendas_por_regularizar_correcciones where prenda_id = :'fila'),
       (select persona_id is not null from retail.prendas_por_regularizar_correcciones where prenda_id = :'fila'),
       (select count(*) from retail.actividad where accion = 'prenda_sin_registrar_corregida' and registro_id = :'fila'::text and modulo = 'existencias');
rollback;`,
  ),
  ([antes, despues, firmada, actividad]) => antes === "Blusa lino beige" && despues === "Vestido largo crema" && firmada === "t" && actividad === "1",
);

exito(
  "la lectura dice cuántas veces se corrigió y conserva lo que anotó caja al vender",
  comoPersona(
    FELIPE,
    `${venta()}${corregir("Vestido largo crema")}${corregir("Vestido largo hueso")}
set local role authenticated;
select veces, antes ->> 'descripcion' from retail.fn_correcciones_prenda_sin_registrar(array[:'fila'::uuid]) limit 1;
rollback;`,
  ),
  ([veces, original]) => veces === "2" && original === "Blusa lino beige",
);

exito(
  "una venta cerrada sin prenda también se corrige (lo anotado sigue contando en la demanda)",
  comoPersona(
    FELIPE,
    // Se cierra por el camino real (`cerrar_cola_arranque`, ADR-0334). Lo que ya estuviera pendiente en la sede se aparta un día
    // hacia adelante, dentro de esta transacción, para que el cierre solo tome la venta de la prueba.
    `${venta()}update retail.prendas_por_regularizar set vendido_en = now() + interval '1 day' where ubicacion_id = :'ubic' and estado = 'pendiente' and id <> :'fila';
insert into retail.cola_arranque_plazo (ubicacion_id, hasta) values (:'ubic', retail.fn_hoy_lima() + 11)
  on conflict (ubicacion_id) do update set hasta = excluded.hasta;
select retail.cerrar_cola_arranque(:'ubic', now(), 'no_se_sabe', null) as _cierre \\gset
${corregir()}
select estado, descripcion from retail.prendas_por_regularizar where id = :'fila';
rollback;`,
  ),
  ([estado, desc]) => estado === "cerrada_sin_prenda" && desc === "Vestido largo crema",
);

error(
  "lo mismo que ya estaba no se guarda dos veces (un doble clic)",
  comoPersona(
    FELIPE,
    `${venta()}select retail.corregir_prenda_sin_registrar(:'fila', 'Blusa lino beige', :'cat', :'talla', :'color');
rollback;`,
  ),
  "prenda_sin_cambios",
);

error(
  "una venta ya regularizada no se corrige: manda la prenda real",
  comoPersona(
    FELIPE,
    `${venta()}select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.regularizar_prenda(:'fila', :'v1', 'llego_nueva') as _reg \\gset
${corregir()}rollback;`,
  ),
  "prenda_no_corregible",
);

error(
  "una venta anulada no se corrige",
  comoPersona(FELIPE, `${venta()}update retail.prendas_por_regularizar set estado = 'anulada' where id = :'fila';\n${corregir()}rollback;`),
  "prenda_no_corregible",
);

error(
  "una descripción vacía se rechaza",
  comoPersona(FELIPE, `${venta()}${corregir("   ")}rollback;`),
  "prenda_datos_invalidos",
);

error(
  "un color que no existe se rechaza",
  comoPersona(FELIPE, `${venta()}select retail.corregir_prenda_sin_registrar(:'fila', 'Blusa', :'cat', :'talla', 'NO-EXISTE');\nrollback;`),
  "prenda_datos_invalidos",
);

error(
  "una colaboradora de Trujillo no corrige una venta de Lima",
  `begin;
set local request.jwt.claim.sub = '${FELIPE}';
${venta("Tienda Lima")}
set local request.jwt.claim.sub = '${MICAELA}';
${corregir()}rollback;`,
  "permiso",
);

error(
  "la tabla de correcciones solo se agrega: no se puede editar",
  comoPersona(
    FELIPE,
    `${venta()}${corregir()}update retail.prendas_por_regularizar_correcciones set antes = '{}' where prenda_id = :'fila';
rollback;`,
  ),
  "solo se agrega",
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
