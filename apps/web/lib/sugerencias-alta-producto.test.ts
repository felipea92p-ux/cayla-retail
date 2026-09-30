import { describe, expect, it } from "vitest";
import type { ColorAlta } from "./alta-producto";
import { FAMILIAS_COLOR } from "./colores-familias";
import { sugerirCodigoColor } from "./color-codigo";
import { FICHAS_POR_CATEGORIA, MAX_DESCRIPCION, sugerirColor, sugerirDescripcion, sugerirNombre, sugerirValorNuevo, type TipoValorNuevo } from "./sugerencias-alta-producto";

// El catálogo REAL de categorías activas, leído de la base local con todas las migraciones aplicadas el 2026-09-30:
//   select familia, prefijo, nombre from retail.categorias where activo order by familia, nombre;
// (no se reconstruye leyendo las migraciones: hay renombres y fusiones, ver 20260917110000). Si un Líder crea una categoría, el sistema
// no se rompe —cae al texto neutro de su familia—; esta lista solo protege que las que HOY existen tengan su ficha. Al agregar una
// categoría real, súmala aquí y en FICHAS_POR_CATEGORIA.
const CATALOGO: ReadonlyArray<readonly [familia: string, prefijo: string, nombre: string]> = [
  ["accesorios", "CAR", "Bolsos y Carteras"], ["accesorios", "CIN", "Cinturones"], ["accesorios", "GOR", "Gorros y Sombreros"],
  ["accesorios", "LSO", "Lentes de sol"], ["accesorios", "MOC", "Mochilas"], ["accesorios", "BUF", "Pañuelos y Pañoletas"],
  ["accesorios", "REL", "Relojes"], ["accesorios", "RIN", "Riñoneras"],
  ["belleza", "MAQ", "Maquillaje"],
  ["bisuteria", "ANL", "Anillos"], ["bisuteria", "ARE", "Aretes"], ["bisuteria", "COL", "Collares"], ["bisuteria", "PUL", "Pulseras"],
  ["calzado", "BAI", "Bailarinas"], ["calzado", "BOT", "Botas"], ["calzado", "BOI", "Botines"], ["calzado", "MSN", "Mocasines"],
  ["calzado", "SAN", "Sandalias"], ["calzado", "ZAP", "Zapatillas"], ["calzado", "ZFO", "Zapatos formales"],
  ["indumentaria", "ABR", "Abrigos"], ["indumentaria", "BLZ", "Blazers"], ["indumentaria", "BOD", "Bodys"],
  ["indumentaria", "CMS", "Camisas y Blusas"], ["indumentaria", "CAS", "Casacas"], ["indumentaria", "CHA", "Chalecos"],
  ["indumentaria", "CMP", "Chompas"], ["indumentaria", "CON", "Conjuntos"], ["indumentaria", "ENT", "Enterizos"],
  ["indumentaria", "FAL", "Faldas"], ["indumentaria", "JEA", "Jeans"], ["indumentaria", "PAN", "Pantalones"],
  ["indumentaria", "SUD", "Poleras"], ["indumentaria", "POL", "Polos"], ["indumentaria", "LEN", "Ropa interior/Lencería"],
  ["indumentaria", "SHO", "Shorts"], ["indumentaria", "TOP", "Tops"], ["indumentaria", "VES", "Vestidos"],
  ["papeleria", "UTC", "Colores"], ["papeleria", "LAP", "Lapiceros"], ["papeleria", "LIB", "Libretas/Cuadernos"], ["papeleria", "UOF", "Útiles de oficina"],
];
const FAMILIAS = ["accesorios", "belleza", "bisuteria", "calzado", "indumentaria", "papeleria"];

