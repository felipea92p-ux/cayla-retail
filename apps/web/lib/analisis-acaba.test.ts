import { describe, expect, it } from "vitest";
import type { LlegadaPrenda, PrendaAnalisis } from "./analisis-tipos";
import { DIAS_SE_ACABA, diasQueQuedan, seEstaAcabando } from "./analisis-reglas";
import {
  colorDias,
  cuentasFiltroAcaba,
  EJE_ACABA,
  FILTROS_ACABA,
  LINEA_SEMANA,
  lineasPorLlegar,
  pasaFiltroAcaba,
  pistaAcaba,
  prendasQueSeAcaban,
  TEXTO_VACIO_ACABA,
  textoLlegada,
  textoPedirA,
  textoProveedor,
  tipOtraTienda,
  tituloPorLlegar,
  UNA_SEMANA,
  vacioAcaba,
} from "./analisis-acaba";

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

describe("los filtros Todos · Comprar · Por llegar", () => {
  const seAcaban = prendasQueSeAcaban(TIENDA, 60);
  it("son tres, en el orden de la maqueta", () => {
    expect(FILTROS_ACABA.map((f) => f.texto)).toEqual(["Todos", "Comprar", "Por llegar"]);
  });
  it("«Comprar» es lo que no viene en camino; «Por llegar», lo que sí", () => {
    expect(seAcaban.filter((p) => pasaFiltroAcaba(p, "comprar")).map((p) => p.varianteId)).toEqual(["a", "c"]);
    expect(seAcaban.filter((p) => pasaFiltroAcaba(p, "llega")).map((p) => p.varianteId)).toEqual(["b", "d"]);
    expect(seAcaban.filter((p) => pasaFiltroAcaba(p, "todos"))).toHaveLength(4);
  });
  it("una llegada en cero no cuenta como «Por llegar»", () => {
    const vacia = prenda({ vendidas30: 4, llega: [llegada({ cantidad: 0 })] });
    expect(pasaFiltroAcaba(vacia, "llega")).toBe(false);
    expect(pasaFiltroAcaba(vacia, "comprar")).toBe(true);
  });
  it("las cuentas de cada píldora coinciden con lo que muestra el filtro, y Comprar + Por llegar = Todos", () => {
    const c = cuentasFiltroAcaba(seAcaban);
    expect(c).toEqual({ todos: 4, comprar: 2, llega: 2 });
    for (const f of FILTROS_ACABA) expect(c[f.clave]).toBe(seAcaban.filter((p) => pasaFiltroAcaba(p, f.clave)).length);
    expect(c.comprar + c.llega).toBe(c.todos);
  });
  it("sin nada que se acabe, las tres en cero", () => {
    expect(cuentasFiltroAcaba([])).toEqual({ todos: 0, comprar: 0, llega: 0 });
  });
});

describe("la pista de días", () => {
  it("el eje va de 0 a 2 semanas, con la semana a la mitad (donde va la línea punteada)", () => {
    expect(EJE_ACABA).toEqual([
      { texto: "0", left: "0%" },
      { texto: "1 semana", left: "50%" },
      { texto: "2 semanas", left: "100%" },
    ]);
    expect(LINEA_SEMANA).toBe("50%");
  });
  it("color: rojo hasta una semana, ámbar hasta dos, taupe más allá", () => {
    expect(colorDias(1)).toBe("var(--color-rojo-profundo)");
    expect(colorDias(UNA_SEMANA)).toBe("var(--color-rojo-profundo)");
    expect(colorDias(UNA_SEMANA + 1)).toBe("var(--color-ambar)");
    expect(colorDias(DIAS_SE_ACABA)).toBe("var(--color-ambar)");
    expect(colorDias(DIAS_SE_ACABA + 1)).toBe("var(--color-taupe)");
  });
  it("agotada: «Se agotó», sin barra", () => {
    expect(pistaAcaba(0)).toEqual({ agotada: true, texto: "Se agotó" });
  });
  it("con días: la barra es la parte de 2 semanas, y el texto dice los días", () => {
    expect(pistaAcaba(1)).toEqual({ agotada: false, n: 1 / 14, color: "var(--color-rojo-profundo)", texto: "1 día", dentro: false });
    expect(pistaAcaba(7)).toMatchObject({ n: 0.5, texto: "7 días", dentro: false });
    expect(pistaAcaba(14)).toMatchObject({ n: 1, color: "var(--color-ambar)", texto: "14 días" });
  });
  it("los días se escriben dentro de la barra solo cuando casi la llena", () => {
    expect(pistaAcaba(11)).toMatchObject({ dentro: false });
    expect(pistaAcaba(12)).toMatchObject({ dentro: true });
  });
  it("la barra nunca pasa de la pista", () => {
    expect(pistaAcaba(40)).toMatchObject({ n: 1 });
  });
  it("sin ritmo (no se vende) no hay pista", () => {
    expect(pistaAcaba(null)).toBeNull();
  });
  it("toda prenda que se acaba tiene su pista (ninguna fila queda sin días)", () => {
    for (const p of prendasQueSeAcaban(TIENDA, 60)) {
      expect(seEstaAcabando(p)).toBe(true);
      expect(pistaAcaba(diasQueQuedan(p))).not.toBeNull();
    }
  });
});

