"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { NombreDelPadron, usePadronDeFicha } from "@/components/clientas/NombreDelPadron";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { traducirError } from "@/lib/error-escritura";
import { buscarClienta, fichaConDocumento, registrarClienta, type DatosAlta } from "@/lib/clientas-acciones";
import { avisoDelAlta, resultadoDelAlta } from "@/lib/alta-clienta-reglas";
import { camposDeRegistrar } from "@/lib/club-caja-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import type { Clienta } from "@/lib/clientas-reglas";
import { ajustarNumeroAlTipo, documentoLegible, normalizarNumeroDocumento, problemaDocumento } from "@/lib/documento-clienta-reglas";
import { AYUDA_NOMBRE_ESCRITO, nombreDelAlta, pendienteDelNombre, problemaNombreEscrito } from "@/lib/nombre-del-padron-reglas";

const ALTA_VACIA: DatosAlta = {
  documentoTipo: "dni",
  documentoNumero: "",
  nombre: "",
  telefonoWhatsapp: "",
  cumpleDia: "",
  cumpleMes: "",
  cumpleAnio: "",
};

const ID_NOMBRE = "nueva-clienta-nombre";

/** Alta de clienta (D-76/D-77), en `<Modal variante="hoja">` — antes vivía embebida en el cuerpo
 *  de `/clientas`; se separó al paso 2 del acta cuando la pantalla ganó lista, ficha y edición.
 *
 *  ADR-0288 tanda 1g (G-2): se registra SOLO con el documento, igual que en Cobrar —con DNI el nombre lo trae el padrón y no se
 *  escribe: sin el padrón no se registra (Felipe 2026-10-15, `NombreDelPadron`); con carné o pasaporte, se escribe tal cual— y
 *  quién registra. Ya no pide celular ni cumpleaños, ni une al club: ella se une sola
 *  escaneando el cartel, y ahí escribe su celular y su fecha de nacimiento (G-3). «Editar» de su ficha sigue corrigiéndolos.
 *  La guía y el botón miran la MISMA regla que Cobrar: `camposDeRegistrar` (lib/club-caja-reglas.ts, con pruebas).
 *
 *  Un documento es de una sola persona (Felipe 2026-10-14): si ya tiene ficha, la hoja lo dice apenas el número está completo
 *  —con su nombre: quien registra ve el módulo «Clientes»— y ofrece abrirla. «Registrar» no crea otra (la base completa la que
 *  hay, o la reactiva si estaba archivada) y lo dice así, en vez de «Cliente registrado». */
