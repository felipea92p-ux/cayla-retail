import { describe, expect, it } from "vitest";
import { rutaDeVuelta } from "./elige-sede-reglas";

describe("la vuelta de «Elige sede» solo va a una ruta del ERP", () => {
  it("las rutas del ERP pasan tal cual, con su búsqueda", () => {
    for (const r of ["/vender", "/inventario/conteo/abc?volver=/inventario", "/caja"]) expect(rutaDeVuelta(r)).toBe(r);
  });
  it("lo que no es una ruta interna no pasa", () => {
    for (const r of ["", "vender", "//otro.sitio/x", "/\\otro.sitio/x", "/\\\\otro.sitio", "https://otro.sitio", "javascript:alert(1)", "/ruta con espacio", "/a\tb", "/a\nb", "/".padEnd(501, "a")]) {
      expect(rutaDeVuelta(r)).toBeNull();
    }
    expect(rutaDeVuelta(null)).toBeNull();
    expect(rutaDeVuelta(undefined)).toBeNull();
  });
});
