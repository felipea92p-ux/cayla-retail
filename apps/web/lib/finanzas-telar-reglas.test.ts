import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALCANCE_POR_RUTA,
  alcanceDeRuta,
  dichoDelAlcance,
  aceptaVariasSedes,
  alternarSede,
  avisoDeAUna,
  claveDeSedes,
  colorDeSede,
  dichoDeLaSede,
  DICHO_EMPRESA_SIN_BALANCE,
  esBalanceDeEmpresa,
  esMesTelar,
  hrefConSedeYMes,
  hrefTelar,
  hilosDeLaRuta,
  mesDeLaRuta,
  mesTelar,
  porSedeDe,
  rotuloDeSedes,
  RUTAS_CON_VARIAS_SEDES,
  sedeDeLaUrl,
  sedesDeLaUrl,
  sedesDelTelar,
  sedesElegidas,
  sedesMarcadas,
  tramosDelOrillo,
  ultimoMesDeLaRuta,
} from "./finanzas-telar-reglas";

const UBIC = [
  { id: "t", nombre: "Taller", tipo: "taller" },
  { id: "l", nombre: "Tienda Lima", tipo: "tienda" },
  { id: "tr", nombre: "Tienda Trujillo", tipo: "tienda" },
  { id: "a", nombre: "Tienda Arequipa", tipo: "tienda" },
];
const SEDES = sedesDelTelar(UBIC, true);
const HOY = "2026-10";

describe("la sede de la URL", () => {
  it("lee ?sede=; ?ver= (el selector viejo) gana mientras dure el cambio; sin nada, todas", () => {
    expect(sedeDeLaUrl({ sede: "l" })).toBe("l");
    expect(sedeDeLaUrl({ sede: "l", ver: "empresa" })).toBe("empresa");
    expect(sedeDeLaUrl({})).toBe("todas");
    expect(sedeDeLaUrl({ sede: "  " })).toBe("todas");
  });
});

describe("varias sedes a la vez (Felipe 2026-10-24)", () => {
  const T = SEDES.map((s) => s.clave); // tr, a, l, t, empresa

  it("la URL trae una lista con comas, sin repetidas; «todas» o nada es la lista vacía", () => {
    expect(sedesDeLaUrl({ sede: "l,tr" })).toEqual(["l", "tr"]);
    expect(sedesDeLaUrl({ sede: "l, l ,tr," })).toEqual(["l", "tr"]);
    expect(sedesDeLaUrl({ sede: "todas" })).toEqual([]);
    expect(sedesDeLaUrl({})).toEqual([]);
  });

  it("una pantalla que mira de a una recibe la única elegida, o «todas» si hay varias (nunca la primera de la lista)", () => {
    expect(sedeDeLaUrl({ sede: "l" })).toBe("l");
    expect(sedeDeLaUrl({ sede: "l,tr" })).toBe("todas");
  });

  it("tocar suma y quita; quitar la última vuelve a todas", () => {
    let e = alternarSede([], "l", SEDES);
    expect(e).toEqual(["l"]);
    e = alternarSede(e, "tr", SEDES);
    expect(e).toEqual(["tr", "l"]);
    e = alternarSede(e, "l", SEDES);
    expect(e).toEqual(["tr"]);
    expect(alternarSede(e, "tr", SEDES)).toEqual([]);
  });

  it("marcar todas una por una se vuelve «Todas» sola", () => {
    let e: string[] = [];
    for (const c of T) e = alternarSede(e, c, SEDES);
    expect(e).toEqual([]);
  });

  it("«Todas» limpia lo elegido", () => {
    expect(alternarSede(["l", "tr"], "todas", SEDES)).toEqual([]);
  });

  it("en una pantalla que mira de a una, tocar deja solo esa (y tocarla de nuevo vuelve a todas)", () => {
    expect(alternarSede(["l", "tr"], "a", SEDES, true)).toEqual(["a"]);
    expect(alternarSede(["a"], "a", SEDES, true)).toEqual([]);
  });

  it("lo marcado ignora sedes que la cuenta no ve; quien no ve todo, siempre la suya", () => {
    expect(sedesElegidas(["l", "no-existe"], SEDES, true, "tr")).toEqual(["l"]);
    expect(sedesElegidas(T, SEDES, true, "tr")).toEqual([]);
    expect(sedesElegidas(["l"], SEDES, false, "tr")).toEqual(["tr"]);
  });

  it("en la URL van en el orden de la barra", () => {
    expect(claveDeSedes(["l", "tr"], SEDES)).toBe("tr,l");
    expect(claveDeSedes([], SEDES)).toBe("todas");
  });

  it("dice cuáles se miran", () => {
    expect(dichoDeLaSede(["tr", "l"], SEDES)).toBe("Viendo Trujillo y Lima");
    expect(dichoDeLaSede(["tr", "l", "t"], SEDES)).toBe("Viendo Trujillo, Lima y Taller");
    expect(dichoDeLaSede(["l"], SEDES)).toBe("Viendo solo Lima");
    expect(dichoDeLaSede([], SEDES)).toBe("Viendo las cinco sedes juntas");
  });

  it("el menú lateral lleva la sede y el mes de una pantalla de Finanzas a otra, y a nada más", () => {
    const aqui = [["sede", "tr,l"], ["mes", "2026-09"], ["tab", "fijos"]] as [string, string][];
    expect(hrefConSedeYMes("/finanzas/dinero", "/finanzas/gastos", aqui)).toBe("/finanzas/dinero?sede=tr%2Cl&mes=2026-09");
    expect(hrefConSedeYMes("/ventas", "/finanzas/gastos", aqui)).toBe("/ventas");
    expect(hrefConSedeYMes("/finanzas/dinero", "/ventas", aqui)).toBe("/finanzas/dinero");
    expect(hrefConSedeYMes("/finanzas/dinero", "/finanzas/gastos", [["sede", "todas"]])).toBe("/finanzas/dinero");
  });

  it("solo juntan varias sedes las pantallas que lo declaran (Gastos, desde el 2026-10-24)", () => {
    expect(RUTAS_CON_VARIAS_SEDES).toContain("/finanzas/gastos");
    expect(aceptaVariasSedes("/finanzas/gastos")).toBe(true);
    expect(aceptaVariasSedes("/finanzas/gastos-viejos")).toBe(false);
    expect(aceptaVariasSedes("/finanzas/dinero")).toBe(RUTAS_CON_VARIAS_SEDES.includes("/finanzas/dinero"));
  });
});

