import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado: un botón que «se vuelve» el de enviar debajo del propio clic.
//
// El problema (Felipe, 2026-11-12, corrida de /flujo-de-negocio `recibir/con-aviso-de-compras`): en «Crear la prenda que llegó» de Recibir, el
// pie decía `ultimo ? <Boton type="submit">Crear</Boton> : <Boton type="button" onClick={seguir}>Seguir</Boton>`. React reusa el MISMO
// <button> en ese lugar. Al tocar «Seguir» en el paso 2, `seguir()` pasa al paso 3, React redibuja en el acto (un clic es un evento
// «discreto») y le cambia el `type` a `submit` ANTES de que el navegador termine el clic. El navegador envía el formulario y la prenda se
// crea sin mostrar el paso del precio, que asoma un instante y se va. Con una `key` distinta en cada rama, son dos <button> distintos.
//
// Contrato. PROMETE: en `app/` y `components/`, toda expresión `cond ? <Boton|button …> : <Boton|button …>` cuyas dos ramas no envían igual (una
// `type="submit"` —o sin `type`, que dentro de un <form> envía: así es HTML y `Boton` no fija uno— y la otra `type="button"`) lleva `key` en
// las dos. ASUME: el `type` se escribe como texto. NO PROMETE: ver un `type={expresión}` (se salta: no se sabe qué vale) ni un cambio de tipo
// fuera de un ternario. Cambiar de enviar a no enviar también se marca: es inofensivo hoy, pero el día que alguien invierta la condición, no.

const RAIZ = join(__dirname, "..");
const CARPETAS = ["app", "components"];

type Hallazgo = { archivo: string; linea: number };

// Por qué un filtro de texto antes del árbol (2026-11-13): parsear los ~1400 .tsx con TypeScript cuesta ~3 s y, con la suite completa en
// paralelo, pasaba los 5 s de fábrica. Solo ~26 archivos tienen un «?» y un «:» seguidos de un botón, y ningún ternario entre dos botones puede
// escaparse: entre el «?» (o el «:») y el `<Boton` solo caben espacios, paréntesis y comentarios, que el patrón salta.
const ENTRE = String.raw`(?:[\s(]|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*`;
const RAMA_SI = new RegExp(String.raw`\?${ENTRE}<(?:Boton|button)\b`);
const RAMA_NO = new RegExp(String.raw`:${ENTRE}<(?:Boton|button)\b`);

/** ¿Puede este archivo tener un ternario entre dos botones? Si dice que no, seguro que no; si dice que sí, lo decide el árbol. */
export const puedeTenerTernarioDeBotones = (fuente: string) => RAMA_SI.test(fuente) && RAMA_NO.test(fuente);

/** El elemento JSX de una rama del ternario (quitando paréntesis), si es un `Boton` o un `button`. */
function botonDe(nodo: ts.Expression, sf: ts.SourceFile): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  let n: ts.Expression = nodo;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  const apertura = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
  if (!apertura) return null;
  const tag = apertura.tagName.getText(sf);
  return tag === "Boton" || tag === "button" ? apertura : null;
}

/** «submit», «button», `null` si el tipo es una expresión. Sin `type`, envía (el de fábrica de HTML dentro de un formulario). */
function tipoDe(boton: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): string | null {
  const attr = boton.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "type");
  if (!attr) return "submit";
  if (!ts.isJsxAttribute(attr) || !attr.initializer) return null;
  return ts.isStringLiteral(attr.initializer) ? attr.initializer.text : null;
}

const tieneKey = (boton: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile) =>
  boton.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "key");

