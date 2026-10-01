"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, ChevronDown, ChevronUp, Lock, Search, UserPlus, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Chip } from "@/components/ui/Chip";
import { InvitarAlClub, QrDeLaSociaHoja } from "@/components/punto-de-venta/InvitarAlClub";
import { CampoCelular, CamposCumpleanos } from "@/components/clientas/club-piezas";
import type { ClubDeLaClienta } from "@/components/punto-de-venta/useClubDeLaClienta";
import {
  cajaDelClub,
  camposDeRegistrar,
  celularParaInvitar,
  cumpleDelResumen,
  estadoEnLaLibreta,
  lineaDeLaClientaEnCaja,
  problemaCelularOpcional,
  type CajaDelClub,
  type ClubDeLaCaja,
  type PublicidadEnCaja,
} from "@/lib/club-caja-reglas";
import { CUMPLE_VACIO, cajaDelProblemaCumple, cumpleParaGuardar, problemaCumple, type CumpleEscrito } from "@/lib/club-cumple-reglas";
import { ayudaCumpleFueraDeMes, filaDelCumple, type AccionCumple, type FilaCumple } from "@/lib/club-cumple-canje-reglas";
import {
  altaDesdeBusqueda,
  filaDeClienta,
  lineaDeClienta,
  terminoBuscable,
  type AltaEnTicket,
  type ClientaDelTicket,
} from "@/lib/clienta-ticket-reglas";
import { ajustarNumeroAlTipo, normalizarNumeroDocumento, problemaDocumento, tipoDocumentoDe } from "@/lib/documento-clienta-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { registrarClienta } from "@/lib/clientas-acciones";
import { esSinModulo, traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";

const ESPERA_MS = 300;

/** Los botones chicos de adentro de la caja (spike del club, `BTN_P` / `BTN_S` de `45-club-caja.js`). El hover del primario
 *  es rojo PROFUNDO, como todo primario del ERP (ADR-0169): el rojo de marca no se gasta en un hover. */
const BOTON_CHICO_PRIMARIO =
  "label-cayla h-7 shrink-0 rounded-md bg-tinta px-2.5 text-[10.5px] text-crema transition-colors hover:bg-rojo-profundo disabled:opacity-50 disabled:hover:bg-tinta";
const BOTON_CHICO_SECUNDARIO =
  "label-cayla h-7 shrink-0 rounded-md border border-tinta/25 bg-papel px-2.5 text-[10.5px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-50";
/** Con lo del club plegado, sus acciones como píldoras (spike, `accion` de `partesClub`): «Canjear 10 %». */
const PILDORA_ACCION =
  "inline-flex items-center gap-1.5 rounded-full bg-tinta px-2.5 py-0.5 text-xs leading-5 text-crema transition-colors hover:bg-rojo-profundo disabled:opacity-50 disabled:hover:bg-tinta";

/**
 * La clienta arriba del ticket (spike 2026-09-26, hallazgo 4; referentes: Shopify POS, Square y Odoo ponen al cliente arriba
 * del carrito). Opcional: vender sin clienta sigue siendo un toque. Elegida, el padre llena el documento y el nombre del
 * comprobante (`onElegir`), la venta queda en su ficha (`p_cliente_id`, ADR-0288 D-1), y la proforma o el apartado ya saben
 * a nombre de quién van.
 *
 * Registrar en el ticket (ADR-0288 D-9): si no está en la libreta, se registra en la misma hoja, sin salir del cobro —tipo
 * de documento (DNI por defecto) y número; con DNI el nombre llega del padrón y, si el padrón no responde, se escribe a mano
 * (principio 9)—, con su celular y su cumpleaños si los da, y queda elegida para esta venta. Registrarse NO es unirse al
 * club: eso es «Invitar», dentro de su caja.
 *
 * `puedeBuscar` (ADR-0249, actualización 2026-09-28): la libreta es del módulo «Clientas». Qué se muestra sin él lo decide
 * `filaDeClienta` (lib/clienta-ticket-reglas.ts, con pruebas): sin clienta, la fila no aparece y se vende igual.
 *
 * El club (ADR-0288, tanda 1b), dibujado como el spike del club (`clientaDelTicketHTML` de `45-club-caja.js`, rama
 * `claude/spyke-club-clientas-visual-631f7a`): UNA sola caja con el nombre, el documento y el estado arriba («Identificada»
 * o «Socia» y su publicidad), y lo del club DENTRO de la misma caja:
 *   · socia: su cumpleaños, plegado por defecto (la flecha lo abre). Sin publicidad, su chip abre su QR (camino B: la
 *     página de CAYLA donde ella la pide; la hoja se actualiza sola y el chip pasa a «Publicidad», ADR-0288 act. c).
 *     En su mes (tanda 1c, D-5), la fila del cumpleaños trae «Canjear 10 %» —y plegada, la misma acción como píldora—;
 *     canjeado, el candado. Qué dice lo decide `filaDelCumple` (lib/club-cumple-canje-reglas.ts); si está aplicado lo sabe
 *     el Punto de venta (`clubDeLaClienta`), porque el ticket y el cobro lo usan cuando esta caja ya no está;
 *   · no socia: «No es del club todavía — Invitar / Ahora no», en cada compra (CL-8); «Ahora no» deja solo el enlace
 *     «Invitar al club» en esta venta.
 * Qué se muestra lo decide `cajaDelClub` (lib/club-caja-reglas.ts, con pruebas); lo que se sabe de ella vive en
 * `PuntoDeVenta` (`useClubDeLaClienta`), porque esta caja se desmonta al pasar a cobrar. Si la lectura falla, la caja queda
 * como antes del club y la venta sigue (principio 9).
 */
export function ClientaDelTicket({
  clienta,
  onElegir,
  onQuitar,
  bloqueado,
  puedeBuscar,
  responsable,
  onHojaAbierta,
  club,
  clubDeLaClienta,
  ubicacionId,
}: {
  clienta: ClientaDelTicket | null;
  onElegir: (c: ClientaDelTicket) => void;
  onQuitar: () => void;
  bloqueado: boolean;
  puedeBuscar: boolean;
  /** El combo «Responsable» del ticket (el mismo de la venta): registrar a una clienta firma con quien atiende (ADR-0161). */
  responsable: ControlResponsable;
  /** Avisa si la hoja está abierta: mientras lo esté, el Punto de venta no manda teclas al escáner ni atiende F1–F5. */
  onHojaAbierta?: (abierta: boolean) => void;
  /** Los textos del club y el WhatsApp de esta tienda, leídos por el servidor (vacíos si fallaron: sin «Invitar» ni QR). */
  club: ClubDeLaCaja;
  /** Lo que se sabe de la clienta elegida frente al club (`useClubDeLaClienta`, en el Punto de venta). */
  clubDeLaClienta: ClubDeLaClienta;
  ubicacionId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [viendoQr, setViendoQr] = useState(false);
  const fila = filaDeClienta(clienta, puedeBuscar);
  const lectura = clubDeLaClienta.lectura;
  const resumen = lectura.estado === "listo" ? lectura.resumen : null;
  const caja: CajaDelClub = clienta
    ? cajaDelClub({ lectura, puedeInvitar: puedeBuscar, club, ahoraNo: clubDeLaClienta.ahoraNo, ficha: clienta })
    : { tipo: "nada" };
  // La hoja de invitar no depende de `caja`: al unirse, la caja pasa a «Socia» y la MISMA hoja tiene que seguir abierta
  // para mostrar su QR.
  const invitandoA = invitando && clienta ? clienta : null;
  // Tampoco depende de su publicidad: cuando ella confirma, el chip pasa a «Publicidad» y la hoja sigue abierta en «Listo».
  const qrDe = viendoQr && clienta && caja.tipo === "socia" ? { clienta, codigo: caja.codigo } : null;
  const buscando = abierto && (fila === "agregar" || fila === "elegida");
  const hojaVisible = buscando || invitandoA !== null || qrDe !== null;

  // La limpieza cubre también que la fila se desmonte con la hoja abierta (el ticket pasa a «cobrar», o de columna a hoja).
  useEffect(() => {
    if (!hojaVisible || !onHojaAbierta) return;
    onHojaAbierta(true);
    return () => onHojaAbierta(false);
  }, [hojaVisible, onHojaAbierta]);

  if (fila === "nada") return null;

  const linea = clienta ? lineaDeLaClientaEnCaja(clienta, resumen?.celular ?? null, caja.tipo === "socia" ? caja.codigo : null) : null;
  const hayFilas = caja.tipo === "socia";
  const abiertaLaCaja = hayFilas && clubDeLaClienta.abierta;
  // El canje del cumpleaños (tanda 1c): null = nada del canje, la fila sigue con lo de la 1b (su fecha o «Sin cumpleaños»).
  const filaCumple = caja.tipo === "socia" ? filaDelCumple(clubDeLaClienta.cumple, clubDeLaClienta.cumpleAplicado, resumen?.cumpleCanjeadoEl ?? null) : null;
  const alCumple = (accion: AccionCumple) => (accion === "canjear" ? clubDeLaClienta.canjearCumple() : clubDeLaClienta.quitarCumple());

  return (
    <div className="px-5 pt-3">
      {clienta && linea ? (
        // Una sola caja: nombre, documento y estado arriba; lo del club, dentro de la misma caja (spike, `tarjeta-club`).
        <div className="overflow-hidden rounded-xl border border-sand bg-crema">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sand font-display text-sm text-tinta" aria-hidden>
              {iniciales(linea.titulo)}
            </span>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => setAbierto(true)} disabled={bloqueado || fila === "elegida_fija"} className="block w-full min-w-0 text-left">
                <span className="block truncate text-[13.5px] font-semibold text-tinta">{linea.titulo}</span>
                {linea.detalle && <span className="block truncate text-[11.5px] text-tinta/60">{linea.detalle}</span>}
              </button>
              {caja.tipo !== "nada" && (
                <span className="anim-revelar mt-1 flex flex-wrap gap-1">
                  {caja.tipo === "socia" ? <Chip tono="neutro">Socia</Chip> : <Chip tono="pizarra">Identificada</Chip>}
                  {caja.tipo === "socia" && <ChipPublicidad publicidad={caja.publicidad} onQr={() => setViendoQr(true)} bloqueado={bloqueado} />}
                </span>
              )}
            </div>
            {hayFilas && (
              <button
                type="button"
                onClick={clubDeLaClienta.alternarAbierta}
                aria-expanded={abiertaLaCaja}
                aria-label={abiertaLaCaja ? "Ocultar lo del club" : "Ver lo del club"}
                title={abiertaLaCaja ? "Ocultar lo del club" : "Ver lo del club"}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/55 transition-colors hover:bg-sand/50 hover:text-tinta"
              >
                {abiertaLaCaja ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              </button>
            )}
            <button
              type="button"
              onClick={onQuitar}
              disabled={bloqueado}
              aria-label="Quitar la clienta de esta venta"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/55 transition-colors hover:bg-sand/50 hover:text-tinta"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {caja.tipo === "socia" && abiertaLaCaja && (
            // Las filas de adentro (spike, `filaTarjeta`): su cumpleaños, con el canje en su mes (1c). El regalo de
            // aniversario (paso 5) y «su pedido» (1d) vendrán como filas iguales a esta.
            <div className="anim-revelar">
              {filaCumple ? (
                <FilaCumpleDelClub fila={filaCumple} bloqueado={bloqueado} onAccion={alCumple} />
              ) : caja.cumple ? (
                <FilaDelClub icono={<Cake className="h-3.5 w-3.5 shrink-0" />} titulo={ayudaCumpleFueraDeMes(resumen?.cumplePct ?? null)}>
                  {caja.cumple}
                </FilaDelClub>
              ) : (
                <FilaDelClub icono={<Cake className="h-3.5 w-3.5 shrink-0" />} sm="Se agrega en su ficha de Clientas" titulo="Sin él no hay beneficio de cumpleaños.">
                  <b className="font-semibold">Sin cumpleaños</b>
                </FilaDelClub>
              )}
            </div>
          )}

          {caja.tipo === "socia" && !abiertaLaCaja && filaCumple?.tipo === "canje" && (
            // Plegada, la acción a la vista como píldora (spike: «la tarjeta nace plegada y las acciones son botones»).
            <div className="anim-revelar flex flex-wrap gap-1.5 border-t border-sand px-3 py-1.5">
              <button
                type="button"
                onClick={() => filaCumple.pildora.accion && alCumple(filaCumple.pildora.accion)}
                disabled={bloqueado || filaCumple.pildora.accion === null}
                title={filaCumple.ayuda}
                className={PILDORA_ACCION}
              >
                <Cake className="h-3 w-3" aria-hidden />
                {filaCumple.pildora.texto}
              </button>
            </div>
          )}

          {caja.tipo === "identificada" && caja.invitar && (
            <TarjetaInvitar invitar={caja.invitar} bloqueado={bloqueado} onInvitar={() => setInvitando(true)} onAhoraNo={clubDeLaClienta.callarEnEstaVenta} />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={bloqueado}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-tinta/25 px-3 py-2.5 text-left text-[13px] text-tinta/65 transition-colors hover:border-taupe hover:text-tinta"
        >
          <UserRound className="h-4 w-4 shrink-0" aria-hidden />
          Agregar clienta
          <span className="ml-auto text-[11.5px] text-tinta/50">Documento, celular o nombre · opcional</span>
        </button>
      )}

      {buscando && (
        <BuscarClientaModal
          responsable={responsable}
          onElegir={(c) => {
            onElegir(c);
            setAbierto(false);
          }}
          onClose={() => setAbierto(false)}
        />
      )}

      {invitandoA && (
        <InvitarAlClub
          clientaId={invitandoA.id}
          nombre={lineaDeClienta(invitandoA).titulo}
          celularInicial={celularParaInvitar(resumen, invitandoA.celular)}
          cumpleInicial={cumpleDelResumen(resumen)}
          club={club}
          ubicacionId={ubicacionId}
          responsable={responsable}
          onUnida={clubDeLaClienta.unida}
          onPublicidad={clubDeLaClienta.recargar}
          onClose={() => setInvitando(false)}
        />
      )}

      {qrDe && (
        <QrDeLaSociaHoja
          clientaId={qrDe.clienta.id}
          nombre={lineaDeClienta(qrDe.clienta).titulo}
          codigo={qrDe.codigo}
          celular={resumen?.celular ?? qrDe.clienta.celular}
          club={club}
          ubicacionId={ubicacionId}
          responsable={responsable}
          onPublicidad={clubDeLaClienta.recargar}
          onClose={() => setViendoQr(false)}
        />
      )}
    </div>
  );
}

/** El chip de su publicidad (spike, `chipPub`): verde si ya la pidió; si no, tocable para mostrarle su QR. */
function ChipPublicidad({ publicidad, onQr, bloqueado }: { publicidad: PublicidadEnCaja; onQr: () => void; bloqueado: boolean }) {
  if (publicidad === "activa") return <Chip tono="verde">Publicidad</Chip>;
  return (
    <button
      type="button"
      onClick={onQr}
      disabled={bloqueado}
      title="Mostrar su QR. Solo ella puede pedir la publicidad: en la página de CAYLA que abre, marcando la casilla."
      className="rounded-full transition-opacity hover:opacity-75"
    >
      <Chip tono="neutro">Sin publicidad · QR</Chip>
    </button>
  );
}

/** Una fila de adentro de la caja = una línea (spike, `filaTarjeta`); la segunda (`sm`) solo cuando ayuda, y su botón a la
 *  derecha (`accion`) si tiene uno. */
function FilaDelClub({
  icono,
  sm,
  titulo,
  accion,
  children,
}: {
  icono: React.ReactNode;
  sm?: string;
  titulo?: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div title={titulo} className="flex items-center gap-2.5 border-t border-sand px-3 py-1.5 text-[12.5px]">
      <span className="text-taupe" aria-hidden>
        {icono}
      </span>
      <div className="min-w-0 flex-1 leading-snug text-tinta">
        {children}
        {sm && <span className="block truncate text-[11px] text-tinta/60">{sm}</span>}
      </div>
      {accion}
    </div>
  );
}

/** La fila del cumpleaños con el canje (tanda 1c; spike, `partesClub`): «Cumple este mes · 10 % disponible» y su botón, o el
 *  candado de «Cumpleaños canjeado el 12 sep». Los textos y la acción salen de `filaDelCumple`. */
function FilaCumpleDelClub({ fila, bloqueado, onAccion }: { fila: FilaCumple; bloqueado: boolean; onAccion: (a: AccionCumple) => void }) {
  // Spike: «Cumple este mes · 10 % disponible», pero «Cumpleaños canjeado el 12 sep» (sin el punto medio).
  const texto = (
    <>
      <b className="font-semibold">{fila.destacado}</b>
      {fila.tipo === "canje" ? " · " : " "}
      {fila.resto}
    </>
  );
  if (fila.tipo === "canjeado") {
    return (
      <FilaDelClub icono={<Lock className="h-3.5 w-3.5 shrink-0" />} sm={fila.bajada} titulo={fila.ayuda}>
        {texto}
      </FilaDelClub>
    );
  }
  const { boton } = fila;
  return (
    <FilaDelClub
      icono={<Cake className="h-3.5 w-3.5 shrink-0" />}
      sm={fila.bajada}
      titulo={fila.ayuda}
      accion={
        <button
          type="button"
          onClick={() => boton.accion && onAccion(boton.accion)}
          disabled={bloqueado || boton.accion === null}
          className={boton.primario ? BOTON_CHICO_PRIMARIO : BOTON_CHICO_SECUNDARIO}
        >
          {boton.texto}
        </button>
      }
    >
      {texto}
    </FilaDelClub>
  );
}

/**
 * «No es del club todavía — Invitar / Ahora no», dentro de la caja (spike, `partesClub`): se ofrece en cada compra (CL-8).
 * Con «Ahora no» en esta venta queda solo el enlace. Sin documento o sin nombre en su ficha no se puede unir desde aquí (la
 * base lo exige, CL-1): «Invitar» se apaga y dice dónde completarlos.
 */
function TarjetaInvitar({
  invitar,
  bloqueado,
  onInvitar,
  onAhoraNo,
}: {
  invitar: { callada: boolean; falta: "celular" | "documento" | null };
  bloqueado: boolean;
  onInvitar: () => void;
  onAhoraNo: () => void;
}) {
  const sinDocumento = invitar.falta === "documento";
  if (invitar.callada) {
    return (
      <div className="anim-revelar flex items-center gap-2 border-t border-sand px-3 py-1.5 text-[12px] text-tinta/65">
        <button type="button" onClick={onInvitar} disabled={bloqueado || sinDocumento} className="label-cayla text-[10.5px] text-tinta underline underline-offset-2 hover:text-rojo disabled:opacity-50">
          Invitar al club
        </button>
        <span>· se le ofrece en cada compra</span>
      </div>
    );
  }
  return (
    <div title="Beneficios del club, avisos de su apartado y de la talla que pida." className="anim-revelar flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-sand bg-hueso px-3 py-2">
      <p className="min-w-0 flex-1 text-[12.5px] text-tinta">
        <b className="font-semibold">No es del club todavía</b>
        {invitar.falta === "celular" && <span className="text-tinta/60"> · falta su celular</span>}
        {sinDocumento && <span className="text-tinta/60"> · su ficha necesita documento y nombre</span>}
      </p>
      <button
        type="button"
        onClick={onInvitar}
        disabled={bloqueado || sinDocumento}
        title={sinDocumento ? "Para ser del club, su ficha necesita documento y nombre: complétalos en Clientas." : undefined}
        className={BOTON_CHICO_PRIMARIO}
      >
        Invitar
      </button>
      <button type="button" onClick={onAhoraNo} disabled={bloqueado} className={BOTON_CHICO_SECUNDARIO}>
        Ahora no
      </button>
    </div>
  );
}

function iniciales(texto: string) {
  return texto
    .split(/\s+/)
    .filter((p) => /^[\p{L}]/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Una ficha de la lista del buscador, con lo que la lista dice de ella frente al club (spike: «· Socia» / «· Identificada»). */
type EnLaLibreta = { clienta: ClientaDelTicket; clubDesde: string | null };

type Estado =
  | { tipo: "inicio" }
  | { tipo: "buscando" }
  | { tipo: "listo"; clientas: EnLaLibreta[] }
  /** `mensaje`: el de la base cuando lo que falta es el módulo (le quitaron «Clientas» con la caja abierta). */
  | { tipo: "error"; mensaje: string | null };

function BuscarClientaModal({
  onElegir,
  onClose,
  responsable,
}: {
  onElegir: (c: ClientaDelTicket) => void;
  onClose: () => void;
  responsable: ControlResponsable;
}) {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  // La misma hoja tiene dos caras: buscar en la libreta y, si no está, registrarla (ADR-0288 D-9). `null` = buscando.
  const [alta, setAlta] = useState<AltaEnTicket | null>(null);
  const [cumple, setCumple] = useState<CumpleEscrito>(CUMPLE_VACIO);
  const [enfocarNumero, setEnfocarNumero] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const termino = terminoBuscable(texto);

  function irARegistrar() {
    const inicial = altaDesdeBusqueda(texto);
    setAlta(inicial);
    setCumple(CUMPLE_VACIO);
    // Sin número traído del buscador, el cursor espera en él; con un DNI, el padrón trae el nombre solo.
    setEnfocarNumero(inicial.documentoNumero === "");
  }

  useEffect(() => {
    if (!termino) return;
    let vigente = true;
    // Se espera a que deje de escribir: una consulta por pausa, no por tecla. `buscar_` es lectura (sin loader global).
    const t = setTimeout(async () => {
      setEstado({ tipo: "buscando" });
      const { data, error } = await createClient().rpc("buscar_clienta", { p_termino: termino });
      if (!vigente) return;
      if (error) return setEstado({ tipo: "error", mensaje: esSinModulo(error) ? error.message : null });
      setEstado({
        tipo: "listo",
        clientas: (data ?? []).map((c) => ({
          clienta: {
            id: c.id,
            nombre: c.nombre,
            documentoTipo: tipoDocumentoDe(c.documento_tipo),
            documentoNumero: c.documento_numero,
            celular: c.telefono_whatsapp,
          },
          // Antes de la migración de la tanda 1b la columna no llega: se lee como «Identificada», que es lo que era.
          clubDesde: c.club_desde ?? null,
        })),
      });
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [termino]);

  const visible: Estado = termino ? estado : { tipo: "inicio" };
  const sinResultados = visible.tipo === "listo" && visible.clientas.length === 0;
  // Sin el módulo, registrar fallaría igual que buscar: no se ofrece.
  const sinModulo = visible.tipo === "error" && visible.mensaje !== null;

  return (
    <Modal
      titulo={alta ? "Registrar clienta" : "Clienta de esta venta"}
      subtitulo={
        alta
          ? "Con su celular y su cumpleaños, unirla al club después es un toque. Registrarla no la une al club."
          : "Opcional. Sus datos pasan solos al comprobante y la compra queda en su ficha."
      }
      variante="hoja"
      ancho="max-w-md"
      onClose={onClose}
      // Registrar no lleva token: cerrar y reabrir a mitad de camino podría enviarlo dos veces.
      bloqueado={guardando}
    >
      {(cerrar) =>
        alta ? (
          <RegistrarClientaEnTicket
            alta={alta}
            // Funcional a propósito: el padrón responde tarde (`onNombre`) y no debe pisar lo escrito mientras tanto; si ya
            // se volvió a buscar, no revive el formulario.
            onCambiar={(parte) => setAlta((a) => (a ? { ...a, ...parte } : a))}
            cumple={cumple}
            onCumple={setCumple}
            enfocarNumero={enfocarNumero}
            responsable={responsable}
            guardando={guardando}
            onGuardando={setGuardando}
            onVolver={() => setAlta(null)}
            onRegistrada={onElegir}
          />
        ) : (
          <div>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-sand bg-crema px-3 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
              <Search className="h-4 w-4 shrink-0 text-tinta/50" aria-hidden />
              <input
                ref={campo}
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Documento, celular o nombre" // sugerir-fijo: qué se puede buscar en la libreta; no depende de nada elegido antes
                inputMode="search"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/40"
              />
            </label>

            <div className="mt-3 min-h-24" aria-live="polite">
              {visible.tipo === "inicio" && <p className="py-4 text-center text-xs text-tinta/55">Escribe al menos 3 caracteres.</p>}
              {visible.tipo === "buscando" && <p className="py-4 text-center text-xs text-tinta/55">Buscando…</p>}
              {visible.tipo === "error" && (
                <p className="py-4 text-center text-xs text-rojo-profundo">
                  {visible.mensaje ?? "No se pudo buscar en la libreta."} La venta sigue: el DNI se puede poner al cobrar.
                </p>
              )}
              {sinResultados && (
                // Spike del club (`modalBuscarClienta`): las dos salidas, del mismo ancho.
                <div className="space-y-3">
                  <p className="rounded-lg bg-hueso px-3 py-3 text-xs text-tinta/75">
                    No está en la libreta de clientas. Puedes registrarla ahora, o seguir sin ella: el DNI y el nombre se ponen al cobrar, en el
                    comprobante.
                  </p>
                  <div className="flex gap-2">
                    <Boton type="button" peso="primario" onClick={irARegistrar} className="flex-1">
                      Registrarla
                    </Boton>
                    <Boton type="button" peso="fantasma" onClick={cerrar} className="flex-1">
                      Seguir sin ella
                    </Boton>
                  </div>
                </div>
              )}
              {visible.tipo === "listo" && visible.clientas.length > 0 && (
                <ul className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-crema">
                  {visible.clientas.map(({ clienta: c, clubDesde }) => {
                    const l = lineaDeClienta(c);
                    return (
                      <li key={c.id}>
                        <button type="button" onClick={() => onElegir(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sand/40">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-tinta">{l.titulo}</span>
                            <span className="block truncate text-[11.5px] text-tinta/60">{[l.detalle, estadoEnLaLibreta(clubDesde)].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="label-cayla text-[10.5px] text-tinta/70">Elegir</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Registrar sin haber buscado (o si la que apareció no es ella). Con «no está» ya se ofrece arriba. */}
            {!sinResultados && !sinModulo && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={irARegistrar} className="btn-cayla btn-sutil btn-chico">
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Registrar clienta
                </button>
              </div>
            )}
          </div>
        )
      }
    </Modal>
  );
}

/**
 * El alta del ticket (ADR-0288 D-9), dibujada como el spike del club (`modalRegistrar`) y con la misma regla que el alta de
 * /clientas (`NuevaClientaModal`): documento y nombre (con DNI, el nombre llega del padrón en el mismo bloque); el celular
 * y el cumpleaños, sugeridos —con ellos, «Invitar» llega con ambos precargados—; y quién registra, con el combo del ticket:
 * lo que se elija aquí vale también para la venta. Qué bloquea y qué sigue lo dice `camposDeRegistrar`
 * (lib/club-caja-reglas.ts, con pruebas): la guía y el botón miran la misma regla.
 */
function RegistrarClientaEnTicket({
  alta,
  onCambiar,
  cumple,
  onCumple,
  enfocarNumero,
  responsable,
  guardando,
  onGuardando,
  onVolver,
  onRegistrada,
}: {
  alta: AltaEnTicket;
  onCambiar: (parte: Partial<AltaEnTicket>) => void;
  cumple: CumpleEscrito;
  onCumple: (c: CumpleEscrito) => void;
  /** Llegó sin número: el cursor espera en él. Con un DNI ya traído del buscador, el padrón trae el nombre solo. */
  enfocarNumero: boolean;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardando: (v: boolean) => void;
  onVolver: () => void;
  onRegistrada: (c: ClientaDelTicket) => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const [anioActual] = useState(() => new Date().getFullYear());
  const tipo = alta.documentoTipo;
  const esDni = tipo === "dni";
  const numero = normalizarNumeroDocumento(alta.documentoNumero);

  // Guía de foco (CLAUDE.md «Guía de foco», ADR-0284): `camposDeRegistrar` es la MISMA regla que apaga «Registrar».
  const campos = camposDeRegistrar(
    {
      documentoTipo: tipo,
      documentoNumero: alta.documentoNumero,
      nombre: alta.nombre,
      celular: alta.celular,
      cumple,
      responsableListo: responsable.listo,
      responsableMotivo: responsable.motivo,
    },
    anioActual
  );
  const guia = useGuiaCampos(campos);
  const pCelular = problemaCelularOpcional(alta.celular);

  useEffect(() => {
    // El primer campo de texto del formulario es el número (el combo de tipo es un botón).
    if (enfocarNumero) formulario.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [enfocarNumero]);

  async function registrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // La hoja vive en un portal, pero React hace subir el `submit` por sus ancestros de React: sin esto llegaría al
    // `<form onSubmit={onCobrar}>` del ticket, que contiene a esta fila (ADR-0128, «Actualización 2026-09-26»).
    e.stopPropagation();
    if (guardando) return;
    if (!sePuedeConfirmar(campos)) {
      const problema = problemaDocumento(tipo, alta.documentoNumero);
      const pCumple = problemaCumple(cumple, anioActual);
      if (numero === "" || problema) return void avisar.error(problema ?? "Elige el tipo y escribe el número.", { enfocar: ID_NUMERO_DOCUMENTO });
      if (!alta.nombre.trim()) return void avisar.error("Escribe su nombre.", { enfocar: esDni ? "documento-nombre" : ID_NOMBRE });
      if (pCelular) return void avisar.error(pCelular, { enfocar: ID_CELULAR });
      if (pCumple) return void avisar.error(pCumple, { enfocar: cajaDelProblemaCumple(cumple, anioActual) === "anio" ? ID_ANIO : ID_DIA });
      return void avisar.error(responsable.motivo ?? "Elige quién registra.");
    }

    onGuardando(true);
    const fecha = cumpleParaGuardar(cumple);
    const texto = (n: number | null) => (n === null ? "" : String(n));
    const { id, error } = await registrarClienta(
      {
        documentoTipo: tipo,
        documentoNumero: numero,
        nombre: alta.nombre,
        telefonoWhatsapp: alta.celular,
        // Registrarse no es unirse al club (ADR-0288 D-4 y D-9): el cumpleaños se guarda en su ficha y «Invitar» lo trae.
        cumpleDia: texto(fecha.cumpleDia),
        cumpleMes: texto(fecha.cumpleMes),
        cumpleAnio: texto(fecha.cumpleAnio),
      },
      responsable.firma(),
    );
    onGuardando(false);
    if (error || !id) {
      // Solo ante un rechazo: con éxito, `despues` vaciaría el combo y soltaría a quien atiende la venta en curso.
      if (error) responsable.despues(error);
      return void avisar.error(traducirError(error, "registrar a la clienta"));
    }
    const nueva: ClientaDelTicket = {
      id,
      nombre: alta.nombre.trim() || null,
      documentoTipo: tipo,
      documentoNumero: numero || null,
      celular: alta.celular.trim() || null,
    };
    avisar.exito("Clienta registrada", { detalle: `${lineaDeClienta(nueva).titulo}. Al cobrar, esta venta queda en su ficha. Registrarla no la une al club.` });
    onRegistrada(nueva);
  }

  return (
    <form
      ref={formulario}
      onSubmit={registrar}
      // Enter en un campo no registra: la pistola termina cada lectura con Enter, y un código escaneado por costumbre
      // registraría a medias (misma regla que el formulario del ticket). Se registra con el botón.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      className="space-y-6"
    >
      <CampoGuiado id="documento" guia={guia} titulo="Documento" ayuda="DNI por defecto">
        <div className="grid grid-cols-[11rem_1fr] items-start gap-3 max-sm:grid-cols-1">
          <CampoTipoDocumento tipo={tipo} onTipo={(t) => onCambiar({ documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, alta.documentoNumero) })} />
          {esDni ? (
            // Solo el DNI consulta el padrón (ADR-0008, ADR-0288 D-2). Si no responde, el nombre se escribe aquí mismo.
            <ConsultaDocumento
              tipo="dni"
              obligatorio
              numero={alta.documentoNumero}
              onNumero={(v) => onCambiar({ documentoNumero: v })}
              nombre={alta.nombre}
              onNombre={(v) => onCambiar({ nombre: v })}
            />
          ) : (
            <CampoNumeroDocumento tipo={tipo} numero={alta.documentoNumero} onNumero={(v) => onCambiar({ documentoNumero: v })} />
          )}
        </div>
        {!esDni && (
          <p className="mt-1 text-xs text-tinta/60">
            Solo el DNI se autocompleta con el padrón; {tipo === "pasaporte" ? "el pasaporte" : "el carné"} lleva el nombre a mano.
          </p>
        )}
      </CampoGuiado>

      {!esDni && (
        <CampoGuiado id="nombre" guia={guia} titulo="Nombre">
          <CampoTexto
            id={ID_NOMBRE}
            etiqueta="Nombre completo"
            caja
            placeholder="Nombre completo" // sugerir-fijo: nombre de la caja; el nombre de una persona no depende de nada elegido antes
            value={alta.nombre}
            onChange={(e) => onCambiar({ nombre: e.target.value })}
          />
        </CampoGuiado>
      )}

      <CampoGuiado id="celular" guia={guia} titulo="Celular de WhatsApp" ayuda="Sin él queda identificada, no socia">
        <CampoCelular id={ID_CELULAR} caja valor={alta.celular} onValor={(celular) => onCambiar({ celular })} problema={pCelular} deshabilitado={guardando} />
      </CampoGuiado>

      <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Sin él no hay beneficio · el año es opcional">
        <CamposCumpleanos idDia={ID_DIA} idAnio={ID_ANIO} cumple={cumple} onCumple={onCumple} anioActual={anioActual} deshabilitado={guardando} />
      </CampoGuiado>

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        {/* «Nadie de turno» y «no se pudo leer» ya los explica el combo con su recuadro; aquí, solo lo que falta elegir. */}
        {(responsable.estado === "falta" || responsable.estado === "cargando") && responsable.motivo && (
          <p className="mt-1.5 text-xs text-tinta/65">{responsable.motivo}</p>
        )}
      </CampoGuiado>

      <PieGuia guia={guia} listo="Todo listo para registrar." />
      <div className="flex justify-end gap-3 pt-2">
        <Boton type="button" peso="fantasma" onClick={onVolver} disabled={guardando}>
          Volver
        </Boton>
        <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
          {guardando ? "Registrando…" : "Registrar"}
        </Boton>
      </div>
    </form>
  );
}

const ID_NOMBRE = "ticket-clienta-nombre";
const ID_CELULAR = "ticket-clienta-celular";
const ID_DIA = "ticket-clienta-cumple-dia";
const ID_ANIO = "ticket-clienta-cumple-anio";
