import { describe, expect, it } from "vitest";
import {
  UNIDADES_INSUMO,
  agruparPorTela,
  cantidadTexto,
  capitalEnLotes,
  consumoSemanal,
  efectoEnSaldo,
  estadoInsumo,
  leerCantidad,
  loteMasAntiguoConSaldo,
  piezasDeCompra,
  redondearCantidad,
  saldoDeInsumo,
  saldoDeLote,
  semanasDeCobertura,
  textoDeCompra,
  textoDeMovimiento,
  tramoDeSaldo,
  unidadesPermitidas,
  type LoteConSaldo,
  type LoteInsumo,
  type MaterialVista,
  type MovimientoInsumo,
} from "./insumos-reglas";

const lote = (id: string, ingreso: string, cantidadIngresada: number, extra: Partial<LoteInsumo> = {}): LoteInsumo => ({
  id,
  insumoId: "lino",
  codigo: id,
  ingreso,
  creadoEn: `${ingreso}T10:00:00Z`,
  cantidadIngresada,
  costoUnitario: 18.5,
  documento: null,
  origen: "compra",
  ...extra,
});
const mov = (tipo: MovimientoInsumo["tipo"], cantidad: number, loteId: string | null = null, creadoEn = "2026-09-15T10:00:00Z"): MovimientoInsumo => ({
  id: `${tipo}-${cantidad}-${loteId}`,
  insumoId: "lino",
  loteId,
  tipo,
  cantidad,
  produccionId: null,
  motivo: null,
  creadoEn,
});
const conSaldo = (l: LoteInsumo, saldo: number): LoteConSaldo => ({ ...l, saldo });

describe("saldo: la suma del ledger, con el signo que le da el tipo", () => {
  it("compra y devolución suman; consumo y merma restan; el ajuste trae su signo", () => {
    expect(efectoEnSaldo("compra", 10)).toBe(10);
    expect(efectoEnSaldo("devolucion", 4)).toBe(4);
    expect(efectoEnSaldo("consumo", 3)).toBe(-3);
    expect(efectoEnSaldo("merma", 1)).toBe(-1);
    expect(efectoEnSaldo("ajuste", -2)).toBe(-2);
    expect(efectoEnSaldo("ajuste", 5)).toBe(5);
  });
  it("el saldo de un insumo es la suma con signo", () => {
    expect(saldoDeInsumo([mov("compra", 120), mov("consumo", 41), mov("consumo", 66), mov("devolucion", 6), mov("ajuste", -2)])).toBe(17);
  });
  it("sin movimientos no hay saldo", () => {
    expect(saldoDeInsumo([])).toBe(0);
  });
});

describe("saldoDeLote", () => {
  const l = lote("L-1", "2026-09-02", 120);
  it("es lo ingresado menos consumo y merma, más devoluciones — sin volver a sumar la compra que abrió el lote", () => {
    const movs = [mov("compra", 120, "L-1"), mov("consumo", 41, "L-1"), mov("consumo", 66, "L-1"), mov("merma", 2, "L-1"), mov("devolucion", 5, "L-1")];
    expect(saldoDeLote(l, movs)).toBe(16);
  });
  it("ignora los movimientos de otros lotes y los ajustes sin lote", () => {
    expect(saldoDeLote(l, [mov("consumo", 30, "L-2"), mov("ajuste", -4, null)])).toBe(120);
  });
});

