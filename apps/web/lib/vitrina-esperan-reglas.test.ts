import { describe, expect, it } from "vitest";
import {
  ahoraDicho,
  cifrasEsperan,
  desdeCuando,
  estadoFila,
  filaDeJson,
  filtrarEsperan,
  leerEsperan,
  personasDichas,
  personasQueEsperan,
  pildorasDeTienda,
  prendaDicha,
  tiendaDicha,
} from "./vitrina-esperan-reglas";

const TRU = { id: "11111111-1111-4111-8111-111111111111", nombre: "Tienda Trujillo" };
const LIM = { id: "22222222-2222-4222-8222-222222222222", nombre: "Tienda Lima" };

// Lo que devuelve `retail.fn_vitrina_esperan()` (20261015030000), tal cual.
const fila = (cambios: Record<string, unknown> = {}) => ({
  variante_id: "33333333-3333-4333-8333-333333333333",
  producto: { id: "44444444-4444-4444-8444-444444444444", nombre: "Blusa Emma", codigo: "BLU-0001", categoria: "Blusas", prefijo: "BLU", familia: "ROPA", foto: null },
  color: { codigo: "NEG", nombre: "Negro", hex: "#111111" },
  talla: "M",
  sede: TRU,
  personas: 2,
  desde: "2026-10-11T15:00:00+00:00",
  ultima: "2026-10-13T15:00:00+00:00",
  libre: 0,
  hay_en: [{ ...LIM, libre: 3 }],
  se_ve: true,
  ...cambios,
});
const CRUDO = {
  tiendas: [LIM, TRU],
  personas: 3,
  filas: [
    fila(),
    fila({ variante_id: "55555555-5555-4555-8555-555555555555", talla: "L", sede: null, personas: 1, libre: 3 }),
    fila({ variante_id: "66666666-6666-4666-8666-666666666666", producto: { id: "77777777-7777-4777-8777-777777777777", nombre: "Falda Renata" }, color: null, talla: null, sede: LIM, personas: 1, hay_en: [], se_ve: false }),
  ],
};

describe("leer lo que devuelve fn_vitrina_esperan", () => {
  it("lee las tiendas, las personas y cada fila; la clave es la prenda y la tienda", () => {
    const l = leerEsperan(CRUDO);
    expect(l.tiendas.map((t) => t.nombre)).toEqual(["Tienda Lima", "Tienda Trujillo"]);
    expect(l.personas).toBe(3);
    expect(l.filas.map((f) => f.clave)).toEqual([
      `33333333-3333-4333-8333-333333333333|${TRU.id}`,
      "55555555-5555-4555-8555-555555555555|cualquiera",
      `66666666-6666-4666-8666-666666666666|${LIM.id}`,
    ]);
    expect(l.filas[0].hayEn).toEqual([{ ...LIM, libre: 3 }]);
  });

  it("un dato raro no tumba la pantalla: una fila sin prenda se deja fuera, y algo que no es una lectura deja la lista vacía", () => {
    expect(leerEsperan(null)).toEqual({ tiendas: [], personas: 0, filas: [] });
    expect(leerEsperan({ ...CRUDO, filas: [{ variante_id: "x" }, ...CRUDO.filas] }).filas).toHaveLength(3);
    expect(filaDeJson(fila({ sede: { id: "sin-nombre" } }))).toBeNull();
    expect(filaDeJson(fila({ personas: "2", libre: "-1" }))).toMatchObject({ personas: 2, libre: 0 });
  });
});

describe("lo que dice cada fila", () => {
  const [falta, llego, fuera] = leerEsperan(CRUDO).filas;

  it("el estado: falta, ya llegó (hay libre donde la esperan) o ya no se ve en la web", () => {
    expect([estadoFila(falta), estadoFila(llego), estadoFila(fuera)]).toEqual(["falta", "llego", "fuera"]);
  });

  it("la prenda, la tienda y las personas, en palabras", () => {
    expect(prendaDicha(falta)).toBe("Negro · M");
    expect(prendaDicha(fuera)).toBe("");
    expect(tiendaDicha(falta)).toBe("Trujillo");
    expect(tiendaDicha(llego)).toBe("Cualquier tienda");
    expect(personasDichas(1)).toBe("1 persona");
    expect(personasDichas(2)).toBe("2 personas");
  });

  it("«Ahora»: dónde hay para pedirla a otra sede, cuánto llegó, o que no se ve en la web", () => {
    expect(ahoraDicho(falta)).toBe("Hay en Lima (3)");
    expect(ahoraDicho(llego)).toBe("Ya llegó: 3 libres");
    expect(ahoraDicho(fuera)).toBe("No se ve en la web");
    expect(ahoraDicho({ ...falta, hayEn: [] })).toBe("No hay en ninguna tienda");
    expect(ahoraDicho({ ...llego, libre: 1 })).toBe("Ya llegó: 1 libre");
  });

  it("desde cuándo, en días de Lima (las 20:00 del 13 en Lima ya es el 14 en UTC)", () => {
    expect(desdeCuando("2026-10-14T15:00:00+00:00", "2026-10-14")).toBe("hoy");
    expect(desdeCuando("2026-10-14T01:00:00+00:00", "2026-10-14")).toBe("ayer");
    expect(desdeCuando("2026-10-11T15:00:00+00:00", "2026-10-14")).toBe("hace 3 días");
    expect(desdeCuando("no es fecha", "2026-10-14")).toBe("—");
  });
});

describe("cifras y filtros", () => {
  const l = leerEsperan(CRUDO);

  it("las cifras: personas de la base, tallas que faltan y las que ya llegaron (lo que no se ve en la web no cuenta en ninguna)", () => {
    expect(cifrasEsperan(l)).toEqual({ personas: 3, faltan: 1, llegaron: 1 });
  });

  it("por tienda, por estado y por lo que se escribe (sin tildes ni mayúsculas)", () => {
    const f = (o: Partial<Parameters<typeof filtrarEsperan>[1]>) =>
      filtrarEsperan(l.filas, { tienda: "todas", estado: "todos", busqueda: "", ...o }).map((x) => x.producto.nombre + (x.talla ?? ""));
    expect(f({})).toEqual(["Blusa EmmaM", "Blusa EmmaL", "Falda Renata"]);
    expect(f({ tienda: TRU.id })).toEqual(["Blusa EmmaM"]);
    expect(f({ tienda: "cualquiera" })).toEqual(["Blusa EmmaL"]);
    expect(f({ estado: "faltan" })).toEqual(["Blusa EmmaM"]);
    expect(f({ estado: "llegaron" })).toEqual(["Blusa EmmaL"]);
    expect(f({ busqueda: "FALDA" })).toEqual(["Falda Renata"]);
    expect(f({ busqueda: "negro" })).toEqual(["Blusa EmmaM", "Blusa EmmaL"]);
  });

  it("las píldoras de tienda: Todas, cada tienda de la web y Cualquier tienda, con cuántas tiene cada una", () => {
    expect(pildorasDeTienda(l).map((p) => `${p.texto}:${p.cuantas}`)).toEqual(["Todas:3", "Lima:1", "Trujillo:1", "Cualquier tienda:1"]);
  });

  it("la cifra de la Vitrina: las personas de la base, o null si no se pudo leer", () => {
    expect(personasQueEsperan(CRUDO)).toBe(3);
    expect(personasQueEsperan(null)).toBeNull();
  });
});
