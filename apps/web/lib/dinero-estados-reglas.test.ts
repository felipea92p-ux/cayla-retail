import { describe, expect, it } from "vitest";
import type { GrupoCuentas } from "./dinero-telar-reglas";
import {
  cierresConFaltante,
  contadorDeCampana,
  etapaDe,
  filasDeCierres,
  filasDeEstado,
  filtrosDeEstado,
  fraseDeEtapas,
  itemsDeAtencion,
  totalesPorEtapa,
  FILTROS_ESTADO,
  ordenarEstados,
  paginar,
  filtrosDeCierres,
  pasaCierre,
  porRegistrar,
  type FilaEstado,
} from "./dinero-estados-reglas";

const fila = (id: string, tipo: GrupoCuentas["filas"][number]["tipo"], saldo: number | null, ins: GrupoCuentas["filas"][number]["insignia"] = null) => ({
  id,
  nombre: id,
  tipo,
  saldo,
  escala: null,
  insignia: ins,
  detalle: null,
});
const grupo = (clave: string, titulo: string, filas: GrupoCuentas["filas"]): GrupoCuentas => ({ clave, titulo, posicion: 0, total: 0, ocultos: false, filas, nota: null });

const grupos: GrupoCuentas[] = [
  grupo("aqp", "Tienda AQP", [fila("cj", "cajon", 302), fila("cf", "caja_fuerte", 861, { texto: "depositada hace 2 días", tono: "verde" })]),
  grupo("tru", "Tienda TRU", [fila("cf2", "caja_fuerte", 3900, { texto: "6 días sin depositar", tono: "ambar" })]),
  grupo("empresa", "Empresa", [fila("bcp", "banco", 4009, { texto: "sin conciliar", tono: "ambar" }), fila("ibk", "banco", 9830, { texto: "conciliada 14 oct", tono: "verde" }), fila("lider", "por_rendir", -5)]),
  grupo("camino", "En camino", [fila("izi", "por_abonar", 8190, { texto: "4 días sin abonar", tono: "pizarra" }), fila("ven", "por_abonar", 3169, { texto: "2 días sin abonar", tono: "pizarra" })]),
];

describe("etapaDe", () => {
  it("lleva cada tipo de cuenta a su etapa del recorrido", () => {
    expect(etapaDe("banco")).toBe("banco");
    expect(etapaDe("por_abonar")).toBe("camino");
    expect(etapaDe("caja_fuerte")).toBe("deposito");
    expect(etapaDe("por_rendir")).toBe("deposito");
    expect(etapaDe("cajon")).toBe("caja");
  });
});

describe("filasDeEstado", () => {
  const filas = filasDeEstado(grupos, new Set(["izi"]));
  const por = (id: string) => filas.find((f) => f.id === id)!;

  it("una fila por cuenta, con su sede; lo que viene en camino no tiene sede", () => {
    expect(filas).toHaveLength(8);
    expect(por("cj").sede).toBe("Tienda AQP");
    expect(por("izi").sede).toBe("Sin sede");
    expect(por("izi").sinSede).toBe(true);
  });

  it("un saldo negativo pide revisión, en rojo, aunque tenga otra insignia", () => {
    expect(por("lider").pide).toBe("negativo");
    expect(por("lider").estado).toEqual({ texto: "Saldo negativo: revisar", tono: "rojo" });
  });

  it("«sin abonar» solo pide atención si la máquina ya se atrasó (y entonces pasa a ámbar)", () => {
    expect(por("izi").pide).toBe("abonar");
    expect(por("izi").estado?.tono).toBe("ambar");
    expect(por("ven").pide).toBeNull();
    expect(por("ven").estado?.tono).toBe("pizarra");
  });

  it("un banco sin conciliar y una caja fuerte sin depositar piden atención; una al día, no", () => {
    expect(por("bcp").pide).toBe("conciliar");
    expect(por("cf2").pide).toBe("depositar");
    expect(por("ibk").pide).toBeNull();
    expect(por("cf").pide).toBeNull();
  });

  it("no inventa un estado: una cuenta sin insignia queda sin estado", () => {
    expect(por("cj").estado).toBeNull();
  });
});

