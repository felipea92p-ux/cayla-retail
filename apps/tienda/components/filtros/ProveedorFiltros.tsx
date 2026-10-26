"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { tomarAviso } from "@/lib/filtros-aviso";
import {
  alternar,
  consultaConFiltros,
  contar,
  escribirElegido,
  fraseDeTalla,
  huboSoltado,
  indexar,
  interpretarFiltros,
  limpiar,
  muertas,
  NADA_ELEGIDO,
  nombreDeFamilia,
  opcionesDelNivel,
  unir,
  type Conteos,
  type DatosDeFiltros,
  type Elegido,
  type Faceta,
  type Opciones,
  type Soltado,
} from "@/lib/filtros-color-talla";

// Los filtros de COLOR y TALLA de la lista, del lado del navegador (ADR-0512, actividad 4): la palabra y su panel, lo elegido y los avisos
// comparten esto. La lista misma la arma el SERVIDOR desde la dirección (actividad 3); aquí solo se lleva lo que la persona toca hasta ella.
//  · Los números del panel salen de la misma regla que usa el servidor (`lib/filtros-color-talla.ts`), con las variantes que hay
//    (`GET /api/filtros`, 30 s): cada toque se cuenta, se apaga o se suma AL INSTANTE, sin esperar a nadie.
//  · La lista nueva se pide a la dirección 300 ms después del último toque (`router.replace`): quien marca tres colores seguidos pide una
//    lista, no tres. Mientras llega, la lista se apaga un poco (`.t-pendiente`, la misma marca de los filtros de arriba).
//  · Si la base no contesta, el panel lo dice; la lista y la dirección siguen como estaban (principio 9).

const ESPERA_MS = 300;
/** Cuánto se queda a la vista un aviso con «Deshacer»: lo bastante para leerlo y decidir, y no más (si no, tapa lo que viene). */
const AVISO_MS = 12000;

type Lectura = { estado: "nada" | "cargando" | "caida" } | { estado: "lista"; datos: DatosDeFiltros };
export type Aviso = { texto: string; deshacer: () => void };

export type FiltrosVivos = {
  /** Lo elegido ahora: lo que la persona tocó, aunque la lista nueva todavía no haya llegado. */
  elegido: Elegido;
  /** La lectura de las variantes: sin pedir, pidiéndose, lista o caída. */
  estado: Lectura["estado"];
  /** Con la lectura lista: lo que hay en este nivel, cuántas prendas daría cada opción y qué elegidas quedaron sin prendas. */
  vivo: { opciones: Opciones; conteos: Conteos; muertas: Soltado } | null;
  /** El panel abierto, si hay uno. */
  abierto: Faceta | null;
  abrir: (faceta: Faceta | null) => void;
  /** Pide la lectura (una vez; si cayó, otra vez). */
  cargar: () => void;
  /** Suma o quita una opción. `false`: no se pudo (daría 0 prendas, o no se pide talla aquí). */
  tocar: (faceta: Faceta, valor: string) => boolean;
  quitar: (faceta?: Faceta) => void;
  aviso: Aviso | null;
  descartarAviso: () => void;
  /** La palabra COLOR de esta lista (la pone `PalabrasDeFiltros`): adonde vuelve el foco cuando lo que lo tenía se quita. Sirve para no buscarla en
   *  el documento: con las páginas anteriores que Next deja guardadas (ocultas) puede haber más de una. */
  colorRef: { current: HTMLElement | null };
};

const Contexto = createContext<FiltrosVivos | null>(null);

/** Lo de los filtros; `null` si la pantalla no los tiene (los favoritos). */
export const useFiltros = (): FiltrosVivos | null => useContext(Contexto);

const mismo = (a: Elegido, b: Elegido) => JSON.stringify(escribirElegido(a)) === JSON.stringify(escribirElegido(b));

/**
 * `sede`: la clave de la tienda de la dirección (para pedir sus variantes); `ids`: las prendas que se ven en la lista antes de filtrar por color y
 * talla (el «nivel»); `elegido`: lo que el servidor ya aplicó a la lista. Se monta con `key` = la tienda: otra tienda, otras variantes.
 */