// Hallazgo N.º 4 de la auditoría del 2026-11-28: la resta en coma flotante daba 33.400000000000006 y
// `ajustar_lote_usado` (que compara exacto contra el `numeric(12,3)` de la base) rechazaba el ajuste para siempre.
describe("el saldo sale con la escala de la base (3 decimales), no con el ruido de la coma flotante", () => {
  const cien = lote("L-1", "2026-09-02", 100);
  // Lo que da Postgres con `numeric`, calculado en milésimas enteras (exacto en JS).
  const exacto = (ingresado: number, salidas: number[]) => (Math.round(ingresado * 1000) - salidas.reduce((s, c) => s + Math.round(c * 1000), 0)) / 1000;
  // Generador con semilla fija: los mismos cortes en cada corrida.
  const azar = (semilla: number) => () => {
    semilla = (semilla * 1_103_515_245 + 12_345) % 2_147_483_648;
    return semilla / 2_147_483_648;
  };

  it("redondearCantidad deja tres decimales, la mitad lejos del cero (como `round` de `numeric`) y nunca −0", () => {
    expect(redondearCantidad(33.400000000000006)).toBe(33.4);
    expect(redondearCantidad(98.99999999999523)).toBe(99);
    expect(redondearCantidad(1.0005)).toBe(1.001);
    expect(redondearCantidad(-1.0005)).toBe(-1.001);
    expect(redondearCantidad(12.25)).toBe(12.25);
    expect(Object.is(redondearCantidad(-1e-15), 0)).toBe(true);
    expect(Object.is(redondearCantidad(-0), 0)).toBe(true);
  });
  it("100 − 33.3 − 33.3 es 33.4 en el lote", () => {
    expect(100 - 33.3 - 33.3).not.toBe(33.4); // el bug: así resta JavaScript
    expect(saldoDeLote(cien, [mov("merma", 33.3, "L-1"), mov("merma", 33.3, "L-1")])).toBe(33.4);
  });
  it("100 − 33.3 − 33.3 es 33.4 en el insumo", () => {
    expect(saldoDeInsumo([mov("compra", 100), mov("merma", 33.3), mov("consumo", 33.3)])).toBe(33.4);
  });
  it("con devoluciones y cortes de tres decimales también cuadra", () => {
    expect(saldoDeLote(cien, [mov("consumo", 12.345, "L-1"), mov("devolucion", 0.1, "L-1"), mov("merma", 0.2, "L-1")])).toBe(87.555);
    expect(saldoDeInsumo([mov("compra", 0.3), mov("consumo", 0.1), mov("consumo", 0.2)])).toBe(0);
  });
  it("un lote que se acabó dice 0 justo (no 1e-15), así no vuelve a salir primero en el PEPS", () => {
    const tres = lote("L-1", "2026-09-02", 0.3);
    const saldo = saldoDeLote(tres, [mov("consumo", 0.1, "L-1"), mov("consumo", 0.2, "L-1")]);
    expect(Object.is(saldo, 0)).toBe(true);
    expect(loteMasAntiguoConSaldo([conSaldo(tres, saldo)])).toBeNull();
  });
  it("nunca devuelve −0 (un saldo negativo que se cierra en cero es cero)", () => {
    expect(Object.is(saldoDeInsumo([mov("ajuste", -0.1), mov("ajuste", -0.2), mov("compra", 0.3)]), 0)).toBe(true);
  });
  it("un saldo negativo se redondea igual que uno positivo", () => {
    expect(saldoDeInsumo([mov("ajuste", -0.1), mov("ajuste", -0.2)])).toBe(-0.3);
  });
  it("muchas mermas pequeñas: 1 000 cortes de 0.001 m dejan 99 m", () => {
    expect(saldoDeLote(cien, Array.from({ length: 1000 }, () => mov("merma", 0.001, "L-1")))).toBe(99);
  });
  it("cortes al azar con 1 a 3 decimales dan siempre lo mismo que la base", () => {
    const r = azar(20261128);
    for (let caso = 0; caso < 2000; caso++) {
      const ingresado = Math.round(r() * 5_000_000) / 1000; // hasta 5 000 m
      const salidas: number[] = [];
      let queda = Math.round(ingresado * 1000);
      for (let i = 0; i < 1 + Math.floor(r() * 40) && queda > 0; i++) {
        const decimales = 1 + Math.floor(r() * 3);
        const paso = 10 ** (3 - decimales);
        const corte = Math.min(queda, Math.floor((r() * queda) / paso) * paso);
        queda -= corte;
        salidas.push(corte / 1000);
      }
      const l = lote("L-1", "2026-09-02", ingresado);
      expect(saldoDeLote(l, salidas.map((c) => mov("consumo", c, "L-1")))).toBe(exacto(ingresado, salidas));
      expect(saldoDeInsumo([mov("compra", ingresado), ...salidas.map((c) => mov("merma", c))])).toBe(exacto(ingresado, salidas));
    }
  });
});

