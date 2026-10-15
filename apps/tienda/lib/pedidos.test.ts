import { describe, expect, it } from "vitest";
import {
  codigoDeLaUrl,
  detalleDeLaPrenda,
  enlaceDelPedido,
  hhmmss,
  hitos,
  interpretarMisPedidos,
  interpretarUnPedido,
  mensajeWhatsapp,
  nombreTienda,
  porQueSeCerro,
  vivas,
  type Pedido,
} from "./pedidos";

const linea = (nombre: string, talla: string | null, color: string | null, estado = "pendiente") => ({
  variante_id: "11111111-2222-4333-8444-555555555551",
  producto_id: "11111111-2222-4333-8444-555555555559",
  nombre,
  categoria: { nombre: "Blusas", prefijo: "CMS" },
  color: { codigo: "BLA", nombre: color, hex: "#F4F9FF" },
  talla,
  foto: null,
  precio: 69.9,
  precio_lista: 69.9,
  estado,
  viene_de: null,
  fecha_compromiso: null,
});

const pedidoBase = (extra: object = {}) => ({
  pedido_id: "11111111-2222-4333-8444-000000000001",
  codigo: "W-0141",
  estado: "por_confirmar",
  tienda: "Tienda Trujillo",
  ubicacion_id: "11111111-2222-4333-8444-000000000002",
  total: 228.8,
  pagado: 0,
  falta: 228.8,
  creado_en: "2026-10-14T15:00:00+00:00",
  vence_en: "2026-10-15T15:00:00+00:00",
  confirmado_en: null,
  pagado_en: null,
  entregado_en: null,
  cerrado_en: null,
  cierre_motivo: null,
  listo_para_recoger: false,
  recoger_hasta: null,
  codigo_recojo: null,
  tienda_web: { nombre: "Trujillo", whatsapp: "900000101", direccion: "Jr. Pizarro", horario: null },
  lineas: [linea("Vestido Roma", "Estándar", "Negro"), linea("Top Biela", "S", "Negro")],
  ...extra,
});

const unoDe = (dato: object): Pedido =>
  interpretarUnPedido({ plazos: { horas_para_confirmar: 24, dias_para_recoger: 7 }, pedido: dato })!.pedido!;

describe("el mensaje de WhatsApp (el de la maqueta, palabra por palabra)", () => {
  it("dice la tienda, el número de pedido, cada prenda con su talla y su color, el total y «¿Me confirman la separación?»", () => {
    const p = unoDe(pedidoBase());
    expect(mensajeWhatsapp(p)).toBe(
      "Hola CAYLA Trujillo, separé el pedido web W-0141:\n\n• Vestido Roma — Talla Estándar — Negro\n• Top Biela — Talla S — Negro\n\nTotal: S/ 228.80\n\n¿Me confirman la separación?",
    );
  });

  it("no nombra lo que la tienda quitó al confirmar, ni inventa una talla o un color que la prenda no tiene", () => {
    const p = unoDe(
      pedidoBase({ lineas: [linea("Vestido Roma", "Estándar", "Negro", "quitada"), linea("Bolso Lía", null, null)], total: 89.9 }),
    );
    expect(mensajeWhatsapp(p)).toBe(
      "Hola CAYLA Trujillo, separé el pedido web W-0141:\n\n• Bolso Lía\n\nTotal: S/ 89.90\n\n¿Me confirman la separación?",
    );
    expect(vivas(p).map((l) => l.nombre)).toEqual(["Bolso Lía"]);
  });

  it("el enlace abre el chat de ESA tienda con el mensaje escrito; sin WhatsApp, no hay enlace", () => {
    const p = unoDe(pedidoBase());
    const enlace = enlaceDelPedido(p)!;
    expect(enlace.startsWith("https://wa.me/51900000101?text=")).toBe(true);
    expect(decodeURIComponent(enlace.split("?text=")[1])).toBe(mensajeWhatsapp(p));
    expect(enlaceDelPedido(unoDe(pedidoBase({ tienda_web: { nombre: "Trujillo", whatsapp: null } })))).toBeNull();
  });

  it("«CAYLA Trujillo»: a la tienda se le antepone la marca, sin repetirla", () => {
    expect(nombreTienda("Trujillo")).toBe("CAYLA Trujillo");
    expect(nombreTienda("CAYLA Lima")).toBe("CAYLA Lima");
    expect(nombreTienda(" Cayla Arequipa ")).toBe("Cayla Arequipa");
  });
});

