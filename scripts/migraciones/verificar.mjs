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
 *   · CUERPOS, desde 2026-09-10 y por un caso real. Para las funciones sí se compara el
 *     código, no solo el nombre: el cuerpo de cada función de `retail` se normaliza y se
 *     busca entre TODAS las definiciones que el repo tiene de ese nombre. Si no coincide
 *     con ninguna, ese cuerpo no lo produce ningún archivo — alguien lo escribió a mano
 *     en el SQL Editor. Es el drift que nadie vigila, porque produccion queda ADELANTE
 *     del repo y entonces nada falla: todo anda bien allá y el repo deja de describir el
 *     sistema en silencio. Así apareció el guard de `stock_minimo` en `recalcular_stock`.
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
/**
 * Objetos que el repo nombra de una forma y la base tiene con otra, por un cambio que ya se
 * decidió y se documentó. Sin esta lista el verificador vuelve a levantar cada corrida una
 * alarma que alguien ya descartó — y un informe que repite lo descartado enseña a ignorarlo
 * entero, que es la única forma de que deje de servir.
 */
const RENOMBRES = {
  // `unificacion/01_sedes.sql` la creó así en el `public` de Dynamic; después se movió al
  // cajón `retail` y perdió el prefijo del nombre. Descartada a mano en BACKLOG el 09-09.
  retail_sede_meta: "sede_meta",
  // Su política perdió el mismo prefijo al mudarse de cajón.
  retail_sede_meta_read: "sede_meta_read",
};

