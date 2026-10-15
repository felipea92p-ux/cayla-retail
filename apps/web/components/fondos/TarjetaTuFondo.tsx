import { TarjetaCifra, type PropsTarjetaCifra } from "@/components/ui/TarjetaCifra";
import { caraTuFondo, type ResumenMiFondo } from "@/lib/fondos-reglas";
import { diaMes, diaYHoraLima } from "@/lib/fechas-lima";

/**
 * «Tu fondo» (ADR-0362, fase 6 · actividad 4; decisiones 26 y 32): la plata que CAYLA le entregó a quien compra, a la vista donde compra
 * (Órdenes de compra) y en su Inicio. Es una cifra, así que es LA pieza de cifra (`TarjetaCifra`, ADR-0358): «S/ 200.00 te queda» y
 * debajo de dónde sale («Gastaste S/ 300.00 de S/ 500.00»), con desde cuándo y para qué al pie, en UN renglón (el «para qué» admite
 * 200 letras y estiraba toda la fila de cifras; entero, en el `title`). Si pagó de su bolsillo, el número es lo que CAYLA le debe, en
 * ámbar (se salda al rendir), nunca un número negativo. Lo que dice vive en `caraTuFondo` (con su prueba).
 *
 * Lleva su `accion` («Rendir» o «Ver tu rendición», actividad 5) en Órdenes de compra y, desde /formidable (2026-10-14), también en el
 * Inicio: la arma `TuFondoConRendir`. `href` solo en el Inicio y solo cuando no hay nada que rendir: lleva a donde se compra. Una deuda
 * por un faltante (decisión 54) va a la vista, en ámbar, bajo el contexto.
 */
export function TarjetaTuFondo({
  fondo,
  href,
  accion,
  guia,
  className = "",
}: {
  fondo: ResumenMiFondo;
  href?: string;
  accion?: PropsTarjetaCifra["accion"];
  guia: string;
  className?: string;
}) {
  const c = caraTuFondo(fondo, diaMes, (iso) => diaYHoraLima(iso).dia);
  return (
    // La pieza no recibe atributos sueltos: el ancla de la guía va en la caja que la ubica (y le da el alto de su fila).
    <div data-guia={guia} className={`flex ${className}`}>
      <TarjetaCifra
        etiqueta="Tu fondo"
        valor={c.valor}
        unidad={c.unidad ?? undefined}
        tono={c.debe ? "text-ambar-profundo" : undefined}
        punto={c.debe ? "ambar" : undefined}
        detalleTono={c.debe ? "text-ambar-profundo" : undefined}
        pie={
          c.pie ? (
            <span className="block truncate" title={c.pie}>
              {c.pie}
            </span>
          ) : undefined
        }
        href={href}
        accion={href ? undefined : accion}
        className="w-full"
      >
        {c.contexto}
        {c.aviso && <span className="mt-0.5 block text-ambar-profundo">{c.aviso}</span>}
      </TarjetaCifra>
    </div>
  );
}
