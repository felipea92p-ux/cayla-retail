"use client";

import { useState, type ReactNode } from "react";
import { ImagePlus, MapPin, X } from "lucide-react";
import { PuertaDeTienda } from "@/components/tienda-web-conf/PuertaDeTienda";
import { TelefonoDeTienda } from "@/components/tienda-web-conf/TelefonoDeTienda";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { direccionDeFotoDeTienda, prepararFotoDeTienda, subirFotoDeTienda } from "@/lib/foto-de-tienda";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CierresDeTienda } from "@/components/tienda-web-conf/CierresDeTienda";
import { HorarioSemanal } from "@/components/tienda-web-conf/HorarioSemanal";
import { EscalaDeStock, RelojDelPedido } from "@/components/tienda-web-conf/RelojDelPedido";
import { useAhoraEnLima } from "@/components/tienda-web-conf/useAhoraEnLima";
import { filasDeSemana, resumenDeHorario, semanaDeSerializada, serializarSemana, type SemanaDeTienda } from "@cayla-retail/shared/horario-de-tienda";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraBloque, CampoFin, InputFin, Superficie } from "@/components/finanzas/kit";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { cierresDeSerializados, cierresVigentes, serializarCierres } from "@/lib/horario-edicion-reglas";
import { momentoEnLima } from "@cayla-retail/shared/horario-de-tienda";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { ajustarCelular, celularValido } from "@/lib/club-reglas";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { sugerirDireccion, sugerirNombreWeb } from "@/lib/sugerencias-tienda-web";
import {
  NOMBRE_DATO,
  TOPES_SEDE,
  borradorDe,
  borradorParametros,
  camposDeGuia,
  errorDeLargo,
  errorDeMapa,
  faltaParaMostrar,
  fusionarBorrador,
  idCampo,
  limpiarTexto,
  moverTienda,
  moverUnLugar,
  ordenarSedes,
  pendientesDe,
  tieneHorario,
  validarParametrosTiendaWeb,
  type BorradorParametros,
  type BorradorSede,
  type ConfiguracionTiendaWeb as Datos,
  type DatoWeb,
  type ParametrosTiendaWeb,
  type SedeWeb,
} from "@/lib/tienda-web-reglas";

// Tienda web ▸ Conf. Tienda (ADR-0430; antes «Datos y plazos» y, antes, Configuración ▸ Tienda web, ADR-0408, actividad 6; maqueta `vConfig` de
// docs/maquetas/tienda-online-2026-10/): lo que la tienda online le muestra al cliente de cada tienda —nombre, WhatsApp, dirección y
// horario, y si se muestra— y los plazos de los pedidos web. Dibujada con el kit de Finanzas (ADR-0195). CADA TARJETA SE GUARDA CON SU
// BOTÓN «Guardar», firmada con el responsable (Felipe 2026-10-21: guardar solo al salir de una casilla no estaba bien: nadie sabía
// cuándo se había guardado). Lo escrito, y el interruptor «Se ve en la web», quedan como borrador hasta apretarlo.
//
// El WhatsApp es `ubicaciones.whatsapp_numero`, el mismo del QR del club (Tiendas y caja): se guarda con `guardar_whatsapp_tienda`,
// la misma función y la misma regla de allá. El resto, con `guardar_sede_tienda_web`, que no deja encender una tienda a la que
// le falte algo (la guía de foco lo dice antes, con la misma regla: `faltaParaMostrar`).

/** `listo` es el aviso de éxito; `null` guarda sin avisar (el paso previo de un guardado en dos partes). */
type Guardar = (hacer: () => PromiseLike<{ error: unknown }>, que: string, listo: string | null) => Promise<boolean>;
type CampoTexto = "nombreWeb" | "direccion";

const listaDe = (sedes: readonly SedeWeb[]) => Object.fromEntries(sedes.map((s) => [s.id, borradorDe(s)])) as Record<string, BorradorSede>;

