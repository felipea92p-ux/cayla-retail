import { describe, expect, it } from "vitest";
import {
  atoraContraCostumbre,
  filasDelGlobito,
  ordenarCategorias,
  tinteDelDia,
  celdasDelCalendario,
  diasFuertesDelMes,
  mesTexto,
  diasDeStock,
  diasDeStockTexto,
  esperaDelPedido,
  paraEmpujar,
  paraReponer,
  quienesEntran,
  tallaFalta,
  tallasQueFaltan,
  barraDeSeparan,
  estadoDePrenda,
  ordenarPrendas,
  separanDe100,
  separanEnPromedio,
  ciudadDeRegion,
  ciudadSinTienda,
  rindeElCamino,
  tinteDeRegion,
  celdaTexto,
  diaDeLaSemana,
  diasTexto,
  lecturaDeCalor,
  puntosDelPaso,
  cambio,
  cambioDeLaPrenda,
  de100,
  de100QueVieron,
  dondeSeAtora,
  dondeSeAtoraLaPrenda,
  explicaAtora,
  fraseAtora,
  horaCorta,
  leerResumen,
  campanaDelPeriodo,
  hrefTrafico,
  leerFiltros,
  periodoDe,
  personas,
  picoDeHoras,
  quienesTexto,
  rangoTexto,
  tramoTexto,
  sinNoticias,
  cambioDe,
  graficoDe,
  marcasDelTiempo,
  totalDe,
  valoresDe,
  veredictoDe,
} from "./trafico-reglas";

const DE_LA_BASE = {
  desde: "2026-10-17",
  hasta: "2026-10-23",
  anterior_desde: "2026-10-10",
  anterior_hasta: "2026-10-16",
  pasos: [1920, 1274, 633, 394, 178, 139],
  anterior: 2027,
  base: [7700, 5100, 2480, 1530, 690, 540],
  ahora: 9,
  ultimo_dato: "2026-10-23T21:40:00+00:00",
};

describe("leerResumen: lo que devuelve la base", () => {
  it("lee la forma de resumen_trafico_web", () => {
    expect(leerResumen(DE_LA_BASE)).toEqual({
      desde: "2026-10-17",
      hasta: "2026-10-23",
      anteriorDesde: "2026-10-10",
      anteriorHasta: "2026-10-16",
      pasos: [1920, 1274, 633, 394, 178, 139],
      anterior: 2027,
      anteriorCorte: null,
      base: [7700, 5100, 2480, 1530, 690, 540],
      ahora: 9,
      ultimoDato: "2026-10-23T21:40:00+00:00",
      prendas: [],
      caminos: { instagram: 0, directo: 0, whatsapp: 0, tiktok: 0, google: 0, qr: 0, otros: 0 },
      ciudades: { trujillo: 0, lima: 0, arequipa: 0, chiclayo: 0, piura: 0, cusco: 0, otras: 0, fuera: 0, sin_dato: 0 },
      horas: Array.from({ length: 24 }, () => 0),
      serie: { por: "dia", actual: [], antes: [] },
      calor: null,
      regiones: {},
      caminosSeparan: { instagram: 0, directo: 0, whatsapp: 0, tiktok: 0, google: 0, qr: 0, otros: 0 },
      tallas: null,
      quienes: null,
      atencion: null,
      calendario: null,
    });
  });
  it("sin ningún paso todavía, el último dato es null", () => {
    expect(leerResumen({ ...DE_LA_BASE, ultimo_dato: null })?.ultimoDato).toBeNull();
  });
  it("una forma rara no se lee (no se inventa)", () => {
    expect(leerResumen(null)).toBeNull();
    expect(leerResumen({ ...DE_LA_BASE, pasos: [1, 2, 3] })).toBeNull();
    expect(leerResumen({ ...DE_LA_BASE, pasos: [1, 2, 3, 4, 5, -1] })).toBeNull();
    expect(leerResumen({ ...DE_LA_BASE, desde: "23/10/2026" })).toBeNull();
  });
});

describe("el período y las cifras", () => {
  it("7 días cuenta hoy", () =>
    expect(periodoDe("7", "2026-10-23", null)).toEqual({
      clave: "7",
      desde: "2026-10-17",
      hasta: "2026-10-23",
      nombre: "Últimos 7 días",
      antes: "los 7 días anteriores",
      antDesde: null,
      antHasta: null,
      corte: null,
    }));
  it("de cada 100", () => {
    expect(de100(1274, 1920)).toBe(66);
    expect(de100(5, 0)).toBe(0);
  });
  it("el cambio contra los días de antes, solo con gente suficiente para comparar", () => {
    expect(cambio(1920, 2027)).toBe(-5);
    expect(cambio(6652, 3465)).toBe(92);
    expect(cambio(6, 3)).toBeNull();
  });
  it("singular y plural", () => {
    expect(personas(1)).toBe("1 persona");
    expect(personas(1920)).toBe("1,920 personas");
  });
  it("la hora de Lima, en 12 horas", () => {
    expect(horaCorta("2026-10-23T20:10:00Z")).toBe("3:10 p. m.");
    expect(horaCorta("2026-10-23T05:05:00Z")).toBe("12:05 a. m.");
    expect(horaCorta("2026-10-23")).toBeNull();
  });
});

