import { describe, expect, it } from "vitest";
import {
  ACCIONES_PISO,
  DIAS_VENTANA,
  MINIMO_TALLA_CENTRAL,
  claveAtributo,
  decidirTalla,
  esParaColgar,
  esTallaCentral,
  lecturaDesdeJson,
  paraColgarHoy,
  pidePiso,
  planDelPiso,
  quedaraPidiendoColgar,
  requisitoDeTalla,
  tercioCentral,
  type LecturaDelPiso,
  type TallaEnSede,
  type VentaPorAtributo,
} from "./piso-plan";

/* ====================================================================
   El motor del piso (ADR-0328 act. 7). Las pruebas siguen la tabla de decisión de `decidirTalla` (una prueba por fila), la
   regla de talla central contra TODAS las tallas de la base, y escenas con las cifras reales que motivaron el cambio.
   ==================================================================== */

/**
 * TODAS las tallas que deja la base (migraciones + seed, con la configuración del CI: UTF-8 de verdad), consultadas el
 * 2026-10-04 con `select valor from retail.tallas`. `scripts/pruebas/piso_plan_lectura.mjs` (caso V1) compara esta lista con la
 * base: si una migración o el seed agregan una talla, esa prueba se pone en rojo y pide sumarla aquí, con su respuesta en
 * `CENTRAL_ESPERADA`. (Ojo: en un Postgres con `--locale=C`, `lower('Ú')` no baja la mayúscula, la migración 20260918175000 no
 * renombra «Único» a «Única» y la lista sale distinta; el CI usa un locale UTF-8.)
 */
const TALLAS_DE_LA_BASE = [
  "26", "28", "30", "32", "34", "35", "36", "37", "38", "39", "40", "41", "42",
  "6", "7", "8", "9",
  "Estándar", "L", "M", "S", "XL", "XS", "XXL", "Única",
];

/** Las curvas de las categorías de la base (`categoria_tallas`, mismo día), una por forma distinta. */
const CURVAS_DE_LA_BASE: Record<string, string[]> = {
  "Ropa (Abrigos, Blusas, Polos, Tops, Vestidos, Faldas, Shorts…)": ["Estándar", "L", "M", "S", "XL", "XS", "XXL"],
  "Bodys, Ropa interior, Trajes de baño": ["L", "M", "S", "XL", "XS"],
  Cinturones: ["L", "M", "S", "XL"],
  "Jeans, Pantalones": ["26", "28", "30", "32", "34"],
  "Calzado (Botas, Bailarinas, Sandalias, Zapatillas…)": ["34", "35", "36", "37", "38", "39", "40", "41", "42"],
  Anillos: ["6", "7", "8", "9"],
  "Aretes, Collares, Bolsos, Gorros, Lentes, Maquillaje, papelería…": ["Única"],
};

/** La respuesta esperada para cada talla de la base en cada curva donde aparece. Escrita a mano, no calculada. */
const CENTRAL_ESPERADA: Record<string, Record<string, boolean>> = {
  "Ropa (Abrigos, Blusas, Polos, Tops, Vestidos, Faldas, Shorts…)": { Estándar: true, L: true, M: true, S: true, XL: false, XS: false, XXL: false },
  "Bodys, Ropa interior, Trajes de baño": { L: true, M: true, S: true, XL: false, XS: false },
  Cinturones: { L: true, M: true, S: true, XL: false },
  // La tabla de Felipe: 28 · 30 · 32.
  "Jeans, Pantalones": { "26": false, "28": true, "30": true, "32": true, "34": false },
  // Sin ninguna talla de la tabla: el tercio central de 9 tallas.
  "Calzado (Botas, Bailarinas, Sandalias, Zapatillas…)": { "34": false, "35": false, "36": false, "37": true, "38": true, "39": true, "40": false, "41": false, "42": false },
  // El tercio central de 4 tallas, simétrico: las dos del medio.
  Anillos: { "6": false, "7": true, "8": true, "9": false },
  // La única talla de su modelo.
  "Aretes, Collares, Bolsos, Gorros, Lentes, Maquillaje, papelería…": { Única: true },
};

