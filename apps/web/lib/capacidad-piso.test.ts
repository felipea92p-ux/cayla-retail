import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cifraColgadasEnElPiso,
  explicarCapacidadPiso,
  FAMILIAS_DEL_RIEL,
  FAMILIAS_FUERA_DEL_RIEL,
  leerCapacidadPiso,
  notaAccesorios,
  notaCapacidadPiso,
  separarColgadas,
  type CapacidadPiso,
} from "./capacidad-piso";

// Lo que devuelve `fn_capacidad_piso` por PostgREST: un arreglo de 0 o 1 filas, con los numeric como número.
const TRU = { m2_sala: 20, densidad: 30, capacidad: 600, provisional: false, contada_el: "2026-09-30", version: 1, cuadrado_en: null };
const AQP = { m2_sala: 60, densidad: 30, capacidad: 1800, provisional: true, contada_el: null, version: 1, cuadrado_en: null };
const CUADRE = "2026-10-12T15:30:00.123456+00:00";

describe("leer la capacidad que manda la base", () => {
  it("una fila contada y una provisional, las dos sin cuadrar (así están hoy las tres tiendas)", () => {
    expect(leerCapacidadPiso([TRU])).toEqual({ m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: null });
    expect(leerCapacidadPiso([AQP])).toEqual({ m2Sala: 60, densidad: 30, capacidad: 1800, provisional: true, cuadradoEn: null });
  });

  it("con la fecha del último cuadre, la sede queda cuadrada", () => {
    expect(leerCapacidadPiso([{ ...TRU, cuadrado_en: CUADRE }])?.cuadradoEn).toBe(CUADRE);
  });

  it("una fecha de cuadre que falta o no es fecha se lee como «por cuadrar» (del lado seguro), sin perder la capacidad", () => {
    const sinColumna: Record<string, unknown> = { ...TRU };
    delete sinColumna.cuadrado_en;
    for (const fila of [sinColumna, { ...TRU, cuadrado_en: "" }, { ...TRU, cuadrado_en: "ayer" }, { ...TRU, cuadrado_en: 20261012 }]) {
      expect(leerCapacidadPiso([fila])).toEqual({ m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: null });
    }
  });

  it("los numeric que llegan como texto también se leen (12,5 m²)", () => {
    expect(leerCapacidadPiso([{ ...TRU, m2_sala: "12.50", densidad: "30.00", capacidad: 375 }])).toEqual({
      m2Sala: 12.5,
      densidad: 30,
      capacidad: 375,
      provisional: false,
      cuadradoEn: null,
    });
  });

  it("sin fila (Taller, tienda sin medir) o sin datos: sin capacidad, nunca un 0", () => {
    expect(leerCapacidadPiso([])).toBeNull();
    expect(leerCapacidadPiso(null)).toBeNull();
    expect(leerCapacidadPiso(undefined)).toBeNull();
    expect(leerCapacidadPiso("600")).toBeNull();
  });

  it("una fila rara no se convierte en un número inventado", () => {
    expect(leerCapacidadPiso([{ ...TRU, capacidad: 0 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, capacidad: 600.5 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, capacidad: null }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, m2_sala: 0 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, densidad: "abc" }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, provisional: "false" }])).toBeNull();
  });
});

