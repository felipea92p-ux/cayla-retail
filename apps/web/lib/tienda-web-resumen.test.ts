import { describe, expect, it } from "vitest";
import type { CifrasPedidosWeb } from "./pedidos-web-reglas";
import { filtrarVitrina, type ModeloVitrina } from "./vitrina-reglas";
import { encendidosSinPrecio, fraseVentana, lecturasCaidas, pendientesDe, teselasDe, type EntradaResumen } from "./tienda-web-resumen";

const HORA = 3_600_000;
const PLAZOS = { horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7 };
const CIFRAS_EN_CERO: CifrasPedidosWeb = {
  porConfirmar: 0,
  proximoVenceEnMs: null,
  porCobrar: 0,
  confirmados: 0,
  sinPagar: 0,
  porEntregar: 0,
  sinRecoger: 0,
  cobradoHoy: 0,
  porDevolver: 0,
  pedidosPorDevolver: 0,
  esperanPrenda: 0,
  proximoAnulaEnMs: null,
  cerrados: 0,
};
const NADA: EntradaResumen = {
  pedidos: { estado: "ok", dato: { cifras: CIFRAS_EN_CERO, plazos: PLAZOS } },
  vitrina: { estado: "ok", dato: { cifras: { seVen: 10, total: 12, sinStock: 0 }, encendidosSinPrecio: 0, looks: { seVen: 2, total: 2, noSeVen: 0 }, esperan: { personas: 0, faltan: 0, llegaron: 0 } } },
  recomendaciones: { estado: "ok", dato: { porResponder: 0, respondidas: 0, delMes: 0, archivadas: 0, enBandeja: 0, temaDelMes: null } },
  ajustes: { estado: "ok", dato: [{ id: "t", nombre: "Trujillo", tono: "verde", texto: "Se ve en la web" }] },
};
const conPedidos = (c: Partial<CifrasPedidosWeb>): EntradaResumen => ({ ...NADA, pedidos: { estado: "ok", dato: { cifras: { ...CIFRAS_EN_CERO, ...c }, plazos: PLAZOS } } });

describe("Tienda web ▸ Resumen: lo que pide la tienda online hoy", () => {
  it("con todo al día no pide nada", () => {
    expect(pendientesDe(NADA)).toEqual([]);
  });

  it("un pedido por confirmar que vence en menos de 3 h es urgente y va primero; con más tiempo, pide atención", () => {
    const urgente = pendientesDe(conPedidos({ porConfirmar: 2, proximoVenceEnMs: 2 * HORA }));
    expect(urgente[0]).toMatchObject({ clave: "confirmar", tono: "urgente", cifra: 2, href: "/tienda-web/pedidos?pestana=confirmar" });
    expect(urgente[0]!.titulo).toBe("pedidos esperan que los confirmes");
    expect(urgente[0]!.detalle).toContain("2 h");
    const conTiempo = pendientesDe(conPedidos({ porConfirmar: 1, proximoVenceEnMs: 20 * HORA }));
    expect(conTiempo[0]).toMatchObject({ tono: "atencion", titulo: "pedido espera que lo confirmes" });
  });

  it("la plata por devolver es urgente y se cuenta en soles; lo sin pagar y lo sin recoger dicen su plazo", () => {
    const p = pendientesDe(conPedidos({ porDevolver: 120, pedidosPorDevolver: 1, sinPagar: 2, sinRecoger: 1 }));
    expect(p.map((x) => x.clave)).toEqual(["devolver", "sin-pagar", "sin-recoger"]);
    expect(p[0]).toMatchObject({ formato: "soles", cifra: 120, titulo: "por devolver en 1 pedido anulado" });
    expect(p[1]!.titulo).toContain("48 h");
    expect(p[2]!.titulo).toContain("7 días");
  });

  it("ordena de lo urgente a lo que solo informa, y dentro de un tono conserva el orden de atención", () => {
    const e: EntradaResumen = {
      ...conPedidos({ porConfirmar: 1, proximoVenceEnMs: 1 * HORA, sinPagar: 1 }),
      vitrina: { estado: "ok", dato: { cifras: { seVen: 5, total: 9, sinStock: 2 }, encendidosSinPrecio: 1, looks: { seVen: 0, total: 1, noSeVen: 1 }, esperan: { personas: 3, faltan: 1, llegaron: 2 } } },
      recomendaciones: { estado: "ok", dato: { porResponder: 4, respondidas: 0, delMes: 4, archivadas: 0, enBandeja: 4, temaDelMes: { id: "tallas", nombre: "tallas grandes", veces: 3 } } },
      ajustes: { estado: "ok", dato: [{ id: "l", nombre: "Lima", tono: "ambar", texto: "No se ve: falta el WhatsApp" }] },
    };
    const p = pendientesDe(e);
    expect(p.map((x) => `${x.tono}:${x.clave}`)).toEqual([
      "urgente:confirmar",
      "atencion:sin-pagar",
      "atencion:recomendaciones",
      "atencion:llegaron",
      "atencion:sin-precio",
      "atencion:tiendas",
      "info:recomendaciones-tema",
      "info:looks",
      "info:sin-stock",
    ]);
    expect(p.find((x) => x.clave === "tiendas")!.detalle).toBe("Lima: falta el WhatsApp");
  });

  it("lo que no se lee (sin módulo, caído o fuera de una tienda) no inventa pendientes", () => {
    const e: EntradaResumen = { pedidos: { estado: "no_tienda" }, vitrina: { estado: "sin_modulo" }, recomendaciones: { estado: "fallo" }, ajustes: { estado: "sin_modulo" } };
    expect(pendientesDe(e)).toEqual([]);
    expect(lecturasCaidas(e)).toEqual(["las recomendaciones"]);
  });

  it("una lectura de looks o de «Esperan» caída no rompe la de la vitrina", () => {
    const e: EntradaResumen = { ...NADA, vitrina: { estado: "ok", dato: { cifras: { seVen: 1, total: 1, sinStock: 1 }, encendidosSinPrecio: 0, looks: null, esperan: null } } };
    expect(pendientesDe(e).map((x) => x.clave)).toEqual(["sin-stock"]);
  });
});

