import { describe, expect, it } from "vitest";
import { puedeSoltar, reservaNecesaria } from "./pagina-estable-reglas";

// Página de 2000 px, se ven 800: abajo del todo el scroll vale 1200.
const alFondo = { arriba: 1200, alto: 2000, visible: 800 };

describe("reservaNecesaria", () => {
  it("reserva lo que el navegador recortó cuando la página se acorta estando al fondo", () => {
    // Un bloque de 150 px desaparece: el nuevo final obliga a subir 150.
    expect(reservaNecesaria(alFondo, { arriba: 1050, alto: 1850, visible: 800 })).toBe(150);
  });

  it("solo reserva lo recortado, no todo lo que se acortó, si la vista no estaba al fondo", () => {
    // Estaba 100 px por encima del final; se van 150: el navegador solo recorta 50.
    const casiAlFondo = { arriba: 1100, alto: 2000, visible: 800 };
    expect(reservaNecesaria(casiAlFondo, { arriba: 1050, alto: 1850, visible: 800 })).toBe(50);
  });

  it("no hace nada si la página se acortó pero la vista no se movió (había aire abajo)", () => {
    const arriba = { arriba: 300, alto: 2000, visible: 800 };
    expect(reservaNecesaria(arriba, { arriba: 300, alto: 1850, visible: 800 })).toBe(0);
  });

  it("no hace nada si la página creció", () => {
    expect(reservaNecesaria(alFondo, { arriba: 1200, alto: 2100, visible: 800 })).toBe(0);
  });

  it("respeta un scroll pedido por el código (volver arriba, ir a un campo con error)", () => {
    // Subió y además se acortó, pero la vista no quedó pegada al final: no fue un recorte.
    expect(reservaNecesaria(alFondo, { arriba: 0, alto: 1850, visible: 800 })).toBe(0);
    expect(reservaNecesaria(alFondo, { arriba: 600, alto: 1850, visible: 800 })).toBe(0);
  });
});

describe("puedeSoltar", () => {
  it("no suelta mientras el aire reservado se ve", () => {
    // Con 150 reservados y la vista al fondo, el aire está en pantalla.
    expect(puedeSoltar({ arriba: 1200, alto: 2000, visible: 800 }, 150)).toBe(false);
  });

  it("suelta cuando la persona subió lo suficiente para que el aire quede fuera de la vista", () => {
    expect(puedeSoltar({ arriba: 1050, alto: 2000, visible: 800 }, 150)).toBe(true);
    expect(puedeSoltar({ arriba: 400, alto: 2000, visible: 800 }, 150)).toBe(true);
  });
});
