import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { DIAS_VIGILAR, GRUPOS_QUIETAS, LIQUIDAR_DEFECTO, LIQUIDAR_MAX, LIQUIDAR_MIN, prendasDe } from "./analisis-reglas";
import { barraDeEdad, cifrasQuietas, destinoDeTodas, gruposQuietas, marcasEje, notaSinCosto, pistaQuieta, TEXTO_VACIO_QUIETAS, TRAMOS_EDAD, vacioQuietas } from "./analisis-quietas";

// Datos inventados para la prueba: ni nombres del catálogo ni cifras de producción.
function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Polo Ensayo",
    color: "Gris",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

/** Una prenda quieta en mi tienda: 3 libres y `dias` sin venderse. */
const quieta = (varianteId: string, dias: number, extra: Partial<PrendaAnalisis> = {}) => prenda({ varianteId, piso: 2, almacen: 1, diasSinVender: dias, ...extra });
/** Lo que vendió otra tienda (inventada) en 30 días. */
const vendioAlla = (sedeId: string, vendidas30: number, stock = 1) => ({ sedeId, stock, vendidas30 });

describe("las cifras de arriba", () => {
  it("cuenta prendas, unidades, lo que costaron y lo que valen a precio de venta", () => {
    const c = cifrasQuietas([
      quieta("a", 70, { costo: 20, precio: 50 }), // 3 unidades: 60 de costo, 150 a la venta
      quieta("b", 80, { piso: 4, almacen: 0, costo: 10, precio: 30 }), // 4 unidades: 40 y 120
    ]);
    expect(c).toEqual({ prendas: 2, unidades: 7, costo: 100, precioVenta: 270, sinCosto: 0, sinPrecio: 0 });
  });

  it("si a una le falta el costo o el precio, cuenta solo las que lo tienen y dice cuántas faltan", () => {
    const c = cifrasQuietas([quieta("a", 70, { costo: null, precio: 50 }), quieta("b", 80, { costo: 10, precio: null })]);
    expect(c.costo).toBe(30);
    expect(c.precioVenta).toBe(150);
    expect(c.sinCosto).toBe(1);
    expect(c.sinPrecio).toBe(1);
    expect(c.unidades).toBe(6);
  });

  it("si ninguna tiene costo, no inventa un S/ 0: null (se dice «—»)", () => {
    const c = cifrasQuietas([quieta("a", 70, { costo: null }), quieta("b", 80, { costo: null })]);
    expect(c.costo).toBeNull();
    expect(c.precioVenta).toBe(300);
  });

  it("sin quietas, todo en cero: no hay nada que costar", () => {
    expect(cifrasQuietas([])).toEqual({ prendas: 0, unidades: 0, costo: 0, precioVenta: 0, sinCosto: 0, sinPrecio: 0 });
  });

  it("siguen a «Liquidar desde»: al bajarlo, lo que se vigilaba pasa a quieta y entra en las cifras", () => {
    const prendas = [quieta("a", 45), quieta("b", 70)];
    expect(cifrasQuietas(prendasDe(prendas, GRUPOS_QUIETAS, LIQUIDAR_DEFECTO)).prendas).toBe(1);
    expect(cifrasQuietas(prendasDe(prendas, GRUPOS_QUIETAS, 40)).prendas).toBe(2);
    expect(cifrasQuietas(prendasDe(prendas, GRUPOS_QUIETAS, LIQUIDAR_MAX)).prendas).toBe(0);
  });
});

describe("el «?» de «costaron»", () => {
  it("callado si todas entran en la cuenta", () => {
    expect(notaSinCosto({ sinCosto: 0, sinPrecio: 0 })).toBeNull();
  });
  it("dice cuántas no entran, en singular y en plural", () => {
    expect(notaSinCosto({ sinCosto: 1, sinPrecio: 0 })).toBe("No cuenta 1 prenda sin costo.");
    expect(notaSinCosto({ sinCosto: 2, sinPrecio: 0 })).toBe("No cuenta 2 prendas sin costo.");
    expect(notaSinCosto({ sinCosto: 0, sinPrecio: 3 })).toBe("No cuenta 3 prendas sin precio.");
    expect(notaSinCosto({ sinCosto: 2, sinPrecio: 1 })).toBe("No cuenta 2 prendas sin costo ni 1 sin precio.");
  });
});

