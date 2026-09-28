import { describe, expect, it } from "vitest";
import { destinoQueSale, textoDeSalida, type ClicEnEnlace, type UbicacionActual } from "./aviso-de-salida-reglas";

const aqui: UbicacionActual = { origin: "https://erp.cayla.pe", pathname: "/productos/abc/editar", search: "" };

const clic = (href: string, resto: Partial<ClicEnEnlace> = {}): ClicEnEnlace => ({
  href,
  target: null,
  descarga: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...resto,
});

describe("destinoQueSale — qué clics sacan de la pantalla", () => {
  it("un enlace del menú a otra pantalla sale, y devuelve la ruta interna", () => {
    expect(destinoQueSale(clic("/productos"), aqui)).toBe("/productos");
    expect(destinoQueSale(clic("/productos?estado=activo#lista"), aqui)).toBe("/productos?estado=activo#lista");
  });

  it("acepta la dirección completa del mismo sitio", () => {
    expect(destinoQueSale(clic("https://erp.cayla.pe/inventario"), aqui)).toBe("/inventario");
  });

  it("un enlace relativo se resuelve desde donde está la pantalla", () => {
    expect(destinoQueSale(clic("historial"), aqui)).toBe("/productos/abc/historial");
    expect(destinoQueSale(clic("../historial"), aqui)).toBe("/productos/historial");
  });

  it("la misma pantalla, o solo otra ancla, no sale", () => {
    expect(destinoQueSale(clic("/productos/abc/editar"), aqui)).toBeNull();
    expect(destinoQueSale(clic("#fotos"), aqui)).toBeNull();
    expect(destinoQueSale(clic("/productos/abc/editar#fotos"), aqui)).toBeNull();
  });

  it("los mismos datos de la URL con otra búsqueda sí es otra pantalla", () => {
    expect(destinoQueSale(clic("/productos/abc/editar?x=1"), aqui)).toBe("/productos/abc/editar?x=1");
  });

  it("otro sitio no se pregunta: el aviso propio del navegador ya lo cubre al irse", () => {
    expect(destinoQueSale(clic("https://wa.me/51999"), aqui)).toBeNull();
  });

  it("mailto: y tel: no salen", () => {
    expect(destinoQueSale(clic("mailto:hola@cayla.pe"), aqui)).toBeNull();
    expect(destinoQueSale(clic("tel:+5199999"), aqui)).toBeNull();
  });

  it("abrir en otra pestaña o ventana no cierra esta: Ctrl, Cmd, Shift, Alt, botón del medio, target y descarga", () => {
    expect(destinoQueSale(clic("/productos", { ctrlKey: true }), aqui)).toBeNull();
    expect(destinoQueSale(clic("/productos", { metaKey: true }), aqui)).toBeNull();
    expect(destinoQueSale(clic("/productos", { shiftKey: true }), aqui)).toBeNull();
    expect(destinoQueSale(clic("/productos", { altKey: true }), aqui)).toBeNull();
    expect(destinoQueSale(clic("/productos", { button: 1 }), aqui)).toBeNull();
    expect(destinoQueSale(clic("/productos", { target: "_blank" }), aqui)).toBeNull();
    expect(destinoQueSale(clic("/reporte.pdf", { descarga: true }), aqui)).toBeNull();
  });

  it("target _self sí sale, y un clic que otro ya frenó no se vuelve a preguntar", () => {
    expect(destinoQueSale(clic("/productos", { target: "_self" }), aqui)).toBe("/productos");
    expect(destinoQueSale(clic("/productos", { defaultPrevented: true }), aqui)).toBeNull();
  });

  it("una dirección rota no tumba nada", () => {
    expect(destinoQueSale(clic("http://"), aqui)).toBeNull();
  });
});

describe("textoDeSalida", () => {
  it("dice cuántos cambios se pierden y de qué prenda", () => {
    expect(textoDeSalida(3, "Camisa Lino")).toEqual({
      titulo: "¿Salir sin guardar?",
      bajada: "Tienes 3 cambios sin guardar en «Camisa Lino». Si sales ahora, se pierden.",
    });
  });

  it("dice «1 cambio» en singular", () => {
    expect(textoDeSalida(1, "Blusa").bajada).toBe("Tienes 1 cambio sin guardar en «Blusa». Si sales ahora, se pierden.");
  });
});
