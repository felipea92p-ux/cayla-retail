import { describe, expect, it } from "vitest";
import type { PartePedido, PrendaAnalisis } from "./analisis-tipos";
import {
  alcancePorTipo,
  curvaDeTallas,
  fraseDelTipo,
  lineasDeTipo,
  ordenarAlcance,
  rindeConConfianza,
  textoAlcanceEnEje,
  titularDeLosQueNoLlegan,
  type AlcanceTipo,
} from "./analisis-pedir";
import type { TemporadaDatos } from "./analisis-temporada";

// Datos inventados (el repo es público). Hoy = 2026-10-17; 30 días de ventas.
const HOY = "2026-10-17";
let n = 0;
function prenda(p: Partial<PrendaAnalisis> = {}): PrendaAnalisis {
  n += 1;
  return {
    varianteId: `v${n}`,
    productoId: `p${n}`,
    nombre: `Modelo ${n}`,
    color: "Azul",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: "indumentaria",
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: null,
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
    ...p,
  };
}

/** Un tipo que se vende 1 por día (30 en 30 días) y del que quedan `tiene`: dura `tiene` días. */
const tipo = (categoria: string, tiene: number, p: Partial<PrendaAnalisis> = {}) => prenda({ categoria, categoriaPrefijo: categoria.slice(0, 3).toUpperCase(), vendidas30: 30, piso: tiene, ...p });

const CAMPANA = { modo: "campana" as const, dias: 75 };

describe("la meta de cada tipo y su plazo (A6, D3 y D4)", () => {
  it("con una campaña la meta es la misma para todos; el plazo (14 del Taller, 30 de terceros) solo cambia «pídelo antes del X»", () => {
    const a = alcancePorTipo([tipo("Polos", 60, { origen: "taller" }), tipo("Jeans", 60, { origen: "terceros" })], 30, HOY, CAMPANA, true);
    const polos = a.find((t) => t.categoria === "Polos")!;
    const jeans = a.find((t) => t.categoria === "Jeans")!;
    expect([polos.meta, jeans.meta]).toEqual([75, 75]);
    expect([polos.plazo.dias, jeans.plazo.dias]).toEqual([14, 30]);
    // 60 días de alcance en 75 de meta: los dos piden. Polos: 60 − 14 = 46 días → 2026-12-02; Jeans: 60 − 30 = 30 → 2026-11-16.
    expect(polos.pidelo).toEqual({ fecha: "2026-12-02", ya: false });
    expect(jeans.pidelo).toEqual({ fecha: "2026-11-16", ya: false });
  });

  it("en «plazo + 1 mes» cada tipo mide con SU plazo: el del Taller con 44 días, el de terceros con 60", () => {
    const h = { modo: "plazo" as const, dias: 60 };
    const a = alcancePorTipo([tipo("Polos", 50, { origen: "taller" }), tipo("Jeans", 50, { origen: "terceros" })], 30, HOY, h, true);
    expect(a.find((t) => t.categoria === "Polos")).toMatchObject({ meta: 44, pide: false });
    expect(a.find((t) => t.categoria === "Jeans")).toMatchObject({ meta: 60, pide: true });
  });

  it("lo que llega después de la meta se aparta con la meta DE SU TIPO", () => {
    const llega = [{ de: "compra" as const, cantidad: 20, fecha: "2026-12-01" }]; // a 45 días de hoy
    const h = { modo: "plazo" as const, dias: 60 };
    const a = alcancePorTipo([tipo("Polos", 5, { origen: "taller", llega }), tipo("Jeans", 5, { origen: "terceros", llega })], 30, HOY, h, true);
    expect(a.find((t) => t.categoria === "Polos")).toMatchObject({ vienen: 0, despues: 20 });
    expect(a.find((t) => t.categoria === "Jeans")).toMatchObject({ vienen: 20, despues: 0 });
  });

  it("un número (como antes, los días a Navidad) sigue valiendo", () => {
    expect(alcancePorTipo([tipo("Polos", 60)], 30, HOY, 70, true)[0]).toMatchObject({ meta: 70, pide: true });
  });

  it("el plazo sale de TODOS los modelos del tipo, también los que hoy no tienen stock", () => {
    const a = alcancePorTipo([tipo("Polos", 60, { origen: "taller" }), prenda({ categoria: "Polos", origen: "terceros" })], 30, HOY, CAMPANA, true);
    expect(a[0]!.plazo).toEqual({ dias: 30, origen: "terceros" });
  });
});

