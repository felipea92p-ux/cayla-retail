import { describe, expect, it } from "vitest";
import { ELECCIONES_VACIAS, type PlanFusion, type ProductoPlan, type VariantePlan } from "./fusionar-productos-reglas";
import {
  celdaDe,
  escalaDeStock,
  fichaFinal,
  fraseDeLaMatriz,
  matrizFinal,
  ordenFijo,
  sedesAComparar,
  stockPorSede,
  tallasDeFicha,
  type DetalleFusion,
} from "./fusionar-productos-ficha";

// El caso de Felipe (2026-11-12): una capa de dos piezas registrada como blusa. «Blusa Emma» queda; «Capa Emma» se fusiona en ella.
// Negro M y L ya existen en la blusa (se juntan); Blanco M no (pasa).

const producto = (id: string, extra: Partial<ProductoPlan> = {}): ProductoPlan => ({
  id,
  queda: false,
  referencia: id,
  codigo: `C-${id}`,
  version: 1,
  estado: "activo",
  creadoEn: "2026-10-01T00:00:00Z",
  descripcion: null,
  temporada: null,
  categoria: { id: "blusas", nombre: "Blusas", prefijo: "BL", familia: "superior" },
  marca: { id: "m", nombre: "CAYLA" },
  proveedor: { id: "pr", nombre: "Taller" },
  tejido: { id: null, nombre: null },
  patron: { id: null, nombre: null },
  unidadesVendidas: 0,
  tickets: 0,
  ultimaVenta: null,
  stock: 0,
  variantes: 0,
  precio: 89.9,
  precios: [89.9],
  costo: 35,
  costoDeCompras: false,
  fotos: [],
  ...extra,
});

const variantePlan = (v: Partial<VariantePlan> & Pick<VariantePlan, "varianteId" | "productoId">): VariantePlan => ({
  talla: "M",
  colorCodigo: "NEG",
  color: "Negro",
  colorHex: "#111111",
  activa: true,
  stock: 0,
  trato: "muda",
  conVarianteId: null,
  ...v,
});

const blusa = producto("blusa", {
  referencia: "Blusa Emma",
  queda: true,
  unidadesVendidas: 12,
  stock: 7,
  fotos: [{ id: "f1", url: "/negra.png", colorCodigo: "NEG", esPrincipal: true }],
});
const capa = producto("capa", {
  referencia: "Capa Emma",
  categoria: { id: "casacas", nombre: "Casacas", prefijo: "CA", familia: "abrigo" },
  unidadesVendidas: 2,
  stock: 6,
  fotos: [{ id: "f2", url: "/capa.png", colorCodigo: "NEG", esPrincipal: true }],
});

const plan: Pick<PlanFusion, "productos" | "variantes" | "diferencias"> = {
  productos: [blusa, capa],
  diferencias: ["referencia", "categoria"],
  variantes: [
    variantePlan({ varianteId: "c-neg-m", productoId: "capa", stock: 2, trato: "junta", conVarianteId: "b-neg-m" }),
    variantePlan({ varianteId: "c-neg-l", productoId: "capa", talla: "L", stock: 1, trato: "junta", conVarianteId: "b-neg-l" }),
    variantePlan({ varianteId: "c-bla-m", productoId: "capa", colorCodigo: "BLA", color: "Blanco", colorHex: "#fff", stock: 3 }),
    variantePlan({ varianteId: "c-neg-xl", productoId: "capa", talla: "XL", activa: false, stock: 0 }),
  ],
};

