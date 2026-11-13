import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `lecturaPorHuella` (cambiar-de-modulo#11, 2026-11-13): la tienda vuelve a pedir el catálogo, los filtros y el probador a la base SOLO si cambió
// la huella (`retail.tienda_catalogo_version()`), y nunca guarda una lectura bajo una huella que no es la suya. La base y la caché de Next se
// reemplazan: aquí se prueba lo que decide la tienda (cuándo se pide la lectura cara, qué se guarda y qué se sirve).
vi.mock("server-only", () => ({}));

// La caché de datos de Next, en memoria y con el reloj de la prueba. Next sirve la copia vencida y la rehace por detrás; aquí se rehace en el
// momento, para contar sin carreras cuántas veces se pidió cada cosa (lo que se decide es lo mismo).
const guardado = new Map<string, { valor: unknown; en: number }>();
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => Promise<unknown>, partes: string[], { revalidate }: { revalidate: number }) =>
    async (...args: unknown[]) => {
      const llave = JSON.stringify([partes, args]);
      const copia = guardado.get(llave);
      if (copia && Date.now() - copia.en < revalidate * 1000) return copia.valor;
      const valor = await fn(...args); // si falla, no se guarda nada (como Next)
      guardado.set(llave, { valor, en: Date.now() });
      return valor;
    },
}));

// La base solo contesta la pregunta por la huella; la lectura cara es `consulta`, de cada prueba.
let huellaDeLaBase: () => Promise<unknown>;
vi.mock("./base", () => ({
  base: () => (partes: TemplateStringsArray) => {
    const sql = partes.join("?");
    if (!sql.includes("tienda_catalogo_version")) throw new Error(`consulta inesperada: ${sql}`);
    return huellaDeLaBase().then((huella) => [{ huella }]);
  },
}));

type Lector = (sede: string | null) => Promise<unknown>;
let lecturaPorHuella: typeof import("./compartido-servidor").lecturaPorHuella;
let consulta: ReturnType<typeof vi.fn<(conHuella: boolean, sede: string | null) => Promise<{ dato: unknown; huella: string | null }>>>;
let lector: Lector;
let anotado: ReturnType<typeof vi.spyOn>;

/** Lo que tiene la base «ahora»: su huella y el catálogo de esa huella. La lectura cara devuelve los dos juntos (la misma foto). */
let base: { huella: string; dato: string };
const H1 = "a".repeat(32);
const H2 = "b".repeat(32);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-13T15:00:00Z"));
  guardado.clear();
  vi.resetModules(); // cada prueba con su `unaALaVez` y su aviso de «sin huella» limpios
  ({ lecturaPorHuella } = await import("./compartido-servidor"));
  base = { huella: H1, dato: "catálogo 1" };
  huellaDeLaBase = async () => base.huella;
  consulta = vi.fn(async (conHuella: boolean) => ({ dato: base.dato, huella: conHuella ? base.huella : null }));
  lector = lecturaPorHuella("prueba", 30, (conHuella, sede: string | null) => consulta(conHuella, sede));
  anotado = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  anotado.mockRestore();
  vi.useRealTimers();
});

/** Pasa `segundos` y vuelve a mirar el catálogo, como una visita. */
async function visitaTras(segundos: number, sede: string | null = null) {
  await vi.advanceTimersByTimeAsync(segundos * 1000);
  return lector(sede);
}

