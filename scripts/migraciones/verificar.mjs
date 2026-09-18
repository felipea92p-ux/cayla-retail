#!/usr/bin/env node
/**
 * Verificador de migraciones — la otra mitad: "qué promete cada archivo".
 *
 * EL PROBLEMA QUE RESUELVE. `supabase/migrations/` se pega a mano en el SQL Editor de
 * producción y `supabase/unificacion/` ni siquiera existe para el historial de Supabase.
 * Son 74 archivos y cero forma de saber cuáles corrieron. El BACKLOG lo llama "la deuda
 * que produce todas las anteriores", y tiene razón: la 0030 costó un round-trip por el
 * prefijo `retail.`, y las 20/21/22 se descubrieron sin aplicar solo porque una pantalla
 * se rompió con la clienta esperando.
 *
 * QUÉ HACE. Lee cada archivo, extrae los objetos que PROMETE crear (funciones, tablas,
 * columnas, restricciones, índices, políticas) y los busca en el inventario que devuelve
 * `inventario.sql`. Lista lo que falta.
 *
 * LO QUE PUEDE AFIRMAR Y LO QUE NO — y esto es lo que lo hace usable:
 *
 *   · AUSENCIA, con certeza. Si promete `fn_x` y `fn_x` no está en el catálogo, ese
 *     archivo NO corrió. Eso es una afirmación dura y es la dirección que importa.
 *
 *   · PRESENCIA, solo como "existe algo con ese nombre". `create or replace function` se
 *     repite entre archivos —`fn_aplicar_movimiento` se reescribe en 0008, 0010, 0011,
 *     0044 y 0045—, así que encontrarla no dice CUÁL versión está viva. Un archivo en
 *     verde significa "no hay nada que delate que falta", no "corrió".
 *
 *   · Lo que no supo leer lo dice. Un archivo sin promesas detectables sale como tal, no
 *     como aprobado. Un verificador que aprueba lo que no entendió es peor que no tenerlo:
 *     enseña a confiar en un verde que no significa nada. Misma regla que `traducirError`
 *     (ADR-0022) con las huellas que no reconoce.
 *
 * USO
 *   pnpm migraciones:verificar                 → contra el Postgres local (lo consulta solo)
 *   pnpm migraciones:verificar <inventario>    → contra un JSON pegado desde producción
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const CARPETAS = ["supabase/migrations", "supabase/unificacion"];
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

/* ------------------------------------------------------------------ *
   1. Qué promete cada archivo
 * ------------------------------------------------------------------ */

/**
 * Los comentarios se borran ANTES de buscar promesas, y no es un detalle: las cabeceras
 * de este repo explican el problema citando nombres reales de restricciones (`0045` menciona
 * `stock_cantidad_no_negativa` cuatro veces antes de crearla). Sin esto, el verificador
 * inventaría promesas que el archivo nunca hizo.
 */
