import { beforeEach, describe, expect, it } from "vitest";
import { destinoDelClic, entrarAlInstante, etiquetaDelDestino, leerEnCamino, leerUltimo, marcarDestino, registrarNavegador, soltarDestino } from "./navegacion-al-instante";

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

describe("entrarAlInstante: el clic marca el destino y lo navega el marco (act. 2026-11-10)", () => {
  const navegaciones: string[] = [];
  let atajado = 0;
  const clic = () => ({ ...CLIC, preventDefault: () => void atajado++ });
  beforeEach(() => {
    navegaciones.length = 0;
    atajado = 0;
    soltarDestino();
  });

  it("de una hija a su padre (Marcas → Productos) SÍ es entrar: antes se daba por llegado y no se veía nada 2,6 s", () => {
    const quitar = registrarNavegador((href) => navegaciones.push(href));
    const MARCAS = { pathname: "/productos/marcas", origin: AQUI.origin };
    expect(entrarAlInstante("/productos", clic(), MARCAS)).toBe(true);
    expect(leerEnCamino()?.pathname).toBe("/productos");
    expect(navegaciones).toEqual(["/productos"]);
    expect(atajado).toBe(1);
    quitar();
  });
  it("navega con los parámetros del enlace (la sede y el mes de Finanzas) y marca solo la ruta", () => {
    const quitar = registrarNavegador((href) => navegaciones.push(href));
    expect(entrarAlInstante("/finanzas/dinero?sede=tr&mes=2026-11", clic(), AQUI)).toBe(true);
    expect(navegaciones).toEqual(["/finanzas/dinero?sede=tr&mes=2026-11"]);
    expect(leerEnCamino()?.pathname).toBe("/finanzas/dinero");
    quitar();
  });
  it("la misma pantalla, otra pestaña o sin marco montado: no toca nada y el enlace navega como siempre", () => {
    expect(entrarAlInstante("/inventario", clic(), AQUI)).toBe(false);
    const quitar = registrarNavegador((href) => navegaciones.push(href));
    expect(entrarAlInstante("/caja?cerrar=1", clic(), AQUI)).toBe(false);
    expect(entrarAlInstante("/inventario", { ...clic(), metaKey: true }, AQUI)).toBe(false);
    expect(navegaciones).toEqual([]);
    expect(atajado).toBe(0);
    expect(leerEnCamino()).toBeNull();
    quitar();
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