describe("la nota de «Colgadas en el piso»", () => {
  const contada: CapacidadPiso = { m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: CUADRE };
  const provisional: CapacidadPiso = { m2Sala: 60, densidad: 30, capacidad: 1800, provisional: true, cuadradoEn: CUADRE };
  const sinCuadrar = (c: CapacidadPiso): CapacidadPiso => ({ ...c, cuadradoEn: null });

  it("dice cuántas caben: «de 600» (lo que acordó la sesión de UI/UX, ADR-0331) cuando la sede ya cuadró su piso", () => {
    expect(notaCapacidadPiso(contada)).toBe("de 600");
  });

  it("marca «(provisional)» si la sede no se ha contado, sin separador de miles como el número de al lado", () => {
    expect(notaCapacidadPiso(provisional)).toBe("de 1800 (provisional)");
    expect(notaCapacidadPiso({ ...contada, m2Sala: 6, capacidad: 180, provisional: true })).toBe("de 180 (provisional)");
  });

  it("mientras la sede no cuadró su piso, «por cuadrar» (ADR-0328: hoy TRU diría «138 de 600» sobre un piso lleno)", () => {
    expect(notaCapacidadPiso(sinCuadrar(contada))).toBe("de 600 · por cuadrar");
    expect(notaCapacidadPiso(sinCuadrar(provisional))).toBe("de 1800 (provisional) · por cuadrar");
  });

  it("las cuatro combinaciones: «por cuadrar» sale si y solo si no hay fecha de cuadre; «(provisional)», si y solo si no se contó", () => {
    for (const prov of [false, true]) {
      for (const cuadradoEn of [null, CUADRE]) {
        const nota = notaCapacidadPiso({ ...contada, provisional: prov, cuadradoEn }) ?? "";
        expect(nota.startsWith("de 600")).toBe(true);
        expect(nota.includes("(provisional)")).toBe(prov);
        expect(nota.endsWith(" · por cuadrar")).toBe(cuadradoEn === null);
      }
    }
  });

  it("sin capacidad no hay nota (ni «de 0» ni «de —» ni un «por cuadrar» suelto)", () => {
    expect(notaCapacidadPiso(null)).toBeUndefined();
  });

  it("la nota y la explicación salen de la misma lectura: si una existe, la otra también", () => {
    for (const c of [contada, provisional, sinCuadrar(contada), null]) {
      expect(notaCapacidadPiso(c) === undefined).toBe(explicarCapacidadPiso(c) === undefined);
    }
  });

  it("la explicación dice de dónde sale el número, por qué es provisional y por qué está por cuadrar", () => {
    expect(explicarCapacidadPiso(contada)).toBe("Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m².");
    expect(explicarCapacidadPiso({ ...provisional, m2Sala: 12.5, capacidad: 375 })).toBe(
      "Caben unas 375 prendas colgadas: 12.5 m² de sala × 30 por m². Provisional: esta sede todavía no contó las prendas de su piso."
    );
    expect(explicarCapacidadPiso(sinCuadrar(contada))).toBe(
      "Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m². Por cuadrar: el piso de esta sede todavía no se cuadró, y el sistema puede tener como guardadas prendas que ya cuelgan."
    );
  });
});

// ---------- Lo que trae una base nueva: las familias y las categorías que siembran las migraciones y el seed ----------
// Se leen del SQL real y no de una lista copiada: así la prueba se entera sola de una familia o una categoría nueva por migración.
const SUPABASE = new URL("../../../supabase/", import.meta.url);
const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");
const SQL_DE_UNA_BASE_NUEVA: readonly string[] = [
  // Solo las migraciones que corre la base (`0001_…`, `20260918010000_…`), no los scripts sueltos de la carpeta («pegar-en-…»).
  ...readdirSync(new URL("migrations/", SUPABASE))
    .filter((a) => /^\d+_[^/]*\.sql$/.test(a))
    .sort()
    .map((a) => readFileSync(new URL(`migrations/${a}`, SUPABASE), "utf8")),
  readFileSync(new URL("seed.sql", SUPABASE), "utf8"),
].map(sinComentarios);

const FAMILIAS_SEMBRADAS: ReadonlySet<string> = new Set(
  SQL_DE_UNA_BASE_NUEVA.flatMap((sql) =>
    [...sql.matchAll(/insert\s+into\s+(?:retail\.)?familias\s*\(([^)]*)\)\s*values([\s\S]*?)(?:\bon\s+conflict\b|;)/gi)].flatMap((m) => {
      // Sin `codigo` explícito, la base lo inventa desde el nombre y la prueba no podría saber de qué lado va: que falle y se fije.
      if (m[1].split(",")[0].trim() !== "codigo") throw new Error(`Una familia sembrada sin código explícito: ${m[0].slice(0, 120)}`);
      return [...m[2].matchAll(/\(\s*'([^']+)'/g)].map((t) => t[1]);
    })
  )
);

