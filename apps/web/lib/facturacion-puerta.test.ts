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
// 2) Los dos modales viven en el shell, una vez cada uno y sin condicional sobre su apertura:
//    el token de idempotencia de «Emitir» es un `useRef` del modal y tiene que vivir tanto como
//    el shell. Un `{modal === "emitir" && <EmitirComprobanteModal … />}` —o una segunda instancia
//    en cualquier otro componente, un panel o una vista nueva— daría un token nuevo por apertura
//    y quemaría un correlativo si se corta la red entre dos intentos.

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

/** ¿La etiqueta del modal va detrás de una condición sobre su estado (`modal … &&`, `abierto ? …`)?
 *  Eso lo montaría y desmontaría en cada apertura. Se mira lo que hay ANTES de la etiqueta: el
 *  `abierto={modal === "emitir"}` que la acompaña, ya dentro de la etiqueta, es lo correcto. */
function condicionadoAlEstado(fuente: string, modal: string): boolean {
  return new RegExp(`(\\bmodal\\b|\\babierto\\b)[^{}<]*?(&&|\\?)\\s*<${modal}\\b`).test(fuente);
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

describe("Facturación — los modales viven una sola vez, en el shell", () => {
  const archivos = archivosBajo(COMPONENTES, (n) => n.endsWith(".tsx")).map((ruta) => ({
    nombre: ruta.slice(COMPONENTES.length + 1).replace(/\\/g, "/"),
    fuente: readFileSync(ruta, "utf8"),
  }));
  const shell = archivos.find((a) => a.nombre === "FacturacionShell.tsx")?.fuente ?? "";

  it("encuentra el shell y los componentes (que el candado no mire el vacío)", () => {
    expect(shell).not.toBe("");
    expect(archivos.length).toBeGreaterThan(20);
  });

  for (const modal of ["EmitirComprobanteModal", "NuevaProformaModal"]) {
    it(`<${modal}> se dibuja en un solo lugar de toda la app: el shell, una vez`, () => {
      const enQueArchivos = archivos.filter((a) => new RegExp(`<${modal}\\b`).test(a.fuente)).map((a) => a.nombre);
      expect(enQueArchivos).toEqual(["FacturacionShell.tsx"]);
      expect(shell.match(new RegExp(`<${modal}\\b`, "g"))).toHaveLength(1);
    });

    it(`<${modal}> no depende de una condición sobre su apertura`, () => {
      expect(condicionadoAlEstado(shell, modal)).toBe(false);
    });
  }

  it("el detector sí ve un modal condicionado a su apertura, en cualquiera de sus formas", () => {
    const modal = "EmitirComprobanteModal";
    for (const malo of [
      `{modal === "emitir" && <${modal} />}`,
      `{modal && <${modal} />}`,
      `{modal !== null && <${modal} />}`,
      `{abierto ? <${modal} /> : null}`,
    ]) {
      expect(condicionadoAlEstado(malo, modal)).toBe(true);
    }
    expect(condicionadoAlEstado(`{series && tiendas && <${modal} abierto={modal === "emitir"} />}`, modal)).toBe(false);
  });
});
