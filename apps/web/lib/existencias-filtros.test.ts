import { describe, expect, it } from "vitest";
import {
  chipsDeFiltros,
  coincideConFiltroAccion,
  coincideConFiltroDanado,
  consultaConCambios,
  consultaSinFiltros,
  conteosDeFiltros,
  contarFiltrosActivos,
  filtrarExistencias,
  filtrosDeUrl,
  indiceDeExistencias,
  OPCIONES_FILTRO_ACCION,
  tallasEnCurva,
  valorOfrecido,
} from "./existencias-filtros";

// El filtro «Acción» de Existencias (Felipe, 2026-09-25): separado de «Estado» (dañado/cuarentena)
// — dos preguntas distintas («qué hacer hoy» vs. «en qué condición está el inventario») que antes
// vivían mezcladas en un solo dropdown.

describe("OPCIONES_FILTRO_ACCION — Caso A/B del pedido", () => {
  it("Caso A — contiene exactamente Reponer a piso y Sin acción", () => {
    expect(OPCIONES_FILTRO_ACCION).toEqual(["reponer_a_piso", "sin_accion"]);
  });

  it("Caso B — NO contiene Dañado ni Cuarentena: son un eje de Estado, no de Acción", () => {
    expect(OPCIONES_FILTRO_ACCION).not.toContain("danado");
    expect(OPCIONES_FILTRO_ACCION).not.toContain("cuarentena");
    expect(OPCIONES_FILTRO_ACCION).toHaveLength(2);
  });
});

describe("coincideConFiltroAccion — Caso D/E del pedido", () => {
  it("Caso D — filtro «Reponer a piso» devuelve exactamente accionHoy.tipo === \"reponer_a_piso\"", () => {
    expect(coincideConFiltroAccion("reponer_a_piso", "reponer_a_piso")).toBe(true);
    expect(coincideConFiltroAccion("sin_accion", "reponer_a_piso")).toBe(false);
  });

  it("Caso E — filtro «Sin acción» devuelve exactamente accionHoy.tipo === \"sin_accion\"", () => {
    expect(coincideConFiltroAccion("sin_accion", "sin_accion")).toBe(true);
    expect(coincideConFiltroAccion("reponer_a_piso", "sin_accion")).toBe(false);
  });

  it("«Acción: todas» (filtro null) deja pasar cualquier tipo, incluida una fila sin accionHoy (N/D)", () => {
    expect(coincideConFiltroAccion("reponer_a_piso", null)).toBe(true);
    expect(coincideConFiltroAccion("sin_accion", null)).toBe(true);
    expect(coincideConFiltroAccion(undefined, null)).toBe(true);
  });
});

describe("coincideConFiltroDanado — Caso C del pedido: eje independiente de Acción hoy", () => {
  it("con el filtro activo, solo pasan las filas con unidades dañadas — sin importar su Acción hoy", () => {
    expect(coincideConFiltroDanado(3, true)).toBe(true);
    expect(coincideConFiltroDanado(0, true)).toBe(false);
    expect(coincideConFiltroDanado(null, true)).toBe(false);
  });

  it("con el filtro apagado, cualquier fila pasa (dañada o no)", () => {
    expect(coincideConFiltroDanado(3, false)).toBe(true);
    expect(coincideConFiltroDanado(0, false)).toBe(true);
    expect(coincideConFiltroDanado(null, false)).toBe(true);
  });
});

// Los filtros viven en la URL (2026-10-03): recargar, volver de otra pantalla o abrir un enlace copiado los trae puestos.

describe("filtrosDeUrl", () => {
  it("lee cada filtro por su nombre y deja en null lo que no está", () => {
    const f = filtrosDeUrl("q=polo&cat=Polos&marca=Krisstell&talla=M&color=Azul+marino&accion=reponer_a_piso&estado=por_colgar&orden=nombre", { separa: true });
    expect(f).toEqual({
      q: "polo",
      categoria: "Polos",
      marca: "Krisstell",
      talla: "M",
      color: "Azul marino",
      accion: "reponer_a_piso",
      estado: "por_colgar",
      orden: "nombre",
    });
    expect(filtrosDeUrl("", { separa: true })).toEqual({ q: "", categoria: null, marca: null, talla: null, color: null, accion: null, estado: null, orden: null });
  });

  it("una acción o un estado que no existen no filtran", () => {
    const f = filtrosDeUrl("accion=borrar&estado=perdido", { separa: true });
    expect(f.accion).toBeNull();
    expect(f.estado).toBeNull();
  });

  it("donde no se separa piso y almacén (Taller), Acción y Estado de un enlace de tienda se ignoran", () => {
    const f = filtrosDeUrl("accion=reponer_a_piso&estado=danado&talla=M", { separa: false });
    expect(f.accion).toBeNull();
    expect(f.estado).toBeNull();
    expect(f.talla).toBe("M");
  });
});

