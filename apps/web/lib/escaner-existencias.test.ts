import { describe, expect, it } from "vitest";
import { consultarExistencias, frasePorTalla, veredictoDeLaTalla, type TallaConsultada, type VarianteConsultable } from "./escaner-existencias";

// Ver las existencias con la cámara de Vender: se lee una etiqueta y se responde cuántas hay de CADA color y talla de esa
// prenda, en el piso y en el almacén. No decide nada del ticket.

let n = 0;
function v(p: Partial<VarianteConsultable> & { referencia: string; talla: string; color: string }): VarianteConsultable {
  n += 1;
  return {
    varianteId: `var-${n}`,
    sku: `SKU-${n}`,
    codigosBarras: [],
    colorHex: null,
    precio: 70,
    stockAqui: 0,
    almacenAqui: 0,
    apartadoAqui: 0,
    categoria: "Blusas",
    fotoUrl: null,
    ...p,
  };
}

function catalogo() {
  return [
    v({ referencia: "Blusa Emma", color: "Blanco", talla: "M", sku: "EMM-BLA-M", stockAqui: 2, almacenAqui: 1, colorHex: "#ffffff" }),
    v({ referencia: "Blusa Emma", color: "Blanco", talla: "S", sku: "EMM-BLA-S", stockAqui: 0, almacenAqui: 4 }),
    v({ referencia: "Blusa Emma", color: "Blanco", talla: "L", sku: "EMM-BLA-L", stockAqui: 1, almacenAqui: 0, apartadoAqui: 1 }),
    v({ referencia: "Blusa Emma", color: "Negro", talla: "M", sku: "EMM-NEG-M", stockAqui: 3, almacenAqui: 0, colorHex: "#111111" }),
    v({ referencia: "Blusa Emma", color: "Azul", talla: "M", sku: "EMM-AZU-M", stockAqui: 0, almacenAqui: 0 }),
    v({ referencia: "Pantalón Lía", color: "Negro", talla: "M", sku: "LIA-NEG-M", stockAqui: 9, almacenAqui: 9 }),
  ];
}

describe("consultarExistencias · reconocer la etiqueta", () => {
  it("una etiqueta que no es de ninguna prenda de esta tienda no se inventa nada", () => {
    expect(consultarExistencias("  NO-EXISTE  ", catalogo())).toEqual({ tipo: "no-encontrada", codigo: "NO-EXISTE" });
    expect(consultarExistencias("", catalogo())).toEqual({ tipo: "no-encontrada", codigo: "" });
  });

  it("reconoce por el código de la etiqueta y por un código de barras, como el lector", () => {
    const lista = catalogo();
    lista[1] = { ...lista[1], codigosBarras: ["7750000000012"] };
    expect(consultarExistencias("emm-bla-m", lista).tipo).toBe("prenda");
    const porBarras = consultarExistencias("7750000000012", lista);
    expect(porBarras.tipo).toBe("prenda");
    if (porBarras.tipo === "prenda") expect(porBarras.colores[0].tallas.find((t) => t.leida)?.talla).toBe("S");
  });
});

describe("consultarExistencias · las variaciones de la prenda", () => {
  const r = consultarExistencias("EMM-BLA-M", catalogo());
  if (r.tipo !== "prenda") throw new Error("debía reconocer la prenda");

  it("lleva la categoría de la prenda para dibujar su miniatura sin foto", () => {
    expect(r.categoria).toEqual({ categoria: "Blusas", categoriaPrefijo: null, categoriaFamilia: null });
  });

  it("junta todos los colores de ESA prenda y ninguno de otra", () => {
    expect(r.referencia).toBe("Blusa Emma");
    expect(r.colores.map((c) => c.nombre).sort()).toEqual(["Azul", "Blanco", "Negro"]);
  });

  it("pone primero el color de la etiqueta y los demás por nombre", () => {
    expect(r.colores.map((c) => c.nombre)).toEqual(["Blanco", "Azul", "Negro"]);
    expect(r.colores.map((c) => c.leido)).toEqual([true, false, false]);
  });

  it("ordena las tallas como se leen en tienda (S M L) y marca la que se leyó", () => {
    const blanco = r.colores[0];
    expect(blanco.tallas.map((t) => t.talla)).toEqual(["S", "M", "L"]);
    expect(blanco.tallas.map((t) => t.leida)).toEqual([false, true, false]);
  });

  it("cuenta el piso, el almacén y lo apartado de cada talla", () => {
    const [s, m, l] = r.colores[0].tallas;
    expect([s.piso, s.almacen, s.apartado]).toEqual([0, 4, 0]);
    expect([m.piso, m.almacen, m.apartado]).toEqual([2, 1, 0]);
    expect([l.piso, l.almacen, l.apartado]).toEqual([1, 0, 1]);
  });

  it("suma por color", () => {
    const blanco = r.colores[0];
    expect([blanco.piso, blanco.almacen, blanco.apartado]).toEqual([3, 5, 1]);
    expect(blanco.colorHex).toBe("#ffffff");
  });

  it("un color sin nada en ninguna parte queda apagado; uno con algo solo en el almacén, no", () => {
    expect(r.colores.find((c) => c.nombre === "Azul")?.sinExistencias).toBe(true);
    expect(r.colores.find((c) => c.nombre === "Negro")?.sinExistencias).toBe(false);
    const soloAlmacen = consultarExistencias("X-1", [v({ referencia: "X", color: "Rojo", talla: "S", sku: "X-1", stockAqui: 0, almacenAqui: 2 })]);
    if (soloAlmacen.tipo !== "prenda") throw new Error("debía reconocer la prenda");
    expect(soloAlmacen.colores[0].sinExistencias).toBe(false);
  });
});

