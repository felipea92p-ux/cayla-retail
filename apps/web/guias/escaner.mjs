// El escáner de las guías interactivas (ADR-0389): la ÚNICA definición de «qué controles tiene una pantalla» y de «qué
// anclas existen en el código». Lo usan la prueba (`lib/guias.test.ts`), el comando que acepta una huella
// (`guias/huella.mjs`) y la skill `/guia`. Lee el código como texto, sin compilar: rápido y sin dependencias.
//
// LA HUELLA DE UNA PANTALLA (el candado «por controles» que eligió Felipe, 2026-10-07): la lista de botones, campos, enlaces,
// pestañas y combos que dibujan los archivos de la pantalla. Se guarda en `lib/guias/huellas/<guia>.json`. Si alguien suma,
// quita o renombra un control, la huella ya no coincide y la prueba falla hasta que alguien mire la guía, la ponga al día y
// acepte la huella nueva (`pnpm --filter web guias:huella <guia>`). Así una función nueva no queda sin explicar por olvido.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ_WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ_APP = join(RAIZ_WEB, "app", "(app)");

/**
 * Piezas del SISTEMA, no de una pantalla: sus controles internos (la lista de un combo, la flecha de «Volver») no son
 * funciones que una guía tenga que explicar, y si contaran, tocar un combo rompería la huella de las 90 pantallas.
 */
const PIEZAS_DEL_SISTEMA = [
  /^components\/ui\//,
  /^components\/guias\//,
  /^components\/guia-de-foco\//,
  /^components\/finanzas\/kit\.tsx$/,
  /^components\/ComboResponsable\.tsx$/,
  /^components\/alta-producto\/guia\.tsx$/,
  /^components\/ficha-producto\/TiraFicha\.tsx$/,
  /^components\/Ayuda\.tsx$/,
];
const esPiezaDelSistema = (rel) => PIEZAS_DEL_SISTEMA.some((re) => re.test(rel));

const norm = (p) => p.replace(/\\/g, "/");
const rel = (abs) => norm(relative(RAIZ_WEB, abs));

/** `@/x` o `./x` → archivo .tsx/.ts que existe, o null. */
function resolver(desde, spec) {
  let base = null;
  if (spec.startsWith("@/")) base = join(RAIZ_WEB, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(desde), spec);
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext;
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

/** La carpeta de una ruta del registro («/vender/comprobantes», «/» = Inicio). */
export function carpetaDeRuta(ruta) {
  return ruta === "/" ? RAIZ_APP : join(RAIZ_APP, ...ruta.split("/").filter(Boolean));
}

/**
 * Los archivos de una pantalla: su `page.tsx`, los `layout.tsx` de su camino (menos el del ERP entero, que es el lateral) y,
 * siguiendo sus `import`, los componentes de `components/` que dibuja (menos las piezas del sistema). Ordenados.
 */
export function archivosDePantalla(ruta) {
  const carpeta = carpetaDeRuta(ruta);
  const inicio = [join(carpeta, "page.tsx")];
  for (let d = carpeta; d.startsWith(RAIZ_APP) && d !== RAIZ_APP; d = dirname(d)) {
    const layout = join(d, "layout.tsx");
    if (existsSync(layout)) inicio.push(layout);
  }
  const vistos = new Set();
  const cola = [...inicio];
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f) || !existsSync(f)) continue;
    vistos.add(f);
    const texto = readFileSync(f, "utf8");
    for (const spec of importsQueSeDibujan(texto)) {
      const r = resolver(f, spec);
      if (!r || !r.endsWith(".tsx")) continue;
      const rr = rel(r);
      if (!rr.startsWith("components/") && !rr.startsWith("app/(app)/")) continue;
      if (esPiezaDelSistema(rr)) continue;
      cola.push(r);
    }
  }
  return [...vistos].map(rel).sort();
}

/**
 * De dónde vienen los componentes que este archivo DIBUJA. Un `import { money } from "@/components/PuntoDeVenta"` trae una
 * función, no la pantalla de venta: seguirlo metería los 160 controles del punto de venta en la huella de Apartados. Solo
 * cuenta un import si alguno de sus nombres se usa como etiqueta (`<Nombre`), o si es un `import()` dinámico (un modal perezoso).
 */
