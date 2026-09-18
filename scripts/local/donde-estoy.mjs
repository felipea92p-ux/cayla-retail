#!/usr/bin/env node
/**
 * ¿Con qué Supabase local habla este repo? — el instrumento, no el razonamiento.
 *
 * EL PROBLEMA QUE RESUELVE. En esta máquina corren DOS stacks de Supabase local, y los dos
 * son legítimos: `cayla-retail` (este repo, API 54421) y `cayla-dynamic` (~/cayla-dynamic,
 * API 54321). 54321 es el default de Supabase, así que es el puerto al que uno apunta por
 * reflejo — y ahí empieza la trampa.
 *
 * LO QUE HACE QUE CUESTE UNA HORA Y NO UN MINUTO: apuntar al stack equivocado NO explota.
 * La copia local de Dynamic TAMBIÉN tiene un schema `retail` (es la foto de la producción
 * unificada), así que catálogo, stock y ventas responden con normalidad. Lo que falta son
 * las tablas construidas DESPUÉS de la unificación —`comprobantes`, `conteos`, `colores`,
 * `stock_almacen`…—, o sea que Facturación y Conteo fallan mientras el resto funciona. Un
 * fallo parcial se diagnostica como bug del repo, no como puerto equivocado.
 *
 * Ya pasó cuatro veces (BITACORA 2026-09-09). Las cuatro se resolvieron MIRANDO —qué
 * responde en cada puerto, qué dice `auth.users`, qué puerto trae el bundle servido—,
 * nunca razonando. Este script es ese mirar, en tres segundos.
 *
 * LO QUE PUEDE AFIRMAR Y LO QUE NO:
 *   · Los stacks levantados y sus puertos: certeza (sale de Docker).
 *   · Lo que declara este repo: certeza (sale de config.toml).
 *   · Lo que leerá la app: certeza SOLO para un `pnpm dev` lanzado desde ESTA terminal. Una
 *     variable exportada en otra terminal le gana al archivo y este script no la ve; por eso
 *     además interroga al servidor que ya esté corriendo, que es el único testigo real.
 *
 * USO
 *   pnpm local:donde
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ESTE_PROYECTO = "cayla-retail";
const LINEA = "─".repeat(78);

// Los fallos acá no son excepcionales: Docker apagado, contenedor caído, psql que no
// responde. Todos significan "no pude mirar", que se informa — nunca se confunde con un dato.
function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/* ---------------- 1. Qué stacks hay levantados ---------------- */

function stacksLevantados() {
  const salida = sh("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"]);
  if (salida === null) return null; // Docker apagado: distinto de "no hay stacks".

  const proyectos = {};
  for (const fila of salida.split("\n")) {
    const [nombre, puertos = ""] = fila.split("\t");
    const m = /^supabase_(kong|db|studio)_(.+)$/.exec(nombre ?? "");
    if (!m) continue;
    const puerto = /0\.0\.0\.0:(\d+)->/.exec(puertos)?.[1];
    if (!puerto) continue;
    (proyectos[m[2]] ??= {})[m[1]] = puerto;
  }
  return proyectos;
}

/* ---------------- 2. Qué declara este repo ---------------- */

function puertoDeConfig() {
  const toml = readFileSync(join(RAIZ, "supabase", "config.toml"), "utf8");
  // El primer `port` después de `[api]`: el bloque siguiente ([api.tls]) ya no cuenta.
  return /\[api\][^[]*?^port\s*=\s*(\d+)/ms.exec(toml)?.[1] ?? null;
}

/* ---------------- 3. Qué leerá la app, y de dónde ---------------- */

function urlQueLeeraLaApp() {
  // El orden importa y es el de Next: una variable exportada le gana al archivo. Esa
  // inversión fue la trampa (2) del 09-09 — el servidor cambió de base sin que nadie
  // tocara nada.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      origen: "variable EXPORTADA en esta terminal (le gana al archivo)",
    };
  }
  const archivo = join(RAIZ, "apps", "web", ".env.local");
  if (!existsSync(archivo)) return { url: null, origen: "no existe apps/web/.env.local" };
  const url = /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m
    .exec(readFileSync(archivo, "utf8"))?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  return { url: url ?? null, origen: "apps/web/.env.local" };
}

/* ---------------- 4. Qué tiene adentro la base a la que apunta ---------------- */

