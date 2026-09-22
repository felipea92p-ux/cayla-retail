import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { FiltroTraslado, ResumenTraslados } from "@/lib/traslados-reglas";

// Los cuatro indicadores. Tres de ellos son ATAJOS: tocarlos filtra la lista
// (y tocarlos de nuevo la devuelve a «Todos») y filtran EXACTAMENTE lo que
// cuentan — si la tarjeta dice 1, la lista muestra 1. Con valor 0 dejan de ser
// botones (no llevarían a nada). El cuarto —prendas en tránsito— es un total,
// no un filtro, así que no se dibuja como tocable: una tarjeta que parece
// botón y no hace nada es peor que no tenerla.
// Todo el número sale de `resumirTraslados`; acá solo se dice con palabras.
// Guía oficial (2026-09-22, ADR-0169): las cuatro son la tarjeta de cifra del sistema, sin disco de ícono —
// la cifra en color ya dice qué pide atención.

export function TrasladosResumen({
  resumen: r,
  filtro,
  onFiltro,
}: {
  resumen: ResumenTraslados;
  filtro: FiltroTraslado;
  onFiltro: (f: FiltroTraslado) => void;
}) {
  const alternar = (f: FiltroTraslado) => onFiltro(filtro === f ? "todos" : f);
  // Tocable si lleva a algo (cuenta > 0) o si es el filtro que ya está puesto (para poder quitarlo).
  const atajo = (f: FiltroTraslado) => (r.porFiltro[f] > 0 || filtro === f ? () => alternar(f) : undefined);

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <TarjetaCifra
        compacta
        etiqueta="Por recibir hoy"
        valor={r.porRecibir}
        unidad={r.porRecibir === 1 ? "traslado" : "traslados"}
        tono={r.porRecibir > 0 ? "text-rojo-profundo" : "text-tinta/40"}
        acento={r.porRecibir > 0}
        activa={filtro === "por_recibir"}
        onClick={atajo("por_recibir")}
      >
        {r.porRecibir > 0 ? "Requiere tu confirmación" : "Nada esperando tu confirmación"}
      </TarjetaCifra>

      <TarjetaCifra
        compacta
        etiqueta="Vienen en camino"
        valor={r.vienenEnCamino}
        unidad={r.vienenEnCamino === 1 ? "traslado" : "traslados"}
        tono={r.vienenEnCamino > 0 ? undefined : "text-tinta/40"}
        activa={filtro === "en_camino"}
        onClick={atajo("en_camino")}
      >
        {/* El filtro «En camino» también incluye lo que sale de esta sede: si lo hay, se dice, para que
            la cifra de la tarjeta y la de la lista cuadren en vez de contradecirse. */}
        En tránsito a tu sede
        {r.salientesEnCamino > 0 && ` · ${r.salientesEnCamino} ${r.salientesEnCamino === 1 ? "sale" : "salen"} de tu sede`}
      </TarjetaCifra>

      <TarjetaCifra
        compacta
        etiqueta="Con diferencia"
        valor={r.conDiferencia}
        unidad={r.conDiferencia === 1 ? "caso" : "casos"}
        tono={r.conDiferencia > 0 ? "text-ambar-profundo" : "text-tinta/40"}
        activa={filtro === "con_diferencia"}
        onClick={atajo("con_diferencia")}
      >
        {r.conDiferencia === 0
          ? "Todo coincide por ahora"
          : r.porRevisar > 0
            ? `${r.porRevisar} ${r.porRevisar === 1 ? "requiere" : "requieren"} tu revisión`
            : "Esperan la revisión de un líder"}
      </TarjetaCifra>

      <TarjetaCifra
        compacta
        etiqueta="Prendas en tránsito"
        valor={r.unidadesEnTransito.toLocaleString("es-PE")}
        unidad={r.unidadesEnTransito === 1 ? "unidad" : "unidades"}
        tono={r.unidadesEnTransito > 0 ? undefined : "text-tinta/40"}
      >
        {r.abiertos === 0 ? "Nada en tránsito" : `En ${r.abiertos} ${r.abiertos === 1 ? "traslado abierto" : "traslados abiertos"}`}
      </TarjetaCifra>
    </div>
  );
}
