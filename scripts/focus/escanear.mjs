#!/usr/bin/env node
/**
 * Escáner de la GUÍA DE FOCO (CLAUDE.md «Guía de foco», ADR-0284): ¿las pantallas que se están construyendo o editando ya dicen
 * qué está hecho, qué sigue y qué falta? Es el ojo de la skill `/focus` (`.claude/skills/focus/SKILL.md`).
 *
 * QUÉ PROMETE. Mapea los archivos que cambiaron (la rama contra `origin/main` + lo que está sin commitear) a las pantallas
 * (`page.tsx` de `app/(app)`) que los usan, y por cada una dice: si tiene campos o pasos, si usa las piezas de la guía y qué
 * estado tiene en `lib/guia-de-foco-pantallas.ts`. Los MODALES (todo archivo que dibuja un `<Modal>` con campos) se miran aparte,
 * uno por uno: una pantalla y cada uno de sus modales tienen su propia guía (dentro de un modal se enciende el control que sigue).
 * Un veredicto por pantalla y por modal:
 *   con-guia   tiene campos y usa las piezas de la guía;
 *   sin-guia   tiene campos y NO las usa → hay que hacerla;
 *   no-aplica  no se detectaron campos ni pasos (un listado, un mensaje).
 *
 * QUÉ ASUME. La detección es por texto (heurística): sirve para NO olvidarse, no para juzgar. Un `sin-guia` se confirma leyendo la
 * pantalla; un `no-aplica` en una pantalla con un flujo escondido (un modal que abre otro archivo) también. Los archivos que
 * demasiadas pantallas comparten (el combo «Responsable», la barra de cambios…) no cuentan como «de una pantalla»: si no, tocar un
 * combo marcaría medio ERP.
 *
 * USO   node scripts/focus/escanear.mjs [--base origin/main] [--todo] [--ruta /vender] [--json] [--estricto]
 *   (sin banderas)  las pantallas tocadas por tus cambios
 *   --todo          TODAS las pantallas (el tablero del despliegue, por módulo)
 *   --ruta R        solo esa pantalla
 *   --estricto      sale con código 1 si alguna pantalla o modal del alcance está `sin-guia`
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Cuántas pantallas tienen que usar un archivo para llamarlo «compartido» (no es de ninguna pantalla en particular). */
export const UMBRAL_COMPARTIDO = 8;

const RAIZ_WEB = "apps/web/";
const PANTALLAS = `${RAIZ_WEB}app/(app)/`;
export const REGISTRO = `${RAIZ_WEB}lib/guia-de-foco-pantallas.ts`;

/** Campos o pasos: un control donde alguien escribe o elige. Solo JSX (`<`), para no contar comentarios. */
const CAMPOS = /<(input|textarea|form|Campo\w*|Select\w*|Combo\w*|Desplegable|Segmentado|Interruptor)\b/;
/**
 * El USO de las piezas de la guía —una etiqueta JSX o una llamada— o el import de una lógica `lib/<pantalla>-guia`. Ojo con lo que NO
 * es: `fin-guia` (una clase de Finanzas) y `recepcion-guia` (la guía de remisión) no son la guía de foco; por eso se exige la forma.
 */
