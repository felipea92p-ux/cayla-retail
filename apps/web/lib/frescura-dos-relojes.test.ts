import { describe, expect, it } from "vitest";
import type { EventoPiso } from "./inventario-exposicion";
import {
  analizarSede,
  colgadasDe,
  inicioDelMesLima,
  relojDeLaUnidad,
  tramoDosRelojes,
  type LecturaFrescuraConPiso,
  type TallaFrescuraCruda,
} from "./frescura-reglas";

// Frescura del piso, la regla de la tienda de un vistazo (ADR-0208, act. 2026-10-10 (b)): cada prenda se juzga contra el ritmo de su
// categoría (la regla de Felipe: «si Polos vende la mitad en 9 días, un polo que lleva 8 aún es fresco») con DOS relojes —el del
// modelo dice si todavía es Fresca; el de su unidad más vieja colgada, si se está quedando— y contra la vara de su categoría
// CONGELADA el día 1 del mes, para que una tienda que se pone lenta se vea más vieja y no «igual de fresca».

const D = 86_400;
const BASE = Date.UTC(2026, 5, 1); // 1 de junio de 2026, 00:00 UTC
const ts = (dia: number, minuto = 0) => new Date(BASE + dia * D * 1000 + minuto * 60_000).toISOString();
const bajada = (dia: number, n: number, o: Partial<EventoPiso> = {}): EventoPiso => ({ ts: ts(dia), delta: n, esVenta: false, esMovimientoInterno: true, ...o });
const retiro = (dia: number, n: number): EventoPiso => ({ ts: ts(dia), delta: -n, esVenta: false, esMovimientoInterno: true });
const venta = (dia: number, n: number): EventoPiso => ({ ts: ts(dia), delta: -n, esVenta: true, esMovimientoInterno: false });

const talla = (varianteId: string, productoId: string, o: Partial<TallaFrescuraCruda> = {}): TallaFrescuraCruda => ({
  varianteId,
  productoId,
  productoNombre: productoId,
  codigo: null,
  colorCodigo: "NEG",
  colorNombre: "Negro",
  talla: "M",
  categoriaId: "polos",
  categoriaNombre: "Polos",
  temporada: "primavera_verano",
  temporadaOrigen: "producto",
  esClasico: false,
  finEstacion: null,
  enEstacionAhora: true,
  primeraExhibicion: null,
  ultimaLlegada: null,
  ultimaLlegadaCayla: null,
  pisoHoy: 0,
  almacenHoy: 0,
  apartadasHoy: 0,
  apartadasPisoHoy: 0,
  ...o,
});

/** Hoy es el día 120 (29 de septiembre) y la lectura empieza el día 0 (1 de junio). */
const lectura = (tallas: TallaFrescuraCruda[], eventos: Record<string, EventoPiso[]>): LecturaFrescuraConPiso => ({
  separaPiso: true,
  desde: ts(0),
  ahora: ts(120),
  tallas,
  eventos,
  tardias: [],
  dudosas: [],
});

/** `n` polos de un modelo cada uno, colgados desde `desde` (uno por día) y vendidos a los `dias[i % dias.length]` días. */
function polosVendidos(prefijo: string, n: number, desde: number, dias: readonly number[]) {
  const tallas: TallaFrescuraCruda[] = [];
  const eventos: Record<string, EventoPiso[]> = {};
  for (let i = 0; i < n; i++) {
    const id = `${prefijo}-${i}`;
    tallas.push(talla(id, id, { primeraExhibicion: ts(desde + i) }));
    eventos[id] = [bajada(desde + i, 1), venta(desde + i + dias[i % dias.length], 1)];
  }
  return { tallas, eventos };
}

