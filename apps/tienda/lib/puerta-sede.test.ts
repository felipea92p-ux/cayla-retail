import { describe, expect, it } from "vitest";
import { conSedeEnLaDireccion, destinoConSede, rutaConSede } from "./puerta-sede";
import { SEDE_PRINCIPAL } from "./sede-elegida";
import { redireccionDelProxy } from "./sesion";

const documento = (ruta: string, busqueda = "", metodo = "GET") => ({ ruta, busqueda, metodo });

describe("la puerta del catálogo (ADR-0696)", () => {
  it("la tienda principal es Trujillo (Felipe 2026-11-23)", () => {
    expect(SEDE_PRINCIPAL).toBe("trujillo");
  });

  it("solo las páginas que eligen tienda la piden en la dirección", () => {
    for (const ruta of ["/inicio", "/catalogo", "/catalogo/abc", "/looks", "/looks/arma", "/looks/guardado/x", "/bolsa"]) {
      expect(rutaConSede(ruta), ruta).toBe(true);
    }
    for (const ruta of [
      "/",
      "/bolsa/separado/W-1",
      "/tiendas",
      "/cuenta",
      "/catalogos",
      "/inicios",
      "/lookbook",
      "/entrar",
      "/api/salud",
      // Lo que cuelga de una página: la imagen de WhatsApp de una ficha y la de un look guardado.
      "/catalogo/abc/opengraph-image-1c8w3k",
      "/looks/guardado",
      "/looks/guardado/x/historia",
      "/inicio/x",
    ]) {
      expect(rutaConSede(ruta), ruta).toBe(false);
    }
  });

  it("sin tienda: la de la cookie o, sin ella, la principal, con los demás parámetros detrás", () => {
    expect(conSedeEnLaDireccion("/catalogo/abc", "", undefined)).toBe("/catalogo/abc?sede=trujillo");
    expect(conSedeEnLaDireccion("/catalogo/abc", "", "lima")).toBe("/catalogo/abc?sede=lima");
    expect(conSedeEnLaDireccion("/catalogo", "?categoria=blusas&pagina=2", "arequipa")).toBe("/catalogo?sede=arequipa&categoria=blusas&pagina=2");
    expect(conSedeEnLaDireccion("/inicio", "?utm_source=qr", undefined)).toBe("/inicio?sede=trujillo&utm_source=qr");
    // Un `?sede=` vacío es como ninguno.
    expect(conSedeEnLaDireccion("/looks", "?sede=", undefined)).toBe("/looks?sede=trujillo");
  });

  it("con tienda en la dirección no se toca (aunque no exista: la corrige la página)", () => {
    expect(conSedeEnLaDireccion("/catalogo/abc", "?sede=lima", "trujillo")).toBeNull();
    expect(conSedeEnLaDireccion("/catalogo", "?color=rojo&sede=cusco", undefined)).toBeNull();
    expect(conSedeEnLaDireccion("/tiendas", "", "lima")).toBeNull();
  });

  it("una cookie rara no entra a la dirección: va la principal", () => {
    for (const rara of ["", " ", "Lima", "lima/../x", "lima?x=1", "a".repeat(41), "-lima", "lima-", "<script>", "lima%20x"]) {
      expect(conSedeEnLaDireccion("/catalogo/abc", "", rara), rara).toBe("/catalogo/abc?sede=trujillo");
    }
    expect(conSedeEnLaDireccion("/catalogo/abc", "", "san-isidro")).toBe("/catalogo/abc?sede=san-isidro");
  });

  it("la portada llega al Inicio en UN salto, con su tienda y sus marcas", () => {
    const destino = redireccionDelProxy("/", "GET", "no", "?utm_source=qr");
    expect(destinoConSede(destino, documento("/", "?utm_source=qr"), undefined)).toBe("/inicio?sede=trujillo&utm_source=qr");
    expect(destinoConSede(redireccionDelProxy("/", "GET", "si"), documento("/"), "arequipa")).toBe("/inicio?sede=arequipa");
  });

  it("con sesión, «Entrar» lleva al Inicio ya con su tienda; sin sesión, «Mi cuenta» sigue llevando a «Entrar»", () => {
    expect(destinoConSede(redireccionDelProxy("/entrar", "GET", "si"), documento("/entrar"), "lima")).toBe("/inicio?sede=lima");
    const aEntrar = redireccionDelProxy("/cuenta", "GET", "no");
    expect(destinoConSede(aEntrar, documento("/cuenta"), "lima")).toBe(aEntrar);
  });

  it("una página del catálogo sin tienda se redirige aunque la sesión no diga nada", () => {
    expect(destinoConSede(null, documento("/catalogo/abc", "?color=rojo"), undefined)).toBe("/catalogo/abc?sede=trujillo&color=rojo");
    expect(destinoConSede(null, documento("/catalogo/abc", "", "HEAD"), undefined)).toBe("/catalogo/abc?sede=trujillo");
    expect(destinoConSede(null, documento("/catalogo/abc", "?sede=lima"), undefined)).toBeNull();
    expect(destinoConSede(null, documento("/tiendas"), undefined)).toBeNull();
  });

  it("una acción (POST) no se toca", () => {
    expect(destinoConSede(null, documento("/catalogo/abc", "", "POST"), undefined)).toBeNull();
    expect(destinoConSede(null, documento("/inicio", "", "POST"), "lima")).toBeNull();
  });
});
