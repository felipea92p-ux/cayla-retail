"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Modal, botonCancelar, botonPrimario, campoEtiqueta } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/apartados-reglas";
import {
  estadoVisiblePedido,
  etiquetaLinea,
  faltaEnOrigen,
  llegadaIso,
  motivoCancelacion,
  opcionesLlegada,
  separarPedidos,
  textoPrendas,
  totalPrendas,
  type OpcionLlegada,
  type PedidoEntreSedes,
} from "@/lib/pedidos-entre-sedes-reglas";
import { accionesDe, avisoAlCliente, estadoVisibleConCliente, paraQuien, paraSubirDe, type ClientePedido } from "@/lib/pedidos-con-cliente-reglas";
import { esperaVisible } from "@/lib/pedidos-por-atender-reglas";
import { AvisarAlClienteModal, SigueEnPieModal, SubirPedidoAlAlmacenModal } from "@/components/PedidoClienteModales";

// «Pedir a otra sede» en Traslados (ADR-0242 D-7). Lugar provisional: el definitivo es la bandeja «Hoy te toca» de la
// tanda 2, que todavía no existe. Dos listas en una tarjeta:
//   · «Te piden»: lo que otra tienda me pidió y todavía no sale → «Enviar» (arma UN traslado con todo) o «No la tengo».
//   · «Pediste»: lo que yo pedí → su estado, «Ya no la necesito» mientras no salga, o el enlace al traslado.
// La página solo la monta si hay algo que mostrar (`hayPedidosQueMostrar`): nunca una tarjeta vacía.
// ADR-0328 act. 17: la misma lista lleva los pedidos PARA UN CLIENTE (una prenda, apartada en la sede que la envía): si
// está colgada, primero «Subir al almacén» (Felipe: dos pasos); al llegar, o si no va a llegar, «Avisar al cliente». Cada fila que espera dice
// hace cuánto, y desde las 48 h, «Sin respuesta» (el mismo plazo que avisa a los líderes). Decisión del 2026-10-04: del
// lado que tiene la prenda, el pedido es «para un cliente» (no conoce su nombre); del lado que pidió, a los 7 días se
// pregunta «¿sigue en pie?» (la reserva allá no vence sola).

type ConCliente = PedidoEntreSedes & { cliente: ClientePedido };
const conCliente = (p: PedidoEntreSedes | null): p is ConCliente => !!p?.cliente;

type Ubicacion = { ubicacionId: string; etiqueta: string };

