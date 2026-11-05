import { conFotoPrimero, hrefDePrenda, soles, type Prenda } from "./catalogo";
import { lasNuevas } from "./inicio";
import { hayAlgo, type Tienda } from "./stock";

// La portada «L» de la tienda (ADR-0613): tres prendas nuevas que combinan, cada una sobre su color. Los grupos los elige una persona y los
// colores salen de cada prenda: un grupo armado por una regla no se ve como un outfit. Lo que manda es lo que hay de verdad: un grupo con una
// prenda agotada no sale, y si en la tienda elegida no queda ninguno, salen tres prendas nuevas sueltas, sin decir que combinan.

type PiezaElegida = { codigo: string; fondo: string; texto: string };
type GrupoElegido = readonly [PiezaElegida, PiezaElegida, PiezaElegida];

const OSCURO = "#17110D";
const CLARO = "#F4F1EA";

/** Los grupos, por el código de cada prenda. Hasta que el líder los elija desde el ERP, se cambian aquí. */
export const GRUPOS_DE_PORTADA: readonly GrupoElegido[] = [
  // Arequipa
  [
    { codigo: "CMS-0090", fondo: "#DCCBB8", texto: OSCURO },
    { codigo: "PAN-0033", fondo: "#4E1820", texto: CLARO },
    { codigo: "CHA-0019", fondo: "#191512", texto: CLARO },
  ],
  [
    { codigo: "CMS-0046", fondo: "#14284A", texto: CLARO },
    { codigo: "PAN-0032", fondo: "#EBD3C8", texto: "#2A0E12" },
    { codigo: "BLZ-0009", fondo: "#A8937B", texto: OSCURO },
  ],
  [
    { codigo: "TOP-0036", fondo: "#D9C7A8", texto: OSCURO },
    { codigo: "FAL-0010", fondo: "#26382F", texto: CLARO },
    { codigo: "CAS-0013", fondo: "#1E2A3A", texto: CLARO },
  ],
  // Trujillo
  [
    { codigo: "POL-0077", fondo: "#123E33", texto: CLARO },
    { codigo: "PAN-0030", fondo: "#E9D9B6", texto: OSCURO },
    { codigo: "CHA-0014", fondo: "#22303A", texto: CLARO },
  ],
  [
    { codigo: "TOP-0031", fondo: "#1F2B3A", texto: CLARO },
    { codigo: "FAL-0011", fondo: "#EADCC8", texto: OSCURO },
    { codigo: "BLZ-0008", fondo: "#8A3B22", texto: CLARO },
  ],
  [
    { codigo: "CMS-0012", fondo: "#3A1B24", texto: CLARO },
    { codigo: "FAL-0012", fondo: "#D9C7A8", texto: OSCURO },
    { codigo: "BLZ-0008", fondo: "#123E33", texto: CLARO },
  ],
];

/** Los fondos de las tres prendas sueltas: no hay una persona eligiendo, así que son los que sirven para cualquier prenda. */
const FONDOS_SUELTOS: readonly Omit<PiezaElegida, "codigo">[] = [
  { fondo: "#DCCBB8", texto: OSCURO },
  { fondo: "#4E1820", texto: CLARO },
  { fondo: "#191512", texto: CLARO },
];

const GRUPOS_A_LA_VEZ = 3;
const PRENDAS_POR_GRUPO = 3;

export type PrendaDePortada = { id: string; nombre: string; precio: string; href: string; foto: string; fondo: string; texto: string };
export type GrupoDePortada = {
  prendas: PrendaDePortada[];
  /** Tres prendas que una persona eligió juntas: solo entonces se dice que combinan y se suma su total. */
  combinan: boolean;
  total: string | null;
  /** En qué tiendas se puede recoger todo junto. Vacío con una tienda elegida: el cliente ya sabe dónde está. */
  donde: string[];
};

const nombresJuntos = (nombres: readonly string[]) =>
  nombres.length < 2 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

