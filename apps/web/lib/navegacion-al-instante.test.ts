import { describe, expect, it } from "vitest";
import { MS_TOPE_DESTINO, destinoDelClic, etiquetaDelDestino, leerEnCamino, leerUltimo, marcarDestino, sigueEnCamino, soltarDestino } from "./navegacion-al-instante";

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

describe("sigueEnCamino: el esqueleto se va cuando llega la pantalla o vence el tope", () => {
  const d = { pathname: "/inventario", etiqueta: "Existencias", desde: 1_000 };
  it("mientras la ruta no cambia y no venció, sigue", () => {
    expect(sigueEnCamino(d, "/caja", 1_500)).toBe(true);
  });
  it("llegó la ruta (o una hija suya): ya no", () => {
    expect(sigueEnCamino(d, "/inventario", 1_500)).toBe(false);
    expect(sigueEnCamino(d, "/inventario/conteo", 1_500)).toBe(false);
  });
  it("pasado el tope, se devuelve la pantalla anterior", () => {
    expect(sigueEnCamino(d, "/caja", 1_000 + MS_TOPE_DESTINO)).toBe(false);
  });
  it("sin destino, nada que esperar", () => {
    expect(sigueEnCamino(null, "/caja", 0)).toBe(false);
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
