"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MatrizMover } from "@/components/MatrizMover";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { esFalloDeRed, type ErrorEscritura } from "@/lib/error-escritura";
import { formatearHoraLima } from "@/lib/bajada-reglas";
import type { PoliticaOperativaInventario } from "@/lib/politica-operativa-inventario";
import {
  coloresConAlgo,
  coloresParaMover,
  detalleDeLoMovido,
  lineasDeMoverModelo,
  sePuedeSubirTalla,
  textoFilaSinAlcance,
  totalAReponer,
  totalesDeMatriz,
  type Cantidades,
  type PrendaParaReponer,
} from "@/lib/reponer-prenda-reglas";
import {
  argumentosDeRetiro,
  AVISO_QUEDAN_CON_POCO,
  interpretarErrorDeRetiro,
  leerRespuestaDeRetiro,
  MAX_NOTA_RETIRO,
  respuestaResuelveLaMarcaDeRetiro,
  RPC_RETIRO,
  TEXTO_YA_ESTABA_SUBIDA,
  TEXTOS_BLOQUE_SUBIR,
  textoBotonSubir,
  textoDelBloqueSubir,
  textoMarcaSinResolverDeRetiro,
  tituloDeExitoRetiro,
  type RespuestaRetiro,
} from "@/lib/retiro-reglas";

const TOPE_ESPERA_MS = 20_000;

