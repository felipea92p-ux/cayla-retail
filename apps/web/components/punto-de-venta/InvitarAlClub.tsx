"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { unirseAlClub } from "@/lib/club-acciones";
import { codigoClubLegible, textoVigente } from "@/lib/club-reglas";
import {
  camposDeInvitar,
  cumpleParaGuardar,
  destinoDelQr,
  problemaCelular,
  problemaCumple,
  qrDeLaSocia,
  type ClubDeLaCaja,
  type CumpleEscrito,
} from "@/lib/club-caja-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { ClubDeLaClienta } from "./useClubDeLaClienta";
import { CampoCelularClub, CumpleanosClub, TextoDelClubLeido } from "./CamposDelClub";

const ID_CELULAR = "club-celular";
const ID_DIA = "club-cumple-dia";

/**
 * «Invitar a … al Club CAYLA» desde Cobrar (ADR-0288 D-9 y tanda 1b), dibujada como el spike del club (`modalInvitar`, rama
 * `claude/spyke-club-clientas-visual-631f7a`, `45-club-caja.js`). Una sola hoja con dos caras:
 *   1. Tres datos y leerle el texto: el celular (obligatorio, y se puede CAMBIAR: la base lo guarda como su celular), el
 *      cumpleaños (día, mes y el año si quiere, CL-3; llega de la ficha si ya lo tenía) y el texto `club` vigente que la
 *      asesora LEE, con la casilla «Se lo leí y la clienta dijo que sí». Firma quien atiende, con el combo del ticket.
 *      «Unir al club» → `unirse_al_club` (medio `caja_palabra`). Registra su «sí» al CLUB: beneficios y avisos
 *      informativos. No es permiso de publicidad.
 *   2. La MISMA hoja muestra su QR (`CaraDelQr`, spike `modalQR`): abre el WhatsApp de la tienda con su mensaje y su código.
 *      La publicidad solo nace si ella lo envía (Ley 32323, D-4). Sin número de la tienda no hay QR, y se dice.
 * Nada se guarda en la venta: la invitación ocurre antes de cobrar, y el ticket impreso lleva el mismo QR.
 */
