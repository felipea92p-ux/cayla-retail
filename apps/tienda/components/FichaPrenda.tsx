"use client";

import { useEffect, useMemo, useState } from "react";
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
  faltaParaTerminar,
  fotosDelColor,
  notaDeTalla,
  precioDeLaFicha,
  tallaDelPrecio,
  tallasDelColor,
  type Ficha,
} from "@/lib/ficha";
import { leyendaNiveles, textoNivel, tonoNivel } from "@/lib/stock";
import { AgregarALaBolsa } from "./bolsa/AgregarALaBolsa";
import { BotonAvisame } from "./club/BotonAvisame";
import { BotonFavorito } from "./club/BotonFavorito";
import { DibujoPrenda } from "./DibujoPrenda";
import { Icono } from "./Icono";

/**
 * La ficha de una prenda (maqueta v4, `vProducto`): las fotos (en el celular, una tira que se desliza con sus puntos; en la computadora,
 * la primera grande y las demás de a dos), el nombre, el precio en la tienda elegida con su campaña, los colores, las tallas y CUÁNTO
 * HAY EN CADA TIENDA del color elegido, como nivel («Hay», 3, 2, «Última», «—»), con la tienda elegida y la talla resaltadas.
 *
 * Debajo de la tabla, el botón principal (`botonDeLaFicha`): «Elige tu talla» apagado, «Agregar a la bolsa» si esa talla hay en alguna
 * tienda de la web o «Avísame cuando llegue» si no hay en ninguna; a su derecha, el corazón. Antes, si otros ya separaron lo que queda
 * en la tienda elegida, la propuesta k; después, «Ver mi bolsa (N)». En el celular el botón y el corazón van en la barra de abajo, que
 * queda pegada mientras se ve la prenda y lo que va debajo (`children`: «Combínalo con», «También te puede gustar»).
 */
export function FichaPrenda({
  ficha,
  sedeElegida,
  colorPedido,
  origenFotos,
  chips = [],
  cambios,
  esperas = [],
  enLaBolsa = 0,
  separadas = [],
  children,
}: {
  ficha: Ficha;
  /** La tienda de «Ver lo que hay en» (su id), o null con «Todas». */
  sedeElegida: string | null;
  /** `?color=` de la dirección: con qué color abre. */
  colorPedido: string | null;
  origenFotos: string | undefined;
  /** Los chips de arriba del nombre que vienen del catálogo («Nuevo…», «N.º 3 en más vendidos»). */
  chips?: { texto: string; tono?: "nuevo" }[];
  /** «Cambios»: como en tienda, con el plazo de la caja (`lib/ayuda.ts`, el mismo de «Cambios y devoluciones»). */
  cambios: string;
  /** Lo que la cuenta ya pidió con «Avísame» (`claveEspera`: prenda y tienda). */
  esperas?: readonly string[];
  /** Cuántas prendas lleva la bolsa (la cookie): «Ver mi bolsa (N)». */
  enLaBolsa?: number;
  /** Las tallas cuyo resto en la tienda elegida ya separaron otros clientes (propuesta k; solo con una tienda elegida). */
  separadas?: readonly string[];
  /** Lo que va debajo de la ficha: la barra del celular queda pegada abajo mientras se ve. */
  children?: React.ReactNode;
}) {
  const [color, setColor] = useState(() => colorInicial(ficha, colorPedido));
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
  const boton = botonDeLaFicha(elegida);
  const tallaElegida = tallas.find((t) => t.variante === elegida)?.talla.nombre ?? "";
  const yaSeparadas = useMemo(() => new Set(separadas), [separadas]);
  const otrosSepararon = avisoOtrosSepararon(elegida, tiendaElegida, yaSeparadas);

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
            pedido={anotadas.has(clave)}
            alAnotar={() => setAnotadas((antes) => new Set(antes).add(clave))}
          />
        ) : (
          <AgregarALaBolsa varianteId={boton.tipo === "agregar" ? boton.varianteId : null} sedeId={sedeElegida} />
        )}
        <BotonFavorito productoId={ficha.id} nombre={ficha.nombre} forma="ficha" />
      </div>
    );
  }

  return (
    <>
      <div className="t-pdp">
        {/* Otra clave por color: al cambiarlo, la tira vuelve a su primera foto (la del color nuevo). */}
        <Galeria key={color} ficha={ficha} color={color} hex={colorElegido.hex} origenFotos={origenFotos} />

        <div className="t-pdp-info">
          <div>
            {(chips.length > 0 || campana) && (
              <div className="t-pdp-chips">
                {chips.map((c) => (
                  <span key={c.texto} className={`t-chip${c.tono ? ` ${c.tono}` : ""}`}>
                    {c.tono === "nuevo" && <Icono nombre="chispa" />}
                    {c.texto}
                  </span>
                ))}
                {campana && <span className="t-chip oferta">{campana}</span>}
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
                  data-color-dato
                  style={c.hex ? { background: c.hex } : undefined}
                  aria-pressed={c.codigo === color}
                  aria-label={c.nombre}
                  title={c.nombre}
                  onClick={() => elegirColor(c.codigo)}
                />
              ))}
            </div>
            {!colorElegido.foto && ficha.fotos.length > 0 && <span className="t-swatch-nota">Este color aún no tiene foto: la ves en otro color.</span>}
          </div>

          <div className="t-bloque">
            <span className="t-etq">
              <span>
                Talla{elegida && tallas.length > 1 && <b> {tallaElegida}</b>}
              </span>
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
                    onClick={() => setTallaId(talla.id === tallaId && tallas.length > 1 ? null : talla.id)}
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

          {botones("t-cta-linea t-pdp-cta")}
          {enLaBolsa > 0 && (
            <Link className="t-enlace t-ver-bolsa" href="/bolsa">
              Ver mi bolsa ({enLaBolsa})
            </Link>
          )}

          <div className="t-acordeon">
            <details open>
              <summary>
                Cómo funciona separar <Icono nombre="chevron" />
              </summary>
              <p>
                Agrega tus prendas, elige tu tienda y toca «Separar». Se crea tu pedido con su número; lo mandas por WhatsApp y la tienda
                revisa que esté y te confirma. No pagas nada en la web: el pago se coordina por WhatsApp y lo recoges en tu tienda.
              </p>
            </details>
            {ficha.descripcion && (
              <details>
                <summary>
                  Detalles <Icono nombre="chevron" />
                </summary>
                <p>{ficha.descripcion}</p>
              </details>
            )}
            <details>
              <summary>
                Cambios <Icono nombre="chevron" />
              </summary>
              <p>{cambios}</p>
            </details>
          </div>
        </div>
      </div>
      {children}
      {/* En el celular, la barra de abajo (maqueta, `pie` de `vProducto`): pegada al borde mientras se ve la prenda y lo de abajo. */}
      <div className="t-pdp-barra">{botones("t-cta-linea")}</div>
    </>
  );
}

