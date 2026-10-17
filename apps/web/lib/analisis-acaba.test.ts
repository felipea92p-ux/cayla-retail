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
  lecturaDeRitmo,
  lineasPorLlegar,
  llegaTarde,
  notaAtrasada,
  notaDeRitmo,
  pasaFiltroAcaba,
  pistaAcaba,
  prendasQueSeAcaban,
  seAcabaEnOtras,
  TEXTO_VACIO_ACABA,
  textoAtraso,
  textoDejasDeGanar,
  textoLlegaTarde,
  textoTeDura,
  TIP_DEJAS_DE_GANAR,
  tipLlegaTarde,
  tipRitmo,
  tipUnaVenta,
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

describe("una sola venta no grita en rojo en la pista (D6, 2026-10-16)", () => {
  it("la barra de una semana o menos va en ámbar (no rojo); de ahí en adelante, como siempre", () => {
    expect(pistaAcaba(1, true)).toMatchObject({ agotada: false, color: "var(--color-ambar)" });
    expect(pistaAcaba(UNA_SEMANA, true)).toMatchObject({ color: "var(--color-ambar)" });
    expect(pistaAcaba(UNA_SEMANA + 1, true)).toMatchObject({ color: "var(--color-ambar)" });
    expect(pistaAcaba(DIAS_SE_ACABA + 1, true)).toMatchObject({ color: "var(--color-taupe)" });
  });
  it("lo agotado de una sola venta va suave; el de varias ventas, igual que siempre (sin la marca)", () => {
    expect(pistaAcaba(0, true)).toEqual({ agotada: true, texto: "Se agotó", suave: true });
    expect(pistaAcaba(0, false)).toEqual({ agotada: true, texto: "Se agotó" });
    expect(pistaAcaba(0)).toEqual({ agotada: true, texto: "Se agotó" });
  });
  it("sin la bandera nada cambia: el rojo de lo demás es de la escala de urgencia, no de este cambio", () => {
    expect(pistaAcaba(3)).toMatchObject({ color: "var(--color-rojo-profundo)" });
    expect(pistaAcaba(3, false)).toMatchObject({ color: "var(--color-rojo-profundo)" });
  });
});

