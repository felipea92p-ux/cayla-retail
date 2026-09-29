// Las fotos de una prenda, POR COLOR (ficha «Editar producto», ADR-0279; spike docs/maquetas/producto-fotos-por-color-2026-09/).
//
// Contrato (3 líneas). PROMETE: dada la lista de fotos de una prenda y los colores que vende hoy, decir qué ve cada color
// (`vistaDeFotos`) y devolver la lista nueva tras cada gesto (agregar, quitar, hacer principal, ponerla primera, pasarla de
// color) SIN romper que haya exactamente una principal —la base tiene un índice único parcial sobre `es_principal`—.
// ASUME: el orden del arreglo ES el orden que se guarda (`orden` = posición), y que cada foto ya viene con el color como
// se ve (`fotosComoSeVen`, lib/variantes-ficha-reglas.ts): las mudanzas de un color corregido no son de este archivo.
// NO PROMETE: subir bytes (lib/producto-fotos.ts), ni anclar el color de origen (`anclarFotos`), ni la pantalla.
//
// La causa que la originó: toda foto nueva nacía sin color y `fotoDeVariante` (lib/producto-fotos-reglas.ts) la usa para
// TODOS los colores que no tengan la suya. Aquí una foto nace dentro de un color: se agrega desde su tarjeta.

/** Una foto de la ficha. `colorCodigo: null` = «Todos los colores» (se ve en los colores que no tienen la suya). */
export type FotoLocal = {
  /** Estable para la key de React — no es el id de la fila (esa puede no existir todavía). */
  clientKey: string;
  /** Presente = ya existe una fila en `producto_fotos`. Ausente = subida en esta sesión. */
  id: string | null;
  url: string;
  esPrincipal: boolean;
  colorCodigo: string | null;
};

/** Lo mínimo que estas reglas leen de una foto: sirven también para las de la ficha (que traen `fijo`). */
type Foto = Pick<FotoLocal, "clientKey" | "esPrincipal" | "colorCodigo">;

/** Qué se ve en un color: sus fotos, la de «Todos los colores», o nada. */
export type EstadoColor = "con-fotos" | "usa-la-general" | "sin-foto";

export function estadoDeColor(propias: number, generales: number): EstadoColor {
  if (propias > 0) return "con-fotos";
  return generales > 0 ? "usa-la-general" : "sin-foto";
}

export type TarjetaColor<T extends Foto> = { codigo: string; fotos: T[]; estado: EstadoColor };

export type VistaFotos<T extends Foto> = {
  /** Un color de la prenda por tarjeta, en el orden de sus variantes. */
  tarjetas: TarjetaColor<T>[];
  /** «Todos los colores». Sin colores en la prenda es la única tarjeta: las fotos de «la prenda». */
  general: { fotos: T[]; visible: boolean; sinColores: boolean };
  /** Fotos de un color que la prenda ya no vende (sin variantes activas): no se pierden ni se esconden, se avisan. */
  huerfanas: T[];
  /** Colores con foto propia, y colores en total: «3 de 4 colores con foto». */
  conFoto: number;
  total: number;
};

/**
 * Lo que la pantalla dibuja. `colores` son los que la prenda vende hoy (variantes activas); `null` («Sin color») no es un
 * color con tarjeta: una prenda sin colores tiene una sola tarjeta, la general.
 *
 * «Todos los colores» se muestra si la prenda tiene 2 o más colores (para agregarla), si ya tiene fotos así, o si no tiene
 * colores. Con UN solo color la foto general no aporta nada, pero una que ya existe no se esconde.
 */
export function vistaDeFotos<T extends Foto>(colores: readonly (string | null)[], fotos: readonly T[]): VistaFotos<T> {
  const codigos = [...new Set(colores.filter((c): c is string => c !== null))];
  const generales = fotos.filter((f) => f.colorCodigo === null);
  const tarjetas = codigos.map((codigo) => {
    const propias = fotosDelColor(fotos, codigo);
    return { codigo, fotos: propias, estado: estadoDeColor(propias.length, generales.length) };
  });
  const sinColores = codigos.length === 0;
  return {
    tarjetas,
    general: { fotos: fotosDelColor(fotos, null), visible: sinColores || codigos.length >= 2 || generales.length > 0, sinColores },
    huerfanas: fotos.filter((f) => f.colorCodigo !== null && !codigos.includes(f.colorCodigo)),
    conFoto: tarjetas.filter((t) => t.estado === "con-fotos").length,
    total: codigos.length,
  };
}

/**
 * Las fotos de un color en el orden con que las ve el resto del ERP: la principal primero y después el orden guardado
 * (la misma regla de `fotoDeVariante`). La PORTADA de un color es la primera de esta lista.
 */
export function fotosDelColor<T extends Foto>(fotos: readonly T[], codigo: string | null): T[] {
  const suyas = fotos.filter((f) => f.colorCodigo === codigo);
  return [...suyas.filter((f) => f.esPrincipal), ...suyas.filter((f) => !f.esPrincipal)];
}

