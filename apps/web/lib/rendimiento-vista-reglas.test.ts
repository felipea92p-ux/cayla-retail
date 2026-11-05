import { describe, expect, it } from "vitest";
import {
  calendarioDelMes,
  cierreSimulado,
  loQueSeBaja,
  interpretarBusqueda,
  nombreCoincide,
  tramoDeUrl,
  filasConOtraMeta,
  suDiaFuerte,
  diasParaGrafico,
  gestoEn,
  mesPasadoEnEje,
  metaSumadaDelMes,
  sumadoDelMes,
  tramoArrastrado,
  diasDelEje,
  filasPorPersona,
  fraseDelEquipo,
  fraseEnTexto,
  hacePocoEnPalabras,
  medirEquipo,
  medirGrupo,
  medirPersona,
  presetDeTramo,
  rangoDeLecturaPersonas,
  serieDeFilas,
  simuladorDeCierre,
  tramoDePreset,
  tramoEnPalabras,
  type FilaPersonaDia,
  type MedidaPersona,
} from "./rendimiento-vista-reglas";
import type { DiaSerie, PersonaMeta } from "./rendimiento-meta-reglas";

const HOY = "2026-10-24";
const dia = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

function fila(fecha: string, total: number, metaDia: number | null = 100, personaId: string | null = "ana", ventas = total > 0 ? 1 : 0): FilaPersonaDia {
  return { personaId, nombre: personaId ? "Ana T." : null, fecha, metaDia, ventas, total, prendas: ventas };
}
const mes = (porDia: (n: number) => number, meta = 100, hasta = 31): FilaPersonaDia[] =>
  Array.from({ length: hasta }, (_, i) => i + 1).map((n) => fila(dia(n), n <= 24 ? porDia(n) : 0, meta));

const medir = (filas: FilaPersonaDia[], tramo = { desde: dia(1), hasta: HOY }, turno: { entradaHoy: string | null; salidaHoy: string | null } | null = { entradaHoy: "10:00", salidaHoy: "20:00" }, ahoraMin: number | null = 15 * 60) =>
  medirPersona({ personaId: "ana", nombre: "Ana T.", filas, tramo, hoy: HOY, turno, ahoraMin });

describe("los tramos", () => {
  it("cada preset vuelve a reconocerse y uno a mano no es ningún preset", () => {
    for (const p of ["hoy", "semana", "mes"] as const) expect(presetDeTramo(tramoDePreset(p, HOY), HOY)).toBe(p);
    expect(presetDeTramo({ desde: dia(5), hasta: dia(12) }, HOY)).toBeNull();
  });

  it("la semana son 7 días contados con hoy, también si cruza de mes", () => {
    expect(tramoDePreset("semana", "2026-11-04")).toEqual({ desde: "2026-10-29", hasta: "2026-11-04" });
  });

  it("el 1 del mes, Hoy y Este mes son el mismo tramo: gana Hoy", () => {
    expect(presetDeTramo(tramoDePreset("mes", "2026-11-01"), "2026-11-01")).toBe("hoy");
  });

  it("se lee el mes pasado entero y este mes entero, y cabe en los 92 días de la función", () => {
    expect(rangoDeLecturaPersonas("2026-11-04")).toEqual({ desde: "2026-10-01", hasta: "2026-11-30" });
    expect(rangoDeLecturaPersonas("2027-01-31")).toEqual({ desde: "2026-12-01", hasta: "2027-01-31" });
  });

  it("el eje es el mes entero y, a inicio de mes, suma los días que faltan para ver los últimos 7", () => {
    const octubre = diasDelEje(HOY);
    expect(octubre.length).toBe(31);
    expect(octubre[0]).toBe(dia(1));
    const noviembre = diasDelEje("2026-11-04");
    expect(noviembre[0]).toBe("2026-10-29");
    expect(noviembre.at(-1)).toBe("2026-11-30");
  });

  it("dice el tramo en palabras", () => {
    expect(tramoEnPalabras(tramoDePreset("mes", HOY), HOY)).toBe("este mes");
    expect(tramoEnPalabras(tramoDePreset("hoy", HOY), HOY)).toBe("hoy");
    expect(tramoEnPalabras(tramoDePreset("semana", HOY), HOY)).toBe("los últimos 7 días");
    expect(tramoEnPalabras({ desde: dia(12), hasta: dia(12) }, HOY)).toBe("el 12 de octubre");
    expect(tramoEnPalabras({ desde: dia(5), hasta: dia(12) }, HOY)).toBe("del 5 al 12 de octubre");
    expect(tramoEnPalabras({ desde: "2026-09-29", hasta: dia(2) }, HOY)).toBe("del 29 de setiembre al 2 de octubre");
  });

  it("dice cuánto hace", () => {
    expect(hacePocoEnPalabras(HOY, HOY)).toBe("hoy");
    expect(hacePocoEnPalabras(dia(23), HOY)).toBe("ayer");
    expect(hacePocoEnPalabras(dia(10), HOY)).toBe("hace 14 días");
  });
});

