"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { MarcaNoDeducible } from "@/components/MarcaNoDeducible";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes, diaYHoraLima } from "@/lib/fechas-lima";
import { primerNombre } from "@/lib/fondos-reglas";
import {
  MAX_TEXTO_RENDICION,
  camposAprobar,
  detalleAprobada,
  etiquetaItem,
  fraseAprobar,
  fraseFaltanteSinExplicar,
  fraseSinFoto,
  lecturaLista,
  pieListaRevisar,
  resumenItems,
  textoPapel,
  type DecisionFaltante,
  type ItemRendicion,
  type Rendicion,
} from "@/lib/rendicion-reglas";
import { aprobarRendicion, devolverRendicion, leerItems } from "@/lib/rendicion-acciones";
import { VerFoto } from "./FotoDelGasto";

// «Revisar la rendición» (ADR-0362, fase 6 · actividad 5; decisiones 33–35, 54 y 69): la hoja de QUIEN APRUEBA, en Fondos por rendir.
// Lo que dijo el sistema al rendir (congelado), lo que la persona dijo que tiene, y cada pago y gasto con su papel (la foto se mira con un
// toque). Un faltante con explicación lo decide quien aprueba («Lo asume CAYLA» o «Queda como deuda de …»); sin explicación es deuda, sin
// elegir (54). Si quien mira no puede aprobar (es su fondo, le entregó plata en esta rendición, o es la de un líder y no es Admin), la
// hoja lo dice y el botón no se ofrece: decide la base, con quien de verdad firma. «Devolver para corregir» pide un motivo.
//
// Quién firma (decisión 39): con la cuenta de una persona no hay combo; desde una terminal, el combo «Responsable».

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function rechazoDe(error: Parameters<typeof traducirError>[0], que: string): Rechazo {
  if (error && esFalloDeRed(error)) {
    return { titulo: "Se cortó la conexión", texto: `No sabemos si alcanzó a ${que}. Vuelve a tocar el botón: si ya se guardó, no se repite.`, tono: "atencion" };
  }
  return { titulo: "No se guardó", texto: traducirError(error, que), tono: "error" };
}