describe("dondeSeAtora: el paso que deja pasar a menos gente de la que le llega", () => {
  it("con mucha gente, manda lo de estos días (aquí, separar: de 394 que la pusieron en la bolsa, 178 separaron)", () => {
    const a = dondeSeAtora(DE_LA_BASE.pasos, DE_LA_BASE.base)!;
    expect(a).toEqual({ i: 4, llegaron: 394, siguieron: 178, seFueronDe100: 55, pocas: false });
    expect(fraseAtora(a)).toEqual({ titular: "Se atora al separar", frase: "de cada 100 que la pusieron en la bolsa, 55 se fueron sin separar." });
  });

  it("con muy poca gente, dos personas no mueven el veredicto: manda lo de costumbre", () => {
    // 4 entraron, 3 vieron, 3 eligieron talla, 3 a la bolsa, 3 separaron, 1 recogió: crudo, «al recoger» (1 de 3) sería lo peor.
    const a = dondeSeAtora([4, 3, 3, 3, 3, 1], DE_LA_BASE.base)!;
    expect(a.i).toBe(4);
    expect(a.pocas).toBe(true);
    expect(explicaAtora(a)).toContain("tómalo como una pista");
  });

  it("el globo cae donde se ve que se fue más gente: 126 entraron, 41 vieron, 4 eligieron talla, 0 a la bolsa → «al elegir talla», no «a la bolsa» (solo 4 llegaron)", () => {
    const a = dondeSeAtora([126, 41, 4, 0, 0, 0], DE_LA_BASE.base)!;
    expect(a).toEqual({ i: 2, llegaron: 41, siguieron: 4, seFueronDe100: 90, pocas: false });
  });

  it("singular y plural en la explicación", () => {
    expect(explicaAtora({ i: 4, llegaron: 1, siguieron: 0, seFueronDe100: 100, pocas: true })).toContain("de 1 persona que la puso en la bolsa, 0 separaron.");
    expect(explicaAtora({ i: 4, llegaron: 394, siguieron: 1, seFueronDe100: 100, pocas: false })).toContain("de 394 personas que la pusieron en la bolsa, 1 separó.");
  });

  it("contra lo de costumbre: 45 de cada 100 separan, como siempre (690 de 1530): no se enciende", () => {
    const a = dondeSeAtora(DE_LA_BASE.pasos, DE_LA_BASE.base)!;
    expect(atoraContraCostumbre(a, DE_LA_BASE.base)).toEqual({ siguen: 45, costumbre: 45, peor: false });
  });

  it("contra lo de costumbre: 38 de cada 100 cuando siempre son 52, se enciende; con 2 personas, no", () => {
    const base = [1000, 800, 500, 400, 208, 150];
    const a = dondeSeAtora([1000, 820, 520, 400, 152, 120], base)!;
    expect(a.i).toBe(4);
    expect(atoraContraCostumbre(a, base)).toEqual({ siguen: 38, costumbre: 52, peor: true });
    expect(atoraContraCostumbre({ i: 4, llegaron: 2, siguieron: 0, seFueronDe100: 100, pocas: true }, base).peor).toBe(false);
  });

  it("sin costumbre, no se compara", () => {
    expect(atoraContraCostumbre({ i: 1, llegaron: 100, siguieron: 30, seFueronDe100: 70, pocas: false }, [0, 0, 0, 0, 0, 0])).toEqual({
      siguen: 30,
      costumbre: null,
      peor: false,
    });
  });

  it("los 100 puntos: el primer paso los enciende todos (si entró alguien) y los demás, de cada 100 que entraron", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => puntosDelPaso(DE_LA_BASE.pasos, i))).toEqual([100, 66, 33, 21, 9, 7]);
    expect(puntosDelPaso([0, 0, 0, 0, 0, 0], 0)).toBe(0);
  });

  it("sin costumbre (los primeros días), manda lo de estos días", () => {
    expect(dondeSeAtora([100, 30, 20, 15, 10, 9], [0, 0, 0, 0, 0, 0])!.i).toBe(1);
  });

  it("si nadie llegó a un paso en estos días, se dice así y no con un «de cada 100» inventado", () => {
    const a = dondeSeAtora([5, 0, 0, 0, 0, 0], DE_LA_BASE.base)!;
    expect(a.llegaron).toBeGreaterThanOrEqual(0);
    expect(fraseAtora({ ...a, i: 4, llegaron: 0, siguieron: 0 }).frase).toBe("en estos días nadie llegó hasta ahí; de costumbre, es donde más gente se va.");
  });

  it("sin nadie que entró, no hay veredicto", () => expect(dondeSeAtora([0, 0, 0, 0, 0, 0], DE_LA_BASE.base)).toBeNull());
});

describe("sinNoticias: la tienda dejó de mandar visitas", () => {
  const ultimo = "2026-10-23T15:10:00Z"; // 10:10 a. m. en Lima
  it("en horario de tienda, más de 2 horas sin nada: avisa desde cuándo", () => {
    expect(sinNoticias(ultimo, new Date("2026-10-23T18:00:00Z"))).toEqual({ desde: "las 10:10 a. m." });
  });
  it("menos de 2 horas, o de madrugada, no avisa", () => {
    expect(sinNoticias(ultimo, new Date("2026-10-23T16:30:00Z"))).toBeNull();
    expect(sinNoticias("2026-10-23T03:00:00Z", new Date("2026-10-23T08:30:00Z"))).toBeNull(); // 3:30 a. m. en Lima
  });
  it("si lo último es de otro día, lo dice con la fecha", () => {
    expect(sinNoticias("2026-10-22T20:00:00Z", new Date("2026-10-23T16:00:00Z"))).toEqual({ desde: "el 22 de octubre, 3:00 p. m." });
  });
  it("sin ningún paso nunca, no es un corte: es que todavía no empezó", () => expect(sinNoticias(null, new Date())).toBeNull());
});

const PRENDA_DE_LA_BASE = {
  id: "9b0c7d10-0689-4780-9493-79093027a3dc",
  nombre: "Blazer Camila",
  codigo: "BLZ-0001",
  categoria: "Blazers",
  prefijo: "BLZ",
  familia: "SUP",
  precio: 189.9,
  foto: null,
  colores_catalogo: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18" }],
  miraron: 120,
  talla: 70,
  bolsa: 40,
  separaron: 12,
  recogieron: 9,
  anterior: 100,
  tallas: [{ talla: "M", n: 40 }, { talla: "S", n: 30 }],
  colores: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18", n: 70 }],
  caminos: [{ camino: "instagram", n: 80 }, { camino: "directo", n: 40 }],
};

