#!/usr/bin/env node
/**
 * Escáner de SUGERENCIAS (skill `/sugerir`, `.claude/skills/sugerir/SKILL.md`): ¿qué textos de ejemplo le muestra la web a quien
 * llena un campo, y cuáles están escritos a mano en el JSX —es decir, dicen lo mismo elija lo que elija la persona antes?—
 *
 * QUÉ PROMETE. Lista, por archivo, las «superficies de sugerencia»: un `placeholder` con un ejemplo («Blusa Aurora»), un texto
 * de ayuda con «Ej. …», una lista sugerida (`<datalist>`, prop `sugerencias`). Cada una sale marcada como ESTÁTICA (literal en
 * el JSX: candidata a adaptarse al contexto) o DERIVADA (la calcula una expresión: probablemente ya reacciona). Y junto a cada
 * archivo, los estados de selección que trae (`categoriaId`, `familia`, `medio`…): son las posibles CAUSAS de lo que la
 * sugerencia debería decir.
 *
 * QUÉ ASUME. Es por texto (heurística), igual que `pnpm focus`: sirve para NO olvidarse de una superficie, no para juzgar. Un
 * placeholder que es una instrucción («Buscar…») o un número («0.00») no es un ejemplo y se cuenta aparte. Que un archivo no
 * traiga selectores no prueba que su ejemplo sea independiente: la causa puede llegar por props; se confirma leyendo.
 *
 * USO   node scripts/sugerir/escanear.mjs [--base origin/main] [--todo] [--ruta /productos/nuevo] [--archivo ruta] [--json] [--estricto]
 *   (sin banderas)  los archivos de UI tocados por tus cambios
 *   --todo          todos (el tablero: solo se informa)
 *   --ruta R        los archivos que alcanza esa pantalla
 *   --archivo A     solo ese archivo
 *   --estricto      sale con código 1 si alguna superficie ESTÁTICA del alcance es un ejemplo
 */
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { alcanzables, archivosCambiados, construirGrafo, esArchivoDeUi, leerWeb, rutaDePagina, UMBRAL_COMPARTIDO } from "../focus/escanear.mjs";

/** Estados que suelen decidir qué ejemplo tiene sentido mostrar: lo que la persona elige antes de llegar al campo. */
const SELECTORES = /\b(categoria\w*|familia\w*|subcategoria\w*|marca\w*|proveedor\w*|sede\w*|ubicacion\w*|tipo\w*|medio\w*|canal\w*|motivo\w*|modo|rol\w*|temporada\w*|comprobante\w*|documento\w*|moneda|genero|linea|coleccion\w*)\b/;
/** `const [categoriaId, setCategoriaId] = useState(…)`: el nombre del estado, no el de la función que lo cambia. */
const ESTADO = /const\s*\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=\s*useState/g;

/** Sensible a mayúsculas a propósito: `ejemplo && (` es una variable, «Ej. 44» y «Por ejemplo …» son texto para la persona. */
const EJEMPLO_EN_TEXTO = /(?:\bEj\.|\bEjemplos?:|\b[Pp]or ejemplo\b|\bp\. ?ej\.)\s*[^"'`<>{}\n]{1,80}/;
const LISTA = /<datalist\b|\bsugerencias?\s*=/;
/** Empieza como una orden o una etiqueta genérica: es una instrucción, no un ejemplo de contenido. */
const INSTRUCCION = /^\s*(¿?por qu[eé]|buscar?|escribe|escribir|escanea|apunta|describe|detalle|elige|elegir|selecciona|seleccionar|toca|filtrar?|agrega|añade|ingresa|pega|todos?|todas?|ninguno|ninguna|sin\b|cualquier|opcional|obligatorio|nombre$|descripci[oó]n$|fecha$|cantidad$|monto$)/i;
const NUMERICO = /^[\s\d.,:/+\-–—%$S]*$/;
/** Un ejemplo que de verdad no depende de nada elegido antes lo dice en el lugar: `sugerir-fijo: <por qué>` en su línea o en la de arriba. */
const FIJO = /sugerir-fijo:\s*(\S[^*}\n]{9,})/;

const esComentario = (linea) => /^\s*(\/\/|\/\*|\*)/.test(linea);