describe("loteMasAntiguoConSaldo (PEPS por lote)", () => {
  const a = conSaldo(lote("A", "2026-09-02", 120), 0);
  const b = conSaldo(lote("B", "2026-09-16", 80), 80);
  const c = conSaldo(lote("C", "2026-09-05", 50), 10);
  it("elige el más antiguo que todavía tiene saldo", () => {
    expect(loteMasAntiguoConSaldo([b, a, c])?.id).toBe("C");
  });
  it("con el mismo día desempata por quién se abrió primero", () => {
    const x = conSaldo(lote("X", "2026-09-05", 10, { creadoEn: "2026-09-05T15:00:00Z" }), 10);
    const y = conSaldo(lote("Y", "2026-09-05", 10, { creadoEn: "2026-09-05T09:00:00Z" }), 10);
    expect(loteMasAntiguoConSaldo([x, y])?.id).toBe("Y");
  });
  it("sin lotes con saldo no hay ninguno", () => {
    expect(loteMasAntiguoConSaldo([a])).toBeNull();
    expect(loteMasAntiguoConSaldo([])).toBeNull();
  });
});

describe("estadoInsumo", () => {
  it("sin saldo, bajo el mínimo o bien", () => {
    expect(estadoInsumo(0, 60).tono).toBe("sin_saldo");
    expect(estadoInsumo(-3, 60).tono).toBe("sin_saldo");
    expect(estadoInsumo(59.9, 60).tono).toBe("bajo");
    expect(estadoInsumo(60, 60).tono).toBe("bien");
  });
  it("sin mínimo definido no puede estar «bajo»: se dice", () => {
    expect(estadoInsumo(10, null)).toEqual({ tono: "sin_minimo", etiqueta: "Sin mínimo" });
  });
  it("el veredicto va en palabras de tienda (P10 del análisis del Taller): se acabó, bajo el mínimo, alcanza", () => {
    expect(estadoInsumo(0, 60).etiqueta).toBe("Se acabó");
    expect(estadoInsumo(59.9, 60).etiqueta).toBe("Bajo el mínimo");
    expect(estadoInsumo(4438, 1).etiqueta).toBe("Alcanza");
  });
});

describe("cobertura medida", () => {
  const hoy = "2026-09-19";
  it("el consumo semanal sale de lo consumido en las últimas 4 semanas", () => {
    const movs = [mov("consumo", 40, "L", "2026-09-10T10:00:00Z"), mov("consumo", 30, "L", "2026-09-01T10:00:00Z"), mov("compra", 500, "L", "2026-09-11T10:00:00Z")];
    expect(consumoSemanal(movs, hoy)).toBeCloseTo(70 / 4, 5);
  });
  it("lo devuelto al estante resta del consumo medido", () => {
    const movs = [mov("consumo", 40, "L", "2026-09-10T10:00:00Z"), mov("devolucion", 12, "L", "2026-09-11T10:00:00Z")];
    expect(consumoSemanal(movs, hoy)).toBeCloseTo(28 / 4, 5);
  });
  it("lo anterior a la ventana no cuenta", () => {
    expect(consumoSemanal([mov("consumo", 99, "L", "2026-06-01T10:00:00Z")], hoy)).toBeNull();
  });
  it("sin consumo no hay ritmo: no se inventa cuánto dura", () => {
    expect(consumoSemanal([], hoy)).toBeNull();
    expect(semanasDeCobertura(50, null)).toBeNull();
  });
  it("las semanas son el saldo entre el ritmo", () => {
    expect(semanasDeCobertura(50, 25)).toBe(2);
    expect(semanasDeCobertura(-5, 25)).toBe(0);
  });
});

