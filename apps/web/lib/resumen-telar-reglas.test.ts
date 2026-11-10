import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { leerResumen } from "./resumen-finanzas-reglas";
import type { SedeTelar } from "./finanzas-telar-reglas";
import type { FilaER } from "./resultados-reglas";
import { comparacionMesPasado, dockDelResumen, lineaVentasMeta, mismasTiendas, respuestaResumen, tiendasAdivinadas, vendidoPorSede } from "./resumen-telar-reglas";

// Lo que el Resumen le pasa a la barra común del telar (su respuesta y su orillo) y la línea de ventas contra la meta.

const todas = () => leerResumen(fixture.todas);
const filas = (r: ReturnType<typeof todas>): FilaER[] => (r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : []);
const conResultado = (fs: FilaER[], delta: number) => fs.map((f) => ({ ...f, resultado: f.resultado - delta }));

describe("respuestaResumen · un mes anterior al inicio de Finanzas", () => {
  it("no dice que no hubo movimientos: dice que Finanzas todavía no contaba", () => {
    const r = { ...todas(), mes: "2026-09", resultadosMes: { estado: "ok" as const, datos: [] } };
    const resp = respuestaResumen(r, null, false, false, false, "2026-10-01");
    expect(resp.valor).toBeNull();
    expect(resp.motivo).toBe("Finanzas empezó a contar en octubre: este mes no se mide.");
  });
  it("desde el mes del corte, si falta la fila, sigue diciendo que no hay movimientos", () => {
    const r = { ...todas(), mes: "2026-10", resultadosMes: { estado: "ok" as const, datos: [] } };
    expect(respuestaResumen(r, null, false, true, false, "2026-10-01").motivo).toBe("No hay movimientos de este mes para lo que miras.");
  });
});

describe("dockDelResumen (tarea 178)", () => {
  const TODOS = ["cuentas_dinero", "impuestos", "cierre_mes", "reportes_financieros"];
  it("con todos los módulos salen las cuatro, y «Pagar facturas» manda", () => {
    const d = dockDelResumen(TODOS);
    expect(d.map((a) => a.tecla)).toEqual(["p", "i", "m", "r"]);
    expect(d.filter((a) => a.principal).map((a) => a.tecla)).toEqual(["p"]);
  });
  it("el botón se llama como el menú y conserva su tecla (tarea 121)", () => {
    expect(dockDelResumen(["reportes_financieros"])).toEqual([expect.objectContaining({ texto: "Estados financieros", tecla: "r" })]);
  });
  it("con solo el Resumen queda Reportes, y es la principal", () => {
    expect(dockDelResumen(["reportes_financieros"])).toEqual([expect.objectContaining({ tecla: "r", principal: true })]);
  });
  it("sin Cuentas y dinero, la primera que queda pasa a ser la principal", () => {
    const d = dockDelResumen(["impuestos", "reportes_financieros"]);
    expect(d.map((a) => [a.tecla, !!a.principal])).toEqual([["i", true], ["r", false]]);
  });
});

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
  // Felipe 2026-11-09: «Vendido por sede» es todo lo de la tienda, con IGV y con lo de CLAURE. Cifras inventadas con las proporciones de producción (las reales no entran al repo, que es público: ADR-0609).
  const SEDES = [
    { clave: "tru", nombre: "Trujillo", color: "tru" },
    { clave: "lim", nombre: "Lima", color: "lim" },
  ] as const satisfies readonly SedeTelar[];
  const tienda = (ubicacionId: string, nombre: string, extra: Partial<FilaER>) => ({ ...filas(todas())[0]!, unidad: "tienda", ubicacionId, nombre, ...extra }) as FilaER;
  const texto = (s: string) => s.replace(/\u00a0/g, " ");
  const OCT = [tienda("tru", "Tienda TRU", { ventas: 75_000, igvCobrado: 13_500, claureSinIgv: 0 }), tienda("lim", "Tienda LIM", { ventas: 1_000, igvCobrado: 270, claureSinIgv: 500 })];

  it("el orillo del Resumen es lo vendido por tienda; el Taller y la Empresa no tienen tramo", () => {
    const v = vendidoPorSede(filas(todas()), filas(todas()).filter((f) => f.ubicacionId).map((f) => ({ clave: f.ubicacionId!, nombre: f.nombre, color: "otra" as const })), "octubre");
    expect(v.tramos.length).toBeGreaterThan(0);
    expect(v.tramos.every((x) => x.monto > 0)).toBe(true);
    const unidades = new Map(filas(todas()).map((f) => [f.ubicacionId, f.unidad]));
    expect(v.tramos.every((x) => unidades.get(x.clave) === "tienda")).toBe(true);
  });

  it("los montos van con IGV y con lo de CLAURE; el porcentaje mide lo mismo, sin IGV", () => {
    const v = vendidoPorSede(OCT, SEDES, "octubre");
    expect(v.tramos.map((t) => [t.clave, t.monto])).toEqual([["tru", 88_500], ["lim", 1_770]]);
    expect(v.total).toBe(90_270);
    expect(v.tramos.map((t) => t.pct)).toEqual([98, 2]);
    expect(texto(v.frase)).toBe("S/ 90,270 en octubre, con IGV y con lo de CLAURE. Si no es igual a Ventas, es por lo devuelto, anulado o cambiado.");
    expect(v.enlace).toBe("Ver la cuenta");
  });

  it("Lima, con más de CLAURE que de CAYLA: el porcentaje es el de su monto y su barra, no solo el de CAYLA", () => {
    const v = vendidoPorSede([tienda("tru", "Tienda TRU", { ventas: 24_000, igvCobrado: 4_320, claureSinIgv: 0 }), tienda("lim", "Tienda LIM", { ventas: 400, igvCobrado: 180, claureSinIgv: 600 })], SEDES, "noviembre");
    const lima = v.tramos.find((t) => t.clave === "lim")!;
    expect(lima.monto).toBe(1_180);
    // 1,180 de 29,500 es el 4 %. Solo con lo de CAYLA (400 de 24,400) diría 2 %.
    expect(lima.pct).toBe(4);
  });

  it("una sede que solo vendió CLAURE no desaparece; sin CLAURE en el mes, la frase no lo nombra", () => {
    const soloClaure = vendidoPorSede([OCT[0]!, tienda("lim", "Tienda LIM", { ventas: 0, igvCobrado: 90, claureSinIgv: 500 })], SEDES, "octubre");
    expect(soloClaure.tramos.find((t) => t.clave === "lim")).toMatchObject({ monto: 590, pct: 1 });
    expect(texto(vendidoPorSede([OCT[0]!], SEDES, "octubre").frase)).toBe("S/ 88,500 en octubre, con IGV. Si no es igual a Ventas, es por lo devuelto, anulado o cambiado.");
  });

  it("sin la lectura del IGV queda como antes y lo dice", () => {
    const v = vendidoPorSede([tienda("tru", "Tienda TRU", { ventas: 75_000, igvCobrado: undefined, claureSinIgv: undefined }), tienda("lim", "Tienda LIM", { ventas: 1_000, igvCobrado: undefined, claureSinIgv: undefined })], SEDES, "octubre");
    expect(v.tramos.map((t) => t.monto)).toEqual([75_000, 1_000]);
    expect(texto(v.frase)).toBe("S/ 76,000 en octubre, sin IGV ni CLAURE.");
    expect(v.enlace).toBe("Por qué no es la cifra de Ventas");
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