describe("el ritmo con su base: «Vendió N en D días» y lo que puede pasar (A5)", () => {
  const ritmo = (parcial: Partial<PrendaAnalisis>) => lecturaDeRitmo(prenda(parcial), HOY)!;

  it("2 ventas en 7 días con 4 en stock: la respuesta es el peor caso y el rango, el detalle", () => {
    const r = ritmo({ piso: 4, vendidas30: 2, diasDeVentas: 7 });
    expect(r.vendio).toBe("Vendió 2 en 7 días");
    expect(r.hasta).toBe("o durar hasta 53 días");
    expect(r.entre).toBe("entre 5 y 53 días");
    expect(r.unaVenta).toBe(false);
    expect(r.agotada).toBe(false);
    expect(r.ultima).toBeNull();
    expect(r.margenDia).toBeNull();
  });

  it("1 venta en 9 días con 1 en stock: lo marca como una sola venta y dice el rango (2 a 85 días)", () => {
    const r = ritmo({ piso: 1, vendidas30: 1, diasDeVentas: 9 });
    expect(r.vendio).toBe("Vendió 1 en 9 días");
    expect(r.entre).toBe("entre 2 y 85 días");
    expect(r.hasta).toBe("o durar hasta 85 días");
    expect(r.unaVenta).toBe(true);
  });

  it("singular: «1 día» y la talla del plural se respeta", () => {
    expect(ritmo({ piso: 1, vendidas30: 40, diasDeVentas: 1 }).vendio).toBe("Vendió 40 en 1 día");
    expect(ritmo({ piso: 1, vendidas30: 40, diasDeVentas: 1 }).entre).toBe("1 día");
  });

  it("sin venta no hay base que decir", () => {
    expect(lecturaDeRitmo(prenda({ piso: 5, vendidas30: 0 }), HOY)).toBeNull();
  });

  it("la ventana es la misma de los días de la barra: sin `diasDeVentas`, 30; nunca más de 30 ni menos de 1", () => {
    expect(ritmo({ piso: 3, vendidas30: 3 }).vendio).toBe("Vendió 3 en 30 días");
    expect(ritmo({ piso: 3, vendidas30: 3, diasDeVentas: 99 }).vendio).toBe("Vendió 3 en 30 días");
    expect(ritmo({ piso: 3, vendidas30: 3, diasDeVentas: 0 }).vendio).toBe("Vendió 3 en 1 día");
  });

  it("el peor caso nunca pasa de los días de la barra, ni el mejor baja de ellos", () => {
    for (const ventana of [7, 11, 17, 30]) {
      for (let ventas = 1; ventas <= 40; ventas++) {
        for (let piso = 1; piso <= 20; piso++) {
          const p = prenda({ piso, vendidas30: ventas, diasDeVentas: ventana });
          if (!seEstaAcabando(p)) continue;
          const r = lecturaDeRitmo(p, HOY)!;
          const barra = diasQueQuedan(p)!;
          // El peor caso («entre N y …») no promete más que la barra; si el rango se abre, el «hasta» no es menos.
          const peor = Number(r.entre!.match(/\d+/)![0]);
          expect(peor).toBeLessThanOrEqual(barra);
          if (r.hasta) expect(Number(r.hasta.match(/\d+/)![0])).toBeGreaterThanOrEqual(barra);
        }
      }
    }
  });

  it("si el rango no se abre, no repite el número: «1 día» y nada más", () => {
    const r = ritmo({ piso: 1, vendidas30: 90, diasDeVentas: 7 });
    expect(r.hasta).toBeNull();
    expect(r.entre).toBe("1 día");
  });

  it("más de un año no se escribe en días: «más de un año»", () => {
    const r = ritmo({ piso: 40, vendidas30: 1, diasDeVentas: 30 });
    expect(r.hasta).toBe("o durar más de un año");
    expect(r.entre).toBe("entre 309 días y más de un año");
  });

  it("agotada: no hay días que contar; dice cuándo fue la última venta y cuánto dejas de ganar por día (A15)", () => {
    // 3 ventas en 10 días a S/ 50 con costo S/ 20: 0,3 por día × (50 / 1,18 − 20 = S/ 22,37) = S/ 6,71 (~S/ 7) por día. La última, hace 3 días.
    const r = ritmo({ vendidas30: 3, diasDeVentas: 10, precio: 50, costo: 20, ultimaVenta: "2026-10-03" });
    expect(r.agotada).toBe(true);
    expect([r.hasta, r.entre]).toEqual([null, null]);
    expect(r.hace).toBe("hace 3 días");
    expect(r.ultima).toBe("última venta hace 3 días");
    expect(r.margenDia).toBe(7);
  });

  it("la última venta se dice como se dice en tienda: hoy, ayer, hace N días; sin dato, nada", () => {
    expect(ritmo({ vendidas30: 3, ultimaVenta: HOY }).ultima).toBe("última venta hoy");
    expect(ritmo({ vendidas30: 3, ultimaVenta: "2026-10-05" }).ultima).toBe("última venta ayer");
    expect(ritmo({ vendidas30: 3, ultimaVenta: "2026-09-20" }).ultima).toBe("última venta hace 16 días");
    expect(ritmo({ vendidas30: 3, ultimaVenta: null }).ultima).toBeNull();
    expect(ritmo({ vendidas30: 3 }).ultima).toBeNull();
    // Una fecha adelantada (reloj de otra máquina) no dice «hace -2 días».
    expect(ritmo({ vendidas30: 3, ultimaVenta: "2026-10-09" }).ultima).toBe("última venta hoy");
    // Con stock no se dice la última venta: todavía la estás vendiendo.
    expect(ritmo({ piso: 4, vendidas30: 3, ultimaVenta: HOY }).ultima).toBeNull();
  });

  it("sin costo (o sin precio) no inventa lo que dejas de ganar; con ganancia cero tampoco", () => {
    expect(ritmo({ vendidas30: 3, costo: null }).margenDia).toBeNull();
    expect(ritmo({ vendidas30: 3, precio: null }).margenDia).toBeNull();
    expect(ritmo({ vendidas30: 3, precio: 20, costo: 20 }).margenDia).toBeNull();
  });

  it("lo que se acaba pero todavía tiene stock no dice «dejas de ganar»", () => {
    expect(ritmo({ piso: 2, vendidas30: 6, diasDeVentas: 12 }).margenDia).toBeNull();
  });

  it("los tooltips: una sola venta dice por qué no fiarse; el rango dice de dónde sale; nada de jerga", () => {
    const una = ritmo({ piso: 1, vendidas30: 1, diasDeVentas: 9 });
    expect(tipUnaVenta(una)).toBe("Solo se registró una venta de esta prenda: con tan poco no se sabe el ritmo. Te puede durar entre 2 y 85 días.");
    expect(tipUnaVenta(ritmo({ vendidas30: 1, diasDeVentas: 9 }))).toBe("Solo se registró una venta de esta prenda: con tan poco no se sabe si se repite.");
    expect(tipRitmo(ritmo({ piso: 4, vendidas30: 2, diasDeVentas: 7 }))).toBe("Según lo vendido hasta hoy, te puede durar entre 5 y 53 días.");
    expect(tipRitmo(ritmo({ vendidas30: 2, diasDeVentas: 7 }))).toBeNull();
    const todo = JSON.stringify([una, tipUnaVenta(una), tipRitmo(una), TIP_DEJAS_DE_GANAR, textoDejasDeGanar("S/\u00a09")]);
    expect(todo).not.toMatch(/poisson|80 ?%|intervalo|confianza|estad/i);
  });

  it("«dejas de ganar ~S/ 9 al día»: lleva «~» porque es una estimación, y el monto viene escrito aparte (S/ con espacio que no se parte)", () => {
    expect(textoDejasDeGanar("S/\u00a09")).toBe("dejas de ganar ~S/\u00a09 al día");
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
    // Un solo color: se cuentan tallas («Faltan 3» a secas no decía si eran tallas, colores o unidades).
    expect(faltanDelModelo(m)).toEqual({ texto: "Faltan 3 tallas", todas: ["S", "M", "L"] });
    const unica = modeloDe([prenda({ varianteId: "a", talla: "Única", color: "Lila" }), prenda({ varianteId: "b", talla: "Única", color: "Ocre", piso: 1 })], HOY);
    expect(faltanDelModelo(unica)?.texto).toBe("Falta Lila");
  });

  it("con varios colores y más de dos agotadas, dice «Faltan 3 tallas o colores» (no «Faltan 3» a secas) y las nombra todas aparte; con una, «Falta L Blanco»", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "a", color: "Blanco", talla: "S", vendidas30: 3 }),
        prenda({ varianteId: "b", color: "Blanco", talla: "L", vendidas30: 2 }),
        prenda({ varianteId: "c", color: "Negro", talla: "M", vendidas30: 1 }),
        prenda({ varianteId: "d", color: "Negro", talla: "L", piso: 2 }),
      ],
      HOY,
    );
    expect(faltanDelModelo(m)).toEqual({ texto: "Faltan 3 tallas o colores", todas: ["S Blanco", "L Blanco", "M Negro"] });
    const una = modeloDe([prenda({ varianteId: "a", color: "Blanco", talla: "L", vendidas30: 2 }), prenda({ varianteId: "b", color: "Negro", talla: "L", piso: 2 })], HOY);
    expect(faltanDelModelo(una)).toEqual({ texto: "Falta L Blanco", todas: ["L Blanco"] });
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

