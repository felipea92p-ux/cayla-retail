import { describe, expect, it } from "vitest";
import {
  avisoDePrecioParaLote,
  destinoDeTipo,
  entradaDeCambioDeTipo,
  leerRespuestaDeCambioDeTipo,
  motivoParaLaBase,
  queCambiaAlCerrar,
  textoCambiasteElTipo,
  textoYaEraDeEseTipo,
} from "./orden-tipo-reglas";

describe("destinoDeTipo", () => {
  it("una muestra pasa a lote de producción y un lote pasa a muestra: siempre al contrario", () => {
    expect(destinoDeTipo(true)).toMatchObject({ esMuestra: false, nombre: "lote de producción", como: "un lote de producción" });
    expect(destinoDeTipo(false)).toMatchObject({ esMuestra: true, nombre: "muestra", como: "una muestra" });
  });

  it("el botón y el título dicen lo mismo que el destino (lo que se toca es lo que se confirma)", () => {
    for (const hoy of [true, false]) {
      const d = destinoDeTipo(hoy);
      expect(d.boton).toBe(`Pasar a ${d.nombre}`);
      expect(d.titulo).toBe(`Pasar esta orden a ${d.nombre}`);
    }
  });

  it("el botón que confirma es corto (cabe en media fila a 375 px) y dice lo mismo que el que abre la hoja", () => {
    for (const hoy of [true, false]) {
      const d = destinoDeTipo(hoy);
      expect(d.confirmar.length).toBeLessThanOrEqual(16);
      expect(d.boton.startsWith(d.confirmar)).toBe(true);
    }
  });

  it("aplicarlo dos veces vuelve al tipo de partida", () => {
    for (const hoy of [true, false]) expect(destinoDeTipo(destinoDeTipo(hoy).esMuestra).esMuestra).toBe(hoy);
  });
});

describe("queCambiaAlCerrar", () => {
  it("a lote: las prendas entran al stock y Análisis las cuenta en camino", () => {
    const t = queCambiaAlCerrar(destinoDeTipo(true), 54);
    expect(t).toContain("entran al stock del Taller con su costo");
    expect(t).toContain("sus 54 prendas");
    expect(t).toContain("«en camino»");
  });

  it("a muestra: no entra nada al stock y Análisis deja de contarlas", () => {
    const t = queCambiaAlCerrar(destinoDeTipo(false), 16);
    expect(t).toContain("no entra nada al stock");
    expect(t).toContain("deja de contar sus 16 prendas");
  });

  it("una sola prenda va en singular («su prenda»), en los dos sentidos", () => {
    expect(queCambiaAlCerrar(destinoDeTipo(true), 1)).toContain("cuenta su prenda como");
    expect(queCambiaAlCerrar(destinoDeTipo(false), 1)).toContain("contar su prenda como");
  });
});

describe("avisoDePrecioParaLote", () => {
  it("pasar a lote sin ningún precio avisa de antemano y dice dónde ponerlo", () => {
    for (const precio of [null, 0, -1]) expect(avisoDePrecioParaLote(destinoDeTipo(true), precio)).toContain("Ponlo en Catálogo ▸ Productos");
  });

  it("con precio, o pasando a muestra (que no lo pide), no avisa nada", () => {
    expect(avisoDePrecioParaLote(destinoDeTipo(true), 59.9)).toBeNull();
    expect(avisoDePrecioParaLote(destinoDeTipo(false), null)).toBeNull();
    expect(avisoDePrecioParaLote(destinoDeTipo(false), 0)).toBeNull();
  });
});

describe("avisos", () => {
  it("el éxito nombra el modelo y el tipo nuevo, con su artículo", () => {
    expect(textoCambiasteElTipo("Blusa Hanna", destinoDeTipo(true))).toBe("La orden de Blusa Hanna ahora es un lote de producción");
    expect(textoCambiasteElTipo("Blusa Hanna", destinoDeTipo(false))).toBe("La orden de Blusa Hanna ahora es una muestra");
  });

  it("si ya era de ese tipo lo dice, sin fingir un cambio", () => {
    expect(textoYaEraDeEseTipo("Blusa Hanna", destinoDeTipo(true))).toBe("La orden de Blusa Hanna ya era un lote de producción: no hubo nada que cambiar");
  });
});

describe("el motivo", () => {
  it("es opcional: vacío o solo espacios se manda como nada, y lo escrito se manda sin los espacios de los bordes", () => {
    expect(motivoParaLaBase("")).toBeNull();
    expect(motivoParaLaBase("   ")).toBeNull();
    expect(motivoParaLaBase("  Ya tienen el molde  ")).toBe("Ya tienen el molde");
  });
});

describe("leerRespuestaDeCambioDeTipo", () => {
  it("entiende que cambió y que ya era de ese tipo", () => {
    expect(leerRespuestaDeCambioDeTipo({ cambio: true, id: "c-1" })).toEqual({ cambio: true });
    expect(leerRespuestaDeCambioDeTipo({ cambio: false })).toEqual({ cambio: false });
  });

  it("lo que no se parece a la respuesta de la base es null: nunca se toma por «ya quedó»", () => {
    for (const raro of [null, undefined, "ok", 1, [], [{ cambio: true }], {}, { cambio: "true" }, { cambio: 1 }]) expect(leerRespuestaDeCambioDeTipo(raro)).toBeNull();
  });
});

describe("entradaDeCambioDeTipo (la historia de la orden)", () => {
  it("el título sale del dato y el motivo aparece aparte", () => {
    expect(entradaDeCambioDeTipo(false, "Pasó de muestra a lote de producción · Ya tienen el molde")).toEqual({
      titulo: "Pasó de muestra a lote de producción",
      detalle: "Por qué: Ya tienen el molde",
    });
    expect(entradaDeCambioDeTipo(true, "Pasó de lote de producción a muestra · Es la primera vez")).toEqual({
      titulo: "Pasó de lote de producción a muestra",
      detalle: "Por qué: Es la primera vez",
    });
  });

  it("sin motivo no hay detalle", () => {
    expect(entradaDeCambioDeTipo(false, "Pasó de muestra a lote de producción")).toEqual({ titulo: "Pasó de muestra a lote de producción", detalle: null });
  });

  it("un motivo que trae su propio « · » se conserva entero", () => {
    expect(entradaDeCambioDeTipo(false, "Pasó de muestra a lote de producción · uno · dos").detalle).toBe("Por qué: uno · dos");
  });

  it("si la base no dijo el sentido, igual cuenta que cambió el tipo y muestra su texto", () => {
    expect(entradaDeCambioDeTipo(null, "algo")).toEqual({ titulo: "Cambió el tipo de la orden", detalle: "algo" });
    expect(entradaDeCambioDeTipo(null, "")).toEqual({ titulo: "Cambió el tipo de la orden", detalle: null });
  });
});