describe("«pídelo antes del X» en los límites", () => {
  const polos = (tiene: number) => alcancePorTipo([tipo("Polos", tiene, { origen: "terceros" })], 30, HOY, CAMPANA, true)[0]!;
  it("justo el plazo (30) → ya; uno más → mañana; llegando a la meta → no hay fecha", () => {
    expect(polos(30).pidelo).toEqual({ fecha: HOY, ya: true });
    expect(polos(31).pidelo).toEqual({ fecha: "2026-10-18", ya: false });
    expect(polos(75).pide).toBe(false);
    expect(polos(75).pidelo).toBeNull();
    expect(polos(74).pide).toBe(true);
  });

  it("lo que no se vendió no tiene fecha", () => {
    const a = alcancePorTipo([prenda({ categoria: "Polos", piso: 10 })], 30, HOY, CAMPANA, true)[0]!;
    expect(a).toMatchObject({ dias: null, pide: false, pidelo: null, situacion: "sin_ritmo" });
  });
});

describe("la temporada (D5): una línea más, la cifra base no se toca", () => {
  const ok = (factor: number): TemporadaDatos => ({ estado: "ok", factor, minimo: factor - 0.2, maximo: factor + 0.4, anios: 5 });
  const base = alcancePorTipo([tipo("Polos", 80)], 30, HOY, CAMPANA, true)[0]!;

  it("con historia y una temporada que se nota, dice cuántos días te alcanzarían (80 a ritmo plano → 62 con 1,3)", () => {
    const a = alcancePorTipo([tipo("Polos", 80)], 30, HOY, CAMPANA, true, {}, null, ok(1.3))[0]!;
    expect(a.conTemporada).toBe(62);
    expect(a.dias).toBe(base.dias);
    expect(a.pide).toBe(base.pide);
    // Con 80 días de alcance y la meta a 75, a ritmo plano llega; con la temporada (62) no: la línea lo dice en vez de contradecir a la fila.
    expect(lineasDeTipo(a, { modo: "campana", fecha: "2026-12-31" }).temporada).toBe("con temporada: unos 62 días · con ella no llegaría");
    const pide = alcancePorTipo([tipo("Polos", 40)], 30, HOY, CAMPANA, true, {}, null, ok(1.3))[0]!;
    expect(lineasDeTipo(pide, { modo: "campana", fecha: "2026-12-31" }).temporada).toBe("con temporada: unos 31 días");
  });

  it("sin historia (poca, sin permiso, fallo, sin meta fija) o con una temporada que no se nota (±5 %), no hay línea", () => {
    for (const t of [{ estado: "poca_historia", anios: 2 }, { estado: "sin_modulo" }, { estado: "fallo" }, { estado: "sin_horizonte" }, ok(1.04), ok(0.96)] as TemporadaDatos[]) {
      expect(alcancePorTipo([tipo("Polos", 80)], 30, HOY, CAMPANA, true, {}, null, t)[0]!.conTemporada).toBeNull();
    }
    expect(alcancePorTipo([tipo("Polos", 80)], 30, HOY, CAMPANA, true, {}, null, null)[0]!.conTemporada).toBeNull();
  });

  it("justo en el 5 % sí se nota; un tipo agotado no tiene temporada que decir", () => {
    expect(alcancePorTipo([tipo("Polos", 80)], 30, HOY, CAMPANA, true, {}, null, ok(1.05))[0]!.conTemporada).toBe(76);
    expect(alcancePorTipo([tipo("Polos", 0)], 30, HOY, CAMPANA, true, {}, null, ok(1.3))[0]!.conTemporada).toBeNull();
  });
});

