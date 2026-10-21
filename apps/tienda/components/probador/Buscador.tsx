"use client";

import { useEffect, useRef, useState } from "react";
import { soles } from "@/lib/catalogo";
import { pctTexto } from "@/lib/portada";
import { agotada, notaDeLaFoto, type Look, type PrendaDelProbador } from "@/lib/probador";
import {
  AVISO_AL_PROBAR,
  buscarParaElLook,
  colorEnLaBusqueda,
  conteoDeBusqueda,
  estadoDeLaTarjeta,
  FILTROS_DE_ZONA,
  gruposDeResultados,
  marcadorDeBusqueda,
  palabrasDe,
  portadaDeZona,
  sugerenciasDeBusqueda,
  tituloSinResultados,
  type FiltroDeZona,
} from "@/lib/probador-buscar";
import { Icono } from "../Icono";
import { Recorte } from "./Recorte";

/** Cuánto se ve el aviso de «Ver mi look»: lleva un botón, y hay que alcanzar a tocarlo (el del lienzo, 2,8 s, se iba antes). */
const DURACION_DEL_AVISO = 6000;

const TEXTO_DEL_BOTON = { probar: "Probar", "este-color": "Este color", "en-tu-look": "En tu look", agotada: "Agotada" } as const;

/**
 * Buscar una prenda para el look y ver todas las de una zona (ADR-0434, actividad 5; lienzo v3, `V3Buscar`): una hoja a pantalla
 * completa sobre el probador, con la caja (busca mientras se escribe, en lo que la página ya trajo), las zonas, el conteo y las
 * tarjetas, cada una con sus colores y «Probar», que la pone en su lugar del look. Se abre con «Ver todas» o «Buscar otra», y se cierra
 * con la flecha, «Ver mi look», Escape o «atrás».
 */
