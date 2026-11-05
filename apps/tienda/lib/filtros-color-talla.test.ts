import { describe, expect, it } from "vitest";
import {
  CODIGOS_DE_COLOR_CONOCIDOS,
  FAMILIAS_DE_COLOR,
  familiaDeColorDeLaTienda,
  type FamiliaDeColorId,
} from "@cayla-retail/shared/colores-de-la-tienda";
import {
  alCambiarDeNivel,
  alternar,
  clavesDeTalla,
  compararTallas,
  consultaConFiltros,
  contar,
  escribirElegido,
  etiquetaDeTalla,
  fraseDeTalla,
  hayElegido,
  huboSoltado,
  indexar,
  interpretarFiltros,
  leerElegido,
  limpiar,
  mensajeDeLoSoltado,
  muertas,
  NADA_ELEGIDO,
  opcionesDelNivel,
  parametrosDeFiltros,
  prendaPasa,
  sistemaDeTalla,
  UNICA,
  variantesQueCoinciden,
  type DatosDeFiltros,
  type Elegido,
  type Faceta,
} from "./filtros-color-talla";

// ---------------------------------------------------------------- Los colores: la tabla contra la base

// Una foto de la tabla de colores del ERP en producción (solo lectura, 2026-10-26): los 101 códigos ACTIVOS con su `familia_color` del ERP. Si un
// color nuevo se crea sin sumarlo a `colores-de-la-tienda.ts`, esta lista no lo ve (es una foto): por eso el respaldo por la familia del ERP.
const COLORES_ACTIVOS_DEL_ERP: Record<string, string> = Object.fromEntries(
  Object.entries({
    amarillo: "VAI AMM AML AMA MOS ACH GIR",
    azul: "CEL TUR AZP AZC AZD AZE AZI AME COB IND AZM AZU AZA AZN AZF HIB",
    metalico: "CHA PLA ORR DOR ORV PLV COE BRO",
    morado: "LAV LIL VIO MOR MAL ORQ MOA CIR BER GLI",
    naranja: "DUR SAL MAN NAR ALB AMB NQU",
    neutro: "BLA CRU PER NUD GRP GPI GRM GRI GRA NEG CAF FFF NEU PLR",
    rojo: "COR ROJ FRA CER VIN MSA RTO",
    rosado: "ROS PAL FUC RCH RPA RSA",
    tierra: "BEI ARN CAQ CAM MOK TOS TOP TER MAC MAR CHO",
    verde: "PIS VEL SAV VOL VEM VEA ESM VER VEB MEN MIU VHO VJA VEO VEP",
  }).flatMap(([familia, codigos]) => codigos.split(" ").map((c) => [c, familia])),
);