describe("medirPersona: un tramo que empieza el 1 se mide contra todo el mes", () => {
  const filas = mes(() => 100);

  it("la meta es la del mes; lo que tocaba, lo que ya pasó con la parte corrida de hoy", () => {
    const m = medir(filas);
    expect(m.meta).toBe(3100);
    // 23 días × 100, más hoy: de 10:00 a 20:00 son 600 min y a las 15:00 corrieron 300: 50.
    expect(m.tocaba).toBe(2350);
    expect(m.vendido).toBe(2400);
    expect(m.pct).toBeCloseTo((2400 / 3100) * 100);
    expect(m.tocaPct).toBeCloseTo((2350 / 3100) * 100);
  });

  it("«En ritmo» se mide contra lo que tocaba, no contra el mes entero", () => {
    expect(medir(filas).lectura).toBe("En ritmo");
    expect(medir(mes((n) => (n <= 23 ? 120 : 0))).lectura).toBe("Adelante"); // 2760 de 3100: 89 %, tocaba 75,8 %
    expect(medir(mes((n) => (n <= 23 ? 80 : 0))).lectura).toBe("Por debajo"); // 1840 de 3100: 59 %, tocaba 75,8 %
  });

  it("dice lo mismo a inicio de mes que a fin de mes: lejos de lo que tocaba es «Por debajo»", () => {
    const hasta4 = { desde: dia(1), hasta: dia(4) };
    expect(medir(filas, hasta4).tocaba).toBe(400);
    expect(medir(mes((n) => (n <= 4 ? 40 : 0)), hasta4).lectura).toBe("Por debajo"); // 160 de 400: 5 puntos del mes abajo, 60 % de lo que tocaba
    expect(medir(mes((n) => (n <= 4 ? 95 : 0)), hasta4).lectura).toBe("En ritmo"); // 380 de 400
    expect(medir(mes((n) => (n <= 4 ? 120 : 0)), hasta4).lectura).toBe("Adelante"); // 480 de 400
  });

  it("los 10 % exactos cuentan, sin que la coma flotante los mueva", () => {
    const hasta10 = { desde: dia(1), hasta: dia(10) };
    expect(medir(mes((n) => (n <= 10 ? 110 : 0)), hasta10).lectura).toBe("Adelante");
    expect(medir(mes((n) => (n <= 10 ? 90 : 0)), hasta10).lectura).toBe("Por debajo");
  });

  it("el mismo día, la misma medida para todos: quien descansó no sigue con holgura", () => {
    const hasta4 = { desde: dia(1), hasta: dia(4) };
    // Descansó el 2 y el 3: le tocaron 200, vendió 100. Sin esto, con 6 % diría «En ritmo» junto a alguien con 12 % «Por debajo».
    const descanso = mes((n) => (n === 1 ? 100 : 0)).map((f) => (f.fecha === dia(2) || f.fecha === dia(3) ? { ...f, metaDia: 0 } : f));
    expect(medir(descanso, hasta4).tocaba).toBe(200);
    expect(medir(descanso, hasta4).lectura).toBe("Por debajo");
  });

  it("quien no vendió nada también es «Por debajo»: el mínimo son los días que ya pasaron, no los días con ventas", () => {
    expect(medir(mes(() => 0), { desde: dia(1), hasta: dia(10) }).lectura).toBe("Por debajo");
  });

  it("con menos de 3 días que ya tocaban, una sola venta no decide: sigue con holgura", () => {
    const hasta2 = { desde: dia(1), hasta: dia(2) };
    expect(medir(mes(() => 0), hasta2).lectura).toBe("En ritmo"); // 0 de 3100 contra 6,5 %: menos de 10 puntos
    expect(medir(mes((n) => (n <= 2 ? 200 : 0)), hasta2).lectura).toBe("En ritmo"); // 400 de 3100: 13 % contra 6,5 %
  });

  it("repetir el mes: hasta un día pasado, la meta sigue siendo la del mes y lo que tocaba crece con los días", () => {
    const m = medir(filas, { desde: dia(1), hasta: dia(10) });
    expect(m.meta).toBe(3100);
    expect(m.tocaba).toBe(1000);
    expect(m.vendido).toBe(1000);
    expect(m.lectura).toBe("En ritmo");
  });
});

