"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { QuitarColor } from "@/components/orden-produccion/AgregarColor";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton, CampoSelect, CampoTexto, type Opcion } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { Pestanas } from "@/components/ui/Pestanas";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeFichaConsumo } from "@/lib/ficha-consumo-guia";
import {
  ORDENES_PARA_QUE_MANDE_LO_MEDIDO,
  RPC_GUARDAR_FICHA,
  RPC_LEER_FICHA,
  borradorDeFicha,
  escalon,
  hayCambiosEnLaFicha,
  leerFicha,
  paraRpc,
  problemasDeFicha,
  separarFichaPorTalla,
  unirFichaEnUnaCifra,
  type BorradorFicha,
  type Escalon,
  type FichaLeida,
  type FilaAvioBorrador,
} from "@/lib/ficha-consumo-reglas";
import type { InsumoDelTaller } from "@/lib/orden-tela-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// La hoja «Ficha de consumo» (ADR-0513, actividad 4): cuánta tela lleva cada talla de un modelo y qué avíos lleva, escrito UNA vez en el modelo. La abre quien la necesita desde Nueva orden, desde
// la orden abierta y desde Editar producto (las tres puertas); es siempre la ficha del MODELO (lo que lleva ESTA orden se edita en la orden). Guarda con `guardar_ficha_consumo`, que la valida
// otra vez y es todo o nada. Producción la edita; quien solo ve Catálogo la ve en lectura (`puedeEditar` viene de la base, no de la pantalla). Se anota con quien se elige en «Responsable»
// (ADR-0161/0162). Un doble clic no guarda dos veces: una marca síncrona corta la segunda llamada, y repetir la ficha no cambia nada en la base.

const ESCALONES: { clave: Exclude<Escalon, "sin-ficha">; titulo: string; detalle: string }[] = [
  { clave: "estimado", titulo: "Estimado", detalle: "Un número para todas las tallas" },
  { clave: "audaces", titulo: "Audaces", detalle: "El consumo calculado por talla" },
  { clave: "medido", titulo: "Medido", detalle: "Lo que se gastó de verdad, desde la 3.ª orden cerrada" },
];
const ORDEN_DE_ESCALON: Record<Escalon, number> = { "sin-ficha": -1, estimado: 0, audaces: 1, medido: 2 };

export type PropsFichaDeConsumoHoja = {
  tallerId: string;
  productoId: string;
  /** El nombre del modelo mientras se lee la ficha. */
  referencia: string;
  /** Telas y avíos del Taller: de ahí salen los avíos que se pueden elegir. */
  insumos: readonly InsumoDelTaller[];
  /** El nombre del Taller para el responsable (`useResponsable`); sin él, el de la sede activa. */
  tallerNombre?: string;
  onClose: () => void;
  /** Se guardó (algo cambió o no): la pantalla de atrás relee lo suyo. */
  onGuardada?: () => void;
};

