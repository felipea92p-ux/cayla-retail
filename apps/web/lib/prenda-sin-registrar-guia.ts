// La guía de foco de «Prenda sin registrar» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: los cinco campos del modal, en el orden de pantalla, con su «hecho» y su frase de lo que falta.
//   ASUME:   «hecho» es exactamente lo que `pasoSiguiente` ya exige para «Agregar al ticket» (la misma regla que apaga el botón y que
//            `registrar_venta` vuelve a exigir en la base). No agrega ninguna: todos son requeridos porque hoy los cinco bloquean.
//   NO HACE: no decide qué campo se enciende (eso es `siguienteDe` de `lib/guia-campos.ts`, con su retención mientras se escribe).
import type { CampoDeGuia } from "./guia-campos";
import { FALTA_POR_PASO, pasoSiguiente, type DatosPrendaSinRegistrar, type PasoPrenda } from "./prenda-sin-registrar-reglas";
import { FALTA_MOTIVO, faltaEnMotivo } from "./prenda-sin-registrar-motivo";

const NOMBRE: Record<PasoPrenda, string> = {
  categoria: "Categoría",
  talla: "Talla",
  color: "Color",
  descripcion: "Descripción",
  precio: "Precio",
};

export const PASOS_PRENDA: readonly PasoPrenda[] = ["categoria", "talla", "color", "descripcion", "precio"];

/** El dato de cada paso: para preguntarle a `pasoSiguiente` por ese solo dato. */
const DATO: Record<PasoPrenda, keyof DatosPrendaSinRegistrar> = {
  categoria: "categoriaId",
  talla: "tallaId",
  color: "colorCodigo",
  descripcion: "descripcion",
  precio: "precio",
};
const LLENO: DatosPrendaSinRegistrar = { categoriaId: "c", tallaId: "t", colorCodigo: "c", descripcion: "d", precio: 1 };

/** Un paso está hecho si `pasoSiguiente`, con todo lo demás lleno, ya no se detiene en él: la misma regla, sin copiarla. */
const hechoEn = (paso: PasoPrenda, d: Partial<DatosPrendaSinRegistrar>) => pasoSiguiente({ ...LLENO, [DATO[paso]]: d[DATO[paso]] }) !== paso;

/** Con `motivo` (solo al anotar en Vender; al corregir lo anotado no se pregunta), el «¿por qué la anotas a mano?» va primero: es la misma
 *  regla que apaga «Agregar al ticket» (`faltaEnMotivo`). */
export function camposGuiaPrenda(d: Partial<DatosPrendaSinRegistrar>, motivo?: { valor: string; detalle: string }): CampoDeGuia[] {
  const campos = PASOS_PRENDA.map((paso) => ({ id: paso, nombre: NOMBRE[paso], requerido: true, hecho: hechoEn(paso, d), pendiente: `${FALTA_POR_PASO[paso]}.` }));
  if (!motivo) return campos;
  const falta = faltaEnMotivo(motivo.valor, motivo.detalle);
  return [{ id: "motivo", nombre: "Por qué a mano", requerido: true, hecho: falta === null, pendiente: `${falta ?? FALTA_MOTIVO}.` }, ...campos];
}