/** Lo que dice la portada de un grupo: «Estas tres combinan y hay en Arequipa.», o «Lo último que llegó.» si son prendas sueltas. */
export const fraseDelGrupo = (g: GrupoDePortada): string =>
  !g.combinan ? "Lo último que llegó." : g.donde.length ? `Estas tres combinan y hay en ${nombresJuntos(g.donde)}.` : "Estas tres combinan.";

/** Lo que dice debajo del total en el celular. */
export const dondeDelGrupo = (g: GrupoDePortada): string => (g.donde.length ? `Este outfit, en ${nombresJuntos(g.donde)}` : "Este outfit");

function prendaDePortada(p: Prenda, sede: string | null, colores: Omit<PiezaElegida, "codigo">): PrendaDePortada | null {
  const foto = p.fotos[0];
  if (!foto) return null;
  return { id: p.id, nombre: p.nombre, precio: soles(p.precioFinal), href: hrefDePrenda(p, sede), foto, ...colores };
}

/** Un color de los que no se recortan bien: una prenda blanca o muy clara se confunde con el fondo de su foto. */
const esMuyClara = (p: Prenda): boolean => {
  const hex = p.colores[0]?.hex;
  if (!hex) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.min(r, g, b) >= 225;
};

/** Tres prendas nuevas que se ven bien en grande, de tipos distintos si se puede. */
function prendasSueltas(prendas: readonly Prenda[], sede: string | null): GrupoDePortada | null {
  const candidatas = lasNuevas(prendas)
    .filter((p) => p.fotos[0] && !esMuyClara(p))
    .sort(conFotoPrimero);
  const elegidas: Prenda[] = [];
  const tipos = new Set<string | null>();
  for (const p of candidatas) {
    const tipo = p.categoria?.prefijo ?? null;
    if (tipos.has(tipo)) continue;
    tipos.add(tipo);
    elegidas.push(p);
    if (elegidas.length === PRENDAS_POR_GRUPO) break;
  }
  for (const p of candidatas) {
    if (elegidas.length === PRENDAS_POR_GRUPO) break;
    if (!elegidas.includes(p)) elegidas.push(p);
  }
  if (elegidas.length < PRENDAS_POR_GRUPO) return null;
  const lista = elegidas.flatMap((p, i) => prendaDePortada(p, sede, FONDOS_SUELTOS[i]) ?? []);
  return { prendas: lista, combinan: false, total: null, donde: [] };
}

/**
 * Los grupos que salen ahora en la portada, hasta tres. Un grupo sale si todas sus prendas se pueden recoger en un mismo lugar: en la tienda
 * elegida o, con «Todas», en alguna. Sin ninguno, tres prendas nuevas sueltas; sin eso, `[]` y la portada sigue siendo la de siempre.
 */
export function gruposDeLaPortada(
  prendas: readonly Prenda[],
  elegida: Tienda | null,
  tiendas: readonly Tienda[],
  sede: string | null,
  grupos: readonly GrupoElegido[] = GRUPOS_DE_PORTADA,
): GrupoDePortada[] {
  const porCodigo = new Map(prendas.flatMap((p) => (p.codigo ? [[p.codigo, p] as const] : [])));
  const salen: GrupoDePortada[] = [];
  for (const grupo of grupos) {
    const suyas = grupo.map((pieza) => porCodigo.get(pieza.codigo));
    if (suyas.some((p) => !p)) continue;
    const juntas = suyas as Prenda[];
    const lugares = (elegida ? [elegida] : tiendas).filter((t) => juntas.every((p) => hayAlgo(p.stock?.sedes[t.id])));
    if (lugares.length === 0) continue;
    const lista = juntas.flatMap((p, i) => prendaDePortada(p, sede, grupo[i]) ?? []);
    if (lista.length < PRENDAS_POR_GRUPO) continue;
    salen.push({
      prendas: lista,
      combinan: true,
      total: soles(juntas.reduce((suma, p) => suma + p.precioFinal, 0)),
      donde: elegida ? [] : lugares.map((t) => t.nombre),
    });
    if (salen.length === GRUPOS_A_LA_VEZ) break;
  }
  if (salen.length > 0) return salen;
  const sueltas = prendasSueltas(prendas, sede);
  return sueltas ? [sueltas] : [];
}
