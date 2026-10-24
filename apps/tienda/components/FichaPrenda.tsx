"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPuntero } from "react";
import Image from "next/image";
import Link from "next/link";
import { formaDe, fotoOptimizable } from "@/lib/catalogo";
import { claveEspera } from "@/lib/club";
import {
  avisoOtrosSepararon,
  botonDeLaFicha,
  campanaDeLaFicha,
  chipCampana,
  colorInicial,
  dibujoDeLaCampana,
  faltaParaTerminar,
  fotosDelColor,
  imagenDeLaCampana,
  lineaAlAgregar,
  notaDeTalla,
  pistaOtraTienda,
  precioDeLaFicha,
  tallaDelPrecio,
  tallasDelColor,
  type ChipFicha,
  type Ficha,
} from "@/lib/ficha";
import { hrefDelProbador } from "@/lib/probador";
import { esLaMismaFoto } from "@/lib/prenda-tocada";
import { textoNivel, tonoNivel } from "@/lib/stock";
import { AgregarALaBolsa } from "./bolsa/AgregarALaBolsa";
import { BotonAvisame } from "./club/BotonAvisame";
import { BotonFavorito } from "./club/BotonFavorito";
import { IconoInsignia } from "./IconoInsignia";
import { usePrendaTocada } from "./PrendaTocada";
import { fotoQueViaja } from "./Vistas";
import { DibujoPrenda } from "./DibujoPrenda";
import { Icono } from "./Icono";

/**
 * La ficha de una prenda (maqueta v4, `vProducto`): las fotos (en el celular, una tira que se desliza con sus puntos; en la computadora,
 * la primera grande y las demás de a dos), el nombre, el precio en la tienda elegida con su campaña, los colores, las tallas y CUÁNTO
 * HAY EN CADA TIENDA del color elegido, como nivel («Hay», 3, 2, «Última», «—»), con la tienda elegida y la talla resaltadas.
 *
 * Debajo de la tabla, el botón principal (`botonDeLaFicha`): «Elige tu talla» (lleva a las tallas y las resalta), «Agregar a la bolsa»
 * si esa talla hay en alguna tienda de la web o «Avísame cuando llegue» si no hay en ninguna; a su derecha, el corazón. Antes, si otros
 * ya separaron lo que queda en la tienda elegida, la propuesta k, o, si esa talla no está en la tienda elegida, que igual se separa y la
 * tienda la trae. Después, lo que pasó al agregar («La talla M ya está en tu bolsa») y «Ver mi bolsa (N)». En el celular el botón y el
 * corazón van en la barra de abajo, que queda pegada mientras se ve la prenda y lo que va debajo (`children`: «Combínalo con»,
 * «También te puede gustar»), y lo que pasó al agregar va en la misma barra: la cabecera con la bolsa ya no se ve.
 *
 * Junto al botón, lo que la tienda ya cumple (`promesas`: separas sin pagar, recoges en tu tienda, cambias en cualquier tienda CAYLA). En
 * el celular el nombre y el precio van pegados a la foto (los chips, debajo del precio): sin eso, el precio quedaba bajo la barra de
 * abajo en la primera pantalla. En la computadora, con el mouse, la foto se acerca donde está el mouse (`FotoGaleria`).
 */
