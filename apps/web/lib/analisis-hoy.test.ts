import { describe, expect, it } from "vitest";
import type { PrendaAnalisis, PrendaEnOtraSede } from "./analisis-tipos";
import { conLoRegistrado, estadoSinNada, quietasHoy, seAcabanHoy, vacioQuietasHoy } from "./analisis-hoy";

// Datos inventados para la prueba (no son de producción ni del catálogo).
let siguiente = 0;
function prenda(parcial: Partial<PrendaAnalisis> = {}): PrendaAnalisis {
  siguiente += 1;
  return {
    varianteId: `v${siguiente}`,
    productoId: `p${siguiente}`,
    nombre: `Prenda ${siguiente}`,
    color: "Azul",
    colorHex: "#3366AA",
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: "terceros",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

const otras = (aqp: Partial<PrendaEnOtraSede>, lim: Partial<PrendaEnOtraSede> = {}): PrendaEnOtraSede[] => [
  { sedeId: "aqp", stock: 0, vendidas30: 0, ...aqp },
  { sedeId: "lim", stock: 0, vendidas30: 0, ...lim },
];

// Las cuatro clases de prenda de Hoy, con 60 días para liquidar.
const seAcaba = (p: Partial<PrendaAnalisis> = {}) => prenda({ piso: 1, almacen: 0, vendidas30: 6, diasSinVender: 2, ...p }); // 5 días
const agotada = (p: Partial<PrendaAnalisis> = {}) => prenda({ piso: 0, almacen: 0, vendidas30: 4, diasSinVender: 3, ...p });
const paraEnviar = (sede: "aqp" | "lim", p: Partial<PrendaAnalisis> = {}) =>
  prenda({ piso: 2, almacen: 1, vendidas30: 0, diasSinVender: 70, otras: sede === "aqp" ? otras({ vendidas30: 3 }) : otras({}, { vendidas30: 4 }), ...p });
const paraLiquidar = (p: Partial<PrendaAnalisis> = {}) => prenda({ piso: 3, almacen: 0, vendidas30: 0, diasSinVender: 75, otras: otras({}), ...p });

describe("las cuatro tarjetas", () => {
  it("«¿Qué se acaba?»: solo lo que se acaba, lo agotado primero y, a igual plazo, lo que más se vende", () => {
    const a = seAcaba({ nombre: "A", piso: 2, vendidas30: 6 }); // 10 días
    const b = agotada({ nombre: "B" });
    const c = seAcaba({ nombre: "C", piso: 1, vendidas30: 15 }); // 2 días
    const quieta = paraLiquidar();
    expect(seAcabanHoy([a, quieta, b, c], 60).map((p) => p.nombre)).toEqual(["B", "C", "A"]);
  });

  it("«¿Qué no se mueve?»: mandar y liquidar, de la que más espera a la que menos; lo que se vigila no entra", () => {
    const x = paraLiquidar({ nombre: "X", diasSinVender: 65 });
    const y = paraEnviar("aqp", { nombre: "Y", diasSinVender: 120 });
    const vigila = paraLiquidar({ nombre: "V", diasSinVender: 40 });
    expect(quietasHoy([x, vigila, y], 60).map((p) => p.nombre)).toEqual(["Y", "X"]);
    // Con el umbral más bajo, la que se vigilaba ya no se mueve.
    expect(quietasHoy([x, vigila, y], 35).map((p) => p.nombre)).toEqual(["Y", "X", "V"]);
  });
});

// Tarea #2 de docs/pantallas/gestion-analisis.md (2026-10-14): ninguna tarjeta dice «Va bien» cuando no puede saberlo.
describe("una tarjeta sin nada no dice «Va bien» si no puede saberlo", () => {
  // Datos inventados: hoy 14 de octubre; la tienda vende en el ERP desde el 30 de setiembre (14 días) y «Liquidar desde» es 15.
  const HOY14 = "2026-10-14";
  const colgada = (salio: string, extra: Partial<PrendaAnalisis> = {}) => prenda({ piso: 2, almacen: 1, salioAlPiso: salio, ...extra });

  it("con los datos confiables, «Va bien»; con el aviso de datos incompletos, «Para saber» y «Con lo registrado»", () => {
    expect(estadoSinNada(true)).toBe("bien");
    expect(estadoSinNada(false)).toBe("info");
    expect(conLoRegistrado("Nada se está acabando.", true)).toBe("Nada se está acabando.");
    expect(conLoRegistrado("Nada se está acabando.", false)).toBe("Con lo registrado, nada se está acabando.");
  });

  it("si ningún modelo lleva aún en el piso lo que se espera para liquidarlo, «Todavía no se puede saber» (nunca «Va bien»)", () => {
    const tienda = [colgada("2026-09-30"), colgada("2026-10-10")];
    const v = vacioQuietasHoy(tienda, 15, HOY14, true);
    expect(v.est).toBe("info");
    expect(v.texto).toBe("Todavía no se puede saber. Ningún modelo lleva aún 15 días en el piso.");
  });

  it("desde que alguno llega al umbral, que nada esté quieto sí dice algo (y con datos incompletos, «con lo registrado»)", () => {
    const tienda = [colgada("2026-09-29"), colgada("2026-10-10")];
    expect(vacioQuietasHoy(tienda, 15, HOY14, true)).toEqual({ est: "bien", texto: "Nada lleva 15 días sin venderse." });
    expect(vacioQuietasHoy(tienda, 15, HOY14, false)).toEqual({ est: "info", texto: "Con lo registrado, nada lleva 15 días sin venderse." });
  });

  it("con la vara de su tipo, el umbral es el de cada uno", () => {
    const polos = { vigila: 3, liquidar: 5, vara: "hoy" as const, vendidas: 30 };
    expect(vacioQuietasHoy([colgada("2026-10-12", { umbrales: polos })], 15, HOY14, true).texto).toBe(
      "Todavía no se puede saber. Ningún modelo lleva aún lo que tarda su tipo en venderse.",
    );
    expect(vacioQuietasHoy([colgada("2026-10-08", { umbrales: polos })], 15, HOY14, true)).toEqual({ est: "bien", texto: "Nada está quieto para lo que tarda su tipo." });
  });

  it("sin nada colgado, tampoco «Va bien»", () => {
    expect(vacioQuietasHoy([prenda({ almacen: 3 })], 15, HOY14, true)).toEqual({ est: "info", texto: "Todavía no se puede saber. No hay nada colgado que juzgar todavía." });
  });
});
