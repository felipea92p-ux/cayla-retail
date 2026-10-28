"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { soles } from "@/lib/compras-reglas";
import { leerCostoAtipico, type CostoAtipico } from "@/lib/costo-atipico-reglas";
import { traducirError } from "@/lib/error-escritura";
import { camposDeCierre } from "@/lib/orden-pagina-guia";
import {
  RPC_CERRAR_PRODUCCION,
  cantidadesTerminadas,
  fasesSinRegistrar,
  lineasDeCierre,
  problemasDeCierre,
  resumenDeCierre,
  textoPasasteAlStock,
  totalDeCierre,
  type OrdenPagina,
} from "@/lib/orden-pagina-reglas";
import { tablaDeModeloExistente } from "@/lib/orden-tabla-reglas";
import { avisoSinTelaDeclarada, avisoTelaSinAnotar } from "@/lib/orden-tela-sin-anotar-reglas";
import { urlLlevarATiendas } from "@/lib/produccion-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Pasar al stock» (ADR-0400, actividad 6; OK de Felipe, 2026-10-15): cuántas salieron buenas por talla y color —nace precargado con lo terminado en la última fase, que es lo máximo que la base
// deja entrar (`cerrar_produccion`, `cierre_buenas_exceden`)— y quién lo anota. Solo las BUENAS entran al stock: las segundas y las faltantes quedan anotadas en la Vuelta y su costo lo reparten
// las buenas. El costo de los servicios sale de lo devengado, ya no se teclea; quien ve los costos del Taller ve aquí cuánto sale cada prenda. Si la base dice que el costo por prenda sale
// fuera de lo normal (`costo_atipico`), un líder lo confirma en línea, como siempre. Una muestra solo se da por terminada: no toca el stock. Un doble clic no cierra dos veces: una marca
// síncrona corta la segunda llamada (y la base ya rechaza una orden cerrada).
// Si la tela del lote todavía no se anotó (plan > 0 y nada usado), un aviso lo dice antes del botón: el costo por prenda saldría sin tela y alimenta el promedio de la prenda en todas las sedes
// (ADR-0400, «Tela y costo honestos» b; OK de Felipe 2026-10-16). Es un aviso y nunca un candado: «Pasar al stock» sigue disponible, y «Anotarla ahora» deja esta hoja y abre «Anotar lo que usaste».

