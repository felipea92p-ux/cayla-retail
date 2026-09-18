import { Package, PackageCheck, Truck, TriangleAlert } from "lucide-react";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { FiltroTraslado, ResumenTraslados } from "@/lib/traslados-reglas";

// Los cuatro indicadores. Tres de ellos son ATAJOS: tocarlos filtra la lista
// (y tocarlos de nuevo la devuelve a «Todos») y filtran EXACTAMENTE lo que
// cuentan — si la tarjeta dice 1, la lista muestra 1. Con valor 0 dejan de ser
// botones (no llevarían a nada). El cuarto —prendas en tránsito— es un total,
// no un filtro, así que no se dibuja como tocable: una tarjeta que parece
// botón y no hace nada es peor que no tenerla.
// Todo el número sale de `resumirTraslados`; acá solo se dice con palabras.
function Disco({ children, tono }: { children: React.ReactNode; tono: string }) {
  return (
    // Sin el disco en celular: dos tarjetas por fila no dejan sitio para un ícono, y las cuatro apiladas de a
    // una se comían la pantalla antes de llegar a la lista.
    <span aria-hidden className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full sm:flex ${tono}`}>
      {children}
    </span>
  );
}

const NEUTRO = "bg-tinta/[0.06] text-tinta/60";

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
  const icono = "h-5 w-5";

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
        icono={
          <Disco tono={r.porRecibir > 0 ? "bg-rojo/10 text-rojo-profundo" : NEUTRO}>
            <PackageCheck strokeWidth={1.5} className={icono} />
          </Disco>
        }
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
        icono={
          <Disco tono={NEUTRO}>
            <Truck strokeWidth={1.5} className={icono} />
          </Disco>
        }
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
        icono={
          <Disco tono={r.conDiferencia > 0 ? "bg-ambar/15 text-ambar-profundo" : NEUTRO}>
            <TriangleAlert strokeWidth={1.5} className={icono} />
          </Disco>
        }
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
        icono={
          <Disco tono={NEUTRO}>
            <Package strokeWidth={1.5} className={icono} />
          </Disco>
        }
      >
        {r.abiertos === 0 ? "Nada en tránsito" : `En ${r.abiertos} ${r.abiertos === 1 ? "traslado abierto" : "traslados abiertos"}`}
      </TarjetaCifra>
    </div>
  );
}