describe("medirPersona: la meta del mes es la que guarda la base", () => {
  it("las de cada día van redondeadas: desde el 1 se ve la del mes; en otro tramo, la de sus días", () => {
    const filas = mes(() => 100);
    expect(medirPersona({ personaId: "ana", nombre: "Ana T.", filas, tramo: { desde: dia(1), hasta: HOY }, hoy: HOY, turno: null, ahoraMin: null, metaMes: 3080 }).meta).toBe(3080);
    expect(medirPersona({ personaId: "ana", nombre: "Ana T.", filas, tramo: { desde: dia(5), hasta: dia(6) }, hoy: HOY, turno: null, ahoraMin: null, metaMes: 3080 }).meta).toBe(200);
  });

  it("sin metas de los días, una meta del mes no inventa lecturas", () => {
    expect(medirPersona({ personaId: "ana", nombre: "Ana T.", filas: [fila(dia(1), 50, null)], tramo: { desde: dia(1), hasta: HOY }, hoy: HOY, turno: null, ahoraMin: null, metaMes: 3080 }).meta).toBeNull();
  });
});

describe("medirPersona: un tramo que empieza después se mide contra sus días", () => {
  it("la meta es la de esos días, y como ya pasaron, es lo mismo que tocaba", () => {
    const m = medir(mes(() => 130), { desde: dia(5), hasta: dia(12) });
    expect(m.meta).toBe(800);
    expect(m.tocaba).toBe(800);
    expect(m.vendido).toBe(1040);
    expect(m.pct).toBe(130);
    expect(m.tocaPct).toBe(100);
    expect(m.lectura).toBe("Adelante");
  });

  it("un día libre no suma meta, y el mejor día es el de más soles", () => {
    const filas = [fila(dia(5), 80), fila(dia(6), 0, 0), fila(dia(7), 200)];
    const m = medir(filas, { desde: dia(5), hasta: dia(7) });
    expect(m.meta).toBe(200);
    expect(m.mejorDia).toEqual({ fecha: dia(7), total: 200 });
  });
});

describe("medirPersona: hoy solo cuenta lo que ya pasó del turno (D-159)", () => {
  const hoyTramo = { desde: HOY, hasta: HOY };
  const filas = [fila(HOY, 45, 100)];

  it("a mitad de turno tocaba la mitad", () => {
    const m = medir(filas, hoyTramo);
    expect(m.meta).toBe(100);
    expect(m.tocaba).toBe(50);
    expect(m.tocaPct).toBe(50);
    expect(m.lectura).toBe("En ritmo");
  });

  it("antes de su turno no se le dice nada", () => {
    const m = medir(filas, hoyTramo, { entradaHoy: "16:00", salidaHoy: "20:00" });
    expect(m.tocaba).toBe(0);
    expect(m.lectura).toBeNull();
  });

  it("sin turno, o sin conocer la hora, de hoy no cuenta nada", () => {
    expect(medir(filas, hoyTramo, null).lectura).toBeNull();
    expect(medir(filas, hoyTramo, { entradaHoy: null, salidaHoy: null }).tocaba).toBe(0);
    expect(medir(filas, hoyTramo, undefined, null).tocaba).toBe(0);
  });
});

describe("medirPersona: sin meta no se inventa nada", () => {
  it("ni porcentaje ni lectura, y lo vendido se ve igual", () => {
    const m = medir([fila(dia(3), 90, null), fila(dia(4), 60, 0)]);
    expect(m.meta).toBeNull();
    expect(m.tocaba).toBeNull();
    expect(m.pct).toBeNull();
    expect(m.lectura).toBeNull();
    expect(m.vendido).toBe(150);
  });

  it("sin ventas: ticket nulo, sin mejor día y muestra chica", () => {
    const m = medir([fila(dia(3), 0)]);
    expect(m.ticket).toBeNull();
    expect(m.mejorDia).toBeNull();
    expect(m.muestraChica).toBe(true);
  });

  it("con 40 ventas ya no es muestra chica", () => {
    const m = medir([fila(dia(3), 4000, 100, "ana", 40)]);
    expect(m.ticket).toBe(100);
    expect(m.muestraChica).toBe(false);
  });
});