const pelar = (nombre) => {
  const limpio = nombre.replace(/^"?[\w]+"?\./, "").replace(/"/g, "").toLowerCase();
  return RENOMBRES[limpio] ?? limpio;
};

/**
 * Normaliza un cuerpo de función para poder compararlo entre entornos.
 *
 * Las diferencias que se borran son las que NO son de lógica: el prefijo de schema (local
 * escribe `stock`, producción `retail.stock`), los comentarios, y el espaciado. Lo que
 * queda es el código, y dos códigos iguales normalizan igual aunque estén escritos para
 * cajones distintos.
 *
 * Límite conocido: un `--` dentro de una cadena de texto se comería el resto de la línea.
 * No pasa en este repo y arreglarlo pediría un parser de verdad; queda dicho para que
 * quien vea una falsa alarma rarísima sepa por dónde empezar.
 */
function normalizarCuerpo(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\b(?:retail|public)\./gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Cada `create [or replace] function … as $$ … $$` del archivo: nombre → cuerpo normalizado. */
function cuerposDe(sql) {
  const fuera = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+([\w".]+)\s*\([\s\S]*?\bas\s*\$\$([\s\S]*?)\$\$/gi;
  for (const m of sql.matchAll(re)) {
    fuera.push({ nombre: pelar(m[1]), cuerpo: normalizarCuerpo(m[2]) });
  }
  return fuera;
}

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
    // El nombre de la política pasa por `pelar` igual que el de la tabla: no tiene
    // calificador de schema que quitarle, pero sí puede estar en el mapa de renombres.
    p.politicas.push(`${pelar(m[2])}.${pelar(m[1].trim())}`)
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
  let crudo = readFileSync(ruta, "utf8").trim();

  // El resultado sale de una celda del SQL Editor, y ese viaje lo puede ensuciar de dos
  // maneras. Si se copia a mano llega el JSON pelado. Si se usa «Download CSV» llega con
  // una cabecera, envuelto en comillas y con cada `"` interna duplicada, que es la regla
  // de CSV — y `JSON.parse` revienta con un mensaje que no ayuda. Se aceptan las dos
  // formas: la persona que corre esto no tiene por qué saber cuál eligió.
  if (crudo.startsWith("inventario")) crudo = crudo.slice(crudo.indexOf("\n") + 1).trim();
  if (crudo.startsWith('"') && crudo.endsWith('"')) {
    crudo = crudo.slice(1, -1).replace(/""/g, '"');
  }

  const desde = crudo.indexOf("{");
  const hasta = crudo.lastIndexOf("}");
  if (desde < 0 || hasta < desde) {
    throw new Error("no parece el resultado de `inventario.sql`: no hay un objeto JSON adentro");
  }
  return JSON.parse(crudo.slice(desde, hasta + 1));
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

  // nombre de función → todos los cuerpos que el repo tiene para ella, con su archivo.
  const cuerposDelRepo = new Map();

  for (const ruta of archivos) {
    const sql = readFileSync(ruta, "utf8");
    const nombreRel = relative(RAIZ, ruta).replace(/\\/g, "/");
    for (const { nombre, cuerpo } of cuerposDe(sql)) {
      if (!cuerposDelRepo.has(nombre)) cuerposDelRepo.set(nombre, []);
      cuerposDelRepo.get(nombre).push({ archivo: nombreRel, cuerpo });
    }
    const p = promesasDe(sql);
    const total = Object.values(p).reduce((a, v) => a + v.length, 0);
    const nombre = nombreRel;

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
  // Solo las de `retail`, y por un caso concreto: en producción `public` es el schema de
  // Dynamic, y reportar SUS sobrecargas —`fn_set_meta_cobertura`, que alguien ya descartó a
  // mano el 2026-09-09— es ruido sobre código que no es nuestro ni podemos tocar.
  // `inv.cuerpos` ya viene acotado a `retail`, así que sirve de lista.
  const porNombre = {};
  for (const f of inv.cuerpos ?? []) (porNombre[f.nombre] ??= []).push(f.args);
  // ---------- cuerpos: ¿algún archivo del repo produce lo que hay en la base? ----------
  const sinArchivo = [];
  const coincidencias = new Map(); // nombre → archivo que lo explica
  for (const f of inv.cuerpos ?? []) {
    const candidatos = cuerposDelRepo.get(f.nombre.toLowerCase());
    if (!candidatos || candidatos.length === 0) {
      sinArchivo.push({ nombre: f.nombre, motivo: "el repo no define ninguna función con ese nombre" });
      continue;
    }
    const vivo = normalizarCuerpo(f.cuerpo ?? "");
    const igual = candidatos.find((c) => c.cuerpo === vivo);
    if (igual) coincidencias.set(f.nombre, igual.archivo);
    else
      sinArchivo.push({
        nombre: f.nombre,
        motivo: `su cuerpo no coincide con ninguna de las ${candidatos.length} definiciones del repo`,
        candidatos: candidatos.map((c) => c.archivo),
      });
  }

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
  // `public` con muchas tablas = estamos mirando el proyecto de Dynamic, o sea producción.
  // Hace falta saberlo porque las dos carpetas NO significan lo mismo en cada lado: contra
  // producción, `migrations/` no es lo que construyó esa base —`unificacion/` renombró
  // políticas e índices al pasarlas— así que sus ausencias son esperables, no hallazgos.
  const enProduccion = (inv.tablas_en_public ?? 0) > 10;
  console.log(
    `
  Entorno: ${enProduccion ? "PRODUCCIÓN" : "local"} — ${inv.tablas_en_public ?? "?"} tablas en \`public\``
  );

  const NOTA = enProduccion
    ? {
        "supabase/migrations": "NO construyó esta base: producción se armó con `unificacion/`, que renombró políticas e índices. INFORMATIVO",
        "supabase/unificacion": "esto SÍ construyó esta base — acá una ausencia es un hallazgo",
      }
    : {
        "supabase/migrations": "esto SÍ construyó esta base — acá una ausencia es un hallazgo",
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

  if (inv.cuerpos) {
    console.log(`\n  CUERPOS · ${coincidencias.size} de ${inv.cuerpos.length} funciones de \`retail\``);
    console.log(`  tienen un archivo del repo que las explica tal cual.`);
    if (sinArchivo.length > 0) {
      console.log(`\n  ${sinArchivo.length} NO:\n`);
      for (const f of sinArchivo) {
        console.log(`  ✗ ${f.nombre}() — ${f.motivo}`);
        if (f.candidatos) console.log(`      el repo la define en: ${f.candidatos.join(", ")}`);
      }
      console.log(`\n    Un cuerpo que ningún archivo produce se escribió a mano contra la base.`);
      console.log(`    No falla nada por eso —y ese es el problema—: el repo deja de describir`);
      console.log(`    el sistema sin que nada lo delate.`);
    }
  }

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
