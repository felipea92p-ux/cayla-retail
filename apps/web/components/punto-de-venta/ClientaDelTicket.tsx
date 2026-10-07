"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, ChevronDown, ChevronUp, Gift, Lock, QrCode, Search, UserPlus, UserRound, X } from "lucide-react";
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
import type { ClubDeLaClienta } from "@/components/punto-de-venta/useClubDeLaClienta";
import { useEsperaDelCartel } from "@/components/punto-de-venta/useEsperaDelCartel";
import {
  cajaDelClub,
  camposDeRegistrar,
  estadoEnLaLibreta,
  filaDelCartel,
  lineaDeLaClientaEnCaja,
  nombreSuficiente,
  type CajaDelClub,
  type PublicidadEnCaja,
} from "@/lib/club-caja-reglas";
import { codigoClubLegible } from "@/lib/club-reglas";
import { ayudaCumpleFueraDeMes, filaDelCumple, type AccionCumple, type FilaCumple } from "@/lib/club-cumple-canje-reglas";
import { filaDelVale, type AccionVale, type FilaVale } from "@/lib/club-aniversario-canje-reglas";
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
  "btn-cayla btn-primario h-7 shrink-0 px-2.5 text-[12.5px]";
const BOTON_CHICO_SECUNDARIO =
  "btn-cayla btn-secundario h-7 shrink-0 px-2.5 text-[12.5px]";
/** Con lo del club plegado, sus acciones como píldoras (spike, `accion` de `partesClub`): «Canjear 10 %», «Usar vale S/ 30». */
const PILDORA_ACCION =
  "inline-flex items-center gap-1.5 rounded-full bg-tinta px-2.5 py-0.5 text-xs leading-5 text-crema transition-colors hover:bg-rojo-profundo disabled:opacity-50 disabled:hover:bg-tinta";

/**
 * La clienta arriba del ticket (spike 2026-09-26, hallazgo 4; referentes: Shopify POS, Square y Odoo ponen al cliente arriba
 * del carrito). Opcional: vender sin clienta sigue siendo un toque. Elegida, el padre llena el documento y el nombre del
 * comprobante (`onElegir`), la venta queda en su ficha (`p_cliente_id`, ADR-0288 D-1), y la proforma o el apartado ya saben
 * a nombre de quién van.
 *
 * Registrar en el ticket (ADR-0288 D-9 y tanda 1g, G-2): si no está en la libreta, se registra en la misma hoja, sin salir
 * del cobro, SOLO con su documento —tipo (DNI por defecto) y número; con DNI el nombre llega del padrón y, si el padrón no
 * responde, se escribe a mano (principio 9); con carné o pasaporte, el nombre se escribe—, y queda elegida para esta venta.
 * El celular y el cumpleaños los escribe ella al unirse desde el cartel.
 *
 * `puedeBuscar` (ADR-0249, actualización 2026-09-28): la libreta es del módulo «Clientas». Qué se muestra sin él lo decide
 * `filaDeClienta` (lib/clienta-ticket-reglas.ts, con pruebas): sin clienta, la fila no aparece y se vende igual.
 *
 * El club, dibujado como el spike del club (`clientaDelTicketHTML` de `45-club-caja.js`, commit 94f2dece): UNA sola caja con
 * el nombre, el documento y el estado arriba («Identificado» o «Miembro» y su publicidad), y lo del club DENTRO de la misma caja:
 *   · socia: su cumpleaños y su vale de aniversario, plegados por defecto (la flecha los abre). En su mes (tanda 1c, D-5), la
 *     fila del cumpleaños trae «Canjear 10 %»; con un vale disponible (tanda 1g, G-13), «Usar vale» —y plegada, las mismas
 *     acciones como píldoras—. Va una sola ventaja del club por compra: con una puesta, la otra se apaga y dice por qué. Qué
 *     dicen lo deciden `filaDelCumple` y `filaDelVale`; si están aplicados lo sabe el Punto de venta (`clubDeLaClienta`),
 *     porque el ticket y el cobro los usan cuando esta caja ya no está;
 *   · no socia (tanda 1g, G-2): «Pídele que escanee el cartel del club», en cada compra. Mientras la caja está a la vista,
 *     vuelve a leer su resumen cada 3 s (`useEsperaDelCartel`) y, cuando ella se une con ese documento, pasa sola a «Miembro».
 * Qué se muestra lo decide `cajaDelClub` (lib/club-caja-reglas.ts, con pruebas). Si la lectura falla, la caja queda como antes
 * del club y la venta sigue (principio 9).
 */