const persona = (personaId: string, nombre: string): PersonaMeta => ({
  personaId, nombre, esEncargada: false, base: "horas", entradaHoy: "10:00", salidaHoy: "20:00", horasHoy: 10, metaAutoMes: 100, metaAjustadaMes: null, metaMes: 100,
  metaHoy: 100, meta7d: 100, vendidoHoy: 0, ventasHoy: 0, vendido7d: 0, ventas7d: 0, vendidoMes: 0, ventasMes: 0,
});

describe("medirEquipo", () => {
  const filas: FilaPersonaDia[] = [
    fila(dia(3), 100, 100, "ana"),
    { personaId: "equis", nombre: "Equis F.", fecha: dia(3), metaDia: null, ventas: 1, total: 50, prendas: 1 },
    { personaId: "vieja", nombre: "Vieja V.", fecha: "2026-09-03", metaDia: null, ventas: 1, total: 50, prendas: 1 },
    fila(dia(3), 30, null, null),
  ];

  it("trae a todo el equipo aunque no haya vendido y a quien vendió sin estar en él", () => {
    const m = medirEquipo({ personas: [persona("ana", "Ana T."), persona("beto", "Beto S.")], filas, tramo: { desde: dia(1), hasta: HOY }, hoy: HOY, ahoraMin: 900 });
    expect(m.map((x) => x.nombre)).toEqual(["Ana T.", "Beto S.", "Equis F."]);
    expect(m[1].vendido).toBe(0);
    expect(m[2].meta).toBeNull();
  });

  it("quien vendió fuera del tramo no aparece, y una venta sin quien atendió no es de nadie", () => {
    const m = medirEquipo({ personas: [persona("ana", "Ana T.")], filas, tramo: { desde: dia(1), hasta: HOY }, hoy: HOY, ahoraMin: 900 });
    expect(m.some((x) => x.nombre === "Vieja V.")).toBe(false);
    expect(m.reduce((s, x) => s + x.vendido, 0)).toBe(150);
    expect(filasPorPersona(filas).has("null")).toBe(false);
  });
});

describe("medirGrupo", () => {
  const med = (o: Partial<MedidaPersona>): MedidaPersona => ({
    personaId: "x", nombre: "X", vendido: 0, ventas: 0, prendas: 0, ticket: null, muestraChica: true, meta: null, tocaba: null, pct: null, tocaPct: null, lectura: null, metaHoy: 0, tocabaHoy: 0, mejorDia: null, ...o,
  });
  const dSerie = (fecha: string, total: number, ventas: number, metaSede: number | null): DiaSerie => ({ fecha, total, ventas, metaSede, metaAsignada: null });

  it("sin la tienda, suma a las personas", () => {
    const g = medirGrupo({ medidas: [med({ vendido: 100, ventas: 2, prendas: 3, meta: 200, tocaba: 80 }), med({ vendido: 50, ventas: 1, prendas: 1, meta: 100, tocaba: 40 })], tramo: { desde: dia(1), hasta: HOY }, hoy: HOY });
    expect(g).toMatchObject({ vendido: 150, ventas: 3, prendas: 4, ticket: 50, meta: 300, tocaba: 120, diferencia: 30 });
  });

  it("sin meta de nadie, no hay diferencia ni lectura", () => {
    const g = medirGrupo({ medidas: [med({ vendido: 100, ventas: 1 })], tramo: { desde: dia(1), hasta: HOY }, hoy: HOY });
    expect(g.meta).toBeNull();
    expect(g.diferencia).toBeNull();
    expect(g.lectura).toBeNull();
  });

  it("con la tienda, cuenta lo de su serie, también lo que no tiene quien atendió", () => {
    const serie = [dSerie(dia(1), 300, 3, 200), dSerie(dia(2), 100, 1, 200), dSerie(dia(31), 0, 0, 200)];
    const g = medirGrupo({ medidas: [med({ vendido: 250, ventas: 2, meta: 400, tocaba: 400 })], tramo: { desde: dia(1), hasta: HOY }, hoy: HOY, serieTienda: serie });
    expect(g.vendido).toBe(400);
    expect(g.ventas).toBe(4);
    expect(g.meta).toBe(600); // el mes entero
    expect(g.tocaba).toBe(400); // los días que ya pasaron
    expect(g.diferencia).toBe(0);
  });

  it("de hoy, a la tienda le toca lo que corrió de los turnos, aunque una líder haya ajustado a alguien", () => {
    const serie = [dSerie(HOY, 100, 1, 1000)];
    const g = medirGrupo({
      medidas: [med({ meta: 400, tocaba: 100, metaHoy: 400, tocabaHoy: 100 }), med({ meta: 400, tocaba: 300, metaHoy: 400, tocabaHoy: 300 })],
      tramo: { desde: HOY, hasta: HOY },
      hoy: HOY,
      serieTienda: serie,
    });
    expect(g.meta).toBe(1000);
    expect(g.tocaba).toBe(500); // 400 de 800 corrió: la mitad de los 1.000 de la tienda
    expect(g.lectura).toBe("Por debajo");
  });

  it("si todavía no toca nada, no hay diferencia: nadie va «arriba» de cero", () => {
    const g = medirGrupo({ medidas: [med({ vendido: 90, ventas: 1, meta: 100, tocaba: 0, metaHoy: 100, tocabaHoy: 0 })], tramo: { desde: HOY, hasta: HOY }, hoy: HOY });
    expect(g.meta).toBe(100);
    expect(g.tocaba).toBe(0);
    expect(g.diferencia).toBeNull();
    expect(g.lectura).toBeNull();
  });

  it("una tienda sin meta dice lo vendido y nada más", () => {
    const g = medirGrupo({ medidas: [], tramo: { desde: dia(1), hasta: HOY }, hoy: HOY, serieTienda: [dSerie(dia(1), 300, 3, null)] });
    expect(g.vendido).toBe(300);
    expect(g.meta).toBeNull();
    expect(g.tocaba).toBeNull();
  });
});

