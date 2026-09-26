import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { FiltroTraslado, ResumenTraslados } from "@/lib/traslados-reglas";

// Los cuatro indicadores (desde ADR-0239: por recibir, enviados en camino, con diferencia y prendas en tránsito —
// «Vienen en camino» se fue: todo lo que viene hacia mi sede es «por recibir», y la tarjeta quedaba siempre en 0
// al lado de «Prendas en tránsito: 3», que se contradecían; hallazgo 17). Tres de ellos son ATAJOS: tocarlos filtra la lista
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
  // Desde el rediseño del 2026-09-22 (ADR-0175) estas tarjetas SON el filtro de por recibir / en camino /
  // con diferencia (esos chips se fueron): la pista lo dice, en vez de esperar que alguien lo descubra.
  const pista = (f: FiltroTraslado) =>
    atajo(f) ? <span className="mt-1 block text-[11px] text-taupe">{filtro === f ? "Filtrando · toca para quitar" : "Toca para filtrar"}</span> : null;

  // «Con diferencia» cuenta pendientes y ya cerrados (si no, al cerrarse la pérdida desaparecía — hallazgo 15); la
  // frase dice cuál es cuál, empezando por lo que pide algo.
  const pendientesDiferencia = r.conDiferencia - r.diferenciasCerradas;
  const fraseDiferencia =
    r.conDiferencia === 0
      ? "Todo lo recibido coincidió"
      : [
          r.porRevisar > 0
            ? `${r.porRevisar} ${r.porRevisar === 1 ? "requiere" : "requieren"} tu revisión`
            : pendientesDiferencia > 0
              ? `${pendientesDiferencia} ${pendientesDiferencia === 1 ? "espera" : "esperan"} a un líder`
              : null,
          r.diferenciasCerradas > 0 ? `${r.diferenciasCerradas} ya ${r.diferenciasCerradas === 1 ? "cerrado" : "cerrados"}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      {/* Todo lo que viene hacia esta sede, llegue cuando llegue (ADR-0239): la hora estimada ya no esconde una caja
          que llegó antes. Lo atrasado se dice aparte, como dato. */}
      <TarjetaCifra
        compacta
        etiqueta="Por recibir"
        valor={r.porRecibir}
        unidad={r.porRecibir === 1 ? "traslado" : "traslados"}
        tono={r.porRecibir > 0 ? "text-rojo-profundo" : "text-tinta/40"}
        acento={r.porRecibir > 0}
        activa={filtro === "por_recibir"}
        onClick={atajo("por_recibir")}
      >
        {r.porRecibir === 0
          ? "Nada viene hacia tu sede"
          : r.porRecibirAtrasados > 0
            ? `${r.porRecibirAtrasados} ${r.porRecibirAtrasados === 1 ? "ya debió llegar" : "ya debieron llegar"}: cuéntalos`
            : "Cuéntalos apenas lleguen"}
        {pista("por_recibir")}
      </TarjetaCifra>

      <TarjetaCifra
        compacta
        etiqueta="Enviados en camino"
        valor={r.salientesEnCamino}
        unidad={r.salientesEnCamino === 1 ? "traslado" : "traslados"}
        tono={r.salientesEnCamino > 0 ? undefined : "text-tinta/40"}
        activa={filtro === "en_camino"}
        onClick={atajo("en_camino")}
      >
        {r.salientesEnCamino > 0 ? "Salieron de tu sede; los recibe la otra" : "Nada enviado por recibir"}
        {pista("en_camino")}
      </TarjetaCifra>

      <TarjetaCifra
        compacta
        etiqueta="Con diferencia"
        valor={r.conDiferencia}
        unidad={r.conDiferencia === 1 ? "caso" : "casos"}
        tono={r.porRevisar > 0 || pendientesDiferencia > 0 ? "text-ambar-profundo" : r.conDiferencia > 0 ? undefined : "text-tinta/40"}
        activa={filtro === "con_diferencia"}
        onClick={atajo("con_diferencia")}
      >
        {fraseDiferencia}
        {pista("con_diferencia")}
      </TarjetaCifra>

      {/* Suma lo que viene y lo que va: las prendas que salieron de una sede y todavía no entran a la otra. */}
      <TarjetaCifra
        compacta
        etiqueta="Prendas en tránsito"
        valor={r.unidadesEnTransito.toLocaleString("es-PE")}
        unidad={r.unidadesEnTransito === 1 ? "prenda" : "prendas"}
        tono={r.unidadesEnTransito > 0 ? undefined : "text-tinta/40"}
      >
        {r.enCamino === 0 ? "Nada en camino" : `En ${r.enCamino} ${r.enCamino === 1 ? "traslado en camino" : "traslados en camino"}`}
      </TarjetaCifra>
    </div>
  );
}
