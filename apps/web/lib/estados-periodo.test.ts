import { describe, expect, it } from "vitest";
import {
  alturaDelMes,
  atajosDelPeriodo,
  comparacionDelPeriodo,
  conElRango,
  cubreElMes,
  diaPorTecla,
  diasDelMes,
  etiquetaDelPeriodo,
  hrefPeriodo,
  intensidadDelDia,
  leerPeriodo,
  marcaDelDia,
  mesesDelHilo,
  nombreDelAnterior,
  paramsDelRango,
  periodoAnterior,
  periodoDe,
  periodosAnteriores,
  revisarEscritas,
  sumarMeses,
  vecinos,
  ventasPorFecha,
} from "./estados-periodo";

const HOY = "2026-11-05";
const MIN = "2025-11-01";

describe("leerPeriodo: de la URL a un solo período", () => {
  it("sin nada, este mes hasta hoy", () => {
    const p = leerPeriodo({}, HOY);
    expect([p.desde, p.hasta, p.mes, p.unMes]).toEqual(["2026-11-01", HOY, "2026-11", true]);
    expect(p.titulo).toBe("Noviembre 2026");
    expect(p.largo).toBe("hasta hoy");
  });

  it("`?mes=` es ese mes entero", () => {
    const p = leerPeriodo({ mes: "2026-10" }, HOY);
    expect([p.desde, p.hasta, p.unMes, p.largo]).toEqual(["2026-10-01", "2026-10-31", true, "mes completo"]);
  });

  it("`?desde&hasta` manda sobre `?mes=`", () => {
    const p = leerPeriodo({ mes: "2026-10", desde: "2026-09-10", hasta: "2026-09-20" }, HOY);
    expect([p.desde, p.hasta, p.mes]).toEqual(["2026-09-10", "2026-09-20", "2026-09"]);
  });

  it("una fecha futura se queda en hoy", () => {
    expect(leerPeriodo({ desde: "2026-11-01", hasta: "2030-01-01" }, HOY).hasta).toBe(HOY);
  });

  it("un rango al revés o una fecha que no existe no rompen: caen a lo que sí se entiende", () => {
    expect(leerPeriodo({ desde: "2026-10-20", hasta: "2026-10-05" }, HOY).desde).toBe("2026-10-01");
    expect(leerPeriodo({ desde: "2026-02-31", hasta: "2026-02-30", mes: "2026-10" }, HOY).titulo).toBe("Octubre 2026");
    expect(leerPeriodo({ mes: "2030-01" }, HOY).mes).toBe("2026-11");
  });

  it("`?corte=` sigue siendo la fecha del Balance", () => {
    const p = leerPeriodo({ corte: "2026-08-31" }, HOY);
    expect([p.desde, p.hasta]).toEqual(["2026-08-01", "2026-08-31"]);
  });
});

describe("cómo se dice cada período", () => {
  const casos: [string, string, string, string, string][] = [
    ["2026-10-01", "2026-10-31", "Octubre 2026", "en octubre", "mes completo"],
    ["2026-08-01", "2026-10-31", "Agosto a octubre 2026", "de agosto a octubre", "3 meses completos"],
    ["2025-11-01", "2026-01-31", "Nov 2025 a ene 2026", "de noviembre a enero", "3 meses completos"],
    ["2026-10-05", "2026-10-05", "5 de octubre de 2026", "el 5 de octubre", "1 día"],
    ["2026-10-05", "2026-10-20", "5 al 20 de octubre 2026", "del 5 al 20 de octubre", "16 días"],
    ["2026-09-05", "2026-10-20", "5 sep al 20 oct 2026", "del 5 de septiembre al 20 de octubre", "46 días"],
    ["2025-12-05", "2026-01-20", "5 dic 2025 al 20 ene 2026", "del 5 de diciembre de 2025 al 20 de enero de 2026", "47 días"],
  ];
  it.each(casos)("%s a %s", (desde, hasta, titulo, en, largo) => {
    const p = periodoDe(desde, hasta, HOY);
    expect({ titulo: p.titulo, en: p.en, largo: p.largo }).toEqual({ titulo, en, largo });
  });

  it("el Balance se nombra por su fecha", () => {
    expect(periodoDe("2026-11-01", HOY, HOY).al).toBe("Al 5 de noviembre de 2026");
  });

  it("el tramo corto", () => {
    expect(periodoDe("2026-10-01", "2026-10-31", HOY).tramo).toBe("1 oct – 31 oct");
    expect(periodoDe("2026-10-05", "2026-10-05", HOY).tramo).toBe("Un día");
  });
});

