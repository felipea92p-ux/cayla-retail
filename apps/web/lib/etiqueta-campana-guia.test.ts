import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import { campanaValida, camposDeCampana, type EntradaCampana } from "./etiqueta-campana-guia";

const base: EntradaCampana = { descuento: "", desde: "", hasta: "", categorias: 0, puedeDarDescuento: true };

describe("guía de la campaña de una etiqueta", () => {
  it("una campaña vacía es válida y nada «sigue»: todo es opcional", () => {
    const campos = camposDeCampana(base);
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(Object.values(estadosDe(campos))).toEqual(["opcional", "opcional", "opcional"]);
  });

  it("un descuento mal escrito es lo que sigue; bien escrito lleva ✓", () => {
    expect(estadosDe(camposDeCampana({ ...base, descuento: "abc" })).descuento).toBe("ahora");
    expect(estadosDe(camposDeCampana({ ...base, descuento: "20" })).descuento).toBe("hecho");
  });

  it("fechas al revés bloquean; en orden llevan ✓", () => {
    expect(estadosDe(camposDeCampana({ ...base, desde: "2026-10-10", hasta: "2026-10-01" })).vigencia).toBe("ahora");
    expect(estadosDe(camposDeCampana({ ...base, desde: "2026-10-01", hasta: "2026-10-10" })).vigencia).toBe("hecho");
  });

  it("sin permiso para dar descuento, el campo no entra en la guía", () => {
    expect(camposDeCampana({ ...base, puedeDarDescuento: false }).map((c) => c.id)).toEqual(["vigencia", "categorias"]);
  });

  // La coherencia que importa: «se puede guardar» según la guía ⇔ la regla real de CampanaModal (`valido`).
  it("coincide con la validación real en cada combinación", () => {
    const descuentos = ["", "20", "12,5", "20 %", "0", "101", "abc", "%"];
    const fechas = ["", "2026-10-01", "2026-10-10", "2026-02-31", "2026-13-01", "mañana"];
    for (const descuento of descuentos)
      for (const desde of fechas)
        for (const hasta of fechas) {
          const e = { ...base, descuento, desde, hasta };
          expect(sePuedeConfirmar(camposDeCampana(e)), JSON.stringify(e)).toBe(campanaValida(e));
        }
  });
});
