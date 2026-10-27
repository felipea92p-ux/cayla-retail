import type { ReactNode } from "react";
import { CabeceraDeCompras } from "@/components/compras/CabeceraDeCompras";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { conteosDeCompras } from "@/lib/compras-pestanas";
import { pestanasDeCompras, vistasDeCompras, type ConteosDeCompras, type VistaCompras } from "@/lib/compras-pestanas-reglas";

// La cabecera de «Historial de compras» (ADR-0504, cabecera A de la maqueta `docs/maquetas/compras-historial-unificado-2026-10/`): UN título para
// las tres pestañas (la regla dice «el nombre del menú», y el menú tiene una sola fila), «Todas las tiendas» arriba —las tres pantallas
// muestran la empresa entera—, y bajo la frase la fila de pestañas con, a su derecha, las acciones de la pestaña en que estás. Las acciones
// siguen siendo de cada pantalla (Descargar el mes, Quién tiene plata…): la pantalla las pasa en `acciones` y aquí solo se les da su lugar.
//
// Las pestañas que trae cada cuenta salen de SUS módulos (`vistasDeCompras`): quien no ve una, no la tiene; y con una sola, la fila no se
// dibuja (un solo lugar donde ir no es una elección). Los contadores se leen aquí, solo lo que la pantalla no trae ya (`conteos`) y solo de
// las pestañas que esta cuenta ve; si una lectura falla, el contador se calla. Lo que se dibuja vive en `CabeceraDeCompras`.

export async function CabeceraHistorialCompras({
  activa,
  acciones,
  conteos,
}: {
  activa: VistaCompras;
  /** Lo que se hace desde la pestaña en que estás, a la derecha de la fila de pestañas. */
  acciones?: ReactNode;
  /** Lo que la pantalla ya leyó por su cuenta: aquí no se vuelve a pedir. */
  conteos?: ConteosDeCompras;
}) {
  const persona = await requirePersonaActualV2();
  const vistas = vistasDeCompras(persona.modulos.map((m) => m.clave));
  const leidos =
    vistas.length > 1
      ? await conteosDeCompras({ revisar: vistas.some((v) => v.clave === "revisar"), porPagar: vistas.some((v) => v.clave === "porpagar") }, conteos)
      : {};
  return <CabeceraDeCompras activa={activa} items={pestanasDeCompras(vistas, leidos)} acciones={acciones} />;
}
