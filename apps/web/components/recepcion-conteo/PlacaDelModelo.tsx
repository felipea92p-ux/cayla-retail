"use client";

import { type MouseEvent, type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, Ban, Banknote, Check, Package, RotateCcw, Sparkles, Tag } from "lucide-react";
import { EtiquetaAhora } from "@/components/alta-producto/guia";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { atajosDelDial } from "@/lib/recepcion-dial-reglas";
import { marcaDeLinea, textoPrendas } from "@/lib/recepcion-conteo-reglas";
import { descripcionDelGrupo, sinIdentificarDelGrupo } from "@/lib/recepcion-grupos-reglas";
import { conMiles, costoDeLaParada, lineasDeLaParada, nombreDeParada, textoDeCosto, tipoDeParada, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { EstadoModelo } from "./CategoriasAcordeon";
import { Dial } from "./Dial";
import type { EstadoGuardado } from "./RecibirContando";

// La mitad derecha: lo que se está contando (Felipe 2026-11-02, de su boceto; el Dial es el de ADR-0575; en dos mitades desde el 2026-11-11, ADR-0645). El mismo esqueleto que la lista:
// cabeza (la prenda con su foto, su marca y su costo), cuerpo que corre (1 · cuántas llegaron, con el aro y «Llegaron las N» grande; 2 · sus tallas y colores, si se quiere) y pie fijo
// (anterior y siguiente). Aquí no se cierra el conteo: «Revisar y cerrar» vive solo en la lista, y en el último modelo el pie lleva al que quedó sin contar. Lo guarda la pantalla: aquí
// solo se dice qué dejó la persona.

export function PlacaDelModelo({
  parada,
  sinAviso,
  foto,
  faltanTallas,
  guardado,
  error,
  onReintentar,
  pasoTallas,
  tocaRepartir,
  abrirNumero,
  anterior,
  siguiente,
  pendiente,
  hayFiltroPuesto,
  todoContado,
  filaSeguir,
  onPoner,
  onDeUnToque,
  onAnterior,
  onSiguiente,
  onPendiente,
  onQuitarFiltro,
  onEnter,
  observacion,
  observaciones,
  identificar,
  onEditarNombre,
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
  /** Lo que toca ahora es repartir las tallas: el botón principal es el de la tarjeta, no «Listo, siguiente». */
  tocaRepartir: boolean;
  /** Llega con el número listo para escribir: viene de apretar Enter en lo anterior. */
  abrirNumero: boolean;
  anterior: ParadaDelConteo | null;
  siguiente: ParadaDelConteo | null;
  /** En el último modelo: lo que quedó sin contar en otra parte del envío. Con un filtro puesto no se usa: se ofrece ver todos. */
  pendiente: ParadaDelConteo | null;
  hayFiltroPuesto: boolean;
  /** Ya no queda nada por contar: el botón principal de la pantalla pasa a ser «Revisar y cerrar», en la lista. */
  todoContado: boolean;
  /** El pie con «Anterior» y «Listo, siguiente». */
  filaSeguir: Ref<HTMLDivElement>;
  /** La persona dejó este número: la pantalla lo guarda en la línea que le toca. */
  onPoner: (n: number) => void;
  /** «Llegaron las N» o «Poner en cero»: pisan lo contado de un toque, y se pueden deshacer. */
  onDeUnToque: (n: number) => void;
  onAnterior: (e: MouseEvent) => void;
  onSiguiente: (e: MouseEvent) => void;
  onPendiente: (e: MouseEvent) => void;
  onQuitarFiltro: () => void;
  onEnter: () => void;
  /** El enlace «Anotar observación». */
  observacion: ReactNode;
  /** Lo ya anotado. */
  observaciones: ReactNode;
  /** Lo que falta decir de un número suelto de antes. */
  identificar: ReactNode;
  /** Ponerle su nombre al modelo, o cambiárselo. */
  onEditarNombre: () => void;
  /** La tarjeta de tallas y colores: dice cómo va y abre la hoja donde se reparten. */
  tallas: ReactNode;
}) {
  const { grupo, modelo } = parada;
  const p = grupo.principal;
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

  // Sin contar todavía no es «Listo»: pasar es saltarlo, y lo principal es contar. Si toca repartir, lo principal es el botón de la tarjeta. Con todo contado, «Revisar y cerrar», en la lista.
  const pesoSeguir = hayConteo && !todoContado && !tocaRepartir ? "primario" : "fantasma";
  const flecha = <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />;
  return (
    <>
      <div key={`cabeza-${parada.clave}`} className="rc-placa-cabeza">
        {p.categoria && <MiniaturaPrenda fotoUrl={foto} tamano="2xl" prefijo={p.categoria.prefijo} familia={p.categoria.familia} categoria={p.categoria.nombre} />}
        <div className="rc-placa-textos">
          <TituloSeccion>{nombreDeParada(parada)}</TituloSeccion>
          <p>{[modelo ? p.categoria?.nombre : null, p.proveedor?.nombre, descripcion].filter(Boolean).join(" · ")}</p>
          {modelo?.nota && <p>{modelo.nota}</p>}
          <div className="rc-chips">
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
            {p.categoria && (
              <Chip tono="neutro" versalitas={false}>
                <Tag aria-hidden className="h-3 w-3" />
                {marcaDeLinea(p).nombre}
              </Chip>
            )}
            {costo && (
              <Chip tono="neutro" versalitas={false} title="Lo que cuesta cada prenda, según la compra">
                <Banknote aria-hidden className="h-3 w-3" />
                Costo {textoDeCosto(costo)}
              </Chip>
            )}
            {!p.linea && !sinAviso && <Chip tono="ambar">No estaba en la guía</Chip>}
          </div>
        </div>
        <div className="rc-placa-derecha">
          <p className="rc-guardado" aria-live="polite">
            {llevaCuenta}
          </p>
          <div className="rc-placa-acciones">
            {modelo && !modelo.productoId && !modelo.anotada && <LapizEditar que={`el nombre de ${modelo.nombre}`} onClick={onEditarNombre} />}
            {observacion}
          </div>
        </div>
      </div>

      <div key={parada.clave} className="rc-scroll scroll-cayla rc-placa-cuerpo">
        {observaciones}
        {identificar}

        <section className="rc-bloque" aria-label="¿Cuántas llegaron?">
          <div className="rc-bloque-titulo">
            <span className="rc-paso" data-estado={hayConteo ? "hecha" : "toca"} aria-hidden>
              {hayConteo ? <Check className="h-4 w-4" /> : 1}
            </span>
            <h3 className="rc-bloque-nombre">¿Cuántas llegaron?</h3>
            {/* Lo mismo que dice su fila en la lista. Sin contar, «Sigue» lo dice. */}
            <span className="rc-bloque-estado">{!hayConteo ? <EtiquetaAhora /> : modelo ? <EstadoModelo m={modelo} faltanTallas={faltanTallas} sinAviso={sinAviso} /> : null}</span>
          </div>
          <div className="rc-cuenta" data-guia="recepcion.numero">
            <Dial contadas={contadas} dijeron={dijeron} hayConteo={hayConteo} minimo={minimo} nombre={nombre} abrirAlEntrar={abrirNumero} onPoner={poner} onEnter={onEnter} />
            <div className="rc-cuenta-lado">
              {/* De lo más rápido a lo menos común: «ya llegaron todas» grande y primero (es lo que más se toca y deja el modelo listo), sumar de a varias y «no llegó». El que ya se cumplió se queda en su lugar, marcado. */}
              {dijeron != null && dijeron >= minimo && (
                <button type="button" className="rc-atajo rc-atajo-llegaron rc-atajo-grande" data-hecho={yaLlegaron ? "" : undefined} disabled={yaLlegaron} onClick={() => deUnToque(dijeron)}>
                  <Check aria-hidden className="h-5 w-5" />
                  Llegaron las {conMiles(dijeron)}
                </button>
              )}
              <div className="rc-atajos">
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
              {/* Una sola línea de ayuda, en su lugar reservado: si apareciera otra, lo de abajo se movería bajo el mouse al primer toque. */}
              <p className="rc-pista">{diferencia != null && diferencia !== 0 && !sinAviso ? "Si no coincide, al cerrar dices por qué." : "Toca el número para escribirlo."}</p>
              {enStock > 0 && <p>Ya entraron {textoPrendas(enStock)} al stock: lo contado no baja de ahí.</p>}
            </div>
          </div>
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

        {modelo && (
          <section className="rc-bloque" aria-label="Tallas y colores">
            <div className="rc-bloque-titulo">
              <span className="rc-paso" data-estado={pasoTallas} aria-hidden>
                {pasoTallas === "hecha" ? <Check className="h-4 w-4" /> : 2}
              </span>
              <h3 className="rc-bloque-nombre">Tallas y colores</h3>
              <span className="rc-bloque-estado">
                {yaEntroTodo ? <Chip tono="verde">Ya en el stock</Chip> : modelo.conTallas && modelo.productoId ? <Chip tono="verde">Entra al stock</Chip> : pasoTallas === "toca" && hayConteo ? <EtiquetaAhora /> : null}
              </span>
            </div>
            {tallas}
          </section>
        )}
      </div>

      {/* El pie fijo: anterior y siguiente, con su palabra y su flecha (Felipe 2026-11-02). El nombre de lo que sigue va al lado, no en el botón: uno largo no cabía. */}
      <div ref={filaSeguir} className="rc-placa-pie" data-guia="recepcion.siguiente">
        <p className="rc-pie-sigue">
          {siguiente ? (
            <>
              Después: <b title={nombreDeParada(siguiente)}>{nombreDeParada(siguiente)}</b>
            </>
          ) : hayFiltroPuesto ? (
            "Es el último de lo que filtraste"
          ) : pendiente ? (
            <>
              Falta contar: <b title={nombreDeParada(pendiente)}>{nombreDeParada(pendiente)}</b>
            </>
          ) : todoContado ? (
            "Es el último modelo"
          ) : (
            "Solo falta este"
          )}
        </p>
        <div className="rc-pie-pasos">
          <Boton type="button" peso="fantasma" disabled={!anterior} title={anterior ? `Antes: ${nombreDeParada(anterior)}` : undefined} onClick={onAnterior}>
            <span className="inline-flex items-center gap-2">
              <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />{/* unificar-fijo: Felipe pidió «Anterior» con su flecha junto a «Listo, siguiente», los dos con palabra, en esta pantalla (2026-11-02) */}
              Anterior
            </span>
          </Boton>
          {siguiente ? (
            <Boton type="button" peso={pesoSeguir} title={`Sigue ${nombreDeParada(siguiente)}`} aria-label={`${hayConteo ? "Listo, siguiente" : "Siguiente"}: ${nombreDeParada(siguiente)}`} onClick={onSiguiente}>
              <span className="inline-flex items-center gap-2">
                {hayConteo ? "Listo, siguiente" : "Siguiente"}
                {flecha}
              </span>
            </Boton>
          ) : hayFiltroPuesto ? (
            <Boton type="button" peso="fantasma" onClick={onQuitarFiltro}>
              Ver todos
            </Boton>
          ) : pendiente ? (
            <Boton type="button" peso={pesoSeguir} title={`Sigue ${nombreDeParada(pendiente)}`} aria-label={`Ir al que falta: ${nombreDeParada(pendiente)}`} onClick={onPendiente}>
              <span className="inline-flex items-center gap-2">
                Ir al que falta
                {flecha}
              </span>
            </Boton>
          ) : null}
        </div>
      </div>
    </>
  );
}
