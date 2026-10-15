import { describe, expect, it } from "vitest";
import { INICIO_CON_CUENTA, redireccionDelProxy } from "./sesion";

describe("a dónde lleva el proxy", () => {
  it("con sesión, la portada y las páginas de entrar llevan al Inicio", () => {
    expect(INICIO_CON_CUENTA).toBe("/inicio");
    for (const ruta of ["/", "/entrar", "/crear-cuenta", "/olvide-mi-contrasena"]) {
      expect(redireccionDelProxy(ruta, "GET", "si")).toBe("/inicio");
    }
    for (const ruta of ["/inicio", "/catalogo", "/catalogo/abc", "/cuenta", "/como-separar"]) {
      expect(redireccionDelProxy(ruta, "GET", "si")).toBeNull();
    }
  });

  it("sin sesión, el Inicio, el catálogo, la bolsa y «Mi cuenta» (y lo que cuelga de ellos) llevan a «Entrar»; la portada y lo público no", () => {
    for (const ruta of ["/inicio", "/cuenta", "/cuenta/pedidos", "/cuenta/pedidos/W-0001", "/catalogo", "/catalogo/abc", "/bolsa", "/bolsa/separado/W-0001"]) {
      expect(redireccionDelProxy(ruta, "GET", "no"), ruta).toBe("/entrar");
    }
    for (const ruta of ["/", "/tiendas", "/privacidad", "/terminos-del-club", "/como-separar", "/cambios-y-devoluciones", "/catalogos", "/inicios", "/bolsas", "/cuentas"]) {
      expect(redireccionDelProxy(ruta, "GET", "no")).toBeNull();
    }
  });

  it("si el proyecto de clientes no contesta, o es una acción (POST), no manda a nadie a ningún lado", () => {
    expect(redireccionDelProxy("/inicio", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/catalogo", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/catalogo", "POST", "no")).toBeNull();
  });
});
