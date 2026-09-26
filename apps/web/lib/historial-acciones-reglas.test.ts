import { describe, it, expect } from "vitest";
import {
  ATAJOS,
  accionesDeVenta,
  atajoActivo,
  atajosVisibles,
  cambiosDeAtajo,
  comprobanteAccionable,
  leerAtajosElegidos,
  paramsDePosventa,
  recorridoDeVenta,
  textoMarcaPosventa,
  type ContextoAcciones,
} from "./historial-acciones-reglas";
import type { FilaHistorial } from "./ventas-historial-reglas";

const TRU = "11111111-1111-1111-1111-111111111111";
const AQP = "22222222-2222-2222-2222-222222222222";
const HOY = "2026-09-26";

const fila = (parcial: Partial<FilaHistorial> = {}): FilaHistorial => ({
  id: "v1",
  creadoEn: "2026-09-26T15:29:00Z",
  fecha: HOY,
  hora: "10:29",
  ubicacionId: TRU,
  ubicacion: "Tienda TRU",
  vendedor: "Felipe Alvarez",
  clienta: null,
  prendas: "Blusa Carlita · L · Blanco",
  piezas: [],
  unidades: 1,
  total: 71.9,
  pagos: "Yape",
  comprobante: { tipo: "boleta", numero: "B004-000031", estado: "aceptado", emitidoEn: "2026-09-26T15:29:05Z", enviadoEn: "2026-09-26T15:30:00Z" },
  anulada: false,
  nota: null,
  esPrueba: false,
  anuladaEn: null,
  ventaItemIds: ["vi1"],
  posventa: [],
  apartado: null,
  conAnticipo: false,
  operaciones: [],
  ...parcial,
});

const todo: ContextoAcciones = {
  modulos: new Set(["vender", "cambios", "devoluciones", "apartados"]),
  puedeFacturar: true,
  esLider: true,
  ubicacionId: TRU,
  hoy: HOY,
};
const claves = (v: FilaHistorial, ctx: ContextoAcciones = todo) => accionesDeVenta(v, ctx).map((a) => a.clave);

describe("atajos", () => {
  it("de fábrica: Mis ventas y Por enviar; los elegidos se suman en el orden del catálogo", () => {
    expect(atajosVisibles([]).map((a) => a.clave)).toEqual(["mias", "por_enviar"]);
    expect(atajosVisibles(["yape", "posventa"]).map((a) => a.clave)).toEqual(["mias", "por_enviar", "posventa", "yape"]);
  });

  it("lo guardado se valida: basura, claves desconocidas y las de fábrica se descartan", () => {
    expect(leerAtajosElegidos(null)).toEqual([]);
    expect(leerAtajosElegidos("{roto")).toEqual([]);
    expect(leerAtajosElegidos('{"a":1}')).toEqual([]);
    expect(leerAtajosElegidos('["yape","mias","inventado","yape",3]')).toEqual(["yape"]);
  });

  it("un atajo está puesto si la URL tiene todos sus parámetros; tocarlo pone o quita esos mismos", () => {
    const porEnviar = ATAJOS.find((a) => a.clave === "por_enviar")!;
    expect(atajoActivo(porEnviar, { comp: "por_enviar" })).toBe(true);
    expect(atajoActivo(porEnviar, { comp: "sin" })).toBe(false);
    expect(cambiosDeAtajo(porEnviar, false)).toEqual({ comp: "por_enviar" });
    expect(cambiosDeAtajo(porEnviar, true)).toEqual({ comp: "" });
  });
});

describe("paramsDePosventa — cómo llega la venta a Cambios o Devoluciones", () => {
  it("con una sola prenda, directo a esa línea", () => {
    expect(paramsDePosventa(fila(), todo)).toBe("item=vi1");
  });
  it("con varias, buscando su comprobante; de otra sede, el líder pide todas las tiendas", () => {
    expect(paramsDePosventa(fila({ ventaItemIds: ["a", "b"] }), todo)).toBe("q=B004-000031");
    expect(paramsDePosventa(fila({ ventaItemIds: ["a", "b"], ubicacionId: AQP }), todo)).toBe("q=B004-000031&todas=1");
    expect(paramsDePosventa(fila({ ventaItemIds: ["a", "b"], ubicacionId: AQP }), { ...todo, esLider: false })).toBe("q=B004-000031");
  });
});

