"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { IdentidadAltaProveedor } from "@/components/alta-producto/IdentidadAlta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { ConUnidad, TablaDeColores, TituloDePaso } from "@/components/insumos-taller/PiezasDeHoja";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Campo, CampoTexto, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import type { ColorAlta } from "@/lib/alta-producto";
import { medidaProhibida, nombreDeMaterial, UNIDADES_MEDIDA, type ClaseDeAvio, type UnidadMedidaAvio } from "@/lib/avio-clases-reglas";
import {
  camposDeAvioNuevo,
  claseDeLaEntrada,
  avioParecido,
  llevaMerma,
  nombreCompuesto,
  payloadDeAvioNuevo,
  problemasDeAvioNuevo,
  tituloDeLaMedida,
  unidadCorta,
  type EntradaAvioNuevo,
} from "@/lib/avio-nuevo-reglas";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { familiaEnCarta } from "@/lib/color-estampado-reglas";
import { traducirError } from "@/lib/error-escritura";
import { PALABRAS_DE_AVIO, conPalabrasDeLaHoja } from "@/lib/insumos-hojas";
import { CANTIDAD_ILEGIBLE, UNIDADES_INSUMO, unidadesPermitidas, type MaterialVista, type UnidadInsumo } from "@/lib/insumos-reglas";
import { costoPor } from "@/lib/insumos-vista";
import { MONTO_ILEGIBLE, montoIlegible } from "@/lib/monto-plata-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { sugerirAvio } from "@/lib/sugerencias-insumos";
import { createClient } from "@/lib/supabase/client";
import { numeroMalEscrito, tieneSaldo, type FilaDeColor } from "@/lib/tela-nueva-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";

// «Nuevo avío» (ADR-0580; Felipe, 2026-10-30: «en los avíos también hay colores, hazlo así como en tela, fácil de registrar»): UN avío y todos sus colores en una sola hoja, como «Nueva tela».
// Antes, seis botones de colores eran seis altas con seis códigos tecleados a mano, un combo de color con un solo valor, y una caja de «Merma al cortar» que le preguntaba a un botón cuánto se
// pierde al cortarlo.
//
// Lo que esta hoja hace y la vieja no:
//   · Pregunta PRIMERO de qué clase es (botón, cierre, hilo, etiqueta, elástico, pretina). De la clase salen tres cosas: la unidad que se propone, si lleva color y qué medida pide.
//   · La MEDIDA es un campo, no una letra del nombre: «Botón nácar» + 1.5 cm. El nombre completo lo arma la base igual que aquí, así que la ficha y sus colores se leen igual en todo el ERP.
//   · El código lo arma la base con el prefijo de la clase (`BOT-01`): nadie lo teclea y nadie lo repite.
//   · Los 103 colores de la carta de Catálogo, con buscador y «+ Nuevo color», y una fila por color con su saldo inicial y su mínimo.
//   · Avisa de la unidad: es la ÚNICA decisión irreversible de la hoja (`fn_insumos_unidad_firme` la congela al primer lote).
//
// También sirve para AGREGAR colores a un avío que ya existe (`agregarA`), igual que la hoja de tela. Lo crea quien opera el Taller (Felipe, 2026-10-30, decisión 3); el saldo inicial con su
// costo sigue siendo del líder (`puedeSaldo`), y la base lo vuelve a comprobar. Un reintento por un corte de red no duplica nada: el envío lleva su token.
//
// «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): tres pasos numerados («Qué avío es», «Cómo lo cuentas», «Qué colores tiene»), lo que explica cada
// uno detrás de su «?», y las palabras de quien la llena («Ya tengo», «Me costó cada uno», «Avísame si baja de»). El código del avío y el de cada color ya no van a la vista: los sigue armando la
// base. No cambia nada de lo que se valida ni de lo que se guarda.