const modelo = (id: string, extra: Partial<ModeloVitrina> = {}): ModeloVitrina => ({
  id,
  codigo: null,
  nombre: `Modelo ${id}`,
  descripcion: null,
  categoria: "Blusas",
  prefijo: "BLU",
  familia: "ropa",
  publicable: true,
  porQueNo: null,
  foto: null,
  colores: [{ codigo: "NEG", nombre: "Negro", hex: "#111111", foto: null }], // tema-fijo: un color de prenda es un dato de prueba, no un color de la pantalla
  tallas: 3,
  stock: [],
  vitrina: { publicado: true, enLoNuevo: "automatico", descripcionWeb: null, version: 1, actualizadoEn: null, actualizadoPor: null },
  ...extra,
});

describe("los enlaces del Resumen a la Vitrina llegan ya filtrados", () => {
  it("«sin precio» y «sin nada que separar» abren la lista con ese filtro, y el número del Resumen es el de la lista", () => {
    const e: EntradaResumen = {
      ...NADA,
      vitrina: { estado: "ok", dato: { cifras: { seVen: 5, total: 9, sinStock: 2 }, encendidosSinPrecio: 1, looks: null, esperan: null } },
    };
    const p = pendientesDe(e);
    expect(p.find((x) => x.clave === "sin-precio")!.href).toBe("/tienda-web/vitrina?filtro=sin_precio");
    expect(p.find((x) => x.clave === "sin-stock")!.href).toBe("/tienda-web/vitrina?filtro=sin_stock");
    const ms = [modelo("a", { publicable: false, porQueNo: "sin_precio" }), modelo("b", { publicable: false, porQueNo: "sin_precio", vitrina: null })];
    expect(filtrarVitrina(ms, "sin_precio", "")).toHaveLength(encendidosSinPrecio(ms));
  });
});

describe("la ventana de la vitrina", () => {
  it("solo lo que se ve en la web; primero lo fijado en Lo nuevo, después lo que tiene foto, y sin pasarse del tope", () => {
    const ms = [
      modelo("a"),
      modelo("b", { foto: "b.jpg" }),
      modelo("c", { vitrina: { publicado: false, enLoNuevo: "automatico", descripcionWeb: null, version: 1, actualizadoEn: null, actualizadoPor: null }, foto: "c.jpg" }),
      modelo("d", { vitrina: { publicado: true, enLoNuevo: "fijo", descripcionWeb: null, version: 1, actualizadoEn: null, actualizadoPor: null } }),
      modelo("e", { publicable: false, porQueNo: "sin_precio", foto: "e.jpg" }),
      modelo("f", { colores: [{ codigo: "R", nombre: "Rojo", hex: null, foto: "f-rojo.jpg" }] }),
    ];
    expect(teselasDe(ms).map((t) => t.id)).toEqual(["d", "b", "f", "a"]);
    expect(teselasDe(ms).find((t) => t.id === "f")!.foto).toBe("f-rojo.jpg");
    expect(teselasDe(ms, 2).map((t) => t.id)).toEqual(["d", "b"]);
    expect(teselasDe(ms)[0]!.nuevo).toBe(true);
  });

  it("cuenta los encendidos que no se ven por falta de precio (y no los apagados ni el empaque)", () => {
    const ms = [
      modelo("a", { publicable: false, porQueNo: "sin_precio" }),
      modelo("b", { publicable: false, porQueNo: "empaque" }),
      modelo("c", { publicable: false, porQueNo: "sin_precio", vitrina: null }),
      modelo("d"),
    ];
    expect(encendidosSinPrecio(ms)).toBe(1);
  });

  it("la frase de la ventana dice dónde se recoge", () => {
    expect(fraseVentana(1, 2)).toBe("modelo en la web · se recoge en 2 tiendas");
    expect(fraseVentana(30, 1)).toBe("modelos en la web · se recoge en 1 tienda");
    expect(fraseVentana(30, 0)).toBe("modelos en la web, pero ninguna tienda para recoger");
    expect(fraseVentana(30, null)).toBe("modelos en la web");
  });
});
