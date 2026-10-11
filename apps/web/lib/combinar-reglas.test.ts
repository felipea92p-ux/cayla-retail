import { describe, expect, it } from "vitest";
import type { ColorConFicha } from "./ficha-del-color";
import {
  CATEGORIAS_LOOK,
  PAREJAS,
  categoriasQueCombinan,
  claveAnotada,
  conArticuloDefinido,
  dichoDe,
  fraseCombina,
  fraseDelColor,
  fraseDelPapel,
  indiceDeColores,
  motivoDeColor,
  papelDe,
  sugerirCombina,
  tarjetasDesdeVariantes,
  type Papel,
  type TarjetaLook,
} from "./combinar-reglas";

/** Las 45 categorías ACTIVAS de producción el 2026-10-10 (select de solo lectura) y las 5 inactivas con prefijo. Si entra una nueva
 *  desde Catálogo ▸ Categorías, nace muda hasta que alguien la sume aquí: esta lista es la que Felipe revisó. */
const PREFIJOS_PRODUCCION = [
  "ACC", "CAR", "CIN", "GOR", "LSO", "MOC", "BUF", "REL", "RIN", "MAQ", "ANL", "ARE", "COL", "PUL", "BAI", "BOT", "BOI", "MSN", "SAN", "ZAP", "ZFO",
  "ABR", "BLZ", "BOD", "CMS", "CAP", "CAS", "CHA", "CMP", "CON", "COR", "ENT", "FAL", "JEA", "PAN", "SUD", "POL", "LEN", "SHO", "TOP", "VES",
  "UTC", "LAP", "LIB", "UOF",
  "BUA", "PAS", "BLU", "BFN", "TBA",
];
const PAPELES: Papel[] = ["superior", "inferior", "entero", "abrigo", "calzado", "bolso", "accesorio", "bisuteria", "intimo", "ninguno"];

function color(codigo: string, nombre: string, combinaCon: string[] = [], descripcion: string | null = "Una frase."): ColorConFicha {
  return { codigo, nombre, hex: "#000000", familiaColor: "neutro", tipo: "solido", descripcion, combinaCon };
}

// Un vocabulario chico con la forma del real: Blanco en casi todas las listas, Marrón al que nadie lista pero que lista a Beige,
// Crema sin ficha.
const COLORES: ColorConFicha[] = [
  color("BEI", "Beige", ["BLA", "NEG", "AZM", "CHO", "VOL", "TER"]),
  color("BLA", "Blanco", ["NEG", "AZM", "CAM"]),
  color("NEG", "Negro", ["BLA", "CRU", "ROJ"]),
  color("AZM", "Azul marino", ["BLA", "CRU", "CAM"]),
  color("CHO", "Chocolate", ["CRU", "BEI", "BLA"]),
  color("VOL", "Verde oliva", ["CRU", "BLA", "CAM"]),
  color("TER", "Terracota", ["CRU", "BLA", "VOL"]),
  color("CRU", "Crudo", ["CAM", "AZM", "NEG"]),
  color("CAM", "Camel", ["BLA", "NEG", "AZM"]),
  color("ROJ", "Rojo", ["BLA", "NEG"]),
  color("MAR", "Marrón", ["CRU", "BEI"]),
  color("FFF", "Crema", [], null),
];
const INDICE = indiceDeColores(COLORES);
const NOMBRES = new Map(COLORES.map((c) => [c.codigo, c.nombre]));
const nombreDeColor = (c: string) => NOMBRES.get(c) ?? c;

let n = 0;
function tarjeta(prefijo: string, colorCodigo: string | null, piso: number, extra: Partial<TarjetaLook> = {}): TarjetaLook {
  n += 1;
  return {
    productoId: `p${n}`,
    referencia: `${dichoDe(prefijo) ?? prefijo} ${n}`,
    categoriaPrefijo: prefijo,
    colorCodigo,
    colorNombre: colorCodigo ? nombreDeColor(colorCodigo) : null,
    colorHex: null,
    fotoUrl: null,
    tallas: [{ varianteId: `v${n}`, talla: "M", stockAqui: piso }],
    ...extra,
  };
}

