import { describe, expect, it } from "vitest";
import { cartelesDeCampana, chipsDeCampana, prendasLasEligenSusOfertas, textoFechasDeCampana } from "./campana-panel-reglas";
import { reglaDeFila, type FilaRegla, type ReglaCampana } from "./campana-reglas";

const HOY = "2026-11-18";
const POLOS = "33333333-3333-4333-8333-333333333333";
const ROTACION = "55555555-5555-4555-8555-555555555555";
const nombre = (id: string) => ({ [POLOS]: "Polos", [ROTACION]: "Rotación" })[id] ?? "";
const LIMA = { id: "l", nombre: "Tienda Lima" };
const TRU = { id: "t", nombre: "Tienda Trujillo" };

const fila = (o: Partial<FilaRegla> = {}): FilaRegla => ({
  id: "r1",
  etiqueta_id: "c1",
  nombre: "",
  tipo: "pct",
  porcentaje: "20.00",
  desde: "2026-11-16",
  hasta: "2026-11-30",
  dias_semana: [1, 2, 3, 4, 5, 6, 7],
  incluye_claure: false,
  estado: "activa",
  categorias_solo: [],
  categorias_fuera: [],
  creada_en: "2026-11-16T12:00:00Z",
  activada_en: "2026-11-16T12:05:00Z",
  cambios: 0,
  ultimo_cambio: null,
  ...o,
});
const regla = (o: Partial<ReglaCampana> = {}, f: Partial<FilaRegla> = {}): ReglaCampana => ({ ...reglaDeFila(fila(f)), ...o });

const campana = (o: Partial<Parameters<typeof chipsDeCampana>[0]> = {}) => ({
  activo: true,
  estado: "aprobado" as const,
  vigenteDesde: "2026-11-16",
  vigenteHasta: "2026-11-30",
  sedeIds: [] as string[],
  ...o,
});

describe("los chips de una campaña abierta (ADR-0677, actividad 6)", () => {
  it("vigente: estado en verde, sus fechas con los días que le quedan y todas las tiendas", () => {
    expect(chipsDeCampana(campana(), HOY, [LIMA, TRU], 11).map((c) => `${c.clave}:${c.texto}:${c.tono}`)).toEqual([
      "estado:Vigente:verde",
      "fechas:16 nov – 30 nov · 12 días:neutro",
      "tiendas:Todas las tiendas:pizarra",
    ]);
  });

  it("lo que falta va en su chip ámbar; una que viene dice cuándo; sin fechas es «Guardada»", () => {
    expect(chipsDeCampana(campana(), HOY, [], 0).map((c) => c.texto).slice(0, 2)).toEqual(["Vigente", "Sin prendas"]);
    expect(chipsDeCampana(campana({ vigenteDesde: "2026-12-01", vigenteHasta: "2026-12-24" }), HOY, [], 4)[0].texto).toBe("En 13 días");
    expect(chipsDeCampana(campana({ vigenteDesde: null, vigenteHasta: null }), HOY, [], 4).map((c) => c.texto)).toEqual(["Guardada", "Sin fechas", "Todas las tiendas"]);
  });

  it("por aprobar, rechazada o desactivada lo dice primero; solo en una tienda la nombra", () => {
    expect(chipsDeCampana(campana({ estado: "pendiente" }), HOY, [], 4)[0].texto).toBe("Por aprobar");
    expect(chipsDeCampana(campana({ estado: "rechazado" }), HOY, [], 4)[0].texto).toBe("Rechazada");
    expect(chipsDeCampana(campana({ activo: false }), HOY, [], 4)[0].texto).toBe("Desactivada");
    expect(chipsDeCampana(campana({ sedeIds: ["t"] }), HOY, [LIMA, TRU], 4).at(-1)?.texto).toBe("Solo Tienda Trujillo");
  });

  it("solo el estado lleva el punto", () => {
    expect(chipsDeCampana(campana(), HOY, [], 0).map((c) => c.punto)).toEqual([true, true, false, false]);
  });

  it("las fechas: los días que quedan solo si rige hoy; el último día lo dice", () => {
    expect(textoFechasDeCampana("2026-12-01", "2026-12-24", HOY)).toBe("1 dic – 24 dic");
    expect(textoFechasDeCampana("2026-11-10", HOY, HOY)).toBe("10 nov – 18 nov · último día");
    expect(textoFechasDeCampana(null, null, HOY)).toBe("Sin fechas");
  });
});

