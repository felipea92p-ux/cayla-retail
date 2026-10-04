import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accionHoyPorVariante } from "./existencias-recomendaciones";
import { filtrarExistencias, filtrosDeUrl, indiceDeExistencias } from "./existencias-filtros";
import { TIPOS_HOY, type TipoHoy } from "./existencias-hoy";
import { porColgarDeLaSede } from "./existencias-para-hoy";
import { agruparPorPrenda, queHacerPrenda, type FilaPrenda, type PrendaAgrupada } from "./existencias-prendas";
import { claveDeTarjeta, conteoDeLista, opcionesOrden, ordenarModelos, tarjetasDeExistencias, type ModeloPrendas } from "./existencias-tarjetas";
import { politicaDe } from "./politica-operativa-inventario";

let n = 0;
type Fila = FilaPrenda & { categoria: string | null };
const talla = (referencia: string, color: string, t: string | null, piso: number, almacen: number, extra: Partial<Fila> = {}): Fila => ({
  varianteId: `v${++n}`,
  productoId: referencia,
  referencia,
  sku: `SKU-${n}`,
  talla: t,
  color,
  colorHex: null,
  fotoUrl: null,
  codigosBarras: [],
  categoria: null,
  pisoDisponible: piso,
  almacenDisponible: almacen,
  disponible: piso + almacen,
  apartado: 0,
  danado: 0,
  enTransito: 0,
  accionHoy: null,
  marca: null,
  ...extra,
});

/** «Acción hoy» con la política de la sede, como hacen la página de Existencias y el Inicio. */
const conAccion = (crudo: Fila[]): Fila[] => {
  const accion = accionHoyPorVariante(crudo, politicaDe("sede-de-prueba"));
  return crudo.map((f) => ({ ...f, accionHoy: accion.get(f.varianteId) ?? null }));
};

/** Lo que hace la pantalla con un enlace: filtra como la URL, agrupa en prendas y arma las tarjetas. */
const tarjetasDe = (stock: Fila[], consulta: string) => {
  const elegidos = filtrosDeUrl(consulta, { separa: true });
  const filas = filtrarExistencias(indiceDeExistencias(stock), elegidos).filas;
  return { filas, tarjetas: tarjetasDeExistencias(agruparPorPrenda(filas), elegidos.hoy) };
};

/** Lo que LEE la persona en una tarjeta: la pastilla del color que se ve (el primero, si no tocó otro punto). */
const pastillaVisible = (t: ModeloPrendas<Fila>) => queHacerPrenda(t.colores[0].tallas);

