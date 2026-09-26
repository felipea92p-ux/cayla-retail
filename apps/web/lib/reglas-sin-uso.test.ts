import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado «probado = en pantalla» (ADR-0234). Una función de reglas (`lib/*-reglas.ts`) que solo usa su propia prueba
// hace que el CI diga que algo funciona cuando ninguna pantalla lo muestra.
//
// Por qué existe: el 2026-09-22 se sumó `etiquetaConDireccion()` («Entrada · Traslado recibido») con sus pruebas, para
// que Movimientos la usara «cuando se commitee» la pantalla. La pantalla nunca llegó a ninguna rama, y cuatro días
// después la tarjeta «Entradas» seguía diciendo «Nada entró» con 80 prendas recién llegadas: el arreglo existía, tenía
// pruebas en verde y la tienda no lo veía. La revisión de Movimientos (2026-09-26) encontró 28 funciones así en 89
// archivos de reglas.
//
// Contrato. PROMETE: que toda función exportada por un `lib/*-reglas.ts` la nombra algún archivo de `app/`,
// `components/` o `lib/` que no sea una prueba, o su propio archivo más de una vez (la usa otra función de ahí). ASUME:
// que se importa por su nombre (un `import { x }` o un `import * as r` seguido de `r.x`), que es como se escribe en este
// repo. NO PROMETE: que la función se ejecute — un nombre en un archivo que nadie abre sigue contando. Lo que diga un
// comentario o un texto no cuenta: se leen los identificadores del código, no las letras.
//
// La lista de abajo son las que ya estaban así el 2026-09-26: la prueba falla si aparece una nueva Y si una de la lista
// empieza a usarse o se borra (hay que sacarla). La lista solo puede achicarse.
const SIN_USO_CONOCIDAS: ReadonlySet<string> = new Set([
  "lib/caja-panel-reglas.ts: escalaTurno",
  "lib/caja-panel-reglas.ts: rangoHorasCaja",
  "lib/caja-panel-reglas.ts: ventasPorHora",
  "lib/caja-panel-reglas.ts: tendenciaCierres7Dias",
  "lib/caja-panel-reglas.ts: egresosElevados",
  "lib/caja-panel-reglas.ts: senalCaja",
  "lib/configuracion-reglas.ts: textoEfecto",
  "lib/facturacion-codigos-reglas.ts: resumenDeCodigos",
  "lib/facturacion-codigos-reglas.ts: ordenarCodigos",
  "lib/facturacion-codigos-reglas.ts: detalleDelCodigo",
  "lib/facturacion-codigos-reglas.ts: camposDeBusquedaDelCodigo",
  "lib/facturacion-comprobantes-reglas.ts: seriesFaltantes",
  "lib/facturacion-comprobantes-reglas.ts: textoDeSeriesFaltantes",
  "lib/facturacion-proformas-reglas.ts: franjaDeProformas",
  "lib/facturacion-resumen-reglas.ts: horaDeReloj",
  "lib/facturacion-resumen-reglas.ts: ventasUnicas",
  "lib/facturacion-resumen-reglas.ts: tonoVendidoHoy",
  "lib/facturacion-resumen-reglas.ts: tonoPorEnviar",
  "lib/facturacion-resumen-reglas.ts: comparativoEnPorcentaje",
  "lib/facturacion-resumen-reglas.ts: comparativoEnCantidad",
  "lib/gastos-reglas.ts: nombreVer",
  "lib/por-pagar-consolidado-reglas.ts: ordenarPorVencimiento",
  "lib/recepciones-reglas.ts: resumenConteo",
  "lib/reparto-reglas.ts: textoTeToca",
  "lib/sin-conexion-reglas.ts: pantallaSinConexion",
  "lib/terminales-reglas.ts: resolverTienda",
]);

/** Las funciones que exporta un archivo, con su nombre. `export function x` y `export async function x`. */
export function funcionesExportadas(ruta: string, fuente: string): string[] {
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const nombres: string[] = [];
  for (const sentencia of archivo.statements) {
    if (ts.isFunctionDeclaration(sentencia) && sentencia.name && sentencia.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      nombres.push(sentencia.name.text);
    }
  }
  return nombres;
}

