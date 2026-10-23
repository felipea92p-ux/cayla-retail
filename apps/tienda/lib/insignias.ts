import { dibujoDeInsignia, dibujoElegido, type IconoInsignia } from "@cayla-retail/shared/insignias-visual";
import { esRutaDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";
import { z } from "zod";
import { normalizar } from "./buscador";

// Las insignias de Catálogo ▸ Insignias en la tienda (ADR-0489): lo que comparten la ficha de la prenda (sus chips) y la tarjeta del catálogo (hasta
// 3 y un «+N»). La base decide CUÁLES ve el cliente (`fn_tienda_insignias_de`: aprobadas, vigentes hoy, de esa tienda, sin descuento); aquí se leen sin
// confiar en ellas, se les busca su dibujo por el nombre y se decide cuántas caben. Lógica pura, con su prueba al lado (`insignias.test.ts`).

// Una insignia que la base entrega: su id y su nombre. Una con un dato raro se deja fuera; las demás se ven.
export const esquemaInsignia = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1),
});

/** Una insignia asignada a la prenda en Catálogo ▸ Insignias, sin descuento (el descuento sale como la campaña) y vigente hoy. */
export type Insignia = z.infer<typeof esquemaInsignia>;

// Lo que la FICHA lee de cada insignia, además de su id y su nombre (`fn_tienda_insignias`, ADR-0490): el dibujo que se eligió al crearla (`icono`; una clave que el
// código no conoce, o ninguna, es «según el nombre»), su imagen propia (`imagen`, la RUTA en el almacén de insignias: una ruta que no tiene la forma que el ERP sube
// es «sin imagen») y si lleva descuento (esas no se dibujan aparte: su descuento es el chip de la campaña, de la que solo se toma su dibujo). Sin esos datos (la base
// todavía no tiene 20261023203000, o es una lista del catálogo, que solo trae id y nombre): según el nombre, sin imagen y sin descuento, como antes. La tarjeta del
// catálogo sigue leyendo `esquemaInsignia`.
export const esquemaInsigniaDeLaFicha = esquemaInsignia.extend({
  icono: z.unknown().transform((v) => dibujoElegido(v)),
  imagen: z.unknown().transform((v) => (esRutaDeImagenDeInsignia(v) ? v : null)),
  descuento: z.boolean().catch(false),
});

/** Una insignia tal como la entrega la ficha: con su dibujo elegido, su imagen propia y si lleva descuento. */
export type InsigniaDeLaFicha = z.infer<typeof esquemaInsigniaDeLaFicha>;

function leerLista<T extends { id: string }>(dato: readonly unknown[], esquema: { safeParse: (x: unknown) => { success: true; data: T } | { success: false } }): T[] {
  const vistas = new Set<string>();
  return dato.flatMap((x): T[] => {
    const r = esquema.safeParse(x);
    if (!r.success || vistas.has(r.data.id)) return [];
    vistas.add(r.data.id);
    return [r.data];
  });
}

/** Las insignias que trae la base, sin confiar en ellas: la que no tiene forma de insignia se deja fuera y una repetida se cuenta una vez. */
export const leerInsignias = (dato: readonly unknown[]): Insignia[] => leerLista(dato, esquemaInsignia);

/** Las insignias de la ficha, con lo que `fn_tienda_insignias` agrega (el dibujo elegido, la imagen y el descuento), leídas con la misma cautela. */
export const leerInsigniasDeLaFicha = (dato: readonly unknown[]): InsigniaDeLaFicha[] => leerLista(dato, esquemaInsigniaDeLaFicha);

/** El dibujo de una insignia: su familia (la calabaza de Halloween, el pastel de Aniversario…) o, si su nombre no se reconoce, el genérico. */
export type DibujoDeInsignia = IconoInsignia | "generico";

/** El dibujo que le toca a una insignia o campaña: el que se eligió al crearla (`icono`, ADR-0490) o, si no hay, el de su NOMBRE: el mismo que le da el ERP en
 *  Catálogo ▸ Insignias (`packages/shared`). Una clave que el código ya no conoce cae al nombre. */
export const dibujoDeLaInsignia = (nombre: string, icono?: DibujoDeInsignia | null): DibujoDeInsignia => dibujoDeInsignia({ nombre, icono });

