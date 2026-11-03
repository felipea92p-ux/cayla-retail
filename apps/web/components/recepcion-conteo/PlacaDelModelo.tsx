"use client";

import { type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, Ban, Check, Package, RotateCcw, Sparkles, Tag } from "lucide-react";
import { EtiquetaAhora } from "@/components/alta-producto/guia";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { atajosDelDial } from "@/lib/recepcion-dial-reglas";
import { marcaDeLinea, textoPrendas } from "@/lib/recepcion-conteo-reglas";
import { descripcionDelGrupo, minimoDelGrupo } from "@/lib/recepcion-grupos-reglas";
import { conMiles, conSigno, lineasDeLaParada, nombreDeParada, tipoDeParada, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { EstadoModelo } from "./CategoriasAcordeon";
import { Dial } from "./Dial";
import type { EstadoGuardado } from "./RecibirContando";

// Lo que se está contando (Felipe 2026-11-02, de su boceto; el Dial es el de ADR-0575): el modelo con su foto, cuánto dijeron, cuánto se contó y la diferencia, los botones de sumar y los que
// llevan al siguiente. Debajo, si se quiere, sus tallas y colores. Lo guarda la pantalla: aquí solo se dice qué dejó la persona.

export type ModoDeTallas = "despues" | "ahora";

export function PlacaDelModelo({
  parada,
  sinAviso,
  foto,
  faltanTallas,
  guardado,
  error,
  modo,
  abrirNumero,
  anterior,
  siguiente,
  hayFiltroPuesto,
  puedeCerrar,
  motivoNoCierra,
  otraCosaAbierta,
  filaSeguir,
  onPoner,
  onAnterior,
  onSiguiente,
  onEnter,
  onCerrar,
  onModo,
  onOtraCosa,
  observacion,
  observaciones,
  otraCosa,
  tallas,
}: {
  parada: ParadaDelConteo;
  sinAviso: boolean;
  foto: string | null;
  faltanTallas: boolean;
  guardado: EstadoGuardado | null;
  error: string | null;
  modo: ModoDeTallas;
  /** Llega con el número listo para escribir: viene de apretar Enter en lo anterior. */
  abrirNumero: boolean;
  anterior: ParadaDelConteo | null;
  siguiente: ParadaDelConteo | null;
  hayFiltroPuesto: boolean;
  puedeCerrar: boolean;
  motivoNoCierra?: string;
  otraCosaAbierta: boolean;
  /** La fila de «Anterior» y «Listo, siguiente»: al apretar Enter en el último, el cursor va a su botón. */
  filaSeguir: Ref<HTMLDivElement>;
  /** La persona dejó este número: la pantalla lo guarda en la línea que le toca. */
  onPoner: (n: number) => void;
  onAnterior: () => void;
  onSiguiente: () => void;
  onEnter: () => void;
  onCerrar: () => void;
  onModo: (m: ModoDeTallas) => void;
  onOtraCosa: () => void;
  /** El enlace «Anotar observación». */
  observacion: ReactNode;
  /** Lo ya anotado. */
  observaciones: ReactNode;
  /** «¿Llegó otra cosa?», cuando se abre. */
  otraCosa: ReactNode;
  /** La tabla de tallas y colores, cuando se pide. */
  tallas: ReactNode;
}) {
  const { grupo, modelo } = parada;
  const p = grupo.principal;
  const hayConteo = modelo ? modelo.contado : grupo.lineas.some((l) => l.conteo !== null);
  const contadas = modelo ? modelo.contadas : grupo.contadas;
  const dijeron = modelo ? modelo.esperadas : grupo.dijeron;
  // Un modelo se puede bajar hasta 0 (no llegó); el total de un grupo, no por debajo de lo que ya se dijo qué es.
  const minimo = modelo ? 0 : minimoDelGrupo(grupo);
  const poner = (n: number) => onPoner(Math.max(minimo, Math.max(0, n)));
  const [atajoChico, atajoGrande] = atajosDelDial(dijeron, contadas);
  const yaLlegaron = hayConteo && dijeron != null && dijeron === contadas;
  const noLlego = hayConteo && contadas === 0;
  const diferencia = hayConteo ? contadas - (dijeron ?? 0) : null;
  const tipo = tipoDeParada(parada);

  const contoNombre = lineasDeLaParada(parada)
    .map((l) => l.conteo)
    .filter((c): c is NonNullable<typeof c> => c !== null && !!c.contadoPor?.nombre)
    .sort((a, b) => (b.contadoEn ?? "").localeCompare(a.contadoEn ?? ""))[0]?.contadoPor?.nombre;
  const llevaCuenta = guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : contoNombre ? `Contó ${contoNombre}` : null; // unificar-fijo: el estado de lo que se guarda solo, no un botón (como la planilla de Contar)
  const nombre = modelo ? modelo.nombre : p.categoria ? p.categoria.nombre.toLowerCase() : "prendas";
  const descripcion = modelo ? null : descripcionDelGrupo(grupo);
  const esNueva = !!modelo && !modelo.productoId;
  const sinNumero = contadas <= 0;

  const opcion = (valor: ModoDeTallas, titulo: string, texto: string) => (
    <button type="button" role="radio" className="rc-opcion" aria-checked={!sinNumero && modo === valor} disabled={sinNumero} onClick={() => onModo(valor)}>
      <span className="rc-radio" aria-hidden />
      <span>
        <b>{titulo}</b>
        <small>{texto}</small>
      </span>
    </button>
  );

  return (
    <div key={parada.clave} className="rc-scroll scroll-cayla">
      <div className="rc-placa-cabeza">
        {p.categoria && <MiniaturaPrenda fotoUrl={foto} tamano="2xl" prefijo={p.categoria.prefijo} familia={p.categoria.familia} categoria={p.categoria.nombre} />}
        <div className="rc-placa-textos">
          <TituloSeccion dato={!hayConteo ? <EtiquetaAhora /> : undefined}>{nombreDeParada(parada)}</TituloSeccion>
          <p>{[modelo ? p.categoria?.nombre : null, p.proveedor?.nombre, descripcion].filter(Boolean).join(" · ")}</p>
          <div className="rc-chips">
            {tipo === "nuevo" && (
              <Chip tono="pizarra" versalitas={false}>
                <Sparkles aria-hidden className="h-3 w-3" />
                {modelo?.productoId ? "Nuevo · ya creado" : "Nuevo · por crear"}
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
            {modelo && (modelo.conTallas && modelo.productoId ? <Chip tono="verde">Entra al stock</Chip> : <EstadoModelo m={modelo} faltanTallas={faltanTallas} />)}
            {!p.linea && !sinAviso && <Chip tono="ambar">No estaba en la guía</Chip>}
          </div>
        </div>
        <div className="rc-placa-derecha">
          <p className="rc-guardado" aria-live="polite">
            {llevaCuenta}
          </p>
          <div className="rc-placa-acciones">
            {modelo && (
              <button type="button" className="btn-cayla btn-enlace" aria-expanded={otraCosaAbierta} onClick={onOtraCosa} data-guia="recepcion.otra-cosa">
                ¿Llegó otra cosa?
              </button>
            )}
            {observacion}
          </div>
        </div>
      </div>
      {observaciones}
      {otraCosa}

      <div className="rc-cuenta" data-guia="recepcion.numero">
        <Dial contadas={contadas} dijeron={dijeron} hayConteo={hayConteo} minimo={minimo} nombre={nombre} abrirAlEntrar={abrirNumero} onPoner={poner} onEnter={onEnter} />
        <div className="rc-cifras">
          {!sinAviso && (
            <div className="rc-cifra">
              <small>Dijeron</small>
              <b>{dijeron != null ? conMiles(dijeron) : "—"}</b>
            </div>
          )}
          <div className="rc-cifra">
            <small>Contaste</small>
            <b>{hayConteo ? conMiles(contadas) : "—"}</b>
          </div>
          {!sinAviso && (
            <div className="rc-cifra" data-tono={diferencia == null ? undefined : diferencia === 0 ? "verde" : "ambar"}>
              <small>Diferencia</small>
              <b>{diferencia == null ? "—" : conSigno(diferencia)}</b>
            </div>
          )}
        </div>
        <div className="rc-cuenta-lado">
          {/* Tres clases de botón, de lo más rápido a lo menos común: sumar de a varias, «ya llegaron todas» y «no llegó». El que ya se cumplió se queda en su lugar, marcado. */}
          <div className="rc-atajos">
            <div className="rc-suma" role="group" aria-label="Sumar de a varias">
              <button type="button" onClick={() => poner(contadas + atajoChico)}>
                +{atajoChico}
              </button>
              <button type="button" onClick={() => poner(contadas + atajoGrande)}>
                +{atajoGrande}
              </button>
            </div>
            {dijeron != null && dijeron >= minimo && (
              <button type="button" className="rc-atajo rc-atajo-llegaron" data-hecho={yaLlegaron ? "" : undefined} disabled={yaLlegaron} onClick={() => poner(dijeron)}>
                <Check aria-hidden className="h-4 w-4" />
                Llegaron las {conMiles(dijeron)}
              </button>
            )}
            {contadas > 0 ? (
              minimo === 0 && (
                <button type="button" className="rc-atajo rc-atajo-cero" onClick={() => poner(0)}>
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  Poner en cero
                </button>
              )
            ) : (
              (modelo || p.linea) && (
                <button type="button" className="rc-atajo rc-atajo-cero" data-hecho={noLlego ? "" : undefined} disabled={noLlego} onClick={() => poner(0)}>
                  <Ban aria-hidden className="h-4 w-4" />
                  No llegó nada
                </button>
              )
            )}
          </div>
          <p>Toca el número para escribirlo</p>
          {diferencia != null && diferencia !== 0 && !sinAviso && <p>Si no coincide, al cerrar dices por qué.</p>}
          {grupo.enStock > 0 && <p>Ya entraron {textoPrendas(grupo.enStock)} al stock: lo contado no baja de ahí.</p>}
        </div>
        {/* «Anterior» y «Listo, siguiente», iguales y con su flecha (Felipe 2026-11-02). El nombre de la prenda no va en el botón: uno largo no cabía. */}
        <div ref={filaSeguir} className="rc-seguir" data-guia="recepcion.siguiente">
          <Boton type="button" peso="fantasma" disabled={!anterior} title={anterior ? `Volver a ${nombreDeParada(anterior)}` : undefined} onClick={onAnterior}>
            <span className="inline-flex items-center gap-2">
              <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />{/* unificar-fijo: Felipe pidió «Anterior» con su flecha junto a «Listo, siguiente», los dos con palabra, en esta pantalla (2026-11-02) */}
              Anterior
            </span>
          </Boton>
          {siguiente ? (
            <Boton type="button" peso="primario" title={`Sigue ${nombreDeParada(siguiente)}`} aria-label={`Listo, siguiente: ${nombreDeParada(siguiente)}`} onClick={onSiguiente}>
              <span className="inline-flex items-center gap-2">
                Listo, siguiente
                <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
              </span>
            </Boton>
          ) : hayFiltroPuesto ? (
            <Boton type="button" peso="primario" disabled title="Es el último de esta lista">
              <span className="inline-flex items-center gap-2">
                Listo, siguiente
                <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
              </span>
            </Boton>
          ) : (
            <Boton type="button" peso="primario" disabled={!puedeCerrar} title={motivoNoCierra} onClick={onCerrar}>
              <span className="inline-flex items-center gap-2">
                Pasar a cerrar
                <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
              </span>
            </Boton>
          )}
        </div>
      </div>
      {error && (
        <div className="rc-placa-error">
          <Aviso tono="error" chico>
            {error}
          </Aviso>
        </div>
      )}

      {modelo && (
        <div className="rc-seccion" data-guia="recepcion.que-hacer">
          <p className="rc-seccion-titulo">¿Qué deseas hacer?</p>
          <div className="rc-opciones" role="radiogroup" aria-label="¿Qué deseas hacer?">
            {opcion("despues", "Solo cuadrar cantidad", "Tallas y colores, después.")}
            {opcion("ahora", esNueva ? "Crearlo con sus tallas ahora" : "Tallas y colores ahora", esNueva ? "Primero se crea; después, sus tallas." : "Cuántas hay de cada una.")}
          </div>
          {sinNumero && <p className="text-sm text-taupe">Primero valida la cantidad total. Después podrás completar tallas y colores.</p>}
        </div>
      )}
      {tallas}
    </div>
  );
}