describe("filtros", () => {
  const filas = filasDeEstado(grupos, new Set(["izi"]));
  it("muestra siempre todos los filtros, cada uno con su cuenta, también los que hoy están en cero", () => {
    const f = filtrosDeEstado(filas);
    const n = (c: string) => f.find((x) => x.clave === c)?.n;
    expect(f.map((x) => x.clave)).toEqual(["todas", "atencion", "conciliar", "abonar", "depositar", "negativo"]);
    expect(n("todas")).toBe(8);
    expect(n("atencion")).toBe(4);
    expect(n("conciliar")).toBe(1);
    expect(n("abonar")).toBe(1);
    expect(n("negativo")).toBe(1);
    const sinNada = filtrosDeEstado(filas.filter((x) => x.pide === null));
    expect(sinNada.map((x) => x.clave)).toEqual(["todas", "atencion", "conciliar", "abonar", "depositar", "negativo"]);
    expect(sinNada.find((x) => x.clave === "abonar")?.n).toBe(0);
  });
  it("«Piden atención» es la unión de los demás filtros", () => {
    const pasa = (c: string) => filas.filter(FILTROS_ESTADO.find((f) => f.clave === c)!.pasa).map((f) => f.id);
    const unidos = new Set(["conciliar", "abonar", "depositar", "negativo"].flatMap(pasa));
    expect(new Set(pasa("atencion"))).toEqual(unidos);
  });
});

describe("ordenarEstados", () => {
  const filas = filasDeEstado(grupos, new Set(["izi"]));
  it("de entrada, lo más grave primero: negativo, sin abonar, sin conciliar, sin depositar, y al final lo que está bien", () => {
    const o = ordenarEstados(filas, { campo: "estado", dir: "asc" });
    expect(o.slice(0, 4).map((f) => f.id)).toEqual(["lider", "izi", "bcp", "cf2"]);
    expect(o.slice(4).every((f) => f.pide === null)).toBe(true);
  });
  it("por saldo, de mayor a menor, y al invertir cambia", () => {
    expect(ordenarEstados(filas, { campo: "saldo", dir: "desc" })[0].id).toBe("ibk");
    expect(ordenarEstados(filas, { campo: "saldo", dir: "asc" })[0].id).toBe("lider");
  });
  it("por etapa va del banco a la caja y no cambia las filas", () => {
    const o = ordenarEstados(filas, { campo: "etapa", dir: "asc" });
    expect(o).toHaveLength(filas.length);
    expect(o[0].etapa).toBe("banco");
    expect(o.at(-1)?.etapa).toBe("caja");
  });
  it("no toca la lista original", () => {
    const copia = [...filas];
    ordenarEstados(filas, { campo: "saldo", dir: "desc" });
    expect(filas).toEqual(copia);
  });
});

describe("paginar", () => {
  const lista = Array.from({ length: 73 }, (_, i) => i + 1);
  it("30 por página: 3 páginas, la última con 13", () => {
    const p = paginar(lista, 3, 30);
    expect(p.totalPaginas).toBe(3);
    expect(p.visibles).toHaveLength(13);
    expect([p.desde, p.hasta, p.total]).toEqual([61, 73, 73]);
  });
  it("40 por página: 2 páginas", () => expect(paginar(lista, 1, 40).totalPaginas).toBe(2));
  it("una página que se pasa del final cae en la última; una lista vacía no rompe", () => {
    expect(paginar(lista, 99, 30).pagina).toBe(3);
    const v = paginar([], 1, 30);
    expect([v.desde, v.hasta, v.totalPaginas]).toEqual([0, 0, 1]);
  });
});