describe("la regla de talla central", () => {
  it("recorre TODAS las tallas de la base en TODAS las curvas donde aparecen, con la respuesta escrita a mano", () => {
    const vistas = new Set<string>();
    for (const [nombre, curva] of Object.entries(CURVAS_DE_LA_BASE)) {
      for (const talla of curva) {
        vistas.add(talla);
        expect([nombre, talla, esTallaCentral(talla, curva)]).toEqual([nombre, talla, CENTRAL_ESPERADA[nombre][talla]]);
      }
    }
    // Ninguna talla de la base queda sin una curva que la pruebe.
    expect([...vistas].sort()).toEqual([...TALLAS_DE_LA_BASE].sort());
  });

  it("es total: toda talla de la base tiene respuesta también sin curva y fuera de su curva", () => {
    for (const talla of TALLAS_DE_LA_BASE) {
      expect(typeof esTallaCentral(talla, [])).toBe("boolean");
      for (const curva of Object.values(CURVAS_DE_LA_BASE)) expect(typeof esTallaCentral(talla, curva)).toBe("boolean");
    }
  });

  it("«Estándar», «Única» y «Único» cuentan como la única talla de su modelo, en cualquier curva", () => {
    for (const unica of ["Estándar", "Estandar", "Única", "Unica", "Único", "STD"]) {
      expect(esTallaCentral(unica, [])).toBe(true);
      expect(esTallaCentral(unica, ["XS", "S", "M", "L", "XL"])).toBe(true);
    }
  });

  it("sin talla no se sabe: no es central (el reloj rápido igual la cuida si se vendió)", () => {
    expect(esTallaCentral(null, ["S", "M", "L"])).toBe(false);
    expect(esTallaCentral("  ", ["S", "M", "L"])).toBe(false);
  });

  it("no le importan las mayúsculas ni los espacios del dato", () => {
    expect(esTallaCentral(" m ", ["s", "m", "l", "xl"])).toBe(true);
    expect(esTallaCentral("xl", ["S", "M", "L", "XL"])).toBe(false);
  });

  it("una talla que no está en la curva de su categoría igual se decide (entra a la curva)", () => {
    expect(esTallaCentral("M", [])).toBe(true);
    expect(esTallaCentral("37", ["36", "38"])).toBe(true); // 36 · 37 · 38 → la del medio
    expect(esTallaCentral("38", ["36", "37"])).toBe(false);
    expect(esTallaCentral("44", [])).toBe(true); // una sola talla conocida: es la central
  });

  it("el tercio central es simétrico para toda curva de 0 a 9 tallas", () => {
    const curva = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const esperado = ["", "a", "ab", "b", "bc", "bcd", "cd", "cde", "cdef", "def"];
    for (let n = 0; n <= 9; n++) {
      const tercio = tercioCentral(curva.slice(0, n));
      expect(tercio.join("")).toBe(esperado[n]);
      if (n > 0) expect(curva.slice(0, n).indexOf(tercio[0])).toBe(n - 1 - curva.slice(0, n).indexOf(tercio[tercio.length - 1]));
    }
  });
});

describe("decidirTalla — la tabla de decisión, una prueba por fila", () => {
  it("fila 1: piso ≥ requisito → mantener (con o sin almacén, con o sin cuadre)", () => {
    expect(decidirTalla(1, 5, 1, false)).toBe("mantener");
    expect(decidirTalla(1, 0, 1, true)).toBe("mantener");
    expect(decidirTalla(0, 4, 0, false)).toBe("mantener"); // una talla extrema que no se vendió no pide nada
  });
  it("fila 2: falta en el piso y el almacén está vacío → sin_atras (también sin cuadre: el cuadre no crea almacén)", () => {
    expect(decidirTalla(0, 0, 1, false)).toBe("sin_atras");
    expect(decidirTalla(1, 0, 3, true)).toBe("sin_atras");
  });
  it("fila 3: falta, hay atrás y el piso no está cuadrado → pausa_sin_cuadre (el piso del sistema puede no ser el real)", () => {
    expect(decidirTalla(0, 2, 1, true)).toBe("pausa_sin_cuadre");
    expect(decidirTalla(1, 2, 2, true)).toBe("pausa_sin_cuadre");
  });
  it("fila 4: falta, hay atrás, piso cuadrado y en el piso no queda ninguna → por_colgar", () => {
    expect(decidirTalla(0, 2, 1, false)).toBe("por_colgar");
    expect(decidirTalla(-1, 2, 1, false)).toBe("por_colgar"); // un dato negativo no esconde la talla
  });
  it("fila 5: falta, hay atrás, piso cuadrado y en el piso queda alguna → por_reponer", () => {
    expect(decidirTalla(1, 2, 2, false)).toBe("por_reponer");
  });
  it("toda combinación cae en UNA de las cinco acciones y respeta su fila", () => {
    for (let piso = -1; piso <= 4; piso++)
      for (let almacen = 0; almacen <= 3; almacen++)
        for (let requisito = 0; requisito <= 4; requisito++)
          for (const pausa of [false, true]) {
            const a = decidirTalla(piso, almacen, requisito, pausa);
            expect(ACCIONES_PISO).toContain(a);
            expect(a === "mantener").toBe(piso >= requisito);
            if (pausa) expect(a === "por_colgar" || a === "por_reponer").toBe(false);
            if (esParaColgar(a)) expect(almacen).toBeGreaterThan(0);
            expect(pidePiso(a)).toBe(a !== "mantener" && a !== "pausa_sin_cuadre");
          }
  });
});