describe("consultarExistencias · bordes", () => {
  it("un stock en negativo (venta sin conexión de más) se cuenta como 0", () => {
    const r = consultarExistencias("A-1", [v({ referencia: "A", color: "Rojo", talla: "M", sku: "A-1", stockAqui: -2, almacenAqui: -1, apartadoAqui: -3 })]);
    if (r.tipo !== "prenda") throw new Error("debía reconocer la prenda");
    const t = r.colores[0].tallas[0];
    expect([t.piso, t.almacen, t.apartado]).toEqual([0, 0, 0]);
  });

  it("una sede sin almacén (el Taller) no inventa un almacén en 0: es null", () => {
    const r = consultarExistencias("A-1", [v({ referencia: "A", color: "Rojo", talla: "M", sku: "A-1", stockAqui: 4, almacenAqui: null })]);
    if (r.tipo !== "prenda") throw new Error("debía reconocer la prenda");
    expect(r.separaPiso).toBe(false);
    expect(r.colores[0].almacen).toBeNull();
    expect(r.colores[0].tallas[0].almacen).toBeNull();
  });

  it("una prenda de una sola talla y un solo color responde con esa", () => {
    const r = consultarExistencias("A-1", [v({ referencia: "A", color: "Rojo", talla: "Única", sku: "A-1", stockAqui: 1 })]);
    if (r.tipo !== "prenda") throw new Error("debía reconocer la prenda");
    expect(r.colores).toHaveLength(1);
    expect(r.colores[0].tallas).toHaveLength(1);
  });

  it("no cambia la lista que recibe", () => {
    const lista = catalogo();
    const antes = JSON.stringify(lista);
    consultarExistencias("EMM-BLA-M", lista);
    expect(JSON.stringify(lista)).toBe(antes);
  });
});

describe("veredictoDeLaTalla", () => {
  const t = (piso: number, almacen: number | null, apartado = 0): TallaConsultada => ({ varianteId: "x", talla: "M", piso, almacen, apartado, leida: true });

  it("en piso es verde; el Taller dice «Hay aquí»", () => {
    expect(veredictoDeLaTalla(t(2, 5), true)).toEqual({ tono: "verde", texto: "En piso" });
    expect(veredictoDeLaTalla(t(2, null), false)).toEqual({ tono: "verde", texto: "Hay aquí" });
  });

  it("sin piso pero con almacén no es «agotada»: está por bajar", () => {
    expect(veredictoDeLaTalla(t(0, 3), true)).toEqual({ tono: "ambar", texto: "Solo en almacén" });
  });

  it("solo apartada es informativa, no ámbar", () => {
    expect(veredictoDeLaTalla(t(0, 0, 1), true)).toEqual({ tono: "pizarra", texto: "Apartada" });
  });

  it("sin nada en ninguna parte es agotada", () => {
    expect(veredictoDeLaTalla(t(0, 0), true)).toEqual({ tono: "ambar", texto: "Agotada aquí" });
    expect(veredictoDeLaTalla(t(0, null), false)).toEqual({ tono: "ambar", texto: "Agotada aquí" });
  });
});

describe("frasePorTalla", () => {
  it("dice piso y almacén, y lo apartado solo si hay", () => {
    expect(frasePorTalla({ varianteId: "x", talla: "M", piso: 2, almacen: 1, apartado: 0, leida: false })).toBe("Talla M: 2 en piso, 1 en almacén");
    expect(frasePorTalla({ varianteId: "x", talla: "L", piso: 1, almacen: 0, apartado: 1, leida: false })).toBe("Talla L: 1 en piso, 0 en almacén, 1 apartadas");
    expect(frasePorTalla({ varianteId: "x", talla: "S", piso: 3, almacen: null, apartado: 0, leida: false })).toBe("Talla S: 3 en piso");
  });
});
