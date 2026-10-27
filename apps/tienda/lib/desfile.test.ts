import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { claveDelEscenario, letrasDelTitulo, piezasDelDesfile, RITMO, SALIDAS_MAX, salidaTexto, siguienteSalida } from "./desfile";

const FOTO = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.jpg";

const prenda = (nombre: string, extra: Partial<Prenda> = {}): Prenda => ({
  empresa: null,
  insignias: [],
  id: nombre,
  codigo: null,
  nombre,
  categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" },
  precio: 79.9,
  precioFinal: 79.9,
  desde: false,
  campana: null,
  colores: [{ codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: null }],
  fotos: [],
  stock: null,
  nuevo: { dias: 3 },
  vendidos: null,
  ...extra,
});

describe("el desfile de Lo nuevo", () => {
  it("sale con las prendas en el orden que llegan, numeradas «01», «02»… y hasta seis", () => {
    const prendas = Array.from({ length: 9 }, (_, i) => prenda(`Prenda ${i + 1}`));
    const piezas = piezasDelDesfile(prendas, null, undefined);
    expect(piezas).toHaveLength(SALIDAS_MAX);
    expect(piezas.map((p) => p.salida)).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(piezas.map((p) => p.nombre)).toEqual(["Prenda 1", "Prenda 2", "Prenda 3", "Prenda 4", "Prenda 5", "Prenda 6"]);
  });

  it("sin prendas no hay desfile", () => {
    expect(piezasDelDesfile([], null, undefined)).toEqual([]);
  });

  it("cada salida dice lo que dice su tarjeta: precio, oferta, categoría y a dónde lleva", () => {
    const [normal, rebajada] = piezasDelDesfile(
      [
        prenda("Blusa", { fotos: [FOTO] }),
        prenda("Vestido", { precioFinal: 63.9, campana: { id: null, nombre: "Aniversario", pct: 20, hasta: null } }),
      ],
      "lima",
      undefined,
    );
    expect(normal).toMatchObject({ nombre: "Blusa", categoria: "Camisas y Blusas", oferta: false, anterior: null, foto: FOTO });
    expect(normal.precio).toContain("79.90");
    expect(normal.href).toContain("sede=lima");
    expect(normal.datos).toEqual({ nombre: "Blusa", precio: normal.precio, categoria: "Camisas y Blusas" });
    expect(rebajada).toMatchObject({ oferta: true });
    expect(rebajada.precio).toContain("63.90");
    expect(rebajada.anterior).toContain("79.90");
    expect(rebajada.datos.oferta).toBe("si");
    expect(rebajada.datos.antes).toBe(rebajada.anterior);
  });

  it("una prenda sin foto se dibuja con su silueta: sin foto y con su forma y su color", () => {
    const [p] = piezasDelDesfile([prenda("Blusa")], null, undefined);
    expect(p.foto).toBeNull();
    expect(p.optimizar).toBe(false);
    expect(p.forma).toBeTruthy();
    expect(p.color).toBe("#2D2C2F");
  });

  it("la siguiente salida da la vuelta al terminar, y con una sola se queda en ella", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => siguienteSalida(i, 6))).toEqual([1, 2, 3, 4, 5, 0]);
    expect(siguienteSalida(0, 1)).toBe(0);
    expect(siguienteSalida(0, 0)).toBe(0);
  });

  it("el número de la salida lleva siempre dos cifras", () => {
    expect([1, 9, 10].map(salidaTexto)).toEqual(["01", "09", "10"]);
  });

  it("el título se parte en palabras de letras sueltas, numeradas de corrido, para que suban una a una", () => {
    const palabras = letrasDelTitulo("Lo nuevo");
    expect(palabras.map((p) => p.palabra)).toEqual(["Lo", "nuevo"]);
    expect(palabras.flatMap((p) => p.letras.map((l) => l.c)).join("")).toBe("Lonuevo");
    expect(palabras.flatMap((p) => p.letras.map((l) => l.n))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Los espacios dobles o a los lados no inventan palabras vacías.
    expect(letrasDelTitulo("  Lo   nuevo ").map((p) => p.palabra)).toEqual(["Lo", "nuevo"]);
  });

  it("el ritmo es el de la maqueta, salvo que la primera prenda ya está en la luz al cargar", () => {
    expect(RITMO).toMatchObject({ entra: 1500, queda: 1700, sale: 1300, flash: 520 });
    // La primera vez no cruza ni espera 2,8 s: se queda menos de lo que una prenda tarda en entrar y quedarse.
    expect(RITMO.primera).toBeLessThan(RITMO.entra + RITMO.queda);
  });
});

describe("la clave del escenario (cambiar de tienda reinicia el desfile)", () => {
  const a = [{ id: "p1" }, { id: "p2" }];
  it("cambia cuando llegan otras prendas, aunque sean las mismas de cantidad: era el caso que dejaba la escena apagada", () => {
    expect(claveDelEscenario("portada", false, a)).not.toBe(claveDelEscenario("portada", false, [{ id: "p3" }, { id: "p4" }]));
  });
  it("cambia si cambia el orden, y no si es la misma visita", () => {
    expect(claveDelEscenario("portada", false, a)).not.toBe(claveDelEscenario("portada", false, [...a].reverse()));
    expect(claveDelEscenario("portada", false, a)).toBe(claveDelEscenario("portada", false, [{ id: "p1" }, { id: "p2" }]));
  });
  it("el esqueleto no se confunde con la escena, ni la portada con la sección", () => {
    expect(claveDelEscenario("portada", true, a)).not.toBe(claveDelEscenario("portada", false, a));
    expect(claveDelEscenario("portada", false, a)).not.toBe(claveDelEscenario("seccion", false, a));
  });
});