export function PedidosEntreSedes({ pedidos, ubicacion, ahoraIso }: { pedidos: PedidoEntreSedes[]; ubicacion: Ubicacion; ahoraIso: string }) {
  const { tePiden, pediste } = separarPedidos(pedidos);
  const [enviar, setEnviar] = useState<PedidoEntreSedes | null>(null);
  const [cancelar, setCancelar] = useState<PedidoEntreSedes | null>(null);
  const [subir, setSubir] = useState<PedidoEntreSedes | null>(null);
  const [avisarA, setAvisarA] = useState<PedidoEntreSedes | null>(null);
  const [preguntar, setPreguntar] = useState<PedidoEntreSedes | null>(null);
  // Qué se le avisa al cliente (decisión del 2026-10-04): que llegó, o que no va a llegar.
  const avisoA = avisarA ? avisoAlCliente(avisarA) : null;
  const fila = (p: PedidoEntreSedes) => (
    <PedidoFila
      pedido={p}
      ahoraIso={ahoraIso}
      onEnviar={() => setEnviar(p)}
      onCancelar={() => setCancelar(p)}
      onSubir={() => setSubir(p)}
      onAvisar={() => setAvisarA(p)}
      onPreguntar={() => setPreguntar(p)}
    />
  );

  return (
    <section className="card-cayla overflow-hidden" aria-labelledby="pedidos-entre-sedes">
      <header className="px-4 pt-4 sm:px-5">
        <h2 id="pedidos-entre-sedes" className="font-display text-[22px] leading-tight text-tinta">
          Pedidos entre sedes
        </h2>
        <p className="mt-0.5 text-sm text-taupe">Lo que otras tiendas te piden enviar y lo que tú pediste, para reponer o para un cliente que espera.</p>
      </header>

      {tePiden.length > 0 && (
        <div className="mt-3">
          <p className="label-cayla px-4 text-[11px] text-taupe sm:px-5">Te piden · {tePiden.length}</p>
          <ul className="mt-1 divide-y divide-sand border-t border-sand">
            {tePiden.map((p) => (
              <li key={p.grupoId} className="px-4 py-3 sm:px-5">
                {fila(p)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pediste.length > 0 && (
        <div className={tePiden.length > 0 ? "border-t border-sand pt-3" : "mt-3"}>
          <p className="label-cayla px-4 text-[11px] text-taupe sm:px-5">Pediste · {pediste.length}</p>
          <ul className="mt-1 divide-y divide-sand border-t border-sand">
            {pediste.map((p) => (
              <li key={p.grupoId} className="px-4 py-3 sm:px-5">
                {fila(p)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {enviar && <EnviarPedidoEntreSedesModal pedido={enviar} ubicacion={ubicacion} onClose={() => setEnviar(null)} />}
      {cancelar && <CancelarPedidoEntreSedesModal pedido={cancelar} ubicacion={ubicacion} onClose={() => setCancelar(null)} />}
      {conCliente(subir) && <SubirPedidoAlAlmacenModal pedido={paraSubirDe(subir)} ubicacion={ubicacion} onClose={() => setSubir(null)} />}
      {conCliente(avisarA) && avisoA && <AvisarAlClienteModal pedido={avisarA} aviso={avisoA} sede={ubicacion} onClose={() => setAvisarA(null)} />}
      {conCliente(preguntar) && <SigueEnPieModal pedido={preguntar} sede={ubicacion} ahoraIso={ahoraIso} onClose={() => setPreguntar(null)} />}
    </section>
  );
}

function PedidoFila({
  pedido,
  ahoraIso,
  onEnviar,
  onCancelar,
  onSubir,
  onAvisar,
  onPreguntar,
}: {
  pedido: PedidoEntreSedes;
  ahoraIso: string;
  onEnviar: () => void;
  onCancelar: () => void;
  onSubir: () => void;
  onAvisar: () => void;
  onPreguntar: () => void;
}) {
  const acciones = accionesDe(pedido, ahoraIso);
  const estado = conCliente(pedido) ? estadoVisibleConCliente(pedido, ahoraIso) : estadoVisiblePedido(pedido);
  const total = totalPrendas(pedido);
  // Del lado que tiene la prenda, «para un cliente» (no conoce su nombre); del lado que pidió, «para Ana Lozano».
  const destinatario = conCliente(pedido) ? ` ${paraQuien(pedido)}` : "";
  const titulo =
    pedido.direccion === "me_piden"
      ? `${pedido.otraSede} te pide ${textoPrendas(total)}${destinatario}`
      : `A ${pedido.otraSede} · ${textoPrendas(total)}${destinatario}`;
  const quien = [pedido.creadoPorNombre, fechaCorta(pedido.creadoEn)].filter(Boolean).join(" · ");
  // Lo que sigue esperando dice hace cuánto; desde las 48 h, «Sin respuesta» (el mismo plazo que avisa a los líderes).
  const espera = pedido.estado === "pedido" ? esperaVisible(pedido.creadoEn, ahoraIso) : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-tinta">{titulo}</p>
          <Chip tono={estado.tono} tachado={false}>
            {estado.texto}
          </Chip>
        </div>
        {quien && <p className="mt-0.5 text-xs text-taupe">Pidió {quien}</p>}
        {espera && (
          <p className={`mt-0.5 text-xs ${espera.tarde ? "font-semibold text-ambar-profundo" : "text-taupe"}`}>{espera.texto}</p>
        )}
        <ul className="mt-2 space-y-1 text-sm text-tinta">
          {pedido.lineas.map((l) => (
            <li key={l.pedidoId || l.varianteId} className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular-nums font-semibold">{l.cantidad}×</span>
              <span className="min-w-0 break-words">{etiquetaLinea(l)}</span>
              {l.sku && <span className="text-xs text-taupe">{l.sku}</span>}
              {pedido.direccion === "me_piden" && faltaEnOrigen(l) && (
                <span className="inline-flex items-center gap-1 text-xs text-rojo-profundo">
                  <AlertTriangle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Te {l.disponibleEnOrigen === 1 ? "queda 1" : `quedan ${l.disponibleEnOrigen}`}
                </span>
              )}
            </li>
          ))}
        </ul>
        {pedido.nota && <p className="mt-2 text-xs text-tinta/75">Nota: {pedido.nota}</p>}
        {pedido.estado === "cancelado" && pedido.canceladoMotivo && <p className="mt-1 text-xs text-taupe">{pedido.canceladoMotivo}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {acciones.subirAlAlmacen && (
          // Con «Enviar» al lado (la reserva se liberó a mano y no se sabe dónde quedó), subir es la segunda opción.
          <button type="button" onClick={onSubir} className={`btn-cayla ${acciones.enviar ? "btn-secundario" : "btn-primario"}`}>
            Subir al almacén
          </button>
        )}
        {acciones.enviar && (
          <button type="button" onClick={onEnviar} className="btn-cayla btn-primario">
            Enviar
          </button>
        )}
        {acciones.sigueEnPie && (
          <button type="button" onClick={onPreguntar} className="btn-cayla btn-primario">
            ¿Sigue en pie?
          </button>
        )}
        {acciones.avisar && (
          <button type="button" onClick={onAvisar} className={`btn-cayla ${pedido.cliente?.avisadoEn ? "btn-sutil" : "btn-primario"}`}>
            {pedido.cliente?.avisadoEn ? "Avisar otra vez" : avisoAlCliente(pedido) === "no_llego" ? "Avisar que no llegó" : "Avisar al cliente"}
          </button>
        )}
        {acciones.noLaTengo && (
          <button type="button" onClick={onCancelar} className="btn-cayla btn-secundario">
            No la tengo
          </button>
        )}
        {acciones.yaNoLaNecesito && (
          <button type="button" onClick={onCancelar} className="btn-cayla btn-sutil">
            {pedido.cliente ? "Ya no la quiere" : "Ya no la necesito"}
          </button>
        )}
        {acciones.verTraslado && pedido.trasladoId && (
          <Link href={`/inventario/traslados/${pedido.trasladoId}`} className="btn-cayla btn-sutil inline-flex items-center gap-1">
            {pedido.trasladoNumero != null ? `Traslado ${pedido.trasladoNumero}` : "Ver traslado"}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        )}
      </div>
    </div>
  );
}

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });
}

/** «Enviar»: todo el pedido sale en UN traslado (`enviar_pedido_a_otra_sede`), con la llegada por día. */
function EnviarPedidoEntreSedesModal({ pedido, ubicacion, onClose }: { pedido: PedidoEntreSedes; ubicacion: Ubicacion; onClose: () => void }) {
  const router = useRouter();
  const opciones = opcionesLlegada(hoyLima());
  const [llegada, setLlegada] = useState<OpcionLlegada>(opciones[1]);
  const [enviando, setEnviando] = useState(false);
  // Un token por apertura del modal: el doble clic (o reintentar tras un corte) no arma dos traslados.
  const token = useRef<string>(crypto.randomUUID());
  const responsable = useResponsable(ubicacion);
  const faltan = pedido.lineas.filter(faltaEnOrigen);

  async function enviar(cerrar: () => void) {
    if (!responsable.listo) return;
    setEnviando(true);
    // Un pedido para un cliente sale con su función (suelta la reserva de aquí y viaja con su nombre); la reposición, por grupo.
    const supabase = createClient();
    const { error } = await firmar(
      pedido.cliente
        ? supabase.rpc("enviar_pedido_para_apartar", { p_pedido_id: pedido.grupoId, p_fecha_estimada_llegada: llegadaIso(llegada.fecha), p_token: token.current })
        : supabase.rpc("enviar_pedido_a_otra_sede", { p_grupo_id: pedido.grupoId, p_fecha_estimada_llegada: llegadaIso(llegada.fecha), p_token: token.current }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "enviar el pedido", { confirmarAntesDeRepetir: true }));
    avisar.exito(`Enviado a ${pedido.otraSede}`, { detalle: `Salió como traslado: ${textoPrendas(totalPrendas(pedido))}, llega ${llegada.etiqueta.toLowerCase()}.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={`Enviar a ${pedido.otraSede}`} subtitulo={`${textoPrendas(totalPrendas(pedido))} en un solo traslado`} onClose={onClose} ancho="max-w-md" bloqueado={enviando}>
      {(cerrar) => (
        <div className="space-y-4">
          <ul className="card-cayla space-y-1 p-4 text-sm">
            {pedido.lineas.map((l) => (
              <li key={l.pedidoId || l.varianteId} className="flex items-baseline gap-2">
                <span className="tabular-nums font-semibold">{l.cantidad}×</span>
                <span className="min-w-0 break-words">{etiquetaLinea(l)}</span>
              </li>
            ))}
          </ul>
          {faltan.length > 0 && (
            <p className="rounded-xl bg-rojo/10 px-3.5 py-2.5 text-xs text-rojo-profundo">
              Ya no tienes libre todo lo pedido de {faltan.map(etiquetaLinea).join(", ")}. Si no puedes enviarlo completo, usa «No la tengo».
            </p>
          )}
          <div>
            <span className={campoEtiqueta}>¿Cuándo llega?</span>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="¿Cuándo llega?">
              {opciones.map((o) => (
                <button key={o.clave} type="button" className="pildora-cayla" aria-pressed={llegada.clave === o.clave} onClick={() => setLlegada(o)}>
                  {o.etiqueta}
                </button>
              ))}
            </div>
          </div>
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">
            {pedido.cliente
              ? `Está apartada para el pedido de ${pedido.otraSede}: sale de tu almacén como un traslado más y, al llegar, ${pedido.otraSede} la tiene guardada para su cliente.`
              : `Sale de tu stock como un traslado más; Traslados lo muestra en camino hasta que ${pedido.otraSede} lo reciba.`}
          </p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => enviar(cerrar)} className={botonPrimario}>
              {enviando ? "Enviando…" : "Enviar por traslado"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** «No la tengo» (me piden) o «Ya no la necesito» (pedí): cancela lo que no salió (`cancelar_pedido_a_otra_sede`). */
function CancelarPedidoEntreSedesModal({ pedido, ubicacion, onClose }: { pedido: PedidoEntreSedes; ubicacion: Ubicacion; onClose: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const responsable = useResponsable(ubicacion);
  // Para un cliente, quien pidió cancela porque el cliente ya no la quiere; «No la tengo» suelta también la reserva de allá.
  const motivo = pedido.cliente && pedido.direccion === "pedi" ? "El cliente ya no la quiere" : motivoCancelacion(pedido.direccion);
  const mePiden = pedido.direccion === "me_piden";

  async function cancelar(cerrar: () => void) {
    if (!responsable.listo) return;
    setEnviando(true);
    const supabase = createClient();
    const { error } = await firmar(
      pedido.cliente
        ? supabase.rpc("cancelar_pedido_para_apartar", { p_pedido_id: pedido.grupoId, p_motivo: motivo })
        : supabase.rpc("cancelar_pedido_a_otra_sede", { p_grupo_id: pedido.grupoId, p_motivo: motivo }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "cancelar el pedido"));
    avisar.exito("Pedido cancelado", { detalle: `${pedido.otraSede} lo verá como «${motivo}».` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo={mePiden ? "¿No la tienes?" : "¿Ya no la necesitas?"}
      subtitulo={mePiden ? `Se le avisa a ${pedido.otraSede} que no se enviará.` : `Se cancela el pedido a ${pedido.otraSede}.`}
      onClose={onClose}
      bloqueado={enviando}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/80">
            {textoPrendas(totalPrendas(pedido))}: {pedido.lineas.map(etiquetaLinea).join(", ")}.
          </p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => cancelar(cerrar)} className={botonPrimario}>
              {enviando ? "Cancelando…" : motivo}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
