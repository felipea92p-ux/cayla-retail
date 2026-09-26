#!/usr/bin/env node
/**
 * Comparador de firmas — ¿lo que la pantalla llama existe en la foto de producción?
 *
 * EL PROBLEMA QUE RESUELVE. `RegistrarGastoModal.tsx` llamó a `registrar_gasto` con siete parámetros mientras la
 * función que vivía en producción aceptaba seis: registrar un gasto estaba roto allá, y nada avisó (el código compila,
 * los tipos pasan, el lint pasa; el error solo aparece cuando alguien intenta registrar un gasto de verdad, con la
 * clienta esperando). Le pasó igual a `recibir_lote` y a `registrar_produccion` (hoy ya corregidos: es historia).
 *
 * Es un hueco muy específico, y por eso hace falta una herramienta propia:
 *   · `pnpm typecheck` compara el código contra los TIPOS GENERADOS, no contra la base.
 *     Si los tipos están viejos —y lo están—, aprueba una llamada imposible.
 *   · `pnpm migraciones:verificar` compara el REPO contra la base. Es la otra mitad, y
 *     no mira lo que el front llama.
 *   · Este script cierra el triángulo: compara la PANTALLA contra la FOTO de la base.
 *
 * QUÉ HACE. Lee con el parser de TypeScript cada `.rpc("x", { ... })` del código de las pantallas de `apps/web`
 * (sin comentarios ni pruebas: no son pantallas), saca los nombres de los parámetros que manda, y los cruza contra la
 * firma de esa función en la FOTO de producción.
 *
 * TODO LO QUE DICE ES TAN FRESCO COMO LA FOTO (`retail_foto.json` dice cuándo se tomó): una función creada o
 * cambiada DESPUÉS sale como «no está», con parámetros de más, o con un aviso de un parámetro que ya no existe, aunque en
 * producción ya esté bien. Por eso el informe habla de llamadas «sin respaldo en la foto» y no de pantallas «rotas»
 * (decisión tomada tras una falsa alarma real: 8 «rotas» que existían en producción).
 *
 * LO QUE PUEDE AFIRMAR Y LO QUE NO:
 *   · Un parámetro que la app manda y la foto NO acepta → si la foto está al día, la llamada falla SIEMPRE.
 *     Es la afirmación dura, y es la que importa; pero depende de la foto.
 *   · Una función que la app llama y que la foto no tiene → si la foto está al día, falla siempre.
 *   · Un parámetro que la función acepta y la app no manda → normalmente está bien
 *     (tiene valor por defecto: la foto no trae los defaults), así que sale como aviso, no como error.
 *   · Lo que no supo leer, lo dice. Una llamada con los parámetros armados en una
 *     variable aparte no se puede analizar mirando el texto, y sale listada como
 *     "no analizada" — nunca como aprobada. Un verificador que aprueba lo que no
 *     entendió enseña a confiar en un verde que no significa nada. (Aun así, que la FUNCIÓN exista
 *     no depende de cómo se armen sus parámetros, y eso sí se comprueba.)
 *   · Un nombre de función que la pantalla escribe entre comillas fuera de un `.rpc("…")` directo (un ternario, un
 *     ayudante, una constante) también es "no analizado": se ve que la pantalla la usa, pero no qué parámetros manda.
 *     Los comentarios NO cuentan (`comparar-lectura.mjs`). Lo que NO se ve: una llamada indirecta a una función que ni la
 *     foto ni ninguna migración del repo conocen.
 *   · «Sin llamada detectada» NO prueba que una función sobre: la puede llamar otra
 *     función, un disparador, un script o Dynamic. Nunca se retira una función por estar
 *     en esa lista sin buscar antes quién la usa.
 *
 * DE DÓNDE SACA LA VERDAD DE PRODUCCIÓN
 *   `docs/datos/generado/funciones-produccion.txt` y, para la fecha, `retail_foto.json` (los dos se refrescan JUNTOS:
 *   `docs/datos/generado/COMO-REFRESCAR.md`). La consulta que produce el primero, en el SQL Editor de producción:
 *
 *     select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
 *            || ' -> ' || pg_get_function_result(p.oid)
 *            || case when p.prosecdef then ' [definer]' else ' [invoker]' end
 *     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 *     where n.nspname = 'retail' and p.prokind = 'f' order by 1;
 *
 * USO
 *   pnpm datos:comparar          → informe en pantalla y reescribe docs/datos/generado/DRIFT.md;
 *                                   sale con código 1 si hay una llamada sin respaldo en la foto
 *   node scripts/datos/comparar.mjs   → solo el informe en pantalla
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { aliasesDeRpc, erroresDeSintaxis, esDePrueba, EXTENSIONES_DE_CODIGO, fechaDeLaFoto, llamadasRpc, nombresEntreComillas } from "./comparar-lectura.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
// `COMPARAR_RAIZ` solo existe para la prueba de extremo a extremo (`comparar.test.mjs`), que arma un repositorio de juguete.
const RAIZ = process.env.COMPARAR_RAIZ ?? join(AQUI, "..", "..");
const GEN = join(RAIZ, "docs", "datos", "generado");
const WEB = join(RAIZ, "apps", "web");
const FIRMAS = join(GEN, "funciones-produccion.txt");
const FOTO = join(GEN, "retail_foto.json");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");

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
  let firmas = 0;
  for (const linea of readFileSync(FIRMAS, "utf8").split("\n")) {
    const m = linea.match(/^([a-z0-9_]+)\((.*?)\)\s*->/i);
    if (!m) continue;
    firmas++;
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
  return { mapa, firmas };
}

// Cuándo se tomó la foto de producción con la que se compara. Todo lo que dice este informe es tan fresco como ella. La
// fecha vive en `retail_foto.json` y la lista en `funciones-produccion.txt`: si se refrescó solo uno de los dos, la fecha
// mentiría (dice «hoy» junto a una lista de ayer). `retail_foto.json` cuenta cuántas funciones vio: si no coincide con las
// firmas del .txt, no se fía de la fecha.
function leerFoto(firmas) {
  let foto = null;
  try {
    foto = JSON.parse(readFileSync(FOTO, "utf8"));
  } catch {
    return { fecha: null, aviso: null };
  }
  const fecha = fechaDeLaFoto(foto?.leido_en);
  if (typeof foto?.funciones === "number" && foto.funciones !== firmas) {
    return { fecha: null, aviso: `retail_foto.json dice ${foto.funciones} funciones y funciones-produccion.txt trae ${firmas}: no se refrescaron juntos, así que la fecha no es de fiar` };
  }
  return { fecha, aviso: null };
}

// La migración del repo que define cada función (la última que dice `create [or replace] function`). Sirve para decir,
// de una función que la foto no tiene, «está definida en esta migración: o es posterior a la foto, o no se ha pegado
// en producción». No lee SQL dinámico (`execute format(…)`), así que puede no encontrarla.
function migracionesQueDefinen() {
  const indice = new Map();
  const archivos = existsSync(MIGRACIONES) ? readdirSync(MIGRACIONES).filter(f => /^\d+_.*\.sql$/.test(f)).sort() : [];
  for (const f of archivos) {
    const sql = readFileSync(join(MIGRACIONES, f), "utf8");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:retail\.)?([a-z0-9_]+)\s*\(/gi)) indice.set(m[1].toLowerCase(), f);
  }
  return indice;
}

// ── Lo que las pantallas llaman ─────────────────────────────────────────────

// En orden alfabético: el orden en que `readdirSync` devuelve los archivos depende del sistema (macOS lo da alfabético; Linux
// no), y de él dependen el orden del informe y el «primera aparición» de una mención. Sin ordenar, regenerar DRIFT.md en otra
// máquina metería un diff enorme sin que nada haya cambiado.
function archivosDeCodigo(dir, acc = []) {
  for (const entrada of readdirSync(dir).sort()) {
    if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    const st = statSync(ruta);
    if (st.isDirectory()) archivosDeCodigo(ruta, acc);
    else if (EXTENSIONES_DE_CODIGO.test(entrada)) acc.push(ruta);
  }
  return acc;
}

/**
 * Lo que `apps/web` llama. `universo` son los nombres que se buscan entre comillas fuera de un `.rpc("…")` directo: las
 * funciones de la foto MÁS las que define alguna migración (una función posterior a la foto también se nombra).
 */