describe("el cierre del mes", () => {
  const serie: DiaSerie[] = Array.from({ length: 31 }, (_, i) => ({
    fecha: dia(i + 1), total: i + 1 <= 24 ? 100 : 0, ventas: i + 1 <= 24 ? 1 : 0, metaSede: 120, metaAsignada: null,
  }));

  it("usa la proyección real: lo vendido más el ritmo por los días que quedan", () => {
    const s = simuladorDeCierre(serie, HOY);
    expect(s?.vendido).toBe(2400);
    expect(s?.diasQueQuedan).toBe(7);
    expect(s?.ritmoPorDia).toBe(100);
    expect(s?.proyeccion).toBe(3100);
    expect(s?.metaMes).toBe(3720);
    expect(s?.faltaPorDia).toBeCloseTo((3720 - 2400) / 7);
  });

  it("la barra alcanza para probar lo que hace falta", () => {
    const s = simuladorDeCierre(serie, HOY)!;
    expect(s.tope).toBeGreaterThanOrEqual(s.faltaPorDia!);
    expect(s.tope).toBeGreaterThanOrEqual(s.ritmoPorDia);
    expect(s.tope % 50).toBe(0);
  });

  it("recalcula con lo que se pruebe, y nunca resta", () => {
    expect(cierreSimulado({ vendido: 2400, diasQueQuedan: 7 }, 200)).toBe(3800);
    expect(cierreSimulado({ vendido: 2400, diasQueQuedan: 7 }, -50)).toBe(2400);
  });

  it("con menos de 3 días con ventas no proyecta", () => {
    expect(simuladorDeCierre(serie.slice(0, 2), "2026-10-03")).toBeNull();
  });

  it("serieDeFilas arma la de un grupo y deja afuera a los demás", () => {
    const filas = [fila(dia(1), 100, 50, "ana"), fila(dia(1), 70, 30, "beto"), fila(dia(2), 10, 0, "ana"), fila(dia(1), 5, null, null)];
    expect(serieDeFilas(filas, (id) => id === "ana")).toEqual([
      { fecha: dia(1), total: 100, ventas: 1, metaSede: 50, metaAsignada: null },
      { fecha: dia(2), total: 10, ventas: 1, metaSede: null, metaAsignada: null },
    ]);
    expect(serieDeFilas(filas, () => true)[0]).toMatchObject({ total: 175, metaSede: 80 });
  });
});

describe("fraseDelEquipo", () => {
  const con = (nombre: string, lectura: MedidaPersona["lectura"]) => ({ personaId: nombre, nombre, lectura }) as MedidaPersona;
  const frase = (medidas: MedidaPersona[]) => {
    const partes = fraseDelEquipo(medidas);
    return partes && fraseEnTexto(partes);
  };

  it("nombra a quién reconocer y a quién acompañar", () => {
    expect(frase([con("Ana T.", "Adelante"), con("Elena V.", "Adelante"), con("Diana P.", "Por debajo"), con("Carla R.", "En ritmo")])).toBe("Ana y Elena van adelante. Conviene acompañar a Diana.");
    expect(frase([con("Ana T.", "Adelante")])).toBe("Ana va adelante.");
    expect(frase([con("Ana T.", "Por debajo"), con("Beto S.", "Por debajo"), con("Carla R.", "Por debajo")])).toBe("Conviene acompañar a Ana, Beto y Carla.");
  });

  it("todos en ritmo lo dice, y sin lecturas no dice nada", () => {
    expect(frase([con("Ana T.", "En ritmo"), con("Beto S.", "En ritmo")])).toBe("Todo el equipo va en ritmo.");
    expect(frase([con("Ana T.", null)])).toBeNull();
    expect(frase([])).toBeNull();
  });

  it("cada nombre lleva a su persona, aunque dos se llamen igual", () => {
    const partes = fraseDelEquipo([{ ...con("Ana T.", "Por debajo"), personaId: "uno" }, { ...con("Ana R.", "Por debajo"), personaId: "dos" }]);
    expect(partes).toEqual(["Conviene acompañar a ", { personaId: "uno", nombre: "Ana" }, " y ", { personaId: "dos", nombre: "Ana" }, "."]);
  });
});

