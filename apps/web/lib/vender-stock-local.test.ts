import { describe, expect, it } from "vitest";
import {
  almacenDeLaSede,
  almacenReleido,
  apartadoEnPiso,
  apartadoReleido,
  avisoCortas,
  avisoQuedaronEnAlmacen,
  avisoSinPiso,
  avisoTope,
  cantidadCobrable,
  conAlmacenAjustado,
  conApartadoAjustado,
  conPisoAlDia,
  conStockAjustado,
  conStockReleido,
  descontarVendido,
  motivoNoCobrable,
  tooltipTallaSinPiso,
} from "./vender-stock-local";
import { sumarCantidades } from "./inventario-reglas";

const piso = (variante_id: string, cantidad: number, cantidad_apartada = 0) => ({ variante_id, cantidad, cantidad_apartada, sububicacion: { tipo: "piso_venta" } });
const almacen = (variante_id: string, cantidad: number) => ({ variante_id, cantidad, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } });

describe("stock de la caja tras vender", () => {
  it("cobrable = piso disponible (no el almacén, no lo apartado); sin piso/almacén, el total disponible", () => {
    const tienda = sumarCantidades([piso("a", 5, 1), almacen("a", 10)]);
    expect(cantidadCobrable(tienda.get("a"))).toBe(4);
    const taller = sumarCantidades([{ variante_id: "b", cantidad: 7, cantidad_apartada: 2, sububicacion: null }]);
    expect(cantidadCobrable(taller.get("b"))).toBe(5);
    expect(cantidadCobrable(undefined)).toBe(0);
  });

  it("descuenta lo vendido sin bajar de 0 y sin inventar prendas fuera del catálogo", () => {
    const stock = new Map([["a", 3], ["b", 1]]);
    const r = descontarVendido(new Map(), stock, [
      { varianteId: "a", cantidad: 2 },
      { varianteId: "b", cantidad: 5 },
      { varianteId: "libre", cantidad: 1 },
    ]);
    expect([...r]).toEqual([["a", 1], ["b", 0]]);
    // Una segunda venta parte del ajuste anterior, no del stock original.
    expect(descontarVendido(r, stock, [{ varianteId: "a", cantidad: 1 }]).get("a")).toBe(0);
  });

  it("lo releído manda; una prenda sin fila de stock queda en 0", () => {
    const releido = sumarCantidades([piso("a", 4)]);
    const r = conStockReleido(new Map([["a", 1], ["c", 9]]), ["a", "b"], releido);
    expect([...r]).toEqual([["a", 4], ["c", 9], ["b", 0]]);
  });

  it("el almacén de la sede: lo disponible (sin lo apartado); null en el Taller o sin fila", () => {
    const tienda = sumarCantidades([piso("a", 0), almacen("a", 3), { variante_id: "a", cantidad: 2, cantidad_apartada: 1, sububicacion: { tipo: "almacen_tienda" } }]);
    expect(almacenDeLaSede(tienda.get("a"))).toBe(4);
    const taller = sumarCantidades([{ variante_id: "b", cantidad: 7, cantidad_apartada: 0, sububicacion: null }]);
    expect(almacenDeLaSede(taller.get("b"))).toBeNull();
    expect(almacenDeLaSede(undefined)).toBeNull();
  });

  it("el almacén releído sale de las mismas filas; una prenda que no volvió queda en null", () => {
    const releido = sumarCantidades([piso("a", 1), almacen("a", 5)]);
    expect([...almacenReleido(["a", "b"], releido)]).toEqual([["a", 5], ["b", null]]);
  });

  it("el ticket topa con el piso de AHORA, no con el que había al agregar la prenda; la prenda sin registrar no cambia", () => {
    const lineas = [
      { claveLinea: "a", varianteId: "a", stockAqui: 1, cantidad: 1 },
      { claveLinea: "manual-1", varianteId: "cargo", stockAqui: 1, cantidad: 1 },
    ];
    // Bajaron 2 del almacén: el piso de «a» pasó de 1 a 3.
    expect(conPisoAlDia(lineas, [{ varianteId: "a", stockAqui: 3 }])).toEqual([{ ...lineas[0], stockAqui: 3 }, lineas[1]]);
    expect(conPisoAlDia(lineas, [{ varianteId: "a", stockAqui: 1 }])).toBe(lineas);
  });

  it("aplica los ajustes y devuelve el mismo arreglo si no hay ninguno", () => {
    const variantes = [{ varianteId: "a", stockAqui: 3 }, { varianteId: "b", stockAqui: 2 }];
    expect(conStockAjustado(variantes, new Map())).toBe(variantes);
    expect(conStockAjustado(variantes, new Map([["b", 0]]))).toEqual([{ varianteId: "a", stockAqui: 3 }, { varianteId: "b", stockAqui: 0 }]);
  });

  it("el almacén se corrige solo con lo releído, aparte del piso; sin ajustes, el mismo arreglo", () => {
    const variantes = [{ varianteId: "a", stockAqui: 0, almacenAqui: 2 }, { varianteId: "b", stockAqui: 1, almacenAqui: null }];
    expect(conAlmacenAjustado(variantes, new Map())).toBe(variantes);
    // Se trasladó lo del almacén de «a»: queda en 0, y el piso no se toca.
    expect(conAlmacenAjustado(variantes, new Map([["a", 0]]))).toEqual([{ varianteId: "a", stockAqui: 0, almacenAqui: 0 }, variantes[1]]);
  });
});

