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

/**
 * Los cuatro pasos de «Cómo separar», con las tiendas de la web: «En cada prenda ves cuánto hay en Trujillo, Arequipa y Lima». Con una
 * sola tienda no hay otra de dónde traer; sin tiendas (o sin base), la frase va sin nombres.
 */
export function pasosParaSeparar(tiendas: readonly string[]): Paso[] {
  const donde = tiendas.length > 0 ? `En cada prenda ves cuánto hay en ${listaDeNombres(tiendas)}.` : "En cada prenda ves cuánto hay en cada tienda.";
  const traer = tiendas.length === 1 ? "" : " Lo que no está en tu tienda, la tienda puede traerlo de otra.";
  return [
    { titulo: "Crea tu cuenta", texto: "Con tu correo, tu DNI, tu celular y tu cumpleaños, y forma parte del Club CAYLA." },
    { titulo: "Elige tus prendas y tu tienda", texto: `${donde}${traer}` },
    { titulo: "Toca «Separar» y mándalo por WhatsApp", texto: "Se crea tu pedido con su número y el mensaje ya va escrito. No pagas nada en la web." },
    {
      titulo: "Paga y recógelo",
      texto: "Coordinan el pago por WhatsApp (Yape, Plin, transferencia o en tienda) y lo recoges en tu tienda con un código.",
    },
  ];
}

/** Los avisos de «Cómo separar»: cuánto espera un pedido sin confirmar, cuánto hay para pagarlo y dónde se recoge. Sin el plazo, sin
 *  número. */
export function avisosParaSeparar(p: Plazos): { confirmar: Paso; pagar: Paso; recoger: Paso } {
  const horas = p.horasParaConfirmar;
  const paraPagar = p.horasParaPagar;
  return {
    confirmar:
      horas !== null
        ? {
            titulo: `Tienes ${enHoras(horas)}`,
            texto: `Si en ${enHoras(horas)} nadie confirma el pedido, se cierra solo y puedes volver a separarlo.`,
          }
        : { titulo: "Si nadie lo confirma, se cierra solo", texto: "Pasado el plazo, el pedido se cierra solo y puedes volver a separarlo." },
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

/** «Cambios y devoluciones»: como en tienda, con el mismo plazo que la boleta. Sin el plazo, se dice que va impreso en la boleta. */
export function textoCambios(p: Plazos): string {
  return p.diasParaCambiar !== null
    ? `Igual que en tienda: puedes cambiar o devolver tu prenda dentro de ${enDias(p.diasParaCambiar)}, en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta.`
    : "Igual que en tienda: puedes cambiar o devolver tu prenda en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta. El plazo va impreso en tu boleta.";
}
