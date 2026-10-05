import { describe, expect, it } from "vitest";
import { entradaPorColgar, nombresConResto, porColgarDeLaSede, resumenPlegado, tareasParaHoy, textoLlegada, type EntradaParaHoy } from "./existencias-para-hoy";
import type { FilaPrenda } from "./existencias-prendas";
import type { AccionPiso, PisoDeTalla } from "./piso-plan";

const vacia: EntradaParaHoy = {
  separa: true,
  porColgar: { tallas: 0, unidades: 0, prendas: [] },
  piso: { enPausa: 0, fallo: false },
  sinStockAtras: { tallas: 0 },
  sinRegistrar: { pendientes: 0, vencidas: 0 },
  danadas: 0,
  resuelveDanadas: true,
  apartados: { vencidos: 0 },
  enCamino: { traslados: 0, atrasados: 0, proximaLlegada: null },
};

describe("tareasParaHoy", () => {
  it("una sede al día no tiene tareas: nada en 0 se dibuja", () => {
    expect(tareasParaHoy(vacia)).toEqual([]);
  });

  it("ordena: colgar, ventas sin registrar, dañadas, apartados, traslados y al final lo que se pide afuera", () => {
    const tareas = tareasParaHoy({
      ...vacia,
      porColgar: { tallas: 12, unidades: 30, prendas: ["Blusa Emma"] },
      sinStockAtras: { tallas: 4 },
      sinRegistrar: { pendientes: 67, vencidas: 0 },
      danadas: 1,
      apartados: { vencidos: 2 },
      enCamino: { traslados: 1, atrasados: 0, proximaLlegada: null },
    });
    expect(tareas.map((t) => t.tipo)).toEqual(["por_colgar", "sin_registrar", "danadas", "apartados_vencidos", "en_camino", "sin_stock_atras"]);
  });

  it("en el Taller (no separa piso y almacén) no hay «por colgar» ni «sin nada atrás»", () => {
    const tareas = tareasParaHoy({ ...vacia, separa: false, porColgar: { tallas: 5, unidades: 9, prendas: [] }, sinStockAtras: { tallas: 3 }, danadas: 1 });
    expect(tareas.map((t) => t.tipo)).toEqual(["danadas"]);
  });

  it("donde no se vende (`null`), la cola no se dibuja", () => {
    expect(tareasParaHoy({ ...vacia, sinRegistrar: null })).toEqual([]);
  });

  it("una venta sin registrar vencida sube el tono a rojo y lo dice", () => {
    const [t] = tareasParaHoy({ ...vacia, sinRegistrar: { pendientes: 3, vencidas: 1 } });
    expect(t.tono).toBe("rojo");
    expect(t.detalle).toContain("1 lleva más de 2 días");
  });

  it("un traslado atrasado reemplaza al «en camino»: no se dicen las dos cosas del mismo envío", () => {
    const tareas = tareasParaHoy({ ...vacia, enCamino: { traslados: 2, atrasados: 1, proximaLlegada: null } });
    expect(tareas.map((t) => t.tipo)).toEqual(["traslados_atrasados"]);
  });

  it("«por colgar» nunca es rojo: es trabajo, no un error", () => {
    const [t] = tareasParaHoy({ ...vacia, porColgar: { tallas: 1, unidades: 1, prendas: ["Casaca Ximena"] } });
    expect(t.tono).toBe("ambar");
    expect(t.texto).toBe("talla por colgar");
    expect(t.detalle).toBe("1 guardada y ninguna colgada: empieza por Casaca Ximena. ¿Ya cuelgan? Regístralas al colgarlas.");
  });

  it("si la cola de ventas sin registrar falló, lo dice sin número (no la calla ni inventa un 0)", () => {
    const [t] = tareasParaHoy({ ...vacia, sinRegistrar: "fallo" });
    expect(t.tipo).toBe("sin_registrar");
    expect(t.cifra).toBeNull();
    expect(t.texto).toBe("No se pudo leer las ventas sin registrar");
    // No manda a otra pantalla: el botón de la fila ya lleva a la lista (antes decía «en Recibir», que dejó de tenerla con ADR-0330).
    expect(t.detalle).not.toMatch(/Recibir/);
  });

  it("como mucho 2 filas en rojo: la tercera vencida baja a ámbar", () => {
    const tareas = tareasParaHoy({
      ...vacia,
      sinRegistrar: { pendientes: 5, vencidas: 2 },
      apartados: { vencidos: 1 },
      enCamino: { traslados: 1, atrasados: 1, proximaLlegada: null },
    });
    expect(tareas.map((t) => t.tono)).toEqual(["rojo", "rojo", "ambar"]);
    expect(tareas.filter((t) => t.tono === "rojo")).toHaveLength(2);
  });
});