export function NuevaClientaModal({
  onClose,
  onCreada,
  onAbrirFicha,
}: {
  onClose: () => void;
  onCreada: (clienta: Clienta) => void;
  /** Abrir la ficha que ya tiene ese documento (la lista de Clientes lo hace en su lugar). */
  onAbrirFicha?: (id: string) => void;
}) {
  const [alta, setAlta] = useState<DatosAlta>(ALTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  // La ficha que la base encontró con el último documento completo (activa o archivada), o null.
  const [encontrada, setEncontrada] = useState<Clienta | null>(null);
  const responsable = useResponsable();

  const esDni = alta.documentoTipo === "dni";
  const numeroListo = normalizarNumeroDocumento(alta.documentoNumero);
  const documentoListo = numeroListo !== "" && problemaDocumento(alta.documentoTipo, alta.documentoNumero) === null;
  // Solo vale la que es de lo que dice la caja AHORA: si cambió el número o el tipo, la de antes ya no se muestra.
  const existente =
    documentoListo && encontrada && encontrada.documentoTipo === alta.documentoTipo && encontrada.documentoNumero === numeroListo ? encontrada : null;

  useEffect(() => {
    if (!documentoListo) return;
    let vigente = true;
    const reloj = setTimeout(async () => {
      // Una lectura (prefijo `buscar_`: el loader no tapa la hoja). Si falla, no se dice nada: al registrar decide la base.
      const { clientas } = await buscarClienta(numeroListo, true);
      if (!vigente) return;
      setEncontrada(clientas.find((c) => c.documentoTipo === alta.documentoTipo && c.documentoNumero === numeroListo) ?? null);
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [documentoListo, numeroListo, alta.documentoTipo]);
  // Con DNI, el nombre lo trae el padrón (Felipe 2026-10-15): con los 8 dígitos pregunta sola y la caja queda bloqueada.
  const { padron, consultar } = usePadronDeFicha({ numero: numeroListo, activo: esDni, automatico: true });
  const nombre = nombreDelAlta(alta.documentoTipo, padron, alta.nombre);
  const problemaNombre = esDni ? null : problemaNombreEscrito(alta.nombre);
  const campos = camposDeRegistrar({
    documentoTipo: alta.documentoTipo,
    documentoNumero: alta.documentoNumero,
    nombre: alta.nombre,
    padron,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);

  async function onRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (!sePuedeConfirmar(campos)) {
      const problema = problemaDocumento(alta.documentoTipo, alta.documentoNumero);
      const faltaNombre = pendienteDelNombre(alta.documentoTipo, padron, alta.nombre);
      if (normalizarNumeroDocumento(alta.documentoNumero) === "" || problema) {
        avisar.error(problema ?? "Elige el tipo de documento y escribe el número.", { enfocar: ID_NUMERO_DOCUMENTO });
      } else if (faltaNombre) {
        // Con DNI no hay caja que llenar: el aviso del padrón ya dice qué hacer. Con carné o pasaporte, se lleva el cursor al nombre.
        avisar.error(faltaNombre, esDni ? undefined : { enfocar: ID_NOMBRE });
      } else if (responsable.motivo) {
        avisar.error(responsable.motivo);
      }
      return;
    }
    setGuardando(true);
    // La ficha con ese documento JUSTO ANTES de registrar: la que avisa arriba puede no haber llegado todavía (se pide 300 ms
    // después de tipear). Con ella se dice lo que pasó de verdad (`resultadoDelAlta`).
    const previa = await fichaConDocumento(alta.documentoTipo, alta.documentoNumero);
    const { id, error } = await registrarClienta({ ...alta, nombre }, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error || !id) {
      // La base no encontró la lectura del padrón (la hoja estuvo abierta más de una hora, o no se pudo anotar): se vuelve a leer.
      if (error?.hint === "nombre_sin_padron") consultar();
      avisar.error(traducirError(error, "registrar al cliente"));
      return;
    }
    const numero = normalizarNumeroDocumento(alta.documentoNumero) || null;
    const quien = nombre || previa?.nombre?.trim() || documentoLegible(alta.documentoTipo, numero, false) || "sin nombre";
    // Ese documento ya tenía ficha: la base no creó otra (completó la que hay, o la reactivó). Se dice así y se abre la suya.
    const resultado = resultadoDelAlta(previa, id);
    const aviso = avisoDelAlta(resultado, quien, "clientes");
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    if (resultado !== "nueva" && onAbrirFicha) {
      onAbrirFicha(id);
      return;
    }
    onCreada({
      id,
      documentoTipo: alta.documentoTipo,
      documentoNumero: numero,
      nombre: nombre || previa?.nombre || null,
      telefonoWhatsapp: null,
      correo: null,
      tienePermisoWhatsapp: false,
      clubDesde: null,
      publicidadDesde: null,
      codigoClub: null,
      cumpleAnio: null,
      cumpleDia: null,
      cumpleMes: null,
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
    <Modal titulo="Registrar cliente" subtitulo="Solo su documento: vino, preguntó, se probó. Para ser del club, se une por su cuenta escaneando el cartel." onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form onSubmit={onRegistrar} className="space-y-6">
          <CampoGuiado id="documento" guia={guia} titulo="Documento" ayuda="DNI por defecto">
            {/* En el celular, tipo y número en UNA fila: con el teclado arriba, el número no queda bajo el pie. */}
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[11rem_1fr]" data-guia="clientas.nuevo-documento">
              <CampoTipoDocumento
                corto
                tipo={alta.documentoTipo}
                onTipo={(t) => setAlta((a) => ({ ...a, documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, a.documentoNumero) }))}
              />
              <CampoNumeroDocumento tipo={alta.documentoTipo} numero={alta.documentoNumero} onNumero={(v) => setAlta((a) => ({ ...a, documentoNumero: v }))} />
            </div>
            {/* Un documento es de una sola persona: si ya tiene ficha, se dice cuál (quien registra ve el módulo «Clientes»). */}
            {existente && (
              <Aviso
                tono="info"
                className="mt-3"
                titulo={existente.archivadaEn ? "Tiene una ficha archivada" : "Ya tiene ficha"}
                accion={
                  onAbrirFicha && !existente.archivadaEn ? (
                    <button type="button" className="btn-cayla btn-enlace" onClick={() => onAbrirFicha(existente.id)}>
                      Abrir su ficha
                    </button>
                  ) : undefined
                }
              >
                {`${existente.nombre ?? "Sin nombre"}${existente.codigoClub ? ` (${existente.codigoClub})` : ""}`}
                {existente.archivadaEn ? ": al registrarlo, vuelve con su historial." : ": no se crea otra ficha."}
              </Aviso>
            )}
          </CampoGuiado>
          {/* El nombre (Felipe 2026-10-15): con DNI lo trae el padrón y no se escribe —sin el padrón no se registra—; con carné o
              pasaporte se escribe tal cual está en el documento. */}
          <CampoGuiado id="nombre" guia={guia}>
            {esDni ? (
              <NombreDelPadron padron={padron} donde="alta" onConsultar={consultar} deshabilitado={guardando} guia="clientas.nuevo-nombre" />
            ) : (
              <div data-guia="clientas.nuevo-nombre">
                <CampoTexto
                  id={ID_NOMBRE}
                  etiqueta={guia.etiqueta("nombre", "Nombre completo")}
                  autoComplete="off"
                  maxLength={200}
                  value={alta.nombre}
                  onChange={(e) => setAlta((a) => ({ ...a, nombre: e.target.value }))}
                  // Los números se dicen apenas se tipean (ningún nombre los lleva); lo demás que falta lo dice la guía.
                  pie={problemaNombre && /[0-9]/.test(alta.nombre) ? problemaNombre : AYUDA_NOMBRE_ESCRITO}
                  tono={problemaNombre && /[0-9]/.test(alta.nombre) ? "error" : "neutro"}
                />
              </div>
            )}
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <div data-guia="clientas.nuevo-responsable">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </div>
          </CampoGuiado>
          {/* Pegado al borde de abajo (`pie-hoja-fijo`): con el teclado del celular abierto, «Registrar» sigue a la vista. */}
          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2" data-guia="clientas.nuevo-registrar">
            <PieGuia guia={guia} listo="Todo listo para registrar." />
            <div className="ml-auto pie-acciones">
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
          </div>
        </form>
      )}
    </Modal>
  );
}
