"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, SearchX } from "lucide-react";
import { money } from "@/lib/money";
import type { VarianteBusqueda } from "@/components/PuntoDeVenta";
import { apartadoDeFila, coincide, encendida, type Apartado } from "@/lib/separaciones-reglas";
import { enPendientes } from "@/lib/apartados-pestanas";
import { comoSeHistorial, enHistorial, ordenHistorial, salidaDeBusqueda, type ComoSeHistorial } from "@/lib/apartados-historial";
import { listaDicha } from "@/lib/lista-dicha";
import { createClient } from "@/lib/supabase/client";
import { ApartadoEnFila, columnaCanal, soloElBoton } from "@/components/apartados/filas";
import { useCanalesDeApartados } from "@/components/apartados/CanalChip";
import { ReimprimirApartadoModal } from "@/components/apartados/ModalesApartado";
import { DetalleApartadoModal } from "@/components/apartados/DetalleApartado";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { TablaViva, useTablaViva, type ColumnaViva, type FiltroDeAfuera } from "@/components/ui/TablaViva";
import { Vacio } from "@/components/ui/Vacio";

const APARTADO = { uno: "apartado", varios: "apartados", genero: "m" } as const;

type Fila = { a: Apartado; como: ComoSeHistorial };

/** La insignia de lo terminado y su línea (el comprobante con que salió, o la nota de crédito). `enLinea`: bajo el nombre. */
function EstadoTerminado({ como, enLinea = false }: { como: ComoSeHistorial; enLinea?: boolean }) {
  return (
    <span className={enLinea ? "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" : "block"}>
      <Chip tono="neutro">{como.insignia}</Chip>
      {como.debajo && (
        <span className={enLinea ? "text-sm text-secundario" : "tv-sub"}>
          {como.debajo.que} <span className="whitespace-nowrap">{como.debajo.numero}</span>
        </span>
      )}
    </span>
  );
}

/**
 * «Historial» (ADR-0720): lo terminado, entregado o devuelto, en una sola lista con la forma de Pendientes (la tabla viva de Recibir,
 * ADR-0676). Se viene a encontrar un apartado que ya se cerró y a reimprimir su papel (ADR-0367); lo vivo está en Pendientes, y una
 * línea arriba de la lista lo dice para quien viene con la costumbre de antes (el puente que Felipe dejó el 2026-11-28).
 * Al entrar, lo de los últimos 30 días (lo que la página ya trajo); «Todo el historial» lee el resto aquí, sin recargar la pantalla.
 */
