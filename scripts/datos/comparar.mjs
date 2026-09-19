#!/usr/bin/env node
/**
 * Comparador de firmas — ¿lo que la pantalla llama existe en producción?
 *
 * EL PROBLEMA QUE RESUELVE. `RegistrarGastoModal.tsx` llama a `registrar_gasto` con
 * siete parámetros. La función que vive en producción acepta seis. Registrar un gasto
 * está roto allá **ahora mismo**, y nada avisó: el código compila, los tipos pasan, el
 * lint pasa, y el error solo aparece cuando alguien intenta registrar un gasto de
 * verdad, con la clienta esperando. Ya pasó igual con `recibir_lote` y con
 * `registrar_produccion`.
 *
 * Es un hueco muy específico, y por eso hace falta una herramienta propia:
 *   · `pnpm typecheck` compara el código contra los TIPOS GENERADOS, no contra la base.
 *     Si los tipos están viejos —y lo están—, aprueba una llamada imposible.
 *   · `pnpm migraciones:verificar` compara el REPO contra la base. Es la otra mitad, y
 *     no mira lo que el front llama.
 *   · Este script cierra el triángulo: compara la PANTALLA contra la BASE REAL.
 *
 * QUÉ HACE. Busca cada `supabase.rpc("x", { ... })` en `apps/web`, saca los nombres de
 * los parámetros que manda, y los cruza contra la firma real de esa función en
 * producción.
 *
 * LO QUE PUEDE AFIRMAR Y LO QUE NO:
 *   · Un parámetro que la app manda y la función NO acepta → la llamada falla SIEMPRE.
 *     Eso es una afirmación dura, y es la que importa.
 *   · Una función que la app llama y que no existe en producción → falla siempre.
 *   · Un parámetro que la función acepta y la app no manda → normalmente está bien
 *     (tiene valor por defecto), así que sale como aviso, no como error.
 *   · Lo que no supo leer, lo dice. Una llamada con los parámetros armados en una
 *     variable aparte no se puede analizar mirando el texto, y sale listada como
 *     "no analizada" — nunca como aprobada. Un verificador que aprueba lo que no
 *     entendió enseña a confiar en un verde que no significa nada.
 *
 * DE DÓNDE SACA LA VERDAD DE PRODUCCIÓN
 *   `docs/datos/generado/funciones-produccion.txt`. Para refrescarlo, corre esta
 *   consulta en el SQL Editor de producción y pega el resultado en ese archivo:
 *
 *     select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
 *            || ' -> ' || pg_get_function_result(p.oid)
 *            || case when p.prosecdef then ' [definer]' else ' [invoker]' end
 *     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 *     where n.nspname = 'retail' and p.prokind = 'f' order by 1;
 *
 * USO
 *   pnpm datos:comparar          → informe en pantalla; sale con código 1 si hay roto
 *   pnpm datos:comparar --md     → además reescribe docs/datos/generado/DRIFT.md
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const GEN = join(RAIZ, "docs", "datos", "generado");
const WEB = join(RAIZ, "apps", "web");
const FIRMAS = join(GEN, "funciones-produccion.txt");

// ── La verdad de producción ─────────────────────────────────────────────────

// Nombres con MÁS DE UNA firma en producción (sobrecargas). `create or replace function` con una lista de
// parámetros distinta NO reemplaza: crea una segunda función, y una llamada por nombre (como hace el front)
// que no nombra todos los parámetros queda ambigua — «function … is not unique» — y falla siempre
// (ADR-0009; le pasó a `registrar_compra` el 2026-09-19). El mapa de abajo, indexado por nombre, las
// escondía: la segunda firma pisaba a la primera. Por eso se juntan aparte.
const sobrecargas = new Map();

function firmasDeProduccion() {
  if (!existsSync(FIRMAS)) {
    console.error(`\n  Falta ${relative(RAIZ, FIRMAS)}.`);
    console.error(`  Sin eso no hay contra qué comparar. La consulta para regenerarlo está`);
    console.error(`  en la cabecera de este archivo.\n`);
    process.exit(1);
  }
  const mapa = new Map();
  for (const linea of readFileSync(FIRMAS, "utf8").split("\n")) {
    const m = linea.match(/^([a-z0-9_]+)\((.*?)\)\s*->/i);
    if (!m) continue;
    const [, nombre, args] = m;
    // Los parámetros vienen como "p_sede_id uuid, p_items jsonb". Nos quedamos con el
    // nombre: es lo único que el front manda, porque llama con un objeto.
    const parametros = args
      .split(",")
      .map(a => a.trim())
      .filter(Boolean)
      .map(a => a.replace(/^(OUT|INOUT|VARIADIC)\s+/i, "").split(/\s+/)[0])
      .filter(p => /^p?_?[a-z]/i.test(p));
    if (mapa.has(nombre)) {
      const previas = sobrecargas.get(nombre) ?? [mapa.get(nombre).linea];
      sobrecargas.set(nombre, [...previas, linea.trim()]);
    }
    mapa.set(nombre, { parametros, definer: /\[definer\]/.test(linea), linea: linea.trim() });
  }
  return mapa;
}

// ── Lo que las pantallas llaman ─────────────────────────────────────────────

/**
 * Las claves del PRIMER NIVEL del objeto de argumentos, y solo esas.
 *
 * Una llamada real se ve así:
 *   { p_caja_id: id, p_items: carrito.map(l => ({ variante_id: l.id, cantidad: l.n })) }
 *
 * `variante_id` y `cantidad` son campos de un item, no parámetros de la función. Una
 * primera versión de este script los contaba y daba doce alarmas falsas por una real
 * — y una herramienta que grita en falso se apaga a la tercera vez. Así que hay que
 * contar profundidad de verdad: llaves, corchetes, paréntesis, comillas y plantillas.
 */
