"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CampoCelular, CamposCumpleanos, TextoDelClub } from "@/components/clientas/club-piezas";
import { CaraDelQrClub } from "@/components/clientas/CaraDelQrClub";
import { registrarMensajePublicidad, unirseAlClub } from "@/lib/club-acciones";
import { ajustarCelular, celularValido, codigoClubLegible, textoVigente } from "@/lib/club-reglas";
import {
  camposDeInvitar,
  camposDeLlegoSuMensaje,
  celularLegible,
  problemaCelular,
  type ClubDeLaCaja,
  type ComoLlegoLaPublicidad,
} from "@/lib/club-caja-reglas";
import { cajaDelProblemaCumple, cumpleParaGuardar, problemaCumple, type CumpleEscrito } from "@/lib/club-cumple-reglas";
import { cambiaDeCelular } from "@/lib/club-clientas-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { ClubDeLaClienta } from "./useClubDeLaClienta";

const ID_CELULAR = "club-celular";
const ID_DIA = "club-cumple-dia";
const ID_ANIO = "club-cumple-anio";
const ID_NUMERO = "club-mensaje-numero";

/**
 * «Invitar a … al Club CAYLA» desde Cobrar (ADR-0288 D-9 y tanda 1b), dibujada como el spike del club (`modalInvitar`, rama
 * `claude/spyke-club-clientas-visual-631f7a`, `45-club-caja.js`). Una sola hoja con dos caras:
 *   1. Tres datos y leerle el texto: el celular (obligatorio, y se puede CAMBIAR: la base lo guarda como su celular), el
 *      cumpleaños (día, mes y el año si quiere, CL-3; llega de la ficha si ya lo tenía) y el texto `club` vigente que la
 *      asesora LEE, con la casilla «Se lo leí y la clienta dijo que sí». Firma quien atiende, con el combo del ticket.
 *      «Unir al club» → `unirse_al_club` (medio `caja_palabra`). Registra su «sí» al CLUB: beneficios y avisos
 *      informativos. No es permiso de publicidad.
 *   2. La MISMA hoja muestra su QR (`PublicidadDeLaSocia`): el camino B (ADR-0288 act. c) — la página de CAYLA donde ELLA
 *      marca la casilla; la hoja se actualiza sola —, con el camino A de respaldo y «Llegó su mensaje (respaldo)».
 * Nada se guarda en la venta: la invitación ocurre antes de cobrar. El ticket impreso lleva el QR del camino A.
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
  onPublicidad,
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
  /** Llegó su publicidad (o ya la tenía): la caja relee su resumen. */
  onPublicidad: () => void;
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
      if (pCumple) return void avisar.error(pCumple, { enfocar: cajaDelProblemaCumple(cumple, anioActual) === "anio" ? ID_ANIO : ID_DIA });
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
      subtitulo={unida ? subtituloDelQr(nombre, codigo || null) : "Son tres datos y leerle el texto del club. Después ella decide si quiere publicidad."}
      variante="hoja"
      ancho={unida ? "max-w-xl" : "max-w-lg"}
      onClose={onClose}
      // Unirse no lleva token: cerrar y reabrir a mitad de camino podría enviarlo dos veces.
      bloqueado={guardando}
    >
      {(cerrar) =>
        codigo !== null ? (
          <PublicidadDeLaSocia
            clientaId={clientaId}
            nombre={nombre}
            codigo={codigo || null}
            celular={celular}
            club={club}
            ubicacionId={ubicacionId}
            responsable={responsable}
            onPublicidad={onPublicidad}
            onGuardando={setGuardando}
            onListo={cerrar}
          />
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
              <CampoCelular id={ID_CELULAR} caja valor={celular} onValor={setCelular} problema={celular !== "" ? pCelular : null} deshabilitado={guardando} />
            </CampoGuiado>

            <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Sin él no hay beneficio · el año es opcional">
              <CamposCumpleanos
                idDia={ID_DIA}
                idAnio={ID_ANIO}
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
              <TextoDelClub texto={textoClub.texto} leido={leido} onLeido={setLeido} deshabilitado={guardando} />
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
export function QrDeLaSociaHoja({
  clientaId,
  nombre,
  codigo,
  celular,
  club,
  ubicacionId,
  responsable,
  onPublicidad,
  onClose,
}: {
  clientaId: string;
  nombre: string;
  codigo: string | null;
  /** El de su ficha (el más fresco): «Llegó su mensaje» viene con él. */
  celular: string | null;
  club: ClubDeLaCaja;
  ubicacionId: string;
  responsable: ControlResponsable;
  onPublicidad: () => void;
  onClose: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  return (
    <Modal
      titulo={`Publicidad por WhatsApp · ${nombre}`}
      subtitulo={subtituloDelQr(nombre, codigo)}
      variante="hoja"
      ancho="max-w-xl"
      onClose={onClose}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <PublicidadDeLaSocia
          clientaId={clientaId}
          nombre={nombre}
          codigo={codigo}
          celular={celular}
          club={club}
          ubicacionId={ubicacionId}
          responsable={responsable}
          onPublicidad={onPublicidad}
          onGuardando={setGuardando}
          onListo={cerrar}
        />
      )}
    </Modal>
  );
}

/**
 * Lo de la publicidad dentro de la hoja de Cobrar: la cara de su QR (`CaraDelQrClub`, la misma de la ficha) y, si la
 * página no le carga y te escribe por WhatsApp, «Llegó su mensaje (respaldo)» en la misma hoja, con su número precargado.
 */
function PublicidadDeLaSocia({
  clientaId,
  nombre,
  codigo,
  celular,
  club,
  ubicacionId,
  responsable,
  onPublicidad,
  onGuardando,
  onListo,
}: {
  clientaId: string;
  nombre: string;
  codigo: string | null;
  celular: string | null;
  club: ClubDeLaCaja;
  ubicacionId: string;
  responsable: ControlResponsable;
  onPublicidad: () => void;
  onGuardando: (v: boolean) => void;
  onListo: () => void;
}) {
  const [enMensaje, setEnMensaje] = useState(false);
  const [llego, setLlego] = useState<ComoLlegoLaPublicidad | null>(null);
  if (enMensaje) {
    return (
      <LlegoSuMensajeEnCaja
        clientaId={clientaId}
        nombre={nombre}
        celularDeLaFicha={celular}
        ubicacionId={ubicacionId}
        responsable={responsable}
        onGuardando={onGuardando}
        onVolver={() => setEnMensaje(false)}
        onRegistrado={(como) => {
          setLlego(como);
          setEnMensaje(false);
          onPublicidad();
        }}
      />
    );
  }
  return (
    <CaraDelQrClub
      clientaId={clientaId}
      nombre={nombre}
      codigo={codigo}
      club={club}
      ubicacionId={ubicacionId}
      responsable={responsable}
      llego={llego}
      onPublicidad={onPublicidad}
      onLlegoSuMensaje={() => setEnMensaje(true)}
      onListo={onListo}
    />
  );
}

/**
 * «Llegó su mensaje (respaldo)» en Cobrar (spike, `modalQR` → `llego-mensaje`): ella te escribió por WhatsApp (desde el QR
 * del ticket, el de respaldo o por su cuenta) y el chat de la tienda es la prueba. El número viene con el de su ficha; si
 * escribió desde otro, ese pasa a ser su celular (lo dice antes de guardar). `registrar_mensaje_publicidad`, con la firma
 * del combo del ticket. Qué bloquea lo dice `camposDeLlegoSuMensaje` (lib/club-caja-reglas.ts, con pruebas).
 */
function LlegoSuMensajeEnCaja({
  clientaId,
  nombre,
  celularDeLaFicha,
  ubicacionId,
  responsable,
  onGuardando,
  onVolver,
  onRegistrado,
}: {
  clientaId: string;
  nombre: string;
  celularDeLaFicha: string | null;
  ubicacionId: string;
  responsable: ControlResponsable;
  onGuardando: (v: boolean) => void;
  onVolver: () => void;
  onRegistrado: (como: ComoLlegoLaPublicidad) => void;
}) {
  const [numero, setNumero] = useState(() => ajustarCelular(celularDeLaFicha ?? ""));
  const [guardando, setGuardando] = useState(false);
  const campos = camposDeLlegoSuMensaje({ numero, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  const cambia = celularValido(numero) && cambiaDeCelular(celularDeLaFicha, numero);

  async function registrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Mismo cuidado que «Unir al club»: el `submit` del portal no debe llegar al formulario del ticket (ADR-0128).
    e.stopPropagation();
    if (guardando) return;
    if (!sePuedeConfirmar(campos)) {
      const pNumero = problemaCelular(numero);
      if (pNumero) return void avisar.error(numero === "" ? "Escribe el número desde el que le escribió a la tienda." : pNumero, { enfocar: ID_NUMERO });
      return void avisar.error(responsable.motivo ?? "Elige quién registra.");
    }
    setGuardando(true);
    onGuardando(true);
    const { error } = await registrarMensajePublicidad(clientaId, numero, ubicacionId, responsable.firma());
    setGuardando(false);
    onGuardando(false);
    if (error?.hint === "ya_tiene_publicidad") return onRegistrado("ya_tenia");
    if (error) {
      // Solo ante un rechazo: con éxito, `despues` vaciaría el combo y soltaría a quien atiende la venta en curso.
      responsable.despues(error);
      return void avisar.error(traducirError(error, "registrar su mensaje"), error.hint === "celular_invalido" ? { enfocar: ID_NUMERO } : undefined);
    }
    avisar.exito(`${nombre} ya recibe novedades por WhatsApp`, { detalle: cambia ? `Su celular ahora es ${celularLegible(numero)}.` : undefined });
    onRegistrado("mensaje");
  }

  return (
    <form
      onSubmit={registrar}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      className="anim-revelar space-y-6"
    >
      <p className="text-sm text-tinta/75">
        Solo si <strong className="font-semibold text-tinta">ella</strong> le escribió primero a la tienda por WhatsApp: su mensaje en el chat de la tienda
        es la prueba de que quiere novedades. Búscalo antes de registrar.
      </p>
      <CampoGuiado id="numero" guia={guia} titulo="Número desde el que escribió" ayuda="Viene con el de su ficha">
        <CampoCelular
          id={ID_NUMERO}
          caja
          etiqueta="Número desde el que escribió"
          valor={numero}
          onValor={setNumero}
          problema={numero !== "" ? problemaCelular(numero) : null}
          deshabilitado={guardando}
        />
        {cambia && (
          <p className="nota-cayla mt-2">
            Escribió desde otro número: al registrar, el <b className="font-semibold">{celularLegible(numero)}</b> pasa a ser su celular
            {celularDeLaFicha ? ` (hoy es ${celularLegible(celularDeLaFicha)})` : ""}.
          </p>
        )}
      </CampoGuiado>
      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>
      <PieGuia guia={guia} listo="Todo listo para registrar su permiso." />
      <div className="flex justify-end gap-3 pt-2">
        <Boton type="button" peso="fantasma" onClick={onVolver} disabled={guardando}>
          Volver a su QR
        </Boton>
        <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
          {guardando ? "Registrando…" : "Registrar su permiso"}
        </Boton>
      </div>
    </form>
  );
}