describe("cierres con diferencia", () => {
  const cierres = filasDeCierres([
    { cajaId: "a", ubicacionNombre: "Tienda TRU", cerradaEn: "2026-10-28T23:00:00Z", diferencia: 180.5, cerradaPor: "Janis Revilla" },
    { cajaId: "b", ubicacionNombre: "Tienda LIM", cerradaEn: "2026-10-28T23:30:00Z", diferencia: -233, cerradaPor: "Claudia Pereyra" },
    { cajaId: "c", ubicacionNombre: "Tienda TRU", cerradaEn: "2026-10-27T23:00:00Z", diferencia: 0.5, cerradaPor: null },
  ]);
  it("lee el día de Lima de cada cierre", () => expect(cierres[0].dia).toBe("miércoles 28"));
  it("cuenta solo los que faltaron plata", () => expect(cierresConFaltante(cierres)).toBe(1));
  it("sus filtros: todos, faltaron, sobraron y TODAS las sedes, también la que no tuvo cierres (con 0)", () => {
    const f = filtrosDeCierres(cierres, ["Tienda AQP", "Tienda LIM", "Tienda TRU"]);
    expect(f.map((x) => [x.clave, x.n])).toEqual([["todos", 3], ["faltaron", 1], ["sobraron", 2], ["sede:Tienda AQP", 0], ["sede:Tienda LIM", 1], ["sede:Tienda TRU", 2]]);
    expect(cierres.filter((c) => pasaCierre(c, "sede:Tienda TRU"))).toHaveLength(2);
    expect(cierres.filter((c) => pasaCierre(c, "faltaron"))).toHaveLength(1);
  });
  it("una sede con cierre que no vino en la lista del negocio igual aparece", () => {
    expect(filtrosDeCierres(cierres, []).map((x) => x.clave)).toContain("sede:Tienda LIM");
  });
});

describe("contadorDeCampana", () => {
  const filas: FilaEstado[] = filasDeEstado(grupos, new Set(["izi"]));
  const cierres = filasDeCierres([{ cajaId: "b", ubicacionNombre: "Tienda LIM", cerradaEn: "2026-10-28T23:30:00Z", diferencia: -233, cerradaPor: null }]);
  it("suma cuentas, cierres con faltante y planilla; la máquina atrasada no se cuenta dos veces", () => {
    const pendientes = porRegistrar(
      [{ maquinaId: "m", nombre: "Izipay", cuentaId: "izi", pendientes: 3, montoPendiente: 100, esperado: null, atrasados: 2, montoAtrasado: 80, diasHabilesMasViejo: 4, diasAbono: 0, sinTarifa: false }],
      [{ clave: "p1", periodoId: "x", grupo: "planilla", pagadoEl: "2026-10-29", titulo: "Falta registrar", detalle: "d", tramos: [{ texto: "BCP · 12 personas" } as never], porRegistrar: [{} as never, {} as never], total: 1 }],
    );
    expect(pendientes).toHaveLength(2);
    expect(pendientes[0].accion).toMatchObject({ tipo: "maquina", cuentaId: "izi" });
    expect(pendientes[1].accion).toMatchObject({ tipo: "planilla", clave: "p1" });
    // 4 cuentas piden atención + 1 cierre con faltante + 1 planilla; Izipay ya está entre las 4.
    expect(contadorDeCampana(filas, cierres, pendientes)).toBe(6);
  });
  it("sin nada pendiente, cero", () => {
    expect(contadorDeCampana(filas.filter((f) => f.pide === null), [], [])).toBe(0);
  });
});

describe("totalesPorEtapa", () => {
  it("suma cada etapa del recorrido (siempre las cuatro, en orden) y no cuenta un saldo oculto", () => {
    const filas = filasDeEstado(grupos, new Set());
    const t = totalesPorEtapa(filas);
    expect(t.map((x) => x.etapa)).toEqual(["banco", "camino", "deposito", "caja"]);
    expect(t[0].total).toBe(13839);
    expect(t[1].total).toBe(11359);
    expect(t[2].total).toBe(4756);
    expect(t[3].total).toBe(302);
    expect(totalesPorEtapa([{ etapa: "caja", saldo: null }])[3]).toMatchObject({ total: 0, cuentas: 1 });
  });
});

describe("itemsDeAtencion: lo que CAYLA le debe al dueño", () => {
  const filas = filasDeEstado(grupos, new Set());
  const dueno = { deuda: 8500, prestamos: [{ fecha: "2026-10-12", monto: 10000, devuelto: 1500 }] };
  it("con deuda, un aviso que dice cuánto, de qué préstamo y cuánto ya se devolvió, con «Devolver»", () => {
    const it = itemsDeAtencion(filas, [], [], true, dueno).find((x) => x.clave === "dueno")!;
    expect(it.titulo).toContain("8,500");
    expect(it.detalle).toContain("devuelto");
    expect(it.accion).toMatchObject({ tipo: "movimiento", que: "dueno_saca", texto: "Devolver" });
  });
  it("sin deuda o sin dato del dueño, ningún aviso del dueño", () => {
    expect(itemsDeAtencion(filas, [], [], true, { deuda: 0, prestamos: [] }).some((x) => x.clave === "dueno")).toBe(false);
    expect(itemsDeAtencion(filas, [], [], true).some((x) => x.clave === "dueno")).toBe(false);
  });
});