// `deuda`: lo que la persona ya debe por faltantes aprobados (/formidable 2026-10-14, cambio 3): el faltante de ahora dice en qué queda.
// Quien no puede aprobar (`porQueNoAprueba`) ve «Revisar» en secundario: puede mirarla y devolverla, pero no compite con «Entregar plata».
export function RevisarRendicion({ rendicion, deuda = 0 }: { rendicion: Rendicion; deuda?: number }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso={rendicion.porQueNoAprueba ? "fantasma" : "primario"}
        data-guia="fondos.revisar"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        Revisar
      </Boton>
      {abierta && <RevisarRendicionModal r={rendicion} deuda={deuda} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function RevisarRendicionModal({
  r,
  deuda,
  onClose,
  volverA,
}: {
  r: Rendicion;
  deuda: number;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ItemRendicion[] | null>(null);
  // Una lectura que falla no es una lista vacía (/formidable 2026-10-14, cambio 2): lo dice, ofrece volver a intentar y «Aprobar» espera.
  const [falla, setFalla] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [decision, setDecision] = useState<DecisionFaltante | "">("");
  const [nota, setNota] = useState("");
  const [devolviendo, setDevolviendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const enVuelo = useRef(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const nombre = primerNombre(r.persona);

  useEffect(() => {
    let vigente = true;
    void leerItems(r.id).then((x) => {
      if (!vigente) return;
      setFalla(Boolean(x.error));
      setItems(x.error ? null : x.items);
    });
    return () => {
      vigente = false;
    };
  }, [r.id, vuelta]);
  const lectura = lecturaLista(items, falla);
  const reintentar = () => {
    setFalla(false);
    setItems(null);
    setVuelta((v) => v + 1);
  };

  const campos = camposAprobar(r, { decision, nota }, { esPersona, listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  const conFaltante = r.faltante > 0.005;
  const debe = r.saldo < -0.005;
  const firma = (clave: "fondo_rendicion_aprobar" | "fondo_rendicion_devolver") => (esPersona ? firmaOmitida(clave) : responsable.firma());

  async function aprobar() {
    if (guardando || enVuelo.current || r.porQueNoAprueba || lectura !== "lista") return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const { error } = await aprobarRendicion(
        { p_id: r.id, p_decision: conFaltante && r.explicacion && decision ? decision : null, p_nota: nota.trim() || null },
        firma("fondo_rendicion_aprobar"),
      );
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error) {
        setRechazo(rechazoDe(error, "aprobar la rendición"));
        return;
      }
      const d = r.explicacion && decision ? decision : "deuda_persona";
      avisar.exito(`Aprobaste la rendición de ${nombre}`, {
        detalle: !conFaltante ? "Cuadró. Su fondo sigue con lo que tiene en la mano." : detalleAprobada(r.faltante, d, nombre, deuda),
      });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  async function devolver() {
    if (guardando || enVuelo.current || !motivo.trim()) return;
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const { error } = await devolverRendicion({ p_id: r.id, p_motivo: motivo.trim() }, firma("fondo_rendicion_devolver"));
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error) {
        setRechazo(rechazoDe(error, "devolver la rendición"));
        return;
      }
      avisar.exito(`Le devolviste la rendición a ${nombre}`, { detalle: "La corrige y la vuelve a rendir." });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  const fila = (texto: string, monto: string, clase = "text-tinta/80") => (
    <div className={`flex items-baseline justify-between gap-3 ${clase}`}>
      <span>{texto}</span>
      <span className="whitespace-nowrap tabular-nums">{monto}</span>
    </div>
  );
  const sinFoto = items?.filter((i) => i.conFoto === false).length ?? r.sinFoto;

  return (
    <Modal
      titulo={`Rendición de ${nombre}`}
      subtitulo={`La rindió el ${r.rendidaEn ? diaYHoraLima(r.rendidaEn).dia : "—"}${items ? ` · ${resumenItems(items)}` : ""}`}
      onClose={onClose}
      variante="hoja"
      ancho="max-w-xl"
      alCerrarEnfocar={volverA}
      conCerrar
    >
      {() => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void aprobar();
          }}
          className="space-y-5"
        >
          <section className="space-y-2 text-sm">
            <TituloGrupo>Lo que dijo el sistema al rendir</TituloGrupo>
            {Math.abs(r.arrastre) > 0.005 && fila(r.arrastre > 0 ? "Tenía de su rendición anterior" : "CAYLA le debía de antes", soles(Math.abs(r.arrastre)))}
            {(r.entregado > 0.005 || Math.abs(r.arrastre) <= 0.005) && fila("Le entregaron", soles(r.entregado))}
            {r.devuelto > 0.005 && fila("Devolvió", `−${soles(r.devuelto)}`)}
            {r.pagado > 0.005 && fila("Pagó a proveedores", `−${soles(r.pagado)}`)}
            {r.gastos > 0.005 && fila("Gastos del viaje", `−${soles(r.gastos)}`)}
            {debe
              ? fila("CAYLA le debe", soles(-r.saldo), "border-t border-sand pt-2 font-semibold text-tinta")
              : fila("Debería tener", soles(r.saldo), "border-t border-sand pt-2 font-semibold text-tinta")}
            {fila("Dice que tiene en la mano", soles(r.efectivo), "font-semibold text-tinta")}
            {conFaltante ? (
              <Aviso tono="atencion" titulo={`Faltan ${soles(r.faltante)}`} chico>
                {r.explicacion ? `«${r.explicacion}»` : fraseFaltanteSinExplicar(r.faltante, deuda)}
              </Aviso>
            ) : (
              <p className="text-xs font-medium text-verde-profundo">Cuadra.</p>
            )}
          </section>

          <section className="space-y-2">
            {/* «Le entregaron» dentro de «Lo que rindió» confundía (prueba ciega 1): la lista es todo lo que movió su fondo. */}
            <TituloGrupo cuenta={items ? items.length : undefined}>Lo que entró y salió de su fondo</TituloGrupo>
            {lectura === "falla" ? (
              <Aviso
                tono="atencion"
                titulo="No pude traer lo que rindió"
                chico
                accion={
                  <button type="button" className="btn-cayla btn-enlace" onClick={reintentar}>
                    Volver a intentar
                  </button>
                }
              >
                Las cifras de arriba sí están al día.
              </Aviso>
            ) : items === null ? (
              <div aria-hidden className="space-y-2">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="h-11 animate-pulse rounded-lg bg-tinta/5" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-sand rounded-xl border border-sand">
                {items.map((i) => (
                  <li key={i.clave} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-tinta">{etiquetaItem(i, "revisa")}</p>
                      <p className="truncate text-xs text-taupe" title={i.detalle}>
                        {i.detalle || "—"}
                        {i.fecha ? ` · ${diaMes(i.fecha)}` : ""}
                      </p>
                      {i.conFoto !== null && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Chip tono={i.conFoto ? "verde" : "ambar"}>{textoPapel(i)}</Chip>
                          {i.tipo === "gasto" && i.refId && i.conFoto && <VerFoto gastoId={i.refId} />}
                        </div>
                      )}
                      <MarcaNoDeducible nd={i.noDeducible} montoDeLaFila={i.monto} className="mt-1" />
                    </div>
                    <span className={`shrink-0 whitespace-nowrap tabular-nums ${i.monto >= 0 ? "text-verde-profundo" : "text-tinta"}`}>
                      {i.monto >= 0 ? `+${soles(i.monto)}` : soles(-i.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {fraseSinFoto(sinFoto, "revisa") && <p className="nota-cayla text-xs">{fraseSinFoto(sinFoto, "revisa")}</p>}
          </section>

          {r.porQueNoAprueba ? (
            <Aviso tono="info" titulo="Esta rendición la aprueba otra persona">
              {r.porQueNoAprueba}
            </Aviso>
          ) : (
            <>
              {conFaltante && r.explicacion && (
                <CampoGuiado id="decision" guia={guia} titulo="¿Quién asume lo que falta?">
                  <SegmentoDeslizante
                    etiqueta="Quién asume lo que falta"
                    valor={decision}
                    onCambio={(v: string) => {
                      setRechazo(null);
                      setDecision(v as DecisionFaltante);
                    }}
                    opciones={[
                      { clave: "asume_cayla", etiqueta: "Lo asume CAYLA" },
                      { clave: "deuda_persona", etiqueta: `Deuda de ${nombre}` },
                    ]}
                  />
                </CampoGuiado>
              )}
              <CampoGuiado id="nota" guia={guia} titulo="Nota · opcional">
                <CampoTexto
                  etiqueta="Nota · opcional"
                  caja
                  maxLength={MAX_TEXTO_RENDICION}
                  // sugerir-fijo: la nota de quien aprueba no depende de nada elegido en la hoja.
                  placeholder="Ej. Revisado con las boletas"
                  value={nota}
                  disabled={guardando}
                  onChange={(e) => {
                    setRechazo(null);
                    setNota(e.target.value);
                  }}
                />
              </CampoGuiado>
              {!esPersona && (
                <CampoGuiado id="responsable" guia={guia} titulo="Quién aprueba">
                  <ComboResponsable control={responsable} deshabilitado={guardando} />
                </CampoGuiado>
              )}
            </>
          )}

          {devolviendo && (
            <CampoTexto
              etiqueta="¿Qué tiene que corregir?"
              caja
              maxLength={MAX_TEXTO_RENDICION}
              // sugerir-fijo: el motivo de devolver una rendición no depende de nada elegido en la hoja.
              placeholder="Ej. Falta la foto de la boleta del flete"
              value={motivo}
              disabled={guardando}
              onChange={(e) => {
                setRechazo(null);
                setMotivo(e.target.value);
              }}
            />
          )}

          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          {!r.porQueNoAprueba && !devolviendo && <PieGuia guia={guia} listo={pieListaRevisar(lectura) ?? "Todo listo para aprobar."} conFrase />}
          <div className="pie-hoja-fijo flex flex-wrap justify-end gap-3 pt-1">
            {devolviendo ? (
              <>
                <Boton type="button" onClick={() => setDevolviendo(false)} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton type="button" peso="peligro" cargando={guardando} disabled={!motivo.trim()} onClick={() => void devolver()}>
                  {guardando ? "Devolviendo…" : "Devolver para corregir"}
                </Boton>
              </>
            ) : (
              <>
                <Boton type="button" peso="fantasma" onClick={() => setDevolviendo(true)} disabled={guardando}>
                  Devolver para corregir
                </Boton>
                {!r.porQueNoAprueba && (
                  <Boton
                    type="submit"
                    peso="primario"
                    cargando={guardando}
                    disabled={!guia.puedeConfirmar || lectura !== "lista"}
                    title={pieListaRevisar(lectura) ?? guia.frase ?? undefined}
                    className={guia.claseConfirmar}
                  >
                    {guardando ? "Aprobando…" : fraseAprobar(r, decision, deuda)}
                  </Boton>
                )}
              </>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