describe("los hilos", () => {
  it("van en el orden del telar, con Empresa al final y el nombre corto", () => {
    expect(SEDES.map((s) => [s.nombre, s.color])).toEqual([
      ["Trujillo", "tru"],
      ["Arequipa", "aqp"],
      ["Lima", "lim"],
      ["Taller", "tal"],
      ["Empresa", "emp"],
    ]);
  });

  it("las tiendas con su nombre de verdad, «Tienda TRU», «Tienda AQP» y «Tienda LIM», cada una su color", () => {
    expect(colorDeSede({ nombre: "Tienda TRU", tipo: "tienda" })).toBe("tru");
    expect(colorDeSede({ nombre: "Tienda AQP", tipo: "tienda" })).toBe("aqp");
    expect(colorDeSede({ nombre: "Tienda LIM", tipo: "tienda" })).toBe("lim");
    expect(colorDeSede({ nombre: "tru" })).toBe("tru");
    expect(colorDeSede({ nombre: "Tienda Trujillo" })).toBe("tru");
  });

  it("la sigla va entera: una palabra que solo la contiene no es esa sede", () => {
    expect(colorDeSede({ nombre: "Tienda Truco", tipo: "tienda" })).toBe("otra");
    expect(colorDeSede({ nombre: "Limpieza", tipo: "tienda" })).toBe("otra");
    expect(colorDeSede({ nombre: "Aqpa", tipo: "tienda" })).toBe("otra");
    expect(colorDeSede({ nombre: "Almacén LIM", tipo: "almacen" })).toBe("otra");
  });

  it("con los nombres de verdad, la barra sale en el orden del telar y cada hilo con su color", () => {
    const reales = sedesDelTelar(
      [
        { id: "a", nombre: "Tienda AQP", tipo: "tienda" },
        { id: "l", nombre: "Tienda LIM", tipo: "tienda" },
        { id: "t", nombre: "Tienda TRU", tipo: "tienda" },
        { id: "w", nombre: "Taller", tipo: "taller" },
      ],
      true,
    );
    expect(reales.map((x) => [x.nombre, x.color])).toEqual([["TRU", "tru"], ["AQP", "aqp"], ["LIM", "lim"], ["Taller", "tal"], ["Empresa", "emp"]]);
  });

  it("una sede que no se reconoce no toma el color de otra", () => {
    expect(colorDeSede({ nombre: "Tienda Cusco", tipo: "tienda" })).toBe("otra");
    expect(colorDeSede({ nombre: "Almacén Lima", tipo: "almacen" })).toBe("otra");
  });

  it("dice qué se está mirando", () => {
    expect(dichoDeLaSede("todas", SEDES)).toBe("Viendo las cinco sedes juntas");
    expect(dichoDeLaSede("l", SEDES)).toBe("Viendo solo Lima");
    expect(dichoDeLaSede("todas", SEDES.slice(0, 1))).toBe("Viendo Trujillo");
  });
});

