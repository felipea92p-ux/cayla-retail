"use client";

import { Package, Shirt, Truck } from "lucide-react";
import { ResumenSede, type CifraResumen } from "@/components/ui/ResumenSede";
import { useFiltrosExistencias } from "@/components/useFiltrosExistencias";
import type { Condicion } from "@/lib/existencias-filtros";

/* ====================================================================
   Las cifras de la cabecera de Existencias (ADR-0391, Felipe 2026-10-12)

   «Colgadas en el piso» y «Guardadas en el almacén» FILTRAN la lista de un toque: la primera deja solo las prendas con algo
   colgado, la segunda las que tienen algo guardado; tocarla otra vez vuelve a todo. Escriben el mismo filtro «Condición» de la
   URL que el panel (`condicion=colgadas` / `guardadas`, `lib/existencias-filtros.ts`), así que la píldora de la barra lo dice y
   «Limpiar» lo quita, y no hay loader: Existencias ya tiene todo el stock de la sede (ADR-0308).

   Reemplaza al selector «Piso · Almacén · Ambos» de las tarjetas (2026-10-09), que se guardaba por computadora: dos equipos de la
   misma tienda veían tarjetas distintas, y en «Piso» el almacén desaparecía aunque el botón dijera «Colgar en el piso».

   Es un componente de cliente porque `ResumenSede` solo filtra desde uno (`alTocar` + `presionada`); los íconos se eligen aquí
   mismo, no cruzan desde la página. Donde la sede no separa piso y almacén (Taller) la cifra es «Disponibles aquí» y no filtra.
   ==================================================================== */

export type CifraColgadas = { valor: number; nota?: string; aparte?: string; titulo: string };

export function CifrasExistencias({
  sede,
  separa,
  colgadas,
  guardadas,
  disponibles,
  enCamino,
}: {
  sede: string;
  separa: boolean;
  /** La ropa libre en el piso contra lo que cabe (`cifraColgadasEnElPiso`). Solo donde se separa piso y almacén. */
  colgadas: CifraColgadas | null;
  /** Unidades libres en el almacén de la tienda. Solo donde se separa. */
  guardadas: number | null;
  /** Donde no se separa (Taller): lo libre en la sede, con su nota de 7 días si la hay. */
  disponibles: { valor: number; nota?: string } | null;
  /** Lo que viene en traslados hacia aquí; `href` solo para quien ve Traslados. `null` si no viene nada. */
  enCamino: { valor: number; href?: string } | null;
}) {
  const { filtros, aplicar } = useFiltrosExistencias(separa);
  const alternar = (c: Condicion) => aplicar({ condicion: filtros.condicion === c ? null : c });

  const cifras: CifraResumen[] = [];
  if (separa && colgadas && guardadas !== null) {
    cifras.push({
      valor: colgadas.valor,
      nota: colgadas.nota,
      aparte: colgadas.aparte,
      etiqueta: "Colgadas en el piso",
      icono: Shirt,
      alTocar: () => alternar("colgadas"),
      presionada: filtros.condicion === "colgadas",
      titulo: `${colgadas.titulo} Tócala para ver solo las prendas con algo colgado; tócala otra vez para ver todo.`,
    });
    cifras.push({
      valor: guardadas,
      etiqueta: "Guardadas en el almacén",
      icono: Package,
      alTocar: () => alternar("guardadas"),
      presionada: filtros.condicion === "guardadas",
      titulo: "Prendas en el almacén de la tienda: para venderlas hay que colgarlas. Tócala para ver solo las prendas con algo guardado; tócala otra vez para ver todo.",
    });
  } else if (disponibles) {
    cifras.push({ valor: disponibles.valor, nota: disponibles.nota, etiqueta: "Disponibles aquí", icono: Package, titulo: "Prendas libres en esta sede" });
  }
  if (enCamino) {
    cifras.push({ valor: enCamino.valor, etiqueta: "En camino hacia aquí", icono: Truck, href: enCamino.href, titulo: "Prendas que vienen en traslados hacia esta sede" });
  }
  return <ResumenSede sede={sede} cifras={cifras} />;
}