describe("las prendas del período", () => {
  it("lee cada prenda con su recorrido, lo que eligieron y de dónde vinieron", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] });
    expect(r?.prendas[0]).toEqual({
      id: "9b0c7d10-0689-4780-9493-79093027a3dc",
      nombre: "Blazer Camila",
      codigo: "BLZ-0001",
      categoria: "Blazers",
      prefijo: "BLZ",
      familia: "SUP",
      precio: 189.9,
      foto: null,
      coloresCatalogo: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18" }],
      recorrido: [120, 70, 40, 12, 9],
      anterior: 100,
      tallas: [{ talla: "M", n: 40 }, { talla: "S", n: 30 }],
      colores: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18", n: 70 }],
      caminos: [{ camino: "instagram", n: 80 }, { camino: "directo", n: 40 }],
    });
  });

  it("una prenda con otra forma se salta; las demás quedan", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, miraron: -1 }, PRENDA_DE_LA_BASE, "basura"] });
    expect(r?.prendas).toHaveLength(1);
  });

  it("un camino que la pantalla no conoce no se dibuja", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, caminos: [{ camino: "fax", n: 3 }] }] });
    expect(r?.prendas[0].caminos).toEqual([]);
  });

  it("el precio llega como texto (numeric de Postgres) y se lee como número", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, precio: "89.90" }] });
    expect(r?.prendas[0].precio).toBe(89.9);
  });

  it("una base de antes, sin prendas, da la tabla de prendas vacía", () => {
    expect(leerResumen(DE_LA_BASE)?.prendas).toEqual([]);
  });

  it("de cada 100 que vieron una prenda, cuántos miraron esta", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0];
    expect(de100QueVieron(p, 1274)).toBe(9);
  });

  it("dónde se atora la prenda: el paso que pierde más gente, contra lo de costumbre", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0];
    // De 40 en la bolsa, 12 la separaron: pierde más que lo de costumbre (690 de 1530).
    expect(dondeSeAtoraLaPrenda(p, DE_LA_BASE.base)?.i).toBe(3);
  });

  it("con pocas personas, la prenda no tiene un paso «malo»", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, miraron: 6, talla: 4, bolsa: 2, separaron: 0, recogieron: 0 }] })!.prendas[0];
    expect(dondeSeAtoraLaPrenda(p, DE_LA_BASE.base)).toBeNull();
  });

  it("el cambio contra antes, en palabras", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0];
    expect(cambioDeLaPrenda(p)).toEqual({ tono: "verde", texto: "20 % más que antes", sube: 20 });
    expect(cambioDeLaPrenda({ ...p, anterior: 120 }).texto).toBe("Igual que antes");
    expect(cambioDeLaPrenda({ ...p, anterior: 5 }).texto).toBe("Pocas personas para comparar");
    expect(cambioDeLaPrenda({ ...p, anterior: 150 })).toEqual({ tono: "ambar", texto: "20 % menos que antes", sube: -20 });
  });
});

describe("de dónde vienen y a qué hora", () => {
  it("lee los caminos y las ciudades con todas sus claves, sin las que no conoce", () => {
    const r = leerResumen({ ...DE_LA_BASE, caminos: { instagram: 80, fax: 3 }, ciudades: { trujillo: 40, marte: 2 } })!;
    expect(r.caminos.instagram).toBe(80);
    expect(r.caminos.qr).toBe(0);
    expect("fax" in r.caminos).toBe(false);
    expect(r.ciudades.trujillo).toBe(40);
    expect("marte" in r.ciudades).toBe(false);
  });
  it("las horas son 24 o, si no, todas en 0", () => {
    expect(leerResumen({ ...DE_LA_BASE, horas: [1, 2] })!.horas).toHaveLength(24);
  });
  it("la hora con más gente: las 3 horas seguidas que más suman", () => {
    const horas = Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 21 ? 10 : 1));
    expect(picoDeHoras(horas)).toEqual({ desde: 19, hasta: 22, n: 30, de100: 59 });
  });
  it("con muy poca gente no hay hora punta", () => {
    expect(picoDeHoras(Array.from({ length: 24 }, (_, h) => (h === 20 ? 9 : 0)))).toBeNull();
  });
  it("el tramo en palabras", () => {
    expect(tramoTexto(19, 22)).toBe("de 7 a 10 p. m.");
    expect(tramoTexto(11, 14)).toBe("de 11 a. m. a 2 p. m.");
    expect(tramoTexto(21, 24)).toBe("de 9 p. m. a 12 a. m.");
    expect(tramoTexto(0, 3)).toBe("de 12 a 3 a. m.");
  });
});