describe("el papel de cada categoría", () => {
  it("toda categoría de producción tiene papel y forma de decirse; ninguna se adivina por el nombre", () => {
    for (const p of PREFIJOS_PRODUCCION) {
      const fila = CATEGORIAS_LOOK[p];
      expect(fila, `falta el prefijo ${p}`).toBeDefined();
      expect(PAPELES).toContain(fila.papel);
      expect(fila.dicho.trim().length).toBeGreaterThan(2);
      // Lo que se sugiere se dice con artículo («un polo», «unas botas»); lo mudo no hace falta.
      if (fila.papel !== "ninguno" && fila.papel !== "intimo") expect(fila.dicho).toMatch(/^(un|una|unos|unas) /);
    }
    // Y al revés: nada en la tabla que producción no tenga (una fila huérfana es un prefijo mal escrito).
    for (const p of Object.keys(CATEGORIAS_LOOK)) expect(PREFIJOS_PRODUCCION, `prefijo desconocido ${p}`).toContain(p);
  });

  it("un prefijo desconocido o vacío no tiene papel: la categoría nueva nace muda", () => {
    expect(papelDe("ZZZ")).toBe("ninguno");
    expect(papelDe(null)).toBe("ninguno");
    expect(papelDe(" pol ")).toBe("superior");
    expect(dichoDe("ZZZ")).toBeNull();
  });

  it("las parejas cubren todos los papeles, nunca el propio, y lo mudo no tiene parejas", () => {
    for (const papel of PAPELES) {
      expect(PAREJAS[papel]).toBeDefined();
      expect(PAREJAS[papel]).not.toContain(papel);
      for (const pareja of PAREJAS[papel]) expect(PAPELES).toContain(pareja);
    }
    expect(PAREJAS.intimo).toEqual([]);
    expect(PAREJAS.ninguno).toEqual([]);
    // La decisión de Felipe (2026-10-10): a un polo le falta primero un pantalón y después un bolso; bolso y bisutería anclan.
    expect(PAREJAS.superior.slice(0, 2)).toEqual(["inferior", "bolso"]);
    expect(PAREJAS.bolso.length).toBeGreaterThan(0);
    expect(PAREJAS.bisuteria.length).toBeGreaterThan(0);
  });
});

describe("indiceDeColores", () => {
  it("lee las fichas en los dos sentidos y cuenta en cuántas listas aparece cada color", () => {
    expect(INDICE.salida.get("BEI")).toEqual(["BLA", "NEG", "AZM", "CHO", "VOL", "TER"]);
    expect([...(INDICE.entrada.get("BEI") ?? [])].sort()).toEqual(["CHO", "MAR"]);
    expect(INDICE.df.get("BLA")).toBe(8);
    expect(INDICE.df.get("MAR")).toBeUndefined();
    expect(INDICE.conFicha.has("BEI")).toBe(true);
    expect(INDICE.conFicha.has("FFF")).toBe(false);
  });

  it("omite el propio código, los repetidos y los que no están en el vocabulario", () => {
    const i = indiceDeColores([color("AAA", "A", ["AAA", "BBB", "BBB", "ZZZ"]), color("BBB", "B", [])]);
    expect(i.salida.get("AAA")).toEqual(["BBB"]);
    expect(i.df.get("ZZZ")).toBeUndefined();
  });
});

describe("motivoDeColor", () => {
  it("directa, inversa, tono sobre tono con ficha; nada sin ficha ni sin relación", () => {
    expect(motivoDeColor("BEI", "CHO", INDICE, true)).toBe("directa");
    expect(motivoDeColor("BEI", "MAR", INDICE, true)).toBe("inversa");
    expect(motivoDeColor("BEI", "BEI", INDICE, true)).toBe("mismo");
    expect(motivoDeColor("BEI", "BEI", INDICE, false)).toBeNull();
    expect(motivoDeColor("FFF", "FFF", INDICE, true)).toBeNull();
    expect(motivoDeColor("BEI", "ROJ", INDICE, true)).toBeNull();
    expect(motivoDeColor("BEI", null, INDICE, true)).toBeNull();
  });
});

