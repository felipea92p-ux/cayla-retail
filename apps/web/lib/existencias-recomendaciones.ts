import { decidirTalla, type PisoDeTalla } from "./piso-plan";
import type { PoliticaOperativaInventario } from "./politica-operativa-inventario";

/* ====================================================================
   existencias-recomendaciones · la regla de piso del 2026-09-25, dicha con la decisión del motor del piso

   PASO INTERMEDIO (ADR-0328 act. 7, commit de terreno). Hasta hoy cada consumidor de Existencias preguntaba dos cosas por su
   cuenta —`accionHoy.tipo === "reponer_a_piso"` y `porColgar(f)`— y las combinaba a mano. Ahora cada talla trae UNA decisión
   (`PisoDeTalla`, la de `lib/piso-plan.ts`) y todos la leen. Este archivo produce esa decisión con la regla de SIEMPRE, sin
   cambiar una sola respuesta:

     piso ≤ umbral (4)  ⇔  piso < umbral + 1  ⇔  requisito = umbral + 1 para toda talla

   y `decidirTalla` reparte igual que antes: piso 0 con algo atrás → Por colgar; poco con algo atrás → Por reponer; sin nada
   atrás → Sin stock atrás; si no → Mantener. El commit siguiente cambia el PRODUCTOR por el motor nuevo; los consumidores ya no
   se tocan.
   ==================================================================== */

/** Lo mínimo de una fila de Existencias que hace falta para decidir (una `FilaExistencias` lo satisface por estructura). */
export type FilaParaPlan = { varianteId: string; pisoDisponible: number | null; almacenDisponible: number | null };

/** La decisión de cada talla con la regla de piso de la sede. Las filas que no separan piso y almacén (Taller) no llevan. */
export function planPisoPorVariante(filas: readonly FilaParaPlan[], politica: PoliticaOperativaInventario): Map<string, PisoDeTalla> {
  const requisito = politica.umbralStockPisoReposicion + 1;
  const mapa = new Map<string, PisoDeTalla>();
  for (const f of filas) {
    if (f.pisoDisponible === null || f.almacenDisponible === null) continue;
    mapa.set(f.varianteId, {
      accion: decidirTalla(f.pisoDisponible, f.almacenDisponible, requisito, false),
      requisito,
      central: false,
      vendidasRecientes: 0,
      ritmoAtributo: 0,
      entraUnaSaleUna: false,
    });
  }
  return mapa;
}
