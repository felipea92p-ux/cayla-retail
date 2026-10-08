"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Flag, Info } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EstadoLinea } from "@/components/conteo/EstadoLinea";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BarraFija } from "@/components/ui/BarraFija";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { notaAjuste, textoQuedanSinVerificar, textoSeActualizaran } from "@/lib/conteo-reglas";
import { existenciaTrasElAjuste, mensajeDeCierre, textoAjusteNegativo, textoQuedarianEnNegativo, type FilaConteoVista } from "@/lib/conteo-revision";
import { paginar } from "@/lib/paginacion";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { camposDeFirma, esPedidoDeNombre, firmaEnPantalla, mandaNombre, preguntaFirma, type FirmaDelPaso } from "@/lib/firma-heredada";
import { claveResponsableConteo } from "@/lib/responsable-conteo";
import { useResponsable } from "@/lib/useResponsable";
import { Volver } from "@/components/ui/Volver";

/* ====================================================================
   Confirmar conteo · el último paso: lo que va a cambiar, y cerrar
   (Inventario ▸ Conteo, rediseño 2026-09-29; plano §6)

   Tercera y última pantalla del conteo. Dice EXACTAMENTE qué variantes van a cambiar de existencia y de cuánto a cuánto
   («Blusa Emma · Beige · M — 11 → 9»), y tiene un solo botón que las cambia: «Cerrar y actualizar existencias».

   Esta pantalla solo se abre con todo resuelto (la página lo verifica y, si no, manda a Revisar): sin pendientes —salvo
   un cierre parcial pedido a propósito—, sin diferencias por confirmar. El candado real es `cerrar_conteo`, que repite
   esas mismas reglas en la base.

   El cierre es TODO O NADA. Cada ajuste se suma a lo que hay HOY (no «fija» el stock en lo contado), y si UN solo ajuste
   dejaría una existencia negativa —o por debajo de lo apartado para clientas— la base rechaza el cierre entero y no se
   mueve nada. Por eso:
     · antes: una variante que ya se sabe que quedaría en negativo lo dice en su propia fila, en ámbar;
     · después: un cierre rechazado dice que NO se movió ninguna existencia y por qué, con la explicación de la base, y
       deja a mano «Volver a revisar». El botón vuelve a quedar usable: la pantalla nunca se queda en «Actualizando…».
     · si se cortó la conexión NO se afirma que no cambió nada (la base pudo guardar y no llegar la respuesta): se ofrece
       «Ver el conteo», que muestra cómo quedó.

   Sin permiso para cerrar (`ajustarInventario`) el botón no desaparece: se apaga y dice quién sí puede.

   Quién cierra (ADR-0328, actividad 15; Felipe: «si ya se colocó un nombre en el manejo de una operación no creo necesario estar
   pidiéndolo varias veces»). En la cuenta de una persona firma ella. En una terminal (`firmaEnPantalla`):
     · si en este aparato ya eligieron a alguien para ESTE conteo (al contar o al revisar: `recordarEn`, como las otras tres
       pantallas del conteo) y sigue de turno, firma esa persona, aunque el conteo sea de otro día: no se pregunta lo que el
       aparato ya sabe;
     · si no, la base pone el nombre de quien abrió el conteo si fue HOY y sigue de turno, y la pantalla solo lo dice;
     · si se abrió otro día, quien lo abrió ya marcó su salida o nadie lo firmó, pregunta UNA vez con el combo, con su guía de foco.
   Cuando la pantalla pone un nombre por su cuenta, deja corregirlo («¿No es Rosa? Elige quién cierra»): el cierre es la aprobación
   del conteo y tiene que quedar a nombre de quien está frente a la terminal. Si la base igual pide el nombre (pasó la medianoche
   mientras se revisaba), el combo aparece entonces: nunca queda un cierre sin persona.

   Conteo de arranque: si al cerrarlo completo será el primero de su tramo (el almacén entero; en el piso, cada categoría, y desde
   el último cuadre del piso), se dice qué significa y de qué categorías; si se cierra a medias, se avisa en
   ámbar que así NO será el de arranque (sus diferencias contarán como pérdida). Lo decide `cerrar_conteo`; aquí solo se dice.
   ==================================================================== */