describe("el peso de cada tipo y el orden por situación (D13)", () => {
  // Polos 60 vendidas (se agota), Camisas 30 (no llega), Capas 10 (llega), Faldas sin ventas, Aretes todo sin prenda.
  const prendas = [
    tipo("Polos", 0, { vendidas30: 60 }),
    tipo("Camisas", 20, { vendidas30: 30 }),
    tipo("Capas", 500, { vendidas30: 10 }),
    prenda({ categoria: "Faldas", categoriaPrefijo: "FAL", piso: 4 }),
    prenda({ categoria: "Aretes", categoriaPrefijo: "ARE", piso: 0 }),
    tipo("Bolsos", 10, { vendidas30: 5 }),
  ];
  const tipos = alcancePorTipo(prendas, 30, HOY, CAMPANA, true, { Aretes: 8 });

  it("«Pesa %» es la parte de lo vendido; suman las 100", () => {
    const por = Object.fromEntries(tipos.map((t) => [t.categoria, t.pesa]));
    expect(por).toEqual({ Polos: 53, Camisas: 27, Capas: 9, Bolsos: 4, Aretes: 7, Faldas: 0 });
  });

  it("situación: agotado, no llega, llega, sin ritmo, catálogo incompleto", () => {
    const por = Object.fromEntries(tipos.map((t) => [t.categoria, t.situacion]));
    expect(por).toEqual({ Polos: "agotado", Camisas: "no_llega", Capas: "llega", Bolsos: "no_llega", Aretes: "incompleto", Faldas: "sin_ritmo" });
  });

  it("por defecto: la situación primero y, dentro de ella, lo que más pesa — un tipo chico no se nombra antes que uno grande", () => {
    expect(ordenarAlcance(tipos, "prioridad").map((t) => t.categoria)).toEqual(["Polos", "Camisas", "Bolsos", "Capas", "Faldas", "Aretes"]);
  });

  it("los otros órdenes siguen disponibles", () => {
    expect(ordenarAlcance(tipos, "vende").map((t) => t.categoria)[0]).toBe("Polos");
    expect(ordenarAlcance(tipos, "acaba").map((t) => t.categoria)).toEqual(tipos.map((t) => t.categoria));
  });

  it("a igual situación y venta, lo que se acaba antes, y después el nombre", () => {
    const iguales = alcancePorTipo([tipo("Zapatos", 20, { vendidas30: 30 }), tipo("Abrigos", 30, { vendidas30: 30 }), tipo("Medias", 20, { vendidas30: 30 })], 30, HOY, CAMPANA, true);
    expect(ordenarAlcance(iguales, "prioridad").map((t) => t.categoria)).toEqual(["Medias", "Zapatos", "Abrigos"]);
  });

  it("el titular nombra primero lo que más pesa (Polos y Camisas, no Bolsos)", () => {
    const noLlegan = ordenarAlcance(tipos.filter((t) => t.pide), "prioridad").map((t) => t.categoria);
    expect(titularDeLosQueNoLlegan(noLlegan, "hasta el 31 dic.")).toEqual({ titular: "Polos y Camisas", largo: false, resto: "no llegan hasta el 31 dic. (y 1 tipo más)" });
  });
});

describe("un tipo con el catálogo incompleto (g)", () => {
  it("con 0 ventas con prenda y algo vendido sin registrar: no pide, no tiene fecha y lo dice", () => {
    const a = alcancePorTipo([prenda({ categoria: "Aretes", categoriaPrefijo: "ARE", piso: 0 })], 30, HOY, CAMPANA, true, { Aretes: 12 })[0]!;
    expect(a).toMatchObject({ incompleto: true, pide: false, pidelo: null, situacion: "incompleto", vendidas: 12, sinPrenda: 12 });
    expect(fraseDelTipo(a, [a], 30, { modo: "campana", fecha: "2026-12-31" })).toContain("el catálogo de Aretes está incompleto");
  });

  it("con UNA venta con prenda ya no es incompleto", () => {
    const a = alcancePorTipo([tipo("Aretes", 5, { vendidas30: 1 })], 30, HOY, CAMPANA, true, { Aretes: 12 })[0]!;
    expect(a.incompleto).toBe(false);
  });
});

