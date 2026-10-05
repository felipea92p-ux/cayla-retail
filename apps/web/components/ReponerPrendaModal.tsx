"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MatrizMover } from "@/components/MatrizMover";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { esFalloDeRed, type ErrorEscritura } from "@/lib/error-escritura";
import {
  argumentosDeBajada,
  avisoDeExito,
  interpretarErrorDeBajada,
  leerRespuestaDeBajada,
  resolverTokenReusado,
  respuestaResuelveLaMarca,
  RPC_BAJADA,
  textoDeExito,
  textoMarcaSinResolver,
  type RespuestaBajada,
} from "@/lib/bajada-reglas";
import {
  coloresConAlgo,
  coloresParaMover,
  detalleDeLoMovido,
  lineasDeMoverModelo,
  sePuedeBajarTalla,
  textoBotonReponer,
  textoFilaSinAlcance,
  totalAReponer,
  totalesDeMatriz,
  type Cantidades,
  type PrendaParaReponer,
} from "@/lib/reponer-prenda-reglas";

const TOPE_ESPERA_MS = 20_000;

// «Reponer prenda» (ADR-0295, ADR-0317): el botón de la tarjeta abre ESTA ventana con el MODELO entero —una fila por color, una
// columna por talla— y al confirmar llama UNA vez a `bajar_al_piso` (todo o nada, con marca de reintento: ADR-0208). Antes abría
// una ventana por color: un Polo en azul, blanco y negro eran tres búsquedas, tres ventanas y tres esperas.
//
// Por qué `bajar_al_piso` y no `mover_entre_piso_y_almacen` una vez por talla: con dos llamadas, la segunda puede fallar
// con la primera ya guardada y la prenda queda repuesta a medias (ADR-0208 lo descartó: «llamar N veces desde la web no
// es todo o nada»). Las filas de movimiento son las mismas que escribía «Reponer» (cada línea es un `mover_interno`
// almacén → piso) y Frescura las lee por su forma, así que ningún indicador cambia; solo se suma la cabecera de la bajada.
//
// La ventana NO sugiere cuántas bajar (ADR-0231): arranca en cero y la cifra la pone quien tiene la prenda en la mano.
// «Retirar del piso» sigue en `ReponerPisoModal`: es una sola talla y lleva nota.
export function ReponerPrendaModal({
  prendas,
  ubicacionId,
  sede,
  alCerrarEnfocar,
  onClose,
}: {
  /** Los colores del modelo, cada uno con todas sus tallas (la prenda que se tocó va primero). */
  prendas: readonly PrendaParaReponer[];
  ubicacionId: string;
  /** El nombre de la sede, para los textos de la base («…al piso de Tienda TRU»). */
  sede: string;
  /** El control que abrió la ventana (el «Reponer» de la tarjeta): al cerrar, el teclado vuelve ahí. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const colores = coloresParaMover(prendas);
  const modelo = prendas[0];
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que la base contestó fila por fila («Solo queda 1»): se borra apenas la persona cambia esa cifra.
  const [problemas, setProblemas] = useState<Record<string, string>>({});
  // La marca de este intento (ADR-0208): el mismo intento enviado otra vez devuelve lo ya guardado sin bajar de nuevo.
  // Una por ventana abierta; un rechazo de la base la deja libre (la transacción se deshizo entera).
  const token = useRef<string>(crypto.randomUUID());
  // Tras una respuesta incierta (corte de red) las cifras quedan fijas: cambiarlas sería otro intento y bajaría de nuevo
  // lo que quizá ya se bajó. Solo se puede reenviar LO MISMO o cerrar.
  const [congelado, setCongelado] = useState(false);
  const enviadoEn = useRef<string | null>(null);
  // Candado contra el doble clic en el mismo instante: `loading` apaga el botón recién en el render siguiente.
  const enVuelo = useRef(false);
  // Mover prendas pide Responsable como toda acción que guarda en la tienda (ADR-0161).
  const responsable = useResponsable();

  const lineas = lineasDeMoverModelo(colores, cantidades, "bajar");
  const total = totalAReponer(lineas);
  const totales = totalesDeMatriz(colores, cantidades, "bajar");
  const hayAlgoQueBajar = colores.some((c) => c.tallas.some(sePuedeBajarTalla));

  // La guía de foco (ADR-0284) sale de lo que ya bloquea el botón: algo elegido y quién lo hace.
  const guia = useGuiaCampos([
    { id: "cantidades", nombre: "Cuántas bajar", requerido: true, hecho: total > 0, pendiente: "Elige cuántas prendas bajar." },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién baja las prendas." },
  ]);

  function cambiar(varianteId: string, cantidad: number) {
    if (congelado) return;
    setCantidades((previas) => ({ ...previas, [varianteId]: cantidad }));
    setError(null);
    setProblemas((previos) => {
      if (!(varianteId in previos)) return previos;
      const resto = { ...previos };
      delete resto[varianteId];
      return resto;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !responsable.listo) return;
    if (lineas.length === 0) {
      setError("Elige cuántas prendas bajar.");
      return;
    }
    enVuelo.current = true;
    setLoading(true);
    setError(null);
    setProblemas({});
    const eraReenvio = enviadoEn.current !== null;
    const marcaDeEnvio = (enviadoEn.current ??= new Date().toISOString());
    // Sin tope, una conexión colgada dejaría la ventana bloqueada para siempre: a los 20 s se corta y se trata como un
    // corte de red (mensaje honesto, se puede cerrar), porque la base pudo haber guardado igual.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const respuesta = await firmar(
        createClient()
          .rpc(RPC_BAJADA as never, argumentosDeBajada(ubicacionId, lineas, token.current) as never)
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
      const fallo = interpretarErrorDeBajada(errorRpc, sede);
      if (fallo.tipo === "red") {
        // Sin respuesta no se sabe si se guardó: las cifras se congelan y solo se reenvía igual, con la misma marca.
        setCongelado(true);
        setError(fallo.mensaje);
        // Con la red caída no se refresca: un refresh sin red se vuelve navegación completa y borra el mensaje honesto.
        if (!esFalloDeRed(errorRpc)) router.refresh();
        return;
      }
      if (eraReenvio && !respuestaResuelveLaMarca(errorRpc)) {
        // La base contestó sin mirar la marca (módulo apagado, sesión vencida): lo anterior sigue en duda y las cifras
        // siguen fijas; soltarlas dejaría bajar dos veces lo que quizá ya se guardó.
        setCongelado(true);
        setError(`${fallo.mensaje} ${textoMarcaSinResolver(marcaDeEnvio, textoBotonReponer(total, true))}`);
        return;
      }
      // La base miró la marca: o esa transacción se deshizo entera, o dice qué guardó. La marca de envío sobra.
      enviadoEn.current = null;
      setCongelado(false);
      if (fallo.tipo === "token_reusado") {
        if (fallo.guardadas) {
          const salida = resolverTokenReusado(lineas, fallo.guardadas, fallo.mensaje, sede);
          if (salida.tipo === "ya_estaba") {
            avisar.aviso(salida.exito.detalle, { detalle: sede });
            router.refresh();
            onClose();
            return;
          }
          // Quedan solo las que faltaban, con marca nueva.
          token.current = crypto.randomUUID();
          setCantidades(Object.fromEntries(salida.lineas.map((l) => [l.varianteId, l.cantidad])));
          setError(salida.mensaje);
        } else {
          // Sin saber qué se guardó esa lista no se puede reenviar (bajaría dos veces): se vacía y se mira de nuevo.
          token.current = crypto.randomUUID();
          setCantidades({});
          setError(fallo.mensaje);
        }
        router.refresh();
        return;
      }
      if (fallo.tipo === "sin_alcance" && fallo.lineas.length > 0) {
        setProblemas(Object.fromEntries(fallo.lineas.map((l) => [l.varianteId, textoFilaSinAlcance(l.hay, l.motivo)])));
        setError("No se bajó nada: revisa las tallas marcadas.");
      } else {
        setError(fallo.mensaje);
      }
      // Las cifras de la pantalla se releen: lo que otra persona movió ya no engaña a esta.
      router.refresh();
      return;
    }

    // Sin error la transacción se confirmó: si la respuesta no calza con el contrato, se informa con lo que se envió.
    const r: RespuestaBajada = leerRespuestaDeBajada(data) ?? {
      bajada_id: "",
      ya_registrada: false,
      lineas: lineas.length,
      unidades: total,
      registrada_en: new Date().toISOString(),
    };
    if (r.ya_registrada) {
      avisar.aviso(textoDeExito(r, sede).detalle, { detalle: sede });
    } else {
      avisar.exito(avisoDeExito(r, sede).titulo, {
        detalle: `${modelo.referencia} · ${detalleDeLoMovido(colores, lineas)}`,
      });
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo="Reponer prenda"
      subtitulo="Del almacén al piso de venta"
      onClose={onClose}
      bloqueado={loading}
      alCerrarEnfocar={alCerrarEnfocar}
      ancho="max-w-3xl"
    >
      {(cerrar) => (
        // `noValidate`: sin él la burbuja del navegador frena el envío y no salen los textos propios.
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          <div className="flex items-center gap-3">
            <MiniaturaPrenda fotoUrl={modelo.fotoUrl ?? null} colorHex={modelo.colorHex} tamano="lg" {...categoriaDe(modelo)} />
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] text-tinta">
              <span className="font-semibold">{modelo.referencia}</span>
              <span className="text-taupe">{colores.length === 1 ? colores[0].nombre : `${colores.length} colores`}</span>
            </p>
          </div>

          <CampoGuiado id="cantidades" guia={guia} titulo="¿Cuántas bajas de cada color y talla?" retiene="fila">
            {/* Todos los colores del modelo: la celda sin nada en el almacén sale rayada, para que se vea por qué no se baja. */}
            <MatrizMover colores={colores} rumbo="bajar" cantidades={cantidades} problemas={problemas} bloqueado={congelado || loading} onCambiar={cambiar} />
            {total > 0 && (
              <p className="mt-2 text-xs text-taupe">
                {total} {total === 1 ? "prenda" : "prendas"} en {coloresConAlgo(colores, totales)} {coloresConAlgo(colores, totales) === 1 ? "color" : "colores"}.
              </p>
            )}
            {!hayAlgoQueBajar && <p className="mt-2 text-xs text-taupe">Ningún color tiene prendas libres en el almacén para bajar.</p>}
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={loading} />
          </CampoGuiado>

          {error && (
            <p role="alert" className="text-sm text-rojo-profundo">
              {error}
            </p>
          )}

          <PieGuia guia={guia} listo="Todo listo para bajar." />

          {/* `pie-hoja-fijo`: Cancelar y el botón principal no se van bajo el pliegue en un laptop de 768 px de alto (globals.css). */}
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} disabled={loading} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={loading}
              disabled={lineas.length === 0 || !responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              {textoBotonReponer(total, congelado)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
