import { describe, expect, it } from "vitest";
import { AHORA, TRUJILLO, fila, taller } from "./resumen-fixtures";
import { aplicarAlcance, aplicarVista, bandaSellThrough, leerFiltros, paginar, VISTA_INICIAL } from "./resumen-filtros";
import { analizarSede } from "./resumen-reglas";

const opciones = { ahora: AHORA, hayComparacion: false };

// Una sede pequeña pero variada:
//  · Blusa Camila Blanco L  — agotada con demanda
//  · Blusa Camila Blanco M  — cobertura crítica
//  · Falda Isabella Beige M — venta estable
//  · Vestido Renata Verde S — sin historial
const sede = () =>
  analizarSede(
    [
      fila({ referencia: "Blusa Camila", categoriaId: "c-blusas", categoria: "Blusas", talla: "L", color: "Blanco", sku: "BLU-CAM-BLA-L", piso: 0, almacen: 0, ventas: 60, enRed: [taller()] }),
      fila({ referencia: "Blusa Camila", categoriaId: "c-blusas", categoria: "Blusas", talla: "M", color: "Blanco", sku: "BLU-CAM-BLA-M", piso: 3, almacen: 0, ventas: 60 }),
      fila({ productoId: "p2", referencia: "Falda Isabella", categoriaId: "c-faldas", categoria: "Faldas", talla: "M", color: "Beige", sku: "FAL-ISA-BEI-M", piso: 30, almacen: 20, ventas: 30, stockInicial: 55 }),
      fila({ productoId: "p3", referencia: "Vestido Renata", categoriaId: "c-vestidos", categoria: "Vestidos", talla: "S", color: "Verde", sku: "VES-REN-VER-S", piso: 4, almacen: 8, ventas: 0, diasConStock: 3, diasObservables: 3 }),
    ],
    TRUJILLO,
    opciones,
  );

const skus = (xs: ReturnType<typeof sede>) => xs.map((a) => a.fila.sku);

describe("alcance: categoría y búsqueda", () => {
  it("sin filtros deja todo", () => {
    expect(aplicarAlcance(sede(), { q: "", categoriaId: null })).toHaveLength(4);
  });

  it("por categoría", () => {
    expect(skus(aplicarAlcance(sede(), { q: "", categoriaId: "c-faldas" }))).toEqual(["FAL-ISA-BEI-M"]);
  });

  it("por búsqueda con varias condiciones: «blusa blanca L»", () => {
    expect(skus(aplicarAlcance(sede(), { q: "blusa blanca L", categoriaId: null }))).toEqual(["BLU-CAM-BLA-L"]);
  });

  it("categoría y búsqueda se combinan con «y»", () => {
    expect(aplicarAlcance(sede(), { q: "camila", categoriaId: "c-faldas" })).toEqual([]);
    expect(skus(aplicarAlcance(sede(), { q: "camila", categoriaId: "c-blusas" }))).toHaveLength(2);
  });

  it("por código", () => {
    expect(skus(aplicarAlcance(sede(), { q: "fal-isa", categoriaId: null }))).toEqual(["FAL-ISA-BEI-M"]);
  });
});