// D-40: lo del almacén se puede vender y la caja no se frena por un trámite. Con el piso en 0 y la prenda en el almacén
// de la MISMA tienda, la caja no dice «agotada»: dice dónde está y qué hacer.
describe("¿agotada o en el almacén? (motivoNoCobrable)", () => {
  it("hay en el piso: se cobra, haya o no en el almacén", () => {
    expect(motivoNoCobrable({ stockAqui: 2, almacenAqui: 5 })).toBe("cobrable");
    expect(motivoNoCobrable({ stockAqui: 1, almacenAqui: 0 })).toBe("cobrable");
  });

  it("solo en el almacén de esta sede: no entra al ticket, pero no está agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 2 })).toBe("en_almacen");
  });

  it("ni en el piso ni en el almacén: agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 0 })).toBe("agotada");
  });

  it("Taller (sin almacén) o sin el dato: como antes, con el piso en 0 está agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: null })).toBe("agotada");
    expect(motivoNoCobrable({ stockAqui: 0 })).toBe("agotada");
    expect(motivoNoCobrable({ stockAqui: 3, almacenAqui: null })).toBe("cobrable");
  });

  it("lo único que queda en el piso está apartado y no hay nada libre en el almacén: apartada, no agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 0, apartadoAqui: 1 })).toBe("apartada");
    // Taller o quien no trae el almacén: con el piso apartado también es «apartada».
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: null, apartadoAqui: 2 })).toBe("apartada");
    expect(motivoNoCobrable({ stockAqui: 0, apartadoAqui: 2 })).toBe("apartada");
  });

  it("EL ORDEN: con stock libre en el almacén gana «en el almacén» (hay un camino de venta) y con piso libre, cobrable", () => {
    // Piso apartado + almacén libre: la colaboradora PUEDE vender bajando una del almacén, así que «apartada» a secas
    // se leería «no hay ninguna» y la dejaría sin ese camino.
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 3, apartadoAqui: 1 })).toBe("en_almacen");
    expect(motivoNoCobrable({ stockAqui: 2, almacenAqui: 3, apartadoAqui: 1 })).toBe("cobrable");
    expect(motivoNoCobrable({ stockAqui: 2, apartadoAqui: 5 })).toBe("cobrable");
  });

  it("sin nada apartado (0, null o ausente) sigue siendo agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 0, apartadoAqui: 0 })).toBe("agotada");
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 0, apartadoAqui: null })).toBe("agotada");
  });
});

