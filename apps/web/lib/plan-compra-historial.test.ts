import { describe, expect, it } from "vitest";
import {
  aniosConHistoria,
  aniosQueCaben,
  decadaDe,
  esDeFechaMovil,
  ventanaDeAnios,
  campanasDelAnio,
  crecimiento,
  diasDeLaCampana,
  filasDelAnio,
  faltaEnElCalendario,
  filtrarYOrdenar,
  rangoDeCampana,
  type OrdenHistorial,
  leerHistorial,
  medir,
  mismaFechaEn,
  proyectarCampana,
  rangoDelAnio,
  segundoDomingoDeMayo,
  sumarDias,
  textoCrecimiento,
  textoMultiplicador,
  totalDeCayla,
  totalDelAnio,
  type LecturaHistorial,
  type Medida,
  type TiendaHistorial,
} from "./plan-compra-historial";

const TRU: TiendaHistorial = { id: "tru", nombre: "Tienda TRU", erpDesde: "2026-09-30", historiaDesde: "2017-09-01" };
const AQP: TiendaHistorial = { id: "aqp", nombre: "Tienda AQP", erpDesde: "2026-09-30", historiaDesde: "2024-02-09" };

/** Una historia armada a mano: `venta(tienda, fecha)` soles cada día (0 = sin venta ese día). */
function lectura(hoy: string, tiendas: TiendaHistorial[], desde: string, hasta: string, venta: (t: string, f: string) => number): LecturaHistorial {
  const dias = new Map<string, Map<string, number>>();
  const meses = new Map<string, Map<string, number>>();
  for (const t of tiendas) {
    const d = new Map<string, number>();
    const m = new Map<string, number>();
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      const s = venta(t.id, f);
      if (s > 0) {
        d.set(f, s);
        m.set(f.slice(0, 7), (m.get(f.slice(0, 7)) ?? 0) + s);
      }
    }
    dias.set(t.id, d);
    meses.set(t.id, m);
  }
  return { hoy, tiendas, dias, meses };
}

const medida = (soles: number, enCurso = false): Medida => ({ estado: "medida", soles, dias: 1, enCurso, multiplicador: null });

describe("leerHistorial", () => {
  it("lee la forma de la base y descarta lo que no calza", () => {
    const l = leerHistorial({
      hoy: "2026-10-12",
      tiendas: [{ id: "tru", nombre: "Tienda TRU", erp_desde: "2026-09-30", historia_desde: "2017-09-01" }, { id: "", nombre: "x" }],
      meses: [{ u: "tru", mes: "2025-12", soles: "239000.5", dias: 31 }, { u: "tru", mes: "malo", soles: 1 }],
      dias: [{ u: "tru", f: "2025-12-24", s: 12000 }, { u: "tru", f: "ayer", s: 1 }],
    });
    expect(l?.tiendas).toEqual([TRU]);
    expect(l?.meses.get("tru")?.get("2025-12")).toBe(239000.5);
    expect([...(l?.dias.get("tru")?.keys() ?? [])]).toEqual(["2025-12-24"]);
    expect(leerHistorial(null)).toBeNull();
    expect(leerHistorial({ tiendas: [] })).toBeNull();
  });
});