const detalle: DetalleFusion = {
  variantes: [
    { varianteId: "b-neg-s", productoId: "blusa", colorCodigo: "NEG", color: "Negro", colorHex: "#111111", talla: "S", vigente: true },
    { varianteId: "b-neg-m", productoId: "blusa", colorCodigo: "NEG", color: "Negro", colorHex: "#111111", talla: "M", vigente: true },
    { varianteId: "b-neg-l", productoId: "blusa", colorCodigo: "NEG", color: "Negro", colorHex: "#111111", talla: "L", vigente: true },
    { varianteId: "b-bei-xs", productoId: "blusa", colorCodigo: "BEI", color: "Beige", colorHex: null, talla: "XS", vigente: false },
    { varianteId: "c-neg-m", productoId: "capa", colorCodigo: "NEG", color: "Negro", colorHex: "#111111", talla: "M", vigente: true },
    { varianteId: "c-neg-l", productoId: "capa", colorCodigo: "NEG", color: "Negro", colorHex: "#111111", talla: "L", vigente: true },
    { varianteId: "c-bla-m", productoId: "capa", colorCodigo: "BLA", color: "Blanco", colorHex: "#fff", talla: "M", vigente: true },
  ],
  existencias: [
    { varianteId: "b-neg-s", ubicacionId: "lim", fisico: 1, apartado: 0, danado: 0, almacen: 0 },
    { varianteId: "b-neg-m", ubicacionId: "tru", fisico: 4, apartado: 1, danado: 0, almacen: 2 },
    { varianteId: "b-neg-l", ubicacionId: "tru", fisico: 2, apartado: 0, danado: 1, almacen: 0 },
    { varianteId: "c-neg-m", ubicacionId: "tru", fisico: 2, apartado: 0, danado: 0, almacen: 0 },
    { varianteId: "c-neg-l", ubicacionId: "tru", fisico: 1, apartado: 0, danado: 0, almacen: 0 },
    { varianteId: "c-bla-m", ubicacionId: "lim", fisico: 3, apartado: 0, danado: 0, almacen: 3 },
  ],
  sedes: [
    { id: "tal", nombre: "Taller", tipo: "taller" },
    { id: "lim", nombre: "Tienda Lima", tipo: "tienda" },
    { id: "tru", nombre: "Tienda Trujillo", tipo: "tienda" },
    { id: "aqp", nombre: "Tienda Arequipa", tipo: "tienda" },
  ],
};

describe("el orden de las fichas no cambia al elegir (decisión 3)", () => {
  it("sigue el orden en que se agregaron, aunque el plan ponga primero al que queda", () => {
    expect(ordenFijo(["capa", "blusa"], [blusa, capa]).map((p) => p.id)).toEqual(["capa", "blusa"]);
    expect(ordenFijo(["blusa", "capa"], [capa, blusa]).map((p) => p.id)).toEqual(["blusa", "capa"]);
  });

  it("una ficha que el plan trae y la hoja no conoce va al final", () => {
    expect(ordenFijo(["capa"], [producto("x"), capa]).map((p) => p.id)).toEqual(["capa", "x"]);
  });
});

describe("stock por sede (hoja de comparar)", () => {
  it("compara solo las sedes con stock de alguna ficha, tiendas por nombre y el Taller al final", () => {
    expect(sedesAComparar(detalle).map((s) => s.id)).toEqual(["lim", "tru"]);
  });

  it("cada ficha dice su stock en la misma lista de sedes, con cero donde no tiene", () => {
    const sedes = sedesAComparar(detalle);
    expect(stockPorSede("blusa", detalle, sedes)).toEqual([
      { ubicacionId: "lim", sede: "Tienda Lima", total: 1, detalle: null },
      { ubicacionId: "tru", sede: "Tienda Trujillo", total: 6, detalle: "2 en almacén · 1 apartada · 1 dañada" },
    ]);
    expect(stockPorSede("capa", detalle, sedes).map((s) => s.total)).toEqual([3, 3]);
  });

  it("la escala es la mayor sede de todas las fichas, nunca cero", () => {
    const sedes = sedesAComparar(detalle);
    expect(escalaDeStock([stockPorSede("blusa", detalle, sedes), stockPorSede("capa", detalle, sedes)])).toBe(6);
    expect(escalaDeStock([])).toBe(1);
  });
});

describe("tallas de cada ficha", () => {
  it("solo las vigentes, color por color (por nombre) y en orden de talla", () => {
    expect(tallasDeFicha("blusa", detalle).colores).toEqual([{ color: "Negro", colorHex: "#111111", tallas: ["S", "M", "L"] }]);
    expect(tallasDeFicha("capa", detalle).colores.map((c) => c.color)).toEqual(["Blanco", "Negro"]);
  });
});

