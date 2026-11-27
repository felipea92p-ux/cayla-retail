"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { TablaDeColores, TituloDePaso } from "@/components/insumos-taller/PiezasDeHoja";
import { CampoComposicion, CampoTejido, CompraDeLaTela, PreguntaDelTejido, useTejidosDeLaTela } from "@/components/insumos-taller/PiezasDeLaTela";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { IdentidadAltaProveedor } from "@/components/alta-producto/IdentidadAlta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import type { ColorAlta } from "@/lib/alta-producto";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { familiaEnCarta } from "@/lib/color-estampado-reglas";
import { traducirError } from "@/lib/error-escritura";
import type { VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import { PALABRAS_DE_TELA, conPalabrasDeLaHoja } from "@/lib/insumos-hojas";
import { CANTIDAD_ILEGIBLE, textoDeCompra, type CompraDeTela, type MaterialVista } from "@/lib/insumos-reglas";
import { costoPor } from "@/lib/insumos-vista";
import { MONTO_ILEGIBLE, montoIlegible } from "@/lib/monto-plata-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import {
  camposDeTelaNueva,
  filasTrasCambiarCompra,
  metrosDeFila,
  numeroMalEscrito,
  payloadDeTelaNueva,
  problemasDeTelaNueva,
  telaParecida,
  tieneSaldo,
  type DatosDeLaTela,
  type EntradaTelaNueva,
  type FilaDeColor,
} from "@/lib/tela-nueva-reglas";
import { sugerirInsumo } from "@/lib/sugerencias-insumos";
import { useResponsable } from "@/lib/useResponsable";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";

