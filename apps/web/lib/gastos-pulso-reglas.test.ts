import { describe, expect, it } from "vitest";
import type { EgresoPorClasificar, GastoFijoMes, PanelGastos } from "./gastos-reglas";
import { bandejaPulso, gastastePulso, montoBandeja } from "./gastos-pulso-reglas";

const PANEL: PanelGastos = {
  total: 17750, igv: 2700, igvPerdido: { n: 0, igv: 0, deOtrosMeses: 0 }, igvDescontable: 2700, n: 17, boletas: 2, sinComprobante: 5,
  porPagar: 0, nPorPagar: 0, egresosSinClasificar: 1, egresosSinClasificarMonto: 180,
  porCategoria: [
    { categoria: "alquiler", nombre: "Alquileres", cuenta: "635", monto: 12500, n: 4 },
    { categoria: "publicidad", nombre: "Publicidad", cuenta: "637", monto: 1500, n: 1 },
    { categoria: "contador", nombre: "Contador", cuenta: "632", monto: 1200, n: 1 },
    { categoria: "luz", nombre: "Luz y agua", cuenta: "636", monto: 860, n: 3 },
  ],
  porUbicacion: [],
};

describe("gastastePulso", () => {
  it("cuando una categoría pesa la mitad o más, lo dice en soles de cada diez", () => {
    const g = gastastePulso(PANEL)!;
    expect(g.total).toBe(17750);
    expect(g.frase).toBe("7 de cada 10 soles fueron alquileres.");
    expect(g.mayores.map((m) => m.nombre)).toEqual(["Alquileres", "Publicidad", "Contador"]);
    expect(g.mayores[0]!.parte).toBeCloseTo(0.704, 3);
  });
  it("si nada pesa la mitad, nombra las tres que más pesaron con su porcentaje", () => {
    const g = gastastePulso({ ...PANEL, total: 4000, porCategoria: [{ categoria: "a", nombre: "Publicidad", cuenta: "637", monto: 1500, n: 1 }, { categoria: "b", nombre: "Contador", cuenta: "632", monto: 1200, n: 1 }, { categoria: "c", nombre: "Luz y agua", cuenta: "636", monto: 860, n: 3 }, { categoria: "d", nombre: "Movilidad", cuenta: "631", monto: 440, n: 6 }] })!;
    expect(g.frase).toBe("Lo que más pesó: publicidad (38 %), contador (30 %), luz y agua (22 %).");
  });
  it("sin gastos, lo dice; sin panel, nada", () => {
    expect(gastastePulso({ ...PANEL, total: 0, n: 0, porCategoria: [] })!.frase).toBe("Todavía no hay gastos registrados este mes.");
    expect(gastastePulso(null)).toBeNull();
  });
});

const egreso = (p: Partial<EgresoPorClasificar> & Pick<EgresoPorClasificar, "id" | "motivo" | "monto" | "creadoEn">): EgresoPorClasificar => ({
  cajaId: "k", ubicacionId: "tru", ubicacionNombre: "Tienda Trujillo", nota: null, registradoPor: null, cajaAbierta: true, ...p,
});
const fijo = (p: Partial<GastoFijoMes> & Pick<GastoFijoMes, "id" | "descripcion" | "estado" | "fechaEsperada">): GastoFijoMes => ({
  ubicacionId: "tru", ubicacionNombre: "Tienda Trujillo", categoria: "alquiler", categoriaNombre: "Alquiler", proveedorId: null, proveedorNombre: null,
  comprobanteTipo: "factura", monto: 4000, montoVariable: false, diaDelMes: 5, momento: "dia", gastoId: null, gastoMonto: null, diasAntes: 0, fechaPago: null, tocaPagar: false, ...p,
});

describe("bandejaPulso", () => {
  it("primero las salidas de caja (la más vieja primero), después los fijos que ya pasaron; los por llegar y los registrados no", () => {
    const b = bandejaPulso(
      [egreso({ id: "e2", motivo: "Taxi", monto: 18, creadoEn: "2026-10-14T20:00:00Z", nota: "al mercado", registradoPor: "Ana" }), egreso({ id: "e1", motivo: "Gaseosas", monto: 12, creadoEn: "2026-10-10T20:00:00Z" })],
      [fijo({ id: "f1", descripcion: "Alquiler TRU", estado: "falta", fechaEsperada: "2026-10-05" }), fijo({ id: "f2", descripcion: "Internet", estado: "por_llegar", fechaEsperada: "2026-10-20" }), fijo({ id: "f3", descripcion: "Luz", estado: "registrado", fechaEsperada: "2026-10-03" })],
    );
    expect(b.n).toBe(3);
    expect(b.frase).toBe("Te faltan 3 cosas por revisar.");
    expect(b.cosas.map((c) => c.clave)).toEqual(["egreso:e1", "egreso:e2", "fijo:f1"]);
    expect(b.cosas[1]).toMatchObject({ tipo: "egreso", titulo: "Taxi", accion: "Clasificar", monto: 18 });
    expect(b.cosas[1]!.detalle).toBe("Salió del cajón de Tienda Trujillo el 14 oct · al mercado · lo anotó Ana. ¿De qué fue?");
    expect(b.cosas[2]).toMatchObject({ tipo: "fijo", titulo: "Alquiler TRU", accion: "Registrar", monto: 4000 });
    expect(b.cosas[2]!.detalle).toBe("Alquiler de Tienda Trujillo: venció el 5 oct y todavía no está registrado.");
    expect(montoBandeja(b)).toBe("S/ 4,030 entre 3 cosas");
  });
  it("sin nada pendiente, lo dice", () => {
    const b = bandejaPulso([], []);
    expect(b).toMatchObject({ n: 0, frase: "Listo, no te falta nada por revisar." });
    expect(montoBandeja(b)).toBe("");
  });
  it("una sola cosa, en singular", () => {
    expect(bandejaPulso([egreso({ id: "e1", motivo: "Taxi", monto: 18, creadoEn: "2026-10-10T20:00:00Z" })], []).frase).toBe("Te falta 1 cosa por revisar.");
  });
});
