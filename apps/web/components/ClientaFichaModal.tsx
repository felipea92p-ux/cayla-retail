"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Pestanas } from "@/components/ui/Pestanas";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { CampoCelular, CamposCumpleanos, ID_ANIO_CLUB, ID_CELULAR_CLUB, ID_DIA_CLUB } from "@/components/clientas/club-piezas";
// El nombre de una ficha con DNI sale del padrón y no se edita a mano (Felipe 2026-10-15, 20261015133000).
import { NombreDelPadron, usePadronDeFicha } from "@/components/clientas/NombreDelPadron";
import { AYUDA_NOMBRE_ESCRITO, nombreDeLaEdicion } from "@/lib/nombre-del-padron-reglas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { esVersionCambiada, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { estaActiva, type Clienta, type FichaClienta } from "@/lib/clientas-reglas";
import { deducirTallas, estadoFrecuente } from "@/lib/clienta-actividad-reglas";
import { ajustarNumeroAlTipo, contactoVisible, normalizarNumeroDocumento, problemaDocumento } from "@/lib/documento-clienta-reglas";
import { estadoClub } from "@/lib/club-reglas";
import { cajaDelProblemaCumple, cumpleCompleto, problemaCumple, type CumpleEscrito } from "@/lib/club-cumple-reglas";
import { avisoCambioDeCelular, faltaParaSerSocia } from "@/lib/club-clientas-reglas";
import { registrarBajaWhatsapp } from "@/lib/club-acciones";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { archivarClienta, cargarFichaClienta, editarClienta, reactivarClienta, type DatosEdicion } from "@/lib/clientas-acciones";
// El correo de contacto (Felipe 2026-10-15, 20261015123000) y lo que la ficha tiene en la tienda online (el aviso al archivar).
import { correoVisible, esRechazoDelCorreo, normalizarCorreo, problemaCorreo, rechazoVigente, type RechazoCorreo } from "@/lib/correo-clienta-reglas";
import { avisoAlArchivar, frenaAnonimizar, notaDelCorreoDeEntrada, pieDeAnonimizar } from "@/lib/clienta-tienda-online-reglas";
// «Restablecer acceso a la tienda web» (Felipe 2026-10-15, 20261015132000): su bloque y su hoja viven aparte; aquí solo se enganchan.
import { RestablecerAccesoWeb, TiendaOnlineDeLaFicha } from "@/components/clientas/TiendaOnlineDeLaFicha";
import { Aviso } from "@/components/ui/Aviso";
// Tanda 1f (ADR-0288 «Actualización 2026-09-30 (f)»): su sede y frecuente con compra neta, las preferencias y la historia del
// permiso. Viven en piezas aparte; aquí solo se enganchan.
import { frecuenteDeLaFicha, suSedeDeLaFicha } from "@/lib/clientas-lista-reglas";
import { PreferenciasClienta } from "@/components/clientas/PreferenciasClienta";
import { HistoriaPermisos } from "@/components/clientas/HistoriaPermisos";
import { PuntosDeLaFicha, usePuntosDeLaFicha } from "@/components/clientas/PuntosDeLaFicha";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
// Diseño B de la ficha (Felipe 2026-10-20): su perfil a la izquierda, tres cifras, y un historial en línea de tiempo.
import { CifraDeLaFicha, HistorialDelCliente, PerfilDelCliente, type DatosDelPerfil } from "@/components/clientas/FichaDelCliente";
import { lineaDeTiempo, totalComprado } from "@/lib/clienta-actividad-reglas";
import { estadoDeLaFila, suSedeLegible, ultimaCompraLegible } from "@/lib/clientas-lista-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { MESES_DEL_ANIO } from "@/lib/club-cumple-reglas";

/** Lo que muestra la hoja: la ficha, o una de sus acciones (cada una responde adentro del mismo panel, ADR-0136). Del club
 *  queda «Registrar su BAJA» (`baja`): desde la tanda 1g (ADR-0288, G-1, G-7) ella se une sola desde el cartel, así que la
 *  ficha ya no une al club, no muestra un QR personal ni registra «Llegó su mensaje». Tampoco une fichas (Felipe 2026-10-14:
 *  el documento y el correo son de una sola persona, así que no nacen fichas repetidas; `unir_clientas` se borró en
 *  20261015054000). */
type Modo = "ver" | "editar" | "archivar" | "baja" | "acceso-web";
/** Las pestañas de la ficha: lo del club (permisos y preferencias) por un lado y lo que hizo en las tiendas por otro. */
type Vista = "club" | "actividad";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });
function fecha(iso: string): string {
  return FORMATO_FECHA.format(new Date(iso));
}
function soles(n: number): string {
  return `S/\u00a0${n.toFixed(2)}`;
}
/** El cumpleaños de «Editar» como lo escriben las cajas (la ficha lo guarda en tres textos). */
const cumpleDeEdicion = (e: DatosEdicion): CumpleEscrito => ({ dia: e.cumpleDia, mes: e.cumpleMes, anio: e.cumpleAnio });

/** El id de la caja del correo: para llevarle el cursor cuando está mal o la base lo rechazó. */
const ID_CORREO = "ficha-cliente-correo";
/** El id de la caja del nombre escrito (carné, pasaporte o sin documento): para llevarle el cursor si le falta algo. */
const ID_NOMBRE_ESCRITO = "ficha-cliente-nombre";

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
    correo: c.correo ?? "",
  };
}

