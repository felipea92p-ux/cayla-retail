"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { useResponsable } from "@/lib/useResponsable";
import { TEXTO_COMPRASTE_Y_LO_RECIBES, TEXTO_LA_RECIBE_OTRA, TEXTO_LO_RECIBIO_QUIEN_COMPRO, type CatalogoParaRecibir, type DetalleEnvio, type PrendaRecepcion, type ResultadoApertura } from "@/lib/recepcion-envio-reglas";
import {
  argsGuardarConteo,
  claveDe,
  cifrasDelEnvio,
  contadasParaGuardar,
  insigniaDelEnvio,
  lineasParaContar,
  paraDespues,
  resumenDelCierre,
  subtitulosDelRiel,
  textoPisaste,
  type ClaveLinea,
  type ConteoDeLinea,
  type ConteosDelEnvio,
  type LineaParaContar,
  type Separado,
  mensajeAlGuardar,
} from "@/lib/recepcion-conteo-reglas";
import { guardarConteo, leerConteos } from "@/lib/recepcion-conteo-acciones";
import { EmpezarARecibir } from "@/components/recepcion-envio/EmpezarARecibir";
import { LoQueTrae, origenDelEnvio } from "@/components/recepcion-envio/PiezasEnvio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Chip } from "@/components/ui/Chip";
import { ContarEnvio } from "./ContarEnvio";
import { CerrarEnvio } from "./CerrarEnvio";
import { EnvioCerrado } from "./EnvioCerrado";
import { PapelesDeLaCompra } from "./PapelesDeLaCompra";
import { siguienteAnotada } from "@/lib/recibir-papel-reglas";
import { PasosConteo } from "@/components/conteo/PasosConteo";

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
// El mismo indicador del conteo de inventario (una función, una pieza: ADR-0358), en su forma «riel» (la maqueta A): tres paradas a lo
// ancho con lo que pasó en cada una. Con el envío abierto, «Contar» y «Cerrar» se tocan para ir y volver.
// Solo dos paradas: lo que antes era «¿Qué llegó?» ahora es la hoja «Detalle» de la lista de Recibir (Felipe 2026-10-24); un paso que ya no
// se recorre aquí confundiría («¿me salté uno?»). Las claves siguen siendo «2» y «3».
const PASOS = [
  { clave: "2", nombre: "Contar" },
  { clave: "3", nombre: "Cerrar" },
] as const;

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
  const responsable = useResponsable();
  const [apertura, setApertura] = useState<ResultadoApertura | null>(null);
  // Lo guardado en esta visita, más nuevo que lo que leyó la página: gana la versión más alta.
  const [locales, setLocales] = useState<Record<string, ConteoDeLinea>>({});
  // Lo que se lee de nuevo de la base (después de cerrar, reabrir o «Hacer ahora»), sin esperar a que la página recargue.
  const [releidos, setReleidos] = useState<ConteosDelEnvio | null>(null);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardados, setGuardados] = useState<Record<string, EstadoGuardado>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [paso, setPaso] = useState<Paso>(detalle.estado === "en_camino" ? 1 : 2);
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
        setErrores((e) => ({ ...e, [linea.clave]: mensajeAlGuardar(error, "guardar lo contado") }));
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
  const avisoSalida = useSalidaSinGuardar(
    pendientesDeGuardar,
    "Lo último que contaste todavía se está guardando. Espera un segundo: si sales ahora, ese número se pierde (lo demás ya quedó guardado).",
  );

  /** Vuelve a leer lo contado (después de cerrar, reabrir o «Hacer ahora») y la página. */
  const releer = useCallback(async () => {
    const { conteos: c } = await leerConteos(detalle.id);
    if (c) {
      setReleidos(c);
      setLocales({});
    }
    router.refresh();
  }, [detalle.id, router]);

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
  // La frase de la maqueta, la misma en los tres pasos (de qué envío se trata lo dicen el riel y su tarjeta).
  const frase =
    estado === "anulado"
      ? "Este envío se anuló: ya no llega."
      : otraSede || noLoRecibe
        ? `${origen}. Se recibe en ${detalle.sede?.nombre ?? "su sede"}.`
        : "Abre un fardo y cuenta cuántas llegaron de cada tipo de prenda. Qué modelo es cada una lo puedes decir ahora o después.";
  // La cabecera de la maqueta A: el nombre del módulo, la frase y, a la derecha, en qué está el envío. El número del envío y lo que se
  // lleva contado van en el riel y en la balanza.
  const pendientesDelEnvio = estado === "cerrado" ? paraDespues(lineas).length : 0;
  const insignia = insigniaDelEnvio(estado, pendientesDelEnvio);
  const subtitulos = subtitulosDelRiel({
    estado,
    numero: detalle.numero,
    enviado: detalle.enviado,
    sinAviso,
    proveedor: base?.proveedorPorConfirmar ? "proveedor por confirmar" : (base?.proveedores[0]?.nombre ?? null),
    contadas: cifras.contadas,
    paraDespues: resumenDelCierre(lineas).guardadas,
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={sedeActual.etiqueta} titulo="Recibir mercadería" subtitulo={frase} volver={<Volver href="/recibir" a="Recibir mercadería" />}>
        <div className="anim-sube" style={{ "--i": 1 } as React.CSSProperties}>
          <Chip tono={insignia.tono}>{insignia.texto}</Chip>
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

      {(estado === "abierto" || estado === "cerrado") && !otraSede && !noLoRecibe && (
        <PasosConteo
          forma="riel"
          actual={String(estado === "cerrado" ? 3 : paso)}
          pasos={PASOS}
          subtitulos={subtitulos}
          etiqueta="Pasos de la recepción"
          onIr={
            estado === "abierto"
              ? (clave) => {
                  if (clave === "2" || clave === "3") setPaso(Number(clave) as Paso);
                }
              : undefined
          }
        />
      )}

      {/* Con el papel de una compra anotada desde el celular, el papel va en una columna fija a la izquierda mientras se cuenta (maqueta
          compras-formidable-2026-10); sin papeles, todo sigue a lo ancho. */}
      <div className={conPapel ? "grid items-start gap-6 xl:grid-cols-[21.25rem_minmax(0,1fr)]" : "space-y-6"}>
      {conPapel && (
        <div className="xl:sticky xl:top-4">
          <PapelesDeLaCompra papeles={papeles} lineas={lineas} siguiente={estado === "abierto" ? (siguienteAnotada(lineas)?.clave ?? null) : null} />
        </div>
      )}
      <div className={conPapel ? "min-w-0 space-y-6" : "space-y-6"}>

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
          onPrendaVista={recordarPrenda}
          onEscribir={escribir}
          onAgregar={async (nuevo) => {
            const linea: LineaParaContar = { clave: "extra:0", linea: null, conteo: null, categoria: null, marca: null, proveedor: null, dijeron: null };
            const c = await guardar(linea, { contadas: 0, separado: { prendas: [], nuevas: [] } }, nuevo);
            return c ? claveDe(c) : null;
          }}
          onCerrar={() => setPaso(3)}
        />
      )}

      {estado === "abierto" && !otraSede && !noLoRecibe && paso === 3 && (
        <CerrarEnvio
          detalle={detalle}
          version={version}
          lineas={lineas}
          sinAviso={sinAviso}
          reabierto={reabierto}
          sede={sedeActual.etiqueta}
          responsable={responsable}
          veDinero={veDinero}
          soloSede={soloSede}
          proveedorPorConfirmar={base?.proveedorPorConfirmar ?? false}
          proveedores={proveedoresParaElegir}
          esperandoGuardar={pendientesDeGuardar}
          onVolver={() => setPaso(2)}
          onConteoCambiado={() => void releer()}
          onCerrado={() => {
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
            setPaso(2);
            void releer();
          }}
        />
      )}

      </div>
      </div>

      {avisoSalida.aviso}
    </div>
  );
}