/** Cuántas veces aparece cada identificador en el código (no en comentarios ni en textos). */
export function identificadores(ruta: string, fuente: string): Map<string, number> {
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const cuenta = new Map<string, number>();
  const visitar = (nodo: ts.Node) => {
    if (ts.isIdentifier(nodo)) cuenta.set(nodo.text, (cuenta.get(nodo.text) ?? 0) + 1);
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return cuenta;
}

describe("cómo se reconoce una regla sin uso", () => {
  it("solo las funciones exportadas: ni las internas ni las constantes", () => {
    const fuente = `export function a() { return b(); }\nfunction b() { return 1; }\nexport const c = () => 2;\nexport async function d() {}`;
    expect(funcionesExportadas("x-reglas.ts", fuente)).toEqual(["a", "d"]);
  });

  it("un comentario o un texto que la nombran no cuentan como uso", () => {
    const fuente = `// usa etiquetaConDireccion\nconst t = "etiquetaConDireccion";\nexport const E = () => <p title="etiquetaConDireccion">{t}</p>;`;
    expect(identificadores("pantalla.tsx", fuente).get("etiquetaConDireccion")).toBeUndefined();
  });

  it("una llamada, un import o un acceso por el espacio de nombres sí", () => {
    const fuente = `import { f } from "./x-reglas";\nimport * as r from "./y-reglas";\nexport const v = f() + r.g();`;
    const ids = identificadores("pantalla.ts", fuente);
    expect(ids.get("f")).toBe(2);
    expect(ids.get("g")).toBe(1);
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

function reglasSinUso(): string[] {
  const fuentes = ["app", "components", "lib"].flatMap(fuentesBajo);
  const texto = new Map(fuentes.map((ruta) => [ruta, readFileSync(join(WEB, ruta), "utf8")]));
  const reglas = fuentes.filter((ruta) => /^lib\/[^/]+-reglas\.ts$/.test(ruta));
  const candidatas = reglas.flatMap((ruta) => funcionesExportadas(ruta, texto.get(ruta)!).map((nombre) => ({ ruta, nombre })));

  // Solo se lee el árbol de los archivos que nombran alguna candidata: el resto no puede usarlas.
  const nombres = new Set(candidatas.map((c) => c.nombre));
  const usos = new Map<string, Map<string, number>>();
  for (const [ruta, fuente] of texto) {
    if ([...nombres].some((n) => fuente.includes(n))) usos.set(ruta, identificadores(ruta, fuente));
  }

  return candidatas
    .filter(({ ruta, nombre }) => {
      if ((usos.get(ruta)?.get(nombre) ?? 0) > 1) return false; // la usa otra función de su propio archivo
      for (const [otra, ids] of usos) if (otra !== ruta && ids.has(nombre)) return false;
      return true;
    })
    .map(({ ruta, nombre }) => `${ruta}: ${nombre}`);
}

describe("toda regla exportada la usa una pantalla u otra regla", () => {
  const sinUso = reglasSinUso();

  it("no aparece ninguna nueva", () => {
    expect(
      sinUso.filter((r) => !SIN_USO_CONOCIDAS.has(r)),
      "Esta función de reglas solo la usa su prueba: ninguna pantalla la muestra. Conéctala a la pantalla en el mismo " +
        "cambio, o bórrala junto con su prueba. «La uso cuando se commitee la pantalla» es justo lo que este candado evita.",
    ).toEqual([]);
  });

  it("la lista de las que ya estaban solo se achica", () => {
    expect(
      [...SIN_USO_CONOCIDAS].filter((r) => !sinUso.includes(r)),
      "Esta función ya se usa (o ya no existe): sácala de SIN_USO_CONOCIDAS en lib/reglas-sin-uso.test.ts.",
    ).toEqual([]);
  });
});
