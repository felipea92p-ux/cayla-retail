/* ====================================================================
   combo-reglas · la regla global de todo combo del sistema (ADR-0209)

   Por qué existe: cada combo decidía por su cuenta cuánto mostrar —
   `ComboBuscable` cortaba en 40 y pedía "sigue tipeando para acortar";
   `Desplegable`/`CampoSelectNativo` no cortaban nunca, y un desplegable de
   292 proveedores metía 292 filas al DOM sin buscador. Felipe pidió UNA
   regla, la misma en todo el sistema: más de 8 opciones, aparece un campo
   para buscar; más de 50 (ya filtradas), la lista se completa sola al
   bajar el scroll en vez de cortar de golpe.

   Puro y testeado — `campos.tsx` ya dice "ningún componente valida,
   transforma ni decide": el componente solo pinta lo que esto calcula.
   ==================================================================== */

/** Con más de esto, el combo suma un campo para escribir y filtrar. */
export const UMBRAL_BUSCAR_COMBO = 8;

/** Cuánto se revela de entrada y cuánto se suma cada vez que el scroll llega al fondo. */
export const TAMANO_PAGINA_COMBO = 50;

export function comboNecesitaBuscador(totalOpciones: number): boolean {
  return totalOpciones > UMBRAL_BUSCAR_COMBO;
}

/** El scroll de la lista llegó al fondo (con margen): momento de revelar más. */
export function comboLlegoAlFinal(medida: { scrollTop: number; clientHeight: number; scrollHeight: number }, margen = 32): boolean {
  return medida.scrollTop + medida.clientHeight >= medida.scrollHeight - margen;
}

/* Grupos y opciones que se ven pero no se eligen (2026-09-26): lo que el <select> del navegador resolvía con <optgroup>
   y `disabled` —las cuentas agrupadas en bancos, cajas fuertes y cajones; un cajón con la caja cerrada—, y lo que dejó
   fuera de la regla a los últimos combos nativos del ERP. Las flechas y el «activo» siguen contando la lista PLANA: el
   grupo solo agrega un título al dibujarla. */

/** Desde `desde`, la siguiente opción elegible en esa dirección (+1 baja, −1 sube). Sin otra elegible, se queda donde
 *  está: las flechas no aterrizan nunca en una opción que no se puede elegir. */
export function siguienteElegible(opciones: readonly { deshabilitada?: boolean }[], desde: number, paso: 1 | -1): number {
  for (let i = desde + paso; i >= 0 && i < opciones.length; i += paso) if (!opciones[i].deshabilitada) return i;
  return desde;
}

/** La primera elegible (Inicio) o, `desdeElFinal`, la última (Fin). −1 si no hay ninguna. */
export function primeraElegible(opciones: readonly { deshabilitada?: boolean }[], desdeElFinal = false): number {
  return desdeElFinal ? opciones.findLastIndex((o) => !o.deshabilitada) : opciones.findIndex((o) => !o.deshabilitada);
}

/** La lista en tramos seguidos del mismo grupo, en el mismo orden y con el índice de siempre. Un tramo sin `grupo` se
 *  dibuja sin título; dos tramos del mismo grupo separados por otro son dos tramos (el orden lo decide quien arma las
 *  opciones, no el combo). */
export function tramosPorGrupo<O extends { grupo?: string }>(opciones: readonly O[]): { grupo?: string; items: { o: O; i: number }[] }[] {
  const tramos: { grupo?: string; items: { o: O; i: number }[] }[] = [];
  opciones.forEach((o, i) => {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.grupo === o.grupo) ultimo.items.push({ o, i });
    else tramos.push({ grupo: o.grupo, items: [{ o, i }] });
  });
  return tramos;
}

/**
 * Al buscar en una lista con grupos, los grupos siguen en el orden en que quien armó la lista los puso (revisión 2026-10-05,
 * ADR-0328 act. 5). `filtrarCombo` ordena por calidad del acierto, y una opción de un grupo de abajo podía quedar entre dos de
 * otro: «Igual a lo que anotó caja · Color parecido · Igual a lo que anotó caja», con el título repetido y el tramo de mayor
 * confianza partido en dos. Esto reordena lo filtrado por grupo —cada grupo en el lugar de su PRIMERA aparición en `todas`— y,
 * dentro de cada grupo, conserva el orden que le dio el filtro (el mejor acierto primero). Sin grupos, o sin buscar, la lista
 * queda igual. Estable: dos opciones del mismo grupo nunca se cruzan.
 */
export function ordenarPorGrupo<T>(filtradas: readonly T[], todas: readonly T[], grupoDe: (o: T) => string | undefined): T[] {
  const lugar = new Map<string | undefined, number>();
  todas.forEach((o, i) => {
    const g = grupoDe(o);
    if (!lugar.has(g)) lugar.set(g, i);
  });
  // Un grupo que no está en `todas` (no debería pasar) va al final, en el orden en que llegó.
  const de = (o: T) => lugar.get(grupoDe(o)) ?? Number.MAX_SAFE_INTEGER;
  return filtradas
    .map((o, i) => ({ o, i }))
    .sort((a, b) => de(a.o) - de(b.o) || a.i - b.i)
    .map(({ o }) => o);
}

