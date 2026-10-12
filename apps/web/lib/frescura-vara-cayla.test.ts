import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kaplanMeier, referenciaCayla, type Observacion, type ObservacionesSede } from "./frescura-reglas";
import {
  VIGENCIA_VARA_CAYLA_DIAS,
  calcularVaraCayla,
  curvaDeVaraCayla,
  filasDeVaraCayla,
  filasParaGuardar,
  leerVaraCayla,
  varaCaylaVigente,
} from "./frescura-vara-cayla";

// La vara de CAYLA como respaldo (ADR-0208, act. 2026-10-07): lo que el cron calcula y guarda, y lo que la web lee de vuelta.

const D = 86_400;
const u = (dias: number, vendida: boolean, peso = 1): Observacion => ({ segundos: dias * D, vendida, peso });
const sedeCon = (cats: Record<string, Observacion[]>): ObservacionesSede =>
  Object.fromEntries(Object.entries(cats).map(([id, obs]) => [id, { nombre: id, unidadesEn: () => obs }]));

describe("filasDeVaraCayla: la receta de referenciaCayla, con las observaciones de la ventana elegida", () => {
  // TRU vende 3 capas rápido; AQP, 25 entre los días 5 y 60. Juntas: 28 ventas, «Sólido».
  const tru = sedeCon({ capas: [u(1, true), u(1, true), u(2, true), u(10, false)], polos: [u(3, true)] });
  const aqp = sedeCon({ capas: [...Array.from({ length: 25 }, (_, i) => u(5 + i * 2.2, true)), u(30, false), u(40, false)] });

  it("una fila por categoría, con las unidades de todas las tiendas y el mismo nivel y cortes que referenciaCayla", () => {
    const filas = filasDeVaraCayla([tru, aqp]);
    expect(filas.map((f) => f.categoriaId)).toEqual(["capas", "polos"]);
    const capas = filas[0];
    expect(capas).toMatchObject({ tiendas: 2, vendidas: 28, unidades: 31, nivel: "solido" });
    expect(capas.observaciones).toHaveLength(31);
    const ref = referenciaCayla([tru, aqp]).find((c) => c.categoriaId === "capas")!;
    expect(ref.nivel).toBe(capas.nivel);
    expect(ref.ventanaDias).toBe(capas.ventanaDias);
    // La curva rearmada desde las observaciones guardadas da los mismos cortes que la referencia.
    const curva = curvaDeVaraCayla(capas);
    expect(curva.vendidas).toBe(ref.vendidas);
    expect(kaplanMeier(capas.observaciones).tMax).toBe(ref.tMax);
    // Polos: 1 venta en una sola tienda, «Pocos datos»; igual se guarda (quien lee decide si alcanza).
    expect(filas[1]).toMatchObject({ vendidas: 1, nivel: "pocos_datos" });
  });

  it("sin categoría («») y categorías sin ninguna unidad con edad conocida no salen", () => {
    const sede = sedeCon({ "": [u(2, true)], vacia: [] });
    expect(filasDeVaraCayla([sede])).toEqual([]);
  });

  it("filasParaGuardar: snake_case y observaciones compactas [segundos, vendida, peso]", () => {
    const [fila] = filasParaGuardar(filasDeVaraCayla([sedeCon({ polos: [u(3, true, 2), u(7, false)] })]));
    // Con 2 ventas ninguna ventana «alcanza» (20 ventas y los tres cortes): la vara se queda con la más larga, 120 días.
    expect(fila).toMatchObject({ categoria_id: "polos", tiendas: 1, ventana_dias: 120, vendidas: 2, unidades: 3, nivel: "pocos_datos" });
    expect(fila.observaciones).toEqual([
      [3 * D, 1, 2],
      [7 * D, 0, 1],
    ]);
  });
});

