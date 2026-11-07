import {
  describe,
  expect,
  it } from "vitest"; import {   diasHasta,
  filaAPagar,
  leerFilaPorPagar,
  puedePagar,
  resumenTramos,
  textoUnidad,
  textoVence,
  totalPorPagar,
  tramoDe,
  type FilaPorPagar,
  TEXTO_NATURALEZA,
  fechaDeVence,
  textoDelPago,
} from "./por-pagar-consolidado-reglas";
import { proveedoresMayores } from "./que-debes-reglas";

const HOY = "2026-09-24";
const fila = (vence: string, saldo: number, extra: Partial<FilaPorPagar> = {}): FilaPorPagar => ({
  origen: "compras",
  id: `00000000-0000-4000-8000-${String(Math.round(saldo)).padStart(12, "0")}`,
  naturaleza: "mercaderia",
  proveedorId: "p",
  proveedor: "Proveedor",
  documento: "F001-1",
  tipo: "factura",
  concepto: null,
  fechaEmision: "2026-09-01",
  condicion: "credito",
  fechaVencimiento: vence,
  vence,
  ubicacionId: null,
  unidades: "Tienda Trujillo",
  total: saldo,
  pagado: 0,
  saldo,
  ...extra,
});

// Los ocho del spike (`datos.js`, POR_PAGAR), con hoy 24 sep: 1 vencida, 2 esta semana, 2 la próxima, 3 más adelante.
const SPIKE = [
  fila("2026-09-22", 6400),
  fila("2026-09-28", 612),
  fila("2026-09-30", 6200),
  fila("2026-10-02", 8950),
  fila("2026-10-06", 3380),
  fila("2026-10-09", 15300),
  fila("2026-10-15", 1300),
  fila("2026-10-20", 20400),
];

