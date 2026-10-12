import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de «la sugerencia nunca elige por nadie» (ADR-0328 act. 5, rescate de #788 sobre la mesa de ADR-0360; revisión adversarial de
// #975). Dos pantallas SUGIEREN y la persona decide:
//   · la mesa de Ventas sin registrar marca «Sugerida» la respuesta de «¿Cómo estaba?» que deduce el libro (`lib/por-regularizar-
//     deduccion.ts`), sin elegirla: contestar mal descuenta dos veces o deja una prenda fantasma, y la deducción puede fallar (una carga
//     contada en papel y registrada días después);
//   · «Prenda sin registrar» de Vender dice «Escribiste «Jean»: ¿no será Jeans? · Cambiar a Jeans» y solo cambia la categoría al tocar.
// La lógica pura tiene sus pruebas; lo que ninguna veía es el CABLEADO: una mesa que eligiera sola la forma deducida, un modal que
// aplicara solo la categoría, o una sugerencia desconectada, dejaban la suite entera en verde (cuatro mutantes sobrevivían).
//
// Contrato (3 líneas). PROMETE: que la forma y la categoría solo cambian por un toque de la persona, que la sugerencia llega de la página
// a la mesa y del texto escrito al modal, y que los avisos «antes del botón» no cambian cuándo se puede regularizar. ASUME: los nombres de
// hoy (`setForma`, `onForma`, `categoriaSugerida`, `puedeGuardar`); si se renombran, esta prueba falla y se actualiza a propósito.
// NO PROMETE: que se vea bien; eso se prueba en el navegador.

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const MESA = leer("components/por-regularizar/MesaRegularizar.tsx");
const PUENTE = leer("components/por-regularizar/PuenteUnion.tsx");
const LISTA = leer("components/PorRegularizarLista.tsx");
const PAGINA = leer("app/(app)/inventario/por-regularizar/page.tsx");
const MODAL = leer("components/PrendaSinRegistrarModal.tsx");

const veces = (texto: string, trozo: string) => texto.split(trozo).length - 1;

/** El cuerpo de `function nombre(…) { … }`, hasta la llave que la cierra a su misma sangría. */
function cuerpoDe(fuente: string, nombre: string): string {
  const i = fuente.indexOf(`function ${nombre}(`);
  if (i < 0) return "";
  const sangria = fuente.slice(fuente.lastIndexOf("\n", i) + 1, i);
  const fin = fuente.indexOf(`\n${sangria}}`, i);
  return fin < 0 ? "" : fuente.slice(i, fin);
}

describe("la mesa: «¿Cómo estaba?» se SUGIERE, nunca se elige sola", () => {
  it("la forma solo se vacía o la elige la persona: todo `setForma(…)` es `null` o el `f` que tocó en `elegirForma`", () => {
    const llamadas = [...MESA.matchAll(/setForma\(([^)]*)\)/g)].map((m) => m[1]);
    expect(llamadas.length, "la mesa todavía guarda la forma con setForma").toBeGreaterThan(0);
    for (const arg of llamadas) expect(["null", "f"], `setForma(${arg}): la forma no sale de la deducción`).toContain(arg);
    expect(veces(MESA, "setForma(f)")).toBe(1);
    expect(cuerpoDe(MESA, "elegirForma")).toContain("setForma(f)");
  });

  it("la deducción llega al puente solo para mostrarse", () => {
    expect(MESA).toContain("const deducida = deduccionPara(libro, sel, prenda?.id ?? null);");
    expect(MESA).toContain("deducida={deducida}");
  });

  it("en el puente, el botón queda apretado solo por lo que eligió la persona, y elegir es solo un toque", () => {
    expect(PUENTE).toContain("aria-pressed={forma === f}");
    expect(PUENTE).not.toMatch(/aria-pressed=\{[^}]*deducida/);
    expect(veces(PUENTE, "onForma("), "onForma se llama en un solo lugar").toBe(1);
    expect(PUENTE).toContain("onClick={() => onForma(f)}");
  });

  it("los avisos de antes del botón (prenda sin cargar, venta propia) solo avisan: no cambian cuándo se puede regularizar", () => {
    expect(PUENTE).toContain("const puedeGuardar = Boolean(prenda && forma && responsable.listo && !guardando && !hecho);");
    expect(MESA).toContain("notaStock={notaStock}");
    expect(MESA).toContain("propiaVenta={propiaVenta}");
  });

  it("el libro viaja de la página a la mesa (desconectarlo dejaría la mesa sin sugerencia sin que nada avise)", () => {
    expect(PAGINA).toMatch(/getLibroPorVenta\(/);
    expect(PAGINA).toContain("libro={libro}");
    expect(LISTA).toContain("libro={libro}");
    expect(MESA).toMatch(/\blibro = null,/);
  });
});

describe("Vender: «¿no será Jeans?» se SUGIERE, la categoría cambia solo al tocar", () => {
  it("la categoría sugerida solo se usa para el `key` y dentro de un clic", () => {
    const lineas = MODAL.split("\n").filter((l) => l.includes("categoriaSugerida.categoriaId"));
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) {
      const permitida = l.includes("key={categoriaSugerida.categoriaId}") || /onClick=\{\(\) => \w+\(categoriaSugerida\.categoriaId\)\}/.test(l);
      expect(permitida, `fuera de un clic: ${l.trim()}`).toBe(true);
    }
  });

  it("la sugerencia sale de lo escrito y se muestra bajo la descripción", () => {
    expect(MODAL).toMatch(/const categoriaSugerida = sugerenciaParaMostrar\(descripcionEscrita, categoriaId, listas\.categorias/);
    expect(MODAL).toContain("const pieCategoria = categoriaSugerida ? (");
    expect(MODAL).toContain("{pieCategoria}");
    expect(MODAL).toContain("pie={pieDescripcion}");
  });
});
