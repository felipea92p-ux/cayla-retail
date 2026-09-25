import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de Facturación (ADR-0124). Dos invariantes que hasta hoy solo sostenía la lectura
// de código, y que la próxima página o el próximo retoque rompen sin ningún error a la vista
// (mismo espíritu que `globals-capas.test.ts`: leer los fuentes y fallar si dejan de cumplirse).
//
// 1) Puerta. Un layout no se vuelve a ejecutar cuando se navega entre sus hijas, así que cada
//    `page.tsx` repite su puerta como LO PRIMERO que espera (antes de leer nada). Desde ADR-0160 son
//    dos puertas: las cuatro vistas y el layout las abre el permiso `facturar` (`exigirPermiso("facturar")`:
//    el líder y la terminal de ventas) y «Códigos de descuento» sigue siendo SOLO del líder (`exigirLider()`).
// 2) El shell no dibuja modales (2026-09-22): «Emitir comprobante» se quitó y «Nueva proforma» vive en
//    la pestaña Proformas, la única que lee el catálogo que el modal necesita.

const RAIZ = join(__dirname, "../app/(app)/vender/comprobantes");
const COMPONENTES = join(__dirname, "../components");

function archivosBajo(dir: string, coincide: (nombre: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosBajo(ruta, coincide);
    return coincide(e.name) ? [ruta] : [];
  });
}

/** Lo primero que espera la función exportada por defecto, sin contar comentarios: el nombre y, si
 *  lo llama, «()» — `exigirLider()`. Se toma cualquier expresión, no solo llamadas: `await
 *  searchParams` antes de la puerta también es leer antes de comprobar quién es, y `await
 *  exigirLider;` (sin llamarla) no comprueba nada. `null` si no espera nada. */
function primerAwait(fuente: string): string | null {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const inicio = sinComentarios.indexOf("export default async function");
  if (inicio < 0) return null;
  const encontrado = sinComentarios.slice(inicio).match(/await\s*\(?\s*([\w.]+)(\s*\()?/);
  return encontrado ? `${encontrado[1]}${encontrado[2] ? "()" : ""}` : null;
}

// Lo que sería solo del líder dentro de Comprobantes. Desde que salió «Códigos de descuento»
// (2026-09-22) no queda ninguna vista así: todas abren con `facturar`.
const SOLO_LIDER: string[] = [];

describe("Facturación — puerta (líder o terminal de ventas)", () => {
  const rutas = archivosBajo(RAIZ, (n) => n === "page.tsx" || n === "layout.tsx");

  it("encuentra el layout y las tres vistas (que el candado no mire el vacío)", () => {
    expect(rutas.length).toBeGreaterThanOrEqual(4);
  });

  for (const ruta of rutas) {
    const nombre = ruta.slice(RAIZ.length).replace(/\\/g, "/");
    it(`${nombre} espera su puerta antes que cualquier otra cosa`, () => {
      const fuente = readFileSync(ruta, "utf8");
      if (SOLO_LIDER.includes(nombre)) {
        expect(primerAwait(fuente)).toBe("exigirLider()");
      } else {
        expect(primerAwait(fuente)).toBe("exigirPermiso()");
        // Exactamente `facturar`: un permiso más débil abriría Facturación a quien no debe.
        expect(fuente).toMatch(/exigirPermiso\(\s*"facturar"\s*\)/);
      }
    });
  }

  it("el detector sí distingue una página sin la puerta, con la puerta tarde o sin llamarla", () => {
    const pagina = (cuerpo: string) => `export default async function P({ searchParams }) { ${cuerpo} }`;
    expect(primerAwait(pagina("await exigirLider(); await leer();"))).toBe("exigirLider()");
    expect(primerAwait(pagina('await exigirPermiso("facturar"); await leer();'))).toBe("exigirPermiso()");
    expect(primerAwait(pagina("const x = await leer(); await exigirLider();"))).toBe("leer()");
    expect(primerAwait(pagina("const { m } = await searchParams; await exigirLider();"))).toBe("searchParams");
    expect(primerAwait(pagina("await exigirLider; await leer();"))).toBe("exigirLider");
    expect(primerAwait(pagina("await (leer()); await exigirLider();"))).toBe("leer()");
    expect(primerAwait(pagina("// await exigirLider()\n const x = await leer(); await exigirLider();"))).toBe("leer()");
    expect(primerAwait(pagina("/* await exigirLider() */ await exigirLider();"))).toBe("exigirLider()");
    expect(primerAwait("export default function P() { return null; }")).toBeNull();
  });
});

describe("Facturación — el shell ya no dibuja modales", () => {
  const shell = readFileSync(join(COMPONENTES, "FacturacionShell.tsx"), "utf8");

  it("encuentra el shell (que el candado no mire el vacío)", () => {
    expect(shell).not.toBe("");
  });

  it("ni «Nueva proforma» ni «Emitir comprobante» se montan en el shell: la primera vive en su pestaña (necesita el catálogo) y la segunda se quitó", () => {
    expect(shell).not.toMatch(/<NuevaProformaModal\b|<EmitirComprobanteModal\b/);
  });
});
