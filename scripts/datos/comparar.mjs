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
 * QUÉ HACE. Busca cada `supabase.rpc("x", { ... })` en el código de las pantallas de `apps/web`
 * (sin comentarios ni pruebas: no son pantallas), saca los nombres de los parámetros que manda,
 * y los cruza contra la firma de esa función en la FOTO de producción.
 *
 * TODO LO QUE DICE ES TAN FRESCO COMO LA FOTO (`retail_foto.json` dice cuándo se tomó): una función
 * creada o cambiada DESPUÉS sale como «no existe» o con parámetros de más aunque en producción ya esté
 * bien. Por eso el informe habla de llamadas «sin respaldo en la foto» y no de pantallas «rotas»
 * (decisión tomada tras una falsa alarma real: 8 «rotas» que existían en producción).
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
 *   · Un nombre de función que la pantalla escribe entre comillas fuera de un `.rpc("…")`
 *     directo (un ternario, un ayudante) también es "no analizado": se ve que la pantalla
 *     la usa, pero no qué parámetros manda. Los comentarios NO cuentan (`comparar-lectura.mjs`).
 *   · «Sin llamada detectada» NO prueba que una función sobre: la puede llamar otra
 *     función, un disparador, un script o Dynamic. Nunca se retira una función por estar
 *     en esa lista sin buscar antes quién la usa.
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
import { esDePrueba, fechaDeLaFoto, nombresEntreComillas, sinComentarios } from "./comparar-lectura.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
// `COMPARAR_RAIZ` solo existe para la prueba de extremo a extremo (`comparar.test.mjs`), que arma un repositorio de juguete.
const RAIZ = process.env.COMPARAR_RAIZ ?? join(AQUI, "..", "..");
const GEN = join(RAIZ, "docs", "datos", "generado");
const WEB = join(RAIZ, "apps", "web");
const FIRMAS = join(GEN, "funciones-produccion.txt");
const FOTO = join(GEN, "retail_foto.json");

// Cuándo se tomó la foto de producción con la que se compara. Todo lo que dice este informe es tan fresco como ella.
function fechaFoto() {
  try {
    return fechaDeLaFoto(JSON.parse(readFileSync(FOTO, "utf8")).leido_en);
  } catch {
    return null;
  }
}

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

