"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { estabaEnCerrar, recordarEnCerrar } from "@/lib/recepcion-cierre-borrador";
import { claveResponsableRecepcion } from "@/lib/responsable-conteo";
import { useResponsable } from "@/lib/useResponsable";
import type { BorradorTallas, ModoDeTallas } from "@/lib/recepcion-tallas-reglas";
import { TEXTO_COMPRASTE_Y_LO_RECIBES, TEXTO_LA_RECIBE_OTRA, TEXTO_LO_RECIBIO_QUIEN_COMPRO, type CatalogoParaRecibir, type DetalleEnvio, type PrendaRecepcion, type ResultadoApertura } from "@/lib/recepcion-envio-reglas";
import {
  argsGuardarConteo,
  claveDe,
  cifrasDelEnvio,
  contadasParaGuardar,
  insigniaDelEnvio,
  lineasParaContar,
  paraDespues,
  textoPisaste,
  type ClaveLinea,
  type DecisionCierre,
  type ConteoDeLinea,
  type ConteosDelEnvio,
  type LineaParaContar,
  type Separado,
  mensajeAlGuardar,
} from "@/lib/recepcion-conteo-reglas";
import { agregarFotoPapel, guardarConteo, leerConteos } from "@/lib/recepcion-conteo-acciones";
import { subirFotoPapel } from "@/lib/compra-rapida-acciones";
import { EmpezarARecibir } from "@/components/recepcion-envio/EmpezarARecibir";
import { LoQueTrae, origenDelEnvio } from "@/components/recepcion-envio/PiezasEnvio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { Volver } from "@/components/ui/Volver";
import { Chip } from "@/components/ui/Chip";
import { ContarEnvio } from "./ContarEnvio";
import { CancelarRecepcion } from "./CancelarRecepcion";
import { CorregirProveedor } from "./CorregirProveedor";
import { CerrarEnvio } from "./CerrarEnvio";
import { EnvioCerrado } from "./EnvioCerrado";
import { PapelesDeLaCompra } from "./PapelesDeLaCompra";
import { Trayecto } from "@/components/recepcion-envio/Trayecto";
import { etapaDelEnvio } from "@/lib/trayecto-envio-reglas";

// «Recibir ENV-000061» contando primero (ADR-0393, la cara A; maqueta `docs/maquetas/recibir-fardo-2026-10/a-camino.html`). Tres pasos:
// ¿Qué llegó? (en camino: «Empezar a recibir»), Contar (por categoría: un número por línea y, si se quiere, qué prendas son) y Cerrar (lo que
// no cuadró, el costo y quién cierra). Cerrado: lo que entró al stock, lo que queda para después con «Hacer ahora», y reabrir.
//
// Lo contado se guarda en la base línea por línea, solo, al dejar de tocar (`guardar_conteo_envio`, con `x-espera: no`): un F5 no lo borra y
// varias personas cuentan a la vez (decisión 9). Si otra persona guardó la misma línea, gana el último y la pantalla avisa lo que se pisó.
// Este componente se monta con el id del envío como key: cambiar de sede no lo borra.

/** Lo que se está escribiendo en una línea y todavía no llegó a la base. */
export type Borrador = { contadas: number; separado: Separado };
export type EstadoGuardado = "guardando" | "guardado" | "error";

const ESPERA_GUARDAR_MS = 700;

type Paso = 1 | 2 | 3;
const sinCambios = () => () => {};
/** Una copia del registro sin esa clave (lo guardado deja de ser borrador o error). */
function sinClave<T>(r: Readonly<Record<string, T>>, clave: string): Record<string, T> {
  const copia = { ...r };
  delete copia[clave];
  return copia;
}

