import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { armarModelos } from "./analisis-modelo";
import {
  cuantosPuestos,
  filtrarModelos,
  opcionesDe,
  pasaFiltros,
  puestos,
  quitarOpcion,
  SIN_FILTROS,
  type FiltrosAnalisis,
} from "./analisis-filtros";

// Datos inventados (ni nombres del catálogo ni cifras de producción): tres modelos con tallas, colores, precios y orígenes distintos.
const HOY = "2026-11-21";

function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v",
    productoId: "p",
    nombre: "Blusa Ensayo",
    color: "Vino",
    colorHex: "#7a2e2a", // tema-fijo: color de una prenda inventada (dato, no tema)
    talla: "M",
    categoria: "Blusas",
    categoriaPrefijo: "BL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 89,
    costo: 34,
    origen: "taller",
    proveedorId: null,
    piso: 2,
    almacen: 0,
    vendidas30: 3,
    diasDeVentas: 30,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: 5,
    salioAlPiso: "2026-10-01",
    ultimaVenta: "2026-11-16",
    llego: "2026-09-25",
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

const MODELOS = armarModelos(
  [
    // Blusa: Vino S y M, Crudo M; Taller; S/ 89; se vende.
    prenda({ varianteId: "b1", productoId: "blusa", talla: "S" }),
    prenda({ varianteId: "b2", productoId: "blusa", talla: "M" }),
    prenda({ varianteId: "b3", productoId: "blusa", talla: "M", color: "Crudo", colorHex: "#e7d7c1" }), // tema-fijo: dato inventado
    // Saco: Malva M y L; proveedor; S/ 219; 96 días sin venderse.
    ...["M", "L"].map((t, i) =>
      prenda({ varianteId: `s${i}`, productoId: "saco", nombre: "Saco Ensayo", categoria: "Sacos", categoriaPrefijo: "BLZ", talla: t, color: "Malva", colorHex: null, precio: 219, origen: "terceros", vendidas30: 0, diasSinVender: 96, ultimaVenta: "2026-08-17", salioAlPiso: "2026-07-01" }),
    ),
    // Falda: Terracota S; Taller; S/ 99; 72 días sin venderse.
    prenda({ varianteId: "f1", productoId: "falda", nombre: "Falda Ensayo", categoria: "Faldas", categoriaPrefijo: "FAL", talla: "S", color: "Terracota", colorHex: null, precio: 99, vendidas30: 0, diasSinVender: 72, ultimaVenta: "2026-09-10", salioAlPiso: "2026-08-01" }),
  ],
  HOY,
);

const con = (parcial: Partial<FiltrosAnalisis>): FiltrosAnalisis => ({ ...SIN_FILTROS, ...parcial });
const nombres = (f: FiltrosAnalisis) => filtrarModelos(MODELOS, f).map((m) => m.nombre).sort();

describe("filtros de Análisis", () => {
  it("sin filtros pasan todos los modelos", () => {
    expect(nombres(SIN_FILTROS)).toEqual(["Blusa Ensayo", "Falda Ensayo", "Saco Ensayo"]);
    expect(cuantosPuestos(SIN_FILTROS)).toBe(0);
  });

  it("talla y color miran las tallas y colores del modelo, no solo la primera", () => {
    expect(nombres(con({ talla: ["L"] }))).toEqual(["Saco Ensayo"]);
    expect(nombres(con({ color: ["Crudo"] }))).toEqual(["Blusa Ensayo"]);
  });

  it("dentro de un filtro basta una opción; entre filtros, todas", () => {
    expect(nombres(con({ tipo: ["Sacos", "Faldas"] }))).toEqual(["Falda Ensayo", "Saco Ensayo"]);
    expect(nombres(con({ tipo: ["Sacos", "Faldas"], origen: ["taller"] }))).toEqual(["Falda Ensayo"]);
  });

  it("precio por tramos y días sin venderse por meses", () => {
    expect(nombres(con({ precio: ["mas150"] }))).toEqual(["Saco Ensayo"]);
    expect(nombres(con({ precio: ["81a150"] }))).toEqual(["Blusa Ensayo", "Falda Ensayo"]);
    expect(nombres(con({ quieta: ["2a3"] }))).toEqual(["Falda Ensayo"]);
    expect(nombres(con({ quieta: ["mas3"] }))).toEqual(["Saco Ensayo"]);
    expect(nombres(con({ quieta: ["1a2"] }))).toEqual([]);
  });

  it("lo buscado encuentra por nombre, tipo, color o talla, sin tildes", () => {
    expect(nombres(con({ q: "terracota" }))).toEqual(["Falda Ensayo"]);
    expect(nombres(con({ q: "SACOS" }))).toEqual(["Saco Ensayo"]);
    expect(cuantosPuestos(con({ q: "  " }))).toBe(0);
  });

  it("cada opción cuenta sin su propio filtro, con los demás puestos", () => {
    const f = con({ talla: ["M"], origen: ["taller"] });
    // Talla se cuenta sin el filtro de talla, pero con «Taller»: la Blusa (S, M) y la Falda (S).
    const tallas = Object.fromEntries(opcionesDe(MODELOS, f, "talla").map((o) => [o.valor, o.cantidad]));
    expect(tallas).toEqual({ S: 2, M: 1, L: 0 });
    // Viene de se cuenta sin su filtro, pero con «Talla M»: la Blusa (Taller) y el Saco (proveedor).
    expect(opcionesDe(MODELOS, f, "origen").map((o) => o.cantidad)).toEqual([1, 1]);
  });

  it("el color trae su hex si lo tiene", () => {
    const colores = opcionesDe(MODELOS, SIN_FILTROS, "color");
    expect(colores.find((c) => c.valor === "Vino")?.hex).toBe("#7a2e2a"); // tema-fijo: dato inventado
    expect(colores.find((c) => c.valor === "Malva")?.hex).toBeNull();
  });

  it("lo puesto se lista y se quita de a uno", () => {
    const f = con({ q: "x", talla: ["M"], quieta: ["mas3"] });
    expect(cuantosPuestos(f)).toBe(3);
    expect(puestos(f).map((p) => p.texto)).toEqual(["Talla M", "Sin venderse Más de 3 meses"]);
    expect(quitarOpcion(f, "talla", "M").talla).toEqual([]);
    expect(pasaFiltros(MODELOS[0]!, quitarOpcion(con({ talla: ["L"] }), "talla", "L"))).toBe(true);
  });
});
