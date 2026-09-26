import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmacionCatalogo } from "./confirmar-catalogo";

describe("confirmacionCatalogo — la ventana de los botones de un clic del Catálogo", () => {
  it("pregunta por el nombre y el botón repite la acción", async () => {
    let hecho = false;
    const c = confirmacionCatalogo("desactivar", "Lino", async () => {
      hecho = true;
    });
    expect(c.titulo).toBe("¿Desactivar «Lino»?");
    expect(c.verbo).toBe("Desactivar");
    expect(c.bajada).toMatch(/Las prendas que ya existen no cambian/);
    await c.accion();
    expect(hecho).toBe(true);
    expect(confirmacionCatalogo("aprobar", "Seda", async () => {}).titulo).toBe("¿Aprobar «Seda»?");
    expect(confirmacionCatalogo("reactivar", "Denim", async () => {}).verbo).toBe("Reactivar");
  });
  it("eliminar avisa que no se deshace y ofrece desactivar como salida", () => {
    const c = confirmacionCatalogo("eliminar", "Cayla 2", async () => {});
    expect(c.titulo).toBe("¿Eliminar «Cayla 2»?");
    expect(c.verbo).toBe("Eliminar");
    expect(c.bajada).toMatch(/no se puede deshacer/);
    expect(c.bajada).toMatch(/desactívala/);
  });
  it("una bajada propia reemplaza a la de siempre", () => {
    expect(confirmacionCatalogo("reactivar", "X", async () => {}, "Otra cosa.").bajada).toBe("Otra cosa.");
  });
});

// Felipe, 2026-09-23: en Catálogo el combo «Responsable» no va arriba de la lista; sale dentro de cada ventana y los
// botones de un clic abren `ConfirmarConResponsable`. Si una lista vuelve a poner un combo suelto, esto avisa.
describe("las 8 listas del Catálogo no llevan combo arriba", () => {
  const LISTAS = ["Categorias", "Familias", "Colores", "Tallas", "Tejidos", "Patrones", "Etiquetas", "Marcas"];
  for (const nombre of LISTAS) {
    const fuente = readFileSync(new URL(`../components/${nombre}Lista.tsx`, import.meta.url), "utf8");
    it(`${nombre}Lista confirma con el combo adentro y no tiene combo flotante`, () => {
      expect(fuente).toContain("<ConfirmarConResponsable");
      expect(fuente).not.toMatch(/<ComboResponsable[^>]*hacia="abajo"/);
      // Ningún botón de una tarjeta (la fila de la lista: `t`, `c`, `m`…) guarda directo: pasa por
      // `setConfirmando(confirmacionCatalogo(...))`. Los de una ventana propia (`aprobar(aprobandoTalla)`) ya tienen su combo.
      expect(fuente).not.toMatch(/onClick=\{\(\) => (void )?(aprobar|desactivar|reactivar|cambiarEstado)\([a-z]\)\}/);
    });
  }
});
