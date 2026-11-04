import { describe, expect, it } from "vitest";
import {
  anguloDial,
  arcoCarga,
  armarVitrinas,
  avance,
  camposDe,
  celularLegible,
  falta,
  hora12,
  llenadoTubo,
  nivelFondo,
  puedeCambiarCarga,
  requeridos,
  valorDe,
} from "./vitrinas-sedes-reglas";
import { solesRedondo } from "./gastos-reglas";
import type { TiendaConfig } from "./configuracion-reglas";

const HOY = "2026-11-04";
const tienda = (x: Partial<TiendaConfig> & { id: string; nombre: string }): TiendaConfig => ({
  metas: [100, 100, 100, 100, 100, 100, 100],
  fondo: 300,
  metaRespaldo: null,
  metaMes: null,
  horaCierre: "21:00",
  whatsappNumero: "987654321",
  ...x,
});
const carga = (sedes: { id: string; nombre: string; tipo: string; hasta: string | null }[]) => ({
  hoy: HOY,
  sedes: sedes.map((s) => ({ ubicacionId: s.id, nombre: s.nombre, tipo: s.tipo, hasta: s.hasta, abierta: true })),
});
const asistente = (id: string, nombre: string, tipo: "tienda" | "almacen" | "taller", encendido = true) => ({ id, nombre, tipo, encendido, desde: null });

const completa = armarVitrinas({
  empresa: { tiendas: [{ id: "t1", nombre: "Tienda TRU", direccion: "Av. España 1240", distrito: "Trujillo", series: [{ tipo: "boleta", serie: "B001" }, { tipo: "factura", serie: "F001" }] }] },
  tiendas: [tienda({ id: "t1", nombre: "Tienda TRU" }), tienda({ id: "t2", nombre: "Tienda LIM", whatsappNumero: null, horaCierre: null })],
  asistente: [asistente("x", "Taller", "taller", false), asistente("t1", "Tienda TRU", "tienda"), asistente("t2", "Tienda LIM", "tienda")],
  carga: carga([
    { id: "t1", nombre: "Tienda TRU", tipo: "tienda", hasta: "2026-10-28" },
    { id: "t2", nombre: "Tienda LIM", tipo: "tienda", hasta: "2026-11-30" },
    { id: "x", nombre: "Taller", tipo: "taller", hasta: null },
  ]),
  hoy: HOY,
});
const [tru, lim, taller] = completa as [(typeof completa)[0], (typeof completa)[0], (typeof completa)[0]];

describe("armarVitrinas", () => {
  it("une por sede lo que traen las cuatro lecturas, con las tiendas primero", () => {
    expect(completa.map((v) => v.corto)).toEqual(["TRU", "LIM", "Taller"]);
    expect(tru.direccion).toBe("Av. España 1240, Trujillo");
    expect(tru.series).toEqual(["B001", "F001"]);
    expect(tru.color).toBe("tru");
    expect(taller.color).toBe("tal");
    expect(taller.tienda).toBeNull();
  });

  it("un dato que la base no trajo no se dibuja ni cuenta como que falta", () => {
    const [v] = armarVitrinas({ empresa: null, tiendas: [tienda({ id: "t1", nombre: "Tienda TRU" })], asistente: null, carga: null, hoy: HOY });
    expect(camposDe(v!)).toEqual(["whatsapp", "cierre", "fondo"]);
    expect(v!.direccion).toBeNull();
    expect(avance(v!)).toEqual({ hechos: 3, total: 3, completo: true });
  });

  it("sin ninguna lectura no inventa sedes", () => {
    expect(armarVitrinas({ empresa: null, tiendas: [], asistente: null, carga: null, hoy: HOY })).toEqual([]);
  });

  it("usa el «hoy» de la lectura de la carga, no el que llega aparte", () => {
    const [v] = armarVitrinas({ empresa: null, tiendas: [], asistente: null, carga: { hoy: "2026-12-01", sedes: carga([{ id: "a", nombre: "Taller", tipo: "taller", hasta: "2026-11-30" }]).sedes }, hoy: "2026-01-01" });
    expect(v!.carga?.estado.tipo).toBe("cerrada");
  });
});

