// Tienda web ▸ Recomendaciones · «Lo que pide» (actividad 4 de la hoja nueva, Felipe 2026-10-17; decisión #4 A: no se guarda nada
// nuevo). De qué habla lo que escribió el cliente, leído por palabras sobre su texto, y el dato del catálogo que sirve para responderle.
// Sin red ni React: la hoja lo llama con el texto y con lo que leyó del catálogo.
//
// POR QUÉ POR PALABRAS. Hoy llegan pocas (3 en producción el 2026-10-17, 2 de prueba): una lista de palabras, probada contra los casos
// reales, se equivoca a veces («rosa» el color y Rosa la persona) y no cuesta nada; un clasificador con IA costaría dinero, red y una
// dependencia que puede no responder, para algo que una persona lee entera en diez segundos. Si se equivoca, el tema que sobra se
// ignora: la hoja nunca decide nada por él.

import { sinTildes } from "./marcas";

export type TemaId = "tallas" | "colores" | "envio" | "precio" | "horario" | "calidad" | "atencion" | "elogio";

export type Tema = {
  id: TemaId;
  /** Lo que dice el chip: «Tallas grandes · XXXL», «Envío a provincia». */
  nombre: string;
  /** Solo en «tallas»: la talla que nombró, como se escribe en el catálogo («XXXL», «42»), o null si habló de tallas en general. */
  talla?: string | null;
  /** Solo en «tallas»: pidió tallas grandes o pequeñas sin nombrar una. */
  rango?: "grandes" | "pequenas" | null;
};

/** El orden de las tallas de letra (de la más chica a la más grande). Lo que el cliente escribe como 2XL / 3XL se lleva a XXL / XXXL. */
const LETRAS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

const TALLA_ESCRITA = /\b(x{1,3}l|[23]xl|xs|talla\s+(\d{1,2}|[sml]))\b/;
const PALABRAS_TALLA = /\b(talla|tallas|tallaje|plus|curvy)\b|\btallas?\s+(grandes?|pequenas?|chicas?)\b/;
const GRANDES = /\b(grandes?|plus|curvy|x{1,3}l|[23]xl)\b/;
const PEQUENAS = /\b(pequenas?|chicas?|xs)\b/;
const COLORES = /\b(colou?r(es)?|tonos?|estampad[oa]s?)\b/;
const ENVIO = /\b(envios?|enviar|envien|delivery|domicilio|provincias?|despacho|courier|olva|shalom)\b/;
const PRECIO = /\b(precios?|car[oa]s?|barat[oa]s?|descuentos?|ofertas?|promocion(es)?|cuotas)\b/;
const HORARIO = /\b(horarios?|abran|abrir|abren|domingos?|feriados?|cierran|cerrad[oa])\b/;
const CALIDAD = /\b(calidad|tela|telas|costuras?)\b|\b(se descos|se romp|se despint|destenid|se encog)/;
const ATENCION = /\b(atencion|atendio|atendieron|atender|vendedor[a]?|vendedoras|trato|me trataron|la chica|el chico|la senorita)\b/;
const POSITIVO = /\b(gracias|amable|amables|excelente|encant|genial|buenisim|maravillos|feliz|lind[oa]s?|recomiendo|super bien|muy bien)/;
const NEGATIVO = /\b(mal|mala|malo|pesim|demor|groser|ignor|nadie me|no me atend|maltrat|desagrad|incomod)/;

/** La talla que nombró, como se escribe en el catálogo: «3xl» → «XXXL», «talla 42» → «42», «talla m» → «M». */
function tallaNombrada(t: string): string | null {
  const m = t.match(TALLA_ESCRITA);
  if (!m) return null;
  if (m[2]) return /^\d+$/.test(m[2]) ? m[2] : m[2].toUpperCase();
  const s = m[1]!.toUpperCase();
  if (s === "2XL") return "XXL";
  if (s === "3XL") return "XXXL";
  return s;
}