function clavesDePrimerNivel(cuerpo) {
  const claves = [];
  let nivel = 0;
  let comilla = null;

  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i];

    if (comilla) {
      if (c === "\\") { i++; continue; }
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
    if (c === "/" && cuerpo[i + 1] === "/") { while (i < cuerpo.length && cuerpo[i] !== "\n") i++; continue; }
    if (c === "/" && cuerpo[i + 1] === "*") { i = cuerpo.indexOf("*/", i) + 1; continue; }

    if (c === "{" || c === "[" || c === "(") { nivel++; continue; }
    if (c === "}" || c === "]" || c === ")") { nivel--; continue; }

    if (nivel !== 0) continue;

    // En el primer nivel, una clave es un identificador seguido de ":" — pero NO el ":"
    // de un ternario (`a ? b : c`) ni el de un tipo. Miramos hacia atrás: antes de la
    // clave solo puede haber principio de objeto o una coma.
    const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(cuerpo.slice(i));
    if (!m) continue;
    const antes = cuerpo.slice(0, i).replace(/\s+$/, "");
    if (antes === "" || antes.endsWith(",")) claves.push(m[1]);
    i += m[0].length - 1;
  }
  return claves.filter((v, i, a) => a.indexOf(v) === i);
}

function archivosDeCodigo(dir, acc = []) {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    const st = statSync(ruta);
    if (st.isDirectory()) archivosDeCodigo(ruta, acc);
    else if (/\.(ts|tsx|mts)$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

function llamadas() {
  const encontradas = [];
  const noAnalizadas = [];

  for (const ruta of archivosDeCodigo(WEB)) {
    const texto = readFileSync(ruta, "utf8");
    const lineas = texto.split("\n");

    const re = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`]\s*(,|\))/gi;
    let m;
    while ((m = re.exec(texto)) !== null) {
      const nombre = m[1];
      const linea = texto.slice(0, m.index).split("\n").length;
      const contexto = { archivo: relative(RAIZ, ruta), linea, nombre };

      if (m[2] === ")") { encontradas.push({ ...contexto, envia: [] }); continue; }

      // Recortamos el objeto de argumentos equilibrando llaves. Frágil a propósito:
      // si no cierra limpio, lo decimos en vez de adivinar.
      const desde = texto.indexOf("{", m.index + m[0].length - 1);
      const hastaParen = texto.indexOf(")", m.index + m[0].length - 1);
      if (desde === -1 || (hastaParen !== -1 && hastaParen < desde)) {
        noAnalizadas.push({ ...contexto, porque: "los parámetros no van escritos ahí mismo" });
        continue;
      }
      let nivel = 0, fin = -1;
      for (let i = desde; i < texto.length; i++) {
        if (texto[i] === "{") nivel++;
        else if (texto[i] === "}") { nivel--; if (nivel === 0) { fin = i; break; } }
      }
      if (fin === -1) { noAnalizadas.push({ ...contexto, porque: "no pude cerrar el objeto" }); continue; }

      const cuerpo = texto.slice(desde + 1, fin);
      const envia = clavesDePrimerNivel(cuerpo);

      if (/(^|[\s,{])\.\.\./.test(cuerpo)) noAnalizadas.push({ ...contexto, porque: "el objeto se arma con «...», no se puede leer entero" });
      else encontradas.push({ ...contexto, envia, textoLinea: (lineas[linea - 1] ?? "").trim() });
    }
  }
  return { encontradas, noAnalizadas };
}

// ── El informe ──────────────────────────────────────────────────────────────

const produccion = firmasDeProduccion();
const { encontradas, noAnalizadas } = llamadas();

const rotas = [];
const avisos = [];

for (const ll of encontradas) {
  const fn = produccion.get(ll.nombre);
  if (!fn) {
    rotas.push({ ...ll, tipo: "no existe", detalle: `la función \`${ll.nombre}\` no existe en producción` });
    continue;
  }
  const sobran = ll.envia.filter(p => !fn.parametros.includes(p));
  const faltan = fn.parametros.filter(p => !ll.envia.includes(p));
  if (sobran.length) {
    rotas.push({ ...ll, tipo: "parámetro de más", detalle: `manda \`${sobran.join("`, `")}\` y producción no lo acepta` });
  } else if (faltan.length) {
    avisos.push({ ...ll, detalle: `no manda \`${faltan.join("`, `")}\` (normal si tienen valor por defecto)` });
  }
}