export function NuevoAvioModal({
  tallerId,
  materiales,
  clases,
  leyoClases,
  colores,
  leyoColores,
  puedeSaldo,
  agregarA = null,
  coloresDelAvio = [],
  alElegirExistente,
  onClose,
}: {
  tallerId: string;
  /** Las fichas que ya hay: de ahí salen el aviso de «¿es el mismo?» y el número que sigue en el código. */
  materiales: MaterialVista[];
  clases: ClaseDeAvio[];
  /** `false`: las clases no se pudieron leer; la hoja lo dice en vez de ofrecer una lista vacía. */
  leyoClases: boolean;
  colores: ColorAlta[];
  leyoColores: boolean;
  /** Quien guarda es el líder: puede anotar lo que ya hay de cada color, con su costo. */
  puedeSaldo: boolean;
  /** El avío al que se le suman colores (la hoja pasa a ser «Agregar colores»). */
  agregarA?: MaterialVista | null;
  /** Los colores que ese avío ya tiene (no se vuelven a ofrecer). */
  coloresDelAvio?: string[];
  alElegirExistente?: (m: MaterialVista) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [claseId, setClaseId] = useState(agregarA?.claseId ?? "");
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState<UnidadInsumo>("unidad");
  const [medida, setMedida] = useState("");
  const [medidaUnidad, setMedidaUnidad] = useState<UnidadMedidaAvio | "">("");
  const [merma, setMerma] = useState("");
  const [filas, setFilas] = useState<FilaDeColor[]>([]);
  const [clasesVivas, setClasesVivas] = useState(clases);
  const [coloresCarta, setColoresCarta] = useState(colores);
  const [eligioColor, setEligioColor] = useState(false);
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const token = useRef<string>(crypto.randomUUID());

  const e: EntradaAvioNuevo = agregarA
    ? { claseId: agregarA.claseId ?? "", nombre: agregarA.nombre, unidad: agregarA.unidad, medida: "", medidaUnidad: "", merma: "", filas, puedeSaldo, responsableListo: responsable.listo }
    : { claseId, nombre, unidad, medida, medidaUnidad, merma, filas, puedeSaldo, responsableListo: responsable.listo };
  const clase = claseDeLaEntrada(e, clasesVivas);
  const pideColor = clase?.pideColor !== false;
  const laMedida = agregarA ? null : tituloDeLaMedida(clase);
  // Los mismos campos de la validación, con las palabras que la hoja usa a la vista.
  const campos = conPalabrasDeLaHoja(camposDeAvioNuevo(e, clasesVivas), PALABRAS_DE_AVIO);
  const guia = useGuiaCampos(agregarA ? campos.filter((c) => c.id === "colores" || c.id === "quien") : campos);
  const corta = unidadCorta(e.unidad);
  const parecido = agregarA ? null : avioParecido({ nombre, medida, medidaUnidad }, materiales);
  const ejemplo = sugerirAvio(clase?.prefijo ?? null, materiales);

  const disponibles = useMemo(() => coloresCarta.filter((c) => !coloresDelAvio.includes(c.codigo)), [coloresCarta, coloresDelAvio]);
  const grupos = useMemo(() => agruparPorFamilia(disponibles, familiaEnCarta), [disponibles]);
  const porCodigo = useMemo(() => new Map(coloresCarta.map((c) => [c.codigo, c])), [coloresCarta]);

  const fotoActual = fotoFormulario({ claseId, nombre, unidad, medida, medidaUnidad, merma, filas });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(
    fotoActual !== fotoAlAbrir,
    agregarA ? "Elegiste colores y todavía no se agregaron al avío. Si cierras ahora, se pierde lo que elegiste." : "Empezaste a describir un avío y todavía no se creó. Si cierras ahora, se pierde lo que escribiste.",
  );
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  /** Al elegir la clase: se propone su unidad y su medida (nunca se imponen), y lo que esa clase no lleva se limpia en vez de guardarse escondido. */
  function elegirClase(id: string) {
    setClaseId(id);
    const k = clasesVivas.find((c) => c.id === id);
    if (!k) return;
    setUnidad(k.unidadSugerida);
    if (medidaProhibida(k.comportamiento)) {
      setMedida("");
      setMedidaUnidad("");
    } else {
      const unidades = tituloDeLaMedida(k)?.unidades ?? [];
      if (!unidades.includes(medidaUnidad as UnidadMedidaAvio)) setMedidaUnidad(unidades[0] ?? "");
    }
    if (k.pideColor === false) setFilas([{ color: "", ya: "", costo: "", minimo: "" }]);
    else if (filas.length === 1 && filas[0].color === "") setFilas([]);
    if (k.unidadSugerida !== "metro") setMerma("");
  }

  async function crearClase(texto: string) {
    const limpio = texto.trim();
    if (!limpio) return;
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige primero quién lo anota.");
      return;
    }
    try {
      const res = await fetch("/api/produccion/avio-clases", { method: "POST", headers: { "Content-Type": "application/json", ...responsable.encabezados() }, body: JSON.stringify({ nombre: limpio }) });
      const datos = await res.json().catch(() => null);
      if (!res.ok || !datos?.clase?.id) {
        avisar.error(datos?.error ?? "No se pudo crear la clase de avío.");
        return;
      }
      const nueva: ClaseDeAvio = {
        id: datos.clase.id,
        nombre: datos.clase.nombre,
        prefijo: datos.clase.prefijo,
        comportamiento: "otro",
        unidadSugerida: "unidad",
        pideColor: true,
        orden: 90,
        activo: true,
        nota: null,
      };
      setClasesVivas((cs) => [...cs, nueva]);
      elegirClase(nueva.id);
      avisar.exito(`Clase «${nueva.nombre}» creada`, { detalle: `Sus avíos empezarán con ${nueva.prefijo}-. El líder puede afinarla en Catálogo ▸ Atributos.` });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    }
  }

  function alternarColor(codigoColor: string) {
    setEligioColor(true);
    setFilas((fs) => (fs.some((f) => f.color === codigoColor) ? fs.filter((f) => f.color !== codigoColor) : [...fs, { color: codigoColor, ya: "", costo: fs.at(-1)?.costo ?? "", minimo: "" }]));
  }
  function cambiarFila(codigoColor: string, cambio: Partial<FilaDeColor>) {
    setFilas((fs) => fs.map((f) => (f.color === codigoColor ? { ...f, ...cambio } : f)));
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (enVuelo.current) return;
    // La hoja decide con `problemasDeAvioNuevo`, la MISMA regla de la que sale la guía de foco: así nunca pueden decir cosas distintas (ADR-0284, y su prueba de los 19 escenarios).
    const problemas = problemasDeAvioNuevo(e, clasesVivas);
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
      const { material, colores: paraLaBase } = payloadDeAvioNuevo(e, clasesVivas);
      // Las dos funciones son de ADR-0554/0580 y los tipos generados todavía no las traen: la llamada se tipa a mano.
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
      avisar.error(traducirError(error, agregarA ? "agregar los colores" : "crear el avío"));
      return;
    }
    const n = filas.length;
    const conSaldo = filas.filter(tieneSaldo).length;
    avisar.exito(agregarA ? `${n} ${n === 1 ? "color" : "colores"} más en ${nombreDeMaterial(agregarA)}` : `${nombreCompuesto(e)} ya está en Insumos`, {
      detalle: pideColor ? `${n} ${n === 1 ? "color" : "colores"}${conSaldo > 0 ? `, ${conSaldo} con lo que ya tenías` : ""}` : "Sin color: es lo que lo distingue su nombre",
    });
    cerrarTrasGuardar();
  }

  const n = filas.length;
  const unidades = unidadesPermitidas("avio");
  return (
    <Modal
      titulo={agregarA ? `Agregar colores a «${nombreDeMaterial(agregarA)}»` : "Nuevo avío"}
      subtitulo={agregarA ? `Se cuenta en ${UNIDADES_INSUMO[agregarA.unidad].larga.toLowerCase()}` : undefined}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      // Mientras la escritura está en camino, la hoja no se cierra: antes ofrecía «todavía no se creó… se pierde lo que
      // escribiste», se pulsaba «Salir sin guardar» y el avío se creaba igual. Afirmar lo que no se sabe, justo en el
      // momento en que la persona decide (/chaos 2026-10-31).
      bloqueado={cargando}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <IdentidadAltaProveedor control={responsable}>
        <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-6">
          {!agregarA && (
            <>
              <section data-guia="prod-avio-nuevo.que-es" className="space-y-3">
                <TituloDePaso
                  paso={1}
                  ayuda={
                    <>
                      De la clase salen en qué se cuenta, si lleva color y qué medida se le pide. Agujas, hilo general y aceite no son avíos: se anotan como gasto del Taller.
                      {laMedida && <> {laMedida.porQue}</>}
                    </>
                  }
                >
                  Qué avío es
                </TituloDePaso>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoGuiado id="clase" guia={guia}>
                    <Campo etiqueta={guia.etiqueta("clase", "Clase")} sinPie>
                      {leyoClases ? (
                        <ComboBuscable
                          valor={claseId}
                          onValor={elegirClase}
                          opciones={clasesVivas.map((c) => ({ valor: c.id, texto: c.nombre }))}
                          marcador="Botón, cierre, hilo, etiqueta…"
                          etiquetaAccesible="Clase de avío"
                          crear={{ etiqueta: (t) => `+ Crear la clase «${t.trim()}»`, onCrear: (t) => void crearClase(t), pista: "¿Es otra cosa? Escribe cómo se llama" }}
                        />
                      ) : (
                        <p className="rounded-md vd-placa px-3 py-2 text-sm text-secundario">No se pudieron cargar las clases de avío. Cierra esta ventana y vuelve a abrirla.</p>
                      )}
                    </Campo>
                  </CampoGuiado>
                  <CampoGuiado id="nombre" guia={guia}>
                    <CampoTexto sinPie etiqueta={guia.etiqueta("nombre", "Nombre")} value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} placeholder={ejemplo.nombre} autoComplete="off" />
                  </CampoGuiado>
                </div>

                {parecido && (
                  <Aviso
                    tono="atencion"
                    titulo={parecido.igual ? `Ya existe «${nombreDeMaterial(parecido.avio)}»` : `¿Es el mismo que «${nombreDeMaterial(parecido.avio)}»?`}
                    accion={
                      alElegirExistente ? (
                        <Boton type="button" peso="fantasma" onClick={() => alElegirExistente(parecido.avio)}>
                          Agregar colores a ese
                        </Boton>
                      ) : undefined
                    }
                  >
                    {parecido.igual
                      ? "Agrégale los colores que le faltan en vez de crearlo otra vez."
                      : "Si es otra medida, está bien: son dos avíos distintos. Si es el mismo, agrégale los colores que le faltan."}
                  </Aviso>
                )}

                {laMedida && (
                  <CampoGuiado id="medida" guia={guia}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CampoTexto
                        etiqueta={guia.etiqueta("medida", laMedida.titulo)}
                        inputMode="decimal"
                        value={medida}
                        onChange={(ev) => setMedida(ev.target.value)}
                        placeholder={laMedida.ejemplo}
                        tono={numeroMalEscrito(medida) ? "error" : undefined}
                        pie={numeroMalEscrito(medida) ? CANTIDAD_ILEGIBLE : undefined}
                      />
                      {laMedida.unidades.length > 1 ? (
                        <Segmentado
                          etiqueta="En qué se mide"
                          valor={medidaUnidad === "" ? laMedida.unidades[0] : medidaUnidad}
                          onValor={(v: UnidadMedidaAvio) => setMedidaUnidad(v)}
                          opciones={laMedida.unidades.map((u) => ({ valor: u, texto: UNIDADES_MEDIDA[u].larga }))}
                        />
                      ) : (
                        <div>
                          <p className="campo-etiqueta mb-1.5">En qué se mide</p>
                          <p className="flex min-h-10 items-center rounded-lg vd-hundido px-3 text-detalle text-tinta">{UNIDADES_MEDIDA[laMedida.unidades[0]].larga}</p>
                        </div>
                      )}
                    </div>
                  </CampoGuiado>
                )}
                {nombre.trim() !== "" && <p className="text-detalle text-tenue">Se va a llamar «{nombreCompuesto(e)}».</p>}
              </section>

              <section data-guia="prod-avio-nuevo.unidad" className="space-y-3">
                <TituloDePaso
                  paso={2}
                  ayuda={
                    <>
                      Como lo compras y como lo vas a contar en el estante. El hilo va en conos; el elástico y la pretina, en metros. Es la única decisión de la hoja que después no se puede cambiar: en
                      cuanto entre el primer ingreso, queda fija.
                    </>
                  }
                >
                  Cómo lo cuentas
                </TituloDePaso>
                <CampoGuiado id="unidad" guia={guia}>
                  <Segmentado
                    etiqueta={guia.etiqueta("unidad", "Se cuenta en")}
                    valor={unidad}
                    onValor={(v: UnidadInsumo) => {
                      setUnidad(v);
                      if (v !== "metro") setMerma("");
                    }}
                    opciones={unidades.map((u) => ({ valor: u, texto: UNIDADES_INSUMO[u].larga }))}
                    pie="Después del primer ingreso ya no se puede cambiar."
                    tono="aviso"
                  />
                </CampoGuiado>
                {llevaMerma(e) && (
                  <CampoGuiado id="merma" guia={guia}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <ConUnidad unidad="%">
                        <CampoTexto
                          inputMode="decimal"
                          etiqueta={guia.etiqueta("merma", "Se pierde al cortar")}
                          placeholder="0"
                          value={merma}
                          onChange={(ev) => setMerma(ev.target.value)}
                        />
                      </ConUnidad>
                    </div>
                  </CampoGuiado>
                )}
              </section>
            </>
          )}

          {pideColor ? (
            <section data-guia="prod-avio-nuevo.colores" className="space-y-3">
              <TituloDePaso
                paso={agregarA ? undefined : 3}
                cuenta={n}
                ayuda={
                  puedeSaldo ? (
                    <>
                      Búscalo por su nombre o tócalo en la carta. Si de un color todavía no llegó nada, deja «Ya tengo» vacío: se crea en cero. Si lo llenas, queda anotado como lo que ya tenías, con
                      ese costo. «Avísame si baja de» es lo mínimo que quieres tener: con menos, el color sale en «Por acabarse».
                    </>
                  ) : (
                    <>
                      Búscalo por su nombre o tócalo en la carta. Los colores se crean en cero: lo que ya hay de cada uno, con su costo, lo anota el líder. «Avísame si baja de» es lo mínimo que quieres
                      tener.
                    </>
                  )
                }
              >
                Qué colores tiene
              </TituloDePaso>
              <CampoGuiado id="colores" guia={guia} retiene="fila">
                {leyoColores ? (
                  <ElegirColores
                    colores={disponibles}
                    grupos={grupos}
                    elegidos={filas.map((f) => f.color).filter((c) => c !== "")}
                    onAlternar={alternarColor}
                    onCreado={(c) => {
                      setColoresCarta((cs) => [...cs, c]);
                      alternarColor(c.codigo);
                    }}
                    cartaAbierta={false}
                    sinElegidos
                    enfocarBuscador={eligioColor}
                  />
                ) : (
                  <p className="rounded-md vd-placa px-3 py-2 text-sm text-secundario">No se pudo cargar la carta de colores. Cierra esta ventana y vuelve a abrirla.</p>
                )}
              </CampoGuiado>
              {n === 0 ? (
                <p className="text-sm text-tenue">Todavía no elegiste ninguno.</p>
              ) : (
                <TablaDeColores filas={filas} porCodigo={porCodigo} puedeSaldo={puedeSaldo} unidadYa={corta} unidadMinimo={corta} rotuloCosto={`Me costó ${costoPor(e.unidad)}`} onCambiar={cambiarFila} onQuitar={alternarColor} />
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
            </section>
          ) : (
            <section data-guia="prod-avio-nuevo.colores" className="space-y-3">
              <TituloDePaso
                paso={agregarA ? undefined : 3}
                ayuda={
                  <>
                    «{clase?.nombre ?? "Este avío"}» no lleva color: lo que lo distingue es su nombre.{" "}
                    {puedeSaldo ? "Si todavía no llegó nada, deja «Ya tengo» vacío: se crea en cero." : "Se crea en cero: lo que ya hay, con su costo, lo anota el líder."}
                  </>
                }
              >
                Cuánto tienes
              </TituloDePaso>
              {puedeSaldo ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <ConUnidad unidad={corta}>
                    <CampoTexto
                      etiqueta="Ya tengo"
                      inputMode="decimal"
                      placeholder="0"
                      value={filas[0]?.ya ?? ""}
                      onChange={(ev) => setFilas([{ color: "", ya: ev.target.value, costo: filas[0]?.costo ?? "", minimo: filas[0]?.minimo ?? "" }])}
                      tono={numeroMalEscrito(filas[0]?.ya ?? "") ? "error" : undefined}
                      pie={numeroMalEscrito(filas[0]?.ya ?? "") ? CANTIDAD_ILEGIBLE : undefined}
                    />
                  </ConUnidad>
                  <CampoTexto
                    etiqueta={`Me costó ${costoPor(e.unidad)}`}
                    antes="S/"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={filas[0]?.costo ?? ""}
                    onChange={(ev) => setFilas([{ color: "", ya: filas[0]?.ya ?? "", costo: ev.target.value, minimo: filas[0]?.minimo ?? "" }])}
                    tono={montoIlegible(filas[0]?.costo ?? "") ? "error" : undefined}
                    pie={montoIlegible(filas[0]?.costo ?? "") ? MONTO_ILEGIBLE : "Sin IGV."}
                  />
                  <ConUnidad unidad={corta}>
                    <CampoTexto
                      etiqueta="Avísame si baja de"
                      inputMode="decimal"
                      value={filas[0]?.minimo ?? ""}
                      onChange={(ev) => setFilas([{ color: "", ya: filas[0]?.ya ?? "", costo: filas[0]?.costo ?? "", minimo: ev.target.value }])}
                      tono={numeroMalEscrito(filas[0]?.minimo ?? "") ? "error" : undefined}
                      pie={numeroMalEscrito(filas[0]?.minimo ?? "") ? CANTIDAD_ILEGIBLE : undefined}
                    />
                  </ConUnidad>
                </div>
              ) : (
                <p className="text-sm text-tenue">Se crea en cero.</p>
              )}
            </section>
          )}

          <div data-guia="prod-avio-nuevo.cierre" className="space-y-3">
            <CampoGuiado id="quien" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
            </CampoGuiado>
            <PieGuia guia={guia} listo={agregarA ? "Todo listo para agregar los colores." : "Todo listo para crear el avío."} conFrase />
          </div>

          <div className="pie-hoja-fijo">
            <div className="pie-acciones border-t border-sand pt-3">
              <Boton type="button" disabled={cargando} onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} confirma={guia} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                {agregarA ? (
                  n > 0 ? (
                    `Agregar ${n} ${n === 1 ? "color" : "colores"}`
                  ) : (
                    "Agregar colores"
                  )
                ) : pideColor && n > 0 ? (
                  <>
                    <span className="sm:hidden">Crear el avío</span>
                    <span className="hidden sm:inline">{`Crear el avío con ${n} ${n === 1 ? "color" : "colores"}`}</span>
                  </>
                ) : (
                  "Crear el avío"
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
