import { describe, expect, it } from "vitest";
import {
  DIAS_ABIERTOS,
  LINEAS_PARA_PLEGAR,
  PERSONAS_PARA_BUSCAR,
  SIN_NADA_A_LA_VISTA,
  diasDeCuenta,
  dieronDeRonda,
  enLaCalle,
  estadoDeCompra,
  etiquetasDePersona,
  faltaPagarDeCompra,
  filasDeCompradores,
  filtrarCompradores,
  fraseDePersona,
  leerCompradores,
  leerCompradoresSinRonda,
  leerTodasLasCompras,
  lineasDeCuenta,
  llegadaDeCompra,
  pctUsado,
  puedeCerrarseDesdeCompras,
  quedaDeRonda,
  repartoDeLista,
  totalesDeCuenta,
  type FilaComprador,
} from "./compradores-reglas";
import type { MovimientoFondo } from "./fondos-reglas";

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const cuenta = (dieron: number, compraste: number, gastaste = 0) => ({ dieron, compras: 1, compraste, gastos: 0, gastaste, prendas: 1 });
const compraCruda = {
  id: "p1",
  origen: "compra",
  persona_id: "per",
  persona: "Catherine",
  fecha: "2026-11-14",
  creado_en: "2026-11-14T15:00:00Z",
  proveedor_id: "prov",
  proveedor: "Comercial RY",
  tipo: "nota_venta",
  monto: "453.00",
  pagado: "453.00",
  medio_pago: "transferencia",
  revisada: false,
  prendas: 69,
  comprobante: null,
  envios: [{ id: "d", numero: "ENV-000024", estado: "abierto", destino: "Tienda TRU", salio_en: "2026-11-14T20:00:00Z" }],
};

describe("leer las lecturas nuevas", () => {
  it("una respuesta que no es lista es «no se pudo leer», no «nadie compra»", () => {
    expect(leerCompradores(null)).toBeNull();
    expect(leerTodasLasCompras({ error: true })).toBeNull();
    expect(leerTodasLasCompras([])).toEqual([]);
  });

  it("lee una compra con sus números como texto y descarta lo ilegible", () => {
    const [c] = leerTodasLasCompras([compraCruda, { id: "x" }])!;
    expect(c.monto).toBe(453);
    expect(c.envios[0].numero).toBe("ENV-000024");
    expect(leerTodasLasCompras([compraCruda, { id: "x" }])).toHaveLength(1);
  });

  it("lee una ronda con su cuenta y sus compras", () => {
    const [r] = leerCompradores([
      { id: "r", persona_id: "per", persona: "Catherine", abierta_en: "2026-11-13T10:00:00Z", cerrada_en: null, cuenta: cuenta(0, 1496.3, 0.8), compras: [compraCruda] },
      { id: "sin-cuenta", persona_id: "per", abierta_en: "2026-11-13T10:00:00Z" },
    ])!;
    expect(r.compras).toHaveLength(1);
    expect(r.cuenta.compraste).toBe(1496.3);
  });
});