// El caso del 2026-10-04 en la base de semilla (Tienda Trujillo): «Para hoy» y el Inicio decían «15 tallas por colgar» y la lista
// «Hoy ▸ Por colgar» mostraba 5 tarjetas que sumaban 3+3+3+2+1 = 12. Las 3 que faltaban eran de Blusa Valentina Rosado, detrás de un
// punto de color de la tarjeta de Blusa Valentina (que enseñaba el Blanco).
describe("con «Hoy», la suma de las pastillas visibles es la cifra de «Para hoy»", () => {
  const stock = conAccion([
    talla("Blusa Valentina", "Blanco", "S", 0, 5),
    talla("Blusa Valentina", "Blanco", "M", 0, 5),
    talla("Blusa Valentina", "Blanco", "L", 0, 5),
    talla("Blusa Valentina", "Rosado", "S", 0, 5),
    talla("Blusa Valentina", "Rosado", "M", 0, 5),
    talla("Blusa Valentina", "Rosado", "L", 0, 5),
    talla("Pantalón Mía", "Azul marino", "28", 0, 5),
    talla("Pantalón Mía", "Azul marino", "30", 0, 5),
    talla("Pantalón Mía", "Azul marino", "32", 0, 5),
    talla("Vestido Antonella", "Rosado", "S", 0, 5),
    talla("Vestido Antonella", "Rosado", "M", 0, 5),
    talla("Vestido Antonella", "Rosado", "L", 0, 5),
    talla("Falda Ariana", "Rosado", "S", 0, 5),
    talla("Falda Ariana", "Rosado", "M", 0, 5),
    talla("Casaca Luciana", "Beige", "M", 1, 0), // colgada: nada que colgar
    talla("Casaca Luciana", "Beige", "L", 0, 5),
  ]);
  const paraHoy = porColgarDeLaSede(stock).tallas;

  it("el escenario es el de la semilla: 15 tallas por colgar en 6 prendas de 5 modelos", () => {
    expect(paraHoy).toBe(15);
    expect(porColgarDeLaSede(stock).prendas).toHaveLength(6);
    expect(new Set(stock.map((f) => f.productoId)).size).toBe(5);
  });

  it("«Por colgar»: una tarjeta por prenda, cada una con UN color, y sus pastillas suman 15", () => {
    const { tarjetas } = tarjetasDe(stock, "hoy=por_colgar");
    expect(tarjetas).toHaveLength(6);
    expect(tarjetas.every((t) => t.colores.length === 1)).toBe(true);
    const leidas = tarjetas.map((t) => [t.colores[0].referencia, t.colores[0].color, pastillaVisible(t)?.n] as const);
    // El orden lo pone la pantalla (por urgencia, por percha); aquí importa qué dice cada tarjeta.
    expect([...leidas].sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`, "es"))).toEqual([
      ["Blusa Valentina", "Blanco", 3],
      ["Blusa Valentina", "Rosado", 3],
      ["Casaca Luciana", "Beige", 1],
      ["Falda Ariana", "Rosado", 2],
      ["Pantalón Mía", "Azul marino", 3],
      ["Vestido Antonella", "Rosado", 3],
    ]);
    expect(tarjetas.reduce((s, t) => s + (pastillaVisible(t)?.n ?? 0), 0)).toBe(paraHoy);
  });

  it("la línea de arriba dice las mismas dos cifras: 6 prendas y 15 tallas por colgar", () => {
    const { filas, tarjetas } = tarjetasDe(stock, "hoy=por_colgar");
    expect(conteoDeLista(tarjetas.length, filas, "por_colgar")).toEqual({
      total: 6,
      unidad: { uno: "prenda", varios: "prendas" },
      tallas: { cifra: 15, texto: "tallas por colgar" },
      aclaracion: null,
    });
  });

  it("así se rompía: por modelo, la pastilla del color visible suma 12 y Rosado queda escondido", () => {
    const filas = filtrarExistencias(indiceDeExistencias(stock), filtrosDeUrl("hoy=por_colgar", { separa: true })).filas;
    const porModelo = tarjetasDeExistencias(agruparPorPrenda(filas), null);
    expect(porModelo).toHaveLength(5);
    expect(porModelo.reduce((s, t) => s + (pastillaVisible(t)?.n ?? 0), 0)).toBe(12);
  });

  it("vale para todo caso de «Hoy» con cifra: la suma de las pastillas es el número de tallas de la lista", () => {
    const variado = conAccion([
      ...stock,
      talla("Top Luna", "Negro", "S", 1, 2), // queda poco en el piso y hay atrás
      talla("Top Luna", "Blanco", "S", 1, 3),
      talla("Short Mía", "Negro", "M", 0, 0), // nada en la sede
      talla("Short Mía", "Beige", "M", 0, 0, { enTransito: 1 }),
    ]);
    for (const hoy of TIPOS_HOY.filter((t): t is Exclude<TipoHoy, "mantener"> => t !== "mantener")) {
      const { filas, tarjetas } = tarjetasDe(variado, `hoy=${hoy}`);
      expect({ hoy, colores: Math.max(0, ...tarjetas.map((t) => t.colores.length)) }).toEqual({ hoy, colores: filas.length > 0 ? 1 : 0 });
      const suma = tarjetas.reduce((s, t) => s + (pastillaVisible(t)?.n ?? 0), 0);
      expect({ hoy, suma }).toEqual({ hoy, suma: filas.length });
      expect({ hoy, cifra: conteoDeLista(tarjetas.length, filas, hoy).tallas?.cifra }).toEqual({ hoy, cifra: filas.length });
    }
  });

  it("sin «Hoy» la lista sigue siendo para mirar: una tarjeta por modelo con sus colores", () => {
    const { tarjetas } = tarjetasDe(stock, "");
    expect(tarjetas).toHaveLength(5);
    const valentina = tarjetas.find((t) => t.productoId === "Blusa Valentina");
    expect(valentina?.colores.map((c) => c.color)).toEqual(["Blanco", "Rosado"]);
    expect(conteoDeLista(tarjetas.length, [], null)).toEqual({ total: 5, unidad: { uno: "producto", varios: "productos" }, tallas: null, aclaracion: null });
  });
});

// Si la pantalla volviera a agrupar o a contar por su cuenta, las pruebas de arriba seguirían en verde y la lista volvería a sumar
// distinto que «Para hoy»: lo que se prueba aquí tiene que ser lo que la pantalla usa.
describe("la pantalla usa estas reglas, no unas propias", () => {
  const fuente = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
  it("Existencias arma las tarjetas y su conteo con `tarjetasDeExistencias` y `conteoDeLista`, con el «Hoy» elegido", () => {
    const panel = fuente("components/InventarioPanel.tsx");
    expect(panel).toMatch(/tarjetasDeExistencias\(prendas, elegidos\.hoy\)/);
    expect(panel).toMatch(/conteoDeLista\(tarjetasOrdenadas\.length, filtradas, elegidos\.hoy\)/);
    expect(fuente("components/ExistenciasTarjetas.tsx")).not.toMatch(/function agruparPorModelo|new Map<string, PrendaAgrupada/);
  });
  it("la barra cuenta cada opción con la misma `claveDeTarjeta`", () => {
    expect(fuente("lib/existencias-filtros.ts")).toMatch(/claveDeTarjeta\(f, clave === "hoy"/);
  });
});

describe("tarjetasDeExistencias", () => {
  const p = (productoId: string, color: string): PrendaAgrupada<FilaPrenda> => agruparPorPrenda([talla(productoId, color, "M", 0, 1)])[0];

  it("respeta el orden de llegada: el primer color que aparece decide dónde va la tarjeta del modelo", () => {
    const tarjetas = tarjetasDeExistencias([p("Polo", "Azul"), p("Blusa", "Rojo"), p("Polo", "Negro")], null);
    expect(tarjetas.map((t) => [t.productoId, t.colores.map((c) => c.color)])).toEqual([
      ["Polo", ["Azul", "Negro"]],
      ["Blusa", ["Rojo"]],
    ]);
  });

  it("cada tarjeta tiene una clave única en la lista (React la usa de llave y la tarjeta recuerda su color con ella)", () => {
    const prendas = [p("Polo", "Azul"), p("Polo", "Negro"), p("Blusa", "Rojo")];
    for (const hoy of [null, "por_colgar"] as const) {
      const claves = tarjetasDeExistencias(prendas, hoy).map((t) => t.clave);
      expect(new Set(claves).size).toBe(claves.length);
    }
  });

  it("la tarjeta y el número de cada opción de la barra usan la misma regla (`claveDeTarjeta`)", () => {
    const f = { productoId: "Polo", color: "Azul" };
    expect(claveDeTarjeta(f, null)).toBe("Polo");
    expect(claveDeTarjeta(f, "por_colgar")).not.toBe(claveDeTarjeta({ ...f, color: "Negro" }, "por_colgar"));
    expect(tarjetasDeExistencias([p("Polo", "Azul")], "por_colgar")[0].clave).toBe(claveDeTarjeta(f, "por_colgar"));
  });
});

describe("conteoDeLista", () => {
  it("«Sin stock atrás» aclara lo que ya viene en camino: «Para hoy» lo descuenta y la lista lo muestra", () => {
    const filas = [{ enTransito: 0 }, { enTransito: 2 }, { enTransito: 0 }, { enTransito: 0 }];
    const c = conteoDeLista(3, filas, "sin_stock_atras");
    expect(c.tallas).toEqual({ cifra: 4, texto: "tallas sin stock atrás" });
    expect(c.aclaracion).toBe("1 ya viene en camino");
    expect(conteoDeLista(3, [{ enTransito: 1 }, { enTransito: 1 }], "sin_stock_atras").aclaracion).toBe("2 ya vienen en camino");
  });

  it("singular y «Mantener» (que en la pastilla no lleva cifra)", () => {
    expect(conteoDeLista(1, [{ enTransito: 0 }], "por_reponer").tallas).toEqual({ cifra: 1, texto: "talla por reponer" });
    expect(conteoDeLista(2, [{ enTransito: 0 }, { enTransito: 0 }], "mantener").tallas).toEqual({ cifra: 2, texto: "tallas en «Mantener»" });
  });

  it("solo «Sin stock atrás» lleva aclaración: en los demás casos lo en camino no cambia la cifra de «Para hoy»", () => {
    expect(conteoDeLista(1, [{ enTransito: 3 }], "por_colgar").aclaracion).toBeNull();
  });
});

describe("ordenarModelos y opcionesOrden", () => {
  const modelo = (ref: string, piso: number, almacen: number): ModeloPrendas<FilaPrenda> => {
    const prenda = agruparPorPrenda([talla(ref, "Azul", "M", piso, almacen)])[0];
    return { clave: ref, productoId: ref, colores: [prenda] };
  };
  const lista = [modelo("Polo", 1, 9), modelo("Blusa", 5, 0), modelo("Abrigo", 3, 3)];
  const refs = (m: ModeloPrendas<FilaPrenda>[]) => m.map((x) => x.productoId);

  it("«Más relevantes» deja el orden en que llegó; los demás suman los colores de la tarjeta", () => {
    expect(refs(ordenarModelos(lista, "relevancia"))).toEqual(["Polo", "Blusa", "Abrigo"]);
    expect(refs(ordenarModelos(lista, "nombre"))).toEqual(["Abrigo", "Blusa", "Polo"]);
    expect(refs(ordenarModelos(lista, "mas-piso"))).toEqual(["Blusa", "Abrigo", "Polo"]);
    expect(refs(ordenarModelos(lista, "menos-piso"))).toEqual(["Polo", "Abrigo", "Blusa"]);
    expect(refs(ordenarModelos(lista, "mas-almacen"))).toEqual(["Polo", "Abrigo", "Blusa"]);
    expect(refs(ordenarModelos(lista, "mas-disponible"))).toEqual(["Polo", "Abrigo", "Blusa"]);
    expect(refs(ordenarModelos(lista, "menos-disponible"))).toEqual(["Blusa", "Abrigo", "Polo"]);
  });

  it("no reordena la lista que recibe", () => {
    ordenarModelos(lista, "nombre");
    expect(refs(lista)).toEqual(["Polo", "Blusa", "Abrigo"]);
  });

  it("donde no se separa piso y almacén (Taller) no hay «más en el piso»", () => {
    expect(opcionesOrden(false).map((o) => o.valor)).not.toContain("mas-piso");
    expect(opcionesOrden(true).map((o) => o.valor)).toContain("mas-almacen");
  });
});
