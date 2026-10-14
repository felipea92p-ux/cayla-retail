import { beforeEach, describe, expect, it } from "vitest";
import { cargarFoto, olvidarFotosPedidas, type ImagenPrecarga } from "./precargar-fotos";

/** Una imagen de mentira: `decode` resuelve o rechaza según se la configure. */
function fabrica(resultado: "ok" | "falla") {
  const pedidas: string[] = [];
  const crear = (): ImagenPrecarga => {
    const img: ImagenPrecarga = {
      src: "",
      decode: () => (resultado === "ok" ? Promise.resolve() : Promise.reject(new Error("rota"))),
      onload: null,
      onerror: null,
    };
    // Registrar cuando se le pone la url (el momento en que el navegador empezaría a bajarla).
    let valor = "";
    Object.defineProperty(img, "src", {
      get: () => valor,
      set: (v: string) => {
        valor = v;
        pedidas.push(v);
      },
    });
    return img;
  };
  return { crear, pedidas };
}

describe("precargar fotos", () => {
  beforeEach(() => olvidarFotosPedidas());

  it("pide cada foto una sola vez, aunque se llame de nuevo", async () => {
    const { crear, pedidas } = fabrica("ok");
    void cargarFoto("a.webp", crear);
    void cargarFoto("b.webp", crear);
    void cargarFoto("a.webp", crear);
    await cargarFoto("b.webp", crear);
    expect(pedidas).toEqual(["a.webp", "b.webp"]);
  });

  it("resuelve true cuando la foto cargó y false cuando falló, sin rechazar nunca", async () => {
    expect(await cargarFoto("buena.webp", fabrica("ok").crear)).toBe(true);
    expect(await cargarFoto("rota.webp", fabrica("falla").crear)).toBe(false);
  });

  it("una foto que falló se vuelve a intentar; una que cargó no", async () => {
    const mala = fabrica("falla");
    await cargarFoto("x.webp", mala.crear);
    await Promise.resolve(); // deja que la limpieza de la fallida corra
    const buena = fabrica("ok");
    expect(await cargarFoto("x.webp", buena.crear)).toBe(true);
    expect(buena.pedidas).toEqual(["x.webp"]);
    await cargarFoto("x.webp", mala.crear);
    expect(mala.pedidas).toEqual(["x.webp"]); // no volvió a pedirla
  });

  it("sin imagen disponible (servidor) no hace nada ni falla", async () => {
    expect(await cargarFoto("y.webp", () => null)).toBe(false);
  });

  it("la misma foto en otro tamaño es otra descarga, y se pide con su srcset y sizes antes del src", async () => {
    const orden: string[] = [];
    const crear = (): ImagenPrecarga => {
      const img = { decode: () => Promise.resolve(), onload: null, onerror: null } as unknown as ImagenPrecarga;
      for (const campo of ["sizes", "srcset", "src"] as const) {
        let valor = "";
        Object.defineProperty(img, campo, { get: () => valor, set: (v: string) => ((valor = v), orden.push(`${campo}=${v}`)) });
      }
      return img;
    };
    const chica = { src: "/_next/image?url=a&w=96", srcSet: "/_next/image?url=a&w=48 48w, /_next/image?url=a&w=96 96w", sizes: "40px" };
    const grande = { src: "/_next/image?url=a&w=640", srcSet: "/_next/image?url=a&w=640 640w", sizes: "320px" };
    await cargarFoto("a.jpg", crear, chica);
    await cargarFoto("a.jpg", crear, chica); // repetida: no se vuelve a pedir
    await cargarFoto("a.jpg", crear, grande);
    expect(orden.filter((x) => x.startsWith("src=")).length).toBe(2);
    expect(orden.slice(0, 3)).toEqual(["sizes=40px", `srcset=${chica.srcSet}`, `src=${chica.src}`]);
  });
});