export function InvitarAlClub({
  clientaId,
  nombre,
  celularInicial,
  cumpleInicial,
  club,
  ubicacionId,
  responsable,
  onUnida,
  onClose,
}: {
  clientaId: string;
  /** Cómo se la lee en la caja del ticket (nombre, o su documento). */
  nombre: string;
  celularInicial: string;
  cumpleInicial: CumpleEscrito;
  club: ClubDeLaCaja;
  ubicacionId: string;
  /** El combo «Responsable» del ticket (el mismo de la venta): unirse al club firma con quien atiende (ADR-0161). */
  responsable: ControlResponsable;
  onUnida: ClubDeLaClienta["unida"];
  onClose: () => void;
}) {
  const [celular, setCelular] = useState(celularInicial);
  const [cumple, setCumple] = useState<CumpleEscrito>(cumpleInicial);
  const [cumpleOmitido, setCumpleOmitido] = useState(false);
  const [leido, setLeido] = useState(false);
  const [guardando, setGuardando] = useState(false);
  /** Se unió: la hoja pasa a su QR. `""` si la base no devolvió el código (no debería: el esquema lo exige con `club_desde`). */
  const [codigo, setCodigo] = useState<string | null>(null);
  const [anioActual] = useState(() => new Date().getFullYear());
  const textoClub = textoVigente(club.textos, "club");

  // Guía de foco (CLAUDE.md «Guía de foco», ADR-0284): `camposDeInvitar` es la MISMA regla que apaga «Unir al club».
  const campos = camposDeInvitar(
    { celular, cumple, cumpleOmitido, leido, responsableListo: responsable.listo, responsableMotivo: responsable.motivo },
    anioActual
  );
  const guia = useGuiaCampos(campos);
  const pCelular = problemaCelular(celular);

  async function unir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // La hoja vive en un portal, pero React hace subir el `submit` por sus ancestros de React: sin esto llegaría al
    // `<form onSubmit={onCobrar}>` del ticket, que contiene a la caja de la clienta (ADR-0128, «Actualización 2026-09-26»).
    e.stopPropagation();
    if (guardando || !textoClub) return;
    if (!sePuedeConfirmar(campos)) {
      const pCumple = problemaCumple(cumple, anioActual);
      if (pCelular) return void avisar.error(pCelular, { enfocar: ID_CELULAR });
      if (pCumple) return void avisar.error(pCumple, { enfocar: ID_DIA });
      if (!leido) return void avisar.error("Léele el texto del club y marca que dijo que sí.");
      return void avisar.error(responsable.motivo ?? "Elige quién registra.");
    }

    setGuardando(true);
    const fecha = cumpleParaGuardar(cumple);
    const { codigoClub, clubDesde, error } = await unirseAlClub(
      { clientaId, celular, ...fecha, medio: "caja_palabra", ubicacionId, ventaId: null, textoVersion: textoClub.version },
      responsable.firma()
    );
    setGuardando(false);
    if (error) {
      // Solo ante un rechazo: con éxito, `despues` vaciaría el combo y soltaría a quien atiende la venta en curso.
      responsable.despues(error);
      return void avisar.error(traducirError(error, "unirla al club"), error.hint === "celular_invalido" ? { enfocar: ID_CELULAR } : undefined);
    }
    const legible = codigoClubLegible(codigoClub);
    setCodigo(legible ?? "");
    onUnida({ codigoClub, clubDesde, celular, cumpleDia: fecha.cumpleDia, cumpleMes: fecha.cumpleMes });
    avisar.exito(legible ? `${nombre} ahora es socia · ${legible}` : `${nombre} ahora es socia`, {
      detalle: "Sin publicidad todavía: solo la puede pedir ella, desde su QR.",
    });
  }

  const unida = codigo !== null;
  return (
    <Modal
      // Una sola hoja: al unirse cambia de cara (su QR) sin cerrarse ni volver a entrar, como el spike (`unir-club` → `qr`).
      titulo={unida ? `Publicidad por WhatsApp · ${nombre}` : `Invitar a ${nombre} al Club CAYLA`}
      subtitulo={unida ? subtituloDelQr(nombre, codigo) : "Son tres datos y leerle el texto del club. Después ella decide si quiere publicidad."}
      variante="hoja"
      ancho={unida ? "max-w-xl" : "max-w-lg"}
      onClose={onClose}
      // Unirse no lleva token: cerrar y reabrir a mitad de camino podría enviarlo dos veces.
      bloqueado={guardando}
    >
      {(cerrar) =>
        codigo !== null ? (
          <CaraDelQr club={club} codigo={codigo} onListo={cerrar} />
        ) : !textoClub ? (
          // «Invitar» no aparece sin texto vigente (`cajaDelClub`): esto es solo la red si la hoja se abriera sin él.
          <p className="nota-cayla">No hay un texto del club vigente para leerle. Sin él no se la puede unir.</p>
        ) : (
          <form
            onSubmit={unir}
            // Enter en un campo no confirma: la pistola termina cada lectura con Enter (misma regla que el ticket).
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
            }}
            className="space-y-6"
          >
            <CampoGuiado id="celular" guia={guia} titulo="Celular de WhatsApp" ayuda="Obligatorio: el club son avisos">
              <CampoCelularClub id={ID_CELULAR} valor={celular} onValor={setCelular} problema={celular !== "" ? pCelular : null} />
            </CampoGuiado>

            <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Sin él no hay beneficio · el año es opcional">
              <CumpleanosClub
                idDia={ID_DIA}
                cumple={cumple}
                onCumple={setCumple}
                anioActual={anioActual}
                omitible
                omitido={cumpleOmitido}
                onOmitir={() => setCumpleOmitido(true)}
                deshabilitado={guardando}
              />
            </CampoGuiado>

            <CampoGuiado id="leido" guia={guia} titulo="Texto del club que se le lee">
              <TextoDelClubLeido texto={textoClub.texto} leido={leido} onLeido={setLeido} deshabilitado={guardando} />
            </CampoGuiado>

            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              {/* «Nadie de turno» y «no se pudo leer» ya los explica el combo con su recuadro; aquí, solo lo que falta elegir. */}
              {(responsable.estado === "falta" || responsable.estado === "cargando") && responsable.motivo && (
                <p className="mt-1.5 text-xs text-tinta/65">{responsable.motivo}</p>
              )}
            </CampoGuiado>

            <PieGuia guia={guia} listo="Todo listo para unirla al club." />
            <div className="flex justify-end gap-3 pt-2">
              <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
                Ahora no
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
              >
                {guardando ? "Uniéndola…" : "Unir al club"}
              </Boton>
            </div>
          </form>
        )
      }
    </Modal>
  );
}

