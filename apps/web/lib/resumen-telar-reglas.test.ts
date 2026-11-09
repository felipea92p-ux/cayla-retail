import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { leerResumen } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { comparacionMesPasado, lineaVentasMeta, mismasTiendas, respuestaResumen, tiendasAdivinadas, vendidoPorSede } from "./resumen-telar-reglas";

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
    expect(resp.chips).toContainEqual({ texto: "S/ 1,200 más que agosto a esta fecha", tono: "verde" });
  });

  it("un mes que ya cerró se compara con el mes pasado entero, sin «a esta fecha»", () => {
    const r = todas();
    const resp = respuestaResumen(r, conResultado(filas(r), -500), false, false);
    expect(resp.chips.some((c) => /^S\/.500 menos que agosto$/.test(c.texto))).toBe(true);
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
  });

  it("sin metas de sede (o sin ver Rendimiento), la del presupuesto en línea recta; sin ninguna, sin referencia", () => {
    const l = lineaVentasMeta([[dia(1, 1000, null)]], "2026-10", "2026-10-01", 31000);
    expect(l.origenMeta).toBe("presupuesto");
    expect(l.referencia).toEqual([
      { x: 0, y: 0 },
      { x: 31, y: 31000 },
    ]);
    const sin = lineaVentasMeta([], "2026-10", "2026-10-05", null);
    expect(sin.referencia).toBeNull();
    expect(sin.serie).toHaveLength(5);
  });

  it("un mes pasado se dibuja entero; uno que no llegó, vacío", () => {
    expect(lineaVentasMeta([], "2026-09", "2026-10-23", null).serie).toHaveLength(30);
    const futuro = lineaVentasMeta([], "2026-11", "2026-10-23", null);
    expect(futuro.serie).toHaveLength(0);
  });
});

// Examen de Finanzas 2026-10-27, tarea #2: «¿Cuánto te deja?» no llevaba los sueldos del período en curso. La provisión (`fn_planilla_provision`) solo
// devuelve el período que TERMINA dentro del rango pedido; el Resumen pedía «del 1 a hoy» y el período 28-sep → 28-oct, que termina mañana, no
// entraba: el mes parecía +S/ 13 mil cuando con sus sueldos devengados estaba en unos −S/ 28 mil.
describe("los sueldos del mes en el Resumen", () => {
  it("sin sueldos en uno de los dos meses, compara los dos antes de sueldos y lo dice (tarea 25)", () => {
    const base = filas(todas());
    const con = (fs: FilaER[], planilla: number) =>
      fs.map((f) => ({
        ...f,
        planilla,
        gastos: f.gastos + planilla,
        resultado: f.resultado - planilla,
        detalleGastos: [...f.detalleGastos.filter((d) => d.cuenta !== "62"), { cuenta: "62", nombre: "Personal", monto: planilla }],
      }));
    // Noviembre ya lleva sus sueldos devengados; el mismo tramo de octubre todavía no.
    const c = comparacionMesPasado(con(base, 41717.28), con(base, 0));
    expect(c.antesDeSueldos).toBe(true);
    expect(c.antes).not.toBeNull();
    expect(c.ahora.every((f) => f.planilla === 0 && !f.detalleGastos.some((d) => d.cuenta === "62"))).toBe(true);
    expect(c.ahora.map((f) => f.resultado)).toEqual(base.map((f) => f.resultado));
    // Si los dos llevan lo mismo, se comparan tal cual.
    const ambos = comparacionMesPasado(con(base, 41717.28), con(base, 30062.23));
    expect(ambos.antesDeSueldos).toBe(false);
    expect(ambos.antes).toEqual(con(base, 30062.23));
    expect(comparacionMesPasado(con(base, 0), con(base, 0)).antesDeSueldos).toBe(false);
  });
  it("una lectura caída no se disfraza: `antes` es null y Lo que se movió dice que no se pudo leer", () => {
    const base = filas(todas());
    const c = comparacionMesPasado(base, null);
    expect(c.antes).toBeNull();
    expect(c.antesDeSueldos).toBe(false);
  });
});

describe("tiendasAdivinadas y mismasTiendas (ADR-0583: la línea de ventas se pide sin esperar al resumen)", () => {
  const activas = ["a", "b", "c"];
  it("todas: las tiendas activas, en su orden", () => {
    expect(tiendasAdivinadas({ clave: "todas", ubicacionId: null, soloEmpresa: false }, "b", activas)).toEqual(["a", "b", "c"]);
  });
  it("una tienda elegida: solo ella; una ubicación que no es tienda activa (el Taller): ninguna", () => {
    expect(tiendasAdivinadas({ clave: "b", ubicacionId: "b", soloEmpresa: false }, null, activas)).toEqual(["b"]);
    expect(tiendasAdivinadas({ clave: "t", ubicacionId: "t", soloEmpresa: false }, null, activas)).toEqual([]);
  });
  it("la empresa no vende; quien mira su sede, su sede si es tienda", () => {
    expect(tiendasAdivinadas({ clave: "empresa", ubicacionId: null, soloEmpresa: true }, "a", activas)).toEqual([]);
    expect(tiendasAdivinadas({ clave: "propia", ubicacionId: null, soloEmpresa: false }, "c", activas)).toEqual(["c"]);
    expect(tiendasAdivinadas({ clave: "propia", ubicacionId: null, soloEmpresa: false }, null, activas)).toEqual([]);
  });
  it("la apuesta solo vale con las mismas tiendas en el mismo orden (si no, se vuelven a pedir)", () => {
    expect(mismasTiendas(["a", "b"], ["a", "b"])).toBe(true);
    expect(mismasTiendas(["b", "a"], ["a", "b"])).toBe(false);
    expect(mismasTiendas(["a"], ["a", "b"])).toBe(false);
    expect(mismasTiendas([], [])).toBe(true);
  });
});
