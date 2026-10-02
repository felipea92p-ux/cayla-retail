#!/usr/bin/env node
/**
 * Prueba de `20261002200000_productos_listado_por_variante.sql` (ADR-0308, tanda 2): el listado nuevo de Productos filtra por
 * VARIANTE (color, talla, precio, temporada y stock de la sede se exigen a la misma variante), no cuenta variantes
 * desactivadas, suma Talla, familia de color, Temporada, «Por completar» y Disponibilidad en la sede y en la red, y busca
 * sin tildes, por categoría y color, con los símbolos literales.
 *
 * La escena: los 10 productos de la siembra local, con cambios puestos a mano dentro de cada transacción. Cada caso corre con
 * la migración aplicada dentro y TERMINA EN ROLLBACK: no deja nada.
 *
 * Los controles: donde el listado nuevo corrige algo, el mismo caso corre contra `fn_productos` (la de hoy) y debe salir
 * DISTINTO: prueba de que el caso mira el defecto y no pasa por casualidad.
 *
 * USO: pnpm pruebas:productos-listado   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const LISTADO = readFileSync(join(RAIZ, "supabase/migrations/20261002200000_productos_listado_por_variante.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed
const LIMA = "(select id from retail.ubicaciones where nombre = 'Tienda Lima')";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

const SESION = `set local request.jwt.claim.sub = '${FELIPE}';\nset local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';`;
const dentro = (escena, consulta, { sesion = true } = {}) =>
  psql(`begin;\n${LISTADO}\n${sesion ? SESION : ""}\nset local session_replication_role = replica;\n${escena}\nset local session_replication_role = origin;\n${consulta}\nrollback;`);

/** Los productos que devuelve una función, sin repetir, en orden de aparición, separados por «|». */
const NOMBRES = (fn, args) => `
select coalesce(string_agg(referencia, '|' order by primero), '') from (
  select referencia, min(rn) as primero from (select referencia, row_number() over () as rn from retail.${fn}(${args})) x group by referencia
) y;`;
const ordenados = (s) => s.split("|").filter(Boolean).sort((a, b) => a.localeCompare(b, "es")).join("|");

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
const igual = (real, esperado) => (real === esperado ? null : `esperaba «${esperado}» y salió «${real}»`);

// ── La misma variante ─────────────────────────────────────────────────────────────────────────────────────────────────
// Blusa Emma: BEI a S/ 79.90 y NEG subida a S/ 120. «Negra hasta S/ 80» no tiene ninguna variante que cumpla las dos.
const EMMA_NEGRA_CARA = `update retail.variantes v set precio = 120 from retail.productos p where p.id = v.producto_id and p.referencia = 'Blusa Emma' and v.color_codigo = 'NEG';`;

caso("la misma variante: «negra hasta S/ 80» no trae una blusa cuya negra cuesta S/ 120", () =>
  igual(dentro(EMMA_NEGRA_CARA, NOMBRES("fn_productos_listado", `p_colores => '{NEG}', p_precio_max => 80, p_por_pagina => 100`)), "Falda Renata"));

caso("control: `fn_productos` (la de hoy) sí la traía (color y precio por separado)", () => {
  const r = dentro(EMMA_NEGRA_CARA, NOMBRES("fn_productos", `p_color_codigo => 'NEG', p_precio_max => 80, p_por_pagina => 100`));
  return r.includes("Blusa Emma") ? null : `esperaba ver «Blusa Emma» en la de hoy y salió «${r}»`;
});

// ── Variantes desactivadas ────────────────────────────────────────────────────────────────────────────────────────────
const ARIANA_TALLA_VIEJA = `update retail.variantes v set precio = 20, activo = false from retail.productos p where p.id = v.producto_id and p.referencia = 'Falda Ariana' and v.talla_id = (select id from retail.tallas where valor = 'S');`;

