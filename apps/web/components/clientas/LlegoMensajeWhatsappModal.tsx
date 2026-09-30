"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoTexto, Segmentado, type Opcion } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { CampoCelular, ID_CELULAR_CLUB } from "@/components/clientas/club-piezas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { buscarPorCelular, buscarPorCodigoClub, editarClienta } from "@/lib/clientas-acciones";
import { registrarBajaWhatsapp, registrarDesdeWhatsapp, registrarMensajePublicidad } from "@/lib/club-acciones";
import { celularValido } from "@/lib/club-reglas";
import { leerMensaje, queHacerConElMensaje, textoEstadoClub, type LoQuePide } from "@/lib/club-clientas-reglas";
import type { Clienta } from "@/lib/clientas-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { ajustarNumeroAlTipo, documentoLegible, normalizarNumeroDocumento, problemaDocumento, type TipoDocumentoClienta } from "@/lib/documento-clienta-reglas";

// «Llegó un mensaje de WhatsApp» (ADR-0288 tanda 1b, «Actualización 2026-09-30»). La tienda no tiene bot: cuando a su
// WhatsApp llega un mensaje del club, la asesora lo pega aquí con el número que escribió y el ERP decide qué registrar:
//   · «BAJA» (o «STOP»): sin publicidad desde hoy, para toda ficha con ese número (`registrar_baja_whatsapp`);
//   · con su código de socia (el QR de su ticket o de la caja) o desde un número que ya tiene ficha: su permiso de
//     publicidad (`registrar_mensaje_publicidad`); si escribió desde otro número, ese pasa a ser su celular;
//   · sin ficha (el cartel del mostrador, un ticket sin clienta): la tienda le pide su documento en ese mismo chat y la
//     registra socia con novedades (`registrar_desde_whatsapp`). Sin documento y nombre no hay socia (CL-1) y el ERP no le
//     escribe.
// Qué función corresponde lo decide `queHacerConElMensaje` (lógica pura, con su prueba); la base vuelve a exigirlo todo.

const ID_MENSAJE = "club-mensaje-que-llego";

const QUE_PIDE: readonly Opcion<LoQuePide>[] = [
  { valor: "novedades", texto: "Unirse / novedades" },
  { valor: "baja", texto: "BAJA" },
];

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });
const fecha = (iso: string) => FORMATO_FECHA.format(new Date(iso));

type Documento = { tipo: TipoDocumentoClienta; numero: string; nombre: string };