export function ClientaDelTicket({
  clienta,
  onElegir,
  onQuitar,
  bloqueado,
  puedeBuscar,
  responsable,
  onHojaAbierta,
  clubDeLaClienta,
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
  /** Lo que se sabe de la clienta elegida frente al club (`useClubDeLaClienta`, en el Punto de venta). */
  clubDeLaClienta: ClubDeLaClienta;
}) {
  const [abierto, setAbierto] = useState(false);
  const fila = filaDeClienta(clienta, puedeBuscar);
  const lectura = clubDeLaClienta.lectura;
  const resumen = lectura.estado === "listo" ? lectura.resumen : null;
  const caja: CajaDelClub = clienta ? cajaDelClub({ lectura, ficha: clienta }) : { tipo: "nada" };
  const buscando = abierto && (fila === "agregar" || fila === "elegida");

  // Mientras la caja de una clienta que no es socia está a la vista, se pregunta si ya se unió desde el cartel (G-2).
  const espera = useEsperaDelCartel({
    clientaId: clienta?.id ?? null,
    activa: caja.tipo === "identificada" && !caja.sinDocumento,
    onSocia: (nuevo) => {
      clubDeLaClienta.seUnio(nuevo);
      const codigo = codigoClubLegible(nuevo.codigoClub);
      avisar.exito(`${clienta ? lineaDeClienta(clienta).titulo : "El cliente"} ya es del club`, {
        detalle: codigo ? `Se unió desde el cartel. Su código: ${codigo}.` : "Se unió desde el cartel.",
      });
    },
  });

  // La limpieza cubre también que la fila se desmonte con la hoja abierta (el ticket pasa a «cobrar», o de columna a hoja).
  useEffect(() => {
    if (!buscando || !onHojaAbierta) return;
    onHojaAbierta(true);
    return () => onHojaAbierta(false);
  }, [buscando, onHojaAbierta]);

  if (fila === "nada") return null;

  const linea = clienta ? lineaDeLaClientaEnCaja(clienta, resumen?.celular ?? null, caja.tipo === "socia" ? caja.codigo : null) : null;
  const hayFilas = caja.tipo === "socia";
  const abiertaLaCaja = hayFilas && clubDeLaClienta.abierta;
  // El canje del cumpleaños (tanda 1c): null = nada del canje, la fila sigue con lo de la 1b (su fecha o «Sin cumpleaños»).
  const filaCumple =
    caja.tipo === "socia"
      ? filaDelCumple(clubDeLaClienta.cumple, clubDeLaClienta.cumpleAplicado, resumen?.cumpleCanjeadoEl ?? null, undefined, clubDeLaClienta.valeAplicado)
      : null;
  // El vale de aniversario (tanda 1g): null = no tiene un vale disponible.
  const filaVale = caja.tipo === "socia" ? filaDelVale(clubDeLaClienta.vale, clubDeLaClienta.valeAplicado, clubDeLaClienta.cumpleAplicado) : null;
  const alCumple = (accion: AccionCumple) => (accion === "canjear" ? clubDeLaClienta.canjearCumple() : clubDeLaClienta.quitarCumple());
  const alVale = (accion: AccionVale) => (accion === "usar" ? clubDeLaClienta.usarVale() : clubDeLaClienta.quitarVale());
  const pildoras = [
    filaCumple?.tipo === "canje" ? { clave: "cumple", icono: Cake, ...filaCumple.pildora, ayuda: filaCumple.ayuda, alTocar: () => filaCumple.pildora.accion && alCumple(filaCumple.pildora.accion) } : null,
    filaVale ? { clave: "vale", icono: Gift, ...filaVale.pildora, ayuda: filaVale.ayuda, alTocar: () => filaVale.pildora.accion && alVale(filaVale.pildora.accion) } : null,
  ].filter((p) => p !== null);

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
                  {caja.tipo === "socia" ? <Chip tono="neutro">Miembro</Chip> : <Chip tono="pizarra">Identificado</Chip>}
                  {caja.tipo === "socia" && <ChipPublicidad publicidad={caja.publicidad} />}
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
              aria-label="Quitar al cliente de esta venta"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/55 transition-colors hover:bg-sand/50 hover:text-tinta"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {caja.tipo === "socia" && abiertaLaCaja && (
            // Las filas de adentro (spike, `filaTarjeta`): su cumpleaños, con el canje en su mes (1c), y su vale de aniversario
            // (1g). «Su pedido» (1d) vendrá como otra fila igual.
            <div className="anim-revelar">
              {filaCumple ? (
                <FilaCumpleDelClub fila={filaCumple} bloqueado={bloqueado} onAccion={alCumple} />
              ) : caja.cumple ? (
                <FilaDelClub icono={<Cake className="h-3.5 w-3.5 shrink-0" />} titulo={ayudaCumpleFueraDeMes(resumen?.cumplePct ?? null)}>
                  {caja.cumple}
                </FilaDelClub>
              ) : (
                <FilaDelClub icono={<Cake className="h-3.5 w-3.5 shrink-0" />} sm="Se agrega en su ficha de Clientes" titulo="Sin él no hay beneficio de cumpleaños.">
                  <b className="font-semibold">Sin cumpleaños</b>
                </FilaDelClub>
              )}
              {filaVale && <FilaValeDelClub fila={filaVale} bloqueado={bloqueado} onAccion={alVale} />}
            </div>
          )}

          {caja.tipo === "socia" && !abiertaLaCaja && pildoras.length > 0 && (
            // Plegada, las acciones a la vista como píldoras (spike: «la tarjeta nace plegada y las acciones son botones»).
            <div className="anim-revelar flex flex-wrap gap-1.5 border-t border-sand px-3 py-1.5">
              {pildoras.map(({ clave, icono: Icono, texto, accion, ayuda, alTocar }) => (
                <button key={clave} type="button" onClick={alTocar} disabled={bloqueado || accion === null} title={ayuda} className={PILDORA_ACCION}>
                  <Icono className="h-3 w-3" aria-hidden />
                  {texto}
                </button>
              ))}
            </div>
          )}

          {caja.tipo === "identificada" && (
            <FilaDelCartel
              fila={filaDelCartel({ sinDocumento: caja.sinDocumento, espera: espera.espera, cumplePct: resumen?.cumplePct ?? null })}
              revisando={espera.revisando}
              onActualizar={espera.actualizar}
            />
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
          Agregar cliente
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
    </div>
  );
}

