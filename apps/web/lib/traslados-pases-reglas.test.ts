import { describe, expect, it } from "vitest";
import {
  anilloDelDia,
  botonDelPase,
  camposDelPase,
  cifraDelPase,
  codigoDeSede,
  buscableDelPase,
  duracionCorta,
  esCiego,
  hechasHoy,
  nombreDelPase,
  pasesPorPestana,
  paseInicial,
  vecinosEnPestana,
  pestanaDelPase,
  progresoDelViaje,
  selloDelPase,
  tonoDelPase,
  vistaDelPase,
  type DatosPase,
} from "./traslados-pases-reglas";
import { coincideBusqueda, type ContextoTraslados } from "./traslados-reglas";

// Martes 6 de octubre de 2026, 10:40 en Lima (15:40 UTC). Mismo día y hora que las maquetas.
const AHORA = "2026-10-06T15:40:00.000Z";
const TRU = "tru";
const LIM = "lim";
const TALLER = "taller";
const ctx: ContextoTraslados = { miUbicacionId: TRU, puedeCerrarDiferencia: true, ahoraIso: AHORA };
const iso = (dia: number, hhmm: string) => new Date(`2026-10-${String(dia).padStart(2, "0")}T${hhmm}:00-05:00`).toISOString();

function pase(p: Partial<DatosPase> = {}): DatosPase {
  return {
    id: "t1",
    numero: 32,
    ubicacionOrigenId: TALLER,
    ubicacionOrigenNombre: "Taller",
    ubicacionDestinoId: TRU,
    ubicacionDestinoNombre: "Tienda TRU",
    estado: "en_transito",
    fechaEstimadaLlegada: iso(7, "11:00"),
    creadoEn: iso(6, "08:10"),
    confirmadoEn: null,
    cerradoEn: null,
    anuladoEn: null,
    nota: null,
    unidadesEnviadas: 8,
    unidadesRecibidas: 0,
    lineas: 4,
    lineasContadas: 0,
    cerradoConDiferencia: false,
    creadoPorNombre: "Marco A.",
    fotos: [],
    colores: [],
    referencias: ["Pantalón Chala"],
    skus: ["PAN-1"],
    ...p,
  };
}

describe("codigoDeSede", () => {
  it("producción: la última palabra en mayúsculas («Tienda TRU» → TRU)", () => {
    expect(codigoDeSede({ nombre: "Tienda TRU", tipo: "tienda" })).toBe("TRU");
    expect(codigoDeSede({ nombre: "Tienda AQP", tipo: "tienda" })).toBe("AQP");
    expect(codigoDeSede({ nombre: "Tienda LIM", tipo: "tienda" })).toBe("LIM");
  });
  it("el Taller va entero (TAL no se entendió en la prueba ciega)", () => {
    expect(codigoDeSede({ nombre: "Taller", tipo: "taller" })).toBe("Taller");
  });
  it("sin código en el nombre, el nombre sin «Tienda»", () => {
    expect(codigoDeSede({ nombre: "Tienda Lima", tipo: "tienda" })).toBe("Lima");
    expect(codigoDeSede({ nombre: "Tienda Trujillo" })).toBe("Trujillo");
  });
});

describe("duracionCorta", () => {
  it("minutos, horas con minutos redondeados a 5, días", () => {
    expect(duracionCorta(40 * 60_000)).toBe("40 min");
    expect(duracionCorta(70 * 60_000)).toBe("1 h 10");
    expect(duracionCorta(3 * 3_600_000)).toBe("3 h");
    expect(duracionCorta(3 * 86_400_000)).toBe("3 días");
  });
});