describe("la matriz de la ficha final (decisión 7)", () => {
  const m = matrizFinal(plan, "blusa", detalle);

  it("lo que ya estaba, lo que pasa y lo que se junta, con el stock que llega del plan", () => {
    expect(celdaDe(m, "NEG", "S")).toEqual({ estado: "ya", antes: 1, llega: 0 });
    expect(celdaDe(m, "NEG", "M")).toEqual({ estado: "junta", antes: 4, llega: 2 });
    expect(celdaDe(m, "NEG", "L")).toEqual({ estado: "junta", antes: 2, llega: 1 });
    expect(celdaDe(m, "BLA", "M")).toEqual({ estado: "pasa", antes: 0, llega: 3 });
    expect(celdaDe(m, "BLA", "S")).toBeNull();
    expect(m.cuenta).toEqual({ ya: 1, pasa: 1, junta: 2 });
  });

  it("no dibuja tallas retiradas (ni de la que queda ni de la repetida) y ordena los colores por nombre", () => {
    expect(m.tallas).toEqual(["S", "M", "L"]);
    expect(m.colores.map((c) => c.clave)).toEqual(["BLA", "NEG"]);
  });

  it("dos repetidas con la misma talla nueva: la celda pasa y suma lo de las dos", () => {
    const dos = matrizFinal(
      {
        variantes: [
          variantePlan({ varianteId: "a", productoId: "capa", colorCodigo: "ROJ", color: "Rojo", stock: 2 }),
          variantePlan({ varianteId: "b", productoId: "otra", colorCodigo: "ROJ", color: "Rojo", stock: 1, trato: "junta", conVarianteId: "a" }),
        ],
      },
      "blusa",
      detalle,
    );
    expect(celdaDe(dos, "ROJ", "M")).toEqual({ estado: "pasa", antes: 0, llega: 3 });
  });

  it("la frase dice cuántas pasan y cuántas se juntan, en palabras de tienda", () => {
    expect(fraseDeLaMatriz(m)).toBe("1 talla pasa tal cual · 2 tallas se juntan (+3 prendas).");
    expect(fraseDeLaMatriz(matrizFinal({ variantes: [] }, "blusa", detalle))).toBeNull();
  });
});

describe("«Así va a quedar»", () => {
  it("sin elegir nada, es la que queda con las ventas y el stock de todas", () => {
    const f = fichaFinal(plan, "blusa", ELECCIONES_VACIAS, ["f1", "f2"]);
    expect(f?.referencia).toBe("Blusa Emma");
    expect(f?.referenciaDeOtra).toBe(false);
    expect(f?.unidadesVendidas).toBe(14);
    expect(f?.stock).toBe(13);
    expect(f?.fotoUrl).toBe("/negra.png");
    expect(f?.datos.find((d) => d.campo === "categoria")).toEqual({ campo: "categoria", valor: "Blusas", deOtra: false });
  });

  it("lo elegido de otra ficha cambia el dato y queda marcado", () => {
    const f = fichaFinal(plan, "blusa", { ...ELECCIONES_VACIAS, campos: { categoria: "capa", referencia: "capa" } }, ["f2"]);
    expect(f?.referencia).toBe("Capa Emma");
    expect(f?.referenciaDeOtra).toBe(true);
    expect(f?.categoria.nombre).toBe("Casacas");
    expect(f?.datos.find((d) => d.campo === "categoria")).toEqual({ campo: "categoria", valor: "Casacas", deOtra: true });
    expect(f?.fotoUrl).toBe("/capa.png");
  });

  it("un campo que no difiere no se toma de otra, aunque la elección lo pida", () => {
    const f = fichaFinal(plan, "blusa", { ...ELECCIONES_VACIAS, campos: { tejido: "capa" } }, []);
    expect(f?.datos.find((d) => d.campo === "tejido")?.deOtra).toBe(false);
  });

  it("elegir la otra como la que queda cambia todo a ella", () => {
    const f = fichaFinal(plan, "capa", ELECCIONES_VACIAS, []);
    expect(f?.referencia).toBe("Capa Emma");
    expect(f?.codigo).toBe("C-capa");
  });

  it("sin el costo a la vista (la base no lo manda), la ficha no lo dice", () => {
    const sinCosto = { ...plan, productos: plan.productos.map((p) => ({ ...p, costo: null })) };
    expect(fichaFinal(sinCosto, "blusa", ELECCIONES_VACIAS, [])?.datos.map((d) => d.campo)).not.toContain("costo");
  });

  it("una ficha que no está en el plan no arma nada", () => {
    expect(fichaFinal(plan, "nadie", ELECCIONES_VACIAS, [])).toBeNull();
  });
});