export function ConfiguracionTiendaWeb({ datos }: { datos: Datos }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  // La tienda cuya tarjeta se está guardando: su botón espera la respuesta.
  const [guardandoEn, setGuardandoEn] = useState<string | null>(null);
  // La tienda abierta en el taller (la fila de puertas de arriba elige cuál).
  const [elegidaId, setElegidaId] = useState<string | null>(datos.sedes[0]?.id ?? null);

  // Lo escrito en cada tienda. Cuando la base trae datos nuevos (otro guardado, un refresco), cada caja toma lo nuevo salvo la
  // que la persona tiene escrita distinto (`fusionarBorrador`): un refresco no le borra a nadie lo que lleva escrito.
  const [borradores, setBorradores] = useState(() => listaDe(datos.sedes));
  const [bases, setBases] = useState(() => listaDe(datos.sedes));
  const [mostrar, setMostrar] = useState(() => Object.fromEntries(datos.sedes.map((s) => [s.id, s.mostrar])) as Record<string, boolean>);
  // El orden de las puertas (los ids): la base ya las manda en orden; al mover una, se ve al instante y se guarda enseguida.
  const [ordenIds, setOrdenIds] = useState(() => datos.sedes.map((x) => x.id));
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  // La tienda cuya foto se está preparando y subiendo (la ruta queda en el borrador; recién «Guardar» la manda a la base).
  const [subiendoFotoId, setSubiendoFotoId] = useState<string | null>(null);
  const [encimaId, setEncimaId] = useState<string | null>(null);
  const [vista, setVista] = useState(datos);
  if (vista !== datos) {
    setOrdenIds(datos.sedes.map((x) => x.id));
    const nuevas = listaDe(datos.sedes);
    setBorradores((b) => Object.fromEntries(datos.sedes.map((s) => [s.id, fusionarBorrador(b[s.id] ?? nuevas[s.id]!, bases[s.id] ?? nuevas[s.id]!, nuevas[s.id]!)])));
    setBases(nuevas);
    // El interruptor sin guardar se respeta, igual que lo escrito: solo toma lo nuevo el que no se tocó.
    setMostrar((m) => Object.fromEntries(datos.sedes.map((s) => [s.id, m[s.id] === vista.sedes.find((x) => x.id === s.id)?.mostrar ? s.mostrar : (m[s.id] ?? s.mostrar)])));
    setVista(datos);
  }
  const elegida = datos.sedes.find((x) => x.id === elegidaId) ?? datos.sedes[0];
  const puertas = ordenarSedes(datos.sedes, ordenIds);

  // Guía de foco: qué le falta a la tienda abierta para verse en la web. Solo llevan marca los datos que llegaron vacíos al abrir.
  const [pendientes] = useState(() => pendientesDe(datos.sedes));
  const guia = useGuiaCampos(
    camposDeGuia(elegida ? [{ id: elegida.id, nombre: elegida.nombre, borrador: borradores[elegida.id] ?? borradorDe(elegida) }] : [], pendientes),
    { enModal: false },
  );

  const guardar: Guardar = async (hacer, que, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    if (listo) avisar.exito(listo);
    router.refresh();
    return true;
  };

  /** La dirección pública de la foto que está puesta (armarla no llama a la red). */
  const fotoUrlDe = (ruta: string) => (ruta ? direccionDeFotoDeTienda(createClient(), ruta) : null);

  /** Elegir o soltar una foto: se reduce aquí, se sube al almacén y su ruta queda en el borrador; «Guardar» la manda a la base. */
  async function elegirFoto(s: SedeWeb, archivo: File) {
    setSubiendoFotoId(s.id);
    try {
      const lista = await prepararFotoDeTienda(archivo);
      if ("error" in lista) return avisar.error(lista.error);
      const subida = await subirFotoDeTienda(createClient(), s.id, lista.archivo);
      if ("error" in subida) return avisar.error(subida.error);
      escribir(s.id, "foto", subida.ruta);
      if (lista.aviso) avisar.aviso(lista.aviso);
    } finally {
      setSubiendoFotoId(null);
    }
  }

  /** Mover una puerta: se ve al instante y se guarda enseguida (es el orden, no un dato de la tienda). Si la base no lo acepta, vuelve al de antes. */
  async function ordenar(nuevo: string[]) {
    const antes = ordenIds;
    if (nuevo.join() === antes.join()) return;
    setOrdenIds(nuevo);
    const ok = await guardar(
      () => createClient().rpc("guardar_orden_tiendas_web" as never, { p_ids: nuevo } as never),
      "ordenar las tiendas de la web",
      `Orden guardado: ${nuevo.map((id) => limpiarTexto(borradores[id]?.nombreWeb ?? "") ?? nombreCorto(datos.sedes.find((x) => x.id === id)?.nombre ?? "")).join(", ")}.`,
    );
    if (!ok) setOrdenIds(antes);
  }
  const arrastre = (id: string, fase: "empieza" | "encima" | "suelta" | "termina") => {
    if (fase === "empieza") setArrastrandoId(id);
    else if (fase === "encima") setEncimaId(arrastrandoId && arrastrandoId !== id ? id : null);
    else if (fase === "suelta") {
      const origen = arrastrandoId;
      setArrastrandoId(null);
      setEncimaId(null);
      if (origen && origen !== id) void ordenar(moverTienda(ordenIds, origen, id));
    } else {
      setArrastrandoId(null);
      setEncimaId(null);
    }
  };

  const escribir = (sedeId: string, campo: keyof BorradorSede, valor: string) =>
    setBorradores((b) => ({ ...b, [sedeId]: { ...(b[sedeId] as BorradorSede), [campo]: valor } }));
  const revertir = (sedeId: string, campo: keyof BorradorSede) => escribir(sedeId, campo, bases[sedeId]?.[campo] ?? "");

  /** ¿La tarjeta de esta tienda tiene algo escrito o encendido que la base todavía no tiene? */
  const tieneCambios = (s: SedeWeb) => {
    const b = borradores[s.id];
    const base = bases[s.id];
    if (!b || !base) return false;
    const texto = (["nombreWeb", "direccion", "horario"] as const).some((k) => limpiarTexto(b[k]) !== limpiarTexto(base[k]));
    return texto || b.whatsapp !== base.whatsapp || b.mapa.trim() !== base.mapa.trim() || b.foto !== base.foto || b.dias !== base.dias || b.cierres !== base.cierres || (mostrar[s.id] ?? s.mostrar) !== s.mostrar;
  };

  /** El botón «Guardar» de una tienda: valida todo antes de escribir nada, guarda el WhatsApp (su propia función, la del QR del club) y
   *  después el resto, con un solo aviso al final. Si algo falla, lo escrito se queda para corregirlo y volver a guardar. */
  async function guardarTarjeta(s: SedeWeb) {
    const b = borradores[s.id];
    const base = bases[s.id];
    if (!b || !base) return;
    const enWeb = mostrar[s.id] ?? s.mostrar;
    const largo = errorDeLargo(b);
    if (largo) return avisar.error(`${s.nombre}: ${largo}`);
    if (b.whatsapp !== "" && !celularValido(b.whatsapp)) {
      return avisar.error(`WhatsApp de ${s.nombre}: tiene 9 dígitos y empieza en 9. Si la tienda no tiene uno, déjalo vacío.`);
    }
    const mapaMal = errorDeMapa(b.mapa);
    if (mapaMal) return avisar.error(`${s.nombre}: ${mapaMal}`);
    const falta = faltaParaMostrar(b);
    if (enWeb && falta.length > 0) {
      return avisar.error(`${s.nombre}: para mostrarla en la web falta ${falta.map((d) => NOMBRE_DATO[d].toLocaleLowerCase("es")).join(", ")}.`);
    }
    const cambioWhatsapp = b.whatsapp !== base.whatsapp;
    const cambioResto = (["nombreWeb", "direccion", "horario"] as const).some((k) => limpiarTexto(b[k]) !== limpiarTexto(base[k])) || enWeb !== s.mostrar;
    const cambioMapa = b.mapa.trim() !== base.mapa.trim();
    const nombre = limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre);
    // Cada cosa se guarda con su función, en este orden (el WhatsApp primero: encender la tienda lo exige). El aviso sale una sola vez, al final.
    const pasos: { que: string; hacer: () => PromiseLike<{ error: unknown }>; listo: string }[] = [];
    if (cambioWhatsapp) {
      pasos.push({
        que: "guardar el WhatsApp de la tienda",
        hacer: () => createClient().rpc("guardar_whatsapp_tienda", { p_ubicacion_id: s.id, p_numero: b.whatsapp || undefined }),
        listo: b.whatsapp
          ? `${s.nombre}: WhatsApp ${b.whatsapp}. Es el mismo del QR del club.`
          : `${s.nombre}: sin WhatsApp. No se ve en la web ni muestra el QR del club.`,
      });
    }
    if (cambioResto) {
      pasos.push({
        que: `guardar la tienda ${s.nombre}`,
        hacer: () =>
          createClient().rpc(
            "guardar_sede_tienda_web" as never,
            {
              p_ubicacion_id: s.id,
              p_nombre_web: limpiarTexto(b.nombreWeb),
              p_direccion: limpiarTexto(b.direccion),
              p_horario: limpiarTexto(b.horario),
              p_mostrar: enWeb,
            } as never,
          ),
        listo: enWeb !== s.mostrar ? (enWeb ? `«${nombre}» ya se ve en la web.` : `«${nombre}» ya no se ve en la web.`) : `${s.nombre}: cambios guardados.`,
      });
    }
    if (cambioMapa) {
      pasos.push({
        que: "guardar el mapa de la tienda",
        hacer: () => createClient().rpc("guardar_mapa_tienda_web" as never, { p_ubicacion_id: s.id, p_mapa_url: b.mapa.trim() || null } as never),
        listo: b.mapa.trim() ? `${s.nombre}: mapa guardado. «Cómo llegar» abre ese lugar.` : `${s.nombre}: mapa quitado. «Cómo llegar» busca la dirección.`,
      });
    }
    const cambioFoto = b.foto !== base.foto;
    if (cambioFoto) {
      pasos.push({
        que: "guardar la foto de la tienda",
        hacer: () => createClient().rpc("guardar_foto_tienda_web" as never, { p_ubicacion_id: s.id, p_foto_ruta: b.foto || null } as never),
        listo: b.foto ? `${s.nombre}: foto guardada.` : `${s.nombre}: foto quitada. Se ve el dibujo de la fachada.`,
      });
    }
    // El horario va AL FINAL: guarda también su texto corto en `horario`, y así lo que se guardó antes (el texto de la tienda) no lo pisa.
    if (b.dias !== base.dias) {
      const semana = semanaDeSerializada(b.dias);
      const resumen = resumenDeHorario(semana);
      pasos.push({
        que: "guardar el horario de la tienda",
        hacer: () =>
          createClient().rpc("guardar_horario_tienda_web" as never, { p_ubicacion_id: s.id, p_dias: filasDeSemana(semana), p_resumen: resumen } as never),
        listo: resumen ? `${s.nombre}: horario guardado. ${resumen}.` : `${s.nombre}: sin horario por días.`,
      });
    }
    // Los cierres también al final. Solo de hoy en adelante: una pantalla que se quedó abierta de ayer no manda un día pasado (la base lo rechazaría).
    if (b.cierres !== base.cierres) {
      const fechas = cierresVigentes(cierresDeSerializados(b.cierres), momentoEnLima().fecha);
      pasos.push({
        que: "guardar los cierres de la tienda",
        hacer: () => createClient().rpc("guardar_cierres_tienda_web" as never, { p_ubicacion_id: s.id, p_fechas: fechas } as never),
        listo: fechas.length ? `${s.nombre}: ${fechas.length === 1 ? "1 cierre guardado" : `${fechas.length} cierres guardados`}.` : `${s.nombre}: sin cierres por fecha.`,
      });
    }
    // Con varias cosas, un solo aviso que las junta; la tienda que se enciende o se apaga lo dice primero, porque es lo que el cliente nota.
    const aviso = enWeb !== s.mostrar || pasos.length === 1 ? pasos.find((x) => x.que.startsWith("guardar la tienda"))?.listo ?? pasos[0]?.listo : `${s.nombre}: cambios guardados.`;
    setGuardandoEn(s.id);
    try {
      for (let i = 0; i < pasos.length; i++) {
        const ok = await guardar(pasos[i]!.hacer, pasos[i]!.que, i === pasos.length - 1 ? (aviso ?? null) : null);
        if (!ok) return;
      }
    } finally {
      setGuardandoEn(null);
    }
  }

  if (!elegida) {
    return <div className="nota-cayla">No hay tiendas abiertas para mostrar en la web.</div>;
  }

  return (
    <>
      <div className="flex justify-end">
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando || guardandoEn !== null} />
        </div>
      </div>

      <section className="twc-calle" role="group" aria-label="Tiendas" data-guia="config.tienda-web-sedes">
        {puertas.map((s, i) => (
          <PuertaDeTienda
            key={s.id}
            sede={s}
            borrador={borradores[s.id] ?? borradorDe(s)}
            guardado={{ mostrar: s.mostrar, ...(bases[s.id] ?? borradorDe(s)) }}
            enWeb={mostrar[s.id] ?? false}
            activa={s.id === elegida.id}
            sucia={tieneCambios(s)}
            indice={i}
            bloqueada={guardando || guardandoEn !== null}
            guiaInterruptor={i === 0 ? "config.tienda-web-mostrar" : undefined}
            fotoUrl={fotoUrlDe(borradores[s.id]?.foto ?? "")}
            ordenable={puertas.length > 1 && guardandoEn === null && !guardando}
            arrastrando={arrastrandoId === s.id}
            encima={encimaId === s.id}
            onMover={(paso) => void ordenar(moverUnLugar(ordenIds, s.id, paso))}
            onArrastre={(fase) => arrastre(s.id, fase)}
            onElegir={() => setElegidaId(s.id)}
            // El interruptor es del borrador: abre esa tienda para que su botón «Guardar» quede a la vista.
            onMostrar={(v) => {
              setMostrar((m) => ({ ...m, [s.id]: v }));
              setElegidaId(s.id);
            }}
          />
        ))}
      </section>

      <TallerDeTienda
        key={elegida.id}
        sede={elegida}
        borrador={borradores[elegida.id] ?? borradorDe(elegida)}
        enWeb={mostrar[elegida.id] ?? false}
        guia={guia}
        pendientes={pendientes}
        sucio={tieneCambios(elegida)}
        guardando={guardandoEn === elegida.id}
        fotoUrl={fotoUrlDe(borradores[elegida.id]?.foto ?? "")}
        subiendoFoto={subiendoFotoId === elegida.id}
        onFoto={(archivo) => void elegirFoto(elegida, archivo)}
        onEscribir={(campo, valor) => escribir(elegida.id, campo, valor)}
        onRevertir={(campo) => revertir(elegida.id, campo)}
        onGuardar={() => guardarTarjeta(elegida)}
      />

      {datos.parametros ? (
        <Plazos parametros={datos.parametros} guardar={guardar} />
      ) : (
        <p className="nota-cayla">Falta pegar en la base la migración de la tienda web (20261014231000) para ajustar los plazos.</p>
      )}

      <div className="nota-cayla" data-guia="config.tienda-web-nota">
        El WhatsApp de cada tienda es el mismo del QR del club: cambiarlo aquí también lo cambia en Tiendas y caja y en el cartel del
        mostrador. Por ahora no hay envíos: todo pedido web se recoge en la tienda que eligió el cliente.
      </div>
    </>
  );
}

