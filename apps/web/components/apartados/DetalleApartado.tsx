"use client";

import { useEffect, useMemo, useReducer, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Archive, Bookmark, CalendarClock, MessageCircle, ShoppingBag, Undo2, Unlock, Wallet } from "lucide-react";
import { money, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { ICONO_METODO } from "@/components/PuntoDeVentaTicket";
import { Modal } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Aviso } from "@/components/ui/Aviso";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { EstadoChip, FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import { AbonarFormulario, type UbicacionApartado } from "@/components/apartados/ModalesApartado";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { diaLima, horaLima, sumarDias } from "@/lib/fechas-lima";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import { EXTENSIONES_MAX, estadoVisible, formatoCelular, type Apartado } from "@/lib/separaciones-reglas";
import {
  aplazamientoTrasCorte,
  aplazamientosSinFecha,
  detalleDeFila,
  hojaDetalle,
  historialDelApartado,
  motivoFechaAplazar,
  opcionesAplazar,
  textoDiasMas,
  type DetalleApartado,
  type EventoApartado,
  type ModoDetalle,
} from "@/lib/apartado-detalle-reglas";

export type { ModoDetalle } from "@/lib/apartado-detalle-reglas";

/** «jue, 25 sep · 16:34»: el día y la hora exactos de Lima. */
const cuando = (instante: string) => [fechaCorta(diaLima(instante)), horaLima(instante)].filter(Boolean).join(" · ");

/**
 * El detalle de UN apartado (ADR-0414, Felipe 2026-10-15): al tocar una fila del Historial se abre con todo lo que pasó —cada pago con su
 * día y hora exactos, su medio y quién lo cobró; los aplazamientos y los avisos— y desde aquí mismo se registra un abono o se aplaza el
 * vencimiento. Es UNA hoja que cambia de modo: mientras solo se lee lleva la ×; al abonar o aplazar, su «Cancelar» (ADR-0358, «Las hojas»).
 * El historial viene de `fn_detalle_separacion`; si la base no responde, se arma con lo que la lista ya trae, sin nombres.
 */
export function DetalleApartadoModal({
  apartado: a,
  ubicacion,
  hoy,
  cajaAbierta,
  puedeGestionar,
  conAbonos,
  conEstante,
  prendas,
  modoInicial = "ver",
  alCerrarEnfocar,
  onEntregar,
  onClose,
}: {
  apartado: Apartado;
  ubicacion: UbicacionApartado;
  hoy: string;
  cajaAbierta: boolean;
  /** Aplazar lo hace quien gestiona la caja: líder o cuenta de ventas (D5, la misma regla que liberar). */
  puedeGestionar: boolean;
  /** La tienda no apagó «Abonos a cuenta» en Opciones. */
  conAbonos: boolean;
  conEstante: boolean;
  prendas: VarianteBusqueda[];
  /** Desde el botón «Aplazar» de la fila se abre directo en ese modo, y al terminar o cancelar se cierra. */
  modoInicial?: ModoDetalle;
  /** A dónde vuelve el foco al cerrar: la fila que la abrió (si no, cae al fondo de la página). */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onEntregar: (id: string) => void;
  onClose: () => void;
}) {
  const [{ modo, ocupado }, despachar] = useReducer(hojaDetalle, { modo: modoInicial, ocupado: false });
  const setModo = (m: ModoDetalle) => despachar(m === "ver" ? { tipo: "volver" } : { tipo: "ir", modo: m });
  const setOcupado = useMemo(() => (valor: boolean) => despachar({ tipo: "ocupado", valor }), []);
  // Se vuelve a leer cada vez que la lista trae el apartado cambiado (un abono o un aplazamiento recién guardado).
  const clave = `${a.id}|${a.estado}|${a.adelanto}|${a.venceEl}|${a.extensiones}`;
  const [lectura, setLectura] = useState<{ clave: string; detalle: DetalleApartado | null; fallo: boolean } | null>(null);
  useEffect(() => {
    let vigente = true;
    void createClient()
      .rpc("fn_detalle_separacion" as never, { p_separacion_id: a.id } as never)
      .then(({ data, error }) => {
        if (vigente) setLectura({ clave, detalle: error ? null : detalleDeFila(data), fallo: Boolean(error) });
      });
    return () => {
      vigente = false;
    };
    // `clave` ya lleva el id del apartado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const detalle = lectura?.detalle ?? null;
  const leyendo = lectura?.clave !== clave;

  const titulo = modo === "abonar" ? "Registrar abono" : modo === "aplazar" ? "Aplazar el apartado" : `${a.nombres} ${a.apellidos}`;
  const subtitulo =
    modo === "ver"
      ? [a.codigo, a.celular && formatoCelular(a.celular), a.dni && `DNI ${a.dni}`].filter(Boolean).join(" · ")
      : `${a.nombres} ${a.apellidos} · ${a.codigo} · la prenda sigue guardada`;

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose} tamano="mediana" conCerrar={modo === "ver"} bloqueado={ocupado} alCerrarEnfocar={alCerrarEnfocar}>
      {(cerrar) => {
        // Lo que se abrió directo en un modo (desde la fila) se cierra al terminar; lo que se abrió desde el detalle vuelve a él.
        const volver = () => (modoInicial === "ver" ? setModo("ver") : cerrar());
        if (modo === "abonar")
          return <AbonarFormulario apartado={a} ubicacion={ubicacion} cajaAbierta={cajaAbierta} onListo={volver} onCancelar={volver} onOcupado={setOcupado} />;
        if (modo === "aplazar") return <AplazarFormulario apartado={a} ubicacion={ubicacion} hoy={hoy} onListo={volver} onCancelar={volver} onOcupado={setOcupado} />;
        return (
          <VistaDetalle
            a={a}
            hoy={hoy}
            detalle={detalle}
            leyendo={leyendo}
            fallo={Boolean(lectura?.fallo) && !leyendo}
            puedeGestionar={puedeGestionar}
            conAbonos={conAbonos}
            conEstante={conEstante}
            prendas={prendas}
            onAbonar={() => setModo("abonar")}
            onAplazar={() => setModo("aplazar")}
            onEntregar={() => onEntregar(a.id)}
          />
        );
      }}
    </Modal>
  );
}

function VistaDetalle({
  a,
  hoy,
  detalle,
  leyendo,
  fallo,
  puedeGestionar,
  conAbonos,
  conEstante,
  prendas,
  onAbonar,
  onAplazar,
  onEntregar,
}: {
  a: Apartado;
  hoy: string;
  detalle: DetalleApartado | null;
  leyendo: boolean;
  fallo: boolean;
  puedeGestionar: boolean;
  conAbonos: boolean;
  conEstante: boolean;
  prendas: VarianteBusqueda[];
  onAbonar: () => void;
  onAplazar: () => void;
  onEntregar: () => void;
}) {
  const porVariante = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const eventos = historialDelApartado(a, detalle);
  const sinFecha = aplazamientosSinFecha(a, detalle);
  const abierto = a.estado === "abierta";
  const aplazar = opcionesAplazar(a, hoy);

  return (
    <div className="space-y-6">
      {/* El estado y el dinero: cuánto pagó de cuánto, y hasta cuándo se le guarda. */}
      <section className="space-y-3 rounded-2xl border border-sand p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EstadoChip {...estadoVisible(a, hoy)} />
          <p className="text-[12.5px] text-tinta/70">
            {abierto ? (
              <>
                Vence el <b className="font-semibold text-tinta">{fechaCorta(a.venceEl)}</b>
                {a.extensiones > 0 && ` · aplazado ${a.extensiones} de ${EXTENSIONES_MAX} veces`}
              </>
            ) : (
              `Apartado el ${fechaCorta(diaLima(a.creadaEn))}`
            )}
          </p>
        </div>
        {/* Cuánto pagó de cuánto: el mismo resumen en línea que el panel de Entregar, no tarjetas de cifra (es una hoja). */}
        <dl className="grid grid-cols-3 gap-3 tabular-nums">
          {[
            { t: "Total", v: a.total },
            { t: "Pagó", v: a.adelanto },
            {
              t: abierto ? "Falta" : a.estado === "entregada" ? "Cobrado al recoger" : "Por devolver",
              v: abierto ? a.saldo : a.estado === "entregada" ? a.total - a.adelanto : a.estado === "liberada" ? a.adelanto : 0,
            },
          ].map((x, i) => (
            <div key={x.t}>
              <dt className="label-cayla text-[10.5px] text-tinta/60">{x.t}</dt>
              <dd className={`font-display text-xl leading-tight ${i === 2 ? "text-tinta" : "text-tinta/80"}`}>{money(x.v)}</dd>
            </div>
          ))}
        </dl>
        <BarraAvance pct={(Math.min(a.adelanto, a.total) / a.total) * 100} decorativa />
        {conEstante && a.estante && abierto && (
          <p className="inline-flex items-center gap-1 rounded-md bg-hueso px-2 py-0.5 font-mono text-[11px] text-tinta/80">
            <Archive className="h-3 w-3" aria-hidden /> Estante {a.estante}
          </p>
        )}
      </section>

      <section>
        <TituloSeccion nivel={3} cuenta={a.prendas.length} className="mb-2">
          Prendas
        </TituloSeccion>
        <ul className="divide-y divide-sand rounded-2xl border border-sand">
          {a.prendas.map((pr) => {
            const v = porVariante.get(pr.varianteId);
            return (
              <li key={pr.itemId || pr.varianteId} className="flex items-center gap-3 px-4 py-2.5">
                <FotoPrenda fotoUrl={v?.fotoUrl} referencia={pr.referencia} colorHex={v?.colorHex} categoria={v?.categoria} categoriaPrefijo={v?.categoriaPrefijo} categoriaFamilia={v?.categoriaFamilia} ancho={36} className="w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-tinta">{pr.referencia}</p>
                  <p className="text-[12px] text-tinta/60">{[v?.color, v?.talla].filter(Boolean).join(" · ") || pr.sku} · {pr.cantidad} u.</p>
                </div>
                <span className="text-sm tabular-nums">{money((pr.precioUnitario - pr.descuentoUnitario) * pr.cantidad)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-busy={leyendo}>
        <TituloSeccion nivel={3} className="mb-2">
          Historial
        </TituloSeccion>
        <ol className={`relative space-y-0.5 transition-opacity duration-200 ${leyendo ? "opacity-60" : ""}`}>
          {eventos.map((e, i) => (
            <FilaEvento key={i} e={e} ultimo={i === eventos.length - 1} />
          ))}
        </ol>
        {sinFecha > 0 && (
          <p className="mt-2 text-xs text-tinta/60">
            {sinFecha === 1 ? "Se aplazó una vez" : `Se aplazó ${sinFecha} veces`} antes de que el sistema guardara cuándo y quién.
          </p>
        )}
        {fallo && (
          <Aviso tono="info" chico className="mt-3">
            No se pudo leer quién cobró cada pago. Las fechas, horas y montos sí son los guardados.
          </Aviso>
        )}
      </section>

      {abierto && (
        <div className="space-y-2">
          {!puedeGestionar && <p className="text-xs text-tinta/60">Para aplazar el vencimiento, pídeselo a la líder o usa la cuenta de ventas de la tienda.</p>}
          {puedeGestionar && aplazar.bloqueo && <p className="text-xs text-tinta/60">{aplazar.bloqueo}</p>}
          <PieAcciones className="pie-hoja-fijo">
            {puedeGestionar && (
              <Boton type="button" peso="fantasma" onClick={onAplazar} disabled={Boolean(aplazar.bloqueo)} title={aplazar.bloqueo ?? undefined}>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" aria-hidden /> Aplazar
                </span>
              </Boton>
            )}
            {conAbonos && a.saldo > 0 && (
              <Boton type="button" peso="fantasma" onClick={onAbonar}>
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" aria-hidden /> Registrar abono
                </span>
              </Boton>
            )}
            <Boton type="button" peso="primario" onClick={onEntregar}>
              <span className="inline-flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4" aria-hidden /> Entregar
              </span>
            </Boton>
          </PieAcciones>
        </div>
      )}
    </div>
  );
}

const MOTIVO_LIBERADO: Record<string, string> = { vencio: "venció y no vino", clienta_desistio: "el cliente desistió", error_de_carga: "fue un error al apartar" };

/** Una línea de la historia: qué pasó, cuándo exactamente y quién; a la derecha, la plata si la hubo. */
function FilaEvento({ e, ultimo }: { e: EventoApartado; ultimo: boolean }) {
  let icono: React.ReactNode;
  let titulo: React.ReactNode;
  let nota: string | null = null;
  let monto: string | null = null;
  let verbo = "registró";
  switch (e.tipo) {
    case "aparto":
      icono = <Bookmark className="h-3.5 w-3.5" aria-hidden />;
      titulo = "Se apartó";
      nota = `Total ${money(e.total)}`;
      break;
    case "pago": {
      icono = ICONO_METODO[e.pago.metodo] ?? <Wallet className="h-3.5 w-3.5" aria-hidden />;
      titulo = `${e.pago.abono ? "Abono" : "Adelanto"} en ${NOMBRE_METODO[e.pago.metodo] ?? e.pago.metodo}`;
      const partes: string[] = [];
      if (e.pago.recibido !== null && e.pago.recibido > e.pago.monto) partes.push(`pagó con ${money(e.pago.recibido)}, vuelto ${money(e.pago.recibido - e.pago.monto)}`);
      if (e.pago.diasEspera > 0 && e.pago.venceDespues) partes.push(`se le esperó ${e.pago.diasEspera} días más, hasta el ${fechaCorta(e.pago.venceDespues)}`);
      nota = partes.join(" · ") || null;
      monto = money(e.pago.monto);
      verbo = "cobró";
      break;
    }
    case "aplazo":
      icono = <CalendarClock className="h-3.5 w-3.5" aria-hidden />;
      titulo = `Se aplazó al ${fechaCorta(e.venceDespues)}`;
      nota = `Antes vencía el ${fechaCorta(e.venceAntes)} · ${textoDiasMas(e.venceAntes, e.venceDespues)}`;
      verbo = "aplazó";
      break;
    case "aviso":
      icono = <MessageCircle className="h-3.5 w-3.5" aria-hidden />;
      titulo = "Se le escribió por WhatsApp";
      verbo = "escribió";
      break;
    case "entrego":
      icono = <ShoppingBag className="h-3.5 w-3.5" aria-hidden />;
      titulo = "Se entregó";
      nota = e.saldo > 0 ? `Cobró el saldo de ${money(e.saldo)}` : "Ya estaba pagado";
      verbo = "entregó";
      break;
    case "libero":
      icono = <Unlock className="h-3.5 w-3.5" aria-hidden />;
      titulo = e.solo ? "Se liberó solo" : "Se liberó";
      nota = e.solo ? "Venció hace más de 2 días: las prendas volvieron a la tienda" : e.motivo ? MOTIVO_LIBERADO[e.motivo] ?? null : null;
      verbo = "liberó";
      break;
    case "devolvio":
      icono = <Undo2 className="h-3.5 w-3.5" aria-hidden />;
      titulo = `Se devolvió el adelanto${e.medio ? ` por ${NOMBRE_METODO[e.medio as keyof typeof NOMBRE_METODO] ?? e.medio}` : ""}`;
      monto = money(e.monto);
      verbo = "devolvió";
      break;
  }
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 pb-3">
      {!ultimo && <span aria-hidden className="absolute top-7 bottom-0 left-[13px] w-px bg-sand" />}
      <span className="relative grid h-7 w-7 place-items-center rounded-full border border-sand bg-papel text-tinta/75 [&_svg]:h-3.5 [&_svg]:w-3.5">{icono}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-tinta">{titulo}</p>
        <p className="text-[12px] text-tinta/60 tabular-nums">
          {cuando(e.fecha)}
          {e.por && ` · ${verbo} ${e.por}`}
        </p>
        {nota && <p className="text-[12px] text-tinta/60">{nota}</p>}
      </div>
      {monto && <span className="pt-0.5 text-sm font-semibold tabular-nums text-tinta">{monto}</span>}
    </li>
  );
}

/**
 * Aplazar el vencimiento (ADR-0414): +3 días, +7 días o una fecha elegida, hasta 2 veces y nunca más allá de 30 días desde que se apartó.
 * Repetir el mismo guardado (doble clic, un reintento tras un corte) no cuenta dos veces: la base lo reconoce por la fecha.
 */
function AplazarFormulario({
  apartado: a,
  ubicacion,
  hoy,
  onListo,
  onCancelar,
  onOcupado,
}: {
  apartado: Apartado;
  ubicacion: UbicacionApartado;
  hoy: string;
  onListo: () => void;
  onCancelar: () => void;
  onOcupado: (ocupado: boolean) => void;
}) {
  const router = useRouter();
  const o = opcionesAplazar(a, hoy);
  // Nada elegido de entrada: es la fecha que se le promete al cliente, la elige quien atiende. Un atajo guarda la FECHA, no los días: si
  // tras un corte el apartado se relee ya aplazado, «+3» no se vuelve a contar desde la fecha nueva.
  const [eleccion, setEleccion] = useState<{ dias: number; fecha: string } | "otra" | null>(null);
  const [otra, setOtra] = useState("");
  const fecha = eleccion === "otra" ? otra : (eleccion?.fecha ?? "");
  const [enDuda, setEnDuda] = useState<string | null>(null);
  const trasCorte = aplazamientoTrasCorte(a, enDuda);
  const motivo = trasCorte === "quedo" ? null : motivoFechaAplazar(fecha, o);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => onOcupado(enviando), [enviando, onOcupado]);
  // Tras el corte la página se relee: si el apartado ya vence en la fecha mandada, quedó, y se dice así.
  useEffect(() => {
    if (trasCorte !== "quedo" || !enDuda) return;
    avisar.exito("Sí quedó: apartado aplazado", { detalle: `${a.nombres} recoge hasta el ${fechaCorta(enDuda)}. Avísale por WhatsApp.` });
    onListo();
    // Solo cuando la relectura trae la respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trasCorte]);
  const responsable = useResponsable(ubicacion, { modo: "atencion" }); // módulo Punto de venta: «¿Quién está atendiendo?», vacío al abrir

  const guia = useGuiaCampos([
    { id: "fecha", nombre: "Hasta cuándo", requerido: true, hecho: eleccion !== null && motivo === null, pendiente: eleccion === null ? "Elige hasta cuándo se le guarda." : (motivo ?? "") },
    { id: "responsable", nombre: "Quién atiende", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién está atendiendo." },
  ]);

  async function aplazar() {
    if (motivo || !responsable.listo || enviando) return;
    setEnviando(true);
    const { data, error } = await firmar(createClient().rpc("aplazar_separacion" as never, { p_separacion_id: a.id, p_vence_el: fecha } as never), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "aplazar el apartado"));
      // Pudo guardarse y perderse la respuesta: se relee el apartado y la hoja lo resuelve sola (arriba).
      if (esFalloDeRed(error)) {
        setEnDuda(fecha);
        router.refresh();
      }
      return;
    }
    avisar.exito("Apartado aplazado", { detalle: `${a.nombres} recoge hasta el ${fechaCorta(String(data ?? fecha))}. Avísale por WhatsApp.` });
    router.refresh();
    onListo();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-tinta/80">
        {o.desde === a.venceEl ? (
          <>
            Ahora vence el <b className="font-semibold text-tinta">{fechaCorta(a.venceEl)}</b>.
          </>
        ) : (
          <>
            Venció el <b className="font-semibold text-tinta">{fechaCorta(a.venceEl)}</b>: se cuenta desde hoy.
          </>
        )}{" "}
        Las prendas siguen guardadas y el precio se mantiene.
      </p>

      <CampoGuiado id="fecha" guia={guia} titulo="¿Hasta cuándo se le guarda?">
        <div role="radiogroup" aria-label="Hasta cuándo se le guarda" className="grid grid-cols-3 gap-2">
          {o.atajos.map((x) => (
            <button
              key={x.dias}
              type="button"
              role="radio"
              aria-checked={eleccion !== null && eleccion !== "otra" && eleccion.dias === x.dias}
              disabled={!x.cabe || Boolean(o.bloqueo)}
              title={x.cabe ? undefined : `Pasa el tope: se guarda como mucho hasta el ${fechaCorta(o.tope)}`}
              onClick={() => setEleccion({ dias: x.dias, fecha: x.fecha })}
              className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-45 ${eleccion !== null && eleccion !== "otra" && eleccion.dias === x.dias ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel hover:border-taupe"}`}
            >
              <span className="text-sm font-semibold">+{x.dias} días</span>
              <span className={`text-[11.5px] ${eleccion !== null && eleccion !== "otra" && eleccion.dias === x.dias ? "text-crema/80" : "text-tinta/60"}`}>{fechaCorta(x.fecha)}</span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={eleccion === "otra"}
            disabled={Boolean(o.bloqueo)}
            onClick={() => setEleccion("otra")}
            className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-45 ${eleccion === "otra" ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel hover:border-taupe"}`}
          >
            <span className="text-sm font-semibold">Otra fecha</span>
            <span className={`text-[11.5px] ${eleccion === "otra" ? "text-crema/80" : "text-tinta/60"}`}>hasta el {fechaCorta(o.tope)}</span>
          </button>
        </div>
        {eleccion === "otra" && (
          <div className="anim-revelar mt-3">
            <CampoFecha
              etiqueta="Recoge hasta el"
              valor={otra}
              onValor={setOtra}
              tono={otra && motivo ? "error" : "neutro"}
              pie={otra && motivo ? motivo : `Entre el ${fechaCorta(sumarDias(o.desde, 1))} y el ${fechaCorta(o.tope)}.`}
            />
          </div>
        )}
      </CampoGuiado>

      {fecha && !motivo && (
        <p className="anim-revelar rounded-xl bg-hueso px-3.5 py-2.5 text-[13px] text-tinta/80">
          Recoge hasta el <b className="font-semibold text-tinta">{fechaCorta(fecha)}</b> ({textoDiasMas(o.desde, fecha)}).{" "}
          {o.restantes - 1 === 0 ? "Es el último aplazamiento que le queda." : `Después le queda ${o.restantes - 1} aplazamiento más.`}
        </p>
      )}
      {o.bloqueo && !enDuda && <Aviso tono="atencion" chico>{o.bloqueo}</Aviso>}
      {trasCorte === "reintentar" && (
        <Aviso tono="atencion" chico>
          Se cortó la conexión. Si se guardó, esta hoja se cierra sola en unos segundos; si no, vuelve a tocar «Aplazar al {fechaCorta(enDuda)}»: no se cuenta dos veces.
        </Aviso>
      )}

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={enviando} />
      </CampoGuiado>

      <PieGuia guia={guia} />
      <PieAcciones>
        <Boton type="button" peso="fantasma" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton
          type="button"
          peso="primario"
          cargando={enviando}
          textoCargando="Aplazando…"
          disabled={!guia.puedeConfirmar}
          title={guia.frase ?? undefined}
          onClick={aplazar}
          className={guia.claseConfirmar}
        >
          {fecha && !motivo ? `Aplazar al ${fechaCorta(fecha)}` : "Aplazar"}
        </Boton>
      </PieAcciones>
    </div>
  );
}
