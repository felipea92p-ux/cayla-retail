import { z } from "zod";
import { ambienteDeCampana, colorDelSello, comprobarLectura, coloresDeCampana, textoSobre } from "@cayla-retail/shared";
import { normalizar } from "./buscador";

// El diseño de la campaña que gana la portada (Tienda web ▸ Campañas, maqueta docs/maquetas/campanas-tienda-2026-10): la base lo arma en
// `retail.tienda_diseno_campana()` solo si el líder lo PROGRAMÓ; aquí se valida y se convierte en lo que la tienda pinta: tres colores
// y unas llaves. PRINCIPIO 9 (todo puede fallar): si el diseño no llega, es de otro modo que el que se sabe pintar, no se lee o es de otra
// campaña, la tienda se ve como siempre (`null`), nunca con letras que no se ven ni a medio vestir.

const esquemaDonde = z.object({
  franja: z.boolean().catch(true),
  portada: z.boolean().catch(true),
  catalogo: z.boolean().catch(true),
  sello: z.boolean().catch(true),
  bolsa: z.boolean().catch(true),
});

const esquemaDiseno = z.object({
  modo: z.literal("ambiente"),
  plantilla: z.string(),
  paleta: z.number().int().min(0).max(2),
  acento: z.string().nullable().optional(),
  donde: esquemaDonde.optional(),
});

const esquema = z.object({
  campana: z
    .object({
      nombre: z.string().min(1),
      diseno: esquemaDiseno.nullable(),
    })
    .nullable(),
});

export type DisenoDeLaTienda = {
  /** El nombre de la campaña que viste: una pieza solo se viste si es de ESA campaña (`aplicaA`). */
  campana: string;
  /** La clave del ambiente: la hoja de estilos de la tienda se viste por ella (`data-campana`). */
  plantilla: string;
  colores: { fondo: string; texto: string; acento: string; /** La letra que se lee sobre el acento (el botón). */ boton: string };
  /** El sello de descuento de cada prenda: un color que se lee sobre la foto (se ajusta solo) y la letra que se lee sobre él. */
  sello: { fondo: string; texto: string };
  /** Dónde se ve: lo que el líder apagó vuelve a verse como siempre. */
  donde: { franja: boolean; portada: boolean; catalogo: boolean; sello: boolean; bolsa: boolean };
};

const TODO = { franja: true, portada: true, catalogo: true, sello: true, bolsa: true };

/** El diseño que la tienda pinta para la campaña `nombreDeLaPortada`, o `null` (se ve como siempre). El nombre debe ser el de la campaña
 *  que anuncia la portada: si la base y la portada no están de acuerdo en cuál gana, no se mezcla el diseño de una con el texto de otra. */
export function interpretarDisenoCampana(dato: unknown, nombreDeLaPortada: string | null | undefined): DisenoDeLaTienda | null {
  if (!nombreDeLaPortada) return null;
  const leido = esquema.safeParse(dato);
  if (!leido.success || !leido.data.campana) return null;
  const { nombre, diseno } = leido.data.campana;
  if (!diseno || nombre !== nombreDeLaPortada) return null;
  if (!ambienteDeCampana(diseno.plantilla)) return null;
  const colores = coloresDeCampana(diseno.plantilla, diseno.paleta, diseno.acento ?? null);
  if (!colores || !comprobarLectura(colores).ok) return null;
  return {
    campana: nombre,
    plantilla: diseno.plantilla,
    colores: { ...colores, boton: textoSobre(colores.acento) },
    sello: colorDelSello(colores),
    donde: { ...TODO, ...diseno.donde },
  };
}

/** ¿Esta pieza es de la campaña que viste el diseño? (una prenda de OTRA campaña conserva su sello de siempre, sin tildes ni mayúsculas). */
export const aplicaA = (d: DisenoDeLaTienda | null | undefined, nombreDeCampana: string | null | undefined): d is DisenoDeLaTienda =>
  !!d && !!nombreDeCampana && normalizar(d.campana) === normalizar(nombreDeCampana);

/** Las variables de CSS con que se viste una pieza de la portada (`app/estilos/campana.css`). */
export function variablesDelDiseno(d: DisenoDeLaTienda): Record<string, string> {
  return { "--cmp-fondo": d.colores.fondo, "--cmp-texto": d.colores.texto, "--cmp-acento": d.colores.acento, "--cmp-boton": d.colores.boton };
}
