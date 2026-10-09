import { describe, expect, it } from "vitest";
import { validarGasto } from "./gastos-reglas";
import { sePuedeConfirmar } from "./guia-campos";
import {
  CLAVE_OTRO,
  CONCEPTOS,
  GASTO_RAPIDO_VACIO,
  borradorDeGastoRapido,
  camposDeGastoRapido,
  conceptoDeGasto,
  descripcionDe,
  limpiarMonto,
  ordenarPorFrecuencia,
  type EstadoGastoRapido,
} from "./gasto-rapido-reglas";

const CATEGORIAS_DE_LA_BASE = [
  "alquileres",
  "servicios_basicos",
  "transporte",
  "suministros",
  "mantenimiento",
  "publicidad",
  "asesoria",
  "gastos_bancarios",
  "tributos",
  "seguros",
];
const CAJA = { id: "caja-1", ubicacionId: "tru" };
const HOY = "2026-10-09";

describe("conceptos", () => {
  it("cada concepto va a una categoría que existe en la base, y no se repiten", () => {
    for (const c of CONCEPTOS) expect(CATEGORIAS_DE_LA_BASE).toContain(c.categoria);
    expect(new Set(CONCEPTOS.map((c) => c.clave)).size).toBe(CONCEPTOS.length);
  });

  it("reconoce lo que guarda esta pantalla", () => {
    for (const c of CONCEPTOS) {
      expect(conceptoDeGasto({ descripcion: c.nombre, categoria: c.categoria })).toBe(c.clave);
      expect(conceptoDeGasto({ descripcion: `${c.nombre} — algo más`, categoria: c.categoria })).toBe(c.clave);
    }
  });

  it("reconoce gastos de antes, escritos a mano", () => {
    expect(conceptoDeGasto({ descripcion: "Luz de septiembre", categoria: "servicios_basicos" })).toBe("luz");
    expect(conceptoDeGasto({ descripcion: "Recibo Hidrandina", categoria: "servicios_basicos" })).toBe("luz");
    expect(conceptoDeGasto({ descripcion: "mototaxi al banco", categoria: "transporte" })).toBe("movilidad");
    expect(conceptoDeGasto({ descripcion: "Encomienda Olva a Lima", categoria: "transporte" })).toBe("envio");
    expect(conceptoDeGasto({ descripcion: "Lejía y trapeador", categoria: "suministros" })).toBe("limpieza");
    expect(conceptoDeGasto({ descripcion: "SS.HH. del mercado", categoria: "servicios_basicos" })).toBe("bano");
  });

  it("a igual lugar gana la palabra más larga, y antes gana la que aparece primero", () => {
    expect(conceptoDeGasto({ descripcion: "papel higiénico", categoria: "suministros" })).toBe("limpieza");
    expect(conceptoDeGasto({ descripcion: "papel para la ticketera", categoria: "suministros" })).toBe("utiles");
    expect(conceptoDeGasto({ descripcion: "Luz del baño", categoria: "servicios_basicos" })).toBe("luz");
  });

  it("solo cuenta un concepto de la misma categoría contable", () => {
    expect(conceptoDeGasto({ descripcion: "Agua de mesa", categoria: "suministros" })).toBe(CLAVE_OTRO);
    expect(conceptoDeGasto({ descripcion: "Alquiler de octubre", categoria: "alquileres" })).toBe(CLAVE_OTRO);
  });

  it("no confunde un pedazo de palabra", () => {
    expect(conceptoDeGasto({ descripcion: "aluzado", categoria: "servicios_basicos" })).toBe(CLAVE_OTRO);
  });
});

describe("ordenarPorFrecuencia", () => {
  const g = (descripcion: string, categoria: string) => ({ descripcion, categoria });

  it("sin gastos: el orden de fábrica y ninguna estrella", () => {
    const { conceptos, vecesOtro } = ordenarPorFrecuencia([]);
    expect(conceptos.map((c) => c.concepto.clave)).toEqual(CONCEPTOS.map((c) => c.clave));
    expect(conceptos.some((c) => c.frecuente)).toBe(false);
    expect(vecesOtro).toBe(0);
  });

  it("ordena por veces, desempata por fábrica, y la ★ va solo en los 4 primeros usados", () => {
    const gastos = [
      ...Array(5).fill(g("Baño", "servicios_basicos")),
      ...Array(3).fill(g("Bolsas", "suministros")),
      ...Array(3).fill(g("Movilidad", "transporte")),
      g("Agua", "servicios_basicos"),
      g("Limpieza", "suministros"),
      g("Alquiler", "alquileres"),
    ];
    const { conceptos, vecesOtro } = ordenarPorFrecuencia(gastos);
    expect(conceptos.slice(0, 5).map((c) => [c.concepto.clave, c.veces, c.frecuente])).toEqual([
      ["bano", 5, true],
      ["movilidad", 3, true], // empata con bolsas: Movilidad va antes en el orden de fábrica
      ["bolsas", 3, true],
      ["agua", 1, true],
      ["limpieza", 1, false],
    ]);
    expect(conceptos.filter((c) => c.frecuente)).toHaveLength(4);
    expect(vecesOtro).toBe(1);
    expect(conceptos).toHaveLength(CONCEPTOS.length);
  });

  it("con menos de 4 usados, la ★ solo va en los usados", () => {
    const { conceptos } = ordenarPorFrecuencia([g("Bolsas", "suministros")]);
    expect(conceptos.filter((c) => c.frecuente).map((c) => c.concepto.clave)).toEqual(["bolsas"]);
  });
});

