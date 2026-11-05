import { describe, expect, it } from "vitest";
import { solesRedondo } from "./gastos-reglas";
import { delDia, diasDelMes, fraseDelRitmo, marcasDelRitmo, nombreDelDia, pieDelRitmo, ritmoDelMes, type FijoParaRitmo, type GastoParaRitmo } from "./gastos-ritmo-reglas";

let siguiente = 0;
const g = (fecha: string, montoTotal: number, extra: Partial<GastoParaRitmo> = {}): GastoParaRitmo => ({
  id: `g${++siguiente}`,
  fecha,
  montoTotal,
  estado: "vigente",
  categoria: "suministros",
  categoriaNombre: "Suministros",
  descripcion: "Bolsas",
  proveedorNombre: null,
  ubicacionId: "t",
  ubicacionNombre: "Tienda Trujillo",
  ...extra,
});
const alquiler = (fecha: string, monto: number, ubicacionId: string | null, ubicacionNombre: string | null) =>
  g(fecha, monto, { categoria: "alquileres", categoriaNombre: "Alquileres", descripcion: "Alquiler del local", ubicacionId, ubicacionNombre });
const fijo = (fechaEsperada: string, monto: number, extra: Partial<FijoParaRitmo> = {}): FijoParaRitmo => ({
  id: `f${++siguiente}`,
  estado: "por_llegar",
  fechaEsperada,
  monto,
  montoVariable: false,
  gastoId: null,
  descripcion: "Internet",
  categoriaNombre: "Internet",
  ubicacionId: "t",
  ubicacionNombre: "Tienda Trujillo",
  ...extra,
});
const ritmo = (e: Partial<Parameters<typeof ritmoDelMes>[0]>) => ritmoDelMes({ gastos: [], anteriores: null, fijos: [], mes: "2026-10", hoy: "2026-10-10", ...e });

describe("lo gastado sumado día a día", () => {
  it("suma solo lo vigente del mes, hasta hoy; lo anulado y en cero no cuenta", () => {
    const r = ritmo({ gastos: [g("2026-10-01", 100), g("2026-10-03", 50), g("2026-10-03", 70, { estado: "anulado" }), g("2026-10-04", 0), g("2026-09-30", 999)], hoy: "2026-10-04" });
    expect([r.dias, r.hasta, r.enCurso, r.aHoy]).toEqual([31, 4, true, 150]);
    expect(r.serie).toEqual([{ x: 1, y: 100 }, { x: 2, y: 100 }, { x: 3, y: 150 }, { x: 4, y: 150 }]);
  });

  it("un mes cerrado llega hasta su último día y no tiene «si sigue así»; uno que no empieza, nada", () => {
    const cerrado = ritmo({ gastos: [g("2026-09-30", 80)], mes: "2026-09", hoy: "2026-10-10" });
    expect([cerrado.hasta, cerrado.enCurso, cerrado.aHoy, cerrado.serie.length, cerrado.proyeccion]).toEqual([30, false, 80, 30, null]);
    expect(ritmo({ mes: "2026-11" })).toMatchObject({ hasta: 0, aHoy: 0, serie: [], proyeccion: null });
  });

  it("los días del mes, febrero incluido", () => {
    expect([diasDelMes("2026-02"), diasDelMes("2028-02"), diasDelMes("2026-09"), diasDelMes("2026-10")]).toEqual([28, 29, 30, 31]);
  });
});

describe("el mes anterior a la misma altura", () => {
  it("se suma por día del mes y se compara el mismo día; su cierre es todo el mes", () => {
    const r = ritmo({ gastos: [g("2026-10-02", 300)], anteriores: [g("2026-09-01", 100), g("2026-09-05", 200), g("2026-09-30", 50)], hoy: "2026-10-05" });
    expect(r.referencia!.length).toBe(30);
    expect(r.referencia!.slice(0, 5).map((p) => p.y)).toEqual([100, 100, 100, 100, 300]);
    expect([r.anteriorAEstaAltura, r.cierreAnterior]).toEqual([300, 350]);
  });

  it("un mes anterior más largo se corta en el último día de este (enero contra febrero)", () => {
    const r = ritmo({ anteriores: [g("2026-01-31", 40)], mes: "2026-02", hoy: "2026-03-02" });
    expect([r.referencia!.length, r.cierreAnterior, r.anteriorAEstaAltura]).toEqual([28, 40, 0]);
  });

  it("sin mes anterior (no se compara o no tiene ni un gasto vigente) no hay referencia", () => {
    for (const anteriores of [null, [], [g("2026-09-04", 90, { estado: "anulado" })]]) {
      expect(ritmo({ anteriores })).toMatchObject({ referencia: null, anteriorAEstaAltura: null, cierreAnterior: null });
    }
  });
});

