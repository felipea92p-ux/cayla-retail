import { describe, expect, it } from "vitest";
import type { PedidoDeInsumo } from "./orden-pagina-reglas";
import type { FilaTela, PagosDelTaller } from "./produccion-decisiones";
import {
  AYUDA_MODELOS,
  AYUDA_POR_RESOLVER,
  AYUDA_TELA,
  barraDeStock,
  cuantoDura,
  insigniaDeTela,
  paresDeTela,
  pedidosDeTela,
  recuadroDeModelos,
  recuadroDeOrdenes,
  recuadroDePagos,
  recuadroDeTelas,
  recuadroDeVigilar,
  recuadrosDeLoDemas,
  tituloDeLoDemas,
  ventaPorSemanaDeModelo,
  type OrdenEnCurso,
} from "./produccion-en-orden";

// «Lo demás está en orden» (Producción ▸ Resumen, versión C): cada recuadro resume una sección en dos líneas y es HONESTO. Solo lleva el visto (`bien`) si lo que dice es cierto y no
// pide nada; lo que ya está en «Por resolver» se nombra sin volver a hacer de alarma; y una lectura que falló se dice.

const orden = (extra: { atrasada?: boolean; fecha?: string | null; causas?: string[]; estado?: string } = {}): OrdenEnCurso => ({
  estado: extra.estado ?? "en_proceso",
  entrega: { fecha: extra.fecha === undefined ? "2026-12-01" : extra.fecha, atrasada: extra.atrasada ?? false },
  causas: (extra.causas ?? []).map((clave) => ({ clave })),
});

describe("el recuadro de órdenes", () => {
  it("todas a tiempo: el visto y «Ninguna atrasada»; cuenta solo las abiertas", () => {
    expect(recuadroDeOrdenes([orden(), orden(), orden({ estado: "terminada" })], {})).toEqual({ clave: "ordenes", href: "/produccion/ordenes", tono: "bien", titulo: "2 órdenes en curso", linea: "Ninguna atrasada" });
    expect(recuadroDeOrdenes([orden()], {}).titulo).toBe("1 orden en curso");
  });

  it("un atraso que ya está en «Por resolver» no se repite como alarma: «Sin más atrasos»", () => {
    const filas = [orden({ atrasada: true, causas: ["entrega_pasada"] }), orden()];
    expect(recuadroDeOrdenes(filas, { entrega: 1 })).toMatchObject({ tono: "bien", linea: "Sin más atrasos" });
  });

  it("un atraso que NO tiene su asunto arriba sí se dice aquí", () => {
    const filas = [orden({ atrasada: true }), orden({ atrasada: true }), orden()];
    expect(recuadroDeOrdenes(filas, { entrega: 1 })).toMatchObject({ tono: "atencion", linea: "2 atrasadas" });
    expect(recuadroDeOrdenes([orden({ atrasada: true })], {})).toMatchObject({ tono: "atencion", linea: "1 atrasada" });
  });

  it("una orden parada hace días no está en «Por resolver»: el recuadro lo dice y no pone el visto", () => {
    expect(recuadroDeOrdenes([orden({ causas: ["sin_moverse"] }), orden()], {})).toMatchObject({ tono: "atencion", linea: "1 lleva días sin moverse" });
    expect(recuadroDeOrdenes([orden({ causas: ["sin_moverse"] }), orden({ causas: ["sin_moverse", "entrega_pasada"], atrasada: true })], { entrega: 1 })).toMatchObject({ tono: "atencion", linea: "2 llevan días sin moverse" });
  });

  it("una orden que espera tela: alarma solo si arriba no hay ningún asunto de tela", () => {
    const filas = [orden({ causas: ["tela_no_llega"] }), orden()];
    expect(recuadroDeOrdenes(filas, {})).toMatchObject({ tono: "atencion", linea: "1 espera tela" });
    expect(recuadroDeOrdenes([...filas, orden({ causas: ["tela_no_llega"] })], {})).toMatchObject({ linea: "2 esperan tela" });
    expect(recuadroDeOrdenes(filas, { insumo: 1 })).toMatchObject({ tono: "bien", linea: "Sin más pendientes" });
    expect(recuadroDeOrdenes(filas, { recibir: 1 })).toMatchObject({ tono: "bien", linea: "Sin más pendientes" });
  });

  it("si ninguna orden tiene fecha de entrega no afirma «ninguna atrasada»: no se sabe", () => {
    expect(recuadroDeOrdenes([orden({ fecha: null }), orden({ fecha: null })], {})).toMatchObject({ tono: "neutro", linea: "Ninguna tiene fecha de entrega" });
    expect(recuadroDeOrdenes([orden({ fecha: null }), orden()], {})).toMatchObject({ tono: "bien", linea: "Ninguna atrasada" });
  });

  it("sin órdenes abiertas no hay nada que afirmar, y si la lista no se pudo leer lo dice y manda a Órdenes", () => {
    expect(recuadroDeOrdenes([], {})).toMatchObject({ tono: "neutro", titulo: "Ninguna orden en curso", href: "/produccion/ordenes" });
    expect(recuadroDeOrdenes(null, {})).toEqual({ clave: "ordenes", href: "/produccion/ordenes", tono: "atencion", titulo: "Órdenes sin leer", linea: "Míralas en Órdenes" });
  });
});

