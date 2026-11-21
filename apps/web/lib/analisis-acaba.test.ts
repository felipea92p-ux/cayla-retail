import { describe, expect, it } from "vitest";
import type { LlegadaPrenda, PrendaAnalisis } from "./analisis-tipos";
import { DIAS_SE_ACABA } from "./analisis-reglas";
import {
  detalleAcaba,
  faltanDelModelo,
  fraseAcaba,
  numeroAcaba,
  prendasQueSeAcaban,
  TEXTO_VACIO_ACABA,
  textoPedirA,
  textoProveedor,
  textoViene,
  UNA_SEMANA,
  vacioAcaba,
} from "./analisis-acaba";
import { modeloDe } from "./analisis-modelo";

// Datos inventados para la prueba (no son de producción).
function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Blusa Prueba",
    color: "Lila",
    colorHex: null,
    talla: "M",
    categoria: "Blusas",
    categoriaPrefijo: "BLU",
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

const llegada = (parcial: Partial<LlegadaPrenda>): LlegadaPrenda => ({ de: "compra", cantidad: 1, fecha: null, ...parcial });

// Una tienda inventada: agotadas, por acabarse, que vienen en camino y que no se acaban.
const AGOTADA = prenda({ varianteId: "a", nombre: "Agotada", vendidas30: 6 });
const AGOTADA_LLEGA = prenda({ varianteId: "b", nombre: "Agotada que viene", vendidas30: 3, llega: [llegada({ cantidad: 4 })] });
const TRES_DIAS = prenda({ varianteId: "c", nombre: "Tres días", piso: 1, vendidas30: 10 });
const DOCE_DIAS = prenda({ varianteId: "d", nombre: "Doce días", piso: 2, vendidas30: 5, llega: [llegada({ de: "taller", cantidad: 2 })] });
const QUIETA = prenda({ varianteId: "e", nombre: "Quieta", piso: 4, diasSinVender: 70 });
const SOBRA = prenda({ varianteId: "f", nombre: "Sobra", piso: 30, vendidas30: 3 });
const TIENDA = [QUIETA, DOCE_DIAS, SOBRA, TRES_DIAS, AGOTADA_LLEGA, AGOTADA];

describe("lo que se acaba y su orden", () => {
  it("solo las del grupo «Cómpralas»: ni lo quieto ni lo que todavía alcanza", () => {
    const ids = prendasQueSeAcaban(TIENDA, 60).map((p) => p.varianteId);
    expect(ids).not.toContain("e");
    expect(ids).not.toContain("f");
    expect(ids).toHaveLength(4);
  });
  it("primero lo agotado (y entre agotadas, la que más se vendía); después, lo que dura menos", () => {
    expect(prendasQueSeAcaban(TIENDA, 60).map((p) => p.varianteId)).toEqual(["a", "b", "c", "d"]);
  });
  it("no cambia el arreglo que recibe", () => {
    const copia = [...TIENDA];
    prendasQueSeAcaban(TIENDA, 60);
    expect(TIENDA).toEqual(copia);
  });
});

describe("las otras píldoras y el botón de pedir", () => {
  it("sin otra tienda que la tenga: a quién se compra; sin origen conocido, nada", () => {
    expect(textoProveedor("taller")).toBe("Proveedor taller");
    expect(textoProveedor("terceros")).toBe("Proveedor terceros");
    expect(textoProveedor(null)).toBeNull();
  });
  it("el botón de pedir nombra la ciudad", () => {
    expect(textoPedirA({ ciudad: "Ciudad Prueba" })).toBe("o pedir a Ciudad Prueba");
  });
});

describe("cuando no hay carril", () => {
  it("con algo que se acaba, hay carril", () => {
    expect(vacioAcaba({ prendas: 10, seAcaban: 2, fallas: 0 })).toBeNull();
    expect(vacioAcaba({ prendas: 10, seAcaban: 2, fallas: 1 })).toBeNull();
  });
  it("nada se acaba: lo dice en positivo", () => {
    expect(vacioAcaba({ prendas: 10, seAcaban: 0, fallas: 0 })).toBe("nada");
    expect(vacioAcaba({ prendas: 10, seAcaban: 0, fallas: 1 })).toBe("nada");
    expect(TEXTO_VACIO_ACABA.nada).toEqual({ titulo: "Nada se está acabando", linea: "Todo lo que se vende te dura más de 2 semanas." });
  });
  it("si no llegó ni una prenda y algo falló al leer, no dice «va bien» por un error", () => {
    expect(vacioAcaba({ prendas: 0, seAcaban: 0, fallas: 1 })).toBe("sin-datos");
    expect(TEXTO_VACIO_ACABA["sin-datos"].titulo).toBe("No pude ver tus prendas");
  });
  it("una tienda sin prendas y sin fallas: nada se acaba", () => {
    expect(vacioAcaba({ prendas: 0, seAcaban: 0, fallas: 0 })).toBe("nada");
  });
});

