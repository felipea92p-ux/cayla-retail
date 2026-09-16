#!/usr/bin/env node
/**
 * Pruebas de "editar un producto que nació sin SKU" contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. El censo carga prendas por /productos/nuevo
 * (`crear_producto_con_variantes`), que no pide SKU a propósito: la etiqueta usa
 * `variantes.codigo`. Pero `catalogo_actualizar_producto` y `catalogo_crear_producto`
 * exigían SKU en cada variante, así que una prenda del censo no se podía volver a
 * guardar (ni precio, ni foto, ni categoría, ni estado). Corregido en
 * `supabase/migrations/20260916193000_catalogo_sku_opcional.sql`. Estas pruebas fijan
 * la regla nueva: SKU opcional, vacío se guarda NULL (nunca '', que chocaría contra el
 * índice único de sku en la segunda talla), y la identidad de una variante existente
 * sigue sin tocarse.
 *
 * CÓMO. Mismo mecanismo que `scripts/pruebas/registrar_cambio.mjs` (ADR-0066):
 * `docker exec ... psql`, sesión simulada con `set local request.jwt.claim.sub`, y cada
 * escenario en su propia transacción que termina en ROLLBACK — nada queda en el
 * Postgres compartido. Además corre como rol `authenticated` (no como `postgres`),
 * porque `catalogo_actualizar_producto` NO es security definer: su único candado son
 * las RLS de productos/variantes, y como superusuario esas políticas no se verían.
 *
 * QUÉ DA POR SENTADO. La categoría con prefijo `BLU` y el color `NEG` (los siembra
 * `20260912235500_vocabulario_cerrado.sql`), y las personas de `supabase/seed.sql`:
 * Felipe (líder) y Micaela (integrante).
 *
 * USO
 *   pnpm pruebas:editar-producto-sin-sku    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
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

/**
 * Abre la transacción como Felipe (rol authenticated) y crea una prenda igual que la
 * crea el censo: `crear_producto_con_variantes`, dos tallas del mismo color, sin SKU.
 * Deja `:prod`, `:v_m`, `:v_l` y `:codigo_m` para el escenario.
 */
const PRENDA_DEL_CENSO = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local role authenticated;

select id as cat from retail.categorias where prefijo = 'BLU' and activo limit 1 \\gset
select retail.crear_producto_con_variantes(
  'Prueba sin SKU', :'cat',
  '[{"talla":"M","color_codigo":"NEG","precio":89.90,"costo":30},
    {"talla":"L","color_codigo":"NEG","precio":89.90,"costo":30}]'::jsonb,
  null, gen_random_uuid()) as prod \\gset
select id as v_m, codigo as codigo_m from retail.variantes where producto_id = :'prod' and talla = 'M' \\gset
select id as v_l from retail.variantes where producto_id = :'prod' and talla = 'L' \\gset
`;

/** Llama a la RPC de edición como la manda ProductoForm.tsx. `variantes` es SQL jsonb. */
function editar(variantes, { estado = "activo" } = {}) {
  return `
select retail.catalogo_actualizar_producto(
  p_producto_id => :'prod',
  p_referencia => 'Prueba sin SKU',
  p_estado => '${estado}',
  p_variantes => ${variantes},
  p_categoria_id => :'cat',
  p_permitir_venta_sin_stock => false,
  p_fotos => '[]'::jsonb
) as _editado \\gset
`;
}

/** Una fila de variante existente tal como la arma el formulario. */
function existente(idVar, { talla, precio, sku }) {
  return `jsonb_build_object('id', :'${idVar}', 'color_codigo', 'NEG', 'talla', '${talla}', 'sku', ${sku}, 'precio', ${precio}, 'costo', 30, 'activo', true)`;
}

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1-2: el caso de tienda — la prenda del censo vuelve a guardarse
// ---------------------------------------------------------------------------

exito(
  "prenda del censo: cambia el precio con sku null y el SKU sigue NULL",
  `${PRENDA_DEL_CENSO}
${editar(`jsonb_build_array(${existente("v_m", { talla: "M", precio: 129.9, sku: "null" })}, ${existente("v_l", { talla: "L", precio: 89.9, sku: "null" })})`, { estado: "descontinuado" })}
select
  (select precio from retail.variantes where id = :'v_m'),
  (select count(*) from retail.variantes where producto_id = :'prod' and sku is null),
  (select count(*) from retail.variantes where producto_id = :'prod' and sku = ''),
  (select codigo from retail.variantes where id = :'v_m') = :'codigo_m',
  (select estado from retail.productos where id = :'prod');
rollback;
`,
  ([precioM, skuNull, skuVacio, mismoCodigo, estado]) =>
    Number(precioM) === 129.9 && Number(skuNull) === 2 && Number(skuVacio) === 0 && mismoCodigo === "t" && estado === "descontinuado"
);

exito(
  "ficha abierta antes del cambio (manda sku '') también guarda, y no escribe ''",
  `${PRENDA_DEL_CENSO}
