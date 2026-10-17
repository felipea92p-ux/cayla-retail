import { describe, expect, it } from "vitest";
import { leerRespuestaRapido } from "./rapido";

const V = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";

describe("las tallas del «Agregar» rápido, como llegan de /api/tallas", () => {
  it("con tallas, la tienda y cada talla con su prenda (o sin ella si no hay)", () => {
    const rapido = { sedeId: "lima", tallas: [{ talla: "S", varianteId: V }, { talla: "M", varianteId: null }] };
    expect(leerRespuestaRapido({ estado: "ok", rapido })).toEqual({ estado: "ok", rapido });
    expect(leerRespuestaRapido({ estado: "ok", rapido: { sedeId: null, tallas: [] } })).toEqual({ estado: "ok", rapido: { sedeId: null, tallas: [] } });
  });

  it("sin sesión o sin la prenda, lo dice; cualquier otra cosa es «sin respuesta»", () => {
    expect(leerRespuestaRapido({ estado: "sin_sesion" })).toEqual({ estado: "sin_sesion" });
    expect(leerRespuestaRapido({ estado: "no_esta" })).toEqual({ estado: "no_esta" });
    expect(leerRespuestaRapido(null)).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaRapido("ok")).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaRapido({ estado: "ok" })).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaRapido({ estado: "ok", rapido: { sedeId: 3, tallas: [] } })).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaRapido({ estado: "ok", rapido: { sedeId: null, tallas: [{ talla: 1 }] } })).toEqual({ estado: "sin_respuesta" });
  });
});