describe("el período y los filtros", () => {
  const CAMPANAS = [
    { nombre: "Aniversario CAYLA", desde: "2026-10-01", hasta: "2026-10-14" },
    { nombre: "Halloween", desde: "2026-10-17", hasta: "2026-10-31" },
    { nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" },
    { nombre: "Sin fechas", desde: null, hasta: null },
  ];
  it("la campaña que rige hoy, hasta hoy", () => {
    expect(campanaDelPeriodo(CAMPANAS, "2026-10-23")).toEqual({ nombre: "Halloween", desde: "2026-10-17", hasta: "2026-10-23", vigente: true });
  });
  it("si ninguna rige, la última que terminó", () => {
    expect(campanaDelPeriodo(CAMPANAS, "2026-10-15")).toEqual({ nombre: "Aniversario CAYLA", desde: "2026-10-01", hasta: "2026-10-14", vigente: false });
  });
  it("una campaña que todavía no empieza no es un período", () => {
    expect(campanaDelPeriodo([CAMPANAS[2]], "2026-10-23")).toBeNull();
  });
  it("la campaña como período, y sin campaña vuelve a 7 días", () => {
    const c = campanaDelPeriodo(CAMPANAS, "2026-10-23");
    expect(periodoDe("campana", "2026-10-23", c)).toMatchObject({ desde: "2026-10-17", hasta: "2026-10-23", nombre: "Halloween", antes: "los 7 días anteriores" });
    expect(periodoDe("campana", "2026-10-23", null).clave).toBe("7");
    expect(periodoDe("campana", "2026-10-23", c)).toMatchObject({ antDesde: null, antHasta: null, corte: null });
  });
  describe("contra qué se compara cada período (Observatorio)", () => {
    const AHORA = new Date("2026-10-27T20:40:00.000Z"); // las 3:40 p. m. en Lima
    it("Hoy se compara con ayer a esta hora", () => {
      expect(periodoDe("hoy", "2026-10-27", null, AHORA)).toEqual({
        clave: "hoy",
        desde: "2026-10-27",
        hasta: "2026-10-27",
        nombre: "Hoy",
        antes: "ayer a esta hora",
        antDesde: "2026-10-26",
        antHasta: "2026-10-26",
        corte: "2026-10-26T20:40:00.000Z",
      });
    });
    it("Ayer se compara con el mismo día de la semana pasada, nombrado", () => {
      // 27 de octubre de 2026 es martes: ayer fue lunes 26, y el lunes de antes, el 19.
      expect(periodoDe("ayer", "2026-10-27", null)).toMatchObject({ desde: "2026-10-26", hasta: "2026-10-26", antDesde: "2026-10-19", antHasta: "2026-10-19", antes: "el lunes de antes", corte: null });
    });
    it("Este mes se compara con los mismos días del mes anterior", () => {
      expect(periodoDe("mes", "2026-10-27", null)).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-27", antDesde: "2026-09-01", antHasta: "2026-09-27", antes: "los mismos 27 días de setiembre" });
    });
    it("Este mes, el último día de un mes largo no se pasa del mes corto de antes (31 de octubre contra setiembre de 30)", () => {
      expect(periodoDe("mes", "2026-10-31", null)).toMatchObject({ antHasta: "2026-09-30", antes: "los mismos 30 días de setiembre" });
    });
    it("el primer día del mes se compara con el primer día del anterior", () => {
      expect(periodoDe("mes", "2026-11-01", null)).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-01", antDesde: "2026-10-01", antHasta: "2026-10-01", antes: "el 1 de octubre" });
    });
    it("enero mira diciembre del año anterior", () => {
      expect(periodoDe("mes", "2027-01-15", null)).toMatchObject({ antDesde: "2026-12-01", antHasta: "2026-12-15" });
    });
    it("Mes pasado es el mes entero, contra el mes de antes", () => {
      expect(periodoDe("mes-pasado", "2026-10-27", null)).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30", nombre: "Setiembre", antDesde: "2026-08-01", antHasta: "2026-08-31", antes: "agosto" });
      expect(periodoDe("mes-pasado", "2026-03-10", null)).toMatchObject({ desde: "2026-02-01", hasta: "2026-02-28", antDesde: "2026-01-01", antHasta: "2026-01-31" });
    });
    it("los días con los que se compara siempre quedan antes del período (lo exige la base)", () => {
      for (const clave of ["hoy", "ayer", "mes", "mes-pasado"] as const) {
        const p = periodoDe(clave, "2026-10-27", null, AHORA);
        expect((p.antHasta ?? "") < p.desde).toBe(true);
      }
    });
  });
  it("sin comparar prenda por prenda: con corte, ninguna prenda se compara (un día entero contra la mitad de otro)", () => {
    const r = leerResumen({ ...DE_LA_BASE, anterior_corte: "2026-10-26T20:40:00+00:00", prendas: [{ id: "a", nombre: "Blusa", miraron: 5, talla: 3, bolsa: 2, separaron: 1, recogieron: 0, anterior: 40 }] });
    expect(r?.anteriorCorte).toBe("2026-10-26T20:40:00+00:00");
    expect(r?.prendas[0]?.anterior).toBeNull();
    expect(cambioDeLaPrenda(r!.prendas[0]).texto).toBe("Sin comparar prenda por prenda");
  });
  it("lee la dirección e ignora lo que no conoce", () => {
    expect(leerFiltros({ periodo: "mes-pasado", camino: "instagram", ciudad: "trujillo", vista: "tabla" })).toEqual({ periodo: "mes-pasado", camino: "instagram", ciudad: "trujillo" });
    expect(leerFiltros({ periodo: "30" }).periodo).toBe("7"); // el de 30 días ya no existe: un enlace viejo cae en lo de fábrica
    expect(leerFiltros({ periodo: "99", camino: "fax", ciudad: ["lima", "cusco"] })).toEqual({ periodo: "7", camino: null, ciudad: "lima" });
  });
  it("la dirección con un cambio; lo de fábrica no se escribe", () => {
    const f = leerFiltros({ camino: "instagram" });
    expect(hrefTrafico(f, { ciudad: "lima" })).toBe("/tienda-web/trafico?camino=instagram&ciudad=lima");
    expect(hrefTrafico(f, { camino: null })).toBe("/tienda-web/trafico");
    expect(hrefTrafico(f, { periodo: "campana" })).toBe("/tienda-web/trafico?periodo=campana&camino=instagram");
  });
  it("el rango en palabras", () => {
    expect(rangoTexto("2026-10-17", "2026-10-23")).toBe("Del 17 al 23 de octubre");
    expect(rangoTexto("2026-09-24", "2026-10-23")).toBe("Del 24 de setiembre al 23 de octubre");
    expect(rangoTexto("2026-10-23", "2026-10-23")).toBe("El 23 de octubre");
  });
  it("a quiénes se mira, en palabras", () => {
    expect(quienesTexto("instagram", "trujillo")).toBe("por Instagram desde Trujillo");
    expect(quienesTexto("qr", null)).toBe("por el QR de la tienda");
    expect(quienesTexto(null, "fuera")).toBe("desde fuera del Perú");
    expect(quienesTexto(null, null)).toBe("");
  });
});

describe("la serie del gráfico principal (Observatorio, actividad 2)", () => {
  // [momento, entraron, vieron, separaron, recogieron]
  const S = {
    por: "hora" as const,
    actual: [[9, 10, 8, 1, 0], [10, 20, 15, 2, 1], [15, 6, 4, 0, 0]] as [number, number, number, number, number][],
    antes: [[9, 8, 6, 1, 0], [10, 16, 12, 1, 1], [15, 10, 8, 1, 0], [20, 30, 22, 3, 2]] as [number, number, number, number, number][],
  };
  it("lee la serie de la base, y sin serie sale vacía (no rota)", () => {
    expect(leerResumen({ ...DE_LA_BASE, serie: { por: "hora", actual: [[1, 2, 1, 0, 0], "basura"], antes: [] } })?.serie).toEqual({ por: "hora", actual: [[1, 2, 1, 0, 0]], antes: [] });
    expect(leerResumen(DE_LA_BASE)?.serie).toEqual({ por: "dia", actual: [], antes: [] });
  });
  it("una cifra hora por hora, con cero donde no entró nadie, y acumulada", () => {
    expect(valoresDe(S.actual, "entraron", 12, false).slice(8, 12)).toEqual([0, 10, 20, 0]);
    expect(valoresDe(S.actual, "entraron", 12, true).slice(8, 12)).toEqual([0, 10, 30, 30]);
    expect(valoresDe(S.actual, "separaron", 12, false)[10]).toBe(2);
  });
  it("«de cada 100» va siempre acumulado: separaron hasta ahí entre entraron hasta ahí", () => {
    expect(valoresDe(S.actual, "de100", 11, false)[10]).toBeCloseTo((3 / 30) * 100);
    expect(valoresDe(S.actual, "de100", 11, false)[0]).toBe(0);
  });
  it("Hoy, hora por hora, la hora en curso no se dibuja (está a medias); acumulado sí", () => {
    expect(graficoDe(S, "entraron", { largo: 24, largoAntes: 24, hastaX: 15, acumulado: false }).serie.at(-1)?.x).toBe(14);
    expect(graficoDe(S, "entraron", { largo: 24, largoAntes: 24, hastaX: 15, acumulado: true }).serie.at(-1)?.x).toBe(15);
  });
  it("la referencia es el día de antes entero, aunque hoy llegue solo hasta ahora", () => {
    expect(graficoDe(S, "entraron", { largo: 24, largoAntes: 24, hastaX: 15, acumulado: false }).referencia).toHaveLength(24);
  });
  it("el cierre esperado sigue la forma de ayer al ritmo de hoy (36 contra 34 a esta hora: el resto de ayer, crecido igual)", () => {
    const g = graficoDe(S, "entraron", { largo: 24, largoAntes: 24, hastaX: 15, acumulado: true });
    expect(g.proyeccion?.[0]).toEqual({ x: 15, y: 36 });
    // Ayer cerró en 64 (34 a las 3 p. m. + 30 después): hoy, 36 + 30 × 36/34 ≈ 68.
    expect(g.cierre).toBe(68);
  });
  it("sin hoy, sin acumular o en «de cada 100», no hay cierre esperado", () => {
    expect(graficoDe(S, "entraron", { largo: 24, largoAntes: 24, hastaX: null, acumulado: true }).proyeccion).toBeNull();
    expect(graficoDe(S, "entraron", { largo: 24, largoAntes: 24, hastaX: 15, acumulado: false }).proyeccion).toBeNull();
    expect(graficoDe(S, "de100", { largo: 24, largoAntes: 24, hastaX: 15, acumulado: true }).proyeccion).toBeNull();
  });
  it("el total de cada cifra y su «antes»: en Hoy, el antes llega hasta esta hora de ayer", () => {
    const r = leerResumen({ ...DE_LA_BASE, pasos: [36, 27, 10, 6, 3, 1], anterior: 34, serie: S })!;
    expect(totalDe(r, "entraron", 15)).toEqual({ valor: 36, antes: 34 });
    expect(totalDe(r, "vieron", 15)).toEqual({ valor: 27, antes: 26 }); // sin las 8 p. m. de ayer
    expect(totalDe(r, "vieron", null)).toEqual({ valor: 27, antes: 48 });
    expect(totalDe(r, "de100", 15).valor).toBeCloseTo((3 / 36) * 100);
  });
  it("el cambio en palabras: % en las cuentas, puntos en «de cada 100», y nada sin con qué comparar", () => {
    expect(cambioDe("entraron", 120, 100)).toEqual({ tono: "verde", texto: "▲ 20 %" });
    expect(cambioDe("entraron", 120, 5)).toBeNull();
    expect(cambioDe("de100", 7.5, 7.8)).toEqual({ tono: "ambar", texto: "▼ 0.3 pts" });
    expect(cambioDe("de100", 7.5, 7.5)).toEqual({ tono: "neutro", texto: "Igual" });
    expect(cambioDe("separaron", 10, null)).toBeNull();
  });
  it("la respuesta en una frase, con el tiempo del verbo de cada período", () => {
    expect(veredictoDe({ clave: "hoy", nombre: "Hoy", antes: "ayer a esta hora" }, 17).titulo).toBe("Hoy va mejor que ayer a esta hora");
    expect(veredictoDe({ clave: "mes-pasado", nombre: "Setiembre", antes: "agosto" }, -12)).toEqual({ tono: "ambar", titulo: "Setiembre fue más lento que agosto" });
    expect(veredictoDe({ clave: "7", nombre: "Últimos 7 días", antes: "los 7 días anteriores" }, 1).titulo).toBe("Estos 7 días van igual que los 7 días anteriores");
    expect(veredictoDe({ clave: "hoy", nombre: "Hoy", antes: "ayer a esta hora" }, null).tono).toBe("neutro");
  });
  it("las marcas del tiempo: cada 6 horas en un día, hasta 5 fechas en un mes (caben a 375 px)", () => {
    expect(marcasDelTiempo("hora", 24, "2026-10-27").map((m) => m.x)).toEqual([0, 6, 12, 18]);
    const mes = marcasDelTiempo("dia", 27, "2026-10-01");
    expect(mes[0]).toEqual({ x: 0, texto: "1 oct" });
    expect(mes.length).toBeLessThanOrEqual(5);
  });
});

describe("el mapa de calor: día de la semana × hora", () => {
  // 4 semanas: cada día cae 4 veces. Los sábados (5) y domingos (6) a las 8 p. m. entra más gente; el lunes a las 3 a. m., casi nadie.
  const calor = {
    desde: "2026-09-30",
    hasta: "2026-10-27",
    dias: [4, 4, 4, 4, 4, 4, 4],
    celdas: [
      [5, 20, 40],
      [6, 20, 36],
      [5, 21, 28],
      [6, 19, 24],
      [4, 20, 20],
      [0, 12, 8],
      [2, 12, 4],
      [0, 3, 1],
    ] as [number, number, number][],
  };

  it("personas por hora en promedio: lo que entró en la celda entre las veces que cae ese día", () => {
    const l = lecturaDeCalor(calor);
    expect(l.prom[5][20]).toBe(10);
    expect(l.prom[0][3]).toBe(0.25);
    expect(l.maximo).toBe(10);
    expect(l.porDia[5]).toBe(17);
    expect(l.porHora[20]).toBe(96);
  });

  it("los dos días con más gente, en orden de la semana; las horas fuertes; el tramo más tranquilo", () => {
    const l = lecturaDeCalor(calor);
    expect(l.dias).toEqual([5, 6]);
    expect(diasTexto(l.dias!)).toBe("sábados y domingos");
    expect(l.pico).toEqual({ desde: 19, hasta: 22 });
    expect(l.tranquilo).toEqual({ desde: 0, hasta: 3 });
    expect([...l.fuertes]).toEqual([5 * 24 + 20, 6 * 24 + 20, 5 * 24 + 21, 6 * 24 + 19, 4 * 24 + 20, 0 * 24 + 12]);
  });

  it("con menos de 10 personas en toda la ventana no hay veredicto, pero sí el dibujo", () => {
    const l = lecturaDeCalor({ ...calor, celdas: [[5, 20, 3], [6, 20, 2]] });
    expect(l.prom[5][20]).toBe(0.75);
    expect(l.dias).toBeNull();
    expect(l.pico).toBeNull();
    expect(l.fuertes.size).toBe(0);
  });

  it("un día que no cae en la ventana no divide por cero", () => {
    expect(lecturaDeCalor({ ...calor, dias: [0, 4, 4, 4, 4, 4, 4] }).prom[0][12]).toBe(0);
  });

  it("lee lo que manda la base y descarta celdas fuera de la semana; una base de antes no trae mapa", () => {
    const r = leerResumen({ ...DE_LA_BASE, calor: { ...calor, celdas: [...calor.celdas, [7, 1, 3], [1, 24, 3]] } })!;
    expect(r.calor!.celdas).toHaveLength(8);
    expect(leerResumen(DE_LA_BASE)!.calor).toBeNull();
  });

  it("nombres: «Sábado, 8 p. m.» y el día de la semana de una fecha (el 28 de octubre de 2026 es miércoles)", () => {
    expect(celdaTexto(5, 20)).toBe("Sábado, 8 p. m.");
    expect(diaDeLaSemana("2026-10-28")).toBe(2);
    expect(diaDeLaSemana("2026-10-25")).toBe(6);
  });
});

describe("De dónde vienen: el mapa pintado y cuánto rinde cada camino", () => {
  it("cada departamento es la ciudad de la base (Lima junta Lima, Lima Metropolitana y el Callao)", () => {
    expect(["PE-LAL", "PE-LMA", "PE-CAL", "PE-LIM", "PE-ARE", "PE-LAM", "PE-PIU", "PE-CUS", "PE-LOR", "US"].map(ciudadDeRegion)).toEqual([
      "trujillo", "lima", "lima", "lima", "arequipa", "chiclayo", "piura", "cusco", "otras", "fuera",
    ]);
  });

  it("el tinte va de 6 (nadie) a 92 (el que más)", () => {
    expect([tinteDeRegion(0, 400), tinteDeRegion(200, 400), tinteDeRegion(400, 400), tinteDeRegion(3, 0)]).toEqual([6, 49, 92, 6]);
  });

  it("lee los departamentos y descarta lo que no es un código del Perú o una cifra", () => {
    const r = leerResumen({ ...DE_LA_BASE, regiones: { "PE-LAL": 412, "PE-LMA": 300, US: 4, "PE-XX": 2, "PE-ARE": -1 } })!;
    expect(r.regiones).toEqual({ "PE-LAL": 412, "PE-LMA": 300 });
  });

  it("un camino rinde si separa un cuarto más que el promedio; poco, si separa un cuarto menos y trae 8 de cada 100 o más", () => {
    // Entre todos: 2000 entraron, 160 separaron (8 de cada 100).
    expect(rindeElCamino(400, 48, 2000, 160)).toEqual({ de100: 12, tono: "verde" });
    expect(rindeElCamino(800, 40, 2000, 160)).toEqual({ de100: 5, tono: "ambar" });
    expect(rindeElCamino(100, 4, 2000, 160).tono).toBe("neutro");
    expect(rindeElCamino(12, 0, 2000, 160).tono).toBe("neutro");
  });

  it("la ciudad sin tienda desde la que más miran", () => {
    expect(ciudadSinTienda({ trujillo: 900, lima: 700, arequipa: 380, chiclayo: 120, piura: 150, cusco: 0, otras: 90, fuera: 3, sin_dato: 40 })).toBe("piura");
    expect(ciudadSinTienda({ trujillo: 9, lima: 0, arequipa: 0, chiclayo: 0, piura: 0, cusco: 0, otras: 0, fuera: 0, sin_dato: 0 })).toBeNull();
  });
});

describe("Qué prendas miran: la tabla que se ordena", () => {
  const prenda = (nombre: string, miraron: number, separaron: number) => ({ ...leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0], id: nombre, nombre, recorrido: [miraron, 0, 0, separaron, 0] as [number, number, number, number, number] });
  const lista = [prenda("Blusa", 100, 10), prenda("Casaca", 40, 12), prenda("Falda", 200, 4), prenda("Polo", 6, 3)];

  it("ordena por miradas, por cuántos de cada 100 separan o por cuántos separaron, sin tocar la lista que llega", () => {
    expect(ordenarPrendas(lista, "miraron", "desc").map((p) => p.nombre)).toEqual(["Falda", "Blusa", "Casaca", "Polo"]);
    // El Polo (3 de 6) separa más que todas, pero con 6 personas va al final.
    expect(ordenarPrendas(lista, "separan", "desc").map((p) => p.nombre)).toEqual(["Casaca", "Blusa", "Falda", "Polo"]);
    expect(ordenarPrendas(lista, "separan", "asc").map((p) => p.nombre)).toEqual(["Falda", "Blusa", "Casaca", "Polo"]);
    expect(ordenarPrendas(lista, "separaron", "asc").map((p) => p.nombre)).toEqual(["Polo", "Falda", "Blusa", "Casaca"]);
    expect(lista[0].nombre).toBe("Blusa");
  });

  it("el promedio de la tienda: de 346 que miraron una prenda, 29 la separaron", () => {
    expect(separanEnPromedio(lista)).toBeCloseTo(29 / 346);
    expect(separanEnPromedio([])).toBe(0);
  });

  it("estrella si separa un 30 % más que el promedio; revisar si menos de la mitad; con poca gente no se juzga", () => {
    const prom = separanEnPromedio(lista);
    expect(estadoDePrenda(lista[1], prom)).toEqual({ tono: "verde", texto: "Estrella" });
    expect(estadoDePrenda(lista[2], prom)).toEqual({ tono: "ambar", texto: "Revisar" });
    expect(estadoDePrenda(lista[0], prom)).toEqual({ tono: "neutro", texto: "Normal" });
    expect(estadoDePrenda(lista[3], prom).texto).toBe("Pocas personas");
  });

  it("la barra de separan: el promedio en la mitad, el doble la llena", () => {
    const prom = separanEnPromedio(lista);
    expect(barraDeSeparan(prenda("X", 1000, Math.round(prom * 1000)), prom)).toBe(50);
    expect(barraDeSeparan(lista[1], prom)).toBe(100);
    expect(separanDe100(lista[1])).toBe(30);
  });
});

