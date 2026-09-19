#!/usr/bin/env node
/**
 * Pruebas de las cuatro migraciones que producción tenía y el repo no — CAYLA V2.
 *
 * EL PROBLEMA. Producción se pegó a mano varias veces sin subir el archivo al repo: el
 * Postgres local (y un `db reset`) quedó más débil que el de producción, y las pruebas
 * locales dejaron de representar lo que corre. La comparación por huella md5 del
 * 2026-09-18 (BACKLOG, "Comparación completa `retail`") encontró estas cuatro:
 *
 *  - `20260916214600_registrar_movimiento_una_sola_firma`: el local tenía DOS
 *    `registrar_movimiento` (la de 6 parámetros y la de 7); llamarla sin
 *    `p_sububicacion_id` daba "is not unique". `AjustarInventarioModal` lo omite en
 *    ubicaciones sin piso/almacén, así que ajustar inventario ahí fallaba solo en local.
 *  - `20260917223029_catalogo_actualizar_producto_dropea_sobrecarga_vieja`: lo mismo con
 *    `catalogo_actualizar_producto` (10 y 12 parámetros).
 *  - `20260916201742_historial_producto_estado_restaurado`: `costo_promedio_ponderado` pisó
 *    el bloque de `estado` de `fn_registrar_cambio_producto`; descontinuar un producto no
 *    dejaba fila en el historial.
 *  - `20260916200001_historial_candado_completo`: `TRUNCATE ... CASCADE` sobre `movimientos`
 *    vaciaba el libro append-only (un `TRUNCATE` a secas ya lo frenaban las llaves foráneas).
 *  - `20260918180000_compras_token_cliente_idempotencia`: producción tiene
 *    `compras.token_cliente` (índice único) y `registrar_compra(..., p_token)`: un reintento con
 *    el mismo token devuelve la misma compra en vez de duplicarla. El repo no tenía nada de
 *    eso. `CompraFormV2.tsx` lo manda desde el 2026-09-18; el escenario de compatibilidad
 *    comprueba que quien NO lo mande (una pantalla vieja, un script) sigue funcionando.
 *  - `20260918170000_tejidos_patrones_imagen_muestra_e_indice_etiquetas`: producción tiene
 *    `tejidos.imagen_muestra_url`, `patrones.imagen_muestra_url` y el índice
 *    `variante_etiquetas_etiqueta_idx`; el repo no. Hoy el front solo usa la de `colores`,
 *    así que no rompe nada: es deriva de esquema, y esto la deja registrada.
 *
 * Mismo mecanismo que `scripts/pruebas/registrar_cambio.mjs` (`docker exec ... psql` +
 * `set local request.jwt.claim.sub` + `ROLLBACK` siempre): nunca se commitea nada, así que
 * corre seguro contra el Postgres local compartido. El escenario del TRUNCATE toma
 * `ACCESS EXCLUSIVE` sobre las tablas que dependen de `movimientos` mientras dura su
 * transacción (segundos): otra sesión que las use en ese instante espera.
 *
 * USO
 *   pnpm pruebas:deriva-produccion    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;

// `resultado` (lo que devolvió `correr`) se imprime solo si falla: distingue "la migración
// no está" de "el fixture se rompió antes de llegar".
function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 400)}`);
  }
}

const contarFirmas = (funcion) =>
  `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = '${funcion}';`;

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- registrar_movimiento: una sola firma ----
  const firmasMov = correr(contarFirmas("registrar_movimiento"));
  esperar("registrar_movimiento tiene una sola firma", firmasMov.ok && firmasMov.salida === "1", firmasMov);

  // El caso real: el front no manda p_sububicacion_id en ubicaciones sin piso/almacén, así
  // que la llamada trae solo los obligatorios. Con dos sobrecargas era ambigua.
  const movSoloObligatorios = correr(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.registrar_movimiento(p_variante_id => :'v', p_ubicacion_id => :'ubic', p_tipo => 'entrada', p_cantidad => 1) as mid \\gset
select count(*) from retail.movimientos where id = :'mid';
rollback;
`);
  esperar(
    "registrar_movimiento se llama solo con los 4 obligatorios, sin ambigüedad",
    movSoloObligatorios.ok && movSoloObligatorios.salida === "1",
    movSoloObligatorios
  );

  // ---- catalogo_actualizar_producto: una sola firma ----
  const firmasCat = correr(contarFirmas("catalogo_actualizar_producto"));
  esperar("catalogo_actualizar_producto tiene una sola firma", firmasCat.ok && firmasCat.salida === "1", firmasCat);

  // Los 10 argumentos con nombre que manda ProductoForm. El producto no existe: cualquier
  // resultado sirve MENOS "is not unique" (la ambigüedad se resuelve antes de ejecutar).
  const catDiezArgumentos = correr(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select retail.catalogo_actualizar_producto(
  p_producto_id => gen_random_uuid(), p_referencia => 'prueba', p_estado => 'activo',
  p_variantes => '[]'::jsonb, p_categoria_id => null, p_descripcion => null,
  p_stock_minimo => null, p_temporada => null, p_permitir_venta_sin_stock => false, p_fotos => null);
rollback;
`);
  esperar(
    "catalogo_actualizar_producto se llama con los 10 argumentos del front, sin ambigüedad",
    catDiezArgumentos.ok || !catDiezArgumentos.mensaje.includes("is not unique"),
    catDiezArgumentos
  );

  // ---- historial de producto: el cambio de estado deja rastro ----
  const historialEstado = correr(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select p.id as pid from retail.productos p join retail.variantes v on v.producto_id = p.id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select estado as estado_antes from retail.productos where id = :'pid' \\gset
update retail.productos set estado = case when :'estado_antes' = 'activo' then 'descontinuado' else 'activo' end where id = :'pid';
select count(*) from retail.historial_producto_cambios where entidad = 'producto' and entidad_id = :'pid' and campo = 'estado' and created_at >= now();
rollback;
`);
  esperar(
    "cambiar el estado de un producto deja una fila de estado en el historial",
    historialEstado.ok && historialEstado.salida === "1",
    historialEstado
  );

  // ---- movimientos: el libro no se vacía ----
  const truncar = correr(`
begin;
set local lock_timeout = '5s';
truncate retail.movimientos cascade;
rollback;
`);
  esperar(
    "TRUNCATE ... CASCADE sobre movimientos se rechaza",
    !truncar.ok && truncar.mensaje.includes("no se vacía"),
    truncar
  );

  // ---- vocabulario de tejidos y patrones: foto de muestra + índice de etiquetas ----
  // Son de esquema (no hay comportamiento que ejercitar): existe o no existe.
  const columnasMuestra = correr(
    `select string_agg(table_name || ':' || data_type || ':' || is_nullable, ',' order by table_name) from information_schema.columns where table_schema = 'retail' and table_name in ('tejidos', 'patrones') and column_name = 'imagen_muestra_url';`
  );
  esperar(
    "tejidos y patrones tienen imagen_muestra_url (text, nullable)",
    columnasMuestra.ok && columnasMuestra.salida === "patrones:text:YES,tejidos:text:YES",
    columnasMuestra
  );

  const indiceEtiquetas = correr(
    `select indexdef from pg_indexes where schemaname = 'retail' and indexname = 'variante_etiquetas_etiqueta_idx';`
  );
  esperar(
    "variante_etiquetas tiene su índice por etiqueta_id",
    indiceEtiquetas.ok && indiceEtiquetas.salida.includes("USING btree (etiqueta_id)"),
    indiceEtiquetas
  );

  // ---- compras: candado de idempotencia (token_cliente / p_token) ----
  const esquemaToken = correr(
    `select (select data_type || ':' || is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'token_cliente') || '|' || coalesce((select indexdef from pg_indexes where schemaname = 'retail' and indexname = 'compras_token_cliente_key'), 'sin índice');`
  );
  esperar(
    "compras.token_cliente existe (uuid, nullable) con índice único compras_token_cliente_key",
    esquemaToken.ok &&
      esquemaToken.salida.startsWith("uuid:YES|") &&
      esquemaToken.salida.includes("UNIQUE INDEX compras_token_cliente_key") &&
      esquemaToken.salida.includes("(token_cliente)"),
    esquemaToken
  );

  const firmasCompra = correr(
    `select count(*) || '|' || coalesce(bool_and(pg_get_function_arguments(p.oid) like '%p_token uuid%'), false) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'registrar_compra';`
  );
  esperar("registrar_compra tiene una sola firma, y trae p_token", firmasCompra.ok && firmasCompra.salida === "1|true", firmasCompra);

  // Una compra a crédito (no pide pago) con una línea de BLU-EMMA-NEG-M. La serie es
  // aleatoria para no chocar con la llave única (proveedor, serie, número).
  const FIXTURE_COMPRA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select p.id as pid, v.id as vid from retail.productos p join retail.variantes v on v.producto_id = p.id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select 'T' || substr(md5(random()::text), 1, 6) as ser \\gset
`;
  const llamada = (numero, token) => `select retail.registrar_compra(
  p_proveedor_id => :'prov', p_serie => :'ser', p_numero => '${numero}', p_condicion => 'credito',
  p_ubicacion_destino_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('producto_id', :'pid', 'variante_id', :'vid', 'cantidad', 2, 'costo_unitario', 10)),
  p_fecha_vencimiento => current_date + 30${token ? `, p_token => :'${token}'` : ""})`;

  const mismoToken = correr(`${FIXTURE_COMPRA}
select gen_random_uuid() as tok \\gset
${llamada("1", "tok")} as c1 \\gset
${llamada("1", "tok")} as c2 \\gset
select (:'c1' = :'c2') || '|' || (select count(*) from retail.compras where token_cliente = :'tok'::uuid);
rollback;
`);
  esperar("el mismo p_token dos veces devuelve la misma compra y no la duplica", mismoToken.ok && mismoToken.salida === "true|1", mismoToken);

  // Compatibilidad con el front de hoy, que no manda p_token: dos compras distintas sin token
  // siguen funcionando (varios NULL caben en un índice único).
  const sinToken = correr(`${FIXTURE_COMPRA}
${llamada("1", null)} as c1 \\gset
${llamada("2", null)} as c2 \\gset
select count(*) from retail.compras where proveedor_id = :'prov' and serie = upper(:'ser');
rollback;
`);
  esperar("sin p_token (como manda el front hoy) dos compras distintas se registran", sinToken.ok && sinToken.salida === "2", sinToken);

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
