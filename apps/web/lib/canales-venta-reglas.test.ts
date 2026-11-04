import { describe, expect, it } from "vitest";
import { argumentosDeCanal, canalInicialDe, direccionDeEnvioValida, esCanalOnline, ofreceCanal } from "./canales-venta-reglas";

const TIENDA = { clave: "tienda", nombre: "Tienda", esFisico: true };
const TIKTOK = { clave: "tiktok", nombre: "TikTok", esFisico: false };

describe("canal de venta del apartado (ADR-0607)", () => {
  it("la tienda es el canal con el que abre quien la opera; si no, el primero que opera", () => {
    expect(canalInicialDe([TIKTOK, TIENDA])).toBe("tienda");
    expect(canalInicialDe([TIKTOK])).toBe("tiktok");
    expect(canalInicialDe([])).toBe("tienda");
  });

  it("solo se ofrece elegir canal a quien opera algo más que la tienda", () => {
    expect(ofreceCanal([TIENDA])).toBe(false);
    expect(ofreceCanal([TIENDA, TIKTOK])).toBe(true);
    expect(ofreceCanal([TIKTOK])).toBe(true); // un rol «ventas online»: se ve fijo
    expect(ofreceCanal([])).toBe(false);
  });

  it("un canal online lleva entrega; la tienda y lo desconocido no", () => {
    expect(esCanalOnline([TIENDA, TIKTOK], "tiktok")).toBe(true);
    expect(esCanalOnline([TIENDA, TIKTOK], "tienda")).toBe(false);
    expect(esCanalOnline([TIENDA], "tiktok")).toBe(false);
  });

  it("la dirección de envío vale con 5 a 300 letras, sin contar los espacios de los bordes", () => {
    expect(direccionDeEnvioValida("    ")).toBe(false);
    expect(direccionDeEnvioValida("Av. 1")).toBe(true);
    expect(direccionDeEnvioValida("abcd ")).toBe(false);
    expect(direccionDeEnvioValida("x".repeat(300))).toBe(true);
    expect(direccionDeEnvioValida("x".repeat(301))).toBe(false);
  });

  it("la tienda sigue por separar_prendas; un canal online por separar_prendas_online", () => {
    const canales = [TIENDA, TIKTOK];
    expect(argumentosDeCanal(canales, { canal: "tienda", modoEntrega: "recojo", direccionEnvio: "" })).toEqual({ rpc: "separar_prendas" });
    expect(argumentosDeCanal(canales, { canal: "tiktok", modoEntrega: "recojo", direccionEnvio: "Jr. Pizarro 123" })).toEqual({
      rpc: "separar_prendas_online", p_canal: "tiktok", p_modo_entrega: "recojo", p_direccion_envio: null,
    });
    expect(argumentosDeCanal(canales, { canal: "tiktok", modoEntrega: "envio", direccionEnvio: "  Jr. Pizarro 123, Olva " })).toEqual({
      rpc: "separar_prendas_online", p_canal: "tiktok", p_modo_entrega: "envio", p_direccion_envio: "Jr. Pizarro 123, Olva",
    });
  });
});