describe("Tallas que piden y no hay, y quién entra", () => {
  const tallas = {
    desde: "2026-09-30",
    hasta: "2026-10-27",
    filas: [
      { categoria: "Blusas", prefijo: "BLU", familia: "SUP", modelos: 14, tallas: [["XL", 30, 9, 1], ["M", 120, 4, 5], ["S", 80, 30, 0], ["L", 90, 6, 4]] },
      { categoria: "Pantalones", prefijo: "PAN", familia: "INF", modelos: 10, tallas: [["30", 40, 2, 3], ["28", 20, 12, 0]] },
      { categoria: "Vacía", prefijo: null, familia: null, modelos: 2, tallas: [] },
    ],
  };

  it("lee las tallas en orden de talla y deja fuera la categoría sin tallas", () => {
    const r = leerResumen({ ...DE_LA_BASE, tallas, quienes: { nuevos: 68, nuevos_separan: 4, vuelven: 32, vuelven_separan: 5 } })!;
    expect(r.tallas!.filas.map((f) => f.categoria)).toEqual(["Blusas", "Pantalones"]);
    expect(r.tallas!.filas[0].tallas.map((t) => t.talla)).toEqual(["S", "M", "L", "XL"]);
    expect(r.tallas!.filas[1].tallas.map((t) => t.talla)).toEqual(["28", "30"]);
    expect(r.quienes).toEqual({ nuevos: 68, nuevosSeparan: 4, vuelven: 32, vuelvenSeparan: 5 });
  });

  it("falta si la piden mucho y queda menos de 1 unidad por cada 10 personas", () => {
    expect(tallaFalta({ talla: "M", piden: 120, quedan: 4, sin: 5 }, 120)).toBe(true);
    expect(tallaFalta({ talla: "S", piden: 80, quedan: 30, sin: 0 }, 120)).toBe(false);
    expect(tallaFalta({ talla: "XL", piden: 30, quedan: 1, sin: 1 }, 120)).toBe(false); // 30 < 36: no la piden tanto
    expect(tallaFalta({ talla: "M", piden: 4, quedan: 0, sin: 1 }, 4)).toBe(false); // 4 personas no son noticia
  });

  it("las que faltan, de la más pedida a la menos, con su categoría", () => {
    const r = leerResumen({ ...DE_LA_BASE, tallas })!;
    expect(tallasQueFaltan(r.tallas!.filas).map((t) => `${t.talla} de ${t.categoria}`)).toEqual(["M de Blusas", "L de Blusas", "30 de Pantalones"]);
  });

  it("las categorías van de la que más gente eligió talla a la que menos; a igual gente, la que tiene una talla que falta primero", () => {
    const r = leerResumen({ ...DE_LA_BASE, tallas })!;
    expect(ordenarCategorias(r.tallas!.filas).map((f) => f.categoria)).toEqual(["Blusas", "Pantalones"]);
    const empate = [
      { categoria: "A", prefijo: null, familia: null, modelos: 1, tallas: [{ talla: "M", piden: 10, quedan: 50, sin: 0 }] },
      { categoria: "B", prefijo: null, familia: null, modelos: 1, tallas: [{ talla: "M", piden: 10, quedan: 0, sin: 1 }] },
      { categoria: "C", prefijo: null, familia: null, modelos: 1, tallas: [{ talla: "S", piden: 0, quedan: 3, sin: 0 }] },
    ];
    expect(ordenarCategorias(empate).map((f) => f.categoria)).toEqual(["B", "A", "C"]);
  });

  it("quién entra: de cada 100, nuevos y que vuelven, y cuántos de cada grupo separan", () => {
    expect(quienesEntran({ nuevos: 68, nuevosSeparan: 4, vuelven: 32, vuelvenSeparan: 5 })).toEqual({ nuevos: 68, vuelven: 32, nuevosSeparan: 6, vuelvenSeparan: 16 });
    expect(quienesEntran({ nuevos: 0, nuevosSeparan: 0, vuelven: 0, vuelvenSeparan: 0 })).toBeNull();
  });
});