/** La tienda abierta: sus campos a la izquierda y, fijo a la derecha, cómo la verá el cliente mientras se escribe. */
function TallerDeTienda({
  sede: s,
  borrador: b,
  enWeb,
  guia,
  pendientes,
  sucio,
  guardando,
  fotoUrl,
  subiendoFoto,
  onFoto,
  onEscribir,
  onRevertir,
  onGuardar,
}: {
  sede: SedeWeb;
  borrador: BorradorSede;
  enWeb: boolean;
  guia: GuiaCampos;
  pendientes: ReadonlySet<string>;
  sucio: boolean;
  guardando: boolean;
  /** La foto de la fachada puesta ahora (con lo sin guardar). */
  fotoUrl: string | null;
  subiendoFoto: boolean;
  onFoto: (archivo: File) => void;
  onEscribir: (campo: keyof BorradorSede, valor: string) => void;
  onRevertir: (campo: keyof BorradorSede) => void;
  onGuardar: () => void;
}) {
  const [sobreFoto, setSobreFoto] = useState(false);
  const ahora = useAhoraEnLima();
  const falta = faltaParaMostrar(b);
  const paraLaFrase = limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre);
  // La marca de la guía solo en los datos que llegaron vacíos al abrir (una tienda completa no se llena de marcas).
  const etiqueta = (dato: DatoWeb | "horario", texto: string): ReactNode => (pendientes.has(idCampo(s.id, dato)) ? guia.etiqueta(idCampo(s.id, dato), texto) : texto);
  // El pie dice, con la regla real, qué le falta para verse en la web; cada cosa lleva a su caja.
  const faltan: CampoDeGuia[] = [
    ...falta.map((dato) => ({ id: idCampo(s.id, dato), nombre: NOMBRE_DATO[dato], requerido: true, hecho: false, pendiente: "" })),
    ...(!tieneHorario(b) ? [{ id: idCampo(s.id, "horario"), nombre: NOMBRE_DATO.horario, requerido: false, sugerido: true, hecho: false, pendiente: "" }] : []),
  ];
  const teclas = (campo: keyof BorradorSede) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onRevertir(campo);
  };
  const caja = (campo: CampoTexto, placeholder: string, tope: number) => (
    <InputFin
      id={`tw-${s.id}-${campo}`}
      value={b[campo]}
      maxLength={tope}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(e) => onEscribir(campo, e.target.value)}
      onKeyDown={teclas(campo)}
    />
  );

  return (
    <div className="twc-taller">
      <Superficie pad className="anim-sube">
        <CabeceraBloque titulo={s.nombre} />

        <div className="twc-fila2">
          <CampoGuiado id={idCampo(s.id, "nombre_web")} guia={guia}>
            <CampoFin etiqueta={etiqueta("nombre_web", "Nombre que ve el cliente")} htmlFor={`tw-${s.id}-nombreWeb`}>
              {caja("nombreWeb", sugerirNombreWeb(s.nombre), TOPES_SEDE.nombreWeb)}
            </CampoFin>
          </CampoGuiado>

          <CampoGuiado id={idCampo(s.id, "whatsapp")} guia={guia}>
            <CampoFin etiqueta={etiqueta("whatsapp", "WhatsApp de la tienda")} htmlFor={`tw-${s.id}-whatsapp`}>
              <div className="fin-con-unidad">
                <span>+51</span>
                <InputFin
                  id={`tw-${s.id}-whatsapp`}
                  value={b.whatsapp}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="987 654 321"
                  onChange={(e) => onEscribir("whatsapp", ajustarCelular(e.target.value))}
                  onKeyDown={teclas("whatsapp")}
                  className="fin-num"
                />
              </div>
            </CampoFin>
          </CampoGuiado>
        </div>

        <div className="twc-fila2">
          <div className="twc-col">
            <CampoGuiado id={idCampo(s.id, "direccion")} guia={guia}>
              <CampoFin etiqueta={etiqueta("direccion", "Dirección para recoger")} htmlFor={`tw-${s.id}-direccion`}>
                {caja("direccion", sugerirDireccion(s.nombre), TOPES_SEDE.direccion)}
              </CampoFin>
            </CampoGuiado>

            <CampoFin etiqueta="Mapa" htmlFor={`tw-${s.id}-mapa`}>
              <InputFin
                id={`tw-${s.id}-mapa`}
                value={b.mapa}
                inputMode="url"
                maxLength={400}
                placeholder="Pega el enlace de Google Maps"
                autoComplete="off"
                onChange={(e) => onEscribir("mapa", e.target.value)}
                onKeyDown={teclas("mapa")}
              />
              <span className="twc-mapita" data-vacio={b.mapa.trim() === "" ? "" : undefined}>
                <span className="twc-mapita-tile" aria-hidden>
                  <MapPin />
                </span>
                {errorDeMapa(b.mapa) ? (
                  <Chip tono="ambar" versalitas={false}>No es un enlace de Google Maps</Chip>
                ) : b.mapa.trim() === "" ? (
                  <Chip tono="neutro" versalitas={false}>Sin enlace: busca la dirección</Chip>
                ) : (
                  <Chip tono="verde" versalitas={false}>«Cómo llegar» abre este lugar</Chip>
                )}
              </span>
            </CampoFin>
          </div>

          <CampoFin etiqueta="Foto" htmlFor={`tw-${s.id}-foto`} className="twc-campo-foto">
            <label
              className="twc-foto"
              data-sobre={sobreFoto || undefined}
              data-con-foto={fotoUrl ? "" : undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setSobreFoto(true);
              }}
              onDragLeave={() => setSobreFoto(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSobreFoto(false);
                const archivo = e.dataTransfer.files[0];
                if (archivo && !subiendoFoto) onFoto(archivo);
              }}
            >
              {fotoUrl && (
                // La foto ya viene reducida por el ERP y está en el almacén público: no pasa por el optimizador.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoUrl} alt={`Fachada de ${paraLaFrase}`} />
              )}
              <span className="twc-foto-texto">
                <span className="twc-foto-pildora">
                  <ImagePlus aria-hidden />
                  {subiendoFoto ? "Subiendo…" : fotoUrl ? "Cambiar foto" : "Suelta o elige la fachada"}
                </span>
              </span>
              <input
                id={`tw-${s.id}-foto`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={subiendoFoto}
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = "";
                  if (archivo) onFoto(archivo);
                }}
              />
            </label>
            {fotoUrl && !subiendoFoto && (
              <button type="button" className="btn-cayla btn-enlace mt-1.5" onClick={() => onEscribir("foto", "")}>
                <X aria-hidden className="h-3.5 w-3.5" /> Quitar foto
              </button>
            )}
          </CampoFin>
        </div>

        <CampoGuiado id={idCampo(s.id, "horario")} guia={guia}>
          <CampoFin
            etiqueta={
              <>
                {etiqueta("horario", "Horario")}
                <Chip tono="neutro" versalitas={false} className="ml-2">
                  Arrastra los bordes o la barra
                </Chip>
              </>
            }
            guia="config.tienda-web-horario"
          >
            <HorarioSemanal
              valor={semanaDeSerializada(b.dias)}
              onCambio={(semana: SemanaDeTienda) => onEscribir("dias", serializarSemana(semana))}
              ahora={ahora}
              cierreHoy={ahora !== null && cierresDeSerializados(b.cierres).includes(ahora.fecha)}
              deshabilitado={guardando}
            />
          </CampoFin>
        </CampoGuiado>

        <CampoFin etiqueta="Cierres" guia="config.tienda-web-cierres">
          <CierresDeTienda
            valor={cierresDeSerializados(b.cierres)}
            onCambio={(fechas) => onEscribir("cierres", serializarCierres(fechas))}
            ahora={ahora}
            deshabilitado={guardando}
          />
        </CampoFin>

        <div className="space-y-3 border-t border-sand pt-3">
          {faltan.length > 0 ? (
            <FaltanDelPaso faltan={faltan} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} />
          ) : (
            <p role="status" className="text-[12.5px] text-verde">
              Todo listo para mostrarla en la web.
            </p>
          )}
          <PieAcciones guia="config.tienda-web-guardar">
            {sucio && !guardando && (
              <span role="status" className="mr-auto self-center text-[12.5px] text-taupe">
                Tienes cambios sin guardar.
              </span>
            )}
            <Boton peso="primario" cargando={guardando} disabled={!sucio} onClick={onGuardar}>
              Guardar
            </Boton>
          </PieAcciones>
        </div>
      </Superficie>

      <TelefonoDeTienda nombreSede={s.nombre} borrador={b} enWeb={enWeb} fotoUrl={fotoUrl} />
    </div>
  );
}

