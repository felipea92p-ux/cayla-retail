#!/usr/bin/env node
// La prueba de paridad de la FAMILIA CAYLA entre las dos aplicaciones (docs/familia/README.md).
//
// Dos usos, los dos de solo lectura:
//
//   node scripts/familia/comparar.mjs contrato <ruta-al-contrato-del-otro-repo>
//       Los dos repositorios guardan el MISMO docs/familia/contrato.json. Esto dice si siguen siendo idénticos y, si no, qué campo difiere.
//       Es la comparación que ningún CI de un solo repo puede hacer: se corre a mano (o la corre /familia) cuando se toca la marca.
//
//   node scripts/familia/comparar.mjs tokens <tokens.json> --como retail|dynamic
//       Un `tokens.json` de un artifact «Design System» (el de CAYLA Retail o el de CAYLA Dynamic) contra el contrato: colores claros,
//       el oscuro congelado de esa aplicación, los radios y las dos letras. Sale con código 1 si algo de la capa «marca» no coincide.
//
//   node scripts/familia/comparar.mjs --autoprueba
//       Comprueba que este detector no esté ciego: arma unos tokens que cumplen el contrato, le cambia una cosa a la vez y exige que cada
//       cambio se note.
//
// La lógica vive en funciones puras (`compararContratos`, `compararTokens`) para que se pueda probar sin leer ningún archivo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATO_PROPIO = join(AQUI, "..", "..", "docs", "familia", "contrato.json");

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));

/** Las diferencias entre dos contratos, campo por campo (ignora `actualizado`: la fecha cambia aunque nada más cambie). */
export function compararContratos(a, b, ruta = "") {
  if (a === b) return [];
  const ambosObjetos = a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b);
  if (!ambosObjetos) return [{ ruta: ruta || "(raíz)", a, b }];
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  const salida = [];
  for (const k of [...claves].sort()) {
    if (ruta === "" && k === "actualizado") continue;
    salida.push(...compararContratos(a[k], b[k], ruta ? `${ruta}.${k}` : k));
  }
  return salida;
}

/** El valor de un token de color en un tema, resolviendo alias `{otro}` (los de un artifact «Design System»). */
function valorColor(tokens, nombre, tema, profundidad = 0) {
  if (profundidad > 16) return undefined;
  const t = tokens.find((x) => x.name === nombre);
  if (!t) return undefined;
  const v = typeof t.value === "string" ? t.value : (t.value[tema] ?? Object.values(t.value)[0]);
  const alias = /^\{(.+)\}$/.exec(v ?? "");
  return alias ? valorColor(tokens, alias[1], tema, profundidad + 1) : v?.toLowerCase();
}

/**
 * Un `tokens.json` de artifact contra el contrato. Devuelve una lista de { nivel: "falla" | "aviso" | "ok", texto }.
 * `falla` = la capa «marca» no coincide o el oscuro congelado de esa aplicación cambió: sale con código 1.
 * `aviso` = algo abierto en el contrato (el oscuro hoy distinto entre las dos aplicaciones): se dice, no rompe.
 */
export function compararTokens(contrato, tokens, como) {
  const out = [];
  const falla = (texto) => out.push({ nivel: "falla", texto });
  const ok = (texto) => out.push({ nivel: "ok", texto });
  const aviso = (texto) => out.push({ nivel: "aviso", texto });
  if (!["retail", "dynamic"].includes(como)) throw new Error(`--como debe ser retail o dynamic (llegó «${como}»)`);

  const temas = tokens.color?.themes ?? [];
  const idClaro = temas.find((t) => t.id === "claro")?.id ?? temas[0]?.id;
  const idOscuro = temas.find((t) => t.id === "oscuro")?.id ?? temas[1]?.id;
  if (!idClaro || !idOscuro) return [{ nivel: "falla", texto: "el tokens.json no trae dos temas de color (claro y oscuro)" }];
  if (idClaro !== contrato.marca.tema.claro || idOscuro !== contrato.marca.tema.oscuro) {
    aviso(`los temas se llaman «${idClaro}» y «${idOscuro}»; la familia los llama «${contrato.marca.tema.claro}» y «${contrato.marca.tema.oscuro}»`);
  }
  const colores = tokens.color.tokens;

  // Capa marca · colores claros.
  let malos = 0;
  for (const [nombre, hex] of Object.entries(contrato.marca.colores_claro)) {
    const v = valorColor(colores, nombre, idClaro);
    if (v === undefined) { falla(`claro · falta el token «${nombre}»`); malos++; }
    else if (v !== hex.toLowerCase()) { falla(`claro · ${nombre}: tiene ${v}, la familia dice ${hex}`); malos++; }
  }
  if (malos === 0) ok(`claro · los ${Object.keys(contrato.marca.colores_claro).length} colores coinciden al hex`);

  // Oscuro de esa aplicación: congelado en el contrato. Cambiarlo sin tocar el contrato es un desfase.
  let congelado = 0;
  for (const [nombre, hex] of Object.entries(contrato.oscuro[como])) {
    const v = valorColor(colores, nombre, idOscuro);
    if (v !== hex.toLowerCase()) { falla(`oscuro · ${nombre}: tiene ${v ?? "nada"}, el contrato guarda ${hex} para ${como}`); congelado++; }
  }
  if (congelado === 0) ok(`oscuro · los ${Object.keys(contrato.oscuro[como]).length} colores son los que el contrato congela para ${como}`);

  // Radios y letras.
  const radios = tokens.radius?.tokens ?? [];
  let radiosMalos = 0;
  for (const r of contrato.marca.radios) {
    const nombre = r[como];
    if (!nombre) continue;
    const t = radios.find((x) => x.name === nombre);
    const px = t ? Number.parseFloat(String(t.value)) : undefined;
    if (px !== r.px) { falla(`radio · ${nombre} (${r.funcion}): tiene ${px ?? "nada"} px, la familia dice ${r.px} px`); radiosMalos++; }
  }
  if (radiosMalos === 0) ok("radios · control, superficie, flotante y píldora coinciden");
  const familias = tokens.type?.families ?? {};
  for (const clave of ["sans", "serif"]) {
    const esperado = contrato.marca.tipografia[clave];
    if (!String(familias[clave] ?? "").includes(esperado)) falla(`letra · ${clave} debería llevar «${esperado}»; dice «${familias[clave] ?? "nada"}»`);
    else ok(`letra · ${clave} es ${esperado}`);
  }

  // Lo abierto: el oscuro de la otra aplicación frente al de esta.
  const otra = como === "retail" ? "dynamic" : "retail";
  const distintos = Object.keys(contrato.oscuro[como]).filter((n) => contrato.oscuro[como][n] !== contrato.oscuro[otra][n]);
  if (distintos.length) aviso(`oscuro · ${distintos.length} de ${Object.keys(contrato.oscuro[como]).length} colores difieren de ${otra} (pendiente P1, abierto)`);
  return out;
}

