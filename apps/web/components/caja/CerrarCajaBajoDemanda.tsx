import { hojaBajoDemanda } from "@/components/HojaBajoDemanda";

// «Cerrar caja», con su código bajo demanda (ADR-0674, actividad 7). La abren Caja y Vender: una sola definición para las dos.
// Va en su propio archivo, aparte de las demás hojas de Caja (`hojas-bajo-demanda.tsx`): el escáner de las guías interactivas sigue los
// `import()` de cada archivo que una pantalla importa, y con las cuatro juntas le atribuía a Vender el historial de cierres, el detalle
// de una venta y «Registrar gasto», que Vender no dibuja.
export const CerrarCajaBajoDemanda = hojaBajoDemanda(() => import("@/components/CerrarCajaModalV2").then((m) => m.CerrarCajaModalV2), "«Cerrar caja»");