describe("«Por llegar»: la píldora y su tooltip", () => {
  const HOY = "2026-10-06";
  it("cada parte con su origen, como se dice en tienda", () => {
    expect(textoLlegada(llegada({ de: "compra", cantidad: 10, fecha: "2026-10-15" }), HOY)).toBe("Compra: 10 · llega el 15 oct.");
    expect(textoLlegada(llegada({ de: "almacen", cantidad: 2, fecha: "2026-10-08" }), HOY)).toBe("Almacén: 2 · llega el 8 oct.");
    expect(textoLlegada(llegada({ de: "taller", cantidad: 1, fecha: "2026-11-02" }), HOY)).toBe("Taller: 1 · llega el 2 nov.");
    expect(textoLlegada(llegada({ de: "tienda", cantidad: 3, fecha: "2026-10-09" }), HOY)).toBe("Otra tienda: 3 · llega el 9 oct.");
  });
  it("hoy, atrasada o sin fecha: nunca dice «llega el» de un día que ya pasó", () => {
    expect(textoLlegada(llegada({ cantidad: 4, fecha: HOY }), HOY)).toBe("Compra: 4 · llega hoy");
    expect(textoLlegada(llegada({ cantidad: 4, fecha: "2026-10-01" }), HOY)).toBe("Compra: 4 · debía llegar el 1 oct.");
    expect(textoLlegada(llegada({ cantidad: 4, fecha: null }), HOY)).toBe("Compra: 4 · sin fecha");
  });
  it("el título suma todas las partes, y las líneas van de lo que llega antes a lo que llega después", () => {
    const p = prenda({
      llega: [
        llegada({ de: "compra", cantidad: 10, fecha: "2026-10-15" }),
        llegada({ de: "taller", cantidad: 1, fecha: null }),
        llegada({ de: "almacen", cantidad: 2, fecha: "2026-10-08" }),
      ],
    });
    expect(tituloPorLlegar(p)).toBe("Por llegar: 13");
    expect(lineasPorLlegar(p, HOY)).toEqual(["Almacén: 2 · llega el 8 oct.", "Compra: 10 · llega el 15 oct.", "Taller: 1 · sin fecha"]);
  });
  it("no cambia el orden de lo que recibe", () => {
    const p = prenda({ llega: [llegada({ fecha: "2026-10-20" }), llegada({ fecha: "2026-10-10" })] });
    lineasPorLlegar(p, HOY);
    expect(p.llega.map((x) => x.fecha)).toEqual(["2026-10-20", "2026-10-10"]);
  });
});

describe("las otras píldoras y el botón de pedir", () => {
  it("sin otra tienda que la tenga: a quién se compra; sin origen conocido, nada", () => {
    expect(textoProveedor("taller")).toBe("Proveedor taller");
    expect(textoProveedor("terceros")).toBe("Proveedor terceros");
    expect(textoProveedor(null)).toBeNull();
  });
  it("si otra tienda la tiene: cuántas y qué hacer, y el botón nombra la ciudad", () => {
    const sede = { ciudad: "Ciudad Prueba" };
    expect(tipOtraTienda(sede, 3)).toBe("Ciudad Prueba tiene 3. Toca la prenda para ver cuánto vende cada tienda y decide si pedirla.");
    expect(textoPedirA(sede)).toBe("o pedir a Ciudad Prueba");
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
