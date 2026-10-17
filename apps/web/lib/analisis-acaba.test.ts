import { describe, expect, it } from "vitest";
import type { LlegadaPrenda, PrendaAnalisis } from "./analisis-tipos";
import { DIAS_SE_ACABA, diasQueQuedan, porLlegar, seEstaAcabando } from "./analisis-reglas";
import {
  atrasoDe,
  colorDias,
  cuandoLlega,
  cuentasFiltroAcaba,
  EJE_ACABA,
  faltanDelModelo,
  FILTROS_ACABA,
  LINEA_SEMANA,
  lineasAtrasadas,
  lineasPorLlegar,
  notaAtrasada,
  pasaFiltroAcaba,
  pistaAcaba,
  prendasQueSeAcaban,
  seAcabaEnOtras,
  TEXTO_VACIO_ACABA,
  textoAtraso,
  textoLlegada,
  textoPedirA,
  textoProveedor,
  textoProveedorGenerico,
  textoTambienSeAcaba,
  tipOtraTienda,
  tipTambienSeAcaba,
  tituloAtrasada,
  tituloDelCarril,
  tituloPorLlegar,
  UNA_SEMANA,
  vacioAcaba,
  ventanasPorSede,
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

/** El día de las pruebas de los filtros (6 de octubre de 2026). */
const HOY = "2026-10-06";

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
    expect(seAcaban.filter((p) => pasaFiltroAcaba(p, "comprar", HOY)).map((p) => p.varianteId)).toEqual(["a", "c"]);
    expect(seAcaban.filter((p) => pasaFiltroAcaba(p, "llega", HOY)).map((p) => p.varianteId)).toEqual(["b", "d"]);
    expect(seAcaban.filter((p) => pasaFiltroAcaba(p, "todos", HOY))).toHaveLength(4);
  });
  it("una llegada en cero no cuenta como «Por llegar»", () => {
    const vacia = prenda({ vendidas30: 4, llega: [llegada({ cantidad: 0 })] });
    expect(pasaFiltroAcaba(vacia, "llega", HOY)).toBe(false);
    expect(pasaFiltroAcaba(vacia, "comprar", HOY)).toBe(true);
  });
  it("las cuentas de cada píldora coinciden con lo que muestra el filtro, y Comprar + Por llegar = Todos", () => {
    const c = cuentasFiltroAcaba(seAcaban, HOY);
    expect(c).toEqual({ todos: 4, comprar: 2, llega: 2 });
    for (const f of FILTROS_ACABA) expect(c[f.clave]).toBe(seAcaban.filter((p) => pasaFiltroAcaba(p, f.clave, HOY)).length);
    expect(c.comprar + c.llega).toBe(c.todos);
  });
  it("sin nada que se acabe, las tres en cero", () => {
    expect(cuentasFiltroAcaba([], HOY)).toEqual({ todos: 0, comprar: 0, llega: 0 });
  });

  // A3 (plan verificado 2026-10-16): una llegada cuya fecha estimada ya pasó no es stock ni lo será hasta que llegue; no debe esconder una compra.
  describe("una llegada atrasada vuelve a «Comprar»", () => {
    const atrasada = prenda({ varianteId: "t", nombre: "Atrasada", vendidas30: 3, llega: [llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" })] });
    const aTiempo = prenda({ varianteId: "u", nombre: "A tiempo", vendidas30: 3, llega: [llegada({ cantidad: 8, fecha: "2026-10-15" })] });
    const hoyMismo = prenda({ varianteId: "w", nombre: "Llega hoy", vendidas30: 3, llega: [llegada({ cantidad: 8, fecha: HOY })] });
    const sinFecha = prenda({ varianteId: "x", nombre: "Sin fecha", vendidas30: 3, llega: [llegada({ cantidad: 8, fecha: null })] });
    const mixta = prenda({ varianteId: "y", nombre: "Mixta", vendidas30: 3, llega: [llegada({ cantidad: 5, fecha: "2026-10-12" }), llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" })] });

    it("la atrasada sale de «Por llegar» y entra a «Comprar»; la que llega hoy, la de otro día y la sin fecha siguen en «Por llegar»", () => {
      const todas = [atrasada, aTiempo, hoyMismo, sinFecha];
      expect(todas.filter((p) => pasaFiltroAcaba(p, "comprar", HOY)).map((p) => p.varianteId)).toEqual(["t"]);
      expect(todas.filter((p) => pasaFiltroAcaba(p, "llega", HOY)).map((p) => p.varianteId)).toEqual(["u", "w", "x"]);
      expect(cuentasFiltroAcaba(todas, HOY)).toEqual({ todos: 4, comprar: 1, llega: 3 });
    });
    it("con una parte a tiempo y otra atrasada, lo que viene a tiempo la deja en «Por llegar»", () => {
      expect(pasaFiltroAcaba(mixta, "llega", HOY)).toBe(true);
      expect(pasaFiltroAcaba(mixta, "comprar", HOY)).toBe(false);
    });
    it("el mismo día de la fecha todavía se espera; al día siguiente ya está atrasada", () => {
      expect(pasaFiltroAcaba(hoyMismo, "comprar", HOY)).toBe(false);
      expect(pasaFiltroAcaba(hoyMismo, "comprar", "2026-10-07")).toBe(true);
    });
    it("las cuentas de las píldoras siguen sumando «Todos» con atrasadas", () => {
      const c = cuentasFiltroAcaba([atrasada, aTiempo, mixta], HOY);
      expect(c.comprar + c.llega).toBe(c.todos);
    });
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
    expect(tituloPorLlegar(p, HOY)).toBe("Por llegar: 13");
    expect(lineasPorLlegar(p, HOY)).toEqual(["Almacén: 2 · llega el 8 oct.", "Compra: 10 · llega el 15 oct.", "Taller: 1 · sin fecha"]);
  });
  it("no cambia el orden de lo que recibe", () => {
    const p = prenda({ llega: [llegada({ fecha: "2026-10-20" }), llegada({ fecha: "2026-10-10" })] });
    lineasPorLlegar(p, HOY);
    expect(p.llega.map((x) => x.fecha)).toEqual(["2026-10-20", "2026-10-10"]);
  });
  it("lo atrasado no va en «Por llegar»: su título, sus líneas y sus unidades dejan fuera lo vencido", () => {
    const p = prenda({
      llega: [
        llegada({ de: "compra", cantidad: 10, fecha: "2026-10-15" }),
        llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" }),
        llegada({ de: "almacen", cantidad: 2, fecha: "2026-10-01" }),
      ],
    });
    expect(tituloPorLlegar(p, HOY)).toBe("Por llegar: 10");
    expect(lineasPorLlegar(p, HOY)).toEqual(["Compra: 10 · llega el 15 oct."]);
  });
});

describe("«Por llegar 24 · en 4 días»: cuándo llega (F1)", () => {
  const HOY = "2026-10-16";
  const con = (...llega: LlegadaPrenda[]) => cuandoLlega(prenda({ llega }), HOY);
  it("si todo llega el mismo día: hoy, mañana o «en N días»", () => {
    expect(con(llegada({ cantidad: 24, fecha: "2026-10-20" }))).toBe("en 4 días");
    expect(con(llegada({ cantidad: 24, fecha: "2026-10-17" }))).toBe("mañana");
    expect(con(llegada({ cantidad: 24, fecha: HOY }))).toBe("hoy");
    // Dos partes el mismo día siguen siendo «un día».
    expect(con(llegada({ cantidad: 10, fecha: "2026-10-20" }), llegada({ de: "taller", cantidad: 14, fecha: "2026-10-20" }))).toBe("en 4 días");
  });
  it("si nadie anotó cuándo: «sin fecha» (no se inventa una)", () => {
    expect(con(llegada({ cantidad: 20, fecha: null }))).toBe("sin fecha");
    expect(con(llegada({ cantidad: 20, fecha: null }), llegada({ de: "taller", cantidad: 3, fecha: null }))).toBe("sin fecha");
  });
  it("con varias fechas, o una parte sin fecha, dice desde cuándo (la primera); el tooltip trae cada parte", () => {
    expect(con(llegada({ cantidad: 10, fecha: "2026-10-20" }), llegada({ cantidad: 6, fecha: "2027-01-05" }))).toBe("desde el 20 oct.");
    expect(con(llegada({ cantidad: 10, fecha: "2026-10-20" }), llegada({ cantidad: 6, fecha: null }))).toBe("desde el 20 oct.");
  });
  it("lo atrasado no cuenta (tiene su propia píldora) y sin nada a tiempo no hay «cuándo»", () => {
    expect(con(llegada({ cantidad: 8, fecha: "2026-10-01" }), llegada({ cantidad: 6, fecha: "2026-10-18" }))).toBe("en 2 días");
    expect(con(llegada({ cantidad: 8, fecha: "2026-10-01" }))).toBeNull();
    expect(con(llegada({ cantidad: 0, fecha: "2026-10-20" }))).toBeNull();
    expect(con()).toBeNull();
  });
});

describe("el título del carril sale del filtro (F1)", () => {
  it("Todos «Se están acabando», Comprar «Cómpralas», Por llegar «Ya vienen»; en singular con uno", () => {
    expect(tituloDelCarril("todos", 12)).toBe("Se están acabando");
    expect(tituloDelCarril("comprar", 8)).toBe("Cómpralas");
    expect(tituloDelCarril("llega", 4)).toBe("Ya vienen");
    expect(tituloDelCarril("todos", 1)).toBe("Se está acabando");
    expect(tituloDelCarril("comprar", 1)).toBe("Cómprala");
    expect(tituloDelCarril("llega", 1)).toBe("Ya viene");
  });
  it("no dice «Cómpralas» sobre lo que ya viene en camino (la compradora apretaba «Comprar» y pedía dos veces)", () => {
    for (const n of [1, 4]) expect(tituloDelCarril("llega", n).toLowerCase()).not.toContain("cómpral");
  });
  it("cada filtro tiene el suyo y distinto", () => {
    const titulos = FILTROS_ACABA.map((f) => tituloDelCarril(f.clave, 5));
    expect(new Set(titulos).size).toBe(FILTROS_ACABA.length);
  });
});

describe("«Atrasada»: la píldora y su tooltip", () => {
  const HOY = "2026-10-16";
  it("cuántas unidades y cuántos días lleva la que más se atrasó; null si nada se atrasó", () => {
    const p = prenda({ llega: [llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" }), llegada({ cantidad: 3, fecha: "2026-10-10" }), llegada({ cantidad: 5, fecha: "2026-10-20" })] });
    expect(atrasoDe(p, HOY)).toEqual({ unidades: 11, dias: 26 });
    expect(atrasoDe(prenda({ llega: [llegada({ cantidad: 5, fecha: HOY }), llegada({ cantidad: 5, fecha: null })] }), HOY)).toBeNull();
    expect(atrasoDe(prenda({ llega: [] }), HOY)).toBeNull();
    // Una parte sin unidades (un traslado sin líneas) no se atrasa: no hay nada que espere.
    expect(atrasoDe(prenda({ llega: [llegada({ de: "taller", cantidad: 0, fecha: "2026-09-20" })] }), HOY)).toBeNull();
  });
  it("la etiqueta dice los días («Atrasada 26 días», «Atrasada 1 día») y el título las unidades", () => {
    expect(textoAtraso(26)).toBe("Atrasada 26 días");
    expect(textoAtraso(1)).toBe("Atrasada 1 día");
    expect(tituloAtrasada(8)).toBe("Atrasada: 8 sin llegar");
  });
  it("la nota solo manda a «Comprar» si la prenda de verdad está ahí: con algo más que llega a tiempo, está en «Por llegar»", () => {
    // Nada más viene: la prenda vuelve a «Comprar» y la nota lo dice.
    const sola = prenda({ llega: [llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" })] });
    expect(pasaFiltroAcaba(sola, "comprar", HOY)).toBe(true);
    expect(notaAtrasada(8, porLlegar(sola, HOY) > 0)).toBe("No la cuento como que viene: sigue en «Comprar» hasta que llegue.");
    // Una parte a tiempo y otra atrasada: la prenda NO está en «Comprar»; la nota no puede mandar a una lista donde no está.
    const mixta = prenda({ llega: [llegada({ cantidad: 5, fecha: "2026-10-20" }), llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" })] });
    expect(pasaFiltroAcaba(mixta, "comprar", HOY)).toBe(false);
    const nota = notaAtrasada(8, porLlegar(mixta, HOY) > 0);
    expect(nota).toBe("Estas no las cuento como que vienen hasta que lleguen.");
    expect(nota).not.toContain("Comprar");
    expect(notaAtrasada(1, true)).toBe("Esta no la cuento como que viene hasta que llegue.");
  });
  it("las líneas son solo las vencidas, de la que más se atrasó a la que menos", () => {
    const p = prenda({
      llega: [llegada({ cantidad: 3, fecha: "2026-10-10" }), llegada({ de: "taller", cantidad: 8, fecha: "2026-09-20" }), llegada({ cantidad: 5, fecha: "2026-10-20" })],
    });
    expect(lineasAtrasadas(p, HOY)).toEqual(["Taller: 8 · debía llegar el 20 set.", "Compra: 3 · debía llegar el 10 oct."]);
  });
});

describe("las otras píldoras y el botón de pedir", () => {
  it("sin otra tienda que la tenga: a quién se compra; sin origen conocido, nada", () => {
    expect(textoProveedor("taller")).toBe("Proveedor taller");
    expect(textoProveedor("terceros")).toBe("Proveedor terceros");
    expect(textoProveedor(null)).toBeNull();
  });
  it("la etiqueta genérica solo sale si la fila no pudo decir a quién se pide (A8): con el nombre en «Pídelo a …», no se repite", () => {
    // Proveedores sin leer (quien = null): queda lo de siempre.
    expect(textoProveedorGenerico(null, "terceros")).toBe("Proveedor terceros");
    expect(textoProveedorGenerico(null, "taller")).toBe("Proveedor taller");
    expect(textoProveedorGenerico(null, null)).toBeNull();
    // Se pudo nombrar (compra, catálogo o Taller): la etiqueta sobra.
    expect(textoProveedorGenerico({ fuente: "compra", id: "x", nombre: "Hilos del Sur" }, "terceros")).toBeNull();
    expect(textoProveedorGenerico({ fuente: "catalogo", id: "x", nombre: "Textil Andino" }, null)).toBeNull();
    expect(textoProveedorGenerico({ fuente: "taller" }, "taller")).toBeNull();
    // Origen «terceros» con un proveedor que no se pudo nombrar: la fila no dice «Pídelo a …», así que la etiqueta sí.
    expect(textoProveedorGenerico({ fuente: "ninguno" }, "terceros")).toBe("Proveedor terceros");
    expect(textoProveedorGenerico({ fuente: "ninguno" }, null)).toBeNull();
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

// ───────────────────────── «También se acaba en otra tienda» (A8) ─────────────────────────

describe("ventanasPorSede y seAcabaEnOtras: el mismo modelo falta en más de una tienda", () => {
  // Hoy 6-oct. TRU vende desde el 29-sep (8 días), AQP desde hace más de 30 días; LIM no tiene motor leído.
  const ventanas = ventanasPorSede(
    [
      { ubicacionId: "tru", primeraVenta: "2026-09-29" },
      { ubicacionId: "aqp", primeraVenta: "2026-08-01" },
      { ubicacionId: "lim", primeraVenta: null },
    ],
    HOY,
  );

  it("los días de ventas de cada tienda, hasta 30; sin primera venta, 30 (no hay ritmo que medir)", () => {
    expect(ventanas).toEqual({ tru: 8, aqp: 30, lim: 30 });
    expect(ventanasPorSede([], HOY)).toEqual({});
  });

  it("también se acaba donde se vende y lo que tiene dura dos semanas o menos, con los días DE ESA tienda", () => {
    // AQP: 5 en total, vendió 30 en 30 días: 1 por día → 5 días. TRU: vendió 4 en sus 8 días → 0,5 por día → 3 en 6 días.
    const r = seAcabaEnOtras(
      [
        { sedeId: "aqp", stock: 5, vendidas30: 30 },
        { sedeId: "tru", stock: 3, vendidas30: 4 },
      ],
      ventanas,
    );
    expect(r).toEqual([
      { sedeId: "aqp", dias: 5, stock: 5, vendidas30: 30 },
      { sedeId: "tru", dias: 6, stock: 3, vendidas30: 4 },
    ]);
    expect(r.map((o) => o.dias)).toEqual([...r.map((o) => o.dias)].sort((a, b) => a - b));
  });

  it("allá ya no tiene y se vende: «también se agotó» (0 días), y es lo más urgente", () => {
    const r = seAcabaEnOtras(
      [
        { sedeId: "aqp", stock: 2, vendidas30: 30 },
        { sedeId: "tru", stock: 0, vendidas30: 3 },
      ],
      ventanas,
    );
    expect(r.map((o) => [o.sedeId, o.dias])).toEqual([["tru", 0], ["aqp", 2]]);
    expect(textoTambienSeAcaba({ dias: 0 })).toBe("también se agotó");
    expect(textoTambienSeAcaba({ dias: 2 })).toBe("también se acaba");
  });

  it("no cuenta donde no se vende, donde alcanza para más de dos semanas, ni donde no se conoce su ventana", () => {
    expect(seAcabaEnOtras([{ sedeId: "aqp", stock: 0, vendidas30: 0 }], ventanas)).toEqual([]); // sin ventas: no hay ritmo
    expect(seAcabaEnOtras([{ sedeId: "aqp", stock: 20, vendidas30: 30 }], ventanas)).toEqual([]); // 20 días
    expect(seAcabaEnOtras([{ sedeId: "aqp", stock: 14, vendidas30: 30 }], ventanas)).toHaveLength(1); // 14: el borde cuenta
    expect(seAcabaEnOtras([{ sedeId: "aqp", stock: 15, vendidas30: 30 }], ventanas)).toEqual([]);
    expect(seAcabaEnOtras([{ sedeId: "otra", stock: 0, vendidas30: 9 }], ventanas)).toEqual([]); // no se leyó su motor: no se dice nada
    expect(seAcabaEnOtras([], ventanas)).toEqual([]);
  });

  it("el tooltip dice qué pasa allá y que una orden de compra lleva un solo destino, sin sugerir cantidades", () => {
    const aqp = { ciudad: "Arequipa" };
    expect(tipTambienSeAcaba(aqp, { dias: 5 })).toBe("Arequipa también se queda sin él: al ritmo que vende, le quedan 5 días. Una orden de compra tiene un solo destino: piénsalo también para Arequipa.");
    expect(tipTambienSeAcaba(aqp, { dias: 1 })).toContain("le queda 1 día.");
    expect(tipTambienSeAcaba(aqp, { dias: 0 })).toBe("Arequipa ya no tiene y lo vende. Una orden de compra tiene un solo destino: piénsalo también para Arequipa.");
    expect(tipTambienSeAcaba(aqp, { dias: 5 })).not.toMatch(/\bpide\s+\d|\bcompra\s+\d|unidades/i);
  });
});