describe("lo que le toca a quien mira", () => {
  it("viene hacia ti, a tiempo: «Viene hacia ti», hora de llegada y un botón que no da por hecho que llegó", () => {
    const t = pase();
    expect(tonoDelPase(t, ctx)).toBe("llega");
    expect(nombreDelPase(t, ctx, "TRU")).toBe("Viene hacia ti");
    expect(cifraDelPase(t, ctx)).toEqual({ grande: "11:00", chica: "llega mañana", tarde: false });
    expect(botonDelPase(t, ctx)).toEqual({ texto: "Si ya llegó, ábrela y cuéntala", principal: false });
    expect(pestanaDelPase(t, ctx)).toBe("llegan");
  });

  it("atrasada: «Atrasada», cuánto atraso y el botón fuerte", () => {
    const t = pase({ fechaEstimadaLlegada: iso(6, "09:30"), creadoEn: iso(5, "16:00") });
    expect(tonoDelPase(t, ctx)).toBe("atraso");
    expect(nombreDelPase(t, ctx, "TRU")).toBe("Atrasada");
    expect(cifraDelPase(t, ctx)).toEqual({ grande: "1 h 10", chica: "de atraso", tarde: true });
    expect(botonDelPase(t, ctx)).toEqual({ texto: "Ya llegó: abrir y contar", principal: true });
    expect(progresoDelViaje(t, AHORA)).toBe(1);
  });

  it("contándose: deja de viajar y dice cuántos tipos van contados", () => {
    const t = pase({ ubicacionOrigenId: LIM, ubicacionOrigenNombre: "Tienda LIM", lineas: 3, lineasContadas: 2 });
    expect(tonoDelPase(t, ctx)).toBe("contando");
    expect(nombreDelPase(t, ctx, "TRU")).toBe("Contando");
    expect(cifraDelPase(t, ctx).grande).toBe("2/3");
    expect(botonDelPase(t, ctx).texto).toBe("Seguir contando");
    // Desde la sede que envió: la otra sede la está contando.
    const desdeLim = { ...ctx, miUbicacionId: LIM };
    expect(nombreDelPase(t, desdeLim, "TRU")).toBe("TRU la está contando");
    expect(pestanaDelPase(t, desdeLim)).toBe("envias");
  });

  it("con diferencia: el líder de la sede que recibió la revisa; quien envió solo la ve", () => {
    const t = pase({ estado: "recibido_con_diferencia", confirmadoEn: iso(6, "09:12"), lineasContadas: 4, unidadesRecibidas: 7 });
    expect(tonoDelPase(t, ctx)).toBe("revisar");
    expect(nombreDelPase(t, ctx, "TRU")).toBe("Falta revisar");
    expect(cifraDelPase(t, ctx)).toEqual({ grande: "−1", chica: "faltó", tarde: false });
    expect(botonDelPase(t, ctx)).toEqual({ texto: "Revisar lo que faltó", principal: true });
    const desdeTaller = { ...ctx, miUbicacionId: TALLER };
    expect(nombreDelPase(t, desdeTaller, "TRU")).toBe("Faltó algo · la revisa TRU");
    expect(botonDelPase(t, desdeTaller).principal).toBe(false);
  });

  it("terminadas: cada una con su sello", () => {
    const completa = pase({ estado: "cerrada", cerradoEn: iso(4, "16:15"), lineasContadas: 4, unidadesRecibidas: 8 });
    expect(selloDelPase(completa, ctx)).toEqual({ texto: "RECIBIDA", tono: "cerrado", fecha: "4 OCT · 16:15" });
    expect(cifraDelPase(completa, ctx)).toEqual({ grande: "+8", chica: "entraron", tarde: false });
    const conNota = pase({ estado: "cerrada", cerradoEn: iso(5, "18:00"), cerradoConDiferencia: true, unidadesRecibidas: 7 });
    expect(selloDelPase(conNota, ctx)?.texto).toBe("CON NOTA");
    const anulada = pase({ estado: "anulada", anuladoEn: iso(3, "10:30") });
    expect(selloDelPase(anulada, ctx)?.texto).toBe("ANULADA");
    expect(progresoDelViaje(anulada, AHORA)).toBe(0);
    for (const t of [completa, conNota, anulada]) expect(pestanaDelPase(t, ctx)).toBe("terminadas");
  });

  it("enviada desde la sede que mira: va en «Envías» y sí dice cuántas prendas van", () => {
    const t = pase({ ubicacionOrigenId: TRU, ubicacionOrigenNombre: "Tienda TRU", ubicacionDestinoId: LIM, ubicacionDestinoNombre: "Tienda LIM", unidadesEnviadas: 10 });
    expect(tonoDelPase(t, ctx)).toBe("sale");
    expect(pestanaDelPase(t, ctx)).toBe("envias");
    expect(camposDelPase(t, ctx, "TRU")[2]).toEqual({ etiqueta: "Prendas", valor: "10", detalle: "4 tipos de prenda" });
  });
});

