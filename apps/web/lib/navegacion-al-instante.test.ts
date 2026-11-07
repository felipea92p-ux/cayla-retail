import { describe, expect, it } from "vitest";
import { destinoDelClic, etiquetaDelDestino, leerEnCamino, leerUltimo, llegoAlDestino, marcarDestino, soltarDestino } from "./navegacion-al-instante";

const AQUI = { pathname: "/caja", origin: "https://cayla-retail.vercel.app" };
const CLIC = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

describe("destinoDelClic: solo el clic que entra a OTRA pantalla en esta pestaña", () => {
  it("un clic normal a otro módulo devuelve su ruta", () => {
    expect(destinoDelClic("/inventario", AQUI, CLIC)).toBe("/inventario");
    expect(destinoDelClic("/finanzas/resumen?sede=x&mes=2026-11", AQUI, CLIC)).toBe("/finanzas/resumen");
  });
  it("la misma pantalla (aunque cambien sus parámetros) no tapa nada", () => {
    expect(destinoDelClic("/caja", AQUI, CLIC)).toBeNull();
    expect(destinoDelClic("/caja?cerrar=1", AQUI, CLIC)).toBeNull();
  });
  it("otra pestaña, otro botón, un clic ya atajado u otro sitio: no es nuestro", () => {
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"] as const) {
      expect(destinoDelClic("/inventario", AQUI, { ...CLIC, [k]: true })).toBeNull();
    }
    expect(destinoDelClic("/inventario", AQUI, { ...CLIC, button: 1 })).toBeNull();
    expect(destinoDelClic("https://tienda.cayla.pe/", AQUI, CLIC)).toBeNull();
  });
});

describe("etiquetaDelDestino: el nombre del menú de la pantalla a la que se entra", () => {
  const PANTALLAS = [
    { href: "/", etiqueta: "Inicio" },
    { href: "/productos", etiqueta: "Productos" },
    { href: "/productos/marcas", etiqueta: "Marcas" },
    { href: "/inventario", etiqueta: "Existencias" },
  ];
  it("la fila más larga que contiene la ruta", () => {
    expect(etiquetaDelDestino("/productos/marcas", PANTALLAS)).toBe("Marcas");
    expect(etiquetaDelDestino("/productos/123/editar", PANTALLAS)).toBe("Productos");
    expect(etiquetaDelDestino("/inventario", PANTALLAS)).toBe("Existencias");
    expect(etiquetaDelDestino("/", PANTALLAS)).toBe("Inicio");
  });
  it("una pantalla fuera del menú no inventa un nombre («/» no contiene a las demás)", () => {
    expect(etiquetaDelDestino("/sin-acceso", PANTALLAS)).toBeNull();
  });
});

describe("llegoAlDestino: el esqueleto se va cuando llega la pantalla", () => {
  const d = { pathname: "/inventario", etiqueta: "Existencias", desde: 1_000 };
  it("mientras la ruta es otra, no llegó", () => {
    expect(llegoAlDestino(d, "/caja")).toBe(false);
    expect(llegoAlDestino(d, "/inventario-viejo")).toBe(false);
  });
  it("la ruta (o una hija suya) ya es la del destino: llegó", () => {
    expect(llegoAlDestino(d, "/inventario")).toBe(true);
    expect(llegoAlDestino(d, "/inventario/conteo")).toBe(true);
  });
});

describe("el almacén: el destino en camino se suelta, el último se recuerda para el `loading.tsx`", () => {
  it("marcar y soltar", () => {
    marcarDestino("/inventario", "Existencias", 10);
    expect(leerEnCamino()).toEqual({ pathname: "/inventario", etiqueta: "Existencias", desde: 10 });
    soltarDestino();
    expect(leerEnCamino()).toBeNull();
    expect(leerUltimo()?.etiqueta).toBe("Existencias");
  });
});
