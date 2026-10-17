import "server-only";

// Las dos letras de la marca para las imágenes que arma `next/og` (ADR-0434, actividad 9): EB Garamond para el título y DM Sans para lo
// demás, las mismas de la tienda (`app/layout.tsx`, `next/font/google`). `next/og` no lee las de la página: necesita el archivo, y en
// TTF (no sabe leer el WOFF2 que guarda `next/font`). Se piden a Google Fonts una vez por servidor y quedan en memoria. Si Google no
// contesta en 3 s, la imagen sale igual con la letra que trae `next/og` (Geist), y la próxima imagen lo vuelve a intentar (principio 9).

type Peso = 500 | 600 | 700;
export type FuenteOg = { name: string; data: ArrayBuffer; weight: Peso; style: "normal" | "italic" };

const PEDIDO = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;1,500&family=DM+Sans:wght@600;700";
const ESPERA_MS = 3000;

let enCamino: Promise<FuenteOg[]> | null = null;

/** Las fuentes de la marca, o ninguna si Google no las dio (la imagen sale con la letra de fábrica). */
export function fuentesDeLaMarca(): Promise<FuenteOg[]> {
  enCamino ??= cargar().then(
    (fuentes) => {
      if (fuentes.length === 0) enCamino = null;
      return fuentes;
    },
    () => {
      enCamino = null;
      return [];
    },
  );
  return enCamino;
}

async function cargar(): Promise<FuenteOg[]> {
  // Sin un navegador conocido en la cabecera, Google responde con TTF.
  const css = await (await fetch(PEDIDO, { signal: AbortSignal.timeout(ESPERA_MS) })).text();
  const caras = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].flatMap(([, cuerpo]) => {
    const familia = /font-family:\s*'([^']+)'/.exec(cuerpo)?.[1];
    const estilo = /font-style:\s*(normal|italic)/.exec(cuerpo)?.[1] as FuenteOg["style"] | undefined;
    const peso = Number(/font-weight:\s*(\d+)/.exec(cuerpo)?.[1]) as Peso;
    const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(cuerpo)?.[1];
    return familia && estilo && url && [500, 600, 700].includes(peso) ? [{ familia, estilo, peso, url }] : [];
  });
  return Promise.all(
    caras.map(async (c) => ({
      name: c.familia,
      style: c.estilo,
      weight: c.peso,
      data: await (await fetch(c.url, { signal: AbortSignal.timeout(ESPERA_MS) })).arrayBuffer(),
    })),
  );
}
