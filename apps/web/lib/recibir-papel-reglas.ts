import { contadasDe, prendasAnotadasDe, SEPARADO_VACIO, type ClaveLinea, type LineaParaContar } from "./recepcion-conteo-reglas";
import { agruparLineas } from "./recepcion-grupos-reglas";

// Recibir mirando el papel de la compra (rediseño de Compras simple, maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23).
// Lo que la compradora anotó al comprar viene en las líneas del envío: la tienda las ve al lado de la foto
// del papel, con su estado (la que sigue, la contada). Se cuenta en el contador de siempre; nada de esto cambia qué se guarda ni cómo se
// cierra el envío. (La tarjeta «Llevas contadas / ¿Son estas?» se quitó el 2026-10-26, a pedido de Felipe.)

export type EstadoAnotada = "contada" | "a-medias" | "pendiente";

/**
 * Lo que anotó la compradora: las líneas de la guía del envío. Un envío con papeles lo arma «Mandar a la tienda» (`mandar_compras_a_tienda`)
 * solo con lo comprado desde el celular, así que toda su guía es lo anotado; lo que la tienda agrega «fuera de la guía» no lo es. Quien la
 * llama lo hace solo cuando el envío trae papeles.
 */
export function lineasAnotadas(lineas: readonly LineaParaContar[]): LineaParaContar[] {
  return lineas.filter((l) => l.linea !== null && l.dijeron != null);
}

/**
 * Cómo va una línea anotada: contada (llegó lo que dijeron), a medias (llegó menos) o por contar. `identificadas` es lo que se contó DE ESA
 * PRENDA (`avanceDeAnotadas`); sin él, vale lo contado de la línea, que es un reparto del total de la categoría.
 */
export function estadoAnotada(l: LineaParaContar, identificadas: number = contadasDe(l)): EstadoAnotada {
  if (l.conteo === null) return "pendiente";
  return identificadas >= (l.dijeron ?? 0) ? "contada" : "a-medias";
}

const normaliza = (d: string): string => d.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

/**
 * Cuántas de cada prenda anotada se contaron de verdad (Felipe 2026-10-27): lo que la persona identificó en «¿Qué … son?», no el reparto
 * del total de la categoría. Antes, con 6 contadas de pantalones y solo Pantalón Carla (4) identificada, el papel mostraba a Pantalón Mía
 * «2 de 4»: eran los 2 que sobraban del total. Ahora Mía queda en «0 de 4» hasta que se identifique.
 *
 * Cada línea toma lo suyo de lo separado de su categoría, en el orden de la compra: la misma prenda anotada en dos líneas se reparte entre
 * ellas, y lo que ya entró al stock de la línea (un envío reabierto) cuenta como suyo. Una línea sin prenda anotada (ni la del catálogo ni un
 * nombre) no puede identificarse por sí sola: toma lo contado de la línea, como antes. Sin pasarse de lo que dijeron.
 */
export function avanceDeAnotadas(lineas: readonly LineaParaContar[]): Map<ClaveLinea, number> {
  const avance = new Map<ClaveLinea, number>();
  for (const g of agruparLineas(lineasAnotadas(lineas))) {
    const separado = g.separado ?? SEPARADO_VACIO;
    const pool = new Map<string, number>();
    for (const p of separado.prendas) pool.set(`p:${p.productoId}`, (pool.get(`p:${p.productoId}`) ?? 0) + p.cantidad);
    for (const n of separado.nuevas) if (n.descripcion) pool.set(`n:${normaliza(n.descripcion)}`, (pool.get(`n:${normaliza(n.descripcion)}`) ?? 0) + n.cantidad);
    for (const l of g.lineas) {
      const dijeron = l.dijeron ?? 0;
      const prenda = prendasAnotadasDe(l)[0];
      if (!prenda) {
        avance.set(l.clave, Math.min(dijeron, contadasDe(l)));
        continue;
      }
      const clave = prenda.productoId ? `p:${prenda.productoId}` : `n:${normaliza(prenda.nombre)}`;
      const entro = l.conteo?.enStock ?? 0;
      const toma = Math.min(pool.get(clave) ?? 0, Math.max(0, dijeron - entro));
      pool.set(clave, (pool.get(clave) ?? 0) - toma);
      avance.set(l.clave, Math.min(dijeron, entro + toma));
    }
  }
  return avance;
}

/** Cómo la llamó la compradora: la prenda que eligió, lo que escribió o, al menos, su categoría. */
export function nombreAnotado(l: LineaParaContar): string {
  return l.linea?.prendaElegida?.nombre ?? l.linea?.descripcion ?? l.categoria?.nombre ?? "Prenda";
}

/** La que sigue: la primera anotada que todavía no se cuenta. */
export function siguienteAnotada(lineas: readonly LineaParaContar[]): LineaParaContar | null {
  return lineasAnotadas(lineas).find((l) => estadoAnotada(l) === "pendiente") ?? null;
}