describe("requisitoDeTalla — cuántas debería tener colgadas", () => {
  it("talla central sin ventas: el mínimo de Felipe (1)", () => {
    expect(MINIMO_TALLA_CENTRAL).toBe(1);
    expect(requisitoDeTalla({ central: true, vendidasHoy: 0, vendidasAyer: 0, retirada: false })).toBe(1);
  });
  it("talla extrema sin ventas: nada (puede quedar en el almacén)", () => {
    expect(requisitoDeTalla({ central: false, vendidasHoy: 0, vendidasAyer: 0, retirada: false })).toBe(0);
  });
  it("lo vendido en un día manda si pide más: el mayor de ayer y hoy, sin sumarlos", () => {
    expect(requisitoDeTalla({ central: false, vendidasHoy: 0, vendidasAyer: 1, retirada: false })).toBe(1);
    expect(requisitoDeTalla({ central: true, vendidasHoy: 1, vendidasAyer: 3, retirada: false })).toBe(3);
    expect(requisitoDeTalla({ central: true, vendidasHoy: 2, vendidasAyer: 2, retirada: false })).toBe(2);
  });
  it("una talla retirada no pide nada, aunque se haya vendido", () => {
    expect(requisitoDeTalla({ central: true, vendidasHoy: 2, vendidasAyer: 2, retirada: true })).toBe(0);
    // Lo anotado a mano hoy o ayer con su categoría, talla y color pide 1 —no más: no dice qué modelo fue—.
    expect(requisitoDeTalla({ central: false, vendidasHoy: 0, vendidasAyer: 0, anotadasRecientes: 3, retirada: false })).toBe(1);
    expect(requisitoDeTalla({ central: false, vendidasHoy: 0, vendidasAyer: 2, anotadasRecientes: 1, retirada: false })).toBe(2);
    expect(requisitoDeTalla({ central: false, vendidasHoy: 0, vendidasAyer: 0, anotadasRecientes: 1, retirada: true })).toBe(0);
  });
});

describe("quedaraPidiendoColgar — el aviso de «Subir prenda»", () => {
  it("subir la única colgada de una talla central la deja por colgar", () => {
    expect(quedaraPidiendoColgar({ piso: 1, almacen: 0 }, 1, 1)).toBe(true);
  });
  it("subir de una talla que conserva su mínimo no pide nada", () => {
    expect(quedaraPidiendoColgar({ piso: 3, almacen: 0 }, 2, 1)).toBe(false);
    expect(quedaraPidiendoColgar({ piso: 2, almacen: 0 }, 2, 0)).toBe(false); // talla extrema sin ventas
  });
  it("una cantidad que no vale no avisa nada (de eso se ocupan los otros mensajes)", () => {
    expect(quedaraPidiendoColgar({ piso: 1, almacen: 0 }, 0, 1)).toBe(false);
    expect(quedaraPidiendoColgar({ piso: 1, almacen: 0 }, 1.5, 1)).toBe(false);
    expect(quedaraPidiendoColgar({ piso: 1, almacen: 0 }, 2, 1)).toBe(false);
  });
});

// ── Escenas ─────────────────────────────────────────────────────────────────────────────────────────────────

const POLOS = "cat-polos";
const JEANS = "cat-jeans";
const ZAPATOS = "cat-zapatos";
const CURVAS = [
  { categoriaId: POLOS, categoria: "Polos", tallas: ["XS", "S", "M", "L", "XL", "Estándar"] },
  { categoriaId: JEANS, categoria: "Jeans", tallas: ["26", "28", "30", "32", "34"] },
  { categoriaId: ZAPATOS, categoria: "Zapatillas", tallas: ["34", "35", "36", "37", "38", "39", "40", "41", "42"] },
];

let siguiente = 0;
function talla(p: Partial<TallaEnSede> & { talla: string | null }): TallaEnSede {
  siguiente += 1;
  return {
    varianteId: p.varianteId ?? `v${siguiente}`,
    productoId: p.productoId ?? "p1",
    referencia: p.referencia ?? "Polo Lucky",
    categoriaId: p.categoriaId === undefined ? POLOS : p.categoriaId,
    tallaId: p.tallaId ?? (p.talla ? `t-${p.talla}` : null),
    colorCodigo: p.colorCodigo ?? "NEG",
    color: p.color ?? "Negro",
    familiaColor: p.familiaColor === undefined ? "neutro" : p.familiaColor,
    retirada: p.retirada ?? false,
    fotoUrl: null,
    pisoLibre: p.pisoLibre ?? 0,
    almacenLibre: p.almacenLibre ?? 0,
    enCamino: p.enCamino ?? 0,
    vendidasHoy: p.vendidasHoy ?? 0,
    vendidasAyer: p.vendidasAyer ?? 0,
    vendidas14: p.vendidas14 ?? 0,
    talla: p.talla,
  };
}
/** Una sede con el piso YA cuadrado (el 1-oct), salvo que el caso diga otra cosa: las escenas prueban la regla, no la pausa. */
const CUADRADO_EN = "2026-10-01T15:00:00+00:00";
function lectura(tallas: TallaEnSede[], ventas: VentaPorAtributo[] = [], extra: Partial<LecturaDelPiso> = {}): LecturaDelPiso {
  return { ubicacionId: "tru", separaPiso: true, cuadradoEn: CUADRADO_EN, hoy: "2026-10-04", dias: DIAS_VENTANA, tallas, ventas, anotadasRecientes: [], curvas: CURVAS, ...extra };
}
const venta = (categoriaId: string | null, t: string | null, familiaColor: string | null, escaneadas: number, anotadas = 0): VentaPorAtributo => ({
  categoriaId,
  tallaId: t ? `t-${t}` : null,
  talla: t,
  familiaColor,
  escaneadas,
  anotadas,
});
const accion = (plan: ReturnType<typeof planDelPiso>, id: string) => plan.porTalla.get(id)?.accion;

