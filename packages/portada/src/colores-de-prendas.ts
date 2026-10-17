import { luminancia } from "./contraste";
import { DISENO_DE_SIEMPRE, paletaDePrenda, type ColoresPropios } from "./diseno";
import { seLee } from "./revision";

/** Una prenda de la campaña con sus colores (el nombre y el `#rrggbb` de cada uno). */
export type PrendaConColores = { nombre: string; colores: readonly { nombre: string; hex: string }[] };

/**
 * Paletas sacadas de las prendas de la campaña (maqueta, paso «Colores»): el color de una prenda de fondo, con el de otra prenda clara del
 * mismo modelo de acento si la hay. Solo las que se leen en claro y en oscuro, primero las más oscuras (son las que mejor quedan de
 * fondo), sin repetir un color y hasta `max`.
 */
export function paletasDeLasPrendas(prendas: readonly PrendaConColores[], max = 3): ColoresPropios[] {
  const vistos = new Set<string>();
  const candidatas: { lum: number; paleta: ColoresPropios }[] = [];
  for (const p of prendas) {
    for (const c of p.colores) {
      const hex = c.hex.toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex) || vistos.has(hex)) continue;
      vistos.add(hex);
      const clara = p.colores.find((o) => o.hex.toLowerCase() !== hex && /^#[0-9a-f]{6}$/i.test(o.hex) && luminancia(o.hex) > 0.35);
      const paleta = paletaDePrenda(`De ${p.nombre} ${c.nombre.toLowerCase()}`.slice(0, 60), hex, clara?.hex ?? null);
      const diseno = { ...DISENO_DE_SIEMPRE, paleta: "propia", colores: paleta };
      if (seLee(diseno, "claro") && seLee(diseno, "oscuro")) candidatas.push({ lum: luminancia(hex), paleta });
    }
  }
  return candidatas
    .sort((a, b) => a.lum - b.lum)
    .slice(0, max)
    .map((c) => c.paleta);
}