// «Subir prenda» (ADR-0300, ADR-0317): el movimiento contrario a «Reponer prenda». Abre el MODELO entero —una fila por color, una
// columna por talla—, la persona elige cuántas sube de cada celda y al confirmar se hace UNA llamada a `retirar_del_piso` (todo o
// nada, con marca de reintento), nunca una por talla ni por color: con varias llamadas la prenda podría quedar subida a medias. Es la
// misma ventana que `ReponerPrendaModal` (comparten `MatrizMover`); lo que cambia es que sale del PISO, lleva una nota opcional
// —el único rastro de por qué se guardó— y avisa si alguna talla va a quedar pidiendo reponer.
export function SubirAAlmacenModal({
  prendas,
  ubicacionId,
  sede,
  politica,
  alCerrarEnfocar,
  onClose,
}: {
  /** Los colores del modelo, cada uno con todas sus tallas (la prenda que se tocó va primero). */
  prendas: readonly PrendaParaReponer[];
  ubicacionId: string;
  /** El nombre de la sede, para los textos de la base («…al almacén de Tienda TRU»). */
  sede: string;
  /** La política de la sede (`politicaDe`): el aviso de lo que quedará pregunta lo mismo que «Acción hoy» de la fila. */
  politica: PoliticaOperativaInventario;
  /** El control que abrió la ventana (el «Subir a almacén» de la tarjeta): al cerrar, el teclado vuelve ahí. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const colores = coloresParaMover(prendas);
  const modelo = prendas[0];
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que la base contestó fila por fila («Solo queda 1»): se borra apenas la persona cambia esa cifra.
  const [problemas, setProblemas] = useState<Record<string, string>>({});
  // La marca de este intento (ADR-0208): el mismo intento enviado otra vez devuelve lo ya guardado sin subir de nuevo. Una por
  // ventana abierta; un rechazo de la base la deja libre (la transacción se deshizo entera).
  const token = useRef<string>(crypto.randomUUID());
  // Tras una respuesta incierta (corte de red) las cifras y la nota quedan fijas: cambiarlas sería otro intento y subiría de nuevo
  // lo que quizá ya se subió. Solo se puede reenviar LO MISMO o cerrar.
  const [congelado, setCongelado] = useState(false);
  const enviadoEn = useRef<string | null>(null);
  // Candado contra el doble clic en el mismo instante: `loading` apaga el botón recién en el render siguiente.
  const enVuelo = useRef(false);
  // Mover prendas pide Responsable como toda acción que guarda en la tienda (ADR-0161).
  const responsable = useResponsable();

  const lineas = lineasDeMoverModelo(colores, cantidades, "subir");
  const total = totalAReponer(lineas);
  const totales = totalesDeMatriz(colores, cantidades, "subir");
  const hayAlgoQueSubir = colores.some((c) => c.tallas.some(sePuedeSubirTalla));
  const textoBloque = textoDelBloqueSubir(
    colores.flatMap((c) => c.tallas),
    cantidades,
    politica,
  );

  // La guía de foco (ADR-0284) sale de lo que ya bloquea el botón: algo elegido y quién lo hace. La nota es opcional.
  const guia = useGuiaCampos([
    { id: "cantidades", nombre: "Cuántas subir", requerido: true, hecho: total > 0, pendiente: "Elige cuántas prendas subir." },
    { id: "nota", nombre: "Por qué la subes", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién sube las prendas." },
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
      setError("Elige cuántas prendas subir.");
      return;
    }
    enVuelo.current = true;
    setLoading(true);
    setError(null);
    setProblemas({});
    const eraReenvio = enviadoEn.current !== null;
    const marcaDeEnvio = (enviadoEn.current ??= new Date().toISOString());
    // Sin tope, una conexión colgada dejaría la ventana bloqueada para siempre: a los 20 s se corta y se trata como un corte de red
    // (mensaje honesto, se puede cerrar), porque la base pudo haber guardado igual.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const respuesta = await firmar(
        createClient()
          .rpc(RPC_RETIRO as never, argumentosDeRetiro(ubicacionId, lineas, nota, token.current) as never)
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
      const fallo = interpretarErrorDeRetiro(errorRpc, sede);
      if (fallo.tipo === "red") {
        // Sin respuesta no se sabe si se subió: las cifras se congelan y solo se reenvía igual, con la misma marca.
        setCongelado(true);
        setError(fallo.mensaje);
        // Con la red caída no se refresca: un refresh sin red se vuelve navegación completa y borra el mensaje honesto.
        if (!esFalloDeRed(errorRpc)) router.refresh();
        return;
      }
      if (eraReenvio && !respuestaResuelveLaMarcaDeRetiro(errorRpc)) {
        // La base contestó sin mirar la marca (módulo apagado, sesión vencida): lo anterior sigue en duda y las cifras siguen
        // fijas; soltarlas dejaría subir dos veces lo que quizá ya se guardó.
        setCongelado(true);
        setError(`${fallo.mensaje} ${textoMarcaSinResolverDeRetiro(formatearHoraLima(marcaDeEnvio))}`);
        return;
      }
      // La base miró la marca: esa transacción se deshizo entera. La marca de envío sobra.
      enviadoEn.current = null;
      setCongelado(false);
      if (fallo.tipo === "sin_alcance" && fallo.lineas.length > 0) {
        setProblemas(Object.fromEntries(fallo.lineas.map((l) => [l.varianteId, textoFilaSinAlcance(l.hay, l.motivo, "piso")])));
        setError("No se subió nada: revisa las tallas marcadas.");
      } else {
        setError(fallo.mensaje);
      }
      // Las cifras de la pantalla se releen: lo que otra persona movió ya no engaña a esta.
      router.refresh();
      return;
    }

    // Sin error la transacción se confirmó: si la respuesta no calza con el contrato, se informa con lo que se envió.
    const r: RespuestaRetiro = leerRespuestaDeRetiro(data) ?? { ya_registrada: false, lineas: lineas.length, unidades: total };
    if (r.ya_registrada) {
      avisar.aviso(TEXTO_YA_ESTABA_SUBIDA, { detalle: sede });
    } else {
      avisar.exito(tituloDeExitoRetiro(r.unidades), {
        detalle: `${modelo.referencia} · ${detalleDeLoMovido(colores, lineas)}`,
      });
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo="Subir prenda"
      subtitulo="Del piso de venta al almacén"
      onClose={onClose}
      bloqueado={loading}
      alCerrarEnfocar={alCerrarEnfocar}
      ancho="max-w-3xl"
    >
      {(cerrar) => (
        // `noValidate`: sin él la burbuja del navegador frena el envío y no salen los textos propios.
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          <div className="flex items-center gap-3">
            <MiniaturaPrenda fotoUrl={modelo.fotoUrl ?? null} colorHex={modelo.colorHex} tamano="lg" prefijo={modelo.categoriaPrefijo} familia={modelo.categoriaFamilia} categoria={modelo.categoria} />
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] text-tinta">
              <span className="font-semibold">{modelo.referencia}</span>
              <span className="text-taupe">{colores.length === 1 ? colores[0].nombre : `${colores.length} colores`}</span>
            </p>
          </div>

          <CampoGuiado id="cantidades" guia={guia} titulo="¿Cuántas subes de cada color y talla?" retiene="fila">
            {/* Todos los colores del modelo: la celda sin nada en el piso sale rayada, para que se vea por qué no se sube. */}
            <MatrizMover colores={colores} rumbo="subir" cantidades={cantidades} problemas={problemas} bloqueado={congelado || loading} onCambiar={cambiar} />
            {total > 0 && (
              <p className="mt-2 text-xs text-taupe">
                {total} {total === 1 ? "prenda" : "prendas"} en {coloresConAlgo(colores, totales)} {coloresConAlgo(colores, totales) === 1 ? "color" : "colores"}.
              </p>
            )}
            {!hayAlgoQueSubir && <p className="mt-2 text-xs text-taupe">Ningún color tiene prendas libres en el piso para subir.</p>}
          </CampoGuiado>

          {/* Los textos posibles se apilan invisibles en la misma celda: mide lo del más largo y nada salta al elegir (ADR-0185). */}
          <div className="grid text-xs leading-snug" aria-live="polite">
            {TEXTOS_BLOQUE_SUBIR.map((t) => (
              <p key={t} aria-hidden inert className="invisible [grid-area:1/1]">
                {t}
              </p>
            ))}
            <p className={`[grid-area:1/1] ${textoBloque === AVISO_QUEDAN_CON_POCO ? "text-ambar" : "text-tinta/65"}`}>{textoBloque}</p>
          </div>

          <CampoGuiado id="nota" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("nota", "Por qué la subes (opcional)")}
              maxLength={MAX_NOTA_RETIRO}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={loading || congelado}
            />
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={loading} />
          </CampoGuiado>

          {error && (
            <p role="alert" className="text-sm text-rojo-profundo">
              {error}
            </p>
          )}

          <PieGuia guia={guia} listo="Todo listo para subir." />

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
              {textoBotonSubir(total, congelado)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
