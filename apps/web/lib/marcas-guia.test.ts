import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeEdicionMarca } from "./marcas-guia";
import { problemaEdicionMarca, type BorradorMarca, type ParejaDeMarca } from "./marcas";

const actuales: ParejaDeMarca[] = [
  { id: "p1", nombre: "Textil Sol", productosTotal: 0 },
  { id: "p2", nombre: "Hilos Andes", productosTotal: 3 },
];
const limpio: BorradorMarca = { nombre: "Nube", quitar: [], sumar: [], nuevos: [] };

describe("guía de «Editar marca»", () => {
  it("una marca sin tocar llega con todo hecho salvo quién firma, que es lo que sigue", () => {
    const e = estadosDe(camposDeEdicionMarca(actuales, limpio, false));
    expect(e).toEqual({ nombre: "hecho", proveedores: "hecho", responsable: "ahora" });
  });

  it("sin nombre, el nombre es lo que sigue", () => {
    expect(estadosDe(camposDeEdicionMarca(actuales, { ...limpio, nombre: "  " }, true)).nombre).toBe("ahora");
  });

  it("quitar al último proveedor deja «¿Quién la trae?» por corregir, con la frase de la regla real", () => {
    const b = { ...limpio, quitar: ["p1"] };
    const una: ParejaDeMarca[] = [actuales[0]];
    const campos = camposDeEdicionMarca(una, b, true);
    expect(estadosDe(campos).proveedores).toBe("ahora");
    expect(campos.find((c) => c.id === "proveedores")?.pendiente).toBe(problemaEdicionMarca(una, b));
  });

  it("un proveedor nuevo con RUC incompleto bloquea; sin RUC no", () => {
    expect(sePuedeConfirmar(camposDeEdicionMarca(actuales, { ...limpio, nuevos: [{ nombre: "Nuevo SAC", ruc: "123" }] }, true))).toBe(false);
    expect(sePuedeConfirmar(camposDeEdicionMarca(actuales, { ...limpio, nuevos: [{ nombre: "Nuevo SAC", ruc: "" }] }, true))).toBe(true);
  });

  // La coherencia que importa: «se puede guardar» según la guía ⇔ la regla real (sin contar quién firma).
  it("coincide con problemaEdicionMarca en cada combinación", () => {
    const nombres = ["Nube", " ", ""];
    const quitares = [[], ["p1"], ["p2"], ["p1", "p2"]];
    const sumares = [[], ["p9"]];
    const nuevos = [[], [{ nombre: "", ruc: "" }], [{ nombre: "Nuevo", ruc: "12345678901" }], [{ nombre: "Nuevo", ruc: "12" }]];
    for (const nombre of nombres)
      for (const quitar of quitares)
        for (const sumar of sumares)
          for (const n of nuevos) {
            const b: BorradorMarca = { nombre, quitar, sumar, nuevos: n };
            expect(sePuedeConfirmar(camposDeEdicionMarca(actuales, b, true)), JSON.stringify(b)).toBe(problemaEdicionMarca(actuales, b) === null);
          }
  });
});
