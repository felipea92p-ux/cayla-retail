#!/usr/bin/env node
/**
 * Ensambla la guía interactiva de un caso en UN solo archivo HTML — el instrumento de `/flujo-de-negocio guia`, no el razonamiento.
 *
 * EL PROBLEMA QUE RESUELVE. La guía se comparte con quien NO tiene Claude Code ni el ERP: tiene que abrirse con doble clic, sin
 * internet, sin instalar nada y sin depender de un servidor que pueda caerse. Por eso todo va DENTRO del archivo: el CSS real del ERP,
 * las fuentes (EB Garamond y DM Sans, en base64), la captura del HTML real de cada estado de pantalla, el motor, las reglas de ese flujo
 * y los textos de la guía. No pide nada por la red.
 *
 * QUÉ PROMETE.
 *   · Lee lo que dejó `receptor.mjs` en `.flujo-de-negocio/capturas/<caso>/` y el guion `docs/flujos/<flujo>/<caso>.guion.json`.
 *   · Escribe `.flujo-de-negocio/guias/<caso>.html` (fuera de git: el repo es público). No toca nada más.
 *   · Se niega a generar si falta una captura que las reglas del flujo necesitan, o si el guion no trae todas sus claves.
 * QUÉ NO PROMETE. Que las capturas estén al día: son la foto de `main` de la última actualización. El archivo dice, en su pie, contra qué
 * SHA se capturó.
 *
 * DÓNDE VIVEN LAS CAPTURAS. Las que acaba de tomar el receptor están en `.flujo-de-negocio/capturas/<caso>/` (fuera de git). Las que
 * permiten REGENERAR LA GUÍA DESDE CERO sin levantar el ERP viven en el repo: `docs/flujos/<flujo>/capturas/<caso>/` (solo lo que la guía
 * usa, ~2,3 MB; son HTML y CSS del ERP con datos inventados y los datos públicos del emisor que ya salen en cada boleta). Se leen de
 * la carpeta local si existe y, si no, de la del repo. Cada recaptura suma ~2 MB al historial: rehacerla solo cuando cambie una pantalla.
 * Los respaldos de la base de datos NO van al repo (son datos de la base local y el repo es público).
 *
 * USO   node scripts/flujo-de-negocio/guia/generar-guia.mjs <flujo>/<caso> [--guardar-capturas] [--entregar]
 *         --guardar-capturas  copia al repo (docs/flujos/<flujo>/capturas/<caso>/) solo las capturas que la guía usa
 *         --entregar          deja el HTML y un LEEME.txt en ~/Documents/CAYLA-flujos/<caso>/ (o en $CAYLA_FLUJOS_DIR/<caso>/): la carpeta
 *                             que se le envía a quien va a practicar. Fuera del repo, a propósito.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const [flujo, caso] = (process.argv[2] ?? "").split("/");
if (!flujo || !caso || !/^[a-z0-9-]+$/.test(flujo) || !/^[a-z0-9-]+$/.test(caso)) {
  console.error("Uso: generar-guia.mjs <flujo>/<caso>   (ej. venta/boleta-sin-dni-yape)");
  process.exit(2);
}

const FLAGS = process.argv.slice(3);
const CAPTURAS_LOCAL = join(RAIZ, ".flujo-de-negocio/capturas", caso);
const CAPTURAS_REPO = join(RAIZ, "docs/flujos", flujo, "capturas", caso);
const CAPTURAS = existsSync(join(CAPTURAS_LOCAL, "estilos.css")) ? CAPTURAS_LOCAL : CAPTURAS_REPO;
const GUION = join(RAIZ, "docs/flujos", flujo, `${caso}.guion.json`);
const AQUI = join(RAIZ, "scripts/flujo-de-negocio/guia");
const SALIDA_DIR = join(RAIZ, ".flujo-de-negocio/guias");
const leer = (p) => readFileSync(p, "utf8");
const falla = (m) => { console.error(`✗ ${m}`); process.exit(1); };

if (!existsSync(join(CAPTURAS, "estilos.css"))) falla(`No hay capturas ni en ${CAPTURAS_LOCAL} ni en ${CAPTURAS_REPO}. Córrelas con receptor.mjs y el ERP local (CAPTURAR.md).`);
console.log(`Capturas: ${CAPTURAS === CAPTURAS_LOCAL ? "locales (.flujo-de-negocio/capturas)" : "las del repo (docs/flujos/…/capturas)"}`);
if (!existsSync(GUION)) falla(`Falta el guion: ${GUION}`);
const guion = JSON.parse(leer(GUION));
const replicaArchivo = join(RAIZ, "docs/flujos", flujo, guion.replica);
if (!existsSync(replicaArchivo)) falla(`El guion pide la réplica «${guion.replica}» y no existe en docs/flujos/${flujo}/.`);

// ── Lo que el guion debe traer (las claves que usan el motor y la réplica) ──────────────────────────────────────────────────────────
const CLAVES = {
  etapas: ["vender", "talla", "responsable", "cobrar", "pago", "confirmar", "cerrar"],
  desvios: ["prenda_equivocada", "cantidad_equivocada", "pago_equivocado", "comprobante_equivocado", "dni_escrito", "sede", "apartar", "descuento", "clienta", "espera", "talla_almacen", "no_disponible"],
  fallos: ["prenda", "cantidad", "pago", "comprobante", "dni", "responsable"],
};
const faltan = [];
for (const [grupo, claves] of Object.entries(CLAVES)) for (const k of claves) if (!guion[grupo]?.[k]) faltan.push(`${grupo}.${k}`);
for (const k of ["caso", "intro", "barra", "comentarios", "fin", "angosta"]) if (!guion[k]) faltan.push(k);
if (faltan.length) falla(`El guion no trae: ${faltan.join(", ")}`);

// ── Las capturas que las reglas del flujo necesitan ───────────────────────────────────────────────────────────────────────────────────
const metodos = ["efectivo", "tarjeta", "yape", "plin", "transferencia"], comps = ["boleta", "factura", "nota"];
const necesarias = ["inicio_ventas", "vender_vacio", "vender_blusa", "vender_blusa_2", "vender_casaca", "vender_post", "cobro_base", "registrada", "ayuda_dni",
  ...metodos.flatMap((m) => comps.map((c) => `cobro_${m}_${c}`))];
const estados = {};
for (const n of necesarias) {
  const f = join(CAPTURAS, `estado-${n}.json`);
  if (!existsSync(f)) falla(`Falta la captura «${n}» (${f}).`);
  estados[n] = { html: JSON.parse(leer(f)).html };
}

// ── CSS real del ERP, con SOLO las fuentes que hacen falta (latin), incrustadas ────────────────────────────────────────────────────────
const css = leer(join(CAPTURAS, "estilos.css"));
const fuentes = JSON.parse(leer(join(CAPTURAS, "fuentes.json")));
const doc = JSON.parse(leer(join(CAPTURAS, "documento.json")));
let idx = -1;
const aDatos = (archivo) => {
  const bytes = readFileSync(join(CAPTURAS, archivo));
  // Una «fuente» que no empieza con la firma wOF2 es casi seguro una página de error guardada por equivocación (pasó el 2026-09-30).
  if (bytes.subarray(0, 4).toString("latin1") !== "wOF2") falla(`${archivo} no es una fuente woff2 (empieza con «${bytes.subarray(0, 12).toString("latin1")}»). Recaptúrala: ver CAPTURAR.md.`);
  return `data:font/woff2;base64,${bytes.toString("base64")}`;
};
const bloquesUsados = [];
const fuentesUsadas = [];
const cssFinal = css.replace(/@font-face\s*{[^}]*}/g, (bloque) => {
  idx++;
  if (!/url\(/.test(bloque)) return bloque; // tipografías de respaldo (sin archivo): se quedan
  const f = fuentes.find((x) => x.i === idx);
  const esLatin = f && /^U\+(00)?\?\?(,|$)|U\+0000-00FF/i.test((f.rango || "").trim()) && /EB Garamond|DM Sans/.test(f.familia || "");
  if (!esLatin) return "";
  fuentesUsadas.push(f);
  bloquesUsados.push(bloque.replace(/url\([^)]+\)/, `url(${aDatos(f.archivo)})`));
  return bloque.replace(/url\([^)]+\)/, `url(${aDatos(f.archivo)})`);
});
const restantes = (cssFinal.match(/url\((?!["']?data:)[^)]*\)/g) || []).filter((u) => !/^url\(["']?#/.test(u));
if (restantes.length) console.warn(`⚠ ${restantes.length} url() del CSS apuntan a archivos externos (p. ej. ${restantes[0]}): en el navegador de quien lo reciba no cargarán.`);

// ── Ensamblado ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const enScript = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029"); // JSON dentro de <script>: sin «<» ni separadores de línea sueltos
const fotoPath = join(RAIZ, ".flujo-de-negocio/actualizacion.json");
const foto = existsSync(fotoPath) ? JSON.parse(leer(fotoPath)) : null;
guion.caso.capturadoContra = foto ? foto.base_sha.slice(0, 8) : "sin foto registrada";
guion.caso.generado = new Date().toISOString().slice(0, 10);

const plantilla = leer(join(AQUI, "plantilla.html"));
const pieza = {
  "%%TITULO%%": guion.caso.titulo,
  "%%FUENTES_CSS%%": bloquesUsados.join("\n"),
  "%%MOTOR_CSS%%": leer(join(AQUI, "motor.css")),
  "%%DATOS%%": enScript({ css: cssFinal, htmlClase: doc.htmlClase, bodyClase: doc.bodyClase, estados }),
  "%%GUION%%": enScript(guion),
  "%%REPLICA%%": leer(replicaArchivo),
  "%%MOTOR_JS%%": leer(join(AQUI, "motor.js")),
};
let html = plantilla;
for (const [marca, valor] of Object.entries(pieza)) {
  if (!html.includes(marca)) falla(`La plantilla no tiene la marca ${marca}.`);
  html = html.split(marca).join(valor); // split/join: el contenido puede traer $&, $1… y no se reinterpreta
}
mkdirSync(SALIDA_DIR, { recursive: true });
const salida = join(SALIDA_DIR, `${caso}.html`);
writeFileSync(salida, html);
console.log(`✓ ${salida}`);
console.log(`  ${(statSync(salida).size / 1024 / 1024).toFixed(2)} MB · ${Object.keys(estados).length} estados de pantalla · fuentes: ${bloquesUsados.length} · capturado contra main ${guion.caso.capturadoContra}`);

// ── Guardar las capturas en el repo (solo lo que la guía usa) ─────────────────────────────────────────────────────────────────────────
if (FLAGS.includes("--guardar-capturas")) {
  if (CAPTURAS !== CAPTURAS_LOCAL) falla("Las capturas ya vienen del repo: no hay nada nuevo que guardar.");
  mkdirSync(CAPTURAS_REPO, { recursive: true });
  for (const n of necesarias) copyFileSync(join(CAPTURAS, `estado-${n}.json`), join(CAPTURAS_REPO, `estado-${n}.json`));
  for (const a of ["estilos.css", "documento.json"]) copyFileSync(join(CAPTURAS, a), join(CAPTURAS_REPO, a));
  for (const f of fuentesUsadas) copyFileSync(join(CAPTURAS, f.archivo), join(CAPTURAS_REPO, f.archivo));
  writeFileSync(join(CAPTURAS_REPO, "fuentes.json"), JSON.stringify(fuentesUsadas, null, 2));
  writeFileSync(join(CAPTURAS_REPO, "README.md"),
    `# Capturas del ERP para la guía «${guion.caso.titulo}»\n\n` +
    `HTML y CSS **reales** de cada estado de pantalla del ERP, capturados el ${guion.caso.generado} contra \`main\` ${guion.caso.capturadoContra}, con datos inventados ` +
    `(más los datos públicos del emisor que ya salen impresos en cada boleta). Con ellas \`node scripts/flujo-de-negocio/guia/generar-guia.mjs ${flujo}/${caso}\` ` +
    `regenera el HTML **sin levantar el ERP**.\n\n` +
    `- Solo están las que la guía usa (${necesarias.length} estados, el CSS, las 2 tipografías y los atributos del documento).\n` +
    `- Se vuelven viejas cuando cambia una pantalla de \`main\`: recapturar con \`scripts/flujo-de-negocio/guia/CAPTURAR.md\` y volver a correr con \`--guardar-capturas\`. ` +
    `Cada recaptura suma ~2 MB al historial del repo: no se rehace sin un cambio de pantalla que lo justifique.\n` +
    `- Los respaldos de la base de datos **no** van al repo (son datos de la base local).\n`);
  console.log(`✓ capturas guardadas en ${CAPTURAS_REPO} (${necesarias.length} estados + CSS + ${fuentesUsadas.length} fuentes)`);
}

// ── Carpeta para enviar: el HTML y un LEEME para quien lo va a usar ───────────────────────────────────────────────────────────────────
if (FLAGS.includes("--entregar")) {
  const base = process.env.CAYLA_FLUJOS_DIR || join(homedir(), "Documents", "CAYLA-flujos");
  const dest = join(base, caso);
  mkdirSync(dest, { recursive: true });
  copyFileSync(salida, join(dest, `${caso}.html`));
  writeFileSync(join(dest, "LEEME.txt"),
`PRÁCTICA CAYLA: ${guion.caso.titulo}
============================================================

QUÉ ES
Una práctica para aprender a hacer una venta en el sistema de CAYLA, en una copia con datos
inventados. Nada de lo que toques es real: no se cobra a nadie, no baja ninguna prenda del stock
y no sale ninguna boleta de verdad. Puedes tocar sin miedo.

CÓMO ABRIRLA
1. Guarda el archivo «${caso}.html» en tu computadora.
2. Haz doble clic. Se abre en tu navegador (Chrome, Edge o Safari).
3. Funciona en computadora o tablet. En el celular te dirá que la abras en una pantalla más
   grande. No necesita internet.

CÓMO FUNCIONA
- Primero lee el mensaje de inicio y pulsa «Empezar».
- Intenta hacer la venta TÚ SOLA/O, sin ayuda.
- Si te trabas, pulsa «No sé qué más hacer»: una guía te acompaña paso a paso.
- Cuando quieras, pulsa «Comentar» y escribe lo que sea: una palabra que no entendiste, un
  botón que no encontraste, algo que te pareció raro.

TUS COMENTARIOS
Se guardan solo en TU navegador, en tu computadora. No se envían solos a ningún lado.
Al terminar, pulsa «Copiar mis comentarios», pega el texto en un mensaje (WhatsApp, correo) y
mándaselo a quien te pasó esta práctica.

SI ALGO NO FUNCIONA
- Prueba abrirla con Chrome.
- Si dice «Ábrelo en una pantalla más grande», ábrela en una computadora o tablet.
- Si «Copiar mis comentarios» no copia, selecciona el texto de la caja y cópialo a mano.

VERSIÓN
Capturada del sistema el ${guion.caso.generado} (versión ${guion.caso.capturadoContra}). Si el sistema cambió desde entonces, algunas
pantallas pueden verse un poco distintas.
`);
  console.log(`✓ carpeta para enviar: ${dest}  (${caso}.html + LEEME.txt)`);
}
