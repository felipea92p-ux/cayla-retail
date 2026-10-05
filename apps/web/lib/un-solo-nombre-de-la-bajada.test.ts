import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado del nombre de la acción de pasar prendas del almacén al piso de venta (ADR-0339, Felipe 2026-10-04):
// se llama «Colgar en el piso». «Bajar» solo era cierto en TRU, donde el almacén está en otra planta; en AQP y Lima el
// almacén está en la misma planta. Y «colgar» es el mismo verbo del estado «Por colgar» que ya decía la pantalla.
//
// Por qué existe: la misma acción llegó a tener ocho nombres en pantalla («Bajar al piso», «Reponer», «Reponer prenda»,
// «Reponer a piso», «Bajada al piso»…), cada uno nacido de una decisión correcta tomada por separado en nueve días. Nadie
// era dueño del nombre. Una regla que solo vive en un documento se olvida; una que vive en una prueba no.
//
// Contrato. PROMETE: que ningún texto visible de `app/`, `components/` o `lib/` (cadenas, plantillas y texto JSX)
// nombra la acción con alguno de los nombres retirados, flexionado o con una interpolación en medio («Bajar ${n} al piso»),
// y que ningún archivo usa los identificadores retirados. ASUME: la web escribe sus textos en TypeScript/JSX. NO PROMETE:
// (a) ver el verbo suelto («cuántas bajar»): «bajar» también es «bajó la deuda» y «bajar el IGV», y prohibirlo a secas
// castigaría textos que no son de esta acción; (b) mirar `supabase/`: los mensajes que levanta la base (`raise exception`)
// siguen diciendo «bajar prendas al piso» hasta que se pegue una migración, y las migraciones viejas son historia que no
// se reescribe; (c) los comentarios y las pruebas, que pueden contar cómo se llamaba antes.
//
// Lo que NO se retiró, a propósito: `bajada`/`bajar_al_piso` en identificadores, la RPC, las tablas y la ruta
// `/inventario/bajar` (renombrarlos pide una migración en producción); «Por colgar» (el estado); «Subir a almacén»
// (la acción inversa); y `reposicion` (el motivo de ajuste guardado en `movimientos`, otro concepto: ver la migración
// 20260926000400).

const INICIO = "(?<![\\p{L}\\p{N}_-])"; // ni letra ni guion antes: «club-bajada» (una clase CSS) no es el verbo
const FIN = "(?![\\p{L}\\p{N}_])";
const HUECO = "[^.?!,;:()]{0,60}?"; // media oración de por medio: sin cruzar punto, coma ni paréntesis («no es una baja), pero … al piso» no es el verbo)
const AL_PISO = "\\s(?:al|a)\\s+piso" + FIN;
const BAJAR =
  "(?:bajar(?:l[aeo]s?)?|bájal[aeo]s?|baja|bajas|bajan|baje|bajes|bajen|bajemos|bajé|bajaste|bajó|bajaron|bajando|bajad[oa]s?)";
const REPONER = "(?:reponer(?:l[aeo]s?)?|repón|repone|reponen|reponga|reponen)";

/** Los nombres retirados, cada uno con lo que dice la persona al verlo. El orden no importa: se reportan todos. */
const NOMBRES_RETIRADOS: readonly { nombre: string; patron: RegExp }[] = [
  { nombre: "«bajar … al piso» (en cualquier forma: bajar, baja, se bajó, bajadas, bájalas)", patron: new RegExp(`${INICIO}${BAJAR}${FIN}\\s?${HUECO}${AL_PISO}`, "iu") },
  { nombre: "«reponer … a piso» (reponer a piso, reponer al piso)", patron: new RegExp(`${INICIO}${REPONER}${FIN}\\s?${HUECO}${AL_PISO}`, "iu") },
  { nombre: "«Reponer prenda» / «Reponer piso»", patron: new RegExp(`${INICIO}reponer\\s+(?:prendas?|piso)${FIN}`, "iu") },
  { nombre: "«Subir al piso» (apuntaba al revés que «Subir a almacén»)", patron: new RegExp(`${INICIO}subir\\s+al\\s+piso${FIN}`, "iu") },
  { nombre: "la ruta «… ▸ Reponer»", patron: new RegExp(`▸\\s*reponer${FIN}`, "iu") },
  { nombre: "«la bajada» como sustantivo de esta acción (usa «tanda» o «colgada»)", patron: new RegExp(`${INICIO}(?:la|una|esta|otra|esa|las|de la)\\s+bajadas?${FIN}`, "iu") },
];