describe("qué falta (decisión de Felipe, 2026-11-04)", () => {
  it("en una tienda cuentan WhatsApp, hora de cierre, fondo y fecha de carga; Preguntar no", () => {
    expect(requeridos(tru)).toEqual(["whatsapp", "cierre", "fondo", "carga"]);
    expect(avance(tru)).toEqual({ hechos: 4, total: 4, completo: true });
    expect(avance(lim)).toEqual({ hechos: 2, total: 4, completo: false });
    expect(falta(lim, "whatsapp")).toBe(true);
    expect(falta(lim, "cierre")).toBe(true);
  });

  it("fuera de una tienda solo cuenta la fecha de carga", () => {
    expect(camposDe(taller)).toEqual(["preguntar", "carga"]);
    expect(requeridos(taller)).toEqual(["carga"]);
    expect(falta(taller, "carga")).toBe(true);
  });

  it("Preguntar apagado es una elección, no una falta", () => {
    expect(taller.preguntar).toBe(false);
    expect(falta(taller, "preguntar")).toBe(false);
    expect(valorDe(taller, "preguntar")).toBe("Apagado");
  });

  it("un WhatsApp que no es un celular cuenta como que falta (sin él no hay QR)", () => {
    const [v] = armarVitrinas({ empresa: null, tiendas: [tienda({ id: "t1", nombre: "Tienda TRU", whatsappNumero: "123" })], asistente: null, carga: null, hoy: HOY });
    expect(falta(v!, "whatsapp")).toBe(true);
  });

  it("un fondo en 0 no falta: es un fondo de cero; vacío sí", () => {
    const [cero, vacio] = armarVitrinas({ empresa: null, tiendas: [tienda({ id: "a", nombre: "Tienda TRU", fondo: 0 }), tienda({ id: "b", nombre: "Tienda LIM", fondo: null })], asistente: null, carga: null, hoy: HOY });
    expect(falta(cero!, "fondo")).toBe(false);
    expect(valorDe(cero!, "fondo")).toBe(solesRedondo(0));
    expect(falta(vacio!, "fondo")).toBe(true);
  });
});

describe("lo que se lee", () => {
  it("cada dato dice su valor", () => {
    expect(valorDe(tru, "whatsapp")).toBe("987 654 321");
    expect(valorDe(tru, "cierre")).toBe("9:00 p. m.");
    expect(valorDe(tru, "fondo")).toBe(solesRedondo(300));
    expect(valorDe(tru, "preguntar")).toBe("Activo");
    expect(valorDe(tru, "carga")).toBe("Cerró 28-oct");
    expect(valorDe(lim, "carga")).toBe("Hasta 30-nov");
    expect(valorDe(lim, "whatsapp")).toBe("Falta");
    expect(valorDe(taller, "carga")).toBe("Falta");
  });

  it("la hora, también con segundos, a medianoche y al mediodía", () => {
    expect(hora12("21:00:00")).toBe("9:00 p. m.");
    expect(hora12("00:05")).toBe("12:05 a. m.");
    expect(hora12("12:30")).toBe("12:30 p. m.");
  });

  it("lo que no es un celular se muestra como vino", () => {
    expect(celularLegible("123")).toBe("123");
  });
});

describe("los dibujos", () => {
  it("el dial va de −135° a las 6 de la mañana a 135° a medianoche, y no se sale", () => {
    expect(anguloDial("06:00")).toBe(-135);
    expect(anguloDial("15:00")).toBe(0);
    expect(anguloDial("24:00")).toBe(135);
    expect(anguloDial("03:00")).toBe(-135);
  });

  it("el líquido nunca pasa de lleno ni baja de vacío", () => {
    expect(nivelFondo(null)).toBe(0);
    expect(nivelFondo(-5)).toBe(0);
    expect(nivelFondo(250)).toBe(0.5);
    expect(nivelFondo(9000)).toBe(1);
  });

  it("el arco de la carga solo existe mientras sigue abierta, y siempre se ve", () => {
    expect(arcoCarga({ tipo: "sin_fecha" })).toBe(0);
    expect(arcoCarga({ tipo: "cerrada", hasta: "2026-10-28" })).toBe(0);
    expect(arcoCarga({ tipo: "abierta", hasta: HOY, dias: 0 })).toBe(0.04);
    expect(arcoCarga({ tipo: "abierta", hasta: "2027-06-01", dias: 200 })).toBe(1);
  });

  it("el tubo no se llena de más, y sin dato no se dibuja", () => {
    expect(llenadoTubo(null, 30)).toBeNull();
    expect(llenadoTubo(15, 30)).toBe(0.5);
    expect(llenadoTubo(90, 30)).toBe(1);
  });
});

describe("quién cambia la carga: la regla de siempre", () => {
  const cerrada = { tipo: "cerrada", hasta: "2026-10-28" } as const;
  const abierta = { tipo: "abierta", hasta: "2026-11-30", dias: 26 } as const;
  it("la fija un líder; reabrir, solo un Admin; quien no es líder, nada", () => {
    expect(puedeCambiarCarga(abierta, true, false)).toBe(true);
    expect(puedeCambiarCarga(cerrada, true, false)).toBe(false);
    expect(puedeCambiarCarga(cerrada, true, true)).toBe(true);
    expect(puedeCambiarCarga(abierta, false, true)).toBe(false);
  });
});