describe("el gráfico", () => {
  const dias = [dia(1), dia(2), dia(3), dia(4)];
  const filas: FilaPersonaDia[] = [fila(dia(1), 100, 50, "ana"), fila(dia(1), 40, 30, "beto"), fila(dia(2), 60, 50, "ana"), fila(dia(2), 10, null, null), fila("2026-09-01", 70, 40, "ana"), fila("2026-09-02", 30, 40, "beto"), fila("2026-09-30", 5, 40, "ana")];

  it("cada día dice lo de cada persona que se mira, con su meta", () => {
    const e = diasParaGrafico(dias, filas, (id) => id !== "beto");
    expect(e[0].total).toBe(100);
    expect(e[0].porPersona.get("ana")).toBe(100);
    expect(e[0].metaDia).toBe(50);
    expect(e[1].porPersona.get(null)).toBe(10);
    expect(e[2].total).toBe(0);
    expect(e[2].metaDia).toBeNull();
  });

  it("lo sumado parte el 1 del mes, se queda quieto después de `hasta`, y la meta sumada sigue hasta el final", () => {
    const e = diasParaGrafico(["2026-09-30", ...dias], filas, () => true);
    expect(sumadoDelMes(e, HOY, dia(2))).toEqual([null, 140, 210, 210, 210]);
    expect(metaSumadaDelMes(e, HOY)).toEqual([null, 80, 130, 130, 130]);
  });

  it("sin metas no hay curva de lo que tocaba", () => {
    expect(metaSumadaDelMes(diasParaGrafico(dias, [fila(dia(1), 10, null)], () => true), HOY)).toEqual([null, null, null, null]);
  });

  it("el mes pasado se pone día con día, y solo con quien se mira", () => {
    expect(mesPasadoEnEje(dias, filas, HOY, () => true, false)).toEqual([70, 30, 0, 0]);
    expect(mesPasadoEnEje(dias, filas, HOY, (id) => id === "ana", false)).toEqual([70, 0, 0, 0]);
    expect(mesPasadoEnEje(dias, filas, HOY, () => true, true)).toEqual([70, 100, 100, 100]);
  });

  it("si el mes pasado fue más corto, los últimos días no se comparan con nada", () => {
    const octubre31 = [dia(30), dia(31)];
    expect(mesPasadoEnEje(octubre31, filas, HOY, () => true, false)).toEqual([5, null]);
  });

  it("arrastrar elige, mueve bordes y traslada, sin pasar de hoy ni quedar al revés", () => {
    const eje = Array.from({ length: 31 }, (_, i) => dia(i + 1));
    const base = { dias: eje, hoy: HOY, desdeI: 4, hastaI: 9 };
    expect(tramoArrastrado({ ...base, gesto: "nuevo", puntoInicial: 12, puntoAhora: 8 })).toEqual({ desde: dia(9), hasta: dia(13) });
    expect(tramoArrastrado({ ...base, gesto: "nuevo", puntoInicial: 20, puntoAhora: 30 })).toEqual({ desde: dia(21), hasta: dia(24) });
    expect(tramoArrastrado({ ...base, gesto: "desde", puntoInicial: 4, puntoAhora: 2 })).toEqual({ desde: dia(3), hasta: dia(10) });
    expect(tramoArrastrado({ ...base, gesto: "desde", puntoInicial: 4, puntoAhora: 20 })).toEqual({ desde: dia(10), hasta: dia(10) });
    expect(tramoArrastrado({ ...base, gesto: "hasta", puntoInicial: 9, puntoAhora: 2 })).toEqual({ desde: dia(5), hasta: dia(5) });
    expect(tramoArrastrado({ ...base, gesto: "mover", puntoInicial: 6, puntoAhora: 8 })).toEqual({ desde: dia(7), hasta: dia(12) });
    expect(tramoArrastrado({ ...base, gesto: "mover", puntoInicial: 6, puntoAhora: 30 })).toEqual({ desde: dia(19), hasta: dia(24) });
    expect(tramoArrastrado({ ...base, gesto: "mover", puntoInicial: 6, puntoAhora: 0 })).toEqual({ desde: dia(1), hasta: dia(6) });
  });

  it("qué hace arrastrar según desde dónde", () => {
    expect(gestoEn(50, 40, 100, true)).toBe("nuevo");
    expect(gestoEn(45, 40, 100, false)).toBe("desde");
    expect(gestoEn(95, 40, 100, false)).toBe("hasta");
    expect(gestoEn(70, 40, 100, false)).toBe("mover");
    expect(gestoEn(150, 40, 100, false)).toBe("nuevo");
  });
});