function importsQueSeDibujan(texto) {
  const salida = [];
  for (const m of texto.matchAll(/import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const nombres = [];
    const clausula = m[1];
    const porDefecto = clausula.match(/^([A-Z]\w*)/);
    if (porDefecto) nombres.push(porDefecto[1]);
    const llaves = clausula.match(/\{([\s\S]*)\}/);
    if (llaves) {
      for (const parte of llaves[1].split(",")) {
        const limpio = parte.trim().replace(/^type\s+/, "");
        if (!limpio || parte.trim().startsWith("type ")) continue;
        const local = limpio.split(/\s+as\s+/).pop().trim();
        if (/^[A-Z]/.test(local)) nombres.push(local);
      }
    }
    if (nombres.some((n) => new RegExp(`<${n}[\\s>/.]`).test(texto))) salida.push(m[2]);
  }
  for (const m of texto.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) salida.push(m[1]);
  return salida;
}

/** Las etiquetas de JSX que cuentan como un control que la persona toca o llena. */
const CONTROLES = [
  "button", "a", "Link", "input", "textarea", "select",
  "Boton", "BotonEnlace", "BotonAncla", "BotonCompacto", "BotonFiltro", "BotonFiltros",
  // Las piezas de una sola función de `/unificar` (rondas 10 y 11, ADR-0358): un control que se migra a ellas sigue en la huella.
  "BotonDescargar", "BotonVer", "BotonImprimir", "BotonLimpiar", "FiltroPuesto",
  "CampoTexto", "CampoSelect", "CampoMonto", "CampoFecha", "Desplegable", "DesplegablePildora", "ComboBuscable", "ComboResponsable",
  "Casilla", "Pestanas", "SegmentoDeslizante", "SegmentoEnlaces", "Pastilla", "Volver",
];
const RE_CONTROL = new RegExp(`<(${CONTROLES.join("|")})(?=[\\s>/])`, "g");

/** El trozo de la etiqueta de apertura (hasta su `>` de cierre, respetando llaves y comillas). */
function aperturaDesde(texto, i) {
  let llaves = 0;
  let comilla = null;
  for (let j = i + 1; j < texto.length && j < i + 4000; j++) {
    const c = texto[j];
    if (comilla) {
      if (c === comilla && texto[j - 1] !== "\\") comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "{") llaves++;
    else if (c === "}") llaves--;
    else if (c === ">" && llaves === 0) return { abre: texto.slice(i, j + 1), fin: j + 1 };
  }
  return { abre: texto.slice(i, i + 200), fin: i + 200 };
}

const compacto = (s) => s.replace(/\s+/g, " ").trim();

/** Cómo se llama un control, del dato más estable al menos: ancla, aria-label, etiqueta, placeholder, title, su texto. */
function nombreDe(abre, despues) {
  for (const attr of ["data-guia", "aria-label", "etiqueta", "placeholder", "title", "titulo"]) {
    const lit = abre.match(new RegExp(`\\s${attr}="([^"]+)"`));
    if (lit) return compacto(lit[1]);
    const expr = abre.match(new RegExp(`\\s${attr}=\\{([^}]{1,80})\\}`));
    if (expr) return `{${compacto(expr[1])}}`;
  }
  // Texto literal de adentro (lo primero que no es una etiqueta ni una expresión).
  const texto = despues.match(/^\s*(?:<[^>]*>\s*)*([^<{}]{2,60})/);
  if (texto && compacto(texto[1])) return compacto(texto[1]);
  const exprTexto = despues.match(/^\s*(?:<[^>]*>\s*)*\{([^}]{1,60})\}/);
  if (exprTexto) return `{${compacto(exprTexto[1])}}`;
  const onClick = abre.match(/\sonClick=\{([^}]{1,60})\}/);
  if (onClick) return `→${compacto(onClick[1])}`;
  return "(sin nombre)";
}

// El código sin comentarios: los de bloque y los de línea que empiezan tras un espacio o al inicio (no corta un «https://»).
export function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[ \t])\/\/[^\n]*/gm, "$1");
}