describe("las direcciones", () => {
  const op = { mismaPantalla: true, mesDeHoy: HOY };
  it("en la misma pantalla conserva lo suyo y quita ?ver=", () => {
    expect(hrefTelar("/finanzas/gastos", [["tab", "fijos"], ["ver", "l"]], { sede: "tr" }, op)).toBe("/finanzas/gastos?tab=fijos&sede=tr");
  });

  it("al cambiar de submódulo solo viajan la sede y el mes", () => {
    const actuales: [string, string][] = [["tab", "fijos"], ["sede", "l"], ["mes", "2026-09"]];
    expect(hrefTelar("/finanzas/resumen", actuales, {}, { mismaPantalla: false, mesDeHoy: HOY })).toBe("/finanzas/resumen?sede=l&mes=2026-09");
  });

  it("todas y el mes de hoy no se escriben", () => {
    expect(hrefTelar("/finanzas/gastos", [["sede", "l"], ["mes", "2026-09"]], { sede: "todas", mes: HOY }, op)).toBe("/finanzas/gastos");
  });

  it("un ?ver= viejo se vuelve ?sede= al pasar a otro submódulo", () => {
    expect(hrefTelar("/finanzas/dinero", [["ver", "empresa"]], {}, { mismaPantalla: false, mesDeHoy: HOY })).toBe("/finanzas/dinero?sede=empresa");
  });

  it("el mes va con su cero, como lo lee Gastos", () => {
    expect(mesTelar(2026, 9)).toBe("2026-09");
    expect(esMesTelar("2026-9")).toBe(false);
    expect(esMesTelar("2026-09")).toBe(true);
  });
});

describe("el orillo", () => {
  it("cada sede mide lo suyo y lo de la empresa va en Empresa", () => {
    const t = tramosDelOrillo(porSedeDe([{ ubicacionId: "l", monto: 300 }, { ubicacionId: null, monto: 100 }, { ubicacionId: "l", monto: 100 }]), SEDES);
    expect(t.map((x) => [x.nombre, x.monto, x.pct])).toEqual([
      ["Trujillo", 0, 0],
      ["Arequipa", 0, 0],
      ["Lima", 400, 80],
      ["Taller", 0, 0],
      ["Empresa", 100, 20],
    ]);
  });

  it("sin nada gastado no hay orillo, y una ubicación que no se ve no se dibuja", () => {
    expect(tramosDelOrillo({}, SEDES)).toEqual([]);
    expect(tramosDelOrillo({ otra: 50 }, SEDES)).toEqual([]);
  });
});

describe("hilosDeLaRuta (ADR-0585)", () => {
  const propia = [{ clave: "u-lim", nombre: "Lima", color: "lim" as const }];
  const todas = sedesDelTelar([{ id: "u-lim", nombre: "Tienda Lima" }, { id: "u-tru", nombre: "Tienda Trujillo" }], true);
  const base = { sedes: propia, veTodo: false };
  it("en Estados financieros, quien tiene el módulo ve todas las sedes y la empresa", () => {
    expect(hilosDeLaRuta("/finanzas/reportes", base, todas)).toEqual({ sedes: todas, veTodo: true });
    expect(hilosDeLaRuta("/finanzas/reportes/balance", base, todas)).toEqual({ sedes: todas, veTodo: true });
  });
  it("en los demás submódulos sigue viendo solo su sede", () => {
    expect(hilosDeLaRuta("/finanzas/gastos", base, todas)).toBe(base);
    expect(hilosDeLaRuta("/finanzas/resumen", base, todas)).toBe(base);
    expect(hilosDeLaRuta("/finanzas/reportesx", base, todas)).toBe(base);
  });
  it("sin el módulo (o si ya ve todo Finanzas), nada cambia", () => {
    expect(hilosDeLaRuta("/finanzas/reportes", base, null)).toBe(base);
  });
});

