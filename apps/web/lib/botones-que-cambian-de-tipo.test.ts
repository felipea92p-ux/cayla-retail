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

/** El elemento JSX de una rama del ternario (quitando paréntesis), si es un `Boton` o un `button`. */
function botonDe(nodo: ts.Expression): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  let n: ts.Expression = nodo;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  const apertura = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
  if (!apertura) return null;
  const tag = apertura.tagName.getText();
  return tag === "Boton" || tag === "button" ? apertura : null;
}

/** «submit», «button», `null` si el tipo es una expresión. Sin `type`, envía (el de fábrica de HTML dentro de un formulario). */
function tipoDe(boton: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | null {
  const attr = boton.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "type");
  if (!attr) return "submit";
  if (!ts.isJsxAttribute(attr) || !attr.initializer) return null;
  return ts.isStringLiteral(attr.initializer) ? attr.initializer.text : null;
}

const tieneKey = (boton: ts.JsxOpeningElement | ts.JsxSelfClosingElement) =>
  boton.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText() === "key");

/** Las líneas donde un ternario cambia un botón de enviar a no enviar (o al revés) sin `key` en las dos ramas. */
export function botonesQueCambianDeTipo(ruta: string, fuente: string): number[] {
  if (!fuente.includes("?")) return [];
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isConditionalExpression(nodo)) {
      const a = botonDe(nodo.whenTrue);
      const b = botonDe(nodo.whenFalse);
      if (a && b) {
        const ta = tipoDe(a);
        const tb = tipoDe(b);
        const cambia = ta !== null && tb !== null && (ta === "submit") !== (tb === "submit");
        if (cambia && !(tieneKey(a) && tieneKey(b))) lineas.push(archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1);
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
    // Recorre todos los .tsx del ERP: sola tarda ~1,5 s, pero con la suite completa en paralelo (el gancho de commit) pasaba los 5 s de
    // fábrica y caía por tiempo, no por un hallazgo (2026-11-13).
  }, 30_000);
});