describe("Necesita tu atención: reponer, recoger, empujar", () => {
  const p = (nombre: string, miraron: number, quedan: number, vendidas: number) => ({
    id: nombre, nombre, categoria: "Blusas", prefijo: "BLU", familia: "SUP", foto: null, hex: null, miraron, separaron: 2, quedan, vendidas,
  });
  const prendas = [p("Emma", 420, 18, 56), p("Mía", 310, 9, 30), p("Lía", 290, 40, 4), p("Aura", 180, 0, 12), p("Sara", 160, 26, 0), p("Noa", 6, 1, 20), p("Ámbar", 120, 3, 0)];

  it("días de stock al ritmo de las últimas 4 semanas; sin ventas no se agota", () => {
    expect(diasDeStock(prendas[0])).toBe(9);
    expect(diasDeStock(prendas[4])).toBeNull();
    expect([diasDeStockTexto(9), diasDeStockTexto(0), diasDeStockTexto(null), diasDeStockTexto(1)]).toEqual(["9 días", "Agotada", "Sin ventas", "1 día"]);
  });

  it("reponer: las que miran y se agotan en menos de 14 días, la agotada primero; con poca gente, no", () => {
    expect(paraReponer(prendas).map((x) => `${x.nombre} ${Math.round(x.dias)}`)).toEqual(["Aura 0", "Mía 8", "Emma 9"]);
  });

  it("empujar: las que miran y no salen (más de 40 días o sin ventas) con 5 unidades o más", () => {
    expect(paraEmpujar(prendas).map((x) => x.nombre)).toEqual(["Lía", "Sara"]);
  });

  it("un pedido pagado espera en días de Lima y se atrasa al llegar al plazo de aviso", () => {
    const w = { id: "w", codigo: "W-1043", numero: 1043, sede: "Trujillo", pagadoEn: "2026-10-21T04:30:00Z", prendas: 1, prenda: "Blusa Emma", talla: "M" };
    expect(esperaDelPedido(w, 7, "2026-10-27")).toEqual({ dias: 7, atrasado: true });
    expect(esperaDelPedido(w, 7, "2026-10-26")).toEqual({ dias: 6, atrasado: false });
  });

  it("lee lo que manda la base", () => {
    const r = leerResumen({
      ...DE_LA_BASE,
      atencion: { desde: "2026-09-30", hasta: "2026-10-27", dias_aviso: 7, recoger_total: 3, prendas: [{ ...prendas[0] }, { id: "x" }], recoger: [{ id: "w", codigo: "W-1", numero: 1, sede: "Lima", pagado_en: "2026-10-20T15:00:00Z", prendas: 2, prenda: "Casaca", talla: "S" }] },
    })!;
    expect(r.atencion!.prendas).toHaveLength(1);
    expect(r.atencion!.recoger[0]).toMatchObject({ sede: "Lima", pagadoEn: "2026-10-20T15:00:00Z", prendas: 2 });
    expect(r.atencion!.recogerTotal).toBe(3);
  });
});