describe("sugerirCombina", () => {
  const ancla = { productoId: "polo-beige", categoriaPrefijo: "POL", colorCodigo: "BEI" };

  it("una por papel en el orden de las parejas, sin repetir color, y el color raro antes que el de siempre", () => {
    const tarjetas = [
      tarjeta("PAN", "BLA", 3), // inferior, Blanco: df alto
      tarjeta("PAN", "CHO", 1), // inferior, Chocolate: df bajo → primero
      tarjeta("CAR", "CHO", 2), // bolso, Chocolate: repite color → se salta
      tarjeta("CAR", "AZM", 1), // bolso, Azul marino → la del bolso
      tarjeta("CAS", "MAR", 1), // abrigo, Marrón: inversa (Marrón lista a Beige)
      tarjeta("ANL", "NEG", 4), // bisutería: ya hay 3
    ];
    const s = sugerirCombina(ancla, tarjetas, INDICE, { nombreDeColor, sede: "TRU" });
    expect(s.map((x) => [x.papel, x.tarjeta.colorCodigo, x.motivo])).toEqual([
      ["inferior", "CHO", "directa"],
      ["bolso", "AZM", "directa"],
      ["abrigo", "MAR", "inversa"],
    ]);
    expect(s[0].porQue).toEqual(["Un pantalón va abajo del polo", "El chocolate combina con el beige"]);
    expect(s[2].porQue).toEqual(["Una casaca va encima del polo", "El marrón combina con el beige"]);
  });

  it("las cuatro puertas: sin piso, mismo papel, misma prenda, ya en el ticket, anotada sin registrar, color sin relación", () => {
    const enTicket = tarjeta("PAN", "CHO", 2);
    const tarjetas = [
      tarjeta("PAN", "AZM", 0), // sin piso
      tarjeta("POL", "NEG", 2), // mismo papel (sustituto)
      tarjeta("PAN", "NEG", 2, { productoId: "polo-beige" }), // la misma prenda
      enTicket, // ya en el ticket
      tarjeta("PAN", "VOL", 2), // anotada como sin registrar
      tarjeta("PAN", "ROJ", 2), // Rojo: ni directa, ni inversa, ni mismo
      tarjeta("VES", "CHO", 2), // entero no es pareja de superior
      tarjeta("MAQ", "CHO", 2), // sin papel
    ];
    const s = sugerirCombina(ancla, tarjetas, INDICE, {
      enTicket: new Set([enTicket.productoId]),
      anotadosEnTicket: new Set([claveAnotada("PAN", "VOL")]),
    });
    expect(s).toEqual([]);
  });

  it("el tono sobre tono entra solo con ficha, y se puede apagar", () => {
    const tarjetas = [tarjeta("PAN", "BEI", 2)];
    expect(sugerirCombina(ancla, tarjetas, INDICE).map((x) => x.motivo)).toEqual(["mismo"]);
    expect(sugerirCombina(ancla, tarjetas, INDICE, { permitirMismoColor: false })).toEqual([]);
    const crema = { productoId: "acc-crema", categoriaPrefijo: "ACC", colorCodigo: "FFF" };
    expect(sugerirCombina(crema, [tarjeta("POL", "FFF", 2)], INDICE)).toEqual([]);
  });

  it("una prenda que no habla no sugiere nada: sin papel, íntimo, sin color, color sin ficha", () => {
    const tarjetas = [tarjeta("PAN", "CHO", 2)];
    expect(sugerirCombina({ productoId: null, categoriaPrefijo: "LIB", colorCodigo: "BEI" }, tarjetas, INDICE)).toEqual([]);
    expect(sugerirCombina({ productoId: null, categoriaPrefijo: "LEN", colorCodigo: "BEI" }, tarjetas, INDICE)).toEqual([]);
    expect(sugerirCombina({ productoId: null, categoriaPrefijo: "POL", colorCodigo: null }, tarjetas, INDICE)).toEqual([]);
    expect(sugerirCombina({ productoId: null, categoriaPrefijo: "POL", colorCodigo: "FFF" }, tarjetas, INDICE)).toEqual([]);
  });

  it("una «Prenda sin registrar» anotada como polo beige ancla igual que una real", () => {
    const anotada = { productoId: null, categoriaPrefijo: "POL", colorCodigo: "BEI" };
    expect(sugerirCombina(anotada, [tarjeta("PAN", "CHO", 1)], INDICE)).toHaveLength(1);
  });

  it("nunca rellena un puesto con otra del mismo papel: con solo pantalones sale una tarjeta", () => {
    const tarjetas = [tarjeta("PAN", "CHO", 1), tarjeta("PAN", "AZM", 1), tarjeta("PAN", "NEG", 1)];
    expect(sugerirCombina(ancla, tarjetas, INDICE)).toHaveLength(1);
  });

  it("respeta el tope y desempata por unidades y después por referencia, sin azar", () => {
    const a = tarjeta("PAN", "CHO", 1, { referencia: "Pantalón Zeta" });
    const b = tarjeta("PAN", "CHO", 1, { referencia: "Pantalón Alfa" });
    const c = tarjeta("PAN", "CHO", 3, { referencia: "Pantalón Omega" });
    const s1 = sugerirCombina(ancla, [a, b, c], INDICE, { max: 1 });
    expect(s1.map((x) => x.tarjeta.referencia)).toEqual(["Pantalón Omega"]);
    const s2 = sugerirCombina(ancla, [a, b], INDICE, { max: 1 });
    expect(s2.map((x) => x.tarjeta.referencia)).toEqual(["Pantalón Alfa"]);
    expect(JSON.stringify(sugerirCombina(ancla, [a, b, c], INDICE))).toBe(JSON.stringify(sugerirCombina(ancla, [c, b, a], INDICE)));
  });

  it("un bolso en el ticket sugiere prendas (bolso y bisutería anclan)", () => {
    const bolso = { productoId: "cartera", categoriaPrefijo: "CAR", colorCodigo: "BEI" };
    const s = sugerirCombina(bolso, [tarjeta("POL", "CHO", 1), tarjeta("VES", "NEG", 1)], INDICE);
    expect(s.map((x) => x.papel)).toEqual(["superior", "entero"]);
  });
});