/** Siempre exactamente UNA principal si hay fotos (ninguna → la primera; varias → la primera de ellas). */
function conUnaPrincipal<T extends Foto>(fotos: readonly T[]): T[] {
  const i = fotos.findIndex((f) => f.esPrincipal);
  const cual = i === -1 ? 0 : i;
  return fotos.map((f, n) => (f.esPrincipal === (n === cual) ? f : { ...f, esPrincipal: n === cual }));
}

/** Suma fotos recién subidas al final. Si la prenda no tenía principal, la primera de todas lo es. */
export function conFotosNuevas<T extends Foto>(fotos: readonly T[], nuevas: readonly T[]): T[] {
  return conUnaPrincipal([...fotos, ...nuevas]);
}

/** Quita una foto. Si era la principal, pasa a serlo la primera que quede. */
export function sinLaFoto<T extends Foto>(fotos: readonly T[], clientKey: string): T[] {
  return conUnaPrincipal(fotos.filter((f) => f.clientKey !== clientKey));
}

/** La foto elegida es LA principal de la prenda (la de Productos, la del catálogo); las demás dejan de serlo. */
export function comoPrincipal<T extends Foto>(fotos: readonly T[], clientKey: string): T[] {
  if (!fotos.some((f) => f.clientKey === clientKey)) return [...fotos]; // sin esa foto no se le quita la principal a nadie
  return fotos.map((f) => (f.esPrincipal === (f.clientKey === clientKey) ? f : { ...f, esPrincipal: f.clientKey === clientKey }));
}

/**
 * Antes de las demás fotos de su color: ahora es la que se ve en ese color. No cambia nada si el color tiene la principal
 * (esa siempre va primero, ver `fotosDelColor`): ahí lo que se elige es otra principal.
 */
export function primeraEnSuColor<T extends Foto>(fotos: readonly T[], clientKey: string): T[] {
  const foto = fotos.find((f) => f.clientKey === clientKey);
  if (!foto) return [...fotos];
  const sin = fotos.filter((f) => f.clientKey !== clientKey);
  const primera = sin.findIndex((f) => f.colorCodigo === foto.colorCodigo);
  return primera === -1 ? [...fotos] : [...sin.slice(0, primera), foto, ...sin.slice(primera)];
}

/** ¿Tiene sentido «Ponerla primera»? Solo si hay otra antes en su color y ese color no tiene a la principal. */
export function sePuedePonerPrimera<T extends Foto>(fotos: readonly T[], clientKey: string): boolean {
  const foto = fotos.find((f) => f.clientKey === clientKey);
  if (!foto) return false;
  const delColor = fotosDelColor(fotos, foto.colorCodigo);
  return delColor.length > 1 && !delColor.some((f) => f.esPrincipal) && delColor[0].clientKey !== clientKey;
}

/**
 * La foto pasa a otro color (`null` = «Todos los colores»). Queda AL FINAL de las de su nuevo color: si quedara donde
 * estaba, podía ser de pronto la portada de un color que ya tenía la suya.
 */
export function pasadaAColor<T extends Foto>(fotos: readonly T[], clientKey: string, colorCodigo: string | null): T[] {
  const foto = fotos.find((f) => f.clientKey === clientKey);
  if (!foto || foto.colorCodigo === colorCodigo) return [...fotos];
  const sin = fotos.filter((f) => f.clientKey !== clientKey);
  const movida = { ...foto, colorCodigo };
  const ultima = sin.reduce((u, f, i) => (f.colorCodigo === colorCodigo ? i : u), -1);
  return ultima === -1 ? [...sin, movida] : [...sin.slice(0, ultima + 1), movida, ...sin.slice(ultima + 1)];
}

/** Qué hay de nuevo en una foto contra lo guardado: `nueva` (todavía no existe) o `movida` (cambió de color). */
export function pendienteDeFoto(f: Foto, guardadas: ReadonlyMap<string, string | null>): "nueva" | "movida" | null {
  if (!guardadas.has(f.clientKey)) return "nueva";
  return guardadas.get(f.clientKey) !== f.colorCodigo ? "movida" : null;
}

/** «3 de 4 colores con foto». `null` si la prenda no tiene colores (no hay nada que contar). */
export function textoCuenta(v: Pick<VistaFotos<Foto>, "conFoto" | "total" | "general">): string | null {
  if (v.total === 0) return null;
  const base = `${v.conFoto} de ${v.total} ${v.total === 1 ? "color con foto" : "colores con foto"}`;
  return v.conFoto < v.total && v.general.fotos.length === 0 ? `${base} · los demás se ven sin foto` : base;
}

/** Lo que dice la tarjeta de un color bajo su nombre. */
export function textoEstadoColor(estado: EstadoColor, cantidad: number): string {
  if (estado === "con-fotos") return cantidad === 1 ? "1 foto" : `${cantidad} fotos`;
  return estado === "usa-la-general" ? "usa la general" : "Sin foto";
}
