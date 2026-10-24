import { describe, expect, it } from "vitest";
import { crearIndiceBusquedaEspecial } from "./filtro-busqueda-especial";
import { clavePercha } from "./inventario-reglas";
import { detalleDelModelo, modelosParaAjustar } from "./existencias-buscar-ajuste";

type Fila = {
  varianteId: string;
  productoId: string;
  referencia: string;
  sku: string;
  color: string | null;
  talla: string | null;
  pisoDisponible: number | null;
  almacenDisponible: number | null;
  disponible: number;
};

const fila = (o: Partial<Fila> & Pick<Fila, "varianteId" | "productoId" | "referencia">): Fila => ({
  sku: o.varianteId.toUpperCase(),
  color: "Negro",
  talla: "M",
  pisoDisponible: 1,
  almacenDisponible: 2,
  disponible: 3,
  ...o,
});

const filas: Fila[] = [
  fila({ varianteId: "emma-negro-s", productoId: "emma", referencia: "Blusa Emma", talla: "S", sku: "BLU-0001-NEG-S" }),
  fila({ varianteId: "emma-negro-m", productoId: "emma", referencia: "Blusa Emma", talla: "M", sku: "BLU-0001-NEG-M" }),
  fila({ varianteId: "emma-beige-m", productoId: "emma", referencia: "Blusa Emma", color: "Beige", sku: "BLU-0001-BEI-M", pisoDisponible: 0, almacenDisponible: 6, disponible: 6 }),
  fila({ varianteId: "ivana-blanco-s", productoId: "ivana", referencia: "Blusa Ivana", color: "Blanco", talla: "S", sku: "BLU-0003-BLA-S" }),
  fila({ varianteId: "olivia-m", productoId: "olivia", referencia: "Pantalón Olivia", sku: "PAN-0008-NEG-M" }),
];
const indice = crearIndiceBusquedaEspecial(filas, (f) => ({ nombre: f.referencia, sku: f.sku, codigosBarras: [], color: f.color, talla: f.talla }));

describe("el buscador de «Ajustar stock» de la cabecera", () => {
  it("sin nada escrito no lista nada (la hoja pide escribir)", () => {
    expect(modelosParaAjustar(indice, "   ")).toEqual([]);
  });

  it("lista un modelo por producto, aunque coincidan varias tallas y colores", () => {
    const r = modelosParaAjustar(indice, "blusa");
    expect(r.map((m) => m.referencia)).toEqual(["Blusa Emma", "Blusa Ivana"]);
    expect(r[0]!.colores).toBe(2);
  });

  it("con un nombre, entra en la primera talla de la curva (S antes que M), aunque la lista venga por código", () => {
    const desordenado = crearIndiceBusquedaEspecial([filas[1]!, filas[0]!], (f) => ({ nombre: f.referencia, sku: f.sku, codigosBarras: [], color: f.color, talla: f.talla }));
    expect(modelosParaAjustar(desordenado, "emma")[0]!.varianteId).toBe("emma-negro-s");
  });

  it("con un código, entra exactamente en esa talla y ese color", () => {
    const [m] = modelosParaAjustar(indice, "BLU-0001-BEI-M");
    expect(m!.varianteId).toBe("emma-beige-m");
    expect(m!.clave).toBe(clavePercha({ productoId: "emma", color: "Beige" }));
  });

  it("suma lo libre del modelo entero en la sede", () => {
    const [m] = modelosParaAjustar(indice, "emma");
    expect([m!.piso, m!.almacen, m!.disponible]).toEqual([2, 10, 12]);
    expect(detalleDelModelo(m!)).toBe("2 colores · 2 en piso · 10 en almacén");
  });

  it("donde no se separan piso y almacén (el Taller), dice lo de la sede", () => {
    expect(detalleDelModelo({ colores: 1, piso: null, almacen: null, disponible: 8 })).toBe("1 color · 8 en la sede");
  });

  it("tiene tope", () => {
    expect(modelosParaAjustar(indice, "blusa", 1)).toHaveLength(1);
  });
});
