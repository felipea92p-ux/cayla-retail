"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { CampoTexto } from "@/components/ui/campos";
import { Modal, botonCancelar, botonPrimario, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { cantidadesQueFaltan, avancesNuevos, leerOrdenPagina, RPC_DESHACER_AVANCE, RPC_ORDEN_PRODUCCION, RPC_REGISTRAR_AVANCE, textoTermine, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { camposDeAvance } from "@/lib/orden-pagina-guia";
import { lineasDeModeloExistente, tablaDeModeloExistente } from "@/lib/orden-tabla-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Terminé N» (ADR-0400, decisión 7; vista D): la hoja donde se anota cuántas prendas se terminaron en una fase del Taller, por talla y color, con la misma tabla de Nuevo producto y de
// Nueva orden (`MatrizCantidades` en modo cantidades). Nace PRECARGADA con lo que falta (`cantidadesQueFaltan`): un clic y están todas; lo que no se terminó, se baja a mano.
// Solo las buenas avanzan a la fase siguiente, y la base no deja terminar más de lo que entró (`registrar_avance`, candado por talla y color bajo el candado de la orden).
//
// Se anota con quien se elige en «Responsable» (ADR-0161/0162). El aviso de éxito trae «Deshacer» (ADR-0400): `registrar_avance` no devuelve los ids de lo que escribió, así que se leen de
// la orden recién traída (`avancesNuevos`) y se deshacen con la misma firma. Un doble clic no escribe dos veces: una marca síncrona corta la segunda llamada.

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export function AnotarAvanceModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const faltan = useMemo(() => cantidadesQueFaltan(fase, datos.fases), [fase, datos.fases]);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(faltan).map(([id, n]) => [id, String(n)])));
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  const tabla = useMemo(() => tablaDeModeloExistente(datos.lineas.map((l) => ({ varianteId: l.varianteId, talla: l.talla, color: l.colorNombre, colorHex: l.colorHex }))), [datos.lineas]);
  const lineasPorId = useMemo(() => new Map(datos.lineas.map((l) => [l.varianteId, l] as const)), [datos.lineas]);
  const lineas = lineasDeModeloExistente(datos.lineas, cantidades);
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);
  const nombreMinuscula = fase.nombre.toLocaleLowerCase("es");

  const guia = useGuiaCampos(camposDeAvance({ total, responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace precargada, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ cantidades, nota });
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
    if (total <= 0) {
      avisar.error("Escribe cuántas terminaste en al menos una talla y color.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    // «Deshacer» firma con la misma persona que anotó: el combo pudo volver a vacío entre tanto.
    const firma = responsable.firma();
    const antes = datos.lineaDeTiempo;
    let resultado;
    try {
      resultado = await firmar(
        createClient().rpc(RPC_REGISTRAR_AVANCE as never, { p_fase_id: fase.id, p_lineas: lineas, p_nota: nota.trim() === "" ? null : nota.trim() } as never),
        firma
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La base pudo guardar y la respuesta perderse: «No se guardó nada» sería mentira. Se dice que no se sabe y se pide revisar la línea de tiempo antes de repetir.
      avisar.error(traducirError(error, `anotar lo que terminaste en ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(textoTermine(total, fase.nombre), {
      detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}`,
      accion: {
        texto: "Deshacer",
        onClick: async () => {
          const cliente = createClient();
          const leida = await (cliente.rpc(RPC_ORDEN_PRODUCCION as never, { p_produccion_id: datos.orden.id } as never) as unknown as Respuesta);
          const fresca = leida.error ? null : leerOrdenPagina(leida.data);
          const ids = fresca ? avancesNuevos(antes, fresca.lineaDeTiempo, fase.clave) : [];
          if (ids.length === 0) {
            avisar.error("No se pudo deshacer desde aquí. Si ya no aparece «Deshacer» en la línea de tiempo, otra anotación ya lo cambió.");
            router.refresh();
            return;
          }
          let fallo = false;
          for (const id of ids) {
            const { error: e2 } = await firmar(cliente.rpc(RPC_DESHACER_AVANCE as never, { p_avance_id: id } as never), firma);
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

  return (
    <Modal
      titulo={`¿Cuántas terminaste en ${nombreMinuscula}?`}
      subtitulo={fase.hechas > 0 ? `Ya van ${fase.hechas} de ${datos.orden.cantidadPlan}. Dejamos lo que falta: cambia lo que todavía no terminaste.` : "Dejamos lo que falta: cambia lo que todavía no terminaste."}
      variante="hoja"
      conCerrar
      ancho="max-w-3xl"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-terminar.cantidades">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas terminaste por talla y color")}</span>
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

        <CampoTexto id="avance-nota" etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />

        <div data-guia="prod-orden-terminar.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para anotar." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="flex gap-2 border-t border-sand pt-3">
            <button type="button" onClick={() => avisoSalida.pedirAccion(onClose)} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={cargando || !guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={`${botonPrimario} ${guia.claseConfirmar}`}>
              {cargando ? "Anotando…" : total > 0 ? `Terminé ${total}` : "Terminé"}
            </button>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
