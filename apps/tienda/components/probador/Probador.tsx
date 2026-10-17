"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cuantasPrendas, soles } from "@/lib/catalogo";
import {
  agotada,
  azarDesde,
  busquedaConLook,
  codificarLook,
  colorDeLaPieza,
  colorPara,
  indizar,
  memoriaInicial,
  poner,
  presentes,
  quitar,
  sorprender,
  totales,
  vecinaDe,
  ZONAS,
  type Look,
  type Memoria,
  type PrendaDelProbador,
  type Zona,
} from "@/lib/probador";
import { busquedaConBuscar, leerFiltroDeZona, PARAMETRO_DE_BUSCAR, type FiltroDeZona } from "@/lib/probador-buscar";
import { Buscador } from "./Buscador";
import { Colores } from "./Colores";
import { Figura, type Entrada, type TipoDeEntrada } from "./Figura";
import { TiraDeOpciones } from "./TiraDeOpciones";
import { TuLook } from "./TuLook";

type Estado = {
  look: Look;
  memoria: Memoria;
  /** El color que el cliente le eligió a cada prenda: vuelve con ella si la saca y la pone otra vez. */
  recordados: Record<string, string>;
  /** La zona elegida: la que se desliza, la de los colores y la de la tira. */
  zona: Zona;
  fijos: Partial<Record<Zona, boolean>>;
  entradas: Partial<Record<Zona, Entrada>>;
};

const entrar = (entradas: Estado["entradas"], zona: Zona, tipo: TipoDeEntrada): Estado["entradas"] => ({
  ...entradas,
  [zona]: { tipo, vuelta: (entradas[zona]?.vuelta ?? 0) + 1 },
});

/** La zona con que abre: arriba (o el vestido), como en el lienzo. */
const zonaInicial = (look: Look): Zona => (look.arriba ? "arriba" : look.vestido ? "vestido" : (presentes(look)[0] ?? "arriba"));

/** Cuánto se ve el aviso de abajo («El vestido ocupa arriba y abajo»). */
const DURACION_DEL_AVISO = 2600;

/**
 * «Arma el tuyo», el probador de la tienda (ADR-0434, actividad 4; lienzo v3, `V3Probador`). Guarda el look que se está armando (qué
 * prenda y en qué color va en cada zona, lo fijo con candado y lo que volvería al sacar un vestido) y lo deja en la dirección (`?p=`):
 * recargar, cambiar de tienda o compartirlo deja el mismo look. Nada se guarda en la base hasta que el cliente lo lleve a su bolsa.
 */
