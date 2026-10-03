import { describe, expect, it } from "vitest";
import { opcionesDeColor } from "./productos-filtros";
import { TIPOS_HOY } from "./existencias-hoy";
import {
  chipsDeFiltros,
  consultaConCambios,
  CONDICIONES,
  consultaSinFiltros,
  conteosDeFiltros,
  contarFiltrosActivos,
  filtrarExistencias,
  filtrosDeUrl,
  indiceDeExistencias,
  PREFIJO_FAMILIA,
  tallasEnCurva,
  valorOfrecido,
} from "./existencias-filtros";

// Los filtros viven en la URL (2026-10-03): recargar, volver de otra pantalla o abrir un enlace copiado los trae puestos.

describe("filtrosDeUrl", () => {
  it("lee cada filtro por su nombre y deja en null lo que no está", () => {
    const f = filtrosDeUrl("q=polo&cat=Polos&marca=Krisstell&talla=M,L&color=Azul+marino&familia=neutro&hoy=por_colgar&condicion=apartadas&orden=nombre", { separa: true });
    expect(f).toEqual({
      q: "polo",
      categoria: "Polos",
      marca: "Krisstell",
      tallas: ["M", "L"],
      colores: ["Azul marino"],
      familias: ["neutro"],
      hoy: "por_colgar",
      condicion: "apartadas",
      orden: "nombre",
    });
    expect(filtrosDeUrl("", { separa: true })).toEqual({ q: "", categoria: null, marca: null, tallas: [], colores: [], familias: [], hoy: null, condicion: null, orden: null });
  });

  it("un «Hoy» o una condición que no existen no filtran (tampoco los nombres viejos «accion» y «estado»)", () => {
    const f = filtrosDeUrl("hoy=borrar&condicion=perdida&accion=reponer_a_piso&estado=danado", { separa: true });
    expect(f.hoy).toBeNull();
    expect(f.condicion).toBeNull();
  });

  it("donde no se separa piso y almacén (Taller), Hoy y Condición de un enlace de tienda se ignoran", () => {
    const f = filtrosDeUrl("hoy=por_reponer&condicion=danadas&talla=M", { separa: false });
    expect(f.hoy).toBeNull();
    expect(f.condicion).toBeNull();
    expect(f.tallas).toEqual(["M"]);
  });
});

describe("consultaConCambios y consultaSinFiltros", () => {
  it("un cambio pone o quita su clave sin tocar las demás", () => {
    expect(consultaConCambios("ubicacion=u1&talla=M", { color: "Beige" })).toBe("ubicacion=u1&talla=M&color=Beige");
    expect(consultaConCambios("ubicacion=u1&talla=M", { talla: null })).toBe("ubicacion=u1");
    expect(consultaConCambios("talla=M", { talla: "" })).toBe("");
  });

  it("limpiar deja la sede que mira el líder y el orden; con «conservar», también lo pedido", () => {
    const url = "ubicacion=u1&q=polo&cat=Polos&talla=M&hoy=por_colgar&orden=nombre&variante=v9";
    expect(consultaSinFiltros(url)).toBe("ubicacion=u1&orden=nombre&variante=v9");
    expect(consultaSinFiltros(url, ["hoy", "orden"])).toBe("ubicacion=u1&hoy=por_colgar&orden=nombre&variante=v9");
  });
});

describe("valorOfrecido", () => {
  it("un valor que la sede no ofrece no filtra", () => {
    expect(valorOfrecido("Krisstell", ["Krisstell", "Lucky Girl"])).toBe("Krisstell");
    expect(valorOfrecido("CAYLA", ["Krisstell", "Lucky Girl"])).toBeNull();
    expect(valorOfrecido(null, ["Krisstell"])).toBeNull();
  });
});