describe("montos habituales", () => {
  it("siguen al concepto: los más repetidos primero, a igual cantidad el más chico, hasta tres", () => {
    const m = (descripcion: string, categoria: string, montoTotal: number) => ({ descripcion, categoria, montoTotal });
    const { conceptos } = ordenarPorFrecuencia([
      m("Baño", "servicios_basicos", 0.8),
      m("Baño", "servicios_basicos", 0.8),
      m("Baño", "servicios_basicos", 1),
      m("Baño", "servicios_basicos", 0.5),
      m("Baño", "servicios_basicos", 2),
      m("Bolsas", "suministros", 12),
    ]);
    const de = (clave: string) => conceptos.find((c) => c.concepto.clave === clave)!.montos;
    expect(de("bano")).toEqual([0.8, 0.5, 1]);
    expect(de("bolsas")).toEqual([12]);
    expect(de("agua")).toEqual([]);
  });
});

describe("limpiarMonto", () => {
  it("la coma es el decimal, y nunca más de dos decimales ni otros caracteres", () => {
    expect(limpiarMonto("0,80")).toBe("0.80");
    expect(limpiarMonto("S/ 12.505")).toBe("12.50");
    expect(limpiarMonto("1.2.3")).toBe("1.23");
    expect(limpiarMonto("abc")).toBe("");
  });
});

describe("la guía dice lo mismo que validarGasto", () => {
  const base: EstadoGastoRapido = GASTO_RAPIDO_VACIO;
  const escenarios: [string, EstadoGastoRapido][] = [
    ["vacío", base],
    ["solo concepto", { ...base, concepto: "bano" }],
    ["solo monto", { ...base, monto: "0.80" }],
    ["baño 0.80", { ...base, concepto: "bano", monto: "0.80" }],
    ["monto cero", { ...base, concepto: "bano", monto: "0" }],
    ["monto con tres decimales", { ...base, concepto: "bano", monto: "1.234" }],
    ["con nota", { ...base, concepto: "bolsas", monto: "12", nota: "para la campaña" }],
    ["otro sin nada", { ...base, concepto: CLAVE_OTRO, monto: "5" }],
    ["otro sin categoría", { ...base, concepto: CLAVE_OTRO, monto: "5", otroTexto: "pilas para el control" }],
    ["otro completo", { ...base, concepto: CLAVE_OTRO, monto: "5", otroTexto: "pilas para el control", otroCategoria: "suministros" }],
    ["con boleta sin proveedor", { ...base, concepto: "arreglo", monto: "60", conComprobante: true }],
    ["con boleta sin número", { ...base, concepto: "arreglo", monto: "60", conComprobante: true, proveedorId: "p1" }],
    ["con boleta completa", { ...base, concepto: "arreglo", monto: "60", conComprobante: true, proveedorId: "p1", serie: "B001", numero: "42" }],
    ["factura completa", { ...base, concepto: "luz", monto: "180.40", conComprobante: true, comprobante: "factura", proveedorId: "p1", serie: "F001", numero: "9" }],
    ["cerró la factura: lo de adentro ya no cuenta", { ...base, concepto: "agua", monto: "48.30", conComprobante: false, proveedorId: "" }],
  ];

  for (const [nombre, e] of escenarios) {
    it(nombre, () => {
      const valida = validarGasto(borradorDeGastoRapido(e, CAJA, HOY), HOY).ok;
      // «Otro» con menos de MIN_OTRO letras: la base aceptaría «x», pero la guía pide decir qué fue. Es más estricta, nunca más laxa.
      const guia = sePuedeConfirmar(camposDeGastoRapido(e));
      if (guia) expect(valida).toBe(true);
      if (!valida) expect(guia).toBe(false);
      expect(guia).toBe(valida);
    });
  }

  it("sale del cajón, al contado y con la descripción del concepto", () => {
    const v = validarGasto(borradorDeGastoRapido({ ...base, concepto: "bano", monto: "0.80", nota: "del mercado" }, CAJA, HOY), HOY);
    expect(v.ok && v.valor).toMatchObject({
      p_ubicacion_id: "tru",
      p_categoria: "servicios_basicos",
      p_descripcion: "Baño — del mercado",
      p_monto_total: 0.8,
      p_medio_pago: "efectivo",
      p_caja_id: "caja-1",
      p_comprobante: null,
    });
  });

  it("lo que se guarda se vuelve a reconocer como el mismo concepto", () => {
    for (const c of CONCEPTOS) {
      const descripcion = descripcionDe({ concepto: c.clave, otroTexto: "", nota: "lo que sea" });
      expect(conceptoDeGasto({ descripcion, categoria: c.categoria })).toBe(c.clave);
    }
  });
});