export function LlegoMensajeWhatsappModal({ onClose, onListo }: { onClose: () => void; onListo: (clientaId: string | null) => void }) {
  const [texto, setTexto] = useState("");
  const [numero, setNumero] = useState("");
  // Lo que pide sale del texto hasta que la asesora lo cambia a mano (un «me quiero dar de baja porfa» que no calzó).
  const [pideElegido, setPideElegido] = useState<LoQuePide | null>(null);
  const [paso, setPaso] = useState<"mensaje" | "resultado">("mensaje");
  const [encontradas, setEncontradas] = useState<Clienta[]>([]);
  const [elegida, setElegida] = useState<Clienta | null>(null);
  const [porCodigo, setPorCodigo] = useState(false);
  const [documento, setDocumento] = useState<Documento>({ tipo: "dni", numero: "", nombre: "" });
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();

  const lectura = leerMensaje(texto);
  const pide = pideElegido ?? lectura.pide;
  const queHacer = paso === "resultado" && (encontradas.length <= 1 || elegida) ? queHacerConElMensaje(pide, elegida, numero) : null;
  const pideDocumento = queHacer?.accion === "pedir_documento";
  const problemaDoc = problemaDocumento(documento.tipo, documento.numero);
  // CL-1: la socia necesita documento y nombre (además del celular, que es el número que escribió).
  const faltaDelDocumento = documento.numero === "" ? "Pídele su documento en el chat y escríbelo aquí." : problemaDoc;

  // Guía de foco (CLAUDE.md «Guía de foco»): en el primer paso, lo que llegó y desde qué número; después, lo que pida la
  // decisión (elegir entre varias fichas, el documento si no hay ficha) y quién lo registra.
  const campos: CampoDeGuia[] =
    paso === "mensaje"
      ? [
          { id: "mensaje", nombre: "Lo que escribió", requerido: true, hecho: texto.trim() !== "", pendiente: "Pega o escribe lo que llegó por WhatsApp." },
          { id: "pide", nombre: "Qué pide", requerido: false, hecho: texto.trim() !== "", pendiente: "" },
          { id: "numero", nombre: "Número que escribió", requerido: true, hecho: celularValido(numero), pendiente: "El número desde el que escribió: 9 dígitos." },
        ]
      : [
          ...(encontradas.length > 1 && pide !== "baja"
            ? [{ id: "elegida", nombre: "Su ficha", requerido: true, hecho: elegida !== null, pendiente: "Elige cuál de las fichas es la de ella." }]
            : []),
          ...(pideDocumento
            ? [
                {
                  id: "documento",
                  nombre: faltaDelDocumento ? "Su documento" : "Su nombre",
                  requerido: true,
                  hecho: faltaDelDocumento === null && documento.nombre.trim() !== "",
                  pendiente: faltaDelDocumento ?? "Su nombre: el padrón lo trae con el DNI; si no, escríbelo.",
                },
              ]
            : []),
          ...(queHacer && queHacer.accion !== "ya_tiene_publicidad"
            ? [{ id: "responsable", nombre: "Quién lo registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo registra." }]
            : []),
        ];
  const guia = useGuiaCampos(campos);

  async function onBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (texto.trim() === "") {
      avisar.error("Pega o escribe lo que llegó por WhatsApp.", { enfocar: ID_MENSAJE });
      return;
    }
    if (!celularValido(numero)) {
      avisar.error("El número desde el que escribió tiene 9 dígitos y empieza en 9.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    setBuscando(true);
    // Primero por su código (el QR personalizado lo trae); si no trae o no calza, por el número que escribió.
    let halladas: Clienta[] = [];
    let conCodigo = false;
    if (pide === "novedades" && lectura.codigo) {
      const r = await buscarPorCodigoClub(lectura.codigo);
      if (r.error) {
        setBuscando(false);
        avisar.error(traducirError(r.error, "buscar la ficha por su código"));
        return;
      }
      if (r.clienta) {
        halladas = [r.clienta];
        conCodigo = true;
      }
    }
    if (halladas.length === 0) {
      const r = await buscarPorCelular(numero);
      if (r.error) {
        setBuscando(false);
        avisar.error(traducirError(r.error, "buscar la ficha por su número"));
        return;
      }
      halladas = r.clientas;
    }
    setBuscando(false);
    setEncontradas(halladas);
    setPorCodigo(conCodigo);
    const unica = halladas.length === 1 ? halladas[0]! : null;
    setElegida(unica);
    // Si la ficha ya tiene documento o nombre, vienen escritos: solo se pide lo que le falta.
    setDocumento({ tipo: unica?.documentoTipo ?? "dni", numero: unica?.documentoNumero ?? "", nombre: unica?.nombre ?? "" });
    setPaso("resultado");
  }

  /** Lo común a cada registro: responsable, el aviso de la base, y cerrar con la ficha que quedó. */
  async function registrar(hacer: () => Promise<{ clientaId: string | null; error: ErrorEscritura }>, que: string, exito: (clientaId: string | null) => void) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { clientaId, error } = await hacer();
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, que));
      return;
    }
    exito(clientaId);
    onListo(clientaId);
  }

  async function onRegistrarMensaje() {
    if (!elegida) return;
    const firma = responsable.firma();
    const cambia = queHacer?.accion === "registrar_mensaje" && queHacer.cambiaCelular;
    await registrar(
      async () => ({ clientaId: elegida.id, error: (await registrarMensajePublicidad(elegida.id, numero, responsable.ubicacionId, firma)).error }),
      "registrar su mensaje",
      () =>
        avisar.exito("Ya recibe novedades por WhatsApp", {
          detalle: [elegida.nombre, cambia ? `su celular ahora es ${numero}` : null].filter(Boolean).join(" · ") || undefined,
        }),
    );
  }

  async function onUnirConSuDocumento() {
    if (!elegida?.documentoNumero) return;
    const firma = responsable.firma();
    const ficha = elegida;
    let codigo: string | null = null;
    await registrar(
      async () => {
        const r = await registrarDesdeWhatsapp(
          { documentoTipo: ficha.documentoTipo, documentoNumero: ficha.documentoNumero!, nombre: ficha.nombre ?? "", telefonoQueEscribio: numero, ubicacionId: responsable.ubicacionId },
          firma,
        );
        codigo = r.codigoClub;
        return { clientaId: r.clientaId ?? ficha.id, error: r.error };
      },
      "registrarla en el club",
      () => avisar.exito("Ya es socia, con novedades por WhatsApp", { detalle: [ficha.nombre, codigo].filter(Boolean).join(" · ") || undefined }),
    );
  }

  async function onRegistrarConDocumento() {
    if (faltaDelDocumento) {
      avisar.error(faltaDelDocumento, { enfocar: ID_NUMERO_DOCUMENTO });
      return;
    }
    if (documento.nombre.trim() === "") {
      avisar.error("Para registrarla en el club hace falta su nombre: si el padrón no lo trajo, escríbelo.");
      return;
    }
    const firma = responsable.firma();
    // Una ficha encontrada por su número pero sin documento: primero se le guarda el documento a ESA ficha, para que el
    // registro desde WhatsApp la complete en vez de crear otra con el mismo celular.
    const completar = queHacer?.accion === "pedir_documento" && queHacer.completaFicha ? elegida : null;
    let codigo: string | null = null;
    await registrar(
      async () => {
        if (completar) {
          const { error } = await editarClienta(
            completar.id,
            {
              documentoTipo: documento.tipo,
              documentoNumero: documento.numero,
              nombre: documento.nombre.trim() || completar.nombre || "",
              telefonoWhatsapp: completar.telefonoWhatsapp ?? "",
              cumpleDia: completar.cumpleDia?.toString() ?? "",
              cumpleMes: completar.cumpleMes?.toString() ?? "",
              cumpleAnio: completar.cumpleAnio?.toString() ?? "",
              tallas: completar.tallas,
            },
            completar.version,
            firma,
          );
          if (error) return { clientaId: null, error };
        }
        const r = await registrarDesdeWhatsapp(
          { documentoTipo: documento.tipo, documentoNumero: normalizarNumeroDocumento(documento.numero), nombre: documento.nombre, telefonoQueEscribio: numero, ubicacionId: responsable.ubicacionId },
          firma,
        );
        codigo = r.codigoClub;
        return { clientaId: r.clientaId, error: r.error };
      },
      "registrarla en el club",
      () =>
        avisar.exito("Registrada socia, con novedades por WhatsApp", {
          detalle: [documento.nombre.trim() || documentoLegible(documento.tipo, normalizarNumeroDocumento(documento.numero), false), codigo].filter(Boolean).join(" · ") || undefined,
        }),
    );
  }

  async function onBaja() {
    const firma = responsable.firma();
    let fichas = 0;
    await registrar(
      async () => {
        const r = await registrarBajaWhatsapp(numero, responsable.ubicacionId, firma);
        fichas = r.fichas;
        return { clientaId: null, error: r.error };
      },
      "registrar la BAJA",
      () =>
        avisar.exito("BAJA registrada", {
          detalle: fichas === 0 ? `Ninguna ficha tenía el ${numero}: no había novedades que quitar.` : `Sin novedades por WhatsApp desde hoy (${fichas} ficha${fichas === 1 ? "" : "s"}).`,
        }),
    );
  }

  const volver = (
    <Boton type="button" onClick={() => setPaso("mensaje")} disabled={guardando}>
      ← Cambiar el mensaje
    </Boton>
  );
  const combo = (
    <CampoGuiado id="responsable" guia={guia}>
      <ComboResponsable control={responsable} deshabilitado={guardando} />
    </CampoGuiado>
  );
  const principal = (textoBoton: string, onClick: () => void) => (
    <div className="flex flex-wrap justify-end gap-3 pt-2">
      {volver}
      <Boton
        type="button"
        peso="primario"
        cargando={guardando}
        onClick={onClick}
        disabled={!responsable.listo}
        title={responsable.motivo ?? guia.frase ?? undefined}
        className={guia.claseConfirmar}
      >
        {textoBoton}
      </Boton>
    </div>
  );

  return (
    <Modal
      titulo="Llegó un mensaje de WhatsApp"
      subtitulo="Pega lo que le escribió a la tienda y desde qué número: el ERP busca su ficha y te dice qué registrar."
      onClose={onClose}
      variante="hoja"
      ancho="max-w-lg"
      bloqueado={guardando}
    >
      {(cerrar) =>
        paso === "mensaje" ? (
          <form onSubmit={onBuscar} className="space-y-5">
            <CampoGuiado id="mensaje" guia={guia}>
              <Campo etiqueta={guia.etiqueta("mensaje", "Lo que escribió")} htmlFor={ID_MENSAJE}>
                <textarea
                  id={ID_MENSAJE}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Pega aquí el mensaje tal como llegó"
                  className="caja-cayla w-full resize-none px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55"
                />
              </Campo>
            </CampoGuiado>
            <CampoGuiado id="pide" guia={guia}>
              <Segmentado
                etiqueta={guia.etiqueta("pide", "Qué pide")}
                valor={pide}
                onValor={setPideElegido}
                opciones={QUE_PIDE}
                pie={
                  pide === "baja"
                    ? "Se le quita la publicidad a toda ficha con ese número, en las 3 tiendas."
                    : lectura.codigo
                      ? `Trae su código de socia: ${lectura.codigo}.`
                      : texto.trim() !== ""
                        ? "Sin código de socia: se busca por el número."
                        : null
                }
              />
            </CampoGuiado>
            <CampoGuiado id="numero" guia={guia}>
              <CampoCelular etiqueta={guia.etiqueta("numero", "Número desde el que escribió")} obligatorio valor={numero} onValor={setNumero} />
            </CampoGuiado>
            <PieGuia guia={guia} listo={pide === "baja" ? "Todo listo: sigue con la BAJA." : "Todo listo para buscar su ficha."} />
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={buscando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                {pide === "baja" ? "Seguir con la BAJA" : "Buscar su ficha"}
              </Boton>
            </div>
          </form>
        ) : pide === "baja" ? (
          <div className="space-y-5">
            <p className="text-sm text-tinta/75">
              Pidió no recibir más novedades. Desde hoy no se le envían novedades, rebajas ni el saludo de cumpleaños por WhatsApp desde
              ninguna tienda. <strong>Si es socia, lo sigue siendo</strong>: los avisos de sus apartados y de sus tallas siguen.
            </p>
            {encontradas.length > 0 ? (
              <div className="space-y-2">
                <p className="label-cayla text-[11px] text-tinta/65">Fichas con el {numero}</p>
                {encontradas.map((f) => (
                  <FichaResumen key={f.id} ficha={f} />
                ))}
              </div>
            ) : (
              <p className="nota-cayla">Ninguna ficha activa tiene el {numero}. Igual se registra, por si alguna archivada lo tiene.</p>
            )}
            {combo}
            <PieGuia guia={guia} listo="Todo listo para registrar la BAJA." />
            {principal("Registrar la BAJA", onBaja)}
          </div>
        ) : encontradas.length > 1 && !elegida ? (
          <div className="space-y-5">
            <CampoGuiado id="elegida" guia={guia} titulo={`${encontradas.length} fichas tienen el ${numero}`} ayuda="Elige la de ella" className="space-y-2">
              {encontradas.map((f) => (
                <button key={f.id} type="button" onClick={() => setElegida(f)} className="block w-full text-left">
                  <FichaResumen ficha={f} />
                </button>
              ))}
            </CampoGuiado>
            <PieGuia guia={guia} />
            <div className="flex justify-end pt-2">{volver}</div>
          </div>
        ) : queHacer?.accion === "registrar_mensaje" && elegida ? (
          <div className="space-y-5">
            <p className="text-sm text-tinta/75">
              {porCodigo ? `La encontramos por su código ${lectura.codigo}.` : "La encontramos por el número que escribió."}{" "}
              {elegida.publicidadDesde ? "Ya recibe novedades, pero escribió desde otro número." : "Es socia y todavía no recibe novedades: con su mensaje, ya puede."}
            </p>
            <FichaResumen ficha={elegida} />
            {queHacer.cambiaCelular && (
              <p className="nota-cayla">
                Escribió desde otro número: al registrar, el <b>{numero}</b> pasa a ser su celular{elegida.telefonoWhatsapp ? <> (hoy es {elegida.telefonoWhatsapp})</> : null}.
              </p>
            )}
            {combo}
            <PieGuia guia={guia} listo="Todo listo para registrar su permiso." />
            {principal("Registrar su permiso", onRegistrarMensaje)}
          </div>
        ) : queHacer?.accion === "ya_tiene_publicidad" && elegida ? (
          <div className="space-y-5">
            <FichaResumen ficha={elegida} />
            <p className="nota-cayla">Ya recibe novedades por WhatsApp{elegida.publicidadDesde ? ` desde el ${fecha(elegida.publicidadDesde)}` : ""}: no hay nada que registrar.</p>
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {volver}
              <Boton type="button" peso="primario" onClick={cerrar}>
                Listo
              </Boton>
            </div>
          </div>
        ) : queHacer?.accion === "unir_con_su_documento" && elegida ? (
          <div className="space-y-5">
            <p className="text-sm text-tinta/75">Tiene ficha, pero todavía no es del club. Con su mensaje queda socia y con novedades por WhatsApp, con su documento y su nombre de la ficha.</p>
            <FichaResumen ficha={elegida} />
            {combo}
            <PieGuia guia={guia} listo="Todo listo para registrarla en el club." />
            {principal("Registrarla en el club", onUnirConSuDocumento)}
          </div>
        ) : (
          <div className="space-y-5">
            {elegida ? (
              <>
                <p className="text-sm text-tinta/75">
                  A su ficha le falta {elegida.documentoNumero ? "el nombre" : "el documento"}. Pídeselo en ese mismo chat: se guarda en su ficha y queda
                  socia con novedades.
                </p>
                <FichaResumen ficha={elegida} />
              </>
            ) : (
              <p className="text-sm text-tinta/75">
                No encontramos su ficha{lectura.codigo && pide === "novedades" ? ` (ni el código ${lectura.codigo})` : ""}. Como ella escribió primero, respóndele
                en ese mismo chat pidiéndole su documento. <strong>Sin documento no se registra</strong> y la tienda no le escribe.
              </p>
            )}
            <CampoGuiado id="documento" guia={guia} titulo="Su documento y su nombre" ayuda="Lo que te mandó por el chat" className="space-y-3">
              <CampoTipoDocumento tipo={documento.tipo} onTipo={(t) => setDocumento((d) => ({ ...d, tipo: t, numero: ajustarNumeroAlTipo(t, d.numero) }))} />
              {documento.tipo === "dni" ? (
                // El DNI trae el nombre del padrón (RENIEC, ADR-0008); si no responde, se escribe a mano (principio 9).
                <ConsultaDocumento
                  tipo="dni"
                  obligatorio
                  numero={documento.numero}
                  onNumero={(v) => setDocumento((d) => ({ ...d, numero: v }))}
                  nombre={documento.nombre}
                  onNombre={(v) => setDocumento((d) => ({ ...d, nombre: v }))}
                />
              ) : (
                <>
                  <CampoNumeroDocumento tipo={documento.tipo} numero={documento.numero} onNumero={(v) => setDocumento((d) => ({ ...d, numero: v }))} />
                  <CampoTexto etiqueta="Nombre de la clienta" value={documento.nombre} onChange={(e) => setDocumento((d) => ({ ...d, nombre: e.target.value }))} />
                </>
              )}
              <p className="text-xs text-tinta/65">Su celular será el {numero}, desde el que escribió.</p>
            </CampoGuiado>
            {combo}
            <PieGuia guia={guia} listo="Todo listo para registrarla en el club." />
            {principal("Registrarla en el club", onRegistrarConDocumento)}
          </div>
        )
      }
    </Modal>
  );
}

/** Una ficha en una línea: nombre, documento, celular y dónde está frente al club. */
function FichaResumen({ ficha }: { ficha: Clienta }) {
  const estado = textoEstadoClub(ficha, fecha);
  return (
    // Solo `span`: la misma fila va dentro de un botón cuando hay que elegir entre varias fichas.
    <span className="card-cayla flex items-center justify-between gap-3 p-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{ficha.nombre ?? "Sin nombre"}</span>
        <span className="block truncate text-xs text-tinta/65">
          {[documentoLegible(ficha.documentoTipo, ficha.documentoNumero, false), ficha.telefonoWhatsapp].filter(Boolean).join(" · ") || "Sin documento ni celular"}
        </span>
      </span>
      <Chip tono={ficha.publicidadDesde ? "verde" : ficha.clubDesde ? "pizarra" : "neutro"}>{estado.corto}</Chip>
    </span>
  );
}
