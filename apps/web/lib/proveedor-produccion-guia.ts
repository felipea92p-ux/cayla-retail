import type { CampoDeGuia } from "./guia-campos";

// La guía de foco de «Nuevo proveedor» / editar proveedor del Taller (ADR-0284, P09 del análisis del Taller del 2-nov-2026).
//
// CONTRATO
//   PROMETE: decir qué campos del proveedor hay que llenar para guardar (el nombre, qué le vende al Taller y quién lo anota) y cuáles son
//            opcionales (RUC, contacto, teléfono, plazo, forma de pago y todo «Cómo pagarle»).
//   ASUME:   lo obligatorio es EXACTAMENTE lo que `ProveedorProduccionModal.guardar` ya exige antes de llamar a `guardar_proveedor_produccion`;
//            esta función no agrega reglas. Qué más «conviene» (¿el RUC?) es una decisión de negocio de Felipe: hoy nada es «sugerido».
//   NO HACE: no valida formatos (RUC de 11 dígitos, CCI, celular): eso sigue bajo su campo, como error de ese dato.

export type EntradaProveedor = {
  nombre: string;
  rubro: string;
  ruc: string;
  contacto: string;
  telefono: string;
  plazo: string;
  forma: string;
  /** «Cómo pagarle»: banco, cuenta, CCI, celular, app o titular: basta que haya uno para darlo por hecho. */
  tieneCuentas: boolean;
  responsableListo: boolean;
};

export function camposDeProveedor(e: EntradaProveedor): CampoDeGuia[] {
  const lleno = (s: string) => s.trim() !== "";
  return [
    { id: "nombre", nombre: "El nombre", requerido: true, hecho: lleno(e.nombre), pendiente: "Escribe el nombre o la razón social." },
    { id: "rubro", nombre: "Qué le vende al Taller", requerido: true, hecho: lleno(e.rubro), pendiente: "Elige qué le vende al Taller: tela, avíos, maquila u otro." },
    { id: "ruc", nombre: "El RUC", requerido: false, hecho: lleno(e.ruc), pendiente: "" },
    { id: "contacto", nombre: "El contacto", requerido: false, hecho: lleno(e.contacto), pendiente: "" },
    { id: "telefono", nombre: "El teléfono", requerido: false, hecho: lleno(e.telefono), pendiente: "" },
    { id: "plazo", nombre: "El plazo de crédito", requerido: false, hecho: lleno(e.plazo), pendiente: "" },
    { id: "forma", nombre: "La forma de pago", requerido: false, hecho: lleno(e.forma), pendiente: "" },
    { id: "pagarle", nombre: "Cómo pagarle", requerido: false, hecho: e.tieneCuentas, pendiente: "" },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este proveedor." },
  ];
}