describe("planDelPiso — las escenas que motivaron el cambio", () => {
  it("TRU: 510 tallas con 1 a 4 colgadas ya no piden reponer TODAS — con su mínimo cubierto, «Mantener» (antes 510 de 510)", () => {
    const tallas: TallaEnSede[] = [];
    for (let m = 0; m < 170; m++)
      for (const [i, t] of ["S", "M", "L"].entries())
        tallas.push(talla({ varianteId: `tru-${m}-${t}`, productoId: `p${m}`, talla: t, pisoLibre: 1 + ((m + i) % 4), almacenLibre: 2 }));
    const plan = planDelPiso(lectura(tallas));
    expect(tallas.length).toBe(510);
    expect([...plan.porTalla.values()].every((d) => d.accion === "mantener")).toBe(true);
    expect(plan.listaDelDia).toEqual([]);
  });

  it("la talla central sin ninguna colgada y con algo atrás → Por colgar; la extrema que no se vendió → Mantener", () => {
    const m = talla({ talla: "M", pisoLibre: 0, almacenLibre: 2 });
    const xl = talla({ talla: "XL", pisoLibre: 0, almacenLibre: 2 });
    const jean28 = talla({ talla: "28", categoriaId: JEANS, pisoLibre: 0, almacenLibre: 1 });
    const jean34 = talla({ talla: "34", categoriaId: JEANS, pisoLibre: 0, almacenLibre: 1 });
    const zapato38 = talla({ talla: "38", categoriaId: ZAPATOS, pisoLibre: 0, almacenLibre: 1 });
    const zapato35 = talla({ talla: "35", categoriaId: ZAPATOS, pisoLibre: 0, almacenLibre: 1 });
    const unica = talla({ talla: "Estándar", pisoLibre: 0, almacenLibre: 1 });
    const plan = planDelPiso(lectura([m, xl, jean28, jean34, zapato38, zapato35, unica]));
    expect([m, xl, jean28, jean34, zapato38, zapato35, unica].map((t) => accion(plan, t.varianteId))).toEqual([
      "por_colgar", "mantener", "por_colgar", "mantener", "por_colgar", "mantener", "por_colgar",
    ]);
  });

  it("el reloj rápido: la talla extrema que se vendió ayer se vuelve a colgar aunque el mínimo no la pida", () => {
    const xl = talla({ talla: "XL", pisoLibre: 0, almacenLibre: 2, vendidasAyer: 1 });
    expect(accion(planDelPiso(lectura([xl])), xl.varianteId)).toBe("por_colgar");
  });

  it("Por reponer: queda en el piso menos de lo que se vendió en un día, y hay atrás", () => {
    const m = talla({ talla: "M", pisoLibre: 1, almacenLibre: 3, vendidasAyer: 2 });
    const plan = planDelPiso(lectura([m]));
    expect(accion(plan, m.varianteId)).toBe("por_reponer");
    expect(plan.porTalla.get(m.varianteId)?.requisito).toBe(2);
  });

  it("Sin stock atrás: la talla central sin nada en el piso ni atrás; es un hueco del mínimo en su categoría × talla × familia", () => {
    const m = talla({ talla: "M", pisoLibre: 0, almacenLibre: 0, vendidas14: 3 });
    const plan = planDelPiso(lectura([m], [venta(POLOS, "M", "neutro", 3)]));
    expect(accion(plan, m.varianteId)).toBe("sin_atras");
    expect(plan.porAtributo.find((f) => f.clave === claveAtributo(POLOS, "t-M", "neutro"))?.huecos).toBe(1);
  });

  it("el mínimo NUNCA pide «este modelo»: lo que falta se suma por categoría × talla × familia (dos modelos negros sin M = 2)", () => {
    const a = talla({ productoId: "pa", referencia: "Polo A", talla: "M", pisoLibre: 0, almacenLibre: 0 });
    const b = talla({ productoId: "pb", referencia: "Polo B", talla: "M", colorCodigo: "GRI", color: "Gris", pisoLibre: 0, almacenLibre: 0 });
    const plan = planDelPiso(lectura([a, b], [venta(POLOS, "M", "neutro", 2)]));
    const fila = plan.seVendioRapidoYFalta.find((f) => f.clave === claveAtributo(POLOS, "t-M", "neutro"));
    expect(fila).toMatchObject({ huecos: 2, ventas: 2, disponible: 0, alcanceDias: 0, categoria: "Polos", talla: "M", familiaColor: "neutro" });
    // Y no hay ninguna fila por modelo: las llaves son de atributo.
    expect(plan.porAtributo.every((f) => !f.clave.includes("pa") && !f.clave.includes("pb"))).toBe(true);
  });

  it("una talla retirada no se cuelga aunque el piso esté vacío y haya atrás", () => {
    const m = talla({ talla: "M", pisoLibre: 0, almacenLibre: 3, retirada: true, vendidasAyer: 2 });
    expect(accion(planDelPiso(lectura([m])), m.varianteId)).toBe("mantener");
  });

  it("donde la sede no separa piso y almacén (Taller) no hay decisión ni lista", () => {
    const plan = planDelPiso(lectura([talla({ talla: "M", pisoLibre: 0, almacenLibre: 5 })], [], { separaPiso: false }));
    expect(plan.porTalla.size).toBe(0);
    expect(plan.listaDelDia).toEqual([]);
    expect(plan.enPausa).toBe(false);
  });
});