describe("consultaConCambios y consultaSinFiltros", () => {
  it("un cambio pone o quita su clave sin tocar las demás", () => {
    expect(consultaConCambios("ubicacion=u1&talla=M", { color: "Beige" })).toBe("ubicacion=u1&talla=M&color=Beige");
    expect(consultaConCambios("ubicacion=u1&talla=M", { talla: null })).toBe("ubicacion=u1");
    expect(consultaConCambios("talla=M", { talla: "" })).toBe("");
  });

  it("limpiar deja la sede que mira el líder y el orden; con «conservar», también lo pedido", () => {
    const url = "ubicacion=u1&q=polo&cat=Polos&talla=M&estado=por_colgar&orden=nombre&variante=v9";
    expect(consultaSinFiltros(url)).toBe("ubicacion=u1&orden=nombre&variante=v9");
    expect(consultaSinFiltros(url, ["estado", "orden"])).toBe("ubicacion=u1&estado=por_colgar&orden=nombre&variante=v9");
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
  const nada = { q: "", categoria: null, marca: null, talla: null, color: null, accion: null, estado: null };
  const texto = (a: string) => (a === "reponer_a_piso" ? "Reponer a piso" : "Mantener");

  it("sin nada puesto no hay chips ni cuenta", () => {
    expect(chipsDeFiltros(nada, texto)).toEqual([]);
    expect(contarFiltrosActivos(nada)).toBe(0);
  });

  it("cada chip dice «Nombre: valor» y sabe qué clave apaga; la búsqueda no cuenta en «Filtros · N»", () => {
    const f = { ...nada, q: " polo ", talla: "M", accion: "reponer_a_piso" as const, estado: "por_colgar" as const, marca: "Krisstell" };
    expect(chipsDeFiltros(f, texto)).toEqual([
      { texto: "«polo»", quitar: ["q"] },
      { texto: "Talla: M", quitar: ["talla"] },
      { texto: "Acción: Reponer a piso", quitar: ["accion"] },
      { texto: "Estado: Por colgar", quitar: ["estado"] },
      { texto: "Marca: Krisstell", quitar: ["marca"] },
    ]);
    expect(contarFiltrosActivos(f)).toBe(4);
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
    accionHoy: { tipo: piso <= 1 ? "reponer_a_piso" : "sin_accion" },
    danado: 0,
    pisoDisponible: piso,
    almacenDisponible: almacen,
    ...extra,
  });
  const filas: Fila[] = [
    fila("p1", "Polo Evaluna", "Polos", "Krisstell", "Azul marino", "S", 0, 2),
    fila("p1", "Polo Evaluna", "Polos", "Krisstell", "Azul marino", "M", 3, 1),
    fila("p1", "Polo Evaluna", "Polos", "Krisstell", "Beige", "M", 0, 0, { danado: 1 }),
    fila("p2", "Polo Lucky", "Polos", "Lucky Girl", "Azul claro", "M", 1, 0),
    fila("p2", "Polo Lucky", "Polos", "Lucky Girl", "Azul claro", "L", 4, 2),
    fila("p3", "Blusa Emma", "Blusas", "Krisstell", "Beige", "S", 0, 3),
    fila("p3", "Blusa Emma", "Blusas", "Krisstell", "Beige", "L", 2, 0, { danado: 2 }),
    fila("p4", "Pantalón Carla", "Pantalones", "Lucky Girl", "Negro", "30", 5, 5),
    fila("p4", "Pantalón Carla", "Pantalones", "Lucky Girl", "Azul marino", "32", 0, 1),
  ];
  const indice = indiceDeExistencias(filas);
  const nada = { q: "", categoria: null, marca: null, talla: null, color: null, accion: null, estado: null } as const;
  const productos = (e: Parameters<typeof filtrarExistencias>[1]) => new Set(filtrarExistencias(indice, e).filas.map((f) => f.productoId)).size;
  const todas: Record<string, string[]> = {
    categoria: ["Polos", "Blusas", "Pantalones"],
    marca: ["Krisstell", "Lucky Girl"],
    talla: ["S", "M", "L", "30", "32"],
    color: ["Azul marino", "Beige", "Azul claro", "Negro"],
    accion: ["reponer_a_piso", "sin_accion"],
    estado: ["danado", "por_colgar"],
  };
  const escenas = {
    "sin filtros": { ...nada },
    "talla M": { ...nada, talla: "M" },
    "Krisstell por colgar": { ...nada, marca: "Krisstell", estado: "por_colgar" as const },
    "Polos que piden reponer": { ...nada, categoria: "Polos", accion: "reponer_a_piso" as const },
    "texto «polo» y color Beige": { ...nada, q: "polo", color: "Beige" },
    "dañadas en L": { ...nada, estado: "danado" as const, talla: "L" },
  };
  for (const [nombre, escena] of Object.entries(escenas)) {
    it(nombre, () => {
      const conteos = conteosDeFiltros(indice, escena);
      for (const [clave, valores] of Object.entries(todas)) {
        for (const v of valores) {
          const esperado = productos({ ...escena, [clave]: v });
          expect({ clave, v, n: conteos[clave as keyof typeof conteos][v] ?? 0 }).toEqual({ clave, v, n: esperado });
        }
      }
    });
  }

  it("un producto con dos colores cuenta en cada uno, pero una sola vez por color", () => {
    const c = conteosDeFiltros(indice, nada);
    expect(c.color["Azul marino"]).toBe(2); // Polo Evaluna y Pantalón Carla
    expect(c.color["Beige"]).toBe(2); // Polo Evaluna y Blusa Emma (dos tallas, un producto)
    expect(c.estado).toEqual({ por_colgar: 3, danado: 2 });
  });
});
