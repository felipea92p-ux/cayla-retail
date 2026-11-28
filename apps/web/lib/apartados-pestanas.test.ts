import { describe, expect, it } from "vitest";
import { cuantosPendientes, enPendientes } from "./apartados-pestanas";

describe("las pestañas de Apartados (ADR-0720)", () => {
  it("«Pendientes» lleva lo abierto y lo que espera su devolución; lo entregado y lo devuelto son del Historial", () => {
    expect(enPendientes({ estado: "abierta" })).toBe(true);
    expect(enPendientes({ estado: "liberada" })).toBe(true);
    expect(enPendientes({ estado: "entregada" })).toBe(false);
    expect(enPendientes({ estado: "devuelta" })).toBe(false);
  });

  it("su número es el de filas de su lista", () => {
    const apartados = [{ estado: "abierta" }, { estado: "abierta" }, { estado: "liberada" }, { estado: "entregada" }, { estado: "devuelta" }] as const;
    expect(cuantosPendientes(apartados)).toBe(apartados.filter(enPendientes).length);
    expect(cuantosPendientes(apartados)).toBe(3);
    expect(cuantosPendientes([])).toBe(0);
  });
});
