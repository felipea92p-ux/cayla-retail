import { describe, expect, it } from "vitest";
import { proveedorDelModelo } from "./analisis-a-quien-pedir";
import { leerProveedoresAnalisis, recortarProveedores } from "./analisis-proveedores-lectura";

// Datos inventados para la prueba (no son de producción).
const A = "bbbbbbbb-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";

describe("leerProveedoresAnalisis", () => {
  it("junta los nombres de los proveedores y el proveedor del catálogo de cada modelo", () => {
    const r = leerProveedoresAnalisis(
      [{ id: "m1", proveedor_id: A }, { id: "m2", proveedor_id: B }],
      [{ id: A, nombre: "Textil Andino", activo: true }, { id: B, nombre: "Hilos del Sur", activo: false }],
    );
    expect(r).toEqual({
      nombres: { [A]: { nombre: "Textil Andino", activo: true }, [B]: { nombre: "Hilos del Sur", activo: false } },
      delCatalogo: { m1: A, m2: B },
    });
  });

  it("nadie tiene proveedor en el catálogo es un dato (los modelos dicen «Sin proveedor»), no una falla", () => {
    expect(leerProveedoresAnalisis([], [{ id: A, nombre: "Textil Andino" }])).toEqual({ nombres: { [A]: { nombre: "Textil Andino", activo: true } }, delCatalogo: {} });
  });

  it("un directorio sin ni un proveedor es una lectura que no pasó (la base responde cero filas, no un error, si la cuenta perdió la puerta): null, nunca «Sin proveedor» a todos", () => {
    expect(leerProveedoresAnalisis([], [])).toBeNull();
    // Modelos que apuntan a un proveedor que no se puede nombrar: tampoco se da por leído.
    expect(leerProveedoresAnalisis([{ id: "m1", proveedor_id: A }], [])).toBeNull();
    // Todas las filas del directorio descartadas por mal formadas.
    expect(leerProveedoresAnalisis([{ id: "m1", proveedor_id: A }], [{ nombre: "Sin id" }, null])).toBeNull();
  });

  it("si lo que llega no es una lista, no se pudo leer (null): nunca «sin proveedor»", () => {
    expect(leerProveedoresAnalisis(null, [])).toBeNull();
    expect(leerProveedoresAnalisis([], null)).toBeNull();
    expect(leerProveedoresAnalisis({ no: "es una lista" }, [])).toBeNull();
    expect(leerProveedoresAnalisis([], "raro")).toBeNull();
  });

  it("descarta la fila sin id o sin nombre, y no inventa ni un proveedor ni un vínculo", () => {
    const r = leerProveedoresAnalisis(
      [{ id: "m1", proveedor_id: A }, { id: "m2", proveedor_id: null }, { id: "", proveedor_id: B }, { proveedor_id: B }, "raro", null, { id: "m3", proveedor_id: "  " }],
      [{ id: A, nombre: "  Textil Andino  " }, { id: B, nombre: "   " }, { nombre: "Sin id" }, 7, null, { id: "c", nombre: 5 }],
    );
    expect(r).toEqual({ nombres: { [A]: { nombre: "Textil Andino", activo: true } }, delCatalogo: { m1: A } });
  });

  it("solo un «activo: false» explícito da al proveedor por archivado", () => {
    const r = leerProveedoresAnalisis([], [{ id: A, nombre: "Uno" }, { id: B, nombre: "Dos", activo: null }, { id: "c", nombre: "Tres", activo: false }]);
    expect(Object.values(r!.nombres).map((x) => x.activo)).toEqual([true, true, false]);
  });
});

describe("recortarProveedores: solo lo que las prendas de la tienda pueden usar", () => {
  const C = "bbbbbbbb-0000-0000-0000-00000000000c";
  const todo = {
    nombres: { [A]: { nombre: "Textil Andino", activo: true }, [B]: { nombre: "Hilos del Sur", activo: true }, [C]: { nombre: "Otro", activo: false } },
    delCatalogo: { m1: A, m2: B, m3: C, ajeno: C },
  };

  it("deja el proveedor del catálogo de cada modelo que hay y el nombre de a quién apunta, y nada más", () => {
    const r = recortarProveedores(todo, [{ productoId: "m1", proveedorId: null }, { productoId: "m2", proveedorId: null }]);
    expect(r).toEqual({
      nombres: { [A]: { nombre: "Textil Andino", activo: true }, [B]: { nombre: "Hilos del Sur", activo: true } },
      delCatalogo: { m1: A, m2: B },
    });
  });

  it("conserva el nombre del proveedor de una compra real aunque el catálogo no lo tenga, y el de un modelo sin catálogo no inventa nada", () => {
    const r = recortarProveedores(todo, [{ productoId: "m1", proveedorId: C }, { productoId: "sin-catalogo", proveedorId: null }, { productoId: "x", proveedorId: "no-esta" }]);
    expect(r).toEqual({ nombres: { [A]: todo.nombres[A], [C]: todo.nombres[C] }, delCatalogo: { m1: A } });
  });

  it("con varias tallas del mismo modelo no repite nada, y sin modelos queda vacío", () => {
    const tallas = [{ productoId: "m1", proveedorId: null }, { productoId: "m1", proveedorId: null }];
    expect(recortarProveedores(todo, tallas).delCatalogo).toEqual({ m1: A });
    expect(recortarProveedores(todo, [])).toEqual({ nombres: {}, delCatalogo: {} });
  });

  it("no cambia lo que dice cada modelo: la regla da lo mismo con el directorio entero que recortado", () => {
    const modelos = [{ productoId: "m1", proveedorId: null, origen: null }, { productoId: "m3", proveedorId: null, origen: null }, { productoId: "m2", proveedorId: B, origen: "terceros" as const }];
    const chico = recortarProveedores(todo, modelos);
    for (const m of modelos) expect(proveedorDelModelo(m, chico)).toEqual(proveedorDelModelo(m, todo));
  });
});
