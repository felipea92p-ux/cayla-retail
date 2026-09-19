import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladosCerrados, getTrasladosEnCurso } from "@/lib/traslados";
import { estaAtrasado, llegaHoy, vistaTraslado } from "@/lib/traslados-reglas";
import { hoyEnLima } from "@/lib/movimientos-reglas";
import { TrasladosLista } from "@/components/TrasladosLista";

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}

// Traslados en dos fases (20260916150000): lo que antes era instantáneo
// (transferir()) ahora tiene un tramo intermedio que alguien tiene que poder
// ver — "qué está en camino, y qué me está esperando a mí para confirmar."
//
// Rediseñada el 2026-09-16 sobre el diseño de Felipe: tres tarjetas (lo que
// va, lo que me toca confirmar, lo que quedó con diferencia), una vista
// rápida por chips y la tabla con número, ruta, prendas, estado y la acción
// que corresponde. Lo que su diseño traía de otra empresa no entra: no hay
// «Almacén Central», ni guía SUNAT, ni courier, ni «red logística
// conectada» — cada envío es sede → sede y lo confirma quien recibe.
export default async function TrasladosPage() {
  const persona = await requirePersonaActualV2();
  const [enCurso, cerrados] = await Promise.all([getTrasladosEnCurso(persona.ubicacionId), getTrasladosCerrados(persona.ubicacionId)]);
  const hoy = hoyEnLima();

  const enCamino = enCurso.filter((t) => vistaTraslado(t, persona.ubicacionId) === "en_camino");
  const porConfirmar = enCurso.filter((t) => vistaTraslado(t, persona.ubicacionId) === "por_confirmar");
  const conDiferencia = enCurso.filter((t) => vistaTraslado(t, persona.ubicacionId) === "con_diferencia");

  const unidades = (ts: typeof enCurso) => ts.reduce((acc, t) => acc + t.unidadesEnviadas, 0);
  const llegandoHoy = enCamino.filter((t) => t.fechaEstimadaLlegada && llegaHoy(t.fechaEstimadaLlegada, hoy)).length;
  const masAntiguo = porConfirmar[0] ?? null; // ya vienen ordenados por ETA
  const porConfirmarAtrasados = porConfirmar.filter((t) => t.fechaEstimadaLlegada && estaAtrasado(t.fechaEstimadaLlegada, t.estado)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · Traslados · {persona.ubicacionEtiqueta}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Traslados entre sedes</h1>
          <p className="mt-1 text-sm text-tinta/65">Lo que salió de acá o viene llegando, hasta que la sede que recibe lo confirma.</p>
        </div>
        <Link href="/inventario/mover" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
          + Nuevo traslado
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta etiqueta="En camino desde acá" valor={enCamino.length} unidad={enCamino.length === 1 ? "envío" : "envíos"}>
          {enCamino.length === 0
            ? "Nada saliendo de esta sede ahora"
            : `${unidades(enCamino).toLocaleString("es-PE")} unidades viajando${llegandoHoy > 0 ? ` · ${llegandoHoy} ${llegandoHoy === 1 ? "llega" : "llegan"} hoy` : ""}`}
        </Tarjeta>
        <Tarjeta
          etiqueta="Por confirmar en mi sede"
          valor={porConfirmar.length}
          unidad={porConfirmar.length === 1 ? "traslado" : "traslados"}
          tono={porConfirmar.length > 0 ? "text-ambar-profundo" : undefined}
          acento={porConfirmar.length > 0}
          accion={masAntiguo ? { href: `/inventario/traslados/${masAntiguo.id}`, texto: `Confirmar el ${masAntiguo.numero}` } : undefined}
        >
          {masAntiguo
            ? `Traslado ${masAntiguo.numero} de ${masAntiguo.ubicacionOrigenNombre} · ${masAntiguo.unidadesEnviadas} unidades${
                masAntiguo.fechaEstimadaLlegada ? ` · llega ${fechaHora(masAntiguo.fechaEstimadaLlegada)}` : ""
              }${porConfirmarAtrasados > 0 ? ` · ${porConfirmarAtrasados} ${porConfirmarAtrasados === 1 ? "atrasado" : "atrasados"}` : ""}`
            : "Nada esperando confirmación"}
        </Tarjeta>
        <Tarjeta
          etiqueta="Con diferencia"
          valor={conDiferencia.length}
          unidad={conDiferencia.length === 1 ? "caso" : "casos"}
          tono={conDiferencia.length > 0 ? "text-rojo-profundo" : undefined}
          accion={conDiferencia[0] ? { href: `/inventario/traslados/${conDiferencia[0].id}`, texto: `Revisar el ${conDiferencia[0].numero}` } : undefined}
        >
          {conDiferencia.length === 0
            ? "Todo lo recibido coincidió con lo enviado"
            : `Lo recibido no coincide con lo enviado · espera a un líder de ${conDiferencia[0].ubicacionDestinoNombre}`}
        </Tarjeta>
      </div>

      <TrasladosLista enCurso={enCurso} cerrados={cerrados} miUbicacionId={persona.ubicacionId} hoyLima={hoy} />

      <p className="card-cayla px-5 py-3 text-xs text-tinta/65">
        <span className="text-tinta">Al recibir:</span> abre el traslado y registra lo que llegó, línea por línea (escaneando o a mano). Si coincide con lo
        enviado, se cierra solo y el stock entra al almacén de tu tienda. Si no coincide, queda «con diferencia» hasta que un líder de tu sede lo revise
        y cierre — nada entra al stock antes de eso.
      </p>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  unidad,
  tono,
  acento = false,
  accion,
  children,
}: {
  etiqueta: string;
  valor: number;
  unidad: string;
  tono?: string;
  acento?: boolean;
  accion?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <div className={`card-cayla p-5 ${acento ? "border-l-2 border-l-rojo" : ""}`}>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${tono ?? "text-tinta"}`}>{valor.toLocaleString("es-PE")}</span>
        <span className="text-sm text-tinta/55">{unidad}</span>
      </p>
      <p className="mt-1 text-xs text-tinta/65">{children}</p>
      {accion && (
        <Link href={accion.href} className="label-cayla mt-3 inline-block text-[11px] text-tinta underline underline-offset-2 hover:no-underline">
          {accion.texto} →
        </Link>
      )}
    </div>
  );
}