function llamadas(conocidas) {
  const encontradas = [];
  const noAnalizadas = [];
  // Nombres de función que la pantalla escribe entre comillas (sin contar comentarios ni pruebas): la primera aparición
  // de cada uno. Los que además tienen un `.rpc("…")` directo ya están en `encontradas`/`noAnalizadas`.
  const mencionadas = new Map();

  for (const ruta of archivosDeCodigo(WEB)) {
    if (esDePrueba(ruta)) continue; // una prueba no es una pantalla: ni sus llamadas ni sus menciones cuentan
    const texto = readFileSync(ruta, "utf8");
    const lineas = texto.split("\n");
    // El mismo texto SIN comentarios (misma longitud y mismas líneas): un `.rpc("x")` que solo aparece en un ejemplo de
    // JSDoc no es una llamada. Lo leen el parser de TypeScript, no una expresión regular (`comparar-lectura.mjs`).
    const limpio = sinComentarios(texto, ruta);

    for (const { nombre, linea } of nombresEntreComillas(texto, conocidas, ruta)) {
      if (!mencionadas.has(nombre)) mencionadas.set(nombre, { archivo: relative(RAIZ, ruta), linea });
    }

    // `.rpc("nombre" as never, …)` es la forma en que las pantallas de Finanzas esquivan los tipos generados que aún no
    // conocen la función: sin el `as never` opcional, esas 71 llamadas eran invisibles y sus funciones salían como «nadie las llama».
    const re = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`](?:\s+as\s+never)?\s*(,|\))/gi;
    let m;
    while ((m = re.exec(limpio)) !== null) {
      const nombre = m[1];
      const linea = limpio.slice(0, m.index).split("\n").length;
      const contexto = { archivo: relative(RAIZ, ruta), linea, nombre };

      if (m[2] === ")") { encontradas.push({ ...contexto, envia: [] }); continue; }

      // Recortamos el objeto de argumentos equilibrando llaves. Frágil a propósito:
      // si no cierra limpio, lo decimos en vez de adivinar.
      const desde = limpio.indexOf("{", m.index + m[0].length - 1);
      const hastaParen = limpio.indexOf(")", m.index + m[0].length - 1);
      if (desde === -1 || (hastaParen !== -1 && hastaParen < desde)) {
        noAnalizadas.push({ ...contexto, porque: "los parámetros no van escritos ahí mismo" });
        continue;
      }
      let nivel = 0, fin = -1;
      for (let i = desde; i < limpio.length; i++) {
        if (limpio[i] === "{") nivel++;
        else if (limpio[i] === "}") { nivel--; if (nivel === 0) { fin = i; break; } }
      }
      if (fin === -1) { noAnalizadas.push({ ...contexto, porque: "no pude cerrar el objeto" }); continue; }

      const cuerpo = limpio.slice(desde + 1, fin);
      const envia = clavesDePrimerNivel(cuerpo);

      if (/(^|[\s,{])\.\.\./.test(cuerpo)) noAnalizadas.push({ ...contexto, porque: "el objeto se arma con «...», no se puede leer entero" });
      else encontradas.push({ ...contexto, envia, textoLinea: (lineas[linea - 1] ?? "").trim() });
    }
  }

  // Lo que la pantalla nombra pero no llama con un `.rpc("…")` directo (un ternario, un ayudante): la usa, pero no se
  // pueden leer sus parámetros. Sale como «no analizada», nunca como aprobada.
  const conLlamadaDirecta = new Set([...encontradas, ...noAnalizadas].map(l => l.nombre));
  for (const [nombre, donde] of mencionadas) {
    if (conLlamadaDirecta.has(nombre)) continue;
    noAnalizadas.push({ ...donde, nombre, porque: 'el nombre va entre comillas pero no como `.rpc("…")` directo (un ternario, un ayudante…): no se leen sus parámetros' });
  }
  return { encontradas, noAnalizadas };
}

// ── El informe ──────────────────────────────────────────────────────────────

const produccion = firmasDeProduccion();
const FOTO_FECHA = fechaFoto();
const { encontradas, noAnalizadas } = llamadas(new Set(produccion.keys()));

// La migración del repo que define una función (la última que dice `create [or replace] function`). Sirve para decir,
// de una función que la foto no tiene, «está definida en esta migración: o es posterior a la foto, o no se ha pegado
// en producción». No lee SQL dinámico (`execute format(…)`), así que puede no encontrarla.
const MIGRACIONES = join(RAIZ, "supabase", "migrations");
let indiceMigraciones = null;
function migracionQueDefine(nombre) {
  if (!indiceMigraciones) {
    indiceMigraciones = new Map();
    const archivos = existsSync(MIGRACIONES) ? readdirSync(MIGRACIONES).filter(f => /^\d+_.*\.sql$/.test(f)).sort() : [];
    for (const f of archivos) {
      const sql = readFileSync(join(MIGRACIONES, f), "utf8");
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:retail\.)?([a-z0-9_]+)\s*\(/gi)) indiceMigraciones.set(m[1].toLowerCase(), f);
    }
  }
  return indiceMigraciones.get(nombre) ?? null;
}

const rotas = [];
const avisos = [];

for (const ll of encontradas) {
  const fn = produccion.get(ll.nombre);
  if (!fn) {
    rotas.push({ ...ll, tipo: "no está en la foto", detalle: `la función \`${ll.nombre}\` no está en la foto de producción (${FOTO_FECHA ?? "sin fecha"})`, migracion: migracionQueDefine(ll.nombre) });
    continue;
  }
  const sobran = ll.envia.filter(p => !fn.parametros.includes(p));
  const faltan = fn.parametros.filter(p => !ll.envia.includes(p));
  if (sobran.length) {
    rotas.push({ ...ll, tipo: "parámetro de más", detalle: `manda \`${sobran.join("`, `")}\` y la foto de producción no lo acepta` });
  } else if (faltan.length) {
    avisos.push({ ...ll, detalle: `no manda \`${faltan.join("`, `")}\` (normal si tienen valor por defecto)` });
  }
}

// Una llamada que no se pudo leer entera («...», parámetros armados fuera) sigue siendo una llamada: la función tiene
// pantalla. Sin esto, `registrar_venta` salía como «nadie la llama» estando en el punto de venta.
const llamadasUnicas = new Set([...encontradas, ...noAnalizadas].map(l => l.nombre));
const sinUsar = [...produccion.keys()].filter(n => !llamadasUnicas.has(n) && !n.startsWith("fn_") && !["set_updated_at"].includes(n));