describe("el «¿Por qué?» habla en tienda (ley 4, ADR-0290)", () => {
  const PAPELES_PAREJA: Papel[] = ["superior", "inferior", "entero", "abrigo", "calzado", "bolso", "accesorio", "bisuteria"];
  const DICHOS = ["un polo", "una blusa", "unos botines", "unas botas"];
  const ANCLAS = ["una falda", "un pantalón", "unos lentes de sol", "unas sandalias"];

  it("toda combinación de papel × forma de decirse es una oración bien armada, sin «a un» ni «a una» ni códigos", () => {
    for (const papel of PAPELES_PAREJA)
      for (const sugerida of DICHOS)
        for (const ancla of ANCLAS) {
          const frase = fraseDelPapel(papel, sugerida, ancla);
          expect(frase, `${papel} · ${sugerida} · ${ancla}`).toMatch(
            /^(Un|Una|Unos|Unas) [a-záéíóú ]+ (va|van|acompaña|acompañan|remata|rematan) ((arriba|abajo|encima) (del|de la|de los|de las)|con (el|la|los|las)|(el|la|los|las)) [a-záéíóú ]+$/
          );
          expect(frase).not.toMatch(/ a un| a una| de el /);
          // Singular con singular, plural con plural.
          if (/^(unos|unas)/.test(sugerida)) expect(frase).toMatch(/ (van|acompañan|rematan) /);
          else expect(frase).toMatch(/ (va|acompaña|remata) /);
        }
  });

  it("ejemplos que una vendedora puede repetir", () => {
    expect(fraseDelPapel("superior", "una blusa", "una falda")).toBe("Una blusa va arriba de la falda");
    expect(fraseDelPapel("inferior", "un pantalón", "un polo")).toBe("Un pantalón va abajo del polo");
    expect(fraseDelPapel("bolso", "una cartera", "una blusa")).toBe("Una cartera acompaña la blusa");
    expect(fraseDelPapel("bisuteria", "unos aretes", "un vestido")).toBe("Unos aretes rematan el vestido");
    expect(fraseDelPapel("calzado", "unas botas", "un pantalón")).toBe("Unas botas van con el pantalón");
    expect(fraseDelPapel("abrigo", "una casaca", "un polo")).toBe("Una casaca va encima del polo");
  });

  it("el color se dice con artículo y en minúscula; el tono sobre tono, a secas", () => {
    expect(fraseDelColor("directa", "Negro", "Beige")).toBe("El negro combina con el beige");
    expect(fraseDelColor("inversa", "Azul marino", "Rosa pálido")).toBe("El azul marino combina con el rosa pálido");
    expect(fraseDelColor("mismo", "Beige", "Beige")).toBe("Del mismo tono");
    expect(conArticuloDefinido("unas sandalias")).toBe("las sandalias");
    expect(conArticuloDefinido("ropa interior")).toBe("ropa interior");
  });
});

