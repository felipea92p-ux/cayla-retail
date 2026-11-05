import { describe, expect, it } from "vitest";
import { AMBIENTES_CAMPANA } from "@cayla-retail/shared";
import {
  campanaDeJson,
  cifrasCampanas,
  contarPorFiltro,
  crucesDeCampanas,
  cuandoDicho,
  disenoDicho,
  fechaCortaDicha,
  filtrarCampanas,
  leerCampanasWeb,
  pctDicho,
  lineaDeTiempo,
  vigenciaDicha,
  type CampanaWeb,
} from "./campanas-web-reglas";

const HOY = "2026-10-21";
const camp = (nombre: string, p: Partial<CampanaWeb> = {}): CampanaWeb => ({
  id: nombre,
  nombre,
  pct: 20,
  desde: null,
  hasta: null,
  estado: "vivo",
  prendas: 10,
  diseno: null,
  ...p,
});

describe("leerCampanasWeb: lo que manda la base", () => {
  it("lee una lista completa", () => {
    const l = leerCampanasWeb({
      hoy: HOY,
      campanas: [
        {
          id: "a", nombre: "Aniversario", pct: "20.00", desde: "2026-10-12", hasta: "2026-10-25", estado: "vivo", prendas: 112,
          diseno: { modo: "ambiente", plantilla: "aniversario", estado: "programado", imagen_ruta: null, version: 3, actualizado_en: "2026-10-20T10:00:00Z" },
        },
      ],
    });
    expect(l?.hoy).toBe(HOY);
    expect(l?.campanas[0]).toMatchObject({ pct: 20, prendas: 112, diseno: { modo: "ambiente", plantilla: "aniversario", estado: "programado", version: 3 } });
  });

  it("una lectura que no es de la forma pedida es null (la pantalla lo dice, no muestra «no hay campañas»)", () => {
    expect(leerCampanasWeb(null)).toBeNull();
    expect(leerCampanasWeb({})).toBeNull();
    expect(leerCampanasWeb({ hoy: HOY, campanas: "x" })).toBeNull();
    expect(leerCampanasWeb({ hoy: "ayer", campanas: [] })).toBeNull();
  });

  it("una campaña a medias no se dibuja; las demás sí", () => {
    const l = leerCampanasWeb({ hoy: HOY, campanas: [{ id: "a", estado: "vivo" }, { nombre: "x", estado: "vivo" }, { id: "c", nombre: "C", estado: "raro" }, { id: "d", nombre: "D", estado: "fin" }] });
    expect(l?.campanas.map((c) => c.id)).toEqual(["d"]);
  });

  it("un diseño raro es «sin diseño»; un dato suelto raro no rompe nada", () => {
    expect(campanaDeJson({ id: "a", nombre: "A", estado: "vivo", diseno: { modo: "otro", estado: "borrador" } })?.diseno).toBeNull();
    expect(campanaDeJson({ id: "a", nombre: "A", estado: "vivo", diseno: "x" })?.diseno).toBeNull();
    expect(campanaDeJson({ id: "a", nombre: "A", estado: "vivo", pct: "mucho", prendas: -4, desde: "mañana" })).toMatchObject({ pct: null, prendas: 0, desde: null });
  });
});