// Lo que la tienda ya dice por su cuenta, con sus propios números: una insignia que dice lo mismo no se repite al lado.
const COMO_NUEVO = new Set(["nuevo", "nueva", "nuevos", "nuevas"]);
const COMO_MAS_VENDIDO = new Set(["top ventas", "mas vendido", "mas vendidos"]);

/**
 * Las insignias sin las que la tienda ya dice por sí sola: la insignia «Nuevo» no se repite si la prenda ya es nueva por sus llegadas («Nuevo · llegó
 * hace…», «Nuevo» en la tarjeta) y «Top ventas» no se repite si ya dice su puesto («N.º 3 en más vendidos»). Se comparan por nombre, sin tildes ni
 * mayúsculas. Si la tienda no lo dice (llegó hace más de 30 días, no está en el ranking), la insignia asignada se ve igual: es lo que se marcó.
 */
export function sinLasQueLaTiendaYaDice<T extends { nombre: string }>(insignias: readonly T[], { nuevo, masVendido }: { nuevo: boolean; masVendido: boolean }): T[] {
  return insignias.filter(({ nombre }) => {
    const clave = normalizar(nombre).replace(/\s+/g, " ").trim();
    return !((nuevo && COMO_NUEVO.has(clave)) || (masVendido && COMO_MAS_VENDIDO.has(clave)));
  });
}

/** Lo máximo que dice la foto de una tarjeta, contando todo menos la empresa (CAYLA o CLAURE, que va aparte): lo demás pasa a un «+N» (Felipe, 2026-10-23). */
export const TOPE_DE_INSIGNIAS_EN_LA_TARJETA = 3;

export type InsigniasDeLaTarjeta = {
  /** Las que se dibujan, en el orden que manda la base. */
  visibles: Insignia[];
  /** Cuántas quedan fuera (el «+N»); 0 si caben todas. */
  mas: number;
  /** Los nombres de TODAS las asignadas (también las que no caben), para el lector de pantalla y para el «+N» al pasar el mouse. */
  nombres: string[];
};

/**
 * Cuántas de las insignias asignadas caben en la tarjeta. El tope es de todo lo que la foto ya dice —el descuento, «Nuevo», el puesto en Más
 * vendidos— MÁS las asignadas: `propias` es cuántas de esas la tarjeta ya dibuja (sin contar la empresa). Si las propias ya llenan el tope, ninguna
 * asignada se dibuja y todas van al «+N».
 */
export function insigniasDeLaTarjeta(
  asignadas: readonly Insignia[],
  { propias, nuevo, masVendido }: { propias: number; nuevo: boolean; masVendido: boolean },
  tope: number = TOPE_DE_INSIGNIAS_EN_LA_TARJETA,
): InsigniasDeLaTarjeta {
  const lista = sinLasQueLaTiendaYaDice(asignadas, { nuevo, masVendido });
  const caben = Math.max(0, tope - propias);
  return { visibles: lista.slice(0, caben), mas: Math.max(0, lista.length - caben), nombres: lista.map((i) => i.nombre.trim()) };
}

/**
 * Cuántas chips (en su orden) caben ENTERAS en una fila de `disponible` px, dejando lugar al «+N» si alguna queda fuera (`anchos`: lo que mide cada una;
 * `hueco`: el espacio entre dos; `anchoMas`: lo que mide el «+N»; `ocultasDeAntemano`: ya hay insignias que el tope de 3 dejó en el «+N», así que ese chip
 * va siempre). Es el recorte de la tarjeta angosta: una insignia cortada a la mitad («P…») no dice nada, así que se muestra completa o se cuenta en el «+N».
 * Nunca deja una fila más ancha que `disponible`: con 0 caben solo el «+N». Lógica pura; la tarjeta mide en el navegador (`FilaDeInsignias`).
 */
export function cuantasCaben(
  anchos: readonly number[],
  { hueco, anchoMas, disponible, ocultasDeAntemano }: { hueco: number; anchoMas: number; disponible: number; ocultasDeAntemano: boolean },
): number {
  for (let k = anchos.length; k >= 0; k--) {
    const chips = anchos.slice(0, k).reduce((suma, a) => suma + a, 0) + Math.max(0, k - 1) * hueco;
    const hayMas = k < anchos.length || ocultasDeAntemano;
    const total = chips + (hayMas ? (k > 0 ? hueco : 0) + anchoMas : 0);
    if (total <= disponible) return k;
  }
  return 0;
}