describe("sugerencias de Nuevo producto — nombre y descripción siguen a la categoría", () => {
  it("el catálogo de la prueba es el de la base (la prueba no está mirando una lista vacía)", () => {
    expect(CATALOGO).toHaveLength(42);
    expect([...new Set(CATALOGO.map(([f]) => f))].sort()).toEqual(FAMILIAS);
  });

  it("TOTALIDAD: cada categoría activa tiene su propio ejemplo, no cae a uno genérico", () => {
    for (const [familia, prefijo, nombre] of CATALOGO) {
      const n = sugerirNombre({ familia, prefijo });
      const d = sugerirDescripcion({ familia, prefijo });
      expect(n.origen, `${nombre} (${prefijo}) sin ficha de nombre`).toBe("categoria");
      expect(d.origen, `${nombre} (${prefijo}) sin ficha de descripción`).toBe("categoria");
    }
  });

  it("no queda una ficha para una categoría que ya no existe (la tabla y el catálogo dicen lo mismo)", () => {
    expect(Object.keys(FICHAS_POR_CATEGORIA).sort()).toEqual(CATALOGO.map(([, p]) => p).sort());
  });

  it("SIN CONTRADICCIÓN: el nombre de una categoría empieza con SU prenda, y ninguna prenda ni texto se sirve a dos categorías", () => {
    const prendas = new Set<string>();
    const nombres = new Set<string>();
    const descripciones = new Set<string>();
    for (const [, prefijo, categoria] of CATALOGO) {
      const f = FICHAS_POR_CATEGORIA[prefijo];
      expect(f.nombre.startsWith(`${f.prenda} `), `${categoria}: «${f.nombre}» no empieza con su prenda «${f.prenda}»`).toBe(true);
      expect(prendas.has(f.prenda), `la prenda «${f.prenda}» se repite en otra categoría`).toBe(false);
      expect(nombres.has(f.nombre), `el nombre «${f.nombre}» se repite`).toBe(false);
      expect(descripciones.has(f.descripcion), `la descripción de ${categoria} se repite en otra categoría`).toBe(false);
      prendas.add(f.prenda);
      nombres.add(f.nombre);
      descripciones.add(f.descripcion);
    }
  });

  it("SIN CONTRADICCIÓN, cruzado: el ejemplo de una categoría no nombra la prenda de OTRA categoría de su familia", () => {
    for (const [familia, prefijo] of CATALOGO) {
      const propio = FICHAS_POR_CATEGORIA[prefijo];
      for (const [f2, p2] of CATALOGO) {
        if (p2 === prefijo || f2 !== familia) continue;
        const ajena = FICHAS_POR_CATEGORIA[p2].prenda;
        if (ajena === propio.prenda) continue;
        const texto = `${propio.nombre} ${propio.descripcion}`.toLowerCase();
        expect(texto.includes(ajena.toLowerCase()), `${prefijo}: su ejemplo «${propio.nombre}» menciona «${ajena}» (${p2})`).toBe(false);
      }
    }
  });

  it("CABE EN UN CELULAR: ninguna descripción de ejemplo pasa del largo que cabe en la caja a 375 px (si no, se corta a media palabra)", () => {
    for (const [, prefijo, nombre] of CATALOGO) {
      const d = FICHAS_POR_CATEGORIA[prefijo].descripcion;
      expect(d.length, `${nombre}: «${d}» mide ${d.length}, el máximo es ${MAX_DESCRIPCION}`).toBeLessThanOrEqual(MAX_DESCRIPCION);
    }
  });

  it("el caso que motivó la skill: elegir «Casacas» ya no sugiere «Blusa Aurora»", () => {
    const n = sugerirNombre({ familia: "indumentaria", prefijo: "CAS" });
    expect(n.texto).toBe("Casaca Río");
    expect(n.texto).not.toMatch(/blusa/i);
    expect(sugerirDescripcion({ familia: "indumentaria", prefijo: "CAS" }).texto).not.toMatch(/manga globo/i);
    // «Camisas y Blusas» sí conserva el ejemplo de siempre: para ella era correcto.
    expect(sugerirNombre({ familia: "indumentaria", prefijo: "CMS" }).texto).toBe("Blusa Aurora");
  });

  it("SIN CONTEXTO → neutro: antes de elegir categoría no promete nada", () => {
    for (const ctx of [null, undefined, {}, { familia: null, prefijo: null }]) {
      expect(sugerirNombre(ctx)).toEqual({ texto: "Nombre del producto", origen: "neutro" });
      expect(sugerirDescripcion(ctx).origen).toBe("neutro");
    }
  });

  it("una categoría NUEVA (que un Líder crea sin deploy) cae al neutro de SU familia, nunca al ejemplo de otra", () => {
    const nueva = { familia: "calzado", prefijo: "XYZ" };
    expect(sugerirNombre(nueva)).toEqual({ texto: "Nombre del modelo", origen: "familia" });
    expect(sugerirDescripcion(nueva).texto).toBe("Taco, suela, cierre…");
    for (const familia of FAMILIAS) {
      const n = sugerirNombre({ familia, prefijo: "ZZZ" });
      expect(n.origen).toBe("familia");
      for (const f of Object.values(FICHAS_POR_CATEGORIA)) expect(n.texto).not.toBe(f.nombre);
    }
    // Una familia que tampoco existe todavía: neutro general.
    expect(sugerirNombre({ familia: "hogar", prefijo: "ZZZ" })).toEqual({ texto: "Nombre del producto", origen: "neutro" });
  });

  it("SIGUE AL CONTROL: cambiar la categoría cambia el texto, y volver a la primera lo devuelve", () => {
    const a = { familia: "indumentaria", prefijo: "CAS" };
    const b = { familia: "calzado", prefijo: "ZAP" };
    const antes = sugerirNombre(a).texto;
    expect(sugerirNombre(b).texto).not.toBe(antes);
    expect(sugerirNombre(a).texto).toBe(antes);
    expect(sugerirDescripcion(b).texto).not.toBe(sugerirDescripcion(a).texto);
  });

  it("ESTABLE: dos llamadas con el mismo contexto dan lo mismo", () => {
    for (const [familia, prefijo] of CATALOGO) {
      expect(sugerirNombre({ familia, prefijo })).toEqual(sugerirNombre({ familia, prefijo }));
      expect(sugerirDescripcion({ familia, prefijo })).toEqual(sugerirDescripcion({ familia, prefijo }));
    }
  });
});