describe("las fechas de cada año", () => {
  it("Día de la Madre es el segundo domingo de mayo", () => {
    expect(segundoDomingoDeMayo(2026)).toBe("2026-05-10");
    expect(segundoDomingoDeMayo(2025)).toBe("2025-05-11");
    expect(segundoDomingoDeMayo(2023)).toBe("2023-05-14");
    expect(segundoDomingoDeMayo(2021)).toBe("2021-05-09");
  });
  it("una campaña se lleva a otro año con el mismo día y mes; Día de la Madre, con su domingo", () => {
    expect(proyectarCampana({ desde: "2026-12-11", hasta: "2026-12-25" }, 2023)).toEqual({ desde: "2023-12-11", hasta: "2023-12-25" });
    expect(proyectarCampana({ desde: "2026-04-26", hasta: "2026-05-10" }, 2023)).toEqual({ desde: "2023-04-30", hasta: "2023-05-14" });
    expect(proyectarCampana({ desde: "2026-01-31", hasta: "2026-02-14" }, 2024)).toEqual({ desde: "2024-01-31", hasta: "2024-02-14" });
  });
  it("el 29 de febrero cae al 28 en un año que no es bisiesto", () => {
    expect(mismaFechaEn("2024-02-29", 2025)).toBe("2025-02-28");
  });
  it("solo Día de la Madre es de fecha móvil: las demás caen el mismo día y mes", () => {
    expect(esDeFechaMovil({ hasta: "2026-05-10" })).toBe(true);
    expect(esDeFechaMovil({ hasta: "2025-05-11" })).toBe(true);
    expect(esDeFechaMovil({ hasta: "2026-05-11" })).toBe(false);
    expect(esDeFechaMovil({ hasta: "2026-12-25" })).toBe(false);
    expect(esDeFechaMovil({ hasta: "2026-02-14" })).toBe(false);
  });
  it("cada año trae sus campañas por fecha, y «Diciembre» siempre", () => {
    const c = campanasDelAnio(
      [
        { id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" },
        { id: "madre", nombre: "Día de la Madre", desde: "2026-04-26", hasta: "2026-05-10" },
      ],
      2025,
    );
    expect(c.map((x) => [x.nombre, x.desde, x.hasta])).toEqual([
      ["Día de la Madre", "2025-04-27", "2025-05-11"],
      ["Diciembre", "2025-12-01", "2025-12-31"],
      ["Navidad", "2025-12-11", "2025-12-25"],
    ]);
  });
});

describe("medir una campaña", () => {
  // Trujillo vende 1000 por día y 2000 del 11 al 25 de diciembre.
  const l = lectura("2026-10-12", [TRU], "2024-09-01", "2026-10-11", (_t, f) => (f.slice(5) >= "12-11" && f.slice(5) <= "12-25" ? 2000 : 1000));
  it("suma los soles y compara contra los 60 días anteriores", () => {
    expect(medir(l, TRU, "2025-12-11", "2025-12-25")).toEqual({ estado: "medida", soles: 30000, dias: 15, enCurso: false, multiplicador: 2 });
  });
  it("lo que todavía no empieza es «por venir»; lo de antes de la historia, «sin dato» (nunca un cero)", () => {
    expect(medir(l, TRU, "2026-12-11", "2026-12-25").estado).toBe("por-venir");
    expect(medir(l, AQP, "2023-12-11", "2023-12-25").estado).toBe("sin-dato");
  });
  it("un hueco sin ventas cargadas (la pandemia) es «sin dato»", () => {
    const hueco = lectura("2026-10-12", [TRU], "2020-01-01", "2020-12-31", (_t, f) => (f >= "2020-03-16" && f <= "2020-06-30" ? 0 : 1000));
    expect(medir(hueco, TRU, "2020-04-26", "2020-05-10").estado).toBe("sin-dato");
  });
  it("sin base suficiente (menos de 20 días con venta) mide los soles pero no inventa un multiplicador", () => {
    const corta = lectura("2026-10-12", [AQP], "2024-02-09", "2024-03-10", () => 500);
    const m = medir(corta, AQP, "2024-02-22", "2024-03-08");
    expect(m.estado === "medida" && m.multiplicador).toBe(null);
  });
  it("una campaña en curso cuenta hasta ayer", () => {
    const m = medir(l, TRU, "2026-10-01", "2026-10-21");
    expect(m.estado === "medida" && [m.enCurso, m.dias, m.soles]).toEqual([true, 11, 11000]);
  });
});

describe("crecer contra el año anterior", () => {
  it("compara solo dos campañas medidas y terminadas", () => {
    expect(crecimiento(medida(112), medida(100))).toBeCloseTo(0.12);
    expect(crecimiento(medida(112, true), medida(100))).toBeNull();
    expect(crecimiento({ estado: "por-venir" }, medida(100))).toBeNull();
  });
  it("la tabla del año trae cada campaña por tienda con su crecimiento", () => {
    const l = lectura("2026-10-12", [TRU, AQP], "2023-10-01", "2025-12-31", (t, f) => (t === "aqp" && f < "2024-02-09" ? 0 : f.startsWith("2025") ? 1100 : 1000));
    const filas = filasDelAnio(l, [{ id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" }], 2025);
    const navidad = filas.find((f) => f.campana.clave === "nav")!;
    expect(navidad.celdas.map((c) => [c.tienda.id, c.crecimiento === null ? null : Math.round(c.crecimiento * 100)])).toEqual([
      ["tru", 10],
      ["aqp", 10],
    ]);
  });
  it("el año de toda CAYLA suma las tiendas y crece solo si todas tienen los dos años completos", () => {
    const parejo = lectura("2026-10-12", [TRU, AQP], "2024-01-01", "2025-12-31", (_t, f) => (f.startsWith("2025") ? 2 : 1));
    const t = totalDeCayla(parejo, 2025);
    expect(t.soles).toBe(365 * 2 * 2);
    expect(t.crecimiento).toBeCloseTo((365 * 2) / 366 - 1);
    // Arequipa abrió en 2025: sumarla haría «crecer» a CAYLA sin vender más. No se compara.
    const nueva = lectura("2026-10-12", [TRU, AQP], "2024-01-01", "2025-12-31", (t2, f) => (t2 === "aqp" && f < "2025-01-01" ? 0 : 1));
    expect(totalDeCayla(nueva, 2025).crecimiento).toBeNull();
  });
  it("el total del año crece solo si los dos años están completos", () => {
    const l = lectura("2026-10-12", [TRU], "2024-01-01", "2025-12-31", (_t, f) => (f.startsWith("2025") ? 2 : 1));
    expect(totalDelAnio(l, "tru", 2025).crecimiento).toBeCloseTo((365 * 2) / 366 - 1);
    expect(totalDelAnio(l, "tru", 2024).crecimiento).toBeNull();
  });
});

describe("buscar y ordenar las campañas del año", () => {
  const l = lectura("2026-10-12", [TRU], "2024-11-01", "2025-12-31", (_t, f) => (f.slice(5) >= "12-11" && f.slice(5) <= "12-25" ? 3000 : 1000));
  const etiquetas = [
    { id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" },
    { id: "hal", nombre: "Halloween", desde: "2026-10-17", hasta: "2026-10-31" },
    { id: "dia", nombre: "Día de la Madre", desde: "2026-04-26", hasta: "2026-05-10" },
  ];
  const filas = filasDelAnio(l, etiquetas, 2025);
  const nombres = (o: OrdenHistorial, q = "") => filtrarYOrdenar(filas, q, o).map((f) => f.campana.nombre);
  it("por fecha, de enero a diciembre", () => {
    expect(nombres("fecha")).toEqual(["Día de la Madre", "Halloween", "Diciembre", "Navidad"]);
  });
  it("la de ahora y las que vienen: arranca por la que está en curso y da la vuelta al año", () => {
    const ahora = (hoy: string) => filtrarYOrdenar(filas, "", "ahora", hoy).map((f) => f.campana.nombre);
    // El 12 de octubre: lo próximo es Halloween, después diciembre; Día de la Madre ya pasó y va al final.
    expect(ahora("2026-10-12")).toEqual(["Halloween", "Diciembre", "Navidad", "Día de la Madre"]);
    // El 20 de octubre, Halloween está en curso: va primero.
    expect(ahora("2026-10-20")[0]).toBe("Halloween");
    // El 15 de diciembre, Diciembre y Navidad están en curso (empatan en 0: por nombre).
    expect(ahora("2026-12-15")).toEqual(["Diciembre", "Navidad", "Día de la Madre", "Halloween"]);
  });
  it("una campaña que cruza el año está en curso a los dos lados del cambio", () => {
    const c = { desde: "2025-12-20", hasta: "2026-01-06" };
    expect(faltaEnElCalendario(c, "2026-12-28")).toBe(0);
    expect(faltaEnElCalendario(c, "2026-01-03")).toBe(0);
    expect(faltaEnElCalendario(c, "2026-12-10")).toBe(10);
  });
  it("de la A a la Z y al revés", () => {
    expect(nombres("az")).toEqual(["Día de la Madre", "Diciembre", "Halloween", "Navidad"]);
    expect(nombres("za")).toEqual(["Navidad", "Halloween", "Diciembre", "Día de la Madre"]);
  });
  it("las más vendidas primero (Diciembre, 31 días con Navidad adentro) y al revés", () => {
    expect(nombres("mas")[0]).toBe("Diciembre");
    expect(nombres("menos").at(-1)).toBe("Diciembre");
  });
  it("busca sin tildes ni mayúsculas", () => {
    expect(nombres("fecha", "dia")).toEqual(["Día de la Madre"]);
    expect(nombres("fecha", "NAV")).toEqual(["Navidad"]);
  });
});

describe("el detalle de una campaña", () => {
  // Trujillo vende 1000 por día; en Navidad 2025, 2000, salvo el 24 (5000) y el 25 cerrado.
  const l = lectura("2026-10-12", [TRU], "2025-09-01", "2025-12-31", (_t, f) =>
    f === "2025-12-25" ? 0 : f === "2025-12-24" ? 5000 : f >= "2025-12-11" && f <= "2025-12-25" ? 2000 : 1000,
  );
  it("cada día de la campaña (el cerrado, en 0), el día normal, el mejor y el más flojo de los que vendieron", () => {
    const d = diasDeLaCampana(l, TRU, "2025-12-11", "2025-12-25");
    expect(d.dias).toHaveLength(15);
    expect(d.dias.at(-1)).toEqual({ fecha: "2025-12-25", soles: 0 });
    expect(d.diaNormal).toBe(1000);
    expect(d.mejor).toEqual({ fecha: "2025-12-24", soles: 5000 });
    expect(d.flojo?.soles).toBe(2000);
  });
  it("sin base suficiente no inventa el día normal", () => {
    const corta = lectura("2026-10-12", [AQP], "2024-02-09", "2024-03-10", () => 500);
    expect(diasDeLaCampana(corta, AQP, "2024-02-22", "2024-03-08").diaNormal).toBeNull();
  });
  it("para medir un año se leen sus días y los 60 de antes", () => {
    expect(rangoDeCampana({ desde: "2025-12-11", hasta: "2025-12-25" })).toEqual({ desde: "2025-10-12", hasta: "2025-12-25" });
  });
});

describe("qué año se abre y qué se lee", () => {
  it("los años con historia van del más nuevo al más viejo, con el de hoy aunque no tenga ventas", () => {
    expect(aniosConHistoria(lectura("2026-10-12", [TRU], "2024-11-01", "2025-12-31", () => 1))).toEqual([2026, 2025, 2024]);
  });
  it("lee el año, el anterior y la base de su primera campaña, dentro del máximo de la base", () => {
    const r = rangoDelAnio(2025);
    expect(r.hasta).toBe("2025-12-31");
    expect(r.desde < "2024-01-01").toBe(true);
    expect((Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000).toBeLessThanOrEqual(1200);
  });
  it("habla como en tienda", () => {
    // es-PE: el punto es el decimal, como en «S/ 0.00» del resto del ERP.
    expect(textoMultiplicador(1.83)).toBe("×1.8");
    expect(textoCrecimiento(0.124)).toBe("+12 %");
    expect(textoCrecimiento(-0.08)).toBe("−8 %");
  });
});

describe("la fila de años cuando no caben todos (Felipe 2026-10-12)", () => {
  const TREINTA = Array.from({ length: 30 }, (_, k) => 2046 - k); // 2046 … 2017
  it("si caben todos, todos y sin «Más años»", () => {
    expect(ventanaDeAnios([2026, 2025, 2024], 2025, 9)).toEqual({ visibles: [2026, 2025, 2024], resto: [] });
  });
  it("el elegido queda al medio, con sus vecinos a los costados", () => {
    const v = ventanaDeAnios(TREINTA, 2030, 5);
    expect(v.visibles).toEqual([2032, 2031, 2030, 2029, 2028]);
    expect(v.resto).toHaveLength(25);
    expect(v.resto).not.toContain(2030);
  });
  it("en los extremos la ventana se apoya en el borde", () => {
    expect(ventanaDeAnios(TREINTA, 2046, 5).visibles).toEqual([2046, 2045, 2044, 2043, 2042]);
    expect(ventanaDeAnios(TREINTA, 2017, 5).visibles).toEqual([2021, 2020, 2019, 2018, 2017]);
    expect(ventanaDeAnios(TREINTA, 2045, 4).visibles).toEqual([2046, 2045, 2044, 2043]);
  });
  it("un año que no está (la URL a mano) cae en el más nuevo; nunca menos de una píldora", () => {
    expect(ventanaDeAnios(TREINTA, 1999, 3).visibles).toEqual([2046, 2045, 2044]);
    expect(ventanaDeAnios(TREINTA, 2030, 0).visibles).toEqual([2030]);
  });
  it("cuántas caben: todas si entran; si no, dejando lugar a «Más años»", () => {
    const m = { pildora: 64, separacion: 8, mas: 130 };
    expect(aniosQueCaben(10, { ...m, ancho: 1000 })).toBe(10);
    expect(aniosQueCaben(30, { ...m, ancho: 1000 })).toBe(12);
    expect(aniosQueCaben(30, { ...m, ancho: 343 })).toBe(2);
    expect(aniosQueCaben(30, { ...m, ancho: 100 })).toBe(1);
  });
  it("la década para agrupar la lista", () => {
    expect(decadaDe(2034)).toBe("2030–2039");
    expect(decadaDe(2020)).toBe("2020–2029");
  });
});
