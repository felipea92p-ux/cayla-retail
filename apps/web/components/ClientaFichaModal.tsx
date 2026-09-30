"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { CampoCelular, CamposCumpleanos, ID_ANIO_CLUB, ID_CELULAR_CLUB, ID_DIA_CLUB, SinTextoDelClub, TextoDelClub } from "@/components/clientas/club-piezas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { esVersionCambiada, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { estaActiva, type Clienta, type FichaClienta } from "@/lib/clientas-reglas";
import { deducirTallas, estadoFrecuente } from "@/lib/clienta-actividad-reglas";
import { ajustarNumeroAlTipo, documentoLegible, problemaDocumento } from "@/lib/documento-clienta-reglas";
import { ajustarCelular, celularValido, enlaceQrClub, estadoClub, mensajePersonal, textoVigente, type TextoClub } from "@/lib/club-reglas";
import { NIVEL_QR } from "@/lib/qr";
import { QRCodeSVG } from "qrcode.react";
import { cambiaDeCelular, cumpleLegible, estadoCumple, faltaParaSerSocia } from "@/lib/club-clientas-reglas";
import { registrarBajaWhatsapp, registrarMensajePublicidad, textosClub, unirseAlClub } from "@/lib/club-acciones";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  archivarClienta,
  buscarClienta,
  cargarFichaClienta,
  editarClienta,
  reactivarClienta,
  unirClientas,
  type DatosEdicion,
} from "@/lib/clientas-acciones";
// Tanda 1f (ADR-0288 «Actualización 2026-09-30 (f)»): su sede y frecuente con compra neta, las preferencias y la historia del
// permiso. Viven en piezas aparte; aquí solo se enganchan.
import { frecuenteDeLaFicha, suSedeDeLaFicha } from "@/lib/clientas-lista-reglas";
import { PreferenciasClienta } from "@/components/clientas/PreferenciasClienta";
import { HistoriaPermisos } from "@/components/clientas/HistoriaPermisos";

/** Lo que muestra la hoja: la ficha, o una de sus acciones (cada una responde adentro del mismo panel, ADR-0136). Las del
 *  club (ADR-0288 tanda 1b): «Unirse al club» (`club`), su QR (`qr`), «Llegó su mensaje» (`mensaje`) y «Registrar su
 *  BAJA» (`baja`). */
type Modo = "ver" | "editar" | "archivar" | "unir" | "club" | "qr" | "mensaje" | "baja";

/** Lo que se llena en «Unirse al club»: el celular es obligatorio (CL-1); el cumpleaños, día y mes con año opcional (CL-3);
 *  y la casilla de que se le leyó el texto y dijo que sí. */
type DatosClub = { celular: string; dia: string; mes: string; anio: string; leido: boolean };

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });
function fecha(iso: string): string {
  return FORMATO_FECHA.format(new Date(iso));
}
function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}
const numeroOVacio = (t: string) => (t.trim() === "" ? null : Number(t));

function datosDeEdicion(c: Clienta): DatosEdicion {
  return {
    documentoTipo: c.documentoTipo,
    documentoNumero: c.documentoNumero ?? "",
    nombre: c.nombre ?? "",
    telefonoWhatsapp: c.telefonoWhatsapp ?? "",
    cumpleDia: c.cumpleDia?.toString() ?? "",
    cumpleMes: c.cumpleMes?.toString() ?? "",
    cumpleAnio: c.cumpleAnio?.toString() ?? "",
    tallas: c.tallas,
  };
}

/**
 * Los campos de la guía de foco (CLAUDE.md «Guía de foco», ADR-0284) de lo que la hoja muestra ahora. Salen de las mismas
 * reglas que validan cada acción abajo (y que la base vuelve a exigir): no agregan ninguna.
 *   · editar: el documento, si se escribe, completo (D-2); a una socia no se le puede borrar el celular, el documento ni el
 *     nombre (`socia_sin_celular`, `socia_sin_documento`, CL-1); el año del cumpleaños, si se escribe, completo.
 *   · archivar: el motivo. · unir: la otra ficha. · club: el celular (CL-1); el cumpleaños, sugerido; que se le leyó el
 *     texto y dijo que sí. · mensaje: el número desde el que escribió. · En todas, quién lo hace.
 */