const GUIA = /<(MarcaCampo|ConMarca|EtiquetaAhora|FaltanDelPaso|TiraFicha|CampoGuiado|PieGuia)\b|\b(useGuiaAlta|useGuiaCampos|irAlIdCampo|useRetenerLuz)\(|\bdata-campo=|from\s*["']@\/lib\/[\w-]+-guia["']/;

/** Un modal: el archivo dibuja un `<Modal>` / `<ModalRuta>` (o un `Dialog.Content` propio). Con campos, pide su guía. */
const MODAL = /<Modal\b|<ModalRuta\b|Dialog\.Content/;
export const esModal = (texto) => MODAL.test(texto);
/** Cuántos controles trae un archivo (una pista para decidir «no-aplica»: un modal de UN solo campo no tiene camino que indicar). */
export const contarControles = (texto) => (texto.match(new RegExp(CAMPOS.source, "g")) ?? []).length;

/** Los archivos que DEFINEN las piezas de la guía: usarlos por dentro no es «tener guía» (`piezas.tsx` la lleva `FilaAlta`, y otras
 *  pantallas —Marcas, Conteo— lo alcanzan por un subcomponente sin guiar nada). */
export const DEFINEN_LA_GUIA = new Set([
  `${RAIZ_WEB}components/alta-producto/guia.tsx`,
  `${RAIZ_WEB}components/alta-producto/piezas.tsx`,
  `${RAIZ_WEB}components/alta-producto/useGuiaAlta.ts`,
  `${RAIZ_WEB}components/ficha-producto/TiraFicha.tsx`,
  `${RAIZ_WEB}components/guia-de-foco/CampoGuiado.tsx`,
  `${RAIZ_WEB}components/guia-de-foco/useGuiaCampos.tsx`,
  `${RAIZ_WEB}components/guia-de-foco/useRetenerLuz.ts`,
]);

export const tieneCampos = (texto) => CAMPOS.test(texto);
export const tieneGuia = (texto) => GUIA.test(texto);

/** Lo que una pantalla nueva no puede tocar sin querer: los componentes base y las pruebas no son «una pantalla». */
export function esArchivoDeUi(ruta) {
  if (!/\.(tsx)$/.test(ruta) || /\.test\./.test(ruta)) return false;
  if (ruta.startsWith(`${RAIZ_WEB}components/ui/`)) return false;
  return ruta.startsWith(PANTALLAS) || ruta.startsWith(`${RAIZ_WEB}components/`);
}

/** `apps/web/app/(app)/productos/[id]/editar/page.tsx` → `/productos/[id]/editar`; el `page.tsx` raíz (Inicio) → `/`. */
export function rutaDePagina(archivo) {
  if (!archivo.startsWith(PANTALLAS) || !archivo.endsWith("/page.tsx")) return null;
  const r = archivo.slice(PANTALLAS.length, -"/page.tsx".length);
  return `/${r}`;
}
const esPaginaRaiz = (archivo) => archivo === `${PANTALLAS}page.tsx`;

/** Los `from "…"` y `import("…")` de un archivo. */
export function importsDe(texto) {
  const out = [];
  for (const m of texto.matchAll(/(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of texto.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

/** Resuelve un import a un archivo que existe en `archivos` (un `Map ruta → texto`); `null` si es de afuera (react, next…). */
export function resolverImport(desde, especificador, archivos) {
  let base;
  if (especificador.startsWith("@/")) base = posix.normalize(`${RAIZ_WEB}${especificador.slice(2)}`);
  else if (especificador.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(desde), especificador));
  else return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) if (archivos.has(c)) return c;
  return null;
}

export function construirGrafo(archivos) {
  const grafo = new Map();
  for (const [ruta, texto] of archivos) {
    const destinos = new Set();
    for (const esp of importsDe(texto)) {
      const d = resolverImport(ruta, esp, archivos);
      if (d && d !== ruta) destinos.add(d);
    }
    grafo.set(ruta, destinos);
  }
  return grafo;
}

/** Todo lo que una raíz alcanza siguiendo imports, sin entrar a los archivos excluidos (la UI base y lo compartido). */
export function alcanzables(grafo, raiz, excluidos = () => false) {
  const vistos = new Set([raiz]);
  const pila = [raiz];
  while (pila.length) {
    for (const d of grafo.get(pila.pop()) ?? []) {
      if (vistos.has(d) || excluidos(d)) continue;
      vistos.add(d);
      pila.push(d);
    }
  }
  return vistos;
}

/** El registro `lib/guia-de-foco-pantallas.ts` como `Map ruta → "aplicada" | "no-aplica" | "pendiente"` (lectura por texto: sin compilar TS). */
export function parsearRegistro(texto) {
  const out = new Map();
  for (const m of texto.matchAll(/^\s*"((?:\/|components\/|app\/)[^"]*)":\s*(PENDIENTE\b|\{[^\n]*?estado:\s*"(aplicada|no-aplica)")/gm)) {
    out.set(m[1], m[2].startsWith("PENDIENTE") ? "pendiente" : m[3]);
  }
  return out;
}

/**
 * `archivos`: Map ruta → texto de todo `apps/web` (.ts/.tsx). `cambiados`: Set de rutas. `registro`: Map (ver `parsearRegistro`).
 * `alcance`: "tocadas" (por defecto) | "todas". `soloRuta`: una ruta concreta.
 * Devuelve `{ pantallas, sueltos, compartidos }`.
 */
export function analizar({ archivos, cambiados = new Set(), registro = new Map(), alcance = "tocadas", soloRuta = null, umbral = UMBRAL_COMPARTIDO }) {
  const grafo = construirGrafo(archivos);
  const paginas = [...archivos.keys()].filter((f) => rutaDePagina(f) !== null);
  const esUiBase = (f) => f.startsWith(`${RAIZ_WEB}components/ui/`);

  // 1) cuántas pantallas usa cada archivo (sin entrar a la UI base): los muy usados son «compartidos».
  const usadoPor = new Map();
  for (const p of paginas) for (const f of alcanzables(grafo, p, esUiBase)) if (f !== p) usadoPor.set(f, (usadoPor.get(f) ?? 0) + 1);
  const compartidos = new Set([...usadoPor].filter(([, n]) => n >= umbral).map(([f]) => f));
  const esExcluido = (f) => esUiBase(f) || compartidos.has(f);

  // Los modales (archivo que dibuja un <Modal> con campos) se miran aparte: una pantalla no queda «con guía» porque uno de sus modales la
  // tenga, ni «sin guía» por uno que no. Límite: un archivo que es a la vez el formulario principal y dibuja un <Modal> cuenta como modal.
  const modales = new Set([...archivos.keys()].filter((f) => esArchivoDeUi(f) && esModal(archivos.get(f)) && tieneCampos(archivos.get(f))));
  const rutasDeModal = new Map();

  // 2) cada pantalla y lo suyo
  const pantallas = [];
  const alcanzadosPorAlguna = new Set();
  for (const p of paginas) {
    const ruta = rutaDePagina(p);
    const propios = alcanzables(grafo, p, esExcluido);
    for (const f of propios) {
      alcanzadosPorAlguna.add(f);
      if (modales.has(f)) rutasDeModal.set(f, [...(rutasDeModal.get(f) ?? []), ruta]);
    }
    // «Se está editando» = cambió un archivo de UI suyo (su page.tsx o un componente). Ni la lógica de `lib/` ni los archivos que DEFINEN la guía
    // cuentan: cambiar una pieza (`guia.tsx`, `CampoGuiado`…) no marca a cada pantalla que la alcanza.
    const tocados = [...propios].filter((f) => cambiados.has(f) && esArchivoDeUi(f) && !DEFINEN_LA_GUIA.has(f));
    const conCampos = [...propios].filter((f) => esArchivoDeUi(f) && !modales.has(f) && tieneCampos(archivos.get(f)));
    const conGuia = [...propios].filter((f) => esArchivoDeUi(f) && !modales.has(f) && !DEFINEN_LA_GUIA.has(f) && tieneGuia(archivos.get(f)));
    const dentro = alcance === "todas" || tocados.length > 0;
    if (!dentro || (soloRuta && ruta !== soloRuta)) continue;
    const veredicto = conCampos.length === 0 ? "no-aplica" : conGuia.length > 0 ? "con-guia" : "sin-guia";
    const enRegistro = registro.get(ruta) ?? null;
    // Lo que hay que arreglar en el registro: una pantalla con guía que sigue «pendiente», o una «aplicada» sin guía.
    let registroAjuste = null;
    if (veredicto === "con-guia" && enRegistro === "pendiente") registroAjuste = "promover-a-aplicada";
    else if (enRegistro === "aplicada" && veredicto !== "con-guia") registroAjuste = "aplicada-sin-guia";
    else if (enRegistro === null) registroAjuste = "falta-en-el-registro";
    pantallas.push({ ruta, pagina: p, veredicto, registro: enRegistro, registroAjuste, tocados: tocados.sort(), conCampos: conCampos.sort(), conGuia: conGuia.sort() });
  }

  // 3) los modales: uno por archivo, con su veredicto y su estado en el registro
  const modalesInforme = [];
  for (const f of [...modales].sort()) {
    const rutas = rutasDeModal.get(f) ?? [];
    const tocado = cambiados.has(f);
    const dentro = alcance === "todas" ? true : tocado;
    if (!dentro || (soloRuta && !rutas.includes(soloRuta))) continue;
    const texto = archivos.get(f);
    const veredicto = !DEFINEN_LA_GUIA.has(f) && tieneGuia(texto) ? "con-guia" : "sin-guia";
    const clave = f.replace(RAIZ_WEB, "");
    const enRegistro = registro.get(clave) ?? null;
    let registroAjuste = null;
    if (veredicto === "con-guia" && enRegistro === "pendiente") registroAjuste = "promover-a-aplicada";
    else if (enRegistro === "aplicada" && veredicto !== "con-guia") registroAjuste = "aplicada-sin-guia";
    else if (enRegistro === null) registroAjuste = "falta-en-el-registro";
    modalesInforme.push({ archivo: f, controles: contarControles(texto), veredicto, registro: enRegistro, registroAjuste, tocado, pantallas: rutas.sort() });
  }

  // 4) archivos de UI con campos que cambiaron y que NO llegan a ninguna pantalla (algo en construcción que ni es un modal)
  const sueltos = [...cambiados]
    .filter((f) => archivos.has(f) && esArchivoDeUi(f) && !esExcluido(f) && !alcanzadosPorAlguna.has(f) && !rutaDePagina(f) && !modales.has(f))
    .filter((f) => tieneCampos(archivos.get(f)))
    .map((f) => ({ archivo: f, conGuia: !DEFINEN_LA_GUIA.has(f) && tieneGuia(archivos.get(f)) }))
    .sort((a, b) => a.archivo.localeCompare(b.archivo));

  pantallas.sort((a, b) => a.ruta.localeCompare(b.ruta));
  return { pantallas, modales: modalesInforme, sueltos, compartidos: [...compartidos].sort() };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Lectura del disco y de git
// ---------------------------------------------------------------------------------------------------------------------------

export function leerWeb(raiz) {
  const archivos = new Map();
  const recorrer = (dir) => {
    for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        recorrer(rel);
      } else if (/\.(ts|tsx)$/.test(e.name)) archivos.set(rel, readFileSync(join(raiz, rel), "utf8"));
    }
  };
  recorrer(RAIZ_WEB.slice(0, -1));
  return archivos;
}

function git(raiz, args) {
  try {
    return execFileSync("git", args, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** Lo que cambió: la rama contra `base` (si existe) + sin commitear + archivos nuevos sin seguir. */
export function archivosCambiados(raiz, base) {
  const salida = [];
  if (git(raiz, ["rev-parse", "--verify", "--quiet", base]).trim()) salida.push(git(raiz, ["diff", "--name-only", `${base}...HEAD`]));
  salida.push(git(raiz, ["diff", "--name-only"]), git(raiz, ["diff", "--name-only", "--cached"]), git(raiz, ["ls-files", "--others", "--exclude-standard"]));
  return new Set(salida.join("\n").split("\n").map((l) => l.trim()).filter(Boolean));
}

const ICONO = { "con-guia": "✅", "sin-guia": "❌", "no-aplica": "➖" };
const AJUSTE = {
  "promover-a-aplicada": "pasarla a «aplicada» en el registro y bajar PENDIENTES_HOY",
  "aplicada-sin-guia": "el registro dice «aplicada» pero no se detecta la guía",
  "falta-en-el-registro": "agregarla al registro (`lib/guia-de-foco-pantallas.ts`)",
};

export function informe(resultado, { alcance, base, nCambiados }) {
  const { pantallas, sueltos } = resultado;
  const modales = resultado.modales ?? [];
  const L = [];
  L.push(`# Guía de foco — ${alcance === "todas" ? "todas las pantallas" : "pantallas que estás construyendo o editando"}`);
  L.push("");
  if (alcance !== "todas") L.push(`Base: \`${base}\` · archivos cambiados: ${nCambiados}`, "");
  const por = (v) => pantallas.filter((p) => p.veredicto === v);
  L.push(`**Pantallas: ${por("con-guia").length} con guía · ${por("sin-guia").length} SIN guía · ${por("no-aplica").length} sin campos** (de ${pantallas.length})`);
  const mPor = (v) => modales.filter((m) => m.veredicto === v);
  L.push(`**Modales: ${mPor("con-guia").length} con guía · ${mPor("sin-guia").length} SIN guía** (de ${modales.length})`, "");

  if (pantallas.length > 0) {
    L.push("| | Pantalla | Registro | Campos en | Guía en |", "|---|---|---|---|---|");
    const corto = (f) => f.replace(RAIZ_WEB, "");
    for (const p of pantallas) {
      L.push(`| ${ICONO[p.veredicto]} | \`${p.ruta}\` | ${p.registro ?? "—"} | ${p.conCampos.map(corto).slice(0, 3).join(", ") || "—"} | ${p.conGuia.map(corto).slice(0, 2).join(", ") || "—"} |`);
    }
    L.push("");
  }
  if (modales.length > 0) {
    L.push("| | Modal | Registro | Controles | Se abre desde |", "|---|---|---|---|---|");
    for (const m of modales) L.push(`| ${m.veredicto === "con-guia" ? "✅" : "❌"} | \`${m.archivo.replace(RAIZ_WEB, "")}\` | ${m.registro ?? "—"} | ${m.controles} | ${m.pantallas.slice(0, 3).join(", ") || "—"} |`);
    L.push("");
  }
  const sin = por("sin-guia");
  const mSin = mPor("sin-guia");
  if (sin.length || mSin.length) {
    L.push("## Sin guía — hay que hacerla", "");
    for (const p of sin) L.push(`- \`${p.ruta}\` — campos en ${p.conCampos.map((f) => `\`${f.replace(RAIZ_WEB, "")}\``).join(", ")}`);
    for (const m of mSin) L.push(`- modal \`${m.archivo.replace(RAIZ_WEB, "")}\` (${m.controles} controles${m.controles <= 1 ? " — con uno solo, quizá «no-aplica»" : ""})`);
    L.push("");
  }
  const ajustes = pantallas.filter((p) => p.registroAjuste);
  const mAjustes = modales.filter((m) => m.registroAjuste);
  if (ajustes.length || mAjustes.length) {
    L.push("## Registro por ajustar", "");
    for (const p of ajustes) L.push(`- \`${p.ruta}\`: ${AJUSTE[p.registroAjuste]}`);
    for (const m of mAjustes) L.push(`- modal \`${m.archivo.replace(RAIZ_WEB, "")}\`: ${AJUSTE[m.registroAjuste]}`);
    L.push("");
  }
  if (sueltos.length) {
    L.push("## Archivos con campos que no llegan a ninguna pantalla", "");
    L.push("(un modal o un componente en construcción: la regla vale igual, confírmalo leyéndolo)", "");
    for (const s of sueltos) L.push(`- ${s.conGuia ? "✅" : "❌"} \`${s.archivo.replace(RAIZ_WEB, "")}\``);
    L.push("");
  }
  if (pantallas.length === 0 && modales.length === 0 && sueltos.length === 0) L.push("Ninguno de tus cambios toca una pantalla ni un modal con campos.", "");
  return L.join("\n");
}

function opciones(argv) {
  const o = { base: "origin/main", todo: false, json: false, estricto: false, ruta: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") o.base = argv[++i];
    else if (argv[i] === "--ruta") o.ruta = argv[++i];
    else if (argv[i] === "--todo") o.todo = true;
    else if (argv[i] === "--json") o.json = true;
    else if (argv[i] === "--estricto") o.estricto = true;
  }
  return o;
}

function main() {
  const o = opciones(process.argv.slice(2));
  const raiz = git(dirname(fileURLToPath(import.meta.url)), ["rev-parse", "--show-toplevel"]).trim();
  if (!raiz) return void console.error("No estoy dentro de un repositorio git.");
  const archivos = leerWeb(raiz);
  const cambiados = archivosCambiados(raiz, o.base);
  const registro = existsSync(join(raiz, REGISTRO)) ? parsearRegistro(readFileSync(join(raiz, REGISTRO), "utf8")) : new Map();
  const alcance = o.todo || o.ruta ? "todas" : "tocadas";
  const resultado = analizar({ archivos, cambiados, registro, alcance, soloRuta: o.ruta });
  console.log(o.json ? JSON.stringify(resultado, null, 2) : informe(resultado, { alcance, base: o.base, nCambiados: cambiados.size }));
  if (o.estricto && (resultado.pantallas.some((p) => p.veredicto === "sin-guia") || resultado.modales.some((m) => m.veredicto === "sin-guia"))) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
