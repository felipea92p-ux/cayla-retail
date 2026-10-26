import { describe, expect, it } from "vitest";
import {
  avisosDelPlan,
  avisosVisibles,
  derivaDelDescuento,
  elQueAsoma,
  estaVisto,
  leerVistos,
  llaveDeVistos,
  marcarVisto,
  porAtender,
  vistosVigentes,
  type AvisoDelPlan,
  type EntradaDeAvisos,
} from "./plan-compra-avisos";
import type { FilaPlan, LineaPlan } from "./plan-compra-reglas";
import type { PlazoDePedido } from "./plan-compra-plazo";
import type { SugeridoDescuento } from "./plan-compra-descuento";

const plazo = (p: Partial<PlazoDePedido> = {}): PlazoDePedido => ({
  estado: "a_tiempo",
  limite: "2026-11-27",
  diasParaElLimite: 32,
  llegariaEl: "2026-11-09",
  diasTarde: 0,
  texto: "Pedir antes del 27/11",
  detalle: "El último día para pedir es el 27/11.",
  ...p,
});

const sugerido = (pct: number, extra: Partial<SugeridoDescuento> = {}): SugeridoDescuento => ({ categoriaId: "x", pct, origen: "campana", fuente: "Navidad", desde: null, hasta: null, dias: null, soloEn: null, ...extra });

const fila = (id: string, nombre: string, extra: Partial<FilaPlan> = {}): FilaPlan =>
  ({
    c: { id, nombre, prefijo: null, familia: null, tallas: [] },
    linea: undefined,
    stock: 0,
    calculo: null,
    vendido: 0,
    ventas: 0,
    puesto: null,
    ventas30: null,
    sedes: null,
    catalogo: null,
    enCamino: 0,
    ...extra,
  }) as FilaPlan;

const conPlan = (descuentoPct?: number) => ({ categoriaId: "x", flojo: 1, normal: 2, bueno: 3, precio: 50, costo: 20, recuperoPct: 50, descuentoPct, curva: {} }) as LineaPlan;

const base = (e: Partial<EntradaDeAvisos> = {}): EntradaDeAvisos => ({
  estado: "antes",
  plazo: plazo(),
  porPedir: 0,
  conPlan: 0,
  fraseDeLosDias: "Cuenta con 14 días para llegar a las tiendas.",
  puedeCambiarDias: true,
  confianza: { estado: "confiable", sedes: [] },
  puedeContar: true,
  fraseDelConteo: null,
  filas: [],
  tope: null,
  inversion: 0,
  ...e,
});
const sinDatos = { diasDeVentas: undefined, conCampanaAnterior: false };
const ids = (a: AvisoDelPlan[]) => a.map((x) => x.id);