describe("el motor del piso en «Para hoy» (integración de la ola 1, 2026-10-04)", () => {
  // Así está toda tienda de producción el día que se pega el motor: ningún cuadre, 0 «por colgar» y N tallas en pausa. Antes de esta
  // fila, «Para hoy» no tenía tareas y decía «Todo al día. No hay nada pendiente en el piso…».
  it("con el piso sin cuadrar NO dice «al día»: pide cuadrarlo, en el lugar de «por colgar»", () => {
    const tareas = tareasParaHoy({ ...vacia, piso: { enPausa: 24, fallo: false }, danadas: 1 });
    expect(tareas.map((t) => t.tipo)).toEqual(["piso_en_pausa", "danadas"]);
    const [t] = tareas;
    expect(t.cifra).toBe(24);
    expect(t.texto).toBe("tallas esperan el cuadre del piso");
    expect(t.tono).toBe("ambar");
    expect(t.detalle).toMatch(/podría pedir colgar lo que ya cuelga/);
    expect(tareasParaHoy({ ...vacia, piso: { enPausa: 1, fallo: false } })[0].texto).toBe("talla espera el cuadre del piso");
  });

  it("si el motor no respondió, lo dice sin número (no lo calla ni inventa un «al día»)", () => {
    const tareas = tareasParaHoy({ ...vacia, piso: { enPausa: 0, fallo: true } });
    expect(tareas).toHaveLength(1);
    const [t] = tareas;
    expect(t.tipo).toBe("piso_sin_calcular");
    expect(t.cifra).toBeNull();
    expect(t.texto).toBe("No se pudo calcular qué colgar hoy");
    expect(t.tono).toBe("pizarra");
  });

  it("la falla manda sobre la pausa: sin plan no se sabe qué talla espera", () => {
    expect(tareasParaHoy({ ...vacia, piso: { enPausa: 3, fallo: true } }).map((t) => t.tipo)).toEqual(["piso_sin_calcular"]);
  });

  it("en el Taller (no separa piso y almacén) no hay piso que cuadrar ni que calcular", () => {
    expect(tareasParaHoy({ ...vacia, separa: false, piso: { enPausa: 5, fallo: true } })).toEqual([]);
  });

  it("con el piso cuadrado, «por colgar» vuelve a ser la primera y la pausa no aparece", () => {
    const tareas = tareasParaHoy({ ...vacia, porColgar: { tallas: 2, unidades: 4, prendas: [] }, piso: { enPausa: 0, fallo: false } });
    expect(tareas.map((t) => t.tipo)).toEqual(["por_colgar"]);
  });

  it("ninguna combinación de pausa y falla deja «Para hoy» vacío en una tienda", () => {
    for (const enPausa of [0, 1, 7]) {
      for (const fallo of [false, true]) {
        const tareas = tareasParaHoy({ ...vacia, piso: { enPausa, fallo } });
        expect(tareas.length > 0).toBe(enPausa > 0 || fallo);
      }
    }
  });
});

describe("lo que encontró la revisión (2026-10-04)", () => {
  it("«sin stock atrás» dice la misma palabra que el filtro y no promete «queda poco en el piso»", () => {
    const [t] = tareasParaHoy({ ...vacia, sinStockAtras: { tallas: 2 } });
    expect(t.texto).toBe("tallas sin stock atrás");
    expect(t.detalle).not.toMatch(/queda poco/i);
  });
  it("las dañadas solo piden «tu decisión» a quien puede decidir", () => {
    expect(tareasParaHoy({ ...vacia, danadas: 1, resuelveDanadas: true })[0].detalle).toMatch(/tu decisión/);
    expect(tareasParaHoy({ ...vacia, danadas: 1, resuelveDanadas: false })[0].detalle).toMatch(/un líder decide/);
  });
});

describe("resumenPlegado (la línea del celular)", () => {
  it("toma el tono más grave: un plazo vencido no se esconde detrás de «por colgar»", () => {
    const tareas = tareasParaHoy({ ...vacia, porColgar: { tallas: 5, unidades: 9, prendas: [] }, apartados: { vencidos: 1 } });
    const r = resumenPlegado(tareas)!;
    expect(r.primera.tipo).toBe("por_colgar");
    expect(r.tono).toBe("rojo");
    expect(r.mas).toBe(1);
    expect(r.vencidasDentro).toBe(1);
  });
  it("sin tareas no hay línea", () => {
    expect(resumenPlegado([])).toBeNull();
  });
});

describe("nombresConResto", () => {
  it("dice hasta dos nombres y cuántos más, sin repetir", () => {
    expect(nombresConResto([])).toBe("");
    expect(nombresConResto(["A"])).toBe("A");
    expect(nombresConResto(["A", "B"])).toBe("A y B");
    expect(nombresConResto(["A", "A", "B", "C", "D"])).toBe("A, B y 2 más");
  });
});

describe("textoLlegada", () => {
  it("usa la hora de Lima", () => {
    // 15:30 UTC = 10:30 en Lima (UTC−5).
    expect(textoLlegada("2026-10-05T15:30:00Z")).toMatch(/10:30$/);
  });
});