${editar(`jsonb_build_array(${existente("v_m", { talla: "M", precio: 99, sku: "''" })}, ${existente("v_l", { talla: "L", precio: 99, sku: "''" })})`)}
select
  (select count(*) from retail.variantes where producto_id = :'prod' and precio = 99),
  (select count(*) from retail.variantes where producto_id = :'prod' and sku is null);
rollback;
`,
  ([conPrecioNuevo, skuNull]) => Number(conPrecioNuevo) === 2 && Number(skuNull) === 2
);

// ---------------------------------------------------------------------------
// 3-5: variantes nuevas, SKU opcional, sin choques
// ---------------------------------------------------------------------------

exito(
  "dos tallas nuevas sin SKU en el mismo producto no chocan (NULL, no '')",
  `${PRENDA_DEL_CENSO}
${editar(`jsonb_build_array(
  ${existente("v_m", { talla: "M", precio: 89.9, sku: "null" })},
  ${existente("v_l", { talla: "L", precio: 89.9, sku: "null" })},
  jsonb_build_object('color_codigo', 'NEG', 'talla', 'S', 'sku', null, 'precio', 89.9, 'costo', 30),
  jsonb_build_object('color_codigo', 'NEG', 'talla', 'XL', 'sku', '   ', 'precio', 89.9, 'costo', 30)
)`)}
select
  (select count(*) from retail.variantes where producto_id = :'prod'),
  (select count(*) from retail.variantes where producto_id = :'prod' and sku is null),
  (select count(*) from retail.variantes where producto_id = :'prod' and codigo is not null);
rollback;
`,
  ([total, skuNull, conCodigo]) => Number(total) === 4 && Number(skuNull) === 4 && Number(conCodigo) === 4
);

exito(
  "un SKU escrito a mano en una talla nueva se sigue guardando, recortado",
  `${PRENDA_DEL_CENSO}
select 'PRUEBA-SKU-' || substr(md5(random()::text), 1, 8) as sku_manual \\gset
${editar(`jsonb_build_array(
  ${existente("v_m", { talla: "M", precio: 89.9, sku: "null" })},
  ${existente("v_l", { talla: "L", precio: 89.9, sku: "null" })},
  jsonb_build_object('color_codigo', 'NEG', 'talla', 'S', 'sku', '  ' || :'sku_manual' || ' ', 'precio', 89.9, 'costo', 30)
)`)}
select (select sku from retail.variantes where producto_id = :'prod' and talla = 'S') = :'sku_manual';
rollback;
`,
  ([igual]) => igual === "t"
);

exito(
  "catalogo_crear_producto también acepta variantes sin SKU",
  `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local role authenticated;
select id as cat from retail.categorias where prefijo = 'BLU' and activo limit 1 \\gset
select retail.catalogo_crear_producto(
  p_referencia => 'Prueba alta sin SKU',
  p_variantes => '[{"talla":"M","color_codigo":"NEG","sku":null,"precio":50},
                   {"talla":"L","color_codigo":"NEG","sku":"","precio":50}]'::jsonb,
  p_categoria_id => :'cat'
) as prod \\gset
select
  (select count(*) from retail.variantes where producto_id = :'prod' and sku is null),
  (select count(*) from retail.variantes where producto_id = :'prod' and codigo is not null);
rollback;
`,
  ([skuNull, conCodigo]) => Number(skuNull) === 2 && Number(conCodigo) === 2
);

// ---------------------------------------------------------------------------
// 6-8: lo que NO debía cambiar
// ---------------------------------------------------------------------------

exito(
  "una variante existente no cambia talla ni SKU aunque el payload traiga otros",
  `${PRENDA_DEL_CENSO}
${editar(`jsonb_build_array(${existente("v_m", { talla: "XS", precio: 89.9, sku: "'INTENTO-CAMBIAR'" })}, ${existente("v_l", { talla: "L", precio: 89.9, sku: "null" })})`)}
select talla, coalesce(sku, '(null)'), codigo = :'codigo_m' from retail.variantes where id = :'v_m';
rollback;
`,
  ([talla, sku, mismoCodigo]) => talla === "M" && sku === "(null)" && mismoCodigo === "t"
);

error(
  "una variante sin precio se sigue rechazando",
  `${PRENDA_DEL_CENSO}
${editar(`jsonb_build_array(jsonb_build_object('id', :'v_m', 'color_codigo', 'NEG', 'talla', 'M', 'sku', null, 'costo', 30, 'activo', true))`)}
`,
  "Cada variante necesita un precio"
);

error(
  "una integrante no puede editar la ficha (RLS sigue siendo el candado)",
  `${PRENDA_DEL_CENSO}
set local request.jwt.claim.sub = '${MICAELA}';
${editar(`jsonb_build_array(${existente("v_m", { talla: "M", precio: 1, sku: "null" })})`)}
`,
  "no existe"
);

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
    } else {
      if (!resultado.ok) {
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
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