describe("el mes de Cierre de mes", () => {
  const HOY = "2026-10";
  it("la barra y la página parten del mes anterior: el mes en curso nunca se cierra", () => {
    expect(ultimoMesDeLaRuta("/finanzas/cierre", HOY)).toBe("2026-09");
    expect(mesDeLaRuta("/finanzas/cierre", null, HOY)).toBe("2026-09");
    expect(mesDeLaRuta("/finanzas/cierre", "2026-08", HOY)).toBe("2026-08");
  });
  it("un ?mes= que todavía no terminó (traído de otra pantalla) se lee como el anterior, en la barra y en la página", () => {
    expect(mesDeLaRuta("/finanzas/cierre", "2026-10", HOY)).toBe("2026-09");
    expect(mesDeLaRuta("/finanzas/cierre", "2026-12", HOY)).toBe("2026-09");
  });
  it("en enero, el anterior es diciembre del año pasado", () => {
    expect(ultimoMesDeLaRuta("/finanzas/cierre", "2027-01")).toBe("2026-12");
  });
  it("las demás pantallas siguen como siempre", () => {
    expect(ultimoMesDeLaRuta("/finanzas/gastos", HOY)).toBe(HOY);
    expect(mesDeLaRuta("/finanzas/gastos", null, HOY)).toBe(HOY);
    expect(mesDeLaRuta("/finanzas/gastos", "2026-08", HOY)).toBe("2026-08");
    expect(mesDeLaRuta("/finanzas/cierres-viejos", null, HOY)).toBe(HOY);
  });
});

describe("el mes de Comparar con SUNAT", () => {
  const HOY = "2026-11";
  const RUTA = "/finanzas/impuestos/sire";
  it("sin ?mes=, la barra y la página parten del mes anterior: SUNAT aún no arma la propuesta del mes en curso", () => {
    expect(ultimoMesDeLaRuta(RUTA, HOY)).toBe("2026-10");
    expect(mesDeLaRuta(RUTA, null, HOY)).toBe("2026-10");
  });
  it("un mes terminado se respeta; uno que todavía corre (viene de Impuestos) se lee como el anterior, igual que en Cierre", () => {
    expect(mesDeLaRuta(RUTA, "2026-08", HOY)).toBe("2026-08");
    expect(mesDeLaRuta(RUTA, "2026-11", HOY)).toBe("2026-10");
    expect(mesDeLaRuta(RUTA, "2026-12", HOY)).toBe("2026-10");
  });
  it("la página lee el mes con la misma regla que la barra", () => {
    expect(readFileSync("app/(app)/finanzas/impuestos/sire/page.tsx", "utf8")).toMatch(/mesDeLaRuta\(RUTA_SIRE, sp\.mes,/);
  });
  it("Impuestos sigue mirando el mes en curso", () => {
    expect(ultimoMesDeLaRuta("/finanzas/impuestos", HOY)).toBe(HOY);
    expect(mesDeLaRuta("/finanzas/impuestos", null, HOY)).toBe(HOY);
  });
});

describe("ALCANCE_POR_RUTA: la barra dice qué filtra cada pantalla (tarea 26)", () => {
  /** Las rutas reales: cada `page.tsx` bajo Finanzas. */
  function rutasDeFinanzas(dir = "app/(app)/finanzas", base = "/finanzas"): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return rutasDeFinanzas(join(dir, e.name), `${base}/${e.name}`);
      return e.name === "page.tsx" ? [base] : [];
    });
  }
  it("toda pantalla de Finanzas declara su alcance, y ninguna declarada dejó de existir", () => {
    expect(Object.keys(ALCANCE_POR_RUTA).sort()).toEqual(rutasDeFinanzas().sort());
  });
  it("Campañas y Conciliación son de toda CAYLA, y lo dicen", () => {
    expect(alcanceDeRuta("/finanzas/reportes/campanas").sede).toBe("toda");
    expect(dichoDelAlcance(alcanceDeRuta("/finanzas/reportes/campanas"))).toBe("Aquí es toda CAYLA, y no cambia con el mes");
    expect(dichoDelAlcance(alcanceDeRuta("/finanzas/reportes/flujo"))).toBe("Aquí es toda CAYLA");
    expect(dichoDelAlcance(alcanceDeRuta("/finanzas/dinero"))).toBe("No cambia con el mes");
  });
  it("Impuestos es de toda CAYLA: a SUNAT se le paga por RUC, así que la barra apaga las sedes y la cabecera nunca nombra una", () => {
    expect(alcanceDeRuta("/finanzas/impuestos")).toEqual({ sede: "toda", mes: true });
    expect(dichoDelAlcance(alcanceDeRuta("/finanzas/impuestos"))).toBe("Aquí es toda CAYLA");
    // Las dos caras de la pantalla, también la de falla: quien está atado a su sede no ve la línea de la barra, y lo que le aclara es esto.
    expect(readFileSync("components/ImpuestosPanel.tsx", "utf8").match(/sede="CAYLA entera"/g)).toHaveLength(2);
  });
  it("donde todo aplica no dice nada, y una ruta que no se conoce deja la barra como siempre", () => {
    expect(dichoDelAlcance(alcanceDeRuta("/finanzas/gastos"))).toBeNull();
    expect(alcanceDeRuta("/finanzas/nueva")).toEqual({ sede: "sede", mes: true });
    expect(alcanceDeRuta("/finanzas")).toEqual({ sede: "sede", mes: true });
  });
});