describe("lo apartado en el piso (apartadoEnPiso, apartadoReleido, conApartadoAjustado)", () => {
  // La misma prenda con los tres números distintos: cobrable 4, apartado total 3 (1 en el piso + 2 en el almacén) y
  // apartado en el piso 1. Si algo usara el cobrable o el total en vez de lo apartado EN EL PISO, esto lo ve.
  const almacenConApartado = (variante_id: string, cantidad: number, cantidad_apartada: number) => ({ variante_id, cantidad, cantidad_apartada, sububicacion: { tipo: "almacen_tienda" } });
  const tres = () => sumarCantidades([piso("a", 5, 1), almacenConApartado("a", 3, 2)]);

  it("solo cuenta lo apartado en el piso (no el del almacén); sin piso/almacén, el total apartado; sin fila, 0", () => {
    const c = tres().get("a");
    expect([cantidadCobrable(c), c?.apartado, apartadoEnPiso(c)]).toEqual([4, 3, 1]);
    const taller = sumarCantidades([{ variante_id: "b", cantidad: 7, cantidad_apartada: 2, sububicacion: null }]);
    expect(apartadoEnPiso(taller.get("b"))).toBe(2);
    expect(apartadoEnPiso(undefined)).toBe(0);
  });

  it("lo releído sale de las mismas filas; una prenda que no volvió queda en 0", () => {
    expect([...apartadoReleido(["a", "b"], tres())]).toEqual([["a", 1], ["b", 0]]);
  });

  it("se aplica a las variantes y devuelve el mismo arreglo si no hay ajustes", () => {
    const variantes = [{ varianteId: "a", apartadoAqui: 0 }, { varianteId: "b" }];
    expect(conApartadoAjustado(variantes, new Map())).toBe(variantes);
    expect(conApartadoAjustado(variantes, new Map([["b", 2]]))).toEqual([{ varianteId: "a", apartadoAqui: 0 }, { varianteId: "b", apartadoAqui: 2 }]);
  });
});

describe("tooltip de una talla que no se puede cobrar ni bajar (tooltipTallaSinPiso)", () => {
  it("agotada: conserva sus textos de siempre, con o sin otras sedes", () => {
    expect(tooltipTallaSinPiso({ stockAqui: 0, almacenAqui: 0 }, null)).toBe("Sin stock en ninguna sede");
    expect(tooltipTallaSinPiso({ stockAqui: 0, almacenAqui: 0 }, "2 en Trujillo")).toBe("Sin stock aquí · 2 en Trujillo");
  });

  it("apartada: lo dice, y agrega dónde más hay si lo hay (no «sin stock en ninguna sede»: la unidad existe)", () => {
    expect(tooltipTallaSinPiso({ stockAqui: 0, almacenAqui: 0, apartadoAqui: 1 }, null)).toBe("Apartada para una clienta");
    expect(tooltipTallaSinPiso({ stockAqui: 0, almacenAqui: 0, apartadoAqui: 1 }, "2 en Trujillo")).toBe("Apartada para una clienta · 2 en Trujillo");
  });
});

