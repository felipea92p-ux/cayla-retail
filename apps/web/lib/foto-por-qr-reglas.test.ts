import { describe, expect, it } from "vitest";
import { esPermiso, fotoAceptada, MAX_BYTES_FOTO_QR, mensajeDelQr, rutaDeFotoQr, urlDelQr } from "./foto-por-qr-reglas";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const TEXTO = new TextEncoder().encode("<html>no soy foto");

describe("la foto por QR de Recibir (ADR-0699)", () => {
  it("solo un permiso con la forma de los que da la base pasa: 32 caracteres base64 para URL", () => {
    expect(esPermiso("aB3_x-9ZqLmN0pQrStUvWxYz12345678")).toBe(true);
    for (const malo of ["", "corto", "aB3_x-9ZqLmN0pQrStUvWxYz123456789", "aB3+x/9ZqLmN0pQrStUvWxYz12345678", "aB3_x-9ZqLmN0pQrStUvWxYz1234567=", "../../etc/passwd................"]) {
      expect(esPermiso(malo), malo).toBe(false);
    }
  });

  it("se acepta una foto por su firma, nunca por su nombre; lo demás se rechaza con una frase de tienda", () => {
    expect(fotoAceptada(JPEG, 1000)).toEqual({ tipo: "image/jpeg", ext: "jpg" });
    expect(fotoAceptada(PNG, 1000)).toEqual({ tipo: "image/png", ext: "png" });
    expect(fotoAceptada(TEXTO, 1000)).toHaveProperty("motivo");
    expect(fotoAceptada(JPEG, 0)).toHaveProperty("motivo");
    expect(fotoAceptada(JPEG, MAX_BYTES_FOTO_QR + 1)).toHaveProperty("motivo");
    expect(fotoAceptada(JPEG, MAX_BYTES_FOTO_QR)).toHaveProperty("ext", "jpg");
  });

  it("la ruta va en la carpeta del permiso, y la dirección del QR no duplica barras", () => {
    expect(rutaDeFotoQr("q1", "f1", "jpg")).toBe("q1/f1.jpg");
    expect(urlDelQr("https://erp.cayla.pe/", "X".repeat(32))).toBe(`https://erp.cayla.pe/foto/${"X".repeat(32)}`);
  });

  it("cada motivo de la base tiene su frase, y lo desconocido no inventa uno", () => {
    expect(mensajeDelQr("qr_vencido")).toMatch(/venció/);
    expect(mensajeDelQr("qr_lleno")).toMatch(/3 fotos/);
    expect(mensajeDelQr("qr_no_existe")).toMatch(/no es de CAYLA/);
    expect(mensajeDelQr("otra cosa")).toMatch(/otra vez/);
    expect(mensajeDelQr(null)).toMatch(/otra vez/);
  });
});
