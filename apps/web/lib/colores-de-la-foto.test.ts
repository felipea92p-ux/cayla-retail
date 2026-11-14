import { describe, expect, it } from "vitest";
import { leerColores, llaveDelColor, propuestaInicial, UMBRALES, type ColorDeCarta, type PixelesRGBA } from "./colores-de-la-foto";

// Una carta chica con los tonos reales de la base (retail.colores, 2026-11-13).
const CARTA: ColorDeCarta[] = [
  { codigo: "VIN", nombre: "Vino", hex: "#6C2831", familiaColor: "rojo", tipo: "solido" },
  { codigo: "MSA", nombre: "Marsala", hex: "#964F4C", familiaColor: "rojo", tipo: "solido" },
  { codigo: "CRU", nombre: "Crudo", hex: "#F3ECE0", familiaColor: "neutro", tipo: "solido" },
  { codigo: "BLA", nombre: "Blanco", hex: "#F4F9FF", familiaColor: "neutro", tipo: "solido" },
  { codigo: "COB", nombre: "Cobalto", hex: "#00539C", familiaColor: "azul", tipo: "solido" },
  { codigo: "AZM", nombre: "Azul marino", hex: "#2A304E", familiaColor: "azul", tipo: "solido" },
  { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", familiaColor: "neutro", tipo: "solido" },
  { codigo: "GRA", nombre: "Gris antracita", hex: "#48464A", familiaColor: "neutro", tipo: "solido" },
  { codigo: "AMA", nombre: "Amarillo", hex: "#F0C05A", familiaColor: "amarillo", tipo: "solido" },
  { codigo: "VHO", nombre: "Verde hoja", hex: "#4A7A2E", familiaColor: "verde", tipo: "solido" },
  { codigo: "ROJ", nombre: "Rojo", hex: "#BD332D", familiaColor: "rojo", tipo: "solido" },
  { codigo: "NAR", nombre: "Naranja", hex: "#E8762D", familiaColor: "naranja", tipo: "solido" },
  // No entran a la comparación: un estampado y una mezcla no se ven en un píxel.
  { codigo: "RAY", nombre: "Rayas crudo", hex: "#F3ECE0", familiaColor: "neutro", tipo: "estampado" },
  { codigo: "CRC", nombre: "Crudo con cobalto", hex: "#F3ECE0", familiaColor: "neutro", tipo: "solido", componentes: ["CRU", "COB"] },
];

const W = 160;
const H = 200;
type Rgb = [number, number, number];
const deHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/**
 * Una prenda armada píxel a píxel: un rectángulo central (el cuerpo) con luz y sombra de lado a lado, como una foto real. `pintar`
 * decide el color de cada píxel de la prenda; `fondo` es null para el PNG sin fondo de la IA.
 */
function prenda(pintar: (x: number, y: number) => string | null, fondo: string | null = null): PixelesRGBA {
  const datos = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const tono = x >= 20 && x < W - 20 && y >= 15 && y < H - 15 ? pintar(x, y) : null;
      // `null` dentro de la prenda es un hueco: se ve el fondo tal cual, sin la luz de la tela (el cuello de un halter, el encaje).
      if (tono === null) {
        if (fondo) {
          const [r, g, b] = deHex(fondo);
          datos.set([r, g, b, 255], i);
        }
        continue;
      }
      // La luz: más oscuro en los costados, un brillo suave a 40 % (±8 %), y un pliegue cada 30 px.
      const luz = 0.92 + 0.08 * Math.sin(((x - 20) / (W - 40)) * Math.PI) - ((x % 30) < 3 ? 0.06 : 0);
      const [r, g, b] = deHex(tono);
      datos.set([r * luz, g * luz, b * luz, 255], i);
    }
  }
  return { ancho: W, alto: H, datos };
}

const nombres = (l: ReturnType<typeof leerColores>) => (l.tipo === "sin-prenda" ? [] : l.partes.map((p) => p.color.codigo));

