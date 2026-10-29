"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { FilasDeFalla } from "@/components/orden-pagina/FilasDeFalla";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/fechas-lima";
import {
  RPC_ANOTAR_TERMINE,
  RPC_DESHACER_AVANCE,
  RPC_DESHACER_FALLA,
  RPC_ORDEN_PRODUCCION,
  avancesNuevos,
  buenasConFallas,
  cantidadConUnidad,
  cantidadesQueFaltan,
  diaParaLaBase,
  esPrimeraFase,
  fallasNuevas,
  fallasQueCierran,
  faltaTerminar,
  fechaLimaDe,
  leerOrdenPagina,
  lineasDeFallas,
  problemaDeDia,
  problemasDeFallas,
  textoTermine,
  totalFallas,
  type FallaBorrador,
  type FasePagina,
  type OrdenPagina,
} from "@/lib/orden-pagina-reglas";
import { RPC_ANOTAR_INSUMOS, lineasDeUso, problemaDeLoUsado, telasDeLaOrden, textoDeLoUsado, usoDeLaFila, valorDeFabrica } from "@/lib/orden-tela-usada-reglas";
import { camposDeAvance } from "@/lib/orden-pagina-guia";
import { avisoCorteSinTela } from "@/lib/orden-tela-sin-anotar-reglas";
import { lineasDeModeloExistente, tablaDeModeloExistente } from "@/lib/orden-tabla-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Terminé N» (ADR-0400, decisión 7; vista D): la hoja donde se anota cuántas prendas se terminaron en una fase del Taller, por talla y color, con la misma tabla de Nuevo producto y de
// Nueva orden (`MatrizCantidades` en modo cantidades). Nace PRECARGADA con lo que falta (`cantidadesQueFaltan`): un clic y están todas; lo que no se terminó, se baja a mano.
// Solo las buenas avanzan a la fase siguiente, y la base no deja terminar más de lo que entró (`anotar_termine`, candado por talla y color bajo el candado de la orden).
//
// Con falla y con fecha (ADR-0570, actividad 2; Felipe 2026-10-29, ronda 6): «+ Anotar prendas con falla» abre las filas de lo que no salió bien —talla y color, cuántas y qué pasa
// con ellas: se arregla (vuelve a quien la arregla y sigue pendiente aquí), segunda o se perdió— con el porqué a un toque. Segunda y perdida cierran la fase sin pasar a la siguiente:
// antes una sola prenda manchada trababa la orden. Al anotar una falla, las buenas de esa talla y color bajan solas. «¿Cuándo lo terminaste?» viene en hoy; la base guarda aparte
// cuándo se anotó. Todo viaja en UNA llamada (`anotar_termine`): buenas, fallas y día, todo o nada.
//
// Al terminar el corte se pregunta la tela (actividad 7): cuando lo que se anota completa el lote, la hoja ofrece anotar de una vez los metros usados de cada tela (precargados con lo que
// falta según el plan; vacío = «después, desde Tela»). Primero se anota el avance y después la tela: si la tela falla, el corte queda anotado y la hoja lo dice.
//
// Se anota con quien se elige en «Responsable» (ADR-0161/0162). El aviso de éxito trae «Deshacer» (ADR-0400): `anotar_termine` no devuelve los ids de lo que escribió, así que se leen de
// la orden recién traída (`avancesNuevos`, `fallasNuevas`) y se deshacen con la misma firma. Un doble clic no escribe dos veces: una marca síncrona corta la segunda llamada.

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export function AnotarAvanceModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const faltan = useMemo(() => cantidadesQueFaltan(fase, datos.fases), [fase, datos.fases]);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(faltan).map(([id, n]) => [id, String(n)])));
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const [hoy] = useState(() => hoyLima());
  const apertura = fechaLimaDe(datos.orden.creadoEn);
  const [dia, setDia] = useState(hoy);
  const [fallas, setFallas] = useState<FallaBorrador[]>([]);
  const [motivo, setMotivo] = useState("");
  // La tela de la orden (solo telas, no avíos: los avíos viajan con la salida o se anotan desde «Tela»). Se pregunta lo que QUEDÓ en el estante (ADR-0570, actividad 4): viene con lo que
  // quedaría si se usó lo que pide el plan, y lo usado es lo que había menos eso.
  const telas = useMemo(() => telasDeLaOrden(datos.insumos).filter((t) => t.tipo === "tela"), [datos.insumos]);
  const [telaUsada, setTelaUsada] = useState<Record<string, string>>(() => Object.fromEntries(telas.map((t) => [t.insumoId, valorDeFabrica(t)])));
  const enVuelo = useRef(false);

  const tabla = useMemo(() => tablaDeModeloExistente(datos.lineas.map((l) => ({ varianteId: l.varianteId, talla: l.talla, color: l.colorNombre, colorHex: l.colorHex }))), [datos.lineas]);
  const lineasPorId = useMemo(() => new Map(datos.lineas.map((l) => [l.varianteId, l] as const)), [datos.lineas]);
  const lineas = lineasDeModeloExistente(datos.lineas, cantidades);
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);
  const nombreMinuscula = fase.nombre.toLocaleLowerCase("es");

  // Las tallas y colores donde todavía falta algo: de ahí sale una prenda con falla.
  const nombreDe = (id: string) => {
    const l = lineasPorId.get(id);
    return l ? `${l.colorNombre ?? "Sin color"} · ${l.talla ?? "Única"}` : "esa talla y color";
  };
  const opcionesVariante = datos.lineas.filter((l) => (faltan[l.varianteId] ?? 0) > 0).map((l) => ({ valor: l.varianteId, texto: `${nombreDe(l.varianteId)} (faltan ${faltan[l.varianteId]})` }));
  const conFalla = totalFallas(fallas);
  const problemasFallas = problemasDeFallas(faltan, cantidades, fallas, motivo, nombreDe);
  const problemaDia = problemaDeDia(dia, hoy, apertura);

  // ¿Esto completa el corte? Entonces se pregunta la tela. Solo en la primera fase, y solo si hay una tela que anotar y se puede operar. Las segundas y perdidas del corte también cuentan.
  const cuentan = total + fallasQueCierran(fallas);
  const completaElCorte = esPrimeraFase(fase, datos.fases) && cuentan > 0 && cuentan >= faltaTerminar(fase, datos.fases);
  const preguntaLaTela = completaElCorte && telas.some((t) => t.falta > 0 || t.usado === 0);
  // Con el corte completo y ninguna tela declarada no hay nada que preguntar ni descontar: se avisa, no se bloquea (ADR-0510).
  const sinTela = avisoCorteSinTela(datos.insumos, completaElCorte);
  // Vacío en todas = «después, desde Tela» (no se pregunta nada); algo escrito tiene que tener sentido.
  const escribioTela = preguntaLaTela && telas.some((t) => (telaUsada[t.insumoId] ?? "").trim() !== "");
  const problemaDeTela = escribioTela ? problemaDeLoUsado(telas, telaUsada) : null;
  const problemasDeTela = problemaDeTela ? [problemaDeTela] : [];

  const guia = useGuiaCampos(
    camposDeAvance({ total, responsableListo: responsable.listo, conFalla, hayFallas: fallas.length > 0, problemaFallas: problemasFallas[0] ?? null, problemaDia })
  );

  // Una falla nueva baja sola las buenas de su talla y color (nunca las sube): la hoja nace con todo como bueno.
  function cambiarFallas(nuevas: FallaBorrador[]) {
    setFallas(nuevas);
    setCantidades((c) => buenasConFallas(faltan, c, nuevas));
  }

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace precargada, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ cantidades, nota, telaUsada, dia, fallas, motivo });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste lo que ibas a anotar y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (total + conFalla <= 0) {
      avisar.error("Escribe cuántas terminaste en al menos una talla y color.");
      return;
    }
    if (problemasFallas.length > 0) {
      avisar.error(problemasFallas[0]);
      return;
    }
    if (problemaDia) {
      avisar.error(problemaDia);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    if (problemasDeTela.length > 0) {
      avisar.error(problemasDeTela[0]);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    // «Deshacer» firma con la misma persona que anotó: el combo pudo volver a vacío entre tanto.
    const firma = responsable.firma();
    const antes = datos.lineaDeTiempo;
    const lineasFalla = lineasDeFallas(fallas, motivo);
    let resultado;
    try {
      resultado = await firmar(
        createClient().rpc(
          RPC_ANOTAR_TERMINE as never,
          {
            p_fase_id: fase.id,
            p_lineas: lineas,
            p_nota: nota.trim() === "" ? null : nota.trim(),
            p_hecho_en: diaParaLaBase(dia, hoy),
            p_fallas: lineasFalla.length > 0 ? lineasFalla : null,
          } as never
        ),
        firma
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La base pudo guardar y la respuesta perderse: «No se guardó nada» sería mentira. Se dice que no se sabe y se pide revisar la historia antes de repetir.
      avisar.error(traducirError(error, `anotar lo que terminaste en ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
      return;
    }
    // La tela, si se escribió: después del avance, cada una con su RPC. Si una falla, el corte ya quedó anotado y se dice.
    // La tela, si se escribió: después del avance, en UNA llamada para todos los colores (todo o nada). Si falla, el corte ya quedó anotado y se dice.
    let anotada: string | null = null;
    let falloDeTela: string | null = null;
    if (escribioTela) {
      const { error: errorTela } = await firmar(
        createClient().rpc(RPC_ANOTAR_INSUMOS as never, { p_produccion_id: datos.orden.id, p_lineas: lineasDeUso(telas, telaUsada), p_nota: "al terminar el corte" } as never),
        firma
      );
      if (errorTela) falloDeTela = traducirError(errorTela, "anotar la tela", { confirmarAntesDeRepetir: true });
      else anotada = textoDeLoUsado(telas, telaUsada);
    }
    if (falloDeTela) avisar.error(`El corte quedó anotado, pero la tela no: ${falloDeTela} Anótala desde «Tela».`);
    avisar.exito(total > 0 ? textoTermine(total, fase.nombre) : `Anotaste ${conFalla} con falla en ${fase.nombre}`, {
      detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}${total > 0 && conFalla > 0 ? ` · ${conFalla} con falla` : ""}${anotada ? ` · ${anotada.toLocaleLowerCase("es")} (Deshacer no la devuelve)` : ""}`,
      accion: {
        texto: "Deshacer",
        onClick: async () => {
          const cliente = createClient();
          const leida = await (cliente.rpc(RPC_ORDEN_PRODUCCION as never, { p_produccion_id: datos.orden.id } as never) as unknown as Respuesta);
          const fresca = leida.error ? null : leerOrdenPagina(leida.data);
          const ids = fresca ? avancesNuevos(antes, fresca.lineaDeTiempo, fase.clave) : [];
          const idsFalla = fresca ? fallasNuevas(antes, fresca.lineaDeTiempo, fase.clave) : [];
          if (ids.length === 0 && idsFalla.length === 0) {
            avisar.error("No se pudo deshacer desde aquí. Si ya no aparece «Deshacer» en la historia, otra anotación ya lo cambió.");
            router.refresh();
            return;
          }
          let fallo = false;
          const pasos = [...ids.map((id) => ({ rpc: RPC_DESHACER_AVANCE, args: { p_avance_id: id } })), ...idsFalla.map((id) => ({ rpc: RPC_DESHACER_FALLA, args: { p_falla_id: id } }))];
          for (const paso of pasos) {
            const { error: e2 } = await firmar(cliente.rpc(paso.rpc as never, paso.args as never), firma);
            if (e2) {
              avisar.error(traducirError(e2, "deshacer lo que anotaste"));
              fallo = true;
              break;
            }
          }
          if (!fallo) avisar.exito(`Deshiciste lo que anotaste en ${fase.nombre}`, { detalle: datos.orden.numeroTexto });
          router.refresh();
        },
      },
    });
    cerrarTrasGuardar();
  }

  // «Había 45 m · usaste 33 m (el plan pedía 32,45 m)»: lo que dice lo escrito, mientras se escribe.
  const queUsaste = (t: (typeof telas)[number]) => {
    const { usado } = usoDeLaFila(t, telaUsada[t.insumoId] ?? "");
    const base = `Había ${cantidadConUnidad(t.saldo, t.unidad)} en el estante`;
    return usado === null ? `${base} · el plan pide ${cantidadConUnidad(t.falta, t.unidad)}` : `${base} · usaste ${cantidadConUnidad(usado, t.unidad)} (el plan pedía ${cantidadConUnidad(t.falta, t.unidad)})`;
  };

  return (
    <Modal
      titulo={`¿Cuántas terminaste en ${nombreMinuscula}?`}
      subtitulo={fase.hechas > 0 ? `Ya van ${fase.hechas} de ${datos.orden.cantidadPlan}. Dejamos lo que falta: cambia lo que todavía no terminaste.` : "Dejamos lo que falta: cambia lo que todavía no terminaste."}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-terminar.cantidades">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas salieron bien, por talla y color")}</span>
            <MatrizCantidades
              soloCantidades
              teclado
              celdas={tabla.celdas}
              tallas={tabla.tallas}
              colores={tabla.colores}
              excluidas={tabla.excluidas}
              cantidades={cantidades}
              // Funcional a propósito: «Llenar todas con» llama a esto una vez por celda en el mismo ciclo, y cada llamada tiene que partir de lo que dejó la anterior.
              onCantidad={(clave, valor) => setCantidades((c) => ({ ...c, [clave]: valor }))}
              preguntaCelda="Cuántas terminaste de"
              fantasma={(clave) => String(faltan[clave] ?? 0)}
              tituloDe={(clave) => {
                const l = lineasPorId.get(clave);
                const falta = faltan[clave] ?? 0;
                return [l?.codigo, falta > 0 ? `faltan ${falta}` : "ya está completa"].filter(Boolean).join(" · ");
              }}
            />
            <p className="text-xs text-tinta/65">Solo las prendas buenas pasan a la fase que sigue. Una raya (—) es una combinación que este modelo no tiene.</p>
          </CampoGuiado>
        </div>

        {/* Lo que no salió bien (ADR-0570): se abre a pedido; sin filas, la hoja es la de siempre. */}
        <div data-guia="prod-orden-terminar.fallas">
          <FilasDeFalla
            fallas={fallas}
            motivo={motivo}
            opciones={opcionesVariante}
            nombreDe={nombreDe}
            guia={guia}
            problema={problemasFallas[0] ?? null}
            onFallas={cambiarFallas}
            onMotivo={setMotivo}
          />
        </div>

        {preguntaLaTela && (
          <div data-guia="prod-orden-terminar.tela" className="space-y-3 rounded-xl bg-hueso px-4 py-3">
            <p className="text-sm text-tinta">
              <b className="font-semibold">Con esto queda cortado todo el lote.</b> ¿Cuánta tela quedó en el estante? Mide lo que quedó de cada rollo: lo usado sale de ahí.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {telas.map((t) => (
                <CampoTexto
                  key={t.insumoId}
                  id={`avance-tela-${t.insumoId}`}
                  etiqueta={`Quedó de ${t.nombre} (${t.unidad === "metro" ? "metros" : t.unidad})`}
                  inputMode="decimal"
                  pie={queUsaste(t)}
                  value={telaUsada[t.insumoId] ?? ""}
                  onChange={(e) => setTelaUsada((u) => ({ ...u, [t.insumoId]: e.target.value }))}
                  maxLength={12}
                />
              ))}
            </div>
            <p className="text-xs text-tinta/65">{problemasDeTela[0] ?? "Opcional: déjalo vacío si prefieres anotarla después desde «Tela». Si apareció tela que no estaba anotada, anótala allí con «Encontré tela»."}</p>
          </div>
        )}

        {sinTela && <Aviso tono="atencion">{sinTela.texto}</Aviso>}

        <div data-guia="prod-orden-terminar.dia" className="grid gap-4 sm:grid-cols-2">
          <CampoGuiado id="dia" guia={guia}>
            <CampoFecha
              etiqueta={guia.etiqueta("dia", "¿Cuándo lo terminaste?")}
              id="avance-dia"
              valor={dia}
              onValor={setDia}
              tono={problemaDia ? "error" : "neutro"}
              pie={problemaDia ?? (dia === hoy ? "Hoy. Si fue otro día, cámbialo: se guarda aparte cuándo lo anotaste." : "Se guarda aparte cuándo lo anotaste.")}
            />
          </CampoGuiado>
          <CampoTexto id="avance-nota" etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </div>

        <div data-guia="prod-orden-terminar.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para anotar." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={cargando}
              textoCargando="Anotando…"
              disabled={!guia.puedeConfirmar || problemasDeTela.length > 0}
              title={guia.frase ?? problemasDeTela[0] ?? responsable.motivo ?? undefined}
              className={guia.claseConfirmar}
            >
              {conFalla > 0 ? `Anotar ${total + conFalla}` : total > 0 ? `Terminé ${total}` : "Terminé"}
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
