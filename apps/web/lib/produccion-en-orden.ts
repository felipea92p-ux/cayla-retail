// «Lo demás está en orden» del Resumen de Producción (2026-11-26, «Producción más clara»). Puro: sin Supabase ni React.
//
// EL PROBLEMA. El Resumen tenía, debajo de lo que pide acción, cuatro secciones enteras que solo se consultan (las órdenes por fase, «¿Alcanza la tela?», la tabla de los demás modelos
// y las cifras de dinero): quien entraba por primera vez leía todo para descubrir que no tenía que hacer nada. Felipe eligió la versión C de la maqueta: cada una de esas secciones se
// resume en UN recuadro de dos líneas; el que quiere el detalle lo despliega en el lugar o va a su pantalla.
//
// LA REGLA. Un recuadro es HONESTO: solo dice que algo está bien (`tono: "bien"`, el visto verde) si lo está. Si una tela no alcanza, dice cuántas alcanzan y cuántas no; si la lectura
// falló, lo dice; y si el problema de su tema ya está en «Por resolver» (`avisados`), lo nombra sin volver a hacer de alarma. Aquí no hay ninguna regla de negocio nueva: los estados
// son los de `filasDeTela`, `filasPorModelo`, la lista de Órdenes y `tramosPorPagar`.

import { UMBRAL_COBERTURA_ALTA_DIAS, UMBRAL_COBERTURA_RIESGO_DIAS, UMBRAL_COBERTURA_SALUDABLE_DIAS } from "./inventario-reglas";
import { cantidadTexto } from "./insumos-reglas";
import { textoDePedido } from "./orden-pagina-reglas";
import { porSemana, textoDiasDeStock, type Decision, type FilaModelo, type FilaTela, type PagosDelTaller, type ParDeDato } from "./produccion-decisiones";

// ---------------------------------------------------------------------------
// Lo que explica cada bloque: va detrás de su «?», nunca a la vista
// ---------------------------------------------------------------------------

export const AYUDA_POR_RESOLVER = "Lo demás que pide tu decisión hoy, del más urgente al menos: entregas, tela, pagos y prendas listas por llevar a tienda. Cada asunto se va solo cuando se resuelve.";

export const AYUDA_TELA =
  "«Se necesitan» es lo que las órdenes abiertas todavía tienen que usar de la tela que declararon (su plan menos lo ya usado: la misma cuenta de «Nueva orden»); una orden que no declara tela se cuenta con el consumo medido de su modelo. «En camino» y «Facturado por recibir» son tela que todavía no llegó y se suma a lo que hay. Un pedido atrasado no se cuenta.";

export const AYUDA_MODELOS =
  "Los modelos que hoy no piden fabricar. «Cuánto dura» son los días que dura lo que hay en las tiendas al ritmo de venta del último mes; las dos marcas de la barra son 7 y 30 días. Toca un modelo para ver sus tallas, sus colores y sus tiendas.";

// ---------------------------------------------------------------------------
// Los recuadros
// ---------------------------------------------------------------------------

export type ClaveDeRecuadro = "ordenes" | "telas" | "modelos" | "pagos" | "vigilar";

export type Recuadro = {
  clave: ClaveDeRecuadro;
  /** `bien`: el visto verde (lo que dice el título es cierto y no pide nada). `atencion`: algo no está bien, o no se pudo leer, y no está dicho arriba. `neutro`: no hay nada que afirmar. */
  tono: "bien" | "atencion" | "neutro";
  /** La línea fuerte: «6 órdenes en curso». */
  titulo: string;
  /** La segunda línea, corta: «Sin más atrasos». */
  linea: string;
  /** Lleva a otra pantalla. Un recuadro sin `href` despliega su detalle en el lugar (`despliega`) o solo informa. */
  href?: string;
  despliega?: boolean;
};

/** Cuántos asuntos de cada clase ya están en «Por resolver» (`asuntosPorTipo`). */
export type AsuntosAvisados = Partial<Record<Decision["tipo"], number>>;

/** Lo que el recuadro de órdenes mira de cada fila de la lista de Órdenes (`FilaDeLista` lo cumple). */
export type OrdenEnCurso = { estado: string; esMuestra?: boolean; entrega: { fecha: string | null; atrasada: boolean }; causas: readonly { clave: string }[] };