const llamadasUnicas = new Set(encontradas.map(l => l.nombre));
const sinUsar = [...produccion.keys()].filter(n => !llamadasUnicas.has(n) && !n.startsWith("fn_") && !["set_updated_at"].includes(n));

console.log(`\n  Comparando ${encontradas.length} llamadas de apps/web contra ${produccion.size} funciones de producción\n`);

if (sobrecargas.size) {
  console.log(`  ✗ SOBRECARGAS EN PRODUCCIÓN — ${sobrecargas.size}  (la llamada por nombre queda ambigua y falla)\n`);
  for (const [nombre, firmas] of sobrecargas) {
    console.log(`    ${nombre} — ${firmas.length} firmas:`);
    for (const f of firmas) console.log(`      ${f.length > 150 ? f.slice(0, 147) + "…" : f}`);
    console.log("");
  }
} else {
  console.log(`  ✓ Ninguna función tiene dos firmas en producción\n`);
}

if (rotas.length) {
  console.log(`  ✗ ROTO EN PRODUCCIÓN — ${rotas.length}\n`);
  for (const r of rotas) {
    console.log(`    ${r.nombre}  ·  ${r.archivo}:${r.linea}`);
    console.log(`      ${r.detalle}`);
    const fn = produccion.get(r.nombre);
    if (fn) console.log(`      producción acepta: ${fn.parametros.join(", ") || "(sin parámetros)"}`);
    console.log("");
  }
} else {
  console.log(`  ✓ Ninguna pantalla llama a una función con parámetros que producción no acepte\n`);
}

if (avisos.length) {
  console.log(`  · Avisos (parámetros no enviados) — ${avisos.length}`);
  for (const a of avisos) console.log(`    ${a.nombre} · ${a.archivo}:${a.linea} — ${a.detalle}`);
  console.log("");
}

if (noAnalizadas.length) {
  console.log(`  ? No analizadas — ${noAnalizadas.length}  (NO significa aprobadas)`);
  for (const n of noAnalizadas) console.log(`    ${n.nombre} · ${n.archivo}:${n.linea} — ${n.porque}`);
  console.log("");
}

if (sinUsar.length) {
  console.log(`  · Funciones en producción que ninguna pantalla llama — ${sinUsar.length}`);
  console.log(`    ${sinUsar.join(", ")}`);
  console.log(`    (puede ser una pantalla que falta, o una función que sobra — las dos hay que mirarlas)\n`);
}