const tela = (estado: FilaTela["estado"]) => ({ estado });

describe("el recuadro de telas", () => {
  it("todas alcanzan: el visto, y se despliega en el lugar", () => {
    expect(recuadroDeTelas([tela("alcanza"), tela("alcanza"), tela("alcanza"), tela("sin_demanda")], {})).toEqual({ clave: "telas", despliega: true, tono: "bien", titulo: "3 telas alcanzan", linea: "Para los cortes" });
    expect(recuadroDeTelas([tela("alcanza")], {}).titulo).toBe("1 tela alcanza");
  });

  it("si una no alcanza dice cuántas alcanzan y cuántas no; con su asunto arriba, sin alarma", () => {
    const telas = [tela("alcanza"), tela("alcanza"), tela("falta")];
    expect(recuadroDeTelas(telas, { insumo: 1 })).toMatchObject({ tono: "bien", titulo: "2 telas alcanzan", linea: "1 no alcanza: está en Por resolver" });
    expect(recuadroDeTelas([...telas, tela("alcanza_si_llega")], { insumo: 1, recibir: 1 })).toMatchObject({ tono: "bien", linea: "2 no alcanzan: están en Por resolver" });
  });

  it("si lo que no alcanza no está todo arriba, el recuadro avisa", () => {
    expect(recuadroDeTelas([tela("alcanza"), tela("falta"), tela("falta")], { insumo: 1 })).toMatchObject({ tono: "atencion", linea: "2 no alcanzan" });
    expect(recuadroDeTelas([tela("alcanza"), tela("alcanza_si_llega")], {})).toMatchObject({ tono: "atencion", linea: "1 no alcanza" });
  });

  it("si ninguna alcanza nunca lleva el visto, aunque ya esté avisado", () => {
    expect(recuadroDeTelas([tela("falta")], { insumo: 1 })).toMatchObject({ tono: "neutro", titulo: "1 tela no alcanza", linea: "Ya está en Por resolver" });
    expect(recuadroDeTelas([tela("falta")], {})).toMatchObject({ tono: "atencion", titulo: "1 tela no alcanza", linea: "Mira cuáles" });
    expect(recuadroDeTelas([tela("falta"), tela("alcanza_si_llega")], { insumo: 1, recibir: 1 })).toMatchObject({ tono: "neutro", titulo: "2 telas no alcanzan", linea: "Ya están en Por resolver" });
  });

  it("si ninguna orden pide tela no afirma que alcanza; sin telas cargadas manda a Insumos", () => {
    expect(recuadroDeTelas([tela("sin_demanda"), tela("sin_demanda")], {})).toMatchObject({ tono: "neutro", titulo: "Ninguna orden pide tela", linea: "Hay 2 telas en el Taller", despliega: true });
    expect(recuadroDeTelas([tela("sin_demanda")], {}).linea).toBe("Hay 1 tela en el Taller");
    expect(recuadroDeTelas([], {})).toEqual({ clave: "telas", tono: "neutro", titulo: "Sin telas cargadas", linea: "Cárgalas en Insumos", href: "/produccion/insumos" });
  });
});

