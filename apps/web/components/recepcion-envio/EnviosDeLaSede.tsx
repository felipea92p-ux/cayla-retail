"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, PackageCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Buscador } from "@/components/ui/Buscador";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Globito } from "@/components/ui/Globito";
import { TablaViva, useTablaViva, type ColumnaViva, type FiltroDeAfuera } from "@/components/ui/TablaViva";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { CostoRecepcion } from "@/components/RecepcionesRecientes";
import { EnvioAbierto } from "@/components/recepcion-conteo/RecibidoPorEnvio";
import type { RecepcionReciente } from "@/lib/compras-reglas";
import {
  ESTADOS_DE_ENVIO,
  TEXTO_ESTADO,
  TRAMOS_DE_FECHA,
  VISTAS_DE_ENVIOS,
  cuentaPorVista,
  enVista,
  filasDeLaSede,
  llevaMucho,
  ordenarPorInstante,
  parteEnStock,
  textoBuscableDeFila,
  textoRecibido,
  tramoDeFecha,
  vistaInicial,
  type EstadoDeEnvio,
  type FilaDeEnvio,
  type VistaDeEnvios,
} from "@/lib/envios-de-la-sede-reglas";
import { diaLima } from "@/lib/fechas-lima";
import { TERMINADOS_MAXIMO } from "@/lib/por-terminar-reglas";
import type { PendientesDeLaSede } from "@/lib/recepcion-conteo-reglas";
import { coincideConBusqueda } from "@/lib/recepcion-envio-busqueda";
import { TEXTO_LA_RECIBE_OTRA, textoMarcas, type EnvioPorAbrir, type OrdenDirecta } from "@/lib/recepcion-envio-reglas";
import { fechaRelativa, ordenarFilas, sumaDe, unirConO, type OrdenViva } from "@/lib/tabla-viva-reglas";
import { HojaDetalle } from "./DetalleEnvioPorRecibir";
import { HojaRecibirSinGuia } from "./RecibirSinGuia";

// «Envíos» de Recibir mercadería en UNA tarjeta (Felipe 2026-11-17 eligió la propuesta «C · Índice» de docs/maquetas/recibir-envios-2026-11):
// pestañas con su cuenta («Por recibir · Terminados · Todos»), una línea por envío con sus marcas, cuándo, su estado en una insignia y lo
// recibido en una barra, sobre la tabla con superpoderes (`TablaViva`: se ordena y se filtra desde la cabecera). Reemplaza dos tablas —«Envíos por
// recibir en esta sede» y «Lo recibido» con «Por terminar» y «Terminados»— donde un envío a medias salía dos veces. Aquí cada envío es una
// fila con un estado (`lib/envios-de-la-sede-reglas.ts`), del más nuevo al más antiguo.
//
// La fila abre lo de su estado: una orden sin guía y un envío en camino, su hoja de siempre; uno que se está contando o que falta terminar
// lleva a su envío; uno terminado abre lo que trajo. Quien hizo la orden no la recibe (decisión 17): su fila lo dice en vez del botón.

const ENVIO = { uno: "envío", varios: "envíos", genero: "m" } as const;
const TONO: Record<EstadoDeEnvio, TonoChip> = { sin_guia: "neutro", en_camino: "pizarra", contando: "tinta", por_terminar: "ambar", terminado: "verde" };
const AYUDA_ESTADO: Record<EstadoDeEnvio, string> = {
  sin_guia: "La orden llegó sin guía: se recibe con «Llegó esta orden»",
  en_camino: "Compras ya lo mandó; nadie lo abrió todavía",
  contando: "Alguien lo abrió y se está recibiendo",
  por_terminar: "Ya se contó y está en el almacén: falta separar por color, poner tallas o crear la prenda",
  terminado: "Todo lo que llegó ya está en el stock",
};
const COLA: Record<VistaDeEnvios, string | undefined> = { recibir: "por recibir", terminados: "terminados", todos: undefined };

function ChipEstado({ estado }: { estado: EstadoDeEnvio }) {
  return (
    <Chip tono={TONO[estado]} title={AYUDA_ESTADO[estado]}>
      {TEXTO_ESTADO[estado]}
    </Chip>
  );
}

