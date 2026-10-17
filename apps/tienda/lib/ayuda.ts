import { z } from "zod";

// Las páginas de ayuda (ADR-0408, actividad 5; maqueta v4, `vComoSeparar` y `vCambios`). Los plazos que prometen no se escriben a
// mano: los da `retail.tienda_ayuda()`, de donde ya viven (Configuración ▸ Tienda web y el plazo de cambio de la caja, el que imprime
// la boleta). Si Felipe los cambia en el ERP, la ayuda cambia sola. Sin base, la página los dice sin número: nunca uno inventado.
// Lógica pura, con su prueba al lado.

// Los mismos rangos que la base acepta (configuracion_tienda_web); uno fuera de rango se toma como «sin dato».
const esquemaAyuda = z.object({
  horas_para_confirmar: z.number().int().min(1).max(168).nullable().catch(null),
  // 20261016001000: las horas para pagar un pedido confirmado (las de «Si no paga»); sin la migración no viene y queda sin dato.
  horas_para_pagar: z.number().int().min(1).max(720).nullable().catch(null),
  dias_para_recoger: z.number().int().min(1).max(60).nullable().catch(null),
  dias_para_cambiar: z.number().int().min(1).max(365).nullable().catch(null),
});

export type Plazos = {
  /** Horas que tiene la tienda para confirmar una separación; pasadas, se cierra sola. */
  horasParaConfirmar: number | null;
  /** Horas para pagar un pedido ya confirmado; pasadas sin ningún pago, se anula solo (Felipe 2026-10-15, D9). */
  horasParaPagar: number | null;
  /** Días para recoger después de pagar. */
  diasParaRecoger: number | null;
  /** Días para cambiar o devolver una prenda, como en tienda. */
  diasParaCambiar: number | null;
};

/** Sin base, ningún plazo: la página los dice sin número (principio 9: se degrada, no se cae ni inventa). */
export const PLAZOS_SIN_DATOS: Plazos = { horasParaConfirmar: null, horasParaPagar: null, diasParaRecoger: null, diasParaCambiar: null };

/** Lo que devuelve `tienda_ayuda()`. Un dato raro se toma como «sin dato»; los demás se usan igual. */
export function interpretarAyuda(dato: unknown): Plazos {
  const r = esquemaAyuda.safeParse(dato);
  if (!r.success) return PLAZOS_SIN_DATOS;
  return {
    horasParaConfirmar: r.data.horas_para_confirmar,
    horasParaPagar: r.data.horas_para_pagar,
    diasParaRecoger: r.data.dias_para_recoger,
    diasParaCambiar: r.data.dias_para_cambiar,
  };
}

/** «24 horas», «1 hora», «7 días», «1 día». */
const enHoras = (n: number) => `${n} ${n === 1 ? "hora" : "horas"}`;
const enDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** «Trujillo», «Trujillo y Lima», «Trujillo, Arequipa y Lima». */
function listaDeNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

type Paso = { titulo: string; texto: string };

/** Un paso de «Cómo separar». `hecho`: el que la persona ya cumplió (con cuenta, «Crea tu cuenta» ya está y se marca con ✓). */
export type PasoParaSeparar = Paso & { hecho: boolean };

/**
 * Los cuatro pasos de «Cómo separar», con las tiendas de la web: «En cada prenda ves cuánto hay en Trujillo, Arequipa y Lima». Con una
 * sola tienda no hay otra de dónde traer; sin tiendas (o sin base), la frase va sin nombres. Desde el 2026-10-17 (ADR-0438) primero se
 * mira y se elige, sin cuenta; la cuenta es el segundo paso y, con cuenta (`conCuenta`), ya está hecho. El documento y el celular se
 * piden al separar, y con ellos se entra al Club.
 */
export function pasosParaSeparar(tiendas: readonly string[], conCuenta = false): PasoParaSeparar[] {
  const donde = tiendas.length > 0 ? `En cada prenda ves cuánto hay en ${listaDeNombres(tiendas)}.` : "En cada prenda ves cuánto hay en cada tienda.";
  const traer = tiendas.length === 1 ? "" : " Lo que no está en tu tienda, la tienda puede traerlo de otra.";
  return [
    { titulo: "Elige tus prendas y tu tienda", texto: `${donde}${traer} Sin crear nada: la tienda es de todos.`, hecho: false },
    conCuenta
      ? { titulo: "Ya tienes tu cuenta", texto: "Con ella separas, guardas favoritos y sigues tus pedidos.", hecho: true }
      : { titulo: "Entra o crea tu cuenta", texto: "Con tu correo, en un minuto. Solo te pedimos lo necesario.", hecho: false },
    {
      titulo: "Toca «Separar» y mándalo por WhatsApp",
      texto: "La primera vez completas tu documento y tu celular y entras al Club CAYLA. Se crea tu pedido con su número y el mensaje ya va escrito. No pagas nada en la web.",
      hecho: false,
    },
    {
      titulo: "Paga y recógelo",
      // «Coordinas … con la tienda»: antes decía «Coordinan el pago», y no se sabía quién.
      texto: "Coordinas el pago con la tienda por WhatsApp (Yape, Plin, transferencia o en tienda) y lo recoges en tu tienda con un código.",
      hecho: false,
    },
  ];
}