export function FichaDeConsumoHoja({ tallerId, productoId, referencia, insumos, tallerNombre, onClose, onGuardada }: PropsFichaDeConsumoHoja) {
  const router = useRouter();
  const responsable = useResponsable(tallerNombre ? { ubicacionId: tallerId, etiqueta: tallerNombre } : undefined);
  const [lectura, setLectura] = useState<"leyendo" | "error" | FichaLeida>("leyendo");
  const [borrador, setBorrador] = useState<BorradorFicha | null>(null);
  const [pestana, setPestana] = useState<"tela" | "avios">("tela");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const contador = useRef(0);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const { data, error } = await createClient().rpc(RPC_LEER_FICHA as never, { p_ubicacion_id: tallerId, p_producto_id: productoId } as never);
      if (!vigente) return;
      const f = error ? null : leerFicha(data);
      if (!f) setLectura("error");
      else {
        setLectura(f);
        setBorrador(borradorDeFicha(f));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [tallerId, productoId]);

  const ficha = typeof lectura === "object" ? lectura : null;
  const lista = useMemo(() => [...insumos], [insumos]);
  const problemas = useMemo(() => (ficha && borrador ? problemasDeFicha(borrador, ficha, lista) : []), [ficha, borrador, lista]);
  const cambio = ficha && borrador ? hayCambiosEnLaFicha(borrador, ficha) : false;
  const puedeEditar = ficha?.puedeEditar ?? false;
  const guia = useGuiaCampos(camposDeFichaConsumo({ faltas: problemas.map((p) => p.texto), hayCambios: cambio, responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace con lo guardado, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ borrador: cambio ? borrador : null });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(puedeEditar && fotoActual !== fotoAlAbrir, "Cambiaste la ficha y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => {
      onGuardada?.();
      router.refresh();
    });
  }

  function cambiar(parche: Partial<BorradorFicha>) {
    setBorrador((b) => (b ? { ...b, ...parche } : b));
  }
  function ponerAvio(clave: string, parche: Partial<FilaAvioBorrador>) {
    setBorrador((b) => (b ? { ...b, avios: b.avios.map((a) => (a.clave === clave ? { ...a, ...parche } : a)) } : b));
  }
  function agregarAvio() {
    contador.current += 1;
    setBorrador((b) => (b ? { ...b, avios: [...b.avios, { clave: `n${contador.current}`, insumoId: null, colorCodigo: null, cantidad: "" }] } : b));
  }
  function quitarAvio(clave: string) {
    setBorrador((b) => (b ? { ...b, avios: b.avios.filter((a) => a.clave !== clave) } : b));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !ficha || !borrador) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0].texto);
      return;
    }
    if (!cambio) {
      avisar.error("Cambia algo de la ficha para guardar.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    const firma = responsable.firma();
    const { p_tela, p_avios } = paraRpc(borrador, ficha);
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_GUARDAR_FICHA as never, { p_ubicacion_id: tallerId, p_producto_id: productoId, p_tela, p_avios } as never), firma);
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La ficha se guarda entera o no se guarda: repetirla no cambia nada, así que no hace falta mirar antes de volver a intentar.
      avisar.error(traducirError(error, "guardar la ficha de consumo"));
      return;
    }
    avisar.exito(`Ficha de consumo de ${ficha.referencia} guardada.`, { detalle: "Las órdenes nuevas la proponen sola. Las que ya están abiertas no cambian." });
    cerrarTrasGuardar();
  }

  const titulo = `Ficha de consumo · ${ficha?.referencia ?? referencia}`;
  const subtitulo = "Cuánta tela lleva cada prenda de este modelo y qué avíos. Las órdenes nuevas lo proponen solas.";
  return (
    <Modal titulo={titulo} subtitulo={subtitulo} variante="hoja" tamano="ancha" onClose={onClose} conCerrar={!puedeEditar} antesDeCerrar={avisoSalida.pedirAccion}>
      {lectura === "leyendo" && <p className="mt-4 text-[13px] text-tinta/60">Leyendo la ficha del modelo…</p>}
      {lectura === "error" && (
        <div className="mt-4">
          <Aviso tono="error" titulo="No se pudo leer la ficha de este modelo">
            Cierra la hoja y vuelve a abrirla. Si sigue igual, avísale a quien lleva el sistema.
          </Aviso>
        </div>
      )}
      {ficha && borrador && (
        <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
          {!puedeEditar && (
            <Aviso tono="info">La ficha de consumo la edita el Taller (quien tiene Producción). Tu cuenta la ve, pero no la cambia.</Aviso>
          )}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16.5rem]">
            <CampoGuiado id="ficha" guia={guia} retiene="fila" className="min-w-0 space-y-4">
              <span className={`${campoEtiqueta} block`}>{guia.etiqueta("ficha", "Tela y avíos del modelo")}</span>
              <Pestanas
                etiquetaAccesible="Qué parte de la ficha"
                items={[
                  { clave: "tela", etiqueta: "Tela" },
                  { clave: "avios", etiqueta: "Avíos", conteo: borrador.avios.length },
                ]}
                activa={pestana}
                onCambio={(c) => setPestana(c as "tela" | "avios")}
                idIndicador="ficha-consumo"
              />
              {pestana === "tela" ? (
                <PanelTela ficha={ficha} borrador={borrador} puedeEditar={puedeEditar} problemas={problemas} cambiar={cambiar} />
              ) : (
                <PanelAvios ficha={ficha} borrador={borrador} puedeEditar={puedeEditar} problemas={problemas} insumos={lista} ponerAvio={ponerAvio} agregarAvio={agregarAvio} quitarAvio={quitarAvio} />
              )}
            </CampoGuiado>
            <DeDondeSale ficha={ficha} />
          </div>

          {puedeEditar && (
            <>
              <div className="space-y-3">
                <CampoGuiado id="quien" guia={guia}>
                  <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
                </CampoGuiado>
                <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
              </div>
              <div className="pie-hoja-fijo">
                <div className="pie-acciones border-t border-sand pt-3">
                  <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                    Cancelar
                  </Boton>
                  <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Guardando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                    Guardar en la ficha
                  </Boton>
                </div>
              </div>
            </>
          )}
        </form>
      )}
      {avisoSalida.aviso}
    </Modal>
  );
}