describe("tallasEnCurva", () => {
  it("ordena como la tarjeta (letras en curva, luego la numeración), no como texto", () => {
    const filas = ["XL", "10", "S", "Estándar", "2", "M", "XS", "4", "L", "M", null].map((talla) => ({ talla }));
    const curva = tallasEnCurva(filas);
    expect(curva.slice(0, 5)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(curva.indexOf("2")).toBeLessThan(curva.indexOf("4"));
    expect(curva.indexOf("4")).toBeLessThan(curva.indexOf("10"));
    expect(curva).toHaveLength(9);
  });
});

describe("chipsDeFiltros y contarFiltrosActivos", () => {
  const nada = { q: "", categoria: null, marca: null, tallas: [], colores: [], familias: [], hoy: null, condicion: null };

  it("sin nada puesto no hay chips ni cuenta", () => {
    expect(chipsDeFiltros(nada)).toEqual([]);
    expect(contarFiltrosActivos(nada)).toBe(0);
  });

  it("cada chip dice «Nombre: valor» y sabe qué clave apaga; la búsqueda no cuenta en «Filtros · N»", () => {
    const f = { ...nada, q: " polo ", tallas: ["M", "L"], familias: ["azul"], colores: ["Beige"], hoy: "sin_stock_atras" as const, condicion: "apartadas" as const, marca: "Krisstell" };
    expect(chipsDeFiltros(f)).toEqual([
      { texto: "«polo»", quitar: ["q"] },
      { texto: "Talla: M, L", quitar: ["talla"] },
      { texto: "Color: Familia Azul, Beige", quitar: ["color", "familia"] },
      { texto: "Hoy: Sin stock atrás", quitar: ["hoy"] },
      { texto: "Condición: Apartadas", quitar: ["condicion"] },
      { texto: "Marca: Krisstell", quitar: ["marca"] },
    ]);
    expect(contarFiltrosActivos(f)).toBe(5); // talla, color (con su familia, una vez), hoy, condición y marca
  });
});

describe("conteosDeFiltros — cada número es lo que trae la lista al elegir esa opción", () => {
  // Cuatro modelos, con dos marcas, dos categorías, colores y tallas; pisos, almacenes y dañadas variados.
  type Fila = Parameters<typeof indiceDeExistencias>[0][number];
  const fila = (p: string, ref: string, cat: string, marca: string, color: string, talla: string, piso: number, almacen: number, extra: Partial<Fila> = {}): Fila => ({
    productoId: p,
    referencia: ref,
    sku: `${p}-${color}-${talla}`,
    codigosBarras: [],
    categoria: cat,
    marca,
    talla,
    color,
    colorFamilia: { "Azul marino": "azul", "Azul claro": "azul", Beige: "neutro", Negro: "neutro" }[color] ?? null,
    accionHoy: { tipo: piso <= 1 ? "reponer_a_piso" : "sin_accion" },
    danado: 0,
    apartado: 0,
    pisoDisponible: piso,
    almacenDisponible: almacen,
    ...extra,
  });
  const filas: Fila[] = [
    fila("p1", "Polo Evaluna", "Polos", "Krisstell", "Azul marino", "S", 0, 2),
    fila("p1", "Polo Evaluna", "Polos", "Krisstell", "Azul marino", "M", 1, 1),
    fila("p1", "Polo Evaluna", "Polos", "Krisstell", "Beige", "M", 0, 0, { danado: 1 }),
    fila("p2", "Polo Lucky", "Polos", "Lucky Girl", "Azul claro", "M", 1, 0, { apartado: 1 }),
    fila("p2", "Polo Lucky", "Polos", "Lucky Girl", "Azul claro", "L", 4, 2),
    fila("p3", "Blusa Emma", "Blusas", "Krisstell", "Beige", "S", 0, 3),
    fila("p3", "Blusa Emma", "Blusas", "Krisstell", "Beige", "L", 2, 0, { danado: 2 }),
    fila("p4", "Pantalón Carla", "Pantalones", "Lucky Girl", "Negro", "30", 5, 5),
    fila("p4", "Pantalón Carla", "Pantalones", "Lucky Girl", "Azul marino", "32", 0, 1),
  ];
  const indice = indiceDeExistencias(filas);
  type Elegidos = Parameters<typeof filtrarExistencias>[1];
  const nada: Elegidos = { q: "", categoria: null, marca: null, tallas: [], colores: [], familias: [], hoy: null, condicion: null };
  const productos = (e: Elegidos) => new Set(filtrarExistencias(indice, e).filas.map((f) => f.productoId)).size;
  /** La escena con ESA sola opción elegida en ese filtro (lo que hace un clic en la lista). */
  const conOpcion = (e: Elegidos, clave: string, v: string): Elegidos => {
    if (clave === "talla") return { ...e, tallas: [v] };
    if (clave === "color") return v.startsWith(PREFIJO_FAMILIA) ? { ...e, colores: [], familias: [v.slice(PREFIJO_FAMILIA.length)] } : { ...e, colores: [v], familias: [] };
    return { ...e, [clave]: v };
  };
  const todas: Record<string, string[]> = {
    categoria: ["Polos", "Blusas", "Pantalones"],
    marca: ["Krisstell", "Lucky Girl"],
    talla: ["S", "M", "L", "30", "32"],
    color: ["Azul marino", "Beige", "Azul claro", "Negro", "familia:azul", "familia:neutro"],
    hoy: [...TIPOS_HOY],
    condicion: [...CONDICIONES],
  };
  const escenas: Record<string, Elegidos> = {
    "sin filtros": { ...nada },
    "talla M": { ...nada, tallas: ["M"] },
    "tallas S y L, familia azul": { ...nada, tallas: ["S", "L"], familias: ["azul"] },
    "Krisstell por colgar": { ...nada, marca: "Krisstell", hoy: "por_colgar" },
    "Polos sin stock atrás": { ...nada, categoria: "Polos", hoy: "sin_stock_atras" },
    "apartadas en M": { ...nada, condicion: "apartadas", tallas: ["M"] },
    "texto «polo» y color Beige": { ...nada, q: "polo", colores: ["Beige"] },
    "dañadas en L": { ...nada, condicion: "danadas", tallas: ["L"] },
  };
  for (const [nombre, escena] of Object.entries(escenas)) {
    it(nombre, () => {
      const conteos = conteosDeFiltros(indice, escena);
      for (const [clave, valores] of Object.entries(todas)) {
        for (const v of valores) {
          const esperado = productos(conOpcion(escena, clave, v));
          expect({ clave, v, n: conteos[clave as keyof typeof conteos][v] ?? 0 }).toEqual({ clave, v, n: esperado });
        }
      }
    });
  }

  it("un producto con dos colores cuenta en cada uno, pero una sola vez por color", () => {
    const c = conteosDeFiltros(indice, nada);
    expect(c.color["Azul marino"]).toBe(2); // Polo Evaluna y Pantalón Carla
    expect(c.color["Beige"]).toBe(2); // Polo Evaluna y Blusa Emma (dos tallas, un producto)
    // Por colgar: Evaluna S, Emma S y Carla 32 · Por reponer: Evaluna M · Sin stock atrás: Evaluna M Beige y Lucky M.
    expect(c.hoy).toEqual({ por_colgar: 3, por_reponer: 1, sin_stock_atras: 2, mantener: 3 });
    expect(c.condicion).toEqual({ danadas: 2, apartadas: 1 });
    expect(c.color["familia:azul"]).toBe(3); // Evaluna y Carla (Azul marino) y Lucky (Azul claro)
  });

  it("varias tallas o varios colores suman (M o L), y una familia trae todos sus tonos", () => {
    expect(productos({ ...nada, tallas: ["30"] })).toBe(1);
    expect(productos({ ...nada, tallas: ["30", "S"] })).toBe(3); // Carla, Evaluna, Emma
    expect(productos({ ...nada, familias: ["azul"] })).toBe(3);
    expect(productos({ ...nada, colores: ["Negro"], familias: ["azul"] })).toBe(3);
  });

  it("si el texto ya dice una talla, manda sobre la píldora Talla (hasta que se decida otra cosa)", () => {
    expect(productos({ ...nada, q: "m", tallas: ["30"] })).toBe(2); // «m» es la talla M: Evaluna y Lucky
  });

  it("el prefijo de familia es el mismo de la lista de color de Productos (si cambia allá, el conteo deja de encontrarse)", () => {
    const opciones = opcionesDeColor([{ id: "Beige", nombre: "Beige", hex: null, familia: "neutro" }], [{ valor: "neutro", texto: "Neutro" }]);
    expect(opciones[0].valor).toBe(PREFIJO_FAMILIA + "neutro");
  });
});