function llamadas(universo, produccion, migraciones) {
  const encontradas = [];
  const noAnalizadas = [];
  let total = 0; // todas las llamadas `.rpc(…)`
  let soloPorNombre = 0; // directas (nombre literal) cuyos parámetros no se pudieron leer
  let conNombreNoLiteral = 0; // un ternario, una variable…
  // Nombres de función que la pantalla escribe entre comillas (sin contar comentarios ni pruebas): la primera aparición
  // de cada uno. Los que además tienen un `.rpc("…")` directo ya están en `encontradas`/`noAnalizadas`.
  const mencionadas = new Map();

  for (const ruta of archivosDeCodigo(WEB)) {
    if (esDePrueba(ruta)) continue; // una prueba no es una pantalla: ni sus llamadas ni sus menciones cuentan
    const texto = readFileSync(ruta, "utf8");
    const archivo = relative(RAIZ, ruta).split(sep).join("/");

    // Con un error de sintaxis, el parser sigue y devuelve un árbol truncado: lo que venga después puede no leerse.
    const errores = erroresDeSintaxis(texto, ruta);
    if (errores) noAnalizadas.push({ archivo, linea: 1, nombre: "(archivo entero)", porque: `el parser de TypeScript vio ${errores} error${errores > 1 ? "es" : ""} de sintaxis: las llamadas que vengan después pueden no haberse leído` });

    // Las llamadas `.rpc(…)` y sus claves las lee el parser de TypeScript (`comparar-lectura.mjs`), no una expresión
    // regular ni un contador de llaves: un comentario, un texto o una expresión regular dentro de la llamada no la
    // desordenan. `.rpc("nombre" as never, …)` es la forma en que las pantallas de Finanzas esquivan los tipos
    // generados que aún no conocen la función; el parser la ve igual que `.rpc("nombre", …)`.
    for (const ll of llamadasRpc(texto, ruta)) {
      total++;
      const contexto = { archivo, linea: ll.linea };

      if (ll.nombre === null) {
        conNombreNoLiteral++;
        // El nombre no es UN texto. Los textos que puede valer (las dos ramas de un ternario) SON nombres de función por
        // construcción —estén o no en la foto—: cada uno cuenta como usado y, si la foto no lo tiene, sale «sin respaldo».
        const textos = [...new Set(ll.nombresEnElNombre)];
        if (textos.length) {
          for (const nombre of textos) noAnalizadas.push({ ...contexto, nombre, directa: true, porque: "el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros" });
        } else {
          noAnalizadas.push({ ...contexto, nombre: "(nombre calculado)", porque: "el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama" });
        }
        continue;
      }

      const c = { ...contexto, nombre: ll.nombre, directa: true };
      if (ll.argumentos === "ninguno") encontradas.push({ ...c, envia: [] });
      else if (ll.argumentos === "objeto") encontradas.push({ ...c, envia: ll.claves });
      else {
        soloPorNombre++;
        // Las claves que sí están escritas ahí mismo se guardan: una que la función no acepta falla siempre, haya o no «...».
        const porque =
          ll.argumentos === "objeto con spread" ? "el objeto se arma con «...», no se puede leer entero"
          : ll.argumentos === "objeto con clave calculada" ? "el objeto tiene una clave calculada, no se puede leer entero"
          : "los parámetros no van escritos ahí mismo";
        noAnalizadas.push({ ...c, claves: ll.claves, porque });
      }
    }

    // `.rpc` usado como valor (`.rpc.bind(x)`, `const { rpc } = x`, `x["rpc"](…)`): por ahí se llama a una función sin que la
    // lectura de arriba lo vea. No se sabe cuál llama: sale como «no analizada».
    for (const a of aliasesDeRpc(texto, ruta)) noAnalizadas.push({ archivo, linea: a.linea, nombre: "(alias de rpc)", porque: `\`.rpc\` se usa como valor (${a.forma}): la función que se llama por ahí no se ve` });

    for (const { nombre, linea } of nombresEntreComillas(texto, universo, ruta)) {
      if (!mencionadas.has(nombre)) mencionadas.set(nombre, { archivo, linea });
    }
  }

  // Lo que la pantalla nombra pero no llama con un `.rpc("…")` directo (un ayudante, una lista de nombres, una constante): la
  // usa, pero no se pueden leer sus parámetros. Sale como «no analizada», nunca como aprobada.
  const yaVistas = new Set([...encontradas, ...noAnalizadas].map(l => l.nombre));
  for (const [nombre, donde] of mencionadas) {
    if (yaVistas.has(nombre)) continue;
    const porque = produccion.has(nombre)
      ? 'el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros'
      : `el nombre va entre comillas (un ayudante, una constante…) y la foto de producción NO tiene esa función; la crea supabase/migrations/${migraciones.get(nombre)} (posterior a la foto, sin pegar aún en producción, o retirada después)`;
    noAnalizadas.push({ ...donde, nombre, porque });
  }
  return { encontradas, noAnalizadas, total, soloPorNombre, conNombreNoLiteral };
}