describe("si sigue así", () => {
  it("un día normal cada día que falta: lo gastado sin los fijos ni los saltos, repartido en los días que pasaron", () => {
    const r = ritmo({ gastos: [alquiler("2026-10-03", 5000, "t", "Tienda Trujillo"), g("2026-10-04", 100), g("2026-10-06", 300), g("2026-10-08", 120, { id: "luz" })], fijos: [fijo("2026-10-08", 120, { estado: "registrado", gastoId: "luz" })] });
    // 5 520 a hoy (10 días); fuera quedan el alquiler (salto) y la luz (fijo): 400 / 10 = 40 por día.
    expect([r.aHoy, r.ritmoDiario]).toEqual([5520, 40]);
    expect(r.proyeccion![0]).toEqual({ x: 10, y: 5520 });
    expect(r.proyeccion!.length).toBe(22);
    expect(r.cierreProyectado).toBe(5520 + 21 * 40);
  });

  it("los fijos sin registrar se suman en su día; el atrasado, mañana; el registrado no se cuenta dos veces", () => {
    const r = ritmo({
      fijos: [fijo("2026-10-25", 90), fijo("2026-10-25", 60), fijo("2026-10-05", 200, { estado: "falta" }), fijo("2026-10-20", 500, { estado: "registrado", gastoId: "x" })],
    });
    expect(r.vienen.map((v) => [v.dia, v.monto, v.fijos.length])).toEqual([[11, 200, 1], [25, 150, 2]]);
    expect(r.cierreProyectado).toBe(350);
    expect(r.vienen[1]!.y).toBe(350);
  });

  it("un gasto ya anotado con fecha de más adelante no entra a lo de hoy: entra al «si sigue así» en su día", () => {
    const r = ritmo({ gastos: [alquiler("2026-10-02", 5000, "t", "Tienda Trujillo"), g("2026-10-03", 100), g("2026-10-20", 400)] });
    expect([r.aHoy, r.ritmoDiario, r.cierreProyectado]).toEqual([5100, 10, 5100 + 21 * 10 + 400]);
  });

  it("hoy es el último día: no queda nada que proyectar", () => {
    expect(ritmo({ gastos: [g("2026-10-02", 100)], fijos: [fijo("2026-10-31", 50)], hoy: "2026-10-31" })).toMatchObject({ proyeccion: null, cierreProyectado: null, vienen: [] });
  });
});

describe("los saltos grandes con su nombre", () => {
  const ALQUILERES = [alquiler("2026-10-03", 2400, "t", "Tienda Trujillo"), alquiler("2026-10-04", 1800, "a", "Tienda Arequipa"), alquiler("2026-10-05", 2100, "l", "Tienda Lima"), alquiler("2026-10-05", 300, "x", "Taller")];

  it("los de una categoría en días cercanos van juntos y suman todo lo de esos días, también lo chico", () => {
    const r = ritmo({ gastos: [...ALQUILERES, g("2026-10-06", 100)] });
    expect(r.saltos).toEqual([{ dia: 5, desde: 3, hasta: 5, categoria: "alquileres", largo: "Alquileres · 3 al 5 oct", corto: "Alquileres", monto: 6600 }]);
  });

  it("un solo gasto entre varias sedes se nombra por su sede; si todo es de una, por su día", () => {
    expect(ritmo({ gastos: [alquiler("2026-10-03", 2400, "t", "Tienda Trujillo"), g("2026-10-04", 100, { ubicacionId: "l", ubicacionNombre: "Tienda Lima" })] }).saltos[0]!.largo).toBe("Alquileres · Trujillo");
    expect(ritmo({ gastos: [alquiler("2026-10-03", 2400, null, null), g("2026-10-04", 100, { ubicacionId: null, ubicacionNombre: null })] }).saltos[0]!.largo).toBe("Alquileres · 3 oct");
  });

  it("tres como mucho, y uno a 3 días o menos de otro no abre su nota", () => {
    const gastos = [
      alquiler("2026-10-03", 2000, "t", "Tienda Trujillo"),
      g("2026-10-05", 1500, { categoria: "luz", categoriaNombre: "Luz" }),
      g("2026-10-12", 1400, { categoria: "software", categoriaNombre: "Software" }),
      g("2026-10-18", 1300, { categoria: "tributos", categoriaNombre: "Tributos" }),
      g("2026-10-25", 1200, { categoria: "asesoria", categoriaNombre: "Asesoría" }),
    ];
    expect(ritmo({ gastos, hoy: "2026-10-28" }).saltos.map((s) => s.corto)).toEqual(["Alquileres", "Software", "Tributos"]);
  });

  it("bajo el 6 % de lo más alto del mes no hay salto; y el cierre del mes anterior también cuenta como «lo más alto»", () => {
    expect(ritmo({ gastos: [g("2026-10-02", 50), g("2026-10-05", 60), alquiler("2026-10-08", 5000, "t", "Tienda Trujillo")] }).saltos.map((s) => s.corto)).toEqual(["Alquileres"]);
    expect(ritmo({ gastos: [g("2026-10-02", 1000)], anteriores: [g("2026-09-02", 20000)] }).saltos).toEqual([]);
  });
});