describe("sugerencias de Nuevo producto — talla, tejido y patrón nuevos siguen a la familia y evitan lo que ya existe", () => {
  const TIPOS: TipoValorNuevo[] = ["tallas", "tejidos", "patrones"];

  it("cada familia da un ejemplo propio o un neutro honesto; sin familia, neutro", () => {
    for (const tipo of TIPOS) {
      for (const familia of FAMILIAS) {
        const s = sugerirValorNuevo(tipo, familia);
        expect(["familia", "neutro"]).toContain(s.origen);
        if (s.origen === "familia") expect(s.texto).toMatch(/^Ej\. \S/);
      }
      expect(sugerirValorNuevo(tipo, null).origen).toBe("neutro");
      expect(sugerirValorNuevo(tipo, "hogar").origen).toBe("neutro");
    }
  });

  it("el ejemplo de talla de calzado es de calzado y el de ropa es de ropa (no «44» para una casaca)", () => {
    expect(sugerirValorNuevo("tallas", "calzado").texto).toBe("Ej. 44");
    expect(sugerirValorNuevo("tallas", "indumentaria").texto).toBe("Ej. XXL");
    expect(sugerirValorNuevo("tejidos", "calzado").texto).toBe("Ej. Cuero");
    expect(sugerirValorNuevo("tejidos", "indumentaria").texto).toBe("Ej. Lana merino");
  });

  it("no sugiere lo que ya existe (sin tildes ni mayúsculas): salta al siguiente candidato", () => {
    expect(sugerirValorNuevo("tejidos", "indumentaria", [{ texto: "LANA MERINO" }]).texto).toBe("Ej. Lino");
    expect(sugerirValorNuevo("tejidos", "indumentaria", [{ texto: "lana merino" }, { texto: "Lino" }]).texto).toBe("Ej. Seda");
  });

  it("si ya existen todos los candidatos, dice qué escribir en vez de repetir uno", () => {
    const todos = ["Lana merino", "Lino", "Seda"].map((texto) => ({ texto }));
    expect(sugerirValorNuevo("tejidos", "indumentaria", todos)).toEqual({ texto: "Nombre del tejido", origen: "neutro" });
  });
});

describe("sugerencias de Nuevo producto — el color nuevo sigue a su familia de color", () => {
  const color = (codigo: string, nombre: string, sinonimos: string[] = []): ColorAlta => ({ codigo, nombre, hex: null, familiaColor: "neutro", sinonimos });

  it("TOTALIDAD: cada familia de color tiene ejemplo, y el código es el que el sistema propondría para ESE nombre", () => {
    for (const f of FAMILIAS_COLOR) {
      const s = sugerirColor(f.valor, []);
      expect(s.nombre.origen, `familia de color «${f.valor}» sin ejemplo`).toBe("familia");
      expect(s.codigo.texto).toBe(sugerirCodigoColor(s.nombre.texto, new Set()));
      expect(s.codigo.texto).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("SIN CONTRADICCIÓN: el ejemplo de una familia no es el de otra", () => {
    const nombres = FAMILIAS_COLOR.map((f) => sugerirColor(f.valor, []).nombre.texto);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("SIN CONTEXTO → neutro (todavía no eligió tono ni familia)", () => {
    for (const f of [null, undefined, "", "hogar"]) {
      expect(sugerirColor(f, [])).toEqual({ nombre: { texto: "Nombre del color", origen: "neutro" }, codigo: { texto: "3 letras", origen: "neutro" } });
    }
  });

  it("no ofrece un color que ya existe, ni por sinónimo: salta al siguiente (los ejemplos de antes, «Palo de rosa» y «Verde botella», ya existían)", () => {
    expect(sugerirColor("azul", [color("AZA", "Azul acero")]).nombre.texto).toBe("Azul noche");
    expect(sugerirColor("azul", [color("AZN", "Azul marino", ["azul noche"])]).nombre.texto).toBe("Azul acero");
    expect(sugerirColor("verde", [color("VEB", "Verde botella")]).nombre.texto).toBe("Verde bosque");
  });

  it("el código de ejemplo nunca está ocupado", () => {
    const s = sugerirColor("azul", [color("AZA", "Otro color")]);
    expect(s.nombre.texto).toBe("Azul acero");
    expect(s.codigo.texto).not.toBe("AZA");
    expect(sugerirColor("azul", [], new Set(["AZA"])).codigo.texto).not.toBe("AZA");
  });

  it("si ya existen todos los ejemplos de la familia, neutro", () => {
    const todos = ["Azul acero", "Azul noche", "Azul rey"].map((n, i) => color(`A0${i}`, n));
    expect(sugerirColor("azul", todos).nombre.origen).toBe("neutro");
  });

  it("SIGUE AL CONTROL: cambiar la familia cambia el ejemplo, y volver lo devuelve", () => {
    const azul = sugerirColor("azul", []).nombre.texto;
    expect(sugerirColor("verde", []).nombre.texto).not.toBe(azul);
    expect(sugerirColor("azul", []).nombre.texto).toBe(azul);
  });
});
