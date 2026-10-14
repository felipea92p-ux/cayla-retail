import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado de «el día de Lima tiene una sola casa» (2026-10-14). Hasta ese día había más de 30 copias escritas a mano del día
// o la hora de Lima —con `Intl` en-CA, restando 5 horas o con `hoyLima(new Date(x))`—, con diez nombres distintos (hoyLima
// en tres archivos, hoyEnLima en tres, diaDeLima, diaLimaDe, fechaLimaDe…). Todas daban bien, pero cada pantalla nueva copiaba
// la que tenía más a mano, y así nació el corte del día de UTC que hubo que arreglar en 18 lugares (`sin-corte-de-instante`).
// Se ordenaron todas a `lib/fechas-lima.ts`: `hoyLima` (hoy, o un Date), `diaLima` (un instante) y `horaLima` (su hora).
//
// Contrato. PROMETE: que fuera de `lib/fechas-lima.ts` ningún archivo de `app/`, `components/` o `lib/` saca el «aaaa-mm-dd»
// de una fecha con la forma en que nacieron 18 de esas copias: `toLocaleDateString("en-CA", …)`, `toLocaleString("en-CA",
// { timeZone… })` o `Intl.DateTimeFormat("en-CA", …)` (con o sin `new`). ASUME: el idioma se escribe ahí mismo, como texto
// («en-CA»), que es como se escribe en este repo. NO PROMETE: ver el «restar 5 horas» (`Date.parse(x) - 5 * 3600 * 1000`, que
// sigue legítimo para el día de la semana, los números de día de `panel-serie.ts` y los rangos), ni `hoyLima(new Date(x))`
// con un texto (con un número de milisegundos es lo correcto), ni los formatos de pantalla en «es-PE» («13 de octubre»,
// «8:13 p. m.»). Una línea que de verdad necesita el en-CA lleva en esa línea `// dia-lima-a-mano: <por qué>`, con 10
// caracteres o más.

const CASA = "lib/fechas-lima.ts";
const EXIMIDA = /\/\/\s*dia-lima-a-mano:\s*\S.{9,}/;

/** Lo que quedó a mano el 2026-10-14, con su porqué y cuántas hay en cada archivo. La prueba falla si aparece una nueva Y si una
 *  de estas desaparece o baja (hay que bajarla aquí): la lista solo baja. */
const EXCEPCIONES: Readonly<Record<string, { cuantas: number; porque: string }>> = {
  "lib/lucode.ts": { cuantas: 1, porque: "SUNAT: la fecha de emisión que se manda a Lucode. Felipe decidió no tocarla al ordenar (2026-10-14)." },
  "lib/recibo-reglas.ts": { cuantas: 1, porque: "SUNAT: la fecha del QR del comprobante impreso. Misma decisión de Felipe." },
  "lib/traslados-reglas.ts": { cuantas: 1, porque: "PARTES_LIMA saca el día, la hora y las diferencias de una vez: se ordena aparte, no línea por línea." },
  "components/apartados/piezas.tsx": { cuantas: 1, porque: "«COPIA · REIMPRESA EL …» está pegada a un cambio del PR #1066: se ordena cuando ese PR se fusione." },
};

const esTexto = (nodo: ts.Node | undefined, valor: string) => !!nodo && ts.isStringLiteralLike(nodo) && nodo.text === valor;
const tieneTimeZone = (nodo: ts.Node | undefined) =>
  !!nodo && ts.isObjectLiteralExpression(nodo) && nodo.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "timeZone");
const esIntlDateTimeFormat = (e: ts.Expression) =>
  ts.isPropertyAccessExpression(e) && e.name.text === "DateTimeFormat" && ts.isIdentifier(e.expression) && e.expression.text === "Intl";

/** El «en-CA» de una llamada que saca un `aaaa-mm-dd`, o `null` si la llamada no es de esas. */
function enCaDeFecha(nodo: ts.Node): ts.Expression | null {
  if (!ts.isCallExpression(nodo) && !ts.isNewExpression(nodo)) return null;
  const [idioma, opciones] = nodo.arguments ?? [];
  if (!esTexto(idioma, "en-CA")) return null;
  const quien = nodo.expression;
  if (esIntlDateTimeFormat(quien)) return idioma!;
  if (ts.isCallExpression(nodo) && ts.isPropertyAccessExpression(quien)) {
    if (quien.name.text === "toLocaleDateString") return idioma!;
    if (quien.name.text === "toLocaleString" && tieneTimeZone(opciones)) return idioma!;
  }
  return null;
}