describe("leerVaraCayla: lo que devuelve fn_frescura_vara_cayla", () => {
  const fila = {
    categoria_id: "c1",
    calculada_en: "2026-10-08T08:20:00Z",
    tiendas: 3,
    ventana_dias: 60,
    vendidas: "28.00",
    unidades: "31.00",
    nivel: "solido",
    observaciones: [
      [D, 1, 1],
      [10 * D, 0, 2],
    ],
  };

  it("lee las filas (las cifras vienen como texto de numeric) y rearma las observaciones", () => {
    const filas = leerVaraCayla([fila]);
    expect(filas).toEqual([
      {
        categoriaId: "c1",
        calculadaEn: "2026-10-08T08:20:00Z",
        tiendas: 3,
        ventanaDias: 60,
        vendidas: 28,
        unidades: 31,
        nivel: "solido",
        observaciones: [u(1, true), u(10, false, 2)],
      },
    ]);
  });

  it("sin la forma, null; una observación malformada descarta su fila entera, no la lectura", () => {
    expect(leerVaraCayla(null)).toBeNull();
    expect(leerVaraCayla({})).toBeNull();
    expect(leerVaraCayla([{ categoria_id: "c1" }])).toBeNull();
    expect(leerVaraCayla([{ ...fila, observaciones: [[D, 2, 1]] }, { ...fila, categoria_id: "c2" }])?.map((f) => f.categoriaId)).toEqual(["c2"]);
    expect(leerVaraCayla([{ ...fila, nivel: "otro" }])?.[0].nivel).toBeNull();
  });

  it("vigente: hasta 3 días desde que se calculó; después, o en el futuro, no", () => {
    expect(VIGENCIA_VARA_CAYLA_DIAS).toBe(3);
    const f = { calculadaEn: "2026-10-08T08:20:00Z" };
    expect(varaCaylaVigente(f, "2026-10-08T12:00:00Z")).toBe(true);
    expect(varaCaylaVigente(f, "2026-10-11T08:20:00Z")).toBe(true);
    expect(varaCaylaVigente(f, "2026-10-11T08:20:01Z")).toBe(false);
    expect(varaCaylaVigente(f, "2026-10-08T08:19:59Z")).toBe(false);
    expect(varaCaylaVigente({ calculadaEn: "ayer" }, "2026-10-08T12:00:00Z")).toBe(false);
  });
});

describe("calcularVaraCayla: lo que hace el cron, con la salida real de fn_frescura_sede", () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "frescura-sede.json"), "utf8"));
  const respuesta = { data: fixture.fn_frescura_sede, error: null };

  it("una fn_frescura_sede por tienda y la vara de cada categoría con todas juntas", async () => {
    const llamadas: unknown[] = [];
    const rpc = async (fn: string, args: unknown) => {
      llamadas.push([fn, args]);
      return respuesta;
    };
    const r = await calcularVaraCayla([{ id: "t1", nombre: "Tienda TRU" }, { id: "t2", nombre: "Tienda AQP" }], rpc as never, 120);
    expect(llamadas).toEqual([
      ["fn_frescura_sede", { p_ubicacion_id: "t1", p_dias: 120 }],
      ["fn_frescura_sede", { p_ubicacion_id: "t2", p_dias: 120 }],
    ]);
    expect(r.caidas).toEqual([]);
    // La misma sede dos veces: cada categoría con el doble de unidades que en una sola.
    const sola = await calcularVaraCayla([{ id: "t1", nombre: "Tienda TRU" }], rpc as never, 120);
    expect(r.filas.map((f) => f.categoriaId)).toEqual(sola.filas.map((f) => f.categoriaId));
    for (const [i, f] of r.filas.entries()) {
      expect(f.tiendas).toBe(2);
      expect(f.vendidas).toBe(sola.filas[i].vendidas * 2);
    }
    expect(sola.filas.some((f) => f.nivel === "solido")).toBe(true);
  });

  it("con una tienda caída no hay filas y se la nombra: una vara «de las tres» hecha con dos miente", async () => {
    const rpc = async (_fn: string, args: { p_ubicacion_id: string }) =>
      args.p_ubicacion_id === "t2" ? { data: null, error: { message: "se cayó" } } : respuesta;
    const r = await calcularVaraCayla([{ id: "t1", nombre: "Tienda TRU" }, { id: "t2", nombre: "Tienda AQP" }], rpc as never, 120);
    expect(r).toEqual({ filas: [], caidas: ["Tienda AQP"] });
  });

  it("una tienda que no separa piso y almacén entra con cero observaciones, sin caerse", async () => {
    const rpc = async (_fn: string, args: { p_ubicacion_id: string }) =>
      args.p_ubicacion_id === "t2" ? { data: { separa_piso: false }, error: null } : respuesta;
    const r = await calcularVaraCayla([{ id: "t1", nombre: "Tienda TRU" }, { id: "t2", nombre: "Taller" }], rpc as never, 120);
    expect(r.caidas).toEqual([]);
    expect(r.filas.every((f) => f.tiendas === 2)).toBe(true);
  });
});