console.log(`\n  Comparando ${encontradas.length} llamadas directas de apps/web contra ${produccion.size} funciones de producción`);
console.log(`  Foto de producción: ${FOTO_FECHA ?? "SIN FECHA"}. Una función creada o cambiada DESPUÉS sale como «no está» o con`);
console.log(`  parámetros de más aunque en producción ya esté bien: confirmar en producción antes de dar una pantalla por rota.\n`);

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
  console.log(`  ✗ SIN RESPALDO EN LA FOTO DE PRODUCCIÓN — ${rotas.length}  (pueden ser posteriores a la foto: NO es lo mismo que «pantalla rota»)\n`);
  for (const r of rotas) {
    console.log(`    ${r.nombre}  ·  ${r.archivo}:${r.linea}`);
    console.log(`      ${r.detalle}`);
    const fn = produccion.get(r.nombre);
    if (fn) console.log(`      la foto acepta: ${fn.parametros.join(", ") || "(sin parámetros)"}`);
    if (r.migracion) console.log(`      definida en supabase/migrations/${r.migracion}: o es posterior a la foto, o no se ha pegado en producción`);
    console.log("");
  }
} else {
  console.log(`  ✓ Ninguna pantalla llama a una función con parámetros que la foto de producción no acepte\n`);
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
  console.log(`  · Funciones en producción SIN llamada detectada desde apps/web — ${sinUsar.length}`);
  console.log(`    ${sinUsar.join(", ")}`);
  console.log(`    (ninguna pantalla las nombra. NO prueba que sobren: las puede llamar otra función o un disparador, usar un script o`);
  console.log(`     Dynamic, o ser una herramienta de mantenimiento que se corre a mano. Antes de retirar una, buscar quién la usa;`);
  console.log(`     la consulta está en DRIFT.md)\n`);
}

