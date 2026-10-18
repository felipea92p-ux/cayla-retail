import { estadoEspera, montoDicho, type Espera, type MiClub } from "./club";
import { cumpleTexto } from "./cuentas";
import { INSIGNIA, type Pedido } from "./pedidos";

// «Mi perfil» (Felipe 2026-10-15: «podría estar mejor distribuido, más ordenado y entendible»). Arriba, cuatro cuadros que dicen de un
// vistazo cómo están tus pedidos, tu Club, tus favoritos y tus avisos, y llevan a su parte de la página. Aquí, lo que dice cada cuadro
// en una línea corta (cabe en medio celular) y su tono: verde, hay algo listo para ti; ámbar, la tienda o tú tienen algo pendiente;
// neutro, nada que hacer. Las palabras son las mismas de cada bloque (la insignia de un pedido, «¡Llegó!» de un aviso): el cuadro no
// inventa otro estado. Lógica pura, con su prueba al lado: la página solo la llama.

export type Tono = "verde" | "ambar" | "neutro";
export type Resumen = { texto: string; tono: Tono };

const SIN_RESPUESTA: Resumen = { texto: "No se pudo cargar", tono: "neutro" };

/** Los pedidos que siguen abiertos: los que la tienda todavía tiene que confirmar, cobrar o entregar. */
const EN_CURSO: ReadonlySet<Pedido["estado"]> = new Set(["por_confirmar", "confirmado", "pagado"]);

/**
 * «Mis pedidos». Lo listo para recoger va primero (es lo que hay que hacer); uno solo en curso dice en qué está, con la misma insignia de
 * su fila; varios, cuántos. Sin ninguno abierto, lo dice. `null`: la base no contestó.
 */
export function resumenPedidos(pedidos: readonly Pick<Pedido, "estado" | "listoParaRecoger">[] | null): Resumen {
  if (pedidos === null) return SIN_RESPUESTA;
  if (pedidos.length === 0) return { texto: "Todavía ninguno", tono: "neutro" };
  const enCurso = pedidos.filter((p) => EN_CURSO.has(p.estado));
  const listos = enCurso.filter((p) => p.estado === "pagado" && p.listoParaRecoger).length;
  if (listos > 0) return { texto: listos === 1 ? "Listo para recoger" : `${listos} listos para recoger`, tono: "verde" };
  if (enCurso.length === 0) return { texto: "Ninguno en curso", tono: "neutro" };
  if (enCurso.length > 1) return { texto: `${enCurso.length} en curso`, tono: "neutro" };
  const insignia = INSIGNIA[enCurso[0].estado];
  return { texto: insignia.texto, tono: insignia.tono === "verde" || insignia.tono === "ambar" ? insignia.tono : "neutro" };
}

/**
 * «Mi Club». Lo que se puede usar hoy va primero, en verde (el descuento de su mes, el vale); si no, cuándo llega su cumpleaños o cuánto
 * lleva para su vale. Sin ficha activa, lo dice en ámbar (el bloque explica qué hacer).
 */
export function resumenClub(club: MiClub["club"] | null, esDelClub = true): Resumen {
  // Una cuenta simple (ADR-0438) todavía no es del Club: se une al separar o cuando quiera, desde aquí.
  if (!esDelClub) return { texto: "Únete: completa tus datos", tono: "ambar" };
  if (club === null) return SIN_RESPUESTA;
  if (!club.activa) return { texto: "Tu ficha no está activa", tono: "ambar" };
  const { cumple, aniversario } = club;
  const vale = aniversario.estado === "vale" && aniversario.valeMonto ? aniversario.valeMonto : null;
  const cumpleHoy = cumple.estado === "disponible";
  if (cumpleHoy && vale) return { texto: "2 beneficios para usar", tono: "verde" };
  if (cumpleHoy) return { texto: "Descuento de cumpleaños", tono: "verde" };
  if (vale) return { texto: `Vale de ${montoDicho(vale)} para usar`, tono: "verde" };
  if (cumple.estado === "proximo" && cumple.dia && cumple.mes) {
    // La fecha no se parte («12 de / mayo»): si no cabe en una línea, baja entera.
    return { texto: `Cumpleaños: ${cumpleTexto(cumple.dia, cumple.mes).replaceAll(" ", "\u00a0")}`, tono: "neutro" };
  }
  if (aniversario.estado === "en_camino" && !aniversario.anioCuenta) {
    return { texto: `Llevas ${aniversario.compras} de ${aniversario.comprasMeta} compras`, tono: "neutro" };
  }
  return { texto: "Tus beneficios", tono: "neutro" };
}

/** «Favoritos»: cuántos guardó con el corazón (los mismos que cuenta el corazón de la cabecera). */
export function resumenFavoritos(cuantos: number | null): Resumen {
  if (cuantos === null) return SIN_RESPUESTA;
  if (cuantos === 0) return { texto: "Ninguno todavía", tono: "neutro" };
  return { texto: cuantos === 1 ? "1 guardado" : `${cuantos} guardados`, tono: "neutro" };
}

/** «Te avisamos»: lo que ya llegó va primero, en verde; si no, cuántas tallas espera. Lo que ya no está en la web no espera nada. */
export function resumenAvisos(esperas: readonly Espera[] | null): Resumen {
  if (esperas === null) return SIN_RESPUESTA;
  const tonos = esperas.map((e) => estadoEspera(e).tono);
  const llegaron = tonos.filter((t) => t === "llego").length;
  if (llegaron > 0) return { texto: llegaron === 1 ? "¡Ya llegó!" : `¡Ya llegaron ${llegaron}!`, tono: "verde" };
  const esperando = tonos.filter((t) => t === "espera").length;
  if (esperando > 0) return { texto: `${esperando} en espera`, tono: "neutro" };
  return { texto: "Ninguno por ahora", tono: "neutro" };
}

/** La línea bajo el saludo: desde cuándo es del Club (el año de su tarjeta). Sin ficha activa, eso; sin respuesta del Club, lo de siempre. */
export function lineaDeMiembro(club: MiClub["club"] | null, desde: number | null): string {
  if (desde === null) return "Todavía no eres del Club CAYLA: se activa cuando completas tus datos.";
  if (club && !club.activa) return "Tu ficha del Club CAYLA no está activa.";
  return `Miembro del Club CAYLA desde ${desde}`;
}
