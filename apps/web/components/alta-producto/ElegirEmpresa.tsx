"use client";

import { ChipOpcion } from "@/components/alta-producto/piezas";
import type { EmpresaAlta } from "@/lib/alta-producto-datos";

// «¿De qué tienda es?» (en la base y el código: la empresa) — lo PRIMERO que se contesta en el alta, antes de la categoría (ADR-0463, Felipe 2026-10-20).
// Dos negocios (CAYLA y CLAURE) comparten catálogo y sede de Lima —solo se pregunta desde Lima—, y las boletas de ambos salen con el RUC de CAYLA: la tienda
// solo dice a qué negocio pertenece la prenda. Sin respuesta de fábrica: una prenda en la tienda equivocada no se nota hasta tarde,
// y para eso está la guía de foco («Sigue aquí») y el candado de `problemasAlta`.

export function ElegirEmpresa({ empresas, empresaId, onElegir }: { empresas: EmpresaAlta[]; empresaId: string; onElegir: (id: string) => void }) {
  return (
    <div role="group" aria-label="Tienda a la que pertenece el producto" data-guia="nuevo.empresa" className="flex flex-wrap gap-2">
      {empresas.map((t, i) => (
        // El `data-guia` de la primera va en una caja que la envuelve: el piloto de la guía la toca y llega al botón de adentro.
        <div key={t.id} data-guia={i === 0 ? "nuevo.empresa-elegir" : undefined}>
          <ChipOpcion elegido={t.id === empresaId} onClick={() => onElegir(t.id)} className="min-w-32 justify-center font-medium">
            {t.nombre}
          </ChipOpcion>
        </div>
      ))}
    </div>
  );
}