export function HistorialVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  puedeGestionar,
  cajaAbierta,
  apartados,
  prendas,
  apagadas = [],
  buscarInicial = "",
  onEntregar,
  onIrAPendientes,
  onBuscarEnPendientes,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  puedeGestionar: boolean;
  cajaAbierta: boolean;
  /** Todo lo que trajo la página: lo vivo (para saber si lo buscado está en Pendientes) y lo terminado de los últimos 30 días. */
  apartados: Apartado[];
  prendas: VarianteBusqueda[];
  /** Lo que la tienda apagó en «Opciones» (paso 5). */
  apagadas?: string[];
  /** Llegar buscando (`?abrir=` de uno ya terminado, desde Movimientos, ADR-0241; o lo que no estaba en Pendientes). */
  buscarInicial?: string;
  /** El detalle de un apartado abierto ofrece entregarlo (aquí no llega uno abierto, pero la hoja lo pide). */
  onEntregar: (id: string) => void;
  onIrAPendientes: () => void;
  /** Lo buscado sigue vivo: buscarlo en Pendientes, con lo escrito. */
  onBuscarEnPendientes: (texto: string) => void;
}) {
  const porVariante = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const canales = useCanalesDeApartados();
  const conCanal = canales.length >= 2;
  const conAbonos = encendida(apagadas, "abonos");
  const conEstante = encendida(apagadas, "estante");
  const ubicacion = { ubicacionId, etiqueta: ubicacionEtiqueta };
  const [texto, setTexto] = useState(buscarInicial);
  const [reimprimir, setReimprimir] = useState<Apartado | null>(null);
  const [detalle, setDetalle] = useState<Apartado | null>(null);
  const filaQueAbrio = useRef<HTMLElement | null>(null);

  // «Todo el historial»: la página trajo lo terminado de los últimos 30 días; el resto se lee aquí (`buscar_separaciones` sin fechas, con
  // su tope). Es lectura: no abre el loader (ADR-0149). Mientras llega se ve lo que había, atenuado; si falla, se dice y se reintenta.
  const [todo, setTodo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [leido, setLeido] = useState<{ intento: number; lista: Apartado[] | null } | null>(null);
  useEffect(() => {
    if (!todo) return;
    let vigente = true;
    void createClient()
      .rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId })
      .then(({ data, error }) => {
        if (!vigente) return;
        setLeido({ intento, lista: error ? null : (data ?? []).map((f) => apartadoDeFila(f as unknown as Record<string, unknown>)) });
      });
    return () => {
      vigente = false;
    };
    // `apartados` en la lista: al guardar algo la página se refresca y todo el historial se vuelve a leer.
  }, [todo, ubicacionId, apartados, intento]);
  const cargando = todo && leido?.intento !== intento;
  const fallo = todo && leido?.intento === intento && leido.lista === null;
  const fuente = todo && leido?.lista ? leido.lista : apartados;
  // Ver todo el historial; si la lectura falló, intentarla de nuevo.
  const verTodo = () => (fallo ? setIntento((n) => n + 1) : setTodo(true));

  const q = texto.trim();
  const terminados = useMemo(() => ordenHistorial(fuente.filter(enHistorial)), [fuente]);
  const filas: Fila[] = terminados.filter((a) => coincide(a, q)).map((a) => ({ a, como: comoSeHistorial(a) }));

  function abrir({ a }: Fila) {
    filaQueAbrio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetalle(a);
  }

  const columnas = useMemo<ColumnaViva<Fila>[]>(
    () => [
      {
        clave: "apartado",
        titulo: "Apartado",
        tipo: "texto",
        valor: ({ a }) => `${a.nombres} ${a.apellidos}`,
        principal: true,
        alinear: "izquierda",
        ancho: "minmax(0,2fr)",
        celda: ({ a }, { debajo }) => <ApartadoEnFila a={a} porVariante={porVariante} debajo={debajo} etiqueta={`Ver el apartado ${a.codigo} de ${a.nombres} ${a.apellidos}`} />,
      },
      {
        clave: "estado",
        titulo: "Estado",
        tipo: "opcion",
        valor: ({ como }) => como.insignia,
        ordenOpciones: ["Entregado", "Devuelto"],
        filtra: true,
        ancho: "13rem",
        sinNombreEnTarjeta: true,
        seVa: 740,
        celda: ({ como }) => <EstadoTerminado como={como} />,
        resumen: ({ como }) => <EstadoTerminado como={como} enLinea />,
        dibujarOpcion: (v) => <Chip tono="neutro">{v}</Chip>,
        frase: (v) => listaDicha(v.map((x) => x.toLowerCase()), "o"),
      },
      ...(conCanal ? [columnaCanal<Fila>(canales, (f) => f.a)] : []),
      {
        clave: "monto",
        titulo: "Monto",
        tipo: "monto",
        valor: ({ como }) => como.monto,
        texto: ({ como }) => money(como.monto),
        // El monto y qué fue: lo que pagó al llevárselo o el adelanto que se le devolvió.
        celda: ({ como }) => (
          <>
            {money(como.monto)}
            <span className="tv-sub ap-monto-dice text-center">{como.montoDice}</span>
          </>
        ),
        ancho: "8rem",
      },
      {
        clave: "accion",
        titulo: "",
        tipo: "texto",
        valor: () => null,
        ordena: false,
        ancho: "10rem",
        sinNombreEnTarjeta: true,
        // Todo apartado tiene su papel: la constancia (o su boleta de anticipo, los de antes) y, si se entregó, su boleta o factura.
        celda: ({ a }) => (
          <BotonImprimir chico onClick={soloElBoton(() => setReimprimir(a))} title={`Reimprimir el papel de ${a.codigo}`}>
            Reimprimir
          </BotonImprimir>
        ),
      },
    ],
    [porVariante, conCanal, canales],
  );
  const tabla = useTablaViva({ filas, columnas });
  const deAfuera: FiltroDeAfuera[] = q ? [{ clave: "busqueda", pildora: `Busca: «${q}»`, frase: `con «${q}»`, quitar: () => setTexto("") }] : [];

  // Lo buscado no está: si sigue vivo, el puente lleva a Pendientes; si no, a todo el historial; y si ya se buscó en todo, a ningún lado.
  // «Nadie … en Historial» solo cuando de verdad se leyó todo: mientras llega o si falló, se sigue ofreciendo.
  const salida = q ? salidaDeBusqueda({ q, hayEnPendientes: apartados.some((a) => enPendientes(a) && coincide(a, q)), todoElHistorial: todo && !cargando && !fallo }) : null;

  return (
    <div className="ap-cuerpo space-y-4 p-5 sm:p-6">
      <section className="@container/barra-filtros space-y-4" aria-label="Historial de apartados">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Buscador
            valor={texto}
            onCambio={setTexto}
            buscando={cargando}
            placeholder="Nombre, DNI, celular, código o boleta" // sugerir-fijo: dice por qué se puede buscar; no depende de nada elegido antes
            etiqueta="Buscar un apartado terminado por el nombre, el DNI o el celular del cliente, por su código o por su boleta"
            guia="apartados.historial-buscador"
            className="w-full sm:max-w-sm"
          />
          {/* El período, en una píldora (las de período del ERP, ADR-0358): de fábrica, los últimos 30 días; tocada, todo el historial. */}
          <button type="button" aria-pressed={todo} onClick={() => setTodo((t) => !t)} className="pildora-cayla sm:ml-auto" data-guia="apartados.todo-el-historial">
            Todo el historial
          </button>
        </div>
        {/* El puente (Felipe 2026-11-28, «Sí, se quedan»): quien viene aquí a hacer lo de hoy, por costumbre, encuentra adónde se fue. */}
        <p className="text-sm text-secundario" data-guia="apartados.puente-historial">
          Lo que falta hacer (entregar, devolver, escribir) está en{" "}
          <button type="button" onClick={onIrAPendientes} className="btn-enlace">
            Pendientes
          </button>
          .
        </p>
        {fallo && (
          <Aviso
            tono="error"
            titulo="No se pudo leer todo el historial"
            accion={
              <Boton peso="fantasma" onClick={() => setIntento((n) => n + 1)}>
                Intentar de nuevo
              </Boton>
            }
          >
            Mientras tanto se ve lo de los últimos 30 días.
          </Aviso>
        )}
        <div aria-busy={cargando} data-resultados className={`transition-opacity duration-200 ${cargando ? "opacity-55" : ""}`}>
          {filas.length === 0 ? (
            salida ? (
              <div className="ap-placa rounded-tarjeta border border-sand py-5">
                <Vacio
                  tamano="chico"
                  icono={<SearchX />}
                  accion={salida.accion ? { texto: salida.accion.texto, onClick: () => (salida.accion?.a === "pendientes" ? onBuscarEnPendientes(q) : verTodo()) } : undefined}
                >
                  {salida.texto}
                </Vacio>
              </div>
            ) : (
              <Vacio
                icono={<Archive />}
                titulo={todo ? "Nada terminado todavía" : "Nada terminado en los últimos 30 días"}
                acciones={
                  todo ? undefined : (
                    <Boton peso="fantasma" onClick={verTodo}>
                      Ver todo el historial
                    </Boton>
                  )
                }
              >
                Aquí llega cada apartado cuando se entrega o se devuelve su adelanto.
              </Vacio>
            )
          ) : (
            <TablaViva
              tabla={tabla}
              clave={(f) => f.a.id}
              etiqueta={`Apartados terminados de ${ubicacionEtiqueta}`}
              sustantivo={APARTADO}
              hoy={hoy}
              total={terminados.length}
              cola={todo ? "terminados de todo el historial" : "terminados de los últimos 30 días"}
              deAfuera={deAfuera}
              onAbrir={abrir}
              guiaFila="apartados.historial-fila"
            />
          )}
        </div>
      </section>

      {reimprimir && <ReimprimirApartadoModal apartado={reimprimir} sede={ubicacionEtiqueta} onClose={() => setReimprimir(null)} />}
      {detalle && (
        <DetalleApartadoModal
          apartado={detalle}
          ubicacion={ubicacion}
          hoy={hoy}
          cajaAbierta={cajaAbierta}
          puedeGestionar={puedeGestionar}
          conAbonos={conAbonos}
          conEstante={conEstante}
          prendas={prendas}
          modoInicial="ver"
          alCerrarEnfocar={filaQueAbrio}
          onEntregar={(id) => {
            setDetalle(null);
            onEntregar(id);
          }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