describe("leerColores", () => {
  it("una prenda de un solo tono, con luz, sombra y botones, es ese color; los botones son detalle", () => {
    const l = leerColores(
      prenda((x, y) => (Math.abs(x - 80) < 3 && y % 25 < 4 ? "#F4F2EE" : "#6C2831")),
      CARTA,
    );
    expect(l.tipo).toBe("liso");
    expect(nombres(l)).toEqual(["VIN"]);
    if (l.tipo !== "sin-prenda") expect(l.detalles.reduce((s, d) => s + d.parte, 0)).toBeLessThan(UMBRALES.detalle);
    expect(propuestaInicial(l)).toEqual(["VIN"]);
  });

  it("control: sin luz ni sombra la prenda lisa también sale de un solo color (la regla de los tonos no inventa nada)", () => {
    const datos = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) datos.set([108, 40, 49, 255], i * 4);
    const l = leerColores({ ancho: W, alto: H, datos }, CARTA);
    expect(nombres(l)).toEqual(["VIN"]);
  });

  it("crudo con mangas cobalto (zonas grandes) es una mezcla: la base es la que más se ve", () => {
    const l = leerColores(prenda((x) => (x < 45 || x > 115 ? "#00539C" : "#F3ECE0")), CARTA);
    expect(l.tipo).toBe("mezcla");
    expect(nombres(l)).toEqual(["CRU", "COB"]);
    expect(propuestaInicial(l)).toEqual(["CRU", "COB"]);
  });

  it("tres colores en zonas grandes son una mezcla de tres", () => {
    const l = leerColores(prenda((x, y) => (y > 150 ? "#2D2C2F" : x < 45 || x > 115 ? "#00539C" : "#F3ECE0")), CARTA);
    expect(l.tipo).toBe("mezcla");
    expect(new Set(nombres(l))).toEqual(new Set(["CRU", "COB", "NEG"]));
    expect(nombres(l)[0]).toBe("CRU");
  });

  it("rayas finas que se repiten parecen un estampado, no una mezcla", () => {
    const l = leerColores(prenda((_, y) => (Math.floor(y / 6) % 2 ? "#2A304E" : "#F3ECE0")), CARTA);
    expect(l.tipo).toBe("estampado");
    expect(new Set(nombres(l))).toEqual(new Set(["CRU", "AZM"]));
    // Un estampado no propone partes: pregunta.
    expect(propuestaInicial(l)).toEqual([]);
  });

  it("control del dibujo: las mismas dos tintas en dos bloques grandes son mezcla", () => {
    const l = leerColores(prenda((_, y) => (y < 100 ? "#2A304E" : "#F3ECE0")), CARTA);
    expect(l.tipo).toBe("mezcla");
  });

  it("más de cuatro colores es «muchos»", () => {
    const franjas = ["#6C2831", "#F3ECE0", "#00539C", "#F0C05A", "#4A7A2E", "#E8762D"];
    const l = leerColores(prenda((x) => franjas[Math.min(5, Math.floor((x - 20) / 20))]), CARTA);
    expect(l.tipo).toBe("muchos");
  });

  it("un tono que la carta no tiene sale sin color propuesto: se pregunta, no se pone a escondidas", () => {
    const l = leerColores(prenda(() => "#288282"), CARTA);
    expect(l.tipo).toBe("liso");
    if (l.tipo !== "sin-prenda") expect(l.partes[0].distancia).toBeGreaterThan(UMBRALES.carta);
    expect(propuestaInicial(l)).toEqual([null]);
  });

  it("con fondo: se quita lo que se parece al borde y la prenda se lee igual", () => {
    const l = leerColores(prenda(() => "#6C2831", "#FFFFFF"), CARTA);
    expect(l.tipo).toBe("liso");
    expect(nombres(l)).toEqual(["VIN"]);
    if (l.tipo !== "sin-prenda") expect(l.transparente).toBe(false);
  });

  it("con fondo casi igual a la prenda: avisa a qué color se parece el fondo", () => {
    const l = leerColores(prenda((x) => (x < 45 || x > 115 ? "#00539C" : "#F3ECE0"), "#F2EBDF"), CARTA);
    if (l.tipo === "sin-prenda") throw new Error("debía ver la prenda");
    expect(l.fondoComo?.codigo).toBe("CRU");
  });

  it("una foto sin prenda (todo transparente) no inventa colores", () => {
    const l = leerColores({ ancho: W, alto: H, datos: new Uint8ClampedArray(W * H * 4) }, CARTA);
    expect(l.tipo).toBe("sin-prenda");
  });

  it("la misma foto da siempre lo mismo", () => {
    const foto = prenda((x, y) => (y > 150 ? "#2D2C2F" : x < 45 || x > 115 ? "#00539C" : "#F3ECE0"));
    expect(leerColores(foto, CARTA)).toEqual(leerColores(foto, CARTA));
  });

  it("no compara con estampados ni con mezclas de la carta", () => {
    const l = leerColores(prenda(() => "#F3ECE0"), CARTA);
    expect(nombres(l)).toEqual(["CRU"]);
  });
});

