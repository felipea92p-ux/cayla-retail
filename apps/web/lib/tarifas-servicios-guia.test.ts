import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeTarifa } from "./tarifas-servicios-guia";
import { problemasDeTarifa, type EntradaDeTarifa } from "./tarifas-servicios-reglas";

// La guía de la hoja «Tarifa» dice lo mismo que la base: se puede guardar exactamente cuando `problemasDeTarifa` no encuentra nada y alguien firma.

const base: EntradaDeTarifa = { proveedorId: "p1", fase: "costura", tarifa: "4.50", minimo: "", fijo: "", nota: "" };

describe("la guía de la hoja de tarifas", () => {
  const casos: [string, Partial<EntradaDeTarifa>][] = [
    ["completa", {}],
    ["sin servicio", { proveedorId: "" }],
    ["sin fase", { fase: "" }],
    ["sin monto", { tarifa: "" }],
    ["monto en cero", { tarifa: "0" }],
    ["mínimo bueno", { minimo: "50" }],
    ["mínimo en cero", { minimo: "0" }],
    ["mínimo decimal", { minimo: "1.5" }],
    ["fijo bueno", { fijo: "12.5" }],
    ["fijo roto", { fijo: "x" }],
    ["todo vacío", { proveedorId: "", fase: "", tarifa: "" }],
  ];

  for (const [nombre, cambio] of casos) {
    for (const firma of [true, false]) {
      it(`${nombre}${firma ? "" : " · sin responsable"}: el botón se enciende justo cuando la base lo aceptaría`, () => {
        const e = { ...base, ...cambio };
        expect(sePuedeConfirmar(camposDeTarifa(e, firma))).toBe(problemasDeTarifa(e).length === 0 && firma);
      });
    }
  }

  it("lo opcional no se lista como «falta» mientras esté vacío, y marca ✓ cuando se escribió bien", () => {
    const vacio = camposDeTarifa(base, true);
    expect(faltanDe(vacio)).toEqual([]);
    expect(estadosDe(vacio)).toMatchObject({ minimo: "opcional", fijo: "opcional" });
    expect(estadosDe(camposDeTarifa({ ...base, minimo: "50", fijo: "10" }, true))).toMatchObject({ minimo: "hecho", fijo: "hecho" });
  });

  it("lo que sigue es el primero que falta, en el orden de la hoja", () => {
    expect(estadosDe(camposDeTarifa({ ...base, proveedorId: "", tarifa: "" }, false))).toMatchObject({ servicio: "ahora", fase: "hecho", tarifa: "falta", quien: "falta" });
  });
});