describe("lo que falta de un modelo que se acaba (ADR-0357, decisión 12)", () => {
  const HOY = "2026-10-10";
  it("nombra la talla y el color agotados, de lo más vendido a lo menos; el color solo si el modelo tiene varios", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "a", color: "Lila", talla: "S", vendidas30: 1 }),
        prenda({ varianteId: "b", color: "Lila", talla: "M", piso: 1 }),
        prenda({ varianteId: "c", color: "Ocre", talla: "M", vendidas30: 3 }),
      ],
      HOY,
    );
    expect(faltanDelModelo(m)).toEqual({ texto: "Faltan M Ocre y S Lila", todas: ["M Ocre", "S Lila"] });
    const unColor = modeloDe([prenda({ varianteId: "a", talla: "S", vendidas30: 1 }), prenda({ varianteId: "b", talla: "M", piso: 2 })], HOY);
    expect(faltanDelModelo(unColor)?.texto).toBe("Falta S");
  });

  it("con más de dos, las cuenta y las nombra todas aparte; la talla única no se nombra", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "a", talla: "S" }),
        prenda({ varianteId: "b", talla: "M" }),
        prenda({ varianteId: "c", talla: "L" }),
        prenda({ varianteId: "d", talla: "XL", almacen: 1 }),
      ],
      HOY,
    );
    expect(faltanDelModelo(m)).toEqual({ texto: "Faltan 3", todas: ["S", "M", "L"] });
    const unica = modeloDe([prenda({ varianteId: "a", talla: "Única", color: "Lila" }), prenda({ varianteId: "b", talla: "Única", color: "Ocre", piso: 1 })], HOY);
    expect(faltanDelModelo(unica)?.texto).toBe("Falta Lila");
  });

  it("nada que decir si no falta ninguna o si se agotó el modelo entero (lo dice su pista)", () => {
    expect(faltanDelModelo(modeloDe([prenda({ piso: 1 })], HOY))).toBeNull();
    expect(faltanDelModelo(modeloDe([prenda({ varianteId: "a", vendidas30: 2 }), prenda({ varianteId: "b", talla: "L", vendidas30: 1 })], HOY))).toBeNull();
  });
});

describe("la tarjeta de un modelo que se acaba (cara B)", () => {
  const HOY = "2026-10-06";
  it("el número: los días que quedan con su unidad, o «Ya no hay»; urgente hasta una semana", () => {
    expect(numeroAcaba(AGOTADA)).toEqual({ numero: "Ya no hay", unidad: "", urgente: true });
    const tres = numeroAcaba(TRES_DIAS);
    expect(tres?.unidad).toBe("días te quedan");
    expect(Number(tres?.numero)).toBeLessThanOrEqual(UNA_SEMANA);
    expect(tres?.urgente).toBe(true);
    expect(numeroAcaba(DOCE_DIAS)?.urgente).toBe(false);
    expect(numeroAcaba(QUIETA)).toBeNull();
  });
  it("la frase de la respuesta dice el tope de días, en singular o plural", () => {
    expect(fraseAcaba(1)).toBe(`se acaba en ${DIAS_SE_ACABA / 7} semanas o menos`);
    expect(fraseAcaba(5)).toBe(`se acaban en ${DIAS_SE_ACABA / 7} semanas o menos`);
  });
  it("lo que viene: la primera fecha, hoy o atrasada; sin fecha, solo cuántas", () => {
    expect(textoViene(prenda({ llega: [llegada({ cantidad: 10, fecha: "2026-10-15" }), llegada({ cantidad: 2, fecha: "2026-10-08" })] }), HOY)).toBe("Llegan 12 el 8 oct.");
    expect(textoViene(prenda({ llega: [llegada({ cantidad: 1, fecha: HOY })] }), HOY)).toBe("Llega 1 hoy");
    expect(textoViene(prenda({ llega: [llegada({ cantidad: 4, fecha: "2026-10-01" })] }), HOY)).toBe("Llegan 4: debían llegar el 1 oct.");
    expect(textoViene(prenda({ llega: [llegada({ cantidad: 3 })] }), HOY)).toBe("Llegan 3");
    expect(textoViene(prenda({ llega: [llegada({ cantidad: 0 })] }), HOY)).toBeNull();
  });
  it("el detalle: lo que viene; si nada viene, quién más la tiene o a quién se compra", () => {
    const ciudad = (id: string) => (id === "s2" ? "Ciudad Prueba" : undefined);
    expect(detalleAcaba(modeloDe([AGOTADA_LLEGA], HOY), HOY, ciudad)).toBe("Llegan 4");
    const enOtra = prenda({ vendidas30: 6, otras: [{ sedeId: "s2", stock: 5, vendidas30: 1 }] });
    expect(detalleAcaba(modeloDe([enOtra], HOY), HOY, ciudad)).toBe("Ciudad Prueba tiene 5");
    expect(detalleAcaba(modeloDe([AGOTADA], HOY), HOY, ciudad)).toBe("Proveedor taller");
  });
});
