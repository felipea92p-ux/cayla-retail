import Link from "next/link";
import { Check } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { textoDeResultado, type RespuestaCuadre } from "@/lib/cuadre-piso-reglas";
import { AntesDespues, CifrasCuadre } from "./RevisarCuadre";

/*
 * El resultado del cuadre del piso (ADR-0328): lo que devolvió la base, sin confeti (como «Conteo terminado»). La fecha del
 * cuadre de la sede, quién lo hizo, cuánto se movió y lo que quedó «no cargado» (se escaneó y el sistema no lo tiene: no
 * se creó nada, hay que cargarlo aparte). Sin estado ni efectos.
 */
export function ResultadoCuadre({ respuesta, sede, otraPersona = false }: { respuesta: RespuestaCuadre; sede: string; otraPersona?: boolean }) {
  const t = textoDeResultado(respuesta, sede);
  return (
    <div className="space-y-4">
      <section role="status" className="card-cayla anim-revelar flex items-start gap-3 border-l-2 border-l-verde p-5">
        <Check aria-hidden className="mt-1 h-5 w-5 shrink-0 text-verde" />
        <div className="min-w-0">
          <p className="font-display text-xl text-tinta">{otraPersona ? `${respuesta.por || "Otra persona"} ya cuadró el piso de ${sede}` : t.titulo}</p>
          <p className="mt-0.5 text-sm text-taupe">{t.detalle}</p>
          {respuesta.nota && <p className="mt-1 text-sm text-tinta/80">«{respuesta.nota}»</p>}
        </div>
      </section>

      <CifrasCuadre resumen={respuesta} sede={sede} />
      <AntesDespues resumen={respuesta} sede={sede} />

      {respuesta.noCargado.length > 0 && (
        <section className="card-cayla overflow-hidden" aria-label="No cargadas">
          <header className="border-b border-tinta/10 px-4 py-3 sm:px-5">
            <h2 className="font-display text-lg text-tinta">No cargadas · {respuesta.noCargado.length}</h2>
            <p className="mt-0.5 text-xs text-taupe">
              Se escanearon como guardadas pero el sistema no las tiene en {sede}. El cuadre no las creó: cárgalas con «Ajustar stock» en
              Existencias, o revisa si vinieron de otra sede.
            </p>
          </header>
          <ul className="divide-y divide-tinta/10">
            {respuesta.noCargado.map((n) => (
              <li key={n.varianteId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <span className="min-w-0 text-sm text-tinta">{n.prenda}</span>
                <span className="flex items-center gap-2 text-xs tabular-nums text-taupe">
                  Escaneadas {n.escaneadas} · el sistema tenía {n.almacen + n.piso}
                  <Chip tono="ambar">{n.noCargadas === 1 ? "1 no cargada" : `${n.noCargadas} no cargadas`}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/inventario" className="btn-cayla btn-primario h-11">
          Ir a Existencias
        </Link>
        <Link href="/inventario/movimientos" className="btn-cayla btn-secundario h-11">
          Ver Movimientos
        </Link>
      </div>
      <p className="nota-cayla">
        Desde hoy, lo que cuelgues o guardes se registra al momento con «Colgar en el piso» y «Subir a almacén». Si en unos días el piso del
        sistema vuelve a no coincidir con el real, cuéntalo con un conteo antes de volver a cuadrar.
      </p>
    </div>
  );
}
