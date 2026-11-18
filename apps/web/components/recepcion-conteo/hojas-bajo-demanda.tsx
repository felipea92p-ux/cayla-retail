"use client";

import type { ComponentProps } from "react";
import { hojaBajoDemanda } from "@/components/HojaBajoDemanda";
import type { HojaPrenda } from "@/components/recepcion-envio/HojaPrenda";

// Lo que Recibir un envío descarga recién cuando hace falta (ADR-0674, actividad 7). Contar un envío era la pantalla más pesada del ERP
// (1 031 KB propios, medidos con `scripts/peso/por-modulo.mjs`) y es la que el almacén usa en el celular. Las dos piezas guardan en la
// base: sin internet no sirven de todos modos. Si no hay red al abrirlas, avisan y la próxima vez reintentan. Contar las precarga apenas
// la pantalla queda libre (`usePrecargarEnReposo`), así que abren al instante.
//
// LO QUE NO VA AQUÍ: contar. Lo contado que todavía no llegó a la base vive en la pantalla, y la pantalla no puede depender de una descarga.
//
// Es `.tsx`: el escáner de las guías interactivas (`guias/escaner.mjs`) sigue los `import()` de los archivos `.tsx` que una pantalla
// importa para saber qué controles tiene (ver `components/caja/hojas-bajo-demanda.tsx`).

const HojaPrendaDiferida = hojaBajoDemanda(() => import("@/components/recepcion-envio/HojaPrenda").then((m) => m.HojaPrenda), "la hoja de la prenda");

/** La hoja que crea una prenda o le agrega tallas y colores (112 KB con sus piezas de Nuevo producto). Si no se puede abrir, se cierra como con su ×. */
export function HojaPrendaBajoDemanda(props: ComponentProps<typeof HojaPrenda>) {
  return <HojaPrendaDiferida {...props} alFallar={props.onCerrar} />;
}
HojaPrendaBajoDemanda.precargar = HojaPrendaDiferida.precargar;

/** El paso «Cerrar» (65 KB). Si no se puede abrir, la pantalla vuelve a Contar (`alFallar`). */
export const CerrarEnvioBajoDemanda = hojaBajoDemanda(() => import("./CerrarEnvio").then((m) => m.CerrarEnvio), "el cierre del envío");