describe("palabras de tienda", () => {
  it("fechas cortas y vigencia", () => {
    expect(fechaCortaDicha("2026-10-05")).toBe("5 oct");
    expect(vigenciaDicha("2026-10-12", "2026-10-25")).toBe("12 oct – 25 oct");
    expect(vigenciaDicha("2026-10-12", null)).toBe("Desde el 12 oct");
    expect(vigenciaDicha(null, "2026-10-25")).toBe("Hasta el 25 oct");
    expect(vigenciaDicha(null, null)).toBe("Sin fecha de término");
  });

  it("el descuento va con su espacio que no se parte y sin ceros de más", () => {
    expect(pctDicho(20)).toBe(String.fromCharCode(8722) + "20" + String.fromCharCode(160) + "%");
    expect(pctDicho(12.5)).toContain("12.5");
    expect(pctDicho(15.0)).toContain("15");
    expect(pctDicho(null)).toBe("—");
  });

  it("cuándo termina, empieza o terminó", () => {
    expect(cuandoDicho(camp("a", { hasta: "2026-10-26" }), HOY)).toBe("Termina en 5 días");
    expect(cuandoDicho(camp("a", { hasta: "2026-10-22" }), HOY)).toBe("Termina en 1 día");
    expect(cuandoDicho(camp("a", { hasta: HOY }), HOY)).toBe("Termina hoy");
    expect(cuandoDicho(camp("a"), HOY)).toBe("Sin fecha de término");
    expect(cuandoDicho(camp("p", { estado: "prog", desde: "2026-10-22" }), HOY)).toBe("Empieza mañana");
    expect(cuandoDicho(camp("p", { estado: "prog", desde: "2026-11-02" }), HOY)).toBe("Empieza en 12 días");
    expect(cuandoDicho(camp("f", { estado: "fin", hasta: "2026-10-18" }), HOY)).toBe("Terminó hace 3 días");
    expect(cuandoDicho(camp("f", { estado: "fin", hasta: "2026-10-20" }), HOY)).toBe("Terminó ayer");
  });

  it("el diseño dicho: sin diseño, borrador y programado, de ambiente y de imagen", () => {
    expect(disenoDicho(null)).toEqual({ texto: "Sin diseño", borrador: false });
    const base = { imagenRuta: null, version: 1 };
    expect(disenoDicho({ ...base, modo: "ambiente", plantilla: "navidad", estado: "borrador" })).toEqual({ texto: "Borrador · Navidad", borrador: true });
    expect(disenoDicho({ ...base, modo: "ambiente", plantilla: "cyber", estado: "programado" })).toEqual({ texto: "Black Week", borrador: false });
    expect(disenoDicho({ ...base, modo: "imagen", plantilla: null, estado: "programado" })).toEqual({ texto: "Imagen propia", borrador: false });
    // un ambiente que el catálogo no conoce no se inventa un nombre
    expect(disenoDicho({ ...base, modo: "ambiente", plantilla: "halloween", estado: "programado" }).texto).toBe("Ambiente");
  });

  it("todos los ambientes del catálogo tienen nombre", () => {
    for (const a of AMBIENTES_CAMPANA) {
      expect(disenoDicho({ modo: "ambiente", plantilla: a.clave, estado: "programado", imagenRuta: null, version: 1 }).texto).toBe(a.nombre);
    }
  });
});

describe("cifras y filtros", () => {
  const lista = [
    camp("Larga", { hasta: "2026-11-30" }),
    camp("Corta", { hasta: "2026-10-25", diseno: { modo: "ambiente", plantilla: "aniversario", estado: "programado", imagenRuta: null, version: 1 } }),
    camp("Sin fin"),
    camp("Black", { estado: "prog", desde: "2026-11-23", hasta: "2026-11-30" }),
    camp("Navidad", { estado: "prog", desde: "2026-12-01", hasta: "2026-12-24", diseno: { modo: "ambiente", plantilla: "navidad", estado: "borrador", imagenRuta: null, version: 1 } }),
    camp("Madre", { estado: "fin", hasta: "2026-05-11" }),
  ];

  it("cuenta las vivas con la que termina primero (la que anuncia la tienda), las programadas y las que se ven como siempre", () => {
    const c = cifrasCampanas(lista);
    expect(c.enVivo).toBe(3);
    expect(c.vivaPrimera?.nombre).toBe("Corta");
    expect(c.programadas).toBe(2);
    expect(c.proxima?.nombre).toBe("Black");
    // sin diseño y no terminadas: Larga, Sin fin y Black (Madre terminó: ya no importa)
    expect(c.sinDiseno).toBe(3);
  });

  it("una campaña sin fecha de término no es la que termina primero", () => {
    expect(cifrasCampanas([camp("Sin fin"), camp("Con fin", { hasta: "2026-12-31" })]).vivaPrimera?.nombre).toBe("Con fin");
  });

  it("sin campañas, no hay cifras que inventar", () => {
    expect(cifrasCampanas([])).toEqual({ enVivo: 0, vivaPrimera: null, programadas: 0, proxima: null, sinDiseno: 0 });
  });

  it("filtra por estado y cuenta cada filtro", () => {
    expect(filtrarCampanas(lista, "todas")).toHaveLength(6);
    expect(filtrarCampanas(lista, "prog").map((c) => c.nombre)).toEqual(["Black", "Navidad"]);
    expect(filtrarCampanas(lista, "fin").map((c) => c.nombre)).toEqual(["Madre"]);
    expect(contarPorFiltro(lista)).toEqual({ todas: 6, vivo: 3, prog: 2, fin: 1 });
  });
});

