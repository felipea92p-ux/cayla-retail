import { describe, expect, it } from "vitest";
import {
  cierreSimulado,
  diasDelEje,
  filasPorPersona,
  fraseDelEquipo,
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

  it("los 10 puntos se miden contra la meta del mes, como dice lecturaDeRitmo", () => {
    expect(medir(filas).lectura).toBe("En ritmo");
    expect(medir(mes((n) => (n <= 23 ? 120 : 0))).lectura).toBe("Adelante"); // 2760 de 3100: 89 %, tocaba 75,8 %
    expect(medir(mes((n) => (n <= 23 ? 80 : 0))).lectura).toBe("Por debajo"); // 1840 de 3100: 59 %, tocaba 75,8 %
  });

  it("repetir el mes: hasta un día pasado, la meta sigue siendo la del mes y lo que tocaba crece con los días", () => {
    const m = medir(filas, { desde: dia(1), hasta: dia(10) });
    expect(m.meta).toBe(3100);
    expect(m.tocaba).toBe(1000);
    expect(m.vendido).toBe(1000);
    expect(m.lectura).toBe("En ritmo");
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
  const con = (nombre: string, lectura: MedidaPersona["lectura"]) => ({ nombre, lectura }) as MedidaPersona;

  it("nombra a quién reconocer y a quién acompañar", () => {
    expect(fraseDelEquipo([con("Ana T.", "Adelante"), con("Elena V.", "Adelante"), con("Diana P.", "Por debajo"), con("Carla R.", "En ritmo")])).toBe("Ana y Elena van adelante. Conviene acompañar a Diana.");
    expect(fraseDelEquipo([con("Ana T.", "Adelante")])).toBe("Ana va adelante.");
    expect(fraseDelEquipo([con("Ana T.", "Por debajo"), con("Beto S.", "Por debajo"), con("Carla R.", "Por debajo")])).toBe("Conviene acompañar a Ana, Beto y Carla.");
  });

  it("todos en ritmo lo dice, y sin lecturas no dice nada", () => {
    expect(fraseDelEquipo([con("Ana T.", "En ritmo"), con("Beto S.", "En ritmo")])).toBe("Todo el equipo va en ritmo.");
    expect(fraseDelEquipo([con("Ana T.", null)])).toBeNull();
    expect(fraseDelEquipo([])).toBeNull();
  });
});