const cuantas = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/**
 * Las órdenes abiertas, en dos líneas. Lo que pide algo y NO está en «Por resolver» se dice aquí (una orden parada hace días, una que espera tela sin aviso de tela arriba, un atraso
 * que no tiene su asunto); lo que ya está arriba se nombra como «sin más». `null` = la lista no se pudo leer. Sin ninguna fecha de entrega no se afirma «ninguna atrasada».
 */
export function recuadroDeOrdenes(filas: readonly OrdenEnCurso[] | null, avisados: AsuntosAvisados): Recuadro {
  const base = { clave: "ordenes" as const, href: "/produccion/ordenes" };
  if (filas === null) return { ...base, tono: "atencion", titulo: "Órdenes sin leer", linea: "Míralas en Órdenes" };
  const abiertas = filas.filter((f) => f.estado === "en_proceso");
  if (abiertas.length === 0) return { ...base, tono: "neutro", titulo: "Ninguna orden en curso", linea: "No hay nada fabricándose" };
  // Como la lista de Órdenes: los lotes en «En curso» y las muestras en su pestaña. «2 órdenes en curso» con una muestra adentro no cuadraba con el «En curso 1» de allá.
  const muestras = abiertas.filter((f) => f.esMuestra).length;
  const lotes = abiertas.length - muestras;
  const titulo =
    muestras === 0
      ? cuantas(lotes, "orden en curso", "órdenes en curso")
      : lotes === 0
        ? cuantas(muestras, "muestra en curso", "muestras en curso")
        : `${cuantas(lotes, "orden", "órdenes")} y ${cuantas(muestras, "muestra", "muestras")} en curso`;
  const con = (clave: string) => abiertas.filter((f) => f.causas.some((c) => c.clave === clave)).length;
  const paradas = con("sin_moverse");
  const sinTela = con("tela_no_llega");
  const atrasadas = abiertas.filter((f) => f.entrega.atrasada).length;
  const avisoDeTela = (avisados.insumo ?? 0) + (avisados.recibir ?? 0) > 0;
  if (paradas > 0) return { ...base, tono: "atencion", titulo, linea: paradas === 1 ? "1 lleva días sin moverse" : `${paradas} llevan días sin moverse` };
  if (sinTela > 0 && !avisoDeTela) return { ...base, tono: "atencion", titulo, linea: sinTela === 1 ? "1 espera tela" : `${sinTela} esperan tela` };
  if (atrasadas > (avisados.entrega ?? 0)) return { ...base, tono: "atencion", titulo, linea: cuantas(atrasadas, "atrasada", "atrasadas") };
  if (atrasadas > 0) return { ...base, tono: "bien", titulo, linea: "Sin más atrasos" };
  if (sinTela > 0) return { ...base, tono: "bien", titulo, linea: "Sin más pendientes" };
  if (abiertas.every((f) => f.entrega.fecha === null)) return { ...base, tono: "neutro", titulo, linea: "Ninguna tiene fecha de entrega" };
  return { ...base, tono: "bien", titulo, linea: "Ninguna atrasada" };
}

/** Las telas, en dos líneas: cuántas alcanzan para lo que piden las órdenes y, si alguna no, cuántas. Toda tela que no alcanza tiene su asunto arriba (`insumo` o `recibir`): con ellos avisados no se repite la alarma. */
export function recuadroDeTelas(telas: readonly Pick<FilaTela, "estado">[], avisados: AsuntosAvisados): Recuadro {
  if (telas.length === 0) return { clave: "telas", tono: "neutro", titulo: "Sin telas cargadas", linea: "Cárgalas en Insumos", href: "/produccion/insumos" };
  const base = { clave: "telas" as const, despliega: true };
  const alcanzan = telas.filter((t) => t.estado === "alcanza").length;
  const noAlcanzan = telas.filter((t) => t.estado === "falta" || t.estado === "alcanza_si_llega").length;
  if (alcanzan + noAlcanzan === 0) return { ...base, tono: "neutro", titulo: "Ninguna orden pide tela", linea: `Hay ${cuantas(telas.length, "tela", "telas")} en el Taller` };
  const titulo = alcanzan === 1 ? "1 tela alcanza" : `${alcanzan} telas alcanzan`;
  if (noAlcanzan === 0) return { ...base, tono: "bien", titulo, linea: "Para los cortes" };
  const avisadas = (avisados.insumo ?? 0) + (avisados.recibir ?? 0) >= noAlcanzan;
  // Ninguna alcanza: el recuadro dice lo que pasa («1 tela no alcanza»), no una negación de lo que no hay («Ninguna tela alcanza»).
  if (alcanzan === 0) {
    const cuales = noAlcanzan === 1 ? "1 tela no alcanza" : `${noAlcanzan} telas no alcanzan`;
    return { ...base, tono: avisadas ? "neutro" : "atencion", titulo: cuales, linea: avisadas ? (noAlcanzan === 1 ? "Ya está en Por resolver" : "Ya están en Por resolver") : "Mira cuáles" };
  }
  const linea = noAlcanzan === 1 ? `1 no alcanza${avisadas ? ": está en Por resolver" : ""}` : `${noAlcanzan} no alcanzan${avisadas ? ": están en Por resolver" : ""}`;
  return { ...base, tono: avisadas ? "bien" : "atencion", titulo, linea };
}

