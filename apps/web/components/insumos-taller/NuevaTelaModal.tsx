"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { IdentidadAltaProveedor } from "@/components/alta-producto/IdentidadAlta";
import { Punto } from "@/components/alta-producto/Punto";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Campo, CampoTexto, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Modal } from "@/components/ui/Modal";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { proponerValorVocabulario } from "@/lib/alta-producto-ejes";
import type { ColorAlta } from "@/lib/alta-producto";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { traducirError } from "@/lib/error-escritura";
import type { VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import { CANTIDAD_ILEGIBLE, textoDeCompra, type CompraDeTela, type MaterialVista } from "@/lib/insumos-reglas";
import { MONTO_ILEGIBLE, montoIlegible } from "@/lib/monto-plata-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import {
  COMPRAS,
  camposDeTelaNueva,
  codigoDeVistaPrevia,
  metrosDeFila,
  numeroMalEscrito,
  payloadDeTelaNueva,
  problemasDeTelaNueva,
  rindeEscrito,
  telaParecida,
  tieneSaldo,
  type EntradaTelaNueva,
  type FilaDeColor,
} from "@/lib/tela-nueva-reglas";
import { sugerirInsumo } from "@/lib/sugerencias-insumos";
import { useResponsable } from "@/lib/useResponsable";

// «Nueva tela» (ADR-0554, actividad 2; Felipe 2026-10-28: «la parte de insumos es demasiado tediosa de completar»): UNA hoja para la tela y todos sus colores. Antes, una tela en cinco colores eran cinco altas de diez campos
// y otras cinco hojas para ingresar el lote. Aquí se dice qué tela es, cómo se compra (metro, kilo con su ancho y gramaje, o rollo con sus metros) y se eligen los colores de la MISMA carta de Catálogo; cada color trae su código
// (lo arma la base, nadie lo escribe) y, si ya hay saldo, su lote. Todo se guarda de una vez o no se guarda (`crear_material`). Con el mismo `<Modal>`, la guía de foco (ADR-0284) y el combo Responsable que el resto.
//
// También sirve para AGREGAR colores a una tela que ya existe (`agregarA`): el mismo botón de «¿Es la misma tela?» y, después, el de cada tela. Quien ve Producción en el Taller crea telas y colores; el saldo inicial (dinero)
// solo lo anota el líder (`puedeSaldo`): quien no lo es ni ve esas columnas, y la base lo rechazaría igual. Un reintento por un corte de red no duplica nada: el envío lleva un token.

const COLUMNAS_SALDO = { kilo: "kg", metro: "m", rollo: "rollos" } as const;