describe("cruces: dos campañas a la vez, gana la que termina primero", () => {
  it("avisa de las que coinciden y dice cuál se ve", () => {
    const a = camp("Black", { estado: "prog", desde: "2026-11-23", hasta: "2026-11-30" });
    const b = camp("Cyber larga", { estado: "prog", desde: "2026-11-25", hasta: "2026-12-10" });
    const [c] = crucesDeCampanas([a, b]);
    expect(c).toMatchObject({ desde: "2026-11-25", hasta: "2026-11-30" });
    expect(c?.gana.nombre).toBe("Black");
    expect(c?.otra.nombre).toBe("Cyber larga");
  });

  it("las que no se tocan, las terminadas y la que empieza el día siguiente al fin de otra no cruzan", () => {
    const a = camp("A", { estado: "prog", desde: "2026-11-01", hasta: "2026-11-10" });
    const b = camp("B", { estado: "prog", desde: "2026-11-11", hasta: "2026-11-20" });
    const f = camp("F", { estado: "fin", desde: "2026-11-05", hasta: "2026-11-15" });
    expect(crucesDeCampanas([a, b, f])).toEqual([]);
  });

  it("el mismo último día se cruza; empata el nombre", () => {
    const [c] = crucesDeCampanas([camp("Zeta", { desde: "2026-10-01", hasta: "2026-10-30" }), camp("Alfa", { desde: "2026-10-10", hasta: "2026-10-30" })]);
    expect(c?.gana.nombre).toBe("Alfa");
  });

  it("una sin fecha de término gana solo si la otra tampoco termina antes: pierde contra la que sí termina", () => {
    const [c] = crucesDeCampanas([camp("Sin fin", { desde: "2026-10-01" }), camp("Con fin", { desde: "2026-10-05", hasta: "2026-10-20" })]);
    expect(c?.gana.nombre).toBe("Con fin");
    expect(c?.hasta).toBe("2026-10-20");
  });
});

describe("línea de tiempo: los próximos 3 meses", () => {
  const l = lineaDeTiempo(
    [
      camp("Aniv", { desde: "2026-10-12", hasta: "2026-10-25" }),
      camp("Navidad", { estado: "prog", desde: "2026-12-01", hasta: "2026-12-24" }),
      camp("Lejos", { estado: "prog", desde: "2027-03-01", hasta: "2027-03-10" }),
      camp("Pasada", { estado: "fin", desde: "2026-05-04", hasta: "2026-05-11" }),
      camp("Sin fin", { desde: "2026-12-20" }),
    ],
    HOY,
  );

  it("dibuja octubre, noviembre y diciembre y deja fuera lo terminado y lo que cae lejos", () => {
    expect(l.meses.map((m) => m.nombre)).toEqual(["Octubre", "Noviembre", "Diciembre"]);
    expect(l.barras.map((b) => b.campana.nombre)).toEqual(["Aniv", "Navidad", "Sin fin"]);
  });

  it("los meses llenan el 100 % sin huecos", () => {
    expect(l.meses[0]!.izquierda).toBe(0);
    expect(l.meses.reduce((s, m) => s + m.ancho, 0)).toBeCloseTo(100, 6);
    expect(l.meses[1]!.izquierda).toBeCloseTo(l.meses[0]!.ancho, 6);
  });

  it("cada barra queda dentro de la ventana y «hoy» donde toca", () => {
    for (const b of l.barras) {
      expect(b.izquierda).toBeGreaterThanOrEqual(0);
      expect(b.izquierda + b.ancho).toBeLessThanOrEqual(100.0001);
    }
    // 21 oct = 20 días desde el 1.º, de 92 (31 + 30 + 31)
    expect(l.hoy).toBeCloseTo((20 / 92) * 100, 6);
    // «Sin fin» corre hasta el final de la ventana
    const sinFin = l.barras.find((b) => b.campana.nombre === "Sin fin")!;
    expect(sinFin.izquierda + sinFin.ancho).toBeCloseTo(100, 6);
  });

  it("una campaña que empezó el mes pasado arranca en el borde izquierdo", () => {
    const [b] = lineaDeTiempo([camp("Vieja", { desde: "2026-09-20", hasta: "2026-10-05" })], HOY).barras;
    expect(b?.izquierda).toBe(0);
    expect(b?.ancho).toBeCloseTo((5 / 92) * 100, 6);
  });
});
