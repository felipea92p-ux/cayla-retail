import { hojaBajoDemanda } from "@/components/HojaBajoDemanda";

// Las hojas que solo abre Caja y cuyo código baja recién cuando hacen falta (ADR-0674, actividad 7). Se abren con un toque y piden
// internet de todos modos (leen o guardan en la base): si no hay red al abrirlas, avisan y la próxima vez reintentan.
// «Cerrar caja», que también abre Vender, vive en `CerrarCajaBajoDemanda.tsx`.
//
// Es `.tsx` aunque no dibuja nada por sí mismo: el escáner de las guías interactivas (`guias/escaner.mjs`) solo sigue archivos `.tsx`
// para saber qué controles tiene una pantalla. Con otra extensión, los controles de estas hojas salían de la huella de Caja y su guía
// dejaba de estar vigilada.

export const HistorialCierresBajoDemanda = hojaBajoDemanda(
  () => import("@/components/HistorialCierresModal").then((m) => m.HistorialCierresModal),
  "el historial de cierres",
);

export const DetalleVentaBajoDemanda = hojaBajoDemanda(() => import("@/components/DetalleVentaModal").then((m) => m.DetalleVentaModal), "el detalle de la venta");

export const RegistrarGastoBajoDemanda = hojaBajoDemanda(() => import("@/components/RegistrarGastoModal").then((m) => m.RegistrarGastoModal), "«Registrar gasto»");