describe("leerColores — los fallos que salieron con fotos reales (actividad 2, 90 fotos de producción)", () => {
  it("un floral con bordes suaves no se vuelve un solo color inventado: los tonos intermedios no encadenan rojo con crudo", () => {
    // Flores rojas sobre crudo con un borde de 2 px que pasa por rosados, con luz suave y sin pliegues, sobre PNG sin fondo. Con «Palo rosa»
    // en la carta (como la real), el lector de antes juntaba todo en cadena y lo daba liso «Palo rosa», un color que la prenda no tiene.
    const carta = [
      ...CARTA,
      { codigo: "PAL", nombre: "Palo rosa", hex: "#D8A7A0", familiaColor: "rosado", tipo: "solido" },
      { codigo: "COR", nombre: "Coral", hex: "#EA6759", familiaColor: "rojo", tipo: "solido" },
    ];
    const [rojo, crudo] = [deHex("#BD332D"), deHex("#F3ECE0")];
    const datos = new Uint8ClampedArray(W * H * 4);
    for (let y = 15; y < H - 15; y++) {
      for (let x = 20; x < W - 20; x++) {
        const d = Math.hypot(((x - 20) % 24) - 12, ((y - 15) % 24) - 12);
        const t = d < 6 ? 0 : d < 8 ? (d - 6) / 2 : 1;
        const luz = 0.92 + 0.08 * Math.sin(((x - 20) / (W - 40)) * Math.PI);
        datos.set([...rojo.map((v, k) => (v + (crudo[k] - v) * t) * luz), 255], (y * W + x) * 4);
      }
    }
    const l = leerColores({ ancho: W, alto: H, datos }, carta);
    expect(l.tipo).not.toBe("liso");
    expect(nombres(l)).toEqual(expect.arrayContaining(["CRU", "ROJ"]));
  });

  it("rayas reales, achicadas con suavizado como en el navegador, no salen «Gris» liso", () => {
    // /formidable (2026-11-13): rayas de 12 px en una foto de 400×500 salían «Gris 100 %». Al achicar a 220 px, el borde de cada raya
    // queda en tonos intermedios que unían crudo con azul marino en cadena.
    const [AW, AH, aW, aH] = [400, 500, 176, 220];
    const [crudo, marino] = [deHex("#F3ECE0"), deHex("#2A304E")];
    const grande = (x: number, y: number) => (x >= 40 && x < AW - 40 && y >= 30 && y < AH - 30 ? (Math.floor(y / 12) % 2 ? marino : crudo) : null);
    const datos = new Uint8ClampedArray(aW * aH * 4);
    const fx = AW / aW, fy = AH / aH;
    for (let y = 0; y < aH; y++) {
      for (let x = 0; x < aW; x++) {
        // Promedio del bloque de píxeles grandes que cae en este píxel chico (lo que hace el navegador al achicar).
        let n = 0, r = 0, g = 0, bl = 0, opacos = 0;
        for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy++) {
          for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx++) {
            n++;
            const c = grande(xx, yy);
            if (c) { opacos++; r += c[0]; g += c[1]; bl += c[2]; }
          }
        }
        if (opacos === n) datos.set([r / n, g / n, bl / n, 255], (y * aW + x) * 4);
      }
    }
    const carta = [...CARTA, { codigo: "GRI", nombre: "Gris", hex: "#848587", familiaColor: "neutro", tipo: "solido" }];
    const l = leerColores({ ancho: aW, alto: aH, datos }, carta);
    expect(l.tipo).not.toBe("liso");
    expect(nombres(l)).toEqual(expect.arrayContaining(["CRU", "AZM"]));
  });

  it("el fondo que se ve por un hueco de la prenda no se suma como otro color", () => {
    // Un escote ancho: el lector de antes lo daba «Vino con blanco», una mezcla que no existe.
    const l = leerColores(prenda((x, y) => (Math.abs(x - 80) < 20 && y > 30 && y < 90 ? null : "#6C2831"), "#FAFAFA"), CARTA);
    expect(l.tipo).toBe("liso");
    expect(nombres(l)).toEqual(["VIN"]);
  });

  it("control: una blusa blanca sobre fondo blanco no se borra entera", () => {
    const l = leerColores(prenda(() => "#F4F9FF", "#F4F9FF"), CARTA);
    expect(l.tipo).toBe("liso");
    expect(nombres(l)).toEqual(["BLA"]);
  });
});

describe("llaveDelColor", () => {
  it("un color es su código; una mezcla, la base y los acompañantes en orden de código", () => {
    expect(llaveDelColor(["VIN"])).toBe("VIN");
    expect(llaveDelColor(["CRU", "NEG", "COB"])).toBe("CRU,COB,NEG");
    expect(llaveDelColor(["CRU", "COB", "NEG"])).toBe(llaveDelColor(["CRU", "NEG", "COB"]));
  });
  it("la base manda: «Crudo con cobalto» no es «Cobalto con crudo»", () => {
    expect(llaveDelColor(["CRU", "COB"])).not.toBe(llaveDelColor(["COB", "CRU"]));
  });
  it("un código repetido no hace mezcla", () => {
    expect(llaveDelColor(["VIN", "VIN"])).toBe("VIN");
  });
});
