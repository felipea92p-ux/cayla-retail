"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Boton, CampoTexto, Desplegable } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { fechaCorta } from "@/lib/compras-reglas";
import { cantidadConUnidad, nombreUnidad } from "@/lib/ordenes-insumo-reglas";
import { esEnvioConOtrosDatos } from "@/lib/comprobante-orden-reglas";
import {
  MOTIVOS_NO_LLEGA,
  TOPES_RECEPCION_OI,
  argsRecibirOrdenInsumo,
  camposDeRecepcionOI,
  detalleDeRecepcionOI,
  entradaInicialOI,
  milesimasQueLlegan,
  milesimasQueQuedan,
  resumenDeRecepcionOI,
  textoDelRestoOI,
  type EntradaRecepcionOI,
  type LineaOIPorRecibir,
  type OrdenInsumoPorRecibir,
} from "@/lib/recepcion-orden-insumo-reglas";
import { recibirOrdenInsumo } from "@/lib/ordenes-insumo-acciones";

// Recibir en el Taller contra una orden de insumos (ADR-0362, fase 7 parte 2 · actividades 3 y 4), desde Producción ▸ Recibir. Por cada
// línea con algo por recibir: cuánto llegó (en blanco = todo lo que queda; «0» = nada esta vez, como la recepción del papel), el costo por
// unidad, un código de lote opcional y, si después de lo que llega todavía queda algo, «El resto no va a llegar» con su motivo (actividad
// 4: queda anotado en la orden como lo que el proveedor nos debe, a ese costo). Quien recibe ve y corrige el costo de ESA orden (decisión 53): viene puesto el sugerido —el del papel si la línea
// tiene uno solo; si no, el neto de la orden— y es el costo con que el lote entra al Taller (PEPS). Lo que el papel trajo fuera de la orden
// (decisión 43) se recibe aquí también. Cada línea que llega abre UN lote con su movimiento de compra.
//
// Quién firma: el combo «Responsable», como la recepción de siempre; quien hizo la orden no la recibe (decisión 17: la base lo rechaza, y la
// lista ya no ofrece la hoja a quien la hizo). Un doble clic no recibe dos veces: el token se genera una vez y la base devuelve la misma
// recepción si el envío se repite igual (también tras un corte de señal). Con la guía de foco (cada línea dice lo que le falta) y el pie
// fijo de una hoja larga.

// El título de cada caja de una línea (la caja hundida deja su etiqueta solo para el lector).
const TITULO = "mb-1 text-[12px] font-semibold text-tinta";

/** Qué decir cuando se corta la señal: la recepción pudo llegar a la base y perderse solo la respuesta; repetir igual no duplica nada. */
const AVISO_DE_CORTE =
  "Se cortó la conexión y no sabemos si la recepción llegó a registrarse. Vuelve a pulsar «Registrar recepción» sin cambiar nada: si ya se registró, no se repite.";