describe("las ofertas como carteles", () => {
  it("lo que da en grande y a qué debajo; toda la campaña si no elige", () => {
    const carteles = cartelesDeCampana([regla({ id: "a" }), regla({ id: "b", tipo: "nxm", lleva: 3, paga: 2, categoriasSolo: [POLOS] })], HOY, nombre, null);
    expect(carteles.map((c) => `${c.glifo} · ${c.en}`).sort()).toEqual(["3 x 2 · Polos", "−20 % · Toda la campaña"]);
  });

  it("un monto que cuenta toda la compra dice «Toda la compra»; una insignia, con mayúscula", () => {
    const [monto] = cartelesDeCampana([regla({ tipo: "monto", cuenta: "compra", escalones: [{ desde: 300, ahorra: 30 }], ahorroEn: "soles" })], HOY, nombre, null);
    expect(monto.en).toBe("Toda la compra");
    const [ins] = cartelesDeCampana([regla({ insigniasSolo: [ROTACION] })], HOY, nombre, null);
    expect(ins.en).toBe("La insignia Rotación");
  });

  it("en borrador o programada lleva su chip; terminada o retirada no sale", () => {
    const carteles = cartelesDeCampana(
      [
        regla({ id: "borr", estado: "borrador" }),
        regla({ id: "prog", desde: "2026-12-01", hasta: "2026-12-24" }),
        regla({ id: "fin", desde: "2026-11-01", hasta: "2026-11-10" }),
        regla({ id: "ret", estado: "desactivada" }),
      ],
      HOY,
      nombre,
      null,
    );
    expect(carteles.map((c) => [c.id, c.chip?.texto ?? null])).toEqual(expect.arrayContaining([["borr", "Borrador"], ["prog", "Desde el 1 dic"]]));
    expect(carteles.map((c) => c.id)).not.toContain("fin");
    expect(carteles.map((c) => c.id)).not.toContain("ret");
  });

  it("sin ofertas, el descuento de siempre es su único cartel; sin nada, ninguno", () => {
    expect(cartelesDeCampana([], HOY, nombre, 15)).toEqual([{ id: "descuento", glifo: "−15 %", en: "Toda la campaña", chip: null }]);
    expect(cartelesDeCampana([], HOY, nombre, null)).toEqual([]);
  });
});

describe("¿las prendas las eligen sus ofertas? (arregla «sin prendas»)", () => {
  const viva = (id: string) => id === ROTACION;
  it("sí, si una oferta viva nombra categorías, modelos, una insignia viva o cuenta toda la compra", () => {
    expect(prendasLasEligenSusOfertas([regla({ categoriasSolo: [POLOS] })], HOY, viva)).toBe(true);
    expect(prendasLasEligenSusOfertas([regla({ productosSolo: ["m1"] })], HOY, viva)).toBe(true);
    expect(prendasLasEligenSusOfertas([regla({ insigniasSolo: [ROTACION] })], HOY, viva)).toBe(true);
    expect(prendasLasEligenSusOfertas([regla({ tipo: "monto", cuenta: "compra", escalones: [{ desde: 300, ahorra: 30 }] })], HOY, viva)).toBe(true);
  });
  it("no, si solo rebaja la campaña, si la insignia está apagada o si la oferta ya terminó", () => {
    expect(prendasLasEligenSusOfertas([regla()], HOY, viva)).toBe(false);
    expect(prendasLasEligenSusOfertas([regla({ insigniasSolo: ["apagada"] })], HOY, viva)).toBe(false);
    expect(prendasLasEligenSusOfertas([regla({ categoriasSolo: [POLOS], desde: "2026-11-01", hasta: "2026-11-10" })], HOY, viva)).toBe(false);
  });
});