describe("la cuenta sale del fondo de la persona, no solo de lo que anotó en la ronda", () => {
  it("plata entregada por la oficina, sin compras: le diste y le queda dicen lo que tiene", () => {
    const bhekam = { tiene: 13800, cuenta: { ...cuenta(0, 0), compras: 0 } };
    expect(dieronDeRonda(bhekam)).toBe(13800);
    expect(quedaDeRonda(bhekam)).toBe(13800);
  });

  it("quien recibió su plata por una entrega no sale debiendo", () => {
    const catherine = { tiene: 9588.9, cuenta: cuenta(0, 1496.3, 0.8) };
    expect(dieronDeRonda(catherine)).toBe(11086);
    expect(quedaDeRonda(catherine)).toBe(9588.9);
  });

  it("sin el dato del fondo (base de antes), la cuenta sale de lo anotado en la ronda, sin arrastrar céntimos", () => {
    expect(quedaDeRonda({ tiene: null, cuenta: cuenta(0.3, 0.1, 0.2) })).toBe(0);
    expect(dieronDeRonda({ tiene: null, cuenta: cuenta(1580, 4521) })).toBe(1580);
  });

  it("una ronda cerrada no lleva lo que tiene hoy: conserva su cuaderno", () => {
    const [cerrada, viva] = leerCompradores([
      { id: "c", persona_id: "per", abierta_en: "2026-11-01T10:00:00Z", cerrada_en: "2026-11-05T10:00:00Z", cuenta: cuenta(500, 400), tiene: "999.00", compras: [] },
      { id: "v", persona_id: "per", abierta_en: "2026-11-21T10:00:00Z", cerrada_en: null, cuenta: cuenta(0, 0), tiene: "13800.00", compras: [] },
    ])!;
    expect(cerrada.tiene).toBeNull();
    expect(quedaDeRonda(cerrada)).toBe(100);
    expect(viva.tiene).toBe(13800);
  });

  it("quién tiene plata sin ronda: lee, descarta lo ilegible y lo que no es saldo a favor", () => {
    expect(leerCompradoresSinRonda(null)).toBeNull();
    expect(
      leerCompradoresSinRonda([
        { persona_id: "cla", persona: "Claudia Pereyra", tiene: "4967.00", ultima_entrega: "2026-11-25" },
        { persona_id: "cero", persona: "Sin Plata", tiene: 0 },
        { persona: "Sin Id", tiene: 50 },
      ]),
    ).toEqual([{ personaId: "cla", persona: "Claudia Pereyra", tiene: 4967, ultimaEntrega: "2026-11-25" }]);
  });

  it("Compras cierra una ronda ajena solo si está vacía y la persona no tiene plata en la mano", () => {
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: 0, cuenta: { ...cuenta(0, 0), compras: 0 } })).toBe(true);
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: null, cuenta: { ...cuenta(100, 0), compras: 0 } })).toBe(false);
    expect(puedeCerrarseDesdeCompras({ cerradaEn: null, compras: [], tiene: 13800, cuenta: { ...cuenta(0, 0), compras: 0 } })).toBe(false);
  });
});

describe("el estado y la llegada de una compra", () => {
  const [c] = leerTodasLasCompras([compraCruda])!;
  it("lo que falta pagar manda sobre «por revisar»", () => {
    expect(estadoDeCompra({ ...c, pagado: 260, monto: 575 }, soles)).toEqual({ tono: "ambar", texto: "Falta pagar S/ 315.00" });
    expect(estadoDeCompra(c, soles).texto).toBe("Por revisar");
    expect(estadoDeCompra({ ...c, revisada: true, comprobante: { id: "c", documento: "B001-1", saldo: 0, estadoPago: "pagada" } }, soles).texto).toBe("Revisada");
  });
  it("la llegada la dice el último envío", () => {
    expect(llegadaDeCompra(c)).toBe("Contándose en Tienda TRU");
    expect(llegadaDeCompra({ envios: [] })).toBeNull();
  });
});

