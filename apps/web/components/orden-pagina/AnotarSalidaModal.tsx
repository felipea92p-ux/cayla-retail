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
import { cantidadesQuePuedenSalir, lineasDeSalida, problemasDeSalida, quienDeFase, RPC_REGISTRAR_SALIDA, textoMandaste, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { camposDeSalida } from "@/lib/orden-pagina-guia";
import { tablaDeModeloExistente } from "@/lib/orden-tabla-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Salida» (ADR-0400, decisión 4; vista D): lo que sale del Taller a un servicio de afuera, por talla y color, con la misma tabla de «Terminé» y de Nueva orden. Nace PRECARGADA con lo
// que ya puede salir (`cantidadesQuePuedenSalir`: lo que entró a la fase menos lo que ya salió): un clic y se manda todo; lo que todavía no sale, se baja a mano. La base no deja mandar
// más de lo que entró (`registrar_salida`, candado por talla y color bajo el candado de la orden) y las prendas no entran ni salen del stock: solo se anota dónde están.
//
// Una salida no se deshace (solo se agrega, como todo lo anotado en una orden): si se mandó de más o de menos, se corrige cuando se anota la Vuelta. El número de guía es solo un texto: el
// Taller no emite comprobantes (ADR-0400, «Lo que NO cambia»). Un doble clic no anota dos salidas: una marca síncrona corta la segunda llamada.

export function AnotarSalidaModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const puedenSalir = useMemo(() => cantidadesQuePuedenSalir(fase), [fase]);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(puedenSalir).map(([id, n]) => [id, String(n)])));
  const [guiaDeRemision, setGuiaDeRemision] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  const servicio = quienDeFase(fase);
  const tabla = useMemo(() => tablaDeModeloExistente(datos.lineas.map((l) => ({ varianteId: l.varianteId, talla: l.talla, color: l.colorNombre, colorHex: l.colorHex }))), [datos.lineas]);
  const lineasPorId = useMemo(() => new Map(datos.lineas.map((l) => [l.varianteId, l] as const)), [datos.lineas]);
  const nombreDe = (id: string) => {
    const l = lineasPorId.get(id);
    return [l?.colorNombre ?? "Sin color", l?.talla ?? "Única"].join(" · ");
  };
  const lineas = lineasDeSalida(fase, cantidades);
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);
  const excesos = problemasDeSalida(fase, cantidades, nombreDe).filter((p) => p.hint === "salida_excede");

  const guia = useGuiaCampos(camposDeSalida({ total, excesos: excesos.map((p) => p.texto), responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace precargada, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ cantidades, guiaDeRemision, nota });
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
    const faltas = problemasDeSalida(fase, cantidades, nombreDe);
    if (faltas.length > 0) {
      avisar.error(faltas[0].texto);
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
      resultado = await firmar(
        createClient().rpc(
          RPC_REGISTRAR_SALIDA as never,
          { p_fase_id: fase.id, p_lineas: lineas, p_guia: guiaDeRemision.trim() === "" ? null : guiaDeRemision.trim(), p_nota: nota.trim() === "" ? null : nota.trim() } as never
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
      // La base pudo guardar y la respuesta perderse: «No se guardó nada» sería mentira. Se dice que no se sabe y se pide mirar la línea de tiempo antes de repetir.
      avisar.error(traducirError(error, `anotar lo que mandas a ${servicio}`, { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(textoMandaste(total, servicio), { detalle: `${datos.orden.numeroTexto} · ${fase.nombre}` });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={`¿Cuántas mandas a ${servicio}?`}
      subtitulo={`${fase.nombre}: dejamos lo que ya puede salir. Cambia lo que todavía no mandas.`}
      variante="hoja"
      conCerrar
      ancho="max-w-3xl"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-salida.cantidades">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas mandas por talla y color")}</span>
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
              preguntaCelda="Cuántas mandas de"
              fantasma={(clave) => String(puedenSalir[clave] ?? 0)}
              tituloDe={(clave) => {
                const l = lineasPorId.get(clave);
                const puede = puedenSalir[clave] ?? 0;
                return [l?.codigo, puede > 0 ? `pueden salir ${puede}` : "no hay nada listo para mandar"].filter(Boolean).join(" · ");
              }}
            />
            <p className="text-xs text-tinta/65">Una raya (—) es una combinación que este modelo no tiene. Una salida no se borra: si te equivocas, se corrige al anotar la vuelta.</p>
          </CampoGuiado>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto id="salida-guia" etiqueta="N.º de guía" pie="Opcional · el número del papel que viaja con las prendas" value={guiaDeRemision} onChange={(e) => setGuiaDeRemision(e.target.value)} maxLength={40} />
          <CampoTexto id="salida-nota" etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </div>

        <div data-guia="prod-orden-salida.cierre" className="space-y-3">
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
              {cargando ? "Anotando…" : total > 0 ? `Mandar ${total}` : "Mandar"}
            </button>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
