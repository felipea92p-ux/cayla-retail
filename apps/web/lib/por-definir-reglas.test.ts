import { describe, expect, it } from "vitest";
import { camposDefinir, definirParaBase, detalleDelModelo, faltasDelModelo, gananciaDefinida, leerPorDefinir, textoAvisoPorDefinir, type ModeloPorDefinir } from "./por-definir-reglas";

// ADR-0660 (Felipe 2026-11-13): «Hay que crear esa opción de por definir y un aviso en pantalla. Ejemplo: 3 productos a la espera de definir categoría».

const M = (o: Partial<ModeloPorDefinir> = {}): ModeloPorDefinir => ({
  ids: ["l1"],
  papelId: "p1",
  nombre: "Modelo Nela",
  cantidad: 12,
  costo: 25,
  categoriaPorDefinir: true,
  precioPorDefinir: false,
  categoriaId: null,
  categoria: null,
  marca: null,
  admitePrecioCero: false,
  proveedor: "Proveedor de ejemplo",
  compradora: "Ana Pérez",
  mia: false,
  tiendas: ["Tienda Lima"],
  enCamino: false,
  fecha: "2026-11-13",
  ...o,
});
const PERSONA: { esPersona: boolean; listo: boolean; motivo: string | null } = { esPersona: true, listo: true, motivo: null };

describe("leer lo que espera", () => {
  it("lee cada modelo y descarta lo que no se entiende o no espera nada", () => {
    const filas = leerPorDefinir([
      { ids: ["a", "b"], papel_id: "p", nombre: "Modelo Nela", cantidad: 12, costo: "25.00", categoria_por_definir: true, precio_por_definir: true, proveedor: "X", compradora: "Ana", mia: true, tiendas: ["Tienda Lima", "Tienda Trujillo"], en_camino: true },
      { ids: [], papel_id: "p", nombre: "Sin líneas", categoria_por_definir: true },
      { ids: ["c"], papel_id: "p", nombre: "Ya definida", categoria_por_definir: false, precio_por_definir: false },
      "basura",
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ ids: ["a", "b"], costo: 25, categoriaPorDefinir: true, precioPorDefinir: true, mia: true, enCamino: true });
    expect(leerPorDefinir(null)).toEqual([]);
  });
});

describe("el aviso", () => {
  it("cuenta modelos, en las palabras de Felipe; sin nada, no hay aviso", () => {
    expect(textoAvisoPorDefinir([])).toBeNull();
    expect(textoAvisoPorDefinir([M(), M(), M()])).toEqual({ titulo: "3 prendas a la espera de definir categoría", detalle: null });
    expect(textoAvisoPorDefinir([M()])?.titulo).toBe("1 prenda a la espera de definir categoría");
    expect(textoAvisoPorDefinir([M({ categoriaPorDefinir: false, precioPorDefinir: true })])).toEqual({ titulo: "1 prenda a la espera de precio sugerido", detalle: null });
  });
  it("si además esperan su precio, lo dice sin contarlas dos veces", () => {
    expect(textoAvisoPorDefinir([M({ precioPorDefinir: true }), M({ precioPorDefinir: true })])?.detalle).toBe("también esperan su precio");
    expect(textoAvisoPorDefinir([M({ precioPorDefinir: true }), M()])?.detalle).toBe("1 también espera su precio");
    expect(textoAvisoPorDefinir([M(), M({ categoriaPorDefinir: false, precioPorDefinir: true })])?.detalle).toBe("1 prenda más espera solo su precio");
  });
  it("la fila dice qué falta y de quién es; a la compradora no se la nombra en lo suyo", () => {
    expect(faltasDelModelo(M({ precioPorDefinir: true }))).toEqual(["Sin categoría", "Sin precio"]);
    expect(detalleDelModelo(M({ tiendas: ["Tienda Lima", "Tienda Trujillo"] }))).toBe("Proveedor de ejemplo · lo compró Ana · va a Lima y Trujillo");
    expect(detalleDelModelo(M({ mia: true, enCamino: true }))).toBe("Proveedor de ejemplo · en camino a Lima");
  });
});

describe("la hoja «Definir»", () => {
  it("con las dos cosas por definir basta una; un precio que no sirve frena; desde una terminal falta quién", () => {
    const m = M({ precioPorDefinir: true });
    const hecho = (b: { categoriaId: string | null; precio: string }, r = PERSONA) => camposDefinir(m, b, false, r).every((c) => !c.requerido || c.hecho);
    expect(hecho({ categoriaId: null, precio: "" })).toBe(false);
    expect(hecho({ categoriaId: "polos", precio: "" })).toBe(true);
    expect(hecho({ categoriaId: null, precio: "49.90" })).toBe(true);
    expect(hecho({ categoriaId: "polos", precio: "0" })).toBe(false);
    expect(hecho({ categoriaId: "polos", precio: "" }, { esPersona: false, listo: false, motivo: "Elige quién" })).toBe(false);
  });
  it("con una sola por definir, esa es la que falta", () => {
    const soloPrecio = M({ categoriaPorDefinir: false, precioPorDefinir: true, categoriaId: "polos" });
    expect(camposDefinir(soloPrecio, { categoriaId: "otra", precio: "" }, false, PERSONA)[0].hecho).toBe(false);
    expect(camposDefinir(soloPrecio, { categoriaId: null, precio: "39" }, false, PERSONA)[0].hecho).toBe(true);
  });
  it("a la base va solo lo definido; lo vacío sigue esperando; el 0 solo donde la categoría lo admite", () => {
    const m = M({ ids: ["a", "b"], precioPorDefinir: true });
    expect(definirParaBase(m, { categoriaId: "polos", precio: "" }, false)).toEqual({ p_item_ids: ["a", "b"], p_categoria_id: "polos", p_precio_venta: null });
    expect(definirParaBase(m, { categoriaId: null, precio: "49.9" }, false)).toEqual({ p_item_ids: ["a", "b"], p_categoria_id: null, p_precio_venta: 49.9 });
    expect(definirParaBase(m, { categoriaId: null, precio: "" }, false)).toBeNull();
    expect(definirParaBase(m, { categoriaId: "bolsas", precio: "0" }, true)?.p_precio_venta).toBe(0);
    // Lo que ya tiene no se manda aunque venga escrito.
    expect(definirParaBase(M(), { categoriaId: "polos", precio: "30" }, false)?.p_precio_venta).toBeNull();
  });
  it("la ganancia por prenda, si se leen costo y precio", () => {
    expect(gananciaDefinida(25, "49.90", false)).toBe(24.9);
    expect(gananciaDefinida(null, "49.90", false)).toBeNull();
    expect(gananciaDefinida(25, "", false)).toBeNull();
  });
});