// Los mismos datos de producción del 2026-11-26, como los manda `fn_compradores` con la migración 20261126223000.
// Los datos de producción del 2026-11-26, como los manda `fn_compradores`.
describe("la lista de Compradores, «como tu banco»", () => {
  const compra = (id: string, fecha: string, monto: number, pagado: number, revisada: boolean) => ({ ...compraCruda, id, fecha, monto, pagado, revisada });
  const ronda = (id: string, persona: string, abierta: string, cerrada: string | null, c: ReturnType<typeof cuenta> & { compras: number }, tiene: number | null, compras: unknown[], ultima: string | null = null) => ({
    id, persona_id: persona, persona, abierta_en: abierta, cerrada_en: cerrada, cuenta: c, tiene, ultima_compra_en: ultima, compras,
    cierre: cerrada ? { decision: "se_queda", monto: 0, resuelto: false } : null,
  });
  const rondas = leerCompradores([
    ronda("r10", "Bhekam", "2026-11-21T17:37:00Z", null, { ...cuenta(0, 0), compras: 0, prendas: 0 }, 13800, []),
    ronda("r9", "Catherine", "2026-11-13T19:42:00Z", null, { ...cuenta(0, 1496.3, 0.8), compras: 2, prendas: 201 }, 9588.9,
      [compra("a", "2026-11-14", 191, 191, false), compra("b", "2026-11-13", 575, 260, false)], "2026-11-14T16:25:00Z"),
    ronda("r6", "Lizzelott", "2026-11-09T20:29:00Z", null, { ...cuenta(1580, 4521), compras: 1, prendas: 150 }, 0, [compra("c", "2026-11-09", 4521, 4521, true)], "2026-11-09T21:54:00Z"),
    ronda("r3", "Diego", "2026-10-23T21:46:00Z", null, { ...cuenta(0, 0), compras: 0, prendas: 0 }, 0, []),
    ronda("r8", "Felipe", "2026-11-11T18:52:00Z", "2026-11-17T22:17:00Z", { ...cuenta(4514, 4514), compras: 2 }, null, [compra("d", "2026-11-11", 4000, 4000, false), compra("d2", "2026-11-11", 514, 514, false)]),
    ronda("r4", "Felipe", "2026-10-28T22:36:00Z", "2026-10-29T18:39:00Z", { ...cuenta(5700, 4293), compras: 1 }, null, [compra("e", "2026-10-28", 4293, 4293, true)]),
    ronda("r1", "Nadie", "2026-10-23T20:35:00Z", "2026-10-23T20:35:00Z", { ...cuenta(0, 0), compras: 0, prendas: 0 }, null, []),
  ])!;
  const sinRonda = leerCompradoresSinRonda([{ persona_id: "Claudia", persona: "Claudia", tiene: 4967, ultima_entrega: "2026-11-25" }])!;
  const filas = filasDeCompradores(rondas, sinRonda, "2026-11-26");
  const de = (persona: string) => filas.find((f) => f.persona === persona)!;

  it("lista a quien tiene ronda, a quien tiene plata sin ronda y a quien cerró dejando pendientes; primero quien más tiene", () => {
    expect(filas.map((f) => f.persona)).toEqual(["Bhekam", "Catherine", "Claudia", "Felipe", "Lizzelott", "Diego"]);
    expect(de("Claudia")).toMatchObject({ sinRonda: true, queda: 4967, cerro: null });
    expect(de("Catherine")).toMatchObject({ dieron: 11086, gasto: 1497.1, queda: 9588.9, usado: 13, porRevisar: 2, faltaPagar: 315 });
    expect(de("Felipe")).toMatchObject({ queda: 0, porRevisar: 2, cerro: "2026-11-17T22:17:00Z" });
    // Una ronda cerrada sin nada pendiente no trae a la persona a la lista.
    expect(filas.some((f) => f.persona === "Nadie")).toBe(false);
  });

  it("si alguien llega por los dos lados, manda su ronda y no sale dos veces", () => {
    const doble = filasDeCompradores(rondas, [{ personaId: "Bhekam", persona: "Bhekam", tiene: 13800, ultimaEntrega: null }], "2026-11-26");
    expect(doble.filter((f) => f.persona === "Bhekam")).toHaveLength(1);
    expect(doble.find((f) => f.persona === "Bhekam")?.sinRonda).toBe(false);
  });

  it("una sola frase por persona; avisa solo cuando lleva días sin comprar", () => {
    expect(fraseDePersona(de("Bhekam"))).toEqual({ texto: "Comprando hace 5 días", avisa: false });
    expect(fraseDePersona(de("Claudia"))).toEqual({ texto: "Aún no abre su ronda", avisa: false });
    expect(fraseDePersona(de("Felipe"))).toEqual({ texto: "Cerró su ronda el 17/11", avisa: false });
    expect(fraseDePersona(de("Lizzelott"))).toEqual({ texto: "Sin comprar hace 17 días", avisa: true });
    expect(fraseDePersona(de("Diego"))).toEqual({ texto: "Sin comprar hace 34 días", avisa: true });
    expect(fraseDePersona({ sinRonda: false, diasAbierta: 0, quieta: null, cerro: null }).texto).toBe("Empezó hoy");
    expect(fraseDePersona({ sinRonda: false, diasAbierta: 1, quieta: null, cerro: null }).texto).toBe("Empezó ayer");
  });

  it("las etiquetas son solo lo que se hace aquí", () => {
    expect(etiquetasDePersona(de("Bhekam"), soles)).toEqual([]);
    expect(etiquetasDePersona(de("Catherine"), soles)).toEqual(["2 por revisar", "Falta pagar S/ 315.00"]);
    expect(etiquetasDePersona(de("Felipe"), soles)).toEqual(["2 por revisar"]);
    expect(etiquetasDePersona(de("Diego"), soles)).toEqual(["Cerrar su ronda"]);
    // Quieta pero con compras adentro: la cierra ella, aquí no hay nada que tocar.
    expect(etiquetasDePersona(de("Lizzelott"), soles)).toEqual([]);
  });

  it("en la calle: lo que suman las manos de la gente", () => {
    expect(enLaCalle(filas)).toEqual({ total: 28355.9, personas: 3 });
    expect(enLaCalle([])).toEqual({ total: 0, personas: 0 });
  });

  it("filtra por lo pendiente y busca por nombre sin tildes ni mayúsculas", () => {
    expect(filtrarCompradores(filas, "revisar", "").map((f) => f.persona)).toEqual(["Catherine", "Felipe"]);
    expect(filtrarCompradores(filas, "pagar", "").map((f) => f.persona)).toEqual(["Catherine"]);
    expect(filtrarCompradores(filas, "", "  CLAU ").map((f) => f.persona)).toEqual(["Claudia"]);
    expect(filtrarCompradores([{ ...de("Diego"), persona: "José Peña" }], "", "jose pena")).toHaveLength(1);
    expect(filtrarCompradores(filas, "", "")).toHaveLength(filas.length);
  });

  it("a escala: quien no tiene plata ni pendientes se pliega solo si son más de tres", () => {
    // Hoy solo Lizzelott no tiene plata ni pendientes (Diego pide cerrar su ronda): nada se pliega.
    expect(repartoDeLista(filas, false)).toEqual({ arriba: filas, plegadas: [] });
    const quieta = (i: number): FilaComprador => ({ ...de("Lizzelott"), personaId: `q${i}`, persona: `Quieta ${i}` });
    const muchas = [...filas, ...Array.from({ length: SIN_NADA_A_LA_VISTA }, (_, i) => quieta(i))];
    const r = repartoDeLista(muchas, false);
    expect(r.plegadas).toHaveLength(SIN_NADA_A_LA_VISTA + 1);
    expect(r.arriba.map((f) => f.persona)).toEqual(["Bhekam", "Catherine", "Claudia", "Felipe", "Diego"]);
    expect(r.arriba.length + r.plegadas.length).toBe(muchas.length);
    // Filtrando o buscando no se pliega: lo que se pidió ver, se ve.
    expect(repartoDeLista(muchas, true).plegadas).toEqual([]);
    expect(PERSONAS_PARA_BUSCAR).toBeGreaterThan(SIN_NADA_A_LA_VISTA);
  });

  it("lo que falta pagar de una compra y el porcentaje usado", () => {
    expect(faltaPagarDeCompra({ monto: 575, pagado: 260, comprobante: null })).toBe(315);
    expect(faltaPagarDeCompra({ monto: 575, pagado: 260, comprobante: { id: "c", documento: "NV-1", saldo: 0, estadoPago: "pagada" } })).toBe(0);
    expect(faltaPagarDeCompra({ monto: 100, pagado: 120, comprobante: null })).toBe(0);
    expect(pctUsado(11086, 1497.1)).toBe(13);
    expect(pctUsado(100, 250)).toBe(100);
    expect(pctUsado(13800, 0)).toBeNull();
    expect(pctUsado(0, 50)).toBeNull();
  });

  describe("el estado de cuenta, por fechas", () => {
    const mov = (id: string, tipo: MovimientoFondo["tipo"], fecha: string, monto: number, estado: MovimientoFondo["estado"] = "vigente"): MovimientoFondo => ({
      id, tipo, fecha, personaId: "Catherine", persona: "Catherine", cuentaId: "c", cuenta: "Cuenta", monto, motivo: null, estado, motivoAnulacion: null, registradoPor: null, anuladoPor: null, creadoEn: `${fecha}T15:00:00Z`, puedeAnular: true,
    });
    const suyas = rondas.filter((r) => r.persona === "Catherine");
    const movs = [mov("m1", "entrega_fondo", "2026-11-13", 8400), mov("m2", "entrega_fondo", "2026-11-13", 2686), mov("m3", "entrega_fondo", "2026-11-12", 500, "anulado"), mov("m4", "devolucion_fondo", "2026-11-20", 100), mov("m5", "pago_deuda_fondo", "2026-11-20", 40)];
    const mes = { desde: "2026-11-01", hasta: "2026-11-26" };
    const lineas = lineasDeCuenta(suyas, movs, mes, soles);

    it("mezcla lo que entra y lo que sale, lo más nuevo primero", () => {
      expect(lineas.map((l) => `${l.fecha} ${l.signo}${l.monto} ${l.titulo}`)).toEqual([
        "2026-11-20 −100 Devolvió",
        "2026-11-20 40 Pagó su deuda",
        "2026-11-14 −191 Comercial RY",
        "2026-11-13 −260 Comercial RY",
        "2026-11-13 +8400 Le diste",
        "2026-11-13 +2686 Le diste",
        "2026-11-12 500 Le diste",
      ]);
    });

    it("una compra a medio pagar muestra lo pagado y dice cuánto falta; lo anulado no mueve el saldo", () => {
      expect(lineas.find((l) => l.id === "b")).toMatchObject({ monto: 260, pendiente: "Falta pagar S/ 315.00", clase: "compra" });
      expect(lineas.find((l) => l.id === "a")?.pendiente).toBe("Por revisar");
      expect(lineas.find((l) => l.id === "m3")).toMatchObject({ anulada: true, signo: "" });
      expect(lineas.find((l) => l.id === "m1")?.movimiento?.id).toBe("m1");
    });

    it("los totales del período y de cada día no cuentan lo anulado ni lo que no mueve su saldo", () => {
      expect(totalesDeCuenta(lineas)).toEqual({ entro: 11086, salio: 551 });
      const dias = diasDeCuenta(lineas);
      expect(dias.map((d) => d.dia)).toEqual(["2026-11-20", "2026-11-14", "2026-11-13", "2026-11-12"]);
      expect(dias.find((d) => d.dia === "2026-11-13")).toMatchObject({ compras: 1, entro: 11086, salio: 260 });
      expect(dias.find((d) => d.dia === "2026-11-12")).toMatchObject({ compras: 0, entro: 0, salio: 0 });
      expect(dias.flatMap((d) => d.lineas)).toHaveLength(lineas.length);
    });

    it("el rango deja fuera lo de otras fechas, con los dos extremos adentro", () => {
      expect(lineasDeCuenta(suyas, movs, { desde: "2026-11-13", hasta: "2026-11-14" }, soles).map((l) => l.id)).toEqual(["a", "b", "m1", "m2"]);
      expect(lineasDeCuenta(suyas, movs, { desde: "2026-11-26", hasta: "2026-11-26" }, soles)).toEqual([]);
    });

    it("los umbrales de plegado son los acordados", () => {
      expect([LINEAS_PARA_PLEGAR, DIAS_ABIERTOS]).toEqual([12, 2]);
    });
  });
});