const CATEGORIAS_SEMBRADAS: readonly { nombre: string; familia: string }[] = SQL_DE_UNA_BASE_NUEVA.flatMap((sql) =>
  [...sql.matchAll(/insert\s+into\s+(?:retail\.)?categorias\s*\(\s*nombre\s*,\s*familia\b[^)]*\)\s*values([\s\S]*?)(?:\bon\s+conflict\b|;)/gi)].flatMap((m) =>
    [...m[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map((t) => ({ nombre: t[1], familia: t[2] }))
  )
);

describe("lo que se compara con la capacidad: la ropa del riel, con los accesorios aparte (ADR-0329, punto 6)", () => {
  const fila = (productoId: string, pisoDisponible: number | null) => ({ productoId, pisoDisponible });

  it("la prueba de verdad leyó las familias y las categorías de una base nueva (si el SQL cambia de forma, falla aquí y no en silencio)", () => {
    expect([...FAMILIAS_SEMBRADAS]).toEqual(expect.arrayContaining(["accesorios", "belleza", "bisuteria", "calzado", "indumentaria", "papeleria"]));
    expect(CATEGORIAS_SEMBRADAS.length).toBeGreaterThanOrEqual(40);
    for (const c of CATEGORIAS_SEMBRADAS) expect(FAMILIAS_SEMBRADAS.has(c.familia), `${c.nombre} → ${c.familia}`).toBe(true);
  });

  it("cada familia de una base nueva tiene lado: o cuelga en el riel o va fuera, nunca las dos ni ninguna", () => {
    for (const familia of FAMILIAS_SEMBRADAS) {
      expect(FAMILIAS_DEL_RIEL.has(familia) !== FAMILIAS_FUERA_DEL_RIEL.has(familia), `«${familia}» necesita lado (o tiene dos)`).toBe(true);
    }
    // Y ninguna errata: cada familia de las dos listas existe en la base (una errata dejaría bolsos o aretes dentro del riel).
    for (const familia of [...FAMILIAS_DEL_RIEL, ...FAMILIAS_FUERA_DEL_RIEL]) expect(FAMILIAS_SEMBRADAS.has(familia), familia).toBe(true);
    expect([...FAMILIAS_DEL_RIEL]).toEqual(["indumentaria"]);
  });

  it("bisutería, bolsos y carteras, calzado, gorros, cinturones y lentes quedan fuera del riel por su familia, no por su nombre", () => {
    const familiaDe = new Map(CATEGORIAS_SEMBRADAS.map((c) => [c.nombre, c.familia]));
    const fuera = ["Carteras/Bolsos", "Mochilas", "Cinturones", "Gorros/Sombreros", "Lentes de sol", "Aretes", "Pulseras", "Anillos", "Collares", "Zapatillas", "Sandalias", "Botas", "Botines", "Mocasines", "Bailarinas"];
    for (const nombre of fuera) expect(FAMILIAS_FUERA_DEL_RIEL.has(familiaDe.get(nombre) ?? "(no está)"), nombre).toBe(true);
    for (const nombre of ["Blusas", "Vestidos", "Jeans", "Pantalones", "Faldas", "Tops", "Abrigos", "Bodys", "Conjuntos"]) {
      expect(FAMILIAS_DEL_RIEL.has(familiaDe.get(nombre) ?? "(no está)"), nombre).toBe(true);
    }
  });

  it("con una prenda de cada familia y de cada categoría sembrada: al riel va solo la ropa, y las dos partes suman todo lo del piso", () => {
    const productos = [
      ...[...FAMILIAS_SEMBRADAS].map((familia) => ({ id: `familia:${familia}`, familia })),
      ...CATEGORIAS_SEMBRADAS.map((c) => ({ id: `categoria:${c.nombre}`, familia: c.familia })),
    ];
    // Cantidades distintas en cada fila: una fila que cae del lado equivocado cambia la suma.
    const filas = productos.map((p, i) => fila(p.id, i + 1));
    const ropa = productos.reduce((n, p, i) => n + (p.familia === "indumentaria" ? i + 1 : 0), 0);
    const total = filas.reduce((n, f) => n + (f.pisoDisponible ?? 0), 0);
    expect(separarColgadas(filas, productos)).toEqual({ delRiel: ropa, accesorios: total - ropa });
    expect(ropa).toBeGreaterThan(0);
    expect(total - ropa).toBeGreaterThan(0);
  });

  it("lo que no se sabe cuenta en el riel (la cifra queda como antes de separar): sin familia, familia que un líder creó después, producto que no llegó", () => {
    const productos = [
      { id: "blusa", familia: "indumentaria" },
      { id: "aretes", familia: "bisuteria" },
      { id: "sin-familia", familia: null },
      { id: "familia-nueva", familia: "lenceria_fina" },
    ];
    const filas = [fila("blusa", 40), fila("aretes", 12), fila("sin-familia", 5), fila("familia-nueva", 4), fila("no-llego", 9)];
    expect(separarColgadas(filas, productos)).toEqual({ delRiel: 58, accesorios: 12 });
    expect(separarColgadas(filas, [])).toEqual({ delRiel: 70, accesorios: 0 });
  });

  it("una sede sin piso separado (null) no suma ni resta", () => {
    expect(separarColgadas([fila("aretes", null), fila("blusa", null)], [{ id: "aretes", familia: "bisuteria" }])).toEqual({ delRiel: 0, accesorios: 0 });
  });

  it("«+ 17 accesorios», en singular y en plural, y nada si no hay ninguno", () => {
    expect(notaAccesorios(17)).toBe("+ 17 accesorios");
    expect(notaAccesorios(1)).toBe("+ 1 accesorio");
    expect(notaAccesorios(0)).toBeUndefined();
  });
});

describe("la tarjeta «Colgadas en el piso»", () => {
  const productos = [
    { id: "blusa", familia: "indumentaria" },
    { id: "vestido", familia: "indumentaria" },
    { id: "aretes", familia: "bisuteria" },
    { id: "cartera", familia: "accesorios" },
    { id: "sandalia", familia: "calzado" },
  ];
  const filas = [
    { productoId: "blusa", pisoDisponible: 25 },
    { productoId: "vestido", pisoDisponible: 15 },
    { productoId: "aretes", pisoDisponible: 12 },
    { productoId: "cartera", pisoDisponible: 3 },
    { productoId: "sandalia", pisoDisponible: 2 },
  ];
  const tru: CapacidadPiso = { m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: null };

  it("TRU: el número es la ropa («40 de 600 · por cuadrar») y los accesorios van aparte en la misma tarjeta («+ 17 accesorios»)", () => {
    const cifra = cifraColgadasEnElPiso({ filas, productos, catalogoFallo: false, capacidad: tru });
    expect(cifra).toMatchObject({ valor: 40, nota: "de 600 · por cuadrar", aparte: "+ 17 accesorios" });
    expect(cifra.titulo).toBe(
      "Ropa en el piso de venta, libre para vender: la que cuelga en el riel. Aparte, 17 accesorios en el piso (bisutería, bolsos, calzado…): no cuelgan en el riel y la caja también los cobra. Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m². Por cuadrar: el piso de esta sede todavía no se cuadró, y el sistema puede tener como guardadas prendas que ya cuelgan."
    );
  });

  it("ropa y accesorios suman lo que cobra la caja: el número de ADR-0331 sigue entero, solo que partido", () => {
    const cifra = cifraColgadasEnElPiso({ filas, productos, catalogoFallo: false, capacidad: tru });
    expect(cifra.valor + 17).toBe(filas.reduce((n, f) => n + f.pisoDisponible, 0));
  });

  it("sin accesorios en el piso, la tarjeta no dice «+ 0» ni habla de accesorios", () => {
    const cifra = cifraColgadasEnElPiso({ filas: filas.slice(0, 2), productos, catalogoFallo: false, capacidad: tru });
    expect(cifra.aparte).toBeUndefined();
    expect(cifra.titulo).not.toContain("accesorio");
  });

  it("un solo accesorio, en singular", () => {
    const cifra = cifraColgadasEnElPiso({ filas: [...filas.slice(0, 2), { productoId: "aretes", pisoDisponible: 1 }], productos, catalogoFallo: false, capacidad: tru });
    expect(cifra.aparte).toBe("+ 1 accesorio");
    expect(cifra.titulo).toContain("Aparte, 1 accesorio en el piso (bisutería, bolsos, calzado…): no cuelga en el riel y la caja también lo cobra.");
  });

  it("una tienda sin capacidad (o sin el SQL todavía) separa igual, sin nota: el número no cambia de sentido según responda la capacidad", () => {
    const cifra = cifraColgadasEnElPiso({ filas, productos, catalogoFallo: false, capacidad: null });
    expect(cifra).toMatchObject({ valor: 40, nota: undefined, aparte: "+ 17 accesorios" });
    expect(cifra.titulo).not.toContain("Caben");
  });

  it("LIM sigue «(provisional)»: «de 180 (provisional) · por cuadrar»", () => {
    const lim: CapacidadPiso = { m2Sala: 6, densidad: 30, capacidad: 180, provisional: true, cuadradoEn: null };
    const cifra = cifraColgadasEnElPiso({ filas, productos, catalogoFallo: false, capacidad: lim });
    expect(cifra.nota).toBe("de 180 (provisional) · por cuadrar");
    expect(cifra.titulo).toContain("Provisional: esta sede todavía no contó las prendas de su piso.");
  });

  it("si el catálogo no respondió, no se separa ni se compara: todo lo del piso, sin «de 600» y sin «+ N accesorios», y lo dice", () => {
    const cifra = cifraColgadasEnElPiso({ filas, productos: [], catalogoFallo: true, capacidad: tru });
    expect(cifra.valor).toBe(57);
    expect(cifra.nota).toBeUndefined();
    expect(cifra.aparte).toBeUndefined();
    expect(cifra.titulo).toContain("No se pudo leer la categoría de las prendas");
  });
});
