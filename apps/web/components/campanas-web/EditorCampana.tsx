"use client";

import { useRef, useState } from "react";
import { Ban, Bubbles, Check, Heart, Leaf, PartyPopper, PawPrint, RotateCcw, Sparkles, Star, createLucideIcon, type LucideIcon } from "lucide-react";
import {
  AMBIENTES_CAMPANA,
  CUENTAS_CAMPANA,
  DURACIONES_CAMPANA,
  EFECTOS_CAMPANA,
  ENTRADAS_CAMPANA,
  FRANJAS_CAMPANA,
  INTENSIDADES_CAMPANA,
  NOMBRE_DE_CUENTA,
  NOMBRE_DE_DURACION,
  NOMBRE_DE_EFECTO,
  NOMBRE_DE_INTENSIDAD,
  esColorHex,
  type AmbienteCampana,
  type EfectoCampana,
} from "@cayla-retail/shared";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto, Interruptor } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { PreviewCampana, type PiezaDeVista } from "./PreviewCampana";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import {
  borradorDe,
  coloresDelBorrador,
  PIEZAS_DONDE,
  conAcento,
  conAmbiente,
  conDonde,
  conMovimiento,
  conPaleta,
  errorDeCampanas,
  hayDonde,
  leerFichaCampana,
  lecturaDelBorrador,
  parcheDeCambios,
  type BorradorDiseno,
  type FichaCampana,
} from "@/lib/campanas-web-editor";
import { camposDeDiseno } from "@/lib/campanas-web-guia";

type Paso = "ambiente" | "colores" | "movimiento" | "donde";

/** Un pétalo y un copo de nieve con el MISMO dibujo de lo que cae en la vista previa y en la tienda (`campana-efectos.css`): el líder elige por el ícono. */
const Petalo = createLucideIcon("petalo", [["path", { d: "M12 2C8 6.5 6 10 6 14.5a6 6 0 0 0 12 0C18 10 16 6.5 12 2z" }]]);
const Copo = createLucideIcon("copo", [
  ["path", { d: "M12 2v20" }],
  ["path", { d: "m4.2 7 15.6 10" }],
  ["path", { d: "M4.2 17 19.8 7" }],
  ["path", { d: "m9.5 4 2.5 2.5L14.5 4" }],
  ["path", { d: "m9.5 20 2.5-2.5 2.5 2.5" }],
]);

/** Un ícono por efecto: el líder lo elige mirando, sin palabras (su nombre sale al pasar el mouse y bajo la cuadrícula). */
const ICONO_DE_EFECTO: Record<EfectoCampana, LucideIcon> = {
  ninguno: Ban, destellos: Sparkles, confeti: PartyPopper, petalos: Petalo, copos: Copo, corazones: Heart, estrellas: Star, hojas: Leaf, burbujas: Bubbles, patitas: PawPrint,
};

/** Los nombres cortos con que caben en la columna de los pasos (los largos, de `@cayla-retail/shared`, salen en la guía y el resumen). */
const CORTO_FRANJA = { rota: "Rota", marquesina: "Marquesina", quieta: "Quieta" } as const;
const CORTO_ENTRADA = { telon: "Telón", caen: "Prendas caen", aparece: "Aparece", ninguna: "Ninguna" } as const;

/** Las cinco piezas de la tienda que el diseño puede vestir, en palabras de tienda. */
const PIEZAS: Record<(typeof PIEZAS_DONDE)[number], { titulo: string; ayuda: string }> = {
  franja: { titulo: "La franja de arriba", ayuda: "Una frase con el nombre, el % y la fecha" },
  portada: { titulo: "La portada", ayuda: "La cabecera grande con el titular y los botones" },
  catalogo: { titulo: "Una banda en el catálogo", ayuda: "Una tarjeta con el nombre de la campaña sobre las prendas" },
  sello: { titulo: "El sello en cada prenda", ayuda: "El descuento sobre la foto y el precio rebajado" },
  bolsa: { titulo: "La línea en la bolsa", ayuda: "Dice de qué campaña es el descuento" },
};