/** El chip de su publicidad: verde si la pidió al unirse desde el cartel; si no, «Sin publicidad» (ya no es tocable: no hay
 *  QR personal, G-1). */
function ChipPublicidad({ publicidad }: { publicidad: PublicidadEnCaja }) {
  return publicidad === "activa" ? <Chip tono="verde">Publicidad</Chip> : <Chip tono="neutro">Sin publicidad</Chip>;
}

/** Una fila de adentro de la caja = una línea (spike, `filaTarjeta`); la segunda (`sm`) solo cuando ayuda, y su botón a la
 *  derecha (`accion`) si tiene uno. `smEntera`: la segunda línea se parte en dos si no cabe (a 375 px), en vez de cortarse. */
function FilaDelClub({
  icono,
  sm,
  smEntera = false,
  titulo,
  accion,
  fondo = false,
  children,
}: {
  icono: React.ReactNode;
  sm?: string;
  smEntera?: boolean;
  titulo?: string;
  accion?: React.ReactNode;
  /** En hueso: la fila del cartel, que pide algo a quien atiende. */
  fondo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div title={titulo} className={`flex items-center gap-2.5 border-t border-sand px-3 py-1.5 text-[12.5px] ${fondo ? "bg-hueso" : ""}`}>
      <span className="text-taupe" aria-hidden>
        {icono}
      </span>
      <div className="min-w-0 flex-1 leading-snug text-tinta">
        {children}
        {sm && <span className={`block text-[11px] text-tinta/60 ${smEntera ? "" : "truncate"}`}>{sm}</span>}
      </div>
      {accion}
    </div>
  );
}

