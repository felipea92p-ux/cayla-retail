"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Modal, botonCancelar, botonPrimario, campoTexto } from "@/components/ui/Modal";
import { Desplegable } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  TOPE_LINEAS_PEDIDO,
  LINEA_ELEGIDA_VACIA,
  ajustarCantidad,
  conPrendaElegida,
  lineasElegidasParaPedir,
  lineasParaRpc,
  motivoNoSePuedePedir,
  prendasYaElegidasEnOtras,
  textoPrendas,
  type LineaElegida,
  type LineaParaPedir,
  type PrendaPedible,
} from "@/lib/pedidos-entre-sedes-reglas";

// «Pedir a otra sede» (ADR-0242 D-7, `pedir_a_otra_sede`): la sede activa le pide prendas a otra tienda para reponer, sin
// clienta. La otra tienda lo ve en Traslados, «Te piden», y lo envía en un solo traslado. Pedir no reserva nada en la otra
// tienda: si mientras tanto lo vende, responde «No la tengo».
//
// Dos maneras de abrirlo, el mismo pedido y la misma RPC:
//   · Con `origen` y `lineas` (Análisis): lo que falta aquí y sobra allá ya viene armado; la persona ajusta cantidades.
//   · Con `sedesParaElegir` (Traslados, 2026-10-03): la persona elige la tienda a la que le pide y las prendas, de lo que esa
//     tienda tiene LIBRE ahora (`/api/traslados/prendas-de-sede`). Quien ve Traslados y no Análisis solo podía empujar desde su
//     sede, nunca pedir: el pedido seguía yendo por WhatsApp y el sistema no se enteraba.
// Lleva la guía de foco (ADR-0284): cada campo dice si está hecho, cuál sigue y qué falta. «Falta» = lo mismo que apaga el botón:
// la tienda (si se elige), al menos una prenda y quién registra; la nota es opcional.

export type LineaPedirAOtraSede = LineaParaPedir;

type Comun = {
  /** La sede que pide (la activa). */
  ubicacionId: string;
  abierto: boolean;
  onCerrar: () => void;
  /** Tras pedir con éxito, con el `grupo_id` del pedido (opcional). */
  onPedido?: (grupoId: string) => void;
};

export type PedirAOtraSedeModalProps = Comun &
  (
    | {
        /** La tienda a la que se le pide. */
        origen: { id: string; nombre: string };
        /** Las prendas propuestas: `etiqueta` como «Blusa Carlita · Blanco · M», `cantidad` la sugerida (se topa a lo disponible). */
        lineas: LineaPedirAOtraSede[];
        sedesParaElegir?: undefined;
      }
    | {
        /** Las tiendas a las que puede pedir quien abre el modal (`sedesParaPedir`): la persona elige una. */
        sedesParaElegir: { id: string; nombre: string }[];
        origen?: undefined;
        lineas?: undefined;
      }
  );

export function PedirAOtraSedeModal(props: PedirAOtraSedeModalProps) {
  if (!props.abierto) return null;
  // Montado solo mientras está abierto: cada apertura trae sus cantidades y su token nuevos.
  return <PedirAOtraSedeHoja {...props} />;
}

/** Lo que la tienda elegida puede ofrecer, leído al elegirla. `reintentar` vuelve a pedirlo tras una caída. */
function usePrendasDeSede(sedeId: string) {
  const [lectura, setLectura] = useState<{ sedeId: string; ok: boolean; prendas: PrendaPedible[] } | null>(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (!sedeId) return;
    const control = new AbortController();
    fetch(`/api/traslados/prendas-de-sede?sede=${encodeURIComponent(sedeId)}`, { signal: control.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { prendas: PrendaPedible[] };
      })
      .then((d) => setLectura({ sedeId, ok: true, prendas: d.prendas }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return; // eligió otra tienda antes de que llegara
        setLectura({ sedeId, ok: false, prendas: [] });
      });
    return () => control.abort();
  }, [sedeId, intento]);
  // Una lectura de OTRA tienda (la persona cambió de idea) no vale: se espera la de la vigente.
  const vigente = lectura?.sedeId === sedeId ? lectura : null;
  return {
    estado: !sedeId ? ("ocioso" as const) : !vigente ? ("cargando" as const) : vigente.ok ? ("listo" as const) : ("error" as const),
    prendas: vigente?.prendas ?? [],
    reintentar: () => {
      setLectura(null);
      setIntento((n) => n + 1);
    },
  };
}

