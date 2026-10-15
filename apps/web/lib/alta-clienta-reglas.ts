// Qué pasó al registrar un cliente, dicho como pasó (Felipe 2026-10-15). Lógica pura, sin React ni red: la usan «+ Nuevo cliente»
// de /clientas (`NuevaClientaModal`) y «Registrar cliente» del ticket de Vender (`ClientaDelTicket`), y la prueba
// `alta-clienta-reglas.test.ts`.
//
// `registrar_clienta` no crea una ficha repetida: un documento es de una sola persona (Felipe 2026-10-14). Si ese documento ya tiene
// ficha, la base la COMPLETA (o la REACTIVA si estaba archivada) y devuelve su id. Quien registra tiene que leer eso, no «Cliente
// registrado»: si no, cree que hay una ficha nueva y vacía, y la que ya tenía su historia queda en la sombra.
//
// La base devuelve solo el id. Lo que había antes lo dice la ficha con ese documento leída JUSTO ANTES de registrar (`previa`,
// `fichaConDocumento` en clientas-acciones.ts): si el id que vuelve es el suyo, ya la tenía. Dos cajas que registran el mismo
// documento a la vez: la segunda lee «no tiene» y la base le devuelve la de la primera; esa dice «Cliente registrado» sobre una
// ficha que nació un instante antes, que es lo que pasó para ella. Nada se guarda distinto: solo cambia la frase.

/** Lo que hizo la base con el documento. */
export type ResultadoDelAlta = "nueva" | "ya_tenia" | "reactivada";

/** `previa`: la ficha con ese mismo documento leída justo antes de registrar (activa o archivada), o null si no había. */
export function resultadoDelAlta(previa: { id: string; archivadaEn: string | null } | null, id: string): ResultadoDelAlta {
  if (!previa || previa.id !== id) return "nueva";
  return previa.archivadaEn ? "reactivada" : "ya_tenia";
}

/**
 * El aviso de éxito. `quien`: cómo se lee la persona (su nombre o su documento). `donde`: «clientes» abre su ficha si ya la tenía;
 * en el «ticket» de Vender queda elegida para esta venta.
 */
export function avisoDelAlta(resultado: ResultadoDelAlta, quien: string, donde: "clientes" | "ticket"): { titulo: string; detalle: string } {
  const enLaVenta = donde === "ticket" ? " Al cobrar, esta venta queda en su ficha." : "";
  if (resultado === "reactivada") return { titulo: "Ficha reactivada", detalle: `${quien} vuelve con su historial.${enLaVenta}` };
  if (resultado === "ya_tenia") {
    return {
      titulo: "Ya tenía ficha",
      detalle: donde === "ticket" ? `${quien}: se usa la suya, no se creó otra.${enLaVenta}` : `${quien}: se abrió la suya, no se creó otra.`,
    };
  }
  return { titulo: "Cliente registrado", detalle: `${quien}.${enLaVenta} Para ser del club, que escanee el cartel.` };
}
