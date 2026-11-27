// ============================================================================
// sin-punto-medio.test.ts — En el panel, ningún texto que se ve separa datos con «·» (ADR-0716)
// ============================================================================
// Felipe, 2026-11-24: el punto medio amontona datos distintos en una línea y no dice dónde termina uno y empieza el otro. El
// 2026-11-27 aprobó la regla de once casos para Retail y Dynamic: se separa con estructura (una frase con la palabra que une, la
// línea de datos, la cuenta dicha a la derecha, rótulo y valor, paréntesis, «a, b y c»…), nunca con otro signo. La tienda online
// ya tiene su freno (`apps/tienda/lib/sin-punto-medio.test.ts`); este es el del panel, y es hermano del de Dynamic
// (`tests/sin-punto-medio.test.ts` allá), con el mismo detector.
//
// Se limpia módulo por módulo, empezando por Movimientos como muestra. Por eso MODULOS es una lista que SOLO CRECE: el día que
// Felipe apruebe otro módulo se agregan sus rutas y la prueba lo vigila desde ese commit. Quitar una ruta es apagar el freno.
//
// Lo que mira es lo que el código DIBUJA o ESCRIBE: textos entre comillas, plantillas `…` y el texto suelto de JSX, leídos con el
// analizador de TypeScript (no con expresiones regulares). Los comentarios no cuentan: ahí el «·» no lo ve nadie. Si una línea de
// verdad necesita el signo (lee un dato que la base ya guarda así), se declara en esa línea o en la de arriba:
//     // punto-medio-permitido: <por qué>
// El motivo es obligatorio.
// ============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin, Palette, Ruler } from "lucide-react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CabeceraConCuenta, CuentaEnFrase } from "../components/ui/CabeceraConCuenta";
import { LineaDeDatos } from "../components/ui/LineaDeDatos";

const WEB = path.resolve(__dirname, "..");

/** Un módulo del menú y todo lo que dibuja: sus carpetas de pantalla y lo que solo él usa. */
type Modulo = { nombre: string; desde: string; rutas: readonly string[] };

// SOLO CRECE. Una carpeta cubre todo lo que tiene adentro. Las rutas son desde apps/web.
const MODULOS: readonly Modulo[] = [
  {
    nombre: "Movimientos (Movimientos, Ingresos y Pérdidas)",
    desde: "2026-11-27",
    rutas: [
      "app/(app)/movimientos",
      "app/(app)/inventario/movimientos",
      "components/movimientos",
      "components/ingresos",
      "components/perdidas",
      "components/FilaMovimiento.tsx",
      "components/CajonMovimiento.tsx",
      "components/MovimientosLista.tsx",
      "components/MovimientosVacio.tsx",
      "components/FiltrosMovimientos.tsx",
      "components/MenuMovimientos.tsx",
      "lib/movimientos-reglas.ts",
      "lib/movimientos-cajon.ts",
      "lib/movimientos-tipos.ts",
      "lib/movimientos-v2.ts",
      "lib/movimientos-saldo.ts",
      "lib/movimientos-atajos.ts",
      "lib/ingresos.ts",
      "lib/ingresos-reglas.ts",
      "lib/perdidas.ts",
      "lib/perdidas-reglas.ts",
      // La cabecera de TODAS las pantallas (la sede y el día): compartida, y su cambio vale igual en todas.
      "components/ui/EncabezadoPagina.tsx",
      "components/ui/FechaHoraLima.tsx",
      // Las piezas que reemplazan al «·» (ADR-0716).
      "components/ui/LineaDeDatos.tsx",
      "components/ui/CabeceraConCuenta.tsx",
      "lib/lista-dicha.ts",
      "lib/cuenta-en-frase.ts",
    ],
  },
];

const PUNTO_MEDIO = /·|\\u00b7|\\xb7|&middot;|&#183;|&#xb7;/i;
const PERMISO = /punto-medio-permitido:\s*(\S.*)?$/;

function archivosDe(ruta: string): string[] {
  const absoluta = path.join(WEB, ruta);
  if (!statSync(absoluta).isDirectory()) return [ruta];
  return readdirSync(absoluta, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === ".next") return [];
    const hija = `${ruta}/${e.name}`;
    if (e.isDirectory()) return archivosDe(hija);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [hija] : [];
  });
}

const TEXTOS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