describe("el plazo: lo único cuyo costo de ignorarlo es plata", () => {
  it("justo con algo por pedir es urgente, y asoma con la fecha y los días que faltan", () => {
    const [a] = avisosDelPlan(base({ plazo: plazo({ estado: "justo", diasParaElLimite: 5 }), porPedir: 7, conPlan: 7 }), sinDatos);
    expect(a.id).toBe("plazo");
    expect(a.nivel).toBe("urgente");
    expect(a.corto).toBe("Pedir antes del 27/11 · 5 días");
    expect(a.texto).toContain("7 categorías tienen compra pendiente.");
  });
  it("tarde con algo por pedir es urgente: «Ya no llega a tiempo»", () => {
    const a = avisosDelPlan(base({ plazo: plazo({ estado: "tarde", limite: null, diasParaElLimite: null }), porPedir: 3, conPlan: 3 }), sinDatos)[0];
    expect([a.nivel, a.corto]).toEqual(["urgente", "Ya no llega a tiempo"]);
  });
  it("tarde sin nada por pedir ya no urge: solo informa", () => {
    expect(avisosDelPlan(base({ plazo: plazo({ estado: "tarde" }), porPedir: 0, conPlan: 3 }), sinDatos)[0].nivel).toBe("info");
  });
  it("con tiempo es informativo; con todo planeado y nada pendiente, «en orden»; sin plan todavía, informativo", () => {
    expect(avisosDelPlan(base({ porPedir: 5, conPlan: 5 }), sinDatos)[0].nivel).toBe("info");
    expect(avisosDelPlan(base({ porPedir: 0, conPlan: 5 }), sinDatos)[0].nivel).toBe("ok");
    expect(avisosDelPlan(base({ porPedir: 0, conPlan: 0 }), sinDatos)[0].nivel).toBe("info");
  });
  it("justo sin nada por pedir, con plan: en orden; ya empezó: informa", () => {
    expect(avisosDelPlan(base({ plazo: plazo({ estado: "justo" }), porPedir: 0, conPlan: 4 }), sinDatos)[0].nivel).toBe("ok");
    expect(avisosDelPlan(base({ plazo: plazo({ estado: "empezo" }), porPedir: 2, conPlan: 2 }), sinDatos)[0].nivel).toBe("info");
  });
  it("terminada la campaña no hay aviso de plazo", () => {
    expect(ids(avisosDelPlan(base({ plazo: plazo({ estado: "termino" }) }), sinDatos))).not.toContain("plazo");
  });
  it("«Cambiar los días» solo si se puede", () => {
    expect(avisosDelPlan(base({ puedeCambiarDias: true }), sinDatos)[0].acciones).toEqual([{ tipo: "cambiar-dias", texto: "Cambiar los días" }]);
    expect(avisosDelPlan(base({ puedeCambiarDias: false }), sinDatos)[0].acciones).toEqual([]);
  });
  it("lo que solo es de tiempo (a tiempo, en orden) no asoma", () => {
    expect(elQueAsoma(avisosDelPlan(base({ porPedir: 5, conPlan: 5 }), sinDatos))).toBeNull();
  });
});

describe("el stock", () => {
  const confianza = (alDia: boolean[]) => ({ estado: "incompleto" as const, sedes: alDia.map((a, i) => ({ nombre: ["Lima", "Arequipa", "Trujillo"][i], alDia: a, falta: a ? null : "piso sin cuadrar" })) });
  it("confiable: no hay aviso", () => {
    expect(ids(avisosDelPlan(base(), sinDatos))).not.toContain("stock");
  });
  it("tiendas sin cuadrar: pendiente, dice cuáles y ofrece Conteo solo a quien lo ve", () => {
    const a = avisosDelPlan(base({ confianza: confianza([false, true, false]) }), sinDatos).find((x) => x.id === "stock")!;
    expect(a.nivel).toBe("pendiente");
    expect(a.titulo).toBe("Lima y Trujillo no tienen el stock al día");
    expect(a.acciones.map((x) => x.tipo)).toEqual(["ver-resumen", "ir-conteo"]);
    expect(avisosDelPlan(base({ confianza: confianza([false]), puedeContar: false }), sinDatos).find((x) => x.id === "stock")!.acciones.map((x) => x.tipo)).toEqual(["ver-resumen"]);
  });
  it("una sola tienda sin cuadrar: «no tiene»; y lleva la fecha de A1", () => {
    const a = avisosDelPlan(base({ confianza: confianza([false]), fraseDelConteo: "Cuéntalo antes del 27/11: es el último día para pedir." }), sinDatos).find((x) => x.id === "stock")!;
    expect(a.titulo).toBe("Lima no tiene el stock al día");
    expect(a.texto).toContain("Cuéntalo antes del 27/11");
  });
  it("sin poder comprobarlo, lo dice (nunca «confiable» por omisión)", () => {
    const a = avisosDelPlan(base({ confianza: { estado: "sin-dato", sedes: [] } }), sinDatos).find((x) => x.id === "stock")!;
    expect([a.nivel, a.titulo, a.huella]).toEqual(["pendiente", "No se pudo comprobar el stock de las tiendas", "sin-dato"]);
  });
});