export function EnviosDeLaSede({
  envios,
  ordenes,
  sinLeerPorRecibir = false,
  sede,
  aMedias,
  proveedoresSinAviso,
  pendientes,
  recibidos,
  costos,
  hoy,
  accionTitulo,
}: {
  envios: EnvioPorAbrir[];
  ordenes: OrdenDirecta[];
  /** Los envíos por recibir no se pudieron leer: la tarjeta lo dice en vez de afirmar que no hay nada. */
  sinLeerPorRecibir?: boolean;
  sede: string;
  /** Lo contado y lo que ya entró al stock de cada envío abierto, por id (`fn_envios_a_medias`). */
  aMedias?: Readonly<Record<string, { enStock: number; contadas: number }>>;
  /** De quién es cada envío sin aviso abierto, por id. */
  proveedoresSinAviso?: Readonly<Record<string, string | null>>;
  /** Lo que quedó por terminar; `null` si no se pudo leer. */
  pendientes: PendientesDeLaSede | null;
  /** Las últimas llegadas a la sede (hasta `TERMINADOS_MAXIMO`). */
  recibidos: RecepcionReciente[];
  /** El costo de cada llegada, solo para quien ve el dinero de Compras. */
  costos?: Record<string, CostoRecepcion>;
  /** El día de Lima (ISO): con él, la fecha dice «hace 5 días». */
  hoy: string;
  /** A la derecha del título: «Sin aviso», lo que llegó y no está en la lista. */
  accionTitulo?: ReactNode;
}) {
  const router = useRouter();
  const todas = useMemo(
    () => filasDeLaSede({ envios, ordenes, aMedias, proveedoresSinAviso, porTerminar: pendientes?.envios ?? [], recibidos }),
    [envios, ordenes, aMedias, proveedoresSinAviso, pendientes, recibidos],
  );
  const [vista, setVista] = useState<VistaDeEnvios>(() => vistaInicial(todas));
  const [busqueda, setBusqueda] = useState("");
  // La fila abierta en su lugar (una hoja): una orden sin guía, un envío en camino o uno terminado.
  const [abierta, setAbierta] = useState<FilaDeEnvio | null>(null);

  const cuenta = cuentaPorVista(todas);
  const deLaVista = useMemo(() => todas.filter((f) => enVista(f, vista)), [todas, vista]);
  const encontradas = useMemo(() => deLaVista.filter((f) => coincideConBusqueda(textoBuscableDeFila(f), busqueda)), [deLaVista, busqueda]);
  const variosEstados = new Set(deLaVista.map((f) => f.estado)).size > 1;

  function abrir(f: FilaDeEnvio) {
    if (f.href) router.push(f.href);
    else if (f.estado === "terminado" || !f.creadoPorMi) setAbierta(f);
  }

  const columnas = useMemo<ColumnaViva<FilaDeEnvio>[]>(
    () => [
      {
        clave: "envio",
        titulo: "Envío",
        tipo: "texto",
        valor: (f) => f.numero ?? f.sinNumero,
        principal: true,
        alinear: "izquierda",
        ancho: "minmax(0,2.2fr)",
        // Lo que trae va arriba, como dice la etiqueta del paquete (ADR-0644); el número y de quién llegó, debajo. Toda la fila se toca con
        // el mouse; el botón del nombre es lo que usan el teclado y el lector de pantalla (su Enter sube hasta la fila).
        celda: (f, { debajo }) => {
          const nombre = f.numero ?? f.sinNumero ?? "Envío";
          const titulo = textoMarcas(f.marcas) ?? f.proveedores[0] ?? nombre;
          const deQuien = textoMarcas(f.marcas) ? f.proveedores.join(", ") : f.proveedores.slice(1).join(", ");
          return (
            <span className="block min-w-0">
              <button type="button" className="block max-w-full truncate text-left font-medium text-tinta" title={f.marcas.length ? `Marca${f.marcas.length === 1 ? "" : "s"}: ${f.marcas.join(", ")}` : undefined}>
                {titulo}
              </button>
              <span className="tv-sub truncate" title={deQuien || undefined}>
                {titulo === nombre ? null : <span className="font-semibold tabular-nums text-tinta">{nombre}</span>}
                {titulo !== nombre && deQuien ? " · " : null}
                {deQuien}
                {f.sinAviso ? `${titulo !== nombre || deQuien ? " · " : ""}llegó sin aviso` : null}
              </span>
              {debajo}
            </span>
          );
        },
      },
      {
        clave: "fecha",
        titulo: vista === "terminados" ? "Llegó" : "Desde",
        tipo: "fecha",
        valor: (f) => diaLima(f.instante),
        opcion: (f) => tramoDeFecha(f, hoy),
        ordenOpciones: TRAMOS_DE_FECHA,
        filtra: true,
        ancho: "8.5rem",
        seVa: 740,
        resumen: (f) => {
          const dia = diaLima(f.instante);
          return dia ? fechaRelativa(dia, hoy).texto : "sin fecha";
        },
        avisaSiPaso: (f) => llevaMucho(f, hoy),
        textosOrden: { asc: "Más antiguo primero", desc: "Más nuevo primero" },
        ayuda: vista === "terminados" ? "El día en que llegó" : "Cuándo salió el envío; si ya se contó, cuándo se terminó de contar; si ya terminó, cuándo llegó",
        frase: (v) => `de ${unirConO(v.map((x) => x.toLowerCase()))}`,
      },
      {
        clave: "estado",
        titulo: "Estado",
        tipo: "opcion",
        valor: (f) => TEXTO_ESTADO[f.estado],
        ordenOpciones: ESTADOS_DE_ENVIO.map((e) => TEXTO_ESTADO[e]),
        filtra: variosEstados,
        ancho: "10rem",
        sinNombreEnTarjeta: true,
        guia: "recibir.envios-estado",
        celda: (f) => <ChipEstado estado={f.estado} />,
        dibujarOpcion: (v) => {
          const estado = ESTADOS_DE_ENVIO.find((e) => TEXTO_ESTADO[e] === v);
          return estado ? <ChipEstado estado={estado} /> : v;
        },
        frase: (v) => unirConO(v.map((x) => x.toLowerCase())),
      },
      {
        clave: "recibido",
        titulo: "Recibido",
        tipo: "numero",
        valor: parteEnStock,
        ancho: "minmax(11rem,1.3fr)",
        textosOrden: { asc: "Menos recibido primero", desc: "Más recibido primero" },
        ayuda: "En verde, lo que ya está en el stock; en gris, lo contado que todavía no entra",
        guia: "recibir.envios-recibido",
        // La barra solo donde se sabe cuántas prendas trae: uno sin aviso que nadie contó, o uno por terminar, lo dice en palabras.
        celda: (f) => (
          <span className="mx-auto block w-full max-w-52 whitespace-normal text-center">
            {f.unidades ? (
              <BarraApilada
                alto={8}
                decorativa
                sinEntrada
                total={f.unidades}
                segmentos={[
                  { clave: "stock", nombre: "En stock", valor: f.enStock, clase: "bg-verde" },
                  { clave: "contadas", nombre: "Contadas", valor: Math.max(0, f.contadas - f.enStock), clase: "bg-tinta/45" },
                ]}
              />
            ) : null}
            <span className="tv-sub">{textoRecibido(f)}</span>
          </span>
        ),
        suma: (v) => `${sumaDe(v, (f) => f.unidades).toLocaleString("es-PE")} prendas`,
      },
      {
        clave: "accion",
        titulo: "",
        tipo: "texto",
        valor: () => null,
        ordena: false,
        ancho: "11.5rem",
        sinNombreEnTarjeta: true,
        celda: (f) => {
          // Uno terminado no tiene nada que hacer: la flecha dice que la fila se abre (lo que trajo).
          if (f.estado === "terminado") return <ChevronRight aria-hidden className="mx-auto h-4 w-4 text-taupe" />;
          if (f.creadoPorMi) return <span className="block whitespace-normal text-sm leading-snug text-taupe">{TEXTO_LA_RECIBE_OTRA}</span>;
          if (f.href)
            return (
              <BotonEnlace href={f.href} peso="fantasma" aria-label={`${f.estado === "contando" ? "Seguir recibiendo" : "Terminar"} ${f.numero ?? "el envío"}`}>
                {f.estado === "contando" ? "Seguir recibiendo" : "Terminar"}
              </BotonEnlace>
            );
          // «Recibir» abre la hoja con lo que trae y, ahí, «Empezar a recibir»; una orden sin guía, «Llegó esta orden» (decisión 48).
          return (
            <Boton type="button" peso="fantasma" onClick={() => setAbierta(f)} aria-label={f.estado === "en_camino" ? `Recibir ${f.numero}: ver lo que trae y empezar` : undefined}>
              {f.estado === "en_camino" ? "Recibir" : "Llegó esta orden"}
            </Boton>
          );
        },
      },
    ],
    [hoy, variosEstados, vista],
  );
  const ordenar = useMemo(
    () => (filas: readonly FilaDeEnvio[], orden: OrdenViva) =>
      orden.clave === "fecha" ? ordenarPorInstante(filas, orden.dir) : ordenarFilas(filas, columnas.find((c) => c.clave === orden.clave), orden.dir),
    [columnas],
  );
  const tabla = useTablaViva({ filas: encontradas, columnas, ordenInicial: { clave: "fecha", dir: "desc" }, ordenar });
  const q = busqueda.trim();
  const deAfuera: FiltroDeAfuera[] = q ? [{ clave: "busqueda", pildora: `Busca: «${q}»`, frase: `con «${q}»`, quitar: () => setBusqueda("") }] : [];

  function cambiarVista(v: VistaDeEnvios) {
    setVista(v);
    // Un filtro de la otra vista («Terminado» en «Por recibir») dejaría la tabla vacía sin que se entienda por qué.
    tabla.limpiarFiltros();
  }

  return (
    <section data-guia="recibir.envios" className="space-y-3" aria-labelledby="recibir-envios">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <TituloSeccion id="recibir-envios" ayuda={<>Lo que Compras mandó a {sede} y lo que llegó sin aviso. Se cuenta modelo por modelo y entra a su almacén.</>}>
          Envíos · {sede}
        </TituloSeccion>
        {accionTitulo}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Qué envíos ver" data-guia="recibir.envios-vista" className="flex flex-wrap gap-2">
          {VISTAS_DE_ENVIOS.map((v) => (
            <button key={v.clave} type="button" className="pildora-cayla" aria-pressed={vista === v.clave} data-guia={v.clave === "terminados" ? "recibir.envios-terminados" : undefined} onClick={() => cambiarVista(v.clave)}>
              {v.texto}
              <Globito n={cuenta[v.clave]} sobreOscuro={vista === v.clave} />
            </button>
          ))}
        </div>
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          placeholder="Envío, guía, proveedor, marca u orden" // sugerir-fijo: dice por qué se puede buscar; no depende de nada elegido antes
          etiqueta="Buscar un envío por su número, su guía, su proveedor, su marca o su orden"
          guia="recibir.envios-buscar"
          className="w-full sm:max-w-xs"
        />
        {vista !== "recibir" && (
          <EnlaceVer href="/recibir?vista=recibidas" guia="recibir.ver-todo">
            Ver todo lo recibido
          </EnlaceVer>
        )}
      </div>
      {sinLeerPorRecibir && vista !== "terminados" && (
        <Aviso tono="atencion" chico titulo="No se pudieron leer los envíos por recibir">
          Recarga la página. Lo que quedó por terminar y lo terminado sí se ve.
        </Aviso>
      )}
      {deLaVista.length === 0 ? (
        sinLeerPorRecibir && vista !== "terminados" ? null : <Vacio icono={<PackageCheck />} titulo={vista === "terminados" ? "Todavía no hay nada terminado" : "Nada por recibir"}>
          {vista === "terminados" ? "Lo que se termine de recibir aparece aquí." : `Todo lo que llegó a ${sede} ya está recibido. Si llegó algo que no esperabas, ábrelo con «Sin aviso».`}
        </Vacio>
      ) : (
        <TablaViva
          tabla={tabla}
          clave={(f) => f.clave}
          etiqueta={`Envíos de ${sede}`}
          sustantivo={ENVIO}
          hoy={hoy}
          total={deLaVista.length}
          cola={COLA[vista]}
          suma={(v) => `${sumaDe(v, (f) => f.unidades).toLocaleString("es-PE")} prendas`}
          deAfuera={deAfuera}
          onAbrir={abrir}
          abierta={(f) => abierta?.clave === f.clave}
          guiaFila="recibir.envios-fila"
        />
      )}
      {vista !== "recibir" && recibidos.length >= TERMINADOS_MAXIMO && <p className="nota-cayla">De lo terminado se muestran las {TERMINADOS_MAXIMO} llegadas más recientes. Para ver el resto, «Ver todo lo recibido».</p>}

      {abierta?.estado === "terminado" && abierta.recibido && <EnvioAbierto envio={abierta.recibido} costos={costos} onClose={() => setAbierta(null)} />}
      {abierta?.estado === "en_camino" && abierta.envio && <HojaDetalle envio={abierta.envio} sede={sede} onCerrar={() => setAbierta(null)} />}
      {abierta?.estado === "sin_guia" && abierta.orden && <HojaRecibirSinGuia orden={abierta.orden} sede={sede} onCerrar={() => setAbierta(null)} />}
    </section>
  );
}