describe("capital y riel de saldo", () => {
  it("el capital vale cada lote a su costo, solo con lo que queda", () => {
    const ls = [conSaldo(lote("A", "2026-09-02", 120, { costoUnitario: 18.5 }), 13), conSaldo(lote("B", "2026-09-16", 80, { costoUnitario: 19.8 }), 80)];
    expect(capitalEnLotes(ls)).toBeCloseTo(13 * 18.5 + 80 * 19.8, 5);
  });
  it("sin ver costos no hay capital (no se calcula con datos que faltan)", () => {
    expect(capitalEnLotes([conSaldo(lote("A", "2026-09-02", 10, { costoUnitario: null }), 10)])).toBeNull();
  });
  it("el mínimo queda a un tercio del riel", () => {
    const t = tramoDeSaldo(30, 60);
    expect(t.marcaMinimo).toBeCloseTo(1 / 3, 5);
    expect(t.llenado).toBeCloseTo(30 / 180, 5);
  });
  it("si el saldo supera el tope, el riel se llena y la marca sigue proporcional", () => {
    expect(tramoDeSaldo(500, 60).llenado).toBe(1);
  });
});

describe("unidades por tipo (ADR-0554)", () => {
  it("una tela se lleva solo en metros; un avío, en cualquiera de las seis", () => {
    expect(unidadesPermitidas("tela")).toEqual(["metro"]);
    expect([...unidadesPermitidas("avio")].sort()).toEqual(["cono", "docena", "kilo", "metro", "par", "unidad"]);
  });
  it("todo lo que la hoja ofrece existe como unidad con su texto", () => {
    for (const t of ["tela", "avio"] as const) for (const u of unidadesPermitidas(t)) expect(UNIDADES_INSUMO[u].larga).toBeTruthy();
  });
});

describe("agruparPorTela: cada tela con sus colores juntos", () => {
  const tela = (id: string): MaterialVista => ({ id, codigo: id.toUpperCase(), nombre: id, tipo: "tela", tejidoId: null, composicion: null, claseId: null, medida: null, unidad: "metro", merma: 0, compra: "metro", ancho: null, gramaje: null, metrosPorRollo: null, version: "v1" });
  it("junta los colores de la misma tela aunque no vengan seguidos, y respeta el orden en que aparece cada tela", () => {
    const g = agruparPorTela([{ id: "1", materialId: "b" }, { id: "2", materialId: "a" }, { id: "3", materialId: "b" }], [tela("a"), tela("b")]);
    expect(g.map((x) => [x.material?.id, x.insumos.map((i) => i.id)])).toEqual([["b", ["1", "3"]], ["a", ["2"]]]);
  });
  it("un insumo suelto, o de una tela que no se leyó, queda solo y sin encabezado", () => {
    const g = agruparPorTela([{ id: "1" }, { id: "2", materialId: null }, { id: "3", materialId: "x" }], [tela("a")]);
    expect(g.map((x) => [x.material, x.insumos.length])).toEqual([[null, 1], [null, 1], [null, 1]]);
  });
});