export function FichaPrenda({
  ficha,
  sedeElegida,
  colorPedido,
  origenFotos,
  chips = [],
  esperas = [],
  esperasIds = {},
  enLaBolsa = 0,
  separadas = [],
  probador = null,
  children,
}: {
  ficha: Ficha;
  /** La tienda de «Ver lo que hay en» (su id), o null con «Todas». */
  sedeElegida: string | null;
  /** `?color=` de la dirección: con qué color abre. */
  colorPedido: string | null;
  origenFotos: string | undefined;
  /** Los chips de arriba del nombre: «Nuevo…» y «N.º 3 en más vendidos» (del catálogo) y las insignias de la prenda (de su ficha, ADR-0489). */
  chips?: ChipFicha[];
  /** «Cambios»: como en tienda, con el plazo de la caja (`lib/ayuda.ts`, el mismo de «Cambios y devoluciones»). */
  /** Lo que la cuenta ya pidió con «Avísame» (`claveEspera`: prenda y tienda). */
  esperas?: readonly string[];
  /** El id de cada una de esas esperas (por su misma clave): con él, «Te avisaremos ×» la quita desde la ficha, aunque se haya pedido
   *  en otra visita (sin el id, solo se podía quitar desde «Mi cuenta»). */
  esperasIds?: Readonly<Record<string, string>>;
  /** Cuántas prendas lleva la bolsa (la cookie): «Ver mi bolsa (N)». */
  enLaBolsa?: number;
  /** Las tallas cuyo resto en la tienda elegida ya separaron otros clientes (propuesta k; solo con una tienda elegida). */
  separadas?: readonly string[];
  /** Si la prenda está en el probador de esta tienda («Arma el tuyo», ADR-0434, actividad 10): su código y la tienda elegida, para
   *  «Arma un look con esta prenda», que lo abre con ella en el color elegido. null si no se puede probar (sin recorte o sin largo). */
  probador?: { codigo: string; sede: string | null } | null;
  /** Lo que va debajo de la ficha: la barra del celular queda pegada abajo mientras se ve. */
  children?: React.ReactNode;
}) {
  const [color, setColor] = useState(() => colorInicial(ficha, colorPedido, sedeElegida));
  const tallas = tallasDelColor(ficha, color);
  const [tallaId, setTallaId] = useState<string | null>(() => (tallas.length === 1 ? tallas[0].talla.id : null));
  const elegida = tallas.find((t) => t.talla.id === tallaId)?.variante ?? null;
  const colorElegido = ficha.colores.find((c) => c.codigo === color) ?? ficha.colores[0];
  // El precio y la campaña que se ven: los de la talla elegida o, si todas las del color cuestan lo mismo, los de ese color.
  const delPrecio = tallaDelPrecio(ficha, color, elegida);
  const precio = precioDeLaFicha(ficha, delPrecio);
  const campanaVista = campanaDeLaFicha(ficha, delPrecio);
  const campana = chipCampana(campanaVista);
  const hasta = campanaVista?.hasta ?? null;
  const hayTiendas = ficha.sedes.length > 0;
  const tiendaElegida = ficha.sedes.find((s) => s.id === sedeElegida) ?? null;
  const boton = botonDeLaFicha(elegida, sedeElegida);
  const tallaElegida = tallas.find((t) => t.variante === elegida)?.talla.nombre ?? "";
  const yaSeparadas = useMemo(() => new Set(separadas), [separadas]);
  const otrosSepararon = avisoOtrosSepararon(elegida, tiendaElegida, yaSeparadas);
  const otraTienda = pistaOtraTienda(elegida, tiendaElegida, ficha.sedes);

  // Lo que pasó al agregar, atado al color y la talla de ese momento: al elegir otra, ya no corresponde y se va.
  const seleccion = `${color}|${tallaId ?? ""}`;
  const [resultado, setResultado] = useState<{ seleccion: string; bien: boolean; texto: string } | null>(null);
  const alAgregar = resultado?.seleccion === seleccion ? resultado : null;

  // «Elige tu talla» lleva a las tallas (en el celular quedan lejos, arriba de la barra) y las resalta hasta que elija una.
  const bloqueTallas = useRef<HTMLDivElement>(null);
  const [pideTalla, setPideTalla] = useState(false);
  function pedirTalla() {
    setPideTalla(true);
    const bloque = bloqueTallas.current;
    if (!bloque) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bloque.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "center" });
    bloque.querySelector<HTMLButtonElement>(".t-talla")?.focus({ preventScroll: true });
  }

  // «Avísame» ya pedido: lo que trae el servidor, más lo que se anota aquí (el botón está dos veces: en la fila y en la barra).
  const huellaEsperas = esperas.join(",");
  const [esperasDelServidor, setEsperasDelServidor] = useState(huellaEsperas);
  const [anotadas, setAnotadas] = useState<ReadonlySet<string>>(() => new Set(esperas));
  if (esperasDelServidor !== huellaEsperas) {
    setEsperasDelServidor(huellaEsperas);
    setAnotadas(new Set(esperas));
  }

  function elegirColor(codigo: string) {
    setColor(codigo);
    const nuevas = tallasDelColor(ficha, codigo);
    // La talla elegida se queda si el color nuevo la tiene; si el color tiene una sola, queda elegida.
    if (!nuevas.some((t) => t.talla.id === tallaId)) setTallaId(nuevas.length === 1 ? nuevas[0].talla.id : null);
  }

  /** El botón principal y el corazón, en la fila de la computadora o en la barra del celular. */
  function botones(clase: string) {
    const clave = boton.tipo === "avisame" ? claveEspera(boton.varianteId, sedeElegida) : "";
    return (
      <div className={clase}>
        {boton.tipo === "avisame" ? (
          <BotonAvisame
            key={clave}
            varianteId={boton.varianteId}
            talla={tallaElegida}
            sedeId={sedeElegida}
            sedeNombre={tiendaElegida?.nombre ?? null}
            pedido={anotadas.has(clave) || (boton.tipo === "avisame" && anotadas.has(claveEspera(boton.varianteId, null)))}
            esperaId={esperasIds[clave] ?? esperasIds[claveEspera(boton.varianteId, null)] ?? null}
            alAnotar={() => setAnotadas((antes) => new Set(antes).add(clave))}
            alQuitar={() =>
              setAnotadas((antes) => {
                const quedan = new Set(antes);
                quedan.delete(clave);
                quedan.delete(claveEspera(boton.varianteId, null));
                return quedan;
              })
            }
          />
        ) : (
          <AgregarALaBolsa
            varianteId={boton.tipo === "agregar" ? boton.varianteId : null}
            sedeId={sedeElegida}
            alElegirTalla={pedirTalla}
            alResponder={(r) => setResultado({ seleccion, bien: r.bien, texto: lineaAlAgregar(r, tallaElegida, tallas.length > 1) })}
          />
        )}
        <BotonFavorito productoId={ficha.id} nombre={ficha.nombre} forma="ficha" />
      </div>
    );
  }

  /**
   * Lo que pasó al agregar (✓ o por qué no) y el camino a la bolsa, junto al botón. Su frase vive en una región que se lee en voz alta
   * al cambiar (siempre dibujada, aunque vacía: una que aparece de golpe no siempre se anuncia). `enlace`: si va «Ver mi bolsa (N)».
   */
  function lineaDeLaBolsa(clase: string, enlace: boolean) {
    return (
      <div className={clase} data-lleno={alAgregar ? "" : undefined}>
        <span role="status" className={alAgregar ? (alAgregar.bien ? "bien" : "mal") : undefined}>
          {alAgregar && (
            <>
              {alAgregar.bien && <Icono nombre="check" />}
              {alAgregar.texto}
            </>
          )}
        </span>
        {enlace && enLaBolsa > 0 && (
          <Link className="t-enlace" href="/bolsa">
            Ver mi bolsa ({enLaBolsa})
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="t-pdp">
        {/* Otra clave por color: al cambiarlo, la tira vuelve a su primera foto (la del color nuevo). */}
        <Galeria key={color} ficha={ficha} color={color} hex={colorElegido.hex} origenFotos={origenFotos} />

        <div className="t-pdp-info">
          {/* En el celular esta caja se deshace (`display: contents`): el nombre y el precio suben y los chips van bajo el precio. */}
          <div className="cp-pdp-cab">
            {(chips.length > 0 || campana) && (
              <div className="t-pdp-chips">
                {chips.map((c) => (
                  <span key={c.texto} className={`t-chip${c.tono ? ` ${c.tono}` : ""}`}>
                    {c.icono && <IconoInsignia icono={c.icono} imagen={c.imagen} origen={origenFotos} />}
                    {c.texto}
                  </span>
                ))}
                {campana && campanaVista && (
                  <span className="t-chip oferta">
                    <IconoInsignia icono={dibujoDeLaCampana(ficha, campanaVista)} imagen={imagenDeLaCampana(ficha, campanaVista)} origen={origenFotos} />
                    {campana}
                  </span>
                )}
              </div>
            )}
            <h1>{ficha.nombre}</h1>
          </div>

          <div className="t-bloque t-bloque-precio">
            <span className={`t-precio grande${precio.oferta ? " oferta" : ""}`}>
              <b className="num">{precio.principal}</b>
              {precio.anterior && (
                <s className="num">
                  <span className="t-sr">Antes </span>
                  {precio.anterior}
                </s>
              )}
            </span>
            {precio.oferta && hasta && <FaltaCampana hasta={hasta} />}
            {!delPrecio && <span className="t-precio-nota">Elige tu talla para ver su precio exacto.</span>}
          </div>

          <div className="t-bloque">
            <span className="t-etq">
              <span>
                Color <b>{colorElegido.nombre}</b>
              </span>
            </span>
            <div className="t-swatches" role="group" aria-label="Color">
              {ficha.colores.map((c) => (
                <button
                  key={c.codigo}
                  type="button"
                  className="t-swatch"
                  aria-pressed={c.codigo === color}
                  onClick={() => elegirColor(c.codigo)}
                >
                  <i data-color-dato style={c.hex ? { background: c.hex } : undefined} aria-hidden="true" />
                  {c.nombre}
                </button>
              ))}
            </div>
            {!colorElegido.foto && ficha.fotos.length > 0 && <span className="t-swatch-nota">Este color aún no tiene foto: la ves en otro color.</span>}
          </div>

          <div className="t-bloque" ref={bloqueTallas} data-pide={pideTalla && !tallaId ? "" : undefined}>
            <span className="t-etq">
              <span>
                Talla{elegida && tallas.length > 1 && <b> {tallaElegida}</b>}
              </span>
              {pideTalla && !tallaId && (
                <span className="t-etq-pide" role="status">
                  Elige una para seguir
                </span>
              )}
            </span>
            <div className="t-tallas" role="group" aria-label="Talla">
              {tallas.map(({ talla, variante }) => {
                const nota = notaDeTalla(variante, sedeElegida, hayTiendas);
                return (
                  <button
                    key={variante.id}
                    type="button"
                    className="t-talla"
                    aria-pressed={talla.id === tallaId}
                    data-agotada={nota ? "" : undefined}
                    onClick={() => {
                      setPideTalla(false);
                      setTallaId(talla.id === tallaId && tallas.length > 1 ? null : talla.id);
                    }}
                  >
                    {talla.nombre}
                    {nota && <small>{nota}</small>}
                  </button>
                );
              })}
            </div>
          </div>

          <TablaStock ficha={ficha} color={color} colorNombre={colorElegido.nombre} tallaId={tallaId} sedeElegida={sedeElegida} />

          {otrosSepararon && (
            <p className="t-aviso-suave" role="status">
              <Icono nombre="reloj" />
              <span>{otrosSepararon}</span>
            </p>
          )}
          {otraTienda && (
            <p className="t-pdp-nota" role="status">
              <Icono nombre="ubicacion" />
              <span>{otraTienda}</span>
            </p>
          )}

          {botones("t-cta-linea t-pdp-cta")}
          {/* En el celular esta línea solo lleva a la bolsa: lo que pasó al agregar se dice en la barra de abajo. */}
          {lineaDeLaBolsa("t-pdp-bolsa t-pdp-bolsa-info", true)}

          {/* «Arma un look con esta prenda» (actividad 10; lienzo v1, «Entrada desde la ficha»): el probador con ella, en este color. */}
          {probador && (
            <div className="t-pdp-probador">
              <Link className="t-btn t-btn-sec" href={hrefDelProbador(probador.sede, `${probador.codigo}.${color}`)}>
                <Icono nombre="chispas" />
                Arma un look con esta prenda
              </Link>
            </div>
          )}

          {/* Solo el detalle de la prenda (A · Muro, menos texto): cómo se separa y los cambios viven en su página de ayuda. */}
          <div className="t-acordeon">
            {ficha.descripcion && (
              <details open>
                <summary>
                  Detalles <Icono nombre="chevron" />
                </summary>
                <p>{ficha.descripcion}</p>
              </details>
            )}
          </div>
        </div>
      </div>
      {children}
      {/* En el celular, la barra de abajo (maqueta, `pie` de `vProducto`): pegada al borde mientras se ve la prenda y lo de abajo. Al
          agregar, arriba del botón, lo que pasó y el camino a la bolsa (la cabecera, con su globo, ya quedó lejos). */}
      <div className="t-pdp-barra">
        {lineaDeLaBolsa("t-pdp-bolsa t-pdp-bolsa-barra", Boolean(alAgregar))}
        {botones("t-cta-linea")}
      </div>
    </>
  );
}

/** Las fotos del color elegido primero. En el celular se deslizan de lado y los puntos (sobre la foto) dicen cuál se ve. */
function Galeria({ ficha, color, hex, origenFotos }: { ficha: Ficha; color: string; hex: string | null; origenFotos: string | undefined }) {
  const { fotos, enOtroColor } = fotosDelColor(ficha, color);
  const [vista, setVista] = useState(0);
  const forma = formaDe(ficha.categoria?.prefijo);
  // La foto de la tarjeta que se tocó para llegar aquí (lib/prenda-tocada.ts): si es la primera de la ficha, se ve debajo mientras llega
  // la grande, que es otro archivo; así la foto no se apaga entre el esqueleto y la ficha.
  const tocada = usePrendaTocada(ficha.id);
  return (
    <div className="cp-galeria">
      <div
        className="t-galeria"
        onScroll={(e) => {
          const el = e.currentTarget;
          setVista(el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0);
        }}
      >
        {fotos.length === 0 ? (
          <figure className="t-foto-g sin-foto">
            <span className="t-dibujo">
              <DibujoPrenda forma={forma} color={hex} />
            </span>
          </figure>
        ) : (
          fotos.map((url, i) => (
            <FotoGaleria
              key={url}
              url={url}
              alt={`${ficha.nombre}, foto ${i + 1}`}
              optimizar={fotoOptimizable(url, origenFotos)}
              primera={i === 0}
              forma={forma}
              hex={hex}
              rotulo={i === 0 && enOtroColor ? "Foto en otro color" : null}
              previa={i === 0 && tocada && esLaMismaFoto(tocada, url) ? tocada.foto : null}
              // La primera es a donde vuela la foto de la tarjeta tocada (`fotoQueViaja`).
              viaja={i === 0 ? ficha.id : null}
            />
          ))
        )}
      </div>
      {fotos.length > 1 && (
        <div className="t-gal-puntos" aria-hidden="true">
          {fotos.map((url, i) => (
            <i key={url} data-on={i === vista ? "" : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/** ¿Esta foto se acerca con el mouse? Solo en la computadora (desde 960 px de tienda, con la galería en columna) y con un mouse: con el
 *  dedo la tira se desliza y no hay «pasar por encima». */
const seAcerca = (foto: HTMLElement | null) =>
  Boolean(foto) && window.matchMedia("(hover: hover) and (pointer: fine)").matches && (foto?.closest(".tienda")?.clientWidth ?? 0) >= 960;

function FotoGaleria({
  url,
  alt,
  optimizar,
  primera,
  forma,
  hex,
  rotulo,
  previa,
  viaja,
}: {
  url: string;
  alt: string;
  optimizar: boolean;
  primera: boolean;
  forma: ReturnType<typeof formaDe>;
  hex: string | null;
  rotulo: string | null;
  /** La misma foto en chico, la que ya se vio en la tarjeta tocada: se ve mientras llega esta. */
  previa: string | null;
  /** La prenda cuya foto vuela hasta aquí desde la tarjeta tocada (solo la primera). */
  viaja: string | null;
}) {
  // Una foto que no carga deja la silueta, nunca una imagen rota.
  const [rota, setRota] = useState(false);
  // La grande ya se ve: la chica de abajo se va (las dos se multiplican con el fondo y, una encima de otra, oscurecerían la foto).
  const [cargada, setCargada] = useState(false);
  // La lupa (2026-10-16): con el mouse encima, la foto se acerca al doble donde está el mouse y lo sigue. La foto grande se pide recién la
  // primera vez que el mouse entra (nadie la descarga si no mira de cerca) y, mientras llega, se acerca la que ya se ve. Lo que sigue al
  // mouse va por variables de CSS, sin volver a dibujar.
  const [lupa, setLupa] = useState<"no" | "pedida" | "lista">("no");
  const [encima, setEncima] = useState(false);
  const marco = useRef<HTMLElement>(null);

  function seguir(e: EventoPuntero<HTMLElement>) {
    const el = marco.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    el.style.setProperty("--cp-lupa-x", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--cp-lupa-y", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }
  function entrar(e: EventoPuntero<HTMLElement>) {
    if (e.pointerType !== "mouse" || rota || !seAcerca(marco.current)) return;
    seguir(e);
    setEncima(true);
    if (lupa === "no") setLupa("pedida");
  }

  // La primera foto de la computadora ocupa la columna entera (hasta 640 px); las demás, de a dos. Antes decía «34vw» para todas y el
  // navegador elegía una foto más chica que la que se veía.
  const tamanos = primera ? "(min-width: 1280px) 640px, (min-width: 960px) 50vw, 100vw" : "(min-width: 1280px) 320px, (min-width: 960px) 25vw, 100vw";
  return (
    <figure
      ref={marco}
      className={`t-foto-g${rota ? " sin-foto" : ""}`}
      style={viaja ? fotoQueViaja(viaja) : undefined}
      data-cp-lupa={encima ? (lupa === "lista" ? "lista" : "") : undefined}
      onPointerEnter={entrar}
      // Si el mouse ya estaba sobre la foto al llegar la página (no hubo «entrar»), la lupa empieza con el primer movimiento.
      onPointerMove={(e) => (encima ? seguir(e) : entrar(e))}
      onPointerLeave={() => setEncima(false)}
    >
      <span className="t-dibujo">
        <DibujoPrenda forma={forma} color={hex} />
      </span>
      {previa && !rota && !cargada && (
        // La foto que el navegador ya tiene, tal cual: sin pasar otra vez por el optimizador.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa} alt="" aria-hidden="true" className="t-foto-previa" />
      )}
      {!rota && (
        <Image
          src={url}
          alt={alt}
          fill
          sizes={tamanos}
          priority={primera}
          unoptimized={!optimizar}
          onError={() => setRota(true)}
          onLoad={() => setCargada(true)}
        />
      )}
      {!rota && lupa !== "no" && (
        <Image src={url} alt="" aria-hidden fill sizes="1080px" unoptimized={!optimizar} className="cp-lupa" onLoad={() => setLupa("lista")} />
      )}
      {rotulo && <figcaption>{rotulo}</figcaption>}
    </figure>
  );
}

/** «Stock por tienda · Negro»: las tiendas de la web en filas, las tallas del color en columnas y el nivel en cada cruce. */
function TablaStock({
  ficha,
  color,
  colorNombre,
  tallaId,
  sedeElegida,
}: {
  ficha: Ficha;
  color: string;
  colorNombre: string;
  tallaId: string | null;
  sedeElegida: string | null;
}) {
  const tallas = tallasDelColor(ficha, color);
  const varias = tallas.length > 1;
  // Cada tienda maneja lo suyo (2026-10-19): con una tienda elegida, la tabla muestra solo esa; sin ella, todas.
  const tiendas = ficha.sedes.filter((s) => !sedeElegida || s.id === sedeElegida);
  const soloUna = tiendas.length === 1 ? tiendas[0] : null;
  return (
    <div className="t-bloque t-stock-bloque">
      <span className="t-etq">
        <span>
          {soloUna ? `Cuánto hay en ${soloUna.nombre}` : "Cuánto hay por tienda"} <b>{colorNombre}</b>
        </span>
      </span>
      {ficha.sedes.length === 0 ? (
        <p className="t-stock-nota">Pronto verás aquí cuánto hay en cada tienda.</p>
      ) : (
        <>
          <div className="t-stock-envol">
            <table className="t-stock">
              <caption className="t-sr">
                Cuánto hay de {ficha.nombre} en {colorNombre}, {soloUna ? `en ${soloUna.nombre}` : "por tienda"} y por talla
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="t-sr">Tienda</span>
                  </th>
                  {tallas.map(({ talla, variante }) => (
                    <th key={variante.id} scope="col" className={varias && talla.id === tallaId ? "talla-elegida" : undefined}>
                      {talla.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tiendas.map((s) => (
                  <tr key={s.id} className={s.id === sedeElegida && !soloUna ? "elegida" : undefined}>
                    <th scope="row">{s.nombre}</th>
                    {tallas.map(({ talla, variante }) => {
                      const nivel = variante.stock[s.id] ?? 0;
                      return (
                        <td key={variante.id} className={`${tonoNivel(nivel)}${varias && talla.id === tallaId ? " talla-elegida" : ""}`}>
                          {textoNivel(nivel)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** «La campaña termina en 3 días 5 h»: cuenta mientras se mira. La hora del servidor y la del celular difieren por un instante al
 *  cargar: por eso la cifra no avisa esa diferencia (`suppressHydrationWarning`). */
function FaltaCampana({ hasta }: { hasta: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  const falta = faltaParaTerminar(hasta, ahora);
  if (!falta) return null;
  return (
    <span className="t-cuenta-linea" suppressHydrationWarning>
      <Icono nombre="reloj" />
      La campaña termina en&nbsp;<b suppressHydrationWarning>{falta}</b>
    </span>
  );
}
