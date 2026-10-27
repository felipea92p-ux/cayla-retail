import { ChartColumn } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { ESCALA_DESDE, ESCALA_HASTA, multiplicadorLegible, posicionEnLaEscala } from "@/lib/plan-compra-calendario-evidencia";
import { fechaCortaES } from "@/lib/plan-compra-reglas";
import { frasesDelVeredicto, veredictoAlCerrar, type HistoriaDelPlan, type VeredictoMedido } from "@/lib/plan-compra-veredicto";

// Plan de campaña ▸ Resultados ▸ «¿Subió la venta?» (ADR-0525, actualización 2026-10-26 (b), tarea #8): al terminar una campaña, cuánto subió la venta ESTA vez contra lo que subió los otros
// años, con la misma cuenta del Calendario. La cuenta y las frases son de `lib/plan-compra-veredicto.ts`; esto solo las dibuja. Solo lee.

/** La barra de rango de la tarjeta: los otros años como una banda con su mediana, y ESTE año como un punto. El color lo dice el veredicto y nunca es lo único: lo dicen también el chip y las frases. */
function BarraDeEsteAnio({ v }: { v: VeredictoMedido }) {
  const o = v.otros;
  const aria = `${v.veredicto.texto}: este año ${multiplicadorLegible(v.esteAnio)}${o ? `; los otros años, de ${multiplicadorLegible(o.min)} a ${multiplicadorLegible(o.max)}, mediana ${multiplicadorLegible(o.mediana)}` : ""}`;
  return (
    <div className="cal-rng cal-rng-este" data-tono={v.veredicto.tono} role="img" aria-label={aria}>
      <div className="cal-rng-pista" />
      <div className="cal-rng-uno" style={{ left: `${posicionEnLaEscala(1)}%` }} />
      {o && <div className="cal-rng-rango" style={{ left: `${posicionEnLaEscala(o.min)}%`, width: `${Math.max(2, posicionEnLaEscala(o.max) - posicionEnLaEscala(o.min))}%` }} />}
      {o && <div className="cal-rng-med" style={{ left: `${posicionEnLaEscala(o.mediana)}%` }} />}
      <div className="cal-rng-punto" style={{ left: `${posicionEnLaEscala(v.esteAnio)}%` }} />
      <div className="cal-rng-escala" aria-hidden>
        <span style={{ left: 0 }}>{multiplicadorLegible(ESCALA_DESDE)}</span>
        <span style={{ left: `${posicionEnLaEscala(1)}%` }}>×1 = un día normal</span>
        <span style={{ right: 0 }}>×{ESCALA_HASTA}</span>
      </div>
    </div>
  );
}

export function VeredictoDeLaCampana({ h, nombre, conCalendario }: { h: HistoriaDelPlan; nombre: string; conCalendario: boolean }) {
  const v = h.fallo ? null : veredictoAlCerrar(h.evidencia, h.anio);
  const ayuda = (
    <Ayuda titulo="¿Subió la venta?">
      <span className="block">
        Cuenta cuántos soles vendió la tienda por día durante la campaña y los compara con lo que vendía por día en los 60 días de antes. «×2.0 un día normal» es el doble.
      </span>
      <span className="mt-2 block">
        No dice cuánto ganaste ni cuánto sobró: eso lo dice el cierre, aquí abajo. Y mide los soles de la tienda entera, no una categoría: con descuento se venden más prendas por menos soles, por eso
        puede no coincidir con las prendas por tienda de más abajo.
      </span>
      <span className="mt-2 block">
        Los 60 días de antes pueden incluir otra campaña si hubo una cerca (Black Friday antes de Navidad): entonces «un día normal» es más alto y el número sale más bajo.
      </span>
    </Ayuda>
  );
  const titulo = (
    <TituloSeccion
      accion={
        conCalendario ? (
          <EnlaceVer href={`/compras/plan/calendario?hoja=${encodeURIComponent(h.clave)}`}>
            Decidir en el Calendario
          </EnlaceVer>
        ) : undefined
      }
    >
      <span className="inline-flex items-center gap-2">
        ¿Subió la venta? {ayuda}
      </span>
    </TituloSeccion>
  );

  if (h.fallo) {
    return (
      <section data-guia="plan-resultados.veredicto" className="card-cayla space-y-3 p-5">
        {titulo}
        <Aviso tono="atencion" chico>
          No se pudo leer tu historia ahora para decir si subió la venta. El resto de los resultados sigue igual; vuelve a abrir la pantalla en un momento.
        </Aviso>
      </section>
    );
  }
  if (!v || v.estado === "sin-medida") {
    return (
      <section data-guia="plan-resultados.veredicto" className="card-cayla space-y-3 p-5">
        {titulo}
        <Vacio tamano="chico" icono={<ChartColumn />} titulo="Esta campaña no se pudo medir">
          {h.evidencia === null
            ? "Todavía no hay historia con qué medirla: la tienda no tiene ventas cargadas en las fechas de esta campaña ni en los 60 días de antes."
            : "Este año no se pudo medir: faltan ventas cargadas en las fechas de la campaña o en los 60 días de antes."}
        </Vacio>
      </section>
    );
  }

  const f = frasesDelVeredicto(v, nombre);
  return (
    <section data-guia="plan-resultados.veredicto" className="card-cayla space-y-4 p-5">
      {titulo}
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center">
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-tinta">
            <Chip tono={v.veredicto.tono} versalitas={false}>{v.veredicto.texto}</Chip>
            <span>{f.principal}</span>
          </p>
          <p className="text-sm text-tinta/80">{f.comparada}</p>
          {f.aviso && <p className="text-sm text-taupe">{f.aviso}</p>}
        </div>
        <div className="min-w-0 pb-5">
          <BarraDeEsteAnio v={v} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-taupe">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="cal-leyenda-punto" data-tono={v.veredicto.tono} /> Esta vez
        </span>
        {v.otros && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="cal-leyenda-banda" data-tono={v.veredicto.tono} /> Los otros años (la marca gruesa es la mediana)
          </span>
        )}
        <span>
          En soles de {h.tienda?.nombre ?? "la tienda"}
          {h.fechas ? `, del ${fechaCortaES(h.fechas.desde)} al ${fechaCortaES(h.fechas.hasta)}` : ""}, contra sus 60 días de antes.
        </span>
      </div>
    </section>
  );
}
