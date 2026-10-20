import { describe, expect, it } from "vitest";
import {
  claveAUint8,
  decidirPorRespuesta,
  direccionValida,
  enlaceInterno,
  paqueteDelAviso,
  suscripcionValida,
  ENLACE_POR_DEFECTO,
} from "./push";

const endpoint = "https://fcm.googleapis.com/fcm/send/abcdefghijklmnop";
const p256dh = "B".repeat(87);
const auth = "a".repeat(22);

describe("suscripcionValida", () => {
  it("acepta la forma que manda el navegador y la devuelve limpia", () => {
    expect(suscripcionValida({ endpoint, keys: { p256dh, auth }, expirationTime: null })).toEqual({ endpoint, p256dh, auth });
  });

  it("rechaza una dirección que no es https o es demasiado corta", () => {
    expect(suscripcionValida({ endpoint: "http://ejemplo.com/abcdefghijklmnop", keys: { p256dh, auth } })).toBeNull();
    expect(suscripcionValida({ endpoint: "https://x", keys: { p256dh, auth } })).toBeNull();
  });

  it("rechaza claves que no tienen el largo de un aparato de verdad", () => {
    expect(suscripcionValida({ endpoint, keys: { p256dh: "corta", auth } })).toBeNull();
    expect(suscripcionValida({ endpoint, keys: { p256dh, auth: "x" } })).toBeNull();
  });

  it("rechaza lo que no es un objeto", () => {
    expect(suscripcionValida(null)).toBeNull();
    expect(suscripcionValida("https://fcm.googleapis.com/fcm/send/abcdefghijklmnop")).toBeNull();
    expect(suscripcionValida({ endpoint, keys: null })).toBeNull();
  });
});

describe("paqueteDelAviso", () => {
  it("arma título, texto y enlace interno, sin datos de la compra", () => {
    expect(paqueteDelAviso("Llegó una talla", "Tu tienda ya la tiene.", "/notificaciones")).toEqual({
      titulo: "Llegó una talla",
      texto: "Tu tienda ya la tiene.",
      enlace: "/notificaciones",
    });
  });

  it("corta los textos largos a lo que cabe en la pantalla bloqueada", () => {
    const paquete = paqueteDelAviso("t".repeat(300), "x".repeat(900), "/cuenta/pedidos/7");
    expect(paquete.titulo.length).toBe(120);
    expect(paquete.texto.length).toBe(240);
  });
});

describe("enlaceInterno", () => {
  it("deja pasar solo rutas de la tienda", () => {
    expect(enlaceInterno("/cuenta/pedidos/7")).toBe("/cuenta/pedidos/7");
  });

  it("cambia a la pantalla por defecto lo que podría llevar a otro sitio", () => {
    expect(enlaceInterno("//evil.example/x")).toBe(ENLACE_POR_DEFECTO);
    expect(enlaceInterno("https://evil.example")).toBe(ENLACE_POR_DEFECTO);
    expect(enlaceInterno(42)).toBe(ENLACE_POR_DEFECTO);
    expect(enlaceInterno("/" + "x".repeat(300))).toBe(ENLACE_POR_DEFECTO);
  });
});

describe("direccionValida", () => {
  it("exige https y un largo razonable", () => {
    expect(direccionValida(endpoint)).toBe(true);
    expect(direccionValida("https://" + "x".repeat(1000))).toBe(false);
    expect(direccionValida(undefined)).toBe(false);
  });
});

describe("decidirPorRespuesta", () => {
  it("un 2xx es un aparato entregado", () => {
    expect(decidirPorRespuesta(201)).toBe("entregado");
    expect(decidirPorRespuesta(200)).toBe("entregado");
  });

  it("404 y 410 quitan el aparato: ya no acepta avisos", () => {
    expect(decidirPorRespuesta(404)).toBe("quitar_aparato");
    expect(decidirPorRespuesta(410)).toBe("quitar_aparato");
  });

  it("cualquier otra cosa, incluido no responder (null), se reintenta", () => {
    expect(decidirPorRespuesta(500)).toBe("reintentar");
    expect(decidirPorRespuesta(429)).toBe("reintentar");
    expect(decidirPorRespuesta(null)).toBe("reintentar");
  });
});

describe("claveAUint8", () => {
  it("convierte la clave pública (base64 url) en los 65 bytes que pide el navegador", () => {
    const clave = "BPdpzpcV-lJmtA2S5yWeSHVRhRQzm0W2KMMSqjuwVemrRuK8A_7xbt9WcHKZ1N8GjoejYrz8cnPH3QcvA2s1e0I";
    expect(claveAUint8(clave).length).toBe(65);
    expect(claveAUint8(clave)[0]).toBe(4);
  });
});