describe("cómo se dice", () => {
  it("en el mes en curso, contra el anterior a esta altura: más, menos o casi lo mismo", () => {
    const con = (antes: number) => fraseDelRitmo(ritmo({ gastos: [g("2026-10-02", 1000)], anteriores: [g("2026-09-02", antes)], hoy: "2026-10-05" }), "2026-10", "septiembre");
    expect(con(800)).toBe(`A hoy llevas ${solesRedondo(1000)}: ${solesRedondo(200)} más que septiembre a esta altura.`);
    expect(con(1500)).toBe(`A hoy llevas ${solesRedondo(1000)}: ${solesRedondo(500)} menos que septiembre a esta altura.`);
    expect(con(990)).toBe(`A hoy llevas ${solesRedondo(1000)}, casi lo mismo que septiembre a esta altura.`);
  });

  it("en un mes cerrado, el mes entero; sin anterior, solo lo de este; sin gastos, nada", () => {
    const cerrado = ritmo({ gastos: [g("2026-09-02", 1300)], anteriores: [g("2026-08-02", 1000)], mes: "2026-09" });
    expect(fraseDelRitmo(cerrado, "2026-09", "agosto")).toBe(`En septiembre gastaste ${solesRedondo(1300)}: ${solesRedondo(300)} más que agosto.`);
    expect(fraseDelRitmo(ritmo({ gastos: [g("2026-10-02", 70)] }), "2026-10", "septiembre")).toBe(`A hoy llevas ${solesRedondo(70)}.`);
    expect(fraseDelRitmo(ritmo({}), "2026-10", "septiembre")).toBeNull();
  });

  it("el pie del gráfico: de qué está hecho el «si sigue así» y cómo cerró el anterior, lo que haya", () => {
    const r = ritmo({
      gastos: [alquiler("2026-10-02", 5000, "t", "Tienda Trujillo"), g("2026-10-03", 100), g("2026-10-20", 400)],
      anteriores: [g("2026-09-02", 900)],
      fijos: [fijo("2026-10-25", 90), fijo("2026-10-28", 120)],
    });
    expect(pieDelRitmo(r, "2026-10", "septiembre")).toBe(
      `Si sigue así, cierras octubre en ≈ ${solesRedondo(r.cierreProyectado!)}: un día normal (${solesRedondo(10)}) por cada día que falta, más ${solesRedondo(210)} de 2 fijos por confirmar y ${solesRedondo(400)} ya anotados para después. Septiembre cerró en ${solesRedondo(900)}.`,
    );
    // Sin día normal (todo fue un salto) ni nada por venir, solo la cifra; con un solo día por delante, «el día que falta».
    expect(pieDelRitmo(ritmo({ gastos: [alquiler("2026-10-02", 5000, "t", "Tienda Trujillo")] }), "2026-10", "septiembre")).toBe(`Si sigue así, cierras octubre en ≈ ${solesRedondo(5000)}.`);
    expect(pieDelRitmo(ritmo({ gastos: [alquiler("2026-10-02", 5000, "t", "Tienda Trujillo"), g("2026-10-05", 300)], fijos: [fijo("2026-10-31", 90)], hoy: "2026-10-30" }), "2026-10", "septiembre")).toBe(
      `Si sigue así, cierras octubre en ≈ ${solesRedondo(5300 + 10 + 90)}: un día normal (${solesRedondo(10)}) por el día que falta, más ${solesRedondo(90)} de 1 fijo por confirmar.`,
    );
    expect(pieDelRitmo(ritmo({ gastos: [g("2026-09-02", 1)], anteriores: [g("2026-08-02", 900)], mes: "2026-09" }), "2026-09", "agosto")).toBe(`Agosto cerró en ${solesRedondo(900)}.`);
    expect(pieDelRitmo(ritmo({ mes: "2026-09" }), "2026-09", "agosto")).toBeNull();
  });

  it("los días de abajo: «hoy» en negrita sin el número que le cae encima; en un mes cerrado, sin «hoy»", () => {
    expect(marcasDelRitmo({ enCurso: true, hasta: 23 })).toEqual([
      { x: 1, texto: "1" },
      { x: 8, texto: "8" },
      { x: 15, texto: "15" },
      { x: 23, texto: "hoy", fuerte: true },
      { x: 29, texto: "29" },
    ]);
    expect(marcasDelRitmo({ enCurso: false, hasta: 30 }).map((m) => m.texto)).toEqual(["1", "8", "15", "22", "29"]);
  });

  it("el nombre de un día", () => {
    expect([nombreDelDia("2026-10", 1), nombreDelDia("2026-10", 23)]).toEqual(["jueves 1 de octubre", "viernes 23 de octubre"]);
  });
});

describe("el día elegido", () => {
  it("lo gastado ese día, del más grande al más chico, y lo que viene ese día", () => {
    const gastos = [g("2026-10-04", 30, { ubicacionId: null }), g("2026-10-04", 90), g("2026-10-04", 50, { estado: "anulado" }), g("2026-10-05", 10)];
    const r = ritmo({ gastos, fijos: [fijo("2026-10-25", 90)], hoy: "2026-10-23" });
    const d = delDia(r, gastos, "2026-10", 4);
    expect([d.gastos.map((x) => [x.monto, x.clave]), d.total, d.vienen]).toEqual([[[90, "t"], [30, "empresa"]], 120, []]);
    expect(delDia(r, gastos, "2026-10", 25).vienen.map((f) => f.monto)).toEqual([90]);
  });
});