// «Nueva tela» (ADR-0554, actividad 2; Felipe 2026-10-28: «la parte de insumos es demasiado tediosa de completar»): UNA hoja para la tela y todos sus colores. Antes, una tela en cinco colores eran cinco altas de diez campos
// y otras cinco hojas para ingresar el lote. Aquí se dice qué tela es, cómo se compra (metro, kilo con su ancho y gramaje, o rollo con sus metros) y se eligen los colores de la MISMA carta de Catálogo; cada color trae su código
// (lo arma la base, nadie lo escribe) y, si ya hay saldo, su lote. Todo se guarda de una vez o no se guarda (`crear_material`). Con el mismo `<Modal>`, la guía de foco (ADR-0284) y el combo Responsable que el resto.
//
// «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): la hoja va en tres pasos numerados («Qué tela es», «Cómo la compras», «Qué colores tiene»), con las
// palabras de quien la llena («De qué está hecha», «Se pierde al cortar», «Ya tengo», «Me costó el metro», «Avísame si baja de») y lo que explica detrás del «?» de cada paso. El código de la tela y
// el de cada color ya no van a la vista: los sigue armando la base. No cambia nada de lo que se valida ni de lo que se guarda.
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
  const { tejidos, crearTejido, pregunta: preguntaTejido } = useTejidosDeLaTela(vocabulario.tejidos, responsable);
  const [nombre, setNombre] = useState("");
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
  // Al cambiar «Se compra» con cantidades escritas se vacían (estaban en otra unidad): la hoja lo dice hasta que se vuelva a escribir algo (G12 de la revisión).
  const [avisoDeCompra, setAvisoDeCompra] = useState(false);
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
    : { nombre, tejidoId, composicion, compra, ancho, gramaje, metrosPorRollo, merma, filas, puedeSaldo, responsableListo: responsable.listo, tejidoPorContestar: preguntaTejido?.nombre };
  const datosDeLaTela: DatosDeLaTela = { nombre: e.nombre, tejidoId: e.tejidoId, composicion: e.composicion, compra: e.compra, ancho: e.ancho, gramaje: e.gramaje, metrosPorRollo: e.metrosPorRollo, merma: e.merma };
  const problemas = problemasDeTelaNueva(e);
  // Los mismos campos de la validación, con las palabras que la hoja usa a la vista.
  const campos = conPalabrasDeLaHoja(camposDeTelaNueva(e), PALABRAS_DE_TELA);
  const guia = useGuiaCampos(agregarA ? campos.filter((c) => c.id === "colores" || c.id === "quien") : campos, { conGrado: true });
  const parecida = agregarA ? null : telaParecida(nombre, materiales);
  const unidadDeCompra = COLUMNAS_SALDO[e.compra];

  // Los colores que se pueden elegir: en una tela que ya existe, los que no tiene.
  const disponibles = useMemo(() => coloresCarta.filter((c) => !coloresDeLaTela.includes(c.codigo)), [coloresCarta, coloresDeLaTela]);
  const grupos = useMemo(() => agruparPorFamilia(disponibles, familiaEnCarta), [disponibles]);
  const porCodigo = useMemo(() => new Map(coloresCarta.map((c) => [c.codigo, c])), [coloresCarta]);

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona escribió o eligió.
  const fotoActual = fotoFormulario({ nombre, tejidoId, composicion, compra, ancho, gramaje, metrosPorRollo, merma, filas });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(
    fotoActual !== fotoAlAbrir,
    agregarA ? "Elegiste colores y todavía no se agregaron a la tela. Si cierras ahora, se pierde lo que elegiste." : "Empezaste a describir una tela y todavía no se creó. Si cierras ahora, se pierde lo que escribiste.",
  );
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  function alternarColor(codigoColor: string) {
    setEligioColor(true);
    setAvisoDeCompra(false);
    setFilas((fs) => (fs.some((f) => f.color === codigoColor) ? fs.filter((f) => f.color !== codigoColor) : [...fs, { color: codigoColor, ya: "", costo: fs.at(-1)?.costo ?? "", minimo: "" }]));
  }
  function cambiarFila(codigoColor: string, cambio: Partial<FilaDeColor>) {
    if (cambio.ya !== undefined || cambio.costo !== undefined) setAvisoDeCompra(false);
    setFilas((fs) => fs.map((f) => (f.color === codigoColor ? { ...f, ...cambio } : f)));
  }
  function cambiarCompra(nueva: CompraDeTela) {
    const r = filasTrasCambiarCompra(filas, compra, nueva);
    setCompra(nueva);
    setFilas(r.filas);
    if (r.vacio) setAvisoDeCompra(true);
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
      detalle: `${n} ${n === 1 ? "color" : "colores"}${conSaldo > 0 ? `, ${conSaldo} con lo que ya tenías` : ""}`,
    });
    cerrarTrasGuardar();
  }

  const n = filas.length;
  return (
    <Modal
      titulo={agregarA ? `Agregar colores a «${agregarA.nombre}»` : "Nueva tela"}
      subtitulo={agregarA ? textoDeCompra(agregarA) : undefined}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <IdentidadAltaProveedor control={responsable}>
        <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-6">
          {!agregarA && (
            <>
              <section data-guia="prod-tela-nueva.que-es" className="space-y-3">
                <TituloDePaso paso={1}>Qué tela es</TituloDePaso>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <CampoGuiado id="nombre" guia={guia}>
                    <CampoTexto sinPie etiqueta={guia.etiqueta("nombre", "Nombre de la tela")} value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} placeholder={sugerirInsumo("tela", materiales).nombre} autoComplete="off" />
                  </CampoGuiado>
                  <CampoTejido guia={guia} tejidos={tejidos} leyoVocabulario={leyoVocabulario} tejidoId={tejidoId} onTejido={setTejidoId} onCrearTejido={(t) => void crearTejido(t, setTejidoId)} pregunta={preguntaTejido} />
                </div>
                <PreguntaDelTejido pregunta={preguntaTejido} />
                {parecida && (
                  <Aviso
                    tono="atencion"
                    titulo={parecida.igual ? `Ya existe «${parecida.tela.nombre}»` : `¿Es la misma que «${parecida.tela.nombre}»?`}
                    accion={
                      alElegirExistente ? (
                        <Boton type="button" peso="fantasma" onClick={() => alElegirExistente(parecida.tela)}>
                          Agregar colores a esa
                        </Boton>
                      ) : undefined
                    }
                  >
                    {textoDeCompra(parecida.tela)}.{" "}
                    {parecida.igual
                      ? "Agrégale los colores que le faltan; si es otra tela con el mismo nombre, ponle a la nueva su medida o su proveedor al nombre."
                      : "Si es la misma, agrégale los colores que le faltan en vez de crearla otra vez."}
                  </Aviso>
                )}
                <CampoComposicion guia={guia} composicion={composicion} onComposicion={setComposicion} titulo="De qué está hecha" />
              </section>

              <section data-guia="prod-tela-nueva.compra" className="space-y-3">
                <TituloDePaso
                  paso={2}
                  ayuda={
                    <>
                      En Insumos la tela se cuenta siempre en metros: si la compras por kilo o por rollo, se pasa a metros al recibirla. «Se pierde al cortar» es la parte de la tela que no llega a la prenda
                      en cada corte.
                    </>
                  }
                >
                  Cómo la compras
                </TituloDePaso>
                <CompraDeLaTela
                  enPasos
                  guia={guia}
                  datos={datosDeLaTela}
                  onCompra={cambiarCompra}
                  onAncho={setAncho}
                  onGramaje={setGramaje}
                  onMetrosPorRollo={setMetrosPorRollo}
                  onMerma={setMerma}
                  avisoDeCompra={avisoDeCompra}
                />
              </section>
            </>
          )}

          <section data-guia="prod-tela-nueva.colores" className="space-y-3">
            <TituloDePaso
              paso={agregarA ? undefined : 3}
              cuenta={n}
              ayuda={
                puedeSaldo ? (
                  <>
                    Búscalo por su nombre o tócalo en la carta. Si de un color todavía no llegó nada, deja «Ya tengo» vacío: se crea en cero. «Avísame si baja de» es lo mínimo que quieres tener: con
                    menos, el color sale en «Por acabarse».
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
                <ElegirColores colores={disponibles} grupos={grupos} elegidos={filas.map((f) => f.color)} onAlternar={alternarColor} onCreado={(c) => { setColoresCarta((cs) => [...cs, c]); alternarColor(c.codigo); }} cartaAbierta={false} sinElegidos enfocarBuscador={eligioColor} />
              ) : (
                <p className="rounded-md vd-placa px-3 py-2 text-sm text-secundario">No se pudo cargar la carta de colores. Cierra esta ventana y vuelve a abrirla.</p>
              )}
            </CampoGuiado>
            {n === 0 ? (
              <p className="text-sm text-tenue">Todavía no elegiste ninguno.</p>
            ) : (
              <TablaDeColores
                filas={filas}
                porCodigo={porCodigo}
                puedeSaldo={puedeSaldo}
                unidadYa={unidadDeCompra}
                unidadMinimo="m"
                rotuloCosto={`Me costó ${costoPor(e.compra)}`}
                metrosDe={e.compra === "metro" ? undefined : (f) => metrosDeFila(e, f)}
                onCambiar={cambiarFila}
                onQuitar={alternarColor}
              />
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
              <Boton type="submit" peso="primario" cargando={cargando} confirma={guia} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
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