describe("lo que dice la base", () => {
  it("un pedido con un dato raro se deja fuera y los demás se ven; sin forma, null", () => {
    const r = interpretarMisPedidos({
      plazos: { horas_para_confirmar: 24, dias_para_recoger: 7 },
      pedidos: [pedidoBase(), { ...pedidoBase(), codigo: "141" }],
    });
    expect(r?.pedidos.map((p) => p.codigo)).toEqual(["W-0141"]);
    expect(r?.plazos).toEqual({ horasParaConfirmar: 24, diasParaRecoger: 7 });
    expect(interpretarMisPedidos({ pedidos: [] })).toBeNull();
    expect(interpretarUnPedido({ plazos: { horas_para_confirmar: 48, dias_para_recoger: 7 }, pedido: null })).toEqual({
      plazos: { horasParaConfirmar: 48, diasParaRecoger: 7 },
      pedido: null,
    });
  });

  it("el código de 4 cifras solo se acepta con su forma", () => {
    expect(unoDe(pedidoBase({ codigo_recojo: "2094", estado: "pagado", listo_para_recoger: true })).codigoRecojo).toBe("2094");
    expect(
      interpretarUnPedido({ plazos: { horas_para_confirmar: 24, dias_para_recoger: 7 }, pedido: pedidoBase({ codigo_recojo: "0123" }) }),
    ).toBeNull();
  });
});

describe("la dirección de un pedido", () => {
  it("acepta W-0141, w-0141, W0141 y 141; lo demás no", () => {
    for (const v of ["W-0141", "w-0141", "W0141", "141", "0141", "%57-0141"]) expect(codigoDeLaUrl(v), v).toBe("W-0141");
    expect(codigoDeLaUrl("W-12345")).toBe("W-12345");
    for (const v of ["", "W-", "W-0", "abc", "W-01-41", "1e3", "-141"]) expect(codigoDeLaUrl(v), v).toBeNull();
  });
});

describe("la línea de tiempo y el reloj", () => {
  it("separado → confirmado → pagado → entregado: lo hecho, lo que sigue y lo que falta", () => {
    const base = { creadoEn: "a", confirmadoEn: null, pagadoEn: null, entregadoEn: null };
    expect(hitos({ ...base, estado: "por_confirmar" }).map((h) => h.estado)).toEqual(["hecho", "ahora", "falta", "falta"]);
    expect(hitos({ ...base, estado: "pagado" }).map((h) => h.estado)).toEqual(["hecho", "hecho", "hecho", "ahora"]);
    expect(hitos({ ...base, estado: "entregado" }).map((h) => h.estado)).toEqual(["hecho", "hecho", "hecho", "hecho"]);
    // Un pedido cerrado (vencido o anulado) solo marca «Separado».
    expect(hitos({ ...base, estado: "vencido" }).map((h) => h.estado)).toEqual(["hecho", "falta", "falta", "falta"]);
    expect(hitos({ ...base, estado: "por_confirmar" }).map((h) => h.nombre)).toEqual([
      "Separado",
      "Confirmado por la tienda",
      "Pagado",
      "Entregado",
    ]);
  });

  it("«23:59:12», también con más de 24 horas y nunca negativo", () => {
    expect(hhmmss(((23 * 60 + 59) * 60 + 12) * 1000 + 999)).toBe("23:59:12");
    expect(hhmmss(47 * 3600 * 1000)).toBe("47:00:00");
    expect(hhmmss(-5000)).toBe("00:00:00");
  });

  it("«Blanco · Talla M»", () => {
    expect(detalleDeLaPrenda({ color: { nombre: "Blanco", hex: null }, talla: "M" })).toBe("Blanco · Talla M");
    expect(detalleDeLaPrenda({ color: { nombre: null, hex: null }, talla: null })).toBe("");
  });
});

describe("por qué se cerró, dicho para el cliente (Felipe, 2026-10-14)", () => {
  // Los motivos que acepta la base: al no confirmar (no_confirmar_pedido_web) y al anular uno confirmado (anular_pedido_web).
  const MOTIVOS_DE_LA_BASE = ["sin_stock", "cliente_no_respondio", "cliente_desistio", "cliente_no_pago", "error_en_pedido"];

  it("cada motivo de la base tiene su frase, escrita para el cliente: ninguna habla «del cliente» ni repite la etiqueta del ERP", () => {
    const frases = MOTIVOS_DE_LA_BASE.map(porQueSeCerro);
    expect(new Set(frases).size).toBe(MOTIVOS_DE_LA_BASE.length);
    for (const f of frases) {
      expect(f).not.toMatch(/cliente/i);
      expect(f).not.toBe("La tienda canceló este pedido.");
      expect(f).toMatch(/\.$/);
    }
    expect(porQueSeCerro("cliente_no_pago")).toBe("No se registró tu pago a tiempo.");
    expect(porQueSeCerro("cliente_desistio")).toBe("Se canceló a pedido tuyo.");
  });

  it("un motivo que no conoce (o ninguno) dice lo neutro", () => {
    for (const m of [null, "otro", "motivo_nuevo_del_erp", "toString"]) {
      expect(porQueSeCerro(m), String(m)).toBe("La tienda canceló este pedido.");
    }
  });
});