// ---------- La tela ----------

function PanelTela({ ficha, borrador, puedeEditar, problemas, cambiar }: { ficha: FichaLeida; borrador: BorradorFicha; puedeEditar: boolean; problemas: ReturnType<typeof problemasDeFicha>; cambiar: (p: Partial<BorradorFicha>) => void }) {
  const variasTallas = ficha.tallas.length >= 2;
  const porTalla = borrador.modo === "talla" && variasTallas;
  const faltaUna = problemas.find((p) => p.campo === "tela" && p.talla === undefined);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-display text-[17px] leading-tight text-tinta">Tela principal</p>
          <p className="text-[12.5px] text-tinta/70">Metros que lleva una prenda, como los calcula Audaces.</p>
        </div>
        {variasTallas && (
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Cuántas cifras"
            valor={borrador.modo}
            onCambio={(v) => {
              if (!puedeEditar || v === borrador.modo) return;
              cambiar(v === "talla" ? separarFichaPorTalla(borrador, ficha) : unirFichaEnUnaCifra(borrador, ficha));
            }}
            opciones={[
              { clave: "una", etiqueta: "Una cifra" },
              { clave: "talla", etiqueta: "Por talla" },
            ]}
          />
        )}
      </div>
      {porTalla ? (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {ficha.tallas.map((t) => {
            const falta = problemas.find((p) => p.campo === "tela" && p.talla === t);
            const valor = borrador.porTalla[t] ?? "";
            return (
              <div key={t} className="w-[7rem]">
                <CampoTexto
                  id={`ficha-consumo-${t}`}
                  etiqueta={`Talla ${t}`}
                  mono
                  inputMode="decimal"
                  placeholder="0.000"
                  value={valor}
                  disabled={!puedeEditar}
                  onChange={(e) => cambiar({ porTalla: { ...borrador.porTalla, [t]: e.target.value } })}
                  pie={falta?.texto ?? "metros por prenda"}
                  tono={falta && valor.trim() !== "" ? "error" : "neutro"}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="max-w-[11rem]">
          <CampoTexto
            id="ficha-consumo-una"
            etiqueta={variasTallas ? "Todas las tallas" : "Metros por prenda"}
            mono
            inputMode="decimal"
            placeholder="0.000"
            value={borrador.una}
            disabled={!puedeEditar}
            onChange={(e) => cambiar({ una: e.target.value })}
            pie={faltaUna?.texto ?? "metros por prenda, con punto"}
            tono={faltaUna && borrador.una.trim() !== "" ? "error" : "neutro"}
          />
        </div>
      )}
      {!porTalla && variasTallas && borrador.una.trim() !== "" && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tono="ambar" versalitas={false} title="Un solo número para todas las tallas: sepáralo por talla y el pedido se afina">
            Aproximado
          </Chip>
          <span className="text-[12.5px] text-tinta/70">Sirve para empezar; la orden lo usa igual para todas las tallas.</span>
        </div>
      )}
      {!ficha.tela && <p className="text-[12.5px] text-tinta/70">Este modelo todavía no tiene ficha. Lo que escribas lo proponen las órdenes nuevas.</p>}
    </div>
  );
}

// ---------- Los avíos ----------

function PanelAvios({
  ficha,
  borrador,
  puedeEditar,
  problemas,
  insumos,
  ponerAvio,
  agregarAvio,
  quitarAvio,
}: {
  ficha: FichaLeida;
  borrador: BorradorFicha;
  puedeEditar: boolean;
  problemas: ReturnType<typeof problemasDeFicha>;
  insumos: readonly InsumoDelTaller[];
  ponerAvio: (clave: string, parche: Partial<FilaAvioBorrador>) => void;
  agregarAvio: () => void;
  quitarAvio: (clave: string) => void;
}) {
  const delEstante = insumos.filter((i) => i.tipo === "avio" && !i.archivado);
  const para: Opcion<string>[] = [{ valor: "todas", texto: "Toda la orden" }, ...ficha.colores.map((c) => ({ valor: c.codigo, texto: c.nombre }))];
  return (
    <div className="space-y-3">
      <div>
        <p className="font-display text-[17px] leading-tight text-tinta">Avíos</p>
        <p className="text-[12.5px] text-tinta/70">Botones, hilo, etiquetas: lo que lleva cada prenda además de la tela. «Para» dice a cuáles se aplica.</p>
      </div>
      {borrador.avios.length === 0 && <p className="text-[12.5px] text-tinta/70">Este modelo no tiene avíos. Si los agregas, las órdenes nuevas los proponen solas.</p>}
      {borrador.avios.map((fila) => {
        // Si la cuenta no ve el avío en el estante (Editar producto trae solo lo que su rol lee), el nombre sale de la propia ficha.
        const delModelo = fila.insumoId ? ficha.avios.find((a) => a.insumoId === fila.insumoId) : undefined;
        const insumo = fila.insumoId ? insumos.find((i) => i.id === fila.insumoId) : undefined;
        const opciones: Opcion<string>[] = delEstante.map((i) => ({ valor: i.id, texto: i.nombre }));
        if (!insumo && delModelo) opciones.unshift({ valor: delModelo.insumoId, texto: delModelo.nombre });
        if (insumo && !opciones.some((o) => o.valor === insumo.id)) opciones.unshift({ valor: insumo.id, texto: `${insumo.nombre} · ${insumo.archivado ? "archivado" : "no es un avío"}`, deshabilitada: true });
        const faltas = problemas.filter((p) => p.campo === "avios" && p.fila === fila.clave);
        const deAvio = faltas.find((p) => !/cuánto lleva|tiene que ser|puede pasar|Escribe/.test(p.texto));
        const deCantidad = faltas.find((p) => /cuánto lleva|tiene que ser|puede pasar|Escribe/.test(p.texto));
        return (
          <div key={fila.clave} className="grid grid-cols-[minmax(0,1fr)_minmax(0,11rem)_7.5rem_auto] items-start gap-x-3 gap-y-1">
            <CampoSelect
              id={`ficha-avio-${fila.clave}`}
              etiqueta="Avío"
              valor={fila.insumoId ?? ""}
              onValor={(v) => ponerAvio(fila.clave, { insumoId: v || null })}
              opciones={opciones}
              marcador="Elegir el avío"
              deshabilitado={!puedeEditar}
              pie={deAvio?.texto}
              tono={deAvio ? "error" : "neutro"}
            />
            <CampoSelect
              id={`ficha-avio-${fila.clave}-para`}
              etiqueta="Para"
              valor={fila.colorCodigo ?? "todas"}
              onValor={(v) => ponerAvio(fila.clave, { colorCodigo: v === "todas" ? null : v })}
              opciones={para}
              deshabilitado={!puedeEditar}
            />
            <CampoTexto
              id={`ficha-avio-${fila.clave}-cantidad`}
              etiqueta={`${(insumo?.unidad ?? delModelo?.unidad) === "cono" ? "conos" : "unid."} por prenda`}
              mono
              inputMode="decimal"
              placeholder="0"
              value={fila.cantidad}
              disabled={!puedeEditar}
              onChange={(e) => ponerAvio(fila.clave, { cantidad: e.target.value })}
              pie={deCantidad?.texto}
              tono={deCantidad && fila.cantidad.trim() !== "" ? "error" : "neutro"}
            />
            {puedeEditar && (
              <div className="pt-[1.625rem]">
                <QuitarColor nombre={insumo?.nombre ?? delModelo?.nombre ?? "este avío"} onQuitar={() => quitarAvio(fila.clave)} />
              </div>
            )}
          </div>
        );
      })}
      {puedeEditar && (
        <Boton type="button" peso="fantasma" onClick={agregarAvio} disabled={delEstante.length === 0} title={delEstante.length === 0 ? "Todavía no hay avíos en Insumos" : undefined}>
          + Agregar avío
        </Boton>
      )}
    </div>
  );
}

// ---------- De dónde sale el número ----------

function DeDondeSale({ ficha }: { ficha: FichaLeida }) {
  const actual = escalon(ficha);
  const n = ficha.medido?.ordenes ?? 0;
  return (
    <aside aria-label="De dónde sale el número" className="min-w-0 space-y-4">
      <div>
        <p className={`${campoEtiqueta} mb-2.5 block`}>De dónde sale el número</p>
        <ol className="space-y-3">
          {ESCALONES.map((e) => {
            const hecho = ORDEN_DE_ESCALON[e.clave] < ORDEN_DE_ESCALON[actual];
            const ahora = e.clave === actual;
            return (
              <li key={e.clave} className={`flex gap-2.5 ${hecho || ahora ? "" : "opacity-60"}`} aria-current={ahora ? "step" : undefined}>
                <span aria-hidden className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border text-[11px] ${hecho ? "border-verde bg-verde text-papel" : ahora ? "border-tinta" : "border-sand"}`}>
                  {hecho ? "✓" : ahora ? <span className="h-2 w-2 rounded-full bg-tinta" /> : null}
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-tinta">{e.titulo}</span>
                  <span className="block text-[12px] text-tinta/70">{e.detalle}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="rounded-xl border border-sand p-3">
        <p className="text-[12px] text-tinta/70">Órdenes cerradas de este modelo</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <b className="font-display text-[22px] font-normal leading-none tabular-nums text-tinta">{Math.min(n, ORDENES_PARA_QUE_MANDE_LO_MEDIDO)} de {ORDENES_PARA_QUE_MANDE_LO_MEDIDO}</b>
          <Chip tono={actual === "medido" ? "verde" : "neutro"} versalitas={false}>
            {actual === "medido" ? "Manda lo medido" : actual === "estimado" ? "Manda tu estimado" : "Manda Audaces"}
          </Chip>
        </div>
        <BarraAvance pct={(Math.min(n, ORDENES_PARA_QUE_MANDE_LO_MEDIDO) / ORDENES_PARA_QUE_MANDE_LO_MEDIDO) * 100} alto="normal" etiqueta="Órdenes cerradas que cuentan para lo medido" className="mt-2.5" />
      </div>
      {actual === "medido" ? (
        <Aviso tono="exito" chico>
          Manda lo gastado de verdad: {ficha.medido?.porPrenda?.toFixed(3) ?? "—"} m por prenda en promedio. Las órdenes ya abiertas no cambian.
        </Aviso>
      ) : (
        <p className="text-[12.5px] text-tinta/70">
          Todavía no manda lo medido: {n >= ORDENES_PARA_QUE_MANDE_LO_MEDIDO ? "se cerraron antes de la última vez que se escribió la ficha" : `faltan ${ORDENES_PARA_QUE_MANDE_LO_MEDIDO - n} ${ORDENES_PARA_QUE_MANDE_LO_MEDIDO - n === 1 ? "orden cerrada" : "órdenes cerradas"}`}. Cuando haya {ORDENES_PARA_QUE_MANDE_LO_MEDIDO}, la ficha toma lo que se gastó de verdad.
        </p>
      )}
    </aside>
  );
}