export function Buscador({
  prendas,
  look,
  recordados,
  zonaInicial,
  onProbar,
  onCerrar,
}: {
  prendas: readonly PrendaDelProbador[];
  look: Look;
  recordados: Readonly<Record<string, string>>;
  zonaInicial: FiltroDeZona;
  onProbar: (p: PrendaDelProbador, color: string) => void;
  onCerrar: () => void;
}) {
  const hoja = useRef<HTMLDialogElement>(null);
  const caja = useRef<HTMLInputElement>(null);
  const reloj = useRef<number | undefined>(undefined);
  const [texto, setTexto] = useState("");
  const [zona, setZona] = useState<FiltroDeZona>(zonaInicial);
  const [vista, setVista] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);

  useEffect(() => {
    const d = hoja.current;
    if (d && !d.open) d.showModal();
    // «Buscar otra» abre para escribir; «Ver todas» abre para mirar (sin el teclado encima en el celular).
    if (zonaInicial === "todo") caja.current?.focus();
    return () => window.clearTimeout(reloj.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrirse
  }, []);

  const palabras = palabrasDe(texto);
  const resultados = buscarParaElLook(prendas, { texto, zona });
  const grupos = gruposDeResultados(resultados);
  const sugeridas = sugerenciasDeBusqueda(prendas);
  const portada = zona !== "todo" && palabras.length === 0 ? portadaDeZona(prendas, zona) : null;

  function probar(p: PrendaDelProbador, codigo: string) {
    const c = p.colores.find((x) => x.codigo === codigo);
    if (!c || agotada(p)) return;
    const estado = estadoDeLaTarjeta(p, c, look);
    if (estado !== "en-tu-look") onProbar(p, codigo);
    window.clearTimeout(reloj.current);
    setAviso({ titulo: `${p.nombre} · ${c.nombre}`, texto: estado === "en-tu-look" ? "Ya está en tu look." : AVISO_AL_PROBAR[p.zona] });
    reloj.current = window.setTimeout(() => setAviso(null), DURACION_DEL_AVISO);
  }

  const tarjeta = (p: PrendaDelProbador) => {
    const c = colorEnLaBusqueda(p, palabras, vista, recordados);
    const estado = estadoDeLaTarjeta(p, c, look);
    const deLaFoto = notaDeLaFoto(c);
    const rebajada = c.precioFinal < c.precio;
    const chip = estado === "agotada" ? { texto: "Agotada", tipo: "pb-chip-agotada" } : c.solo ? { texto: c.solo, tipo: "pb-chip-tienda" } : c.pct ? { texto: `−${pctTexto(c.pct)} %`, tipo: "pb-chip-oferta" } : null;
    return (
      <article key={p.id} className="pb-bus-tarjeta">
        <div className="pb-bus-foto" data-agotada={estado === "agotada" ? "" : undefined}>
          <span className="pb-bus-recorte">
            <Recorte foto={c.foto} tamanos="(min-width: 440px) 170px, 45vw" />
          </span>
          {chip && <span className={`pb-chip ${chip.tipo}`}>{chip.texto}</span>}
          <button
            type="button"
            className="pb-bus-probar"
            data-estado={estado}
            aria-pressed={estado === "en-tu-look"}
            aria-disabled={estado === "agotada" || undefined}
            aria-label={
              estado === "agotada"
                ? `${p.nombre}, agotada`
                : estado === "en-tu-look"
                  ? `${p.nombre} en ${c.nombre} ya está en tu look`
                  : `Probar ${p.nombre} en ${c.nombre}`
            }
            onClick={() => probar(p, c.codigo)}
          >
            {estado === "en-tu-look" && <Icono nombre="check" />}
            {TEXTO_DEL_BOTON[estado]}
          </button>
        </div>
        {p.colores.length > 1 && (
          <div className="pb-bus-colores" role="group" aria-label={`Colores de ${p.nombre}`}>
            {p.colores.map((x) => (
              <button
                key={x.codigo}
                type="button"
                className="pb-muestra pb-muestra-chica"
                aria-pressed={x.codigo === c.codigo}
                aria-label={`Ver ${p.nombre} en ${x.nombre}${x.foto.propia ? "" : " (aún sin foto de este color)"}`}
                onClick={() => setVista((v) => ({ ...v, [p.id]: x.codigo }))}
              >
                <span data-color-dato style={x.hex ? { background: x.hex } : undefined} />
              </button>
            ))}
          </div>
        )}
        <span className="pb-bus-nombre">{p.nombre}</span>
        <span className="pb-bus-precio">
          <b className={rebajada ? "oferta" : undefined}>
            {c.desde ? "Desde " : ""}
            {soles(c.precioFinal)}
          </b>
          {rebajada && <s>{soles(c.precio)}</s>}
        </span>
        {c.nota && (
          <span className={`pb-bus-hay pb-nota ${c.nota.tono}`}>
            {c.nombre} · {c.nota.texto}
          </span>
        )}
        {deLaFoto && <span className="pb-bus-sin-foto">{deLaFoto}</span>}
      </article>
    );
  };

  return (
    <dialog
      ref={hoja}
      className="pb-buscar"
      aria-label="Buscar una prenda para tu look"
      onCancel={(e) => {
        // Escape: cierra como la flecha (vuelve la dirección del probador), no solo la hoja.
        e.preventDefault();
        onCerrar();
      }}
    >
      <div className="pb-bus">
        <header className="pb-bus-cab">
          <button type="button" className="pb-bus-volver" aria-label="Volver al probador" onClick={onCerrar}>
            <Icono nombre="izquierda" />
          </button>
          <div className="pb-bus-caja">
            <Icono nombre="lupa" />
            <input
              ref={caja}
              type="search"
              enterKeyHint="search"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setVista({});
              }}
              aria-label="Buscar una prenda"
              placeholder={marcadorDeBusqueda(zona)}
            />
            {texto && (
              <button
                type="button"
                className="pb-bus-borrar"
                aria-label="Borrar la búsqueda"
                onClick={() => {
                  setTexto("");
                  setVista({});
                  caja.current?.focus();
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            )}
          </div>
        </header>

        <div className="pb-bus-zonas" role="group" aria-label="Qué parte del look">
          {FILTROS_DE_ZONA.map((f) => (
            <button key={f.clave} type="button" className="pb-bus-zona" aria-pressed={zona === f.clave} onClick={() => setZona(f.clave)}>
              {f.nombre}
            </button>
          ))}
        </div>

        <p className="pb-bus-conteo" role="status">
          {conteoDeBusqueda(resultados.length, texto, zona)}
        </p>

        <div className="pb-bus-cuerpo">
          {portada && (
            <div className="pb-bus-portada">
              <h1>{portada.titulo}</h1>
              {portada.texto && <p>{portada.texto}</p>}
            </div>
          )}

          {palabras.length === 0 && zona === "todo" && (
            <div className="pb-bus-portada">
              <h1>¿Qué buscas?</h1>
              <p>Escribe un color, un tipo de prenda o su nombre. Lo que pruebes va directo a su lugar en tu probador.</p>
              <Sugerencias sugeridas={sugeridas} onElegir={setTexto} />
            </div>
          )}

          {grupos.map((g) => (
            <section key={g.zona} className="pb-bus-grupo" aria-label={g.nombre}>
              {zona === "todo" && (
                <h2>
                  {g.nombre}
                  <span className="pb-bus-cuantas">{g.prendas.length}</span>
                  {g.nota && <span className="pb-bus-nota">{g.nota}</span>}
                </h2>
              )}
              <div className="pb-bus-grilla">{g.prendas.map(tarjeta)}</div>
            </section>
          ))}

          {palabras.length > 0 && resultados.length === 0 && (
            <div className="pb-bus-vacio">
              <span className="pb-bus-vacio-ic">
                <Icono nombre="lupa" />
              </span>
              <h1>{tituloSinResultados(texto, zona)}</h1>
              <p>Prueba con un color o un tipo de prenda.</p>
              <Sugerencias sugeridas={sugeridas} onElegir={setTexto} />
            </div>
          )}
        </div>
      </div>

      {aviso && (
        <div className="pb-bus-aviso" role="status">
          <span className="pb-bus-aviso-txt">
            <b>{aviso.titulo}</b>
            <span>{aviso.texto}</span>
          </span>
          <button type="button" className="pb-bus-aviso-ir" onClick={onCerrar}>
            Ver mi look
          </button>
        </div>
      )}
    </dialog>
  );
}

function Sugerencias({ sugeridas, onElegir }: { sugeridas: readonly string[]; onElegir: (texto: string) => void }) {
  if (sugeridas.length === 0) return null;
  return (
    <div className="pb-bus-sugeridas">
      {sugeridas.map((s) => (
        <button key={s} type="button" className="pb-bus-sugerida" onClick={() => onElegir(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