/**
 * Los campos de la guía de foco (CLAUDE.md «Guía de foco», ADR-0284) de lo que la hoja muestra ahora. Salen de las mismas
 * reglas que validan cada acción abajo (y que la base vuelve a exigir): no agregan ninguna.
 *   · editar: el documento, si se escribe, completo (D-2); a una socia no se le puede borrar el celular, el documento ni el
 *     nombre (`socia_sin_celular`, `socia_sin_documento`, CL-1); el correo, opcional, pero si se escribe bien escrito
 *     (`correo_invalido`) y no el de otra ficha (lo que dijo la base, `correo_de_otra_ficha`, mientras siga escrito el mismo); el
 *     año del cumpleaños, si se escribe, completo. El nombre (Felipe 2026-10-15, `nombreDeLaEdicion`): con DNI no se escribe —si el
 *     DNI cambió hace falta el nombre del padrón para el número nuevo (`nombre_sin_padron`)—; con carné o pasaporte, tal cual y sin
 *     números (`nombre_con_numeros`).
 *   · archivar: el motivo. · baja: solo quién lo hace. · En todas, quién lo hace.
 */
function camposDeLaGuia(
  modo: Modo,
  c: Clienta | null,
  estado: {
    edicion: DatosEdicion | null;
    motivoArchivo: string;
    anonimizar: boolean;
    problemaDelCorreo: string | null;
    nombre: ReturnType<typeof nombreDeLaEdicion> | null;
  },
  responsableListo: boolean,
  anioActual: number,
): CampoDeGuia[] {
  if (!c) return [];
  const quien: CampoDeGuia = { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién lo hace." };
  // La MISMA regla del cumpleaños que Cobrar (lib/club-cumple-reglas.ts): un día que el mes no tiene no pasa en ninguna.
  const cumple = (escrito: CumpleEscrito): CampoDeGuia => {
    const problema = problemaCumple(escrito, anioActual);
    return {
      id: "cumple",
      nombre: "Cumpleaños",
      requerido: problema !== null,
      sugerido: false,
      hecho: cumpleCompleto(escrito, anioActual),
      pendiente: problema ?? "Sin él no recibe su regalo de cumpleaños.",
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
          pendiente: problema ?? "Es miembro del club: su documento no se puede dejar vacío.",
        },
        {
          id: "nombre",
          nombre: estado.nombre?.origen === "padron" ? "Nombre del padrón" : "Nombre",
          requerido: socia || !(estado.nombre?.listo ?? true),
          hecho: (estado.nombre?.listo ?? false) && (estado.nombre?.nombre ?? "") !== "",
          pendiente: estado.nombre?.pendiente ?? "Es miembro del club: su nombre no se puede dejar vacío.",
        },
        {
          id: "celular",
          nombre: "Celular",
          requerido: c.clubDesde !== null,
          hecho: e.telefonoWhatsapp.trim() !== "",
          pendiente: "Es miembro del club: su celular no se puede dejar vacío.",
        },
        // Opcional: vacío no falta; mal escrito o de otra ficha, sí (la base lo rechazaría igual).
        {
          id: "correo",
          nombre: "Correo",
          requerido: estado.problemaDelCorreo !== null,
          hecho: e.correo.trim() !== "" && estado.problemaDelCorreo === null,
          pendiente: estado.problemaDelCorreo ?? "",
        },
        cumple(cumpleDeEdicion(e)),
        quien,
      ];
    }
    case "archivar":
      return [
        { id: "motivo", nombre: "Motivo", requerido: true, hecho: estado.motivoArchivo.trim() !== "", pendiente: "Escribe por qué se archiva." },
        { id: "anonimizar", nombre: "Anonimizar", requerido: false, hecho: estado.anonimizar, pendiente: "" },
        quien,
      ];
    case "baja":
      return [quien];
    case "ver":
    case "acceso-web": // su guía vive en RestablecerAccesoWeb (components/clientas/TiendaOnlineDeLaFicha.tsx)
      return [];
  }
}

/**
 * La ficha completa de una clienta (paso 2 del acta, `docs/datos/DECISIONES-2026-09-26-clientas.md`
 * sección H): ver su actividad, editar con candado optimista (ADR-0193 reusado) y archivar/
 * anonimizar (Ley 29733, nunca `delete`). «Unir con otra ficha» (D-99) se retiró el 2026-10-14: el documento y el correo
 * son de una sola persona. UN solo `<Modal variante="hoja">` que cambia de contenido por `modo` — ADR-0136 no anida
 * modales, cada acción responde adentro del mismo panel.
 *
 * ADR-0288: la ficha dice dónde está frente al club (`estadoClub`). Desde la tanda 1g (G-1, G-2, G-7) ella se une sola
 * escaneando el cartel y ahí decide si quiere publicidad (G-12): la ficha no une al club ni marca la publicidad. Lo único del
 * club que se registra aquí es su BAJA, cuando escribe BAJA a la tienda; la historia de permisos lo muestra.
 */
