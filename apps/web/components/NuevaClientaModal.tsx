"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { CampoCelular, CamposCumpleanos, ID_ANIO_CLUB, ID_CELULAR_CLUB, ID_DIA_CLUB, TextoDelClub } from "@/components/clientas/club-piezas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { traducirError } from "@/lib/error-escritura";
import { registrarClienta, type DatosAlta } from "@/lib/clientas-acciones";
import { textosClub, unirseAlClub } from "@/lib/club-acciones";
import { celularValido, textoVigente, type TextoClub } from "@/lib/club-reglas";
import { estadoCumple } from "@/lib/club-clientas-reglas";
import type { Clienta } from "@/lib/clientas-reglas";
import { ajustarNumeroAlTipo, documentoLegible, normalizarNumeroDocumento, problemaDocumento } from "@/lib/documento-clienta-reglas";

const ALTA_VACIA: DatosAlta = {
  documentoTipo: "dni",
  documentoNumero: "",
  nombre: "",
  telefonoWhatsapp: "",
  cumpleDia: "",
  cumpleMes: "",
  cumpleAnio: "",
};

const numeroOVacio = (t: string) => (t.trim() === "" ? null : Number(t));
const ID_NOMBRE = "nueva-clienta-nombre";

/** Alta de clienta (D-76/D-77), en `<Modal variante="hoja">` — antes vivía embebida en el cuerpo
 *  de `/clientas`; se separó al paso 2 del acta cuando la pantalla ganó lista, ficha y edición.
 *
 *  ADR-0288 tanda 1b (D-4 reescrita): el interruptor «Acepta que la contactemos por WhatsApp» ya no existe. Registrarse no
 *  es unirse al club: «Se une al club» es opcional, pide el celular y que la asesora le LEA el texto `club` vigente; la
 *  publicidad por WhatsApp no se marca aquí nunca (solo nace de un mensaje de ella, «Llegó su mensaje»).
 *  Dibujado como el spike del club (`modalNueva`, docs/maquetas/club-clientas-spike-2026-09/ en la rama del spike): un bloque
 *  guiado por campo, el celular y el cumpleaños sugeridos, y el texto del club con su casilla «se lo leí». */