describe("el calendario del mes", () => {
  // Octubre de 2026 empieza en jueves (3 vacías antes) y tiene 31 días; hoy es el 27.
  const cal = { mes: "2026-10-01", dias: [[3, 40], [4, 46], [10, 50], [11, 52], [17, 44], [18, 48], [20, 12], [27, 9]] as [number, number][] };

  it("arma el mes de lunes a domingo, con el período resaltado, hoy marcado y los días que no llegan vacíos", () => {
    const c = celdasDelCalendario(cal, { desde: "2026-10-21", hasta: "2026-10-27" }, "2026-10-27");
    expect(c.antes).toBe(3);
    expect(c.dias).toHaveLength(31);
    expect(c.dias[2]).toEqual({ dia: 3, fecha: "2026-10-03", n: 40, enPeriodo: false, hoy: false });
    expect(c.dias[1].n).toBe(0);
    expect(c.dias[26]).toMatchObject({ dia: 27, n: 9, enPeriodo: true, hoy: true });
    expect(c.dias[27].n).toBeNull();
  });

  it("el rojo de un día va de 6 a 56 (su número en tinta se lee en los dos temas); fuera del período, el 40 %", () => {
    expect([tinteDelDia(0, 400, true), tinteDelDia(400, 400, true), tinteDelDia(200, 400, true), tinteDelDia(400, 400, false)]).toEqual([6, 56, 31, 22]);
  });

  it("febrero de un año no bisiesto tiene 28 días", () => {
    expect(celdasDelCalendario({ mes: "2027-02-01", dias: [] }, { desde: "2027-02-01", hasta: "2027-02-28" }, "2027-03-05").dias).toHaveLength(28);
  });

  it("los dos días de la semana con más gente: aquí, sábados y domingos", () => {
    const c = celdasDelCalendario(cal, { desde: "2026-10-01", hasta: "2026-10-27" }, "2026-10-27");
    expect(diasFuertesDelMes(c.dias)).toEqual([5, 6]);
    expect(diasFuertesDelMes(celdasDelCalendario({ mes: "2026-10-01", dias: [[3, 4]] }, { desde: "2026-10-01", hasta: "2026-10-27" }, "2026-10-27").dias)).toBeNull();
    expect(mesTexto("2026-09-01")).toBe("Setiembre");
  });
});