describe("la fila abierta", () => {
  it("otra meta cambia los días del mes en proporción y no toca el mes pasado", () => {
    const filas = [fila(dia(1), 10, 100), fila(dia(2), 10, null), fila("2026-09-30", 10, 80)];
    const r = filasConOtraMeta(filas, HOY, 1000, 1500);
    expect(r[0].metaDia).toBe(150);
    expect(r[1].metaDia).toBeNull();
    expect(r[2].metaDia).toBe(80);
  });

  it("sin meta actual no hay en qué proporción cambiar", () => {
    const filas = [fila(dia(1), 10, 100)];
    expect(filasConOtraMeta(filas, HOY, 0, 500)).toEqual(filas);
  });

  it("con otra meta, la lectura de la persona cambia", () => {
    const filas = mes(() => 100);
    expect(medir(filas).lectura).toBe("En ritmo");
    expect(medir(filasConOtraMeta(filas, HOY, 3100, 2000)).lectura).toBe("Adelante");
    expect(medir(filasConOtraMeta(filas, HOY, 3100, 5000)).lectura).toBe("Por debajo");
  });

  it("su día fuerte", () => {
    // 3 de octubre de 2026 es sábado, 5 es lunes.
    expect(suDiaFuerte([fila(dia(3), 300), fila(dia(10), 100), fila(dia(5), 100)], HOY)).toEqual({ dia: "los sábados", parte: 80 });
    expect(suDiaFuerte([fila(dia(25), 300)], HOY)).toBeNull();
    // Un solo sábado no dice que venda más los sábados.
    expect(suDiaFuerte([fila(dia(3), 300), fila(dia(5), 100)], HOY)).toBeNull();
    expect(suDiaFuerte([], HOY)).toBeNull();
  });

  it("el calendario empieza el lunes, y lo que no ha llegado va apagado", () => {
    const c = calendarioDelMes([fila(dia(10), 200), fila(dia(11), 100)], HOY);
    expect(c.hueco).toBe(3); // el 1 de octubre de 2026 es jueves
    expect(c.dias.length).toBe(31);
    expect(c.dias[9]).toMatchObject({ n: 10, total: 200, intensidad: 1, llego: true });
    expect(c.dias[10].intensidad).toBe(0.5);
    expect(c.dias[24].llego).toBe(false);
  });
});

describe("la URL", () => {
  it("toma un tramo válido, y lo roto vuelve a este mes", () => {
    expect(tramoDeUrl({ desde: dia(5), hasta: dia(12) }, HOY)).toEqual({ desde: dia(5), hasta: dia(12) });
    expect(tramoDeUrl({ desde: dia(12), hasta: dia(5) }, HOY)).toEqual(tramoDePreset("mes", HOY));
    expect(tramoDeUrl({ desde: dia(5), hasta: dia(28) }, HOY)).toEqual(tramoDePreset("mes", HOY));
    expect(tramoDeUrl({ desde: "2020-01-01", hasta: "2020-01-02" }, HOY)).toEqual(tramoDePreset("mes", HOY));
    expect(tramoDeUrl({ desde: "x", hasta: "y" }, HOY)).toEqual(tramoDePreset("mes", HOY));
  });

  it("los enlaces de antes siguen sirviendo", () => {
    expect(tramoDeUrl({ vista: "hoy" }, HOY)).toEqual(tramoDePreset("hoy", HOY));
    expect(tramoDeUrl({ vista: "semana" }, HOY)).toEqual(tramoDePreset("semana", HOY));
    expect(tramoDeUrl({}, HOY)).toEqual(tramoDePreset("mes", HOY));
  });
});