describe("tarjetasDesdeVariantes", () => {
  it("arma una tarjeta por prenda y color con el piso de cada talla, y deja fuera las inactivas", () => {
    const piso = new Map([
      ["v1", 2],
      ["v2", 0],
      ["v3", 1],
    ]);
    const tarjetas = tarjetasDesdeVariantes(
      [
        { varianteId: "v1", productoId: "p1", referencia: "Polo Luna", talla: "S", color: "Beige", colorHex: "#d5ba98", colorCodigo: "BEI", categoriaPrefijo: "POL", fotoUrl: null },
        { varianteId: "v2", productoId: "p1", referencia: "Polo Luna", talla: "M", color: "Beige", colorHex: "#d5ba98", colorCodigo: "BEI", categoriaPrefijo: "POL", fotoUrl: "f.jpg" },
        { varianteId: "v3", productoId: "p1", referencia: "Polo Luna", talla: "S", color: "Negro", colorHex: "#2d2c2f", colorCodigo: "NEG", categoriaPrefijo: "POL", fotoUrl: null },
        { varianteId: "v4", productoId: "p2", referencia: "Falda Mar", talla: null, color: null, colorHex: null, colorCodigo: null, categoriaPrefijo: "FAL", fotoUrl: null, activo: false },
      ],
      (id) => piso.get(id) ?? 0
    );
    expect(tarjetas.map((t) => [t.referencia, t.colorCodigo, t.fotoUrl, t.tallas.map((x) => [x.talla, x.stockAqui])])).toEqual([
      ["Polo Luna", "BEI", "f.jpg", [["S", 2], ["M", 0]]],
      ["Polo Luna", "NEG", null, [["S", 1]]],
    ]);
  });
});

describe("la frase", () => {
  it("nombra hasta dos categorías pareja con piso en un color aprobado, la que más cuelga de cada papel", () => {
    const ancla = { productoId: "polo-beige", categoriaPrefijo: "POL", colorCodigo: "BEI" };
    const tarjetas = [tarjeta("PAN", "CHO", 1), tarjeta("JEA", "AZM", 3), tarjeta("JEA", "NEG", 2), tarjeta("CAR", "AZM", 1), tarjeta("CAS", "MAR", 1)];
    const dichos = categoriasQueCombinan(ancla, tarjetas, INDICE);
    expect(dichos).toEqual(["un jean", "una cartera"]);
    expect(fraseCombina(dichos)).toBe("Combina bien con un jean o una cartera");
    expect(fraseCombina(["un polo"])).toBe("Combina bien con un polo");
    expect(fraseCombina([])).toBeNull();
  });

  it("sin nada que combine en el piso, no hay frase", () => {
    const ancla = { productoId: "polo-beige", categoriaPrefijo: "POL", colorCodigo: "BEI" };
    expect(categoriasQueCombinan(ancla, [tarjeta("PAN", "ROJ", 5), tarjeta("POL", "CHO", 5)], INDICE)).toEqual([]);
  });
});