describe("accionesDeVenta", () => {
  it("una venta normal: cambiar (destacada), devolver, volver a vender, ver comprobante y anular (líder, hoy)", () => {
    const acciones = accionesDeVenta(fila(), todo);
    expect(acciones.map((a) => a.clave)).toEqual(["cambiar", "devolver", "volver", "comprobante", "anular"]);
    expect(acciones.find((a) => a.clave === "cambiar")).toMatchObject({ destacada: true, href: "/cambios?item=vi1" });
    expect(acciones.find((a) => a.clave === "comprobante")?.href).toBe("/vender/comprobantes/emitidos?m=2026-9");
    expect(acciones.find((a) => a.clave === "volver")?.href).toBe("/vender?repetir=v1");
  });

  it("un comprobante pendiente o rechazado: resolverlo va primero y destacado", () => {
    const pendiente = fila({ comprobante: { ...fila().comprobante!, estado: "pendiente" } });
    const [primera, segunda] = accionesDeVenta(pendiente, todo);
    expect(primera).toMatchObject({ clave: "reintentar", etiqueta: "Enviar a SUNAT", destacada: true });
    expect(segunda).toMatchObject({ clave: "cambiar", destacada: false });
    const rechazado = fila({ comprobante: { ...fila().comprobante!, estado: "rechazado" } });
    expect(accionesDeVenta(rechazado, todo)[0].etiqueta).toBe("Corregir y reenviar");
  });

  it("sin poder facturar: ni reintentar ni ver comprobante, y cambiar sigue destacada", () => {
    const pendiente = fila({ comprobante: { ...fila().comprobante!, estado: "pendiente" } });
    const acciones = accionesDeVenta(pendiente, { ...todo, puedeFacturar: false });
    expect(acciones.map((a) => a.clave)).not.toContain("reintentar");
    expect(acciones.map((a) => a.clave)).not.toContain("comprobante");
    expect(acciones[0]).toMatchObject({ clave: "cambiar", destacada: true });
  });

  it("solo ofrece lo de los módulos que la cuenta ve", () => {
    expect(claves(fila(), { ...todo, modulos: new Set(["cambios"]) })).toEqual(["cambiar", "comprobante"]);
  });

  it("una anulada ya no se cambia, devuelve ni anula", () => {
    expect(claves(fila({ anulada: true }))).toEqual(["volver", "comprobante"]);
  });

  it("anular: solo el líder y solo el mismo día de la venta (PL-29)", () => {
    expect(claves(fila(), { ...todo, esLider: false })).not.toContain("anular");
    expect(claves(fila({ fecha: "2026-09-25" }))).not.toContain("anular");
  });

  it("con clienta, su ficha; con apartado o anticipo, el apartado", () => {
    const v = fila({ clienta: "Rosa Mendoza", apartado: { codigo: "AP-0012", creadoEn: "2026-09-19T10:00:00Z" } });
    const acciones = accionesDeVenta(v, todo);
    expect(acciones.find((a) => a.clave === "clienta")?.href).toBe("/clientas?q=Rosa+Mendoza");
    expect(acciones.find((a) => a.clave === "apartado")).toMatchObject({ href: "/vender/apartados", detalle: "Apartados · AP-0012" });
    expect(claves(fila({ conAnticipo: true }))).toContain("apartado");
  });

  it("el chip del comprobante lleva a resolverlo solo si espera a SUNAT y se puede facturar", () => {
    const pendiente = fila({ comprobante: { ...fila().comprobante!, estado: "pendiente_reintento" } });
    expect(comprobanteAccionable(pendiente, true)).toBe(true);
    expect(comprobanteAccionable(pendiente, false)).toBe(false);
    expect(comprobanteAccionable(fila(), true)).toBe(false);
    expect(comprobanteAccionable({ ...pendiente, anulada: true }, true)).toBe(false);
  });
});

describe("recorridoDeVenta", () => {
  it("apartada → vendida → SUNAT → cambio, en orden de fecha", () => {
    const pasos = recorridoDeVenta(
      fila({
        apartado: { codigo: "AP-0012", creadoEn: "2026-09-19T10:00:00Z" },
        posventa: [{ tipo: "cambio", fecha: "2026-09-27T16:00:00Z", pendiente: false }],
      })
    );
    expect(pasos.map((p) => p.texto)).toEqual(["Apartada como AP-0012", "Vendida por Felipe Alvarez", "SUNAT aceptó la boleta", "Cambio de prenda"]);
  });

  it("una nota de venta interna no suma paso de SUNAT; una anulada termina tachada", () => {
    const nv = fila({ comprobante: { tipo: "nota_venta", numero: "NV01-000006", estado: "interna", emitidoEn: "2026-09-26T15:29:05Z", enviadoEn: null }, anulada: true, anuladaEn: "2026-09-26T16:00:00Z" });
    expect(recorridoDeVenta(nv).map((p) => p.texto)).toEqual(["Vendida por Felipe Alvarez", "Venta anulada"]);
  });

  it("un rechazo y una devolución por aprobar son avisos", () => {
    const pasos = recorridoDeVenta(
      fila({
        comprobante: { tipo: "factura", numero: "F004-000011", estado: "rechazado", emitidoEn: "2026-09-26T15:29:05Z", enviadoEn: null },
        posventa: [{ tipo: "devolucion", fecha: "2026-09-27T16:00:00Z", pendiente: true }],
      })
    );
    expect(pasos.map((p) => [p.texto, p.tono])).toEqual([
      ["Vendida por Felipe Alvarez", "hecho"],
      ["SUNAT rechazó la factura", "aviso"],
      ["Devolución por aprobar", "posventa"],
    ]);
  });
});

it("textoMarcaPosventa dice qué pasó y cuándo (día de Lima)", () => {
  expect(textoMarcaPosventa({ tipo: "cambio", fecha: "2026-09-26T20:00:00Z", pendiente: false })).toMatch(/^Tuvo cambio · 26 set/);
  expect(textoMarcaPosventa({ tipo: "devolucion", fecha: "2026-09-26T20:00:00Z", pendiente: true })).toBe("Devolución por aprobar");
});