describe("porColgarDeLaSede (la única cuenta de «por colgar»)", () => {
  // La decisión de cada talla es la del motor del piso (`planPiso`, ADR-0328 act. 7): aquí se escribe a mano, porque lo que se prueba
  // es la CUENTA (qué suma, qué deja fuera, en qué orden), no la regla del motor (eso es `piso-plan.test.ts`).
  const decision = (accion: AccionPiso): PisoDeTalla => ({ accion, requisito: 1, central: true, vendidasRecientes: 0, anotadasRecientes: 0, ritmoAtributo: 0, entraUnaSaleUna: false });
  // Lo libre ya viene neto de apartados (`sumarCantidades`): aquí solo importa piso y almacén.
  const talla = (varianteId: string, productoId: string, color: string, t: string, piso: number | null, almacen: number | null, accion: AccionPiso | null): FilaPrenda =>
    ({
      varianteId, productoId, referencia: `Modelo ${productoId}`, sku: varianteId, talla: t, color, colorHex: null, fotoUrl: null,
      codigosBarras: [], pisoDisponible: piso, almacenDisponible: almacen, disponible: (piso ?? 0) + (almacen ?? 0),
      apartado: 0, danado: 0, enTransito: 0, planPiso: accion ? decision(accion) : null, marca: null,
    }) as FilaPrenda;
  const stock = [
    talla("a", "blusa", "Azul", "S", 0, 4, "por_colgar"), // por colgar: 4
    talla("b", "blusa", "Azul", "M", 0, 2, "por_colgar"), // por colgar: 2
    talla("c", "blusa", "Azul", "L", 1, 9, "mantener"), // colgada: no
    talla("d", "blusa", "Negro", "M", 0, 0, "sin_atras"), // agotada (sin stock atrás): no se puede colgar
    talla("x", "blusa", "Azul", "XL", 0, 3, "mantener"), // talla extrema que puede quedar guardada: el motor no la pide
    talla("e", "polo", "Blanco", "M", 0, 1, "por_colgar"), // por colgar: 1
  ];

  it("cuenta solo lo que el motor manda a colgar y suma lo que se puede colgar", () => {
    const r = porColgarDeLaSede(stock, ["e", "a", "b"]);
    expect(r.tallas).toBe(3);
    expect(r.unidades).toBe(7);
    expect(r.enPausa).toBe(0);
    expect(r.filas.map((f) => f.varianteId)).toEqual(["a", "b", "e"]);
    // Por prenda (modelo + color), en el orden de la lista del día del motor (lo vendido ayer primero), con solo sus tallas por colgar.
    expect(r.prendas.map((p) => [p.productoId, p.color, p.tallas.map((f) => f.talla)])).toEqual([
      ["polo", "Blanco", ["M"]],
      ["blusa", "Azul", ["S", "M"]],
    ]);
    expect(entradaPorColgar(r)).toEqual({ tallas: 3, unidades: 7, prendas: ["Modelo polo", "Modelo blusa"] });
  });

  it("sin lista del día (el motor no respondió) las prendas quedan en el orden en que llegaron, y la cifra no cambia", () => {
    const r = porColgarDeLaSede(stock, []);
    expect(r.tallas).toBe(3);
    expect(r.prendas.map((p) => p.productoId)).toEqual(["blusa", "polo"]);
  });

  it("con el piso sin cuadrar no hay nada por colgar: cuenta cuántas tallas esperan, y eso dice «Para hoy» en su lugar", () => {
    const enPausa = [
      talla("a", "blusa", "Azul", "S", 0, 4, "pausa_sin_cuadre"),
      talla("b", "blusa", "Azul", "M", 0, 2, "pausa_sin_cuadre"),
      talla("c", "blusa", "Azul", "L", 1, 9, "mantener"),
      talla("d", "blusa", "Negro", "M", 0, 0, "sin_atras"),
    ];
    const r = porColgarDeLaSede(enPausa, []);
    expect(r).toMatchObject({ tallas: 0, unidades: 0, enPausa: 2, prendas: [] });
    const tareas = tareasParaHoy({ ...vacia, porColgar: entradaPorColgar(r), piso: { enPausa: r.enPausa, fallo: false } });
    expect(tareas.map((t) => [t.tipo, t.cifra])).toEqual([["piso_en_pausa", 2]]);
  });

  it("sin decisión del motor (no respondió), en el Taller (no separa piso y almacén) o sin nada, da cero y no NaN", () => {
    expect(porColgarDeLaSede([], [])).toMatchObject({ tallas: 0, unidades: 0, enPausa: 0, prendas: [] });
    expect(porColgarDeLaSede([talla("t", "blusa", "Azul", "M", null, null, "por_colgar")], ["t"])).toMatchObject({ tallas: 0, unidades: 0, enPausa: 0, prendas: [] });
    expect(porColgarDeLaSede([talla("s", "blusa", "Azul", "M", 0, 3, null)], [])).toMatchObject({ tallas: 0, unidades: 0, enPausa: 0, prendas: [] });
  });
});