// ───────── Segundo pase visual (2026-10-17): «Llega tarde», una sola frase por fila y «Te dura» en una tarjeta ─────────

describe("«Llega tarde»: lo que viene llega DESPUÉS de que se acaba (peor caso)", () => {
  // 6 en el piso y 30 vendidas en 30 días: la barra dice 6 días y el peor caso, 5 (rango 5 a 8, sin separarse mucho). Hoy 6 de octubre.
  const vestido = (llega: LlegadaPrenda[], parcial: Partial<PrendaAnalisis> = {}) => prenda({ piso: 6, vendidas30: 30, diasDeVentas: 30, llega, ...parcial });
  const en = (dias: number) => {
    const d = new Date(Date.UTC(2026, 9, 6 + dias));
    return d.toISOString().slice(0, 10);
  };

  it("llega DESPUÉS: dice cuántos días te quedas sin, al ritmo de la barra («unos 4») y en el peor caso («hasta 5»)", () => {
    const t = llegaTarde(vestido([llegada({ cantidad: 15, fecha: en(10) })]), HOY);
    expect(t).toEqual({ llegaEn: 10, peor: 5, hasta: 5, unos: 4 });
    expect(textoLlegaTarde(t!)).toBe("Llega tarde · te quedas unos 4 días sin stock");
  });

  it("llega ANTES: no avisa nada", () => {
    expect(llegaTarde(vestido([llegada({ fecha: en(2) })]), HOY)).toBeNull();
    expect(llegaTarde(vestido([llegada({ fecha: en(4) })]), HOY)).toBeNull();
  });

  it("llega JUSTO el día en que se acaba (el peor caso): tampoco; un día después, sí", () => {
    expect(llegaTarde(vestido([llegada({ fecha: en(5) })]), HOY)).toBeNull();
    expect(llegaTarde(vestido([llegada({ fecha: en(6) })]), HOY)).toMatchObject({ llegaEn: 6, peor: 5, hasta: 1, unos: 0 });
  });

  it("llega después del peor caso pero a tiempo al ritmo de la barra: «Puede llegar tarde», sin inventar un número de días", () => {
    // 2 en el piso, 6 vendidas en 12 días: la barra dice 4 días, el peor caso 2. Llega en 3.
    const t = llegaTarde(prenda({ piso: 2, vendidas30: 6, diasDeVentas: 12, llega: [llegada({ fecha: en(3) })] }), HOY)!;
    expect(t).toEqual({ llegaEn: 3, peor: 2, hasta: 1, unos: 0 });
    expect(textoLlegaTarde(t)).toBe("Puede llegar tarde");
    expect(tipLlegaTarde(t)).toBe("Lo que viene llega en 3 días. Al ritmo de la barra llega a tiempo, pero si se vende más rápido, se acaba en 2 días y te quedas hasta 1 día sin stock.");
  });

  it("SIN FECHA no se afirma nada: ni «tarde» ni «a tiempo» (y no se inventa una fecha)", () => {
    expect(llegaTarde(vestido([llegada({ cantidad: 15, fecha: null })]), HOY)).toBeNull();
    // Con una parte sin fecha y otra con fecha tampoco: no se sabe cuándo llega lo primero (quizá la que no tiene fecha llega mañana).
    expect(llegaTarde(vestido([llegada({ fecha: null }), llegada({ fecha: en(10) })]), HOY)).toBeNull();
  });

  it("de varias partes con fecha, cuenta la PRIMERA que llega: si esa llega a tiempo, no es tarde aunque otra llegue después", () => {
    expect(llegaTarde(vestido([llegada({ fecha: en(3) }), llegada({ fecha: en(20) })]), HOY)).toBeNull();
    expect(llegaTarde(vestido([llegada({ fecha: en(20) }), llegada({ fecha: en(10) })]), HOY)).toMatchObject({ llegaEn: 10 });
  });

  it("AGOTADO: lo que llegue de mañana en adelante es tarde (el peor caso son 0 días); hoy, no", () => {
    const agotado = (llega: LlegadaPrenda[]) => prenda({ vendidas30: 3, diasDeVentas: 10, llega });
    expect(llegaTarde(agotado([llegada({ fecha: en(0) })]), HOY)).toBeNull();
    expect(llegaTarde(agotado([llegada({ fecha: en(1) })]), HOY)).toEqual({ llegaEn: 1, peor: 0, hasta: 1, unos: 1 });
    expect(textoLlegaTarde(llegaTarde(agotado([llegada({ fecha: en(1) })]), HOY)!)).toBe("Llega tarde · te quedas 1 día sin stock");
    const cinco = llegaTarde(agotado([llegada({ fecha: en(5) })]), HOY)!;
    expect(textoLlegaTarde(cinco)).toBe("Llega tarde · te quedas unos 5 días sin stock");
    expect(tipLlegaTarde(cinco)).toBe("Ya no hay y lo que viene llega en 5 días: te quedas 5 días sin stock.");
  });

  it("lo ATRASADO no cuenta (tiene su propia píldora), sin ventas no hay ritmo, y una cantidad en cero no llega", () => {
    expect(llegaTarde(vestido([llegada({ fecha: "2026-10-01" })]), HOY)).toBeNull();
    expect(llegaTarde(prenda({ piso: 6, vendidas30: 0, llega: [llegada({ fecha: en(10) })] }), HOY)).toBeNull();
    expect(llegaTarde(vestido([llegada({ cantidad: 0, fecha: en(10) })]), HOY)).toBeNull();
    expect(llegaTarde(vestido([]), HOY)).toBeNull();
  });

  it("NO cambia en qué filtro cae la prenda: sigue en «Por llegar» (eso lo decide Felipe)", () => {
    const p = vestido([llegada({ cantidad: 15, fecha: en(10) })]);
    expect(llegaTarde(p, HOY)).not.toBeNull();
    expect(pasaFiltroAcaba(p, "llega", HOY)).toBe(true);
    expect(pasaFiltroAcaba(p, "comprar", HOY)).toBe(false);
  });

  it("el tooltip dice qué pasa al ritmo de la barra y en el peor caso, sin cantidades y sin jerga", () => {
    const t = llegaTarde(vestido([llegada({ fecha: en(10) })]), HOY)!;
    expect(tipLlegaTarde(t)).toBe("Lo que viene llega en 10 días, después de lo que te dura: al ritmo de la barra, unos 4 días sin stock; si se vende más rápido, se acaba en 5 días y te quedas hasta 5 días sin stock.");
    expect(tipLlegaTarde(t)).not.toMatch(/poisson|80 ?%|intervalo|\bpide\s+\d|unidades/i);
  });
});