/** Las líneas (desde 1) cuyo texto visible lleva un punto medio, sin las que lo declaran a propósito. */
function puntosVisibles(codigo: string, nombre = "x.tsx"): { linea: number; texto: string }[] {
  const fuente = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, nombre.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineas = codigo.split("\n");
  const halladas = new Set<number>();
  const visitar = (n: ts.Node) => {
    if (TEXTOS.has(n.kind)) {
      const m = PUNTO_MEDIO.exec(n.getText(fuente));
      if (m) halladas.add(fuente.getLineAndCharacterOfPosition(n.getStart(fuente) + m.index).line + 1);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  const permitida = (l: number) => [lineas[l - 1], lineas[l - 2] ?? ""].some((x) => PERMISO.test(x));
  return [...halladas]
    .sort((a, b) => a - b)
    .filter((l) => !permitida(l))
    .map((l) => ({ linea: l, texto: lineas[l - 1].trim() }));
}

describe("en el panel, ningún texto que se ve separa datos con «·» (ADR-0716)", () => {
  for (const m of MODULOS) {
    const archivos = [...new Set(m.rutas.flatMap(archivosDe))];

    it(`${m.nombre}: ninguna pantalla lo dibuja`, () => {
      const conPunto = archivos.flatMap((a) => puntosVisibles(readFileSync(path.join(WEB, a), "utf8"), a).map((p) => `${a}:${p.linea}  ${p.texto}`));
      expect(conPunto, "Separa con estructura (frase, línea de datos, paréntesis, «a, b y c»), nunca con «·» ni con otro signo. Ver docs/adr/0716.").toEqual([]);
    });

    it(`${m.nombre}: todo lo que vigila existe (renombrar una carpeta no puede apagar el freno en silencio)`, () => {
      for (const r of m.rutas) expect(existsSync(path.join(WEB, r)), r).toBe(true);
      expect(archivos.length).toBeGreaterThan(m.rutas.length);
    });

    it(`${m.nombre}: cada excepción dice por qué`, () => {
      const sinMotivo = archivos.flatMap((a) =>
        readFileSync(path.join(WEB, a), "utf8")
          .split("\n")
          .flatMap((l, i) => {
            const p = PERMISO.exec(l);
            return p && !p[1] ? [`${a}:${i + 1}`] : [];
          }),
      );
      expect(sinMotivo).toEqual([]);
    });
  }

  // Un freno se prueba con lo que DEBE frenar, no solo con lo que debe dejar pasar.
  it("el detector caza el punto en JSX, en comillas, en plantillas y escrito como entidad o escape", () => {
    const codigo = [
      "const a = <p>{nombre} · {sede}</p>;",
      'const b = "Ajuste a mano · merma";',
      "const c = `${x} · ${y}`;",
      "const d = <p>Hora &middot; 9:00</p>;",
      'const e = "a\\u00b7b";',
      'const f = <TarjetaCifra etiqueta="Se repite · últimos 30 días" />;',
    ].join("\n");
    expect(puntosVisibles(codigo).map((p) => p.linea)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("y deja pasar los comentarios y las líneas declaradas con su motivo", () => {
    const codigo = [
      "// «Hoy · lunes 9»: así se veía antes",
      "/* a · b */",
      "const a = <p>{/* nombre · sede */}{nombre}</p>;",
      "// punto-medio-permitido: la base guarda «tipo · error» y aquí solo se lee",
      'const b = valor.split(" · ")[0];',
      'const c = "sin punto";',
    ].join("\n");
    expect(puntosVisibles(codigo)).toEqual([]);
  });
});

// Las piezas de la regla (ADR-0716, casos 2 y 3): cómo suenan para un lector de pantalla y que no dibujen el signo.
describe("las piezas que reemplazan al «·»", () => {
  it("la línea de datos pone cada dato en su pieza, sin signo, con el ícono mudo y el rótulo solo para el lector", () => {
    const html = renderToStaticMarkup(
      createElement(LineaDeDatos, {
        datos: [
          { icono: Ruler, rotulo: "Talla", valor: "M" },
          { icono: Palette, rotulo: "Color", valor: "Azul & crudo" },
          null,
          false,
          { icono: MapPin, rotulo: "Dónde", valor: "  " },
        ],
      }),
    );
    expect(html).not.toMatch(PUNTO_MEDIO);
    expect(html.match(/<svg/g)).toHaveLength(2); // lo vacío, el null y el false no se dibujan
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('<span class="sr-only">Talla: </span><span class="truncate">M</span>');
    expect(html).toContain('<span class="sr-only">Color: </span><span class="truncate">Azul &amp; crudo</span>');
    expect(html).not.toMatch(/stroke-width="(?!2")/); // el grosor de fábrica de lucide («Los íconos», unificar.md)
  });

  it("sin datos no dibuja nada", () => {
    expect(renderToStaticMarkup(createElement(LineaDeDatos, { datos: [null, { icono: MapPin, rotulo: "Dónde", valor: "" }] }))).toBe("");
  });

  it("la cabecera con cuenta es el título de sección con la cuenta dicha a su derecha y lo urgente en rojo profundo", () => {
    const html = renderToStaticMarkup(
      createElement(CabeceraConCuenta, {
        codigo: "AQP",
        cuenta: { total: 7, urgentes: 7, que: { singular: "caso", plural: "casos", genero: "m" }, comoEsUrgente: "de prioridad alta" },
        children: "Tienda Arequipa",
      }),
    );
    expect(html).not.toMatch(PUNTO_MEDIO);
    expect(html).toContain('class="titulo-seccion ');
    expect(html).toMatch(/<h3[^>]*>Tienda Arequipa<span[^>]*>AQP<\/span><\/h3>/);
    expect(html).toContain('<span class="titulo-seccion-dato"><span class="tabular-nums" title="7 casos, todos de prioridad alta">7 casos, <span class="font-semibold text-rojo-profundo">todos de prioridad alta</span></span></span>');
  });

  it("sin nada urgente, la cuenta va sola y sin rojo", () => {
    const html = renderToStaticMarkup(createElement(CuentaEnFrase, { total: 1, urgentes: 0, que: { singular: "prenda", plural: "prendas", genero: "f" }, comoEsUrgente: "por explicar" }));
    expect(html).toBe('<span class="tabular-nums" title="1 prenda">1 prenda</span>');
  });
});