describe("los avisos de la caja dicen dónde está la prenda y qué hacer", () => {
  const base = { nombre: "Blusa Paracas · M", sede: "Tienda TRU" };

  it("en el almacén: cuántas hay y DÓNDE se registra la bajada, también si ya la tiene en la mano", () => {
    expect(avisoSinPiso({ ...base, stockAqui: 0, almacenAqui: 2 })).toEqual({
      titulo: "Blusa Paracas · M está en el almacén",
      detalle:
        "En el sistema hay 0 en el piso y 2 en el almacén de Tienda TRU. Para cobrarla, que la bajen en Inventario ▸ Existencias ▸ Reponer (aunque ya la tengas en la mano, hay que registrarlo).",
    });
  });

  it("agotada: con almacén en 0 dice que tampoco hay ahí; en el Taller, como siempre", () => {
    expect(avisoSinPiso({ ...base, stockAqui: 0, almacenAqui: 0 })).toEqual({
      titulo: "Blusa Paracas · M está agotada",
      detalle: "No hay en el piso ni en el almacén de Tienda TRU.",
    });
    expect(avisoSinPiso({ ...base, sede: "Taller", stockAqui: 0, almacenAqui: null })).toEqual({
      titulo: "Blusa Paracas · M está agotada",
      detalle: "No hay stock en Taller.",
    });
  });

  it("apartada: es de una clienta —no «no hay»— y no hay nada que bajar", () => {
    const aviso = avisoSinPiso({ ...base, stockAqui: 0, almacenAqui: 0, apartadoAqui: 1 });
    expect(aviso).toEqual({
      titulo: "Blusa Paracas · M está apartada para una clienta",
      detalle: "No se vende desde aquí: es de la clienta que la apartó en Tienda TRU.",
    });
    // Nada de «bajar» ni de «no hay»: ninguna de las dos cosas es cierta.
    expect(aviso.detalle).not.toContain("bajen");
    expect(aviso.detalle).not.toContain("No hay");
  });

  it("piso apartado pero con almacén libre: el aviso es el del almacén (hay camino de venta), no el de apartada", () => {
    expect(avisoSinPiso({ ...base, stockAqui: 0, almacenAqui: 2, apartadoAqui: 1 }).titulo).toBe("Blusa Paracas · M está en el almacén");
  });

  it("tope sin almacén: el aviso de siempre", () => {
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: 0 })).toEqual({
      titulo: "No hay más de Blusa Paracas · M",
      detalle: "En Tienda TRU quedan 2 y ya están todas en el ticket.",
    });
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: null, quedoEn: true }).detalle).toBe("En Tienda TRU quedan 2; la cantidad quedó en 2.");
  });

  it("tope con más en el almacén: lo dice, con singular y plural", () => {
    expect(avisoTope({ ...base, stockAqui: 1, almacenAqui: 1 })).toEqual({
      titulo: "No hay más de Blusa Paracas · M en el piso",
      detalle: "La del piso ya está en el ticket. Hay 1 más en el almacén de Tienda TRU: que la bajen en Inventario ▸ Existencias ▸ Reponer.",
    });
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: 3 }).detalle).toBe(
      "Las 2 del piso ya están en el ticket. Hay 3 más en el almacén de Tienda TRU: que bajen las que necesites en Inventario ▸ Existencias ▸ Reponer.",
    );
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: 3, quedoEn: true }).detalle).toBe(
      "En el piso quedan 2; la cantidad quedó en 2. Hay 3 más en el almacén de Tienda TRU: que bajen las que necesites en Inventario ▸ Existencias ▸ Reponer.",
    );
  });

  it("ticket que ya no alcanza: sin almacén, el aviso de siempre con cuántas quedan", () => {
    expect(avisoCortas([{ nombre: "Blusa Paracas (BLU-M)", piso: 0, almacen: 0 }, { nombre: "Casaca Ximena (CAS-M)", piso: 1, almacen: null }], "Tienda TRU")).toEqual({
      titulo: "Ya no hay stock suficiente en Tienda TRU",
      detalle: "Blusa Paracas (BLU-M): quedan 0; Casaca Ximena (CAS-M): quedan 1. Ajusta la cantidad o quita la prenda.",
    });
  });

  it("ticket que ya no alcanza con prendas en el almacén: no dice «no hay», dice cuántas y dónde se bajan (D-40)", () => {
    expect(avisoCortas([{ nombre: "Blusa Paracas (BLU-M)", piso: 0, almacen: 2 }, { nombre: "Casaca Ximena (CAS-M)", piso: 1, almacen: 0 }], "Tienda TRU")).toEqual({
      titulo: "No alcanza lo del piso de Tienda TRU",
      detalle:
        "Blusa Paracas (BLU-M): en el piso quedan 0 y en el almacén hay 2; Casaca Ximena (CAS-M): quedan 1. Lo del almacén se cobra cuando lo bajen en Inventario ▸ Existencias ▸ Reponer; si no, ajusta la cantidad o quita la prenda.",
    });
  });

  it("al cerrar la cámara: un solo aviso con lo que quedó fuera por estar en el almacén; sin nada, ninguno", () => {
    expect(avisoQuedaronEnAlmacen([], "Tienda TRU")).toBeNull();
    expect(avisoQuedaronEnAlmacen(["Blusa Paracas · M"], "Tienda TRU")).toEqual({
      titulo: "Blusa Paracas · M no entró al ticket",
      detalle:
        "Según el sistema está en el almacén de Tienda TRU. Para cobrarla, que la bajen en Inventario ▸ Existencias ▸ Reponer (aunque ya la tengas en la mano, hay que registrarlo).",
    });
    expect(avisoQuedaronEnAlmacen(["Blusa Paracas · M", "Casaca Ximena · S"], "Tienda TRU")).toEqual({
      titulo: "2 prendas no entraron al ticket",
      detalle:
        "Blusa Paracas · M, Casaca Ximena · S. Según el sistema están en el almacén de Tienda TRU. Para cobrarlas, que las bajen en Inventario ▸ Existencias ▸ Reponer (aunque ya las tengas en la mano, hay que registrarlo).",
    });
  });
});