/** Lee lo que sigue a `placeholder=`: un literal («…» / '…' / {"…"} / {`…`} sin `${}`) es estático; toda otra expresión, derivada. */
function leerValor(texto, desde) {
  const c = texto[desde];
  if (c === '"' || c === "'") {
    const fin = texto.indexOf(c, desde + 1);
    return fin < 0 ? null : { texto: texto.slice(desde + 1, fin), estatica: true };
  }
  if (c !== "{") return null;
  let prof = 0;
  let fin = -1;
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === "{") prof++;
    else if (texto[i] === "}" && --prof === 0) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const dentro = texto.slice(desde + 1, fin).trim();
  const literal = /^(["'])(.*)\1$/s.exec(dentro) ?? /^`([^`$]*)`$/s.exec(dentro);
  if (literal) return { texto: literal[literal.length - 1], estatica: true };
  return { texto: null, estatica: false, expresion: dentro.replace(/\s+/g, " ").slice(0, 60) };
}

const lineaDe = (texto, indice) => texto.slice(0, indice).split("\n").length;

/** «ejemplo» = contenido que la persona podría copiar; «instruccion» y «numerico» no dependen de lo elegido. */
export function clasificar(texto) {
  const t = texto.trim();
  if (t === "" || NUMERICO.test(t)) return "numerico";
  return INSTRUCCION.test(t) ? "instruccion" : "ejemplo";
}

/** Las superficies de sugerencia de UN archivo: `{ linea, tipo, texto, estatica, clase }`, en orden de aparición. */
export function superficies(texto) {
  const out = [];
  const lineas = texto.split("\n");
  for (const m of texto.matchAll(/\bplaceholder\s*=\s*/g)) {
    const v = leerValor(texto, m.index + m[0].length);
    if (!v) continue;
    out.push({ linea: lineaDe(texto, m.index), tipo: "placeholder", texto: v.texto ?? v.expresion, estatica: v.estatica, clase: v.estatica ? clasificar(v.texto) : "derivada" });
  }
  const conPlaceholder = new Set(out.map((s) => s.linea));
  lineas.forEach((l, i) => {
    if (esComentario(l) || conPlaceholder.has(i + 1)) return;
    const ej = EJEMPLO_EN_TEXTO.exec(l);
    if (ej) out.push({ linea: i + 1, tipo: "ejemplo-en-texto", texto: ej[0].trim(), estatica: !/\$\{/.test(l.slice(ej.index)), clase: "ejemplo" });
    else if (LISTA.test(l)) out.push({ linea: i + 1, tipo: "lista", texto: l.trim().slice(0, 70), estatica: !/\bsugerencias?\s*=\s*\{(?!\s*(true|false)\b)/.test(l), clase: "lista" });
  });
  for (const s of out) {
    const marca = FIJO.exec(lineas[s.linea - 1]) ?? FIJO.exec(lineas[s.linea - 2] ?? "");
    if (marca && s.clase === "ejemplo") Object.assign(s, { clase: "fijo", motivo: marca[1].trim() });
  }
  return out.sort((a, b) => a.linea - b.linea);
}

/** Los estados de selección del archivo: las posibles causas de lo que sus ejemplos deberían decir. */
export function causasPosibles(texto) {
  return [...new Set([...texto.matchAll(ESTADO)].map((m) => m[1]).filter((n) => SELECTORES.test(n)))];
}

/**
 * `archivos`: Map ruta → texto de TODA la web. Alcance: «tocadas» (los `cambiados` de UI), «todas», una `soloRuta` (lo que esa
 * pantalla alcanza) o un `soloArchivo`. Devuelve los archivos con alguna superficie, y el conteo de lo que no es ejemplo.
 */
export function analizar({ archivos, cambiados = new Set(), alcance = "tocadas", soloRuta = null, soloArchivo = null, umbral = UMBRAL_COMPARTIDO }) {
  const grafo = construirGrafo(archivos);
  const paginas = [...archivos.keys()].filter((r) => rutaDePagina(r));
  const usos = new Map();
  for (const p of paginas) for (const a of alcanzables(grafo, p, (d) => !esArchivoDeUi(d))) usos.set(a, [...(usos.get(a) ?? []), rutaDePagina(p)]);
  const compartido = (ruta) => (usos.get(ruta)?.length ?? 0) >= umbral;

  let enAlcance;
  if (soloArchivo) enAlcance = [...archivos.keys()].filter((r) => r === soloArchivo || r.endsWith(soloArchivo));
  else if (soloRuta) {
    const pagina = paginas.find((p) => rutaDePagina(p) === soloRuta);
    enAlcance = pagina ? [...alcanzables(grafo, pagina, (d) => !esArchivoDeUi(d))] : [];
  } else if (alcance === "todas") enAlcance = [...archivos.keys()];
  else enAlcance = [...cambiados].filter((r) => archivos.has(r));

  const filas = [];
  let noEjemplos = 0;
  for (const ruta of enAlcance.filter((r) => esArchivoDeUi(r) || r === soloArchivo).sort()) {
    const texto = archivos.get(ruta);
    const todas = superficies(texto);
    noEjemplos += todas.filter((s) => s.clase === "instruccion" || s.clase === "numerico").length;
    const utiles = todas.filter((s) => s.clase !== "instruccion" && s.clase !== "numerico");
    if (utiles.length === 0) continue;
    filas.push({ ruta, superficies: utiles, causas: causasPosibles(texto), pantallas: (usos.get(ruta) ?? []).slice(0, 3), compartido: compartido(ruta) });
  }
  return { filas, noEjemplos, estaticas: filas.reduce((n, f) => n + f.superficies.filter((s) => s.estatica && s.clase === "ejemplo").length, 0) };
}

export function informe(resultado, { alcance, base, nCambiados }) {
  const { filas, noEjemplos, estaticas } = resultado;
  const L = [`# Sugerir — ${alcance === "tocadas" ? `archivos tocados (contra ${base}, ${nCambiados} cambiados)` : alcance}`, ""];
  if (filas.length === 0) L.push("Ninguna superficie de sugerencia en el alcance.", "");
  for (const f of filas) {
    L.push(`## ${f.ruta}${f.compartido ? "  (compartido: lo usan muchas pantallas)" : ""}`);
    if (f.pantallas.length) L.push(`   pantallas: ${f.pantallas.join(", ")}`);
    L.push(`   posibles causas (estados de selección): ${f.causas.length ? f.causas.join(", ") : "ninguna en este archivo (puede llegar por props)"}`);
    for (const s of f.superficies) {
      const marca = s.clase === "fijo" ? "✓ fijo    " : s.clase === "derivada" ? "≈ derivada" : s.clase === "lista" ? "· lista   " : s.estatica ? "✎ ESTÁTICA" : "≈ derivada";
      L.push(`   L${s.linea}  ${marca}  ${s.tipo}: ${s.texto}${s.motivo ? `  — ${s.motivo}` : ""}`);
    }
    L.push("");
  }
  L.push(`Total: ${estaticas} ejemplo(s) estático(s) por revisar en ${filas.length} archivo(s) · ${noEjemplos} placeholder(s) que son instrucción o número (no cuentan).`, "");
  return L.join("\n");
}

function opciones(argv) {
  const o = { base: "origin/main", todo: false, json: false, estricto: false, ruta: null, archivo: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") o.base = argv[++i];
    else if (argv[i] === "--ruta") o.ruta = argv[++i];
    else if (argv[i] === "--archivo") o.archivo = argv[++i];
    else if (argv[i] === "--todo") o.todo = true;
    else if (argv[i] === "--json") o.json = true;
    else if (argv[i] === "--estricto") o.estricto = true;
  }
  return o;
}

function main() {
  const o = opciones(process.argv.slice(2));
  let raiz = "";
  try {
    raiz = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(fileURLToPath(import.meta.url)), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return void console.error("No estoy dentro de un repositorio git.");
  }
  const archivos = leerWeb(raiz);
  const cambiados = archivosCambiados(raiz, o.base);
  const alcance = o.todo ? "todas" : o.ruta ? `pantalla ${o.ruta}` : o.archivo ? `archivo ${o.archivo}` : "tocadas";
  const resultado = analizar({ archivos, cambiados, alcance: o.todo ? "todas" : "tocadas", soloRuta: o.ruta, soloArchivo: o.archivo });
  console.log(o.json ? JSON.stringify(resultado, null, 2) : informe(resultado, { alcance, base: o.base, nCambiados: cambiados.size }));
  if (o.estricto && resultado.estaticas > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