describe("las que más venden y no tienen plan", () => {
  const filas = [fila("a", "Vestidos", { puesto: 1 }), fila("b", "Faldas", { puesto: 2, linea: conPlan() }), fila("c", "Casacas", { puesto: 3 }), fila("d", "Cinturones")];
  it("antes de la campaña: cuenta las del top sin plan, empieza por la que más vende y ofrece abrirla", () => {
    const a = avisosDelPlan(base({ filas }), sinDatos).find((x) => x.id === "sin-plan")!;
    expect(a.nivel).toBe("pendiente");
    expect(a.titulo).toBe("2 de las 3 que más venden no tienen plan");
    expect(a.texto).toBe("Empieza por Vestidos y Casacas.");
    expect(a.acciones).toEqual([{ tipo: "abrir-categoria", texto: "Seguir con Vestidos", categoriaId: "a" }]);
  });
  it("con más de tres, nombra tres y cuenta el resto", () => {
    const muchas = Array.from({ length: 5 }, (_, i) => fila(`k${i}`, `Cat ${i}`, { puesto: i + 1 }));
    expect(avisosDelPlan(base({ filas: muchas }), sinDatos).find((x) => x.id === "sin-plan")!.texto).toBe("Empieza por Cat 0, Cat 1 y Cat 2 (y 2 más).");
  });
  it("empezada o terminada la campaña, o con todas planeadas, no avisa", () => {
    expect(ids(avisosDelPlan(base({ filas, estado: "durante" }), sinDatos))).not.toContain("sin-plan");
    expect(ids(avisosDelPlan(base({ filas, estado: "despues" }), sinDatos))).not.toContain("sin-plan");
    expect(ids(avisosDelPlan(base({ filas: [fila("a", "Vestidos", { puesto: 1, linea: conPlan() })] }), sinDatos))).not.toContain("sin-plan");
  });
  it("la huella cambia al planear una: el aviso vuelve a contar", () => {
    const antes = avisosDelPlan(base({ filas }), sinDatos).find((x) => x.id === "sin-plan")!.huella;
    const despues = avisosDelPlan(base({ filas: [fila("a", "Vestidos", { puesto: 1, linea: conPlan() }), ...filas.slice(1)] }), sinDatos).find((x) => x.id === "sin-plan")!.huella;
    expect(antes).not.toBe(despues);
  });
});