/**
 * Los avisos de «Cómo separar»: cuánto espera un pedido sin confirmar, cuánto hay para pagarlo y dónde se recoge. Sin el plazo, sin
 * número. El primero es el plazo de la TIENDA para confirmarlo (el mismo que cuenta hacia atrás la página del pedido, «Falta que la
 * tienda lo confirme»): el título decía «Tienes 24 horas», y parecía un plazo de la persona.
 */
export function avisosParaSeparar(p: Plazos): { confirmar: Paso; pagar: Paso; recoger: Paso } {
  const horas = p.horasParaConfirmar;
  const paraPagar = p.horasParaPagar;
  return {
    confirmar:
      horas !== null
        ? {
            titulo: `La tienda tiene ${enHoras(horas)} para confirmarlo`,
            texto: "Si en ese tiempo no lo confirma, el pedido se cierra solo y puedes volver a separarlo.",
          }
        : {
            titulo: "La tienda tiene un plazo para confirmarlo",
            texto: "Si no lo confirma a tiempo, el pedido se cierra solo y puedes volver a separarlo.",
          },
    pagar:
      paraPagar !== null
        ? {
            titulo: `Pagas dentro de ${enHoras(paraPagar)}`,
            texto: `Desde que la tienda confirma tu pedido tienes ${enHoras(paraPagar)} para pagarlo. Si no llega ningún pago, se anula solo y las prendas vuelven a la tienda.`,
          }
        : {
            titulo: "Si no pagas, se anula solo",
            texto: "Desde que la tienda confirma tu pedido tienes un plazo para pagarlo. Si no llega ningún pago, se anula solo y las prendas vuelven a la tienda.",
          },
    recoger: {
      titulo: "Por ahora, todo se recoge en tienda",
      texto: `Todavía no hacemos envíos. Lo recoges en la tienda que elegiste${p.diasParaRecoger !== null ? `, hasta ${enDias(p.diasParaRecoger)} después de pagar` : ""}.`,
    },
  };
}

/**
 * «Cambios y devoluciones» en tres cosas que se leen de un vistazo: cuánto tiempo, dónde y qué llevar. Promete lo mismo que
 * `textoCambios` (la misma regla de la tienda), solo que partido: el plazo de la caja (el que imprime la boleta), cualquier tienda CAYLA,
 * la boleta y la etiqueta puesta. Sin el plazo, sin número: lo dice la boleta.
 */
export function puntosDeCambios(p: Plazos): { plazo: Paso; donde: Paso; llevar: Paso } {
  return {
    plazo:
      p.diasParaCambiar !== null
        ? { titulo: `Tienes ${enDias(p.diasParaCambiar)}`, texto: "Para cambiar o devolver tu prenda, igual que en tienda." }
        : { titulo: "Mira el plazo en tu boleta", texto: "Es el mismo que en tienda, para cambiar o devolver tu prenda." },
    donde: { titulo: "En cualquier tienda CAYLA", texto: "La que te quede más cerca, aunque no sea donde la recogiste." },
    llevar: { titulo: "Lleva tu boleta", texto: "Y la prenda con su etiqueta puesta." },
  };
}

/** «Cambios y devoluciones» en una frase (la ficha de cada prenda la muestra así): como en tienda, con el mismo plazo que la boleta.
 *  Sin el plazo, se dice que va impreso en la boleta. */
export function textoCambios(p: Plazos): string {
  return p.diasParaCambiar !== null
    ? `Igual que en tienda: puedes cambiar o devolver tu prenda dentro de ${enDias(p.diasParaCambiar)}, en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta.`
    : "Igual que en tienda: puedes cambiar o devolver tu prenda en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta. El plazo va impreso en tu boleta.";
}

// ---- Las lecturas largas (Privacidad y Términos del Club): solo cómo se dibujan, nunca qué dicen ----

/** Una sección de un texto legal: su ancla y su título tal cual está escrito («1. Quién es responsable de tus datos»). */
export type SeccionLegal = { id: string; titulo: string };

/**
 * «1. Quién es responsable de tus datos» → el número («1») y el resto, para dibujar el número aparte en el índice y en el título
 * (revisión «a nivel mundial», 2026-10-16). Se lee igual: el título se arma con el número, su punto, un espacio y el resto, así que
 * no cambia ni una letra. Sin número al principio, va entero.
 */
export function partirTituloLegal(titulo: string): { numero: string | null; texto: string } {
  const m = /^(\d+)\.\s+(\S[\s\S]*)$/.exec(titulo);
  return m ? { numero: m[1], texto: m[2] } : { numero: null, texto: titulo };
}

/**
 * La sección que se está leyendo, para encenderla en el índice del costado: la última cuyo borde de arriba ya subió hasta la línea de
 * lectura (`linea`, en píxeles desde arriba de la ventana). Antes de la primera, la primera; al llegar al final de la página
 * (`alFinal`), la última, aunque sea tan corta que nunca suba hasta la línea. Sin secciones, ninguna.
 */
export function seccionQueSeLee(bordes: readonly { id: string; arriba: number }[], linea: number, alFinal = false): string | null {
  if (bordes.length === 0) return null;
  if (alFinal) return bordes[bordes.length - 1].id;
  let actual = bordes[0].id;
  for (const b of bordes) if (b.arriba <= linea) actual = b.id;
  return actual;
}