/**
 * Tienda web ▸ Campañas ▸ el editor de diseño de una campaña (maqueta docs/maquetas/campanas-tienda-2026-10, pantalla 2). Esta entrega: elegir
 * el ambiente y los colores, ver cómo queda la portada y guardar el borrador. Movimiento, textos, imagen propia y «dónde se ve» llegan en las
 * actividades que siguen. Guardar firma el «Responsable» (ADR-0162); si otra persona cambió la campaña mientras estaba abierta, la base lo dice
 * y no pisa nada. Un borrador no se ve en la tienda: eso lo decide programar.
 */
export function EditorCampana({ ficha }: { ficha: FichaCampana }) {
  const responsable = useResponsable();
  const terminada = ficha.campana.estado === "fin";
  // Lo guardado y su versión: tras cada guardado se reemplazan por lo que devuelve la base.
  const [guardado, setGuardado] = useState<BorradorDiseno>(() => borradorDe(ficha));
  const [version, setVersion] = useState<number | null>(ficha.diseno?.version ?? null);
  const [borrador, setBorrador] = useState<BorradorDiseno>(() => borradorDe(ficha));
  const [paso, setPaso] = useState<Paso>("ambiente");
  const [vista, setVista] = useState<"computador" | "celular">("computador");
  const [pieza, setPieza] = useState<PiezaDeVista>("portada");
  // «Ver la entrada otra vez» y «Movimiento reducido»: solo cambian cómo se mira la vista previa, nunca lo guardado.
  const [vuelta, setVuelta] = useState(0);
  const [quieto, setQuieto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  // Un doble clic no manda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);

  const guia = useGuiaCampos(camposDeDiseno(borrador, { responsableListo: responsable.listo, responsableMotivo: responsable.motivo }), { enModal: false });
  const parche = parcheDeCambios(guardado.plantilla ? guardado : null, borrador);
  const colores = coloresDelBorrador(borrador);
  const lectura = lecturaDelBorrador(borrador);
  const ambiente = AMBIENTES_CAMPANA.find((a) => a.clave === borrador.plantilla) ?? null;
  const puedeGuardar = !terminada && parche !== null && guia.puedeConfirmar;

  function elegirAmbiente(clave: AmbienteCampana) {
    setBorrador((b) => conAmbiente(b, clave));
    setErrorGuardar(null);
    setPaso("colores");
  }

  async function guardar() {
    if (enVuelo.current || !puedeGuardar || !parche) return;
    enVuelo.current = true;
    setGuardando(true);
    setErrorGuardar(null);
    const { data, error } = await firmar(
      createClient().rpc("guardar_campana_diseno", { p_etiqueta_id: ficha.campana.id, p_version: version, p_diseno: parche as never }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      const propio = errorDeCampanas(`${error?.message ?? ""} ${error?.hint ?? ""}`);
      const frase = propio ? `${propio.titulo}. ${propio.detalle ?? ""}`.trim() : traducirError(error ?? { message: "sin respuesta" }, "guardar el diseño de la campaña");
      // Queda a la vista en la pantalla (con lo que hay que hacer), no en un aviso que se va solo.
      setErrorGuardar(frase);
      return;
    }
    const nueva = leerFichaCampana({ hoy: ficha.hoy, campana: { ...ficha.campana, diseno: null }, diseno: data });
    if (!nueva?.diseno) {
      setErrorGuardar("El diseño se guardó, pero no se pudo leer lo que quedó. Recarga la página.");
      return;
    }
    setGuardado(borradorDe(nueva));
    setBorrador(borradorDe(nueva));
    setVersion(nueva.diseno.version);
    avisar.exito("Borrador guardado");
  }

  return (
    <div className="space-y-5">
      {terminada && (
        <Aviso tono="info" titulo="Esta campaña ya terminó">
          Su diseño ya no se cambia: la tienda volvió sola a verse como siempre.
        </Aviso>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <PasoDelEditor
            numero={1}
            titulo="Ambiente"
            resumen={ambiente ? ambiente.nombre : "Elige cómo se va a sentir la tienda"}
            hecho={borrador.plantilla !== null}
            abierto={paso === "ambiente"}
            onAbrir={() => setPaso("ambiente")}
            guia="campana-editor.ambiente"
          >
            <CampoGuiado id="ambiente" guia={guia}>
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Ambiente de la campaña">
                {AMBIENTES_CAMPANA.map((a) => {
                  const p = a.paletas[0];
                  const puesto = borrador.plantilla === a.clave;
                  return (
                    // unificar-fijo: tarjeta de opción con su muestra de color; ninguna pieza del sistema elige entre fondos de color (ADR-0358, a decidir con Felipe).
                    <button
                      key={a.clave}
                      type="button"
                      aria-pressed={puesto}
                      disabled={terminada || guardando}
                      onClick={() => elegirAmbiente(a.clave)}
                      className={`flex flex-col gap-1 rounded-xl border p-2 text-left transition-colors ${puesto ? "border-tinta bg-papel shadow-[0_0_0_1px_var(--color-tinta)]" : "border-sand bg-crema hover:bg-hueso"}`}
                    >
                      <span className="relative block h-14 rounded-lg" style={{ backgroundColor: p.fondo, color: p.texto }} data-color-dato>
                        <b className="absolute bottom-2 left-2 font-sans text-sm uppercase tracking-wide">Aa</b>
                        <i className="absolute right-2 top-2 block h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.acento }} />
                      </span>
                      <b className="text-[13px] font-semibold">{a.nombre}</b>
                      <small className="text-[11.5px] leading-snug text-tinta/65">{a.para}</small>
                    </button>
                  );
                })}
              </div>
            </CampoGuiado>
            <p className="nota-cayla mt-3">
              Cada ambiente es un diseño ya probado: sus colores, sus letras y su movimiento. Tú eliges y ajustas; no se escribe código. ¿Falta uno? Se
              pide y lo agrega el equipo.
            </p>
          </PasoDelEditor>

          <PasoDelEditor
            numero={2}
            titulo="Colores"
            resumen={!ambiente ? "Primero elige el ambiente" : borrador.acento ? `Color propio ${borrador.acento}` : ambiente.paletas[borrador.paleta]?.nombre ?? ""}
            hecho={borrador.plantilla !== null && lectura.ok}
            falta={borrador.plantilla !== null && !lectura.ok}
            bloqueado={!ambiente}
            abierto={paso === "colores" && !!ambiente}
            onAbrir={() => setPaso("colores")}
            guia="campana-editor.colores"
          >
            {ambiente && (
              <div className="space-y-4">
                <CampoGuiado id="colores" guia={guia} titulo="Paleta del ambiente">
                  <div className="space-y-2" role="group" aria-label="Paleta del ambiente">
                    {ambiente.paletas.map((p, i) => {
                      const puesta = borrador.paleta === i && borrador.acento === null;
                      return (
                        // unificar-fijo: opción de paleta con sus tres colores de muestra; ninguna pieza del sistema elige entre paletas (ADR-0358, a decidir con Felipe).
                        <button
                          key={p.nombre}
                          type="button"
                          aria-pressed={puesta}
                          disabled={terminada || guardando}
                          onClick={() => setBorrador((b) => conPaleta(b, i))}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[13px] transition-colors ${puesta ? "border-tinta bg-papel shadow-[0_0_0_1px_var(--color-tinta)]" : "border-sand bg-crema hover:bg-hueso"}`}
                        >
                          <span className="font-semibold">{p.nombre}</span>
                          <span className="flex gap-1" aria-hidden data-color-dato>
                            {[p.fondo, p.texto, p.acento].map((c) => (
                              <i key={c} className="block h-5 w-5 rounded-full border border-tinta/15" style={{ backgroundColor: c }} />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CampoGuiado>

                <CampoGuiado id="acento" guia={guia} titulo="Color de acento propio" ayuda="Opcional · cambia el botón y la palabra de color">
                  <AcentoPropio
                    valor={colores?.acento ?? ""}
                    propio={borrador.acento !== null}
                    deshabilitado={terminada || guardando}
                    onCambio={(hex) => setBorrador((b) => conAcento(b, hex))}
                  />
                </CampoGuiado>

                <div data-guia="campana-editor.lectura">
                  <p className="campo-etiqueta">¿Se lee bien?</p>
                  <ul className="mt-2 space-y-1.5 text-[13px]">
                    {lectura.items.map((x) => (
                      <li key={x.nombre} className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${x.ok ? "bg-verde/15 text-verde" : "bg-rojo/10 text-rojo-profundo"}`} aria-hidden>
                          {x.ok ? <Check className="h-3 w-3" /> : "!"}
                        </span>
                        <span className="min-w-0 flex-1">{x.nombre}</span>
                        <b className="tabular-nums">{x.ratio.toFixed(1)} : 1</b>
                        <span className="sr-only">{x.ok ? "se lee bien" : `no se lee: pide al menos ${x.minimo} : 1`}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="nota-cayla mt-3">
                    Si un color no se lee bien, la campaña no se programa. Así ninguna campaña deja la tienda con letras que no se ven.
                  </p>
                </div>
              </div>
            )}
          </PasoDelEditor>

          <PasoDelEditor
            numero={3}
            titulo="Movimiento"
            resumen={!ambiente ? "Primero elige el ambiente" : resumenDelMovimiento(borrador)}
            hecho={borrador.plantilla !== null}
            bloqueado={!ambiente}
            abierto={paso === "movimiento" && !!ambiente}
            onAbrir={() => setPaso("movimiento")}
            guia="campana-editor.movimiento"
          >
            {ambiente && (
              <div className="space-y-4">
                <CampoGuiado id="movimiento" guia={guia} titulo="Franja de arriba" ayuda="Opcional · nace con el movimiento de su ambiente">
                  <SegmentoDeslizante
                    opciones={FRANJAS_CAMPANA.map((v) => ({ clave: v, etiqueta: CORTO_FRANJA[v] }))}
                    valor={borrador.franja}
                    onCambio={(v) => setBorrador((b) => conMovimiento(b, "franja", v as typeof borrador.franja))}
                    etiqueta="Cómo corre la franja de arriba"
                  />
                </CampoGuiado>
                <div>
                  <p className="campo-etiqueta mb-1.5">Cómo entra la portada</p>
                  <SegmentoDeslizante
                    opciones={ENTRADAS_CAMPANA.filter((v) => v !== "aparece").map((v) => ({ clave: v, etiqueta: CORTO_ENTRADA[v] }))}
                    valor={borrador.entrada}
                    onCambio={(v) => {
                      setBorrador((b) => conMovimiento(b, "entrada", v as typeof borrador.entrada));
                      setVuelta((n) => n + 1);
                    }}
                    etiqueta="Cómo entra la portada"
                  />
                </div>
                <div>
                  <p className="campo-etiqueta mb-1.5">Efecto de ambiente</p>
                  <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Efecto de ambiente">
                    {EFECTOS_CAMPANA.map((e) => {
                      const Icono = ICONO_DE_EFECTO[e];
                      // unificar-fijo: cuadrícula de íconos para elegir el efecto sin palabras (Felipe 2026-10-20); ninguna pieza del sistema elige así.
                      return (
                        <button
                          key={e}
                          type="button"
                          title={NOMBRE_DE_EFECTO[e]}
                          aria-label={NOMBRE_DE_EFECTO[e]}
                          aria-pressed={borrador.efecto === e}
                          disabled={terminada || guardando}
                          onClick={() => {
                            setBorrador((b) => conMovimiento(b, "efecto", e));
                            setVuelta((n) => n + 1);
                          }}
                          className={`flex h-11 items-center justify-center rounded-xl border transition-colors ${borrador.efecto === e ? "border-tinta bg-tinta text-crema" : "border-sand bg-crema text-tinta hover:bg-hueso"}`}
                        >
                          <Icono className="h-4 w-4" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[12px] text-tinta/65">
                    Elegido: <b className="text-tinta">{NOMBRE_DE_EFECTO[borrador.efecto]}</b>
                  </p>
                </div>
                {borrador.efecto !== "ninguno" && (
                  <>
                    <div>
                      <p className="campo-etiqueta mb-1.5">Cuánto</p>
                      <SegmentoDeslizante
                        opciones={INTENSIDADES_CAMPANA.map((v) => ({ clave: v, etiqueta: NOMBRE_DE_INTENSIDAD[v] }))}
                        valor={borrador.intensidad}
                        onCambio={(v) => setBorrador((b) => conMovimiento(b, "intensidad", v as typeof borrador.intensidad))}
                        etiqueta="Cuánto efecto"
                      />
                    </div>
                    <div>
                      <p className="campo-etiqueta mb-1.5">Cuánto dura</p>
                      <SegmentoDeslizante
                        opciones={DURACIONES_CAMPANA.map((v) => ({ clave: v, etiqueta: NOMBRE_DE_DURACION[v] }))}
                        valor={borrador.duracion}
                        onCambio={(v) => {
                          setBorrador((b) => conMovimiento(b, "duracion", v as typeof borrador.duracion));
                          setVuelta((n) => n + 1);
                        }}
                        etiqueta="Cuánto dura el efecto"
                      />
                    </div>
                  </>
                )}
                <div>
                  <p className="campo-etiqueta mb-1.5">Cuenta regresiva</p>
                  <SegmentoDeslizante
                    opciones={CUENTAS_CAMPANA.map((v) => ({ clave: v, etiqueta: NOMBRE_DE_CUENTA[v] }))}
                    valor={borrador.cuenta}
                    onCambio={(v) => setBorrador((b) => conMovimiento(b, "cuenta", v as typeof borrador.cuenta))}
                    etiqueta="Cuándo se ve la cuenta regresiva"
                  />
                </div>
                <Boton type="button" onClick={() => setVuelta((n) => n + 1)}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Ver la entrada otra vez
                </Boton>
                <p className="nota-cayla">
                  Quien tiene «reducir movimiento» en su celular o computador no ve nada de esto: la tienda se queda quieta. Pruébalo con el botón de la vista previa.
                </p>
              </div>
            )}
          </PasoDelEditor>

          <PasoDelEditor
            numero={4}
            titulo="Dónde se ve"
            resumen={!ambiente ? "Primero elige el ambiente" : `${PIEZAS_DONDE.filter((k) => borrador.donde[k]).length} de ${PIEZAS_DONDE.length} piezas`}
            hecho={borrador.plantilla !== null && hayDonde(borrador)}
            falta={borrador.plantilla !== null && !hayDonde(borrador)}
            bloqueado={!ambiente}
            abierto={paso === "donde" && !!ambiente}
            onAbrir={() => setPaso("donde")}
            guia="campana-editor.donde"
          >
            {ambiente && (
              <CampoGuiado id="donde" guia={guia}>
                <div className="space-y-3">
                  {PIEZAS_DONDE.map((k) => (
                    <Interruptor
                      key={k}
                      activo={borrador.donde[k]}
                      onActivo={(v) => setBorrador((b) => conDonde(b, k, v))}
                      disabled={terminada || guardando}
                      etiqueta={<b className="font-semibold text-tinta">{PIEZAS[k].titulo}</b>}
                      pie={PIEZAS[k].ayuda}
                    />
                  ))}
                  <p className="nota-cayla">Se ve en las tiendas que ya tiene la campaña. Si una pieza se apaga, esa parte de la tienda se ve como siempre.</p>
                </div>
              </CampoGuiado>
            )}
          </PasoDelEditor>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start" data-guia="campana-editor.vista">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentoDeslizante
              forma="modo"
              opciones={[
                { clave: "portada", etiqueta: "Portada" },
                { clave: "catalogo", etiqueta: "Catálogo" },
                { clave: "bolsa", etiqueta: "Bolsa" },
              ]}
              valor={pieza}
              onCambio={(v) => setPieza(v as PiezaDeVista)}
              etiqueta="Qué parte de la tienda ver"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SegmentoDeslizante
                forma="modo"
                opciones={[
                  { clave: "computador", etiqueta: "Computador" },
                  { clave: "celular", etiqueta: "Celular" },
                ]}
                valor={vista}
                onCambio={(v) => setVista(v as "computador" | "celular")}
                etiqueta="Tamaño de la vista previa"
              />
              <button type="button" className="btn-cayla btn-secundario btn-chico" aria-pressed={quieto} onClick={() => setQuieto((q) => !q)}>
                Movimiento reducido
              </button>
            </div>
          </div>
          <div className={vista === "celular" ? "mx-auto max-w-[22rem]" : ""}>
            <PreviewCampana
              key={vuelta}
              colores={colores}
              nombre={ficha.campana.nombre}
              pct={ficha.campana.pct}
              hasta={ficha.campana.hasta}
              celular={vista === "celular"}
              pieza={pieza}
              movimiento={{ franja: borrador.franja, entrada: borrador.entrada, efecto: borrador.efecto, intensidad: borrador.intensidad, duracion: borrador.duracion, cuenta: borrador.cuenta }}
              donde={borrador.donde}
              quieto={quieto}
            />
          </div>
          <p className="text-[12px] text-taupe">Es un dibujo para decidir los colores; la tienda de verdad se ve con las fotos de las prendas.</p>
        </div>
      </div>

      {errorGuardar && (
        <Aviso tono="error" titulo="No se pudo guardar el diseño">
          {errorGuardar}
        </Aviso>
      )}

      <div className="pie-hoja-fijo flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-sand pt-4">
        <div className="min-w-[16rem] flex-1 space-y-2">
          <CampoGuiado id="responsable" guia={guia}>
            <div data-guia="campana-editor.responsable" className="max-w-sm">
              <ComboResponsable control={responsable} deshabilitado={guardando || terminada} />
            </div>
          </CampoGuiado>
          <PieGuia guia={guia} listo={parche === null ? "No cambiaste nada." : "Todo listo."} />
        </div>
        <div className="pie-acciones" data-guia="campana-editor.guardar">
          <Boton
            type="button"
            peso="primario"
            cargando={guardando}
            textoCargando="Guardando…"
            disabled={!puedeGuardar}
            title={terminada ? "La campaña ya terminó" : (guia.frase ?? undefined)}
            className={guia.claseConfirmar}
            onClick={guardar}
          >
            Guardar borrador
          </Boton>
        </div>
      </div>
    </div>
  );
}

function PasoDelEditor({
  numero,
  titulo,
  resumen,
  hecho,
  falta = false,
  bloqueado = false,
  abierto,
  onAbrir,
  guia,
  children,
}: {
  numero: number;
  titulo: string;
  resumen: string;
  hecho: boolean;
  falta?: boolean;
  bloqueado?: boolean;
  abierto: boolean;
  onAbrir: () => void;
  guia: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card-cayla ${abierto ? "" : "opacity-95"}`} data-guia={guia}>
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={onAbrir} aria-expanded={abierto} disabled={bloqueado}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${hecho && !falta ? "bg-verde text-crema" : "bg-sand text-tinta"}`} aria-hidden>
          {hecho && !falta ? <Check className="h-3.5 w-3.5" /> : numero}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-semibold">{titulo}</b>
          <small className="block truncate text-[12px] text-tinta/65">{resumen}</small>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{falta ? "Falta" : hecho ? "Listo" : bloqueado ? "" : "Sigue aquí"}</span>
      </button>
      {abierto && <div className="border-t border-sand px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

/** El color de acento propio: el selector del navegador y la caja con el #rrggbb; «Quitar» vuelve al de la paleta. */
function AcentoPropio({
  valor,
  propio,
  deshabilitado,
  onCambio,
}: {
  valor: string;
  propio: boolean;
  deshabilitado: boolean;
  onCambio: (hex: string | null) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const [anterior, setAnterior] = useState(valor);
  // Si el color cambia por fuera (otra paleta, «Quitar»), la caja lo sigue.
  if (valor !== anterior) {
    setAnterior(valor);
    setTexto(valor);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        value={esColorHex(valor) ? valor : "#000000"} // tema-fijo: valor inicial obligatorio del selector de color (no se pinta)
        disabled={deshabilitado}
        onChange={(e) => onCambio(e.target.value)}
        aria-label="Elegir el color de acento"
        className="h-10 w-12 cursor-pointer rounded-md border border-sand bg-transparent p-1"
      />
      <CampoTexto
        etiqueta="Color en hexadecimal"
        caja
        mono
        sinPie
        className="max-w-[9rem]"
        value={texto}
        maxLength={7}
        spellCheck={false}
        disabled={deshabilitado}
        onChange={(e) => {
          setTexto(e.target.value);
          if (esColorHex(e.target.value.trim())) onCambio(e.target.value.trim());
        }}
      />
      {propio && (
        <button type="button" className="btn-cayla btn-enlace" onClick={() => onCambio(null)} disabled={deshabilitado}>
          Quitar
        </button>
      )}
    </div>
  );
}

/** El movimiento en una línea, para el título del paso: «Destellos · una vez · franja rota». */
function resumenDelMovimiento(b: BorradorDiseno): string {
  const efecto = b.efecto === "ninguno" ? "Sin efecto" : `${NOMBRE_DE_EFECTO[b.efecto]} · ${b.duracion === "una" ? "una vez" : "continuo"}`;
  return `${efecto} · franja ${{ rota: "rota", marquesina: "en marquesina", quieta: "quieta" }[b.franja]}`;
}
