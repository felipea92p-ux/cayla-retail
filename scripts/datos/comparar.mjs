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
import { esDePrueba, fechaDeLaFoto, llamadasRpc, nombresEntreComillas } from "./comparar-lectura.mjs";

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
    const archivo = relative(RAIZ, ruta);

    // Las llamadas `.rpc(…)` y sus claves las lee el parser de TypeScript (`comparar-lectura.mjs`), no una expresión
    // regular ni un contador de llaves: un comentario, un texto o una expresión regular dentro de la llamada no la
    // desordenan. `.rpc("nombre" as never, …)` es la forma en que las pantallas de Finanzas esquivan los tipos
    // generados que aún no conocen la función; el parser la ve igual que `.rpc("nombre", …)`.
    for (const ll of llamadasRpc(texto, ruta)) {
      const contexto = { archivo, linea: ll.linea };

      if (ll.nombre === null) {
        // El nombre no es UN texto: un ternario (`cond ? "a" : "b"`), una variable, una plantilla.
        const funciones = ll.nombresEnElNombre.filter(n => conocidas.has(n));
        if (funciones.length) {
          for (const nombre of funciones) noAnalizadas.push({ ...contexto, nombre, porque: "el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros" });
        } else {
          noAnalizadas.push({ ...contexto, nombre: "(nombre calculado)", porque: "el nombre de la función no va escrito ahí mismo (una variable o una plantilla): no se sabe cuál llama" });
        }
        continue;
      }

      const c = { ...contexto, nombre: ll.nombre, directa: true };
      if (ll.argumentos === "ninguno") encontradas.push({ ...c, envia: [] });
      else if (ll.argumentos === "objeto") encontradas.push({ ...c, envia: ll.claves });
      else if (ll.argumentos === "objeto con spread") noAnalizadas.push({ ...c, porque: "el objeto se arma con «...», no se puede leer entero" });
      else if (ll.argumentos === "objeto con clave calculada") noAnalizadas.push({ ...c, porque: "el objeto tiene una clave calculada, no se puede leer entero" });
      else noAnalizadas.push({ ...c, porque: "los parámetros no van escritos ahí mismo" });
    }

    for (const { nombre, linea } of nombresEntreComillas(texto, conocidas, ruta)) {
      if (!mencionadas.has(nombre)) mencionadas.set(nombre, { archivo, linea });
    }
  }

  // Lo que la pantalla nombra pero no llama con un `.rpc("…")` directo (un ayudante, una lista de nombres): la usa, pero no
  // se pueden leer sus parámetros. Sale como «no analizada», nunca como aprobada.
  const yaVistas = new Set([...encontradas, ...noAnalizadas].map(l => l.nombre));
  for (const [nombre, donde] of mencionadas) {
    if (yaVistas.has(nombre)) continue;
    noAnalizadas.push({ ...donde, nombre, porque: 'el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante…): no se leen sus parámetros' });
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

// Una llamada directa que no se pudo leer entera (parámetros en una variable, «...») también se comprueba contra la foto:
// que la FUNCIÓN exista no depende de cómo estén armados sus parámetros. Sin esto, una llamada a una función que la foto no
// tiene salía solo como «no analizada» y el informe contaba de menos (`crear_producto_con_stock_inicial`, 2026-09-26).
for (const n of noAnalizadas) {
  if (n.directa && !produccion.has(n.nombre)) {
    rotas.push({ ...n, envia: [], tipo: "no está en la foto", detalle: `la función \`${n.nombre}\` no está en la foto de producción (${FOTO_FECHA ?? "sin fecha"}); sus parámetros no se pudieron leer`, migracion: migracionQueDefine(n.nombre) });
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
  L.push(`> **Palabras de este informe.** *Foto*: la lista de funciones de producción que está en \`funciones-produccion.txt\`, tomada en la fecha`);
  L.push(`> de arriba. *Aviso*: la pantalla no manda un parámetro que la función acepta (normal si tiene valor por defecto). *Sobrecarga*: dos`);
  L.push(`> funciones con el mismo nombre y distinta lista de parámetros: una llamada por nombre queda ambigua. Las \`fn_*\` (permisos y`);
  L.push(`> ayudantes que llaman otras funciones, no las pantallas) se dejan fuera de «sin llamada» a propósito.`);
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
    L.push(`- **Si la foto estuviera al día,** esa pantalla fallaría siempre en las tiendas (no es intermitente): por eso hay que confirmarlo.`);
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
  L.push(`**No están aprobadas: están sin revisar.** Ojo con lo que aquí NO se ve: una llamada indirecta (un ternario, un ayudante) a una`);
  L.push(`función que la foto no conoce no sale, porque de un nombre calculado solo se listan los que la foto sí tiene. Las llamadas`);
  L.push(`directas a una función ausente sí se cuentan, arriba, entre las «sin respaldo».`);
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