describe("cada prenda en el carril «Días sin venderse»", () => {
  it("cae en el eje de 4 meses; lo de más de 4 meses se queda al final", () => {
    expect(pistaQuieta(0, LIQUIDAR_DEFECTO).n).toBe(0);
    expect(pistaQuieta(60, LIQUIDAR_DEFECTO).n).toBe(0.5);
    expect(pistaQuieta(120, LIQUIDAR_DEFECTO).n).toBe(1);
    expect(pistaQuieta(300, LIQUIDAR_DEFECTO).n).toBe(1);
  });

  it("su aro: neutro antes de «Liquidar desde», ámbar desde ahí, rojo desde 3 meses", () => {
    expect(pistaQuieta(59, 60).zona).toBe("nd");
    expect(pistaQuieta(60, 60).zona).toBe("ate");
    expect(pistaQuieta(89, 60).zona).toBe("ate");
    expect(pistaQuieta(90, 60).zona).toBe("urg");
    expect(pistaQuieta(86, 85).zona).toBe("ate");
    expect(pistaQuieta(90, 85).zona).toBe("urg");
    // Con «Liquidar desde» pasado de 3 meses (sin tope desde el 2026-10-07), lo de más de 3 meses sigue en rojo.
    expect(pistaQuieta(104, 180).zona).toBe("urg");
  });

  it("el color sigue al control: la misma prenda cambia al moverlo, y vuelve", () => {
    expect(pistaQuieta(70, 60).zona).toBe("ate");
    expect(pistaQuieta(70, 75).zona).toBe("nd");
    expect(pistaQuieta(70, 60).zona).toBe("ate");
  });

  it("su cifra va a la izquierda del punto solo pasado el 80 % del eje (a la derecha se saldría)", () => {
    expect(pistaQuieta(60, 60).cifraALaIzquierda).toBe(false);
    expect(pistaQuieta(96, 60).cifraALaIzquierda).toBe(false);
    expect(pistaQuieta(97, 60).cifraALaIzquierda).toBe(true);
    expect(pistaQuieta(400, 60).cifraALaIzquierda).toBe(true);
  });

  it("las marcas del eje: «Liquidar» se mueve con el control y, si pasa de 3 meses, el eje se alarga para que se siga viendo", () => {
    expect(marcasEje(60)).toEqual({ liquidar: 50, tresMeses: 75 });
    expect(marcasEje(30).liquidar).toBe(25);
    expect(marcasEje(LIQUIDAR_MIN).liquidar).toBeCloseTo(100 / 120, 6);
    expect(marcasEje(85).liquidar).toBeLessThan(marcasEje(85).tresMeses);
    expect(marcasEje(180).liquidar).toBeGreaterThan(marcasEje(180).tresMeses);
    expect(marcasEje(LIQUIDAR_MAX).liquidar).toBeLessThan(100);
  });
});

describe("los grupos del carril", () => {
  const prendas = [
    quieta("enviar", 70, { otras: [vendioAlla("tienda-b", 3)] }),
    quieta("liquidar-vieja", 100, { otras: [vendioAlla("tienda-b", 1)] }),
    quieta("liquidar", 65, { piso: 5 }),
    quieta("vigila", 45),
    quieta("nueva", 10),
    prenda({ varianteId: "se-vende", piso: 20, vendidas30: 5, diasSinVender: 2 }),
    prenda({ varianteId: "se-acaba", piso: 1, vendidas30: 6, diasSinVender: 1 }),
  ];
  const ids = (lista: readonly PrendaAnalisis[]) => lista.map((p) => p.varianteId);

  it("cada uno con lo suyo, de lo que más espera a lo que menos", () => {
    const g = gruposQuietas(prendas, 60);
    expect(ids(g.enviar)).toEqual(["enviar"]);
    expect(ids(g.liquidar)).toEqual(["liquidar-vieja", "liquidar"]);
    expect(ids(g.vigila)).toEqual(["vigila"]);
  });

  it("lo que se vende, lo nuevo y lo que se acaba no entran", () => {
    const g = gruposQuietas(prendas, 60);
    const todas = [...g.enviar, ...g.liquidar, ...g.vigila].map((p) => p.varianteId);
    expect(todas).not.toContain("se-vende");
    expect(todas).not.toContain("nueva");
    expect(todas).not.toContain("se-acaba");
    expect(new Set(todas).size).toBe(todas.length); // ninguna en dos grupos
  });

  it("al mover «Liquidar desde», las prendas cambian de grupo en vivo", () => {
    expect(ids(gruposQuietas(prendas, 40).liquidar)).toEqual(["liquidar-vieja", "liquidar", "vigila"]);
    const alto = gruposQuietas(prendas, 85);
    expect(ids(alto.liquidar)).toEqual(["liquidar-vieja"]);
    expect(ids(alto.vigila)).toEqual(["enviar", "liquidar", "vigila"]);
    expect(alto.enviar).toEqual([]);
    // Sin tope: con 999 días nada se liquida, todo lo quieto se vigila.
    const sinTope = gruposQuietas(prendas, LIQUIDAR_MAX);
    expect(sinTope.liquidar).toEqual([]);
    expect(ids(sinTope.vigila)).toEqual(["liquidar-vieja", "enviar", "liquidar", "vigila"]);
  });
});

