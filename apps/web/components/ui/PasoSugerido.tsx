import Link from "next/link";
import type { SiguientePaso } from "@/lib/proveedores-reglas";

const BORDE = { rojo: "border-l-rojo", ambar: "border-l-ambar", verde: "border-l-verde", neutro: "border-l-tinta/25" } as const;

/**
 * «¿Y ahora qué?» de un proveedor, en una línea (ADR-0122): la sugerencia más urgente que devuelve
 * `siguientePaso`, con su enlace cuando la acción es ir a otra pantalla. Lo dibujan igual la vista rápida
 * de la lista y la ficha, para que digan lo mismo. Las acciones que cambian el estado del proveedor
 * (desactivar / reactivar) NO llevan enlace acá: tienen su propio botón donde corresponde.
 * `animar` solo cuando aparece como respuesta a un clic (el cajón); en la ficha ya está puesta.
 */
export function PasoSugerido({ paso, proveedorId, animar = false, className = "" }: { paso: SiguientePaso; proveedorId: string; animar?: boolean; className?: string }) {
  const enlace =
    paso.accion === "pagar" ? { href: `/compras/por-pagar?prov=${proveedorId}`, texto: "Pagar vencido" }
    : paso.accion === "recibir" ? { href: `/compras/recibir?prov=${proveedorId}`, texto: "Ver entregas" }
    : paso.accion === "favor" ? { href: `/compras/proveedores/${proveedorId}#saldo-a-favor`, texto: "Ver saldo a favor" }
    : null;
  return (
    <div className={`card-cayla border-l-2 px-4 py-3 text-[13.5px] text-tinta ${BORDE[paso.tono]} ${animar ? "anim-revelar" : ""} ${className}`}>
      <b className="font-semibold">{paso.fuerte}</b>
      {paso.resto}
      {enlace && (
        <Link href={enlace.href} className="label-cayla mt-2 block text-[11px] text-tinta underline underline-offset-2 hover:no-underline sm:ml-1 sm:mt-0 sm:inline-block">
          {enlace.texto} →
        </Link>
      )}
    </div>
  );
}