describe("la fila en pocas líneas fijas (a)", () => {
  const h = { modo: "campana" as const, fecha: "2026-12-31" };
  const pedido = (de: PartePedido["de"], cantidad: number, fecha: string | null): PartePedido => ({ de, categoria: "Polos", marca: null, cantidad, fecha, numeros: [], destino: null }) as unknown as PartePedido;

  it("primera línea lo que se CUENTA; segunda lo que NO, con una sola palabra para atrasada y vencida", () => {
    const llega = [{ de: "compra" as const, cantidad: 20, fecha: "2026-09-20" }]; // atrasada
    const a = alcancePorTipo([tipo("Polos", 32, { llega, almacen: 4, piso: 28, salioAlPiso: null })], 30, HOY, CAMPANA, true, { Polos: 6 }, [pedido("orden", 40, "2026-10-29"), pedido("orden", 15, null), pedido("orden", 8, "2026-10-01")])[0]!;
    const l = lineasDeTipo(a, h);
    expect(l.cuenta).toMatch(/^vendiste 36 \(6 sin registrar\) · tienes 32/);
    expect(l.cuenta).toContain("+ 40 que llegan el 29 oct.");
    expect(l.noCuenta).toBe("No cuento 43: 28 atrasadas y 15 sin fecha");
  });

  it("sin nada que no cuente, no hay segunda línea; una sola atrasada va en singular", () => {
    const a = alcancePorTipo([tipo("Polos", 30)], 30, HOY, CAMPANA, true)[0]!;
    expect(lineasDeTipo(a, h).noCuenta).toBeNull();
    const b = alcancePorTipo([tipo("Polos", 30, { llega: [{ de: "compra", cantidad: 1, fecha: "2026-09-20" }] })], 30, HOY, CAMPANA, true)[0]!;
    expect(lineasDeTipo(b, h).noCuenta).toBe("No cuento 1: 1 atrasada");
  });

  it("lo que llega después de la meta dice después de cuál", () => {
    const a = alcancePorTipo([tipo("Polos", 30, { llega: [{ de: "compra", cantidad: 10, fecha: "2027-02-01" }] })], 30, HOY, CAMPANA, true)[0]!;
    expect(lineasDeTipo(a, h).noCuenta).toBe("No cuento 10: 10 después del 31 dic.");
  });

  it("lo del Taller, lo por repartir y lo que debe el proveedor salen de la fila y van al panel (red)", () => {
    const a = alcancePorTipo([tipo("Polos", 30)], 30, HOY, CAMPANA, true, {}, [pedido("taller", 40, null), pedido("por_repartir", 30, null), pedido("reposicion", 10, null)])[0]!;
    const l = lineasDeTipo(a, h);
    expect(l.red).toEqual(["el proveedor debe 10", "30 por repartir desde Lima", "el Taller tiene 40 en proceso"]);
    expect(l.noCuenta).toBeNull();
    expect(l.cuenta).not.toContain("Taller");
  });

  it("lo que nunca salió al piso se dice junto a lo que tienes", () => {
    const a = alcancePorTipo([tipo("Polos", 0, { piso: 0, almacen: 12, salioAlPiso: null })], 30, HOY, CAMPANA, true)[0]!;
    expect(lineasDeTipo(a, h).cuenta).toContain("tienes 12");
    expect(lineasDeTipo(a, h).cuenta).toContain("(12 sin salir al piso)");
  });

  it("una orden abierta nunca deja un «solo pídelo» (j)", () => {
    const a = alcancePorTipo([tipo("Polos", 40, { origen: "terceros" })], 30, HOY, CAMPANA, true, {}, [pedido("orden", 15, null)])[0]!;
    expect(a.ordenAbierta).toBe(true);
    // Con una orden abierta no se dice «pídelo ya»: se dice que la orden está.
    expect(lineasDeTipo(a, h).pidelo).toBe("ya hay orden: mírala antes de pedir");
    expect(fraseDelTipo(a, [a], 30, h)).toContain("Ya hay una orden abierta");
    const sin = alcancePorTipo([tipo("Polos", 40, { origen: "terceros" })], 30, HOY, CAMPANA, true)[0]!;
    expect(lineasDeTipo(sin, h).pidelo).toBe("pídelo antes del 27 oct.");
  });
});

describe("el eje (i): la meta × 1,15 y «→ más de N»", () => {
  it("lo que cabe se dice normal; lo que pasa del fin del eje, «→ más de 13 semanas»", () => {
    expect(textoAlcanceEnEje(80, 86)).toBe("11 semanas");
    expect(textoAlcanceEnEje(86, 86)).toBe("12 semanas");
    expect(textoAlcanceEnEje(87, 86)).toBe("→ más de 12 semanas");
    expect(textoAlcanceEnEje(null, 86)).toBe("No se vendió");
    expect(textoAlcanceEnEje(0, 86)).toBe("Ya no hay");
    // En una frase, sin la flecha: «Te alcanza para más de 12 semanas».
    expect(textoAlcanceEnEje(120, 86, false)).toBe("más de 12 semanas");
    const a = alcancePorTipo([tipo("Polos", 150)], 30, HOY, CAMPANA, true)[0]!;
    expect(fraseDelTipo(a, [a], 30, { modo: "campana", fecha: "2026-12-31", dias: 75 })).toMatch(/^Te alcanza para más de 12 semanas: llega hasta el 31 dic\./);
  });
});

describe("«Lo que más rinde» se calla donde casi todo se vendió sin registrar (d)", () => {
  const tipos = [
    { categoria: "Polos", vendidas: 100, sinPrenda: 10 },
    { categoria: "Jeans", vendidas: 100, sinPrenda: 50 },
    { categoria: "Capas", vendidas: 100, sinPrenda: 49 },
  ];
  it("desde la mitad, sin dato; justo debajo, fiable; un tipo sin ventas en la ventana se deja como viene", () => {
    const r = rindeConConfianza([{ categoria: "Polos", porSol: 1.2 }, { categoria: "Jeans", porSol: 0.2 }, { categoria: "Capas", porSol: 0.3 }, { categoria: "Bolsos", porSol: 0.9 }], tipos);
    expect(r.map((x) => [x.categoria, x.fiable])).toEqual([["Polos", true], ["Jeans", false], ["Capas", true], ["Bolsos", true]]);
  });
});

