import type { Familia } from "@cayla-retail/shared";
import { IconoCategoria } from "@/components/IconoCategoria";

// Las piezas que la maqueta A de Recibir (ADR-0393, `docs/maquetas/recibir-fardo-2026-10/a-camino.html`) suma a las del sistema. Sin
// estado: sirven en Server Components. Estilos en `app/estilos/recepcion-conteo.css` (solo tokens).

/** La caja del fardo, cerrada con su cinta: dice «esto es lo que llegó» antes de leer. */
export function CajaFardo() {
  return (
    <svg className="rc-caja" viewBox="0 0 200 170" aria-hidden>
      <path className="rc-cuerpo" d="M40 70 100 92 160 70 160 140 100 162 40 140z" />
      <path className="rc-cara" d="M100 92v70l60-22V70z" />
      <path className="rc-cinta" d="M100 92v70" />
      <path className="rc-tapa" d="M40 70 100 92 160 70 100 48z" />
    </svg>
  );
}

/** El ícono de una categoría en su baldosa (el de su prefijo; si no tiene dibujo propio, el de su familia). */
export function BaldosaCategoria({
  categoria,
  tamano = "normal",
}: {
  categoria: { prefijo: string | null; familia: string | null } | null;
  tamano?: "normal" | "chico";
}) {
  return (
    <span className="rc-cat-ic" data-tamano={tamano === "chico" ? "chico" : undefined} aria-hidden>
      <IconoCategoria prefijo={categoria?.prefijo ?? null} familia={(categoria?.familia as Familia | null) ?? null} className={tamano === "chico" ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"} />
    </span>
  );
}