function subtituloDelQr(nombre: string, codigo: string | null) {
  return codigo
    ? `${nombre} ya es del club (${codigo}). La publicidad es aparte y solo la pide ella.`
    : `${nombre} ya es del club. La publicidad es aparte y solo la pide ella.`;
}

/**
 * Su QR, para una socia que todavía no pidió la publicidad: se abre desde el chip «Sin publicidad · QR» de su caja en el
 * ticket (spike, `chipPub` → `modalQR`). Misma cara que la de «Invitar» al terminar.
 */
export function QrDeLaSociaHoja({ nombre, codigo, club, onClose }: { nombre: string; codigo: string; club: ClubDeLaCaja; onClose: () => void }) {
  return (
    <Modal titulo={`Publicidad por WhatsApp · ${nombre}`} subtitulo={subtituloDelQr(nombre, codigo)} variante="hoja" ancho="max-w-xl" onClose={onClose}>
      {(cerrar) => <CaraDelQr club={club} codigo={codigo} onListo={cerrar} />}
    </Modal>
  );
}

/**
 * La cara del QR (spike, `modalQR` sin publicidad): el QR a la izquierda y qué hacer a la derecha; en celular, uno sobre
 * otro. Del spike NO va lo del camino B (página de CAYLA con casilla, «Esperando su confirmación…» que se actualiza solo,
 * «Cada enlace sirve una sola vez», los botones de demo): el ADR solo admite que ella escriba primero desde el QR, y eso lo
 * marca la tienda en su ficha de Clientas con «Llegó su mensaje».
 */
function CaraDelQr({ club, codigo, onListo }: { club: ClubDeLaCaja; codigo: string; onListo: () => void }) {
  const qr = codigo ? qrDeLaSocia(club, codigo) : null;
  const destino = destinoDelQr(club);
  return (
    // Entra como respuesta a «Unir al club» (ADR-0136: dentro del contenido, corto y sin rebote).
    <div className="anim-revelar space-y-4">
      {qr?.tipo === "qr" ? (
        <>
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-sand bg-crema p-5 sm:flex-row sm:gap-6">
            <div className="shrink-0 rounded-xl bg-papel p-3 ring-1 ring-tinta/10">
              {/* Nivel L: el enlace con el mensaje pesa ~230–245 bytes; con menos módulos, cada uno es más grande y el celular de
                  la clienta lo lee de la pantalla sin acercarse. Sin fondo propio: el blanco lo pone la caja `papel`. */}
              <QRCodeSVG
                value={qr.enlace}
                size={176}
                level="L"
                marginSize={0}
                bgColor="transparent"
                fgColor="currentColor"
                className="h-44 w-44 text-tinta"
                title={`WhatsApp de la tienda con el mensaje de ${codigo}`}
              />
            </div>
            <div className="min-w-0 space-y-2 text-center sm:text-left">
              <p className="label-cayla text-[11px] text-taupe-profundo">Su QR · código {codigo}</p>
              <p className="font-display text-xl leading-snug text-tinta">Pídele que lo escanee con la cámara de su celular.</p>
              <p className="text-[13px] leading-snug text-tinta/70">
                Se abre el WhatsApp de la tienda con su mensaje listo. Cuando lo envíe, márcalo en su ficha de Clientas con «Llegó su mensaje».
              </p>
              {destino && <p className="break-all font-mono text-[11px] text-tinta/45">{destino}</p>}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-tinta/60">
            El mismo QR sale impreso en su ticket: puede enviarlo desde su casa. Sin QR no pasa nada: sigue siendo del club, solo que sin publicidad.
          </p>
        </>
      ) : (
        <p className="nota-cayla">
          {qr?.tipo === "sin_numero"
            ? "La tienda no tiene su WhatsApp cargado en Configuración: sin él no hay QR para las novedades. Es socia igual."
            : qr?.tipo === "sin_mensaje"
              ? "Falta el mensaje del club para el QR: sin él no hay QR para las novedades. Es socia igual."
              : "No se pudo leer su código de socia: búscalo en su ficha de Clientas. Es socia igual."}
        </p>
      )}
      <div className="flex justify-end pt-1">
        <Boton type="button" peso="fantasma" autoFocus onClick={onListo}>
          {qr?.tipo === "qr" ? "Listo, por ahora no" : "Listo"}
        </Boton>
      </div>
    </div>
  );
}