describe("«Enviar todas»", () => {
  it("si todas van a la misma tienda, esa", () => {
    expect(destinoDeTodas([{ otras: [vendioAlla("tienda-b", 3), vendioAlla("tienda-c", 0)] }, { otras: [vendioAlla("tienda-b", 2)] }])).toBe("tienda-b");
  });
  it("si van a tiendas distintas, ninguna (cada fila tiene la suya)", () => {
    expect(destinoDeTodas([{ otras: [vendioAlla("tienda-b", 3)] }, { otras: [vendioAlla("tienda-c", 4), vendioAlla("tienda-b", 1)] }])).toBeNull();
  });
  it("sin prendas, o con una que ninguna tienda vende, ninguna", () => {
    expect(destinoDeTodas([])).toBeNull();
    expect(destinoDeTodas([{ otras: [vendioAlla("tienda-b", 3)] }, { otras: [] }])).toBeNull();
  });
});

describe("la edad por tienda", () => {
  it("cuatro tramos, de lo nuevo a lo viejo, con la leyenda de la maqueta", () => {
    expect(TRAMOS_EDAD.map((t) => t.clase)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(TRAMOS_EDAD.map((t) => t.etiqueta)).toEqual(["Hasta 1 mes", "1 a 2 meses", "2 a 3 meses", "Más de 3 meses"]);
  });

  it("cada tramo ocupa su parte, con un mínimo para que se vea; la cifra va adentro solo si pasa del 10 %", () => {
    const { total, tramos } = barraDeEdad({ hasta30: 600, de31a60: 300, de61a90: 70, masDe90: 30 });
    expect(total).toBe(1000);
    expect(tramos.map((t) => t.unidades)).toEqual([600, 300, 70, 30]);
    expect(tramos.map((t) => t.flex)).toEqual([0.6, 0.3, 0.07, 0.03]);
    expect(tramos.map((t) => t.cifraAdentro)).toEqual([true, true, false, false]);
    expect(barraDeEdad({ hasta30: 990, de31a60: 0, de61a90: 0, masDe90: 10 }).tramos.map((t) => t.flex)).toEqual([0.99, 0.03, 0.03, 0.03]);
  });

  it("justo el 10 % no lleva la cifra adentro", () => {
    expect(barraDeEdad({ hasta30: 90, de31a60: 10, de61a90: 0, masDe90: 0 }).tramos[1]!.cifraAdentro).toBe(false);
  });

  it("una tienda sin unidades: total 0 y ningún tramo", () => {
    const { total, tramos } = barraDeEdad({ hasta30: 0, de31a60: 0, de61a90: 0, masDe90: 0 });
    expect(total).toBe(0);
    expect(tramos.every((t) => t.flex === 0 && !t.cifraAdentro)).toBe(true);
  });
});

describe("cuando no hay carril", () => {
  it("si todo se vende o es nuevo, todo se mueve", () => {
    expect(vacioQuietas([quieta("nueva", 10), prenda({ varianteId: "se-vende", piso: 3, vendidas30: 4, diasSinVender: 1 })], LIQUIDAR_DEFECTO, 0)).toBe("todo-se-mueve");
  });
  it("si no llegó ni una prenda porque algo falló al leer, no dice «todo se mueve»: dice que no pudo ver", () => {
    expect(vacioQuietas([], LIQUIDAR_DEFECTO, 1)).toBe("sin-datos");
    expect(vacioQuietas([], LIQUIDAR_DEFECTO, 0)).toBe("todo-se-mueve");
    // Con prendas a la vista, una falla de otra parte no cambia la respuesta.
    expect(vacioQuietas([quieta("nueva", 10)], LIQUIDAR_DEFECTO, 2)).toBe("todo-se-mueve");
  });
  it("con una sola que se vigila, hay carril (aunque algo más haya fallado)", () => {
    expect(vacioQuietas([quieta("nueva", 10), quieta("vigila", 40)], LIQUIDAR_DEFECTO, 0)).toBeNull();
    expect(vacioQuietas([quieta("vigila", 40)], LIQUIDAR_DEFECTO, 1)).toBeNull();
  });
  it("el control nunca saca una prenda del carril; con menos de 30 días puede sumar las que ya llevan ese tiempo quietas", () => {
    const prendas = [quieta("a", 30), quieta("b", 29)];
    for (let dias = LIQUIDAR_MIN; dias <= LIQUIDAR_MAX; dias++) expect(vacioQuietas(prendas, dias, 0)).toBeNull();
    // Con 30 o más, la de 29 días no entra: no depende del número.
    for (let dias = DIAS_VIGILAR; dias <= LIQUIDAR_MAX; dias++) expect(vacioQuietas([quieta("b", 29)], dias, 0)).toBe("todo-se-mueve");
    // Con menos (sin tope desde el 2026-10-07), ya lleva esos días: entra a «Liquidar».
    expect(vacioQuietas([quieta("b", 29)], 29, 0)).toBeNull();
    expect(vacioQuietas([quieta("b", 29)], LIQUIDAR_MIN, 0)).toBeNull();
  });
  it("cada vacío dice algo corto, con su título y una línea", () => {
    expect(TEXTO_VACIO_QUIETAS["todo-se-mueve"].titulo).toBe("Todo se mueve");
    for (const t of Object.values(TEXTO_VACIO_QUIETAS)) expect(t.linea.length).toBeLessThanOrEqual(60);
  });
});