caso("una talla desactivada a S/ 20 no hace pasar a la prenda por «hasta S/ 30»", () =>
  igual(dentro(ARIANA_TALLA_VIEJA, NOMBRES("fn_productos_listado", `p_precio_max => 30, p_por_pagina => 100`)), ""));

caso("control: `fn_productos` sí la traía (contaba la desactivada)", () =>
  igual(dentro(ARIANA_TALLA_VIEJA, NOMBRES("fn_productos", `p_precio_max => 30, p_por_pagina => 100`)), "Falda Ariana"));

// ── Talla, color y familia ────────────────────────────────────────────────────────────────────────────────────────────
caso("talla 28: solo los pantalones", () =>
  igual(ordenados(dentro("", NOMBRES("fn_productos_listado", `p_tallas => array[(select id from retail.tallas where valor = '28')], p_por_pagina => 100`))), "Pantalón Carla|Pantalón Mía"));

caso("familia azul: las prendas con algún color de la familia", () =>
  igual(ordenados(dentro("", NOMBRES("fn_productos_listado", `p_familias => '{azul}', p_por_pagina => 100`))), "Casaca Ximena|Pantalón Mía|Vestido Sofía"));

caso("un color O una familia (dentro del filtro de color se suma)", () =>
  igual(
    ordenados(dentro("", NOMBRES("fn_productos_listado", `p_colores => '{ROS}', p_familias => '{azul}', p_por_pagina => 100`))),
    "Blusa Valentina|Casaca Ximena|Falda Ariana|Pantalón Mía|Vestido Antonella|Vestido Sofía"
  ));

caso("dos colores a la vez (negro o rosado)", () =>
  igual(
    ordenados(dentro("", NOMBRES("fn_productos_listado", `p_colores => '{NEG,ROS}', p_por_pagina => 100`))),
    "Blusa Emma|Blusa Valentina|Casaca Ximena|Falda Ariana|Falda Renata|Pantalón Carla|Vestido Antonella|Vestido Sofía"
  ));

// ── Temporada y «Por completar» ───────────────────────────────────────────────────────────────────────────────────────
const LUCIANA_INVIERNO = `update retail.productos set temporada = 'otoño-invierno' where referencia = 'Casaca Luciana';`;
caso("temporada: la de la prenda", () =>
  igual(dentro(LUCIANA_INVIERNO, NOMBRES("fn_productos_listado", `p_temporada => 'otoño-invierno', p_por_pagina => 100`)), "Casaca Luciana"));
caso("temporada «sin»: todas las demás", () =>
  igual(dentro(LUCIANA_INVIERNO, `select count(distinct producto_id) from retail.fn_productos_listado(p_temporada => 'sin', p_por_pagina => 100);`), "9"));
caso("por completar ▸ temporada: lo mismo que «sin temporada»", () =>
  igual(dentro(LUCIANA_INVIERNO, `select count(distinct producto_id) from retail.fn_productos_listado(p_falta => 'temporada', p_por_pagina => 100);`), "9"));

caso("por completar ▸ foto: sin la que tiene foto", () =>
  igual(
    dentro(
      `insert into retail.producto_fotos (producto_id, url, orden) select id, 'https://x/emma.jpg', 0 from retail.productos where referencia = 'Blusa Emma';`,
      `select count(distinct producto_id) || '|' || bool_or(referencia = 'Blusa Emma') from retail.fn_productos_listado(p_falta => 'foto', p_por_pagina => 100);`
    ),
    "9|false"
  ));

caso("por completar ▸ marca: la que no tiene marca", () =>
  igual(dentro(`update retail.productos set marca_id = null where referencia = 'Falda Renata';`, NOMBRES("fn_productos_listado", `p_falta => 'marca', p_por_pagina => 100`)), "Falda Renata"));

// ── Disponibilidad ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Las prendas con stock disponible en Lima calculadas por su lado (la cifra única), para comparar. */
const CON_STOCK_EN_LIMA = (color) => `
select coalesce(string_agg(distinct p.referencia, '|' order by p.referencia), '') from retail.fn_existencias_base(${LIMA}, null) e
join retail.productos p on p.id = e.producto_id join retail.variantes v on v.id = e.variante_id
where e.disponible > 0 and not e.talla_retirada and v.activo ${color ? `and v.color_codigo = '${color}'` : ""};`;