export function RecibirContando({
  detalle,
  conteos: conteosDeLaBase,
  sedeActual,
  creadoPorMi,
  catalogo,
  lotes,
  veExistencias,
  veDinero,
  soloSede = false,
  proveedoresParaElegir = [],
  papeles = [],
}: {
  detalle: DetalleEnvio;
  conteos: ConteosDelEnvio | null;
  sedeActual: { id: string; etiqueta: string };
  creadoPorMi: boolean;
  catalogo: CatalogoParaRecibir | null;
  lotes: string[];
  veExistencias: boolean;
  /** Ve el dinero de Compras: en un envío sin aviso, solo así escribe el costo (ADR-0330). */
  veDinero: boolean;
  /** Una terminal: el precio de venta que se cambia al cerrar vale solo en su sede («Todas las sedes» no se ofrece). */
  soloSede?: boolean;
  /** Un envío sin aviso que llegó sin saber de quién (Felipe 2026-10-14): los proveedores para elegir al cerrar. */
  proveedoresParaElegir?: readonly { id: string; nombre: string }[];
  /** Los papeles de lo comprado desde el celular, con su foto (ADR-0480): se cuenta mirándolos. */
  papeles?: ComponentProps<typeof PapelesDeLaCompra>["papeles"];
}) {
  const router = useRouter();
  // Se recuerda por envío: en una terminal se vaciaba tras cada guardado, y contar modelo por modelo volvía a pedirlo a cada toque.
  const responsable = useResponsable(undefined, { recordarEn: claveResponsableRecepcion(detalle.id) });
  const [apertura, setApertura] = useState<ResultadoApertura | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  // Lo guardado en esta visita, más nuevo que lo que leyó la página: gana la versión más alta.
  const [locales, setLocales] = useState<Record<string, ConteoDeLinea>>({});
  // Lo que se lee de nuevo de la base (después de cerrar, reabrir o «Hacer ahora»), sin esperar a que la página recargue.
  const [releidos, setReleidos] = useState<ConteosDelEnvio | null>(null);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardados, setGuardados] = useState<Record<string, EstadoGuardado>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Se recargó la página estando en Cerrar: se vuelve ahí (solo el navegador lo sabe: en el primer dibujo manda lo de siempre).
  const seguiaEnCerrar = useSyncExternalStore(sinCambios, () => estabaEnCerrar(detalle.id), () => false);
  const [pasoElegido, setPaso] = useState<Paso | null>(null);
  const paso: Paso = pasoElegido ?? (seguiaEnCerrar ? 3 : detalle.estado === "en_camino" ? 1 : 2);
  // «Contarla», desde Cerrar: la línea a la que se vuelve, y lo que ya se había decidido, para no perderlo al ir y volver.
  const [volverA, setVolverA] = useState<ClaveLinea | null>(null);
  const [decisionesCierre, setDecisionesCierre] = useState<Readonly<Record<string, DecisionCierre>> | null>(null);
  // Lo que se estaba contando: Contar se desmonta al ir a Cerrar, y al volver sigue ahí.
  const [focoAlVolver, setFocoAlVolver] = useState<string | null>(null);
  // De cada modelo: «solo la cantidad» o «tallas y colores ahora», y lo escrito en su tabla. Aquí y no en Contar: ir a Cerrar y volver no lo borra.
  const [modos, setModos] = useState<Readonly<Record<string, ModoDeTallas>>>({});
  const [tablas, setTablas] = useState<Readonly<Record<string, BorradorTallas>>>({});
  // Las prendas que ya se buscaron (con sus tallas y colores): la hoja de tallas las necesita.
  const [prendas, setPrendas] = useState<ReadonlyMap<string, PrendaRecepcion>>(() => new Map());
  const recordarPrenda = useCallback((p: PrendaRecepcion) => setPrendas((m) => (m.get(p.productoId) === p ? m : new Map(m).set(p.productoId, p))), []);
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const base = releidos ?? conteosDeLaBase;
  const conteos: ConteosDelEnvio | null = useMemo(() => {
    if (!base) return null;
    const porClave = new Map(base.conteos.map((c) => [claveDe(c), c] as const));
    for (const [clave, c] of Object.entries(locales)) {
      const ya = porClave.get(clave as ClaveLinea);
      if (!ya || c.version >= ya.version) porClave.set(clave as ClaveLinea, c);
    }
    return { ...base, conteos: [...porClave.values()] };
  }, [base, locales]);

  const estadoBase = base?.estado ?? detalle.estado;
  const estado = detalle.estado === "en_camino" && apertura ? "abierto" : estadoBase;
  const version = apertura?.version ?? detalle.version;
  const porRecibir = estado === "en_camino" || estado === "abierto";
  const otraSede = porRecibir && detalle.sede !== null && detalle.sede.id !== sedeActual.id;
  const noLoRecibe = porRecibir && !otraSede && creadoPorMi;
  const sinAviso = base?.origen === "sin_aviso";

  const lineas: LineaParaContar[] = useMemo(() => {
    const ls = lineasParaContar(detalle, conteos);
    // Lo que se está escribiendo se ve al instante (el número y lo separado), antes de llegar a la base.
    return ls.map((l) => {
      const b = borradores[l.clave];
      if (!b) return l;
      const c = l.conteo;
      if (c) return { ...l, conteo: { ...c, contadas: b.contadas, separado: b.separado } };
      // Una línea de la guía que se empezó a contar y todavía no llegó a la base: se ve con versión 0 (no se manda como versión vista).
      return {
        ...l,
        conteo: {
          despachoItemId: l.linea?.id ?? null,
          extraPosicion: null,
          proveedor: null,
          categoria: null,
          marca: null,
          contadas: b.contadas,
          separado: b.separado,
          costoUnitario: null,
          costosPrendas: {},
          version: 0,
          contadoPor: null,
          contadoEn: null,
          enStock: 0,
          sinSeparar: 0,
          pendientes: [],
        },
      };
    });
  }, [detalle, conteos, borradores]);
  const cifras = cifrasDelEnvio(lineas);

  /** Guarda una línea en la base con lo último que se escribió. */
  const guardar = useCallback(
    async (linea: LineaParaContar, b: Borrador, nuevo?: { proveedorId: string | null; categoriaId: string; marcaId: string | null }): Promise<ConteoDeLinea | null> => {
      const { contadas, subio } = contadasParaGuardar(b.contadas, b.separado, linea.conteo?.enStock ?? 0);
      setGuardados((g) => ({ ...g, [linea.clave]: "guardando" }));
      const { guardado, error } = await guardarConteo(
        argsGuardarConteo({ despachoId: detalle.id, linea, contadas, separado: b.separado, nuevo }),
        responsable.firma(),
      );
      responsable.despues(error);
      if (error || !guardado) {
        setGuardados((g) => ({ ...g, [linea.clave]: "error" }));
        setErrores((e) => ({ ...e, [linea.clave]: mensajeAlGuardar(error, "guardar lo contado").replace("«Responsable»", "«Quién cuenta»") }));
        return null;
      }
      const clave = claveDe(guardado.conteo);
      setLocales((l) => ({ ...l, [clave]: guardado.conteo }));
      setErrores((e) => {
        return sinClave(e, linea.clave);
      });
      setGuardados((g) => ({ ...g, [linea.clave]: "guardado", [clave]: "guardado" }));
      // Si mientras tanto nadie siguió escribiendo en esta línea, lo escrito ya es lo guardado.
      setBorradores((bs) => {
        const ahora = bs[linea.clave];
        if (ahora && ahora !== b) return bs;
        return sinClave(bs, linea.clave);
      });
      if (guardado.pisaste) avisar.aviso(textoPisaste(guardado.pisaste, guardado.conteo.contadas));
      if (subio) avisar.aviso(`Separaste más de lo que contaste: el conteo pasó a ${contadas}`);
      return guardado.conteo;
    },
    [detalle.id, responsable],
  );

  /** Cambia lo escrito en una línea y lo guarda solo, al dejar de tocar. */
  const escribir = useCallback(
    (linea: LineaParaContar, cambio: Partial<Borrador>) => {
      const actual: Borrador = borradores[linea.clave] ?? { contadas: linea.conteo?.contadas ?? 0, separado: linea.conteo?.separado ?? { prendas: [], nuevas: [] } };
      const b: Borrador = { ...actual, ...cambio };
      setBorradores((bs) => ({ ...bs, [linea.clave]: b }));
      setGuardados((g) => ({ ...g, [linea.clave]: "guardando" }));
      const viejo = temporizadores.current.get(linea.clave);
      if (viejo) clearTimeout(viejo);
      temporizadores.current.set(
        linea.clave,
        setTimeout(() => {
          temporizadores.current.delete(linea.clave);
          void guardar(linea, b);
        }, ESPERA_GUARDAR_MS),
      );
    },
    [borradores, guardar],
  );

  // Al irse de la pantalla, lo que esperaba su turno se guarda ya.
  useEffect(() => {
    const ts = temporizadores.current;
    return () => ts.forEach((t) => clearTimeout(t));
  }, []);

  const pendientesDeGuardar = Object.keys(borradores).length > 0;
  // Lo repartido que todavía no cuadra espera en la pantalla: la base solo guarda tallas que suman lo contado.
  const tablaSinCuadrar = Object.entries(tablas).some(([clave, t]) => t.sinGuardar && modos[clave] !== "despues");
  const avisoSalida = useSalidaSinGuardar(
    pendientesDeGuardar || tablaSinCuadrar,
    pendientesDeGuardar
      ? "Lo último que contaste todavía se está guardando. Espera un segundo: si sales ahora, ese número se pierde (lo demás ya quedó guardado)."
      : "Tienes tallas y colores sin cuadrar con lo contado. Si sales ahora, lo que repartiste se pierde (lo contado ya quedó guardado).",
  );

  /** Vuelve a mandar lo que no se pudo guardar: al tocar «Volver a guardar» y al volver la conexión. */
  const lineasConError = lineas.filter((l) => errores[l.clave] && borradores[l.clave]);
  const reintentar = useRef<() => void>(() => {});
  useEffect(() => {
    reintentar.current = () => {
      for (const l of lineasConError) void guardar(l, borradores[l.clave]);
    };
  });
  useEffect(() => {
    const alVolver = () => reintentar.current();
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, []);

  /** Vuelve a leer lo contado (después de cerrar, reabrir o «Hacer ahora») y la página. */
  const releer = useCallback(async () => {
    const { conteos: c } = await leerConteos(detalle.id);
    if (c) {
      setReleidos(c);
      setLocales({});
    }
    router.refresh();
  }, [detalle.id, router]);

  /** Sube la foto de un papel que llegó sin ella y se la pone a la compra. Devuelve por qué no se pudo, o `null` si quedó. */
  const subirFotoDelPapel = useCallback(
    async (papelId: string, archivo: File): Promise<string | null> => {
      const subida = await subirFotoPapel(archivo);
      if (!subida.ruta) return subida.motivo ?? "No se pudo subir la foto.";
      const { error } = await agregarFotoPapel({ p_despacho_id: detalle.id, p_papel_id: papelId, p_foto_ruta: subida.ruta }, responsable.firma());
      responsable.despues(error);
      if (error) return mensajeAlGuardar(error, "subir la foto del papel");
      avisar.exito("Subiste la foto del papel");
      router.refresh();
      return null;
    },
    [detalle.id, responsable, router],
  );

  // Entre Contar y Cerrar cambia la VISTA: Cerrar es largo y Contar llena la ventana. Sin esto, al volver se veía una pantalla vacía hasta subir (prueba ciega, 2026-11-02).
  const pasoVisto = useRef(paso);
  useLayoutEffect(() => {
    if (pasoVisto.current === paso) return;
    pasoVisto.current = paso;
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [paso]);

  // Cerrar cambia la VISTA (de contar a «cerrado»): se suelta <PaginaEstable> (ADR-0185) y la vista va arriba.
  const [recienCerrado, setRecienCerrado] = useState(false);
  useLayoutEffect(() => {
    if (!recienCerrado) return;
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [recienCerrado]);

  const origen = origenDelEnvio(detalle) || (sinAviso ? `Sin aviso · ${base?.proveedores[0]?.nombre ?? ""}` : "");
  const conPapel = papeles.length > 0 && (porRecibir || estado === "cerrado") && !otraSede && !noLoRecibe;
  const reabierto = estado === "abierto" && (base?.cierres.length ?? 0) > 0;
  // Cancelar la recepción (ADR-0605): un envío sin aviso, abierto y sin nada en el stock (también reabierto: lo que frena es el stock). Uno de Compras o uno cerrado no lo ofrecen.
  const sePuedeCancelar = estado === "abierto" && sinAviso && lineas.every((l) => (l.conteo?.enStock ?? 0) === 0) && !otraSede && !noLoRecibe;
  // Corregir de quién llegó: sin aviso, ya con proveedor, y solo quien ve el dinero de Compras.
  const proveedorActual = sinAviso ? (base?.proveedores[0] ?? null) : null;
  const sePuedeCorregirProveedor = !!proveedorActual && veDinero && (estado === "abierto" || estado === "cerrado") && !otraSede && !noLoRecibe;
  const accionesDelEnvio = [
    ...(sePuedeCorregirProveedor ? [{ clave: "proveedor", etiqueta: "Corregir el proveedor", onSelect: () => setCorrigiendo(true) }] : []),
    ...(sePuedeCancelar ? [{ clave: "cancelar", etiqueta: "Cancelar recepción", peligro: true, onSelect: () => setCancelando(true) }] : []),
  ];
  // Al contar, las fotos van en el resumen; al cerrar y ya cerrado, en la cabecera.
  const contando = estado === "abierto" && paso !== 3;
  const conPapelArriba = conPapel && !contando;
  // La frase de la maqueta, la misma en los tres pasos.
  const frase =
    estado === "anulado"
      ? "Este envío se anuló: ya no llega."
      : otraSede || noLoRecibe
        ? `${origen}. Se recibe en ${detalle.sede?.nombre ?? "su sede"}.`
        : "Abre un fardo y cuenta cuántas llegaron de cada modelo. Elige la categoría en la lista y toca el modelo que tienes en la mano.";
  // La cabecera de la maqueta A: el nombre del módulo, la frase y, a la derecha, en qué está el envío. Lo que se lleva contado va en el resumen.
  const pendientesDelEnvio = estado === "cerrado" ? paraDespues(lineas).length : 0;
  const insignia = insigniaDelEnvio(estado, pendientesDelEnvio);
  // El Trayecto (rediseño «B», Felipe 2026-10-29) reemplaza al chip de estado; un envío anulado no tiene camino y sigue con su chip.
  const etapaDelCamino = etapaDelEnvio(estado, { pendientes: pendientesDelEnvio, contadas: estado === "abierto" ? cifras.contadas : undefined, dijeron: cifras.dijeron });
  // Al contar, «148 de 8,412» ya lo dice el resumen de la derecha (Felipe 2026-11-03). El camino sigue llenándose con su color.
  const etapa = etapaDelCamino && contando ? { ...etapaDelCamino, detalle: null } : etapaDelCamino;

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={sedeActual.etiqueta} titulo="Recibir mercadería"
        subtitulo={frase}
        detalle={detalle.numero}
        volver={<Volver href="/recibir" a="Recibir mercadería" />}
      >
        {/* En la fila del título, para no gastar una fila propia (Felipe 2026-11-02): en qué va el envío, con sus cinco paradas, y las fotos si no están en el resumen. */}
        <div
          className={`anim-sube flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-3 sm:justify-end ${etapa ? (conPapelArriba ? "grow basis-[29.5rem]" : "grow basis-[20rem] sm:max-w-[28rem]") : ""}`}
          style={{ "--i": 1 } as React.CSSProperties}
        >
          {conPapelArriba && <PapelesDeLaCompra papeles={papeles} alSubirFoto={subirFotoDelPapel} />}
          {etapa ? (
            // Con el botón al lado, el Trayecto toma lo que quede: bajo 22 rem sus nombres se tocan en la última etapa.
            <div className={conPapelArriba ? "min-w-[min(20rem,100%)] max-w-[28rem] flex-1" : accionesDelEnvio.length > 0 ? "min-w-[min(18rem,100%)] flex-1" : "w-full"}>
              <div className="rc-tray-cabecera">
                <Trayecto etapa={etapa} />
              </div>
            </div>
          ) : (
            <Chip tono={insignia.tono}>{insignia.texto}</Chip>
          )}
          {/* Cancelar es raro y no se deshace: va a la derecha de la cabecera, como un «⋯» (no un «Más» suelto bajo el título), y su lista se abre bajo el botón. */}
          {accionesDelEnvio.length > 0 && <MenuAcciones etiqueta="Más acciones de este envío" guia="recepcion.cancelar" redondo items={accionesDelEnvio} />}
        </div>
      </EncabezadoPagina>

      {estado === "anulado" && (
        <Aviso tono="atencion" titulo="Este envío se anuló: ya no llega">
          {detalle.motivoAnulacion ? `Motivo: ${detalle.motivoAnulacion}.` : "Quien compró lo anuló antes de que llegara."} Si la mercadería igual está en la tienda, recíbela sin aviso desde Recibir mercadería.
        </Aviso>
      )}

      {(otraSede || noLoRecibe) && (
        <>
          {otraSede ? (
            <Aviso tono="atencion" guia="recepcion.otra-sede" titulo={`Este envío va a ${detalle.sede?.nombre ?? "otra sede"}`}>
              Se cuenta y se cierra desde esa sede: cámbiala arriba, en la cabecera.
            </Aviso>
          ) : (
            <Aviso tono="atencion" guia="recepcion.quien-compro" titulo={TEXTO_LA_RECIBE_OTRA}>
              Quien hace una orden no la cuenta ni la cierra, ni siquiera un líder (solo un Admin recibe lo que él mismo compró): contar es certificar lo que llegó.
              Pídele a otra persona de la tienda que lo haga.
            </Aviso>
          )}
          {detalle.lineas.length > 0 && (
            <section className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que trae">
              <TituloSeccion>Lo que trae</TituloSeccion>
              <LoQueTrae detalle={detalle} />
            </section>
          )}
        </>
      )}

      {/* ADR-0517: un Admin sí recibe lo que él mismo compró. Antes de contar se le avisa; ya cerrado, lo ve cualquiera que mire el envío. */}
      {porRecibir && !otraSede && !noLoRecibe && detalle.comproQuienMira && (
        <Aviso tono="info" titulo={TEXTO_COMPRASTE_Y_LO_RECIBES}>
          Al cerrar el conteo queda anotado que lo recibió quien hizo la compra, y quien revise las compras lo verá.
        </Aviso>
      )}
      {estado === "cerrado" && detalle.recibioQuienCompro && (
        <Aviso tono="atencion" titulo={TEXTO_LO_RECIBIO_QUIEN_COMPRO}>
          La misma persona hizo la compra y cerró el conteo (un Admin puede recibir lo que él mismo compró), así que nadie más contó esta mercadería.
        </Aviso>
      )}

      {estado === "en_camino" && !otraSede && !noLoRecibe && (
        <EmpezarARecibir
          detalle={detalle}
          sede={sedeActual.etiqueta}
          responsable={responsable}
          porCategoria
          onAbierto={(r) => {
            setApertura(r ?? { despachoId: detalle.id, numero: detalle.numero, estado: "abierto", version: null });
            setPaso(2);
            router.refresh();
          }}
        />
      )}

      {estado === "abierto" && !otraSede && !noLoRecibe && paso !== 3 && (
        <ContarEnvio
          onCancelarRecepcion={sePuedeCancelar ? () => setCancelando(true) : undefined}
          veDinero={veDinero}
          veExistencias={veExistencias}
          esperandoGuardar={pendientesDeGuardar}
          onSalida={() => void releer()}
          detalle={detalle}
          lineas={lineas}
          conteos={conteos}
          sinAviso={sinAviso}
          proveedorPorConfirmar={base?.proveedorPorConfirmar ?? false}
          reabierto={reabierto}
          catalogo={catalogo}
          responsable={responsable}
          guardados={guardados}
          errores={errores}
          prendas={prendas}
          papeles={conPapel ? papeles : []}
          alSubirFoto={subirFotoDelPapel}
          onPrendaVista={recordarPrenda}
          onEscribir={escribir}
          sinGuardar={lineasConError.length}
          onReintentar={() => reintentar.current()}
          modos={modos}
          onModos={setModos}
          tablas={tablas}
          onTablas={setTablas}
          onAgregar={async (nuevo) => {
            const linea: LineaParaContar = { clave: "extra:0", linea: null, conteo: null, categoria: null, marca: null, proveedor: null, dijeron: null };
            const { separado, ...donde } = nuevo;
            const c = await guardar(linea, { contadas: 0, separado: separado ?? { prendas: [], nuevas: [] } }, donde);
            return c ? claveDe(c) : null;
          }}
          onCerrar={() => {
            recordarEnCerrar(detalle.id, true);
            setPaso(3);
          }}
          lineaInicial={volverA}
          focoPrevio={focoAlVolver}
          onFoco={setFocoAlVolver}
        />
      )}

      {estado === "abierto" && !otraSede && !noLoRecibe && paso === 3 && (
        <CerrarEnvio
          detalle={detalle}
          version={version}
          lineas={lineas}
          sinAviso={sinAviso}
          reabierto={reabierto}
          generacion={base?.cierres.length ?? 0}
          sede={sedeActual.etiqueta}
          responsable={responsable}
          veDinero={veDinero}
          soloSede={soloSede}
          proveedorPorConfirmar={base?.proveedorPorConfirmar ?? false}
          proveedores={proveedoresParaElegir}
          esperandoGuardar={pendientesDeGuardar}
          onVolver={(clave, decisiones) => {
            setVolverA(clave ?? null);
            setDecisionesCierre(decisiones);
            recordarEnCerrar(detalle.id, false);
            setPaso(2);
          }}
          decisionesPrevias={decisionesCierre}
          sinGuardar={lineasConError.length}
          onReintentarGuardado={() => reintentar.current()}
          onConteoCambiado={() => void releer()}
          onCerrado={() => {
            recordarEnCerrar(detalle.id, false);
            setRecienCerrado(true);
            void avisoSalida.retirarYa().then(() => releer());
          }}
        />
      )}

      {estado === "cerrado" && (
        <EnvioCerrado
          detalle={detalle}
          lineas={lineas}
          conteos={conteos}
          catalogo={catalogo}
          lotes={lotes}
          veExistencias={veExistencias}
          responsable={responsable}
          prendas={prendas}
          soloSede={soloSede}
          sinAviso={sinAviso}
          veDinero={veDinero}
          onPrendaVista={recordarPrenda}
          onCambio={() => void releer()}
          onReabierto={() => {
            recordarEnCerrar(detalle.id, false);
            setPaso(2);
            void releer();
          }}
        />
      )}

      {avisoSalida.aviso}
      {corrigiendo && proveedorActual && (
        <CorregirProveedor
          detalle={detalle}
          actual={proveedorActual}
          proveedores={proveedoresParaElegir}
          responsable={responsable}
          onCorregido={() => {
            setCorrigiendo(false);
            router.refresh();
            void releer();
          }}
          onCerrar={() => setCorrigiendo(false)}
        />
      )}
      {cancelando && (
        <CancelarRecepcion
          detalle={{ ...detalle, version }}
          contadas={cifras.contadas}
          responsable={responsable}
          onCancelado={() => {
            setCancelando(false);
            router.push("/recibir");
          }}
          onCerrar={() => setCancelando(false)}
        />
      )}
    </div>
  );
}
