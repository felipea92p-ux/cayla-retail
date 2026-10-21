import { describe, expect, it } from "vitest";
import { PARAMETRO_VOLVER, rutaParaVolver } from "./entrada";
import { INICIO_CON_CUENTA, PARAMETRO_VOLVER_DEL_PROXY, redireccionDelProxy } from "./sesion";

describe("a dónde lleva el proxy", () => {
  it("con sesión, las páginas de entrar llevan al Inicio", () => {
    expect(INICIO_CON_CUENTA).toBe("/inicio");
    for (const ruta of ["/entrar", "/crear-cuenta", "/olvide-mi-contrasena"]) {
      expect(redireccionDelProxy(ruta, "GET", "si")).toBe("/inicio");
    }
    for (const ruta of ["/inicio", "/catalogo", "/catalogo/abc", "/looks", "/looks/abc", "/cuenta", "/como-separar", "/tiendas", "/recomendaciones"]) {
      expect(redireccionDelProxy(ruta, "GET", "si")).toBeNull();
    }
  });

  it("sin sesión, solo lo que es DE la persona lleva a «Entrar» (su perfil, un pedido separado, recomendaciones y sus favoritos)", () => {
    for (const ruta of ["/cuenta", "/cuenta/pedidos", "/cuenta/pedidos/W-0001", "/bolsa/separado/W-0001", "/recomendaciones"]) {
      expect(redireccionDelProxy(ruta, "GET", "no"), ruta).toBe(`/entrar?volver=${encodeURIComponent(ruta)}`);
    }
    // La lista de favoritos es de la persona; la de todos, no.
    expect(redireccionDelProxy("/catalogo", "GET", "no", "?lista=favoritos")).toBe("/entrar?volver=%2Fcatalogo%3Flista%3Dfavoritos");
    expect(redireccionDelProxy("/catalogo", "GET", "no", "?lista=nuevo")).toBeNull();
  });

  it("el catálogo, los precios, los looks, la bolsa y lo público se ven sin cuenta (Felipe 2026-10-17)", () => {
    for (const ruta of [
      "/inicio",
      "/catalogo",
      "/catalogo/abc",
      "/looks",
      "/looks/arma",
      "/looks/00000000-0000-4000-8000-000000000001",
      "/bolsa",
      "/tiendas",
      "/privacidad",
      "/terminos-del-club",
      "/como-separar",
      "/cambios-y-devoluciones",
      "/catalogos",
      "/inicios",
      "/bolsas",
      "/cuentas",
      "/lookbook",
      "/recomendacionesx",
    ]) {
      expect(redireccionDelProxy(ruta, "GET", "no"), ruta).toBeNull();
    }
  });

  it("la portada ya no es otra pantalla: con o sin cuenta lleva al Inicio", () => {
    for (const usuario of ["si", "no", "no_se"] as const) expect(redireccionDelProxy("/", "GET", usuario)).toBe("/inicio");
  });

  it("si el proyecto de clientes no contesta, o es una acción (POST), no manda a nadie a ningún lado", () => {
    expect(redireccionDelProxy("/cuenta", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/cuenta/pedidos", "GET", "no_se")).toBeNull();
    expect(redireccionDelProxy("/catalogo", "GET", "no_se", "?lista=favoritos")).toBeNull();
    expect(redireccionDelProxy("/cuenta", "POST", "no")).toBeNull();
    expect(redireccionDelProxy("/catalogo", "POST", "no", "?lista=favoritos")).toBeNull();
    // «Enviar recomendación» es una acción: viaja como POST a /recomendaciones y se valida sola (pregunta quién es).
    expect(redireccionDelProxy("/recomendaciones", "POST", "no")).toBeNull();
  });
});

describe("volver a la página pedida después de entrar", () => {
  it("«Entrar» lleva la página y su búsqueda, y «Entrar» la acepta tal cual (el mismo parámetro de los dos lados)", () => {
    expect(PARAMETRO_VOLVER_DEL_PROXY).toBe(PARAMETRO_VOLVER);
    const destino = redireccionDelProxy("/cuenta/pedidos", "GET", "no", "?pagina=2");
    expect(destino).toBe("/entrar?volver=%2Fcuenta%2Fpedidos%3Fpagina%3D2");
    const volver = new URL(destino!, "https://tienda.cayla.pe").searchParams.get(PARAMETRO_VOLVER);
    expect(rutaParaVolver(volver)).toBe("/cuenta/pedidos?pagina=2");
    expect(redireccionDelProxy("/cuenta/pedidos/W-0001", "GET", "no", "")).toBe("/entrar?volver=%2Fcuenta%2Fpedidos%2FW-0001");
    // Con sesión, nada cambia.
    expect(redireccionDelProxy("/catalogo", "GET", "si", "?lista=favoritos")).toBeNull();
  });
});