describe("vista: cobertura, sell-through, estado y orden", () => {
  it("por estado: «agotada con demanda» y «con acción sugerida»", () => {
    expect(skus(aplicarVista(sede(), { ...VISTA_INICIAL, estado: "agotada_demanda" }))).toEqual(["BLU-CAM-BLA-L"]);
    const conAccion = aplicarVista(sede(), { ...VISTA_INICIAL, estado: "con_accion" });
    expect(conAccion.every((a) => a.plan.principal !== null)).toBe(true);
    expect(skus(conAccion)).toContain("BLU-CAM-BLA-L");
    expect(skus(conAccion)).not.toContain("FAL-ISA-BEI-M");
  });

  it("por banda de cobertura", () => {
    expect(skus(aplicarVista(sede(), { ...VISTA_INICIAL, cobertura: "agotado" }))).toEqual(["BLU-CAM-BLA-L"]);
    expect(skus(aplicarVista(sede(), { ...VISTA_INICIAL, cobertura: "sin_historial" }))).toEqual(["VES-REN-VER-S"]);
  });

  it("por sell-through: los cortes son 60 % y 20 %", () => {
    expect(bandaSellThrough(null)).toBe("sin_dato");
    expect(bandaSellThrough(60)).toBe("alto");
    expect(bandaSellThrough(59.9)).toBe("medio");
    expect(bandaSellThrough(19.9)).toBe("bajo");
    const conDato = aplicarVista(sede(), { ...VISTA_INICIAL, sellThrough: "sin_dato" });
    expect(conDato.every((a) => a.sellThrough === null)).toBe(true);
  });

  it("los filtros de vista se combinan entre sí y con el alcance", () => {
    const blusas = aplicarAlcance(sede(), { q: "", categoriaId: "c-blusas" });
    expect(skus(aplicarVista(blusas, { ...VISTA_INICIAL, estado: "cobertura_critica" }))).toEqual(["BLU-CAM-BLA-M"]);
    expect(aplicarVista(blusas, { ...VISTA_INICIAL, estado: "cobertura_critica", cobertura: "agotado" })).toEqual([]);
  });

  it("orden por velocidad, por vendido y por cobertura", () => {
    expect(aplicarVista(sede(), { ...VISTA_INICIAL, orden: "velocidad" })[0].fila.sku).toMatch(/BLU-CAM-BLA-[LM]/);
    expect(aplicarVista(sede(), { ...VISTA_INICIAL, orden: "vendido" }).map((a) => a.velocidad.ventasNetas)).toEqual([60, 60, 30, 0]);
    expect(aplicarVista(sede(), { ...VISTA_INICIAL, orden: "cobertura" })[0].fila.sku).toBe("BLU-CAM-BLA-L");
  });

  it("la prioridad por defecto pone lo urgente primero", () => {
    expect(skus(aplicarVista(sede(), VISTA_INICIAL)).slice(0, 2)).toEqual(["BLU-CAM-BLA-L", "BLU-CAM-BLA-M"]);
  });
});

describe("paginar", () => {
  it("parte en páginas y corrige una página fuera de rango", () => {
    const xs = Array.from({ length: 23 }, (_, i) => i);
    expect(paginar(xs, 1, 10)).toMatchObject({ pagina: 1, paginas: 3, total: 23 });
    expect(paginar(xs, 3, 10).items).toEqual([20, 21, 22]);
    expect(paginar(xs, 99, 10).pagina).toBe(3);
    expect(paginar(xs, -4, 10).pagina).toBe(1);
    expect(paginar([], 1, 10)).toMatchObject({ items: [], paginas: 1, total: 0 });
  });
});

describe("leer los filtros de la URL", () => {
  it("lee valores válidos", () => {
    const f = leerFiltros({ q: "blusa blanca", cat: "c-blusas", cob: "critica", st: "bajo", est: "agotada_demanda", orden: "velocidad", pag: "3" });
    expect(f.alcance).toEqual({ q: "blusa blanca", categoriaId: "c-blusas" });
    expect(f.vista).toEqual({ cobertura: "critica", sellThrough: "bajo", estado: "agotada_demanda", orden: "velocidad" });
    expect(f.pagina).toBe(3);
  });

  it("ignora en silencio lo que no reconoce: una URL inventada nunca rompe la pantalla", () => {
    const f = leerFiltros({ cob: "cualquiera", st: "x", est: "hackeo", orden: "??", pag: "abc" });
    expect(f.vista).toEqual(VISTA_INICIAL);
    expect(f.pagina).toBe(1);
    expect(f.alcance).toEqual({ q: "", categoriaId: null });
  });

  it("toma el primer valor si un parámetro viene repetido y recorta una búsqueda absurda", () => {
    expect(leerFiltros({ est: ["curva_rota", "agotada"] }).vista.estado).toBe("curva_rota");
    expect(leerFiltros({ q: "x".repeat(500) }).alcance.q).toHaveLength(120);
  });
});