describe("las familias de color de la tienda", () => {
  it("son 13, con su nombre, en el orden de la paleta, y cada una con un círculo propio", () => {
    expect(FAMILIAS_DE_COLOR.map((f) => f.id)).toEqual([
      "negro", "blanco", "gris", "beige", "marron", "rosado", "rojo", "naranja", "amarillo", "verde", "celeste", "azul", "morado",
    ]);
    expect(new Set(FAMILIAS_DE_COLOR.map((f) => f.muestra)).size).toBe(13);
    for (const f of FAMILIAS_DE_COLOR) expect(f.muestra).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("los 101 colores activos del ERP tienen familia (ninguno queda sin poder elegirse) y la tabla no repite ninguno", () => {
    expect(Object.keys(COLORES_ACTIVOS_DEL_ERP)).toHaveLength(101);
    for (const [codigo, familiaErp] of Object.entries(COLORES_ACTIVOS_DEL_ERP)) {
      expect(familiaDeColorDeLaTienda(codigo, familiaErp), codigo).not.toBeNull();
    }
    expect(new Set(CODIGOS_DE_COLOR_CONOCIDOS).size).toBe(CODIGOS_DE_COLOR_CONOCIDOS.length);
    // Y la tabla no sabe de colores que ya no existen: cada código conocido está entre los activos.
    for (const codigo of CODIGOS_DE_COLOR_CONOCIDOS) expect(COLORES_ACTIVOS_DEL_ERP, codigo).toHaveProperty(codigo);
  });

  it("negro, blanco y gris ya no son uno solo «neutro», ni beige y marrón uno solo «tierra»", () => {
    expect(familiaDeColorDeLaTienda("NEG", "neutro")).toBe("negro");
    expect(familiaDeColorDeLaTienda("BLA", "neutro")).toBe("blanco");
    expect(familiaDeColorDeLaTienda("GRI", "neutro")).toBe("gris");
    expect(familiaDeColorDeLaTienda("BEI", "tierra")).toBe("beige");
    expect(familiaDeColorDeLaTienda("CHO", "tierra")).toBe("marron");
    expect(familiaDeColorDeLaTienda("CEL", "azul")).toBe("celeste");
    expect(familiaDeColorDeLaTienda("AZM", "azul")).toBe("azul");
  });

  it("un código nuevo cae según la familia del ERP; sin ella, o sin código, en ninguna", () => {
    expect(familiaDeColorDeLaTienda("ZZZ", "verde")).toBe("verde");
    expect(familiaDeColorDeLaTienda("ZZZ", "tierra")).toBe("marron");
    expect(familiaDeColorDeLaTienda("ZZZ", "neutro")).toBe("gris");
    expect(familiaDeColorDeLaTienda("ZZZ", "metalico")).toBe("amarillo");
    expect(familiaDeColorDeLaTienda("ZZZ", "no existe")).toBeNull();
    expect(familiaDeColorDeLaTienda("ZZZ", null)).toBeNull();
    expect(familiaDeColorDeLaTienda("ZZZ")).toBeNull();
    expect(familiaDeColorDeLaTienda(null, "verde")).toBeNull();
    expect(familiaDeColorDeLaTienda("", "verde")).toBeNull();
  });
});

// ---------------------------------------------------------------- Las tallas

describe("las tallas", () => {
  it("«Estándar» y «Única» son una sola opción; «S/M» cuenta como S y como M; las letras en mayúsculas; lo demás, tal cual", () => {
    expect(clavesDeTalla("Estándar")).toEqual([UNICA]);
    expect(clavesDeTalla("Estandar")).toEqual([UNICA]);
    expect(clavesDeTalla("Única")).toEqual([UNICA]);
    expect(clavesDeTalla("unica")).toEqual([UNICA]);
    expect(clavesDeTalla("S/M")).toEqual(["S", "M"]);
    expect(clavesDeTalla("s / m")).toEqual(["S", "M"]);
    expect(clavesDeTalla("xl")).toEqual(["XL"]);
    expect(clavesDeTalla("28")).toEqual(["28"]);
    expect(clavesDeTalla("Grande")).toEqual(["Grande"]);
    expect(clavesDeTalla("A/B")).toEqual(["A/B"]);
  });

  it("se agrupan en letras, cinturas (20 a 34), números, la única y lo demás", () => {
    expect(["XS", "S", "M", "L", "XL", "XXL"].map(sistemaDeTalla)).toEqual(Array(6).fill("letra"));
    expect(["26", "28", "30", "32", "34"].map(sistemaDeTalla)).toEqual(Array(5).fill("cintura"));
    expect(["35", "38", "42"].map(sistemaDeTalla)).toEqual(Array(3).fill("numero"));
    expect(sistemaDeTalla(UNICA)).toBe("unica");
    expect(sistemaDeTalla("Grande")).toBe("otra");
  });

  it("van en el orden de la tienda: XS a XXL, cinturas y números de menor a mayor, lo demás por nombre y la única al final", () => {
    const desordenadas = [UNICA, "34", "L", "Grande", "26", "XS", "38", "M", "XXL", "28", "S", "Pequeña"];
    expect([...desordenadas].sort(compararTallas)).toEqual(["XS", "S", "M", "L", "XXL", "26", "28", "34", "38", "Grande", "Pequeña", UNICA]);
  });

  it("la única se llama «Estándar / única»; las demás, como son", () => {
    expect(etiquetaDeTalla(UNICA)).toBe("Estándar / única");
    expect(etiquetaDeTalla("M")).toBe("M");
  });
});

// ---------------------------------------------------------------- La dirección

describe("la dirección", () => {
  it("lee las familias y las tallas, las deja en el orden fijo y no repite", () => {
    expect(leerElegido({ color: "morado,negro,negro,azul", talla: "XL,s,M,26,unica" })).toEqual({
      color: ["negro", "azul", "morado"],
      talla: ["S", "M", "XL", "26", UNICA],
    });
    expect(leerElegido({ color: ["negro", "blanco"], talla: ["M", "L"] })).toEqual({ color: ["negro"], talla: ["M"] }); // un valor repetido: el primero
  });

  it("no le cree a lo escrito a mano: lo que no es una familia se ignora, y nunca falla", () => {
    expect(leerElegido({})).toEqual(NADA_ELEGIDO);
    expect(leerElegido({ color: "zzz,  ,<script>,NEGRO", talla: "" })).toEqual({ color: ["negro"], talla: [] });
    expect(leerElegido({ color: ",".repeat(10), talla: "," })).toEqual(NADA_ELEGIDO);
    const largo = Array.from({ length: 500 }, (_, i) => `t${i}`).join(",");
    expect(leerElegido({ talla: largo }).talla.length).toBeLessThanOrEqual(24); // un abuso no crece sin tope
    expect(leerElegido({ talla: "x".repeat(200) }).talla).toEqual([]); // una talla de 200 letras no existe
  });

  it("escribe solo lo que hay, siempre en el mismo orden (una misma elección, una misma dirección)", () => {
    expect(escribirElegido(NADA_ELEGIDO)).toEqual({});
    expect(escribirElegido({ color: ["azul", "negro"], talla: ["XL", "M"] })).toEqual({ color: "negro,azul", talla: "M,XL" });
    expect(escribirElegido({ color: ["rojo"], talla: [] })).toEqual({ color: "rojo" });
    expect(escribirElegido({ color: [], talla: [UNICA, "28"] })).toEqual({ talla: "28,UNICA" });
  });

  it("lo escrito se vuelve a leer igual", () => {
    const e: Elegido = { color: ["negro", "celeste", "morado"], talla: ["S", "XL", "30", UNICA] };
    const escrito = escribirElegido(e);
    expect(leerElegido(escrito)).toEqual(e);
  });

  it("hayElegido y limpiar", () => {
    expect(hayElegido(NADA_ELEGIDO)).toBe(false);
    const e: Elegido = { color: ["negro"], talla: ["M"] };
    expect(hayElegido(e)).toBe(true);
    expect(limpiar(e)).toEqual(NADA_ELEGIDO);
    expect(limpiar(e, "color")).toEqual({ color: [], talla: ["M"] });
    expect(limpiar(e, "talla")).toEqual({ color: ["negro"], talla: [] });
  });
});

// ---------------------------------------------------------------- Lo que manda la base

describe("interpretarFiltros", () => {
  const P1 = "11111111-1111-4111-8111-111111111111";
  const P2 = "22222222-2222-4222-8222-222222222222";

  it("lee lo que responde la base: variantes (con o sin color), la tienda y los colores", () => {
    const d = interpretarFiltros({
      sede: "0cb726d8-758f-4483-9134-796c66e97a78",
      variantes: [[P1, "NEG", "M"], [P1, null, "Estándar"], [P2, "BEI", "S/M"]],
      colores: { NEG: "neutro", BEI: "tierra", ZZZ: null },
    });
    expect(d?.variantes).toEqual([
      { prenda: P1, color: "NEG", talla: "M" },
      { prenda: P1, color: null, talla: "Estándar" },
      { prenda: P2, color: "BEI", talla: "S/M" },
    ]);
    expect(d?.sede).toBe("0cb726d8-758f-4483-9134-796c66e97a78");
    expect(d?.colores).toEqual({ NEG: "neutro", BEI: "tierra", ZZZ: null });
  });

  it("una variante rota se salta sin tirar a las demás; una respuesta que no es lo esperado es null", () => {
    const d = interpretarFiltros({ sede: 7, variantes: [[P1, "NEG", "M"], [P1, 5, "M"], "x", null, [P1], [P1, "NEG", 3]], colores: [1, 2] });
    expect(d?.variantes).toEqual([{ prenda: P1, color: "NEG", talla: "M" }]);
    expect(d?.sede).toBeNull();
    expect(d?.colores).toEqual({});
    for (const mal of [null, undefined, 5, "texto", [], { sede: null }, { variantes: "no" }]) expect(interpretarFiltros(mal)).toBeNull();
    expect(interpretarFiltros({ variantes: [] })?.variantes).toEqual([]);
  });
});

// ---------------------------------------------------------------- Las reglas, contra un cálculo independiente

/** Un generador con semilla (sin azar de verdad: una falla se repite igual). */
function azar(semilla: number) {
  let s = semilla >>> 0;
  const siguiente = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  return { siguiente, elige: <T,>(a: readonly T[]): T => a[Math.floor(siguiente() * a.length)] };
}

// Códigos reales de varias familias (y dos que la tabla no conoce, con su familia del ERP, y una variante sin color).
const CODIGOS = ["NEG", "BLA", "CRU", "GRI", "BEI", "ARN", "CHO", "MOK", "ROS", "ROJ", "VIN", "NAR", "TER", "AMM", "VER", "CEL", "AZM", "AZD", "LIL", "ZZ1", "ZZ2"];
const ERP_DE_LOS_NUEVOS: Record<string, string | null> = { ZZ1: "verde", ZZ2: null };

type Tipo = { nombre: string; grupo: string; tallas: readonly string[] };
const TIPOS: readonly Tipo[] = [
  { nombre: "blusa", grupo: "blusas", tallas: ["S", "M", "L", "XL"] },
  { nombre: "blusa chica", grupo: "blusas", tallas: ["XS", "S", "M"] },
  { nombre: "blusa S/M", grupo: "blusas", tallas: ["S/M", "L"] },
  { nombre: "estándar", grupo: "blusas", tallas: ["Estándar"] },
  { nombre: "pantalón", grupo: "pantalones", tallas: ["26", "28", "30", "32", "34"] },
  { nombre: "falda", grupo: "pantalones", tallas: ["28", "30", "S", "M"] },
  { nombre: "bolso", grupo: "bolsos", tallas: ["Única"] },
  { nombre: "cinturón", grupo: "bolsos", tallas: ["Única", "Estándar"] },
  { nombre: "aretes", grupo: "bisuteria", tallas: ["Única"] },
  { nombre: "mezcla", grupo: "otros", tallas: ["M", "Estándar", "28"] },
];

function mundo(semilla: number, prendas = 160) {
  const { siguiente, elige } = azar(semilla);
  const variantes: { prenda: string; color: string | null; talla: string }[] = [];
  const grupoDe = new Map<string, string>();
  for (let i = 0; i < prendas; i++) {
    const id = `p${String(i).padStart(3, "0")}`;
    const tipo = elige(TIPOS);
    grupoDe.set(id, tipo.grupo);
    const sinColor = siguiente() < 0.06;
    const colores = sinColor ? [null] : Array.from({ length: 1 + Math.floor(siguiente() * 5) }, () => elige(CODIGOS));
    const hechas = new Set<string>();
    for (const color of colores) {
      for (const talla of tipo.tallas) {
        const llave = `${color}|${talla}`;
        if (hechas.has(llave) || siguiente() < 0.3) continue; // no todas las tallas de cada color hay
        hechas.add(llave);
        variantes.push({ prenda: id, color, talla });
      }
    }
    if (hechas.size === 0) variantes.push({ prenda: id, color: sinColor ? null : colores[0], talla: tipo.tallas[0] });
  }
  const datos: DatosDeFiltros = { sede: null, variantes, colores: ERP_DE_LOS_NUEVOS };
  const ids = [...grupoDe.keys()];
  const niveles: Record<string, string[]> = { todo: ids };
  for (const [id, g] of grupoDe) (niveles[g] ??= []).push(id);
  return { datos, indice: indexar(datos), niveles, ids };
}

const FAMILIAS = FAMILIAS_DE_COLOR.map((f) => f.id);

// El cálculo de al lado: variante por variante, sin ninguna de las funciones de la librería (salvo la tabla de familias, que se prueba aparte).
const clavesAparte = (talla: string): string[] => (/^(est[aá]ndar|[uú]nica)$/i.test(talla) ? [UNICA] : talla === "S/M" ? ["S", "M"] : [talla]);
function oraculo(datos: DatosDeFiltros, delNivel: readonly string[], color: readonly FamiliaDeColorId[], talla: readonly string[]): string[] {
  const nivel = new Set(delNivel);
  const pasan = new Set<string>();
  for (const v of datos.variantes) {
    if (!nivel.has(v.prenda)) continue;
    const familia = familiaDeColorDeLaTienda(v.color, v.color ? datos.colores[v.color] : null);
    const colorOk = color.length === 0 || (familia !== null && color.includes(familia));
    const tallaOk = talla.length === 0 || clavesAparte(v.talla).some((t) => talla.includes(t));
    if (colorOk && tallaOk) pasan.add(v.prenda);
  }
  return delNivel.filter((id) => pasan.has(id) || (color.length === 0 && talla.length === 0));
}
const quienesPasan = (m: ReturnType<typeof mundo>, nivel: readonly string[], e: Elegido) => nivel.filter((id) => prendaPasa(m.indice, id, e));

describe("los filtros de color y talla", () => {
  it("la unidad es la variante: negro en S y beige en M NO es «negro en M»", () => {
    const datos: DatosDeFiltros = {
      sede: null,
      variantes: [
        { prenda: "a", color: "NEG", talla: "S" }, { prenda: "a", color: "BEI", talla: "M" }, // negro en S y beige en M
        { prenda: "b", color: "NEG", talla: "M" }, // negro en M de verdad
        { prenda: "c", color: "BEI", talla: "S" },
      ],
      colores: {},
    };
    const indice = indexar(datos);
    const nivel = ["a", "b", "c"];
    const negroM: Elegido = { color: ["negro"], talla: ["M"] };
    expect(nivel.filter((id) => prendaPasa(indice, id, negroM))).toEqual(["b"]); // por separado saldrían a y b
    expect(nivel.filter((id) => prendaPasa(indice, id, { color: ["negro"], talla: [] }))).toEqual(["a", "b"]);
    expect(nivel.filter((id) => prendaPasa(indice, id, { color: [], talla: ["M"] }))).toEqual(["a", "b"]);
    expect(variantesQueCoinciden(indice, "b", negroM)).toEqual([{ codigo: "NEG", familia: "negro", tallas: ["M"] }]);
    expect(variantesQueCoinciden(indice, "a", negroM)).toEqual([]);
  });

  it("sin nada elegido pasan todas, hasta una sin variantes (la lista de hoy no la esconde)", () => {
    const indice = indexar({ sede: null, variantes: [{ prenda: "a", color: "NEG", talla: "M" }], colores: {} });
    expect(prendaPasa(indice, "a", NADA_ELEGIDO)).toBe(true);
    expect(prendaPasa(indice, "sin-variantes", NADA_ELEGIDO)).toBe(true);
    expect(prendaPasa(indice, "sin-variantes", { color: ["negro"], talla: [] })).toBe(false);
  });

  it("dentro de una faceta se suma y entre facetas se cruza", () => {
    const m = mundo(11);
    for (const e of [{ color: ["negro", "blanco"], talla: [] }, { color: ["negro"], talla: ["M", "S"] }, { color: ["rojo", "azul"], talla: ["28", "XL"] }] as Elegido[]) {
      expect(quienesPasan(m, m.ids, e)).toEqual(oraculo(m.datos, m.ids, e.color, e.talla));
    }
  });

  it("cada color × cada talla, en cada nivel, da lo mismo que el cálculo de al lado", () => {
    const m = mundo(21);
    const tallas = opcionesDelNivel(m.indice, m.ids).tallas;
    let conAlgo = 0;
    for (const [, nivel] of Object.entries(m.niveles)) {
      for (const f of FAMILIAS) {
        for (const t of tallas) {
          const e: Elegido = { color: [f], talla: [t] };
          const esperado = oraculo(m.datos, nivel, e.color, e.talla);
          if (esperado.length > 0) conAlgo++;
          expect(quienesPasan(m, nivel, e), `${f} × ${t}`).toEqual(esperado);
        }
      }
    }
    expect(conAlgo).toBeGreaterThan(20); // la prueba no es hueca: hay pares con prendas
  });

  it("los números de cada opción: cuentan lo demás elegido pero no su propia faceta", () => {
    const m = mundo(31);
    const tallas = opcionesDelNivel(m.indice, m.ids).tallas;
    for (const t of tallas) {
      const c = contar(m.indice, m.ids, { color: [], talla: [t] });
      for (const f of FAMILIAS) expect(c.color.get(f) ?? 0, `color ${f} con talla ${t}`).toBe(oraculo(m.datos, m.ids, [f], [t]).length);
    }
    for (const f of FAMILIAS) {
      const c = contar(m.indice, m.ids, { color: [f], talla: [] });
      for (const t of tallas) expect(c.talla.get(t) ?? 0, `talla ${t} con color ${f}`).toBe(oraculo(m.datos, m.ids, [f], [t]).length);
    }
    // Con una opción ya elegida en la MISMA faceta, su número no la mira: se ve cuánto da cada una por sí sola.
    const c = contar(m.indice, m.ids, { color: ["negro"], talla: [] });
    expect(c.color.get("blanco") ?? 0).toBe(oraculo(m.datos, m.ids, ["blanco"], []).length);
    expect(c.total).toBe(oraculo(m.datos, m.ids, ["negro"], []).length);
  });

  it("las opciones de un nivel: las familias que hay (en el orden de la paleta), las tallas que hay y si se pide talla", () => {
    const m = mundo(41);
    const todo = opcionesDelNivel(m.indice, m.niveles.todo);
    expect(todo.familias.map((f) => f.id)).toEqual(FAMILIAS.filter((f) => todo.familias.some((x) => x.id === f)));
    expect(todo.tallas).toEqual([...todo.tallas].sort(compararTallas));
    expect(todo.tallaRelevante).toBe(true);
    // Donde solo hay «Estándar / única» no se pide talla.
    for (const g of ["bolsos", "bisuteria"]) {
      const o = opcionesDelNivel(m.indice, m.niveles[g]);
      expect(o.tallaRelevante, g).toBe(false);
      expect(o.tallas.every((t) => t === UNICA), g).toBe(true);
    }
    expect(opcionesDelNivel(m.indice, m.niveles.blusas).tallaRelevante).toBe(true);
    expect(opcionesDelNivel(m.indice, []).familias).toEqual([]);
  });

  it("una opción que daría 0 no se puede elegir; la que da, sí, y se quita con un toque", () => {
    const m = mundo(51);
    const e0 = NADA_ELEGIDO;
    const c = contar(m.indice, m.ids, e0);
    for (const f of FAMILIAS) {
      const r = alternar(m.indice, m.ids, e0, "color", f);
      expect(r.hecho, f).toBe((c.color.get(f) ?? 0) > 0);
      if (!r.hecho) expect(r.elegido).toEqual(e0);
    }
    const r = alternar(m.indice, m.ids, e0, "color", "negro");
    expect(r.hecho).toBe(true);
    expect(alternar(m.indice, m.ids, r.elegido, "color", "negro")).toMatchObject({ hecho: true, elegido: e0 });
  });

  it("donde no se pide talla no se puede elegir ninguna (ni «Estándar / única», que sí existe ahí)", () => {
    const m = mundo(61);
    expect(alternar(m.indice, m.niveles.bolsos, NADA_ELEGIDO, "talla", UNICA).hecho).toBe(false);
    expect(alternar(m.indice, m.niveles.bolsos, NADA_ELEGIDO, "talla", "M").hecho).toBe(false);
    expect(alternar(m.indice, m.niveles.blusas, NADA_ELEGIDO, "talla", "M").hecho).toBe(true);
  });

  it("al cambiar de nivel se suelta lo que ahí no existe, y se dice qué", () => {
    const m = mundo(71);
    const e: Elegido = { color: ["negro"], talla: ["M"] };
    const r = alCambiarDeNivel(m.indice, m.niveles.bolsos, e);
    expect(r.elegido.talla).toEqual([]); // no hay M entre los bolsos
    expect(r.soltado.talla).toEqual(["M"]);
    expect(huboSoltado(r.soltado)).toBe(true);
    expect(quienesPasan(m, m.niveles.bolsos, r.elegido).length).toBeGreaterThan(0); // y la lista no queda vacía
    // Un nivel donde todo existe no suelta nada.
    const igual = alCambiarDeNivel(m.indice, m.niveles.todo, { color: ["negro"], talla: [] });
    expect(igual.elegido).toEqual({ color: ["negro"], talla: [] });
    expect(huboSoltado(igual.soltado)).toBe(false);
  });

  it("lo que no existe en el nivel nuevo se suelta aunque la lista no se vacíe (no queda como una opción muerta)", () => {
    const datos: DatosDeFiltros = {
      sede: null,
      variantes: [
        { prenda: "a", color: "NEG", talla: "S" }, { prenda: "a", color: "NEG", talla: "XL" }, // el nivel de origen: negro, XL
        { prenda: "b", color: "BEI", talla: "S" }, { prenda: "b", color: "BEI", talla: "M" }, { prenda: "b", color: "BEI", talla: "L" }, // el nuevo: beige, S M L
      ],
      colores: {},
    };
    const indice = indexar(datos);
    const r = alCambiarDeNivel(indice, ["b"], { color: ["negro", "beige"], talla: ["XL", "M"] });
    expect(r.elegido).toEqual({ color: ["beige"], talla: ["M"] }); // el negro y la XL no existen en «b»; el beige y la M sí
    expect(r.soltado).toEqual({ color: ["negro"], talla: ["XL"] });
    expect(contar(indice, ["b"], r.elegido).total).toBe(1);
  });

  it("«Estándar / única» tampoco sobrevive a un nivel donde no se pide talla", () => {
    const m = mundo(81);
    for (const g of ["bolsos", "bisuteria"]) {
      const r = alCambiarDeNivel(m.indice, m.niveles[g], { color: [], talla: [UNICA] });
      expect(r.elegido.talla, g).toEqual([]);
      expect(r.soltado.talla, g).toEqual([UNICA]);
    }
    expect(alCambiarDeNivel(m.indice, m.niveles.blusas, { color: [], talla: [UNICA] }).elegido.talla).toEqual([UNICA]);
  });

  it("una opción elegida puede quedar muerta, y la lista sigue sin vaciarse", () => {
    const datos: DatosDeFiltros = {
      sede: null,
      variantes: [
        { prenda: "a", color: "NEG", talla: "M" }, { prenda: "a", color: "NEG", talla: "XL" },
        { prenda: "b", color: "BEI", talla: "M" }, { prenda: "c", color: "LIL", talla: "S" },
      ],
      colores: {},
    };
    const indice = indexar(datos);
    const nivel = ["a", "b", "c"];
    // Negro y morado (lila), y luego XL: solo el negro tiene XL, el morado queda muerto.
    const colores: Elegido = { color: ["negro", "morado"], talla: [] };
    const conXL = alternar(indice, nivel, colores, "talla", "XL");
    expect(conXL.hecho).toBe(true);
    expect(muertas(indice, nivel, conXL.elegido)).toEqual({ color: ["morado"], talla: [] });
    expect(contar(indice, nivel, conXL.elegido).total).toBe(1);
    // Quitar el negro (la última viva) dejaría solo el morado muerto: se suelta también, y se dice.
    const sinNegro = alternar(indice, nivel, conXL.elegido, "color", "negro");
    expect(sinNegro.hecho).toBe(true);
    expect(sinNegro.elegido.color).toEqual([]);
    expect(sinNegro.soltado.color).toEqual(["morado"]);
    expect(contar(indice, nivel, sinNegro.elegido).total).toBeGreaterThan(0);
  });

  it("caminata al azar (4.000 toques): nunca una lista vacía, los números siempre coinciden y la dirección vuelve igual", { timeout: 30_000 }, () => {
    for (const semilla of [101, 202]) {
      const m = mundo(semilla, 120);
      const { siguiente, elige } = azar(semilla * 7);
      const nombres = Object.keys(m.niveles);
      let nivel = "todo";
      let e: Elegido = NADA_ELEGIDO;
      let rechazos = 0;
      let soltados = 0;
      let muertasVistas = 0;
      const todasLasTallas = opcionesDelNivel(m.indice, m.ids).tallas;
      for (let i = 0; i < 2000; i++) {
        const r = siguiente();
        if (r < 0.4) {
          const t = elige(todasLasTallas);
          const c = alternar(m.indice, m.niveles[nivel], e, "talla", t);
          if (!c.hecho) rechazos++;
          e = c.elegido;
        } else if (r < 0.8) {
          const f = elige(FAMILIAS);
          const c = alternar(m.indice, m.niveles[nivel], e, "color", f);
          if (!c.hecho) rechazos++;
          e = c.elegido;
        } else if (r < 0.93) {
          nivel = elige(nombres);
          const c = alCambiarDeNivel(m.indice, m.niveles[nivel], e);
          if (huboSoltado(c.soltado)) soltados++;
          e = c.elegido;
          // En el nivel nuevo, todo lo elegido existe (lo que no, se soltó y se dijo).
          const hay = opcionesDelNivel(m.indice, m.niveles[nivel]);
          for (const f of e.color) expect(hay.familias.some((x) => x.id === f), `paso ${i}: ${f} no existe en ${nivel}`).toBe(true);
          for (const t of e.talla) expect(hay.tallas, `paso ${i}: ${t} no existe en ${nivel}`).toContain(t);
        } else {
          e = limpiar(e, elige<Faceta | undefined>(["color", "talla", undefined]));
        }
        const delNivel = m.niveles[nivel];
        const c = contar(m.indice, delNivel, e);
        const quienes = quienesPasan(m, delNivel, e);
        expect(quienes.length, `paso ${i}: lista vacía con ${JSON.stringify(e)} en ${nivel}`).toBeGreaterThan(0);
        expect(c.total, `paso ${i}`).toBe(quienes.length);
        expect(quienes, `paso ${i}`).toEqual(oraculo(m.datos, delNivel, e.color, e.talla));
        const mu = muertas(m.indice, delNivel, e);
        muertasVistas += mu.color.length + mu.talla.length;
        if (e.color.length > 0) expect(mu.color.length, `paso ${i}: todos los colores muertos`).toBeLessThan(e.color.length);
        if (e.talla.length > 0) expect(mu.talla.length, `paso ${i}: todas las tallas muertas`).toBeLessThan(e.talla.length);
        if (!opcionesDelNivel(m.indice, delNivel).tallaRelevante) expect(e.talla, `paso ${i}: talla elegida donde no se pide`).toEqual([]);
        const vuelta = alCambiarDeNivel(m.indice, delNivel, leerElegido(escribirElegido(e)));
        expect(vuelta.elegido, `paso ${i}: la dirección no vuelve igual`).toEqual(e);
      }
      expect(rechazos).toBeGreaterThan(50); // se tocaron muchas opciones apagadas
      expect(soltados).toBeGreaterThan(10);
      expect(muertasVistas).toBeGreaterThan(10); // se vieron opciones muertas: la regla se ejercitó
    }
  });

  it("una dirección escrita a mano nunca deja la lista vacía: se lleva al nivel y se suelta lo imposible", () => {
    const m = mundo(91);
    const raras = [
      { color: "negro,blanco,rojo,azul", talla: "XXL,34,UNICA,XS" },
      { color: "morado", talla: "XL" },
      { color: "zzz", talla: "99" },
      { talla: "M,L,28" },
    ];
    for (const sp of raras) {
      for (const nivel of Object.keys(m.niveles)) {
        const r = alCambiarDeNivel(m.indice, m.niveles[nivel], leerElegido(sp));
        expect(quienesPasan(m, m.niveles[nivel], r.elegido).length, `${JSON.stringify(sp)} en ${nivel}`).toBeGreaterThan(0);
      }
    }
  });

  it("corregir una dirección es estable: lo corregido, escrito y vuelto a leer, ya no cambia (la página no puede entrar en un bucle de redirecciones)", () => {
    const m = mundo(92);
    const direcciones = [
      { color: "negro,blanco,rojo,azul", talla: "XXL,34,UNICA,XS" },
      { color: "morado", talla: "XL" },
      { color: "zzz", talla: "99" },
      { talla: "M,L,28" },
      { color: "gris,negro,gris", talla: "M,S/M,S" },
    ];
    for (const sp of direcciones) {
      for (const nivel of Object.keys(m.niveles)) {
        const una = alCambiarDeNivel(m.indice, m.niveles[nivel], leerElegido(sp)).elegido;
        const vuelta = leerElegido(escribirElegido(una));
        expect(vuelta, `${JSON.stringify(sp)} en ${nivel}: lo escrito se lee igual`).toEqual(una);
        const dos = alCambiarDeNivel(m.indice, m.niveles[nivel], vuelta);
        expect(dos.elegido, `${JSON.stringify(sp)} en ${nivel}: corregir lo corregido no cambia nada`).toEqual(una);
        expect(huboSoltado(dos.soltado)).toBe(false);
      }
    }
  });
});

describe("la dirección que escribe el panel", () => {
  it("las partes llevan las comas a la vista, en el orden fijo, y solo lo que hay", () => {
    expect(parametrosDeFiltros(NADA_ELEGIDO)).toEqual([]);
    expect(parametrosDeFiltros({ color: ["blanco", "negro"], talla: ["UNICA", "M", "S"] })).toEqual(["color=negro,blanco", "talla=S,M,UNICA"]);
    expect(parametrosDeFiltros({ color: [], talla: ["Talla 38", "S"] })).toEqual(["talla=S,Talla%2038"]);
  });

  it("cambiar lo elegido deja todo lo demás de la dirección y suelta la página (la lista filtrada tiene otras prendas)", () => {
    expect(consultaConFiltros("sede=trujillo&categoria=FAL&orden=precio-asc&pagina=3", { color: ["negro"], talla: ["M"] })).toBe(
      "sede=trujillo&categoria=FAL&orden=precio-asc&color=negro&talla=M",
    );
    // Reemplaza lo que había (también lo repetido o escrito a mano) y, sin nada elegido, lo quita.
    expect(consultaConFiltros("sede=trujillo&color=zzz&color=rojo&talla=XL&pagina=2", { color: ["azul"], talla: [] })).toBe("sede=trujillo&color=azul");
    expect(consultaConFiltros("sede=trujillo&color=negro&talla=M", NADA_ELEGIDO)).toBe("sede=trujillo");
    expect(consultaConFiltros("", NADA_ELEGIDO)).toBe("");
    // Lo que se escribe se vuelve a leer igual.
    const e: Elegido = { color: ["negro", "blanco"], talla: ["S", "M"] };
    const q = new URLSearchParams(consultaConFiltros("sede=trujillo", e));
    expect(leerElegido({ color: q.get("color") ?? undefined, talla: q.get("talla") ?? undefined })).toEqual(e);
  });

  it("la talla en una frase", () => {
    expect(fraseDeTalla("M")).toBe("talla M");
    expect(fraseDeTalla(UNICA)).toBe("talla estándar / única");
  });
});

describe("lo que se le dice a quien cambia de nivel y pierde algo", () => {
  const indice = indexar({
    sede: null,
    variantes: [
      { prenda: "x", color: "NEG", talla: "M" }, // un negro, pero solo en M
      { prenda: "y", color: "BEI", talla: "S" }, // un beige, pero solo en S
      { prenda: "z", color: "NEG", talla: "Única" },
    ],
    colores: {},
  });

  it("si lo soltado no existe en el nivel nuevo, lo dice con su nombre", () => {
    expect(mensajeDeLoSoltado(indice, ["z"], { color: [], talla: ["M"] }, "Bolsos/Cinturones")).toBe("En Bolsos/Cinturones no hay talla M: quitamos esa talla.");
    expect(mensajeDeLoSoltado(indice, ["z"], { color: ["rojo"], talla: ["M", "XL"] }, "Bolsos")).toBe(
      "En Bolsos no hay Rojo y vino, talla M ni talla XL: quitamos ese color y esas tallas.",
    );
    expect(mensajeDeLoSoltado(indice, ["x"], { color: ["azul", "verde"], talla: [] }, null)).toBe("En esta lista no hay Azul ni Verde: quitamos esos colores.");
  });

  it("si existe pero ninguna prenda junta lo elegido, no dice que no hay", () => {
    // Negro y S: hay negro (en M) y hay S (en beige), pero ninguna prenda tiene negro en S.
    expect(mensajeDeLoSoltado(indice, ["x", "y"], { color: [], talla: ["S"] }, "Faldas")).toBe("Ninguna prenda reúne todo lo que elegiste: quitamos esa talla.");
  });

  it("si no se soltó nada, no hay nada que decir", () => {
    expect(mensajeDeLoSoltado(indice, ["x"], { color: [], talla: [] }, "Faldas")).toBe("");
  });
});
