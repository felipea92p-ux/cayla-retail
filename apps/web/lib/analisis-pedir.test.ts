import { describe, expect, it } from "vitest";
import type { PartePedido, PrendaAnalisis } from "./analisis-tipos";
import {
  alcancePorTipo,
  categoriaDe,
  DIAS_ALCANZA_MAX,
  finEjeAlcance,
  textoAlcance,
  textoRitmo,
  tipoCorto,
  titularDeLosQueNoLlegan,
  tiposSinRegistrar,
  notaTiposSinRegistrar,
  curvaDeTallas,
  escalaRinde,
  estadoQuedan,
  FALLA_RINDE,
  filaRindeDe,
  masVendidas,
  notaRindeVacio,
  TOP_DEFECTO,
  topsPosibles,
  cuantasVendidas,
  fraseDelTipo,
  ordenarAlcance,
  ORDEN_ALCANCE_DEFECTO,
  llegadasAparte,
  ORDENES_ALCANCE,
  rielHacia,
  rindePorCategoria,
  SIN_CATEGORIA,
  solesRinde,
  tieneYVienen,
  tipRinde,
  ventaMaxima,
  type AlcanceTipo,
  type FilaRinde,
} from "./analisis-pedir";
import { armarModelos } from "./analisis-modelo";
import { cuentaHorizonte } from "./analisis-horizonte";
import { diasEntreFechas } from "./fechas-lima";
import { leerPorLlegar } from "./analisis-por-llegar-lectura";
import { notaPedidoSinTipo, pedidoAparte, pedidoPorTipo, pedidoSinTipo, sinPedido, yaPedidoCorto } from "./analisis-pedido-en-camino-reglas";

/** El día de las pruebas de «Qué pedir» (Navidad a 79 días). */
const HOY = "2026-10-07";

// Datos inventados (el repo es público): modelos, colores y cifras de mentira.
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

describe("categoriaDe", () => {
  it("la categoría del catálogo; sin ella, «Sin categoría» (también cuenta en «de cada 100»)", () => {
    expect(categoriaDe({ categoria: "Bodys" })).toBe("Bodys");
    expect(categoriaDe({ categoria: null })).toBe(SIN_CATEGORIA);
    expect(categoriaDe({ categoria: "  " })).toBe(SIN_CATEGORIA);
  });
});

/** El próximo 25 de diciembre desde `hoy` (el de este año o, si ya pasó, el del siguiente): la meta de respaldo de las pruebas viejas de Navidad. */
const proximaNavidad = (hoy: string): string => (hoy.slice(5, 10) > "12-25" ? `${Number(hoy.slice(0, 4)) + 1}-12-25` : `${hoy.slice(0, 4)}-12-25`);
const diasANavidad = (hoy: string): number => Math.max(0, diasEntreFechas(hoy, proximaNavidad(hoy)));
const cuentaNavidad = (hoy: string) => {
  const dias = diasANavidad(hoy);
  return cuentaHorizonte({ modo: "navidad", dias: Math.max(1, dias), nombre: "Navidad" });
};
const rielNavidad = (hoy: string) => rielHacia(hoy, proximaNavidad(hoy), "Navidad");

describe("cuenta hasta la meta (la de Navidad, como respaldo)", () => {
  it("semanas enteras mientras falte una o más (el 6 de octubre: 80 días = 11 semanas, como la maqueta)", () => {
    expect(cuentaNavidad("2026-10-06")).toEqual({ valor: 11, texto: "semanas para Navidad" });
    expect(cuentaNavidad("2026-12-18")).toEqual({ valor: 1, texto: "semana para Navidad" });
  });

  it("en la última semana, días", () => {
    expect(cuentaNavidad("2026-12-20")).toEqual({ valor: 5, texto: "días para Navidad" });
    expect(cuentaNavidad("2026-12-24")).toEqual({ valor: 1, texto: "día para Navidad" });
  });
});

describe("rielNavidad", () => {
  it("del 1 del mes de hoy al 31 de diciembre: hoy, cada mes en su mitad y Navidad, en % del tramo", () => {
    const r = rielNavidad("2026-10-06");
    // 1 oct → 31 dic son 91 días: hoy es el día 5 y Navidad el 85 (las posiciones de la maqueta).
    expect(r.hoyPct).toBe(5.5);
    expect(r.metaPct).toBe(93.4);
    expect(r.meses.map((m) => m.texto)).toEqual(["octubre", "noviembre", "diciembre"]);
    expect(r.meses.map((m) => m.pct)).toEqual([16.5, 50, 83.5]);
    expect(r.juntos).toBe(false);
    expect(r.etiqueta).toBe("Hoy 6 de octubre, Navidad 25 de diciembre");
  });

  it("todo queda dentro del riel y en orden: hoy antes que Navidad, los meses de izquierda a derecha", () => {
    for (const hoy of ["2026-01-01", "2026-06-30", "2026-09-01", "2026-12-01", "2026-12-25", "2026-12-31"]) {
      const r = rielNavidad(hoy);
      expect(r.hoyPct).toBeGreaterThanOrEqual(0);
      expect(r.metaPct).toBeLessThanOrEqual(100);
      expect(r.hoyPct).toBeLessThanOrEqual(r.metaPct);
      const pcts = r.meses.map((m) => m.pct);
      expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
      expect(new Set(r.meses.map((m) => m.clave)).size).toBe(r.meses.length);
    }
  });

  it("cerca de Navidad los rótulos se pisarían: «Hoy» queda solo como punto", () => {
    expect(rielNavidad("2026-12-10").juntos).toBe(false);
    expect(rielNavidad("2026-12-23").juntos).toBe(true);
    expect(rielNavidad("2026-12-25").juntos).toBe(true);
  });

  it("con 5 a 7 meses, abreviados; con más, abreviados y uno sí, uno no, siempre con diciembre", () => {
    expect(rielNavidad("2026-08-15").meses.map((m) => m.texto)).toEqual(["ago", "set", "oct", "nov", "dic"]);
    expect(rielNavidad("2027-03-10").meses.map((m) => m.texto)).toEqual(["abr", "jun", "ago", "oct", "dic"]);
    // Pasada la Navidad, el riel llega a la del año siguiente: 13 meses.
    const r = rielNavidad("2026-12-26");
    expect(r.meses.map((m) => m.texto)).toEqual(["dic", "feb", "abr", "jun", "ago", "oct", "dic"]);
    expect(r.etiqueta).toBe("Hoy 26 de diciembre, Navidad 25 de diciembre");
  });
});