const POR_PAGINA = 20;

export function ConfirmarConteo({
  conteoId,
  filas,
  correctas,
  yaAjustadas = 0,
  pendientes,
  parcial,
  puedeCerrar,
  firma = { tipo: "propia" },
  notaArranque = null,
}: {
  conteoId: string;
  /** Las variantes que cambian, ya en orden (`diferenciasEnOrden`). */
  filas: FilaConteoVista[];
  /** Las verificadas que coincidieron: no cambian. */
  correctas: number;
  /** Las que el cierre anterior ya ajustó y nadie volvió a contar (conteo reabierto para corregir): tampoco cambian. */
  yaAjustadas?: number;
  /** Las que siguen sin verificar: solo cuentan en un cierre parcial. */
  pendientes: number;
  parcial: boolean;
  puedeCerrar: boolean;
  /** Quién firma el cierre (`firmaDelPaso`): la persona de la sesión, el heredado de hoy o hay que preguntarlo. */
  firma?: FirmaDelPaso;
  /** Lo que se dice del conteo de arranque (`notaDeArranque`), o `null`. */
  notaArranque?: { texto: string; tono: "nota" | "aviso" } | null;
}) {
  const router = useRouter();
  // El mismo recuerdo que Contar, Revisar y Cancelar: quien eligieron en este aparato para este conteo firma también el cierre.
  const responsable = useResponsable(undefined, { recordarEn: claveResponsableConteo(conteoId) });
  const [laBasePidioNombre, setLaBasePidioNombre] = useState(false);
  // La persona pidió elegir (tocó «¿No es…?» o el combo): desde ahí el combo se queda a la vista.
  const [aMano, setAMano] = useState(false);
  const nombreElegido = responsable.listo ? (responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? null) : null;
  const enPantalla = firmaEnPantalla(firma, { recordado: nombreElegido, aMano, laBaseLoPidio: laBasePidioNombre }, "cierre_conteo");
  const preguntar = enPantalla.modo === "elegir";
  const conNombre = mandaNombre(enPantalla);
  // El combo, con lo que toca: elegir a alguien en él lo deja a la vista (no desaparece bajo el dedo al elegir).
  const combo = {
    ...responsable,
    elegir: (personaId: string) => {
      setAMano(true);
      responsable.elegir(personaId);
    },
  };
  const guia = useGuiaCampos(camposDeFirma("cierre_conteo", { preguntar, responsableListo: responsable.listo }), { enModal: false });
  const [cerrando, setCerrando] = useState(false);
  const [fallo, setFallo] = useState<{ texto: string; incierto: boolean } | null>(null);
  const [pagina, setPagina] = useState(1);
  const tarjeta = useRef<HTMLElement>(null);

  const hoja = paginar(filas, pagina, POR_PAGINA);
  const negativas = filas.filter((f) => (existenciaTrasElAjuste(f) ?? 0) < 0).length;
  const urlConteo = `/inventario/conteo/${conteoId}`;
  const urlRevisar = `${urlConteo}/revisar`;

  async function cerrar() {
    if (cerrando || !puedeCerrar) return;
    setCerrando(true);
    setFallo(null);
    try {
      // Cerrar no pregunta el nombre (ADR-0280) salvo que haga falta: la clave `conteo_cerrar` le dice a la base que lo herede de quien
      // abrió el conteo hoy (ADR-0328). Si el aparato ya sabe quién, o se eligió en el combo, firma esa persona.
      const { error } = await firmar(
        createClient().rpc("cerrar_conteo", { p_conteo_id: conteoId, p_parcial: parcial }),
        conNombre ? responsable.firma() : firmaOmitida("conteo_cerrar")
      );
      if (conNombre) responsable.despues(error);
      if (error) {
        if (esPedidoDeNombre(error)) {
          // La base no tenía de quién heredar: se pregunta una vez, aquí mismo, sin perder lo revisado.
          setLaBasePidioNombre(true);
          setFallo({ texto: "Elige quién cierra el conteo y vuelve a cerrarlo. No se movió ninguna existencia.", incierto: false });
        } else {
          setFallo(mensajeDeCierre(error));
        }
        setCerrando(false);
        return;
      }
      // Cerró: se queda en «Actualizando…» hasta que la navegación desmonte esta pantalla (un segundo clic no cierra dos veces).
      router.push(urlConteo);
    } catch (e) {
      console.error("Confirmar conteo:", e);
      setFallo({ texto: "No se pudo cerrar el conteo: no llegó una respuesta. Revisa cómo quedó antes de volver a intentarlo.", incierto: true });
      setCerrando(false);
    }
  }

  const cambian = filas.length === 0 ? "Ninguna variante cambia" : filas.length === 1 ? "1 variante cambia" : `${filas.length} variantes cambian`;
  const sinCambio = correctas + yaAjustadas;
  const noCambian = sinCambio === 1 ? "1 no cambia" : `${sinCambio} no cambian`;
  const resumenPie = [cambian, noCambian, ...(parcial ? [`${pendientes} sin verificar`] : [])].join(" · ");

  // Lo que dice el pie: si el botón está apagado, la razón —no un botón mudo—.
  const razonApagado = !puedeCerrar
    ? "Solo quien ajusta inventario puede cerrar el conteo."
    : preguntar && !responsable.listo
      ? (responsable.motivo ?? "Elige quién cierra el conteo.")
      : null;

  return (
    <>
      <section ref={tarjeta} className="card-cayla @container scroll-mt-24 space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-2xl text-tinta">{filas.length === 0 ? "No hay existencias que cambiar." : textoSeActualizaran(filas.length)}</h2>

        {negativas > 0 && (
          <p role="status" className="flex items-start gap-2 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm text-ambar-profundo">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {textoQuedarianEnNegativo(negativas)}
          </p>
        )}

        {filas.length > 0 && (
          <ul className="divide-y divide-sand overflow-hidden rounded-xl border border-sand">
            {hoja.filas.map((f) => {
              const quedaria = existenciaTrasElAjuste(f);
              const negativa = quedaria !== null && quedaria < 0;
              // Información normal (ni ámbar ni rojo) cuando el stock se movió y todo cabe; ámbar cuando el ajuste no cabe.
              const nota = negativa ? null : notaAjuste(f);
              return (
                <li key={f.varianteId} className="px-3 py-3 @[36rem]:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
                    <div className="flex min-w-0 items-center gap-2.5 @[36rem]:flex-1">
                      <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} tamano="sm" {...categoriaDe(f)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-tinta">{f.referencia}</p>
                        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-taupe">
                          {f.color ? <MuestraColor nombre={f.color} hex={f.colorHex} compacta /> : null}
                          <span className={`min-w-0 truncate ${f.color ? "max-sm:hidden" : ""}`}>{f.color ?? "Sin color"}</span>
                          <span className="whitespace-nowrap">· {f.talla ?? "Única"}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-between gap-3 @[36rem]:w-auto @[36rem]:justify-end @[36rem]:gap-6">
                      <p className="font-display text-xl tabular-nums text-tinta">
                        <span className="sr-only">CAYLA decía </span>
                        {f.debeHaber}
                        <span aria-hidden className="mx-1.5 text-taupe">
                          →
                        </span>
                        <span className="sr-only"> y contaste </span>
                        {f.contada}
                      </p>
                      <EstadoLinea estado={f.estado} debeHaber={f.debeHaber} contada={f.contada} diferencia={f.diferencia} />
                    </div>
                  </div>
                  {negativa && f.actual !== null && quedaria !== null && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg border border-ambar/35 bg-ambar/[0.07] px-3 py-2 text-xs text-ambar-profundo">
                      <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
                      {textoAjusteNegativo({ actual: f.actual, quedaria })}
                    </p>
                  )}
                  {nota && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg bg-hueso px-3 py-2 text-xs text-tinta/80">
                      <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-taupe" />
                      {nota}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hoja.totalPaginas > 1 && (
          <div className="flex justify-center">
            <PaginacionLocal
              pagina={hoja.pagina}
              totalPaginas={hoja.totalPaginas}
              onPagina={(n) => {
                setPagina(n);
                // Paginar cambia el largo de la lista: la vista vuelve al inicio de la tarjeta (ADR-0185).
                tarjeta.current?.scrollIntoView({ block: "start" });
              }}
            />
          </div>
        )}

      </section>

      {parcial && (
        <p role="status" className="rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm text-ambar-profundo">
          {textoQuedanSinVerificar(pendientes)}
        </p>
      )}
      {correctas > 0 && <p className="nota-cayla">{filas.length === 0 && yaAjustadas === 0 ? "Todas las variantes verificadas coinciden y no cambiarán." : "Las demás variantes coinciden y no cambiarán."}</p>}
      {yaAjustadas > 0 && (
        <p className="nota-cayla">
          {yaAjustadas === 1 ? "1 variante ya se ajustó en el cierre anterior y no cambia al cerrar de nuevo." : `${yaAjustadas} variantes ya se ajustaron en el cierre anterior y no cambian al cerrar de nuevo.`}
        </p>
      )}
      {notaArranque &&
        (notaArranque.tono === "aviso" ? (
          <p role="status" className="flex items-start gap-2 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm text-ambar-profundo">
            <Flag aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
            {notaArranque.texto}
          </p>
        ) : (
          <p className="nota-cayla sin-i flex items-start gap-2">
            <Flag aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
            {notaArranque.texto}
          </p>
        ))}
      {/* Quién cierra: a nombre de quién va (lo que sabe el aparato o el heredado de hoy, con «¿No es…?»), o el combo una sola vez.
          La persona de la sesión no ve nada. */}
      {enPantalla.modo === "elegir" ? (
        <section className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Quién cierra el conteo">
          <p className="text-sm text-tinta/80">{enPantalla.texto}</p>
          <CampoGuiado id="firma" guia={guia} titulo={preguntaFirma("cierre_conteo")}>
            <ComboResponsable control={combo} deshabilitado={cerrando} compacto className="w-full sm:w-80" />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Listo para cerrar." />
        </section>
      ) : (enPantalla.modo === "base" || enPantalla.modo === "recordada") && enPantalla.texto ? (
        <p className="nota-cayla flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>{enPantalla.texto}</span>
          {enPantalla.cambiar && (
            <button type="button" onClick={() => setAMano(true)} disabled={cerrando} className="btn-cayla btn-enlace text-xs">
              {enPantalla.cambiar}
            </button>
          )}
        </p>
      ) : null}
      {/* Con un error la barra crece (el aviso suma hasta 4 renglones en un celular): sin este aire, taparía la última nota. */}
      {fallo && <div aria-hidden className="h-24" />}

      <BarraFija
        aviso={
          fallo ? (
            <div role="alert" className="anim-revelar flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-rojo-profundo">
              <span className="min-w-0">{fallo.texto}</span>
              {/* «Volver a revisar» ya está en la barra, al lado del botón: repetirlo aquí eran dos enlaces iguales a un dedo de distancia. */}
              {fallo.incierto && (
                <Link href={urlConteo} className="btn-cayla btn-enlace shrink-0 text-xs">
                  Ver el conteo
                </Link>
              )}
            </div>
          ) : null
        }
        resumen={<p>{razonApagado ?? resumenPie}</p>}
        acciones={
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
            {/* Mientras se cierra el conteo no se sale a revisar (como antes): la flecha queda apagada y no responde. */}
            <Volver href={urlRevisar} a="Volver a revisar" className={`self-center ${cerrando ? "pointer-events-none opacity-50" : ""}`} />
            <button
              type="button"
              disabled={cerrando || razonApagado !== null}
              title={razonApagado ?? undefined}
              onClick={() => void cerrar()}
              className={`btn-cayla btn-primario h-11 w-full sm:w-auto ${preguntar ? guia.claseConfirmar : ""}`}
            >
              {cerrando ? "Actualizando…" : "Cerrar y actualizar existencias"}
            </button>
          </div>
        }
      />
    </>
  );
}
