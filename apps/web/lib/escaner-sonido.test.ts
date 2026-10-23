import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { sonidoDeLecturaCamara } from "./escaner-reglas";

// Candado del bip de la cámara (Felipe 2026-10-23: «al escanear con el teléfono y que reconozca una prenda, que siempre emita
// sonido, así como en Bajar en tandas»). Hasta ese día sonaban Conteo, Bajar al piso y Cuadrar el piso; Vender, Apartados,
// Existencias, Cambios, Movimientos, Prendas de una etiqueta y Recibir traslado solo vibraban —y el iPhone no vibra—, así que
// había que volver a mirar la pantalla para saber si se leyó.
//
// Contrato. PROMETE: que todo archivo que lee con la cámara (`crearLector`) es uno de los tres escáneres conocidos; que
// `EscanerCamara` y `EscanerBusqueda` suenan solos (`avisarLectura`) y no vibran por su cuenta (el bip ya vibra); y que toda
// pantalla que dibuja `EscanerConteo` —que deja el sonido a la pantalla, porque es el mismo camino de la pistola— declara dónde
// suena, y ese archivo llama a `avisarLectura`. NO PROMETE: que suene en el aparato (eso se prueba con un teléfono en la mano).

describe("el bip de una lectura con la cámara", () => {
  it("agudo si la pantalla reconoció la prenda, la quitó o solo va a buscarla", () => {
    for (const tono of ["verde", "taupe", "pizarra", undefined] as const) expect(sonidoDeLecturaCamara(tono)).toBe("suma");
  });

  it("grave si respondió en ámbar: no entró o no es de ninguna prenda", () => {
    expect(sonidoDeLecturaCamara("ambar")).toBe("desconocida");
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

/** Los únicos que abren la cámara para leer etiquetas. Uno nuevo se suma aquí y suena. */
const ESCANERES = ["components/EscanerBusqueda.tsx", "components/EscanerCamara.tsx", "components/EscanerConteo.tsx"];

/** Los que suenan por su cuenta en cada lectura, sin que la pantalla haga nada. */
const SUENAN_SOLOS = ["components/EscanerBusqueda.tsx", "components/EscanerCamara.tsx"];

/** Quien dibuja `EscanerConteo` → el archivo donde suena su lectura (el mismo camino que la pistola). */
const SUENA_EN: Record<string, string> = {
  "components/BajarAlPisoForm.tsx": "components/BajarAlPisoForm.tsx",
  "components/conteo/ContarConteo.tsx": "components/conteo/ContarConteo.tsx",
  "components/cuadre-piso/CuadrarPisoForm.tsx": "components/cuadre-piso/CuadrarPisoForm.tsx",
  "components/traslados-pases/ReversoPase.tsx": "components/traslados-pases/useRecepcion.ts",
};

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.[jt]sx?$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [ruta] : [];
  });
}

/** Lo que el archivo llama y dibuja, leído del árbol del código: un comentario que nombre `avisarLectura(` no cuenta. */
function piezas(ruta: string): { llamadas: Set<string>; dibuja: Set<string> } {
  const fuente = readFileSync(join(WEB, ruta), "utf8");
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const llamadas = new Set<string>();
  const dibuja = new Set<string>();
  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo)) llamadas.add(nodo.expression.getText(archivo));
    if (ts.isJsxOpeningElement(nodo) || ts.isJsxSelfClosingElement(nodo)) dibuja.add(nodo.tagName.getText(archivo));
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return { llamadas, dibuja };
}

const archivos = ["app", "components", "lib"].flatMap(fuentesBajo);
const leidos = new Map(archivos.map((ruta) => [ruta, piezas(ruta)]));

describe("ninguna cámara lee en silencio", () => {
  it("solo los escáneres conocidos abren el lector", () => {
    const conLector = archivos.filter((ruta) => leidos.get(ruta)!.llamadas.has("crearLector")).sort();
    expect(conLector, "Un archivo nuevo lee con la cámara. Usa uno de los tres escáneres o súmalo a ESCANERES y haz que suene.").toEqual(ESCANERES);
  });

  it("EscanerCamara y EscanerBusqueda suenan en cada lectura y no vibran por su cuenta", () => {
    for (const ruta of SUENAN_SOLOS) {
      const { llamadas } = leidos.get(ruta)!;
      expect(llamadas.has("avisarLectura"), `${ruta} no suena al leer`).toBe(true);
      expect(llamadas.has("navigator.vibrate"), `${ruta} vibra a mano: el bip (avisarLectura) ya vibra`).toBe(false);
    }
  });

  it("toda pantalla con EscanerConteo dice dónde suena, y ahí suena", () => {
    const loDibujan = archivos.filter((ruta) => leidos.get(ruta)!.dibuja.has("EscanerConteo")).sort();
    expect(loDibujan, "Una pantalla nueva dibuja EscanerConteo: súmala a SUENA_EN con el archivo donde llama a avisarLectura.").toEqual(
      Object.keys(SUENA_EN).sort(),
    );
    for (const [pantalla, donde] of Object.entries(SUENA_EN)) {
      expect(leidos.get(donde)?.llamadas.has("avisarLectura"), `${pantalla}: su lectura con la cámara no suena (${donde})`).toBe(true);
    }
  });
});