/** Unos tokens de artifact que cumplen el contrato al pie de la letra, para la autoprueba. */
function tokensQueCumplen(contrato, como) {
  const colores = Object.entries(contrato.marca.colores_claro).map(([name, claro]) => ({
    name,
    value: { claro, oscuro: contrato.oscuro[como][name] ?? claro },
  }));
  return {
    color: { themes: [{ id: "claro" }, { id: "oscuro" }], tokens: colores },
    radius: { tokens: contrato.marca.radios.filter((r) => r[como]).map((r) => ({ name: r[como], value: `${r.px}px` })) },
    type: { families: { sans: `"${contrato.marca.tipografia.sans}", system-ui, sans-serif`, serif: `"${contrato.marca.tipografia.serif}", Georgia, serif` } },
  };
}

function autoprueba(contrato) {
  const fallos = [];
  const debeFallar = (nombre, tokens, como = "retail") => {
    const r = compararTokens(contrato, tokens, como);
    if (!r.some((x) => x.nivel === "falla")) fallos.push(`el detector NO notó: ${nombre}`);
  };
  const base = () => structuredClone(tokensQueCumplen(contrato, "retail"));
  const limpio = compararTokens(contrato, base(), "retail");
  if (limpio.some((x) => x.nivel === "falla")) fallos.push(`unos tokens que cumplen el contrato salieron con fallas: ${limpio.filter((x) => x.nivel === "falla").map((x) => x.texto).join("; ")}`);

  let t = base(); t.color.tokens.find((c) => c.name === "rojo").value.claro = "#b8412e"; debeFallar("un rojo claro distinto por un solo dígito", t);
  t = base(); t.color.tokens.splice(t.color.tokens.findIndex((c) => c.name === "taupe"), 1); debeFallar("un color de marca que falta", t);
  t = base(); t.color.tokens.find((c) => c.name === "papel").value.oscuro = "#242423"; debeFallar("un oscuro que cambió sin tocar el contrato", t);
  t = base(); t.radius.tokens[0].value = "10px"; debeFallar("un radio de control distinto", t);
  t = base(); t.type.families.serif = "Georgia, serif"; debeFallar("la serif cambiada", t);
  t = base(); t.color.themes = [{ id: "claro" }]; debeFallar("un tokens.json con un solo tema", t);

  const a = structuredClone(contrato);
  const b = structuredClone(contrato);
  b.marca.colores_claro.rojo = "#000000";
  if (compararContratos(a, b).length === 0) fallos.push("el detector NO notó dos contratos con un color de marca distinto");
  b.marca.colores_claro.rojo = a.marca.colores_claro.rojo;
  b.actualizado = "1999-01-01";
  if (compararContratos(a, b).length !== 0) fallos.push("la fecha `actualizado` no debería contar como diferencia");
  return fallos;
}

function main(argv) {
  const [modo, ...resto] = argv;
  const contrato = leerJson(CONTRATO_PROPIO);
  if (modo === "--autoprueba") {
    const fallos = autoprueba(contrato);
    if (fallos.length) { console.error(fallos.map((f) => `✗ ${f}`).join("\n")); return 1; }
    console.log("✓ el detector no está ciego: cada cambio de la capa «marca» se nota");
    return 0;
  }
  if (modo === "contrato" && resto[0]) {
    const diffs = compararContratos(contrato, leerJson(resto[0]));
    if (diffs.length === 0) { console.log("✓ los dos repositorios guardan el mismo contrato"); return 0; }
    console.error(`✗ los contratos difieren en ${diffs.length} campo(s):`);
    for (const d of diffs.slice(0, 30)) console.error(`  · ${d.ruta}\n      este repo: ${JSON.stringify(d.a)}\n      el otro:   ${JSON.stringify(d.b)}`);
    return 1;
  }
  if (modo === "tokens" && resto[0]) {
    const i = resto.indexOf("--como");
    const como = i >= 0 ? resto[i + 1] : undefined;
    const marca = { falla: "✗", aviso: "•", ok: "✓" };
    const r = compararTokens(contrato, leerJson(resto[0]), como);
    for (const x of r) console.log(`${marca[x.nivel]} ${x.texto}`);
    return r.some((x) => x.nivel === "falla") ? 1 : 0;
  }
  console.error("Uso:\n  node scripts/familia/comparar.mjs contrato <contrato-del-otro-repo.json>\n  node scripts/familia/comparar.mjs tokens <tokens.json> --como retail|dynamic\n  node scripts/familia/comparar.mjs --autoprueba");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
