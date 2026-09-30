"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import {
  altaDesdeBusqueda,
  filaDeClienta,
  lineaDeClienta,
  terminoBuscable,
  type AltaEnTicket,
  type ClientaDelTicket,
} from "@/lib/clienta-ticket-reglas";
import {
  TIPOS_DOCUMENTO_CLIENTA,
  ajustarNumeroAlTipo,
  largoMaximoDocumento,
  normalizarNumeroDocumento,
  problemaDocumento,
  tipoDocumentoDe,
} from "@/lib/documento-clienta-reglas";
import { registrarClienta } from "@/lib/clientas-acciones";
import { esSinModulo, traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";

const ESPERA_MS = 300;

/**
 * La fila «Clienta» arriba del ticket (spike 2026-09-26, hallazgo 4; referentes: Shopify POS, Square y Odoo ponen al
 * cliente arriba del carrito). Opcional: vender sin clienta sigue siendo un toque. Elegida, el padre llena el documento y
 * el nombre del comprobante (`onElegir`), la venta queda en su ficha (`p_cliente_id`, ADR-0288 D-1), y la proforma o el
 * apartado ya saben a nombre de quién van.
 *
 * Registrar en el ticket (ADR-0288 D-9): si no está en la libreta, se registra en la misma hoja, sin salir del cobro
 * —tipo de documento (DNI por defecto) y número; con DNI el nombre llega del padrón y, si el padrón no responde, se escribe
 * a mano (principio 9)— y queda elegida para esta venta. Registrarse NO es unirse al club (eso es la tanda 1b).
 *
 * `puedeBuscar` (ADR-0249, actualización 2026-09-28): la libreta es del módulo «Clientas». Qué se muestra sin él lo decide
 * `filaDeClienta` (lib/clienta-ticket-reglas.ts, con pruebas): sin clienta, la fila no aparece y se vende igual.
 */
export function ClientaDelTicket({
  clienta,
  onElegir,
  onQuitar,
  bloqueado,
  puedeBuscar,
  responsable,
  onHojaAbierta,
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
}) {
  const [abierto, setAbierto] = useState(false);
  const fila = filaDeClienta(clienta, puedeBuscar);
  const hojaVisible = abierto && (fila === "agregar" || fila === "elegida");

  // La limpieza cubre también que la fila se desmonte con la hoja abierta (el ticket pasa a «cobrar», o de columna a hoja).
  useEffect(() => {
    if (!hojaVisible || !onHojaAbierta) return;
    onHojaAbierta(true);
    return () => onHojaAbierta(false);
  }, [hojaVisible, onHojaAbierta]);

  if (fila === "nada") return null;

  return (
    <div className="px-5 pt-3">
      {clienta ? (
        <div className="flex items-center gap-3 rounded-xl border border-sand bg-crema px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sand font-display text-sm text-tinta" aria-hidden>
            {iniciales(lineaDeClienta(clienta).titulo)}
          </span>
          <button type="button" onClick={() => setAbierto(true)} disabled={bloqueado || fila === "elegida_fija"} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13.5px] font-semibold text-tinta">{lineaDeClienta(clienta).titulo}</span>
            {lineaDeClienta(clienta).detalle && <span className="block truncate text-[11.5px] text-tinta/60">{lineaDeClienta(clienta).detalle}</span>}
          </button>
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

      {hojaVisible && (
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

function iniciales(texto: string) {
  return texto
    .split(/\s+/)
    .filter((p) => /^[\p{L}]/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

type Estado =
  | { tipo: "inicio" }
  | { tipo: "buscando" }
  | { tipo: "listo"; clientas: ClientaDelTicket[] }
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
          id: c.id,
          nombre: c.nombre,
          documentoTipo: tipoDocumentoDe(c.documento_tipo),
          documentoNumero: c.documento_numero,
          celular: c.telefono_whatsapp,
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
      subtitulo={alta ? "Queda en la libreta de clientas y esta venta, en su ficha." : "Opcional. Sus datos pasan al comprobante y la compra queda en su ficha."}
      variante="hoja"
      ancho="max-w-md"
      onClose={onClose}
      // Registrar no lleva token: cerrar y reabrir a mitad de camino podría enviarlo dos veces.
      bloqueado={guardando}
    >
      {alta ? (
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
              placeholder="Documento, celular o nombre"
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
              <div className="rounded-lg bg-hueso px-3 py-3 text-xs text-tinta/75">
                <p>No está en la libreta de clientas. Regístrala aquí y esta venta queda en su ficha; o sigue sin ella: el DNI y el nombre se ponen al cobrar, en el comprobante.</p>
                <button type="button" onClick={irARegistrar} className="btn-cayla btn-primario btn-chico mt-3">
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Registrar clienta
                </button>
              </div>
            )}
            {visible.tipo === "listo" && visible.clientas.length > 0 && (
              <ul className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-crema">
                {visible.clientas.map((c) => {
                  const l = lineaDeClienta(c);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => onElegir(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sand/40">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-tinta">{l.titulo}</span>
                          {l.detalle && <span className="block truncate text-[11.5px] text-tinta/60">{l.detalle}</span>}
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
      )}
    </Modal>
  );
}

const OPCIONES_TIPO = TIPOS_DOCUMENTO_CLIENTA.map((t) => ({ valor: t.valor, texto: t.etiqueta }));

/** Al cambiar de tipo se conserva lo escrito, en lo que el nuevo admite: un DNI solo dígitos y 8; carné y pasaporte, 12. */
/**
 * El alta corta del ticket (ADR-0288 D-9). La regla de qué alcanza es la de la ficha (`NuevaClientaModal`): un dato basta
 * —documento, nombre o celular— y el documento, si se escribe, con su formato (`problemaDocumento`, la misma regla que la
 * base). Firma quien atiende, con el combo del ticket: lo que se elija aquí vale también para la venta.
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
  const numero = normalizarNumeroDocumento(alta.documentoNumero);
  const problema = problemaDocumento(tipo, alta.documentoNumero);
  const hayDato = numero !== "" || alta.nombre.trim() !== "" || alta.celular.trim() !== "";
  // El número de un DNI lo dibuja `ConsultaDocumento` (con ese id); el de un carné o un pasaporte, este archivo.
  const idNumero = tipo === "dni" ? "documento-numero" : "clienta-documento-numero";

  // Guía de foco (CLAUDE.md «Guía de foco», ADR-0284): sale de las mismas dos reglas que frenan «Registrar» abajo.
  const guia = useGuiaCampos([
    {
      id: "identificacion",
      nombre: "Un dato de la clienta",
      requerido: true,
      hecho: hayDato && !problema,
      pendiente: problema ?? "Escribe al menos un dato: documento, nombre o celular.",
    },
    { id: "responsable", nombre: "Quién atiende", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién está atendiendo." },
  ]);

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
    if (!hayDato) return void avisar.error("Escribe al menos un dato de la clienta: documento, nombre o celular.", { enfocar: idNumero });
    if (problema) return void avisar.error(problema, { enfocar: idNumero });
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién está atendiendo.");

    onGuardando(true);
    const { id, error } = await registrarClienta(
      {
        documentoTipo: tipo,
        documentoNumero: numero,
        nombre: alta.nombre,
        telefonoWhatsapp: alta.celular,
        // Registrarse no es unirse al club ni dar permiso de WhatsApp (ADR-0288 D-4 y D-9).
        aceptaWhatsapp: false,
        cumpleDia: "",
        cumpleMes: "",
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
    avisar.exito("Clienta registrada", { detalle: `${lineaDeClienta(nueva).titulo}. Al cobrar, esta venta queda en su ficha.` });
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
      className="space-y-5"
    >
      <CampoGuiado id="identificacion" guia={guia} titulo="Identificación" ayuda="Basta con uno: documento, nombre o celular" className="space-y-3">
        <CampoSelect
          etiqueta="Tipo de documento"
          valor={tipo}
          onValor={(t) => onCambiar({ documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, alta.documentoNumero) })}
          opciones={OPCIONES_TIPO}
          deshabilitado={guardando}
        />
        {tipo === "dni" ? (
          // Solo el DNI consulta el padrón (ADR-0008, ADR-0288 D-2). Si no responde, el campo de nombre queda para escribirlo.
          <ConsultaDocumento
            tipo="dni"
            obligatorio={false}
            numero={alta.documentoNumero}
            onNumero={(v) => onCambiar({ documentoNumero: v })}
            nombre={alta.nombre}
            onNombre={(v) => onCambiar({ nombre: v })}
          />
        ) : (
          <>
            <CampoTexto
              id={idNumero}
              etiqueta={
                <>
                  Número de {tipo === "pasaporte" ? "pasaporte" : "carné"} <span className="normal-case tracking-normal">(opcional)</span>
                </>
              }
              mono
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={largoMaximoDocumento(tipo)}
              placeholder="6 a 12 letras o números"
              value={alta.documentoNumero}
              onChange={(e) => onCambiar({ documentoNumero: ajustarNumeroAlTipo(tipo, e.target.value) })}
              pie={numero && problema ? problema : "Sin guiones ni espacios. El padrón solo consulta DNI: el nombre va a mano."}
              tono={numero && problema ? "error" : "neutro"}
            />
            <CampoTexto etiqueta="Nombre de la clienta" value={alta.nombre} onChange={(e) => onCambiar({ nombre: e.target.value })} />
          </>
        )}
        <CampoTexto
          etiqueta="Celular"
          mono
          inputMode="tel"
          maxLength={15}
          placeholder="9 dígitos"
          value={alta.celular}
          onChange={(e) => onCambiar({ celular: e.target.value.replace(/[^\d+ ]/g, "") })}
        />
      </CampoGuiado>

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        {/* «Nadie de turno» y «no se pudo leer» ya los explica el combo con su recuadro; aquí, solo lo que falta elegir. */}
        {(responsable.estado === "falta" || responsable.estado === "cargando") && responsable.motivo && (
          <p className="mt-1.5 text-xs text-tinta/65">{responsable.motivo}</p>
        )}
      </CampoGuiado>

      <PieGuia guia={guia} listo="Todo listo para registrarla." />
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onVolver} disabled={guardando} className="btn-cayla btn-secundario">
          Volver a buscar
        </button>
        <button
          type="submit"
          disabled={guardando || !responsable.listo}
          title={responsable.motivo ?? guia.frase ?? undefined}
          className={`btn-cayla btn-primario ${guia.claseConfirmar}`}
        >
          {guardando ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