describe("el recuadro de modelos", () => {
  const m = (estado: "producir_ya" | "alcanza" | "sobrestock" | "sin_ritmo" | "vigilar") => ({ estado });
  it("cuenta los que hoy no piden fabricar (todos menos «Producir ya») y despliega su tabla", () => {
    expect(recuadroDeModelos([m("producir_ya"), m("alcanza"), m("sobrestock"), m("sin_ritmo")], false)).toEqual({ clave: "modelos", tono: "bien", titulo: "3 modelos pueden esperar", linea: "Hoy no piden fabricar", despliega: true });
    expect(recuadroDeModelos([m("vigilar")], false)?.titulo).toBe("1 modelo puede esperar");
  });
  it("si todos piden fabricar no hay recuadro; sin modelos lo dice; si la red falló no afirma nada", () => {
    expect(recuadroDeModelos([m("producir_ya")], false)).toBeNull();
    expect(recuadroDeModelos([], false)).toMatchObject({ tono: "neutro", titulo: "Ningún modelo todavía" });
    expect(recuadroDeModelos([], true)).toEqual({ clave: "modelos", tono: "atencion", titulo: "Modelos sin leer", linea: "No pudimos leer las ventas" });
  });
});

describe("el recuadro de pagos", () => {
  const pagos = (extra: Partial<PagosDelTaller> = {}): PagosDelTaller => ({ porPagar: 0, vencido: 0, estaSemana: 0, facturasCargadas: 3, ...extra });
  it("nada vencido ni por vencer: el visto; sin deuda, «No se debe nada»", () => {
    expect(recuadroDePagos(pagos({ porPagar: 1200 }), {})).toEqual({ clave: "pagos", href: "/produccion/por-pagar", tono: "bien", titulo: "Ningún pago vencido", linea: "Ni por vencer esta semana" });
    expect(recuadroDePagos(pagos(), {})).toMatchObject({ tono: "bien", titulo: "No se debe nada" });
  });
  it("lo vencido o por vencer ya está en «Por resolver»: aquí solo se dice que no hay más", () => {
    expect(recuadroDePagos(pagos({ porPagar: 900, vencido: 500 }), { pago: 1 })).toMatchObject({ tono: "bien", titulo: "Sin más pagos", linea: "Por vencer esta semana" });
    expect(recuadroDePagos(pagos({ porPagar: 900, estaSemana: 300 }), { pago: 1 })).toMatchObject({ tono: "bien", titulo: "Sin más pagos" });
  });
  it("si no tuviera su asunto arriba, lo dice él", () => {
    expect(recuadroDePagos(pagos({ porPagar: 900, vencido: 500 }), {})).toMatchObject({ tono: "atencion", titulo: "Hay pagos vencidos", linea: "Míralos en Por pagar" });
    expect(recuadroDePagos(pagos({ porPagar: 900, estaSemana: 300 }), {})).toMatchObject({ tono: "atencion", titulo: "Vencen pagos esta semana" });
  });
  it("sin ninguna factura cargada no afirma «no se debe nada»", () => {
    expect(recuadroDePagos(pagos({ facturasCargadas: 0 }), {})).toMatchObject({ tono: "neutro", titulo: "Sin facturas cargadas" });
  });
});

