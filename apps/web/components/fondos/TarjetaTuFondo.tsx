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
 * `href` solo en el Inicio: lleva a donde se compra. En Órdenes de compra informa y lleva su `accion` (actividad 5: «Rendir» o «Ver tu
 * rendición», `TuFondoEnOrdenes`). Una deuda por un faltante (decisión 54) va a la vista, en ámbar, bajo el contexto.
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
        {/* Un monto no se parte entre «S/» y la cifra al bajar de renglón. */}
        {c.contexto.replaceAll("S/ ", "S/\u00a0")}
        {c.aviso && <span className="mt-0.5 block text-ambar-profundo">{c.aviso.replaceAll("S/ ", "S/\u00a0")}</span>}
      </TarjetaCifra>
    </div>
  );
}
