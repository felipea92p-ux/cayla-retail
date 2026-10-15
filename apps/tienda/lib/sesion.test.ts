import { describe, expect, it } from "vitest";
import { INICIO_CON_CUENTA, redireccionDelProxy } from "./sesion";

describe("a dónde lleva el proxy", () => {
  it("con sesión, la portada y las páginas de entrar llevan al Inicio", () => {
    expect(INICIO_CON_CUENTA).toBe("/inicio");
    for (const ruta of ["/", "/entrar", "/crear-cuenta", "/olvide-mi-contrasena"]) {
      expect(redireccionDelProxy(ruta, "GET", "si")).toBe("/inicio");
    }
    for (const ruta of ["/inicio", "/catalogo", "/catalogo/abc", "/looks", "/looks/abc", "/cuenta", "/como-separar", "/tiendas", "/recomendaciones"]) {
      expect(redireccionDelProxy(ruta, "GET", "si")).toBeNull();
    }
  });

  it("sin sesión, el Inicio, el catálogo, «Arma tu look», la bolsa, «Mi cuenta» y «Recomendaciones» (y lo que cuelga de ellos) llevan a «Entrar»; la portada y lo público no", () => {
    for (const ruta of [
      "/inicio",
      "/cuenta",
      "/cuenta/pedidos",
      "/cuenta/pedidos/W-0001",
      "/catalogo",
      "/catalogo/abc",
      "/looks",
      "/looks/00000000-0000-4000-8000-000000000001",
      "/bolsa",
      "/bolsa/separado/W-0001",
      // Va siempre con su nombre (Felipe 2026-10-15): sin cuenta no se escribe.
      "/recomendaciones",
    ]) {
      expect(redireccionDelProxy(ruta, "GET", "no"), ruta).toBe("/entrar");
    }
    for (const ruta of ["/", "/tiendas", "/privacidad", "/terminos-del-club", "/como-separar", "/cambios-y-devoluciones", "/catalogos", "/inicios", "/bolsas", "/cuentas", "/lookbook", "/recomendacionesx"]) {
      expect(redireccionDelProxy(ruta, "GET", "no")).toBeNull();
    }
  });

  it("si el proyecto de clientes no contesta, o es una acción (POST), no manda a nadie a ningún lado", () => {
    expect(redireccionDelProxy("/inicio", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/catalogo", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/looks", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/catalogo", "POST", "no")).toBeNull();
    expect(redireccionDelProxy("/looks/abc", "POST", "no")).toBeNull();
    // «Enviar recomendación» es una acción: viaja como POST a /recomendaciones y se valida sola (pregunta quién es).
    expect(redireccionDelProxy("/recomendaciones", "POST", "no")).toBeNull();
  });
});