/** Para todas las sedes: los plazos de los pedidos web y desde cuántas unidades el cliente ve el número. */
function Plazos({ parametros, guardar }: { parametros: ParametrosTiendaWeb; guardar: Guardar }) {
  const [b, setB] = useState<BorradorParametros>(() => borradorParametros(parametros));
  const [base, setBase] = useState<BorradorParametros>(() => borradorParametros(parametros));
  if (JSON.stringify(borradorParametros(parametros)) !== JSON.stringify(base)) {
    setBase(borradorParametros(parametros));
    setB(borradorParametros(parametros));
  }

  const sucio = JSON.stringify(b) !== JSON.stringify(base);
  const [guardando, setGuardando] = useState(false);

  async function guardarPlazos() {
    const v = validarParametrosTiendaWeb(b);
    if (!v.ok) return avisar.error(v.error);
    const p = v.valor;
    setGuardando(true);
    try {
      await guardar(
        () =>
          createClient().rpc(
            "guardar_parametros_tienda_web" as never,
            {
              p_horas_para_confirmar: p.horasParaConfirmar,
              p_horas_aviso_sin_pagar: p.horasAvisoSinPagar,
              p_dias_aviso_sin_recoger: p.diasAvisoSinRecoger,
              p_quedan_pocas_desde: p.quedanPocasDesde,
            } as never,
          ),
        "guardar los plazos de la tienda web",
        `Plazos guardados: se confirma en ${p.horasParaConfirmar} h, se anula sin pago a las ${p.horasAvisoSinPagar} h y se avisa a los ${p.diasAvisoSinRecoger} días sin recoger.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Superficie pad className="anim-sube" guia="config.tienda-web-plazos">
      <CabeceraBloque titulo="Reloj del pedido" bajada="Para todas las tiendas, desde el siguiente pedido.">
        <Chip tono="neutro" versalitas={false}>
          Todas las tiendas
        </Chip>
      </CabeceraBloque>
      <RelojDelPedido
        valor={b}
        onCambiar={(clave, texto) => setB((x) => ({ ...x, [clave]: texto }))}
        onRevertir={() => setB(base)}
      />
      <EscalaDeStock valor={Number(b.quedanPocasDesde)} onValor={(n) => setB((x) => ({ ...x, quedanPocasDesde: String(n) }))} />
      <PieAcciones>
        {sucio && !guardando && (
          <span role="status" className="mr-auto self-center text-[12.5px] text-taupe">
            Tienes cambios sin guardar.
          </span>
        )}
        <Boton peso="primario" cargando={guardando} disabled={!sucio} onClick={guardarPlazos}>
          Guardar
        </Boton>
      </PieAcciones>
    </Superficie>
  );
}