caso("hay en Lima: las que tienen stock disponible aquí (la cifra única)", () =>
  igual(ordenados(dentro("", NOMBRES("fn_productos_listado", `p_disponibilidad => 'en_sede', p_ubicacion_id => ${LIMA}, p_por_pagina => 100`))), dentro("", CON_STOCK_EN_LIMA())));

caso("sin stock en Lima: las otras cinco (Lima tiene 5 de 10)", () => {
  const hay = dentro("", CON_STOCK_EN_LIMA()).split("|");
  const sin = dentro("", NOMBRES("fn_productos_listado", `p_disponibilidad => 'sin_sede', p_ubicacion_id => ${LIMA}, p_por_pagina => 100`)).split("|");
  if (sin.length !== 5) return `esperaba 5 y salieron ${sin.length}: ${sin.join(", ")}`;
  return sin.some((n) => hay.includes(n)) ? `una prenda con stock en Lima salió como «sin stock en Lima»: ${sin.join(", ")}` : null;
});

// Vestido Sofía queda con stock en Lima solo en negro: «hay en Lima» la trae, «azul marino que haya en Lima» no (por
// producto, «tiene azul marino» Y «tiene stock en Lima» la habría traído).
const SOFIA_SOLO_NEGRO_EN_LIMA = `update retail.stock s set cantidad = 0, cantidad_apartada = 0 from retail.variantes v, retail.productos p
  where v.id = s.variante_id and p.id = v.producto_id and p.referencia = 'Vestido Sofía' and v.color_codigo = 'AZM' and s.ubicacion_id = ${LIMA};`;
caso("la misma variante con el stock: «azul marino que haya en Lima» exige la azul marino aquí", () => {
  const conColor = ordenados(dentro(SOFIA_SOLO_NEGRO_EN_LIMA, NOMBRES("fn_productos_listado", `p_disponibilidad => 'en_sede', p_ubicacion_id => ${LIMA}, p_colores => '{AZM}', p_por_pagina => 100`)));
  const sinColor = dentro(SOFIA_SOLO_NEGRO_EN_LIMA, NOMBRES("fn_productos_listado", `p_disponibilidad => 'en_sede', p_ubicacion_id => ${LIMA}, p_por_pagina => 100`));
  if (!sinColor.includes("Vestido Sofía")) return `la escena no sirve: sin color, Vestido Sofía debería tener stock en Lima (${sinColor})`;
  return igual(conColor, dentro(SOFIA_SOLO_NEGRO_EN_LIMA, CON_STOCK_EN_LIMA("AZM"))) ?? (conColor.includes("Vestido Sofía") ? "trajo Vestido Sofía sin azul marino en Lima" : null);
});

caso("sin stock en ninguna sede = el «sin stock» de hoy (la red)", () => {
  const escena = `update retail.stock s set cantidad = 0, cantidad_apartada = 0 from retail.variantes v, retail.productos p where v.id = s.variante_id and p.id = v.producto_id and p.referencia = 'Falda Ariana';`;
  const nuevo = dentro(escena, NOMBRES("fn_productos_listado", `p_disponibilidad => 'sin_red', p_por_pagina => 100`));
  const hoy = dentro(escena, NOMBRES("fn_productos", `p_stock => 'sin_stock', p_por_pagina => 100`));
  return igual(nuevo, hoy) ?? igual(nuevo, "Falda Ariana");
});

caso("filtrar por la sede sin decir cuál se rechaza (no se inventa una sede)", () => {
  try {
    dentro("", `select count(*) from retail.fn_productos_listado(p_disponibilidad => 'en_sede');`);
    return "no se rechazó";
  } catch (e) {
    return /hace falta la sede/.test(String(e.stderr)) ? null : String(e.stderr).split("\n")[0];
  }
});