function camposDeLaGuia(
  modo: Modo,
  c: Clienta | null,
  estado: { edicion: DatosEdicion | null; motivoArchivo: string; anonimizar: boolean; aFusionar: Clienta | null; club: DatosClub; numeroMensaje: string },
  responsableListo: boolean,
  anioActual: number,
): CampoDeGuia[] {
  if (!c) return [];
  const quien: CampoDeGuia = { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién lo hace." };
  const cumple = (dia: string, mes: string, anio: string, sugerido: boolean): CampoDeGuia => {
    const { completo, problema } = estadoCumple(dia, mes, anio, anioActual);
    return {
      id: "cumple",
      nombre: "Cumpleaños",
      requerido: problema !== null,
      sugerido,
      hecho: completo,
      pendiente: problema ?? "Sin él no hay beneficio de cumpleaños.",
    };
  };
  switch (modo) {
    case "editar": {
      const e = estado.edicion;
      if (!e) return [];
      const problema = problemaDocumento(e.documentoTipo, e.documentoNumero);
      const socia = c.clubDesde !== null;
      return [
        {
          id: "documento",
          nombre: problema ? "Documento completo" : "Documento",
          requerido: problema !== null || socia,
          hecho: e.documentoNumero !== "" && problema === null,
          pendiente: problema ?? "Es socia del club: su documento no se puede dejar vacío.",
        },
        { id: "nombre", nombre: "Nombre", requerido: socia, hecho: e.nombre.trim() !== "", pendiente: "Es socia del club: su nombre no se puede dejar vacío." },
        {
          id: "celular",
          nombre: "Celular",
          requerido: c.clubDesde !== null,
          hecho: e.telefonoWhatsapp.trim() !== "",
          pendiente: "Es socia del club: su celular no se puede dejar vacío.",
        },
        cumple(e.cumpleDia, e.cumpleMes, e.cumpleAnio, false),
        quien,
      ];
    }
    case "archivar":
      return [
        { id: "motivo", nombre: "Motivo", requerido: true, hecho: estado.motivoArchivo.trim() !== "", pendiente: "Escribe por qué se archiva." },
        { id: "anonimizar", nombre: "Anonimizar", requerido: false, hecho: estado.anonimizar, pendiente: "" },
        quien,
      ];
    case "unir":
      return [{ id: "otra", nombre: "La otra ficha", requerido: true, hecho: estado.aFusionar !== null, pendiente: "Busca y elige la otra ficha de esta clienta." }, quien];
    case "club":
      return [
        {
          id: "celular",
          nombre: "Celular",
          requerido: true,
          hecho: celularValido(estado.club.celular),
          pendiente: "Su celular: 9 dígitos que empiezan en 9 (sin él no puede ser socia).",
        },
        cumple(estado.club.dia, estado.club.mes, estado.club.anio, true),
        { id: "leido", nombre: "Leerle el texto", requerido: true, hecho: estado.club.leido, pendiente: "Léele el texto y marca que dijo que sí." },
        quien,
      ];
    case "mensaje":
      return [
        {
          id: "numero",
          nombre: "Número que escribió",
          requerido: true,
          hecho: celularValido(estado.numeroMensaje),
          pendiente: "El número desde el que le escribió a la tienda.",
        },
        quien,
      ];
    case "baja":
      return [quien];
    case "ver":
    case "qr":
      return [];
  }
}

/**
 * La ficha completa de una clienta (paso 2 del acta, `docs/datos/DECISIONES-2026-09-26-clientas.md`
 * sección H): ver su actividad, editar con candado optimista (ADR-0193 reusado), archivar/
 * anonimizar (Ley 29733, nunca `delete`) y unir con otra ficha (D-99). UN solo `<Modal
 * variante="hoja">` que cambia de contenido por `modo` — ADR-0136 no anida modales, cada acción
 * responde adentro del mismo panel.
 *
 * ADR-0288 tanda 1b: la ficha dice dónde está frente al club (`estadoClub`) y trae sus tres acciones. El permiso de
 * publicidad NUNCA se marca a mano: «Llegó su mensaje» registra que ella escribió primero, y la base solo lo acepta así.
 */
export function ClientaFichaModal({
  id,
  onClose,
  onCambiada,
  whatsappPorTienda = {},
}: {
  id: string;
  onClose: () => void;
  onCambiada: () => void;
  /** El WhatsApp de cada tienda (id → número): su QR abre el chat de la tienda activa. Sin número, no hay QR. */
  whatsappPorTienda?: Record<string, string | null>;
}) {
  const [ficha, setFicha] = useState<FichaClienta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<Modo>("ver");
  const [edicion, setEdicion] = useState<DatosEdicion | null>(null);
  const [motivoArchivo, setMotivoArchivo] = useState("");
  const [anonimizar, setAnonimizar] = useState(false);
  const [terminoUnir, setTerminoUnir] = useState("");
  const [resultadosUnir, setResultadosUnir] = useState<Clienta[] | null>(null);
  const [aFusionar, setAFusionar] = useState<Clienta | null>(null);
  const [club, setClub] = useState<DatosClub>({ celular: "", dia: "", mes: "", anio: "", leido: false });
  const [numeroMensaje, setNumeroMensaje] = useState("");
  const [textos, setTextos] = useState<TextoClub[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();
  const anioActual = new Date().getFullYear();

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar / cambiar id
  }, [id]);

  // El texto `club` vigente (lectura `fn_`, sin loader): sin él no se ofrece «Unirse al club», como en Cobrar. Se vuelve a
  // leer si la base avisa que cambió mientras se le leía (`club_texto_cambio`).
  const [lecturaTextos, setLecturaTextos] = useState(0);
  useEffect(() => {
    let vigente = true;
    void textosClub().then(({ textos }) => {
      if (vigente) setTextos(textos);
    });
    return () => {
      vigente = false;
    };
  }, [lecturaTextos]);

  const guia = useGuiaCampos(
    camposDeLaGuia(modo, ficha?.clienta ?? null, { edicion, motivoArchivo, anonimizar, aFusionar, club, numeroMensaje }, responsable.listo, anioActual),
  );

  async function cargar() {
    setCargando(true);
    const { ficha, error } = await cargarFichaClienta(id);
    setCargando(false);
    if (error || !ficha) {
      avisar.error(traducirError(error, "abrir la ficha de la clienta"));
      onClose();
      return;
    }
    setFicha(ficha);
    setModo("ver");
  }

  if (cargando || !ficha) {
    return (
      <Modal titulo="Clienta" subtitulo="Cargando…" onClose={onClose} variante="hoja">
        <p className="text-sm text-tinta/65">Un momento…</p>
      </Modal>
    );
  }

  const c = ficha.clienta;
  const activa = estaActiva(c);
  const tallas = deducirTallas(ficha.compras);
  const frecuente = frecuenteDeLaFicha(ficha.resumenCompras ?? null, estadoFrecuente(ficha.compras, new Date()));
  const suSede = suSedeDeLaFicha(ficha.resumenCompras ?? null);
  // Dentro de la ficha el documento se ve completo, con su tipo («DNI 71234482», «CE 001234567»): quien la abre ya la
  // buscó a propósito. Lo que se enmascara es el mostrador del Punto de venta.
  const documento = documentoLegible(c.documentoTipo, c.documentoNumero, false);
  const enClub = estadoClub(c);
  const textoClub = textos ? textoVigente(textos, "club") : null;
  // CL-1: socia = documento + nombre + celular. El celular se pide al unirla; documento y nombre, antes, con «Editar».
  const faltaParaElClub = faltaParaSerSocia(c);
  const cambiaCelular = celularValido(numeroMensaje) && cambiaDeCelular(c.telefonoWhatsapp, numeroMensaje);
  // Su QR personalizado (ADR-0288, «Actualización 2026-09-30»): abre el WhatsApp de ESTA tienda con su mensaje y su código.
  const mensajeQr = textos ? textoVigente(textos, "mensaje_personal") : null;
  const numeroTienda = responsable.ubicacionId ? (whatsappPorTienda[responsable.ubicacionId] ?? null) : null;
  const enlaceQr = mensajeQr && c.codigoClub ? enlaceQrClub(numeroTienda, mensajePersonal(mensajeQr.texto, c.codigoClub)) : null;

  /** Lo común a toda acción que guarda: responsable, el aviso de la base y volver a leer la ficha. */
  async function guardarAccion(hacer: () => Promise<{ error: ErrorEscritura }>, que: string, listo: () => void, despues?: Modo) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await hacer();
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      if (esVersionCambiada(error)) {
        avisar.error(traducirError(error, que), { accion: { texto: "Recargar", onClick: () => void cargar() } });
        return;
      }
      avisar.error(traducirError(error, que));
      return;
    }
    listo();
    onCambiada();
    await cargar();
    if (despues) setModo(despues);
  }

  async function onEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicion) return;
    // El documento es opcional, pero si se escribe tiene que estar completo: la base rechaza uno a medias (ADR-0288 D-2).
    const problema = problemaDocumento(edicion.documentoTipo, edicion.documentoNumero);
    if (problema) {
      avisar.error(problema, { enfocar: ID_NUMERO_DOCUMENTO });
      return;
    }
    if (c.clubDesde !== null && edicion.telefonoWhatsapp.trim() === "") {
      avisar.error("Es socia del club: su celular no se puede dejar vacío.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    if (c.clubDesde !== null && (edicion.documentoNumero.trim() === "" || edicion.nombre.trim() === "")) {
      avisar.error("Es socia del club: su documento y su nombre no se pueden dejar vacíos.", edicion.documentoNumero.trim() === "" ? { enfocar: ID_NUMERO_DOCUMENTO } : undefined);
      return;
    }
    const cumpleEditado = estadoCumple(edicion.cumpleDia, edicion.cumpleMes, edicion.cumpleAnio, anioActual);
    if (cumpleEditado.problema) {
      avisar.error(cumpleEditado.problema, { enfocar: edicion.cumpleDia === "" ? ID_DIA_CLUB : ID_ANIO_CLUB });
      return;
    }
    const firma = responsable.firma();
    await guardarAccion(() => editarClienta(id, edicion, c.version, firma), "editar la ficha", () => avisar.exito("Ficha actualizada"));
  }

  async function onArchivar(anonimizando: boolean) {
    if (motivoArchivo.trim() === "") {
      avisar.error("Escribe un motivo antes de archivar a esta clienta.");
      return;
    }
    const firma = responsable.firma();
    await guardarAccion(
      () => archivarClienta(id, motivoArchivo, anonimizando, c.version, firma),
      anonimizando ? "anonimizar la ficha" : "archivar la ficha",
      () => avisar.exito(anonimizando ? "Ficha anonimizada" : "Clienta archivada"),
    );
  }

  async function onReactivar() {
    const firma = responsable.firma();
    await guardarAccion(() => reactivarClienta(id, c.version, firma), "reactivar la ficha", () => avisar.exito("Clienta reactivada"));
  }

  async function onBuscarParaUnir(e: React.FormEvent) {
    e.preventDefault();
    if (terminoUnir.trim() === "") {
      setResultadosUnir(null);
      return;
    }
    const { clientas, error } = await buscarClienta(terminoUnir);
    if (error) {
      avisar.error(traducirError(error, "buscar la otra ficha"));
      return;
    }
    setResultadosUnir(clientas.filter((otra) => otra.id !== id));
  }

  async function onUnir() {
    if (!aFusionar) return;
    const firma = responsable.firma();
    await guardarAccion(
      () => unirClientas(id, aFusionar.id, c.version, aFusionar.version, firma),
      "unir las dos fichas",
      () => avisar.exito("Fichas unidas", { detalle: "Sus ventas, cambios y apartados ahora están en esta ficha." }),
    );
  }

  // ---- El club (ADR-0288 tanda 1b) ----

  async function onUnirse(e: React.FormEvent) {
    e.preventDefault();
    if (!celularValido(club.celular)) {
      avisar.error("Su celular tiene 9 dígitos y empieza en 9: sin él no puede ser socia.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    const cumpleDelClub = estadoCumple(club.dia, club.mes, club.anio, anioActual);
    if (cumpleDelClub.problema) {
      avisar.error(cumpleDelClub.problema, { enfocar: club.dia === "" ? ID_DIA_CLUB : ID_ANIO_CLUB });
      return;
    }
    if (!club.leido) {
      avisar.error("Léele el texto del club y marca que dijo que sí antes de unirla.");
      return;
    }
    const firma = responsable.firma();
    let codigo: string | null = null;
    await guardarAccion(
      async () => {
        const r = await unirseAlClub(
          {
            clientaId: id,
            celular: club.celular,
            cumpleDia: numeroOVacio(club.dia),
            cumpleMes: numeroOVacio(club.mes),
            cumpleAnio: numeroOVacio(club.anio),
            medio: "ficha",
            ubicacionId: responsable.ubicacionId,
            // La versión del texto que se le leyó: si cambió en el camino, la base rechaza y aquí se relee el nuevo.
            textoVersion: textoClub?.version ?? null,
          },
          firma,
        );
        // El texto cambió mientras se le leía: se trae el nuevo y hay que volver a leérselo.
        if (r.error?.hint === "club_texto_cambio") {
          setLecturaTextos((n) => n + 1);
          setClub((d) => ({ ...d, leido: false }));
        }
        codigo = r.codigoClub;
        return r;
      },
      "unirla al club",
      () => avisar.exito("Ya es socia del club", { detalle: codigo ? `Su código: ${codigo}` : undefined }),
      // Como en caja: al unirla aparece su QR, por si quiere pedir la publicidad ahora (ella decide: ahora, en casa o nunca).
      "qr",
    );
  }

  async function onMensaje(e: React.FormEvent) {
    e.preventDefault();
    if (!celularValido(numeroMensaje)) {
      avisar.error("El número tiene 9 dígitos y empieza en 9.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    const firma = responsable.firma();
    const numero = numeroMensaje;
    const cambia = cambiaCelular;
    await guardarAccion(
      () => registrarMensajePublicidad(id, numero, responsable.ubicacionId, firma),
      "registrar su mensaje",
      () => avisar.exito("Ya recibe novedades por WhatsApp", { detalle: cambia ? `Su celular ahora es ${numero}.` : undefined }),
    );
  }

  async function onBaja() {
    if (!c.telefonoWhatsapp) return;
    const firma = responsable.firma();
    const celular = c.telefonoWhatsapp;
    let fichas = 0;
    await guardarAccion(
      async () => {
        const r = await registrarBajaWhatsapp(celular, responsable.ubicacionId, firma);
        fichas = r.fichas;
        return r;
      },
      "registrar su BAJA",
      () =>
        avisar.exito("BAJA registrada", {
          detalle: fichas > 1 ? `Sin novedades por WhatsApp desde hoy, en las ${fichas} fichas con ese celular.` : "Sin novedades por WhatsApp desde hoy. Sigue siendo socia.",
        }),
    );
  }

  const volverAVer = (
    <Boton type="button" onClick={() => setModo("ver")}>
      Cancelar
    </Boton>
  );

  return (
    <Modal
      titulo={c.nombre ?? documento ?? "Sin nombre"}
      subtitulo={
        !activa
          ? c.anonimizada
            ? "Ficha anonimizada — sin datos personales (Ley 29733)"
            : c.fusionadaEnId
              ? "Esta ficha se unió a otra"
              : `Archivada: ${c.motivoArchivo}`
          : [documento, c.telefonoWhatsapp, c.codigoClub].filter(Boolean).join(" · ") || "Sin documento ni celular"
      }
      onClose={onClose}
      variante="hoja"
      ancho="max-w-2xl"
    >
      {() => (
        <div className="space-y-6">
          {modo === "ver" && (
            <>
              {/* Como el spike del club (docs/maquetas/club-clientas-spike-2026-09/, `modalFicha`): los datos, el estado en
                  insignias y, debajo, la tarjeta del club con lo que se puede registrar. Sin la historia del permiso: la
                  base no expone todavía una lectura de `club_permisos` (tanda 1b). */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Dato etiqueta="Cumpleaños" valor={cumpleLegible(c.cumpleDia, c.cumpleMes, c.cumpleAnio)} />
                <Dato etiqueta="Club" valor={c.clubDesde ? `Desde ${fecha(c.clubDesde)}` : "No es socia"} />
                <Dato etiqueta="Frecuente" valor={frecuente.esFrecuente ? "Sí" : `Falta ${frecuente.faltanParaFrecuente}`} tono={frecuente.esFrecuente ? "verde" : undefined} />
                <Dato etiqueta="Su sede" valor={suSede.valor} detalle={suSede.detalle} />
              </div>

              {!c.anonimizada && (
                <div className="flex flex-wrap gap-1.5">
                  {enClub === "no_socia" ? (
                    <Chip tono="pizarra">Identificada</Chip>
                  ) : (
                    <Chip tono={frecuente.esFrecuente ? "verde" : "neutro"}>{frecuente.esFrecuente ? "Socia frecuente" : "Socia"}</Chip>
                  )}
                  {enClub === "socia_con_publicidad" && <Chip tono="verde">Publicidad</Chip>}
                  {enClub === "socia" &&
                    (activa ? (
                      // Tocable, como en el spike: muestra su QR (solo ella puede pedir la publicidad, escribiéndole a la tienda).
                      <button type="button" onClick={() => setModo("qr")} title="Mostrar su QR: solo ella puede pedir la publicidad, escribiéndole a la tienda desde él." className="rounded-full transition-opacity hover:opacity-75">
                        <Chip tono="neutro">Sin publicidad · QR</Chip>
                      </button>
                    ) : (
                      <Chip tono="neutro">Sin publicidad</Chip>
                    ))}
                </div>
              )}

              {!c.anonimizada &&
                (enClub === "no_socia" ? (
                  <div className="rounded-xl bg-hueso px-4 py-3 text-sm text-tinta/80">
                    <b className="font-semibold text-tinta">Tiene ficha pero no es del club.</b>{" "}
                    {faltaParaElClub ??
                      (textos !== null && !textoClub
                        ? "El club todavía no tiene su texto vigente para leerle: avisa al líder."
                        : c.telefonoWhatsapp
                          ? "Se la invita en caja, o desde aquí."
                          : "Sin celular no puede ser socia: se lo pides al unirla.")}
                  </div>
                ) : (
                  <div className="card-cayla space-y-3 p-4">
                    <p className="label-cayla text-[11px] text-tinta/65">Permisos · dos cosas distintas</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="label-cayla w-32 shrink-0 text-[10.5px] text-tinta/55">Club</span>
                      <Chip tono="verde">Socia</Chip>
                      <span className="text-xs text-tinta/60">
                        desde {fecha(c.clubDesde!)}
                        {c.codigoClub ? ` · ${c.codigoClub}` : ""} · beneficios y avisos informativos (su apartado, la talla que pidió)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="label-cayla w-32 shrink-0 text-[10.5px] text-tinta/55">Publicidad</span>
                      {c.publicidadDesde ? (
                        <>
                          <Chip tono="verde">Con publicidad</Chip>
                          <span className="text-xs text-tinta/60">desde {fecha(c.publicidadDesde)} · ella escribió a la tienda</span>
                        </>
                      ) : (
                        <>
                          <Chip tono="neutro">Sin publicidad</Chip>
                          <span className="text-xs text-tinta/60">aún no la pidió</span>
                        </>
                      )}
                    </div>
                    {activa && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                        {c.publicidadDesde
                          ? c.telefonoWhatsapp && (
                              <Boton type="button" className="!py-2" onClick={() => setModo("baja")}>
                                Registrar su BAJA
                              </Boton>
                            )
                          : (
                              // Como el spike: «Llegó su mensaje» vive dentro de su QR, donde la asesora ve lo que ella envía.
                              <Boton type="button" className="!py-2" onClick={() => setModo("qr")}>
                                Mostrar su QR
                              </Boton>
                            )}
                      </div>
                    )}
                    <p className="text-xs text-tinta/55">
                      La publicidad solo la puede dar ella, escribiéndole a la tienda desde su QR: aquí no se marca. «Registrar su BAJA» es para
                      cuando te escribe BAJA: efecto inmediato, vale para las 3 tiendas.
                    </p>
                  </div>
                ))}

              {tallas.length > 0 && (
                <div className="card-cayla p-4">
                  <p className="label-cayla text-[11px] text-tinta/65">Talla deducida de lo que compra</p>
                  <p className="mt-1 text-sm text-tinta">{tallas.map((t) => `${t.categoria}: ${t.talla}`).join(" · ")}</p>
                </div>
              )}

              {enClub !== "no_socia" && !c.anonimizada && (
                <PreferenciasClienta
                  clientaId={c.id}
                  version={c.version}
                  guardadas={c.preferencias ?? {}}
                  soloLectura={!activa}
                  onGuardada={(version, preferencias) => setFicha((f) => (f ? { ...f, clienta: { ...f.clienta, version, preferencias } } : f))}
                />
              )}
              <HistoriaPermisos clientaId={c.id} clave={c.version} />

              <SeccionActividad titulo="Compras" vacio="Todavía no tiene compras registradas.">
                {ficha.compras.map((compra) => (
                  <FilaActividad
                    key={compra.ventaId}
                    fecha={fecha(compra.fecha)}
                    texto={compra.ubicacion}
                    detalle={compra.items.map((i) => `${i.cantidad}× ${i.categoria ?? "prenda"}${i.talla ? ` (${i.talla})` : ""}`).join(", ")}
                    monto={soles(compra.total)}
                  />
                ))}
              </SeccionActividad>

              <SeccionActividad titulo="Cambios" vacio="Sin cambios de prenda.">
                {ficha.cambios.map((cambio) => (
                  <FilaActividad key={cambio.id} fecha={fecha(cambio.fecha)} texto={cambio.ubicacion} detalle={cambio.motivo ?? "—"} />
                ))}
              </SeccionActividad>

              <SeccionActividad titulo="Devoluciones" vacio="Sin devoluciones.">
                {ficha.devoluciones.map((d) => (
                  <FilaActividad key={d.id} fecha={fecha(d.fecha)} texto={d.estado} detalle={d.motivo ?? "—"} />
                ))}
              </SeccionActividad>

              <SeccionActividad titulo="Apartados" vacio="Sin apartados.">
                {ficha.separaciones.map((s) => (
                  <FilaActividad key={s.id} fecha={fecha(s.fecha)} texto={s.codigo} detalle={s.estado} monto={soles(s.total)} />
                ))}
              </SeccionActividad>

              <div className="flex flex-wrap justify-end gap-3 border-t border-tinta/10 pt-4">
                {activa ? (
                  <>
                    <Boton
                      type="button"
                      onClick={() => {
                        setMotivoArchivo("");
                        setAnonimizar(false);
                        setModo("archivar");
                      }}
                    >
                      Archivar
                    </Boton>
                    <Boton
                      type="button"
                      onClick={() => {
                        setTerminoUnir("");
                        setResultadosUnir(null);
                        setAFusionar(null);
                        setModo("unir");
                      }}
                    >
                      Unir con otra ficha
                    </Boton>
                    {enClub === "no_socia" && !faltaParaElClub && textoClub && (
                      <Boton
                        type="button"
                        onClick={() => {
                          setClub({
                            celular: ajustarCelular(c.telefonoWhatsapp ?? ""),
                            dia: c.cumpleDia?.toString() ?? "",
                            mes: c.cumpleMes?.toString() ?? "",
                            anio: c.cumpleAnio?.toString() ?? "",
                            leido: false,
                          });
                          setModo("club");
                        }}
                      >
                        Unirse al club
                      </Boton>
                    )}
                    <Boton
                      type="button"
                      peso="primario"
                      onClick={() => {
                        setEdicion(datosDeEdicion(c));
                        setModo("editar");
                      }}
                    >
                      Editar
                    </Boton>
                  </>
                ) : (
                  !c.anonimizada &&
                  !c.fusionadaEnId && (
                    <>
                      <ComboResponsable control={responsable} deshabilitado={guardando} compacto />
                      <Boton type="button" peso="primario" cargando={guardando} onClick={onReactivar} disabled={!responsable.listo}>
                        Reactivar
                      </Boton>
                    </>
                  )
                )}
              </div>
            </>
          )}

          {modo === "editar" && edicion && (
            <form onSubmit={onEditar} className="space-y-4">
              <CampoGuiado id="documento" guia={guia} className="grid gap-3 sm:grid-cols-2">
                <CampoTipoDocumento
                  tipo={edicion.documentoTipo}
                  onTipo={(t) => setEdicion((d) => d && { ...d, documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, d.documentoNumero) })}
                />
                <CampoNumeroDocumento
                  tipo={edicion.documentoTipo}
                  numero={edicion.documentoNumero}
                  onNumero={(v) => setEdicion((d) => d && { ...d, documentoNumero: v })}
                />
              </CampoGuiado>
              <CampoGuiado id="nombre" guia={guia}>
                <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre")} value={edicion.nombre} onChange={(e) => setEdicion((d) => d && { ...d, nombre: e.target.value })} />
              </CampoGuiado>
              <CampoGuiado id="celular" guia={guia}>
                <CampoCelular
                  etiqueta={guia.etiqueta("celular", "Celular (WhatsApp)")}
                  obligatorio={c.clubDesde !== null}
                  valor={edicion.telefonoWhatsapp}
                  onValor={(v) => setEdicion((d) => d && { ...d, telefonoWhatsapp: v })}
                />
              </CampoGuiado>
              <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Día y mes; el año, solo si lo quiere decir">
                <CamposCumpleanos
                  dia={edicion.cumpleDia}
                  mes={edicion.cumpleMes}
                  anio={edicion.cumpleAnio}
                  onDia={(v) => setEdicion((d) => d && { ...d, cumpleDia: v })}
                  onMes={(v) => setEdicion((d) => d && { ...d, cumpleMes: v })}
                  onAnio={(v) => setEdicion((d) => d && { ...d, cumpleAnio: v })}
                  anioActual={anioActual}
                />
              </CampoGuiado>
              <p className="text-xs text-tinta/65">El club y las novedades por WhatsApp no se cambian aquí: se ven y se registran en la ficha.</p>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para guardar." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Guardar
                </Boton>
              </div>
            </form>
          )}

          {modo === "archivar" && (
            <div className="space-y-4">
              <CampoGuiado id="motivo" guia={guia}>
                <CampoTexto etiqueta={guia.etiqueta("motivo", "Motivo")} value={motivoArchivo} onChange={(e) => setMotivoArchivo(e.target.value)} placeholder="Ya no compra, cerró su número…" />
              </CampoGuiado>
              <CampoGuiado id="anonimizar" guia={guia}>
                <Interruptor
                  activo={anonimizar}
                  onActivo={setAnonimizar}
                  etiqueta={guia.etiqueta("anonimizar", "Anonimizar sus datos personales (Ley 29733)")}
                  pie="Borra documento, celular, cumpleaños, tallas y su lugar en el club (sale del club y de las novedades). Sus compras y apartados NO se tocan — solo desaparece quién es. No se puede deshacer."
                />
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo={anonimizar ? "Todo listo para anonimizar." : "Todo listo para archivar."} />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={() => onArchivar(anonimizar)}
                  disabled={!responsable.listo}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  {anonimizar ? "Anonimizar" : "Archivar"}
                </Boton>
              </div>
            </div>
          )}

          {modo === "unir" && (
            <div className="space-y-4">
              <p className="text-sm text-tinta/70">
                Busca la otra ficha de esta misma clienta (la que se creó con su celular, por ejemplo). Sus ventas, cambios y apartados
                pasan a <strong>esta</strong> ficha; la otra queda anonimizada y archivada.
              </p>
              <CampoGuiado id="otra" guia={guia} titulo="La otra ficha" className="space-y-3">
                <form onSubmit={onBuscarParaUnir} className="flex items-end gap-3">
                  <div className="max-w-sm flex-1">
                    <CampoTexto etiqueta="Buscar" value={terminoUnir} onChange={(e) => setTerminoUnir(e.target.value)} placeholder="Documento, WhatsApp o nombre…" /* sugerir-fijo: qué se puede buscar en la libreta; no depende de nada elegido antes */ />
                  </div>
                  <Boton type="submit">Buscar</Boton>
                </form>
                {resultadosUnir !== null && (
                  <div className="space-y-2">
                    {resultadosUnir.length === 0 ? (
                      <p className="text-sm text-tinta/65">Sin coincidencias.</p>
                    ) : (
                      resultadosUnir.map((otra) => (
                        <button
                          key={otra.id}
                          type="button"
                          onClick={() => setAFusionar(otra)}
                          className={`card-cayla flex w-full items-center justify-between gap-4 p-3 text-left ${aFusionar?.id === otra.id ? "ring-2 ring-rojo" : ""}`}
                        >
                          <span className="text-sm text-tinta">{otra.nombre ?? "Sin nombre"}</span>
                          <span className="text-xs text-tinta/65">
                            {[documentoLegible(otra.documentoTipo, otra.documentoNumero, false), otra.telefonoWhatsapp].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para unir." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={onUnir}
                  disabled={!aFusionar || !responsable.listo}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Unir a esta ficha
                </Boton>
              </div>
            </div>
          )}

          {modo === "club" && (
            <form onSubmit={onUnirse} className="space-y-5">
              <p className="text-sm text-tinta/75">
                Su «sí» de palabra al club: beneficios y avisos de sus apartados y de las tallas que pida. Las novedades por WhatsApp no
                se marcan aquí: le llegan solo si ella le escribe a la tienda.
              </p>
              <CampoGuiado id="celular" guia={guia}>
                <CampoCelular etiqueta={guia.etiqueta("celular", "Celular (WhatsApp)")} obligatorio valor={club.celular} onValor={(v) => setClub((d) => ({ ...d, celular: v }))} />
              </CampoGuiado>
              <CampoGuiado id="cumple" guia={guia} titulo="Cumpleaños" ayuda="Día y mes; el año, solo si lo quiere decir">
                <CamposCumpleanos
                  dia={club.dia}
                  mes={club.mes}
                  anio={club.anio}
                  onDia={(v) => setClub((d) => ({ ...d, dia: v }))}
                  onMes={(v) => setClub((d) => ({ ...d, mes: v }))}
                  onAnio={(v) => setClub((d) => ({ ...d, anio: v }))}
                  anioActual={anioActual}
                />
              </CampoGuiado>
              {textoClub ? (
                <CampoGuiado id="leido" guia={guia} titulo="Texto del club que se le lee" ayuda={`versión ${textoClub.version}`}>
                  <TextoDelClub texto={textoClub} leido={club.leido} onLeido={(v) => setClub((d) => ({ ...d, leido: v }))} />
                </CampoGuiado>
              ) : (
                <SinTextoDelClub />
              )}
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo: léele el texto y registra su «sí»." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  disabled={!responsable.listo || !textoClub}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Dijo que sí: unirla
                </Boton>
              </div>
            </form>
          )}

          {modo === "qr" && (
            <div className="space-y-4">
              {enlaceQr ? (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-sand bg-crema p-5 sm:flex-row sm:gap-6">
                  <div className="shrink-0 rounded-xl bg-papel p-3 ring-1 ring-tinta/10">
                    <QRCodeSVG value={enlaceQr} size={176} level={NIVEL_QR} marginSize={2} role="img" aria-label={`Su QR del club, código ${c.codigoClub}`} />
                  </div>
                  <div className="min-w-0 space-y-2 text-center sm:text-left">
                    <p className="label-cayla text-[11px] text-taupe-profundo">Su QR · código {c.codigoClub}</p>
                    <p className="font-display text-xl leading-snug text-tinta">Pídele que lo escanee con la cámara de su celular.</p>
                    <p className="text-[13px] leading-snug text-tinta/70">
                      Se abre el WhatsApp de {responsable.sede} con su mensaje listo. Cuando ella lo envíe, toca «Llegó su mensaje».
                    </p>
                  </div>
                </div>
              ) : (
                <p className="nota-cayla">
                  {!numeroTienda ? (
                    <>
                      {responsable.sede} no tiene su número de WhatsApp cargado, y sin número no hay QR. El líder lo carga en{" "}
                      <Link href="/configuracion?tab=tiendas" className="btn-enlace">
                        Configuración ▸ Tiendas y caja
                      </Link>
                      .
                    </>
                  ) : (
                    "El club todavía no tiene su mensaje personal vigente: sin él no se puede armar su QR. Avisa al líder."
                  )}
                </p>
              )}
              <p className="text-xs leading-relaxed text-tinta/60">
                El mismo QR sale impreso en el ticket de sus compras: puede escribir desde casa. Sin QR no pasa nada: sigue siendo del club,
                solo que sin publicidad.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setNumeroMensaje(ajustarCelular(c.telefonoWhatsapp ?? ""));
                    setModo("mensaje");
                  }}
                  title="Te escribió por WhatsApp desde su QR: la prueba es el chat de la tienda."
                  className="text-xs text-tinta/70 underline underline-offset-2 hover:text-rojo"
                >
                  Llegó su mensaje
                </button>
                <Boton type="button" onClick={() => setModo("ver")}>
                  Listo, por ahora no
                </Boton>
              </div>
            </div>
          )}

          {modo === "mensaje" && (
            <form onSubmit={onMensaje} className="space-y-5">
              <p className="text-sm text-tinta/75">
                Solo si <strong>ella</strong> le escribió primero a la tienda por WhatsApp (desde el QR o por su cuenta): su mensaje en el
                chat de la tienda es la prueba de que quiere novedades. Búscalo antes de registrar.
              </p>
              <CampoGuiado id="numero" guia={guia} className="space-y-2">
                <CampoCelular etiqueta={guia.etiqueta("numero", "Número desde el que escribió")} obligatorio valor={numeroMensaje} onValor={setNumeroMensaje} />
                {cambiaCelular && (
                  <p className="nota-cayla">
                    Escribió desde otro número: al registrar, el <b>{numeroMensaje}</b> pasa a ser su celular
                    {c.telefonoWhatsapp ? <> (hoy es {c.telefonoWhatsapp})</> : null}.
                  </p>
                )}
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para registrar su permiso." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="submit"
                  peso="primario"
                  cargando={guardando}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Registrar su permiso
                </Boton>
              </div>
            </form>
          )}

          {modo === "baja" && (
            <div className="space-y-5">
              <p className="text-sm text-tinta/75">
                Escribió BAJA (o pidió que no le manden más novedades). Desde hoy no se le envían novedades, rebajas ni el saludo de
                cumpleaños por WhatsApp, en las 3 tiendas. <strong>Sigue siendo socia</strong>: los avisos de sus apartados y de sus tallas
                siguen.
              </p>
              <p className="text-xs text-tinta/65">Vale para toda ficha con el celular {c.telefonoWhatsapp}.</p>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para registrar la BAJA." />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={onBaja}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
                  className={guia.claseConfirmar}
                >
                  Registrar la BAJA
                </Boton>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Dato({ etiqueta, valor, tono, detalle }: { etiqueta: string; valor: string; tono?: "verde"; detalle?: string | null }) {
  return (
    <div>
      <p className="label-cayla text-[10px] text-tinta/50">{etiqueta}</p>
      <p className={`mt-0.5 text-sm font-medium ${tono === "verde" ? "text-verde" : "text-tinta"}`}>
        {valor}
        {detalle && <span className="text-xs font-normal text-tinta/55"> · {detalle}</span>}
      </p>
    </div>
  );
}

function SeccionActividad({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode }) {
  const hayContenido = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <p className="label-cayla text-[11px] text-tinta/65">{titulo}</p>
      <div className="mt-2 space-y-1.5">{hayContenido ? children : <p className="text-sm text-tinta/50">{vacio}</p>}</div>
    </div>
  );
}

function FilaActividad({ fecha, texto, detalle, monto }: { fecha: string; texto: string; detalle: string; monto?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-tinta/5 py-1.5 text-sm last:border-0">
      <div className="min-w-0">
        <span className="text-tinta/50">{fecha}</span> <span className="text-tinta">{texto}</span>
        <p className="truncate text-xs text-tinta/60">{detalle}</p>
      </div>
      {monto && <span className="shrink-0 font-medium text-tinta">{monto}</span>}
    </div>
  );
}
