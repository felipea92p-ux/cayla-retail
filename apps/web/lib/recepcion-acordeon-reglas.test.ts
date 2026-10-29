import { describe, expect, it } from "vitest";
import { prendasDelAcordeon, resumenDeCategoria } from "./recepcion-acordeon-reglas";
import { agruparLineas } from "./recepcion-grupos-reglas";
import { leerConteosDelEnvio, type LineaParaContar, type Separado } from "./recepcion-conteo-reglas";
import type { LineaEnvio } from "./recepcion-envio-reglas";

const VESTIDOS = { id: "c-vestidos", nombre: "Vestidos", prefijo: "VES", familia: "vestidos" };
const CAYLA = { id: "m-cayla", nombre: "CAYLA" };
const PROV = { id: "p1", nombre: "Confecciones del Sur" };

const linea = (id: string, enviado: number, extra: Partial<LineaEnvio> = {}): LineaEnvio => ({
  id,
  orden: { id: "o1", numero: "OC-000001" },
  posicion: 1,
  proveedor: PROV,
  categoria: VESTIDOS,
  marca: CAYLA,
  descripcion: null,
  enviado,
  costoUnitario: 30,
  compraItemId: null,
  precioVentaSugerido: null,
  prendaElegida: null,
  ...extra,
});

function deLaGuia(l: LineaEnvio, c: { contadas: number; separado: Separado | Record<string, unknown> } | null = null): LineaParaContar {
  const conteo = c
    ? (leerConteosDelEnvio({
        despacho_id: "d1",
        conteos: [{ despacho_item_id: l.id, contadas: c.contadas, separado: c.separado, en_stock: 0, version: 1, contado_por: { id: "per1", nombre: "Mariana" }, pendientes: [] }],
      })?.conteos[0] ?? null)
    : null;
  return { clave: `item:${l.id}`, linea: l, conteo, categoria: l.categoria, marca: l.marca, proveedor: l.proveedor, dijeron: l.enviado };
}

const sofia = () => linea("l-sofia", 5, { descripcion: "Vestido Sofía", prendaElegida: { productoId: "p-sofia", nombre: "Vestido Sofía", codigo: "VES-1" } });
const lima = () => linea("l-lima", 7, { descripcion: "Vestido Lima" });
const prendaSep = (productoId: string, nombre: string, cantidad: number) => ({ producto_id: productoId, nombre, cantidad, variantes: null });

describe("prendasDelAcordeon", () => {
  it("lista las anotadas al comprar, con cuántas eran, aunque nada esté contado", () => {
    const [g] = agruparLineas([deLaGuia(sofia()), deLaGuia(lima())]);
    expect(prendasDelAcordeon(g)).toEqual([
      { clave: "p-sofia", nombre: "Vestido Sofía", esperadas: 5, identificadas: 0, estado: "por-identificar" },
      { clave: "nombre:vestido lima", nombre: "Vestido Lima", esperadas: 7, identificadas: 0, estado: "por-identificar" },
    ]);
  });

  it("cuenta lo identificado de cada una: del catálogo por su prenda, la anotada por nombre por su descripción", () => {
    const [g] = agruparLineas([
      deLaGuia(sofia(), { contadas: 5, separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 5)], nuevas: [] } }),
      deLaGuia(lima(), { contadas: 7, separado: { prendas: [], nuevas: [{ cantidad: 3, descripcion: "vestido  LIMA" }] } }),
    ]);
    const filas = prendasDelAcordeon(g);
    expect(filas.map((f) => [f.nombre, f.identificadas, f.estado])).toEqual([
      ["Vestido Sofía", 5, "lista"],
      ["Vestido Lima", 3, "a-medias"],
    ]);
  });

  it("suma al final lo que se separó y no estaba anotado, sin repetir las anotadas", () => {
    const [g] = agruparLineas([
      deLaGuia(sofia(), {
        contadas: 9,
        separado: { prendas: [prendaSep("p-sofia", "Vestido Sofía", 2), prendaSep("p-otro", "Vestido Otro", 4)], nuevas: [{ cantidad: 3, descripcion: "Vestido rojo" }, { cantidad: 1, descripcion: null }] },
      }),
    ]);
    expect(prendasDelAcordeon(g).map((f) => [f.nombre, f.esperadas, f.identificadas, f.estado])).toEqual([
      ["Vestido Sofía", 5, 2, "a-medias"],
      ["Vestido Otro", null, 4, "fuera"],
      ["Vestido rojo", null, 3, "fuera"],
    ]);
  });

  it("sin nada anotado ni separado, la lista está vacía", () => {
    const [g] = agruparLineas([deLaGuia(linea("l-x", 4))]);
    expect(prendasDelAcordeon(g)).toEqual([]);
  });
});

describe("resumenDeCategoria", () => {
  it("dice cuánto se contó contra lo que dijeron y cuántas prendas tiene", () => {
    const [sinContar] = agruparLineas([deLaGuia(sofia())]);
    expect(resumenDeCategoria(sinContar, 1)).toBe("sin contar · 1 prenda");
    const [contada] = agruparLineas([deLaGuia(sofia(), { contadas: 3, separado: { prendas: [], nuevas: [] } })]);
    expect(resumenDeCategoria(contada, 2)).toBe("3 de 5 contadas · 2 prendas");
    expect(resumenDeCategoria(contada, 0)).toBe("3 de 5 contadas");
  });
});