describe("el recuadro de los modelos para vigilar y el bloque entero", () => {
  it("solo existe si hay alguno, y no es ni un visto ni una alarma", () => {
    expect(recuadroDeVigilar(0)).toBeNull();
    expect(recuadroDeVigilar(1)).toEqual({ clave: "vigilar", tono: "neutro", titulo: "1 modelo para vigilar", linea: "Vendieron poco: todavía no fabricar", despliega: true });
    expect(recuadroDeVigilar(4)?.titulo).toBe("4 modelos para vigilar");
  });

  const base = { ordenes: [orden()], telas: [tela("alcanza")], modelos: [{ estado: "alcanza" as const }], falloRed: false, pagos: { porPagar: 0, vencido: 0, estaSemana: 0, facturasCargadas: 2 }, paraVigilar: 0, avisados: {} };

  it("van en orden: órdenes, telas, modelos, pagos y, si hay, para vigilar", () => {
    expect(recuadrosDeLoDemas(base).map((r) => r.clave)).toEqual(["ordenes", "telas", "modelos", "pagos"]);
    expect(recuadrosDeLoDemas({ ...base, paraVigilar: 2 }).map((r) => r.clave)).toEqual(["ordenes", "telas", "modelos", "pagos", "vigilar"]);
    expect(recuadrosDeLoDemas({ ...base, modelos: [{ estado: "producir_ya" }] }).map((r) => r.clave)).toEqual(["ordenes", "telas", "pagos"]);
  });

  it("el título dice «está en orden» solo si ningún recuadro pide atención", () => {
    expect(tituloDeLoDemas(recuadrosDeLoDemas(base))).toBe("Lo demás está en orden");
    expect(tituloDeLoDemas(recuadrosDeLoDemas({ ...base, paraVigilar: 2 }))).toBe("Lo demás está en orden");
    expect(tituloDeLoDemas(recuadrosDeLoDemas({ ...base, ordenes: null }))).toBe("Lo demás, de un vistazo");
  });

  it("ninguna línea pasa de 8 palabras ni lleva punto medio (poco texto a la vista)", () => {
    const casos = [
      ...recuadrosDeLoDemas({ ...base, paraVigilar: 3 }),
      ...recuadrosDeLoDemas({ ...base, ordenes: null, telas: [], modelos: [], falloRed: true, pagos: { porPagar: 5, vencido: 5, estaSemana: 0, facturasCargadas: 1 } }),
      recuadroDeOrdenes([orden({ causas: ["sin_moverse"] }), orden({ causas: ["sin_moverse"] })], {}),
      recuadroDeTelas([tela("alcanza"), tela("falta"), tela("falta")], { insumo: 2 }),
      recuadroDeOrdenes([orden({ fecha: null })], {}),
    ];
    for (const r of casos) {
      expect(r.linea.split(/\s+/).length, r.linea).toBeLessThanOrEqual(8);
      expect(`${r.titulo} ${r.linea}`).not.toContain("·");
    }
  });
});