describe("el globito del gráfico: qué momento es y con cuál se compara", () => {
  it("7 días: el día y el mismo día de la semana pasada", () => {
    expect(filasDelGlobito({ por: "dia", clave: "7", desde: "2026-10-21", antDesde: "2026-10-14" }, 6)).toEqual({
      actual: "Martes 27 oct",
      antes: "Martes pasado · 20 oct",
    });
  });
  it("este mes contra los mismos días del mes anterior: la fecha, porque no cae el mismo día de la semana", () => {
    expect(filasDelGlobito({ por: "dia", clave: "mes", desde: "2026-10-01", antDesde: "2026-09-01" }, 26)).toEqual({
      actual: "Martes 27 oct",
      antes: "Domingo 27 set",
    });
  });
  it("hoy y ayer, hora por hora", () => {
    expect(filasDelGlobito({ por: "hora", clave: "hoy", desde: "2026-10-27", antDesde: "2026-10-26" }, 15)).toEqual({ actual: "Hoy · 3 p. m.", antes: "Ayer · 3 p. m." });
    expect(filasDelGlobito({ por: "hora", clave: "ayer", desde: "2026-10-26", antDesde: "2026-10-19" }, 20)).toEqual({ actual: "Ayer · 8 p. m.", antes: "Lunes pasado · 19 oct · 8 p. m." });
  });
});