/** Los modelos que hoy no piden fabricar (todos menos «Producir ya», que está en «Qué fabricar primero»). `null` si no queda ninguno: no hay recuadro. Si la red no se pudo leer, lo dice. */
export function recuadroDeModelos(modelos: readonly Pick<FilaModelo, "estado">[], falloRed: boolean): Recuadro | null {
  if (falloRed) return { clave: "modelos", tono: "atencion", titulo: "Modelos sin leer", linea: "No pudimos leer las ventas" };
  if (modelos.length === 0) return { clave: "modelos", tono: "neutro", titulo: "Ningún modelo todavía", linea: "No hay modelos para producir" };
  const resto = modelos.filter((m) => m.estado !== "producir_ya").length;
  if (resto === 0) return null;
  return { clave: "modelos", tono: "bien", titulo: resto === 1 ? "1 modelo puede esperar" : `${resto} modelos pueden esperar`, linea: "Hoy no piden fabricar", despliega: true };
}

/** Los pagos a proveedores del Taller. Lo vencido y lo que vence en 7 días tiene su asunto arriba: aquí se dice que no hay más. Sin ninguna factura cargada no se afirma «no se debe nada». */
export function recuadroDePagos(p: PagosDelTaller, avisados: AsuntosAvisados): Recuadro {
  const base = { clave: "pagos" as const, href: "/produccion/por-pagar" };
  if (p.facturasCargadas === 0) return { ...base, tono: "neutro", titulo: "Sin facturas cargadas", linea: "De proveedores del Taller" };
  if (p.vencido > 0 || p.estaSemana > 0) {
    if ((avisados.pago ?? 0) === 0) return { ...base, tono: "atencion", titulo: p.vencido > 0 ? "Hay pagos vencidos" : "Vencen pagos esta semana", linea: "Míralos en Por pagar" };
    return { ...base, tono: "bien", titulo: "Sin más pagos", linea: "Por vencer esta semana" };
  }
  if (p.porPagar <= 0) return { ...base, tono: "bien", titulo: "No se debe nada", linea: "A proveedores del Taller" };
  return { ...base, tono: "bien", titulo: "Ningún pago vencido", linea: "Ni por vencer esta semana" };
}

/** Los modelos «para vigilar» (se agotan, pero con 1 o 2 ventas en el mes). `null` si no hay ninguno. No es un «está bien» ni una alarma: es algo que se mira. */
export function recuadroDeVigilar(cuantos: number): Recuadro | null {
  if (cuantos <= 0) return null;
  return { clave: "vigilar", tono: "neutro", titulo: cuantas(cuantos, "modelo para vigilar", "modelos para vigilar"), linea: "Vendieron poco: todavía no fabricar", despliega: true };
}

export function recuadrosDeLoDemas(d: {
  ordenes: readonly OrdenEnCurso[] | null;
  telas: readonly Pick<FilaTela, "estado">[];
  modelos: readonly Pick<FilaModelo, "estado">[];
  falloRed: boolean;
  pagos: PagosDelTaller;
  paraVigilar: number;
  avisados: AsuntosAvisados;
}): Recuadro[] {
  return [recuadroDeOrdenes(d.ordenes, d.avisados), recuadroDeTelas(d.telas, d.avisados), recuadroDeModelos(d.modelos, d.falloRed), recuadroDePagos(d.pagos, d.avisados), recuadroDeVigilar(d.paraVigilar)].filter(
    (r): r is Recuadro => r !== null,
  );
}