/** Los controles de UN archivo, como líneas estables («button «Cobrar»»). Repetidos llevan #2, #3… */
export function controlesDeArchivo(codigo) {
  const texto = sinComentarios(codigo);
  const lista = [];
  for (const m of texto.matchAll(RE_CONTROL)) {
    const { abre, fin } = aperturaDesde(texto, m.index);
    // Un tipo («<Boton>» dentro de un genérico TS «Array<Boton>») no es JSX: tiene que verse como etiqueta.
    if (/^<\w+>$/.test(abre) && !/^<(button|a|select|textarea)>$/.test(abre)) continue;
    lista.push(`${m[1]} «${nombreDe(abre, texto.slice(fin, fin + 300))}»`);
  }
  const vistos = new Map();
  return lista.map((c) => {
    const n = (vistos.get(c) ?? 0) + 1;
    vistos.set(c, n);
    return n === 1 ? c : `${c} #${n}`;
  });
}

/** La huella de una pantalla: archivo → controles. */
export function huellaDePantalla(ruta) {
  const huella = {};
  for (const archivo of archivosDePantalla(ruta)) {
    const controles = controlesDeArchivo(readFileSync(join(RAIZ_WEB, archivo), "utf8"));
    if (controles.length) huella[archivo] = controles;
  }
  return huella;
}

/** Diferencia entre la huella guardada y la de hoy: lo que nació y lo que ya no está, con su archivo. */
export function diferenciaDeHuella(guardada, hoy) {
  const plano = (h) => new Set(Object.entries(h).flatMap(([a, cs]) => cs.map((c) => `${a} · ${c}`)));
  const antes = plano(guardada);
  const ahora = plano(hoy);
  return { nuevos: [...ahora].filter((x) => !antes.has(x)), quitados: [...antes].filter((x) => !ahora.has(x)) };
}

/** Todos los archivos .ts/.tsx de la web donde puede vivir un ancla (`components/`, `app/`). */
function archivosFuente() {
  const salida = [];
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) salida.push(p);
    }
  };
  recorrer(join(RAIZ_WEB, "components"));
  recorrer(join(RAIZ_WEB, "app"));
  return salida;
}

/**
 * Las anclas que el código declara: `data-guia="x"`, la prop `guia="x"` de una pieza (Pestanas) y `guia: "x"` en un objeto.
 * Una con plantilla (`guia: \`apartados.pestana-${p.id}\``) vuelve como patrón: `apartados.pestana-*`.
 */
export function anclasDelCodigo() {
  const literales = new Map(); // ancla → archivo
  const patrones = []; // { re, fuente, archivo }
  for (const f of archivosFuente()) {
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(/(?:data-guia|\bguia)\s*[=:]\s*\{?\s*"([a-z0-9][a-z0-9._-]*)"/g)) literales.set(m[1], rel(f));
    // Dentro de una expresión (`data-guia={modoCamara ? "vender.buscar-por-nombre" : "vender.camara"}`, o la prop `guia={…}` de una
    // pieza): cada texto con punto.
    for (const m of texto.matchAll(/(?:data-guia|\bguia)=\{([^}]{1,200})\}/g)) {
      for (const s of m[1].matchAll(/"([a-z0-9][a-z0-9-]*\.[a-z0-9._-]+)"/g)) literales.set(s[1], rel(f));
    }
    for (const m of texto.matchAll(/(?:data-guia|\bguia)\s*[=:]\s*\{?\s*`([a-z0-9][a-z0-9._-]*)\$\{[^}]+\}([a-z0-9._-]*)`/g)) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patrones.push({ re: new RegExp(`^${esc(m[1])}[a-z0-9_-]+${esc(m[2])}$`), fuente: `${m[1]}*${m[2]}`, archivo: rel(f) });
    }
  }
  return { literales, patrones };
}

/** ¿Existe esta ancla en el código? */
export function anclaExiste(ancla, { literales, patrones }) {
  return literales.has(ancla) || patrones.some((p) => p.re.test(ancla));
}

/** Las guías (`id` y `ruta`) declaradas en `lib/guias/pantallas/*.ts`, leídas como texto. */
export function guiasDeLosArchivos() {
  const dir = join(RAIZ_WEB, "lib", "guias", "pantallas");
  const guias = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts")).sort()) {
    const texto = readFileSync(join(dir, f), "utf8");
    for (const m of texto.matchAll(/\bid:\s*"([a-z0-9._-]+)",\s*\n\s*ruta:\s*"([^"]+)"/g)) guias.push({ id: m[1], ruta: m[2], archivo: `lib/guias/pantallas/${f}` });
  }
  return guias;
}
