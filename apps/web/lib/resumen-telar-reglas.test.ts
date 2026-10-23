import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { leerResumen } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { fraseLineaVentas, lineaVentasMeta, respuestaResumen, tramoAnteriorALaFecha, vendidoPorSede } from "./resumen-telar-reglas";

// Lo que el Resumen le pasa a la barra común del telar (su respuesta y su orillo) y la línea de ventas contra la meta.

const todas = () => leerResumen(fixture.todas);
const filas = (r: ReturnType<typeof todas>): FilaER[] => (r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : []);
const conResultado = (fs: FilaER[], delta: number) => fs.map((f) => ({ ...f, resultado: f.resultado - delta }));

describe("respuestaResumen", () => {
  it("CAYLA: «¿Cuánto te deja <mes>?» con lo que queda y el chip contra el mes pasado a esta fecha", () => {
    const r = todas();
    const cons = filas(r).find((f) => f.unidad === "consolidado")!;
    const resp = respuestaResumen(r, conResultado(filas(r), 1200), false);
    expect(resp.pregunta).toBe("¿Cuánto te deja septiembre?");
    expect(resp.valor).toBe(cons.resultado);
    expect(resp.chips).toContainEqual({ texto: "+S/ 1,200 que agosto a esta fecha", tono: "verde" });
  });

  it("sin el mes pasado no se inventa la comparación; provisional lo dice un chip", () => {
    const resp = respuestaResumen(todas(), null, true);
    expect(resp.chips[0]).toEqual({ texto: "Provisional: falta registrar cosas", tono: "pizarra" });
    expect(resp.chips.some((c) => c.texto.includes("a esta fecha"))).toBe(false);
  });

  it("una pérdida se dice con un chip, y la cifra va negativa", () => {
    const r = todas();
    if (r.resultadosMes.estado !== "ok") throw new Error("fixture");
    r.resultadosMes.datos.find((f) => f.unidad === "consolidado")!.resultado = -396;
    const resp = respuestaResumen(r, null, false);
    expect(resp.valor).toBe(-396);
    expect(resp.chips).toContainEqual({ texto: "Este mes vas perdiendo plata", tono: "ambar" });
  });

  it("una tienda pregunta por ella; el Taller pregunta cuánto cuesta y responde en positivo", () => {
    const tru = leerResumen(fixture.tru);
    expect(respuestaResumen(tru, null, false).pregunta).toBe("¿Cuánto te deja TRU en septiembre?");
    const taller = leerResumen(fixture.taller);
    const resp = respuestaResumen(taller, null, false);
    expect(resp.pregunta).toBe("¿Cuánto cuesta el Taller en septiembre?");
    if (resp.valor !== null) expect(resp.valor).toBeGreaterThanOrEqual(0);
  });

  it("si el mes no se pudo leer, la cifra es null con su motivo (nunca un cero)", () => {
    const r = todas();
    r.resultadosMes = { estado: "falla", mensaje: "No se pudo leer el estado de resultados." };
    expect(respuestaResumen(r, null, false)).toMatchObject({ valor: null, motivo: "No se pudo leer el estado de resultados." });
  });
});

describe("el orillo y el tramo de comparación", () => {
  it("el orillo del Resumen es lo vendido por tienda; el Taller y la Empresa no tienen tramo", () => {
    const v = vendidoPorSede(filas(todas()));
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.ubicacionId !== null && x.monto > 0)).toBe(true);
  });

  it("el mes pasado hasta el mismo día, o hasta su último día si es más corto", () => {
    expect(tramoAnteriorALaFecha("2026-10-23", "2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-23" });
    expect(tramoAnteriorALaFecha("2026-03-31", "2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
});

describe("lineaVentasMeta", () => {
  const dia = (d: number, total: number, metaSede: number | null) => ({ fecha: `2026-10-${String(d).padStart(2, "0")}`, total, metaSede });

  it("suma las tiendas, acumula hasta hoy y usa las metas de las sedes", () => {
    const tru = [dia(1, 1000, 1200), dia(2, 800, 1200), dia(3, 0, 1200)];
    const lim = [dia(1, 500, 600), dia(2, 700, 600), dia(3, 0, 600)];
    const l = lineaVentasMeta([tru, lim], "2026-10", "2026-10-02", null);
    expect(l.serie).toEqual([
      { x: 1, y: 1500 },
      { x: 2, y: 3000 },
    ]);
    expect(l.origenMeta).toBe("sedes");
    expect(l.referencia!.slice(0, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1800 },
      { x: 2, y: 3600 },
      { x: 3, y: 5400 },
    ]);
    expect(fraseLineaVentas(l, "2026-10")).toBe("Vas S/ 600 abajo de lo que la meta pedía a esta fecha: S/ 3,000 de S/ 5,400.");
  });

  it("sin metas de sede (o sin ver Rendimiento), la del presupuesto en línea recta; sin ninguna, sin referencia", () => {
    const l = lineaVentasMeta([[dia(1, 1000, null)]], "2026-10", "2026-10-01", 31000);
    expect(l.origenMeta).toBe("presupuesto");
    expect(l.referencia).toEqual([
      { x: 0, y: 0 },
      { x: 31, y: 31000 },
    ]);
    expect(fraseLineaVentas(l, "2026-10")).toBe("Vas justo en la meta (la meta del presupuesto, pareja en el mes): S/ 1,000 de S/ 31,000.");
    const sin = lineaVentasMeta([], "2026-10", "2026-10-05", null);
    expect(sin.referencia).toBeNull();
    expect(sin.serie).toHaveLength(5);
    expect(fraseLineaVentas(lineaVentasMeta([], "2026-10", "2026-10-05", null), "2026-10")).toBe("Llevas S/ 0 vendidos en octubre. No hay meta puesta para comparar.");
  });

  it("un mes pasado se dibuja entero; uno que no llegó, vacío", () => {
    expect(lineaVentasMeta([], "2026-09", "2026-10-23", null).serie).toHaveLength(30);
    const futuro = lineaVentasMeta([], "2026-11", "2026-10-23", null);
    expect(futuro.serie).toHaveLength(0);
    expect(fraseLineaVentas(futuro, "2026-11")).toBe("Todavía no hay ventas en noviembre.");
  });
});