/** Los identificadores y archivos que se renombraron a la familia `bajar`/`bajada` (lista cerrada y exacta). */
const IDENTIFICADORES_RETIRADOS: readonly string[] = [
  "ReponerPrendaModal", "reponer_a_piso", "reponerAPiso", "onReponer", "puedeReponer", "hayQueReponer",
  "tallaParaReponer", "tallasParaReponer", "TallaParaReponer", "PrendaParaReponer", "textoBotonReponer",
  "totalAReponer", "reponerYRetirar", "abrirReponer", "enMapaReponer", "prendasReponiendo", "setReponiendo",
  "reponiendo", "umbralStockPisoReposicion", "quedaraPidiendoReponer", "pideReponer",
];
const ARCHIVOS_RETIRADOS: readonly string[] = ["ReponerPrendaModal", "reponer-prenda-reglas"];

/** El atajo barato: casi ningún archivo nombra «baj…», «repon…» ni «reposicion» (con o sin tilde). Sin él, parsear los ~900 archivos con TypeScript tardaba
 *  10 s con las demás pruebas compitiendo por CPU y rebasaba el límite de 5 s. Todo nombre retirado tiene que pasarlo (una prueba lo exige). */
const PREFILTRO = /b[aá]j|rep[oó]n|reposicion|subir al piso/i; // con tilde: «bájalas», «repón»

type Texto = { linea: number; texto: string };
type Hallazgo = { linea: number; que: string };

/** Todo texto que una persona puede leer, y solo eso: se lee el árbol del código, no las letras, así que un comentario
 *  que cuenta cómo se llamaba antes no cuenta. Una interpolación queda como `\u0001` para que «Bajar ${n} al piso» se vea. */
function textosVisibles(ruta: string, fuente: string): Texto[] {
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const textos: Texto[] = [];
  const poner = (nodo: ts.Node, texto: string) =>
    textos.push({ linea: archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1, texto: texto.replace(/\s+/g, " ") });
  const visitar = (nodo: ts.Node) => {
    if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) poner(nodo, nodo.text);
    else if (ts.isTemplateExpression(nodo)) poner(nodo, nodo.head.text + nodo.templateSpans.map((s) => `\u0001${s.literal.text}`).join(""));
    else if (ts.isJsxText(nodo)) poner(nodo, nodo.text);
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return textos;
}