describe("conteo a ciegas (ADR-0239 D-130)", () => {
  it("una caja que viene hacia quien mira nunca dice cuántas prendas trae", () => {
    const t = pase({ unidadesEnviadas: 17 });
    expect(esCiego(t, ctx)).toBe(true);
    const v = vistaDelPase(t, ctx, { origen: "Taller", destino: "TRU" });
    const todo = JSON.stringify([v.campos, v.cifra, v.nombre, v.boton]);
    expect(todo).not.toContain("17");
    expect(v.campos[2]).toEqual({ etiqueta: "Prendas", valor: "4 tipos", detalle: "las cuentas al llegar" });
  });
  it("tampoco mientras se cuenta", () => {
    const t = pase({ unidadesEnviadas: 17, lineasContadas: 1 });
    expect(JSON.stringify(camposDelPase(t, ctx, "Taller"))).not.toContain("17");
  });
});

describe("la billetera", () => {
  it("reparte en pestañas y pone primero lo que más espera", () => {
    const atrasada = pase({ id: "a", numero: 32, fechaEstimadaLlegada: iso(6, "09:30"), creadoEn: iso(5, "16:00") });
    const manana = pase({ id: "b", numero: 35 });
    const enviada = pase({ id: "c", numero: 36, ubicacionOrigenId: TRU, ubicacionDestinoId: LIM });
    const cerrada = pase({ id: "d", numero: 29, estado: "cerrada", cerradoEn: iso(4, "16:15") });
    const p = pasesPorPestana([manana, cerrada, enviada, atrasada], ctx);
    expect(p.llegan.map((t) => t.numero)).toEqual([32, 35]);
    expect(p.envias.map((t) => t.numero)).toEqual([36]);
    expect(p.terminadas.map((t) => t.numero)).toEqual([29]);
  });

  it("hechas hoy: lo que la sede confirmó o cerró hoy y lo que anuló hoy", () => {
    const ts = [
      pase({ id: "1", estado: "cerrada", cerradoEn: iso(6, "09:00") }),
      pase({ id: "2", estado: "cerrada", cerradoEn: iso(5, "09:00") }),
      pase({ id: "3", estado: "recibido_con_diferencia", confirmadoEn: iso(6, "09:12") }),
      pase({ id: "4", estado: "anulada", ubicacionOrigenId: TRU, ubicacionDestinoId: LIM, anuladoEn: iso(6, "10:00") }),
      pase({ id: "5", estado: "anulada", anuladoEn: iso(6, "10:00") }),
    ];
    expect(hechasHoy(ts, ctx)).toBe(2);
  });

  it("el anillo suma lo mismo que el menú: por recibir + te piden", () => {
    expect(anilloDelDia({ porRecibir: 4, tePiden: 1, hechas: 0 })).toEqual({ hechas: 0, total: 5, pendientes: 5, fraccion: 0 });
    expect(anilloDelDia({ porRecibir: 0, tePiden: 0, hechas: 0 }).fraccion).toBe(1);
    expect(anilloDelDia({ porRecibir: 3, tePiden: 0, hechas: 1 }).fraccion).toBe(0.25);
  });

  it("el buscador encuentra por número, por código de sede y por prenda", () => {
    const t = pase({ numero: 287 });
    const cod = { origen: "Taller", destino: "TRU" };
    const b = buscableDelPase(t, cod);
    expect(coincideBusqueda(b, "287")).toBe(true);
    expect(coincideBusqueda(b, "nº 287")).toBe(true);
    expect(coincideBusqueda(b, "tru")).toBe(true);
    expect(coincideBusqueda(b, "pantalon")).toBe(true);
    expect(coincideBusqueda(b, "vestido")).toBe(false);
  });
});

describe("paseInicial y vecinos", () => {
  const p = (id: string, porHacer = false) => ({ id, porHacer });
  it("abre lo primero que te toca; si no hay, el primero", () => {
    expect(paseInicial({ llegan: [p("a"), p("b", true)], envias: [p("c", true)], terminadas: [] })?.id).toBe("b");
    expect(paseInicial({ llegan: [p("a")], envias: [p("c", true)], terminadas: [] })?.id).toBe("c");
    expect(paseInicial({ llegan: [], envias: [], terminadas: [p("z")] })?.id).toBe("z");
    expect(paseInicial({ llegan: [], envias: [], terminadas: [] })).toBeNull();
  });
  it("anterior y siguiente dentro de la pestaña", () => {
    const l = [p("a"), p("b"), p("c")];
    expect(vecinosEnPestana(l, "b")).toEqual({ anterior: l[0], siguiente: l[2], posicion: 1 });
    expect(vecinosEnPestana(l, "x").posicion).toBe(-1);
  });
});