/** El botón chico de la derecha de una fila: primario (oscuro) o de borde; sin acción, apagado. */
function BotonDeFila<A extends string>({
  boton,
  bloqueado,
  onAccion,
}: {
  boton: { texto: string; primario: boolean; accion: A | null };
  bloqueado: boolean;
  onAccion: (a: A) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => boton.accion && onAccion(boton.accion)}
      disabled={bloqueado || boton.accion === null}
      className={boton.primario ? BOTON_CHICO_PRIMARIO : BOTON_CHICO_SECUNDARIO}
    >
      {boton.texto}
    </button>
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
  return (
    <FilaDelClub
      icono={<Cake className="h-3.5 w-3.5 shrink-0" />}
      sm={fila.bajada}
      // Apagado, la bajada dice por qué (sin conexión, o ya usa su vale): se lee entera también a 375 px.
      smEntera={fila.boton.accion === null}
      titulo={fila.ayuda}
      accion={<BotonDeFila boton={fila.boton} bloqueado={bloqueado} onAccion={onAccion} />}
    >
      {texto}
    </FilaDelClub>
  );
}

/** La fila del vale de aniversario (tanda 1g, G-13): «Vale de aniversario · S/ 30 · hasta el 30 nov» con «Usar vale»,
 *  «Quitar» o «Sin conexión». Los textos y la acción salen de `filaDelVale`. */
function FilaValeDelClub({ fila, bloqueado, onAccion }: { fila: FilaVale; bloqueado: boolean; onAccion: (a: AccionVale) => void }) {
  return (
    <FilaDelClub
      icono={<Gift className="h-3.5 w-3.5 shrink-0" />}
      sm={fila.bajada}
      smEntera={fila.boton.accion === null}
      titulo={fila.ayuda}
      accion={<BotonDeFila boton={fila.boton} bloqueado={bloqueado} onAccion={onAccion} />}
    >
      <b className="font-semibold">{fila.destacado}</b> · {fila.resto}
    </FilaDelClub>
  );
}

/**
 * «Pídele que escanee el cartel del club» (tanda 1g, G-2), dentro de la caja de una clienta que no es socia, en cada compra.
 * Dice por qué le conviene en una línea y que se actualiza sola; a los 10 minutos, «Actualizar». Sin animación en bucle
 * (ADR-0136): nada late mientras espera.
 */