export function Probador({
  prendas,
  combina,
  inicial,
  pie,
}: {
  prendas: readonly PrendaDelProbador[];
  combina: Readonly<Record<string, readonly string[]>>;
  inicial: Look;
  /** Lo que la tienda ya cumple, bajo el total (lo arma el servidor con los plazos de la ayuda). */
  pie?: React.ReactNode;
}) {
  const indice = useMemo(() => indizar(prendas), [prendas]);
  const [estado, setEstado] = useState<Estado>(() => ({
    look: inicial,
    memoria: memoriaInicial(inicial, prendas),
    recordados: Object.fromEntries(presentes(inicial).map((z) => [inicial[z]!.id, inicial[z]!.color])),
    zona: zonaInicial(inicial),
    fijos: {},
    entradas: {},
  }));
  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<number | undefined>(undefined);
  const avisar = useCallback((texto: string) => {
    window.clearTimeout(reloj.current);
    setAviso(texto);
    reloj.current = window.setTimeout(() => setAviso(null), DURACION_DEL_AVISO);
  }, []);
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  // La búsqueda abierta vive en la dirección (`?buscar=arriba`): «atrás» la cierra, como cualquier pantalla del celular.
  const buscar = leerFiltroDeZona(useSearchParams().get(PARAMETRO_DE_BUSCAR));
  const abiertaAqui = useRef(false);
  useEffect(() => {
    if (!buscar) abiertaAqui.current = false;
  }, [buscar]);
  function abrirBuscar(zona: FiltroDeZona) {
    window.history.pushState(null, "", `${window.location.pathname}${busquedaConBuscar(window.location.search, zona)}`);
    abiertaAqui.current = true;
  }
  function cerrarBuscar() {
    if (abiertaAqui.current) {
      abiertaAqui.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", `${window.location.pathname}${busquedaConBuscar(window.location.search, null)}`);
    }
  }

  // El look en la dirección, sin recargar nada: recargar o compartir deja el mismo, y la franja de tiendas lo conserva. También al
  // cerrar la búsqueda con «atrás»: la página de antes tenía el look de antes.
  const codigo = codificarLook(estado.look, indice);
  useEffect(() => {
    const busqueda = busquedaConLook(window.location.search, codigo || null);
    if (busqueda !== window.location.search) window.history.replaceState(null, "", `${window.location.pathname}${busqueda}`);
  }, [codigo, buscar]);

  /** Poner una prenda en su zona: en el color que se diga (desde la búsqueda) o en el que el cliente ya le eligió. */
  function ponerPrenda(p: PrendaDelProbador, dir: -1 | 0 | 1, colorPedido?: string) {
    if (agotada(p)) return;
    const puesta = estado.look[p.zona];
    if (puesta?.id === p.id && (!colorPedido || colorPedido === puesta.color)) {
      setEstado((s) => (s.zona === p.zona ? s : { ...s, zona: p.zona }));
      return;
    }
    if (puesta?.id === p.id && colorPedido) {
      // La misma prenda en otro color: solo cambia el color.
      setEstado((s) => ({
        ...s,
        zona: p.zona,
        look: { ...s.look, [p.zona]: { id: p.id, color: colorPedido } },
        entradas: entrar(s.entradas, p.zona, "tinte"),
        recordados: { ...s.recordados, [p.id]: colorPedido },
      }));
      return;
    }
    const ponesVestido = p.zona === "vestido" && estado.look.vestido === null;
    setEstado((s) => {
      const color = colorPedido ?? colorPara(p, s.recordados).codigo;
      const r = poner(s.look, s.memoria, p, color);
      let entradas = entrar(s.entradas, p.zona, dir > 0 ? "der" : dir < 0 ? "izq" : "asoma");
      if (r.restaurada) entradas = entrar(entradas, r.restaurada, "asoma");
      return { ...s, look: r.look, memoria: r.memoria, zona: p.zona, entradas, recordados: { ...s.recordados, [p.id]: color } };
    });
    if (ponesVestido) avisar("El vestido ocupa arriba y abajo");
  }

  function cambiarColor(codigoColor: string) {
    setEstado((s) => {
      const pieza = s.look[s.zona];
      const p = pieza ? indice.get(pieza.id) : undefined;
      const nuevo = p?.colores.find((c) => c.codigo === codigoColor);
      if (!pieza || !p || !nuevo || pieza.color === codigoColor) return s;
      const antes = colorDeLaPieza(p, pieza);
      return {
        ...s,
        look: { ...s.look, [s.zona]: { id: p.id, color: codigoColor } },
        // Si la foto cambia, se funde; si es la misma (un color sin foto propia), solo cambia lo que dice.
        entradas: antes.foto.url === nuevo.foto.url ? s.entradas : entrar(s.entradas, s.zona, "tinte"),
        recordados: { ...s.recordados, [p.id]: codigoColor },
      };
    });
  }

  function mover(zona: Zona, d: 1 | -1) {
    const actual = estado.look[zona];
    if (!actual) return;
    const siguiente = vecinaDe(prendas, zona, actual.id, d);
    if (siguiente) ponerPrenda(siguiente, d);
  }

  function sorprenderme() {
    const libres = presentes(estado.look).filter((z) => !estado.fijos[z]);
    if (libres.length === 0) {
      avisar("Todo tiene candado: suelta una prenda para cambiarla");
      return;
    }
    const conFijos = libres.length < presentes(estado.look).length;
    // La semilla se elige aquí y no adentro: React puede volver a correr el cambio, y el look tiene que salir el mismo.
    const semilla = Math.random();
    setEstado((s) => {
      const look = sorprender(s.look, s.fijos, prendas, combina, azarDesde(semilla));
      let entradas = s.entradas;
      const recordados = { ...s.recordados };
      for (const z of ZONAS) {
        const antes = s.look[z];
        const ahora = look[z];
        if (ahora && (antes?.id !== ahora.id || antes.color !== ahora.color)) {
          entradas = entrar(entradas, z, "asoma");
          recordados[ahora.id] = ahora.color;
        }
      }
      return { ...s, look, entradas, recordados };
    });
    avisar(conFijos ? "Te armamos otro. Lo que fijaste se queda." : "Te armamos otro look.");
  }

  const numero: Partial<Record<Zona, number>> = Object.fromEntries(presentes(estado.look).map((z, i) => [z, i + 1]));
  const piezaElegida = estado.look[estado.zona];
  const prendaElegida = piezaElegida ? (indice.get(piezaElegida.id) ?? null) : null;
  const t = totales(estado.look, indice);

  return (
    <div className="pb">
      <header className="pb-cab">
        <span className="t-ceja">Arma tu look</span>
        <h1>
          Arma el <em>tuyo</em>
        </h1>
      </header>

      <Figura
        look={estado.look}
        indice={indice}
        prendas={prendas}
        recordados={estado.recordados}
        zona={estado.zona}
        fijos={estado.fijos}
        entradas={estado.entradas}
        numero={numero}
        onElegir={(zona) => setEstado((s) => (s.zona === zona ? s : { ...s, zona }))}
        onMover={mover}
        onSorprender={sorprenderme}
      />

      {prendaElegida && piezaElegida && <Colores prenda={prendaElegida} color={colorDeLaPieza(prendaElegida, piezaElegida)} onElegir={cambiarColor} />}

      <TiraDeOpciones
        prendas={prendas}
        look={estado.look}
        recordados={estado.recordados}
        zona={estado.zona}
        numero={numero}
        onPoner={(p) => ponerPrenda(p, 0)}
        onQuitar={(zona) => setEstado((s) => ({ ...s, look: quitar(s.look, zona), zona }))}
        onBuscar={abrirBuscar}
      />

      <TuLook
        look={estado.look}
        indice={indice}
        prendas={prendas}
        zona={estado.zona}
        fijos={estado.fijos}
        numero={numero}
        totales={t}
        onElegir={(zona) => setEstado((s) => (s.zona === zona ? s : { ...s, zona }))}
        onFijar={(zona) => setEstado((s) => ({ ...s, fijos: { ...s.fijos, [zona]: !s.fijos[zona] } }))}
        pie={pie}
      />

      <div className="pb-barra">
        <div className="pb-barra-total">
          <span>{cuantasPrendas(t.cuantas)}</span>
          <b>
            {t.desde ? "Desde " : ""}
            {soles(t.final)}
          </b>
        </div>
      </div>

      {buscar && (
        <Buscador
          prendas={prendas}
          look={estado.look}
          recordados={estado.recordados}
          zonaInicial={buscar}
          onProbar={(p, color) => ponerPrenda(p, 0, color)}
          onCerrar={cerrarBuscar}
        />
      )}

      {/* Siempre está: un lector de pantalla oye el aviso apenas cambia. */}
      <div className="pb-aviso-zona" role="status" aria-live="polite">
        {aviso && (
          <span key={aviso} className="pb-aviso">
            {aviso}
          </span>
        )}
      </div>
    </div>
  );
}