export function NuevaTelaModal({
  tallerId,
  materiales,
  vocabulario,
  leyoVocabulario,
  colores,
  leyoColores,
  puedeSaldo,
  agregarA = null,
  coloresDeLaTela = [],
  alElegirExistente,
  onClose,
}: {
  tallerId: string;
  /** Las telas que ya hay: de ahí salen el aviso de «¿es la misma?» y el número que sigue en el código. */
  materiales: MaterialVista[];
  vocabulario: VocabularioDeTelas;
  /** `false`: los tejidos no se pudieron leer; la hoja lo dice. */
  leyoVocabulario: boolean;
  /** La carta de colores de Catálogo. */
  colores: ColorAlta[];
  leyoColores: boolean;
  /** Quien guarda es el líder: puede anotar lo que ya hay de cada color, con su costo. */
  puedeSaldo: boolean;
  /** La tela a la que se le suman colores (la hoja pasa a ser «Agregar colores»). */
  agregarA?: MaterialVista | null;
  /** Los colores que esa tela ya tiene (no se vuelven a ofrecer). */
  coloresDeLaTela?: string[];
  /** «Agregar colores a esa»: la hoja de una tela nueva le cede el paso a la de agregar colores. */
  alElegirExistente?: (m: MaterialVista) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nombre, setNombre] = useState("");
  const [tejidos, setTejidos] = useState(vocabulario.tejidos);
  const [tejidoId, setTejidoId] = useState("");
  const [composicion, setComposicion] = useState("");
  const [compra, setCompra] = useState<CompraDeTela>("metro");
  const [ancho, setAncho] = useState("");
  const [gramaje, setGramaje] = useState("");
  const [metrosPorRollo, setMetrosPorRollo] = useState("");
  const [merma, setMerma] = useState("");
  const [filas, setFilas] = useState<FilaDeColor[]>([]);
  const [coloresCarta, setColoresCarta] = useState(colores);
  // El cursor vuelve al buscador de colores recién tras elegir el primero (para sumar varios tecleando), no al abrir la hoja: ahí le toca al nombre.
  const [eligioColor, setEligioColor] = useState(false);
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  // Un token por cada vez que se abre la hoja: si el envío viaja dos veces (un reintento tras una red que se cae), la base devuelve lo ya creado.
  const token = useRef<string>(crypto.randomUUID());

  // Con una tela elegida, lo que ya se sabe de ella (nombre, cómo se compra) viene de ella; el resto es solo los colores.
  const e: EntradaTelaNueva = agregarA
    ? {
        nombre: agregarA.nombre,
        tejidoId: agregarA.tejidoId ?? "",
        composicion: agregarA.composicion ?? "",
        compra: agregarA.compra as CompraDeTela,
        ancho: agregarA.ancho === null ? "" : String(agregarA.ancho),
        gramaje: agregarA.gramaje === null ? "" : String(agregarA.gramaje),
        metrosPorRollo: agregarA.metrosPorRollo === null ? "" : String(agregarA.metrosPorRollo),
        merma: "",
        filas,
        puedeSaldo,
        responsableListo: responsable.listo,
      }
    : { nombre, tejidoId, composicion, compra, ancho, gramaje, metrosPorRollo, merma, filas, puedeSaldo, responsableListo: responsable.listo };
  const problemas = problemasDeTelaNueva(e);
  const campos = camposDeTelaNueva(e);
  const guia = useGuiaCampos(agregarA ? campos.filter((c) => c.id === "colores" || c.id === "quien") : campos);
  const parecida = agregarA ? null : telaParecida(nombre, materiales);
  const codigo = codigoDeVistaPrevia(e.nombre, materiales);
  const rinde = rindeEscrito(e);
  const unidadDeCompra = COLUMNAS_SALDO[e.compra];

  // Los colores que se pueden elegir: en una tela que ya existe, los que no tiene.
  const disponibles = useMemo(() => coloresCarta.filter((c) => !coloresDeLaTela.includes(c.codigo)), [coloresCarta, coloresDeLaTela]);
  const grupos = useMemo(() => agruparPorFamilia(disponibles, (c) => c.familiaColor), [disponibles]);
  const porCodigo = useMemo(() => new Map(coloresCarta.map((c) => [c.codigo, c])), [coloresCarta]);

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona escribió o eligió.
  const fotoActual = fotoFormulario({ nombre, tejidoId, composicion, compra, ancho, gramaje, metrosPorRollo, merma, filas });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Empezaste a describir una tela y todavía no se creó. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  function alternarColor(codigoColor: string) {
    setEligioColor(true);
    setFilas((fs) => (fs.some((f) => f.color === codigoColor) ? fs.filter((f) => f.color !== codigoColor) : [...fs, { color: codigoColor, ya: "", costo: fs.at(-1)?.costo ?? "", minimo: "" }]));
  }
  function cambiarFila(codigoColor: string, cambio: Partial<FilaDeColor>) {
    setFilas((fs) => fs.map((f) => (f.color === codigoColor ? { ...f, ...cambio } : f)));
  }

  // Un tejido que no está en la lista se crea aquí mismo (es el mismo vocabulario de Catálogo: nace aprobado, lo cree quien lo cree, ADR-0534).
  async function crearTejido(texto: string) {
    const limpio = texto.trim();
    if (!limpio) return;
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige primero quién lo anota.");
      return;
    }
    const { valor, error } = await proponerValorVocabulario("tejidos", limpio, responsable.encabezados());
    if (error || !valor) {
      avisar.error(error ?? "No se pudo crear el tejido.");
      return;
    }
    setTejidos((ts) => [...ts, { id: valor.id, nombre: valor.texto }].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    setTejidoId(valor.id);
    avisar.exito(`Tejido «${valor.texto}» creado`, { detalle: "Ya está en la lista de Catálogo." });
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (enVuelo.current) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0]);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      const { material, colores: paraLaBase } = payloadDeTelaNueva(e);
      // Las dos funciones son nuevas (ADR-0554) y los tipos generados todavía no las traen: la llamada se tipa a mano, como `guardar_insumos_orden`.
      const consulta = agregarA
        ? createClient().rpc("agregar_colores_a_material" as never, { p_material_id: agregarA.id, p_ubicacion_id: tallerId, p_colores: paraLaBase, p_token: token.current } as never)
        : createClient().rpc("crear_material" as never, { p_ubicacion_id: tallerId, p_material: material, p_colores: paraLaBase, p_token: token.current } as never);
      resultado = await firmar(consulta, responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // El envío lleva su token: repetirlo no duplica nada, así que no hace falta mirar antes de volver a intentar.
      avisar.error(traducirError(error, agregarA ? "agregar los colores" : "crear la tela"));
      return;
    }
    const n = filas.length;
    const conSaldo = filas.filter(tieneSaldo).length;
    avisar.exito(agregarA ? `${n} ${n === 1 ? "color" : "colores"} más en ${agregarA.nombre}` : `${e.nombre.trim()} ya está en Insumos`, {
      detalle: `${n} ${n === 1 ? "color" : "colores"}${conSaldo > 0 ? ` · ${conSaldo} con su saldo inicial` : ""}`,
    });
    cerrarTrasGuardar();
  }

  const n = filas.length;
  return (
    <Modal
      titulo={agregarA ? `Agregar colores a «${agregarA.nombre}»` : "Nueva tela"}
      subtitulo={agregarA ? `${agregarA.codigo} · ${textoDeCompra(agregarA)}` : "Una tela, todos sus colores, en un solo paso"}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <IdentidadAltaProveedor control={responsable}>
        <form onSubmit={guardar} className="mt-3.5 space-y-6">
          {!agregarA && (
            <>
              <section data-guia="prod-tela-nueva.que-es" className="space-y-3">
                <TituloGrupo>Qué tela es</TituloGrupo>
                <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                  <CampoGuiado id="nombre" guia={guia}>
                    <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre de la tela")} value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} placeholder={sugerirInsumo("tela", materiales).nombre} autoComplete="off" />
                  </CampoGuiado>
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-tinta/65">
                      Código <span className="font-normal normal-case tracking-normal text-tinta/60">· se arma solo</span>
                    </p>
                    <p className="flex h-12 items-center rounded-lg border border-dashed border-borde-control bg-hueso px-3 font-mono text-[15px] font-semibold text-tinta">
                      {codigo}
                    </p>
                  </div>
                </div>
                {parecida && (
                  <Aviso
                    tono="atencion"
                    titulo={parecida.igual ? `Ya existe «${parecida.tela.nombre}» (${parecida.tela.codigo})` : `¿Es la misma que «${parecida.tela.nombre}» (${parecida.tela.codigo})?`}
                    accion={
                      alElegirExistente ? (
                        <Boton type="button" peso="fantasma" onClick={() => alElegirExistente(parecida.tela)}>
                          Agregar colores a esa
                        </Boton>
                      ) : undefined
                    }
                  >
                    Si es la misma, agrégale los colores que le faltan en vez de crearla otra vez.
                  </Aviso>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoGuiado id="tejido" guia={guia}>
                    <Campo etiqueta={guia.etiqueta("tejido", "Tejido")} sinPie>
                      {leyoVocabulario ? (
                        <ComboBuscable
                          valor={tejidoId}
                          onValor={setTejidoId}
                          opciones={tejidos.map((t) => ({ valor: t.id, texto: t.nombre }))}
                          marcador="Busca o escribe el tejido"
                          etiquetaAccesible="Tejido de la tela"
                          crear={{ etiqueta: (t) => `+ Crear el tejido «${t.trim()}»`, onCrear: (t) => void crearTejido(t), pista: "¿Es nuevo? Escribe su nombre arriba" }}
                        />
                      ) : (
                        <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">No se pudieron cargar los tejidos. Cierra esta ventana y vuelve a abrirla; lo demás se puede guardar igual.</p>
                      )}
                    </Campo>
                  </CampoGuiado>
                  <CampoGuiado id="composicion" guia={guia}>
                    <CampoTexto
                      etiqueta={guia.etiqueta("composicion", "Composición")}
                      pie="Sale en la etiqueta de la prenda."
                      value={composicion}
                      onChange={(ev) => setComposicion(ev.target.value)}
                      maxLength={160}
                      placeholder="Escribe lo que dice la etiqueta del proveedor"
                    />
                  </CampoGuiado>
                </div>
              </section>

              <section data-guia="prod-tela-nueva.compra" className="space-y-3">
                <TituloGrupo>Cómo la compras</TituloGrupo>
                <CampoGuiado id="compra" guia={guia}>
                  <Segmentado etiqueta={guia.etiqueta("compra", "Se compra")} valor={compra} onValor={setCompra} opciones={COMPRAS} pie="El stock de la tela va siempre en metros; el kilo y el rollo se convierten." />
                  {compra === "kilo" && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <CampoTexto etiqueta="Ancho (cm)" inputMode="decimal" value={ancho} onChange={(ev) => setAncho(ev.target.value)} placeholder="160" tono={numeroMalEscrito(ancho) ? "error" : undefined} pie={numeroMalEscrito(ancho) ? CANTIDAD_ILEGIBLE : undefined} />
                      <CampoTexto etiqueta="Gramaje (g/m²)" inputMode="decimal" value={gramaje} onChange={(ev) => setGramaje(ev.target.value)} placeholder="180" tono={numeroMalEscrito(gramaje) ? "error" : undefined} pie={numeroMalEscrito(gramaje) ? CANTIDAD_ILEGIBLE : undefined} />
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-tinta/65">Rinde</p>
                        <p className="flex h-12 items-center rounded-lg bg-hueso px-3 text-[14px] text-tinta">
                          {rinde === null ? "Falta el ancho y el gramaje" : `≈ ${rinde.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m por kilo`}
                        </p>
                      </div>
                    </div>
                  )}
                  {compra === "rollo" && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <CampoTexto
                        etiqueta="¿Cuántos metros trae un rollo?"
                        inputMode="decimal"
                        value={metrosPorRollo}
                        onChange={(ev) => setMetrosPorRollo(ev.target.value)}
                        placeholder="80"
                        tono={numeroMalEscrito(metrosPorRollo) ? "error" : undefined}
                        pie={numeroMalEscrito(metrosPorRollo) ? CANTIDAD_ILEGIBLE : "Lo habitual; al recibir lo corriges si un rollo trae otra medida."}
                      />
                    </div>
                  )}
                </CampoGuiado>
                <div className="grid gap-3 sm:grid-cols-3">
                  <CampoGuiado id="merma" guia={guia}>
                    <CampoTexto
                      etiqueta={guia.etiqueta("merma", "Merma al cortar (%)")}
                      pie="Lo que se pierde de cada corte"
                      inputMode="decimal"
                      placeholder="0"
                      value={merma}
                      onChange={(ev) => setMerma(ev.target.value)}
                    />
                  </CampoGuiado>
                </div>
              </section>
            </>
          )}

          <section data-guia="prod-tela-nueva.colores" className="space-y-3">
            <TituloGrupo cuenta={n}>Colores</TituloGrupo>
            <CampoGuiado id="colores" guia={guia} retiene="fila">
              {leyoColores ? (
                <ElegirColores colores={disponibles} grupos={grupos} elegidos={filas.map((f) => f.color)} onAlternar={alternarColor} onCreado={(c) => { setColoresCarta((cs) => [...cs, c]); alternarColor(c.codigo); }} cartaAbierta={false} sinElegidos enfocarBuscador={eligioColor} />
              ) : (
                <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">No se pudo cargar la carta de colores. Cierra esta ventana y vuelve a abrirla.</p>
              )}
            </CampoGuiado>
            {n === 0 ? (
              <p className="text-[12.5px] text-taupe">Todavía ninguno. Búscalo por su nombre o tócalo en la carta de arriba.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[620px] overflow-hidden rounded-xl border border-sand">
                  <div className={`${FILA} bg-hueso text-[11px] font-semibold uppercase tracking-[0.1em] text-tinta/70`} style={{ gridTemplateColumns: plantilla(e) }}>
                    <span>Color</span>
                    <span>Código</span>
                    {puedeSaldo && <span className="text-right">¿Ya tienes? ({unidadDeCompra})</span>}
                    {puedeSaldo && e.compra !== "metro" && <span className="text-right">≈ metros</span>}
                    {puedeSaldo && <span className="text-right">Costo por {e.compra === "rollo" ? "rollo" : unidadDeCompra}</span>}
                    <span className="text-right">Mínimo (m)</span>
                    <span />
                  </div>
                  {filas.map((f) => {
                    const c = porCodigo.get(f.color);
                    const nombreColor = c?.nombre ?? f.color;
                    const metros = metrosDeFila(e, f);
                    return (
                      <div key={f.color} className={`${FILA} border-t border-sand`} style={{ gridTemplateColumns: plantilla(e) }}>
                        <span className="flex min-w-0 items-center gap-2 text-[14px] text-tinta">
                          <Punto hex={c?.hex ?? null} familia={c?.familiaColor} tipo={c?.tipo} />
                          <span className="truncate">{nombreColor}</span>
                        </span>
                        <span className="truncate font-mono text-[12.5px] text-tinta/75">{codigo}-{f.color}</span>
                        {puedeSaldo && (
                          <CampoTexto caja sinPie etiqueta={`Cuánto hay de ${nombreColor} (${unidadDeCompra})`} inputMode="decimal" className="text-right tabular-nums" placeholder="0" value={f.ya} onChange={(ev) => cambiarFila(f.color, { ya: ev.target.value })} tono={numeroMalEscrito(f.ya) ? "error" : undefined} />
                        )}
                        {puedeSaldo && e.compra !== "metro" && <span className="text-right text-[13px] tabular-nums text-tinta/70">{metros === null ? "—" : `≈ ${metros.toLocaleString("es-PE", { maximumFractionDigits: 1 })} m`}</span>}
                        {puedeSaldo && (
                          <CampoTexto caja sinPie etiqueta={`Costo de ${nombreColor}`} inputMode="decimal" className="text-right tabular-nums" placeholder="0.00" value={f.costo} onChange={(ev) => cambiarFila(f.color, { costo: ev.target.value })} tono={montoIlegible(f.costo) ? "error" : undefined} />
                        )}
                        <CampoTexto caja sinPie etiqueta={`Mínimo de ${nombreColor}`} inputMode="decimal" className="text-right tabular-nums" placeholder="—" value={f.minimo} onChange={(ev) => cambiarFila(f.color, { minimo: ev.target.value })} tono={numeroMalEscrito(f.minimo) ? "error" : undefined} />
                        <button type="button" onClick={() => alternarColor(f.color)} aria-label={`Quitar ${nombreColor}`} className="grid h-8 w-8 place-items-center rounded-full text-[17px] leading-none text-tinta/60 hover:bg-tinta/[0.07] hover:text-tinta">
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {filas.some((f) => numeroMalEscrito(f.ya) || numeroMalEscrito(f.minimo)) && (
              <Aviso tono="error" chico>
                {CANTIDAD_ILEGIBLE}
              </Aviso>
            )}
            {filas.some((f) => montoIlegible(f.costo)) && (
              <Aviso tono="error" chico>
                {MONTO_ILEGIBLE}
              </Aviso>
            )}
            {n > 0 && puedeSaldo && <p className="nota-cayla">«¿Ya tienes?» déjalo vacío si todavía no llegó nada: el color se crea en cero. Si lo llenas, se abre su lote de saldo inicial con ese costo.</p>}
            {n > 0 && !puedeSaldo && <p className="nota-cayla">Los colores se crean en cero. Lo que ya hay de cada uno, con su costo, lo anota el líder.</p>}
          </section>

          <div data-guia="prod-tela-nueva.cierre" className="space-y-3">
            <CampoGuiado id="quien" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
            </CampoGuiado>
            <PieGuia guia={guia} listo={agregarA ? "Todo listo para agregar los colores." : "Todo listo para crear la tela."} conFrase />
          </div>

          <div className="pie-hoja-fijo">
            <div className="pie-acciones border-t border-sand pt-3">
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                {agregarA ? (
                  n > 0 ? `Agregar ${n} ${n === 1 ? "color" : "colores"}` : "Agregar colores"
                ) : n > 0 ? (
                  // En el celular el botón es media fila: la cuenta de colores ya está en el título de la sección.
                  <>
                    <span className="sm:hidden">Crear la tela</span>
                    <span className="hidden sm:inline">{`Crear la tela con ${n} ${n === 1 ? "color" : "colores"}`}</span>
                  </>
                ) : (
                  "Crear la tela"
                )}
              </Boton>
            </div>
          </div>
        </form>
      </IdentidadAltaProveedor>
      {avisoSalida.aviso}
    </Modal>
  );
}

const FILA = "grid items-center gap-3 px-3 py-2";

/** Las columnas de la tabla de colores: Color, Código, [¿Ya tienes?, ≈ metros (si no es por metro), Costo] (solo el líder), Mínimo, ×. */
function plantilla(e: Pick<EntradaTelaNueva, "compra" | "puedeSaldo">): string {
  return ["minmax(8rem,1.4fr)", "minmax(7rem,1.1fr)", ...(e.puedeSaldo ? ["6.5rem"] : []), ...(e.puedeSaldo && e.compra !== "metro" ? ["5.5rem"] : []), ...(e.puedeSaldo ? ["6.5rem"] : []), "5.5rem", "2rem"].join(" ");
}