function FilaDelCartel({ fila, revisando, onActualizar }: { fila: ReturnType<typeof filaDelCartel>; revisando: boolean; onActualizar: () => void }) {
  return (
    <div className="anim-revelar">
      <FilaDelClub
        icono={<QrCode className="h-3.5 w-3.5 shrink-0" />}
        sm={fila.bajada}
        smEntera
        titulo={fila.ayuda}
        fondo
        accion={
          fila.actualizar ? (
            <button type="button" onClick={onActualizar} disabled={revisando} className={BOTON_CHICO_SECUNDARIO}>
              {revisando ? "Revisando…" : "Actualizar"}
            </button>
          ) : undefined
        }
      >
        <b className="font-semibold">{fila.destacado}</b>
      </FilaDelClub>
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

/** Una ficha de la lista del buscador, con lo que la lista dice de ella frente al club (spike: «· Miembro» / «· Identificado»). */
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
  const [enfocarNumero, setEnfocarNumero] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const termino = terminoBuscable(texto);

  function irARegistrar() {
    const inicial = altaDesdeBusqueda(texto);
    setAlta(inicial);
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
          // Antes de la migración de la tanda 1b la columna no llega: se lee como «Identificado», que es lo que era.
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
      titulo={alta ? "Registrar cliente" : "Cliente de esta venta"}
      subtitulo={
        alta
          ? "Solo su documento. Para ser del club, se une por su cuenta escaneando el cartel."
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
                    No está en la libreta de clientes. Puedes registrarlo ahora, o seguir sin cliente: el DNI y el nombre se ponen al cobrar, en el
                    comprobante.
                  </p>
                  <div className="flex gap-2">
                    <Boton type="button" peso="primario" onClick={irARegistrar} className="flex-1">
                      Registrarlo
                    </Boton>
                    <Boton type="button" peso="fantasma" onClick={cerrar} className="flex-1">
                      Seguir sin cliente
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
                  Registrar cliente
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
 * El alta del ticket (ADR-0288 D-9 y tanda 1g, G-2), dibujada como el spike del club (`modalRegistrar`) y con la misma regla
 * que el alta de /clientas (`NuevaClientaModal`): SOLO el documento (con DNI, el nombre llega del padrón en el mismo bloque;
 * con carné o pasaporte, se escribe) y quién registra, con el combo del ticket: lo que se elija aquí vale también para la
 * venta. Qué bloquea y qué sigue lo dice `camposDeRegistrar` (lib/club-caja-reglas.ts, con pruebas): la guía y el botón miran
 * la misma regla.
 */
function RegistrarClientaEnTicket({
  alta,
  onCambiar,
  enfocarNumero,
  responsable,
  guardando,
  onGuardando,
  onVolver,
  onRegistrada,
}: {
  alta: AltaEnTicket;
  onCambiar: (parte: Partial<AltaEnTicket>) => void;
  /** Llegó sin número: el cursor espera en él. Con un DNI ya traído del buscador, el padrón trae el nombre solo. */
  enfocarNumero: boolean;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardando: (v: boolean) => void;
  onVolver: () => void;
  onRegistrada: (c: ClientaDelTicket) => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const tipo = alta.documentoTipo;
  const esDni = tipo === "dni";
  const numero = normalizarNumeroDocumento(alta.documentoNumero);

  // Guía de foco (CLAUDE.md «Guía de foco», ADR-0284): `camposDeRegistrar` es la MISMA regla que apaga «Registrar».
  const campos = camposDeRegistrar({
    documentoTipo: tipo,
    documentoNumero: alta.documentoNumero,
    nombre: alta.nombre,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);

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
      if (numero === "" || problema) return void avisar.error(problema ?? "Elige el tipo y escribe el número.", { enfocar: ID_NUMERO_DOCUMENTO });
      if (!nombreSuficiente(alta.nombre)) return void avisar.error("Escribe su nombre.", { enfocar: esDni ? "documento-nombre" : ID_NOMBRE });
      return void avisar.error(responsable.motivo ?? "Elige quién registra.");
    }

    onGuardando(true);
    const { id, error } = await registrarClienta(
      {
        documentoTipo: tipo,
        documentoNumero: numero,
        nombre: alta.nombre,
        // Tanda 1g (G-2): en caja solo el documento. El celular y el cumpleaños los escribe ella al unirse desde el cartel.
        telefonoWhatsapp: "",
        cumpleDia: "",
        cumpleMes: "",
        cumpleAnio: "",
      },
      responsable.firma(),
    );
    onGuardando(false);
    if (error || !id) {
      // Solo ante un rechazo: con éxito, `despues` vaciaría el combo y soltaría a quien atiende la venta en curso.
      if (error) responsable.despues(error);
      return void avisar.error(traducirError(error, "registrar al cliente"));
    }
    const nueva: ClientaDelTicket = {
      id,
      nombre: alta.nombre.trim() || null,
      documentoTipo: tipo,
      documentoNumero: numero || null,
      celular: null,
    };
    avisar.exito("Cliente registrado", { detalle: `${lineaDeClienta(nueva).titulo}. Al cobrar, esta venta queda en su ficha. Para ser del club, que escanee el cartel.` });
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