function sinComentarios(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Quita el calificador de schema, sea cual sea: `retail.stock`, `public.stock` y
 * `storage.objects` se comparan por su nombre pelado. El mismo objeto vive bajo distinto
 * schema según el entorno —y desde la unificación, incluso dentro del mismo proyecto—, así
 * que el nombre es la única llave estable. El precio: dos objetos homónimos en schemas
 * distintos se confunden. A cambio de encontrar lo que falta, se paga.
 */
const pelar = (nombre) => nombre.replace(/^"?[\w]+"?\./, "").replace(/"/g, "").toLowerCase();

function promesasDe(sql) {
  const t = sinComentarios(sql);
  const p = { funciones: [], tablas: [], columnas: [], restricciones: [], indices: [], politicas: [] };
  const todas = (re, fn) => {
    for (const m of t.matchAll(re)) fn(m);
  };

  todas(/create\s+(?:or\s+replace\s+)?function\s+([\w".]+)\s*\(/gi, (m) => p.funciones.push(pelar(m[1])));
  todas(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi, (m) => p.tablas.push(pelar(m[1])));
  todas(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w".]+)/gi, (m) =>
    p.indices.push(pelar(m[1]))
  );
  todas(/add\s+constraint\s+([\w".]+)/gi, (m) => p.restricciones.push(pelar(m[1])));
  todas(/create\s+policy\s+"?([^"\n]+?)"?\s+on\s+([\w".]+)/gi, (m) =>
    p.politicas.push(`${pelar(m[2])}.${m[1].trim().toLowerCase()}`)
  );

  // Una sola sentencia `alter table` puede traer varios `add column`, así que se recorre
  // desde cada `alter table` hasta el `;` que la cierra.
  todas(/alter\s+table\s+(?:only\s+)?([\w".]+)([\s\S]*?);/gi, (m) => {
    const tabla = pelar(m[1]);
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi)) {
      p.columnas.push(`${tabla}.${pelar(c[1])}`);
    }
  });

  for (const k of Object.keys(p)) p[k] = [...new Set(p[k])];
  return p;
}

/* ------------------------------------------------------------------ *
   2. Qué hay en la base
 * ------------------------------------------------------------------ */

function inventarioLocal() {
  // Sin tocar el schema: en local también se llama `retail`, porque `supabase/seed.sql`
  // renombra `public` al terminar de correr las migraciones (ADR-0010).
  const consulta = readFileSync(join(RAIZ, "scripts/migraciones/inventario.sql"), "utf8");
  const salida = execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-f", "-"],
    { input: consulta, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return JSON.parse(salida.trim());
}

function inventarioDeArchivo(ruta) {
  const crudo = readFileSync(ruta, "utf8").trim();
  // El SQL Editor devuelve el JSON dentro de una celda; a veces se copia con comillas.
  const desde = crudo.indexOf("{");
  return JSON.parse(crudo.slice(desde, crudo.lastIndexOf("}") + 1));
}

/* ------------------------------------------------------------------ *
   3. El informe
 * ------------------------------------------------------------------ */

function main() {
  const argumento = process.argv[2];
  let inv;
  try {
    inv = argumento ? inventarioDeArchivo(argumento) : inventarioLocal();
  } catch (e) {
    console.error(
      argumento
        ? `No se pudo leer el inventario de ${argumento}: ${e.message}`
        : `No se pudo consultar el Postgres local (contenedor ${CONTENEDOR_LOCAL}): ${e.message}\n` +
            `Levántalo con \`npx supabase start\`, o pásame un inventario de producción:\n` +
            `  pnpm migraciones:verificar scripts/migraciones/inventario-produccion.json`
    );
    process.exit(1);
  }

  const hay = {
    funciones: new Set(inv.funciones.map((f) => f.nombre.toLowerCase())),
    tablas: new Set(inv.tablas.map((s) => s.toLowerCase())),
    columnas: new Set(inv.columnas.map((s) => s.toLowerCase())),
    restricciones: new Set(inv.restricciones.map((s) => s.toLowerCase())),
    indices: new Set(inv.indices.map((s) => s.toLowerCase())),
    politicas: new Set(inv.politicas.map((s) => s.toLowerCase())),
  };

  const archivos = CARPETAS.flatMap((carpeta) => {
    const dir = join(RAIZ, carpeta);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(dir, f));
  });

  const SINGULAR = {
    funciones: "función",
    tablas: "tabla",
    columnas: "columna",
    restricciones: "restricción",
    indices: "índice",
    politicas: "política",
  };

  // Se informa por carpeta porque no significan lo mismo: `migrations/` corre en el
  // schema `retail` (local y producción), y `unificacion/` SOLO se pega en el proyecto de
  // cayla-dynamic. Verlas ausentes mirando la base local no es un hallazgo, es lo esperado
  // — y mezclarlas convertiría el informe en 28 falsas alarmas que enseñan a ignorarlo.
  const grupos = { "supabase/migrations": [], "supabase/unificacion": [] };
  const mudos = [];
  let completos = 0;

  for (const ruta of archivos) {
    const p = promesasDe(readFileSync(ruta, "utf8"));
    const total = Object.values(p).reduce((a, v) => a + v.length, 0);
    const nombre = relative(RAIZ, ruta).replace(/\\/g, "/");

    if (total === 0) {
      mudos.push(nombre);
      continue;
    }
    const falta = [];
    for (const [tipo, lista] of Object.entries(p)) {
      for (const x of lista) if (!hay[tipo].has(x)) falta.push(`${SINGULAR[tipo]} ${x}`);
    }
    if (falta.length === 0) completos++;
    else grupos[nombre.startsWith("supabase/unificacion") ? "supabase/unificacion" : "supabase/migrations"]
      .push({ nombre, total, falta });
  }

  // Agrupadas por nombre con sus conteos de argumentos: saber que hay dos firmas no sirve
  // sin saber cuáles, porque la que se borra es siempre la vieja.
  const porNombre = {};
  for (const f of inv.funciones) (porNombre[f.nombre] ??= []).push(f.args);
  const sobrecargadas = Object.entries(porNombre)
    .filter(([, args]) => args.length > 1)
    .map(([n, args]) => [n, [...args].sort((a, b) => a - b)]);

  /* ---------------- salida ---------------- */
  const linea = "─".repeat(78);
  const esquemas = (inv.esquemas ?? []).join(", ");
  console.log(`\n${linea}\nSchemas mirados: ${esquemas} · ${archivos.length} archivos revisados\n${linea}`);

  // Las dos carpetas no significan lo mismo, así que no se mezclan: `migrations/` corre en
  // `retail` (local y producción) y `unificacion/` SOLO se pega en el proyecto de
  // cayla-dynamic. Verla ausente mirando la base local no es un hallazgo, es lo esperado —
  // y juntarlas convertiría el informe en 28 falsas alarmas, que es como se enseña a
  // ignorar un informe.
  const NOTA = {
    "supabase/migrations": "corre en `retail`, local y producción",
    "supabase/unificacion": "solo se pega en el proyecto de cayla-dynamic — ausente en local es lo normal",
  };

  for (const [carpeta, faltantes] of Object.entries(grupos)) {
    console.log(`\n  ${carpeta}/ — ${NOTA[carpeta]}`);
    if (faltantes.length === 0) {
      console.log(`    Nada delata que falte.`);
      continue;
    }
    console.log(`    ${faltantes.length} archivo(s) prometen algo que no está:\n`);
    for (const f of faltantes) {
      console.log(`    ✗ ${f.nombre}  (${f.falta.length} de ${f.total})`);
      for (const x of f.falta.slice(0, 8)) console.log(`        falta: ${x}`);
      if (f.falta.length > 8) console.log(`        … y ${f.falta.length - 8} más`);
    }
  }
  console.log(`\n  ${completos} archivo(s) sin nada que delate que falten.`);

  if (sobrecargadas.length > 0) {
    console.log(`\n  SOBRECARGAS VIVAS — la trampa que documentó ADR-0009: \`create or replace\``);
    console.log(`  con un argumento nuevo NO reemplaza la función, crea una segunda. Si la vieja`);
    console.log(`  no se borró, quedan dos, y una llamada que solo nombra los parámetros COMUNES`);
    console.log(`  no resuelve: Postgres responde "function is not unique" y la pantalla falla.\n`);
    for (const [n, args] of sobrecargadas) {
      console.log(`  ! ${n}()  firmas de ${args.join(" y ")} argumentos`);
    }
    console.log(`\n    Para comprobar cuál está rota, en el SQL Editor (no ejecuta nada):`);
    console.log(`      explain select retail.<nombre>(<los parámetros que manda la app>);`);
  }

  if (mudos.length > 0) {
    console.log(`\n  ${mudos.length} archivo(s) sin promesas detectables. NO están aprobados:`);
    console.log(`  este verificador no supo qué buscarles, que no es lo mismo que estar bien.\n`);
    for (const m of mudos) console.log(`  ? ${m}`);
  }

  console.log(
    `\n${linea}\n  Recuerda qué significa cada resultado: una ausencia es certeza (ese archivo no\n` +
      `  corrió); una presencia solo dice que existe algo con ese nombre, no cuál versión.\n${linea}\n`
  );

  // Sin código de salida distinto de 0: esto informa, no bloquea. El día que entre a CI
  // se decide ahí qué convierte en fallo — hoy sería un rojo permanente sin acción clara.
}

main();