describe("la dirección", () => {
  it("un mes entero se escribe corto y el de hoy no se escribe", () => {
    expect(paramsDelRango({ desde: "2026-11-01", hasta: HOY }, HOY)).toEqual([]);
    expect(paramsDelRango({ desde: "2026-10-01", hasta: "2026-10-31" }, HOY)).toEqual([["mes", "2026-10"]]);
  });

  it("otro período lleva sus fechas y el mes que viaja al resto de Finanzas", () => {
    expect(paramsDelRango({ desde: "2026-10-05", hasta: "2026-10-20" }, HOY)).toEqual([
      ["mes", "2026-10"],
      ["desde", "2026-10-05"],
      ["hasta", "2026-10-20"],
    ]);
    expect(paramsDelRango({ desde: "2026-11-01", hasta: "2026-11-03" }, HOY)).toEqual([
      ["desde", "2026-11-01"],
      ["hasta", "2026-11-03"],
    ]);
  });

  it("cambiar el período conserva la sede y la forma, y quita el período de antes", () => {
    const actuales: [string, string][] = [
      ["sede", "abc"],
      ["forma", "formal"],
      ["mes", "2026-09"],
      ["corte", "2026-09-10"],
      ["desde", "2026-09-01"],
      ["hasta", "2026-09-10"],
    ];
    expect(hrefPeriodo("/finanzas/reportes", actuales, { desde: "2026-10-01", hasta: "2026-10-31" }, HOY)).toBe("/finanzas/reportes?sede=abc&forma=formal&mes=2026-10");
    expect(hrefPeriodo("/finanzas/reportes", [], { desde: "2026-11-01", hasta: HOY }, HOY)).toBe("/finanzas/reportes");
  });

  it("al pasar a otro estado las dos fechas viajan", () => {
    const actuales: [string, string][] = [
      ["mes", "2026-10"],
      ["desde", "2026-10-05"],
      ["hasta", "2026-10-20"],
      ["semanas", "6"],
    ];
    expect(conElRango("/finanzas/reportes/flujo?mes=2026-10", actuales)).toBe("/finanzas/reportes/flujo?mes=2026-10&desde=2026-10-05&hasta=2026-10-20");
    expect(conElRango("/finanzas/reportes/flujo", [["mes", "2026-10"]])).toBe("/finanzas/reportes/flujo");
  });
});

describe("las flechas: el vecino del mismo largo", () => {
  it("un mes pasa al de al lado, y el de hoy se queda en hoy", () => {
    const { anterior, siguiente } = vecinos(periodoDe("2026-10-01", "2026-10-31", HOY), HOY, MIN, false);
    expect(anterior).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(siguiente).toEqual({ desde: "2026-11-01", hasta: HOY });
  });

  it("el mes de hoy no tiene siguiente", () => {
    expect(vecinos(periodoDe("2026-11-01", HOY, HOY), HOY, MIN, false).siguiente).toBeNull();
  });

  it("tres meses saltan tres meses", () => {
    const { anterior, siguiente } = vecinos(periodoDe("2026-05-01", "2026-07-31", HOY), HOY, MIN, false);
    expect(anterior).toEqual({ desde: "2026-02-01", hasta: "2026-04-30" });
    expect(siguiente).toEqual({ desde: "2026-08-01", hasta: "2026-10-31" });
  });

  it("los mismos días, justo antes y justo después", () => {
    const { anterior, siguiente } = vecinos(periodoDe("2026-10-05", "2026-10-11", HOY), HOY, MIN, false);
    expect(anterior).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
    expect(siguiente).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
  });

  it("no se pasa de hoy ni de cuando Finanzas empezó a contar", () => {
    expect(vecinos(periodoDe("2026-11-02", "2026-11-04", HOY), HOY, MIN, false).siguiente).toBeNull();
    expect(vecinos(periodoDe("2025-11-01", "2025-11-30", HOY), HOY, MIN, false).anterior).toBeNull();
    expect(vecinos(periodoDe("2025-11-05", "2025-11-10", HOY), HOY, MIN, false).anterior).toBeNull();
  });

  it("en el Balance salta de cierre en cierre", () => {
    const { anterior, siguiente } = vecinos(periodoDe("2026-10-01", "2026-10-14", HOY), HOY, MIN, true);
    expect(anterior).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(siguiente).toEqual({ desde: "2026-11-01", hasta: HOY });
  });
});

