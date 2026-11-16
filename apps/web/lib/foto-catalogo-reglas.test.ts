import { describe, expect, it } from "vitest";
import {
  contarPedido,
  esFotoIA,
  ESPERA_DEL_NAVEGADOR_MS,
  ladosParaAchicar,
  LADO_MAXIMO_IA,
  MAX_BYTES_POR_FOTO_IA,
  medidasParaIA,
  avisoIANoRespondio,
  firmaDeImagen,
  moldeAlPreparar,
  moldeDeLaPrenda,
  originalDeLaFotoIA,
  rutaDeLaFotoIA,
  TOPE_POR_MINUTO,
} from "./foto-catalogo-reglas";

describe("medidasParaIA", () => {
  it("achica el lado mayor al máximo y conserva la proporción", () => {
    expect(medidasParaIA(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasParaIA(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it("nunca agranda una foto chica", () => {
    expect(medidasParaIA(800, 1000, 1600)).toEqual({ ancho: 800, alto: 1000 });
  });

  it("cuatro fotos al tope entran bajo los 4,5 MB que acepta Vercel", () => {
    expect(4 * MAX_BYTES_POR_FOTO_IA).toBeLessThan(4.5 * 1024 * 1024);
    expect(LADO_MAXIMO_IA).toBeGreaterThanOrEqual(1280);
  });
});

describe("contarPedido", () => {
  it("la primera vez abre la ventana", () => {
    expect(contarPedido(undefined, 1000)).toEqual({ ventana: { desde: 1000, usos: 1 }, excede: false });
  });

  it("frena al pasar el tope dentro del mismo minuto", () => {
    let v: { desde: number; usos: number } | undefined;
    let excede = false;
    for (let i = 0; i < TOPE_POR_MINUTO + 1; i++) ({ ventana: v, excede } = contarPedido(v, 1000 + i));
    expect(excede).toBe(true);
  });

  it("pasado el minuto, vuelve a contar desde cero", () => {
    expect(contarPedido({ desde: 0, usos: 99 }, 60_001)).toEqual({ ventana: { desde: 60_001, usos: 1 }, excede: false });
  });
});

describe("el par: la foto real y su versión de catálogo", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/abc.jpg";

  it("la de IA vive junto a la real, con el mismo nombre", () => {
    expect(rutaDeLaFotoIA("fotos/abc.jpg")).toBe("fotos/abc.jpg.ia.png");
    expect(esFotoIA(`${base}.ia.png`)).toBe(true);
    expect(esFotoIA(base)).toBe(false);
    expect(esFotoIA(`${base}.ia.png?v=2`)).toBe(true);
  });

  it("desde la de IA se llega a la real; desde la real, a nada", () => {
    expect(originalDeLaFotoIA(`${base}.ia.png`)).toBe(base);
    expect(originalDeLaFotoIA(base)).toBeNull();
  });
});

describe("moldeDeLaPrenda", () => {
  const ia = (n: string) => `https://x/fotos/${n}.jpg.ia.png`;
  const real = (n: string) => `https://x/fotos/${n}.jpg`;

  it("es la de IA del primer color en el orden de las variantes", () => {
    const fotos = [
      { url: ia("rosa"), colorCodigo: "ROS" },
      { url: ia("verde"), colorCodigo: "VER" },
    ];
    expect(moldeDeLaPrenda(["VER", "ROS"], fotos)).toBe(ia("verde"));
  });

  it("salta los colores sin foto de IA", () => {
    expect(moldeDeLaPrenda(["VER", "ROS"], [{ url: real("verde"), colorCodigo: "VER" }, { url: ia("rosa"), colorCodigo: "ROS" }])).toBe(ia("rosa"));
  });

  it("la foto «para todos los colores» no es molde", () => {
    expect(moldeDeLaPrenda(["VER"], [{ url: ia("general"), colorCodigo: null }])).toBeNull();
    expect(moldeDeLaPrenda(["VER"], [{ url: ia("general"), colorCodigo: null }, { url: ia("verde"), colorCodigo: "VER" }])).toBe(ia("verde"));
  });

  it("sin ninguna de IA no hay molde", () => {
    expect(moldeDeLaPrenda(["VER"], [{ url: real("verde"), colorCodigo: "VER" }])).toBeNull();
    expect(moldeDeLaPrenda([], [])).toBeNull();
  });
});

describe("moldeAlPreparar — la hoja y el pedido usan la misma regla (revisión 2026-11-16)", () => {
  const ia = (n: string) => `https://x/fotos/${n}.jpg.ia.png`;
  // Beige es el primer color (el molde) y salió buzo; Negro se hizo copiando a Beige.
  const fotos = [
    { url: ia("beige"), colorCodigo: "BEI" },
    { url: ia("negro"), colorCodigo: "NEG" },
  ];

  it("rehacer el color que ES el molde va sin molde: ni su propio buzo, ni el Negro que se copió de él", () => {
    expect(moldeAlPreparar(["BEI", "NEG"], fotos, "BEI")).toEqual({ tipo: "sin-molde" });
  });

  it("rehacer otro color usa el molde de la prenda (la misma forma en todos los colores)", () => {
    expect(moldeAlPreparar(["BEI", "NEG"], fotos, "NEG")).toEqual({ tipo: "molde", url: ia("beige") });
    expect(moldeAlPreparar(["BEI", "NEG"], fotos, "AZU")).toEqual({ tipo: "molde", url: ia("beige") });
  });

  it("la foto «para todos los colores» no usa molde ni espera a nadie", () => {
    expect(moldeAlPreparar(["BEI"], fotos, null)).toEqual({ tipo: "sin-molde" });
  });

  it("sin ninguna foto de IA todavía: «ninguno» (espera al que se prepara, o pasa a ser el molde)", () => {
    expect(moldeAlPreparar(["BEI"], [], "BEI")).toEqual({ tipo: "ninguno" });
  });

  it("es exactamente lo que la hoja anuncia: muestra «Misma forma que …» solo cuando el pedido usa un molde", () => {
    for (const color of ["BEI", "NEG", "AZU"]) {
      const url = moldeDeLaPrenda(["BEI", "NEG"], fotos);
      const colorDelMolde = fotos.find((f) => f.url === url)?.colorCodigo ?? null;
      const laHojaLoAnuncia = colorDelMolde !== color;
      expect(moldeAlPreparar(["BEI", "NEG"], fotos, color).tipo === "molde", color).toBe(laHojaLoAnuncia);
    }
  });
});

describe("firmaDeImagen — /chaos 2026-11-13: un archivo que no es imagen no llega a OpenAI", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]);
  it("reconoce JPEG, PNG y WebP por sus primeros bytes", () => {
    expect(firmaDeImagen(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(firmaDeImagen(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(firmaDeImagen(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  });
  it("un texto con nombre .jpg no es imagen", () => {
    expect(firmaDeImagen(new TextEncoder().encode("hola, esto no es una foto <script>"))).toBeNull();
    expect(firmaDeImagen(new Uint8Array([]))).toBeNull();
    // RIFF de otra cosa (un WAV) tampoco
    expect(firmaDeImagen(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });
});

describe("avisoIANoRespondio — /chaos 2026-11-13: el aviso dice de qué color quedó la foto real", () => {
  it("nombra el color, o la foto para todos los colores", () => {
    expect(avisoIANoRespondio("de Verde agua")).toBe("La IA no respondió: quedó tu foto de Verde agua.");
    expect(avisoIANoRespondio("para todos los colores")).toBe("La IA no respondió: quedó tu foto para todos los colores.");
  });
});

// Auditoría 2026-11-15.
describe("ladosParaAchicar: la foto para la IA siempre termina entrando bajo el tope del servidor", () => {
  it("empieza en el lado máximo y baja de a 20 %, sin pasar del mínimo que todavía sirve de molde", () => {
    const lados = ladosParaAchicar();
    expect(lados[0]).toBe(LADO_MAXIMO_IA);
    expect(lados).toEqual([...lados].sort((a, b) => b - a));
    expect(new Set(lados).size).toBe(lados.length);
    expect(Math.min(...lados)).toBeGreaterThanOrEqual(480);
    expect(lados.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < lados.length; i++) expect(lados[i]).toBe(Math.floor(lados[i - 1] * 0.8));
  });

  it("un PNG (el navegador no escribió WebP) baja de 1 MB antes de agotar los lados: a 524 px pesa la décima parte que a 1.600", () => {
    // El peso de una imagen sin comprimir crece con su área: del primer lado al último, el área baja más de 9 veces.
    const lados = ladosParaAchicar();
    expect((lados[0] / lados[lados.length - 1]) ** 2).toBeGreaterThan(9);
  });

  it("con un mínimo mayor que el máximo devuelve igual un lado: nunca deja a la foto sin intento", () => {
    expect(ladosParaAchicar(400, 480)).toEqual([400]);
  });
});

describe("la espera del navegador", () => {
  it("va por encima de lo que el servidor puede tardar (120 s de OpenAI, 150 s de la función): no corta una respuesta que viene", () => {
    expect(ESPERA_DEL_NAVEGADOR_MS).toBeGreaterThan(150_000);
    expect(ESPERA_DEL_NAVEGADOR_MS).toBeLessThanOrEqual(180_000);
  });
});