if (process.argv.includes("--md")) {
  const L = [];
  L.push(`# Diferencias — lo que la pantalla llama vs. lo que producción acepta`);
  L.push("");
  L.push(`> ⚠️ **ARCHIVO GENERADO.** Se reescribe con \`pnpm datos:comparar --md\`.`);
  L.push(`> Comparadas ${encontradas.length} llamadas de \`apps/web\` contra ${produccion.size} funciones del schema \`retail\` en producción.`);
  L.push(`> **Foto de producción: ${FOTO_FECHA ?? "sin fecha"}.** Todo lo de este archivo es tan fresco como esa foto: una función`);
  L.push(`> creada o cambiada DESPUÉS sale como «no existe» o con parámetros de más aunque en producción ya esté bien. Antes de dar`);
  L.push(`> una pantalla por rota, confirmarlo en producción; para refrescar la foto, \`docs/datos/generado/COMO-REFRESCAR.md\`.`);
  L.push("");
  L.push(`---`);
  L.push("");
  L.push(`## Llamadas sin respaldo en la foto de producción — ${rotas.length}`);
  L.push("");
  if (!rotas.length) {
    L.push(`Nada. Todas las llamadas encajan con la firma de la foto.`);
    L.push("");
  } else {
    L.push(`Cada entrada es una llamada que **la foto no respalda**: la función no aparece, o la app manda un parámetro que la foto no`);
    L.push(`tiene. **No es lo mismo que «pantalla rota»**: una función creada o cambiada después de la foto sale aquí aunque en`);
    L.push(`producción ya esté bien. Confirmarlo antes de actuar:`);
    L.push("");
    L.push("```sql");
    L.push(`select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname = '<nombre>';`);
    L.push("```");
    L.push("");
    L.push(`Si la foto está vieja, refrescarla (\`docs/datos/generado/COMO-REFRESCAR.md\`). Si la entrada dice «Definida en», esa migración`);
    L.push(`la crea: o es posterior a la foto, o todavía no se ha pegado en producción.`);
    L.push("");
  }
  for (const r of rotas) {
    L.push(`### \`${r.nombre}\` — ${r.tipo}`);
    L.push("");
    L.push(`**Dónde:** \`${r.archivo}:${r.linea}\``);
    L.push(`**Qué pasa:** ${r.detalle}`);
    const fn = produccion.get(r.nombre);
    if (fn) {
      L.push(`**La app manda:** \`${r.envia.join("`, `") || "—"}\``);
      L.push(`**La foto acepta:** \`${fn.parametros.join("`, `") || "—"}\``);
    }
    if (r.migracion) L.push(`**Definida en:** \`supabase/migrations/${r.migracion}\` (posterior a la foto, o sin pegar aún en producción)`);
    L.push(`**Si la foto estuviera al día,** esa pantalla fallaría siempre en las tiendas (no es intermitente): por eso hay que confirmarlo.`);
    L.push("");
  }
  L.push(`## Sobrecargas — ${sobrecargas.size}`);
  L.push("");
  if (!sobrecargas.size) {
    L.push(`Ninguna. Cada función tiene una sola firma en producción.`);
    L.push("");
  }
  for (const [nombre, firmas] of sobrecargas) {
    L.push(`### \`${nombre}\` — ${firmas.length} firmas`);
    L.push("");
    L.push(`Una llamada por nombre que no nombre todos los parámetros queda ambigua («function … is not unique») y falla siempre. Hay que soltar la firma sobrante (\`drop function\`).`);
    L.push("");
    for (const f of firmas) L.push(`- \`${f}\``);
    L.push("");
  }
  L.push(`## Avisos — ${avisos.length}`);
  L.push("");
  for (const a of avisos) L.push(`- \`${a.nombre}\` · \`${a.archivo}:${a.linea}\` — ${a.detalle}`);
  L.push("");
  L.push(`## No analizadas — ${noAnalizadas.length}`);
  L.push("");
  L.push(`Estas llamadas arman sus parámetros fuera de la propia llamada, o la pantalla nombra la función sin un`);
  L.push(`\`.rpc("…")\` directo (un ternario, un ayudante), así que no se pueden revisar leyendo el texto.`);
  L.push(`**No están aprobadas: están sin revisar.** Y una llamada indirecta a una función que NO existe en producción no se ve aquí:`);
  L.push(`solo se buscan los nombres que la foto conoce.`);
  L.push("");
  for (const n of noAnalizadas) L.push(`- \`${n.nombre}\` · \`${n.archivo}:${n.linea}\` — ${n.porque}`);
  L.push("");
  L.push(`## Funciones sin llamada detectada desde \`apps/web\` — ${sinUsar.length}`);
  L.push("");
  L.push(`Existen en producción y ninguna pantalla de \`apps/web\` las nombra entre comillas (ni con un \`.rpc("…")\` directo ni de otra`);
  L.push(`forma; los comentarios y las pruebas no cuentan; las \`fn_*\` se descartan a propósito). **Esto NO prueba que sobren.** Cada`);
  L.push(`una puede ser:`);
  L.push("");
  L.push(`- una función **a la que llama otra función o un disparador** de la base (aquí no se leen los cuerpos SQL);`);
  L.push(`- una que **usa un script o Dynamic** desde fuera, no una pantalla;`);
  L.push(`- una **herramienta de mantenimiento que se corre a mano** desde el SQL Editor (p. ej. \`recalcular_stock\`, \`archivar_*_prueba\`);`);
  L.push(`- una función **retirada o de legado** que sigue en la base;`);
  L.push(`- una **pantalla que falta construir**;`);
  L.push(`- o una función que de verdad **sobra**.`);
  L.push("");
  L.push(`Antes de retirar una, buscar quién la usa (\`git grep\` y, en producción, los cuerpos de las demás funciones y los disparadores):`);
  L.push("");
  L.push("```sql");
  L.push(`select p.proname from pg_proc p`);
  L.push(` where p.pronamespace = 'retail'::regnamespace and p.proname <> '<nombre>' and p.prosrc ~ ('\\m' || '<nombre>' || '\\M');`);
  L.push("```");
  L.push("");
  for (const s of sinUsar) L.push(`- \`${s}\``);
  L.push("");
  writeFileSync(join(GEN, "DRIFT.md"), L.join("\n"));
  console.log(`  ✓ docs/datos/generado/DRIFT.md reescrito\n`);
}

// Salir con 1 cuando hay llamadas sin respaldo es DELIBERADO: así esto sirve de alarma automática y puede frenar un
// despliegue (decisión D-19). Pero `pnpm` pinta ese código en rojo con un ELIFECYCLE que parece que el comando se rompió,
// y no es eso. Y OJO: «sin respaldo en la foto» no es «pantalla rota»: la foto puede estar vieja.
if (rotas.length) {
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Este comando termina con código 1 A PROPÓSITO: encontró ${rotas.length} llamada${rotas.length > 1 ? "s" : ""} que la foto de producción`);
  console.log(`  (${FOTO_FECHA ?? "sin fecha"}) no respalda. El "ELIFECYCLE / Command failed" que imprime pnpm justo debajo NO es un`);
  console.log(`  fallo del comando — es la alarma sonando.`);
  console.log(``);
  console.log(`  OJO: eso NO es lo mismo que «pantalla rota». Una función creada o cambiada después de la foto sale así aunque`);
  console.log(`  en producción ya esté bien. Qué hacer: confirmarlo en producción con`);
  console.log(`    select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname = '<nombre>';`);
  console.log(`  y, si la foto está vieja, refrescarla: docs/datos/generado/COMO-REFRESCAR.md\n`);
}

process.exit(rotas.length ? 1 : 0);