if (process.argv.includes("--md")) {
  const L = [];
  L.push(`# Diferencias — lo que la pantalla llama vs. lo que producción acepta`);
  L.push("");
  L.push(`> ⚠️ **ARCHIVO GENERADO.** Se reescribe con \`pnpm datos:comparar --md\`.`);
  L.push(`> Comparadas ${encontradas.length} llamadas de \`apps/web\` contra ${produccion.size} funciones del schema \`retail\` en producción.`);
  L.push("");
  L.push(`---`);
  L.push("");
  L.push(`## Roto en producción — ${rotas.length}`);
  L.push("");
  L.push(`## Sobrecargas — ${sobrecargas.size}`);
  L.push("");
  if (!sobrecargas.size) L.push(`Ninguna. Cada función tiene una sola firma en producción.`);
  for (const [nombre, firmas] of sobrecargas) {
    L.push(`### \`${nombre}\` — ${firmas.length} firmas`);
    L.push("");
    L.push(`Una llamada por nombre que no nombre todos los parámetros queda ambigua («function … is not unique») y falla siempre. Hay que soltar la firma sobrante (\`drop function\`).`);
    L.push("");
    for (const f of firmas) L.push(`- \`${f}\``);
    L.push("");
  }
  if (!rotas.length) L.push(`Nada. Todas las llamadas encajan con la firma real.`);
  for (const r of rotas) {
    L.push(`### \`${r.nombre}\` — ${r.tipo}`);
    L.push("");
    L.push(`**Dónde:** \`${r.archivo}:${r.linea}\``);
    L.push(`**Qué pasa:** ${r.detalle}`);
    const fn = produccion.get(r.nombre);
    if (fn) {
      L.push(`**La app manda:** \`${r.envia.join("`, `") || "—"}\``);
      L.push(`**Producción acepta:** \`${fn.parametros.join("`, `") || "—"}\``);
    }
    L.push(`**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.`);
    L.push("");
  }
  L.push(`## Avisos — ${avisos.length}`);
  L.push("");
  for (const a of avisos) L.push(`- \`${a.nombre}\` · \`${a.archivo}:${a.linea}\` — ${a.detalle}`);
  L.push("");
  L.push(`## No analizadas — ${noAnalizadas.length}`);
  L.push("");
  L.push(`Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se`);
  L.push(`pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**`);
  L.push("");
  for (const n of noAnalizadas) L.push(`- \`${n.nombre}\` · \`${n.archivo}:${n.linea}\` — ${n.porque}`);
  L.push("");
  L.push(`## Funciones que nadie llama — ${sinUsar.length}`);
  L.push("");
  L.push(`Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:`);
  L.push(`una pantalla que falta construir, o una función que sobra y habría que retirar.`);
  L.push("");
  for (const s of sinUsar) L.push(`- \`${s}\``);
  L.push("");
  writeFileSync(join(GEN, "DRIFT.md"), L.join("\n"));
  console.log(`  ✓ docs/datos/generado/DRIFT.md reescrito\n`);
}

// Salir con 1 cuando hay pantallas rotas es DELIBERADO: así esto sirve de alarma
// automática y puede frenar un despliegue (decisión D-19). Pero `pnpm` pinta ese
// código en rojo con un ELIFECYCLE que parece que el comando se rompió, y no es eso.
// Un mensaje que se explica solo cuesta tres líneas y ahorra el susto.
if (rotas.length) {
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Este comando termina con código 1 A PROPÓSITO: encontró ${rotas.length} pantalla${rotas.length > 1 ? "s" : ""} rota${rotas.length > 1 ? "s" : ""}.`);
  console.log(`  El "ELIFECYCLE / Command failed" que imprime pnpm justo debajo NO es un`);
  console.log(`  fallo del comando — es la alarma sonando. Si terminara en 0 con pantallas`);
  console.log(`  rotas, no serviría para frenar un despliegue.`);
  console.log(``);
  console.log(`  Qué hacer: docs/datos/SQL-PENDIENTE-PRODUCCION.sql y`);
  console.log(`  docs/datos/DIAGNOSTICO-PANTALLAS-ROTAS.md\n`);
}

process.exit(rotas.length ? 1 : 0);
