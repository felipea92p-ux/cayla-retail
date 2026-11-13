"use client";

import { useRef, useState, type MouseEvent, type ReactNode, type Ref } from "react";
import { Ban, Banknote, Check, Package, Repeat, RotateCcw, Sparkles, Tag, TriangleAlert } from "lucide-react";
import { EtiquetaAhora } from "@/components/alta-producto/guia";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { atajosDelDial } from "@/lib/recepcion-dial-reglas";
import { marcaDeLinea, textoPrendas } from "@/lib/recepcion-conteo-reglas";
import { esCategoriaPorDefinir } from "@/lib/recepcion-envio-reglas";
import { descripcionDelGrupo, sinIdentificarDelGrupo } from "@/lib/recepcion-grupos-reglas";
import { conMiles, costoDeLaParada, lineasDeLaParada, nombreDeParada, textoDeCosto, tipoDeParada, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { EstadoModelo } from "./CategoriasAcordeon";
import { LoQueAnotoCompras } from "./LoQueAnotoCompras";
import { Dial } from "./Dial";
import type { EstadoGuardado } from "./RecibirContando";

// La mitad derecha: lo que se está contando (Felipe 2026-11-02, de su boceto; el Dial es el de ADR-0575; en dos mitades desde el 2026-11-11, ADR-0645). El mismo esqueleto que la lista:
// cabeza (la prenda con su foto, su marca y su costo), cuerpo que corre (1 · cuántas llegaron, con el aro y «Llegaron las N» grande; 2 · sus tallas y colores, si se quiere) y pie fijo
// (a qué ir si falta algo y «Revisar y cerrar»: desde el 2026-11-12 sin «Anterior» ni «Siguiente», y el cierre pasó de la lista a este pie). Lo guarda la
// pantalla: aquí solo se dice qué dejó la persona.

export function PlacaDelModelo({
  parada,
  sinAviso,
  foto,
  faltanTallas,
  guardado,
  error,
  onReintentar,
  pasoTallas,
  abrirNumero,
  pendiente,
  hayFiltroPuesto,
  todoContado,
  filaSeguir,
  onPoner,
  onDeUnToque,
  onPendiente,
  cierre,
  onQuitarFiltro,
  onEnter,
  onDanada,
  onOtraPrenda,
  notaDeAlgo,
  observacion,
  observaciones,
  identificar,
  onEditarNombre,
  onCorregirLinea,
  tallas,
}: {
  parada: ParadaDelConteo;
  sinAviso: boolean;
  foto: string | null;
  faltanTallas: boolean;
  guardado: EstadoGuardado | null;
  error: string | null;
  /** Vuelve a mandar lo que no se pudo guardar. */
  onReintentar: () => void;
  /** Cómo va el paso 2: espera (sin número o nada que hacer ahora), toca o ya está. */
  pasoTallas: "falta" | "toca" | "hecha";
  /** Llega con el número listo para escribir: viene de apretar Enter en lo anterior. */
  abrirNumero: boolean;
  /** El próximo modelo sin contar del envío (dando la vuelta): el pie lleva a él. `null` con todo contado. */
  pendiente: ParadaDelConteo | null;
  hayFiltroPuesto: boolean;
  /** Ya no queda nada por contar: el botón principal de la pantalla pasa a ser «Revisar y cerrar», en la lista. */
  todoContado: boolean;
  /** El pie del contador (Enter, con todo contado, lleva el cursor a su «Revisar y cerrar»). */
  filaSeguir: Ref<HTMLDivElement>;
  /** La persona dejó este número: la pantalla lo guarda en la línea que le toca. */
  onPoner: (n: number) => void;
  /** «Llegaron las N» o «Poner en cero»: pisan lo contado de un toque, y se pueden deshacer. */
  onDeUnToque: (n: number) => void;
  onPendiente: (e: MouseEvent) => void;
  /** «Revisar y cerrar» (`BotonCerrarConteo`), a la derecha del pie del contador: el único de la pantalla en escritorio. */
  cierre?: ReactNode;
  onQuitarFiltro: () => void;
  onEnter: () => void;
  /** «Llegó dañada»: abre la hoja de tallas en la parte de las dañadas. Sin ella, el botón va apagado y `notaDeAlgo` dice por qué. */
  onDanada?: () => void;
  /** «Es otra prenda»: al tenerla en la mano se vio que era otra. */
  onOtraPrenda?: () => void;
  /** Por qué alguno de los dos está apagado, a la vista. Antes de contar no se repite: lo dice la tarjeta de tallas, justo arriba («Primero cuenta cuántas llegaron»). */
  notaDeAlgo?: string | null;
  /** El botón «Anotar algo». */
  observacion: ReactNode;
  /** Lo ya anotado. */
  observaciones: ReactNode;
  /** Lo que falta decir de un número suelto de antes. */
  identificar: ReactNode;
  /** Ponerle su nombre al modelo, o cambiárselo. */
  onEditarNombre: () => void;
  /** Corregir la categoría y la marca de un modelo «por crear» que vino anotado en la compra (Felipe 2026-11-12). Sin ella, no se ofrece. */
  onCorregirLinea?: () => void;
  /** La tarjeta de tallas y colores: dice cómo va y abre la hoja donde se reparten. */
  tallas: ReactNode;
}) {
  const { grupo, modelo } = parada;
  const p = grupo.principal;
  const porDefinir = !!p.categoria && esCategoriaPorDefinir(p.categoria);
  const hayConteo = modelo ? modelo.contado : true;
  // Sin modelo, lo contado de antes que todavía no es de ninguno: nunca se compara con lo que dijeron.
  const contadas = modelo ? modelo.contadas : sinIdentificarDelGrupo(grupo);
  const dijeron = modelo ? modelo.esperadas : null;
  // Un modelo se puede bajar hasta 0 (no llegó) o hasta lo que ya entró al stock.
  const minimo = modelo ? modelo.enStock : 0;
  const enStock = modelo ? modelo.enStock : 0;
  // Lo que ya entró al stock ya tiene sus tallas: de eso no hay nada que decidir.
  const yaEntroTodo = !!modelo && modelo.enStock > 0 && modelo.contadas === modelo.enStock;
  const poner = (n: number) => onPoner(Math.max(minimo, Math.max(0, n)));
  const deUnToque = (n: number) => onDeUnToque(Math.max(minimo, Math.max(0, n)));
  const [atajoChico, atajoGrande] = atajosDelDial(dijeron, contadas);
  const yaLlegaron = hayConteo && dijeron != null && dijeron === contadas;
  const noLlego = hayConteo && contadas === 0;
  const diferencia = hayConteo && modelo?.estado !== "contado" ? contadas - (dijeron ?? 0) : null;
  const tipo = tipoDeParada(parada);
  const costo = costoDeLaParada(parada);

  const contoNombre = lineasDeLaParada(parada)
    .map((l) => l.conteo)
    .filter((c): c is NonNullable<typeof c> => c !== null && !!c.contadoPor?.nombre)
    .sort((a, b) => (b.contadoEn ?? "").localeCompare(a.contadoEn ?? ""))[0]?.contadoPor?.nombre;
  const llevaCuenta = guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : contoNombre ? `Contó ${contoNombre}` : null; // unificar-fijo: el estado de lo que se guarda solo, no un botón (como la planilla de Contar)
  const nombre = modelo ? modelo.nombre : p.categoria ? p.categoria.nombre.toLowerCase() : "prendas";
  const descripcion = modelo ? null : descripcionDelGrupo(grupo);

  // «Llegaron las N» deja el número listo de un toque. Si con eso toca repartir, el contador baja hasta la tarjeta de tallas (Felipe 2026-11-11, cambio 1 de
  // /formidable): a 1440×900 «Repartir tallas y colores» quedaba 71 px bajo el borde y había que buscarlo. Baja la mitad del contador, no la página; donde esa
  // mitad no tiene su propio scroll (apiladas, el celular), baja la página lo justo, sin meter la tarjeta bajo la isla. Con + y − no se mueve nada: la persona
  // sigue ajustando. Se mira el DOM después de pintar: ahí ya está dicho si el paso 2 «toca».
  const cuerpo = useRef<HTMLDivElement>(null);
  const bloqueTallas = useRef<HTMLElement>(null);
  const bajarALasTallas = () => {
    const c = cuerpo.current;
    const b = bloqueTallas.current;
    if (!c || !b || b.querySelector(".rc-paso")?.getAttribute("data-estado") !== "toca") return;
    const behavior = prefiereQuieto() ? "auto" : "smooth";
    const caja = b.getBoundingClientRect();
    if (c.scrollHeight > c.clientHeight + 1) {
      const marco = c.getBoundingClientRect();
      const falta = caja.bottom - marco.bottom;
      if (falta > 0) c.scrollBy({ top: Math.min(falta, caja.top - marco.top), behavior });
      return;
    }
    const isla = document.querySelector<HTMLElement>(".rc-isla")?.getBoundingClientRect();
    const fondo = isla && isla.height > 0 ? isla.top - 12 : window.innerHeight - 16;
    if (caja.bottom > fondo) window.scrollBy({ top: caja.bottom - fondo, behavior });
  };
  // «Llegaron las N» y, si la tarjeta de tallas no se ve (el contador angosto la pone debajo), baja hasta ella. Ya no pliega el paso 1: con el paso 2 al lado
  // (Felipe 2026-11-12, mesa del contador) el dial no queda cortado.
  const llegaronTodas = (n: number) => {
    deUnToque(n);
    requestAnimationFrame(() => requestAnimationFrame(bajarALasTallas));
  };
  // Lo que anotó Compras de este modelo (Felipe 2026-11-12): la foto se toca y lo abre en una hoja. Sin línea de compra (un envío sin aviso), no hay nada que mostrar.
  const lineasDeCompra = lineasDeLaParada(parada).map((l) => l.linea).filter((l): l is NonNullable<typeof l> => l !== null);
  const [verCompra, setVerCompra] = useState(false);
  const precioSugerido = lineasDeCompra.find((l) => l.precioVentaSugerido != null)?.precioVentaSugerido ?? null;
  const marcaTexto = p.categoria ? marcaDeLinea(p).nombre : null;
  // El paso 2, la columna de la derecha (Felipe 2026-11-12, mesa del contador: «una línea separará al medio el paso 1 y el paso 2; de esta manera los
  // botones de abajo ya no quedan fuera de vista»). El estado del modelo («Faltan tallas») va aquí, sobre la tarjeta: es de las tallas.
  const bloqueDeTallas = () =>
    modelo ? (
      <section ref={bloqueTallas} className="rc-bloque rc-paso-dos" aria-label="Tallas y colores">
        <div className="rc-bloque-titulo">
          <span className="rc-paso" data-estado={pasoTallas} aria-hidden>
            {pasoTallas === "hecha" ? <Check className="h-4 w-4" /> : 2}
          </span>
          <h3 className="rc-bloque-nombre">Tallas y colores</h3>
          <span className="rc-bloque-estado">
            {yaEntroTodo ? <Chip tono="verde">Ya en el stock</Chip> : modelo.conTallas && modelo.productoId ? <Chip tono="verde">Entra al stock</Chip> : pasoTallas === "toca" && hayConteo ? <EtiquetaAhora /> : null}
          </span>
        </div>
        {hayConteo && (
          <div className="rc-paso-dos-estado">
            <EstadoModelo m={modelo} faltanTallas={faltanTallas} sinAviso={sinAviso} />
          </div>
        )}
        {tallas}
      </section>
    ) : null;
  return (
    <>
      <div key={`cabeza-${parada.clave}`} className="rc-placa-cabeza">
        {/* La foto (o el ícono) se toca y abre lo que anotó Compras: la descripción, el costo y el precio sugerido (Felipe 2026-11-12). */}
        {p.categoria &&
          (lineasDeCompra.length > 0 ? (
            <button type="button" className="rc-placa-foto" onClick={() => setVerCompra(true)} aria-label={`Ver lo que anotó Compras de ${nombreDeParada(parada)}`} title="Ver lo que anotó Compras">
              <MiniaturaPrenda fotoUrl={foto} tamano="2xl" prefijo={p.categoria.prefijo} familia={p.categoria.familia} categoria={p.categoria.nombre} />
            </button>
          ) : (
            <MiniaturaPrenda fotoUrl={foto} tamano="2xl" prefijo={p.categoria.prefijo} familia={p.categoria.familia} categoria={p.categoria.nombre} />
          ))}
        <div className="rc-placa-textos">
          <TituloSeccion>{nombreDeParada(parada)}</TituloSeccion>
          {/* De dónde es, en una línea: la categoría, quién la trajo y su marca (antes la marca era una píldora más). */}
          <p>{[modelo ? p.categoria?.nombre : null, p.proveedor?.nombre, marcaTexto, descripcion].filter(Boolean).join(" · ")}</p>
          {modelo?.nota && <p>{modelo.nota}</p>}
          <div className="rc-chips">
            {/* La píldora dice solo el estado: nueva o re stock, y si no venía en la guía. Las cifras van aparte, en palabras. */}
            {tipo === "nuevo" && (
              <Chip tono="pizarra" versalitas={false}>
                <Sparkles aria-hidden className="h-3 w-3" />
                {modelo?.productoId || modelo?.enStock ? "Nuevo · ya creado" : "Nuevo · por crear"}
              </Chip>
            )}
            {tipo === "restock" && (
              <Chip tono="neutro" versalitas={false}>
                <Package aria-hidden className="h-3 w-3" />
                Re stock
              </Chip>
            )}
            {!p.linea && !sinAviso && <Chip tono="ambar">No estaba en la guía</Chip>}
          </div>
          {(costo || precioSugerido != null) && (
            <p className="rc-placa-cifras">
              {costo && (
                <span title="Lo que cuesta cada prenda, según la compra">
                  <Banknote aria-hidden className="h-4 w-4" />
                  Costo <b>{textoDeCosto(costo)}</b>
                </span>
              )}
              {precioSugerido != null && (
                <span title="El precio de venta que propuso quien compró">
                  <Tag aria-hidden className="h-4 w-4" />
                  Venta sugerida <b>S/&nbsp;{precioSugerido.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                </span>
              )}
              {lineasDeCompra.length > 0 && (
                <button type="button" className="btn-cayla btn-enlace" onClick={() => setVerCompra(true)}>
                  Ver lo que anotó Compras
                </button>
              )}
            </p>
          )}
        </div>
        <div className="rc-placa-derecha">
          <p className="rc-guardado" aria-live="polite">
            {llevaCuenta}
          </p>
          <div className="rc-placa-acciones">
            {modelo && !modelo.productoId && !modelo.anotada && <LapizEditar que={`el nombre de ${modelo.nombre}`} onClick={onEditarNombre} />}
            {/* Lo anotado en la compra: su nombre no se toca aquí, pero sí la categoría y la marca si se anotaron mal (un polo que era blusa). */}
            {onCorregirLinea && <LapizEditar que={`la categoría y la marca de ${modelo?.nombre ?? "este modelo"}`} onClick={onCorregirLinea} />}
          </div>
        </div>
      </div>

      <div key={parada.clave} ref={cuerpo} className="rc-scroll scroll-cayla rc-placa-cuerpo">
        {identificar}
        {/* ADR-0660: llegó «por definir» desde Mis compras. Antes de contarla se dice qué es (la base no la deja contar sin eso). */}
        {porDefinir && (
          <Aviso
            tono="atencion"
            titulo="Primero di qué es"
            chico
            guia="recepcion.por-definir"
            accion={
              onCorregirLinea ? (
                <Boton type="button" peso="fantasma" onClick={onCorregirLinea}>
                  Decir qué es
                </Boton>
              ) : undefined
            }
          >
            Esta prenda llegó por definir: elige su categoría y después cuéntala.
          </Aviso>
        )}

        {/* Paso 1 y paso 2 lado a lado, con una línea al medio (Felipe 2026-11-12, mesa del contador). Con el contador angosto, uno bajo el otro (CSS). */}
        {/* Por definir (ADR-0660): el contador espera a que se diga qué es; contar antes era un número que la base no guarda. */}
        <div className={`rc-pasos ${porDefinir ? "opacity-50" : ""}`} inert={porDefinir} aria-disabled={porDefinir || undefined}>
        <section className="rc-bloque rc-paso-uno" aria-label="¿Cuántas llegaron?">
          <div className="rc-bloque-titulo">
            <span className="rc-paso" data-estado={hayConteo ? "hecha" : "toca"} aria-hidden>
              {hayConteo ? <Check className="h-4 w-4" /> : 1}
            </span>
            <h3 className="rc-bloque-nombre">¿Cuántas llegaron?</h3>
            {/* Lo mismo que dice su fila en la lista. Sin contar, «Sigue» lo dice. */}
            <span className="rc-bloque-estado">{!hayConteo ? <EtiquetaAhora /> : null}</span>
          </div>
          <div className="rc-cuenta" data-guia="recepcion.numero">
            <Dial contadas={contadas} dijeron={dijeron} hayConteo={hayConteo} minimo={minimo} nombre={nombre} abrirAlEntrar={abrirNumero} onPoner={poner} onEnter={onEnter} />
            <div className="rc-cuenta-lado">
              {/* De lo más rápido a lo menos común, uno bajo el otro junto al dial (Felipe 2026-11-12, mesa del contador): «ya llegaron todas» primero y en
                  verde, sumar de a varias y «poner en cero» o «no llegó». El que ya se cumplió se queda en su lugar, marcado. */}
              <div className="rc-atajos">
                {dijeron != null && dijeron >= minimo && (
                  <button type="button" className="rc-atajo rc-atajo-llegaron" data-hecho={yaLlegaron ? "" : undefined} disabled={yaLlegaron} onClick={() => llegaronTodas(dijeron)}>
                    <Check aria-hidden className="h-5 w-5" />
                    Llegaron las {conMiles(dijeron)}
                  </button>
                )}
                <div className="rc-suma" role="group" aria-label="Sumar de a varias">
                  <button type="button" onClick={() => poner(contadas + atajoChico)}>
                    +{atajoChico}
                  </button>
                  <button type="button" onClick={() => poner(contadas + atajoGrande)}>
                    +{atajoGrande}
                  </button>
                </div>
                {contadas > 0 ? (
                  minimo === 0 && (
                    <button type="button" className="rc-atajo rc-atajo-cero" onClick={() => deUnToque(0)}>
                      <RotateCcw aria-hidden className="h-4 w-4" />
                      Poner en cero
                    </button>
                  )
                ) : (
                  // Sin aviso nadie dijo que venía: lo que no llegó, simplemente no se agrega.
                  modelo && !sinAviso && (
                    <button
                      type="button"
                      className="rc-atajo rc-atajo-cero"
                      data-hecho={noLlego ? "" : undefined}
                      disabled={noLlego}
                      onClick={() => {
                        poner(0);
                        avisar.exito("Anotado: no llegó nada de este modelo");
                      }}
                    >
                      <Ban aria-hidden className="h-4 w-4" />
                      No llegó nada
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          {/* La pista bajo el dial: una sola línea, en su lugar reservado (si apareciera otra, lo de abajo se movería bajo el mouse al primer toque). */}
          <p className="rc-pista">{diferencia != null && diferencia !== 0 && !sinAviso ? "Si no coincide, al cerrar dices por qué." : "Toca el número para escribirlo."}</p>
          {enStock > 0 && <p className="rc-pista-stock">Ya entraron {textoPrendas(enStock)} al stock: lo contado no baja de ahí.</p>}
          {error && (
            <div className="rc-placa-error">
              <Aviso
                tono="error"
                chico
                accion={
                  <button type="button" className="btn-cayla btn-enlace" onClick={onReintentar}>
                    Reintentar
                  </button>
                }
              >
                {error}
              </Aviso>
            </div>
          )}
        </section>
        {bloqueDeTallas()}
        </div>

        {/* Lo que puede pasar con la prenda, a la vista y con su palabra (ADR-0645): antes estaba repartido entre un enlace de la cabecera y dos rincones de la tabla de tallas. */}
        <section className="rc-bloque" aria-label="¿Pasó algo con esta prenda?">
          <div className="rc-bloque-titulo">
            <h3 className="rc-bloque-nombre">¿Pasó algo con esta prenda?</h3>
          </div>
          <div className="rc-algo" data-guia="recepcion.algo">
            <Boton type="button" peso="fantasma" disabled={!onDanada} onClick={onDanada}>
              <span className="inline-flex items-center gap-2">
                <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
                Llegó dañada
              </span>
            </Boton>
            <Boton type="button" peso="fantasma" disabled={!onOtraPrenda} onClick={onOtraPrenda}>
              <span className="inline-flex items-center gap-2">
                <Repeat aria-hidden className="h-4 w-4 shrink-0" />
                Es otra prenda
              </span>
            </Boton>
            {observacion}
          </div>
          {notaDeAlgo && <p className="rc-bloque-nota">{notaDeAlgo}</p>}
          {observaciones}
        </section>
      </div>

      {/* Sin «Anterior» ni «Siguiente» (Felipe 2026-11-12: «no sirven, ya que todas las colaboradoras usan la lista de categorías para moverse
          entre las prendas»). A la izquierda, a qué ir si falta algo; a la derecha, el ÚNICO «Revisar y cerrar» de la pantalla (ADR-0645), que
          viene de `ContarEnvio` con su peso (negro solo cuando es lo que toca). Enter sigue pasando al siguiente modelo. */}
      <div ref={filaSeguir} className="rc-placa-pie" data-guia="recepcion.siguiente">
        <p className="rc-pie-sigue">
          {pendiente ? (
            <>
              Falta contar:{" "}
              <button type="button" className="btn-cayla btn-enlace" title={`Ir a ${nombreDeParada(pendiente)}`} onClick={onPendiente}>
                {nombreDeParada(pendiente)}
              </button>
            </>
          ) : hayFiltroPuesto ? (
            <>
              Es el último de lo que filtraste ·{" "}
              <button type="button" className="btn-cayla btn-enlace" onClick={onQuitarFiltro}>
                Ver todos
              </button>
            </>
          ) : todoContado ? (
            "Todo contado: revisa y cierra."
          ) : (
            "Solo falta este."
          )}
        </p>
        {cierre && <div className="rc-pie-pasos rc-pie-cierre">{cierre}</div>}
      </div>
      {verCompra && (
        <LoQueAnotoCompras nombre={nombreDeParada(parada)} foto={foto} categoria={p.categoria ?? null} lineas={lineasDeCompra} onCerrar={() => setVerCompra(false)} />
      )}
    </>
  );
}
