#!/usr/bin/env node
/**
 * Prueba de `20261002200100_productos_facetas.sql` (ADR-0308, tanda 2): cuántas prendas hay en cada opción del filtro.
 *
 * La propiedad que importa: CADA conteo es exactamente el total que trae `fn_productos_listado` al elegir esa opción (con los
 * demás filtros puestos). Si un conteo dijera 12 y la lista trajera 11, la persona dejaría de confiar en los números. Se
 * comprueba opción por opción (categoría, marca, proveedor, color, familia, talla, temporada, estado, falta, disponibilidad)
 * y tramo por tramo del precio, en ocho escenas. Y: ninguna opción con 0 aparece; el rango de precio no se encoge con el
 * propio filtro de precio; con menos de 4 prendas no hay tramos.
 *
 * Cada escena corre en su transacción con las dos migraciones aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:productos-facetas   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = `${leer("20261002200000_productos_listado_por_variante.sql")}\n${leer("20261002200100_productos_facetas.sql")}`;
const FELIPE = "22222222-2222-4222-8222-000000000001";
const LIMA = "(select id from retail.ubicaciones where nombre = 'Tienda Lima')";
const SIN = "'00000000-0000-0000-0000-000000000000'::uuid";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}
const SESION = `set local request.jwt.claim.sub = '${FELIPE}';\nset local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';`;
const dentro = (escena, consulta) =>
  psql(`begin;\n${MIGRACIONES}\n${SESION}\nset local session_replication_role = replica;\n${escena}\nset local session_replication_role = origin;\n${consulta}\nrollback;`);

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

/** Los filtros de una escena como un objeto { p_x: "expresión SQL" }; se reemplaza el de una faceta para contar esa opción. */
const args = (o) => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${k} => ${v}`).join(", ");
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** El filtro que aplica una opción de una faceta, sobre los de la escena (sin el propio filtro de esa faceta). */
function conOpcion(base, faceta, valor) {
  const o = { ...base };
  switch (faceta) {
    case "categoria": o.p_categoria_id = valor === "sin" ? null : `${lit(valor)}::uuid`; break;
    case "marca": o.p_marca_id = valor === "sin" ? SIN : `${lit(valor)}::uuid`; break;
    case "proveedor": o.p_proveedor_id = valor === "sin" ? SIN : `${lit(valor)}::uuid`; break;
    case "estado": o.p_estado = lit(valor); break;
    case "color": o.p_colores = `array[${lit(valor)}]`; o.p_familias = null; break;
    case "familia": o.p_familias = `array[${lit(valor)}]`; o.p_colores = null; break;
    case "talla": o.p_tallas = `array[${lit(valor)}::uuid]`; break;
    case "temporada": o.p_temporada = lit(valor); break;
    case "falta": o.p_falta = lit(valor); break;
    case "disponibilidad": o.p_disponibilidad = lit(valor); break;
  }
  return o;
}

/** Comprueba la propiedad en una escena: total, cada opción de cada faceta y cada tramo = lo que trae el listado. */
function comprobarEscena(nombre, base, escena = "") {
  caso(`${nombre}: cada conteo es lo que trae la lista al elegir esa opción`, () => {
    const f = JSON.parse(dentro(escena, `select retail.fn_productos_facetas(${args(base)})::text;`));
    const consultas = [];
    const etiquetas = [];
    const cuenta = (o) => `select coalesce(max(total_productos), 0) from retail.fn_productos_listado(${args({ ...o, p_por_pagina: 1 })});`;
    consultas.push(cuenta(base));
    etiquetas.push(["total", f.total]);
    for (const [faceta, valores] of Object.entries(f.facetas)) {
      for (const [valor, n] of Object.entries(valores)) {
        if (n === 0) {
          // La disponibilidad lista sus cinco opciones siempre (la pantalla esconde las de 0); las demás no traen ceros.
          if (faceta !== "disponibilidad") return `la faceta «${faceta}» trae «${valor}» con 0: las vacías no deben venir`;
        }
        consultas.push(cuenta(conOpcion(base, faceta, valor)));
        etiquetas.push([`${faceta}=${valor}`, n]);
      }
    }
    for (const t of f.tramos) {
      consultas.push(cuenta({ ...base, p_precio_min: t.desde ?? null, p_precio_max: t.hasta ?? null }));
      etiquetas.push([`tramo ${t.desde ?? "…"}–${t.hasta ?? "…"}`, t.n]);
    }
    const reales = dentro(escena, consultas.join("\n")).split("\n").map(Number);
    const malos = etiquetas.map(([e, n], i) => (Number(n) === reales[i] ? null : `${e}: dice ${n} y la lista trae ${reales[i]}`)).filter(Boolean);
    if (malos.length) return malos.slice(0, 5).join("; ");
    return etiquetas.length < 5 ? `muy pocas opciones comprobadas (${etiquetas.length}): la escena no prueba nada` : null;
  });
}

const ACTIVAS = { p_estado: "'activo'" };
const TALLA_M = "(select id from retail.tallas where valor = 'M')";

comprobarEscena("sin filtros (solo activas)", ACTIVAS);
comprobarEscena("negro", { ...ACTIVAS, p_colores: "'{NEG}'" });
comprobarEscena("hay en Lima", { ...ACTIVAS, p_disponibilidad: "'en_sede'", p_ubicacion_id: LIMA });
comprobarEscena("familia azul en talla M", { ...ACTIVAS, p_familias: "'{azul}'", p_tallas: `array[${TALLA_M}]`, p_ubicacion_id: LIMA });
comprobarEscena("sin stock en Lima, casacas", {
  ...ACTIVAS,
  p_disponibilidad: "'sin_sede'",
  p_ubicacion_id: LIMA,
  p_categoria_id: "(select id from retail.categorias where nombre = 'Casacas')",
});
comprobarEscena(
  "sin stock en ninguna sede (una prenda vaciada)",
  { ...ACTIVAS, p_disponibilidad: "'sin_red'" },
  `update retail.stock s set cantidad = 0, cantidad_apartada = 0 from retail.variantes v, retail.productos p
     where v.id = s.variante_id and p.id = v.producto_id and p.referencia in ('Falda Ariana', 'Casaca Luciana');`
);
comprobarEscena(
  "sin temporada y sin foto",
  { ...ACTIVAS, p_temporada: "'sin'", p_falta: "'foto'" },
  `update retail.productos set temporada = 'verano' where referencia = 'Casaca Luciana';
   update retail.productos set marca_id = null where referencia = 'Falda Renata';`
);
comprobarEscena("precio de 70 a 120", { ...ACTIVAS, p_precio_min: 70, p_precio_max: 120 });

caso("conteo disyuntivo: con «Casacas» elegida, las otras categorías siguen con su número (si no, no se podría cambiar)", () => {
  const cat = JSON.parse(dentro("", `select (retail.fn_productos_facetas(p_estado => 'activo', p_categoria_id => (select id from retail.categorias where nombre = 'Casacas')) -> 'facetas' -> 'categoria')::text;`));
  const sinFiltro = JSON.parse(dentro("", `select (retail.fn_productos_facetas(p_estado => 'activo') -> 'facetas' -> 'categoria')::text;`));
  return JSON.stringify(cat) === JSON.stringify(sinFiltro) ? null : `con Casacas ${JSON.stringify(cat)} y sin filtro ${JSON.stringify(sinFiltro)}`;
});

caso("conteo disyuntivo: con «negro» marcado, los demás colores siguen con su número", () => {
  const n = Object.keys(JSON.parse(dentro("", `select (retail.fn_productos_facetas(p_estado => 'activo', p_colores => '{NEG}') -> 'facetas' -> 'color')::text;`))).length;
  return n > 1 ? null : `solo trajo ${n} color(es)`;
});

caso("el rango de precio no se encoge con el propio filtro de precio", () => {
  const sin = JSON.parse(dentro("", `select (retail.fn_productos_facetas(p_estado => 'activo') -> 'precio')::text;`));
  const con = JSON.parse(dentro("", `select (retail.fn_productos_facetas(p_estado => 'activo', p_precio_min => 70, p_precio_max => 120) -> 'precio')::text;`));
  return JSON.stringify(sin) === JSON.stringify(con) ? null : `sin filtro ${JSON.stringify(sin)}, con filtro ${JSON.stringify(con)}`;
});

caso("con menos de 4 prendas no hay tramos (un tramo sería una prenda)", () => {
  const t = dentro("", `select (retail.fn_productos_facetas(p_estado => 'activo', p_categoria_id => (select id from retail.categorias where nombre = 'Casacas')) -> 'tramos')::text;`);
  return t === "[]" ? null : `trajo ${t}`;
});

caso("las categorías de 0 prendas no vienen (los callejones sin salida)", () => {
  const r = dentro("", `
    select count(*) from retail.categorias c
    where c.activo and (retail.fn_productos_facetas(p_estado => 'activo') -> 'facetas' -> 'categoria') ? c.id::text
      and not exists (select 1 from retail.productos p where p.categoria_id = c.id and p.estado = 'activo');`);
  return r === "0" ? null : `${r} categorías sin prendas activas aparecen con conteo`;
});

caso("sin sesión de retail no se cuentan", () => {
  try {
    psql(`begin;\n${MIGRACIONES}\nselect retail.fn_productos_facetas();\nrollback;`);
    return "se contó sin sesión";
  } catch (e) {
    return /Sin acceso al catálogo/.test(String(e.stderr)) ? null : String(e.stderr).split("\n")[0];
  }
});

caso("aplicar las migraciones dos veces no falla", () => {
  psql(`begin;\n${MIGRACIONES}\n${MIGRACIONES}\nrollback;`);
  return null;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);
