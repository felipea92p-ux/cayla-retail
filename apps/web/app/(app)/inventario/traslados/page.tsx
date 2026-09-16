import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladosEnCurso } from "@/lib/traslados";
import { estaAtrasado } from "@/lib/traslados-reglas";
import { ETIQUETA_ESTADO_TRASLADO } from "@/lib/movimientos-reglas";
import { Chip } from "@/components/ui/Chip";

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Traslados en dos fases (20260916150000): lo que antes era instantáneo
// (transferir()) ahora tiene un tramo intermedio que alguien tiene que poder
// ver — "qué está en camino, y qué me está esperando a mí para confirmar."
export default async function TrasladosPage() {
  const persona = await requirePersonaActualV2();
  const traslados = await getTrasladosEnCurso(persona.ubicacionId);

  const porConfirmar = traslados.filter((t) => t.ubicacionDestinoId === persona.ubicacionId);
  const enviadosPorMi = traslados.filter((t) => t.ubicacionOrigenId === persona.ubicacionId);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Traslados en curso</h1>
          <p className="mt-1 text-sm text-tinta/65">Lo que salió de acá o va llegando, hasta que la otra sede confirma.</p>
        </div>
        <Link href="/inventario/mover" className="label-cayla text-[11px] text-rojo hover:underline">
          + Nuevo traslado
        </Link>
      </div>

      <Grupo titulo="Por confirmar en mi sede" traslados={porConfirmar} />
      <Grupo titulo="Enviados por mí" traslados={enviadosPorMi} />

      {traslados.length === 0 && (
        <p className="card-cayla p-6 text-center text-sm text-tinta/65">No hay ningún traslado en curso ahora mismo.</p>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  traslados,
}: {
  titulo: string;
  traslados: Awaited<ReturnType<typeof getTrasladosEnCurso>>;
}) {
  if (traslados.length === 0) return null;
  return (
    <div>
      <p className="label-cayla mb-3 text-[11px] text-tinta/65">{titulo}</p>
      <div className="card-cayla divide-y divide-tinta/10">
        {traslados.map((t) => {
          const atrasado = t.fechaEstimadaLlegada ? estaAtrasado(t.fechaEstimadaLlegada, t.estado) : false;
          return (
            <Link
              key={t.id}
              href={`/inventario/traslados/${t.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-sand/30"
            >
              <div className="min-w-0">
                <p className="text-sm text-tinta">
                  {t.ubicacionOrigenNombre} <span className="text-tinta/55">→</span> {t.ubicacionDestinoNombre}
                </p>
                <p className="mt-0.5 text-xs text-tinta/65">
                  {t.unidadesEnviadas} unidades
                  {t.fechaEstimadaLlegada && ` · llega ${fechaCorta(t.fechaEstimadaLlegada)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {atrasado && <Chip tono="rojo">Atrasado</Chip>}
                <Chip tono={t.estado === "recibido_con_diferencia" ? "ambar" : "neutro"}>
                  {ETIQUETA_ESTADO_TRASLADO[t.estado] ?? t.estado}
                </Chip>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
