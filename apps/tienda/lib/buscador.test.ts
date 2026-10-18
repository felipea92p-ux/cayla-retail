import { describe, expect, it } from "vitest";
import { buscarEn, leerRespuestaDelBuscador, normalizar, resaltar, type ItemBusqueda } from "./buscador";

const item = (nombre: string, categoria: string | null, colores: string[] = []): ItemBusqueda => ({
  id: nombre,
  nombre,
  categoria,
  colores,
  precio: "S/ 79.90",
  oferta: null,
  href: `/catalogo/${nombre}`,
  foto: null,
  optimizar: false,
  forma: "percha",
  color: null,
});

const INDICE = [
  item("Blusa Emma", "Camisas y Blusas", ["Beige", "Negro"]),
  item("Pantalón Ágata", "Pantalones", ["Azul"]),
  item("Vestido Rosa", "Vestidos", ["Rojo"]),
  item("Falda Renata", "Faldas", ["Rosa palo"]),
];
const nombres = (xs: ItemBusqueda[]) => xs.map((x) => x.nombre);

describe("el buscador de la cabecera", () => {
  it("sin tildes ni mayúsculas", () => {
    expect(normalizar("Pantalón Ágata")).toBe("pantalon agata");
    expect(normalizar("Camisas y Blusas")).toBe("camisas y blusas");
    expect(normalizar("Niño")).toBe("nino");
  });

  it("con menos de dos letras no busca (la hoja muestra las categorías para tocar)", () => {
    expect(buscarEn(INDICE, "")).toEqual([]);
    expect(buscarEn(INDICE, " b ")).toEqual([]);
  });

  it("busca en el nombre, la categoría y los colores, sin tildes ni mayúsculas", () => {
    expect(nombres(buscarEn(INDICE, "PANTALON"))).toEqual(["Pantalón Ágata"]);
    expect(nombres(buscarEn(INDICE, "agata"))).toEqual(["Pantalón Ágata"]);
    expect(nombres(buscarEn(INDICE, "blusas"))).toEqual(["Blusa Emma"]);
    expect(nombres(buscarEn(INDICE, "negro"))).toEqual(["Blusa Emma"]);
    expect(buscarEn(INDICE, "chompa")).toEqual([]);
  });

  it("primero lo que lo tiene en el nombre, después en la categoría o el color", () => {
    // «Rosa» es el nombre del vestido y el color de la falda: el vestido va primero.
    expect(nombres(buscarEn(INDICE, "rosa"))).toEqual(["Vestido Rosa", "Falda Renata"]);
  });

  it("hasta el máximo pedido", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => item(`Blusa ${i}`, "Camisas y Blusas"));
    expect(buscarEn(muchas, "blusa")).toHaveLength(8);
    expect(buscarEn(muchas, "blusa", 3)).toHaveLength(3);
  });

  it("marca lo que coincide en el nombre, con sus tildes y mayúsculas tal cual", () => {
    expect(resaltar("Blusa Emma", "em")).toEqual(["Blusa ", "Em", "ma"]);
    expect(resaltar("Pantalón Ágata", "agata")).toEqual(["Pantalón ", "Ágata", ""]);
    expect(resaltar("Pantalón Ágata", "talon")).toEqual(["Pan", "talón", " Ágata"]);
    expect(resaltar("Blusa Emma", "negro")).toBeNull();
    expect(resaltar("Blusa Emma", " ")).toBeNull();
  });
});

describe("la respuesta de GET /api/buscador (la lista llega aparte de la página)", () => {
  it("con la forma buena, la lista; sin sesión, lo dice; cualquier otra cosa es como si la base no hubiera contestado", () => {
    expect(leerRespuestaDelBuscador({ estado: "ok", indice: [] })).toEqual({ estado: "ok", indice: [] });
    expect(leerRespuestaDelBuscador({ estado: "sin_sesion" })).toEqual({ estado: "sin_sesion" });
    expect(leerRespuestaDelBuscador({ estado: "sin_respuesta" })).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaDelBuscador({ estado: "ok" })).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaDelBuscador({ estado: "ok", indice: "x" })).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaDelBuscador(null)).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaDelBuscador("<html>")).toEqual({ estado: "sin_respuesta" });
  });
});
