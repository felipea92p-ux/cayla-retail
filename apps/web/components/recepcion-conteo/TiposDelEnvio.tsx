"use client";

import { Package } from "lucide-react";
import { IconoCategoria } from "@/components/IconoCategoria";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { colorDeAvance } from "@/lib/avance-color";
import { conMiles, type CifrasDelResumen, type TipoDeModelo } from "@/lib/recepcion-modelos-reglas";

// Re stock y Producto nuevo, arriba de la mesa (Felipe 2026-11-02, de su boceto): no se le pregunta a nadie, porque un envío puede traer los dos y el sistema ya sabe cuál es cada modelo
// por lo que anotó Compras. Siempre marca el tipo de lo que se está contando, para ubicarse; tocar uno deja en la lista solo esos, y el filtro se quita desde ahí.

const TIPOS: readonly { id: TipoDeModelo; titulo: string; texto: string; icono: React.ReactNode }[] = [
  { id: "restock", titulo: "Re stock de producto existente", texto: "Ya está en tu inventario. Con tallas y colores, entra al stock al cerrar.", icono: <Package aria-hidden className="h-5 w-5" /> },
  { id: "nuevo", titulo: "Producto nuevo", texto: "Aún no está en tu catálogo. Valida la cantidad; tallas y colores pueden esperar.", icono: <IconoCategoria prefijo={null} familia={null} className="h-5 w-5" /> },
];

export function TiposDelEnvio({ tipos, marcado, filtrado, onElegir }: { tipos: CifrasDelResumen["tipos"]; /** El tipo de lo que se cuenta, o el filtro si está puesto. */ marcado: TipoDeModelo | null; filtrado: TipoDeModelo | null; onElegir: (t: TipoDeModelo) => void }) {
  return (
    <div className="rc-tipos" role="group" aria-label="Qué tipo de producto es" data-guia="recepcion.tipos">
      {TIPOS.map((t) => {
        const { modelos, contados } = tipos[t.id];
        const pct = modelos > 0 ? (contados / modelos) * 100 : 0;
        const nombreModelos = modelos === 1 ? "modelo" : "modelos";
        return (
          <button key={t.id} type="button" className="rc-tipo" data-activa={marcado === t.id ? "" : undefined} aria-pressed={filtrado === t.id} onClick={() => onElegir(t.id)}>
            <span className="rc-lente">{t.icono}</span>
            <span className="rc-tipo-textos">
              <b>
                {t.titulo} <small className="rc-tipo-mini">· {conMiles(modelos)} {nombreModelos}</small>
              </b>
              <span>{t.texto}</span>
            </span>
            <span className="rc-tipo-cifra">
              <span>
                <b>{conMiles(modelos)}</b> {nombreModelos} · <b>{conMiles(contados)}</b> {contados === 1 ? "contado" : "contados"}
              </span>
              <BarraAvance pct={pct} alto="fina" color={colorDeAvance(pct)} decorativa />
            </span>
            <span className="rc-radio" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