/** Las líneas donde un ternario cambia un botón de enviar a no enviar (o al revés) sin `key` en las dos ramas. */
export function botonesQueCambianDeTipo(ruta: string, fuente: string): number[] {
  if (!puedeTenerTernarioDeBotones(fuente)) return [];
  // Sin punteros al padre (`false`): la mitad del costo de parsear. Por eso cada `getText` recibe el archivo.
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const lineas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isConditionalExpression(nodo)) {
      const a = botonDe(nodo.whenTrue, archivo);
      const b = botonDe(nodo.whenFalse, archivo);
      if (a && b) {
        const ta = tipoDe(a, archivo);
        const tb = tipoDe(b, archivo);
        const cambia = ta !== null && tb !== null && (ta === "submit") !== (tb === "submit");
        if (cambia && !(tieneKey(a, archivo) && tieneKey(b, archivo))) lineas.push(archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return lineas;
}

function archivosTsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) archivosTsx(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("cómo se reconoce un botón que cambia de tipo", () => {
  it("submit ↔ button sin key: se marca; con key en las dos ramas, no", () => {
    const malo = `const A = ({ u }) => (\n  <form>\n    {u ? (\n      <Boton type="submit">Crear</Boton>\n    ) : (\n      <Boton type="button" onClick={f}>Seguir</Boton>\n    )}\n  </form>\n);`;
    expect(botonesQueCambianDeTipo("a.tsx", malo)).toEqual([3]);
    const bueno = malo.replace('<Boton type="submit"', '<Boton key="c" type="submit"').replace('<Boton type="button"', '<Boton key="s" type="button"');
    expect(botonesQueCambianDeTipo("a.tsx", bueno)).toEqual([]);
  });
  it("sin `type` cuenta como enviar (HTML), y dos que no envían no se marcan", () => {
    expect(botonesQueCambianDeTipo("b.tsx", `const B = (u) => (u ? <button>Ok</button> : <button type="button">No</button>);`)).toEqual([1]);
    expect(botonesQueCambianDeTipo("c.tsx", `const C = (u) => (u ? <Boton type="button">A</Boton> : <Boton type="button">B</Boton>);`)).toEqual([]);
  });
  it("el filtro de texto no se salta un ternario con un comentario entre la rama y el botón", () => {
    const conComentario = `const E = (u) => (\n  u ? ( // el que crea\n    <Boton type="submit">A</Boton>\n  ) : (\n    /* el que sigue */\n    // otra línea\n    <button type="button">B</button>\n  )\n);`;
    expect(puedeTenerTernarioDeBotones(conComentario)).toBe(true);
    expect(botonesQueCambianDeTipo("e.tsx", conComentario)).toEqual([2]);
    expect(puedeTenerTernarioDeBotones(`const F = (u) => (u ? <Chip /> : <Boton type="button">B</Boton>);`)).toBe(false);
  });
  it("un `type` que es una expresión no se adivina", () => {
    expect(botonesQueCambianDeTipo("d.tsx", `const D = (u, t) => (u ? <Boton type={t}>A</Boton> : <Boton type="button">B</Boton>);`)).toEqual([]);
  });
});

describe("en el ERP, ningún botón se vuelve el de enviar debajo del clic", () => {
  it("todo ternario entre un botón que envía y uno que no lleva `key` en las dos ramas", () => {
    const hallazgos: Hallazgo[] = [];
    for (const carpeta of CARPETAS) {
      for (const ruta of archivosTsx(join(RAIZ, carpeta))) {
        for (const linea of botonesQueCambianDeTipo(ruta, readFileSync(ruta, "utf8"))) hallazgos.push({ archivo: ruta.slice(RAIZ.length + 1), linea });
      }
    }
    expect(
      hallazgos.map((h) => `${h.archivo}:${h.linea}`),
      "Ponle una `key` distinta a cada rama (`key=\"crear\"`, `key=\"seguir\"`): sin ella React reusa el mismo <button> y, si el clic cambia la rama, el navegador envía el formulario.",
    ).toEqual([]);
    // Su trabajo propio es ~0,2 s (filtrar ~1400 archivos y parsear ~30). El límite de 15 s no tapa lentitud de la prueba: cubre la espera de
    // CPU cuando corre con las ~900 de la web en una máquina ocupada, donde se midió hasta 4,5 s (2026-11-13; antes del filtro, 8 a 9 s).
  }, 15_000);
});