/** Las fotos del color elegido primero. En el celular se deslizan de lado y los puntos dicen cuál se ve. */
function Galeria({ ficha, color, hex, origenFotos }: { ficha: Ficha; color: string; hex: string | null; origenFotos: string | undefined }) {
  const { fotos, enOtroColor } = fotosDelColor(ficha, color);
  const [vista, setVista] = useState(0);
  const forma = formaDe(ficha.categoria?.prefijo);
  return (
    <div>
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

function FotoGaleria({
  url,
  alt,
  optimizar,
  primera,
  forma,
  hex,
  rotulo,
}: {
  url: string;
  alt: string;
  optimizar: boolean;
  primera: boolean;
  forma: ReturnType<typeof formaDe>;
  hex: string | null;
  rotulo: string | null;
}) {
  // Una foto que no carga deja la silueta, nunca una imagen rota.
  const [rota, setRota] = useState(false);
  return (
    <figure className={`t-foto-g${rota ? " sin-foto" : ""}`}>
      <span className="t-dibujo">
        <DibujoPrenda forma={forma} color={hex} />
      </span>
      {!rota && (
        <Image
          src={url}
          alt={alt}
          fill
          sizes="(min-width: 960px) 34vw, 100vw"
          priority={primera}
          unoptimized={!optimizar}
          onError={() => setRota(true)}
        />
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
  return (
    <div className="t-bloque t-stock-bloque">
      <span className="t-etq">
        <span>
          Cuánto hay por tienda <b>{colorNombre}</b>
        </span>
      </span>
      {ficha.sedes.length === 0 ? (
        <p className="t-stock-nota">Pronto verás aquí cuánto hay en cada tienda.</p>
      ) : (
        <>
          <div className="t-stock-envol">
            <table className="t-stock">
              <caption className="t-sr">
                Cuánto hay de {ficha.nombre} en {colorNombre}, por tienda y talla
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
                {ficha.sedes.map((s) => (
                  <tr key={s.id} className={s.id === sedeElegida ? "elegida" : undefined}>
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
          <p className="t-stock-nota">{leyendaNiveles(ficha.umbral)}</p>
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