describe("la deriva del descuento (ADR-0499, paso 4)", () => {
  const casacas = (planPct: number | undefined, s: SugeridoDescuento | null | undefined, con = true) =>
    fila("c", "Casacas", { linea: conPlan(planPct), conDescuento: con, descuentoSugerido: s ?? undefined });
  it("la campaña dice −25 % y el plan supone −20 %: una categoría, con su botón", () => {
    const a = avisosDelPlan(base({ filas: [casacas(20, sugerido(25))] }), sinDatos).find((x) => x.id === "deriva")!;
    expect(a.nivel).toBe("pendiente");
    expect(a.titulo).toBe("La campaña dice −25 % y tu plan de Casacas supone −20 %");
    expect(a.acciones).toEqual([{ tipo: "abrir-categoria", texto: "Revisar Casacas", categoriaId: "c" }]);
  });
  it("un plan sin descuento frente a una campaña con descuento se dice sin «−0 %»", () => {
    const a = avisosDelPlan(base({ filas: [casacas(0, sugerido(20))] }), sinDatos).find((x) => x.id === "deriva")!;
    expect(a.titulo).toBe("La campaña dice −20 % y tu plan de Casacas no lleva descuento");
  });
  it("varias: cuenta, nombra hasta tres con sus dos cifras y ofrece la primera por nombre", () => {
    const filas = ["Zapatos", "Abrigos", "Casacas", "Polos"].map((n, i) => fila(`k${i}`, n, { linea: conPlan(10), conDescuento: true, descuentoSugerido: sugerido(20) }));
    const a = avisosDelPlan(base({ filas }), sinDatos).find((x) => x.id === "deriva")!;
    expect(a.titulo).toBe("4 categorías tienen otro descuento que el de la campaña");
    expect(a.texto).toBe("Abrigos (plan −10 %, campaña −20 %); Casacas (plan −10 %, campaña −20 %); Polos (plan −10 %, campaña −20 %); y 1 más. Ábrelas para ponerlas al día, o déjalas si fue a propósito.");
    expect(a.acciones[0]).toMatchObject({ texto: "Revisar Abrigos" });
  });
  it("lo igual, lo sin plan, la base que no guarda el descuento y un sugerido parcial NO son deriva", () => {
    expect(derivaDelDescuento([casacas(25, sugerido(25))])).toEqual([]);
    expect(derivaDelDescuento([casacas(20.004, sugerido(20))])).toEqual([]);
    expect(derivaDelDescuento([fila("c", "Casacas", { conDescuento: true, descuentoSugerido: sugerido(25) })])).toEqual([]);
    expect(derivaDelDescuento([casacas(20, sugerido(25), false)])).toEqual([]);
    expect(derivaDelDescuento([casacas(20, sugerido(25, { dias: [2, 4] }))])).toEqual([]);
    expect(derivaDelDescuento([casacas(20, sugerido(25, { soloEn: ["Tienda Lima"] }))])).toEqual([]);
    expect(derivaDelDescuento([casacas(20, null)])).toEqual([]);
  });
  it("la huella cambia si la campaña cambia otra vez", () => {
    const h = (pct: number) => avisosDelPlan(base({ filas: [casacas(20, sugerido(pct))] }), sinDatos).find((x) => x.id === "deriva")!.huella;
    expect(h(25)).not.toBe(h(30));
  });
});

describe("el tope", () => {
  it("te pasas: pendiente con lo que te pasas, el costo y el tope", () => {
    const a = avisosDelPlan(base({ tope: 28000, inversion: 29200 }), sinDatos).find((x) => x.id === "tope")!;
    expect(a.nivel).toBe("pendiente");
    expect(a.titulo).toBe("Te pasas S/ 1,200.00 de tu tope");
    expect(a.texto).toBe("El plan cuesta S/ 29,200.00 al costo y tu tope es S/ 28,000.00.");
  });
  it("dentro del tope, o sin tope, no hay aviso", () => {
    expect(ids(avisosDelPlan(base({ tope: 28000, inversion: 28000 }), sinDatos))).not.toContain("tope");
    expect(ids(avisosDelPlan(base({ tope: null, inversion: 99999 }), sinDatos))).not.toContain("tope");
  });
});

describe("los datos: se leen, no se cuentan", () => {
  it("con menos de 90 días, informa y usa las mismas palabras que la hoja de cada categoría", () => {
    const a = avisosDelPlan(base(), { diasDeVentas: 26, conCampanaAnterior: false }).find((x) => x.id === "datos")!;
    expect([a.nivel, a.titulo]).toEqual(["info", "Los datos todavía no son exactos"]);
    expect(a.texto).toBe("El ERP lleva 26 de 90 días de ventas. Las cifras son una guía: tú decides.");
  });
  it("sin nada que decir (campaña del año pasado en el ERP, o sin saber los días), no hay aviso", () => {
    expect(ids(avisosDelPlan(base(), { diasDeVentas: 90, conCampanaAnterior: true }))).not.toContain("datos");
    expect(ids(avisosDelPlan(base(), sinDatos))).not.toContain("datos");
  });
});