describe("la nota bajo la barra: UNA sola frase (segundo pase visual, 2026-10-17)", () => {
  const ritmo = (parcial: Partial<PrendaAnalisis>) => lecturaDeRitmo(prenda(parcial), HOY)!;

  it("con el rango separado de la cifra: «Vendió 2 en 7 días · entre 5 y 53 días», sin «puede acabarse» ni «o durar hasta»", () => {
    const n = notaDeRitmo(ritmo({ piso: 4, vendidas30: 2, diasDeVentas: 7 }), null);
    expect(n).toEqual({ base: "Vendió 2 en 7 días · entre 5 y 53 días", dejas: null });
    expect(n.base).not.toMatch(/puede acabarse|o durar/);
  });

  it("si el rango no se separa de la cifra, solo «Vendió 90 en 7 días» (no repite el número)", () => {
    expect(notaDeRitmo(ritmo({ piso: 1, vendidas30: 90, diasDeVentas: 7 }), null).base).toBe("Vendió 90 en 7 días");
  });

  it("agotada: la última venta, y lo que dejas de ganar aparte (la pantalla le pone su tooltip)", () => {
    const l = ritmo({ vendidas30: 10, diasDeVentas: 13, precio: 189, costo: 60, ultimaVenta: "2026-10-05" });
    const n = notaDeRitmo(l, textoDejasDeGanar("S/\u00a055"));
    expect(n).toEqual({ base: "Vendió 10 en 13 días · última venta ayer", dejas: "dejas de ganar ~S/\u00a055 al día" });
  });

  it("agotada sin última venta conocida ni costo: solo lo vendido; con stock, nunca «dejas de ganar» aunque se lo pasen", () => {
    expect(notaDeRitmo(ritmo({ vendidas30: 4, diasDeVentas: 8 }), null)).toEqual({ base: "Vendió 4 en 8 días", dejas: null });
    expect(notaDeRitmo(ritmo({ piso: 4, vendidas30: 2, diasDeVentas: 7 }), "dejas de ganar ~S/ 9 al día").dejas).toBeNull();
  });
});

describe("«Te dura ~12 días · entre 8 y 17»: la cifra y su rango en UNA tarjeta de la ficha", () => {
  const ritmo = (parcial: Partial<PrendaAnalisis>) => lecturaDeRitmo(prenda(parcial), HOY)!;

  it("la cifra de la barra, el rango y lo que tienes", () => {
    const r = ritmo({ piso: 6, vendidas30: 15, diasDeVentas: 30 });
    expect(textoTeDura(12, r, 6)).toEqual({ valor: "Te dura ~12 días", etiqueta: "entre 8 y 17 días · tienes 6" });
  });

  it("singular, y si el rango no se separa de la cifra no lo repite", () => {
    expect(textoTeDura(1, ritmo({ piso: 1, vendidas30: 90, diasDeVentas: 7 }), 1)).toEqual({ valor: "Te dura ~1 día", etiqueta: "tienes 1" });
  });

  it("sin lectura de ritmo, solo lo que tienes", () => {
    expect(textoTeDura(5, null, 3)).toEqual({ valor: "Te dura ~5 días", etiqueta: "tienes 3" });
  });
});