function retratoDeLaBase(proyecto) {
  const q = (sql) =>
    sh("docker", ["exec", `supabase_db_${proyecto}`, "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql])?.trim();
  const total = q("select count(*) from information_schema.tables where table_schema='retail'");
  if (!total) return null;
  // Cuatro tablas posteriores a la unificación: si faltan, es la copia de Dynamic.
  const faltan = q(
    "select coalesce(string_agg(t, ', '), '') from unnest(array['comprobantes','conteos','colores','stock_almacen']) t where to_regclass('retail.'||t) is null"
  );
  return { total, faltan: faltan ? faltan.split(", ") : [] };
}

/* ---------------- 5. El testigo: qué puerto sirve el servidor vivo ---------------- */

async function loQueSirveElServidor() {
  const PUERTO = /127\.0\.0\.1:(5432\d|5442\d)/g;
  const traer = (ruta) => fetch(`http://localhost:3000${ruta}`, { signal: AbortSignal.timeout(5000) }).then((r) => r.text());

  try {
    const html = await traer("/login");
    // El HTML no lo trae: `NEXT_PUBLIC_SUPABASE_URL` se inlinea en el bundle del cliente,
    // así que hay que abrir los chunks. Es literalmente lo que se hizo a mano el 09-09
    // para descubrir que el servidor hablaba con otra base que la que decía el archivo.
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map((m) => m[0]))];
    const puertos = new Set([...html.matchAll(PUERTO)].map((m) => m[1]));

    for (const chunk of chunks.slice(0, 40)) {
      for (const m of (await traer(chunk)).matchAll(PUERTO)) puertos.add(m[1]);
      if (puertos.size > 0) break; // El primero que lo diga basta; no hay que leer los 20.
    }
    return puertos.size === 0 ? { estado: "mudo" } : { estado: "habla", puertos: [...puertos] };
  } catch {
    return { estado: "apagado" };
  }
}

/* ---------------------------------------------------------------------------- */

const proyectos = stacksLevantados();
const declarado = puertoDeConfig();
const { url, origen } = urlQueLeeraLaApp();
const puertoApp = url ? /:(\d+)/.exec(url)?.[1] : null;

console.log(`\n${LINEA}\n  ¿Con qué Supabase local habla este repo?\n${LINEA}\n`);

if (proyectos === null) {
  console.log("  Docker no responde. Sin él no hay stack local: `npx supabase start`.\n");
} else if (Object.keys(proyectos).length === 0) {
  console.log("  No hay ningún stack de Supabase levantado: `npx supabase start`.\n");
} else {
  console.log("  Levantados en esta máquina:");
  for (const [nombre, p] of Object.entries(proyectos)) {
    const marca = nombre === ESTE_PROYECTO ? "← el de ESTE repo" : "(otro repo — no lo apagues)";
    console.log(
      `    · ${nombre.padEnd(15)} API :${p.kong ?? "?"}  DB :${p.db ?? "?"}  Studio :${p.studio ?? "?"}   ${marca}`
    );
  }
  console.log();
}

console.log(`  Este repo declara (supabase/config.toml):  :${declarado ?? "?"}`);
console.log(`  La app va a leer:                          ${url ?? "(nada)"}`);
console.log(`      origen: ${origen}\n`);

if (puertoApp && declarado && puertoApp === declarado) {
  console.log("  ✓ COINCIDEN. `supabase db reset` y la app tocan la misma base.");
} else {
  console.log("  ✗ NO COINCIDEN — y esto no va a explotar, va a mentir a medias.");
  console.log("    La copia local de Dynamic también tiene schema `retail`, así que catálogo y");
  console.log("    stock responden; lo que falta son las tablas posteriores a la unificación.");
  console.log(`    Arreglo: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${declarado} en apps/web/.env.local`);
  console.log("    (si el origen de arriba dice EXPORTADA, primero cierra esa terminal).");
}

const dueño = Object.entries(proyectos ?? {}).find(([, p]) => p.kong === puertoApp)?.[0];
if (dueño) {
  const base = retratoDeLaBase(dueño);
  if (base) {
    console.log(`\n  Esa base es la de \`${dueño}\`: ${base.total} tablas en el schema \`retail\`.`);
    if (base.faltan.length > 0) {
      console.log(`    Le faltan ${base.faltan.join(", ")} — la firma de la copia de Dynamic.`);
    }
  }
}

const servidor = await loQueSirveElServidor();
if (servidor.estado === "habla") {
  const coincide = servidor.puertos.length === 1 && servidor.puertos[0] === declarado;
  console.log(
    `\n  El :3000 que ya corre sirve el puerto ${servidor.puertos.join(", ")} — ${coincide ? "el correcto." : "OJO: no es el declarado."}`
  );
  if (!coincide) console.log("    Ese testigo manda sobre todo lo de arriba: reinicia desde una terminal limpia.");
} else if (servidor.estado === "mudo") {
  console.log("\n  Hay algo en :3000 pero no delató su puerto de Supabase. Eso no es un visto bueno.");
}

console.log(`\n${LINEA}\n`);

// Sin código de salida distinto de 0: informa, no bloquea. Igual que `migraciones:verificar`.
