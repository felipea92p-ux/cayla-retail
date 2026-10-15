#!/usr/bin/env node
/**
 * La Vitrina web y el catálogo publicado (ADR-0408, actividad 3) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014225000_vitrina_web.sql`:
 *   1. Permisos: el módulo `vitrina_web` nace sin rol (solo el líder lo ve); sin el módulo no se lee ni se guarda nada; con el
 *      módulo, una integrante guarda y firma ella. La tabla no la lee nadie directo (ni el ERP ni la tienda) y `tienda_catalogo` es
 *      solo de `tienda_web`. No queda nada del precio web de la primera versión.
 *   2. La hoja de un modelo (`vitrina_guardar_modelo`): mostrar u ocultar, tres estados de «Lo nuevo», la descripción limpia, la
 *      versión que frena a la segunda persona, ocultar no borra y cada cambio deja su línea en la Actividad con quién lo hizo (y sin
 *      cambios, ninguna).
 *   3. El lote: `vitrina_mostrar` (el que nunca estuvo entra; el que estuvo, vuelve; todo o nada).
 *   4. `tienda_catalogo(p_sede)`: solo lo publicado y vendible, al precio de la tienda elegida (`fn_precio_en_sede`) o, con «Todas»,
 *      al MAYOR entre las tiendas que se ven en la web (Felipe, 2026-10-14); una tienda escondida o un id cualquiera se leen como
 *      «Todas»; encima, la campaña con la regla de la caja (`fn_campanas_por_variante` + `fn_descuento_campana`, ADR-0403), la de
 *      mayor descuento por talla, «desde» solo cuando la campaña no toca a todas las tallas por igual, sus colores activos y solo
 *      las fotos del almacén público.
 *   5. La migración se puede volver a correr, también sobre una base que tenía la versión vieja (con precio web).
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder) o Micaela (integrante de Trujillo): nunca se
 * commitea nada en el Postgres local que comparten los worktrees. Cada uno parte con la vitrina vacía, sin campañas y sin tiendas
 * en la web; los que miran el precio por tienda muestran Trujillo y Lima en la web (`SEDES_EN_LA_WEB`).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261014225000_vitrina_web.sql` mete la migración dentro de cada
 * transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * LA REGLA DE ADR-0403. El precio de campaña se compara siempre contra `fn_descuento_campana` de la misma base (la tienda cobra
 * con la regla de la caja, sea cual sea). El ejemplo exacto (S/ 79.90 con 20 % → S/ 63.90) solo se exige si la base ya tiene
 * ADR-0403 (`20261014173000`): una base local atrasada lo dice y no lo cuenta; el CI arma la base con todas las migraciones.
 *
 * DA POR SENTADO: el seed (Felipe líder, Micaela integrante, «Blusa Emma» a S/ 79.90 con costo de hasta S/ 35.46 en 6 tallas BEI
 * y NEG, «Falda Renata» y «Vestido Sofía»; Tienda Trujillo y Tienda Lima abiertas), el precio de tienda (`fn_precio_en_sede`,
 * 20261011100000), el rol `tienda_web` (20261014220000) y las tiendas de la web (`tienda_sedes`, 20261014231000).
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

// ---- El punto de partida de cada escenario: la vitrina vacía, sin campañas, sin tiendas en la web y como Felipe ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as vestido from retail.productos where referencia = 'Vestido Sofía' \\gset
select id as cat_blusas from retail.categorias where id = (select categoria_id from retail.productos where id = :'emma') \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.fn_hoy_lima() as hoy \\gset
`;
/** Trujillo y Lima se ven en la web (nombre, dirección y WhatsApp: lo que pide `fn_sede_web_falta`). */
const SEDES_EN_LA_WEB = `
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
`;
/** Solo lee el catálogo de la base, con la migración puesta si se prueba antes de aplicarla. */
const EN_LA_BASE = `begin;\n${APLICAR_ANTES}\n`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
const MODULO_A_INTEGRANTE = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'vitrina_web');\n`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;

/** Guardar un modelo (la hoja). `version`: «null» o una expresión SQL. */
const guardar = (prod, { publicado = true, nuevo = "automatico", desc = "null", version = "null" } = {}) =>
  `select retail.vitrina_guardar_modelo(:'${prod}', ${publicado}, '${nuevo}', ${desc}, ${version})`;
const VERSION = (prod) => `(select version from retail.vitrina_productos where producto_id = :'${prod}')`;
/** El precio propio de una tienda, por la única puerta (`poner_precio_sede`: módulo, costo y motivo). */
const precioEnTienda = (prod, sede, precio) => `select retail.poner_precio_sede(:'${prod}', :'${sede}', ${precio}, 'Prueba de la vitrina') \\gset\n`;
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
/** La prenda en el catálogo de la tienda, con «Todas» o con la tienda `sede` (una variable de psql). */
const EN_CATALOGO = (prod, sede = null) =>
  `(select x from jsonb_array_elements(retail.tienda_catalogo(${sede ? `:'${sede}'` : "null"}) -> 'prendas') x where x ->> 'id' = :'${prod}')`;
/** precio | precio_final | desde, de una prenda con «Todas» o con una tienda. */
const PRECIOS = (prod, sede = null) =>
  `(select concat_ws('|', x ->> 'precio', x ->> 'precio_final', x ->> 'desde') from ${EN_CATALOGO(prod, sede)} t(x))`;
const ACTIVIDAD = `(select count(*) from retail.actividad where modulo = 'vitrina_web')`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.tienda_catalogo(uuid)') is not null;");
    if (hay.salida !== "t") {
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
  ]) {
    esperarError(`sin el módulo no se puede ${que}`, correr(`${PREPARAR}${COMO_MICAELA}${sql}\nrollback;`), "vitrina_web_sin_modulo");
  }
  esperarValor(
    "con el módulo en su rol, la integrante guarda y firma ella",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${COMO_MICAELA}
      select (${guardar("emma")}) -> 'vitrina' ->> 'publicado';
      select (select p.nombres from public.personas p where p.id = vp.actualizado_por) from retail.vitrina_productos vp where vp.producto_id = :'emma';
      rollback;`),
    "true\nMicaela",
  );
  esperarValor(
    "la vitrina del ERP no trae precio ni costo (el precio es el de cada tienda y se cambia en la ficha)",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select concat_ws('|', (select string_agg(k, ',' order by k) from jsonb_object_keys(m) k), (select string_agg(k, ',' order by k) from jsonb_object_keys(m -> 'vitrina') k),
          (select string_agg(k, ',' order by k) from jsonb_object_keys(retail.fn_vitrina_modelos()) k))
        from jsonb_array_elements(retail.fn_vitrina_modelos() -> 'modelos') m where m ->> 'id' = :'emma';
      rollback;`),
    // `por_que_no` (20261015122000): por qué no se puede mostrar (empaque, sin precio, no se vende), para que la fila lo diga.
    "categoria,codigo,colores,descripcion,familia,foto,id,nombre,por_que_no,prefijo,publicable,stock,tallas,vitrina|actualizado_en,actualizado_por,descripcion_web,en_lo_nuevo,publicado,publicado_en,version|modelos,tiendas",
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
        and p.proname in ('vitrina_guardar_modelo', 'vitrina_mostrar', 'fn_vitrina_modelos');\nrollback;`),
    "f|f|t|3",
  );
  esperarValor(
    "las piezas internas no las llama nadie desde afuera",
    correr(`${EN_LA_BASE}select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
        and p.proname in ('fn_vitrina_publicable', 'fn_vitrina_lista_nombres', 'fn_vitrina_anotar', 'fn_vitrina_modelo_json')
        and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('tienda_web', p.oid, 'EXECUTE'));\nrollback;`),
    "0",
  );
  esperarValor(
    "tienda_catalogo: security definer con su search_path, y solo de tienda_web",
    correr(`${EN_LA_BASE}select concat_ws('|', p.prosecdef, exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'),
        has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
      from pg_proc p where p.oid = 'retail.tienda_catalogo(uuid)'::regprocedure;\nrollback;`),
    "t|t|f|f|f|t",
  );
  esperarValor(
    "no queda nada del precio web: ni su columna, ni sus funciones, ni el catálogo sin tienda",
    correr(`${EN_LA_BASE}select concat_ws('|',
        (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'vitrina_productos' and column_name = 'precio_web'),
        (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
          and p.proname in ('vitrina_cambiar_precios', 'fn_vitrina_bajo_costo', 'fn_vitrina_precio_valido', 'fn_vitrina_soles')),
        (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('tienda_catalogo', 'vitrina_guardar_modelo', 'fn_vitrina_modelo_json')));\nrollback;`),
    "0|0|3",
  );

  // ---------------------------------------------------------------- 2. La hoja de un modelo
  console.log("— Guardar un modelo —");
  esperarValor(
    "mostrar: se ve, versión 1, con fecha, y una línea en la Actividad a nombre de Felipe",
    correr(`${PREPARAR}select ${ACTIVIDAD} as antes \\gset
      select (${guardar("emma")}) -> 'vitrina' ->> 'version';
      select concat_ws('|', publicado, en_lo_nuevo, publicado_en is not null) from retail.vitrina_productos where producto_id = :'emma';
      select concat_ws('|', ${ACTIVIDAD} - :antes, a.accion, a.descripcion, (select p.nombres from public.personas p where p.id = a.persona_id))
        from retail.actividad a where a.modulo = 'vitrina_web' order by a.id desc limit 1;
      rollback;`),
    "1\nt|automatico|t\n1|vitrina_guardada|«Blusa Emma»: se ve en la web|Felipe",
  );
  esperarError("«Lo nuevo» solo acepta automático, fijo o quitado", correr(`${PREPARAR}${guardar("emma", { nuevo: "siempre" })};\nrollback;`), "vitrina_datos_invalidos");
  esperarError("una descripción de más de 600 letras no se guarda", correr(`${PREPARAR}${guardar("emma", { desc: "repeat('a', 601)" })};\nrollback;`), "vitrina_datos_invalidos");
  esperarError("sin decir si se ve, no se guarda", correr(`${PREPARAR}${guardar("emma", { publicado: "null" })};\nrollback;`), "vitrina_datos_invalidos");
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
      ${guardar("emma", { nuevo: "fijo", version: VERSION("emma") })} \\gset
      ${guardar("emma", { nuevo: "quitado", version: "1" })};
      rollback;`),
    "vitrina_cambio_otro",
  );
  esperarError("mostrar «por primera vez» algo que ya está en la vitrina (sin versión) no pisa", correr(`${PREPARAR}${guardar("emma")} \\gset\n${guardar("emma", { nuevo: "fijo" })};\nrollback;`), "vitrina_cambio_otro");
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
      ${guardar("emma", { nuevo: "fijo", desc: "'Nueva'", version: "1" })} \\gset
      select concat_ws('|', v.version, v.en_lo_nuevo, (select a.descripcion from retail.actividad a where a.modulo = 'vitrina_web' order by a.id desc limit 1))
        from retail.vitrina_productos v where v.producto_id = :'emma';
      rollback;`),
    "2|fijo|«Blusa Emma»: fijado en Lo nuevo · cambió su descripción para la web",
  );
  esperarValor(
    "ocultar no borra: queda la fila, oculta, con lo suyo de Lo nuevo",
    correr(`${PREPARAR}${guardar("emma", { nuevo: "fijo" })} \\gset
      ${guardar("emma", { publicado: false, nuevo: "fijo", version: "1" })} \\gset
      select concat_ws('|', count(*), bool_and(not publicado), max(en_lo_nuevo), max(version)) from retail.vitrina_productos where producto_id = :'emma';
      select descripcion from retail.actividad where modulo = 'vitrina_web' order by id desc limit 1;
      rollback;`),
    "1|t|fijo|2\n«Blusa Emma»: ya no se ve en la web",
  );
  esperarValor(
    "uno que nunca estuvo, dejado oculto, automático y sin descripción: no deja fila ni anota (no hay nada que guardar)",
    correr(`${PREPARAR}select ${ACTIVIDAD} as antes \\gset
      select coalesce(jsonb_typeof((${guardar("emma", { publicado: false })}) -> 'vitrina'), 'sin');
      select concat_ws('|', (select count(*) from retail.vitrina_productos where producto_id = :'emma'), ${ACTIVIDAD} - :antes);
      rollback;`),
    "null\n0|0",
  );
  esperarValor(
    "uno que nunca estuvo, oculto pero fijado en Lo nuevo: deja su fila oculta y lo anota",
    correr(`${PREPARAR}${guardar("emma", { publicado: false, nuevo: "fijo" })} \\gset
      select concat_ws('|', count(*), bool_and(not publicado), max(en_lo_nuevo), bool_and(publicado_en is null)) from retail.vitrina_productos where producto_id = :'emma';
      select descripcion from retail.actividad where modulo = 'vitrina_web' order by id desc limit 1;
      rollback;`),
    "1|t|fijo|t\n«Blusa Emma»: queda oculto · fijado en Lo nuevo",
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
  esperarError(
    "un modelo sin precio (todas sus tallas activas a S/ 0) no se muestra",
    correr(`${PREPARAR}update retail.variantes set precio = 0 where producto_id = :'emma';
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
      ${guardar("zz")} \\gset
      select retail.eliminar_producto(:'zz') is not null;
      select concat_ws('|', (select count(*) from retail.productos where id = :'zz'), (select count(*) from retail.vitrina_productos where producto_id = :'zz'));
      rollback;`),
    "t\n0|0",
  );
  esperarError(
    "la «Prenda sin registrar» no se muestra",
    correr(`${PREPARAR}select retail.vitrina_guardar_modelo('11111111-1111-4111-8111-111111111111', true, 'automatico', null, null);
      rollback;`),
    "vitrina_no_publicable",
  );

  // ---------------------------------------------------------------- 3. El lote
  console.log("— Mostrar y ocultar varios —");
  esperarValor(
    "mostrar dos que nunca estuvieron: entran y una sola línea en la Actividad",
    correr(`${PREPARAR}select ${ACTIVIDAD} as antes \\gset
      select retail.vitrina_mostrar(array[:'emma', :'falda']::uuid[], true) ->> 'cambiados';
      select string_agg(p.referencia || '=' || v.publicado || '/' || v.en_lo_nuevo, ',' order by p.referencia)
        from retail.vitrina_productos v join retail.productos p on p.id = v.producto_id where v.producto_id in (:'emma', :'falda');
      select concat_ws('|', ${ACTIVIDAD} - :antes, (select descripcion from retail.actividad where modulo = 'vitrina_web' order by id desc limit 1));
      rollback;`),
    "2\nBlusa Emma=true/automatico,Falda Renata=true/automatico\n1|mostró en la web 2 modelos: Blusa Emma y Falda Renata",
  );
  esperarValor(
    "ocultar y volver a mostrar: la misma fila, con su versión que sube",
    correr(`${PREPARAR}${guardar("emma", { nuevo: "fijo" })} \\gset
      select retail.vitrina_mostrar(array[:'emma']::uuid[], false) ->> 'cambiados';
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true) ->> 'cambiados';
      select concat_ws('|', count(*), bool_and(publicado), max(en_lo_nuevo), max(version)) from retail.vitrina_productos where producto_id = :'emma';
      rollback;`),
    "1\n1\n1|t|fijo|3",
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
    "un modelo sin precio no entra a la web por el lote",
    correr(`${PREPARAR}update retail.variantes set precio = 0 where producto_id = :'emma';
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true);
      rollback;`),
    "vitrina_no_publicable",
  );
  for (const [caso, arreglo] of [
    ["vacía", "array[]::uuid[]"],
    ["con un hueco", "array[null]::uuid[]"],
    ["de más de 500", "(select array_agg(gen_random_uuid()) from generate_series(1, 501))"],
  ]) {
    esperarError(`una lista ${caso} no se acepta`, correr(`${PREPARAR}select retail.vitrina_mostrar(${arreglo}, true);\nrollback;`), "vitrina_datos_invalidos");
  }

  // ---------------------------------------------------------------- 4. El catálogo de la tienda
  console.log("— El catálogo de la tienda: lo que se ve —");
  esperarValor("sin nada publicado, el catálogo está vacío", correr(`${PREPARAR}select retail.tienda_catalogo()::text;\nrollback;`), '{"sede": null, "prendas": []}');
  esperarValor(
    "lo publicado sale con el precio de la prenda (sin tiendas en la web), sin campaña, y sus colores con nombre y color",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select concat_ws('|', x ->> 'nombre', x -> 'categoria' ->> 'nombre', x ->> 'precio', x ->> 'precio_final', x ->> 'desde',
          jsonb_typeof(x -> 'campana'), (select string_agg(c ->> 'codigo' || ':' || (c ->> 'hex'), ',' order by c ->> 'codigo') from jsonb_array_elements(x -> 'colores') c),
          jsonb_array_length(x -> 'fotos'))
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "Blusa Emma|Camisas y Blusas|79.90|79.90|false|null|BEI:#D5BA98,NEG:#2D2C2F|0",
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

  console.log("— El precio: el de la tienda elegida, y con «Todas» el mayor —");
  esperarValor(
    "con «Todas», el MAYOR entre las tiendas de la web (sin «Desde»); con Trujillo, el suyo; con Lima, el de la prenda",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${guardar("emma")} \\gset
      ${precioEnTienda("emma", "tru", "69.90")}
      select ${PRECIOS("emma")};
      select ${PRECIOS("emma", "tru")};
      select ${PRECIOS("emma", "lim")};
      rollback;`),
    "79.90|79.90|false\n69.90|69.90|false\n79.90|79.90|false",
  );
  esperarValor(
    "el mayor aunque el caro sea el precio propio de una tienda",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${guardar("emma")} \\gset
      ${precioEnTienda("emma", "lim", "89.90")}
      select ${PRECIOS("emma")};
      select ${PRECIOS("emma", "tru")};
      rollback;`),
    "89.90|89.90|false\n79.90|79.90|false",
  );
  esperarValor(
    "la respuesta dice qué tienda usó: la elegida, o nada con «Todas»",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}select concat_ws('|', retail.tienda_catalogo(:'tru') ->> 'sede' = :'tru', coalesce(retail.tienda_catalogo() ->> 'sede', 'todas'));
      rollback;`),
    "t|todas",
  );
  esperarValor(
    "una tienda que no se ve en la web no cuenta para «Todas» ni se puede elegir; un id cualquiera tampoco",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${guardar("emma")} \\gset
      ${precioEnTienda("emma", "lim", "89.90")}
      update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      select ${PRECIOS("emma")};
      select concat_ws('|', coalesce(retail.tienda_catalogo(:'lim') ->> 'sede', 'todas'), (select x ->> 'precio' from ${EN_CATALOGO("emma", "lim")} t(x)));
      select coalesce(retail.tienda_catalogo(gen_random_uuid()) ->> 'sede', 'todas');
      rollback;`),
    "79.90|79.90|false\ntodas|79.90\ntodas",
  );
  esperarValor(
    "una tienda que pierde su WhatsApp sale sola de la web, y su precio deja de contar",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${guardar("emma")} \\gset
      ${precioEnTienda("emma", "lim", "89.90")}
      update retail.ubicaciones set whatsapp_numero = null where id = :'lim';
      select ${PRECIOS("emma")};
      rollback;`),
    "79.90|79.90|false",
  );
  esperarValor(
    "tallas a precios distintos en la grilla: el modelo vale lo más de sus tallas, sin «Desde»",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      update retail.variantes set precio = 89.90 where id = (select id from retail.variantes where producto_id = :'emma' and activo order by sku limit 1);
      select ${PRECIOS("emma")};
      rollback;`),
    "89.90|89.90|false",
  );

  console.log("— La campaña, encima del precio de la tienda —");
  esperarValor(
    "una campaña en todas sus tallas: sobre el precio de cada tienda, con la regla de la caja, sin «Desde»",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${guardar("emma")} \\gset
      ${precioEnTienda("emma", "tru", "69.90")}
      ${campana("ZZ Aniversario", 10)}${aTodasLasTallas("emma")}
      select concat_ws('|', x ->> 'precio', (x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 10), x ->> 'desde',
          x -> 'campana' ->> 'nombre', x -> 'campana' ->> 'pct') from ${EN_CATALOGO("emma")} t(x);
      select concat_ws('|', x ->> 'precio', (x ->> 'precio_final')::numeric = 69.90 - retail.fn_descuento_campana(69.90, 10), x ->> 'desde')
        from ${EN_CATALOGO("emma", "tru")} t(x);
      rollback;`),
    "79.90|t|false|ZZ Aniversario|10.00\n69.90|t|false",
  );
  {
    const r = correr(`${PREPARAR}${guardar("emma")} \\gset
      ${campana("ZZ Aniversario", 20)}${aTodasLasTallas("emma")}
      select concat_ws('|', x ->> 'precio_final', (x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 20)) from ${EN_CATALOGO("emma")} t(x);
      rollback;`);
    esperar("el precio de campaña es el de la caja: precio de la tienda − fn_descuento_campana", r.ok && r.salida.endsWith("|t"), r.ok ? r.salida : r.mensaje);
    if (conAdr0403) {
      esperar("ADR-0403: S/ 79.90 con 20 % → S/ 63.90 (baja al múltiplo de S/ 0.10, sin céntimos sueltos)", r.ok && r.salida === "63.90|t", r.ok ? r.salida : r.mensaje);
    } else {
      omitidos++;
      console.log("· (omitido) ADR-0403: S/ 79.90 con 20 % → S/ 63.90 — esta base aún no tiene 20261014173000; el CI sí la tiene");
    }
  }
  esperarValor(
    "una campaña en un solo color: «Desde» lo menos que se paga con campaña, y el precio del modelo tachado",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${campana("ZZ Negro", 10)}${aUnColor("emma", "NEG")}
      select concat_ws('|', x ->> 'precio', (x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 10), x ->> 'desde', x -> 'campana' ->> 'nombre')
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "79.90|t|true|ZZ Negro",
  );
  esperarValor(
    "dos % distintos en sus tallas: «Desde» el menor precio, con la campaña que lo da",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${campana("ZZ Beige", 10)}${aUnColor("emma", "BEI")}${campana("ZZ Negro", 30)}${aUnColor("emma", "NEG")}
      select concat_ws('|', (x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 30), x ->> 'desde', x -> 'campana' ->> 'nombre')
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "t|true|ZZ Negro",
  );
  esperarValor(
    "dos campañas sobre la misma talla: gana la de mayor descuento (como en la caja)",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${campana("ZZ Chica", 10)}${aTodasLasTallas("emma")}${campana("ZZ Grande", 30)}${aTodasLasTallas("emma")}
      select concat_ws('|', (x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 30), x ->> 'desde', x -> 'campana' ->> 'nombre', x -> 'campana' ->> 'pct')
        from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "t|false|ZZ Grande|30.00",
  );
  esperarValor(
    "una campaña que entra por la categoría también cuenta, y una «de urgencia» con descuento también (como en la caja)",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${campana("ZZ Liquidar", 20, { estilo: "urgencia" })}
      insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'etq', :'cat_blusas');
      select concat_ws('|', (x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 20), x -> 'campana' ->> 'nombre') from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "t|ZZ Liquidar",
  );
  esperarValor(
    "una campaña que ya terminó o que empieza mañana no baja el precio",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${campana("ZZ Pasada", 30, { hasta: -1 })}${aTodasLasTallas("emma")}${campana("ZZ Futura", 40, { desde: 1 })}${aTodasLasTallas("emma")}
      select concat_ws('|', ${PRECIOS("emma")}, jsonb_typeof(x -> 'campana')) from ${EN_CATALOGO("emma")} t(x);
      rollback;`),
    "79.90|79.90|false|null",
  );

  console.log("— El catálogo de la tienda: lo demás —");
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
    // `stock` son niveles por tienda («hay», 3, 2, 1, 0), no cifras: llegó con la actividad 4 (pruebas:tienda-ficha). `nuevo` y
    // `vendidos` (el puesto, nunca las unidades), con la 5 (pruebas:tienda-inicio).
    "nada del ERP en lo que ve la tienda: sin costo, cifras de stock ni de ventas, versión ni quién lo cambió",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      select string_agg(k, ',' order by k) from ${EN_CATALOGO("emma")} t(x), jsonb_object_keys(x) k;
      rollback;`),
    "campana,categoria,codigo,colores,desde,fotos,id,nombre,nuevo,precio,precio_final,stock,vendidos",
  );
  esperarValor(
    "como tienda_web: el catálogo responde (con «Todas» y con una tienda) y la tabla se niega",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${guardar("emma")} \\gset
      ${COMO_TIENDA}select concat_ws('|', jsonb_array_length(retail.tienda_catalogo() -> 'prendas'), jsonb_array_length(retail.tienda_catalogo(:'tru') -> 'prendas'));
      rollback;`),
    "1|1",
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

  // ---------------------------------------------------------------- 4b. Solo ropa en la web
  // Felipe, 2026-10-15 (`20261015122000_vitrina_solo_ropa.sql`): lo de una familia fuera de los motores (bolsas, cajas, empaque) se vende
  // desde el ticket, en la caja. La Vitrina no lo deja mostrar, con su porqué, y la tienda no lo muestra aunque haya quedado publicado.
  console.log("— Solo ropa en la web —");
  /** Pasa un modelo del seed a una familia fuera de los motores («ZZ Empaque», como la de las bolsas), dentro de la transacción. */
  const comoEmpaque = (prod) => `insert into retail.familias (codigo, nombre, entra_a_motores) values ('zzempaque', 'ZZ Empaque', false)
      on conflict (codigo) do nothing;
      insert into retail.categorias (nombre, familia, prefijo) values ('ZZ Bolsas ${prod}', 'zzempaque', upper('Q${prod.slice(0, 2)}')) returning id as cat_${prod} \\gset
      update retail.productos set categoria_id = :'cat_${prod}' where id = :'${prod}';\n`;
  {
    const r = correr(`${PREPARAR}${comoEmpaque("emma")}${guardar("emma")};\nrollback;`);
    esperar(
      "una bolsa (familia fuera de los motores) no se muestra: la hoja la niega diciendo que no es ropa y que se vende en la caja",
      !r.ok && r.mensaje.includes("vitrina_no_publicable") && r.mensaje.includes("«Blusa Emma» no se puede mostrar: no es ropa, es de ZZ Empaque. Se vende desde el ticket, en la caja."),
      r.ok ? r.salida : r.mensaje,
    );
  }
  {
    const r = correr(`${PREPARAR}${comoEmpaque("falda")}update retail.productos set estado = 'descontinuado' where id = :'vestido';
      select retail.vitrina_mostrar(array[:'emma', :'falda', :'vestido']::uuid[], true);
      rollback;`);
    esperar(
      "el lote es todo o nada y nombra aparte lo que es empaque y lo que no se vende",
      !r.ok &&
        r.mensaje.includes(
          "No se pueden mostrar: Falda Renata (no son ropa: se venden desde el ticket, en la caja); Vestido Sofía (descontinuados, de prueba o sin tallas activas con precio). Quítalos de la selección.",
        ),
      r.ok ? r.salida : r.mensaje,
    );
  }
  esperarValor(
    "la regla y su porqué: empaque (también con todas sus tallas en 0, como la de obsequio), «no se vende» (una bolsa de prueba), «sin precio» (ropa en 0), «no existe»; y «se puede mostrar» es no tener porqué en TODO el catálogo",
    correr(`${PREPARAR}${comoEmpaque("emma")}${comoEmpaque("falda")}
      update retail.variantes set precio = 0 where producto_id = :'falda';
      update retail.productos set es_prueba = true where id = :'falda';
      update retail.variantes set precio = 0 where producto_id = :'vestido';
      select concat_ws('|', retail.fn_vitrina_por_que_no(:'emma'), retail.fn_vitrina_por_que_no(:'falda'),
          retail.fn_vitrina_por_que_no(:'vestido'), retail.fn_vitrina_por_que_no(:'cat_blusas'));
      update retail.productos set es_prueba = false where id = :'falda';
      select concat_ws('|', retail.fn_vitrina_por_que_no(:'falda'), retail.fn_vitrina_publicable(:'falda'),
          (select count(*) from retail.productos p where retail.fn_vitrina_publicable(p.id) is distinct from (retail.fn_vitrina_por_que_no(p.id) is null)));
      rollback;`),
    "empaque|no_se_vende|sin_precio|no_existe\nempaque|f|0",
  );
  esperarValor(
    "un modelo publicado ANTES de pasar a una familia fuera de los motores no sale en el catálogo, ni en la ficha, ni en la bolsa del cliente; su fila de la Vitrina queda como estaba y vuelve a verse si la familia vuelve a contar",
    correr(`${PREPARAR}${guardar("emma")} \\gset
      ${comoEmpaque("emma")}
      select v.id as v_emma from retail.variantes v where v.producto_id = :'emma' and v.activo order by v.id limit 1 \\gset
      select concat_ws('|', coalesce(${EN_CATALOGO("emma")} ->> 'nombre', 'no sale'), coalesce(retail.tienda_ficha(:'emma')::text, 'null'),
          retail.tienda_bolsa(jsonb_build_array(jsonb_build_object('variante_id', :'v_emma', 'cantidad', 1)), null) -> 'lineas' -> 0 ->> 'disponible',
          (select publicado from retail.vitrina_productos where producto_id = :'emma'));
      update retail.familias set entra_a_motores = true where codigo = 'zzempaque';
      select coalesce(${EN_CATALOGO("emma")} ->> 'nombre', 'no sale');
      rollback;`),
    "no sale|null|false|t\nBlusa Emma",
  );
  esperarValor(
    "la pantalla de la Vitrina lista la bolsa con su porqué y sin poder mostrarse (también la que nunca estuvo: se vende, en la caja); una de prueba no sale",
    correr(`${PREPARAR}${comoEmpaque("emma")}${comoEmpaque("falda")}update retail.productos set es_prueba = true where id = :'falda';
      select concat_ws('|', (select concat_ws(',', m ->> 'publicable', m ->> 'por_que_no', coalesce(m -> 'vitrina' ->> 'publicado', 'nunca'))
                               from jsonb_array_elements(retail.fn_vitrina_modelos() -> 'modelos') m where m ->> 'id' = :'emma'),
          (select count(*) from jsonb_array_elements(retail.fn_vitrina_modelos() -> 'modelos') m where m ->> 'id' = :'falda'),
          (select m ->> 'por_que_no' is null and (m ->> 'publicable')::boolean
             from jsonb_array_elements(retail.fn_vitrina_modelos() -> 'modelos') m where m ->> 'id' = :'vestido'));
      rollback;`),
    "false,empaque,nunca|0|t",
  );
  {
    const r = correr(`${PREPARAR}${comoEmpaque("emma")}do $m$
declare d text := pg_get_functiondef('retail.fn_vitrina_por_que_no(uuid)'::regprocedure);
begin
  if position('when not retail.fn_categoria_entra_a_motores(p.categoria_id) then ''empaque''' in d) = 0 then
    raise exception 'mutante vacío: fn_vitrina_por_que_no no tiene la línea del empaque';
  end if;
  execute replace(d, 'when not retail.fn_categoria_entra_a_motores(p.categoria_id) then ''empaque''', 'when false then ''empaque''');
end $m$;
${guardar("emma")} \\gset
select retail.fn_vitrina_publicable(:'emma');
rollback;`);
    esperar("MUTANTE la regla sin la línea del empaque: la bolsa se puede mostrar otra vez, y la prueba lo ve", r.ok && r.salida.split("\n").at(-1) === "t", r.ok ? r.salida : r.mensaje);
  }

  // ---------------------------------------------------------------- 5. La migración
  console.log("— La migración —");
  const sql = readFileSync(MIGRACION, "utf8");
  esperarValor(
    "se puede volver a correr (dos veces seguidas, como un segundo pegado)",
    correr(`begin;\n${sql}\n${sql}\nselect count(*) from retail.modulos where clave = 'vitrina_web';\nrollback;`),
    "1",
  );
  esperarValor(
    "sobre una base con la versión vieja (precio web y sus funciones) deja todo como en una nueva, sin perder las filas",
    correr(`begin;
      ${APLICAR_ANTES}
      set local request.jwt.claim.sub = '${FELIPE}';
      select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
      ${guardar("emma", { nuevo: "fijo" })} \\gset
      alter table retail.vitrina_productos add column precio_web numeric(12, 2) not null default 10 check (precio_web > 0);
      create function retail.vitrina_cambiar_precios(p_cambios jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function retail.tienda_catalogo() returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function retail.vitrina_guardar_modelo(uuid, boolean, numeric, text, text, integer) returns jsonb language sql as $$ select '{}'::jsonb $$;
      update retail.modulos set incluye = 'Elegir qué modelos se ven en la tienda online y a qué precio web' where clave = 'vitrina_web';
      ${sql}
      select concat_ws('|',
        (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'vitrina_productos' and column_name = 'precio_web'),
        to_regprocedure('retail.vitrina_cambiar_precios(jsonb)') is null, to_regprocedure('retail.tienda_catalogo()') is null,
        to_regprocedure('retail.vitrina_guardar_modelo(uuid, boolean, numeric, text, text, integer)') is null,
        (select incluye not like '%precio%' from retail.modulos where clave = 'vitrina_web'),
        (select en_lo_nuevo from retail.vitrina_productos where producto_id = :'emma'),
        jsonb_typeof(retail.tienda_catalogo() -> 'prendas'));
      rollback;`),
    "0|t|t|t|t|fijo|array",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde${omitidos ? ` (${omitidos} omitido por la base local atrasada)` : ""}.`);
  if (fallos > 0) process.exit(1);
}

main();