export function RecibirOrdenInsumoModal({
  orden: o,
  tallerId,
  onClose,
  volverA,
}: {
  orden: OrdenInsumoPorRecibir;
  tallerId: string;
  onClose: () => void;
  volverA?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [token] = useState(() => crypto.randomUUID());
  const [entradas, setEntradas] = useState<EntradaRecepcionOI[]>(() => o.lineas.map(entradaInicialOI));
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  // El candado contra dos clics en el mismo instante (ver `recibir`).
  const enVuelo = useRef(false);
  // Responsable (ADR-0161/0162): la recepción firma con quien se elige en el combo, como la del papel.
  const responsable = useResponsable();

  const campos = camposDeRecepcionOI(o, entradas, nota, { listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  // Sobre el botón, lo que va a pasar con cantidades: lo que entra (también lo de una caja en blanco) y lo que no va a llegar, con lo que
  // nos debe el proveedor (/formidable 2026-10-14: el pie contaba «lotes» e «insumos»).
  const resumen = resumenDeRecepcionOI(o, entradas);

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  const cambiar = (itemId: string, cambio: Partial<EntradaRecepcionOI>) => {
    setError(null);
    setEntradas((es) => es.map((e) => (e.itemId === itemId ? { ...e, ...cambio } : e)));
  };

  async function recibir() {
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic. El candado es el de la casa: una ref que
    // se pone en el mismo tick y se suelta al terminar.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const { resultado, error: falla } = await recibirOrdenInsumo(argsRecibirOrdenInsumo(o, entradas, { tallerId, nota, token }), responsable.firma());
      responsable.despues(falla);
      setGuardando(false);
      if (falla) {
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE, recargar: false });
        else setError({ texto: traducirError(falla, "registrar la recepción"), recargar: esEnvioConOtrosDatos(falla.message) });
        return;
      }
      if (resultado) {
        avisar.exito(`Recepción de ${resultado.documento} registrada`, { detalle: `${detalleDeRecepcionOI(resultado)} El saldo de Insumos ya lo refleja.` });
      } else {
        avisar.aviso("La recepción se envió, pero no pudimos leer la respuesta", { detalle: `Revisa en Insumos que haya entrado lo de ${o.documento}.`, duracion: 12000 });
      }
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Recibir ${o.documento}`}
      subtitulo={`${o.proveedor}${o.creadaEn ? ` · pedida el ${fechaCorta(o.creadaEn)}` : ""}${o.creadaPor ? ` por ${o.creadaPor}` : ""}`}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      alCerrarEnfocar={volverA}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void recibir();
          }}
          noValidate
          className="space-y-4"
        >
          <p className="text-sm text-tinta/75">
            Escribe cuánto llegó de cada insumo: en blanco es todo lo que queda, y «0» si de ese insumo no llegó nada esta vez. El costo es el de
            esta orden: corrígelo si el papel dice otro.
          </p>
          <ul className="space-y-3">
            {o.lineas.map((l) => (
              <LineaParaRecibir
                key={l.itemId}
                linea={l}
                entrada={entradas.find((e) => e.itemId === l.itemId) ?? entradaInicialOI(l)}
                codigoPorDefecto={o.documento}
                guia={guia}
                onCambio={(c) => cambiar(l.itemId, c)}
              />
            ))}
          </ul>
          {campos.some((c) => c.id === "llega") && (
            <CampoGuiado id="llega" guia={guia}>
              <p className="text-xs text-taupe">Si no llegó nada de ningún insumo, no hay nada que registrar todavía.</p>
            </CampoGuiado>
          )}
          <CampoGuiado id="nota" guia={guia} titulo="Nota de la entrega">
            <CampoTexto
              etiqueta="Nota de la entrega"
              caja
              sinPie
              maxLength={TOPES_RECEPCION_OI.nota}
              placeholder="Opcional · guía, quién la trajo…" // sugerir-fijo: dice qué se anota en una entrega, no depende de nada elegido antes
              value={nota}
              onChange={(e) => {
                setError(null);
                setNota(e.target.value);
              }}
            />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          {error && (
            <Aviso
              ref={avisoError}
              enfocable
              tono="error"
              titulo="No se pudo registrar la recepción"
              accion={
                error.recargar ? (
                  <Boton
                    type="button"
                    onClick={() => {
                      onClose();
                      router.refresh();
                    }}
                  >
                    Recargar
                  </Boton>
                ) : undefined
              }
            >
              {error.texto}
            </Aviso>
          )}
          {/* Con algo pendiente, la frase de debajo dice qué y por qué (un número que no vale ya no se explica solo con el mouse encima). */}
          <PieGuia guia={guia} conFrase listo={resumen ?? "Todo listo para registrar."} />
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton textoCargando="Registrando…" type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Registrar recepción
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Una línea por recibir: el insumo con lo pedido, lo facturado y lo que ya llegó; cuánto llega ahora, el costo y el código del lote. */
function LineaParaRecibir({
  linea: l,
  entrada: e,
  codigoPorDefecto,
  guia,
  onCambio,
}: {
  linea: LineaOIPorRecibir;
  entrada: EntradaRecepcionOI;
  /** El código que la base le pone al lote si se deja en blanco: el número de la orden. */
  codigoPorDefecto: string;
  guia: ReturnType<typeof useGuiaCampos>;
  onCambio: (c: Partial<EntradaRecepcionOI>) => void;
}) {
  const m = milesimasQueLlegan(l, e);
  const resto = milesimasQueQuedan(l, e);
  const textoDelResto = textoDelRestoOI(l, e);
  const porUnidad = nombreUnidad(l.unidad, 1);
  const contexto = [
    l.pedido != null ? `pediste ${cantidadConUnidad(l.pedido, l.unidad)}` : null,
    l.facturado > 0 ? `facturado ${cantidadConUnidad(l.facturado, l.unidad)}` : null,
    l.recibido > 0 ? `ya llegó ${cantidadConUnidad(l.recibido, l.unidad)}` : null,
  ].filter(Boolean);
  return (
    <li>
      <CampoGuiado id={`linea-${l.itemId}`} guia={guia} retiene="fila" className="rounded-xl border border-sand bg-papel p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="min-w-0 text-[14px] text-tinta">
            {l.insumo}
            {l.codigo && <span className="ml-1.5 text-xs text-taupe">{l.codigo}</span>}
          </p>
          <p className="text-xs tabular-nums text-tinta/70">
            quedan <b className="font-semibold text-tinta">{cantidadConUnidad(l.queda, l.unidad)}</b>
          </p>
        </div>
        {(contexto.length > 0 || l.tipo === "papel") && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-taupe">
            {l.tipo === "papel" && <Chip tono="pizarra">No estaba en la orden{l.documento ? ` · ${l.documento}` : ""}</Chip>}
            {contexto.length > 0 && <span>{contexto.join(" · ")}</span>}
          </p>
        )}
        <div className="mt-2.5 grid items-end gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="min-w-0">
            <p className={TITULO}>Llegó</p>
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="min-w-0 flex-1">
              <CampoTexto
                caja
                sinPie
                etiqueta={`Llegó de ${l.insumo}, en ${nombreUnidad(l.unidad)}`}
                inputMode="decimal"
                placeholder={String(l.queda)} // sugerir-fijo: en blanco llega todo lo que queda; el ejemplo ES esa cantidad
                value={e.llego}
                onChange={(ev) => onCambio({ llego: ev.target.value })}
                />
              </div>
              <span aria-hidden className="shrink-0 text-[13px] text-taupe-profundo">
                {nombreUnidad(l.unidad, m != null ? m / 1000 : null)}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className={TITULO}>Costo por {porUnidad} <span className="font-normal text-taupe">sin IGV</span></p>
            <CampoTexto
            caja
            sinPie
            etiqueta={`Costo por ${porUnidad} de ${l.insumo}, sin IGV`}
            inputMode="decimal"
            placeholder="0.00" // sugerir-fijo: un costo en soles no depende de nada elegido antes
            value={e.costo}
            onChange={(ev) => onCambio({ costo: ev.target.value })}
            />
          </div>
          <div className="min-w-0">
            <p className={TITULO}>Código de lote <span className="font-normal text-taupe">opcional</span></p>
            <CampoTexto
            caja
            sinPie
            mono
            etiqueta={`Código de lote de ${l.insumo} (opcional)`}
            maxLength={TOPES_RECEPCION_OI.codigoLote}
            placeholder={codigoPorDefecto}
            value={e.codigoLote}
            onChange={(ev) => onCambio({ codigoLote: ev.target.value })}
            />
          </div>
        </div>
        {/* Lo que no va a llegar (actividad 4): solo si se escribió cuánto llegó y todavía queda algo (en blanco llega todo). */}
        {e.llego.trim() !== "" && resto != null && resto > 0 && (
          <div className="mt-2.5 space-y-2">
            <label className="flex items-center gap-2 text-[13px] text-tinta/80">
              <Casilla
                marcada={e.noLlegara}
                onCambio={() => onCambio({ noLlegara: !e.noLlegara })}
                etiqueta={`El resto de ${l.insumo} (${cantidadConUnidad(resto / 1000, l.unidad)}) no va a llegar`}
              />
              El resto ({cantidadConUnidad(resto / 1000, l.unidad)}) no va a llegar
            </label>
            {e.noLlegara && (
              <Desplegable
                etiquetaAccesible={`Por qué no va a llegar el resto de ${l.insumo}`}
                valor={e.motivo}
                onValor={(v) => onCambio({ motivo: v })}
                opciones={MOTIVOS_NO_LLEGA.map((x) => ({ valor: x.valor, texto: x.etiqueta }))}
              />
            )}
            {textoDelResto && <p className="text-xs text-taupe">{textoDelResto}</p>}
          </div>
        )}
      </CampoGuiado>
    </li>
  );
}
