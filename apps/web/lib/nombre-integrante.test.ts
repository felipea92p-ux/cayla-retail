import { describe, it, expect } from "vitest";
import { nombresCortos } from "./nombre-integrante";

// «Ventas de hoy» firma cada venta con la integrante que la hizo (Xstore lo llama
// "Associate"). Se lee el primer nombre; solo si dos integrantes del día comparten
// primer nombre se agrega la inicial del apellido — lo justo para distinguirlas.

describe("nombresCortos — cómo se firma una venta con la integrante", () => {
  it("una sola integrante se lee por su primer nombre", () => {
    const m = nombresCortos(["Felipe Alvarez", "Felipe Alvarez"]);
    expect(m.get("Felipe Alvarez")).toBe("Felipe");
  });

  it("dos integrantes con el mismo primer nombre llevan la inicial del apellido", () => {
    const m = nombresCortos(["Micaela Vendedora", "Micaela Torres", "Felipe Alvarez"]);
    expect(m.get("Micaela Vendedora")).toBe("Micaela V.");
    expect(m.get("Micaela Torres")).toBe("Micaela T.");
    expect(m.get("Felipe Alvarez")).toBe("Felipe");
  });

  it("si hasta la inicial coincide, va el apellido entero", () => {
    const m = nombresCortos(["Ana Torres", "Ana Tello"]);
    expect(m.get("Ana Torres")).toBe("Ana Torres");
    expect(m.get("Ana Tello")).toBe("Ana Tello");
  });

  it("un nombre de una sola palabra se queda como está", () => {
    expect(nombresCortos(["Micaela"]).get("Micaela")).toBe("Micaela");
  });

  it("nulo, vacío o el «—» que devuelve la RPC no son una integrante: no entran al mapa", () => {
    const m = nombresCortos([null, "", "—", "  "]);
    expect(m.size).toBe(0);
  });

  it("los espacios de más no cambian el nombre", () => {
    expect(nombresCortos(["  Felipe   Alvarez "]).get("  Felipe   Alvarez ")).toBe("Felipe");
  });
});