describe("planDelPiso — el piso sin cuadrar (ADR-0328, decisión 5)", () => {
  const tallas = () => [
    talla({ varianteId: "colgar", talla: "M", pisoLibre: 0, almacenLibre: 2 }),
    talla({ varianteId: "reponer", talla: "S", pisoLibre: 1, almacenLibre: 2, vendidasAyer: 2 }),
    talla({ varianteId: "atras", talla: "L", pisoLibre: 0, almacenLibre: 0 }),
    talla({ varianteId: "ok", talla: "L", productoId: "p2", pisoLibre: 2, almacenLibre: 2 }),
  ];
  it("sin cuadre, lo que manda a bajar queda en pausa; «Mantener» y «Sin stock atrás» siguen (el cuadre no los cambia)", () => {
    const plan = planDelPiso(lectura(tallas(), [], { cuadradoEn: null }));
    expect(plan.enPausa).toBe(true);
    expect(["colgar", "reponer", "atras", "ok"].map((id) => accion(plan, id))).toEqual(["pausa_sin_cuadre", "pausa_sin_cuadre", "sin_atras", "mantener"]);
    expect(plan.listaDelDia).toEqual([]);
  });
  it("con el piso cuadrado, la lista vuelve", () => {
    const plan = planDelPiso(lectura(tallas(), [], { cuadradoEn: "2026-10-03T20:10:00+00:00" }));
    expect(plan.enPausa).toBe(false);
    expect(plan.listaDelDia).toEqual(["reponer", "colgar"]);
  });
  it("no saber la fecha cuenta como NO cuadrado (falla cerrado): una lectura sin `cuadrado_en` pausa, no publica «Por colgar»", () => {
    // Es el caso de TRU hoy: 138 colgadas en el sistema contra 600–750 reales. Antes, sin fecha conocida no se pausaba nada y
    // salían «Por colgar» tallas que ya cuelgan (revisión adversarial, hallazgo alto; ADR-0328 decisión 5 lo había descartado).
    const json = { ubicacion_id: "tru", separa_piso: true, hoy: "2026-10-04", dias: 14, tallas: [], ventas: [], anotadas_recientes: [], curvas: [] };
    expect(lecturaDesdeJson(json)?.cuadradoEn).toBeNull();
    expect(planDelPiso(lecturaDesdeJson({ ...json, tallas: [{ variante_id: "x", talla: "M", piso_libre: 0, almacen_libre: 2 }] })!).enPausa).toBe(true);
  });
  it("la pausa la decide la lectura: no hay una opción para saltársela desde una pantalla", () => {
    // @ts-expect-error — `cuadre` ya no es una opción del motor: la fecha viaja en la misma lectura que el stock que pausa.
    expect(planDelPiso(lectura(tallas(), [], { cuadradoEn: null }), { cuadre: { sabido: false } }).enPausa).toBe(true);
  });
});

