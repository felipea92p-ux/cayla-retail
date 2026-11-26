/**
 * La guía de foco de la hoja «¿La tienes en la mano?» de Vender (`RegistrarBajadaModal`, ADR-0321 y ADR-0284).
 *
 * La hoja registra la bajada al piso que se olvidó y agrega la prenda al ticket. Lo único que la persona llena es quién atiende:
 * la bajada mueve stock y va firmada (ADR-0162), y en Vender el responsable se elige recién al cobrar, así que casi siempre llega
 * vacío. No agrega reglas: «falta» es lo mismo que la firma exige (`responsable.listo`) y su frase es la del combo.
 */
import type { CampoDeGuia } from "./guia-campos";

export function camposDeBajadaDesdeVender({ responsableListo, responsableMotivo }: { responsableListo: boolean; responsableMotivo: string | null }): CampoDeGuia[] {
  return [{ id: "quien", nombre: "Quién atiende", requerido: true, hecho: responsableListo, pendiente: responsableMotivo ?? "Elige quién está atendiendo." }];
}
