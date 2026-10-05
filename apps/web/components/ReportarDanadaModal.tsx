"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { sonarConfirmacion } from "@/lib/sonido-confirmar";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { esFalloDeRed, type ErrorEscritura } from "@/lib/error-escritura";
import { formatearHoraLima } from "@/lib/bajada-reglas";
import type { PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import {
  argumentosDeReporte,
  camposGuiaReporte,
  cantidadAjustada,
  desdeInicial,
  estadoValidado,
  interpretarErrorDeDanada,
  leerRespuestaDanada,
  libreEn,
  MAX_TEXTO_DANADA,
  puedeEnviarReporte,
  quePasaAlReportar,
  recordatorioAlReportar,
  respuestaResuelveLaMarca,
  RPC_REPORTAR_DANADA,
  tallaInicial,
  tallasReportables,
  textoBotonReportar,
  TEXTO_REPORTE_YA_ESTABA,
  tieneAlgoLibre,
  tituloExitoReporte,
  type DesdeDanada,
  type EnvioReporte,
  type TallaReportable,
} from "@/lib/danadas-reglas";

const TOPE_ESPERA_MS = 20_000;

/** Debajo del rechazo, mientras lo enviado sigue en duda porque la base no miró la marca. `hora` ya viene en 24 h de Lima. */
function textoMarcaSinResolver(hora: string): string {
  return `Todavía no sabemos si lo que enviaste a las ${hora} se guardó. Cuando se resuelva lo de arriba, vuelve a confirmar: si ya se había guardado, no se repite.`;
}

// «Reportar dañada» (ADR-0328, actividad 10): una prenda manchada, rota o descosida que aparece en el perchero (o en el almacén) se
// reporta desde su tarjeta en Existencias. Pasa a la cuarentena de la sede en UNA llamada a `reportar_danada` (todo o nada, con marca
// de reintento): deja de contarse para la venta y el líder decide en Dañadas si se arregló y vuelve, se liquida, se bota o se dona.
// El stock se cuenta por código, no por prenda: por eso la ventana pide sacarla del perchero (si quedan otras iguales, la caja
// sigue cobrando ese código, y la manchada colgada podría salir vendida).
// Reportar no es perder (la prenda sigue en la tienda): perder es botarla o donarla, y eso lo decide el líder después.
//
// Se pregunta lo mínimo para que el líder decida bien: cuál (color y talla), dónde estaba (lo libre de cada lugar: lo apartado para un
// cliente no se mueve), cuántas y qué tiene. Ni el lugar ni la talla vienen elegidos de fábrica: solo si hay UNA opción posible.
export function ReportarDanadaModal({
  prendas,
  colorInicial,
  ubicacionId,
  sede,
  alCerrarEnfocar,
  onClose,
}: {
  /** Los colores del modelo (`coloresDelModelo`), cada uno con todas sus tallas de esta sede. */
  prendas: readonly PrendaAgrupada<FilaExistencias>[];
  /** El color que se estaba viendo (su `clave`): entra elegido. */
  colorInicial: string | null;
  ubicacionId: string;
  /** El nombre de la sede, para el aviso de éxito. */
  sede: string;
  /** El control que abrió la ventana (la tarjeta, desde el menú «⋯»): al cerrar, el teclado vuelve ahí. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const modelo = prendas[0];
  const [colorClave, setColorClave] = useState<string>(() => prendas.find((p) => p.clave === colorInicial)?.clave ?? modelo?.clave ?? "");
  const color = prendas.find((p) => p.clave === colorClave) ?? modelo;
  const tallas = useMemo(() => tallasReportables(color?.tallas ?? []), [color]);
  const [varianteId, setVarianteId] = useState<string | null>(() => tallaInicial(tallas));
  const talla: TallaReportable | null = tallas.find((t) => t.varianteId === varianteId) ?? null;
  const [desde, setDesde] = useState<DesdeDanada | null>(() => desdeInicial(talla));
  const [cantidadTexto, setCantidadTexto] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La marca de este intento (ADR-0208): el mismo reporte enviado otra vez devuelve lo ya guardado sin moverla dos veces. Una por
  // ventana abierta; un rechazo de la base la deja libre (la transacción se deshizo entera).
  const token = useRef<string>(crypto.randomUUID());
  // Tras una respuesta incierta (corte de red) lo ENVIADO queda guardado tal cual y se reenvía igual: cambiarlo sería otro reporte
  // con la misma marca, y validarlo contra las cifras releídas trabaría la ventana justo cuando el reporte sí se guardó.
  const [enDuda, setEnDuda] = useState<EnvioReporte | null>(null);
  const congelado = enDuda !== null;
  const enviadoEn = useRef<string | null>(null);
  // Candado contra el doble clic en el mismo instante: `loading` apaga el botón recién en el render siguiente.
  const enVuelo = useRef(false);
  // Mover una prenda a la cuarentena es operación de tienda: pide quién lo hace, como toda acción que guarda (ADR-0161).
  const responsable = useResponsable();

  const cantidad = Number(cantidadTexto.trim() === "" ? Number.NaN : cantidadTexto);
  const estado = estadoValidado({ talla, desde, cantidad, motivo }, enDuda);
  const libre = libreEn(estado.talla, estado.desde);
  const guia = useGuiaCampos(camposGuiaReporte(estado, responsable.listo));
  const puedeEnviar = puedeEnviarReporte(congelado, guia.puedeConfirmar, responsable.listo);
  const bloqueado = congelado || loading;

  function limpiarError() {
    setError(null);
  }
  function elegirColor(clave: string) {
    if (bloqueado || clave === colorClave) return;
    const nueva = prendas.find((p) => p.clave === clave);
    const suyas = tallasReportables(nueva?.tallas ?? []);
    const t = suyas.find((x) => x.varianteId === tallaInicial(suyas)) ?? null;
    setColorClave(clave);
    setVarianteId(t?.varianteId ?? null);
    setDesde(desdeInicial(t));
    setCantidadTexto("1");
    limpiarError();
  }
  function elegirTalla(t: TallaReportable) {
    if (bloqueado) return;
    // Si el lugar elegido sigue teniendo algo en la talla nueva, se respeta; si no, solo se elige si es el único posible.
    const lugar = desde && libreEn(t, desde) > 0 ? desde : desdeInicial(t);
    setVarianteId(t.varianteId);
    setDesde(lugar);
    setCantidadTexto(String(cantidadAjustada(cantidad, libreEn(t, lugar))));
    limpiarError();
  }
  function elegirDesde(lugar: DesdeDanada) {
    if (bloqueado) return;
    setDesde(lugar);
    setCantidadTexto(String(cantidadAjustada(cantidad, libreEn(talla, lugar))));
    limpiarError();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !puedeEnviar) return;
    // Lo que viaja: lo ya enviado si está en duda (mismos datos, misma marca) o lo elegido ahora.
    const envio: EnvioReporte | null =
      enDuda ??
      (talla && desde
        ? {
            argumentos: argumentosDeReporte(ubicacionId, talla.varianteId, desde, cantidad, motivo, token.current),
            estado: { talla, desde, cantidad, motivo },
            detalle: `${modelo?.referencia ?? "La prenda"}${color?.color ? ` · ${color.color}` : ""}${talla.talla ? ` · ${talla.talla}` : ""} · ${sede}`,
          }
        : null);
    if (!envio) return;
    enVuelo.current = true;
    setLoading(true);
    setError(null);
    const eraReenvio = enviadoEn.current !== null;
    const marcaDeEnvio = (enviadoEn.current ??= new Date().toISOString());
    // Sin tope, una conexión colgada dejaría la ventana bloqueada para siempre: a los 20 s se corta y se trata como un corte de red.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const respuesta = await firmar(
        createClient()
          .rpc(RPC_REPORTAR_DANADA, envio.argumentos)
          .abortSignal(control.signal),
        responsable.firma(),
      );
      data = respuesta.data;
      errorRpc = respuesta.error;
    } catch (excepcion) {
      errorRpc = { message: excepcion instanceof Error ? excepcion.message : String(excepcion) };
    }
    window.clearTimeout(tope);
    setLoading(false);
    responsable.despues(errorRpc);

    if (errorRpc) {
      enVuelo.current = false;
      const fallo = interpretarErrorDeDanada(errorRpc, "reportar la prenda dañada");
      if (fallo.tipo === "red") {
        // Sin respuesta no se sabe si se reportó: lo enviado se congela y solo se reenvía igual, con la misma marca.
        setEnDuda(envio);
        setError(fallo.mensaje);
        if (!esFalloDeRed(errorRpc)) router.refresh();
        return;
      }
      if (eraReenvio && !respuestaResuelveLaMarca(errorRpc)) {
        // La base contestó sin mirar la marca (sesión vencida, módulo apagado): lo anterior sigue en duda.
        setEnDuda(envio);
        setError(`${fallo.mensaje} ${textoMarcaSinResolver(formatearHoraLima(marcaDeEnvio))}`);
        return;
      }
      enviadoEn.current = null;
      setEnDuda(null);
      setError(fallo.mensaje);
      // Las cifras se releen: lo que otra persona movió (o apartó) ya no engaña a esta ventana.
      if (fallo.tipo === "sin_alcance") router.refresh();
      return;
    }

    const r = leerRespuestaDanada(data) ?? { ya_registrada: false, id: "", unidades: envio.argumentos.p_cantidad };
    // El sistema ya la movió; la percha todavía no: el aviso recuerda sacarla, también cuando «ya estaba» guardado.
    const detalle = `${envio.detalle}. ${recordatorioAlReportar(envio.argumentos.p_desde)}`;
    if (r.ya_registrada) avisar.aviso(TEXTO_REPORTE_YA_ESTABA, { detalle });
    else {
      sonarConfirmacion();
      avisar.exito(tituloExitoReporte(r.unidades), { detalle });
    }
    router.refresh();
    onClose();
  }

  if (!modelo || !color) return null;

  return (
    <Modal titulo="Reportar dañada" subtitulo="Una prenda con mancha, rotura o descosida" onClose={onClose} bloqueado={loading} alCerrarEnfocar={alCerrarEnfocar} ancho="max-w-lg">
      {(cerrar) => (
        // `noValidate`: sin él la burbuja del navegador frena el envío y no salen los textos propios.
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          <div className="flex items-center gap-3">
            <MiniaturaPrenda fotoUrl={color.fotoUrl ?? modelo.fotoUrl ?? null} colorHex={color.colorHex} tamano="lg" />
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] text-tinta">
              <span className="font-semibold">{modelo.referencia}</span>
              <span className="text-taupe">{color.color ?? "Sin color"}</span>
            </p>
          </div>

          <CampoGuiado id="talla" guia={guia} titulo="¿Cuál es?" ayuda={prendas.length > 1 ? "El color y la talla" : "La talla"} retiene="fila">
            {prendas.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Color">
                {prendas.map((p) => (
                  <ChipOpcion key={p.clave} elegido={p.clave === color.clave} onClick={() => elegirColor(p.clave)} disabled={bloqueado}>
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-1 ring-tinta/20" style={{ background: p.colorHex ?? undefined }} />
                    {p.color ?? "Sin color"}
                  </ChipOpcion>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Talla">
              {tallas.map((t) => {
                const hay = t.piso + t.almacen;
                return (
                  <ChipOpcion
                    key={t.varianteId}
                    elegido={t.varianteId === varianteId}
                    onClick={() => elegirTalla(t)}
                    disabled={bloqueado || !tieneAlgoLibre(t)}
                    className="min-w-[3.25rem] justify-center"
                  >
                    <span className="font-medium">{t.talla ?? "Única"}</span>
                    <span className="text-[11px] tabular-nums text-taupe">{hay}</span>
                  </ChipOpcion>
                );
              })}
            </div>
            {tallas.every((t) => !tieneAlgoLibre(t)) && (
              <p className="mt-2 text-xs text-taupe">Este color no tiene prendas libres en el piso ni en el almacén (lo apartado para un cliente no se reporta).</p>
            )}
          </CampoGuiado>

          <CampoGuiado id="desde" guia={guia} titulo="¿Dónde estaba?">
            <div className="flex flex-wrap gap-1.5">
              <ChipOpcion elegido={desde === "piso"} onClick={() => elegirDesde("piso")} disabled={bloqueado || !talla || talla.piso === 0}>
                Colgada en el piso
                {talla && <span className="text-[11px] tabular-nums text-taupe">{talla.piso} {talla.piso === 1 ? "libre" : "libres"}</span>}
              </ChipOpcion>
              <ChipOpcion elegido={desde === "almacen"} onClick={() => elegirDesde("almacen")} disabled={bloqueado || !talla || talla.almacen === 0}>
                Guardada en el almacén
                {talla && <span className="text-[11px] tabular-nums text-taupe">{talla.almacen} {talla.almacen === 1 ? "libre" : "libres"}</span>}
              </ChipOpcion>
            </div>
          </CampoGuiado>

          <CampoGuiado id="cantidad" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("cantidad", "¿Cuántas?")}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, libre)}
              step={1}
              value={cantidadTexto}
              onChange={(e) => {
                setCantidadTexto(e.target.value);
                limpiarError();
              }}
              disabled={bloqueado}
              pie={libre > 1 ? "Si cada una tiene un daño distinto, repórtalas por separado: el líder decide una por una." : undefined}
            />
          </CampoGuiado>

          <CampoGuiado id="motivo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("motivo", "¿Qué tiene?")}
              placeholder="Describe el daño: dónde está y cómo es"
              maxLength={MAX_TEXTO_DANADA}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                limpiarError();
              }}
              disabled={bloqueado}
            />
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={loading} />
          </CampoGuiado>

          <p className="nota-cayla text-xs leading-snug">{quePasaAlReportar(estado.desde)}</p>

          {error && (
            <p role="alert" className="text-sm text-rojo-profundo">
              {error}
            </p>
          )}

          <PieGuia guia={guia} listo="Todo listo para reportar." />

          {/* `pie-hoja-fijo`: Cancelar y el botón principal no se van bajo el pliegue en un laptop de 768 px de alto (globals.css). */}
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} disabled={loading} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={loading}
              disabled={!puedeEnviar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              {textoBotonReportar(cantidad, congelado)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