describe("¿para cuánto te alcanza? (B2: por tipo, contra Navidad)", () => {
  // Datos inventados: una tienda con 8 días de ventas en el ERP y Navidad a 79 días.
  const tienda = [
    prenda({ categoria: "Polos", vendidas30: 37, piso: 60, almacen: 187, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Polos", vendidas30: 0, piso: 0, almacen: 4, salioAlPiso: null }),
    prenda({ categoria: "Capas", categoriaPrefijo: "CAP", vendidas30: 7, piso: 3, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Jeans", categoriaPrefijo: "JEA", vendidas30: 0, piso: 10, almacen: 30, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Bodys", categoriaPrefijo: "BOD", vendidas30: 6, piso: 5, almacen: 114, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Faldas", vendidas30: 0, piso: 0, almacen: 0 }),
  ];

  it("lo que tienes entre lo que vendes por día (en los días de ventas de la tienda); de lo que menos dura a lo que más; lo que no se vendió, al final", () => {
    const a = alcancePorTipo(tienda, 8, HOY, 79, true);
    expect(a.map((t) => t.categoria)).toEqual(["Capas", "Polos", "Bodys", "Jeans"]);
    expect(a.map((t) => (t.dias === null ? null : Math.round(t.dias)))).toEqual([3, 54, 159, null]);
    expect(a.map((t) => t.pide)).toEqual([true, true, false, false]);
    expect(a[1]).toMatchObject({ vendidas: 37, tiene: 251, nunca: 4, prefijo: "POL" });
  });

  it("entre 30 días (una tienda con un mes de ventas) todo dura casi 4 veces más: Polos ya llega a Navidad", () => {
    const a = alcancePorTipo(tienda, 30, HOY, 79, true);
    expect(a.find((t) => t.categoria === "Polos")?.pide).toBe(false);
    expect(a.find((t) => t.categoria === "Capas")?.pide).toBe(true);
  });

  it("sin saber cuándo salió al piso cada prenda, «nunca salieron» queda en null (no en 0)", () => {
    expect(alcancePorTipo(tienda, 8, HOY, 79, false).every((t) => t.nunca === null)).toBe(true);
  });

  it("lo que se vendió y ya no está dura 0: «Ya no hay», y se pide", () => {
    const a = alcancePorTipo([prenda({ categoria: "Capas", vendidas30: 3, piso: 0, almacen: 0 })], 8, HOY, 79, true);
    expect(a[0]).toMatchObject({ dias: 0, pide: true });
    expect(textoAlcance(0)).toBe("Ya no hay");
  });

  it("cada prenda suma su ritmo en su propia ventana (2026-10-14): una colgada hace poco no se diluye en los días de la tienda", () => {
    // Datos inventados: tienda de 15 días; una blusa colgada hace 4 (ventana 7) vendió 2, otra colgada desde el primer día vendió 3.
    const tipo = [
      prenda({ categoria: "Tops", categoriaPrefijo: "TOP", vendidas30: 2, piso: 4, almacen: 6, diasDeVentas: 7 }),
      prenda({ categoria: "Tops", categoriaPrefijo: "TOP", vendidas30: 3, piso: 3, almacen: 7, diasDeVentas: 15 }),
    ];
    const a = alcancePorTipo(tipo, 15, HOY, 72, true)[0]!;
    // 2/7 + 3/15 = 0,486 por día → 20 unidades duran 41 días (entre los 15 de la tienda serían 60 y «llegaría» a Navidad).
    expect(Math.round(a.dias!)).toBe(41);
    expect(a.pide).toBe(true);
    expect(Math.round(alcancePorTipo(tipo.map((p) => ({ ...p, diasDeVentas: undefined })), 15, HOY, 72, true)[0]!.dias!)).toBe(60);
  });

  // ADR-0357, act. 2026-10-14: lo vendido sin registrar (anotado en caja con su tipo) cuenta en el ritmo de su tipo.
  describe("con lo vendido sin registrar", () => {
    // Datos inventados: un tipo que se registra poco (8 de 22 ventas con su prenda), en una tienda de 15 días con Navidad a 72.
    const poco = [
      prenda({ categoria: "Faldas", categoriaPrefijo: "FAL", vendidas30: 5, piso: 6, almacen: 20, salioAlPiso: "2026-10-01" }),
      prenda({ categoria: "Faldas", categoriaPrefijo: "FAL", vendidas30: 3, piso: 4, almacen: 19, salioAlPiso: "2026-10-01" }),
    ];

    it("sin contarlo, el tipo parecía llegar a Navidad; con lo vendido sin su prenda, no llega", () => {
      const solo = alcancePorTipo(poco, 15, HOY, 72, true)[0]!;
      expect(solo).toMatchObject({ vendidas: 8, sinPrenda: 0, tiene: 49, pide: false });
      expect(Math.round(solo.dias!)).toBe(92);
      const con = alcancePorTipo(poco, 15, HOY, 72, true, { Faldas: 14 })[0]!;
      expect(con).toMatchObject({ vendidas: 22, sinPrenda: 14, tiene: 49, pide: true });
      expect(Math.round(con.dias!)).toBe(33);
    });

    it("un tipo vendido SOLO sin registrar deja de ser «No se vendió»: tiene ritmo y se compara con Navidad", () => {
      const tipo = [prenda({ categoria: "Shorts", categoriaPrefijo: "SHO", vendidas30: 0, piso: 8, almacen: 10, salioAlPiso: "2026-10-01" })];
      expect(alcancePorTipo(tipo, 15, HOY, 72, true)[0]).toMatchObject({ dias: null, pide: false });
      const a = alcancePorTipo(tipo, 15, HOY, 72, true, { Shorts: 16 })[0]!;
      // Todo lo vendido se cobró sin su prenda: tiene ritmo (2 semanas) pero el catálogo del tipo está incompleto y no pide (A6, g).
      expect(a).toMatchObject({ vendidas: 16, sinPrenda: 16, tiene: 18, pide: false, incompleto: true, situacion: "incompleto" });
      expect(textoAlcance(a.dias)).toBe("2 semanas");
    });

    it("un tipo que la tienda tiene pero hoy sin venta ni stock también suma lo vendido sin registrar (y ya no hay)", () => {
      const agotado = [prenda({ categoria: "Capas", categoriaPrefijo: "CAP", vendidas30: 0, piso: 0, almacen: 0 })];
      expect(alcancePorTipo(agotado, 15, HOY, 72, true)).toEqual([]);
      expect(alcancePorTipo(agotado, 15, HOY, 72, true, { Capas: 4 })[0]).toMatchObject({ vendidas: 4, sinPrenda: 4, tiene: 0, dias: 0, pide: false, incompleto: true });
    });

    it("un tipo que la tienda no tiene registrado no entra a la tabla: se nombra aparte, del más vendido al menos", () => {
      const a = alcancePorTipo(poco, 15, HOY, 72, true, { Pulseras: 11, Relojes: 10, Faldas: 14 });
      expect(a.map((t) => t.categoria)).toEqual(["Faldas"]);
      expect(tiposSinRegistrar(poco, { Pulseras: 11, Relojes: 10, Faldas: 14, Lentes: 0 })).toEqual([
        { categoria: "Pulseras", vendidas: 11 },
        { categoria: "Relojes", vendidas: 10 },
      ]);
      expect(notaTiposSinRegistrar([{ categoria: "Pulseras", vendidas: 11 }])).toBe(
        "También vendiste 11 Pulseras sin registrar: no están en el sistema, así que no se sabe para cuánto te alcanzan.",
      );
      expect(notaTiposSinRegistrar([
        { categoria: "Pulseras", vendidas: 11 },
        { categoria: "Relojes", vendidas: 10 },
      ])).toContain("11 Pulseras y 10 Relojes sin registrar");
      expect(
        notaTiposSinRegistrar(["A", "B", "C", "D", "E"].map((c, k) => ({ categoria: c, vendidas: 9 - k }))),
      ).toContain("9 A, 8 B, 7 C y 2 tipos más sin registrar");
    });

    it("sin lo vendido sin registrar (o vacío), todo queda como antes", () => {
      const tienda = [
        prenda({ categoria: "Polos", vendidas30: 37, piso: 60, almacen: 187 }),
        prenda({ categoria: "Capas", categoriaPrefijo: "CAP", vendidas30: 7, piso: 3 }),
      ];
      expect(alcancePorTipo(tienda, 8, HOY, 79, true, {})).toEqual(alcancePorTipo(tienda, 8, HOY, 79, true));
      expect(alcancePorTipo(tienda, 8, HOY, 79, true).every((t) => t.sinPrenda === 0)).toBe(true);
    });
  });

  // A3 (plan verificado 2026-10-16): lo que ya viene cuenta para saber para cuánto te alcanza. Datos inventados; hoy es el 7 de octubre.
  describe("con lo que viene en camino", () => {
    const llega = (cantidad: number, fecha: string | null, de: "compra" | "taller" | "almacen" | "tienda" = "compra") => ({ de, cantidad, fecha });
    // Una tienda de 30 días de ventas: 6 vendidas y 2 en el piso → 2 / (6 / 30) = 10 días, y Navidad queda a 79.
    const sola = (parcial: Partial<PrendaAnalisis> = {}) => [prenda({ categoria: "Blusas", categoriaPrefijo: "BLU", vendidas30: 6, piso: 2, salioAlPiso: "2026-09-01", ...parcial })];

    it("sin nada en camino, 2 en el piso y 6 vendidas en 30 días duran 10 días y se piden (como siempre)", () => {
      const a = alcancePorTipo(sola(), 30, HOY, 79, true)[0]!;
      expect(a).toMatchObject({ tiene: 2, vienen: 0, vienenSinFecha: 0, atrasadas: 0, despues: 0, pide: true });
      expect(Math.round(a.dias!)).toBe(10);
    });

    it("con 20 que llegan el 20 de octubre: tienes 2 y vienen 20, duran 110 días y ya no se piden", () => {
      const a = alcancePorTipo(sola({ llega: [llega(20, "2026-10-20")] }), 30, HOY, 79, true)[0]!;
      // «tiene» sigue siendo lo que hay hoy (la fila dice «tienes 2 y vienen 20»); los días suman las dos.
      expect(a).toMatchObject({ tiene: 2, vienen: 20, vienenSinFecha: 0, atrasadas: 0, pide: false });
      expect(Math.round(a.dias!)).toBe(110);
      expect(tieneYVienen(a)).toBe("tienes 2 y vienen 20");
    });

    it("lo que llega hoy cuenta (el mismo día todavía se espera); lo de ayer ya está atrasado", () => {
      expect(alcancePorTipo(sola({ llega: [llega(20, HOY)] }), 30, HOY, 79, true)[0]).toMatchObject({ vienen: 20, atrasadas: 0, pide: false });
      expect(alcancePorTipo(sola({ llega: [llega(20, "2026-10-06")] }), 30, HOY, 79, true)[0]).toMatchObject({ vienen: 0, atrasadas: 20, pide: true });
    });

    it("lo atrasado NO suma: la prenda sigue sin llegar a Navidad y se pide, aunque haya un pedido vencido", () => {
      const a = alcancePorTipo(sola({ llega: [llega(20, "2026-09-20", "taller")] }), 30, HOY, 79, true)[0]!;
      expect(a).toMatchObject({ tiene: 2, vienen: 0, atrasadas: 20, pide: true });
      expect(Math.round(a.dias!)).toBe(10);
      expect(tieneYVienen(a)).toBe("tienes 2");
      expect(llegadasAparte(a)).toBe("20 atrasadas: no las cuento");
    });

    it("una parte en plazo y otra atrasada: solo la primera es «vienen», la otra se dice aparte", () => {
      const a = alcancePorTipo(sola({ llega: [llega(5, "2026-10-12"), llega(8, "2026-09-20", "taller")] }), 30, HOY, 79, true)[0]!;
      expect(a).toMatchObject({ vienen: 5, atrasadas: 8 });
      expect(Math.round(a.dias!)).toBe(35);
      expect(tieneYVienen(a)).toBe("tienes 2 y vienen 5");
      expect(llegadasAparte(a)).toBe("8 atrasadas: no las cuento");
    });

    // Navidad queda a 79 días del 7 de octubre (el 25 de diciembre): un pedido del 5 de enero no la cubre.
    it("lo que llega DESPUÉS de Navidad no suma: se pide igual y la fila lo dice aparte", () => {
      const a = alcancePorTipo(sola({ llega: [llega(20, "2027-01-05")] }), 30, HOY, 79, true)[0]!;
      expect(a).toMatchObject({ tiene: 2, vienen: 0, atrasadas: 0, despues: 20, pide: true });
      expect(Math.round(a.dias!)).toBe(10);
      expect(tieneYVienen(a)).toBe("tienes 2");
      expect(llegadasAparte(a)).toBe("20 llegan después de Navidad");
    });

    it("el día de Navidad todavía cuenta, y el día siguiente ya no", () => {
      expect(alcancePorTipo(sola({ llega: [llega(20, "2026-12-25")] }), 30, HOY, 79, true)[0]).toMatchObject({ vienen: 20, despues: 0, pide: false });
      expect(alcancePorTipo(sola({ llega: [llega(20, "2026-12-26")] }), 30, HOY, 79, true)[0]).toMatchObject({ vienen: 0, despues: 20, pide: true });
    });

    it("a tiempo, tarde y atrasada a la vez: cada una en su cuenta, y la fila las dice en dos líneas (lo que viene / lo aparte)", () => {
      const a = alcancePorTipo(sola({ llega: [llega(5, "2026-10-12"), llega(8, "2026-09-20", "taller"), llega(30, "2027-02-01")] }), 30, HOY, 79, true)[0]!;
      expect(a).toMatchObject({ vienen: 5, atrasadas: 8, despues: 30 });
      expect(Math.round(a.dias!)).toBe(35);
      expect(llegadasAparte(a)).toBe("8 atrasadas: no las cuento · 30 llegan después de Navidad");
      expect(llegadasAparte({ atrasadas: 0, despues: 1 })).toBe("1 llega después de Navidad");
      expect(llegadasAparte({ atrasadas: 0, despues: 0 })).toBe("");
    });

    it("un tipo cuyo único movimiento llega después de Navidad no aparece (igual que uno solo atrasado)", () => {
      expect(alcancePorTipo([prenda({ categoria: "Capas", categoriaPrefijo: "CAP", llega: [llega(9, "2027-01-05")] })], 30, HOY, 79, true)).toEqual([]);
    });

    it("la meta es el parámetro: con 120 días la misma llegada del 5 de enero cuenta, con 79 no", () => {
      // 2026-10-07 + 120 días = 2027-02-04. Cuando la meta sea el fin de la campaña (D3), solo cambia este número.
      expect(alcancePorTipo(sola({ llega: [llega(20, "2027-01-05")] }), 30, HOY, 120, true)[0]).toMatchObject({ vienen: 20, despues: 0 });
      expect(alcancePorTipo(sola({ llega: [llega(20, "2027-01-05")] }), 30, HOY, 79, true)[0]).toMatchObject({ vienen: 0, despues: 20 });
    });

    it("un día o una meta que no sirven no tumban la pantalla: sin tope, como antes", () => {
      expect(() => alcancePorTipo(sola({ llega: [llega(20, "2027-01-05")] }), 30, HOY, Number.NaN, true)).not.toThrow();
      expect(alcancePorTipo(sola({ llega: [llega(20, "2027-01-05")] }), 30, HOY, Number.NaN, true)[0]).toMatchObject({ vienen: 20, despues: 0 });
    });

    it("lo que no tiene fecha cuenta (nadie dijo que se atrasó) y la fila lo dice: no se inventa una fecha", () => {
      const a = alcancePorTipo(sola({ llega: [llega(20, null), llega(3, "2026-10-15", "almacen")] }), 30, HOY, 79, true)[0]!;
      expect(a).toMatchObject({ vienen: 23, vienenSinFecha: 20, atrasadas: 0 });
      expect(tieneYVienen(a)).toBe("tienes 2 y vienen 23 (20 sin fecha)");
    });

    it("el caso real: un traslado de Taller a tienda en tránsito desde el 20-sep SIN líneas no infla los días de ningún tipo", () => {
      // La base emite una parte por prenda (`fn_analisis_por_llegar`): un traslado sin líneas no emite ninguna. Si algún día emitiera una
      // en cero, tampoco suma. Las dos puertas dan lo mismo que no tener nada en camino.
      expect(leerPorLlegar([{ variante_id: "v-1", de: "taller", cantidad: 0, fecha: "2026-09-20" }])).toEqual({});
      const conCero = alcancePorTipo(sola({ llega: [llega(0, "2026-09-20", "taller")] }), 30, HOY, 79, true);
      expect(conCero).toEqual(alcancePorTipo(sola(), 30, HOY, 79, true));
      expect(conCero[0]).toMatchObject({ vienen: 0, atrasadas: 0, despues: 0 });
      // Y con otro tipo en la tienda, tampoco se le pega nada.
      const dos = alcancePorTipo([...sola({ llega: [llega(0, "2026-09-20", "taller")] }), prenda({ categoria: "Polos", vendidas30: 4, piso: 8 })], 30, HOY, 79, true);
      expect(dos.every((t) => t.vienen === 0 && t.atrasadas === 0)).toBe(true);
    });

    it("suma las prendas del tipo, y lo que viene de una prenda sin venta ni stock también es del tipo", () => {
      const tipo = [
        ...sola({ llega: [llega(4, "2026-10-12")] }),
        prenda({ categoria: "Blusas", categoriaPrefijo: "BLU", llega: [llega(10, "2026-10-14", "taller")] }), // nada vendido ni guardado: solo viene
      ];
      const a = alcancePorTipo(tipo, 30, HOY, 79, true);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ tiene: 2, vienen: 14, vendidas: 6 });
    });

    it("un tipo cuyo único movimiento es un pedido atrasado no aparece, pero lo atrasado de un tipo que sí está se cuenta", () => {
      const soloAtrasado = [prenda({ categoria: "Capas", categoriaPrefijo: "CAP", llega: [llega(9, "2026-09-20")] })];
      expect(alcancePorTipo(soloAtrasado, 30, HOY, 79, true)).toEqual([]);
      const mezcla = [...sola(), prenda({ categoria: "Blusas", categoriaPrefijo: "BLU", llega: [llega(9, "2026-09-20")] })];
      expect(alcancePorTipo(mezcla, 30, HOY, 79, true)[0]).toMatchObject({ vienen: 0, atrasadas: 9 });
    });

    it("lo vendido sin registrar y lo que viene se suman cada uno donde le toca", () => {
      // 6 con su prenda + 6 sin registrar = 12 en 30 días → 0,4 por día; 2 + 20 = 22 → 55 días.
      const a = alcancePorTipo(sola({ llega: [llega(20, "2026-10-20")] }), 30, HOY, 79, true, { Blusas: 6 })[0]!;
      expect(a).toMatchObject({ vendidas: 12, sinPrenda: 6, tiene: 2, vienen: 20 });
      expect(Math.round(a.dias!)).toBe(55);
    });

    it("sin nada que viene, la fila y la frase quedan como antes", () => {
      const a = alcancePorTipo(sola(), 30, HOY, 79, true)[0]!;
      expect(tieneYVienen(a)).toBe("tienes 2");
      expect(fraseDelTipo(a, [a], 30)).toMatch(/^Te alcanza para 1 semana: no llega hasta Navidad\. Tienes 2\./);
    });
  });

  describe("con lo ya pedido (A4: órdenes de compra, envíos del proveedor y producción en proceso)", () => {
    // La misma tienda de arriba: 2 en el piso y 6 vendidas en 30 días → 10 días sin pedido; Navidad queda a 79.
    const sola = (parcial: Partial<PrendaAnalisis> = {}) => [prenda({ categoria: "Blusas", categoriaPrefijo: "BLU", vendidas30: 6, piso: 2, salioAlPiso: "2026-09-01", ...parcial })];
    const parte = (de: PartePedido["de"], cantidad: number, fecha: string | null, extra: Partial<PartePedido> = {}): PartePedido => ({
      de,
      categoria: "Blusas",
      prefijo: "BLU",
      marca: "Marca Uno",
      cantidad,
      fecha,
      numeros: [12],
      ...extra,
    });
    const tipo = (pedido: PartePedido[], prendas = sola(), hasta = 79) => alcancePorTipo(prendas, 30, HOY, hasta, true, {}, pedido)[0]!;

    it("una orden abierta con entrega el 20 de octubre suma: tienes 2, ya pedido 20, duran 110 días y ya no se piden", () => {
      const a = tipo([parte("orden", 20, "2026-10-20")]);
      expect(a.pedido).toMatchObject({ suma: 20, deOrden: 20, enEnvio: 0, primeraFecha: "2026-10-20" });
      expect(a).toMatchObject({ tiene: 2, vienen: 0, pide: false });
      expect(Math.round(a.dias!)).toBe(110);
      // «tienes y vienen» sigue hablando solo de las llegadas por prenda; lo pedido tiene su propia frase.
      expect(tieneYVienen(a)).toBe("tienes 2");
      expect(yaPedidoCorto(a.pedido)).toBe("Ya pedido 20 · llegan el 20 oct.");
    });

    it("un tipo con una orden abierta con fecha no dice solo «pídelo»: sin la orden se pedía, con ella no", () => {
      expect(tipo([]).pide).toBe(true);
      expect(tipo([parte("orden", 20, "2026-10-20")]).pide).toBe(false);
    });

    it("una orden SIN fecha se muestra pero NO suma: el tipo sigue diciendo «pídelo» y avisa que hay una orden", () => {
      const a = tipo([parte("orden", 20, null)]);
      expect(a.pedido).toMatchObject({ suma: 0, sinFecha: 20 });
      expect(a.pide).toBe(true);
      expect(Math.round(a.dias!)).toBe(10);
      expect(pedidoAparte(a.pedido)).toEqual(["20 pedidas sin fecha: no las cuento"]);
    });

    it("una orden con la entrega VENCIDA no suma (como lo atrasado de A3); hoy todavía se espera", () => {
      expect(tipo([parte("orden", 20, "2026-10-06")]).pedido).toMatchObject({ suma: 0, atrasadas: 20, diasAtraso: 1 });
      expect(tipo([parte("orden", 20, HOY)]).pedido).toMatchObject({ suma: 20, atrasadas: 0 });
    });

    it("lo que llega DESPUÉS de Navidad no suma y se dice (el 25-dic todavía cuenta)", () => {
      expect(tipo([parte("orden", 20, "2027-01-05")]).pedido).toMatchObject({ suma: 0, despues: 20 });
      expect(tipo([parte("orden", 20, "2026-12-25")]).pedido).toMatchObject({ suma: 20, despues: 0 });
      expect(tipo([parte("orden", 20, "2026-12-26")]).pedido).toMatchObject({ suma: 0, despues: 20 });
    });

    it("lo que ya va en un ENVÍO suma siempre: ya salió, aunque la orden no tenga fecha o ya la haya pasado", () => {
      for (const fecha of [null, "2026-09-01", "2027-02-01", "2026-10-20"]) {
        expect(tipo([parte("envio", 20, fecha)]).pedido).toMatchObject({ suma: 20, enEnvio: 20 });
      }
      expect(yaPedidoCorto(tipo([parte("envio", 20, null)]).pedido)).toBe("Ya pedido 20 · van en camino");
    });

    it("la orden y su envío no se cuentan dos veces: lo que sale en el envío ya no está en la orden (la base lo resta), y aquí cada parte suma una vez", () => {
      // Orden de 100: 60 sin enviar + 40 en un envío = 100, no 140.
      const a = tipo([parte("orden", 60, "2026-10-20"), parte("envio", 40, "2026-10-20")]);
      expect(a.pedido).toMatchObject({ suma: 100, deOrden: 60, enEnvio: 40 });
    });

    it("lo que viene por prenda (traslados y compras con talla) y lo ya pedido se suman cada uno donde le toca", () => {
      const llega = [{ de: "compra" as const, cantidad: 20, fecha: "2026-10-20" }];
      const a = tipo([parte("envio", 10, null)], sola({ llega }));
      expect(a).toMatchObject({ tiene: 2, vienen: 20 });
      expect(a.pedido.suma).toBe(10);
      // (2 + 20 + 10) entre 0,2 por día = 160 días.
      expect(Math.round(a.dias!)).toBe(160);
    });

    it("lo que el proveedor debe («No vino») se muestra y no suma: no tiene fecha", () => {
      const a = tipo([parte("reposicion", 10, null)]);
      expect(a.pedido).toMatchObject({ suma: 0, debe: 10 });
      expect(a.pide).toBe(true);
      expect(pedidoAparte(a.pedido)).toEqual(["el proveedor debe 10"]);
    });

    it("lo de la RED (por repartir y lo que el Taller tiene en proceso) se dice y NUNCA suma a una tienda", () => {
      const a = tipo([parte("por_repartir", 30, "2026-10-20"), parte("taller", 40, "2026-10-25", { marca: null })]);
      expect(a.pedido).toMatchObject({ suma: 0, porRepartir: 30, enTaller: 40 });
      expect(a.pide).toBe(true);
      expect(Math.round(a.dias!)).toBe(10);
      expect(pedidoAparte(a.pedido)).toEqual(["30 por repartir desde Lima", "el Taller tiene 40 en proceso"]);
    });

    it("un tipo que la tienda tiene pero hoy sin venta ni stock aparece si ya le pidieron algo que cuenta; si es algo que no cuenta, no se abre solo", () => {
      const vacia = [prenda({ categoria: "Blusas", categoriaPrefijo: "BLU" })];
      expect(alcancePorTipo(vacia, 30, HOY, 79, true, {}, [parte("orden", 20, "2026-10-20")])[0]).toMatchObject({ categoria: "Blusas", tiene: 0, pedido: { suma: 20 }, dias: null });
      expect(alcancePorTipo(vacia, 30, HOY, 79, true, {}, [parte("orden", 20, null)])).toEqual([]);
      expect(alcancePorTipo(vacia, 30, HOY, 79, true, {}, [parte("taller", 20, "2026-10-20")])).toEqual([]);
    });

    it("la frase del panel dice con qué cuenta, el detalle de lo pedido y lo que no cuenta", () => {
      const a = tipo([parte("envio", 10, null), parte("orden", 5, "2026-10-20"), parte("orden", 8, null)]);
      // (2 + 15) entre 0,2 por día = 85 días = 12 semanas.
      expect(fraseDelTipo(a, [a], 30)).toBe(
        "Con lo ya pedido, te alcanza para 12 semanas: llega hasta Navidad. Tienes 2. Ya pedido 15: 10 van en un envío y 5 llegan el 20 oct. 8 pedidas sin fecha: no las cuento.",
      );
      expect(fraseDelTipo(null, [a], 30)).toBe("Vendiste 6 en 30 días y tienes 2. Ya pedido 15.");
    });

    it("con lo que viene Y lo ya pedido, la frase lo dice", () => {
      const llega = [{ de: "compra" as const, cantidad: 20, fecha: "2026-10-20" }];
      const a = tipo([parte("orden", 5, "2026-10-22")], sola({ llega }));
      expect(fraseDelTipo(a, [a], 30)).toMatch(/^Con lo que viene y lo ya pedido, te alcanza para /);
    });

    it("sin lo ya pedido (null, vacío o no se pudo leer), todo queda como antes", () => {
      const antes = alcancePorTipo(sola(), 30, HOY, 79, true);
      expect(alcancePorTipo(sola(), 30, HOY, 79, true, {}, null)).toEqual(antes);
      expect(alcancePorTipo(sola(), 30, HOY, 79, true, {}, [])).toEqual(antes);
      expect(antes[0]!.pedido).toEqual(sinPedido());
      expect(fraseDelTipo(antes[0]!, antes, 30)).toMatch(/^Te alcanza para 1 semana: no llega hasta Navidad\. Tienes 2\./);
    });

    it("lo pedido de un tipo que la lista no dibuja se nombra aparte (para no volver a pedirlo); lo de la red no", () => {
      const tipos = alcancePorTipo(sola(), 30, HOY, 79, true, {}, []);
      const sinFila = pedidoSinTipo(
        pedidoPorTipo([parte("orden", 40, "2026-10-20", { categoria: "Chalecos" }), parte("taller", 99, null, { categoria: "Sacos", marca: null }), parte("envio", 5, null)], HOY),
        new Set(tipos.map((t) => t.categoria)),
      );
      expect(sinFila).toEqual([{ categoria: "Chalecos", unidades: 40 }]);
      expect(notaPedidoSinTipo(sinFila)).toBe("También hay pedido para tu tienda de 40 Chalecos: hoy no tiene ventas ni stock aquí, así que no sale en la lista.");
    });
  });

  it("las palabras de «tienes y vienen»: uno en singular, y las frases del panel", () => {
    const base: AlcanceTipo = { categoria: "Tops", prefijo: null, familia: null, vendidas: 21, sinPrenda: 0, tiene: 92, vienen: 0, vienenSinFecha: 0, atrasadas: 0, despues: 0, pedido: sinPedido(), nunca: 39, dias: 49, pide: true, plazo: { dias: 30, origen: "terceros" }, meta: 79, pidelo: null, conTemporada: null, pesa: 0, situacion: "no_llega", incompleto: false, ordenAbierta: false };
    expect(tieneYVienen({ ...base, vienen: 1 })).toBe("tienes 92 y viene 1");
    expect(tieneYVienen(base)).toBe("tienes 92");
    expect(llegadasAparte({ ...base, atrasadas: 1 })).toBe("1 atrasada: no la cuento");
    expect(fraseDelTipo({ ...base, vienen: 40, dias: 126, pide: false }, [], 11)).toBe(
      "Con lo que viene, te alcanza para 18 semanas: llega hasta Navidad. Tienes 92 y vienen 40 · 39 nunca salieron al piso.",
    );
    expect(fraseDelTipo({ ...base, atrasadas: 8 }, [], 11)).toBe(
      "Te alcanza para 7 semanas: no llega hasta Navidad. Tienes 92 · 39 nunca salieron al piso. 8 atrasadas no cuentan hasta que lleguen.",
    );
    expect(fraseDelTipo({ ...base, atrasadas: 1 }, [], 11)).toContain("1 atrasada no cuenta hasta que llegue.");
    expect(fraseDelTipo({ ...base, despues: 20 }, [], 11)).toBe(
      "Te alcanza para 7 semanas: no llega hasta Navidad. Tienes 92 · 39 nunca salieron al piso. 20 llegan después de Navidad y no cuentan.",
    );
    expect(fraseDelTipo({ ...base, despues: 1 }, [], 11)).toContain("1 llega después de Navidad y no cuenta.");
    // Un tipo que no se vendió igual dice qué viene.
    expect(fraseDelTipo({ ...base, vendidas: 0, dias: null, pide: false, vienen: 5 }, [], 11)).toBe("No se vendió en 11 días. Tienes 92 y vienen 5 · 39 nunca salieron al piso.");
    // Toda la tienda: suma lo que tienes y lo que viene.
    expect(fraseDelTipo(null, [base, { ...base, categoria: "Polos", vendidas: 0, tiene: 10, vienen: 20, dias: null, pide: false }], 11)).toBe(
      "Vendiste 21 en 11 días, tienes 102 y vienen 20. 1 tipo no llega hasta Navidad.",
    );
    // Lo que no cuenta (atrasado o muy tarde) también se dice en la frase de toda la tienda.
    expect(fraseDelTipo(null, [{ ...base, atrasadas: 8, despues: 20 }], 11)).toBe(
      "Vendiste 21 en 11 días y tienes 92 · 8 atrasadas: no las cuento · 20 llegan después de Navidad. 1 tipo no llega hasta Navidad.",
    );
  });

  it("las palabras: días bajo una semana, semanas hasta 6 meses, y lo que no se vendió", () => {
    expect(textoAlcance(3.4)).toBe("3 días");
    expect(textoAlcance(0.4)).toBe("1 día");
    expect(textoAlcance(20)).toBe("3 semanas");
    expect(textoAlcance(7)).toBe("1 semana");
    expect(textoAlcance(181)).toBe("26 semanas");
    expect(textoAlcance(DIAS_ALCANZA_MAX)).toBe("Más de 6 meses");
    expect(textoAlcance(null)).toBe("No se vendió");
    // 2026-10-14: cada prenda mide su ritmo desde que se colgó (de 7 días hasta los de la tienda); con una semana o menos es lo mismo.
    expect(textoRitmo(8)).toBe("Al ritmo desde que se colgó · hasta 8 días");
    expect(textoRitmo(7)).toBe("Al ritmo de los últimos 7 días");
    expect(textoRitmo(1)).toBe("Al ritmo de los últimos 1 día");
  });

  it("los días a Navidad, el nombre corto de un tipo y el fin del eje (la meta más un 15 %, A6)", () => {
    expect(diasANavidad("2026-10-07")).toBe(79);
    expect(diasANavidad("2026-12-25")).toBe(0);
    expect(diasANavidad("2026-12-26")).toBe(364);
    expect(tipoCorto("Gorros y Sombreros")).toBe("Gorros");
    expect(tipoCorto("Polos")).toBe("Polos");
    expect(finEjeAlcance(79)).toBe(91);
    expect(finEjeAlcance(300)).toBe(345);
    expect(finEjeAlcance(1)).toBe(7);
    expect(DIAS_ALCANZA_MAX).toBe(182);
  });
});

describe("curvaDeTallas", () => {
  const tienda = [
    prenda({ categoria: "Camisas y Blusas", talla: "S", vendidas30: 1, piso: 4 }),
    prenda({ categoria: "Camisas y Blusas", talla: "M", vendidas30: 6, piso: 3 }),
    prenda({ categoria: "Bodys", talla: "L", vendidas30: 3, piso: 3 }),
    prenda({ categoria: "Jeans", talla: "28", vendidas30: 1, piso: 1 }),
    prenda({ categoria: "Polos", talla: "Estándar", vendidas30: 10, piso: 10 }),
  ];

  it("sin tipo elegido: la estándar primero y las tallas del sistema que más pesa (letras), con la nota de cuáles", () => {
    const c = curvaDeTallas(tienda, null);
    expect(c).toEqual({
      tipo: "tallas",
      columnas: [
        { talla: "Estándar", v: 50, t: 50, vend: 10, tiene: 10, pideMas: false },
        { talla: "S", v: 5, t: 20, vend: 1, tiene: 4, pideMas: false },
        { talla: "M", v: 30, t: 15, vend: 6, tiene: 3, pideMas: true },
        { talla: "L", v: 15, t: 15, vend: 3, tiene: 3, pideMas: false },
      ],
      max: 50,
      nota: "Modelos con talla Estándar, S, M y L",
    });
  });

  it("la estándar es una columna más (Felipe 2026-10-12): Polos casi todo Estándar ya no esconde lo vendido", () => {
    const polos = [
      prenda({ categoria: "Polos", talla: "Estándar", vendidas30: 84, piso: 217 }),
      prenda({ categoria: "Polos", talla: "M", vendidas30: 2, piso: 3 }),
      prenda({ categoria: "Polos", talla: "L", vendidas30: 0, piso: 3 }),
      prenda({ categoria: "Polos", talla: "S", vendidas30: 0, piso: 2 }),
      prenda({ categoria: "Polos", talla: "Única", vendidas30: 1, piso: 0 }),
    ];
    const c = curvaDeTallas(polos, "Polos");
    expect(c.tipo === "tallas" && c.columnas.map((x) => [x.talla, x.vend, x.tiene])).toEqual([
      ["Estándar", 85, 217],
      ["S", 0, 2],
      ["M", 2, 3],
      ["L", 0, 3],
    ]);
    expect(c).not.toHaveProperty("falta");
  });

  it("sin tipo elegido y con más números que letras, compara los números", () => {
    const c = curvaDeTallas(
      [
        prenda({ categoria: "Jeans", talla: "30", vendidas30: 5, piso: 5 }),
        prenda({ categoria: "Jeans", talla: "26", vendidas30: 1, piso: 5 }),
        prenda({ categoria: "Chalecos", talla: "M", vendidas30: 1, piso: 1 }),
      ],
      null,
    );
    expect(c.tipo === "tallas" && c.columnas.map((x) => x.talla)).toEqual(["26", "30"]);
    expect(c.tipo === "tallas" && c.nota).toBe("Modelos con talla 26 y 30");
  });

  it("con un tipo elegido, solo sus tallas, en el orden de la tienda (XS, S, M, L, XL; números de menor a mayor)", () => {
    const c = curvaDeTallas(
      [
        prenda({ categoria: "Chalecos", talla: "XL", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Chalecos", talla: "S", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Chalecos", talla: "XS", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Chalecos", talla: "L", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Polos", talla: "M", vendidas30: 9, piso: 1 }),
      ],
      "Chalecos",
    );
    expect(c.tipo === "tallas" && c.columnas.map((x) => x.talla)).toEqual(["XS", "S", "L", "XL"]);
    expect(c.tipo === "tallas" && c.nota).toBeNull();
  });

  it("un tipo que solo se vende en talla única o estándar no tiene curva", () => {
    expect(curvaDeTallas(tienda, "Polos")).toEqual({ tipo: "unica" });
    expect(curvaDeTallas([prenda({ talla: "Única", vendidas30: 2, piso: 1 })], null)).toEqual({ tipo: "unica" });
  });

  it("sin ventas ni prendas del tipo, vacía", () => {
    expect(curvaDeTallas(tienda, "Casacas")).toEqual({ tipo: "vacia" });
    expect(curvaDeTallas([prenda({ talla: "S", vendidas30: 0, piso: 0 })], null)).toEqual({ tipo: "vacia" });
  });
});

describe("lo que más se vende", () => {
  it(`las ${TOP_DEFECTO} que más se venden por defecto, sin las que no se vendieron; a igual venta, por nombre; y las que pidas`, () => {
    const prendas = [
      ...Array.from({ length: 9 }, (_, k) => prenda({ nombre: `Polo ${String.fromCharCode(73 - k)}`, vendidas30: k + 1 })),
      prenda({ nombre: "Polo Z", vendidas30: 9 }),
      prenda({ nombre: "Polo quieto", vendidas30: 0, piso: 5 }),
    ];
    const tops = masVendidas(prendas, null);
    expect(tops).toHaveLength(TOP_DEFECTO);
    expect(tops.map((p) => p.vendidas30)).toEqual([9, 9, 8, 7, 6]);
    expect(masVendidas(prendas, null, 10).map((p) => p.vendidas30)).toEqual([9, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(masVendidas(prendas, null, 20)).toHaveLength(10);
    expect(tops[0]!.nombre).toBe("Polo A");
    expect(tops[1]!.nombre).toBe("Polo Z");
    expect(tops.some((p) => p.nombre === "Polo quieto")).toBe(false);
  });

  it("con un tipo elegido, solo ese tipo", () => {
    const prendas = [prenda({ categoria: "Polos", vendidas30: 5 }), prenda({ categoria: "Bodys", vendidas30: 9 }), prenda({ categoria: null, vendidas30: 2 })];
    expect(masVendidas(prendas, "Polos").map((p) => p.categoria)).toEqual(["Polos"]);
    expect(masVendidas(prendas, SIN_CATEGORIA).map((p) => p.vendidas30)).toEqual([2]);
  });

  it("la venta más alta de la tienda (para medir las barras), al menos 1", () => {
    expect(ventaMaxima([prenda({ vendidas30: 3 }), prenda({ vendidas30: 8 })])).toBe(8);
    expect(ventaMaxima([])).toBe(1);
  });

  it("lo que queda: agotada en rojo y, si no, la MISMA regla de días que «Se está acabando» (A6, c); dice unidades y días", () => {
    expect(estadoQuedan({ piso: 0, almacen: 0 })).toEqual({ est: "urg", texto: "Agotada" });
    // Sin ritmo (no se vendió) no hay días: solo las unidades.
    expect(estadoQuedan({ piso: 1, almacen: 0 })).toEqual({ est: "bien", texto: "Queda 1" });
    // 3 en 30 días de ventas = 10 por día... no: 30 vendidas en 30 días = 1 por día → 3 unidades duran 3 días (ámbar, ya no un ✓ verde).
    expect(estadoQuedan({ piso: 1, almacen: 2, vendidas30: 30, diasDeVentas: 30 })).toEqual({ est: "ate", texto: "Quedan 3 · 3 días" });
    expect(estadoQuedan({ piso: 1, almacen: 0, vendidas30: 30, diasDeVentas: 30 })).toEqual({ est: "ate", texto: "Queda 1 · 1 día" });
    // 14 días es el límite de «Se está acabando»: 14 sigue ámbar, 15 pasa a verde.
    expect(estadoQuedan({ piso: 14, almacen: 0, vendidas30: 30, diasDeVentas: 30 })).toMatchObject({ est: "ate", texto: "Quedan 14 · 14 días" });
    expect(estadoQuedan({ piso: 15, almacen: 0, vendidas30: 30, diasDeVentas: 30 })).toMatchObject({ est: "bien", texto: "Quedan 15 · 15 días" });
    // Lo que se vende poco dura mucho aunque queden pocas: 2 unidades con 1 venta en 30 días = 60 días.
    expect(estadoQuedan({ piso: 2, almacen: 0, vendidas30: 1, diasDeVentas: 30 })).toEqual({ est: "bien", texto: "Quedan 2 · 60 días" });
  });
});

describe("lo que más rinde", () => {
  const fila = (f: Partial<FilaRinde> = {}): FilaRinde => ({
    categoria: "Polos",
    costo: 20,
    importe: 0,
    costoVentas: 0,
    costoDevoluciones: 0,
    udsSinCosto: 0,
    totalPromedio: 10,
    stockInicio: 5,
    ...f,
  });

  it("lee la fila cruda de la base (números o textos); el costo 0 o sin costo es «no se sabe»", () => {
    expect(
      filaRindeDe({
        categoria_nombre: "Bodys",
        costo: "18.50",
        a_importe: 590,
        a_costo_ventas: "120",
        a_costo_devoluciones: null,
        a_uds_sin_costo: 1,
        a_total_promedio: "7.25",
        a_stock_inicio: 4,
      }),
    ).toEqual({ categoria: "Bodys", costo: 18.5, importe: 590, costoVentas: 120, costoDevoluciones: 0, udsSinCosto: 1, totalPromedio: 7.25, stockInicio: 4 });
    expect(filaRindeDe({ costo: 0 }).costo).toBeNull();
    expect(filaRindeDe(null)).toEqual({ categoria: null, costo: null, importe: 0, costoVentas: 0, costoDevoluciones: 0, udsSinCosto: 0, totalPromedio: 0, stockInicio: 0 });
  });

  it("ganancia (venta sin IGV − costo de lo vendido) entre lo que hubo en ropa, al costo y en promedio", () => {
    // 1,180 con IGV = 1,000; costo vendido 400 → ganó 600; hubo 25 en promedio a S/ 20 = S/ 500 → S/ 1.20 por cada S/ 1.
    expect(rindePorCategoria([fila({ importe: 1180, costoVentas: 400, totalPromedio: 25 })], 0.18)).toEqual([{ categoria: "Polos", porSol: 1.2 }]);
  });

  it("las devoluciones devuelven su costo; lo vendido sin costo guardado se cuenta con el costo de hoy", () => {
    // 1,000 sin IGV − (400 − 50 + 2 × 20) = 610 → 610 / 500 = 1.22.
    expect(rindePorCategoria([fila({ importe: 1180, costoVentas: 400, costoDevoluciones: 50, udsSinCosto: 2, totalPromedio: 25 })], 0.18)).toEqual([
      { categoria: "Polos", porSol: 1.22 },
    ]);
  });

  it("suma por tipo; las prendas sin costo no cuentan (ni lo que se ganó ni lo que hay)", () => {
    const r = rindePorCategoria(
      [
        fila({ importe: 590, costoVentas: 200, totalPromedio: 10 }),
        fila({ importe: 590, costoVentas: 200, totalPromedio: 10 }),
        fila({ costo: null, importe: 5900, totalPromedio: 1 }),
      ],
      0.18,
    );
    // (500 − 200) × 2 = 600 sobre (20 × 10) × 2 = 400 → 1.5.
    expect(r).toEqual([{ categoria: "Polos", porSol: 1.5 }]);
  });

  it("un tipo que no tenía ropa el primer día de los 90 todavía no se mide", () => {
    const r = rindePorCategoria([fila({ categoria: "Conjuntos", stockInicio: 0, importe: 1180 }), fila({ categoria: "Polos", importe: 236 })], 0.18);
    expect(r.map((x) => x.categoria)).toEqual(["Polos"]);
  });

  it("de la que más rinde a la que menos; si se perdió, en negativo; sin categoría, «Sin categoría»", () => {
    const r = rindePorCategoria(
      [
        fila({ categoria: "Polos", importe: 236, totalPromedio: 10 }),
        fila({ categoria: "Bodys", importe: 1180, costoVentas: 200, totalPromedio: 10 }),
        fila({ categoria: null, importe: 118, costoVentas: 160, totalPromedio: 10 }),
      ],
      0.18,
    );
    expect(r).toEqual([
      { categoria: "Bodys", porSol: 4 },
      { categoria: "Polos", porSol: 1 },
      { categoria: SIN_CATEGORIA, porSol: -0.3 },
    ]);
  });

  it("sin filas, vacío", () => {
    expect(rindePorCategoria([], 0.18)).toEqual([]);
  });

  it("la escala llega a S/ 1.40 (la maqueta) o a una décima más que el que más rinde", () => {
    expect(escalaRinde([])).toBe(1.4);
    expect(escalaRinde([{ porSol: 1.3 }, { porSol: 0.2 }])).toBe(1.4);
    expect(escalaRinde([{ porSol: 1.1 }])).toBe(1.4);
    expect(escalaRinde([{ porSol: 1.35 }])).toBe(1.5);
    expect(escalaRinde([{ porSol: 2.5 }])).toBe(2.6);
    expect(escalaRinde([{ porSol: -0.4 }])).toBe(1.4);
  });

  it("dice los soles con dos decimales y su tooltip en palabras de tienda", () => {
    expect(solesRinde(1.3)).toBe("S/\u00a01.30");
    expect(solesRinde(0)).toBe("S/\u00a00.00");
    expect(solesRinde(-0.2)).toBe("S/\u00a0−0.20");
    expect(tipRinde({ categoria: "Polos", porSol: 1.1 })).toBe("Por cada S/\u00a01 que tienes en Polos, ganaste S/\u00a01.10 en 90 días");
    expect(tipRinde({ categoria: "Gorros", porSol: -0.25 })).toBe("Por cada S/\u00a01 que tienes en Gorros, perdiste S/\u00a00.25 en 90 días");
  });

  it("sin nada que mostrar: si la base no respondió, eso; si no, que todavía no alcanza", () => {
    expect(notaRindeVacio([FALLA_RINDE])).toBe("No se pudo leer ahora.");
    expect(notaRindeVacio(["No se pudo leer el último conteo"])).toBe("Todavía no hay 90 días de ventas con su costo para medirlo.");
  });
});

describe("Qué pedir por modelo (ADR-0357, decisión 12)", () => {
  const HOY_PEDIR = "2026-10-10";
  // Un modelo colgado en M con su L guardada, y otro modelo que nadie colgó.
  const colgado = [
    prenda({ productoId: "mA", nombre: "Polo Ensayo", piso: 2, vendidas30: 4, salioAlPiso: "2026-10-01" }),
    prenda({ productoId: "mA", nombre: "Polo Ensayo", talla: "L", almacen: 3 }),
  ];
  const guardado = [prenda({ productoId: "mB", nombre: "Polo Guardado", almacen: 5 })];
  const modelos = armarModelos([...colgado, ...guardado], HOY_PEDIR);

  it("«nunca salió al piso» solo cuenta lo del modelo que nadie colgó, no la talla guardada de uno colgado", () => {
    const [polos] = alcancePorTipo(modelos, 10, HOY, 76, true);
    expect(polos).toMatchObject({ vendidas: 4, tiene: 10, nunca: 5 });
  });

  it("las tallas se siguen comparando talla por talla (con las filas de la base, no con los modelos)", () => {
    // La L guardada del modelo colgado es una columna con lo que tiene: con los modelos (talla "" si tienen varias) se perdería.
    const curva = curvaDeTallas([...colgado, ...guardado], null);
    expect(curva.tipo === "tallas" ? curva.columnas.map((c) => c.talla) : []).toEqual(["M", "L"]);
  });

  it("«Lo que más se vende» es un ranking de modelos", () => {
    expect(masVendidas(modelos, null).map((m) => m.nombre)).toEqual(["Polo Ensayo"]);
  });
});

describe("Qué pedir, opción A: el panel del tipo y el «Top» que se elige (Felipe 2026-10-10)", () => {
  it("ofrece Top 5 siempre y los demás solo si hay más modelos vendidos que el anterior", () => {
    expect(topsPosibles(0)).toEqual([5]);
    expect(topsPosibles(5)).toEqual([5]);
    expect(topsPosibles(6)).toEqual([5, 10]);
    expect(topsPosibles(16)).toEqual([5, 10, 15, 20]);
  });

  it("cuenta los modelos vendidos del tipo elegido o de toda la tienda", () => {
    const ps = [prenda({ categoria: "Polos", vendidas30: 2 }), prenda({ categoria: "Polos", vendidas30: 0 }), prenda({ categoria: "Tops", vendidas30: 1 })];
    expect(cuantasVendidas(ps, null)).toBe(2);
    expect(cuantasVendidas(ps, "Polos")).toBe(1);
  });

  it("la frase del tipo: para cuánto alcanza contra Navidad y lo que tienes; sin tipo, lo de toda la tienda", () => {
    const tops: AlcanceTipo = { categoria: "Tops", prefijo: null, familia: null, vendidas: 21, sinPrenda: 0, tiene: 92, vienen: 0, vienenSinFecha: 0, atrasadas: 0, despues: 0, pedido: sinPedido(), nunca: 39, dias: 49, pide: true, plazo: { dias: 30, origen: "terceros" }, meta: 79, pidelo: null, conTemporada: null, pesa: 0, situacion: "no_llega", incompleto: false, ordenAbierta: false };
    const polos: AlcanceTipo = { categoria: "Polos", prefijo: null, familia: null, vendidas: 0, sinPrenda: 0, tiene: 10, vienen: 0, vienenSinFecha: 0, atrasadas: 0, despues: 0, pedido: sinPedido(), nunca: 0, dias: null, pide: false, plazo: { dias: 30, origen: "terceros" }, meta: 79, pidelo: null, conTemporada: null, pesa: 0, situacion: "no_llega", incompleto: false, ordenAbierta: false };
    expect(fraseDelTipo(tops, [], 11)).toBe("Te alcanza para 7 semanas: no llega hasta Navidad. Tienes 92 · 39 nunca salieron al piso.");
    expect(fraseDelTipo(polos, [], 11)).toBe("No se vendió en 11 días. Tienes 10.");
    expect(fraseDelTipo({ ...tops, dias: 0, tiene: 0, nunca: 0 }, [], 11)).toBe("Ya no te queda: no llega hasta Navidad. Tienes 0.");
    expect(fraseDelTipo(null, [tops, polos], 11)).toBe("Vendiste 21 en 11 días y tienes 102. 1 tipo no llega hasta Navidad.");
  });
});

describe("el orden de «¿Para cuánto te alcanza?» (Felipe 2026-10-12)", () => {
  const t = (categoria: string, vendidas: number, dias: number | null): AlcanceTipo => ({ categoria, prefijo: null, familia: null, vendidas, sinPrenda: 0, tiene: 5, vienen: 0, vienenSinFecha: 0, atrasadas: 0, despues: 0, pedido: sinPedido(), nunca: 0, dias, pide: false, plazo: { dias: 30, origen: "terceros" }, meta: 79, pidelo: null, conTemporada: null, pesa: 0, situacion: "no_llega", incompleto: false, ordenAbierta: false });
  // Ya ordenados por «se acaba antes», como los entrega alcancePorTipo.
  const tipos = [t("Capas", 10, 1), t("Polos", 86, 35), t("Tops", 21, 56), t("Bodys", 21, 77), t("Shorts", 0, null)];

  it("por defecto, lo que se acaba antes (el orden que ya trae)", () => {
    expect(ordenarAlcance(tipos, "acaba").map((x) => x.categoria)).toEqual(["Capas", "Polos", "Tops", "Bodys", "Shorts"]);
  });

  it("«Más vendido»: lo que más se vende primero; a igual venta, lo que se acaba antes; lo que no se vendió, al final", () => {
    expect(ordenarAlcance(tipos, "vende").map((x) => x.categoria)).toEqual(["Polos", "Tops", "Bodys", "Capas", "Shorts"]);
  });

  it("por defecto, «Qué pedir primero» (A6, D13), y es la primera opción; «Más vendido» y «Se acaba antes» siguen a un toque", () => {
    expect(ORDEN_ALCANCE_DEFECTO).toBe("prioridad");
    expect(ORDENES_ALCANCE.map((o) => o.clave)).toEqual(["prioridad", "vende", "acaba"]);
  });

  it("no cambia la lista que recibe", () => {
    ordenarAlcance(tipos, "vende");
    expect(tipos[0].categoria).toBe("Capas");
  });
});

// El titular de la tarjeta «¿Qué pedir?» de Hoy (segundo pase visual, 2026-10-17): sin saltos escritos a mano y que se lea como UNA frase.
describe("titularDeLosQueNoLlegan: «Casacas y Faldas» + «no llegan a Navidad (y 12 tipos más)»", () => {
  it("dos tipos o más: los dos primeros juntos, sin saltos, y lo demás cuenta el resto", () => {
    const doce = ["Casacas", "Faldas", ...Array.from({ length: 12 }, (_, i) => `Tipo ${i}`)];
    expect(titularDeLosQueNoLlegan(doce)).toEqual({ titular: "Casacas y Faldas", largo: false, resto: "no llegan a Navidad (y 12 tipos más)" });
    expect(titularDeLosQueNoLlegan(["Casacas", "Faldas", "Polos"])).toMatchObject({ resto: "no llegan a Navidad (y 1 tipo más)" });
    expect(titularDeLosQueNoLlegan(["Casacas", "Faldas"])).toEqual({ titular: "Casacas y Faldas", largo: false, resto: "no llegan a Navidad" });
  });

  it("un solo tipo: el verbo en singular", () => {
    expect(titularDeLosQueNoLlegan(["Casacas"])).toEqual({ titular: "Casacas", largo: false, resto: "no llega a Navidad" });
  });

  it("el nombre corto de cada tipo («Gorros y Sombreros» → «Gorros») y nunca un <br> ni un salto de línea", () => {
    const t = titularDeLosQueNoLlegan(["Gorros y Sombreros", "Chalecos y Sacos"]);
    expect(t.titular).toBe("Gorros y Chalecos");
    expect(JSON.stringify(t)).not.toMatch(/<br|\\n/);
  });

  it("si no caben en una línea a 28 px (más de 18 letras), el titular lo dice para bajar a 22 px en vez de partirse", () => {
    expect(titularDeLosQueNoLlegan(["Pantalones", "Chompas"]).largo).toBe(true); // «Pantalones y Chompas»: 19
    expect(titularDeLosQueNoLlegan(["Casacas", "Faldas"]).largo).toBe(false); // 16
    expect(titularDeLosQueNoLlegan(["Blusas", "Vestidos"]).largo).toBe(false); // 17
  });

  it("«Faldas y 12 tipos más no llegan» ya no puede leerse junto: el resto empieza por el verbo", () => {
    const t = titularDeLosQueNoLlegan(["Casacas", "Faldas", "A", "B"]);
    expect(`${t.titular} ${t.resto}`).toBe("Casacas y Faldas no llegan a Navidad (y 2 tipos más)");
  });
});
