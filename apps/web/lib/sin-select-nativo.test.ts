import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado de la regla de combos (ADR-0209): en la web NO hay <select> del navegador. Todo combo es el del sistema —
// `CampoSelect` (formulario), `Desplegable` (filtros en `caja`, cabecera en `pastilla`), `SelectFin` (Finanzas),
// `ComboBuscable` (catálogo), `ComboResponsable` o `DesplegablePildora`—, que dibuja su propia lista, busca pasadas
// 8 opciones, pagina pasadas 50, agrupa y bloquea opciones. El nativo no hace nada de eso: su lista la pinta el sistema
// operativo y en Windows rompe la identidad justo cuando más se la mira.
//
// Por qué existe: la regla se escribió el 2026-09-25 y ESE MISMO DÍA nació Actividad con un <select> nativo, en paralelo;
// quedaban además cuatro pantallas de antes y todo Finanzas. Una regla que solo vive en un documento se olvida; una que
// vive en una prueba no.
//
// Contrato. PROMETE: que ningún archivo de `app/`, `components/` o `lib/` escribe un elemento JSX `<select>` (ni
// `<select …/>`). ASUME: la web arma su HTML con JSX. NO PROMETE: ver un `createElement("select")` ni un <select> que
// llegue desde una librería de terceros (hoy no hay ninguno de los dos); lo que diga un comentario o un texto no
// cuenta, porque se lee el árbol del código y no las letras.

/** Las líneas donde el archivo abre un `<select>` en JSX. Un comentario o un texto que diga «<select>» no cuenta. */
function selectsNativos(ruta: string, fuente: string): number[] {
  if (!fuente.includes("<select")) return []; // el atajo barato: casi ningún archivo lo menciona siquiera
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    if ((ts.isJsxOpeningElement(nodo) || ts.isJsxSelfClosingElement(nodo)) && nodo.tagName.getText(archivo) === "select") {
      lineas.push(archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return lineas;
}

describe("cómo se reconoce un <select> nativo", () => {
  it("el elemento JSX, abierto o cerrado en sí mismo", () => {
    const fuente = `export const A = () => (\n  <div>\n    <select value="a"><option>a</option></select>\n    <select />\n  </div>\n);`;
    expect(selectsNativos("a.tsx", fuente)).toEqual([3, 4]);
  });

  it("un comentario o un texto que lo nombran no son un <select>", () => {
    const fuente = `// no el <select> nativo\n/* <select> */\nexport const B = () => <p title="<select>">{"<select>"} {/* <select> */}</p>;`;
    expect(selectsNativos("b.tsx", fuente)).toEqual([]);
  });

  it("los combos del sistema no cuentan, aunque se llamen parecido", () => {
    const fuente = `export const C = () => <><SelectFin valor="a" /><Desplegable valor="a" /><select.X /></>;`;
    expect(selectsNativos("c.tsx", fuente)).toEqual([]);
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.[jt]sx?$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [ruta] : [];
  });
}

describe("la web no tiene <select> del navegador", () => {
  it("ningún archivo de app/, components/ o lib/", () => {
    const hallados = ["app", "components", "lib"]
      .flatMap(fuentesBajo)
      .flatMap((ruta) => selectsNativos(ruta, readFileSync(join(WEB, ruta), "utf8")).map((linea) => `${ruta}:${linea}`));
    expect(
      hallados,
      "Hay un <select> del navegador. Usa el combo del sistema (ADR-0209): CampoSelect en un formulario, Desplegable en " +
        'una barra de filtros (forma="caja") o en la cabecera (forma="pastilla"), SelectFin en Finanzas, ComboBuscable ' +
        "para el catálogo. Grupos y opciones bloqueadas: `Opcion.grupo` y `Opcion.deshabilitada`.",
    ).toEqual([]);
  });
});