export function ClientaFichaModal({
  id,
  verCompleto = false,
  onClose,
  onCambiada,
}: {
  id: string;
  /** El DNI y el celular completos (Felipe 2026-10-13: solo el líder); los demás los ven a medias. La caja de edición los
   *  muestra completos: hace falta para corregirlos. */
  verCompleto?: boolean;
  onClose: () => void;
  onCambiada: () => void;
}) {
  const [ficha, setFicha] = useState<FichaClienta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<Modo>("ver");
  const [edicion, setEdicion] = useState<DatosEdicion | null>(null);
  const [motivoArchivo, setMotivoArchivo] = useState("");
  const [anonimizar, setAnonimizar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // El correo que la base rechazó al guardar (de otra ficha, o mal escrito): su frase va bajo la caja mientras siga escrito ese.
  const [rechazoCorreo, setRechazoCorreo] = useState<RechazoCorreo | null>(null);
  // Si ya salió de la caja del correo (o intentó guardar): recién ahí se dice que está mal escrito, no mientras lo tipea.
  const [salioDelCorreo, setSalioDelCorreo] = useState(false);
  // La pestaña de la ficha («ver»). `null` = la de siempre: «Club» si es miembro y «Actividad» si no.
  const [vista, setVista] = useState<Vista | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const responsable = useResponsable();
  const anioActual = new Date().getFullYear();
  // Lo que está mal del correo escrito: lo que dijo la base de ESE correo o, si no, su formato (la misma regla que la base).
  const problemaDelCorreo = edicion ? (rechazoVigente(rechazoCorreo, edicion.correo) ?? problemaCorreo(edicion.correo)) : null;

  // Cambiar de vista (ver → editar, Club → Actividad) acorta o alarga el contenido SIN cambiar de URL. `PaginaEstable`
  // (ADR-0185) lo toma por «un bloque que se acortó bajo el mouse» y reserva aire al fondo para no mover la vista: en
  // «Editar», tras bajar por la ficha, eso era un blanco enorme bajo el botón Guardar. Aquí es otra pantalla: se suelta la
  // reserva antes de pintar y la hoja empieza arriba, como una navegación.
  useLayoutEffect(() => {
    soltarPaginaEstable();
    const hoja = raiz.current?.closest<HTMLElement>('[role="dialog"]');
    if (hoja) hoja.scrollTop = 0;
  }, [modo, vista]);

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar / cambiar id
  }, [id]);

  // El nombre en «Editar» (Felipe 2026-10-15): con DNI no se escribe. Con el DNI de siempre se queda el que tenía y se ofrece
  // «Actualizar desde el padrón»; si el DNI cambió (o pasó a DNI), el padrón se consulta solo para el número nuevo.
  const deAntes = ficha?.clienta ?? null;
  const numeroEditado = edicion ? normalizarNumeroDocumento(edicion.documentoNumero) : "";
  const dniEditado = modo === "editar" && edicion?.documentoTipo === "dni";
  const mismoDni = dniEditado && deAntes?.documentoTipo === "dni" && (deAntes.documentoNumero ?? "") === numeroEditado;
  const { padron, consultar } = usePadronDeFicha({ numero: numeroEditado, activo: dniEditado, automatico: !mismoDni });
  const nombreEditado =
    edicion && deAntes
      ? nombreDeLaEdicion({
          tipo: edicion.documentoTipo,
          numero: numeroEditado,
          escrito: edicion.nombre,
          padron,
          deAntes: { tipo: deAntes.documentoTipo, numero: deAntes.documentoNumero, nombre: deAntes.nombre },
        })
      : null;

  const guia = useGuiaCampos(
    camposDeLaGuia(
      modo,
      ficha?.clienta ?? null,
      { edicion, motivoArchivo, anonimizar, problemaDelCorreo, nombre: nombreEditado },
      responsable.listo,
      anioActual,
    ),
  );

  async function cargar() {
    setCargando(true);
    const { ficha, error } = await cargarFichaClienta(id);
    setCargando(false);
    if (error || !ficha) {
      avisar.error(traducirError(error, "abrir la ficha del cliente", { lectura: true }));
      onClose();
      return;
    }
    setFicha(ficha);
    setModo("ver");
  }

  // Sus puntos se leen una vez y sirven a la cifra de arriba y al bloque de abajo (solo una miembro tiene).
  const esMiembro = ficha ? estadoClub(ficha.clienta) !== "no_socia" && !ficha.clienta.anonimizada : false;
  const puntos = usePuntosDeLaFicha(id, ficha?.clienta.version ?? 0, ficha?.clienta.cumpleMes ?? null, esMiembro);

  if (cargando || !ficha) {
    return (
      <Modal conCerrar titulo="Cliente" subtitulo="Cargando…" onClose={onClose} variante="hoja">
        <p className="text-sm text-tinta/65">Un momento…</p>
      </Modal>
    );
  }

  const c = ficha.clienta;
  const activa = estaActiva(c);
  const tallas = deducirTallas(ficha.compras);
  const frecuente = frecuenteDeLaFicha(ficha.resumenCompras ?? null, estadoFrecuente(ficha.compras, new Date()));
  const suSede = suSedeDeLaFicha(ficha.resumenCompras ?? null);
  // El documento con su tipo («DNI 71234482») y el celular: completos para el líder, a medias para los demás (Felipe
  // 2026-10-13, auditoría punto 18). Antes se veían completos para toda cuenta con el módulo.
  const contacto = contactoVisible(c, verCompleto);
  const documento = contacto.documento;
  // El correo de contacto, con la misma regla: completo para el líder, a medias para los demás («an•••@gmail.com»).
  const correo = correoVisible(c.correo, verCompleto);
  // Lo que tiene en la tienda online: el aviso de archivar con un pedido en curso (cambia con «Anonimizar») y la nota del correo.
  const avisoArchivo = avisoAlArchivar(ficha.tiendaOnline ?? null, anonimizar);
  const notaCorreo = notaDelCorreoDeEntrada(ficha.tiendaOnline ?? null);
  // Con un pedido web PAGADO y sin entregar, anonimizar espera (20261015131000): el interruptor se apaga y dice por qué.
  const esperaAnonimizar = frenaAnonimizar(ficha.tiendaOnline ?? null);
  // Bajo la caja del correo: lo que dijo la base de ese correo, o que está mal escrito (cuando ya salió de la caja).
  const pieCorreo = edicion && (salioDelCorreo || rechazoVigente(rechazoCorreo, edicion.correo)) ? problemaDelCorreo : null;
  const enClub = estadoClub(c);
  // Solo una miembro tiene pestaña «Club» (permisos y preferencias); una ficha anonimizada no tiene nada del club que mostrar.
  const conClub = enClub !== "no_socia" && !c.anonimizada;
  const vistaActual: Vista = vista === "club" && !conClub ? "actividad" : (vista ?? (conClub ? "club" : "actividad"));
  const totalActividad = ficha.compras.length + ficha.cambios.length + ficha.devoluciones.length + ficha.separaciones.length;
  // Tanda 1g: se une desde el cartel con su documento; sin documento en esta ficha, se crearía otra.
  const faltaParaElClub = faltaParaSerSocia(c);
  // Al editar el celular de una socia con novedades, lo que pierde, ANTES de guardar (la base se las quita sola).
  const avisoCelular = edicion ? avisoCambioDeCelular(c, edicion.telefonoWhatsapp) : null;

  /** Lo común a toda acción que guarda: responsable, el aviso de la base y volver a leer la ficha. `bajoSuCampo`: si el error es
   *  de UN dato que la hoja dice bajo su caja (el correo), lo toma ella y no sale el aviso suelto (ADR-0358). */
  async function guardarAccion(
    hacer: () => Promise<{ error: ErrorEscritura }>,
    que: string,
    listo: () => void,
    despues?: Modo,
    bajoSuCampo?: (error: ErrorEscritura, frase: string) => boolean,
  ) {
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
      if (bajoSuCampo?.(error, traducirError(error, que))) return;
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
      avisar.error("Es miembro del club: su celular no se puede dejar vacío.", { enfocar: ID_CELULAR_CLUB });
      return;
    }
    // El nombre (Felipe 2026-10-15): con DNI, el que tenía o el del padrón; con carné o pasaporte, escrito tal cual y sin números.
    if (nombreEditado && !nombreEditado.listo) {
      avisar.error(nombreEditado.pendiente ?? "Revisa el nombre.", nombreEditado.origen === "padron" ? undefined : { enfocar: ID_NOMBRE_ESCRITO });
      return;
    }
    const nombreAGuardar = nombreEditado?.nombre ?? edicion.nombre;
    if (c.clubDesde !== null && (edicion.documentoNumero.trim() === "" || nombreAGuardar.trim() === "")) {
      avisar.error("Es miembro del club: su documento y su nombre no se pueden dejar vacíos.", edicion.documentoNumero.trim() === "" ? { enfocar: ID_NUMERO_DOCUMENTO } : undefined);
      return;
    }
    // El correo (opcional): mal escrito, o el mismo que la base ya rechazó, se dice bajo su caja y se lleva el cursor ahí.
    if (problemaDelCorreo) {
      setSalioDelCorreo(true);
      document.getElementById(ID_CORREO)?.focus();
      return;
    }
    const cumpleEditado = cumpleDeEdicion(edicion);
    const problemaDelCumple = problemaCumple(cumpleEditado, anioActual);
    if (problemaDelCumple) {
      avisar.error(problemaDelCumple, { enfocar: cajaDelProblemaCumple(cumpleEditado, anioActual) === "anio" ? ID_ANIO_CLUB : ID_DIA_CLUB });
      return;
    }
    const firma = responsable.firma();
    const pierdeNovedades = avisoCelular !== null;
    const correoEnviado = normalizarCorreo(edicion.correo);
    await guardarAccion(
      () => editarClienta(id, { ...edicion, nombre: nombreAGuardar }, c.version, firma),
      "editar la ficha",
      () =>
        avisar.exito("Ficha actualizada", {
          detalle: pierdeNovedades ? "Con el celular nuevo dejó de recibir novedades: las vuelve a pedir escaneando el cartel del club." : undefined,
        }),
      undefined,
      // El correo de otra ficha (la base dice de cuál) o mal escrito: bajo su caja, no en un aviso suelto.
      (error, frase) => {
        // La base no encontró la lectura del padrón del nombre (la hoja estuvo abierta más de una hora): se vuelve a leer, y el
        // aviso sale como siempre.
        if (error?.hint === "nombre_sin_padron" && nombreEditado?.origen === "padron") consultar();
        if (!esRechazoDelCorreo(error)) return false;
        setRechazoCorreo({ valor: correoEnviado, mensaje: frase });
        setSalioDelCorreo(true);
        document.getElementById(ID_CORREO)?.focus();
        return true;
      },
    );
  }

  async function onArchivar(anonimizando: boolean) {
    if (motivoArchivo.trim() === "") {
      avisar.error("Escribe un motivo antes de archivar a este cliente.");
      return;
    }
    const firma = responsable.firma();
    await guardarAccion(
      () => archivarClienta(id, motivoArchivo, anonimizando, c.version, firma),
      anonimizando ? "anonimizar la ficha" : "archivar la ficha",
      () => avisar.exito(anonimizando ? "Ficha anonimizada" : "Cliente archivado"),
    );
  }

  async function onReactivar() {
    const firma = responsable.firma();
    await guardarAccion(() => reactivarClienta(id, c.version, firma), "reactivar la ficha", () => avisar.exito("Cliente reactivado"));
  }

  // ---- El club: su BAJA (ADR-0288 tanda 1b; desde la 1g, lo único del club que se registra en la ficha) ----

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
          detalle: fichas > 1 ? `Sin novedades por WhatsApp desde hoy, en las ${fichas} fichas con ese celular. Sigue siendo miembro.` : "Sin novedades por WhatsApp desde hoy. Sigue siendo miembro.",
        }),
    );
  }

  const volverAVer = (
    <Boton type="button" onClick={() => setModo("ver")}>
      Cancelar
    </Boton>
  );

  // ---- Lo que arma el diseño B (Felipe 2026-10-20): su perfil, las tres cifras y el historial ----
  const nombreVisible = c.nombre ?? documento ?? "Sin nombre";
  const cumple = c.cumpleDia && c.cumpleMes ? `${c.cumpleDia} ${MESES_DEL_ANIO[c.cumpleMes - 1]?.slice(0, 3).toLowerCase() ?? ""}${c.cumpleAnio ? ` ${c.cumpleAnio}` : ""}` : null;
  const perfil: DatosDelPerfil = {
    nombre: nombreVisible,
    estado: estadoDeLaFila({ archivadaEn: c.archivadaEn, anonimizada: c.anonimizada, fusionadaEnId: c.fusionadaEnId, clubDesde: c.clubDesde, esFrecuente: frecuente.esFrecuente }),
    novedades: conClub && activa ? { texto: c.publicidadDesde ? "Recibe novedades" : "No recibe novedades", recibe: c.publicidadDesde !== null } : null,
    documento,
    celular: contacto.celular,
    correo,
    cumple,
    codigo: c.codigoClub,
    // Copiar solo sirve con el dato completo: quien lo ve a medias no copia «71••••82».
    completos: verCompleto ? { documento: c.documentoNumero, celular: c.telefonoWhatsapp, correo: c.correo, codigo: c.codigoClub } : null,
  };
  const movimientos = lineaDeTiempo(ficha);
  const ultimaIso = ficha.resumenCompras?.ultimaCompra ?? ficha.compras[0]?.fecha ?? null;
  const ultima = ultimaCompraLegible(ultimaIso, hoyLima());
  const sedeUltima = ficha.compras[0] ? suSedeLegible(ficha.compras[0].ubicacion) : null;
  const detalleCompras = [
    `${ficha.compras.length} compra${ficha.compras.length === 1 ? "" : "s"}`,
    conClub ? (frecuente.esFrecuente ? "compra seguido" : `le ${frecuente.faltanParaFrecuente === 1 ? "falta" : "faltan"} ${frecuente.faltanParaFrecuente} para «seguido»`) : null,
    ficha.devoluciones.length > 0 ? "sin descontar devoluciones" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const datosPuntos = puntos.tipo === "listo" ? puntos.puntos : null;
  // En vez del título de siempre, la hoja abre con el perfil (su nombre ya está ahí): el nombre queda para el lector de pantalla.
  // Editar tiene su propio título; el resto de las acciones (archivar, BAJA…) conservan el nombre y lo que decían.
  const tituloHoja = modo === "ver" ? <span className="sr-only">Ficha de {nombreVisible}</span> : modo === "editar" ? "Editar datos" : nombreVisible;
  const subtituloHoja =
    modo === "ver"
      ? undefined
      : modo === "editar"
        ? nombreVisible
        : [documento, contacto.celular, correo, c.codigoClub].filter(Boolean).join(" · ") || "Sin documento ni celular";

  return (
    <Modal
      titulo={tituloHoja}
      subtitulo={subtituloHoja}
      onClose={onClose}
      variante="hoja"
      ancho="max-w-4xl" /* unificar-fijo: la ficha de un cliente abre con su perfil a un lado (diseño B de Fichas, aprobado por Felipe 2026-10-20) */
      // Una salida a la vista (ADR-0358, ronda 12): mirando la ficha, la ×; editando, archivando o con la BAJA, «Cancelar».
      conCerrar={modo === "ver"}
    >
      {() => (
        <div ref={raiz} className="space-y-5">
          {modo === "ver" && (
            // `-m-6` deja que el perfil llegue hasta el borde de la hoja (que ya le pone p-6 a todo).
            <div className="-m-6 grid lg:grid-cols-[250px_minmax(0,1fr)]">
              <PerfilDelCliente d={perfil}>
                {activa && (
                  <BotonEditar
                    guia="clientas.ficha-editar"
                    className="w-full !bg-papel"
                    onClick={() => {
                      setEdicion(datosDeEdicion(c));
                      setRechazoCorreo(null);
                      setSalioDelCorreo(false);
                      setModo("editar");
                    }}
                  >
                    Editar datos
                  </BotonEditar>
                )}
                {/* Lo que se hace pocas veces va abajo y discreto; lo de todos los días («Editar») está arriba. */}
                {activa && (
                  <div className="mt-auto pt-2" data-guia="clientas.ficha-acciones">
                    <button
                      type="button"
                      className="btn-cayla btn-sutil w-full"
                      onClick={() => {
                        setMotivoArchivo("");
                        setAnonimizar(false);
                        setModo("archivar");
                      }}
                    >
                      Archivar a este cliente
                    </button>
                  </div>
                )}
              </PerfilDelCliente>

              <section className="min-w-0 space-y-5 p-6 lg:pt-7">
                {!activa && (
                  <Aviso tono="atencion" chico>
                    {c.anonimizada ? "Ficha anonimizada: sin datos personales (Ley 29733)." : c.fusionadaEnId ? "Esta ficha se unió a otra." : `Ficha archivada: ${c.motivoArchivo}.`}
                  </Aviso>
                )}

                {/* Las tres cifras: sus puntos (o, sin club, su sede), cuánto ha comprado y su última compra. */}
                <div className="grid gap-2.5 sm:grid-cols-3 lg:pr-10" data-guia="clientas.ficha-resumen">
                  {datosPuntos ? (
                    <CifraDeLaFicha titulo="Puntos" valor={datosPuntos.destacado.replace(/ puntos?$/, "")} detalle={datosPuntos.resto} />
                  ) : (
                    <CifraDeLaFicha titulo="Su sede" valor={suSede.valor} detalle={suSede.detalle ? `Donde más compró (${suSede.detalle})` : "Donde más compró en 12 meses"} />
                  )}
                  <CifraDeLaFicha titulo="Ha comprado" valor={soles(totalComprado(ficha.compras))} detalle={detalleCompras} />
                  <CifraDeLaFicha titulo="Última compra" valor={ultima?.hace ?? "—"} detalle={ultima ? [ultima.fecha, sedeUltima].filter(Boolean).join(" · ") : "Todavía sin compras"} />
                </div>

                {/* Club o Historial son dos secciones de la ficha: la pestaña de vista del sistema (ADR-0358). Quien no es del club solo
                    tiene el Historial: una sola pestaña no elige nada, así que ahí es el título del bloque. */}
                {conClub ? (
                  <Pestanas
                    etiquetaAccesible="Qué ver de este cliente"
                    guia="clientas.ficha-pestanas"
                    idIndicador="ficha-cliente-vista"
                    activa={vistaActual}
                    onCambio={(clave) => setVista(clave as Vista)}
                    items={[
                      { clave: "club", etiqueta: "Club" },
                      { clave: "actividad", etiqueta: "Historial", conteo: totalActividad > 0 ? totalActividad : undefined, guia: "clientas.ficha-tab-actividad" },
                    ]}
                  />
                ) : (
                  <TituloSeccion nivel={3} cuenta={totalActividad > 0 ? totalActividad : undefined} guia="clientas.ficha-tab-actividad">
                    Historial
                  </TituloSeccion>
                )}

                {vistaActual === "club" && conClub && (
                  <div className="space-y-4">
                    <p className="text-sm text-tinta/75">
                      Miembro desde <b className="font-medium text-tinta">{fecha(c.clubDesde!)}</b>. Gana puntos con cada compra y los canjea en caja por un cupón.
                    </p>

                    {/* Sus puntos, su regalo de cumpleaños y sus cupones vivos (programa de puntos): se leen aparte y, si fallan, la
                        ficha sigue igual. Sin ficha de miembro no se dibuja nada. */}
                    <PuntosDeLaFicha estado={puntos} />

                    <div className="card-cayla p-4" data-guia="clientas.ficha-club">
                      <TituloSeccion nivel={3}>Novedades por WhatsApp</TituloSeccion>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {c.publicidadDesde ? (
                          <>
                            <Chip tono="verde">Recibe novedades</Chip>
                            <span className="text-xs text-tinta/60">desde {fecha(c.publicidadDesde)}</span>
                          </>
                        ) : (
                          <>
                            <Chip tono="neutro">No recibe novedades</Chip>
                            <span className="text-xs text-tinta/60">no las pidió: es miembro sin mensajes</span>
                          </>
                        )}
                        {/* «Registrar su BAJA»: solo si tiene publicidad (y su celular, que es lo que se da de baja). */}
                        {activa && c.publicidadDesde && c.telefonoWhatsapp && (
                          <Boton type="button" className="!py-1.5 sm:ml-auto" onClick={() => setModo("baja")}>
                            Registrar su BAJA
                          </Boton>
                        )}
                      </div>
                      <p className="mt-2.5 text-xs text-tinta/55">Solo el cliente las acepta, desde el cartel. Si te escribe BAJA, regístralo aquí: vale para las 3 tiendas.</p>
                    </div>

                    <PreferenciasClienta
                      clientaId={c.id}
                      version={c.version}
                      guardadas={c.preferencias ?? {}}
                      soloLectura={!activa}
                      onGuardada={(version, preferencias) => setFicha((f) => (f ? { ...f, clienta: { ...f.clienta, version, preferencias } } : f))}
                    />

                    <HistoriaPermisos clientaId={c.id} clave={c.version} />
                  </div>
                )}

                {vistaActual === "actividad" && (
                  <div className="space-y-5" data-guia="clientas.ficha-actividad">
                    {!c.anonimizada && !conClub && (
                      <div className="rounded-xl bg-hueso px-4 py-3 text-sm text-tinta/80">
                        <b className="font-semibold text-tinta">Tiene ficha pero no es del club.</b>{" "}
                        {faltaParaElClub ?? "Se une por su cuenta, escaneando el cartel del club con su celular y este mismo documento."}
                      </div>
                    )}

                    {tallas.length > 0 && (
                      <p className="text-sm text-tinta/75">
                        <span className="label-cayla mr-2 text-[10.5px] text-tinta/55">Talla que suele comprar</span>
                        {tallas.map((t) => `${t.categoria}: ${t.talla}`).join(" · ")}
                      </p>
                    )}

                    <HistorialDelCliente movimientos={movimientos} />
                  </div>
                )}

                {activa && ficha.tiendaOnline?.cuentaWeb && <TiendaOnlineDeLaFicha clientaId={c.id} verCompleto={verCompleto} onRestablecer={() => setModo("acceso-web")} />}

                {!activa && !c.anonimizada && !c.fusionadaEnId && (
                  <div className="flex flex-wrap justify-end gap-3 border-t border-sand pt-4">
                    <ComboResponsable control={responsable} deshabilitado={guardando} compacto />
                    <Boton textoCargando="Reactivando…" type="button" peso="primario" cargando={guardando} onClick={onReactivar} disabled={!responsable.listo}>
                      Reactivar
                    </Boton>
                  </div>
                )}
              </section>
            </div>
          )}

          {modo === "editar" && edicion && (
            // Diseño B (Felipe 2026-10-20): cuatro bloques con su título —Quién es, Cómo contactarlo, Cumpleaños, Quién guarda el
            // cambio—, el campo que sigue se enciende (guía de foco, ADR-0284) y abajo un pie fijo con «Falta: …» y Cancelar / Guardar.
            <form onSubmit={onEditar} className="space-y-4">
              <section className="card-cayla space-y-4 p-4 sm:p-5">
                <TituloSeccion nivel={3}>Quién es</TituloSeccion>
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
                {/* El nombre (Felipe 2026-10-15): con DNI no se edita a mano —bloqueado, con «Actualizar desde el padrón»; si el DNI
                    cambió, el padrón trae el del número nuevo—; con carné o pasaporte se escribe tal cual, sin números. */}
                <CampoGuiado id="nombre" guia={guia}>
                  {nombreEditado?.origen === "padron" ? (
                    <NombreDelPadron
                      padron={padron}
                      donde="ficha"
                      onConsultar={consultar}
                      deAntes={mismoDni ? (c.nombre ?? "") : null}
                      actualizable={mismoDni}
                      deshabilitado={guardando}
                      conMarca={(titulo) => guia.etiqueta("nombre", titulo)}
                    />
                  ) : (
                    <CampoTexto
                      id={ID_NOMBRE_ESCRITO}
                      etiqueta={guia.etiqueta("nombre", "Nombre")}
                      maxLength={200}
                      value={edicion.nombre}
                      onChange={(e) => setEdicion((d) => d && { ...d, nombre: e.target.value })}
                      pie={
                        nombreEditado?.pendiente && /[0-9]/.test(edicion.nombre)
                          ? nombreEditado.pendiente
                          : nombreEditado?.origen === "escrito"
                            ? AYUDA_NOMBRE_ESCRITO
                            : undefined
                      }
                      tono={nombreEditado?.pendiente && /[0-9]/.test(edicion.nombre) ? "error" : "neutro"}
                    />
                  )}
                </CampoGuiado>
              </section>

              <section className="card-cayla space-y-4 p-4 sm:p-5">
                <TituloSeccion nivel={3}>Cómo contactarlo</TituloSeccion>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoGuiado id="celular" guia={guia}>
                    <CampoCelular
                      etiqueta={guia.etiqueta("celular", "Celular (WhatsApp)")}
                      obligatorio={c.clubDesde !== null}
                      valor={edicion.telefonoWhatsapp}
                      onValor={(v) => setEdicion((d) => d && { ...d, telefonoWhatsapp: v })}
                    />
                    {/* Recibe novedades en el celular de ahora: al cambiarlo las pierde (la base se las quita sola), y se dice antes. */}
                    {avisoCelular && <p className="nota-cayla mt-2 text-[13px]">{avisoCelular}</p>}
                  </CampoGuiado>
                  {/* El correo de CONTACTO (Felipe 2026-10-15): opcional. Mal escrito, o de otra ficha (la base dice de cuál: quien edita ve
                      el módulo), va bajo la caja. El correo con que entra a la tienda online no cambia desde aquí, y se dice. */}
                  <CampoGuiado id="correo" guia={guia}>
                    <CampoTexto
                      id={ID_CORREO}
                      etiqueta={guia.etiqueta(
                        "correo",
                        <>
                          Correo <span className="font-normal normal-case text-tinta/45">· opcional</span>
                        </>,
                      )}
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      value={edicion.correo}
                      onChange={(e) => setEdicion((d) => d && { ...d, correo: e.target.value })}
                      onBlur={() => setSalioDelCorreo(true)}
                      aria-invalid={pieCorreo ? true : undefined}
                      pie={pieCorreo ?? "Solo para contactar al cliente si hace falta, nunca para publicidad."}
                      tono={pieCorreo ? "error" : "neutro"}
                    />
                    {notaCorreo && <p className="nota-cayla mt-2 text-[13px]">{notaCorreo}</p>}
                  </CampoGuiado>
                </div>
              </section>

              <section className="card-cayla space-y-4 p-4 sm:p-5">
                <TituloSeccion nivel={3}>Cumpleaños</TituloSeccion>
                <CampoGuiado id="cumple" guia={guia} titulo="Día, mes y año" ayuda="Día y mes; el año, solo si lo quiere decir">
                  <CamposCumpleanos
                    cumple={cumpleDeEdicion(edicion)}
                    onCumple={(nuevo) => setEdicion((d) => d && { ...d, cumpleDia: nuevo.dia, cumpleMes: nuevo.mes, cumpleAnio: nuevo.anio })}
                    anioActual={anioActual}
                    despues="se puede agregar después."
                  />
                </CampoGuiado>
              </section>

              <section className="card-cayla space-y-4 p-4 sm:p-5">
                <TituloSeccion nivel={3}>Quién guarda este cambio</TituloSeccion>
                <CampoGuiado id="responsable" guia={guia}>
                  <ComboResponsable control={responsable} deshabilitado={guardando} />
                </CampoGuiado>
              </section>

              <p className="text-xs text-tinta/65">El club y las novedades por WhatsApp no se cambian aquí: se ven y se registran en la ficha.</p>
              <div className="pie-hoja-fijo space-y-1 pt-2">
                <PieGuia guia={guia} listo="Todo listo para guardar." />
                <div className="pie-acciones">
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
              </div>
            </form>
          )}

          {modo === "archivar" && (
            <div className="space-y-4">
              {/* Un pedido de la tienda online en curso (Felipe 2026-10-15): se AVISA antes de confirmar, no se frena. Lo que pasa cambia
                  con «Anonimizar» (su cuenta de la tienda se cierra): el texto lo sigue. */}
              {avisoArchivo && (
                <Aviso tono="atencion" titulo={avisoArchivo.titulo}>
                  {/* Un renglón por pedido: con dos, los «·» de uno no se mezclan con los del otro. */}
                  {avisoArchivo.pedidos.map((linea) => (
                    <span key={linea} className="block">
                      {linea}
                    </span>
                  ))}
                  <span className="mt-1 block">{avisoArchivo.texto}</span>
                </Aviso>
              )}
              <CampoGuiado id="motivo" guia={guia}>
                <CampoTexto etiqueta={guia.etiqueta("motivo", "Motivo")} value={motivoArchivo} onChange={(e) => setMotivoArchivo(e.target.value)} placeholder="Ya no compra, cerró su número…" />
              </CampoGuiado>
              <CampoGuiado id="anonimizar" guia={guia}>
                {/* ADR-0416: anonimizar no tiene vuelta atrás, lo hace un líder (`verCompleto` es ser líder; la base lo exige igual). */}
                <Interruptor
                  activo={anonimizar && verCompleto}
                  onActivo={setAnonimizar}
                  disabled={!verCompleto || esperaAnonimizar !== null}
                  etiqueta={guia.etiqueta("anonimizar", "Anonimizar sus datos personales (Ley 29733)")}
                  pie={
                    verCompleto
                      ? (esperaAnonimizar ?? pieDeAnonimizar(ficha.tiendaOnline ?? null))
                      : "Borra sus datos personales y no se puede deshacer: lo hace un líder. Tú puedes archivarla."
                  }
                />
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo={anonimizar ? "Todo listo para anonimizar." : "Todo listo para archivar."} />
              <div className="flex justify-end gap-3 pt-2">
                {volverAVer}
                <Boton textoCargando={anonimizar ? "Anonimizando…" : "Archivando…"}
                  type="button"
                  peso="primario"
                  cargando={guardando}
                  onClick={() => onArchivar(anonimizar && verCompleto)}
                  disabled={!responsable.listo}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                >
                  {anonimizar ? "Anonimizar" : "Archivar"}
                </Boton>
              </div>
            </div>
          )}

          {modo === "acceso-web" && (
            <RestablecerAccesoWeb clientaId={c.id} verCompleto={verCompleto} responsable={responsable} onCancelar={() => setModo("ver")} onListo={() => setModo("ver")} />
          )}

          {modo === "baja" && (
            <div className="space-y-5">
              <p className="text-sm text-tinta/75">
                Escribió BAJA (o pidió que no le manden más novedades). Desde hoy no se le envían novedades, rebajas ni los avisos de sus
                cupones por WhatsApp, en las 3 tiendas. <strong>Sigue siendo miembro</strong>: sus puntos, sus cupones y su regalo de cumpleaños
                siguen igual.
              </p>
              <p className="text-xs text-tinta/65">Vale para toda ficha con el celular {contacto.celular}.</p>
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
