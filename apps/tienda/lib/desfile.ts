import {
  colorDeDibujo,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  precioTarjeta,
  type Forma,
  type Prenda,
} from "./catalogo";

// El desfile de «Lo nuevo» (ADR-0524, «G · Pasarela»): las prendas que llegaron hace menos salen una por una a un escenario negro, cruzan hacia la luz,
// estalla el flash y siguen su camino. Esto es la parte pura —qué prendas salen, en qué orden, con qué texto y a qué ritmo—; el movimiento vive en
// `components/desfile/EscenarioDelDesfile.tsx`. Con su prueba.

/** Cuántas salidas tiene el desfile como máximo: más son más fotos grandes que pedir para una portada que se ve en un teléfono. */
export const SALIDAS_MAX = 6;

/** El ritmo del desfile en milisegundos (el de la maqueta): espera antes de arrancar, lo que tarda en cruzar hasta la luz, lo que se queda quieta, lo
 *  que tarda en irse, y el flash. La primera prenda ya está quieta en la luz al cargar: `primera` es lo que se queda así antes de irse la primera vez
 *  (en la maqueta aparecía a los 2,8 s; en la tienda real eso sería lo más lento de la portada, ADR-0524). */
export const RITMO = { primera: 1800, entra: 1500, queda: 1700, sale: 1300, flash: 520, vigilia: 250 } as const;

/** Una salida del desfile: lo que dicen su leyenda y su programa, y lo que dibuja su foto (la silueta de su color si no tiene foto). */
export type PiezaDelDesfile = {
  id: string;
  /** «01», «02»…: el número de la salida. */
  salida: string;
  nombre: string;
  categoria: string | null;
  href: string;
  precio: string;
  anterior: string | null;
  oferta: boolean;
  foto: string | null;
  optimizar: boolean;
  forma: Forma;
  color: string | null;
  /** Lo que ya se ve de la prenda, para la ficha que llega (`RecordarPrendaTocada`). */
  datos: { nombre: string; precio: string; antes?: string; oferta?: "si"; categoria?: string };
};

/** El número de una salida, con dos cifras: «01». */
export const salidaTexto = (n: number): string => String(n).padStart(2, "0");

/** La salida que sigue a la `i`, dando la vuelta al terminar. Sin salidas no hay siguiente. */
export const siguienteSalida = (i: number, total: number): number => (total <= 1 ? 0 : (i + 1) % total);

/** Las salidas del desfile, de las prendas que ya llegan ordenadas (`lasNuevas`: las que tienen foto primero). `max` deja pedir más para la lista del
 *  programa, que sigue el mismo orden y la misma numeración. */
export function piezasDelDesfile(prendas: readonly Prenda[], sede: string | null, origenFotos: string | undefined, max: number = SALIDAS_MAX): PiezaDelDesfile[] {
  return prendas.slice(0, max).map((p, i) => {
    const foto = fotosDeTarjeta(p)[0];
    const precio = precioTarjeta(p);
    return {
      id: p.id,
      salida: salidaTexto(i + 1),
      nombre: p.nombre,
      categoria: p.categoria?.nombre ?? null,
      href: hrefDePrenda(p, sede),
      precio: precio.principal,
      anterior: precio.anterior,
      oferta: precio.oferta,
      foto,
      optimizar: foto ? fotoOptimizable(foto, origenFotos) : false,
      forma: formaDe(p.categoria?.prefijo),
      color: colorDeDibujo(p),
      datos: {
        nombre: p.nombre,
        precio: precio.principal,
        ...(precio.anterior ? { antes: precio.anterior } : {}),
        ...(precio.oferta ? { oferta: "si" as const } : {}),
        ...(p.categoria?.nombre ? { categoria: p.categoria.nombre } : {}),
      },
    };
  });
}

/** Parte un título en palabras de letras sueltas para que suban una a una; las letras de cada palabra van juntas (el navegador no puede cortar una palabra
 *  a la mitad) y cada letra lleva su número de orden en todo el título. */
export function letrasDelTitulo(texto: string): { palabra: string; letras: { c: string; n: number }[] }[] {
  let n = 0;
  return texto
    .split(" ")
    .filter(Boolean)
    .map((palabra) => ({ palabra, letras: [...palabra].map((c) => ({ c, n: n++ })) }));
}

/**
 * La clave del escenario del desfile: cambia cuando cambian las prendas que salen (o su orden), y entonces el escenario arranca de cero. Promete que dos
 * visitas a la misma tienda dan la misma clave (no se reinicia solo) y que el esqueleto no se confunde con la escena de verdad.
 */
export function claveDelEscenario(modo: string, enEspera: boolean, piezas: readonly { id: string }[]): string {
  return `${modo}:${enEspera ? "espera" : piezas.map((p) => p.id).join("|")}`;
}
