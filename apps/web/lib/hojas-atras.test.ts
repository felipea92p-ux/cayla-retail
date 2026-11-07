import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conservaMarca, cualesPoner, cuantasRetirar, decidirAlVolver, type HojaEnPila } from "./hojas-atras";

// «Atrás» cierra la hoja de arriba en el teléfono (ADR-0528). La primera mitad prueba las decisiones de la pila; la segunda es el
// candado: toda hoja del ERP (`<Dialog.Content>`, hoy solo `<Modal>` y `<Cajon>`) entra a la pila, y solo `<ModalRuta>` se sale.
//
// Contrato (3 líneas). PROMETE: que un «atrás» cierra solo la hoja de arriba, que las entradas de hojas cerradas se retiran de a
// todas juntas y que ninguna hoja nueva nace sin «atrás». ASUME: las hojas usan `Dialog` de Radix con ese nombre. NO PROMETE: lo que
// hace el navegador con el historial; eso se prueba a 375 px con `history.back()` (la entrada del ADR dice cómo).

const prenda: HojaEnPila = { id: "prenda", pagina: "/inventario/existencias" };
const foto: HojaEnPila = { id: "foto", pagina: "/inventario/existencias" };

describe("decidirAlVolver", () => {
  const base = { pagina: "/inventario/existencias", paginaAntes: "/inventario/existencias" };

  it("salir de la entrada de la única hoja la cierra", () => {
    expect(decidirAlVolver({ ...base, marca: null, arriba: prenda, abiertas: ["prenda"] })).toBe("cerrar");
  });

  it("con dos hojas, un «atrás» es de la de arriba (se llega a la entrada de la de abajo)", () => {
    expect(decidirAlVolver({ ...base, marca: "prenda", arriba: foto, abiertas: ["prenda", "foto"] })).toBe("cerrar");
  });

  it("volver a la entrada de la hoja de arriba (desde una página abierta encima) no cierra nada", () => {
    expect(decidirAlVolver({ ...base, paginaAntes: "/catalogo/productos/7", marca: "foto", arriba: foto, abiertas: ["prenda", "foto"] })).toBe("nada");
  });

  it("ir a otra pantalla con la hoja abierta no es un «atrás» sobre ella", () => {
    expect(decidirAlVolver({ ...base, pagina: "/ventas", marca: null, arriba: prenda, abiertas: ["prenda"] })).toBe("nada");
  });

  it("sin hojas, una entrada sin marca es la pantalla: el router sigue", () => {
    expect(decidirAlVolver({ ...base, marca: null, arriba: null, abiertas: [] })).toBe("nada");
  });

  it("volver desde otra pantalla a una entrada huérfana la salta", () => {
    expect(decidirAlVolver({ ...base, paginaAntes: "/catalogo/productos", marca: "prenda", arriba: null, abiertas: [] })).toBe("saltar");
  });

  it("una huérfana en la misma pantalla (con «adelante», tras recargar) se deja", () => {
    expect(decidirAlVolver({ ...base, marca: "prenda", arriba: null, abiertas: [] })).toBe("nada");
  });
});

describe("cuantasRetirar", () => {
  it("sin entradas, ninguna", () => expect(cuantasRetirar([], [])).toBe(0));
  it("la de arriba sigue abierta: ninguna", () => expect(cuantasRetirar(["prenda", "foto"], ["prenda", "foto"])).toBe(0));
  it("cerró la de arriba: una", () => expect(cuantasRetirar(["prenda", "foto"], ["prenda"])).toBe(1));
  it("cerraron las dos (salir sin guardar cierra la pregunta y la hoja): las dos de un solo «atrás»", () =>
    expect(cuantasRetirar(["prenda", "pregunta"], [])).toBe(2));
  it("una cerrada debajo de una abierta espera a que la de arriba se vaya", () => expect(cuantasRetirar(["prenda", "foto"], ["foto"])).toBe(0));
});

describe("cualesPoner", () => {
  it("las abiertas sin entrada, en el orden de la pila", () => {
    expect(cualesPoner([prenda, foto], [], prenda.pagina).map((h) => h.id)).toEqual(["prenda", "foto"]);
    expect(cualesPoner([prenda, foto], ["prenda"], prenda.pagina).map((h) => h.id)).toEqual(["foto"]);
  });
  it("no pone la entrada de una hoja sobre otra pantalla", () => {
    expect(cualesPoner([prenda], [], "/ventas")).toEqual([]);
  });
});

describe("conservaMarca", () => {
  it("un refresco o un filtro de la misma pantalla la conserva", () => expect(conservaMarca("/inventario/existencias", "/inventario/existencias")).toBe(true));
  it("un reemplazo hacia otra pantalla no la lleva", () => expect(conservaMarca("/inventario/existencias", "/ventas")).toBe(false));
});

const RAICES = ["components", "app"];
const ARCHIVOS = RAICES.flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
});
const HOJAS = ARCHIVOS.filter(({ fuente }) => fuente.includes("<Dialog.Content"));

describe("toda hoja cierra con «atrás» en el teléfono", () => {
  it("encuentra las hojas (no mira una carpeta vacía)", () => {
    expect(HOJAS.map((h) => h.ruta)).toEqual(expect.arrayContaining(["components/ui/Modal.tsx", "components/ui/Cajon.tsx"]));
  });

  it.each(HOJAS.map((h) => [h.ruta, h.fuente] as const))("%s entra a la pila de «atrás»", (ruta, fuente) => {
    expect(fuente, `${ruta}: una hoja nueva cierra con «atrás» como todas (useAtrasCierraLaHoja, ADR-0528)`).toContain("useAtrasCierraLaHoja(");
    // Sale de la pila apenas empieza a cerrarse: si no, su entrada se retiraría tarde y el próximo «atrás» se perdería.
    expect(fuente, `${ruta}: deja la pila al cerrarse`).toMatch(/useAtrasCierraLaHoja\(\s*conAtras && !cerrando/);
  });

  it("solo <ModalRuta> la apaga (ya cierra con el «atrás» de la navegación)", () => {
    const apagan = ARCHIVOS.filter(({ fuente }) => /atrasCierra=\{false\}/.test(fuente)).map((a) => a.ruta);
    expect(apagan).toEqual(["components/ui/ModalRuta.tsx"]);
  });
});