describe("el orden y el número", () => {
  const todo = base({
    plazo: plazo({ estado: "justo", diasParaElLimite: 5 }),
    porPedir: 4,
    conPlan: 4,
    confianza: { estado: "incompleto", sedes: [{ nombre: "Lima", alDia: false, falta: "piso sin cuadrar" }] },
    filas: [fila("a", "Vestidos", { puesto: 1 })],
    tope: 100,
    inversion: 150,
  });
  const avisos = avisosDelPlan(todo, { diasDeVentas: 26, conCampanaAnterior: false });

  it("lo urgente primero, después lo que hay que hacer y al final lo que informa, en un orden fijo", () => {
    expect(ids(avisos)).toEqual(["plazo", "stock", "sin-plan", "tope", "datos"]);
    expect(avisos.map((a) => a.nivel)).toEqual(["urgente", "pendiente", "pendiente", "pendiente", "info"]);
  });
  it("el número cuenta lo que hay que hacer (4) y no lo que solo informa", () => {
    expect(porAtender(avisos, {})).toBe(4);
  });
  it("lo urgente asoma aunque el centro esté cerrado", () => {
    expect(elQueAsoma(avisos)?.id).toBe("plazo");
  });
  it("sin nada pendiente, el número es 0 y no asoma nada", () => {
    const quieto = avisosDelPlan(base({ porPedir: 0, conPlan: 3 }), sinDatos);
    expect(porAtender(quieto, {})).toBe(0);
    expect(elQueAsoma(quieto)).toBeNull();
  });
});

describe("«ya lo vi»", () => {
  const avisos = avisosDelPlan(
    base({ plazo: plazo({ estado: "justo" }), porPedir: 2, conPlan: 2, confianza: { estado: "incompleto", sedes: [{ nombre: "Lima", alDia: false, falta: "x" }] } }),
    sinDatos,
  );
  const stock = avisos.find((a) => a.id === "stock")!;
  const urgente = avisos.find((a) => a.id === "plazo")!;

  it("un pendiente marcado deja de contar y de mostrarse", () => {
    const v = marcarVisto({}, stock);
    expect(estaVisto(stock, v)).toBe(true);
    expect(porAtender(avisos, v)).toBe(1);
    expect(avisosVisibles(avisos, v).map((a) => a.id)).toEqual(["plazo"]);
  });
  it("lo urgente no se puede marcar: sigue contando y a la vista", () => {
    const v = marcarVisto({}, urgente);
    expect(v).toEqual({});
    expect(estaVisto(urgente, { plazo: urgente.huella })).toBe(false);
    expect(porAtender(avisos, { plazo: urgente.huella })).toBe(2);
  });
  it("si el dato cambia (otra tienda sin cuadrar), el aviso vuelve a contar", () => {
    const v = marcarVisto({}, stock);
    const otraTienda = avisosDelPlan(
      base({ confianza: { estado: "incompleto", sedes: [{ nombre: "Lima", alDia: false, falta: "x" }, { nombre: "Arequipa", alDia: false, falta: "x" }] } }),
      sinDatos,
    ).find((a) => a.id === "stock")!;
    expect(estaVisto(otraTienda, v)).toBe(false);
  });
  it("lo vigente: se sueltan los avisos que ya no existen o cuyo dato cambió", () => {
    const v = { stock: stock.huella, tope: "100", deriva: "viejo" };
    expect(vistosVigentes(v, avisos)).toEqual({ stock: stock.huella });
  });
});

describe("lo guardado en el navegador", () => {
  it("lee un objeto de textos y descarta lo demás sin caerse", () => {
    expect(leerVistos('{"stock":"Lima","tope":"1200"}')).toEqual({ stock: "Lima", tope: "1200" });
    expect(leerVistos('{"stock":"Lima","tope":5}')).toEqual({ stock: "Lima" });
  });
  it("sin nada, con basura o con otra forma, nada está visto", () => {
    for (const mal of [null, undefined, "", "no es json", "[1,2]", "null", "5", '"hola"']) expect(leerVistos(mal)).toEqual({});
  });
  it("una llave por campaña: lo visto en una no esconde nada en otra", () => {
    expect(llaveDeVistos("abc")).not.toBe(llaveDeVistos("xyz"));
  });
});