describe("itemsDeAtencion", () => {
  const filas = filasDeEstado(grupos, new Set(["izi"]));
  const pend = porRegistrar(
    [{ maquinaId: "m", nombre: "Izipay", cuentaId: "izi", pendientes: 3, montoPendiente: 100, esperado: null, atrasados: 2, montoAtrasado: 80, diasHabilesMasViejo: 4, diasAbono: 0, sinTarifa: false }],
    [{ clave: "p1", periodoId: "x", grupo: "planilla", pagadoEl: "2026-10-29", titulo: "Falta registrar la planilla", detalle: "d", tramos: [], porRegistrar: [{} as never], total: 1 }],
  );
  const cierres = filasDeCierres([{ cajaId: "b", ubicacionNombre: "Tienda LIM", cerradaEn: "2026-10-28T23:30:00Z", diferencia: -233, cerradaPor: null }]);
  it("de lo más grave a lo menos: negativo, máquina, banco, caja fuerte, cierres y planilla", () => {
    const it = itemsDeAtencion(filas, cierres, pend, true);
    expect(it.map((x) => x.clave.split("-")[0])).toEqual(["neg", "maquina", "con", "dep", "cierres", "planilla"]);
    expect(it[0].tono).toBe("error");
  });
  it("cada aviso trae la acción de siempre: abrir Registrar movimiento, ir a Cuadrar o abrir la campana", () => {
    const it = itemsDeAtencion(filas, cierres, pend, true);
    expect(it[1].accion).toMatchObject({ tipo: "movimiento", que: "abono_tarjeta", cuentaId: "izi" });
    expect(it[2].accion).toMatchObject({ tipo: "enlace", href: "/finanzas/dinero/conciliacion" });
    expect(it[3].accion).toMatchObject({ tipo: "movimiento", que: "deposito", cuentaId: "cf2" });
    expect(it[4].accion).toMatchObject({ tipo: "campana", vista: "cierres" });
  });
  it("quien no es líder ve el aviso pero no el botón de lo que solo el líder hace", () => {
    const it = itemsDeAtencion(filas, cierres, pend, false);
    expect(it.find((x) => x.clave.startsWith("con-"))?.accion).toBeNull();
    expect(it.find((x) => x.clave.startsWith("maquina-"))?.accion).toBeNull();
    expect(it.find((x) => x.clave.startsWith("dep-"))?.accion).not.toBeNull();
  });
  it("sin nada que pida atención, no hay avisos", () => {
    expect(itemsDeAtencion(filas.filter((f) => f.pide === null), [], [], true)).toEqual([]);
  });
});

describe("fraseDeEtapas", () => {
  const t = (banco: number, camino: number, deposito: number, caja: number) => [
    { etapa: "banco" as const, total: banco },
    { etapa: "camino" as const, total: camino },
    { etapa: "deposito" as const, total: deposito },
    { etapa: "caja" as const, total: caja },
  ];
  it("nombra solo lo que hay, de lo más usable a lo que está más lejos", () => {
    expect(fraseDeEtapas(t(0, 0, 222, 797)).replace(/\u00a0/g, " ")).toBe("Faltan por llevar al banco S/ 222 de las cajas fuertes y del líder; S/ 797 están en las cajas de venta.");
    expect(fraseDeEtapas(t(28130, 3450, 0, 0)).replace(/\u00a0/g, " ")).toBe("Ya puedes usar S/ 28,130 que están en el banco; S/ 3,450 vienen en camino con las máquinas.");
  });
  it("sin plata en ninguna etapa, lo dice", () => expect(fraseDeEtapas(t(0, 0, 0, 0))).toBe("Todavía no hay plata registrada en estas cuentas."));
});