/**
 * De qué habla, en el orden en que se lo responde: primero lo que pide del producto (tallas, colores), después cómo compra (envío,
 * precio, horario), después lo que pasó (calidad, atención) y al final el elogio. Sin ningún tema, una lista vacía: la hoja no muestra
 * «Lo que pide» y las formas de empezar son las de siempre. Un elogio solo es elogio si no se queja de nada.
 */
export function temasDe(texto: string): Tema[] {
  const t = sinTildes(texto.toLowerCase());
  const temas: Tema[] = [];
  const talla = tallaNombrada(t);
  if (talla || PALABRAS_TALLA.test(t)) {
    const rango = GRANDES.test(t) ? "grandes" : PEQUENAS.test(t) ? "pequenas" : null;
    const nombre = rango === "grandes" ? "Tallas grandes" : rango === "pequenas" ? "Tallas pequeñas" : "Tallas";
    temas.push({ id: "tallas", nombre: talla && rango !== null ? `${nombre} · ${talla}` : talla ? `Talla ${talla}` : nombre, talla, rango });
  }
  if (COLORES.test(t)) temas.push({ id: "colores", nombre: "Más colores" });
  if (ENVIO.test(t)) temas.push({ id: "envio", nombre: /provincia/.test(t) ? "Envío a provincia" : "Envío a domicilio" });
  if (PRECIO.test(t)) temas.push({ id: "precio", nombre: "Precios" });
  if (HORARIO.test(t)) temas.push({ id: "horario", nombre: "Horario de la tienda" });
  if (CALIDAD.test(t)) temas.push({ id: "calidad", nombre: "Calidad de una prenda" });
  const negativo = NEGATIVO.test(t);
  if (ATENCION.test(t) && negativo) temas.push({ id: "atencion", nombre: "La atención en tienda" });
  else if ((ATENCION.test(t) || temas.length === 0) && POSITIVO.test(t) && !negativo) temas.push({ id: "elogio", nombre: "Elogio a la atención" });
  else if (ATENCION.test(t)) temas.push({ id: "atencion", nombre: "La atención en tienda" });
  return temas;
}

/* ------------------------------------------------------------------ El catálogo que sirve para responder */

/** Lo que la hoja lee del catálogo (modelos activos, sin los de prueba), una vez por visita y solo si algún mensaje lo necesita. */
export type DatosCatalogo = {
  /** Cuántos modelos distintos tienen al menos una prenda activa en cada talla, por cómo se escribe la talla («XL», «42»). */
  modelosPorTalla: Record<string, number>;
  /** Cuántos colores distintos hay en las prendas activas, y los que más modelos usan (para mostrar su muestra). */
  colores: { total: number; masUsados: { nombre: string; hex: string | null }[] };
};

type Variante = { producto_id: string; talla_id: string | null; color_codigo: string | null };

/** El resumen de las prendas activas: modelos por talla y colores en uso. Lo que no se reconoce (una talla o un color sin fila) no cuenta. */
export function resumirCatalogo(
  variantes: readonly Variante[],
  tallas: readonly { id: string; valor: string }[],
  colores: readonly { codigo: string; nombre: string; hex: string | null }[],
): DatosCatalogo {
  const valorDeTalla = new Map(tallas.map((t) => [t.id, t.valor.trim().toUpperCase()]));
  const color = new Map(colores.map((c) => [c.codigo, c]));
  const modelos = new Map<string, Set<string>>();
  const modelosDeColor = new Map<string, Set<string>>();
  for (const v of variantes) {
    const talla = v.talla_id ? valorDeTalla.get(v.talla_id) : undefined;
    if (talla) (modelos.get(talla) ?? modelos.set(talla, new Set()).get(talla)!).add(v.producto_id);
    if (v.color_codigo && color.has(v.color_codigo))
      (modelosDeColor.get(v.color_codigo) ?? modelosDeColor.set(v.color_codigo, new Set()).get(v.color_codigo)!).add(v.producto_id);
  }
  const masUsados = [...modelosDeColor.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([codigo]) => ({ nombre: color.get(codigo)!.nombre, hex: color.get(codigo)!.hex }));
  return {
    modelosPorTalla: Object.fromEntries([...modelos.entries()].map(([t, s]) => [t, s.size])),
    colores: { total: modelosDeColor.size, masUsados },
  };
}