describe("planDelPiso — el orden de la lista del día", () => {
  it("primero lo vendido ayer y hoy; luego lo que el piso no tiene; luego el ritmo de su categoría × talla × familia; luego modelo, color y talla", () => {
    const tallas = [
      talla({ varianteId: "lento-colgar", referencia: "Polo B", productoId: "pb", talla: "S", familiaColor: "azul", pisoLibre: 0, almacenLibre: 1 }),
      talla({ varianteId: "rapido-colgar", referencia: "Polo C", productoId: "pc", talla: "M", pisoLibre: 0, almacenLibre: 1 }),
      talla({ varianteId: "vendida-ayer", referencia: "Polo Z", productoId: "pz", talla: "XL", pisoLibre: 0, almacenLibre: 1, vendidasAyer: 1 }),
      talla({ varianteId: "vendida-2", referencia: "Polo Y", productoId: "py", talla: "L", pisoLibre: 1, almacenLibre: 1, vendidasHoy: 2 }),
      talla({ varianteId: "a-empate", referencia: "Polo A", productoId: "pa", talla: "L", familiaColor: "azul", pisoLibre: 0, almacenLibre: 1 }),
      talla({ varianteId: "a-empate-s", referencia: "Polo A", productoId: "pa", talla: "S", familiaColor: "verde", pisoLibre: 0, almacenLibre: 1 }),
    ];
    const ventas = [venta(POLOS, "M", "neutro", 6, 1), venta(POLOS, "S", "azul", 1)];
    const plan = planDelPiso(lectura(tallas, ventas));
    expect(plan.listaDelDia).toEqual(["vendida-2", "vendida-ayer", "rapido-colgar", "lento-colgar", "a-empate-s", "a-empate"]);
    expect(plan.porTalla.get("rapido-colgar")?.ritmoAtributo).toBeCloseTo(7 / DIAS_VENTANA, 10);
  });

  it("es estable: la misma sede leída en otro orden da la misma lista", () => {
    const tallas = Array.from({ length: 40 }, (_, k) =>
      talla({ varianteId: `x${k}`, productoId: `p${k % 7}`, referencia: `Polo ${k % 7}`, talla: ["S", "M", "L", "XL"][k % 4], pisoLibre: 0, almacenLibre: 1, vendidasAyer: k % 3 === 0 ? 1 : 0 })
    );
    const ventas = [venta(POLOS, "M", "neutro", 3), venta(POLOS, "L", "neutro", 1, 2)];
    const a = planDelPiso(lectura(tallas, ventas)).listaDelDia;
    const b = planDelPiso(lectura([...tallas].reverse(), [...ventas].reverse())).listaDelDia;
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("planDelPiso — «se vendió rápido y falta» (la señal para el Taller)", () => {
  it("suma escaneadas y anotadas a mano, dice cuántas la respaldan, y el alcance en días de lo que hay", () => {
    const tallas = [
      talla({ talla: "M", pisoLibre: 1, almacenLibre: 1 }),
      talla({ talla: "M", productoId: "p2", referencia: "Polo Dos", pisoLibre: 0, almacenLibre: 1 }),
    ];
    // 7 ventas en 14 días (4 escaneadas + 3 anotadas) = 0,5 por día; hay 3 → 6 días: no alcanza para 14.
    const plan = planDelPiso(lectura(tallas, [venta(POLOS, "M", "neutro", 4, 3)]));
    expect(plan.seVendioRapidoYFalta).toEqual([
      expect.objectContaining({ ventas: 7, anotadas: 3, porDia: 0.5, disponible: 3, enPiso: 1, alcanceDias: 6, huecos: 0 }),
    ]);
  });

  it("lo que se vendió pero alcanza para la próxima ventana NO es señal", () => {
    const plan = planDelPiso(lectura([talla({ talla: "M", pisoLibre: 4, almacenLibre: 4 })], [venta(POLOS, "M", "neutro", 2)]));
    expect(plan.porAtributo[0].alcanceDias).toBe(56);
    expect(plan.seVendioRapidoYFalta).toEqual([]);
  });

  it("una venta anotada de algo que la sede ya no tiene es señal (disponible 0, alcance 0)", () => {
    const plan = planDelPiso(lectura([], [venta(JEANS, "30", "azul", 0, 2)]));
    expect(plan.seVendioRapidoYFalta).toEqual([expect.objectContaining({ categoria: "Jeans", talla: "30", ventas: 2, anotadas: 2, disponible: 0, alcanceDias: 0 })]);
  });

  it("de lo que más se vende a lo que menos, y una llave repetida en la lectura se suma (no se duplica)", () => {
    const plan = planDelPiso(lectura([], [venta(POLOS, "S", "neutro", 1), venta(POLOS, "M", "neutro", 2), venta(POLOS, "M", "neutro", 1, 1)]));
    expect(plan.seVendioRapidoYFalta.map((f) => [f.talla, f.ventas, f.anotadas])).toEqual([["M", 4, 1], ["S", 1, 0]]);
  });

  it("una venta sin talla o sin familia no se pierde: es su propia llave", () => {
    const plan = planDelPiso(lectura([], [venta(POLOS, null, null, 1)]));
    expect(plan.porAtributo.map((f) => f.clave)).toEqual([claveAtributo(POLOS, null, null)]);
  });
});

describe("planDelPiso — el reloj lento (capacidad y mix, opcionales)", () => {
  it("sin capacidad ni mix: se cuenta lo colgado, sin meta", () => {
    const plan = planDelPiso(lectura([talla({ talla: "M", pisoLibre: 3 }), talla({ talla: "S", pisoLibre: 2, categoriaId: JEANS })]));
    expect(plan.colgadas).toBe(5);
    expect(plan.capacidad).toBeNull();
    expect(plan.categorias.every((c) => c.meta === null && !c.sobreMeta)).toBe(true);
  });
  it("una categoría que llegó a su meta sigue colgando (piso lleno: entra una, sale una) y lo marca", () => {
    const lleno = talla({ varianteId: "lleno", talla: "M", pisoLibre: 0, almacenLibre: 2 });
    const tallas = [lleno, talla({ talla: "L", pisoLibre: 10, almacenLibre: 0 }), talla({ varianteId: "jean", categoriaId: JEANS, talla: "30", pisoLibre: 0, almacenLibre: 1 })];
    const plan = planDelPiso(lectura(tallas), { capacidad: 100, mix: new Map([[POLOS, 0.1], [JEANS, 0.2]]) });
    expect(plan.categorias.find((c) => c.categoriaId === POLOS)).toMatchObject({ colgadas: 10, meta: 10, sobreMeta: true });
    expect(accion(plan, "lleno")).toBe("por_colgar");
    expect(plan.porTalla.get("lleno")?.entraUnaSaleUna).toBe(true);
    expect(plan.porTalla.get("jean")?.entraUnaSaleUna).toBe(false);
  });
});

describe("paraColgarHoy — la lista del día por percha (lo que leen el Inicio y «Para hoy»)", () => {
  const tallas = [
    talla({ varianteId: "a-l", productoId: "pa", referencia: "Polo A", talla: "L", pisoLibre: 0, almacenLibre: 1 }),
    talla({ varianteId: "a-s", productoId: "pa", referencia: "Polo A", talla: "S", pisoLibre: 0, almacenLibre: 1 }),
    talla({ varianteId: "b-m", productoId: "pb", referencia: "Polo B", talla: "M", pisoLibre: 1, almacenLibre: 2, vendidasAyer: 2 }),
    talla({ varianteId: "c-m", productoId: "pc", referencia: "Polo C", talla: "M", pisoLibre: 3, almacenLibre: 2 }),
  ];
  it("agrupa por percha en el orden de la lista (lo vendido ayer primero) y deja cada percha con sus tallas en curva", () => {
    const l = lectura(tallas);
    const hoy = paraColgarHoy(planDelPiso(l), l);
    expect(hoy.enPausa).toBe(false);
    expect(hoy.tallas).toBe(3);
    expect(hoy.prendas.map((p) => [p.referencia, p.tallas.map((t) => `${t.talla}:${t.accion}`)])).toEqual([
      ["Polo B", ["M:por_reponer"]],
      ["Polo A", ["S:por_colgar", "L:por_colgar"]],
    ]);
  });
  it("con el piso sin cuadrar no lista nada para bajar, pero dice cuántas tallas esperan", () => {
    const l = lectura(tallas);
    const hoy = paraColgarHoy(planDelPiso({ ...l, cuadradoEn: null }), { ...l, cuadradoEn: null });
    expect(hoy.enPausa).toBe(true);
    expect(hoy.tallas).toBe(3);
    expect(hoy.prendas.flatMap((p) => p.tallas.map((t) => t.accion))).toEqual(["pausa_sin_cuadre", "pausa_sin_cuadre", "pausa_sin_cuadre"]);
  });
});

describe("lecturaDesdeJson — la respuesta de la base", () => {
  const json = {
    ubicacion_id: "tru",
    ubicacion_tipo: "tienda",
    separa_piso: true,
    hoy: "2026-10-04",
    desde: "2026-09-21",
    dias: 14,
    cuadrado_en: "2026-10-01T15:00:00+00:00",
    tallas: [
      {
        variante_id: "v1", producto_id: "p1", referencia: "Polo", categoria_id: POLOS, talla_id: "t-M", talla: "M", color_codigo: "NEG",
        color: "Negro", familia_color: "neutro", retirada: false, foto_url: null, piso_libre: 0, almacen_libre: 2, en_camino: 0,
        vendidas_hoy: 0, vendidas_ayer: 1, vendidas_14: 3,
      },
    ],
    ventas: [{ categoria_id: POLOS, talla_id: "t-M", talla: "M", familia_color: "neutro", escaneadas: 3, anotadas: 1 }],
    anotadas_recientes: [{ categoria_id: POLOS, talla_id: "t-XL", color_codigo: "NEG", hoy: 0, ayer: 1 }],
    curvas: [{ categoria_id: POLOS, categoria: "Polos", tallas: [{ talla_id: "t-S", talla: "S" }, { talla_id: "t-M", talla: "M" }] }],
  };
  it("traduce la forma de la base y el motor la usa tal cual", () => {
    const l = lecturaDesdeJson(json);
    expect(l).toMatchObject({ ubicacionId: "tru", separaPiso: true, cuadradoEn: "2026-10-01T15:00:00+00:00", hoy: "2026-10-04", dias: 14 });
    expect(l?.tallas[0]).toMatchObject({ varianteId: "v1", talla: "M", almacenLibre: 2, vendidasAyer: 1, familiaColor: "neutro" });
    expect(l?.curvas[0].tallas).toEqual(["S", "M"]);
    expect(l?.anotadasRecientes).toEqual([{ categoriaId: POLOS, tallaId: "t-XL", colorCodigo: "NEG", hoy: 0, ayer: 1 }]);
    expect(accion(planDelPiso(l!), "v1")).toBe("por_colgar");
  });
  it("NULL (sin la puerta) o una forma que no se entiende → null: «no se pudo leer», nunca «al día»", () => {
    expect(lecturaDesdeJson(null)).toBeNull();
    expect(lecturaDesdeJson([])).toBeNull();
    expect(lecturaDesdeJson({ ...json, tallas: null })).toBeNull();
    expect(lecturaDesdeJson({ ...json, anotadas_recientes: undefined })).toBeNull();
    expect(lecturaDesdeJson({ ...json, dias: 0 })).toBeNull();
    expect(lecturaDesdeJson({ ...json, tallas: [{ piso_libre: 1 }] })).toBeNull();
  });
});

describe("planDelPiso — lo anotado a mano hoy y ayer prende el reloj rápido (revisión adversarial; ADR-0328 decisión 2)", () => {
  // AQP: 169 de 170 ventas salieron anotadas «sin registrar». Una anotada no tiene prenda: el motor la cruza por categoría ×
  // talla × color EXACTO con las tallas de la sede, les pide 1 colgada y las pone primero, sin nombrar un modelo.
  const anotada = (talla: string, colorCodigo: string | null, ayer = 1, hoy = 0) => ({ categoriaId: POLOS, tallaId: `t-${talla}`, colorCodigo, hoy, ayer });
  const xlNegra = talla({ varianteId: "xl-neg", productoId: "pa", talla: "XL", colorCodigo: "NEG", pisoLibre: 0, almacenLibre: 2 });
  const xlNegraOtro = talla({ varianteId: "xl-neg-b", productoId: "pb", talla: "XL", colorCodigo: "NEG", pisoLibre: 0, almacenLibre: 1 });
  const xlRoja = talla({ varianteId: "xl-roj", productoId: "pa", talla: "XL", colorCodigo: "ROJ", color: "Rojo", familiaColor: "rojo", pisoLibre: 0, almacenLibre: 2 });
  const mSinVenta = talla({ varianteId: "m-neg", productoId: "pc", referencia: "Polo Aaa", talla: "M", colorCodigo: "NEG", pisoLibre: 0, almacenLibre: 2 });

  it("una XL negra anotada ayer pide colgar las XL negras de la sede (extremas: sin la anotada, «Mantener»); la XL roja no", () => {
    const sin = planDelPiso(lectura([xlNegra, xlNegraOtro, xlRoja]));
    expect(["xl-neg", "xl-neg-b", "xl-roj"].map((id) => accion(sin, id))).toEqual(["mantener", "mantener", "mantener"]);
    const con = planDelPiso(lectura([xlNegra, xlNegraOtro, xlRoja], [], { anotadasRecientes: [anotada("XL", "NEG")] }));
    expect(["xl-neg", "xl-neg-b", "xl-roj"].map((id) => accion(con, id))).toEqual(["por_colgar", "por_colgar", "mantener"]);
    expect(con.porTalla.get("xl-neg")).toMatchObject({ requisito: 1, anotadasRecientes: 1, vendidasRecientes: 0 });
  });
  it("pide 1 y no más, aunque se hayan anotado 3: no sabe qué modelo fue", () => {
    const plan = planDelPiso(lectura([{ ...xlNegra, pisoLibre: 1 }], [], { anotadasRecientes: [anotada("XL", "NEG", 2, 1)] }));
    expect(plan.porTalla.get("xl-neg")).toMatchObject({ accion: "mantener", requisito: 1, anotadasRecientes: 3 });
  });
  it("va PRIMERO en la lista del día, antes que una talla central por colgar sin ventas", () => {
    const plan = planDelPiso(lectura([mSinVenta, xlNegra], [], { anotadasRecientes: [anotada("XL", "NEG")] }));
    expect(plan.listaDelDia).toEqual(["xl-neg", "m-neg"]);
  });
  it("una anotada sin color (o sin talla) no se cruza con ninguna talla: no se sabe a cuál pertenece", () => {
    const plan = planDelPiso(lectura([xlNegra], [], { anotadasRecientes: [anotada("XL", null), { ...anotada("XL", "NEG"), tallaId: null }] }));
    expect(accion(plan, "xl-neg")).toBe("mantener");
  });
});