/* ====================================================================
   Buscar dentro de un combo (2026-09-29) — tolerante a como escribe la gente

   Por qué existe: el 2026-09-29 una persona escribió «La   Femme21» en el buscador de marca y proveedor de Nuevo
   producto y no salió nada, y en producción existen «La Femme 21» (marca) y «CORPORACION LA FEMME21 S.A.C.»
   (proveedor). Cada combo filtraba con `texto.includes(lo escrito)` tras un `clave()` que solo baja a minúsculas,
   quita tildes y recorta los bordes: tres espacios seguidos, o «Femme21» pegado donde el nombre dice «Femme 21»,
   bastaban para que el nombre no coincidiera. Eran cuatro filtros iguales de frágiles (ComboBuscable, Desplegable,
   ComboResponsable y FiltrosPildora): ahora es UNA regla, la de esta sección (ADR-0209, actualización 2026-09-29).

   CONTRATO
     PROMETE: encontrar la opción aunque lo escrito traiga espacios de más, signos («S.A.C.»), mayúsculas, tildes,
              una letra pegada a un número («Femme21»), las palabras en otro orden o sin espacios («lafemme21»), o
              —solo cuando NADA coincide tal cual— un error de tipeo (letra de más, de menos, cambiada o dos
              cambiadas de lugar: «Feme», «Femmee», «Fmeme»).
     ASUME:   que quien llama pasa `texto`/`detalle`/`claves` tal cual se ven; aquí se normaliza todo.
     NO HACE: no mezcla aciertos exactos con aproximados (si algo coincide tal cual, los aproximados no aparecen:
              escribir «cayla» no trae «Caila»); no corrige números (una talla 22 no es una 21); y con palabras de
              tres letras o menos no tolera errores (una letra ya es otra palabra).
   ==================================================================== */

/**
 * Lo que se compara al buscar: minúsculas, sin tildes, todo lo que no es letra ni número vuelto un espacio, un solo
 * espacio entre palabras, y separado donde una letra toca un número («femme21» → «femme 21», «S.A.C.» → «s a c»).
 */
export function normalizarBusqueda(texto: string | null | undefined): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, "$1$2 ")
    .trim();
}

/** ¿Es el mismo nombre que la base considera igual (espacios juntados, sin mayúsculas ni tildes)? Sirve para no ofrecer
 *  «+ Registrar “La  Femme 21”» cuando «La Femme 21» ya existe: `retail.fn_clave_texto` los trata como uno. */
export function mismoNombreCombo(a: string, b: string): boolean {
  const limpio = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const la = limpio(a);
  return la !== "" && la === limpio(b);
}

/** Lo mínimo que un combo sabe de una opción para buscarla. `detalle` es cualquier texto que también se busca (la
 *  segunda línea de la fila, el grupo); `claves`, los sinónimos («plomo» encuentra Gris). */
export type TextoBuscable = { texto: string; detalle?: string; claves?: readonly string[] };

/** Qué tan bien coincide una opción, de mejor a peor:
 *  1 · lo escrito aparece tal cual (ya normalizado) · 2 · todas sus palabras aparecen, en cualquier orden ·
 *  3 · aparece sin espacios («lafemme21») · 4 · todas aparecen con algún error de tipeo. */
type Nivel = 1 | 2 | 3 | 4;
type Puntaje = { nivel: Nivel; costo: number; clave: string };

type Consulta = { q: string; palabras: string[]; junto: string };

function prepararConsulta(consulta: string): Consulta {
  const q = normalizarBusqueda(consulta);
  return { q, palabras: q ? q.split(" ") : [], junto: q.replace(/ /g, "") };
}

const esNumero = (p: string) => /^\p{N}+$/u.test(p);

/** ¿La palabra escrita está en esta palabra del texto? Los números piden el mismo inicio («2» encuentra «21» pero
 *  «1» no encuentra «21» por palabras); las letras, que estén contenidas («lino» en «flino»). */
function palabraEsta(escrita: string, palabra: string): boolean {
  return esNumero(escrita) ? palabra.startsWith(escrita) : palabra.includes(escrita);
}

/** Distancia entre dos palabras contando como UN error: una letra de más, de menos, cambiada, o dos vecinas
 *  intercambiadas («Fmeme» ↔ «Femme»). */