// ── El informe ──────────────────────────────────────────────────────────────

const { mapa: produccion, firmas: totalFirmas } = firmasDeProduccion();
const { fecha: FOTO_FECHA, aviso: FOTO_AVISO } = leerFoto(totalFirmas);
const migraciones = migracionesQueDefinen();
const migracionQueDefine = nombre => migraciones.get(nombre) ?? null;
const { encontradas, noAnalizadas, total, soloPorNombre, conNombreNoLiteral } = llamadas(new Set([...produccion.keys(), ...migraciones.keys()]), produccion, migraciones);

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

// Una llamada directa que no se pudo leer entera (parámetros en una variable, «...», un ternario) también se comprueba contra
// la foto: que la FUNCIÓN exista no depende de cómo estén armados sus parámetros, y una clave escrita ahí mismo que la función
// no acepta falla siempre aunque haya un «...». Sin esto, una llamada a una función que la foto no tiene salía solo como «no
// analizada» y el informe contaba de menos (`crear_producto_con_stock_inicial`, `bajar_al_piso`).
for (const n of noAnalizadas) {
  if (!n.directa) continue;
  const fn = produccion.get(n.nombre);
  if (!fn) {
    rotas.push({ ...n, envia: [], tipo: "no está en la foto", detalle: `la función \`${n.nombre}\` no está en la foto de producción (${FOTO_FECHA ?? "sin fecha"}); sus parámetros no se pudieron leer`, migracion: migracionQueDefine(n.nombre) });
    continue;
  }
  const sobran = (n.claves ?? []).filter(p => !fn.parametros.includes(p));
  if (sobran.length) rotas.push({ ...n, envia: n.claves, tipo: "parámetro de más", detalle: `manda \`${sobran.join("`, `")}\` (de los que se leen: el resto del objeto no se pudo leer entero) y la foto de producción no lo acepta` });
}