/** Las tallas que vale la pena mostrar para lo que pidió: la que nombró con sus vecinas, o las grandes / las pequeñas. Una talla de
 *  número muestra la que pidió y las dos de al lado que existan en el catálogo. */
export function tallasParaMostrar(tema: Tema, datos: DatosCatalogo | null): string[] {
  const t = tema.talla ?? null;
  if (t && /^\d+$/.test(t)) {
    const numeros = Object.keys(datos?.modelosPorTalla ?? {})
      .filter((x) => /^\d+$/.test(x) && x !== t)
      .map(Number)
      .sort((a, b) => Math.abs(a - Number(t)) - Math.abs(b - Number(t)) || a - b)
      .slice(0, 2);
    return [t, ...numeros.map(String)].sort((a, b) => Number(a) - Number(b));
  }
  const i = t ? LETRAS.indexOf(t as (typeof LETRAS)[number]) : -1;
  if (i >= 0) {
    // La que pidió y una a cada lado; en las puntas, las tres de la punta (XS: XS·S·M; XXXL: XL·XXL·XXXL).
    const desde = Math.min(Math.max(i - 1, 0), LETRAS.length - 3);
    return LETRAS.slice(desde, desde + 3);
  }
  return tema.rango === "pequenas" ? ["XS", "S", "M"] : ["XL", "XXL", "XXXL"];
}

/** ¿Este tema necesita leer el catálogo? Solo tallas y colores: lo demás no tiene un dato que mostrar. */
export const necesitaCatalogo = (temas: readonly Tema[]) => temas.some((t) => t.id === "tallas" || t.id === "colores");

/** Lo único que se afirma de cómo entrega la tienda online (ADR-0408: se separa y se recoge en tienda). Si algún día hay envío, cambia
 *  aquí y en las formas de empezar (`sugerencias-recomendaciones.ts`), que lo citan. */
export const ENTREGA_DE_LA_TIENDA_ONLINE = "Hoy la tienda online solo entrega con recojo en tienda: el envío a domicilio o a provincia todavía no existe.";

/* ------------------------------------------------------------------ Lo que se repite en el mes (para el Resumen) */

/** El tema que más se repite entre las recomendaciones dadas (las del mes, las de una tienda…), con cuántas lo nombran; null si ninguno
 *  se repite (con una sola no hay patrón que avisar). Elogios y quejas de atención no cuentan: no son un pedido. */
export function temaQueSeRepite(textos: readonly string[]): { id: TemaId; nombre: string; veces: number } | null {
  const cuenta = new Map<TemaId, { nombre: string; veces: number }>();
  for (const texto of textos) {
    for (const t of temasDe(texto)) {
      if (t.id === "elogio" || t.id === "atencion") continue;
      const nombre = t.id === "tallas" ? (t.rango === "grandes" ? "tallas grandes" : t.rango === "pequenas" ? "tallas pequeñas" : "otras tallas") : t.nombre.toLowerCase();
      const previo = cuenta.get(t.id);
      cuenta.set(t.id, { nombre: previo?.nombre ?? nombre, veces: (previo?.veces ?? 0) + 1 });
    }
  }
  const [mejor] = [...cuenta.entries()].sort((a, b) => b[1].veces - a[1].veces);
  return mejor && mejor[1].veces >= 2 ? { id: mejor[0], nombre: mejor[1].nombre, veces: mejor[1].veces } : null;
}