describe("la curva de tallas (e)", () => {
  const talla = (t: string, vendidas30: number, piso: number) => ({ categoria: "Polos", talla: t, vendidas30, piso, almacen: 0 });

  it("suma lo vendido sin registrar a la talla que se anotó en caja", () => {
    const c = curvaDeTallas([talla("S", 10, 5), talla("M", 10, 5)], "Polos", { Polos: { S: 5 } });
    expect(c.tipo === "tallas" && c.columnas.map((x) => [x.talla, x.vend])).toEqual([["S", 15], ["M", 10]]);
  });

  it("una talla vendida sin registrar que no tiene barra la crea (sin stock); una venta de otro tipo no entra", () => {
    const c = curvaDeTallas([talla("S", 10, 5), talla("M", 10, 5)], "Polos", { Polos: { L: 4 }, Jeans: { S: 99 } });
    expect(c.tipo === "tallas" && c.columnas.find((x) => x.talla === "L")).toMatchObject({ vend: 4, tiene: 0 });
    expect(c.tipo === "tallas" && c.columnas.some((x) => x.vend === 99)).toBe(false);
  });

  it("nunca dice «pide más» con menos de 10 ventas del tipo; con 10 o más, sí", () => {
    // S vende 3 de 4 y tiene 1 de 4: sobradamente «pide más» si se fiara, pero son 4 ventas.
    const poca = curvaDeTallas([talla("S", 3, 1), talla("M", 1, 3)], "Polos");
    expect(poca.tipo === "tallas" && poca.columnas.every((x) => !x.pideMas)).toBe(true);
    const nueve = curvaDeTallas([talla("S", 6, 1), talla("M", 3, 3)], "Polos");
    expect(nueve.tipo === "tallas" && nueve.columnas.every((x) => !x.pideMas)).toBe(true);
    const diez = curvaDeTallas([talla("S", 7, 1), talla("M", 3, 3)], "Polos");
    expect(diez.tipo === "tallas" && diez.columnas.find((x) => x.talla === "S")?.pideMas).toBe(true);
  });

  it("un tipo de talla estándar con ventas sin registrar por talla ya tiene curva (el caso de Arequipa), no «talla única» ni «vacía»", () => {
    const estandar = [talla("Estándar", 3, 5)];
    const c = curvaDeTallas(estandar, "Polos", { Polos: { S: 10, M: 10 } });
    expect(c.tipo).toBe("tallas");
    expect(c.tipo === "tallas" && c.columnas.map((x) => [x.talla, x.vend, x.tiene])).toEqual([["Estándar", 3, 5], ["S", 10, 0], ["M", 10, 0]]);
    expect(curvaDeTallas([], "Polos", { Polos: { S: 10, M: 10 } }).tipo).toBe("tallas");
    expect(curvaDeTallas(estandar, "Polos", {}).tipo).toBe("unica");
    expect(curvaDeTallas([], "Polos", {}).tipo).toBe("vacia");
  });

  it("sin tipo elegido, lo vendido sin registrar de un tipo que la tienda no tiene no entra a la curva; con tipo, una talla de otro sistema no abre una columna", () => {
    const c = curvaDeTallas([talla("S", 10, 5), talla("M", 10, 5)], null, { Fantasma: { S: 99 } });
    expect(c.tipo === "tallas" && c.columnas.map((x) => x.vend)).toEqual([10, 10]);
    const numeros = [talla("28", 10, 5), talla("30", 10, 5)];
    const d = curvaDeTallas(numeros, "Polos", { Polos: { M: 4, "32": 3 } });
    expect(d.tipo === "tallas" && d.columnas.map((x) => x.talla)).toEqual(["28", "30", "32"]);
  });

  it("lo vendido sin registrar cuenta para las 10 ventas", () => {
    const c = curvaDeTallas([talla("S", 3, 1), talla("M", 1, 3)], "Polos", { Polos: { S: 6 } });
    expect(c.tipo === "tallas" && c.columnas.find((x) => x.talla === "S")?.pideMas).toBe(true);
  });
});

describe("el tipo, en limpio: AlcanceTipo trae todo lo que la fila necesita", () => {
  it("campos nuevos de un tipo cualquiera", () => {
    const a: AlcanceTipo = alcancePorTipo([tipo("Polos", 20)], 30, HOY, CAMPANA, true)[0]!;
    expect(a).toMatchObject({ meta: 75, plazo: { dias: 30, origen: "terceros" }, pesa: 100, situacion: "no_llega", incompleto: false, ordenAbierta: false });
  });
});