/** Los nombres retirados que aparecen en un archivo: en un texto visible, o como identificador / ruta de import. */
export function nombresRetiradosEn(ruta: string, fuente: string): Hallazgo[] {
  if (!PREFILTRO.test(fuente)) return [];
  const hallados: Hallazgo[] = [];
  for (const { linea, texto } of textosVisibles(ruta, fuente)) {
    for (const { nombre, patron } of NOMBRES_RETIRADOS) if (patron.test(texto)) hallados.push({ linea, que: nombre });
    for (const viejo of ARCHIVOS_RETIRADOS) if (texto.includes(viejo)) hallados.push({ linea, que: `la ruta «${viejo}»` });
    if (IDENTIFICADORES_RETIRADOS.includes(texto)) hallados.push({ linea, que: `el valor «${texto}»` });
  }
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visitar = (nodo: ts.Node) => {
    if (ts.isIdentifier(nodo) && IDENTIFICADORES_RETIRADOS.includes(nodo.text)) {
      hallados.push({ linea: archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1, que: `el identificador «${nodo.text}»` });
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return hallados;
}

describe("cómo se reconoce un nombre retirado", () => {
  const hay = (fuente: string) => nombresRetiradosEn("a.tsx", fuente).length > 0;

  it("los siete nombres que tenía la acción en pantalla", () => {
    for (const texto of ["Bajar prendas al piso", "Bajar al piso", "Bajada al piso", "Bajadas al piso", "Reponer prenda", "Reponer a piso", "Reponer al piso"]) {
      expect(hay(`export const A = () => <b>${texto}</b>;`), texto).toBe(true);
    }
  });

  it("con flexión: la persona lee «se bajó», «bajaron», «bájalas», «que lo bajen», «prendas bajadas»", () => {
    for (const texto of [
      "Se bajó 1 prenda al piso de TRU", "Se bajaron 3 prendas al piso", "etiquétalas y bájalas al piso", "que la bajen al piso",
      "12 prendas bajadas al piso", "Baja al piso 3 tallas", "tu rol no baja prendas al piso",
    ]) {
      expect(hay(`export const A = "${texto}";`), texto).toBe(true);
    }
  });

  it("con una interpolación en medio, como «Bajar ${n} al piso»", () => {
    expect(hay("export const A = (n: number) => `Bajar ${n} al piso`;")).toBe(true);
    expect(hay("export const A = (n: number) => `Bajar ${n === 1 ? 'esta' : `estas ${n}`} al piso`;")).toBe(true);
  });

  it("partido en dos líneas de JSX, que el navegador junta en una", () => {
    expect(hay("export const A = () => <b>Bajar\n        al piso</b>;")).toBe(true);
  });

  it("la ruta «Inventario ▸ Existencias ▸ Reponer» y el sustantivo «la bajada»", () => {
    expect(hay('export const A = "Regístrala en Inventario ▸ Existencias ▸ Reponer";')).toBe(true);
    expect(hay('export const A = "Si la tienes en la mano, la bajada queda registrada.";')).toBe(true);
    expect(hay('export const A = "Subir al piso: usa el botón";')).toBe(true);
  });

  it("los identificadores y las rutas de archivo retirados", () => {
    expect(hay("export function puedeReponer() {}")).toBe(true);
    expect(hay('import { x } from "@/lib/reponer-prenda-reglas";')).toBe(true);
    expect(hay('import X from "@/components/ReponerPrendaModal";')).toBe(true);
    expect(hay('export const A = { tipo: "reponer_a_piso" };')).toBe(true);
  });

  it("el nombre nuevo y los homónimos que NO son esta acción no cuentan", () => {
    for (const texto of [
      "Colgar en el piso", "Se colgó 1 prenda en el piso de TRU", "Por colgar", "Subir a almacén", "Subir prenda",
      "Bajó lo que se debe", "el saldo no baje del mínimo", "bajar el IGV", "Pasan al almacén (no es una baja), pero la caja no las cobra hasta que vuelvan al piso.", "Reponer", "Por reponer", "club-bajada", "Cuántas bajar",
    ]) {
      expect(hay(`export const A = "${texto}";`), texto).toBe(false);
    }
  });

  it("el atajo barato no esconde nada: todo identificador y archivo retirado lo pasa", () => {
    for (const nombre of [...IDENTIFICADORES_RETIRADOS, ...ARCHIVOS_RETIRADOS]) expect(PREFILTRO.test(nombre), nombre).toBe(true);
  });

  it("un comentario que cuenta el nombre de antes no cuenta", () => {
    const fuente = `// antes decía «Bajar al piso» y «Reponer a piso»\n/* Reponer prenda */\nexport const A = () => <b>{/* Bajar al piso */}Colgar en el piso</b>;`;
    expect(nombresRetiradosEn("a.tsx", fuente)).toEqual([]);
  });

  it("la familia `bajada` de identificadores sigue siendo legal: es el nombre de la base", () => {
    const fuente = `import { argumentosDeBajada, type LineaBajada } from "@/lib/bajada-reglas";\nconst RPC_BAJADA = "bajar_al_piso";\nexport const urlBajarAlPiso = () => "/inventario/bajar";`;
    expect(nombresRetiradosEn("a.ts", fuente)).toEqual([]);
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" || e.name === ".next" ? [] : fuentesBajo(ruta);
    return /\.[jt]sx?$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [ruta] : [];
  });
}

describe("la web nombra la acción con un solo nombre: «Colgar en el piso»", () => {
  const fuentes = ["app", "components", "lib"].flatMap(fuentesBajo);

  it("la prueba de verdad lee la web (no pasa por no haber mirado nada)", () => {
    expect(fuentes.length).toBeGreaterThan(200);
    const nombreNuevo = readFileSync(join(WEB, "lib/existencias-recomendaciones.ts"), "utf8");
    expect(nombreNuevo).toContain("Colgar en el piso");
  });

  it("los archivos que se renombraron no vuelven a existir con su nombre viejo", () => {
    expect(existsSync(join(WEB, "components/ReponerPrendaModal.tsx"))).toBe(false);
    expect(existsSync(join(WEB, "lib/reponer-prenda-reglas.ts"))).toBe(false);
  });

  it("ningún texto visible ni identificador de app/, components/ o lib/ usa un nombre retirado", () => {
    const hallados = fuentes.flatMap((ruta) =>
      nombresRetiradosEn(ruta, readFileSync(join(WEB, ruta), "utf8")).map(({ linea, que }) => `${ruta}:${linea} — ${que}`),
    );
    expect(
      hallados,
      "Esta acción se llama «Colgar en el piso» (ADR-0339). «Bajar» solo es cierto en TRU: en AQP y Lima el almacén está " +
        "en la misma planta. Para un botón, un título o una frase usa «Colgar en el piso» («Colgar 3 prendas», «Se colgó 1 " +
        "prenda en el piso», «tanda» para el lote); para el estado, «Por colgar». En código se queda la familia `bajada` / " +
        "`bajar_al_piso`, que es el nombre de la RPC y de las tablas. Si de verdad es otra cosa (p. ej. «bajar el precio»), " +
        "reescribe la frase para que no diga «al piso».",
    ).toEqual([]);
  }, 30_000);
});