export function PasarAlStockModal({ datos, onClose, alAnotarTela, alDeclararTela }: { datos: OrdenPagina; onClose: () => void; /** Deja esta hoja y abre «Anotar lo que usaste» con esa tela. Sin esto, el aviso se muestra sin el botón. */ alAnotarTela?: (insumoId: string) => void; /** Deja esta hoja y abre «Declarar tela y avíos». Sin esto (la cuenta no puede editar la tela), el aviso se muestra sin el botón. */ alDeclararTela?: () => void }) {
  const router = useRouter();
  const { orden, fases, lineas: lineasOrden } = datos;
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });
  const terminadas = useMemo(() => cantidadesTerminadas(fases), [fases]);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(terminadas).map(([id, n]) => [id, String(n)])));
  const [cargando, setCargando] = useState(false);
  // Lo que contestó la base cuando el costo por prenda salió atípico; mientras haya algo aquí, la pregunta está abierta.
  const [atipico, setAtipico] = useState<CostoAtipico | null>(null);
  const enVuelo = useRef(false);

  const ultima = [...fases].sort((a, b) => a.secuencia - b.secuencia).at(-1) ?? null;
  const tabla = useMemo(() => tablaDeModeloExistente(lineasOrden.map((l) => ({ varianteId: l.varianteId, talla: l.talla, color: l.colorNombre, colorHex: l.colorHex }))), [lineasOrden]);
  const lineasPorId = useMemo(() => new Map(lineasOrden.map((l) => [l.varianteId, l] as const)), [lineasOrden]);
  const nombreDe = (id: string) => {
    const l = lineasPorId.get(id);
    return [l?.colorNombre ?? "Sin color", l?.talla ?? "Única"].join(" · ");
  };
  const total = totalDeCierre(cantidades);
  const problemas = problemasDeCierre(fases, lineasOrden, cantidades, nombreDe);
  const resumen = resumenDeCierre(datos, total);
  const telaSinAnotar = avisoTelaSinAnotar(datos.insumos, orden.esMuestra);
  const sinTela = avisoSinTelaDeclarada(datos.insumos, orden.esMuestra);
  // Fases que salieron afuera sin registrar quién (ADR-0551 pendiente de registrar): no cobran nada, así que su costo no entra al de las prendas. Es un aviso, nunca un candado (como la tela sin anotar).
  const sinRegistrar = fasesSinRegistrar(fases);
  const guia = useGuiaCampos(camposDeCierre({ total, problemas: problemas.map((p) => p.texto), responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace precargada, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ cantidades });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste cuántas salieron buenas y todavía no se pasó nada al stock. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function confirmar(confirmaCostoAtipico = false) {
    if (enVuelo.current) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0].texto);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      // Los montos van en `null` a propósito: la base toma la tela y los avíos del libro de insumos y los servicios de lo devengado.
      resultado = await firmar(
        createClient().rpc(
          RPC_CERRAR_PRODUCCION as never,
          { p_produccion_id: orden.id, p_buenas: lineasDeCierre(lineasOrden, cantidades), p_costo_tela: null, p_costo_avios: null, p_costo_maquila: null, ...(confirmaCostoAtipico ? { p_confirma_costo_atipico: true } : {}) } as never
        ),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      const pregunta = leerCostoAtipico(error);
      if (pregunta) {
        setAtipico(pregunta);
        return;
      }
      // La base pudo guardar y la respuesta perderse: se dice que no se sabe y se pide mirar la orden antes de repetir.
      avisar.error(traducirError(error, "pasar la orden al stock", { confirmarAntesDeRepetir: true }));
      return;
    }
    setAtipico(null);
    // «Siguiente paso: llevarlas a las tiendas»: el aviso trae el botón directo al traslado con el origen y las líneas ya puestas (solo un lote, no una muestra).
    const llevar = orden.esMuestra ? null : urlLlevarATiendas(orden.ubicacionId, lineasDeCierre(lineasOrden, cantidades).map((l) => ({ varianteId: l.variante_id, cantidadBuenas: l.cantidad })));
    avisar.exito(textoPasasteAlStock(total, orden.producto.referencia, orden.esMuestra), {
      detalle: resumen.costoPorPrenda !== null && !orden.esMuestra ? `Costo real ${soles(resumen.costoPorPrenda)} por prenda` : "Siguiente paso: llevarlas a las tiendas",
      duracion: 9000,
      ...(llevar ? { accion: { texto: "Llevarlas a las tiendas", onClick: () => router.push(llevar) } } : {}),
    });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={orden.esMuestra ? "¿Terminamos la muestra?" : "¿Pasamos las prendas al stock?"}
      subtitulo={`${orden.producto.referencia}: dejamos lo que se terminó en ${ultima?.nombre ?? "la última fase"}. Bájalo si algo no salió bueno.`}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
        className="mt-3.5 space-y-5"
      >
        <div data-guia="prod-orden-stock.cantidades">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas salieron buenas por talla y color")}</span>
            <MatrizCantidades
              soloCantidades
              teclado
              celdas={tabla.celdas}
              tallas={tabla.tallas}
              colores={tabla.colores}
              excluidas={tabla.excluidas}
              cantidades={cantidades}
              // Funcional a propósito: «Llenar todas con» llama a esto una vez por celda en el mismo ciclo, y cada llamada tiene que partir de lo que dejó la anterior.
              onCantidad={(clave, valor) => {
                setCantidades((c) => ({ ...c, [clave]: valor }));
                setAtipico(null);
              }}
              preguntaCelda="Cuántas buenas de"
              fantasma={(clave) => String(terminadas[clave] ?? 0)}
              tituloDe={(clave) => {
                const l = lineasPorId.get(clave);
                const puede = terminadas[clave] ?? 0;
                return [l?.codigo, puede > 0 ? `se terminaron ${puede}` : "no se terminó ninguna"].filter(Boolean).join(" · ");
              }}
            />
            <p className="text-xs text-tinta/65">Una raya (—) es una combinación que este modelo no tiene. Solo las buenas entran al stock.</p>
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-stock.resumen" className="space-y-2 rounded-xl bg-hueso px-4 py-3 text-sm">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-tinta/75">
              {orden.esMuestra ? "La muestra se da por terminada" : `Entran ${total} ${total === 1 ? "prenda" : "prendas"} al stock del Taller`}
              {orden.esMuestra ? "" : " y cada talla queda en Movimientos"}
            </span>
            {resumen.costoPorPrenda !== null && !orden.esMuestra && <span className="font-display text-lg tabular-nums text-tinta">{soles(resumen.costoPorPrenda)} / prenda</span>}
          </p>
          {(resumen.segundas > 0 || resumen.faltantes > 0) && (
            <p className="text-xs text-tinta/70">
              {[resumen.segundas > 0 ? `${resumen.segundas} ${resumen.segundas === 1 ? "segunda" : "segundas"}` : null, resumen.faltantes > 0 ? `${resumen.faltantes} ${resumen.faltantes === 1 ? "faltante" : "faltantes"}` : null]
                .filter(Boolean)
                .join(" y ")}{" "}
              quedan anotadas en la orden y no entran al stock.
              {resumen.costoPorPrenda !== null && !orden.esMuestra ? " El costo del lote se reparte entre las buenas: una segunda o una faltante sube el de las demás." : ""}
            </p>
          )}
          {resumen.costoTotal !== null && !orden.esMuestra && total > 0 && (
            <p className="text-xs text-tinta/65">
              Costo real hasta hoy: {soles(resumen.costoTotal)} (tela, avíos y servicios, tal como están en la orden).
            </p>
          )}
        </div>

        {sinTela && (
          <Aviso
            tono="atencion"
            accion={
              alDeclararTela ? (
                <Boton type="button" peso="fantasma" aria-haspopup="dialog" disabled={cargando} onClick={() => avisoSalida.pedirAccion(alDeclararTela)}>
                  Declarar la tela
                </Boton>
              ) : undefined
            }
          >
            {sinTela.texto}
          </Aviso>
        )}

        {sinRegistrar.length > 0 && (
          <Aviso tono="atencion">
            {sinRegistrar.map((f) => f.nombre).join(", ")} {sinRegistrar.length === 1 ? "salió afuera y todavía no dice quién" : "salieron afuera y todavía no dicen quién"}: su costo no entra al de las prendas. Regístralo en la fase antes de pasar al
            stock; después de pasar ya no se puede.
          </Aviso>
        )}

        {telaSinAnotar && (
          <Aviso
            tono="atencion"
            accion={
              alAnotarTela ? (
                <Boton type="button" peso="fantasma" aria-haspopup="dialog" disabled={cargando} onClick={() => avisoSalida.pedirAccion(() => alAnotarTela(telaSinAnotar.insumoId))}>
                  Anotarla ahora
                </Boton>
              ) : undefined
            }
          >
            {telaSinAnotar.texto}
          </Aviso>
        )}

        <div data-guia="prod-orden-stock.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          {!atipico && <PieGuia guia={guia} listo={orden.esMuestra ? "Todo listo para terminar la muestra." : "Todo listo para pasar al stock."} conFrase />}
          {atipico && (
            <AvisoCostoAtipico
              costos={[atipico]}
              pie="Revisa la tela usada, lo que se le debe a cada servicio y cuántas salieron buenas. Si el costo es correcto, confírmalo: entra al costo de esta prenda en todas las sedes."
              textoCorregir="Revisar la orden"
              textoConfirmar="Sí, es correcto — pasar al stock con este costo"
              textoCargando="Pasando al stock…"
              cargando={cargando}
              listo={responsable.listo}
              motivoNoListo={responsable.motivo}
              onCorregir={() => avisoSalida.pedirAccion(onClose)}
              onConfirmar={() => void confirmar(true)}
            />
          )}
        </div>

        {problemas.length > 0 && problemas[0].hint === "cierre_con_prendas_afuera" && (
          <Aviso tono="atencion" chico>
            {problemas[0].texto}
          </Aviso>
        )}

        {!atipico && (
          <div className="pie-hoja-fijo">
            <div className="pie-acciones border-t border-sand pt-3">
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Pasando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                {orden.esMuestra ? "Terminar muestra" : total > 0 ? `Pasar ${total} al stock` : "Pasar al stock"}
              </Boton>
            </div>
          </div>
        )}
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