describe("inicioDelMesLima: el corte de la vara del mes", () => {
  it("las 00:00 de Lima del día 1 (05:00 UTC)", () => {
    expect(inicioDelMesLima("2026-10-10T13:00:00.000Z")).toBe("2026-10-01T05:00:00.000Z");
  });
  it("el 31 a las 10 de la noche en Lima todavía es octubre aunque en UTC ya sea noviembre", () => {
    expect(inicioDelMesLima("2026-11-01T03:00:00.000Z")).toBe("2026-10-01T05:00:00.000Z");
    expect(inicioDelMesLima("2026-11-01T05:00:00.000Z")).toBe("2026-11-01T05:00:00.000Z");
  });
  it("enero cae en el año que corresponde", () => {
    expect(inicioDelMesLima("2027-01-01T04:59:59.000Z")).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("colgadasDe y relojDeLaUnidad: el reloj de lo que está colgado hoy", () => {
  it("cada tanda colgada con sus días; la venta se lleva la más vieja (FIFO)", () => {
    const colgadas = colgadasDe([bajada(100, 3), venta(102, 1), bajada(110, 2)], ts(120));
    expect(colgadas).toEqual([
      { segundos: 20 * D, unidades: 2, edadDesconocida: false },
      { segundos: 10 * D, unidades: 2, edadDesconocida: false },
    ]);
    expect(relojDeLaUnidad(colgadas)).toEqual({ segundos: 20 * D, alMenos: false });
  });

  it("lo guardado en el almacén no está colgado, y no corre mientras está guardado", () => {
    expect(colgadasDe([bajada(100, 2), retiro(105, 2)], ts(120))).toEqual([]);
    // Colgada 5 días, guardada 10, vuelve a colgarse hace 5: lleva 10 días colgada, no 20.
    expect(relojDeLaUnidad(colgadasDe([bajada(100, 1), retiro(105, 1), bajada(115, 1)], ts(120)))).toEqual({ segundos: 10 * D, alMenos: false });
  });

  it("lo que entró sin fecha (carga inicial) es un piso: «al menos»", () => {
    expect(relojDeLaUnidad(colgadasDe([bajada(117, 2, { edadDesconocida: true })], ts(120)))).toEqual({ segundos: 3 * D, alMenos: true });
  });

  it("sin nada colgado, 0", () => {
    expect(relojDeLaUnidad([])).toEqual({ segundos: 0, alMenos: false });
  });
});

describe("tramoDosRelojes: Fresca por el modelo, lo demás por la unidad", () => {
  const polos = { p50: 9 * D, p75: 11 * D, p90: 13 * D };

  it("la regla de Felipe: Polos vende la mitad en 9 días, un polo que lleva 8 es Fresco", () => {
    expect(tramoDosRelojes(8 * D, 8 * D, polos, 20 * D)).toEqual({ tramo: "nueva", alMenos: false });
    expect(tramoDosRelojes(10 * D, 10 * D, polos, 20 * D)).toEqual({ tramo: "vigente", alMenos: false });
  });

  it("reponer no la hace Fresca otra vez (decisión 9), pero tampoco la envejece: lo colgado hace 2 días de un modelo de 40 es Vigente", () => {
    expect(tramoDosRelojes(40 * D, 2 * D, polos, 20 * D)).toEqual({ tramo: "vigente", alMenos: false });
    // Con el reloj del modelo para todo, salía Crítica.
    expect(tramoDosRelojes(40 * D, 40 * D, polos, 20 * D)).toEqual({ tramo: "critica", alMenos: false });
  });

  it("la unidad que pasa P75 se está quedando; la que pasa P90, más todavía", () => {
    expect(tramoDosRelojes(40 * D, 12 * D, polos, 20 * D)?.tramo).toBe("envejecida");
    expect(tramoDosRelojes(40 * D, 14 * D, polos, 20 * D)?.tramo).toBe("critica");
  });

  it("sin P50 no hay tramo; sin P75, pasado lo que la curva vio es un piso", () => {
    expect(tramoDosRelojes(5 * D, 5 * D, { p50: null, p75: null, p90: null }, 4 * D)).toBeNull();
    expect(tramoDosRelojes(30 * D, 25 * D, { p50: 9 * D, p75: null, p90: null }, 20 * D)).toEqual({ tramo: "vigente", alMenos: true });
    expect(tramoDosRelojes(30 * D, 15 * D, { p50: 9 * D, p75: null, p90: null }, 20 * D)).toEqual({ tramo: "vigente", alMenos: false });
  });

  // Con un solo reloj (unidad = modelo) se comporta como la regla de un reloj que había antes (`tramoDe`, ya borrada: ninguna
  // pantalla la usaba). Estos casos venían de su prueba y siguen valiendo para la regla de dos relojes.
  describe("con un solo reloj (unidad = modelo)", () => {
    const c = { p50: 5 * D, p75: 10 * D, p90: 20 * D };
    const uno = (segundos: number, cortes: { p50: number | null; p75: number | null; p90: number | null }, tMax: number) => tramoDosRelojes(segundos, segundos, cortes, tMax);
    it.each<[number, string]>([
      [0, "nueva"],
      [4.9, "nueva"],
      [5, "vigente"],
      [9.9, "vigente"],
      [10, "envejecida"],
      [20, "critica"],
      [90, "critica"],
    ])("%s días → %s", (dias, tramo) => {
      expect(uno(dias * D, c, 30 * D)).toEqual({ tramo, alMenos: false });
    });

    it("un corte que la curva no alcanza queda después de su observación más larga: antes de eso el tramo es exacto; después, «al menos» el tramo que ya pasó (revisión 4)", () => {
      const sinP90 = { p50: 5 * D, p75: 10 * D, p90: null };
      expect(uno(14 * D, sinP90, 15 * D)).toEqual({ tramo: "envejecida", alMenos: false });
      expect(uno(16 * D, sinP90, 15 * D)).toEqual({ tramo: "envejecida", alMenos: true });
      expect(uno(70 * D, { p50: 10 * D, p75: 30 * D, p90: null }, 45 * D)).toEqual({ tramo: "envejecida", alMenos: true });
      expect(uno(70 * D, { p50: 10 * D, p75: null, p90: null }, 45 * D)).toEqual({ tramo: "vigente", alMenos: true });
    });

    it("en el borde exacto (segundos = tMax) el tramo sigue siendo exacto (revisión 4, mutante w20)", () => {
      expect(uno(10 * D, { p50: 2 * D, p75: null, p90: null }, 10 * D)).toEqual({ tramo: "vigente", alMenos: false });
    });

    it("con tolerancia: un error de coma flotante de 1e-11 no cambia el tramo, ni en tMax ni en un corte (revisión 4)", () => {
      expect(uno(345223.80700000003, { p50: 3 * D, p75: null, p90: null }, 345223.807)).toEqual({ tramo: "vigente", alMenos: false });
      expect(uno(5 * D - 1e-11, c, 30 * D)).toEqual({ tramo: "vigente", alMenos: false });
      expect(uno(5 * D - 1, c, 30 * D)).toEqual({ tramo: "nueva", alMenos: false });
      expect(uno(10 * D + 1, { p50: 2 * D, p75: null, p90: null }, 10 * D)).toEqual({ tramo: "vigente", alMenos: true });
    });

    it("sin P50 nadie tiene tramo: «aún sin referencia», nunca «Nueva» (ADR-0208, decisión 6)", () => {
      for (const dias of [0, 3, 14, 59]) {
        expect(uno(dias * D, { p50: null, p75: null, p90: null }, 60 * D)).toBeNull();
        expect(uno(dias * D, { p50: null, p75: 10 * D, p90: 20 * D }, 60 * D)).toBeNull();
      }
    });
  });
});

describe("analizarSede con los dos relojes", () => {
  // 24 polos vendidos a los 5, 7, 9, 9, 11 y 13 días: P50 = 9, P75 = 11, P90 = 13.
  const fondo = () => polosVendidos("fondo", 24, 62, [5, 7, 9, 9, 11, 13]);

  it("el polo de 8 días es Fresco; el de 10, Vigente", () => {
    const { tallas, eventos } = fondo();
    tallas.push(talla("nuevo", "nuevo", { primeraExhibicion: ts(112), pisoHoy: 1 }), talla("diez", "diez", { primeraExhibicion: ts(110), pisoHoy: 1 }));
    eventos.nuevo = [bajada(112, 1)];
    eventos.diez = [bajada(110, 1)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    expect(sede.categorias[0].cortes).toEqual({ p50: 9 * D, p75: 11 * D, p90: 13 * D });
    expect(sede.prendas.find((p) => p.productoId === "nuevo")?.estado).toMatchObject({ tipo: "semaforo", tramo: "nueva" });
    expect(sede.prendas.find((p) => p.productoId === "diez")?.estado).toMatchObject({ tipo: "semaforo", tramo: "vigente" });
  });

  it("el polo que se vende y se repone no se pinta de viejo: su modelo lleva 40 días, lo colgado 2", () => {
    const { tallas, eventos } = fondo();
    tallas.push(talla("exito", "exito", { primeraExhibicion: ts(80), pisoHoy: 2 }), talla("quieto", "quieto", { primeraExhibicion: ts(80), pisoHoy: 1 }));
    eventos.exito = [bajada(80, 2), venta(84, 1), venta(88, 1), bajada(88, 2), venta(92, 1), venta(96, 1), bajada(96, 2), venta(100, 1), venta(104, 1), bajada(118, 2)];
    eventos.quieto = [bajada(80, 1)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    const exito = sede.prendas.find((p) => p.productoId === "exito")!;
    expect(exito.reloj.segundos).toBeGreaterThan(9 * D); // ya no es Fresco
    expect(exito.relojUnidad).toEqual({ segundos: 2 * D, alMenos: false });
    expect(exito.estado).toMatchObject({ tipo: "semaforo", tramo: "vigente" });
    // El que no se vendió nada sí: su unidad lleva los 40 días.
    expect(sede.prendas.find((p) => p.productoId === "quieto")?.estado).toMatchObject({ tipo: "semaforo", tramo: "critica" });
  });
});

describe("analizarSede con la vara del mes (congelada el día 1)", () => {
  // Hoy es el 29 de septiembre: el corte es el 1 de septiembre (día 92 + 5 horas). Antes del corte, 20 polos se vendían a los 3
  // días; este mes, 20 polos tardaron 12. Y un polo lleva 10 días colgado.
  const CORTE = inicioDelMesLima(ts(120));
  const mesLento = () => {
    const antes = polosVendidos("agosto", 20, 60, [3]);
    const ahora = polosVendidos("septiembre", 20, 93, [12]);
    const tallas = [...antes.tallas, ...ahora.tallas, talla("diez", "diez", { primeraExhibicion: ts(110), pisoHoy: 1 })];
    const eventos = { ...antes.eventos, ...ahora.eventos, diez: [bajada(110, 1)] };
    return lectura(tallas, eventos);
  };

  it("el corte cae dentro de la lectura", () => {
    expect(CORTE).toBe("2026-09-01T05:00:00.000Z");
  });

  it("un mes lento sube lo que se está quedando: con la vara de hoy el polo de 10 días sale Fresco; con la del mes, Crítico", () => {
    const deHoy = analizarSede(mesLento()).sede;
    expect(deHoy.categorias[0]).toMatchObject({ cortes: { p50: 12 * D }, delMes: null });
    expect(deHoy.prendas.find((p) => p.productoId === "diez")).toMatchObject({ varaDelMes: false, estado: { tipo: "semaforo", tramo: "nueva" } });

    const delMes = analizarSede(mesLento(), undefined, { corteDelMes: CORTE }).sede;
    // Las dos varas juntas dicen lo que pasó: Polos se vendía en 3 días y ahora en 12.
    expect(delMes.categorias[0]).toMatchObject({ cortes: { p50: 12 * D }, delMes: { corte: CORTE, cortes: { p50: 3 * D }, vendidas: 20, enUso: true } });
    expect(delMes.prendas.find((p) => p.productoId === "diez")).toMatchObject({ varaDelMes: true, estado: { tipo: "semaforo", tramo: "critica" } });
  });

  it("aún aprendiendo: con menos de 10 ventas antes del corte, se juzga con la vara de hoy y la del mes no está en uso", () => {
    const antes = polosVendidos("agosto", 6, 60, [3]);
    const ahora = polosVendidos("septiembre", 20, 93, [12]);
    const l = lectura([...antes.tallas, ...ahora.tallas, talla("diez", "diez", { primeraExhibicion: ts(110), pisoHoy: 1 })], { ...antes.eventos, ...ahora.eventos, diez: [bajada(110, 1)] });
    const { sede } = analizarSede(l, undefined, { corteDelMes: CORTE });
    expect(sede.categorias[0].delMes).toMatchObject({ vendidas: 6, enUso: false });
    expect(sede.prendas.find((p) => p.productoId === "diez")).toMatchObject({ varaDelMes: false, estado: { tipo: "semaforo", tramo: "nueva" } });
  });

  it("un corte fuera de la lectura no arma vara del mes", () => {
    const { sede } = analizarSede(mesLento(), undefined, { corteDelMes: ts(-10) });
    expect(sede.categorias[0].delMes).toBeNull();
    expect(sede.prendas.every((p) => !p.varaDelMes)).toBe(true);
  });
});