/** El título del bloque: «Lo demás está en orden» solo si ningún recuadro pide atención. */
export function tituloDeLoDemas(recuadros: readonly Pick<Recuadro, "tono">[]): string {
  return recuadros.some((r) => r.tono === "atencion") ? "Lo demás, de un vistazo" : "Lo demás está en orden";
}

// ---------------------------------------------------------------------------
// «¿Alcanza la tela?»: cada tela, con sus datos en piezas
// ---------------------------------------------------------------------------

export type InsigniaDeTela = { texto: string; tono: "neutro" | "verde" | "ambar" };

export function insigniaDeTela(t: Pick<FilaTela, "estado" | "faltan" | "unidad">): InsigniaDeTela {
  if (t.estado === "sin_demanda") return { texto: "Nadie la pide", tono: "neutro" };
  if (t.estado === "alcanza") return { texto: "Alcanza", tono: "verde" };
  if (t.estado === "alcanza_si_llega") return { texto: "Alcanza si llega", tono: "ambar" };
  return { texto: `Faltan ${cantidadTexto(t.faltan, t.unidad)}`, tono: "ambar" };
}

/** «Hay», «Se necesitan», «En camino», «Facturado por recibir» y lo atrasado (que no se cuenta): solo los que tienen algo que decir. «Hay» va siempre. */
export function paresDeTela(t: Pick<FilaTela, "saldo" | "piden" | "enCamino" | "facturado" | "atrasado" | "unidad">): ParDeDato[] {
  const pares: ParDeDato[] = [{ rotulo: "Hay", valor: cantidadTexto(t.saldo, t.unidad) }];
  if (t.piden > 0) pares.push({ rotulo: "Se necesitan", valor: cantidadTexto(t.piden, t.unidad) });
  if (t.enCamino > 0) pares.push({ rotulo: "En camino", valor: cantidadTexto(t.enCamino, t.unidad) });
  if (t.facturado > 0) pares.push({ rotulo: "Facturado por recibir", valor: cantidadTexto(t.facturado, t.unidad) });
  if (t.atrasado > 0) pares.push({ rotulo: "Atrasado, no se cuenta", valor: cantidadTexto(t.atrasado, t.unidad), tono: "ambar" });
  return pares;
}

/** De qué pedidos viene la tela, para su «¿Por qué?»: «Pedidos: OI-000003, 50 m a Textiles Andinos, llega el vie 23 oct; OI-000002, … y 1 más.» `undefined` sin pedidos. */
export function pedidosDeTela(t: Pick<FilaTela, "pedidos">): string | undefined {
  if (t.pedidos.length === 0) return undefined;
  const nombrados = t.pedidos.slice(0, 2).map((p) => textoDePedido(p).replaceAll(" · ", ", "));
  return `Pedidos: ${nombrados.join("; ")}${t.pedidos.length > 2 ? ` y ${t.pedidos.length - 2} más` : ""}.`;
}

// ---------------------------------------------------------------------------
// «Los demás modelos»: lo que dice cada celda
// ---------------------------------------------------------------------------

/** «Se venden por semana»: «5,1», o `null` si todavía no hay ventas medidas (la celda dice «Sin ventas»). */
export const ventaPorSemanaDeModelo = (m: Pick<FilaModelo, "ritmoDia">): string | null => (m.ritmoDia ? porSemana(m.ritmoDia) : null);

/** «Cuánto dura», en palabras completas: «Alcanza para 12 días», «Agotado en las tiendas» o «Sin ventas todavía» (sin ventas medidas no se inventa una duración). */
export function cuantoDura(m: Pick<FilaModelo, "stockRed" | "diasRed">): string {
  if (m.diasRed === null) return "Sin ventas todavía";
  if (m.stockRed <= 0) return "Agotado en las tiendas";
  return `Alcanza para ${textoDiasDeStock(m.stockRed, m.diasRed)}`;
}

/** La barra de «Cuánto dura»: los días de stock sobre la escala de Inventario (hasta 60 días), con sus marcas en 7 y 30. Es una medida, no un avance. `null` sin ventas medidas. */
export function barraDeStock(m: Pick<FilaModelo, "diasRed">): { pct: number; marcas: [number, number] } | null {
  if (m.diasRed === null) return null;
  const tope = UMBRAL_COBERTURA_ALTA_DIAS;
  return { pct: Math.min(100, (m.diasRed / tope) * 100), marcas: [(UMBRAL_COBERTURA_RIESGO_DIAS / tope) * 100, (UMBRAL_COBERTURA_SALUDABLE_DIAS / tope) * 100] };
}
