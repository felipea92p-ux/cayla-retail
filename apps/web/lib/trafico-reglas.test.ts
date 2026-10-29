import { describe, expect, it } from "vitest";
import {
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
  tramosDeTres,
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

  it("singular y plural en la explicación", () => {
    expect(explicaAtora({ i: 4, llegaron: 1, siguieron: 0, seFueronDe100: 100, pocas: true })).toContain("de 1 persona que la puso en la bolsa, 0 separaron.");
    expect(explicaAtora({ i: 4, llegaron: 394, siguieron: 1, seFueronDe100: 100, pocas: false })).toContain("de 394 personas que la pusieron en la bolsa, 1 separó.");
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

  it("una base de antes, sin prendas, da la vitrina vacía", () => {
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
  it("los 8 tramos de 3 horas suman todo el día", () => {
    const horas = Array.from({ length: 24 }, (_, h) => h);
    const t = tramosDeTres(horas);
    expect(t).toHaveLength(8);
    expect(t.reduce((a, x) => a + x.n, 0)).toBe(276);
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
    expect(leerFiltros({ periodo: "mes-pasado", camino: "instagram", ciudad: "trujillo", vista: "tabla" })).toEqual({ periodo: "mes-pasado", camino: "instagram", ciudad: "trujillo", vista: "tabla" });
    expect(leerFiltros({ periodo: "30" }).periodo).toBe("7"); // el de 30 días ya no existe: un enlace viejo cae en lo de fábrica
    expect(leerFiltros({ periodo: "99", camino: "fax", ciudad: ["lima", "cusco"] })).toEqual({ periodo: "7", camino: null, ciudad: "lima", vista: "grafico" });
  });
  it("la dirección con un cambio; lo de fábrica no se escribe", () => {
    const f = leerFiltros({ camino: "instagram" });
    expect(hrefTrafico(f, { ciudad: "lima" })).toBe("/tienda-web/trafico?camino=instagram&ciudad=lima");
    expect(hrefTrafico(f, { camino: null })).toBe("/tienda-web/trafico");
    expect(hrefTrafico(f, { periodo: "campana", vista: "tabla" })).toBe("/tienda-web/trafico?periodo=campana&camino=instagram&vista=tabla");
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