describe("con qué se compara", () => {
  it("un mes contra el anterior, y días contra los mismos días", () => {
    expect(periodoAnterior(periodoDe("2026-10-01", "2026-10-31", HOY), MIN)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(periodoAnterior(periodoDe("2026-08-01", "2026-10-31", HOY), MIN)).toEqual({ desde: "2026-05-01", hasta: "2026-07-31" });
    expect(periodoAnterior(periodoDe("2026-10-05", "2026-10-11", HOY), MIN)).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
  });

  it("el mes de hoy, con los mismos días del mes pasado: contra el mes entero siempre saldría perdiendo", () => {
    expect(periodoAnterior(periodoDe("2026-11-01", HOY, HOY), MIN)).toEqual({ desde: "2026-10-01", hasta: "2026-10-05" });
    // Un 31 sin su 31 en el mes pasado: hasta su último día.
    expect(periodoAnterior(periodoDe("2026-10-01", "2026-10-31", "2026-10-31"), MIN)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(nombreDelAnterior(periodoDe("2026-11-01", HOY, HOY))).toBe("octubre a esta fecha");
    expect(comparacionDelPeriodo(periodoDe("2026-11-01", HOY, HOY), MIN, false)).toBe("Se compara con octubre a esta fecha");
  });

  it("varios meses que terminan hoy, con los mismos días justo antes", () => {
    expect(periodoAnterior(periodoDe("2026-10-01", HOY, HOY), MIN)).toEqual({ desde: "2026-08-26", hasta: "2026-09-30" });
  });

  it("antes de que Finanzas contara no hay con qué", () => {
    expect(periodoAnterior(periodoDe("2025-11-01", "2025-11-30", HOY), MIN)).toBeNull();
    expect(periodoAnterior(periodoDe("2025-11-03", "2025-11-10", HOY), MIN)).toBeNull();
    expect(comparacionDelPeriodo(periodoDe("2025-11-01", "2025-11-30", HOY), MIN, false)).toBe("Sin período anterior");
  });

  it("la frase", () => {
    expect(comparacionDelPeriodo(periodoDe("2026-10-01", "2026-10-31", HOY), MIN, false)).toBe("Se compara con septiembre");
    expect(comparacionDelPeriodo(periodoDe("2026-10-05", "2026-10-11", HOY), MIN, false)).toBe("Se compara con el período anterior");
    expect(comparacionDelPeriodo(periodoDe("2026-11-01", HOY, HOY), MIN, true)).toBe("Se compara con el fin de octubre");
    expect(comparacionDelPeriodo(periodoDe("2025-11-01", "2025-11-30", HOY), MIN, true)).toBe("Sin fecha anterior");
  });
});

describe("las columnas de antes", () => {
  it("un mes, con sus dos meses de antes", () => {
    const c = periodosAnteriores(periodoDe("2026-10-01", "2026-10-31", HOY), HOY, MIN);
    expect(c).toEqual([
      { desde: "2026-08-01", hasta: "2026-08-31", etiqueta: "Ago" },
      { desde: "2026-09-01", hasta: "2026-09-30", etiqueta: "Sep" },
    ]);
    expect(etiquetaDelPeriodo(periodoDe("2026-10-01", "2026-10-31", HOY))).toBe("Oct");
  });

  it("el mes de hoy, con los mismos días de los dos meses pasados", () => {
    expect(periodosAnteriores(periodoDe("2026-11-01", HOY, HOY), HOY, MIN)).toEqual([
      { desde: "2026-09-01", hasta: "2026-09-05", etiqueta: "Sep" },
      { desde: "2026-10-01", hasta: "2026-10-05", etiqueta: "Oct" },
    ]);
  });

  it("otras fechas, los mismos días justo antes", () => {
    const p = periodoDe("2026-10-05", "2026-10-11", HOY);
    expect(periodosAnteriores(p, HOY, MIN)).toEqual([
      { desde: "2026-09-21", hasta: "2026-09-27", etiqueta: "Antes" },
      { desde: "2026-09-28", hasta: "2026-10-04", etiqueta: "Anterior" },
    ]);
    expect(etiquetaDelPeriodo(p)).toBe("Ahora");
  });

  it("solo los que Finanzas alcanzó a contar", () => {
    expect(periodosAnteriores(periodoDe("2025-11-01", "2025-11-30", HOY), HOY, MIN)).toEqual([]);
    expect(periodosAnteriores(periodoDe("2025-12-01", "2025-12-31", HOY), HOY, MIN).map((c) => c.etiqueta)).toEqual(["Nov"]);
  });
});

describe("los atajos", () => {
  it("son seis, ninguno pasa de hoy", () => {
    const a = atajosDelPeriodo(HOY, MIN, false);
    expect(a.map((x) => x.clave)).toEqual(["este-mes", "mes-pasado", "7-dias", "30-dias", "trimestre", "anio"]);
    for (const x of a) expect(x.hasta <= HOY && x.desde <= x.hasta).toBe(true);
    expect(a[0]).toMatchObject({ desde: "2026-11-01", hasta: HOY, detalle: "1 – 5 nov" });
    expect(a[2]).toMatchObject({ desde: "2026-10-30", hasta: HOY, detalle: "30 oct – 5 nov" });
    expect(a[4]).toMatchObject({ desde: "2026-10-01" });
  });

  it("no empiezan antes de que Finanzas contara y no se ofrece lo que ya terminó antes", () => {
    const a = atajosDelPeriodo("2026-02-10", "2026-02-03", false);
    expect(a.map((x) => x.clave)).not.toContain("mes-pasado");
    expect(a.find((x) => x.clave === "anio")!.desde).toBe("2026-02-03");
  });

  it("en el Balance son fechas de cierre, sin repetir ninguna", () => {
    const a = atajosDelPeriodo(HOY, MIN, true);
    expect(a.map((x) => x.titulo)).toEqual(["Hoy", "Fin de octubre", "Fin de septiembre", "Fin de 2025"]);
    expect(a[1]).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31", detalle: "31 oct 2026" });
    // En febrero, el fin de diciembre y el fin del año pasado son la misma fecha.
    expect(atajosDelPeriodo("2026-02-10", MIN, true).map((x) => x.hasta)).toEqual(["2026-02-10", "2026-01-31", "2025-12-31"]);
  });
});

describe("la fila de meses", () => {
  it("son los últimos 13, con su año donde hace falta, y el de hoy termina hoy", () => {
    const m = mesesDelHilo(HOY, null);
    expect(m).toHaveLength(13);
    expect(m[0]).toMatchObject({ mes: "2025-11", anio: "2025", desde: "2025-11-01", hasta: "2025-11-30" });
    expect(m.find((x) => x.mes === "2026-01")!.anio).toBe("2026");
    expect(m.find((x) => x.mes === "2026-02")!.anio).toBeNull();
    expect(m[12]).toMatchObject({ mes: "2026-11", hasta: HOY, nombre: "Noviembre 2026", etiqueta: "Nov" });
  });

  it("sin los que terminan antes de que Finanzas contara; el mes en que empezó sí va", () => {
    const m = mesesDelHilo(HOY, "2026-09-15");
    expect(m.map((x) => x.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(m[0]!.anio).toBe("2026");
  });

  it("cuánto cubre el período a cada mes", () => {
    const m = mesesDelHilo(HOY, null);
    const oct = m.find((x) => x.mes === "2026-10")!;
    expect(cubreElMes(oct, { desde: "2026-10-01", hasta: "2026-10-31" }, false)).toBe("entero");
    expect(cubreElMes(oct, { desde: "2026-10-05", hasta: "2026-10-20" }, false)).toBe("parte");
    expect(cubreElMes(oct, { desde: "2026-11-01", hasta: HOY }, false)).toBe("no");
    expect(cubreElMes(oct, { desde: "2026-10-01", hasta: "2026-10-31" }, true)).toBe("entero");
    expect(cubreElMes(oct, { desde: "2026-10-01", hasta: "2026-10-14" }, true)).toBe("parte");
  });

  it("la barrita de cada mes", () => {
    expect(alturaDelMes(1000, 1000)).toBe(30);
    expect(alturaDelMes(-500, 1000)).toBe(15);
    expect(alturaDelMes(1, 1000)).toBe(3);
    expect(alturaDelMes(0, 0)).toBe(3);
  });
});

describe("los días", () => {
  it("la semana empieza en lunes", () => {
    // El 1 de noviembre de 2026 es domingo: seis huecos antes.
    expect(diasDelMes("2026-11", HOY, MIN).huecos).toBe(6);
    // El 1 de junio de 2026 es lunes: ninguno.
    expect(diasDelMes("2026-06", HOY, MIN).huecos).toBe(0);
  });

  it("lo futuro y lo de antes de Finanzas se apagan, con su motivo", () => {
    const { dias } = diasDelMes("2026-11", HOY, MIN);
    expect(dias).toHaveLength(30);
    expect(dias[4]).toMatchObject({ iso: HOY, apagado: false });
    expect(dias[5]).toMatchObject({ apagado: true, motivo: "Todavía no llega." });
    expect(diasDelMes("2025-10", HOY, MIN).dias[30]).toMatchObject({ apagado: true, motivo: "Finanzas cuenta desde el 1 de noviembre de 2025." });
  });

  it("cómo se pinta cada día del tramo", () => {
    const tramo = { desde: "2026-10-05", hasta: "2026-10-20" };
    expect(marcaDelDia("2026-10-05", tramo, HOY)).toMatchObject({ dentro: true, inicio: true, fin: false, bordeIzquierdo: true });
    expect(marcaDelDia("2026-10-11", tramo, HOY)).toMatchObject({ dentro: true, bordeDerecho: true });
    expect(marcaDelDia("2026-10-20", tramo, HOY)).toMatchObject({ dentro: true, fin: true });
    expect(marcaDelDia("2026-10-21", tramo, HOY).dentro).toBe(false);
    expect(marcaDelDia("2026-10-05", { desde: "2026-10-05", hasta: "2026-10-05" }, HOY)).toMatchObject({ solo: true, inicio: false, fin: false });
    expect(marcaDelDia(HOY, tramo, HOY).hoy).toBe(true);
  });

  it("el puntito de ventas", () => {
    expect(intensidadDelDia(undefined, 100)).toBe(0);
    expect(intensidadDelDia(0, 100)).toBe(0);
    expect(intensidadDelDia(1, 100)).toBe(0.12);
    expect(intensidadDelDia(100, 100)).toBe(1);
    expect(ventasPorFecha([[{ fecha: "2026-10-01", total: 10 }], [{ fecha: "2026-10-01", total: 5 }, { fecha: "2026-10-02", total: 1 }]])).toEqual({ "2026-10-01": 15, "2026-10-02": 1 });
  });

  it("las flechas del teclado no se salen de lo que se puede elegir", () => {
    expect(diaPorTecla("2026-10-05", "ArrowRight", HOY, MIN)).toBe("2026-10-06");
    expect(diaPorTecla("2026-10-05", "ArrowUp", HOY, MIN)).toBe("2026-09-28");
    expect(diaPorTecla(HOY, "ArrowDown", HOY, MIN)).toBe(HOY);
    expect(diaPorTecla("2025-11-02", "ArrowUp", HOY, MIN)).toBe(MIN);
    expect(diaPorTecla("2026-10-05", "Enter", HOY, MIN)).toBeNull();
  });
});

describe("lo que se escribe", () => {
  it("se entiende como en todo campo de fecha", () => {
    expect(revisarEscritas("05/10/2026", "20/10/2026", HOY, MIN, false)).toEqual({ rango: { desde: "2026-10-05", hasta: "2026-10-20" } });
    expect(revisarEscritas("5/10", "20/10", HOY, MIN, false)).toEqual({ rango: { desde: "2026-10-05", hasta: "2026-10-20" } });
    expect(revisarEscritas("5/10/26", "20/10/26", HOY, MIN, false)).toEqual({ rango: { desde: "2026-10-05", hasta: "2026-10-20" } });
  });

  it("en el Balance solo cuenta la fecha, y el período empieza con su mes", () => {
    expect(revisarEscritas("cualquier cosa", "14/10/2026", HOY, MIN, true)).toEqual({ rango: { desde: "2026-10-01", hasta: "2026-10-14" } });
  });

  it("lo que está mal se dice en una línea", () => {
    expect(revisarEscritas("31/02/2026", "20/10/2026", HOY, MIN, false)).toEqual({ error: "Esa fecha no existe: revisa el día y el mes." });
    expect(revisarEscritas("01/10/2026", "2", HOY, MIN, false)).toEqual({ error: "Esa fecha no existe: revisa el día y el mes." });
    expect(revisarEscritas("01/10/2026", "20/12/2026", HOY, MIN, false)).toEqual({ error: "No puede ser futura: hoy es 5 de noviembre." });
    expect(revisarEscritas("01/10/2024", "20/10/2026", HOY, MIN, false)).toEqual({ error: "Finanzas cuenta desde el 1 de noviembre de 2025." });
    expect(revisarEscritas("20/10/2026", "01/10/2026", HOY, MIN, false)).toEqual({ error: "La fecha final va después de la inicial." });
  });
});

it("sumarMeses cruza el año", () => {
  expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  expect(sumarMeses("2025-12", 1)).toBe("2026-01");
  expect(sumarMeses("2026-11", -12)).toBe("2025-11");
});