// Una llamada que no se pudo leer entera («...», parámetros armados fuera) sigue siendo una llamada: la función tiene
// pantalla. Sin esto, `registrar_venta` salía como «nadie la llama» estando en el punto de venta. Las `fn_*` se dejan fuera
// a propósito: la mayoría son disparadores, candados de dinero y ayudantes que llaman otras funciones.
const llamadasUnicas = new Set([...encontradas, ...noAnalizadas].map(l => l.nombre));
const fnTodas = [...produccion.keys()].filter(n => n.startsWith("fn_"));
const fnSinPantalla = fnTodas.filter(n => !llamadasUnicas.has(n));
const sinUsar = [...produccion.keys()].filter(n => !llamadasUnicas.has(n) && !n.startsWith("fn_"));

// El titular dice de qué son las cifras: no todas las llamadas se pueden comparar parámetro por parámetro.
const TITULAR = `${total} llamadas \`.rpc\` de apps/web contra ${produccion.size} funciones de producción`;
const DESGLOSE = `${encontradas.length} con los parámetros leídos (se comparan uno por uno), ${soloPorNombre} directas cuyos parámetros no se pudieron leer (solo se comprueba que la función exista), ${conNombreNoLiteral} con el nombre en un ternario o una variable`;

console.log(`\n  Comparando ${TITULAR}`);
console.log(`  (${DESGLOSE})`);
console.log(`  Foto de producción: ${FOTO_FECHA ?? "SIN FECHA"}. Una función creada o cambiada DESPUÉS sale como «no está», con parámetros`);
console.log(`  de más o con un aviso de un parámetro que ya no existe, aunque en producción ya esté bien: confirmar en producción`);
console.log(`  antes de dar una pantalla por rota.`);
if (FOTO_AVISO) console.log(`  ⚠ ${FOTO_AVISO}.`);
console.log("");

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
    if (r.migracion) console.log(`      la crea supabase/migrations/${r.migracion}: se pegó después de la foto, o todavía no se ha pegado en producción`);
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
  console.log(`    (ninguna pantalla las nombra${fnTodas.length ? `; a ${fnSinPantalla.length} de las ${fnTodas.length} \`fn_*\` tampoco, y esas NO se listan aquí` : ""}. NO prueba que sobren: las puede llamar otra función o un disparador, usar un script o`);
  console.log(`     Dynamic, o ser una herramienta de mantenimiento que se corre a mano. Antes de retirar una, buscar quién la usa;`);
  console.log(`     la consulta está en DRIFT.md)\n`);
}

if (process.argv.includes("--md")) {
  const L = [];
  L.push(`# Diferencias — lo que la pantalla llama vs. lo que producción acepta`);
  L.push("");
  L.push(`> ⚠️ **ARCHIVO GENERADO.** Se reescribe con \`pnpm datos:comparar --md\`.`);
  L.push(`> Comparadas ${total} llamadas \`.rpc\` de \`apps/web\` contra ${produccion.size} funciones del schema \`retail\` en producción: ${DESGLOSE}.`);
  L.push(`> **Foto de producción: ${FOTO_FECHA ?? "sin fecha"}.** Todo lo de este archivo es tan fresco como esa foto: una función`);
  L.push(`> creada o cambiada DESPUÉS sale como «no existe», con parámetros de más o con un aviso de un parámetro que ya no existe, aunque en`);
  L.push(`> producción ya esté bien. Antes de dar una pantalla por rota, confirmarlo en producción; para refrescar la foto,`);
  L.push(`> \`docs/datos/generado/COMO-REFRESCAR.md\`.`);
  if (FOTO_AVISO) L.push(`> ⚠ **${FOTO_AVISO}.**`);
  L.push("");
  L.push(`> **Palabras de este informe.** *Foto*: la lista de funciones de producción que está en \`funciones-produccion.txt\`, tomada en la fecha`);
  L.push(`> de arriba. *Aviso*: la pantalla no manda un parámetro que la función acepta (normal si tiene valor por defecto). *Sobrecarga*: dos`);
  L.push(`> funciones con el mismo nombre y distinta lista de parámetros: una llamada por nombre queda ambigua. Las \`fn_*\` (${fnTodas.length} en la`);
  L.push(`> foto: en su mayoría disparadores, candados de dinero y ayudantes que llaman otras funciones) se dejan fuera de «sin llamada» a`);
  L.push(`> propósito; ${fnTodas.length - fnSinPantalla.length} sí las nombra una pantalla y salen en las secciones de arriba, y a las otras ${fnSinPantalla.length} no las nombra ninguna pantalla y aquí no se listan.`);
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
    L.push(`Si la foto está vieja, refrescarla (\`docs/datos/generado/COMO-REFRESCAR.md\`). Si la entrada trae «Migración que la crea», esa`);
    L.push(`migración define la función: se pegó en producción después de la foto, o todavía no se ha pegado.`);
    L.push("");
  }
  for (const r of rotas) {
    L.push(`### \`${r.nombre}\` — ${r.tipo}`);
    L.push("");
    L.push(`- **Dónde:** \`${r.archivo}:${r.linea}\``);
    L.push(`- **Qué pasa:** ${r.detalle}`);
    const fn = produccion.get(r.nombre);
    if (fn) {
      L.push(`- **La app manda:** \`${r.envia.join("`, `") || "—"}\``);
      L.push(`- **La foto acepta:** \`${fn.parametros.join("`, `") || "—"}\``);
    }
    if (r.migracion) L.push(`- **Migración que la crea:** \`supabase/migrations/${r.migracion}\` (se pegó después de la foto, o todavía no)`);
    L.push(`- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.`);
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
  L.push(`Estas ${noAnalizadas.length} entradas son **entradas, no llamadas** (un ternario da dos; una función mencionada da una aunque no haya llamada):`);
  L.push(`arman sus parámetros fuera de la propia llamada, o la pantalla nombra la función sin un \`.rpc("…")\` directo (un ternario, un`);
  L.push(`ayudante, una constante), o usan \`.rpc\` como valor (\`.bind\`, \`const { rpc } = x\`). No se pueden revisar leyendo el texto.`);
  L.push(`**No están aprobadas: están sin revisar.** Una llamada directa o de un ternario a una función que la foto no tiene también está arriba,`);
  L.push(`entre las «sin respaldo» (p. ej. \`crear_producto_con_stock_inicial\`). Lo que aquí NO se ve: una llamada indirecta a una función que ni la`);
  L.push(`foto ni ninguna migración del repo conocen.`);
  L.push("");
  for (const n of noAnalizadas) L.push(`- \`${n.nombre}\` · \`${n.archivo}:${n.linea}\` — ${n.porque}`);
  L.push("");
  L.push(`## Funciones sin llamada detectada desde \`apps/web\` — ${sinUsar.length}`);
  L.push("");
  L.push(`Existen en producción y ninguna pantalla de \`apps/web\` las nombra entre comillas (ni con un \`.rpc("…")\` directo ni de otra`);
  L.push(`forma; los comentarios y las pruebas no cuentan; las \`fn_*\` se descartan a propósito). **Esto NO prueba que sobren.** Cada`);
  L.push(`una puede ser:`);
  L.push("");
  L.push(`- una función **a la que llama otra función o un disparador** de la base (aquí no se leen los cuerpos SQL): p. ej. \`recibir_compras\``);
  L.push(`  la llama \`recibir_envio\` (migración \`20260919121000\`), que es la que la pantalla de recepción nombra;`);
  L.push(`- una que **usa un script o Dynamic** desde fuera, no una pantalla;`);
  L.push(`- una **herramienta de mantenimiento que se corre a mano** desde el SQL Editor (p. ej. \`recalcular_stock\`, \`archivar_*_prueba\`);`);
  L.push(`- una función **retirada o de legado** que sigue en la base;`);
  L.push(`- una **pantalla que falta construir**;`);
  L.push(`- o una función que de verdad **sobra**.`);
  L.push("");
  L.push(`Antes de retirar una, buscar quién la usa (\`git grep\` y, en producción, los cuerpos de las demás funciones). Esta consulta lee SOLO`);
  L.push(`cuerpos de funciones de \`retail\`: los disparadores, las políticas de seguridad y los trabajos programados (cron) se miran aparte.`);
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
