import { hojaBajoDemanda } from "@/components/HojaBajoDemanda";

// Las hojas de Existencias cuyo código baja recién cuando hacen falta (ADR-0674, actividad 7). Todas leen o guardan en la base: sin
// internet no sirven de todos modos, y si no hay red al abrirlas, avisan y la próxima vez reintentan.
//
// El panel de la prenda (con su planilla de «Ajustar stock» y sus flujos de colgar, subir, apartar y pedir) es lo más pesado de la
// pantalla y también lo que más se usa: Existencias lo precarga apenas queda libre (`usePrecargarEnReposo`), así que abre al instante.
//
// Es `.tsx` y solo lo importa Existencias: el escáner de las guías interactivas (`guias/escaner.mjs`) sigue los `import()` de cada
// archivo `.tsx` que una pantalla importa para saber qué controles tiene (ver `components/caja/hojas-bajo-demanda.tsx`).

export const PanelTallaBajoDemanda = hojaBajoDemanda(() => import("@/components/existencias/PanelTalla").then((m) => m.PanelTalla), "la prenda");

export const ResolverDanadosBajoDemanda = hojaBajoDemanda(() => import("@/components/ResolverDanadosModal").then((m) => m.ResolverDanadosModal), "las prendas dañadas");

export const ResumenStockBajoDemanda = hojaBajoDemanda(() => import("@/components/ResumenStockOverlay").then((m) => m.ResumenStockOverlay), "el resumen del stock");

export const BuscarPrendaBajoDemanda = hojaBajoDemanda(
  () => import("@/components/existencias/BuscarPrendaParaAjustar").then((m) => m.BuscarPrendaParaAjustar),
  "el buscador de prendas",
);

export const AjustarInventarioBajoDemanda = hojaBajoDemanda(() => import("@/components/AjustarInventarioModal").then((m) => m.AjustarInventarioModal), "«Ajustar inventario»");

// La cámara para escanear una prenda: en el celular es por donde se entra a una prenda, así que Existencias también la precarga en reposo.
export const EscanerBusquedaBajoDemanda = hojaBajoDemanda(() => import("@/components/EscanerBusqueda").then((m) => m.EscanerBusqueda), "la cámara");
