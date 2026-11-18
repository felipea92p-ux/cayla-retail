import { describe, expect, it } from "vitest";
import { agruparPendientes, cierreDeTeToca, frasesDeTeToca, listaDeHoy, pendientesDeFijos, pendientesDeGastos, pendientesDeImpuestos, puedeVolverAPreguntar, type PendienteTelar } from "./finanzas-te-toca-reglas";
import type { Aviso } from "./resumen-finanzas-reglas";
import type { PendienteImpuesto } from "./impuestos-antes-reglas";

const vacio = { egresosSinClasificar: 0, egresosSinClasificarMonto: 0, sinComprobante: 0, igvSinComprobante: 0, nPorPagar: 0, porPagar: 0 };

describe("los pendientes de Gastos", () => {
  it("sin nada pendiente, nada", () => {
    expect(pendientesDeGastos(vacio, "")).toEqual([]);
  });

  it("cada cifra que pide algo es un pendiente que lleva a su lugar, con la sede elegida", () => {
    const p = pendientesDeGastos({ egresosSinClasificar: 2, egresosSinClasificarMonto: 120, sinComprobante: 1, igvSinComprobante: 68.64, nPorPagar: 0, porPagar: 0 }, "sede=l");
    expect(p.map((x) => [x.titulo, x.href])).toEqual([
      ["2 salidas de caja sin clasificar", "/finanzas/gastos?sede=l&tab=egresos"],
      ["1 gasto de S/\u00a0300 o más sin boleta ni factura", "/finanzas/gastos?sede=l"],
    ]);
    // Lo mismo que dice la bandeja de Gastos: el IGV que se recuperaría con factura (en soles redondos, como el resto del cajón).
    expect(p[1]!.detalle).toBe("Con factura recuperarías S/\u00a069 de IGV");
  });

  it("sin sede elegida la dirección queda limpia", () => {
    expect(pendientesDeGastos({ ...vacio, egresosSinClasificar: 1, egresosSinClasificarMonto: 20 }, "")[0]!.href).toBe("/finanzas/gastos?tab=egresos");
    expect(pendientesDeGastos({ ...vacio, sinComprobante: 2 }, "")[0]!.href).toBe("/finanzas/gastos");
  });
});

describe("el cajón agrupa por submódulo", () => {
  const SUB = [
    { clave: "finanzas.resumen", etiqueta: "Resumen" },
    { clave: "finanzas.gastos", etiqueta: "Gastos" },
    { clave: "finanzas.cierre", etiqueta: "Cierre de mes" },
  ];
  const p = (submodulo: string, id: string, estado: "frena" | "avisa"): PendienteTelar => ({ submodulo, id, estado, titulo: id, detalle: "", verbo: "Ver", href: "/" });

  it("el submódulo donde se está va primero, los vacíos no salen y lo que frena va arriba", () => {
    const g = agruparPendientes([p("finanzas.gastos", "a", "avisa"), p("finanzas.cierre", "b", "avisa"), p("finanzas.cierre", "c", "frena")], SUB, "finanzas.cierre");
    expect(g.map((x) => [x.etiqueta, x.pendientes.map((y) => y.id)])).toEqual([
      ["Cierre de mes", ["c", "b"]],
      ["Gastos", ["a"]],
    ]);
  });
});

describe("pendientesDeImpuestos", () => {
  const lista: PendienteImpuesto[] = [
    { modulo: "impuestos", id: "rechazados", estado: "frena", titulo: "1 comprobante rechazado", detalle: "…", verbo: "Ver en Comprobantes", href: "/vender/comprobantes" },
    { modulo: "impuestos", id: "aviso_umbral", estado: "avisa", titulo: "Llevas…", detalle: "…", verbo: null, href: null },
  ];

  it("toma la forma de «Te toca»: su submódulo, id con prefijo, siempre un verbo y un destino", () => {
    expect(pendientesDeImpuestos(lista, "sede=lim")).toEqual([
      { submodulo: "finanzas.impuestos", id: "impuestos.rechazados", estado: "frena", titulo: "1 comprobante rechazado", detalle: "…", verbo: "Ver en Comprobantes", href: "/vender/comprobantes" },
      { submodulo: "finanzas.impuestos", id: "impuestos.aviso_umbral", estado: "avisa", titulo: "Llevas…", detalle: "…", verbo: "Ver", href: "/finanzas/impuestos?sede=lim" },
    ]);
  });

  it("sin consulta, lleva a Impuestos a secas", () => {
    expect(pendientesDeImpuestos([lista[1]!], "")[0]!.href).toBe("/finanzas/impuestos");
  });
});