describe("lecturaPorHuella", () => {
  it("mientras la huella no cambia, la lectura cara se pide UNA vez (una visita cada medio minuto durante 9 minutos)", async () => {
    expect(await lector(null)).toBe("catálogo 1");
    for (let i = 0; i < 18; i++) expect(await visitaTras(31)).toBe("catálogo 1");
    expect(consulta).toHaveBeenCalledTimes(1);
    expect(consulta).toHaveBeenCalledWith(true, null);
  });

  it("una venta, un precio, una campaña o una foto nueva cambian la huella: a la vuelta siguiente (≤ 30 s, como antes) se ve lo nuevo", async () => {
    expect(await lector(null)).toBe("catálogo 1");
    base = { huella: H2, dato: "catálogo 2" };
    expect(await visitaTras(10)).toBe("catálogo 1"); // dentro del medio minuto de siempre
    expect(await visitaTras(21)).toBe("catálogo 2");
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("cada tienda tiene su copia: la de Trujillo no se sirve en Lima", async () => {
    consulta.mockImplementation(async (conHuella, sede) => ({ dato: `catálogo de ${sede}`, huella: conHuella ? base.huella : null }));
    expect(await lector("tru")).toBe("catálogo de tru");
    expect(await lector("lim")).toBe("catálogo de lim");
    expect(await visitaTras(31, "tru")).toBe("catálogo de tru");
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("si algo cambia entre la pregunta y la lectura, sirve lo nuevo pero NO lo guarda con la huella vieja", async () => {
    // La base contesta la huella H1 y, un instante después, ya armó el catálogo 2 con su huella H2.
    consulta.mockImplementationOnce(async () => ({ dato: "catálogo 2", huella: H2 }));
    expect(await lector(null)).toBe("catálogo 2");
    // Se vende y se devuelve la misma prenda: la base vuelve EXACTAMENTE a lo de H1. Si el catálogo 2 hubiera quedado guardado con H1, se
    // serviría algo que ya no es; como no se guardó, se vuelve a pedir y sale el de H1.
    base = { huella: H1, dato: "catálogo 1" };
    expect(await visitaTras(31)).toBe("catálogo 1");
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("aunque la huella no cambie, la lectura se rehace a los 10 minutos (el tope de lo que la huella no ve)", async () => {
    await lector(null);
    for (let i = 0; i < 19; i++) await visitaTras(31); // 9 min 49 s
    expect(consulta).toHaveBeenCalledTimes(1);
    await visitaTras(31); // 10 min 20 s
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("sin huella (la función todavía no está en la base), arma como antes: cada medio minuto, sin pedir la huella dentro, y lo anota una vez", async () => {
    huellaDeLaBase = async () => {
      throw new Error("function retail.tienda_catalogo_version() does not exist");
    };
    expect(await lector(null)).toBe("catálogo 1");
    expect(await visitaTras(31)).toBe("catálogo 1");
    expect(await visitaTras(31)).toBe("catálogo 1");
    expect(consulta).toHaveBeenCalledTimes(3);
    expect(consulta.mock.calls.every(([conHuella]) => conHuella === false)).toBe(true);
    const lineas = anotado.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])) as { evento: string });
    expect(lineas).toEqual([{ evento: "tienda_huella_fallo", mensaje: "function retail.tienda_catalogo_version() does not exist" }]);
  });

  it("una huella rara (vacía o que no es texto) cuenta como sin huella", async () => {
    huellaDeLaBase = async () => "";
    await lector(null);
    huellaDeLaBase = async () => 42;
    await visitaTras(31);
    expect(consulta.mock.calls.map(([conHuella]) => conHuella)).toEqual([false, false]);
  });

  it("un fallo de la lectura cara no se guarda: la visita lo recibe y una próxima, pasada la pausa, lo vuelve a intentar", async () => {
    consulta.mockRejectedValueOnce(new Error("la base no contesta"));
    await expect(lector(null)).rejects.toThrow("la base no contesta");
    expect(await visitaTras(16)).toBe("catálogo 1");
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("cien visitas a la vez con la copia vacía son UNA lectura cara", async () => {
    let soltar: () => void = () => undefined;
    consulta.mockImplementationOnce(
      (conHuella) =>
        new Promise((listo) => {
          soltar = () => listo({ dato: "catálogo 1", huella: conHuella ? H1 : null });
        }),
    );
    const visitas = Array.from({ length: 100 }, () => lector(null));
    await vi.advanceTimersByTimeAsync(0);
    soltar();
    expect(new Set(await Promise.all(visitas))).toEqual(new Set(["catálogo 1"]));
    expect(consulta).toHaveBeenCalledTimes(1);
  });
});