describe("«¿Alcanza la tela?»: cada tela, en piezas", () => {
  const pedido = (extra: Partial<PedidoDeInsumo> = {}): PedidoDeInsumo => ({ numeroTexto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fechaEntrega: "2026-10-23", atrasado: false, ...extra });
  const fila = (extra: Partial<FilaTela> = {}): FilaTela => ({ insumoId: "lino", nombre: "Lino crudo", unidad: "metro", saldo: 30, porLlegar: 0, facturado: 0, enCamino: 0, atrasado: 0, piden: 0, estado: "sin_demanda", faltan: 0, pedidos: [], ...extra });

  it("la insignia dice el estado con las palabras aprobadas: «Nadie la pide», «Alcanza», «Alcanza si llega» y cuánto falta", () => {
    expect(insigniaDeTela(fila())).toEqual({ texto: "Nadie la pide", tono: "neutro" });
    expect(insigniaDeTela(fila({ estado: "alcanza" }))).toEqual({ texto: "Alcanza", tono: "verde" });
    expect(insigniaDeTela(fila({ estado: "alcanza_si_llega" }))).toEqual({ texto: "Alcanza si llega", tono: "ambar" });
    expect(insigniaDeTela(fila({ estado: "falta", faltan: 12 }))).toEqual({ texto: "Faltan 12.00 m", tono: "ambar" });
  });

  it("«Hay» va siempre; los demás pares solo si tienen algo que decir, y lo atrasado avisa que no se cuenta", () => {
    expect(paresDeTela(fila())).toEqual([{ rotulo: "Hay", valor: "30.00 m" }]);
    expect(paresDeTela(fila({ piden: 42, enCamino: 20, facturado: 5, atrasado: 8 }))).toEqual([
      { rotulo: "Hay", valor: "30.00 m" },
      { rotulo: "Se necesitan", valor: "42.00 m" },
      { rotulo: "En camino", valor: "20.00 m" },
      { rotulo: "Facturado por recibir", valor: "5.00 m" },
      { rotulo: "Atrasado, no se cuenta", valor: "8.00 m", tono: "ambar" },
    ]);
  });

  it("los pedidos se nombran en una frase, sin punto medio: dos y «y N más»", () => {
    expect(pedidosDeTela(fila())).toBeUndefined();
    expect(pedidosDeTela(fila({ pedidos: [pedido()] }))).toBe("Pedidos: OI-000003, 50 m a Textiles Andinos, llega el vie 23 oct.");
    const tres = pedidosDeTela(fila({ pedidos: [pedido(), pedido({ numeroTexto: "OI-000002" }), pedido({ numeroTexto: "OI-000001" })] }));
    expect(tres).toContain("; OI-000002");
    expect(tres).toContain("y 1 más.");
    expect(tres).not.toContain("·");
  });
});

describe("«Los demás modelos»: lo que dice cada celda", () => {
  it("«Cuánto dura» va en palabras completas y no inventa una duración sin ventas", () => {
    expect(cuantoDura({ stockRed: 18, diasRed: 12.4 })).toBe("Alcanza para 12 días");
    expect(cuantoDura({ stockRed: 3, diasRed: 0.6 })).toBe("Alcanza para 1 día");
    expect(cuantoDura({ stockRed: 0, diasRed: 0 })).toBe("Agotado en las tiendas");
    expect(cuantoDura({ stockRed: 7, diasRed: null })).toBe("Sin ventas todavía");
  });

  it("la barra mide los días sobre la escala de Inventario (60 días), con marcas en 7 y 30, y nunca pasa de 100", () => {
    expect(barraDeStock({ diasRed: 30 })).toEqual({ pct: 50, marcas: [(7 / 60) * 100, 50] });
    expect(barraDeStock({ diasRed: 200 })?.pct).toBe(100);
    expect(barraDeStock({ diasRed: null })).toBeNull();
  });

  it("«Se venden por semana» sale del ritmo por día; sin ritmo, nada", () => {
    expect(ventaPorSemanaDeModelo({ ritmoDia: 0.5 })).toBe((3.5).toLocaleString("es-PE"));
    expect(ventaPorSemanaDeModelo({ ritmoDia: null })).toBeNull();
  });
});

describe("lo que explica va detrás del «?»", () => {
  it("las ayudas usan los nombres que se ven en pantalla y no llevan punto medio", () => {
    expect(AYUDA_TELA).toContain("«Se necesitan»");
    expect(AYUDA_TELA).toContain("«En camino»");
    expect(AYUDA_MODELOS).toContain("«Cuánto dura»");
    for (const ayuda of [AYUDA_POR_RESOLVER, AYUDA_TELA, AYUDA_MODELOS]) expect(ayuda).not.toContain("·");
  });
});
