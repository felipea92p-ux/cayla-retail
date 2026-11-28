import { describe, expect, it } from "vitest";
import { cuantosPendientes, enPendientes } from "./apartados-pestanas";

describe("las pestañas de Apartados (ADR-0720)", () => {
  it("«Pendientes» lleva lo que sigue abierto, y nada de lo terminado", () => {
    expect(enPendientes({ estado: "abierta" })).toBe(true);
    for (const estado of ["entregada", "liberada", "devuelta"] as const) expect(enPendientes({ estado })).toBe(false);
  });

  it("su número es el de filas de su lista", () => {
    const apartados = [{ estado: "abierta" }, { estado: "abierta" }, { estado: "entregada" }, { estado: "liberada" }] as const;
    expect(cuantosPendientes(apartados)).toBe(apartados.filter(enPendientes).length);
    expect(cuantosPendientes(apartados)).toBe(2);
    expect(cuantosPendientes([])).toBe(0);
  });
});