export function ProveedorFiltros({ sede, ids, elegido: delServidor, children }: { sede: string | null; ids: readonly string[]; elegido: Elegido; children: ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const [pendiente, empezar] = useTransition();
  const [elegido, setElegido] = useState<Elegido>(delServidor);
  const [esperando, setEsperando] = useState(false);
  const [abierto, setAbierto] = useState<Faceta | null>(null);
  const [lectura, setLectura] = useState<Lectura>({ estado: "nada" });
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef(0);
  const pedida = useRef(false);
  const nivel = useRef<string | null>(null);
  const colorRef = useRef<HTMLElement | null>(null);

  // ---- La lectura de las variantes (una vez por tienda; el navegador la guarda 30 s)
  const cargar = useCallback(() => {
    if (pedida.current) return;
    pedida.current = true;
    setLectura({ estado: "cargando" });
    fetch(`/api/filtros${sede ? `?sede=${encodeURIComponent(sede)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((crudo: unknown) => {
        const datos = interpretarFiltros(crudo);
        if (!datos) throw new Error("forma");
        setLectura({ estado: "lista", datos });
      })
      .catch(() => {
        pedida.current = false;
        setLectura({ estado: "caida" });
      });
  }, [sede]);
  // En silencio, cuando la página ya se asentó: así el panel abre listo y la palabra TALLA sabe si le toca verse.
  useEffect(() => {
    const t = window.setTimeout(cargar, 800);
    return () => window.clearTimeout(t);
  }, [cargar]);

  // ---- Seguir a la dirección (un grupo, un «atrás», un enlace) salvo mientras la persona está tocando: manda lo que tocó
  const claveDelServidor = JSON.stringify(escribirElegido(delServidor));
  useEffect(() => {
    if (temporizador.current !== 0 || pendiente) return;
    setElegido((previo) => (mismo(previo, delServidor) ? previo : delServidor));
  }, [claveDelServidor, pendiente, delServidor]);

  // ---- Llevar lo tocado a la lista: 300 ms después del último toque
  const cambiar = useCallback(
    (nuevo: Elegido) => {
      setElegido(nuevo);
      setEsperando(true);
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => {
        temporizador.current = 0;
        setEsperando(false);
        const consulta = consultaConFiltros(window.location.search.slice(1), nuevo);
        empezar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
      }, ESPERA_MS);
    },
    [empezar, router, ruta],
  );
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  // ---- Lo que hay y lo que daría cada opción
  const indice = useMemo(() => (lectura.estado === "lista" ? indexar(lectura.datos) : null), [lectura]);
  const vivo = useMemo(
    () => (indice ? { opciones: opcionesDelNivel(indice, ids), conteos: contar(indice, ids, elegido), muertas: muertas(indice, ids, elegido) } : null),
    [indice, ids, elegido],
  );

  const tocar = useCallback(
    (faceta: Faceta, valor: string): boolean => {
      if (!indice) return false;
      const r = alternar(indice, ids, elegido, faceta, valor);
      if (!r.hecho) return false;
      cambiar(r.elegido);
      // Quitar la última opción viva deja sin prendas lo que sobraba: se suelta y se dice (con «Deshacer», que lo devuelve).
      if (huboSoltado(r.soltado)) {
        const antes = elegido;
        const nombres = [...r.soltado.color.map(nombreDeFamilia), ...r.soltado.talla.map(fraseDeTalla)];
        setAviso({ texto: `Quitamos ${unir(nombres, "y")}: con lo que quedaba elegido ya no había prendas.`, deshacer: () => cambiar(antes) });
      } else setAviso(null);
      return true;
    },
    [cambiar, elegido, ids, indice],
  );
  const quitar = useCallback(
    (faceta?: Faceta) => {
      setAviso(null);
      cambiar(limpiar(elegido, faceta));
    },
    [cambiar, elegido],
  );

  // ---- El aviso que viene de otra lista (un grupo o una categoría soltó algo): se recoge al llegar, una sola vez
  useEffect(() => {
    const aqui = window.location.pathname + window.location.search;
    const lista = window.location.pathname + "?" + consultaConFiltros(window.location.search.slice(1), NADA_ELEGIDO);
    const cambioDeNivel = nivel.current !== lista;
    nivel.current = lista;
    if (!cambioDeNivel) return;
    setAviso(null);
    let almacen: Storage | null = null;
    try {
      almacen = window.sessionStorage;
    } catch {
      // Sin almacén: el aviso no cruza.
    }
    const venido = almacen ? tomarAviso(almacen, aqui) : null;
    if (venido) setAviso({ texto: venido.texto, deshacer: () => router.push(venido.volver, { scroll: false }) });
  }, [ids, router]);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), AVISO_MS);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const valor = useMemo<FiltrosVivos>(
    () => ({
      elegido,
      estado: lectura.estado,
      vivo,
      abierto,
      abrir: setAbierto,
      cargar,
      tocar,
      quitar,
      aviso,
      descartarAviso: () => setAviso(null),
      colorRef,
    }),
    [abierto, aviso, cargar, elegido, lectura.estado, quitar, tocar, vivo],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* La misma marca de los filtros de arriba: mientras llega la lista nueva, la lista de abajo se apaga un poco (catalogo.css). */}
      <span className="t-pendiente" data-pendiente={pendiente || esperando ? "" : undefined} aria-hidden="true" />
    </Contexto.Provider>
  );
}