export function NuevaClientaModal({ onClose, onCreada }: { onClose: () => void; onCreada: (clienta: Clienta) => void }) {
  const [alta, setAlta] = useState<DatosAlta>(ALTA_VACIA);
  const [seUne, setSeUne] = useState(false);
  const [leido, setLeido] = useState(false);
  const [textos, setTextos] = useState<TextoClub[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();
  const anioActual = new Date().getFullYear();

  // El texto del club se lee al abrir (lectura `fn_`: no abre el loader). Sin texto vigente no se ofrece «Se une al club».
  useEffect(() => {
    let vigente = true;
    void textosClub().then(({ textos }) => {
      if (vigente) setTextos(textos);
    });
    return () => {
      vigente = false;
    };
  }, []);
  const textoClub = textos ? textoVigente(textos, "club") : null;
  const conClub = seUne && textoClub !== null;

  // Guía de foco (CLAUDE.md «Guía de foco»), con los campos del spike del club (`modalNueva`, rama
  // claude/spyke-club-clientas-visual-631f7a): la guía y el botón bloquean lo MISMO que `onRegistrar` abajo.
  //   · documento y nombre, siempre (el spike: una ficha es de una persona, con su documento; ADR-0288 D-2 y D-9). Con DNI,
  //     el nombre llega del padrón dentro del mismo bloque; con carné o pasaporte, se escribe en su propio bloque;
  //   · el celular y el cumpleaños son SUGERIDOS: no bloquean (README del spike, punto 7). El celular pasa a obligatorio si
  //     se une al club (CL-1); si se escribe, 9 dígitos. El cumpleaños, si se empieza, completo (y el año, bien);
  //   · «Se une al club» es opcional; si se une, la asesora le lee el texto y marca que dijo que sí;
  //   · y alguien de turno que registre.
  const esDni = alta.documentoTipo === "dni";
  const problema = problemaDocumento(alta.documentoTipo, alta.documentoNumero);
  const documentoBien = alta.documentoNumero !== "" && problema === null;
  const nombreBien = alta.nombre.trim().length >= 3;
  const celularAMedias = alta.telefonoWhatsapp !== "" && !celularValido(alta.telefonoWhatsapp);
  const celularBien = celularValido(alta.telefonoWhatsapp);
  const cumple = estadoCumple(alta.cumpleDia, alta.cumpleMes, alta.cumpleAnio, anioActual);
  const guia = useGuiaCampos([
    {
      id: "documento",
      nombre: esDni && documentoBien && !nombreBien ? "Nombre" : "Documento",
      requerido: true,
      // Con DNI, el nombre vive en este mismo bloque (el padrón lo trae; si no responde, se escribe aquí).
      hecho: documentoBien && (!esDni || nombreBien),
      pendiente: alta.documentoNumero === "" ? "Elige el tipo y escribe el número." : (problema ?? "Escribe su nombre."),
    },
    ...(esDni ? [] : [{ id: "nombre", nombre: "Nombre", requerido: true, hecho: nombreBien, pendiente: "Escribe su nombre." }]),
    {
      id: "celular",
      nombre: "Celular",
      requerido: conClub || celularAMedias,
      sugerido: true,
      hecho: celularBien,
      pendiente: conClub ? "Para ser del club hace falta su celular." : celularAMedias ? "El celular tiene 9 dígitos y empieza en 9." : "Sin celular queda identificada, no socia.",
    },
    { id: "cumple", nombre: "Cumpleaños", requerido: cumple.problema !== null, sugerido: true, hecho: cumple.completo, pendiente: cumple.problema ?? "Sin él no hay beneficio de cumpleaños." },
    { id: "club", nombre: "Se une al club", requerido: false, hecho: conClub, pendiente: "" },
    ...(conClub ? [{ id: "leido", nombre: "Leer el texto del club", requerido: true, hecho: leido, pendiente: "Léele el texto y confirma que dijo que sí." }] : []),
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);

  async function onRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (!documentoBien) {
      avisar.error(problema ?? "Elige el tipo de documento y escribe el número.", { enfocar: ID_NUMERO_DOCUMENTO });
      return;
    }
    if (!nombreBien) {
      avisar.error("Escribe su nombre.", { enfocar: esDni ? "documento-nombre" : ID_NOMBRE });
      return;
    }
    if ((conClub && !celularBien) || celularAMedias) {
      avisar.error(conClub && alta.telefonoWhatsapp === "" ? "Para ser del club hace falta su celular." : "El celular tiene 9 dígitos y empieza en 9.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    if (cumple.problema) {
      avisar.error(cumple.problema, { enfocar: alta.cumpleDia === "" ? ID_DIA_CLUB : ID_ANIO_CLUB });
      return;
    }
    if (conClub && !leido) {
      avisar.error("Léele el texto del club y confirma que dijo que sí, o apaga «Se une al club».");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    // Una sola firma para las dos escrituras: `despues` reinicia el combo al salir bien, y el «sí» al club lo registra la
    // misma persona que registró la ficha.
    const firma = responsable.firma();
    setGuardando(true);
    const { id, error } = await registrarClienta(alta, firma);
    if (error || !id) {
      setGuardando(false);
      responsable.despues(error);
      avisar.error(traducirError(error, "registrar la clienta"));
      return;
    }
    // Su «sí» al club (medio `ficha`): va después del alta porque necesita la ficha. Si falla, la clienta YA quedó
    // registrada: se dice así, y se la puede unir desde su ficha.
    const club = conClub
      ? await unirseAlClub(
          {
            clientaId: id,
            celular: alta.telefonoWhatsapp,
            cumpleDia: numeroOVacio(alta.cumpleDia),
            cumpleMes: numeroOVacio(alta.cumpleMes),
            cumpleAnio: numeroOVacio(alta.cumpleAnio),
            medio: "ficha",
            ubicacionId: responsable.ubicacionId,
            // La versión del texto que se le leyó: si cambió en el camino, la base rechaza (`club_texto_cambio`).
            textoVersion: textoClub?.version ?? null,
          },
          firma,
        )
      : null;
    setGuardando(false);
    responsable.despues(club?.error ?? null);
    const numero = normalizarNumeroDocumento(alta.documentoNumero) || null;
    const quien = alta.nombre.trim() || documentoLegible(alta.documentoTipo, numero, false) || "sin nombre";
    const unida = club !== null && !club.error;
    if (club?.error) {
      avisar.exito("Clienta registrada", { detalle: quien });
      avisar.error(`Quedó registrada, pero no se unió al club. ${traducirError(club.error, "unirla al club")} Puedes unirla desde su ficha.`);
    } else {
      avisar.exito(unida ? "Clienta registrada y unida al club" : "Clienta registrada", { detalle: unida && club.codigoClub ? `${quien} · ${club.codigoClub}` : quien });
    }
    onCreada({
      id,
      documentoTipo: alta.documentoTipo,
      documentoNumero: numero,
      nombre: alta.nombre.trim() || null,
      telefonoWhatsapp: alta.telefonoWhatsapp.trim() || null,
      tienePermisoWhatsapp: false,
      clubDesde: unida ? (club.clubDesde ?? new Date().toISOString()) : null,
      publicidadDesde: null,
      codigoClub: unida ? club.codigoClub : null,
      cumpleAnio: numeroOVacio(alta.cumpleAnio),
      cumpleDia: numeroOVacio(alta.cumpleDia),
      cumpleMes: numeroOVacio(alta.cumpleMes),
      tallas: null,
      createdAt: new Date().toISOString(),
      version: 1,
      archivadaEn: null,
      motivoArchivo: null,
      anonimizada: false,
      fusionadaEnId: null,
    });
  }

  return (
    <Modal titulo="Registrar clienta" subtitulo="Puede ser sin una venta: vino, preguntó, se probó. Unirse al club es aparte y de palabra." onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form onSubmit={onRegistrar} className="space-y-6">
          <CampoGuiado id="documento" guia={guia} titulo="Documento" ayuda="DNI por defecto">
            <div className="grid grid-cols-[11rem_1fr] items-start gap-3 max-sm:grid-cols-1">
              <CampoTipoDocumento
                tipo={alta.documentoTipo}
                onTipo={(t) => setAlta((a) => ({ ...a, documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, a.documentoNumero) }))}
              />
              {esDni ? (
                // Solo el DNI se consulta al padrón (RENIEC, ADR-0008), como en Cobrar: con los 8 dígitos trae el nombre solo. Si
                // el padrón no responde, el nombre se escribe a mano aquí mismo y el alta sigue igual (principio 9).
                <ConsultaDocumento
                  tipo="dni"
                  obligatorio
                  numero={alta.documentoNumero}
                  onNumero={(v) => setAlta((a) => ({ ...a, documentoNumero: v }))}
                  nombre={alta.nombre}
                  onNombre={(v) => setAlta((a) => ({ ...a, nombre: v }))}
                />
              ) : (
                <CampoNumeroDocumento tipo={alta.documentoTipo} numero={alta.documentoNumero} onNumero={(v) => setAlta((a) => ({ ...a, documentoNumero: v }))} />
              )}
            </div>
            {!esDni && <p className="mt-1 text-xs text-tinta/60">Solo el DNI se autocompleta con el padrón; carné y pasaporte llevan el nombre a mano.</p>}
          </CampoGuiado>
          {!esDni && (
            <CampoGuiado id="nombre" guia={guia} titulo="Nombre">
              <CampoTexto id={ID_NOMBRE} etiqueta="Nombre completo" caja value={alta.nombre} onChange={(e) => setAlta((a) => ({ ...a, nombre: e.target.value }))} />
            </CampoGuiado>
          )}
          <CampoGuiado
            id="celular"
            guia={guia}
            titulo="Celular de WhatsApp"
            ayuda={conClub ? "Obligatorio para ser del club" : "Opcional: sin celular queda identificada, no socia"}
          >
            <CampoCelular etiqueta="Celular de WhatsApp" caja obligatorio={conClub} valor={alta.telefonoWhatsapp} onValor={(v) => setAlta((a) => ({ ...a, telefonoWhatsapp: v }))} />
          </CampoGuiado>
          <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Sin él no hay beneficio · el año es opcional">
            <CamposCumpleanos
              dia={alta.cumpleDia}
              mes={alta.cumpleMes}
              anio={alta.cumpleAnio}
              onDia={(v) => setAlta((a) => ({ ...a, cumpleDia: v }))}
              onMes={(v) => setAlta((a) => ({ ...a, cumpleMes: v }))}
              onAnio={(v) => setAlta((a) => ({ ...a, cumpleAnio: v }))}
              anioActual={anioActual}
            />
          </CampoGuiado>
          {textoClub && (
            <CampoGuiado id="club" guia={guia}>
              <Interruptor
                activo={seUne}
                onActivo={(v) => {
                  setSeUne(v);
                  if (!v) setLeido(false);
                }}
                etiqueta={guia.etiqueta("club", "Se une al club")}
                pie="La publicidad por WhatsApp es aparte: la pide ella después, desde su QR. Desde la ficha no se puede marcar."
              />
            </CampoGuiado>
          )}
          {conClub && textoClub && (
            <CampoGuiado id="leido" guia={guia} titulo="Texto del club que se le lee" ayuda={`versión ${textoClub.version}`}>
              <TextoDelClub texto={textoClub} leido={leido} onLeido={setLeido} />
            </CampoGuiado>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para registrar." />
          <div className="flex justify-end gap-3 pt-2">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              Registrar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