// ── Buscador ──────────────────────────────────────────────────────────────────────────────────────────────────────────
caso("sin tildes: «sueter» encuentra «Suéter»", () =>
  igual(dentro(`update retail.productos set referencia = 'Suéter Valentina' where referencia = 'Blusa Valentina';`, NOMBRES("fn_productos_listado", `p_busqueda => 'sueter', p_por_pagina => 100`)), "Suéter Valentina"));

caso("por categoría y color: «blusa negra» trae la blusa que tiene negro, no la otra", () =>
  igual(dentro("", NOMBRES("fn_productos_listado", `p_busqueda => 'blusa negra', p_por_pagina => 100`)), "Blusa Emma"));

caso("«50%» es texto, no un comodín (no trae el catálogo)", () =>
  igual(dentro("", `select count(distinct producto_id) from retail.fn_productos_listado(p_busqueda => '50%', p_por_pagina => 100);`), "0"));

caso("control: la búsqueda de hoy con «%» sí traía de más", () => {
  const r = Number(dentro("", `select coalesce(array_length(retail.fn_productos_buscar('a%'), 1), 0);`));
  const nuevo = Number(dentro("", `select coalesce(array_length(retail.fn_productos_buscar_palabras('a%'), 1), 0);`));
  return r > nuevo ? null : `esperaba que «a%» trajera más con la de hoy (${r}) que con la nueva (${nuevo})`;
});

caso("código de barras exacto, como siempre", () => {
  const codigo = dentro("", `select cb.codigo from retail.codigos_barras cb join retail.variantes v on v.id = cb.variante_id join retail.productos p on p.id = v.producto_id where p.referencia = 'Casaca Luciana' limit 1;`);
  return igual(dentro("", NOMBRES("fn_productos_listado", `p_busqueda => '${codigo}', p_por_pagina => 100`)), "Casaca Luciana");
});

// ── Lo de siempre no cambia ───────────────────────────────────────────────────────────────────────────────────────────
for (const orden of ["recientes", "precio_asc", "precio_desc", null]) {
  caso(`sin filtros nuevos, el mismo orden y total que \`fn_productos\` (${orden ?? "nombre"})`, () => {
    const args = `${orden ? `p_orden => '${orden}', ` : ""}p_por_pagina => 100`;
    const r = igual(dentro("", NOMBRES("fn_productos_listado", args)), dentro("", NOMBRES("fn_productos", args)));
    if (r) return r;
    return igual(
      dentro("", `select max(total_productos) || '|' || count(*) from retail.fn_productos_listado(${args});`),
      dentro("", `select max(total_productos) || '|' || count(*) from retail.fn_productos(${args});`)
    );
  });
}

caso("paginado: la página 2 sigue a la 1, sin repetir ni saltar", () => {
  const p1 = dentro("", NOMBRES("fn_productos_listado", `p_orden => 'recientes', p_pagina => 1, p_por_pagina => 3`)).split("|");
  const p2 = dentro("", NOMBRES("fn_productos_listado", `p_orden => 'recientes', p_pagina => 2, p_por_pagina => 3`)).split("|");
  const todo = dentro("", NOMBRES("fn_productos_listado", `p_orden => 'recientes', p_por_pagina => 100`)).split("|");
  return igual([...p1, ...p2].join("|"), todo.slice(0, 6).join("|"));
});

caso("sin sesión de retail no se lee el catálogo", () => {
  try {
    dentro("", `select count(*) from retail.fn_productos_listado();`, { sesion: false });
    return "se leyó sin sesión";
  } catch (e) {
    return /Sin acceso al catálogo/.test(String(e.stderr)) ? null : String(e.stderr).split("\n")[0];
  }
});

caso("aplicar la migración dos veces no falla", () => {
  psql(`begin;\n${LISTADO}\n${LISTADO}\nrollback;`);
  return null;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);