function distanciaEdicion(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Cuántos errores se toleran en una palabra escrita según su largo: con tres letras o menos, ninguno. */
function errorPermitido(largo: number): number {
  return largo <= 3 ? 0 : largo <= 7 ? 1 : 2;
}

/** Cuánto cuesta que la palabra escrita sea esta palabra del texto: 0 si está tal cual, el número de errores si se
 *  parece (a la palabra entera o a su comienzo, porque todavía se está tipeando), Infinity si no. */
function costoPalabra(escrita: string, palabra: string): number {
  if (palabraEsta(escrita, palabra)) return 0;
  const tolera = errorPermitido(escrita.length);
  if (tolera === 0 || esNumero(escrita)) return Infinity;
  let mejor = distanciaEdicion(escrita, palabra);
  // El comienzo de la palabra, con un largo parecido al escrito: «femn» mientras se escribe «femme».
  if (escrita.length >= 4) {
    for (let largo = escrita.length - 1; largo <= escrita.length + 1; largo++) {
      if (largo < palabra.length) mejor = Math.min(mejor, distanciaEdicion(escrita, palabra.slice(0, largo)));
    }
  }
  return mejor <= tolera ? mejor : Infinity;
}

function puntuarFuente(fuente: string, c: Consulta, tolerante: boolean): { nivel: Nivel; costo: number } | null {
  const h = normalizarBusqueda(fuente);
  if (!h) return null;
  if (h.includes(c.q)) return { nivel: 1, costo: 0 };
  const palabras = h.split(" ");
  if (c.palabras.every((w) => palabras.some((p) => palabraEsta(w, p)))) return { nivel: 2, costo: 0 };
  // Sin espacios solo desde 3 letras: con menos, cruzar el límite entre dos palabras sería casualidad, no búsqueda.
  if (c.junto.length >= 3 && h.replace(/ /g, "").includes(c.junto)) return { nivel: 3, costo: 0 };
  if (!tolerante) return null;
  let costo = 0;
  for (const w of c.palabras) {
    const mejor = Math.min(...palabras.map((p) => costoPalabra(w, p)));
    if (mejor === Infinity) return null;
    costo += mejor;
  }
  return { nivel: 4, costo };
}

function puntuarCombo(o: TextoBuscable, c: Consulta, tolerante: boolean): Puntaje | null {
  // El texto propio va primero: ante un empate gana, y la lista no muestra una clave que no hace falta.
  const candidatos: Puntaje[] = [];
  const propio = puntuarFuente(`${o.texto} ${o.detalle ?? ""}`, c, tolerante);
  if (propio) candidatos.push({ ...propio, clave: "" });
  for (const clave of o.claves ?? []) {
    const p = puntuarFuente(clave, c, tolerante);
    if (p) candidatos.push({ ...p, clave });
  }
  return candidatos.reduce<Puntaje | null>(
    (mejor, p) => (!mejor || p.nivel < mejor.nivel || (p.nivel === mejor.nivel && p.costo < mejor.costo) ? p : mejor),
    null
  );
}

/**
 * ¿Una opción de combo responde a lo que se escribió? Por su texto, su detalle o una de sus `claves` (sinónimos:
 * «plomo» encuentra Gris, «guinda» encuentra Vino — revisión de la paleta, 2026-09-26).
 *
 * Devuelve `null` si no responde; `""` si responde por su texto o su detalle; o la clave por la que respondió,
 * para que la lista diga «Gris · «plomo»» y quien escribió «plomo» entienda por qué le sale Gris.
 *
 * Es la pregunta de UNA opción, con tolerancia a errores de tipeo. Para filtrar una lista usa `filtrarCombo`, que
 * además no mezcla aciertos exactos con aproximados.
 */
export function coincidenciaCombo(o: TextoBuscable, consulta: string): string | null {
  const c = prepararConsulta(consulta);
  if (!c.q) return "";
  return puntuarCombo(o, c, true)?.clave ?? null;
}

/**
 * Las opciones que responden a lo escrito, la mejor primero. Sin texto (o solo signos), todas, en su orden.
 * Los aciertos exactos van por nivel (tal cual, luego palabras sueltas, luego sin espacios) y, dentro de cada nivel,
 * en el orden que traía la lista. Solo si NINGUNO acierta exacto se buscan los que se parecen (error de tipeo), del
 * más al menos parecido: así escribir bien «cayla» nunca trae «Caila», y escribir mal «Feme 21» sí trae «Femme 21».
 */
export function filtrarCombo<T>(items: readonly T[], consulta: string, leer: (item: T) => TextoBuscable): T[] {
  const c = prepararConsulta(consulta);
  if (!c.q) return [...items];
  const evaluar = (tolerante: boolean) =>
    items.flatMap((item, orden) => {
      const p = puntuarCombo(leer(item), c, tolerante);
      return p ? [{ item, orden, nivel: p.nivel, costo: p.costo }] : [];
    });
  const exactas = evaluar(false);
  const elegidas = exactas.length > 0 ? exactas : evaluar(true);
  return elegidas.sort((a, b) => a.nivel - b.nivel || a.costo - b.costo || a.orden - b.orden).map((x) => x.item);
}