describe("el buscador que entiende", () => {
  const m = (nombre: string, lectura: MedidaPersona["lectura"]) => ({ personaId: nombre, nombre, lectura }) as MedidaPersona;
  const contexto = { medidas: [m("Ana T.", "Adelante"), m("Diana P.", "Por debajo"), m("Mónica R.", "Por debajo")], sedes: [{ ubicacionId: "aqp", nombre: "Tienda Arequipa" }, { ubicacionId: "tru", nombre: "Tienda Trujillo" }], activaId: "tru", hoy: HOY };
  const q = (t: string) => interpretarBusqueda(t, contexto);

  it("una persona, sin importar tildes ni mayúsculas", () => {
    expect(q("MONICA")).toEqual([{ tipo: "persona", personaId: "Mónica R.", nombre: "Mónica R." }]);
    expect(q("ana").map((x) => (x.tipo === "persona" ? x.nombre : x.tipo))).toEqual(["Ana T.", "Diana P."]);
  });

  it("un grupo, solo si hay alguien en él", () => {
    expect(q("por deb")).toEqual([{ tipo: "lectura", lectura: "Por debajo", cuantas: 2 }]);
    expect(q("en ritmo")).toEqual([]);
  });

  it("días y tramos del mes, que ya llegaron", () => {
    expect(q("del 5 al 12")).toEqual([{ tipo: "tramo", tramo: { desde: dia(5), hasta: dia(12) }, texto: "del 5 al 12 de octubre" }]);
    expect(q("del 12 al 5")[0]).toMatchObject({ tramo: { desde: dia(5), hasta: dia(12) } });
    expect(q("día 10")[0]).toMatchObject({ tramo: { desde: dia(10), hasta: dia(10) } });
    expect(q("10")[0]).toMatchObject({ tramo: { desde: dia(10), hasta: dia(10) } });
    expect(q("día 28")).toEqual([]);
    expect(q("del 20 al 28")).toEqual([]);
  });

  it("períodos, tienda, modo y mes pasado", () => {
    expect(q("hoy")[0]).toMatchObject({ tipo: "tramo", texto: "hoy" });
    expect(q("sem")[0]).toMatchObject({ tipo: "tramo", texto: "los últimos 7 días" });
    expect(q("ayer")[0]).toMatchObject({ tipo: "tramo", texto: "ayer" });
    expect(q("arequipa")).toEqual([{ tipo: "sede", ubicacionId: "aqp", nombre: "Tienda Arequipa" }]);
    expect(q("trujillo")).toEqual([]); // ya está en ella
    expect(q("sumado")).toEqual([{ tipo: "modo", modo: "suma", texto: "Ver lo sumado" }]);
    expect(q("mes pasado")).toEqual([{ tipo: "mesPasado" }]);
    expect(q("pasado")).toEqual([{ tipo: "mesPasado" }]);
  });

  it("lo que no entiende no lo inventa", () => {
    expect(q("")).toEqual([]);
    expect(q("xyz")).toEqual([]);
  });

  it("filtra por nombre", () => {
    expect(nombreCoincide("Mónica R.", "moni")).toBe(true);
    expect(nombreCoincide("Ana T.", "")).toBe(true);
    expect(nombreCoincide("Ana T.", "xyz")).toBe(false);
  });
});

describe("lo que se baja", () => {
  const base = { personaId: "a", nombre: "Ana T.", vendido: 1234.4, ventas: 9, prendas: 12, ticket: 137.2, muestraChica: true, meta: 2000, tocaba: 1000, pct: 61.7, tocaPct: 50, lectura: "Adelante", metaHoy: 0, tocabaHoy: 0, mejorDia: { fecha: dia(3), total: 300 } } as MedidaPersona;

  it("dice lo que se ve, con la meta solo si la hay", () => {
    expect(loQueSeBaja([base], true)).toEqual({ encabezados: ["Persona", "Cómo va", "Avance %", "Meta", "Vendido", "Ventas", "Prendas", "Ticket", "Mejor día"], filas: [["Ana T.", "Adelante", 62, 2000, 1234, 9, 12, 137, dia(3)]] });
    expect(loQueSeBaja([base], false).filas[0]).toEqual(["Ana T.", 1234, 9, 12, 137, dia(3)]);
  });

  it("lo que no tiene dato va vacío, nunca en 0", () => {
    expect(loQueSeBaja([{ ...base, lectura: null, pct: null, meta: null, ticket: null, mejorDia: null }], true).filas[0]).toEqual(["Ana T.", "", "", "", 1234, 9, 12, "", ""]);
  });
});