describe("piezasDeCompra y textoDeCompra: cómo se compra, dato por dato y en una frase", () => {
  const m = { tipo: "tela" as const, ancho: null, gramaje: null, metrosPorRollo: null };
  it("por metro, por kilo (con su rinde) y por rollo (con sus metros)", () => {
    expect(textoDeCompra({ ...m, compra: "metro" })).toBe("Se compra por metro");
    expect(textoDeCompra({ ...m, compra: "kilo", ancho: 160, gramaje: 180 })).toBe("Se compra por kilo, rinde 3.47 metros por kilo");
    expect(textoDeCompra({ ...m, compra: "kilo" })).toBe("Se compra por kilo");
    expect(textoDeCompra({ ...m, compra: "rollo", metrosPorRollo: 80 })).toBe("Se compra por rollo, trae 80 metros por rollo");
  });
  it("cada dato es su propia pieza: una insignia por cada uno", () => {
    expect(piezasDeCompra({ ...m, compra: "metro" })).toEqual(["Se compra por metro"]);
    expect(piezasDeCompra({ ...m, compra: "kilo", ancho: 160, gramaje: 180 })).toEqual(["Se compra por kilo", "Rinde 3.47 metros por kilo"]);
    expect(piezasDeCompra({ ...m, compra: "rollo", metrosPorRollo: 80 })).toEqual(["Se compra por rollo", "Trae 80 metros por rollo"]);
    expect(piezasDeCompra({ ...m, compra: "rollo" })).toEqual(["Se compra por rollo"]);
  });
  it("ningún texto separa sus datos con un punto medio", () => {
    for (const compra of ["metro", "kilo", "rollo"] as const) expect(textoDeCompra({ ...m, compra, ancho: 160, gramaje: 180, metrosPorRollo: 80 })).not.toContain("·");
  });
  it("un avío se cuenta en su unidad", () => {
    expect(textoDeCompra({ ...m, tipo: "avio", compra: "cono" })).toBe("Se cuenta en conos");
    expect(textoDeCompra({ ...m, tipo: "avio", compra: "unidad" })).toBe("Se cuenta en unidades");
  });
});

describe("leerCantidad: la coma decimal se entiende y lo ambiguo no se adivina", () => {
  it("punto o coma, con hasta dos decimales", () => {
    const casos: [string, number][] = [["48", 48], ["48.2", 48.2], ["48,2", 48.2], ["0", 0], ["0,5", 0.5], [",5", 0.5], ["12,", 12], [" 48,25 ", 48.25], ["1 200", 1200]];
    for (const [texto, esperado] of casos) expect(leerCantidad(texto), texto).toBe(esperado);
  });
  it("tres decimales, miles, letras, signos y vacío son null (la hoja dice cómo escribirlo)", () => {
    for (const texto of ["1.200", "1,299", "1.299,5", "12,345", "4,5,5", "-3", "abc", "1e3", "0x10", "", "   ", "S/ 5"]) expect(leerCantidad(texto), texto).toBeNull();
  });
});

describe("texto", () => {
  it("las cantidades llevan los decimales de su unidad, siempre los mismos", () => {
    expect(cantidadTexto(12.54, "metro")).toBe("12.54 m");
    expect(cantidadTexto(40, "unidad")).toBe("40 unid.");
    expect(cantidadTexto(2.345, "kilo")).toBe("2.35 kg");
  });
  it("una tela se ve con dos decimales y no se redondea a lo que no es: 0.70 m no es «1 m»", () => {
    expect(cantidadTexto(0.7, "metro")).toBe("0.70 m");
    expect(cantidadTexto(9, "metro")).toBe("9.00 m");
    expect(cantidadTexto(12.25, "metro")).toBe("12.25 m");
    expect(cantidadTexto(1234.5, "metro")).toBe("1,234.50 m");
    expect(cantidadTexto(0, "metro")).toBe("0.00 m");
  });
  it("ver dos decimales no cambia cuánto se pide: eso lo manda `decimales`, no `vista`", () => {
    expect(UNIDADES_INSUMO.metro.vista).toBe(2);
    expect(UNIDADES_INSUMO.metro.decimales).toBe(1);
  });
  it("los movimientos se leen sin jerga", () => {
    expect(textoDeMovimiento({ tipo: "consumo", motivo: null })).toBe("Sale al cortar");
    expect(textoDeMovimiento({ tipo: "ajuste", motivo: "conteo" })).toBe("Ajuste: conteo");
  });
});