/** Las líneas donde el archivo saca a mano el «aaaa-mm-dd» con en-CA. Un comentario o un texto no cuentan: se lee el árbol del
 *  código, no las letras. */
function diasAMano(ruta: string, fuente: string): number[] {
  if (!fuente.includes("en-CA")) return []; // el atajo barato: la mayoría ni lo menciona
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineas = fuente.split("\n");
  const halladas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    const idioma = enCaDeFecha(nodo);
    if (idioma) {
      const linea = archivo.getLineAndCharacterOfPosition(idioma.getStart(archivo)).line + 1;
      if (!EXIMIDA.test(lineas[linea - 1] ?? "")) halladas.push(linea);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return halladas;
}

describe("cómo se reconoce el día de Lima escrito a mano", () => {
  it("toLocaleDateString y Intl.DateTimeFormat en en-CA, con o sin new, y en varias líneas", () => {
    const fuente = [
      'const a = ahora.toLocaleDateString("en-CA", { timeZone: "America/Lima" });',
      'const b = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(x);',
      'const c = Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(x);',
      "const d = new Intl.DateTimeFormat(",
      '  "en-CA",',
      '  { timeZone: "America/Lima", year: "numeric" },',
      ");",
      'const e = x.toLocaleString("en-CA", { timeZone: "America/Lima" });',
      'const f = x.toLocaleDateString("en-CA");',
    ].join("\n");
    expect(diasAMano("a.ts", fuente)).toEqual([1, 2, 3, 5, 8, 9]);
  });

  it("los formatos de pantalla en es-PE, un número en en-CA o un en-CA sin fecha no cuentan", () => {
    const fuente = [
      'const a = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(x);',
      'const b = x.toLocaleDateString("es-PE", { timeZone: "America/Lima" });',
      'const c = monto.toLocaleString("en-CA");',
      'const d = new Intl.NumberFormat("en-CA").format(3);',
      'const e = hoyLima(new Date(ms));',
    ].join("\n");
    expect(diasAMano("b.ts", fuente)).toEqual([]);
  });

  it("un comentario o un texto que lo nombran no son una copia", () => {
    const fuente = `// x.toLocaleDateString("en-CA", { timeZone: "America/Lima" }) daba el día\nconst t = 'new Intl.DateTimeFormat("en-CA")';\nexport const C = () => <p title='x.toLocaleDateString("en-CA")'>{"en-CA"}</p>;`;
    expect(diasAMano("c.tsx", fuente)).toEqual([]);
  });

  it("se exime con «// dia-lima-a-mano:» y su porqué en la misma línea, nunca sin porqué", () => {
    const fuente = [
      'const a = x.toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // dia-lima-a-mano: espejo de un archivo que no importa',
      'const b = x.toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // dia-lima-a-mano: ok',
    ].join("\n");
    expect(diasAMano("d.ts", fuente)).toEqual([2]);
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

describe("el día de Lima se pide a fechas-lima, no se escribe a mano", () => {
  const porArchivo = new Map(
    ["app", "components", "lib"]
      .flatMap(fuentesBajo)
      .filter((ruta) => ruta !== CASA)
      .map((ruta) => [ruta, diasAMano(ruta, readFileSync(join(WEB, ruta), "utf8"))] as const)
      .filter(([, lineas]) => lineas.length > 0),
  );

  it("ningún archivo nuevo de app/, components/ o lib/", () => {
    const nuevos = [...porArchivo].filter(([ruta]) => !EXCEPCIONES[ruta]).flatMap(([ruta, lineas]) => lineas.map((l) => `${ruta}:${l}`));
    expect(
      nuevos,
      "Estas líneas sacan el «aaaa-mm-dd» de Lima a mano (en-CA). Pídelo a lib/fechas-lima.ts: `hoyLima(ahora?)` para hoy o un Date, " +
        "`diaLima(instante)` para un timestamptz (da null si no se lee) y `horaLima(instante)` para su hora. Si de verdad hace " +
        "falta el en-CA, escribe en esa línea `// dia-lima-a-mano: <por qué>`.",
    ).toEqual([]);
  });

  it("las excepciones del 2026-10-14 solo bajan", () => {
    for (const [ruta, { cuantas }] of Object.entries(EXCEPCIONES)) {
      const hoy = porArchivo.get(ruta)?.length ?? 0;
      expect(
        hoy,
        hoy > cuantas
          ? `${ruta} tiene una copia nueva del día de Lima escrita a mano: pídela a fechas-lima.`
          : `${ruta} ya no tiene ${cuantas === 1 ? "su copia" : "sus copias"} (o tiene menos): bájala en EXCEPCIONES, que solo baja.`,
      ).toBe(cuantas);
    }
  });
});