describe("diasHasta", () => {
  it("cuenta días de calendario, también al cruzar el mes", () => {
    expect(diasHasta("2026-09-24", HOY)).toBe(0);
    expect(diasHasta("2026-09-22", HOY)).toBe(-2);
    expect(diasHasta("2026-10-02", HOY)).toBe(8);
    expect(diasHasta("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("tramoDe: el calendario de vencimientos", () => {
  it("vencida = antes de hoy; hoy ya es «esta semana»", () => {
    expect(tramoDe({ vence: "2026-09-23" }, HOY)).toBe("vencidas");
    expect(tramoDe({ vence: HOY }, HOY)).toBe("semana");
  });
  it("esta semana llega al 7.º día; la próxima, del 8.º al 14.º; después, más adelante", () => {
    expect(tramoDe({ vence: "2026-10-01" }, HOY)).toBe("semana"); // +7
    expect(tramoDe({ vence: "2026-10-02" }, HOY)).toBe("proxima"); // +8
    expect(tramoDe({ vence: "2026-10-08" }, HOY)).toBe("proxima"); // +14
    expect(tramoDe({ vence: "2026-10-09" }, HOY)).toBe("despues"); // +15
  });
});

describe("resumenTramos: las cuatro cifras", () => {
  it("con los datos del spike da lo mismo que el spike", () => {
    expect(resumenTramos(SPIKE, HOY).map((t) => [t.etiqueta, t.monto, t.n])).toEqual([
      ["Vencidas", 6400, 1],
      ["Esta semana", 6812, 2],
      ["La próxima semana", 12330, 2],
      ["Más adelante", 37000, 3],
    ]);
  });
  it("siempre las cuatro, en orden, aunque estén vacías", () => {
    const r = resumenTramos([fila("2026-12-01", 10)], HOY);
    expect(r.map((t) => t.clave)).toEqual(["vencidas", "semana", "proxima", "despues"]);
    expect(r.map((t) => t.n)).toEqual([0, 0, 0, 1]);
  });
  it("suma los céntimos sin arrastrar errores de coma flotante", () => {
    const r = resumenTramos([fila(HOY, 0.1), fila(HOY, 0.2)], HOY);
    expect(r[1].monto).toBe(0.3);
  });
  it("los cuatro tramos suman el total", () => {
    const suma = resumenTramos(SPIKE, HOY).reduce((a, t) => a + t.monto, 0);
    expect(suma).toBe(totalPorPagar(SPIKE).saldo);
    expect(totalPorPagar(SPIKE)).toEqual({ saldo: 62542, n: 8 });
  });
});

describe("textoVence y textoUnidad", () => {
  it("dice lo relativo como el spike", () => {
    expect(textoVence({ vence: "2026-09-22" }, HOY)).toBe("vencida hace 2 días");
    expect(textoVence({ vence: "2026-09-23" }, HOY)).toBe("vencida hace 1 día");
    expect(textoVence({ vence: HOY }, HOY)).toBe("vence hoy");
    expect(textoVence({ vence: "2026-09-25" }, HOY)).toBe("mañana");
    expect(textoVence({ vence: "2026-09-28" }, HOY)).toBe("en 4 días");
  });
  it("sin unidad es de la empresa", () => {
    expect(textoUnidad({ unidades: null })).toBe("De la empresa");
    expect(textoUnidad({ unidades: "Tienda Trujillo" })).toBe("Tienda Trujillo");
  });
  it("una factura repartida nombra a todas sin repetir «Tienda»", () => {
    expect(textoUnidad({ unidades: "Tienda Lima · Tienda Trujillo" })).toBe("Lima · Trujillo");
    expect(textoUnidad({ unidades: "Taller · Tienda Lima · Tienda Trujillo" })).toBe("Taller · Lima · Trujillo");
  });
});

describe("leerFilaPorPagar", () => {
  it("lee la fila de la base: números y la empresa sin unidad; la columna `parte` ya no se lee (decisión 45)", () => {
    const f = leerFilaPorPagar({
      origen: "compras",
      id: "a",
      naturaleza: "gasto",
      proveedor_id: "p",
      proveedor: "Estudio Contable",
      documento: "E001-77",
      tipo: "recibo_por_honorarios",
      concepto: "Contador de agosto",
      fecha_emision: "2026-09-14",
      condicion: "credito",
      fecha_vencimiento: "2026-09-22",
      vence: "2026-09-22",
      ubicacion_id: null,
      unidades: null,
      parte: false,
      total: "800.00",
      pagado: "0.00",
      saldo: "800.00",
    });
    expect(f).toMatchObject({ naturaleza: "gasto", concepto: "Contador de agosto", unidades: null, total: 800, saldo: 800 });
    // La base la sigue mandando (siempre falsa): cada fila es el comprobante entero y la web no la arrastra.
    expect("parte" in f).toBe(false);
    expect(textoUnidad(f)).toBe("De la empresa");
  });
  it("una naturaleza desconocida no rompe la pantalla, y el Taller se lee como insumo", () => {
    expect(leerFilaPorPagar({ id: "x", naturaleza: "otra", vence: HOY }).naturaleza).toBe("mercaderia");
    expect(leerFilaPorPagar({ id: "x", origen: "produccion", naturaleza: "insumo", vence: HOY })).toMatchObject({ origen: "produccion", naturaleza: "insumo" });
  });
});

describe("pagar", () => {
  const lider = { esLider: true, pagaCompras: true };
  const conPorPagar = { esLider: false, pagaCompras: true };
  const soloDinero = { esLider: false, pagaCompras: false };
  it("una factura de proveedor la paga el líder o quien tiene Por pagar de Compras", () => {
    expect(puedePagar({ origen: "compras" }, lider)).toBe(true);
    expect(puedePagar({ origen: "compras" }, conPorPagar)).toBe(true);
    expect(puedePagar({ origen: "compras" }, soloDinero)).toBe(false);
  });
  it("la tela del Taller, solo el líder", () => {
    expect(puedePagar({ origen: "produccion" }, lider)).toBe(true);
    expect(puedePagar({ origen: "produccion" }, conPorPagar)).toBe(false);
  });
  it("?pagar= solo abre una fila de la lista que todavía se debe", () => {
    const filas = [fila(HOY, 100), fila(HOY, 0)];
    expect(filaAPagar(filas[0].id, filas)).toBe(filas[0]);
    expect(filaAPagar(filas[1].id, filas)).toBeNull();
    expect(filaAPagar("no-es-un-id", filas)).toBeNull();
    expect(filaAPagar(undefined, filas)).toBeNull();
  });
});

describe("un servicio del Taller sin papel (ADR-0614)", () => {
  const crudo = { origen: "servicio", id: "f1", naturaleza: "servicio", proveedor_id: null, proveedor: "Servicios sin nombre", documento: "OP-2 · Costura", tipo: "sin_comprobante", concepto: "Blusa", fecha_emision: null, condicion: null, fecha_vencimiento: null, vence: "2026-11-06", ubicacion_id: "t", unidades: "Taller", total: "100.00", pagado: "60.00", saldo: "40.00" };
  const fila = leerFilaPorPagar(crudo);

  it("se lee con su origen y su tipo, sin fecha de vencimiento", () => {
    expect(fila).toMatchObject({ origen: "servicio", naturaleza: "servicio", fechaVencimiento: null, saldo: 40, pagado: 60, total: 100 });
    expect(TEXTO_NATURALEZA[fila.naturaleza]).toBe("Servicio del Taller");
  });
  it("no afirma una fecha que nadie pactó", () => {
    expect(fechaDeVence(fila, () => "6 nov")).toBe("Sin fecha");
    expect(textoVence(fila, "2026-11-06")).toBe("aún sin papel");
    expect(fechaDeVence({ origen: "compras", vence: "2026-11-06" }, () => "6 nov")).toBe("6 nov");
  });
  it("lo paga solo el líder, como la tela del Taller", () => {
    expect(puedePagar(fila, { esLider: true, pagaCompras: false })).toBe(true);
    expect(puedePagar(fila, { esLider: false, pagaCompras: true })).toBe(false);
  });
  it("sin nombre, el botón lleva a decir quién; con nombre, a pagar", () => {
    expect(textoDelPago(fila)).toBe("Decir quién");
    expect(textoDelPago(leerFilaPorPagar({ ...crudo, proveedor_id: "p1", proveedor: "Costura" }))).toBe("Pagar");
    expect(textoDelPago({ origen: "compras", proveedorId: "sin-nombre" })).toBe("Pagar");
  });
  it("los servicios sin nombre se agrupan en una sola fila de quién debes más", () => {
    expect(proveedoresMayores([fila, { ...fila, id: "f2", saldo: 10 }], "2026-11-06")).toEqual([{ proveedorId: "sin-nombre", proveedor: "Servicios sin nombre", saldo: 50, n: 2, vencido: 0 }]);
  });
});