describe("pendientes nuevos del cajón (tarea 1)", () => {
  it("los fijos que faltan se juntan en uno, con su monto y su pestaña", () => {
    expect(pendientesDeFijos([], "")).toEqual([]);
    const [p] = pendientesDeFijos([{ monto: 100 }, { monto: 50 }], "sede=a");
    expect(p!.titulo).toContain("2 gastos fijos");
    expect(p!.href).toBe("/finanzas/gastos?sede=a&tab=fijos");
  });
  it("el mes anterior abierto se dice con su nombre; cerrado, nada", () => {
    expect(cierreDeTeToca({ mes: "2026-10", mesNombre: "octubre", clave: "tru", lectura: { datos: ["tru"], falla: null } }).pendientes).toEqual([]);
    const [p] = cierreDeTeToca({ mes: "2026-10", mesNombre: "octubre", clave: "tru", lectura: { datos: ["lim"], falla: null } }).pendientes;
    expect(p!.titulo).toBe("Octubre sigue abierto");
    expect(p!.submodulo).toBe("finanzas.cierreDeMes");
  });
});

describe("el cierre en Te toca distingue «falló» de «no hay cerrados» (tarea 155)", () => {
  const base = { mes: "2026-10", mesNombre: "octubre", clave: "consolidado" };
  it("con la lectura caída no afirma que sigue abierto: marca el cajón incompleto", () => {
    expect(cierreDeTeToca({ ...base, lectura: { datos: [], falla: "No se pudo leer los meses cerrados: boom" } })).toEqual({ pendientes: [], incompleto: true });
  });
  it("leído y sin cerrar, avisa; leído y cerrado, nada", () => {
    const abierto = cierreDeTeToca({ ...base, lectura: { datos: [], falla: null } });
    expect(abierto.incompleto).toBe(false);
    expect(abierto.pendientes[0]!.titulo).toBe("Octubre sigue abierto");
    expect(cierreDeTeToca({ ...base, lectura: { datos: ["consolidado"], falla: null } })).toEqual({ pendientes: [], incompleto: false });
  });
});

describe("cuándo vuelve a preguntar al recibir el foco (tarea 155)", () => {
  const T = 1_000_000;
  it("una vez por minuto como máximo: cada pregunta son cerca de una docena de lecturas", () => {
    expect(puedeVolverAPreguntar(T, T + 59_999)).toBe(false);
    expect(puedeVolverAPreguntar(T, T + 60_000)).toBe(true);
  });
});

describe("lo que dice el cajón según las sedes marcadas (tarea 143)", () => {
  it("con una sede o todas habla de la sede elegida", () => {
    expect(frasesDeTeToca(false)).toEqual({ frase: "Lo que conviene hacer hoy en Finanzas, para la sede que elegiste arriba.", vacio: "Nada te toca en Finanzas para esta sede." });
  });
  it("con varias marcadas no finge filtrar: dice que son de todas las sedes", () => {
    expect(frasesDeTeToca(true)).toEqual({ frase: "Lo que conviene hacer hoy en Finanzas, de todas las sedes.", vacio: "Nada te toca en Finanzas en ninguna sede." });
  });
});

describe("listaDeHoy: una sola lista con el cajón (tarea 1)", () => {
  const aviso = (clave: string, tono: Aviso["tono"] = "ambar"): Aviso => ({ clave, tono, titulo: clave, detalle: "", impacto: null, href: null, boton: "", origen: "", orden: 5, peso: 0 });
  const pend = (id: string, estado: PendienteTelar["estado"] = "avisa"): PendienteTelar => ({ submodulo: "s", id, estado, titulo: id, detalle: "", verbo: "Ver", href: "/x" });
  const claves = (as: readonly Aviso[]) => as.map((a) => a.clave);
  it("lo que el cajón ya dice no se repite; la lectura del Resumen se queda", () => {
    const lista = listaDeHoy([pend("dinero.vencidas", "frena"), pend("dinero.planilla")], false, [aviso("vencida:1", "rojo"), aviso("minimo", "rojo"), aviso("egresos"), aviso("cierre"), aviso("pierde:a")]);
    expect(claves(lista)).toEqual(expect.arrayContaining(["dinero.vencidas", "dinero.planilla", "minimo", "pierde:a"]));
    expect(claves(lista)).not.toContain("vencida:1");
    expect(claves(lista)).not.toContain("egresos");
    expect(claves(lista)).not.toContain("cierre");
  });
  it("lo que frena va en rojo, antes que lo que avisa", () => {
    const lista = listaDeHoy([pend("dinero.planilla"), pend("dinero.vencidas", "frena")], false, []);
    expect(lista[0]!.clave).toBe("dinero.vencidas");
    expect(lista[0]!.tono).toBe("rojo");
  });
  it("si el cajón no respondió, los avisos del Resumen siguen: nunca se calla lo vencido", () => {
    expect(claves(listaDeHoy(null, true, [aviso("vencida:1", "rojo")]))).toEqual(["vencida:1"]);
  });
  it("si respondió a medias, se suman sin repetir lo que el Resumen ya dice", () => {
    const lista = listaDeHoy([pend("dinero.vencidas", "frena"), pend("dinero.planilla")], true, [aviso("vencida:1", "rojo")]);
    expect(claves(lista).sort()).toEqual(["dinero.planilla", "vencida:1"]);
  });
});