function Contador({ etiqueta, cantidad, tope, enviando, onCambiar }: { etiqueta: string; cantidad: number; tope: number; enviando: boolean; onCambiar: (delta: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={`Una menos de ${etiqueta}`}
        disabled={enviando || cantidad <= 0}
        onClick={() => onCambiar(-1)}
        className="btn-cayla btn-sutil h-9 w-9 justify-center p-0"
      >
        <Minus aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <span className="w-7 text-center tabular-nums font-semibold text-tinta" aria-live="polite">
        {cantidad}
      </span>
      <button
        type="button"
        aria-label={`Una más de ${etiqueta}`}
        disabled={enviando || cantidad >= tope}
        onClick={() => onCambiar(1)}
        className="btn-cayla btn-sutil h-9 w-9 justify-center p-0"
      >
        <Plus aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function PedirAOtraSedeHoja(props: PedirAOtraSedeModalProps) {
  const { ubicacionId, onCerrar, onPedido } = props;
  const router = useRouter();
  const activa = useSedeActiva();
  const elegir = props.sedesParaElegir !== undefined;
  const sedes = props.sedesParaElegir ?? [];

  // Modo Análisis: lo propuesto, con cantidades topadas. Modo Traslados: lo que la persona va eligiendo.
  const [fijas, setFijas] = useState<LineaParaPedir[]>(() =>
    (props.lineas ?? []).map((l) => ({ ...l, cantidad: ajustarCantidad(l.cantidad, 0, l.disponibleEnOrigen) })),
  );
  const [sedeId, setSedeId] = useState("");
  const [elegidas, setElegidas] = useState<LineaElegida[]>([LINEA_ELEGIDA_VACIA]);
  const catalogo = usePrendasDeSede(elegir ? sedeId : "");
  const origen = elegir ? (sedes.find((s) => s.id === sedeId) ?? null) : (props.origen ?? null);

  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  // El token (ADR-0190) va atado al CONTENIDO del pedido: reintentar lo MISMO —el doble clic, o un corte de red justo después de
  // guardarse— reutiliza el token y no crea dos pedidos; pero si la persona cambia la tienda o las prendas antes de reintentar,
  // es otro pedido y lleva token nuevo. Con un solo token por apertura, la base devolvía el pedido VIEJO («ya guardado») y el
  // modal avisaba «Pedido enviado a Lima» cuando lo guardado era el de AQP, con otras prendas.
  const intento = useRef<{ firma: string; token: string } | null>(null);
  const tokenDelIntento = (firma: string): string => {
    if (!intento.current || intento.current.firma !== firma) intento.current = { firma, token: crypto.randomUUID() };
    return intento.current.token;
  };
  const etiquetaSede = activa?.ubicacionId === ubicacionId ? activa.etiqueta : "esta tienda";
  const responsable = useResponsable({ ubicacionId, etiqueta: etiquetaSede });

  const lineas = elegir ? lineasElegidasParaPedir(elegidas, catalogo.prendas) : fijas;
  const motivo = motivoNoSePuedePedir(lineas);
  const total = lineasParaRpc(lineas).reduce((s, l) => s + l.cantidad, 0);

  // La guía mira la MISMA regla que apaga el botón (`motivo`, `responsable.listo`): no inventa reglas de negocio.
  const campos: CampoDeGuia[] = [
    ...(elegir ? [{ id: "sede", nombre: "Tienda", requerido: true, hecho: origen !== null, pendiente: "Elige a qué tienda le pides." }] : []),
    {
      id: "prendas",
      nombre: "Prendas",
      requerido: true,
      hecho: motivo === null,
      pendiente:
        elegir && origen === null
          ? "Primero elige la tienda."
          : elegir && catalogo.estado === "error"
            ? "No se pudo leer lo que tiene la tienda: usa «Reintentar»."
            : elegir && catalogo.estado === "listo" && catalogo.prendas.length === 0
              ? "Esa tienda no tiene prendas para enviarte: prueba con otra."
              : "Elige al menos una prenda.",
    },
    { id: "nota", nombre: "Nota", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién registra." },
  ];
  const guia = useGuiaCampos(campos);

  function cambiarFija(varianteId: string, delta: number) {
    setFijas((ls) => ls.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: ajustarCantidad(l.cantidad, delta, l.disponibleEnOrigen) } : l)));
  }

  function elegirSede(id: string) {
    setSedeId(id);
    // Las prendas son de la otra tienda: cambiar de tienda empieza el pedido de cero.
    setElegidas([LINEA_ELEGIDA_VACIA]);
  }

  function elegirPrenda(i: number, varianteId: string) {
    setElegidas((ls) => ls.map((l, n) => (n === i ? conPrendaElegida(varianteId, catalogo.prendas) : l)));
  }

  function cambiarElegida(i: number, delta: number) {
    setElegidas((ls) =>
      ls.map((l, n) => {
        if (n !== i) return l;
        const tope = catalogo.prendas.find((p) => p.varianteId === l.varianteId)?.disponible ?? 0;
        return { ...l, cantidad: ajustarCantidad(l.cantidad, delta, tope) };
      }),
    );
  }

  async function pedir(cerrar: () => void) {
    if (motivo || !responsable.listo || !origen) return;
    setEnviando(true);
    const aPedir = lineasParaRpc(lineas);
    const { data, error } = await firmar(
      createClient().rpc("pedir_a_otra_sede", {
        p_ubicacion_id: ubicacionId,
        p_origen_id: origen.id,
        p_lineas: aPedir,
        p_nota: nota.trim() || undefined,
        p_token: tokenDelIntento(JSON.stringify([origen.id, aPedir, nota.trim()])),
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "pedir las prendas", { confirmarAntesDeRepetir: true }));
    // «Guardado», no «enviado»: la otra tienda no recibe ningún aviso solo (el menú no lo cuenta); lo ve al abrir Traslados.
    avisar.exito(`Pedido guardado para ${origen.nombre}`, { detalle: `${textoPrendas(total)}. Avísales: lo ven en Traslados cuando abran la pantalla.` });
    if (typeof data === "string") onPedido?.(data);
    router.refresh();
    cerrar();
  }

  const nombreOrigen = origen?.nombre ?? "esa tienda";
  const marcadorPrenda =
    catalogo.estado === "ocioso" ? "Primero elige la tienda" : catalogo.estado === "cargando" ? "Buscando lo que tiene…" : catalogo.estado === "error" ? "No se pudo leer" : "Elige la prenda";

  return (
    <Modal
      titulo={origen && !elegir ? `Pedir a ${origen.nombre}` : "Pedir a otra sede"}
      subtitulo="Para reponer: al llegar entra a tu stock."
      onClose={onCerrar}
      ancho="max-w-md"
      bloqueado={enviando}
    >
      {(cerrar) => (
        <div className="space-y-4">
          {elegir && (
            <CampoGuiado id="sede" guia={guia} titulo="A qué tienda le pides">
              <Desplegable
                id="pedir-sede"
                valor={sedeId}
                onValor={elegirSede}
                opciones={sedes.map((s) => ({ valor: s.id, texto: s.nombre }))}
                marcador="Elige la tienda"
                etiquetaAccesible="Tienda a la que le pides"
                deshabilitado={enviando}
              />
            </CampoGuiado>
          )}

          <CampoGuiado id="prendas" guia={guia} titulo={elegir ? "Qué prendas" : undefined} retiene="fila">
            {elegir ? (
              <div className="space-y-2.5">
                {catalogo.estado === "error" && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sand bg-hueso px-3.5 py-3 text-sm text-tinta">
                    <span>No pudimos leer lo que tiene {nombreOrigen}.</span>
                    <button type="button" onClick={catalogo.reintentar} className="btn-cayla btn-secundario">
                      Reintentar
                    </button>
                  </div>
                )}
                {catalogo.estado === "listo" && catalogo.prendas.length === 0 && (
                  <p role="status" className="rounded-xl border border-sand bg-hueso px-3.5 py-3 text-sm text-tinta">
                    {nombreOrigen} no tiene prendas para enviarte ahora.
                  </p>
                )}
                {elegidas.map((l, i) => {
                  const ya = prendasYaElegidasEnOtras(elegidas, i);
                  const prenda = catalogo.prendas.find((p) => p.varianteId === l.varianteId);
                  return (
                    <div key={i} className="space-y-2 rounded-xl border border-sand p-3">
                      <Desplegable
                        id={`pedir-prenda-${i}`}
                        valor={l.varianteId}
                        onValor={(v) => elegirPrenda(i, v)}
                        opciones={catalogo.prendas.map((p) => ({ valor: p.varianteId, texto: `${p.etiqueta} — tiene ${p.disponible} para enviar`, deshabilitada: ya.has(p.varianteId) }))}
                        marcador={marcadorPrenda}
                        etiquetaAccesible={`Prenda ${i + 1}`}
                        deshabilitado={enviando || catalogo.estado !== "listo" || catalogo.prendas.length === 0}
                      />
                      {(prenda || elegidas.length > 1) && (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-taupe">{prenda ? `${nombreOrigen} tiene ${prenda.disponible} para enviar` : "Elige la prenda"}</p>
                          <div className="flex items-center gap-2">
                            {prenda && <Contador etiqueta={prenda.etiqueta} cantidad={Math.min(l.cantidad, prenda.disponible)} tope={prenda.disponible} enviando={enviando} onCambiar={(d) => cambiarElegida(i, d)} />}
                            {elegidas.length > 1 && (
                              <button type="button" disabled={enviando} aria-label={`Quitar ${prenda?.etiqueta ?? "esta línea"}`} onClick={() => setElegidas((ls) => ls.filter((_, n) => n !== i))} className="text-xs text-rojo">
                                Quitar
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {catalogo.estado === "listo" && elegidas.length < Math.min(catalogo.prendas.length, TOPE_LINEAS_PEDIDO) && (
                  <button type="button" disabled={enviando} onClick={() => setElegidas((ls) => [...ls, LINEA_ELEGIDA_VACIA])} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
                    + Agregar otra prenda
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-sand rounded-xl border border-sand">
                {fijas.map((l) => (
                  <li key={l.varianteId} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-tinta">{l.etiqueta}</p>
                      <p className="text-xs text-taupe">
                        {l.disponibleEnOrigen > 0 ? `${nombreOrigen} tiene ${l.disponibleEnOrigen}` : `${nombreOrigen} ya no tiene`}
                      </p>
                    </div>
                    <Contador etiqueta={l.etiqueta} cantidad={l.cantidad} tope={l.disponibleEnOrigen} enviando={enviando} onCambiar={(d) => cambiarFija(l.varianteId, d)} />
                  </li>
                ))}
              </ul>
            )}
          </CampoGuiado>

          <CampoGuiado id="nota" guia={guia} titulo="Nota (opcional)">
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
              aria-label="Nota (opcional)"
              placeholder="Para el fin de semana" /* sugerir-fijo: una nota libre; el ejemplo no depende de la tienda ni de las prendas elegidas */
              className={campoTexto}
            />
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo para pedir." />
          {/* `pie-hoja-fijo`: «Mejor no» y «Pedir» no se van bajo el pliegue cuando la lista de prendas se alarga (globals.css). */}
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button
              type="button"
              disabled={enviando || !guia.puedeConfirmar || motivo !== null}
              title={responsable.motivo ?? guia.frase ?? motivo ?? undefined}
              onClick={() => pedir(cerrar)}
              className={`${botonPrimario} ${guia.claseConfirmar}`}
            >
              {enviando ? "Pidiendo…" : origen ? `Pedir a ${origen.nombre}` : "Pedir"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
