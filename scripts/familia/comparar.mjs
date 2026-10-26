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
//       Un `tokens.json` de un artifact «Design System» (el de CAYLA Retail o el de CAYLA Dynamic) contra el contrato: los colores de los
//       dos temas, los radios y las dos letras. Sale con código 1 si algo de la capa «marca» no coincide, salvo lo que el contrato declara en
//       `aplicacion_pendiente` para esa aplicación: un tema entero (`tema: "oscuro"`) o unos tokens (`tokens: ["borde-control"]`); se dice como
//       aviso: está decidido y falta aplicarlo.
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

  // Lo decidido y todavía sin aplicar en ESTA aplicación se AVISA, no falla (y no se calla): o un tema entero (`tema: "oscuro"`, P1) o unos tokens
  // sueltos (`tokens: [...]`, P2: borde-control). Así un cambio de marca puede avanzar en un repositorio sin romper al otro.
  const pendientes = (contrato.aplicacion_pendiente ?? []).filter((a) => a.miembro === como);
  const oscuroPendiente = pendientes.find((a) => a.tema === "oscuro");
  const tokenPendiente = (nombre) => pendientes.find((a) => Array.isArray(a.tokens) && a.tokens.includes(nombre));

  // Capa marca · colores claros.
  let malos = 0;
  let enEspera = 0;
  for (const [nombre, hex] of Object.entries(contrato.marca.colores_claro)) {
    const v = valorColor(colores, nombre, idClaro);
    const texto = v === undefined ? `claro · falta el token «${nombre}»` : v !== hex.toLowerCase() ? `claro · ${nombre}: tiene ${v}, la familia dice ${hex}` : null;
    if (!texto) continue;
    const p = tokenPendiente(nombre);
    if (p) { aviso(`${texto}; pendiente de aplicar en ${como} (decidido el ${p.desde})`); enEspera++; }
    else { falla(texto); malos++; }
  }
  const nClaros = Object.keys(contrato.marca.colores_claro).length;
  if (malos === 0) ok(enEspera === 0 ? `claro · los ${nClaros} colores coinciden al hex` : `claro · ${nClaros - enEspera} de ${nClaros} colores coinciden al hex (${enEspera} pendiente de aplicar)`);

  // Capa marca · colores oscuros (P1, decidido: el mismo oscuro en las dos aplicaciones).
  const malosOscuro = [];
  let oscuroEnEspera = 0;
  for (const [nombre, hex] of Object.entries(contrato.marca.colores_oscuro)) {
    const v = valorColor(colores, nombre, idOscuro);
    if (v === hex.toLowerCase()) continue;
    const texto = `oscuro · ${nombre}: tiene ${v ?? "nada"}, la familia dice ${hex}`;
    const p = tokenPendiente(nombre);
    if (p) { aviso(`${texto}; pendiente de aplicar en ${como} (decidido el ${p.desde})`); oscuroEnEspera++; }
    else malosOscuro.push(texto);
  }
  const nOscuros = Object.keys(contrato.marca.colores_oscuro).length;
  if (malosOscuro.length === 0) ok(oscuroEnEspera === 0 ? `oscuro · los ${nOscuros} colores coinciden al hex` : `oscuro · ${nOscuros - oscuroEnEspera} de ${nOscuros} colores coinciden al hex (${oscuroEnEspera} pendiente de aplicar)`);
  else if (oscuroPendiente) aviso(`oscuro · ${malosOscuro.length} de ${nOscuros} colores difieren; pendiente de aplicar en ${como} (decidido el ${oscuroPendiente.desde})`);
  else for (const m of malosOscuro) falla(m);

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

  return out;
}

/** Unos tokens de artifact que cumplen el contrato al pie de la letra, para la autoprueba. */
function tokensQueCumplen(contrato, como) {
  const colores = Object.entries(contrato.marca.colores_claro).map(([name, claro]) => ({
    name,
    value: { claro, oscuro: contrato.marca.colores_oscuro[name] ?? claro },
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
  t = base(); t.color.tokens.find((c) => c.name === "hueso").value.oscuro = "#15110d"; debeFallar("el oscuro viejo de Dynamic en una aplicación que ya debería tenerlo", t);
  t = base(); t.radius.tokens[0].value = "10px"; debeFallar("un radio de control distinto", t);
  t = base(); t.type.families.serif = "Georgia, serif"; debeFallar("la serif cambiada", t);
  t = base(); t.color.themes = [{ id: "claro" }]; debeFallar("un tokens.json con un solo tema", t);

  // Lo decidido y todavía sin aplicar se AVISA (no falla) y no se calla: ni se oculta ni rompe a quien aún no migró.
  const viejo = base(); viejo.color.tokens.find((c) => c.name === "papel").value.oscuro = "#26221d";
  const conPendiente = structuredClone(contrato);
  conPendiente.aplicacion_pendiente = [{ miembro: "retail", tema: "oscuro", que: "x", desde: "2026-10-26" }];
  const r = compararTokens(conPendiente, viejo, "retail");
  if (r.some((x) => x.nivel === "falla")) fallos.push("un oscuro pendiente de aplicar declarado en el contrato no debería fallar");
  if (!r.some((x) => x.nivel === "aviso" && /pendiente de aplicar/.test(x.texto))) fallos.push("un oscuro pendiente de aplicar debería salir como aviso");

  // Lo mismo con un TOKEN suelto pendiente (P2: borde-control, que Dynamic todavía tiene como alias de taupe): en Dynamic se avisa; en la
  // aplicación que ya debería tenerlo, falla; y un token DISTINTO al pendiente sigue fallando en todas.
  const conToken = structuredClone(contrato);
  conToken.aplicacion_pendiente = [{ miembro: "dynamic", tema: "borde-control", tokens: ["borde-control"], que: "x", desde: "2026-10-26" }];
  const aliasDeTaupe = structuredClone(tokensQueCumplen(contrato, "dynamic")); // los radios de Dynamic llevan sus propios nombres
  const bc = aliasDeTaupe.color.tokens.find((c) => c.name === "borde-control");
  bc.value = { claro: contrato.marca.colores_claro.taupe, oscuro: contrato.marca.colores_oscuro.taupe };
  const rd = compararTokens(conToken, aliasDeTaupe, "dynamic");
  if (rd.some((x) => x.nivel === "falla")) fallos.push("un token pendiente de aplicar declarado para dynamic no debería fallar en dynamic");
  if (!rd.some((x) => x.nivel === "aviso" && /borde-control.*pendiente de aplicar/.test(x.texto))) fallos.push("un token pendiente de aplicar debería salir como aviso");
  const aliasEnRetail = structuredClone(base());
  aliasEnRetail.color.tokens.find((c) => c.name === "borde-control").value = { claro: contrato.marca.colores_claro.taupe, oscuro: contrato.marca.colores_oscuro.taupe };
  if (!compararTokens(conToken, aliasEnRetail, "retail").some((x) => x.nivel === "falla" && /borde-control/.test(x.texto))) fallos.push("el detector NO notó un token viejo en la aplicación que ya debería tenerlo (retail)");
  const otroRojo = structuredClone(aliasDeTaupe); otroRojo.color.tokens.find((c) => c.name === "rojo").value.claro = "#b8412e";
  if (!compararTokens(conToken, otroRojo, "dynamic").some((x) => x.nivel === "falla")) fallos.push("un token pendiente no debería tapar la falla de otro token");

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