describe("lo que la barra dice siempre a la vista, aunque no quepa la frase larga", () => {
  it("una pantalla que no se parte por sede lo dice en el rótulo, y es corto", () => {
    expect(rotuloDeSedes({ sedeNoAplica: true, variasSinJuntar: false })).toEqual({ texto: "Toda CAYLA", dice: true });
    // También si la URL trae varias: lo que manda es que aquí no hay sedes.
    expect(rotuloDeSedes({ sedeNoAplica: true, variasSinJuntar: true })).toEqual({ texto: "Toda CAYLA", dice: true });
  });

  it("varias sedes en una pantalla que no las suma: el rótulo avisa", () => {
    expect(rotuloDeSedes({ sedeNoAplica: false, variasSinJuntar: true })).toEqual({ texto: "Aquí, de a una", dice: true });
  });

  it("sin nada que aclarar, el rótulo de siempre, que puede esconderse si falta lugar", () => {
    expect(rotuloDeSedes({ sedeNoAplica: false, variasSinJuntar: false })).toEqual({ texto: "Ver sede", dice: false });
  });

  it("Balance general con «Empresa»: el rótulo dice que es toda CAYLA, porque la frase larga se esconde en un laptop", () => {
    expect(rotuloDeSedes({ sedeNoAplica: false, variasSinJuntar: false, empresaSinBalance: true })).toEqual({ texto: "Toda CAYLA", dice: true });
  });

  it("los rótulos que aclaran no pasan de 14 letras: uno largo devolvería la barra a dos filas", () => {
    for (const o of [{ sedeNoAplica: true, variasSinJuntar: false }, { sedeNoAplica: false, variasSinJuntar: true }]) {
      expect(rotuloDeSedes(o).texto.length).toBeLessThanOrEqual(14);
    }
  });
});

describe("las sedes que se ven marcadas", () => {
  it("varias en una pantalla de a una: se marca «Todas», que es lo que las cifras muestran", () => {
    expect(sedesMarcadas(["l", "a"], true)).toEqual([]);
  });

  it("una sola, o una pantalla que sí suma varias: se marcan tal cual", () => {
    expect(sedesMarcadas(["l"], true)).toEqual(["l"]);
    expect(sedesMarcadas(["l", "a"], false)).toEqual(["l", "a"]);
    expect(sedesMarcadas([], true)).toEqual([]);
  });
});

describe("el aviso al tocar otra sede donde se ve de a una", () => {
  const base = { deAUna: true, elegidas: ["l"], tocada: "a", sedes: SEDES };

  it("cambiar de una sede a otra se explica, con el nombre de la que quedó", () => {
    expect(avisoDeAUna(base)).toBe("Aquí se ve una sede a la vez. Ahora estás viendo Arequipa.");
  });

  it("donde sí se suman varias, no hay nada que explicar", () => {
    expect(avisoDeAUna({ ...base, deAUna: false })).toBeNull();
  });

  it("tocar «Todas», la misma sede o la primera sede no reemplaza a ninguna: no avisa", () => {
    expect(avisoDeAUna({ ...base, tocada: "todas" })).toBeNull();
    expect(avisoDeAUna({ ...base, tocada: "l" })).toBeNull();
    expect(avisoDeAUna({ ...base, elegidas: [] })).toBeNull();
  });

  it("una sede que no está en la barra no inventa un nombre", () => {
    expect(avisoDeAUna({ ...base, tocada: "fantasma" })).toBeNull();
  });
});

describe("«Empresa» en el Balance (tarea 58)", () => {
  it("la empresa no tiene Balance aparte: se dice", () => {
    expect(esBalanceDeEmpresa("/finanzas/reportes/balance", ["empresa"])).toBe(true);
    expect(DICHO_EMPRESA_SIN_BALANCE).toBe("Empresa no tiene Balance aparte: aquí es toda CAYLA");
  });
  it("una tienda, varias sedes u otro estado siguen igual", () => {
    expect(esBalanceDeEmpresa("/finanzas/reportes/balance", ["u-lim"])).toBe(false);
    expect(esBalanceDeEmpresa("/finanzas/reportes/balance", ["empresa", "u-lim"])).toBe(false);
    expect(esBalanceDeEmpresa("/finanzas/reportes", ["empresa"])).toBe(false);
  });
});
