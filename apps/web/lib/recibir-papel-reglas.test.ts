import { describe, expect, it } from "vitest";
import { avanceDeAnotadas, estadoAnotada, lineasAnotadas, nombreAnotado, siguienteAnotada } from "./recibir-papel-reglas";
import type { LineaParaContar } from "./recepcion-conteo-reglas";

const linea = (clave: string, dijeron: number, contadas: number | null, extra: Partial<NonNullable<LineaParaContar["linea"]>> = {}): LineaParaContar =>
  ({
    clave,
    dijeron,
    categoria: { id: "c", nombre: "Blusas", prefijo: "BL", familia: null },
    marca: null,
    proveedor: null,
    linea: { id: clave, compraItemId: `ci-${clave}`, descripcion: null, prendaElegida: null, enviado: dijeron, ...extra },
    conteo: contadas === null ? null : { contadas },
  }) as unknown as LineaParaContar;

describe("recibir mirando el papel", () => {
  it("lo anotado es la guía del envío; lo que la tienda agrega fuera de la guía no", () => {
    const fuera = { ...linea("x", 0, 2), linea: null, dijeron: null } as LineaParaContar;
    expect(lineasAnotadas([linea("a", 12, null), fuera, linea("y", 3, null, { compraItemId: null })]).map((l) => l.clave)).toEqual(["a", "y"]);
  });
  it("cada una dice cómo va", () => {
    expect(estadoAnotada(linea("a", 12, null))).toBe("pendiente");
    expect(estadoAnotada(linea("a", 12, 12))).toBe("contada");
    expect(estadoAnotada(linea("a", 12, 14))).toBe("contada");
    expect(estadoAnotada(linea("a", 12, 10))).toBe("a-medias");
    expect(estadoAnotada(linea("a", 12, 0))).toBe("a-medias");
  });
  it("se llama como la eligió o la escribió la compradora; si no, por su categoría", () => {
    expect(nombreAnotado(linea("a", 1, null, { prendaElegida: { productoId: "p", nombre: "Blusa Emma", codigo: null } }))).toBe("Blusa Emma");
    expect(nombreAnotado(linea("a", 1, null, { descripcion: "Casaca nueva" }))).toBe("Casaca nueva");
    expect(nombreAnotado(linea("a", 1, null))).toBe("Blusas");
  });
  it("la que sigue salta las contadas y las que van a medias; sin ninguna por contar, no hay", () => {
    expect(siguienteAnotada([linea("a", 12, 12), linea("b", 20, 5), linea("c", 3, null)])?.clave).toBe("c");
    expect(siguienteAnotada([linea("a", 12, 12), linea("b", 20, null), linea("c", 3, null)])?.clave).toBe("b");
    expect(siguienteAnotada([linea("a", 12, 12), linea("b", 20, 20)])).toBeNull();
  });

  it("con la prenda identificada, el estado sale de lo suyo y no de lo contado de la línea", () => {
    expect(estadoAnotada(linea("a", 4, 4), 0)).toBe("a-medias");
    expect(estadoAnotada(linea("a", 4, 6), 4)).toBe("contada");
    expect(estadoAnotada(linea("a", 4, null), 4)).toBe("pendiente");
  });
});

// El caso de la captura de Felipe (2026-10-27): 6 contadas de pantalones, solo Pantalón Carla (4) identificada.
const pantalon = (clave: string, nombre: string, productoId: string, dijeron: number, contadas: number | null, separado = { prendas: [] as unknown[], nuevas: [] as unknown[] }, enStock = 0): LineaParaContar => {
  const l = linea(clave, dijeron, contadas, { prendaElegida: { productoId, nombre, codigo: null } });
  if (l.conteo) Object.assign(l.conteo, { separado, enStock });
  return Object.assign(l, { proveedor: { id: "prov", nombre: "CAYLA SAC" }, marca: { id: "m", nombre: "CAYLA" } });
};

describe("cada prenda del papel se cuenta por lo que se identificó de ella", () => {
  it("Carla identificada con 4 y 2 de más contadas: Mía no se llena con las que sobran", () => {
    const carla = { prendas: [{ productoId: "p-carla", nombre: "Pantalón Carla", codigo: null, cantidad: 4, variantes: null }], nuevas: [] };
    const lineas = [pantalon("a", "Pantalón Carla", "p-carla", 4, 4, carla), pantalon("b", "Pantalón Mía", "p-mia", 4, 2)];
    const av = avanceDeAnotadas(lineas);
    expect(av.get("a" as never)).toBe(4);
    expect(av.get("b" as never)).toBe(0);
    expect(estadoAnotada(lineas[0], av.get("a" as never))).toBe("contada");
    expect(estadoAnotada(lineas[1], av.get("b" as never))).toBe("a-medias");
  });
  it("sin identificar nada, ninguna avanza aunque la categoría tenga su total", () => {
    const av = avanceDeAnotadas([pantalon("a", "Pantalón Carla", "p-carla", 4, 4), pantalon("b", "Pantalón Mía", "p-mia", 4, 4)]);
    expect([...av.values()]).toEqual([0, 0]);
  });
  it("identificar a Mía con 2 la deja en «2 de 4»; de más, no pasa de lo que dijeron", () => {
    const sep = { prendas: [{ productoId: "p-mia", nombre: "Pantalón Mía", codigo: null, cantidad: 6, variantes: null }], nuevas: [] };
    const lineas = [pantalon("a", "Pantalón Carla", "p-carla", 4, 4), pantalon("b", "Pantalón Mía", "p-mia", 4, 6, sep)];
    expect(avanceDeAnotadas(lineas).get("b" as never)).toBe(4);
    sep.prendas[0].cantidad = 2;
    expect(avanceDeAnotadas(lineas).get("b" as never)).toBe(2);
  });
  it("la misma prenda anotada en dos líneas se reparte entre ellas en el orden de la compra", () => {
    const sep = { prendas: [{ productoId: "p-mia", nombre: "Pantalón Mía", codigo: null, cantidad: 5, variantes: null }], nuevas: [] };
    const av = avanceDeAnotadas([pantalon("a", "Pantalón Mía", "p-mia", 3, 3, sep), pantalon("b", "Pantalón Mía", "p-mia", 3, 2)]);
    expect([av.get("a" as never), av.get("b" as never)]).toEqual([3, 2]);
  });
  it("una prenda anotada solo por nombre se cuenta con la nueva que se describió igual", () => {
    const sep = { prendas: [], nuevas: [{ cantidad: 3, descripcion: "casaca roja" }] };
    const l = linea("a", 3, 3, { descripcion: "Casaca Roja" });
    Object.assign(l.conteo as object, { separado: sep, enStock: 0 });
    expect(avanceDeAnotadas([l]).get("a" as never)).toBe(3);
  });
  it("lo que ya entró al stock de la línea (envío reabierto) cuenta como suyo", () => {
    expect(avanceDeAnotadas([pantalon("a", "Pantalón Carla", "p-carla", 4, 4, { prendas: [], nuevas: [] }, 4)]).get("a" as never)).toBe(4);
  });
  it("una línea sin prenda anotada toma lo contado de la línea, sin pasarse", () => {
    expect(avanceDeAnotadas([linea("a", 4, 6)]).get("a" as never)).toBe(4);
    expect(avanceDeAnotadas([linea("a", 4, null)]).get("a" as never)).toBe(0);
  });
});
