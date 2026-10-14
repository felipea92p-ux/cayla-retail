#!/usr/bin/env node
/**
 * La Vitrina web y el catálogo publicado (ADR-0408, actividad 3) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014225000_vitrina_web.sql`:
 *   1. Permisos: el módulo `vitrina_web` nace sin rol (solo el líder lo ve); sin el módulo no se lee ni se guarda nada; con el
 *      módulo, una integrante guarda pero no ve el costo. La tabla no la lee nadie directo (ni el ERP ni la tienda) y
 *      `tienda_catalogo` es solo de `tienda_web`.
 *   2. La hoja de un modelo (`vitrina_guardar_modelo`): el precio web nace al encenderlo, nunca bajo el costo ni inválido, tres
 *      estados de «Lo nuevo», la descripción limpia, la versión que frena a la segunda persona, apagar no borra y cada cambio
 *      deja su línea en la Actividad con quién lo hizo (y sin cambios, ninguna).
 *   3. Los lotes: `vitrina_mostrar` (el que nunca estuvo entra con su precio de tienda; el que estuvo, con el suyo; todo o nada)
 *      y `vitrina_cambiar_precios` (versión por modelo, el costo, la forma del pedido; todo o nada).
 *   4. `tienda_catalogo`: solo lo publicado y vendible, con el precio WEB y el de la campaña con la regla de la caja
 *      (`fn_campanas_por_variante` + `fn_descuento_campana`, ADR-0403), la de mayor descuento por talla, «desde» cuando la campaña
 *      toca solo algunas tallas, sus colores activos y solo las fotos del almacén público.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder) o Micaela (integrante de Trujillo): nunca se
 * commitea nada en el Postgres local que comparten los worktrees. Cada uno parte con la vitrina vacía y sin campañas.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261014225000_vitrina_web.sql` mete la migración dentro de cada
 * transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * LA REGLA DE ADR-0403. El precio de campaña se compara siempre contra `fn_descuento_campana` de la misma base (la tienda cobra
 * con la regla de la caja, sea cual sea). El ejemplo exacto (S/ 79.90 con 20 % → S/ 63.90) solo se exige si la base ya tiene
 * ADR-0403 (`20261014173000`): una base local atrasada lo dice y no lo cuenta; el CI arma la base con todas las migraciones.
 *
 * DA POR SENTADO: el seed (Felipe líder, Micaela integrante, «Blusa Emma» a S/ 79.90 con costo de hasta S/ 35.46 en 6 tallas BEI
 * y NEG, «Falda Renata» a S/ 74.90 y «Vestido Sofía» a S/ 149.90) y la migración 20261014220000 (rol `tienda_web`).
 *
 * USO
 *   pnpm pruebas:vitrina-web    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:vitrina-web -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261014225000_vitrina_web.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante, fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
let omitidos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}
function esperarError(nombre, r, contiene) {
  esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `no falló: ${r.salida}` : `falló distinto: ${r.mensaje}`);
}

// ---- El punto de partida de cada escenario: la vitrina vacía, sin campañas y como Felipe ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as vestido from retail.productos where referencia = 'Vestido Sofía' \\gset
select id as cat_blusas from retail.categorias where id = (select categoria_id from retail.productos where id = :'emma') \\gset
select retail.fn_hoy_lima() as hoy \\gset
`;
/** Solo lee el catálogo de la base, con la migración puesta si se prueba antes de aplicarla. */
const EN_LA_BASE = `begin;\n${APLICAR_ANTES}\n`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
const MODULO_A_INTEGRANTE = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'vitrina_web');\n`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;

/** Guardar un modelo (la hoja). `version`: «null» o una expresión SQL. */
const guardar = (prod, { publicado = true, precio = "74.90", nuevo = "automatico", desc = "null", version = "null" } = {}) =>
  `select retail.vitrina_guardar_modelo(:'${prod}', ${publicado}, ${precio}, '${nuevo}', ${desc}, ${version})`;
const VERSION = (prod) => `(select version from retail.vitrina_productos where producto_id = :'${prod}')`;
/** Una campaña de prueba a nombre de Felipe (la base aprueba sola la etiqueta de un líder). Deja :etq. */
const campana = (nombre, pct, { estilo = "campana", desde = "null", hasta = "null" } = {}) => {
  const fecha = (x) => (x === "null" ? "null" : `(:'hoy'::date + ${x})`);
  return `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('${nombre}', '${estilo}', true, ${pct}, ${fecha(desde)}, ${fecha(hasta)}) returning id as etq \\gset\n`;
};
const aTodasLasTallas = (prod) =>
  `insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'${prod}' and v.activo;\n`;
const aUnColor = (prod, color) =>
  `insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'${prod}' and v.activo and v.color_codigo = '${color}';\n`;
/** La prenda de Emma en el catálogo de la tienda (o «ninguna»). */
const EN_CATALOGO = (prod) => `(select x from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x where x ->> 'id' = :'${prod}')`;
const ACTIVIDAD = `(select count(*) from retail.actividad where modulo = 'vitrina_web')`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select count(*) from pg_proc where proname = 'tienda_catalogo' and pronamespace = 'retail'::regnamespace;");
    if (hay.salida !== "1") {
      console.error(`Falta la vitrina web: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }
  const conAdr0403 = correr("select retail.fn_descuento_campana(89.90, 20) = 18.00;").salida === "t";

  // ---------------------------------------------------------------- 1. Permisos
  console.log("— Permisos —");
  esperarValor(
    "el módulo nace sin rol: el líder lo ve, la integrante no, y nadie lo tiene en un rol",
    correr(`${PREPARAR}select concat_ws('|', retail.fn_ve_modulo('vitrina_web'),
        (select count(*) from retail.rol_modulos where modulo = 'vitrina_web'),
        (select grupo || '·' || orden from retail.modulos where clave = 'vitrina_web'));
      ${COMO_MICAELA}select retail.fn_ve_modulo('vitrina_web');
      rollback;`),
    "t|0|Catálogo·125\nf",
  );
  for (const [que, sql] of [
    ["leer la vitrina", `select retail.fn_vitrina_modelos();`],
    ["guardar un modelo", `${guardar("emma")};`],
    ["mostrar varios", `select retail.vitrina_mostrar(array[:'emma']::uuid[], true);`],
    ["cambiar precios", `select retail.vitrina_cambiar_precios(jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'precio_web', 70, 'version', null)));`],
  ]) {
    esperarError(`sin el módulo no se puede ${que}`, correr(`${PREPARAR}${COMO_MICAELA}${sql}\nrollback;`), "vitrina_web_sin_modulo");
  }
  esperarValor(
    "con el módulo en su rol, la integrante guarda y firma ella; no ve el costo",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${COMO_MICAELA}
      select (${guardar("emma")}) -> 'vitrina' ->> 'precio_web';
      select (select p.nombres from public.personas p where p.id = vp.actualizado_por) from retail.vitrina_productos vp where vp.producto_id = :'emma';
      select concat_ws('|', retail.fn_vitrina_modelos() ->> 've_costos',
        (select count(*) from jsonb_array_elements(retail.fn_vitrina_modelos() -> 'modelos') m where m ? 'costo' and m -> 'costo' <> 'null'::jsonb));
      rollback;`),
    "74.90\nMicaela\nfalse|0",
  );
  esperarValor(
    "el líder sí ve el costo (el más alto de las tallas activas)",
    correr(`${PREPARAR}select concat_ws('|', retail.fn_vitrina_modelos() ->> 've_costos',
        (select m ->> 'costo' from jsonb_array_elements(retail.fn_vitrina_modelos() -> 'modelos') m where m ->> 'id' = :'emma'));
      rollback;`),
    "true|35.46",
  );
  esperarValor(
    "nadie lee la tabla directo (ni el ERP, ni un visitante, ni la tienda)",
    correr(`${EN_LA_BASE}select concat_ws('|', has_table_privilege('authenticated', 'retail.vitrina_productos', 'SELECT'),
        has_table_privilege('anon', 'retail.vitrina_productos', 'SELECT'), has_table_privilege('tienda_web', 'retail.vitrina_productos', 'SELECT'),
        has_table_privilege('authenticated', 'retail.vitrina_productos', 'INSERT, UPDATE, DELETE'));\nrollback;`),
    "f|f|f|f",
  );
  esperarValor(
    "las funciones del ERP son de las cuentas del ERP: ni un visitante ni la tienda las llaman",
    correr(`${EN_LA_BASE}select concat_ws('|',
        bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), bool_or(has_function_privilege('tienda_web', p.oid, 'EXECUTE')),
        bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), count(*))
      from pg_proc p where p.pronamespace = 'retail'::regnamespace
        and p.proname in ('vitrina_guardar_modelo', 'vitrina_mostrar', 'vitrina_cambiar_precios', 'fn_vitrina_modelos');\nrollback;`),
    "f|f|t|4",
  );
  esperarValor(
    "las piezas internas no las llama nadie desde afuera",
    correr(`${EN_LA_BASE}select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
        and p.proname in ('fn_vitrina_publicable', 'fn_vitrina_bajo_costo', 'fn_vitrina_precio_valido', 'fn_vitrina_soles', 'fn_vitrina_lista_nombres', 'fn_vitrina_anotar', 'fn_vitrina_modelo_json')
        and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('tienda_web', p.oid, 'EXECUTE'));\nrollback;`),
    "0",
  );
  esperarValor(
    "tienda_catalogo: security definer con su search_path, y solo de tienda_web",
    correr(`${EN_LA_BASE}select concat_ws('|', p.prosecdef, exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'),
        has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
      from pg_proc p where p.oid = 'retail.tienda_catalogo()'::regprocedure;\nrollback;`),
    "t|t|f|f|f|t",
  );

  // ---------------------------------------------------------------- 2. La hoja de un modelo
  console.log("— Guardar un modelo —");
  esperarValor(
    "encender: nace con su precio web, se ve, versión 1, con fecha, y una línea en la Actividad a nombre de Felipe",
    correr(`${PREPARAR}select ${ACTIVIDAD} as antes \\gset
      select (${guardar("emma")}) -> 'vitrina' ->> 'version';
      select concat_ws('|', publicado, precio_web, en_lo_nuevo, publicado_en is not null) from retail.vitrina_productos where producto_id = :'emma';
      select concat_ws('|', ${ACTIVIDAD} - :antes, a.accion, a.descripcion, (select p.nombres from public.personas p where p.id = a.persona_id))
        from retail.actividad a where a.modulo = 'vitrina_web' order by a.id desc limit 1;
      rollback;`),
    "1\nt|74.90|automatico|t\n1|vitrina_guardada|«Blusa Emma»: se ve en la web · precio web S/ 74.90|Felipe",
  );
  esperarError("un precio web bajo el costo no se guarda (ni para el líder)", correr(`${PREPARAR}${guardar("emma", { precio: "35.45" })};\nrollback;`), "vitrina_precio_bajo_costo");
  esperarValor("justo en el costo sí se guarda", correr(`${PREPARAR}select (${guardar("emma", { precio: "35.46" })}) -> 'vitrina' ->> 'precio_web';\nrollback;`), "35.46");
  for (const precio of ["0", "-1", "74.999", "'NaN'::numeric", "'Infinity'::numeric", "100000", "null"]) {
    esperarError(`un precio web ${precio} no se guarda`, correr(`${PREPARAR}${guardar("emma", { precio })};\nrollback;`), "vitrina_precio_invalido");
  }
  esperarError("«Lo nuevo» solo acepta automático, fijo o quitado", correr(`${PREPARAR}${guardar("emma", { nuevo: "siempre" })};\nrollback;`), "vitrina_datos_invalidos");
  esperarError("una descripción de más de 600 letras no se guarda", correr(`${PREPARAR}${guardar("emma", { desc: "repeat('a', 601)" })};\nrollback;`), "vitrina_datos_invalidos");
  esperarValor(
    "la descripción se guarda limpia; vacía queda en blanco (sale la del catálogo)",
    correr(`${PREPARAR}${guardar("emma", { desc: "'  Lino   liviano,  cae bien '" })} \\gset
      select descripcion_web from retail.vitrina_productos where producto_id = :'emma';
      ${guardar("emma", { desc: "'   '", version: VERSION("emma") })} \\gset
      select coalesce(descripcion_web, 'vacía') from retail.vitrina_productos where producto_id = :'emma';
      rollback;`),
    "Lino liviano, cae bien\nvacía",
  );
  esperarError(
    "con una versión vieja (otra persona lo cambió), no se guarda",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${guardar("emma", { precio: "70", version: VERSION("emma") })} \\gset
      ${guardar("emma", { precio: "72", version: "1" })};
      rollback;`),
    "vitrina_cambio_otro",
  );
  esperarError("encender «por primera vez» algo que ya está en la vitrina (sin versión) no pisa", correr(`${PREPARAR}${guardar("emma")} \\gset\n${guardar("emma", { precio: "70" })};\nrollback;`), "vitrina_cambio_otro");
  esperarError("una versión para un modelo que nunca estuvo en la vitrina, tampoco", correr(`${PREPARAR}${guardar("emma", { version: "3" })};\nrollback;`), "vitrina_cambio_otro");
  esperarValor(
    "guardar lo mismo no cambia la versión ni anota nada",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select ${ACTIVIDAD} as antes \\gset
      ${guardar("emma", { version: "1" })} \\gset
      select concat_ws('|', (select version from retail.vitrina_productos where producto_id = :'emma'), ${ACTIVIDAD} - :antes);
      rollback;`),
    "1|0",
  );
  esperarValor(
    "cambiar varias cosas a la vez: una sola línea que las dice todas, y la versión sube",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${guardar("emma", { precio: "69.90", nuevo: "fijo", desc: "'Nueva'", version: "1" })} \\gset
      select concat_ws('|', v.version, v.en_lo_nuevo, (select a.descripcion from retail.actividad a where a.modulo = 'vitrina_web' order by a.id desc limit 1))
        from retail.vitrina_productos v where v.producto_id = :'emma';
      rollback;`),
    "2|fijo|«Blusa Emma»: precio web S/ 74.90 → S/ 69.90 · fijado en Lo nuevo · cambió su descripción para la web",
  );
  esperarValor(
    "apagar no borra: queda la fila, oculta y con su precio",
    correr(`${PREPARAR}${guardar("emma", { precio: "69.90" })} \\gset
      ${guardar("emma", { publicado: false, precio: "69.90", version: "1" })} \\gset
      select concat_ws('|', count(*), bool_and(not publicado), max(precio_web)) from retail.vitrina_productos where producto_id = :'emma';
      rollback;`),
    "1|t|69.90",
  );
  esperarError(
    "un modelo descontinuado no se muestra",
    correr(`${PREPARAR}update retail.productos set estado = 'descontinuado' where id = :'emma';
      ${guardar("emma")};
      rollback;`),
    "vitrina_no_publicable",
  );
  esperarError(
    "un modelo de prueba no se muestra",
    correr(`${PREPARAR}update retail.productos set es_prueba = true where id = :'emma';
      ${guardar("emma")};
      rollback;`),
    "vitrina_no_publicable",
  );
  esperarValor(
    "eliminar un producto sin historia que estuvo en la vitrina: su fila se va con él (es configuración de la ficha)",
    correr(`${PREPARAR}select categoria_id as cat, marca_id as marca, proveedor_id as prov from retail.productos where id = :'emma' \\gset
      select talla_id as t1, color_codigo as c1 from retail.variantes where producto_id = :'emma' order by sku limit 1 \\gset
      insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('ZZ Vitrina virgen', :'cat', :'marca', :'prov') returning id as zz \\gset
      insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo) values (:'zz', 'ZZ-VITRINA-1', 50, :'t1', :'c1');
      ${guardar("zz", { precio: "50" })} \\gset
      select retail.eliminar_producto(:'zz') is not null;
      select concat_ws('|', (select count(*) from retail.productos where id = :'zz'), (select count(*) from retail.vitrina_productos where producto_id = :'zz'));
      rollback;`),
    "t\n0|0",
  );
  esperarError(
    "la «Prenda sin registrar» no se muestra",
    correr(`${PREPARAR}select retail.vitrina_guardar_modelo('11111111-1111-4111-8111-111111111111', true, 10, 'automatico', null, null);
      rollback;`),
    "vitrina_no_publicable",
  );

  // ---------------------------------------------------------------- 3. Los lotes
  console.log("— Mostrar y ocultar varios —");
  esperarValor(
    "mostrar dos que nunca estuvieron: entran con su precio de tienda y una sola línea en la Actividad",
    correr(`${PREPARAR}select ${ACTIVIDAD} as antes \\gset
      select retail.vitrina_mostrar(array[:'emma', :'falda']::uuid[], true) ->> 'cambiados';
      select string_agg(p.referencia || '=' || v.precio_web || '/' || v.publicado, ',' order by p.referencia)
        from retail.vitrina_productos v join retail.productos p on p.id = v.producto_id where v.producto_id in (:'emma', :'falda');
      select concat_ws('|', ${ACTIVIDAD} - :antes, (select descripcion from retail.actividad where modulo = 'vitrina_web' order by id desc limit 1));
      rollback;`),
    "2\nBlusa Emma=79.90/true,Falda Renata=74.90/true\n1|mostró en la web 2 modelos: Blusa Emma y Falda Renata",
  );
  esperarValor(
    "ocultar guarda el precio web; volver a mostrar lo trae con ese precio (no con el de tienda)",
    correr(`${PREPARAR}${guardar("emma", { precio: "69.90" })} \\gset
      select retail.vitrina_mostrar(array[:'emma']::uuid[], false) ->> 'cambiados';
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true) ->> 'cambiados';
      select concat_ws('|', publicado, precio_web, version) from retail.vitrina_productos where producto_id = :'emma';
      rollback;`),
    "1\n1\nt|69.90|3",
  );
  esperarValor(
    "mostrar lo que ya se ve, u ocultar lo que nunca estuvo, no cambia nada",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select retail.vitrina_mostrar(array[:'emma', :'emma']::uuid[], true) ->> 'cambiados';
      select retail.vitrina_mostrar(array[:'falda']::uuid[], false) ->> 'cambiados';
      select count(*) from retail.vitrina_productos where producto_id = :'falda';
      rollback;`),
    "0\n0\n0",
  );
  esperar(
    "todo o nada: si uno no se puede mostrar, no se muestra ninguno y el mensaje lo nombra",
    (() => {
      const r = correr(`${PREPARAR}update retail.productos set estado = 'descontinuado' where id = :'falda';
        select retail.vitrina_mostrar(array[:'emma', :'falda']::uuid[], true);
        rollback;`);
      return !r.ok && r.mensaje.includes("vitrina_no_publicable") && r.mensaje.includes("Falda Renata");
    })(),
  );
  esperarError(
    "un modelo sin precio de tienda no entra a la web por el lote",
    correr(`${PREPARAR}update retail.variantes set precio = 0 where producto_id = :'emma';
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true);
      rollback;`),
    "vitrina_sin_precio",
  );
  esperarError(
    "un modelo que hoy cuesta más que su precio web no vuelve a la web por el lote",
    correr(`${PREPARAR}${guardar("emma", { publicado: false, precio: "40" })} \\gset
      update retail.variantes set costo = 45 where producto_id = :'emma';
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true);
      rollback;`),
    "vitrina_precio_bajo_costo",
  );
  for (const [caso, arreglo] of [
    ["vacía", "array[]::uuid[]"],
    ["con un hueco", "array[null]::uuid[]"],
    ["de más de 500", "(select array_agg(gen_random_uuid()) from generate_series(1, 501))"],
  ]) {
    esperarError(`una lista ${caso} no se acepta`, correr(`${PREPARAR}select retail.vitrina_mostrar(${arreglo}, true);\nrollback;`), "vitrina_datos_invalidos");
  }

  console.log("— Cambiar el precio web de varios —");
  esperarValor(
    "cambia los que tienen la versión leída; el que nunca estuvo entra oculto con ese precio",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select retail.vitrina_cambiar_precios(jsonb_build_array(
        jsonb_build_object('producto_id', :'emma', 'precio_web', 70, 'version', 1),
        jsonb_build_object('producto_id', :'falda', 'precio_web', 64.9, 'version', null))) ->> 'cambiados';
      select string_agg(p.referencia || '=' || v.precio_web || '/' || v.publicado || '/' || v.version, ',' order by p.referencia)
        from retail.vitrina_productos v join retail.productos p on p.id = v.producto_id where v.producto_id in (:'emma', :'falda');
      rollback;`),
    "2\nBlusa Emma=70.00/true/2,Falda Renata=64.90/false/1",
  );
  esperar(
    "con la versión vieja de uno, no cambia ninguno y lo nombra",
    (() => {
      const r = correr(`${PREPARAR}${guardar("emma")} \\gset
        ${guardar("falda")} \\gset
        select retail.vitrina_cambiar_precios(jsonb_build_array(
          jsonb_build_object('producto_id', :'emma', 'precio_web', 70, 'version', 1),
          jsonb_build_object('producto_id', :'falda', 'precio_web', 60, 'version', 9)));
        rollback;`);
      return !r.ok && r.mensaje.includes("vitrina_cambio_otro") && r.mensaje.includes("Falda Renata") && !r.mensaje.includes("Blusa Emma");
    })(),
  );
  esperar(
    "si uno queda bajo el costo, no cambia ninguno y lo nombra",
    (() => {
      const r = correr(`${PREPARAR}${guardar("emma")} \\gset
        select retail.vitrina_cambiar_precios(jsonb_build_array(
          jsonb_build_object('producto_id', :'emma', 'precio_web', 30, 'version', 1),
          jsonb_build_object('producto_id', :'falda', 'precio_web', 60, 'version', null)));
        rollback;`);
      return !r.ok && r.mensaje.includes("vitrina_precio_bajo_costo") && r.mensaje.includes("Blusa Emma");
    })(),
  );
  for (const [caso, cambios] of [
    ["que no es una lista", "jsonb_build_object('producto_id', :'emma')"],
    ["vacío", "'[]'::jsonb"],
    ["con un id que no es id", "jsonb_build_array(jsonb_build_object('producto_id', 'emma', 'precio_web', 70))"],
    ["con el precio escrito como texto", "jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'precio_web', '70'))"],
    ["con una versión rara", "jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'precio_web', 70, 'version', 1.5))"],
    ["con el mismo modelo dos veces", "jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'precio_web', 70), jsonb_build_object('producto_id', :'emma', 'precio_web', 71))"],
  ]) {
    esperarError(`un pedido ${caso} no se acepta`, correr(`${PREPARAR}select retail.vitrina_cambiar_precios(${cambios});\nrollback;`), "vitrina_datos_invalidos");
  }
  esperarError(
    "un precio de tres decimales no se acepta",
    correr(`${PREPARAR}select retail.vitrina_cambiar_precios(jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'precio_web', 70.005)));\nrollback;`),
    "vitrina_precio_invalido",
  );

  // ---------------------------------------------------------------- 4. El catálogo de la tienda
  console.log("— El catálogo de la tienda —");
  esperarValor("sin nada publicado, el catálogo está vacío", correr(`${PREPARAR}select retail.tienda_catalogo()::text;\nrollback;`), '{"prendas": []}');
  esperarValor(
    "lo publicado sale con su precio web, sin campaña, y sus colores con nombre y color",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select concat_ws('|', x ->> 'nombre', x -> 'categoria' ->> 'nombre', x ->> 'precio_web', x ->> 'precio', x ->> 'precio_hasta',
          jsonb_typeof(x -> 'campana'), (select string_agg(c ->> 'codigo' || ':' || (c ->> 'hex'), ',' order by c ->> 'codigo') from jsonb_array_elements(x -> 'colores') c),
          jsonb_array_length(x -> 'fotos'))
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "Blusa Emma|Camisas y Blusas|74.90|74.90|74.90|null|BEI:#D5BA98,NEG:#2D2C2F|0",
  );
  esperarValor(
    "oculto, descontinuado o de prueba: no sale",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${guardar("falda")} \\gset
      ${guardar("vestido")} \\gset
      select retail.vitrina_mostrar(array[:'emma']::uuid[], false) \\gset
      update retail.productos set estado = 'descontinuado' where id = :'falda';
      update retail.productos set es_prueba = true where id = :'vestido';
      select jsonb_array_length(retail.tienda_catalogo() -> 'prendas');
      rollback;`),
    "0",
  );
  esperarValor(
    "una campaña que toca todas sus tallas: el precio de la campaña sobre el precio WEB (no el de tienda), con la regla de la caja",
    correr(`${PREPARAR}${guardar("emma", { precio: "70.00" })} \\gset
      ${campana("ZZ Aniversario", 10)}${aTodasLasTallas("emma")}
      select concat_ws('|', x ->> 'precio', x ->> 'precio_hasta', x -> 'campana' ->> 'nombre', x -> 'campana' ->> 'pct',
          (x ->> 'precio')::numeric = 70.00 - retail.fn_descuento_campana(70.00, 10))
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "63.00|63.00|ZZ Aniversario|10.00|t",
  );
  {
    const r = correr(`${PREPARAR}${guardar("emma", { precio: "79.90" })} \\gset
      ${campana("ZZ Aniversario", 20)}${aTodasLasTallas("emma")}
      select concat_ws('|', x ->> 'precio', (x ->> 'precio')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 20)) from ${EN_CATALOGO("emma")} t(x);
      rollback;`);
    esperar("el precio de campaña es el de la caja: precio web − fn_descuento_campana", r.ok && r.salida.endsWith("|t"), r.ok ? r.salida : r.mensaje);
    if (conAdr0403) {
      esperar("ADR-0403: S/ 79.90 con 20 % → S/ 63.90 (baja al múltiplo de S/ 0.10, sin céntimos sueltos)", r.ok && r.salida === "63.90|t", r.ok ? r.salida : r.mensaje);
    } else {
      omitidos++;
      console.log("· (omitido) ADR-0403: S/ 79.90 con 20 % → S/ 63.90 — esta base aún no tiene 20261014173000; el CI sí la tiene");
    }
  }
  esperarValor(
    "si la campaña toca solo un color: «desde» el precio con campaña hasta el precio web",
    correr(`${PREPARAR}${guardar("emma", { precio: "70.00" })} \\gset
      ${campana("ZZ Negro", 10)}${aUnColor("emma", "NEG")}
      select concat_ws('|', x ->> 'precio', x ->> 'precio_hasta', x -> 'campana' ->> 'nombre') from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "63.00|70.00|ZZ Negro",
  );
  esperarValor(
    "dos campañas sobre la misma talla: gana la de mayor descuento (como en la caja)",
    correr(`${PREPARAR}${guardar("emma", { precio: "70.00" })} \\gset
      ${campana("ZZ Chica", 10)}${aTodasLasTallas("emma")}${campana("ZZ Grande", 30)}${aTodasLasTallas("emma")}
      select concat_ws('|', x ->> 'precio', x -> 'campana' ->> 'nombre', x -> 'campana' ->> 'pct') from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "49.00|ZZ Grande|30.00",
  );
  esperarValor(
    "una campaña que entra por la categoría también cuenta, y una «de urgencia» con descuento también (como en la caja)",
    correr(`${PREPARAR}${guardar("emma", { precio: "70.00" })} \\gset
      ${campana("ZZ Liquidar", 20, { estilo: "urgencia" })}
      insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'etq', :'cat_blusas');
      select concat_ws('|', x ->> 'precio', x -> 'campana' ->> 'nombre') from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "56.00|ZZ Liquidar",
  );
  esperarValor(
    "una campaña que ya terminó o que empieza mañana no baja el precio",
    correr(`${PREPARAR}${guardar("emma", { precio: "70.00" })} \\gset
      ${campana("ZZ Pasada", 30, { hasta: -1 })}${aTodasLasTallas("emma")}${campana("ZZ Futura", 40, { desde: 1 })}${aTodasLasTallas("emma")}
      select concat_ws('|', x ->> 'precio', jsonb_typeof(x -> 'campana')) from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "70.00|null",
  );
  esperarValor(
    "solo los colores de las tallas activas (una talla inactiva de otro color no lo trae)",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo, activo)
        select :'emma', 'ROS', v.talla_id, 79.90, 30, false from retail.variantes v where v.producto_id = :'emma' limit 1;
      select (select string_agg(c ->> 'codigo', ',' order by c ->> 'codigo') from jsonb_array_elements(x -> 'colores') c) from ${EN_CATALOGO("emma")} t(x);
      update retail.variantes set activo = true where producto_id = :'emma' and color_codigo = 'ROS';
      select (select string_agg(c ->> 'codigo', ',' order by c ->> 'codigo') from jsonb_array_elements(x -> 'colores') c) from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "BEI,NEG\nBEI,NEG,ROS",
  );
  esperarValor(
    "fotos: solo las del almacén público de prendas, la principal primero, hasta dos, y la propia de cada color",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/b.jpg', 2, false, 'BEI'),
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.jpg', 5, true, 'NEG'),
        (:'emma', 'https://x.supabase.co/storage/v1/object/sign/retail-compras-adjuntos/factura.jpg?token=1', 0, false, null),
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/c.jpg', 9, false, null);
      select concat_ws('|', (select string_agg(regexp_replace(f #>> '{}', '^.*/', ''), ',') from jsonb_array_elements(x -> 'fotos') f),
          (select string_agg(c ->> 'codigo' || '=' || regexp_replace(coalesce(c ->> 'foto', 'ninguna'), '^.*/', ''), ',' order by c ->> 'codigo') from jsonb_array_elements(x -> 'colores') c))
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "a.jpg,b.jpg|BEI=b.jpg,NEG=a.jpg",
  );
  esperarValor(
    "lo último que entró a la web sale primero",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      update retail.vitrina_productos set publicado_en = now() - interval '1 day' where producto_id = :'emma';
      ${guardar("falda")} \\gset
      select string_agg(x ->> 'nombre', ',' order by o) from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') with ordinality t(x, o);
      rollback;`),
    "Falda Renata,Blusa Emma",
  );
  esperarValor(
    "nada del ERP en lo que ve la tienda: sin costo, stock, versión ni quién lo cambió",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select string_agg(k, ',' order by k) from ${EN_CATALOGO("emma")} t(x), jsonb_object_keys(x) k;
      rollback;`),
    "campana,categoria,codigo,colores,fotos,id,nombre,precio,precio_hasta,precio_web",
  );
  esperarValor(
    "como tienda_web: el catálogo responde y la tabla se niega",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${COMO_TIENDA}select jsonb_array_length(retail.tienda_catalogo() -> 'prendas');
      rollback;`),
    "1",
  );
  esperarError(
    "como tienda_web, leer la vitrina directo se niega",
    correr(`${PREPARAR}${COMO_TIENDA}select count(*) from retail.vitrina_productos;\nrollback;`),
    "permission denied",
  );
  esperarError(
    "como tienda_web, guardar en la vitrina se niega",
    correr(`${PREPARAR}${COMO_TIENDA}${guardar("emma")};\nrollback;`),
    "permission denied",
  );

  // ---------------------------------------------------------------- 5. La migración
  console.log("— La migración —");
  const sql = readFileSync(MIGRACION, "utf8");
  esperarValor(
    "se puede volver a correr (dos veces seguidas, como un segundo pegado)",
    correr(`begin;\n${sql}\n${sql}\nselect count(*) from retail.modulos where clave = 'vitrina_web';\nrollback;`),
    "1",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde${omitidos ? ` (${omitidos} omitido por la base local atrasada)` : ""}.`);
  if (fallos > 0) process.exit(1);
}

main();
