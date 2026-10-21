"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import {
  buenasAlAnotarExcepcion,
  cantidadesAfuera,
  detalleDeVuelta,
  devengadoDeLaRespuesta,
  lineasDeVuelta,
  problemasDeVuelta,
  quedanAfuera,
  quienDeFase,
  RPC_REGISTRAR_VUELTA,
  textoVolvieron,
  type CantidadesDeVuelta,
  type FasePagina,
  type OrdenPagina,
} from "@/lib/orden-pagina-reglas";
import { camposDeVuelta } from "@/lib/orden-pagina-guia";
import { tablaDeModeloExistente } from "@/lib/orden-tabla-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Vuelta» (ADR-0400, decisión 4; vista D): lo que regresa de un servicio de afuera, por talla y color: las que volvieron buenas, las segundas y las que faltaron. Es UNA tabla (la misma de
// «Terminé» y de la Salida) con un segmento para elegir qué se anota, en vez de tres tablas apiladas. Nace PRECARGADA con todo lo que está afuera como si hubiera vuelto bueno
// (`cantidadesAfuera`): si todo volvió bien, un clic; lo que no, se baja de «Volvieron buenas» y se anota en «Segundas» o «Faltaron» (que baja las buenas de esa celda solas:
// `buenasAlAnotarExcepcion`). Lo que no volvió bueno pide decir qué pasó, como la base (`registrar_vuelta`, `vuelta_sin_motivo`).
//
// Solo las buenas pasan a la fase que sigue y solo ellas se le pagan al servicio (buenas × su tarifa; las segundas y las que faltaron no entran, y el descuento al proveedor lo decide el
// líder, no esta hoja). La base no deja anotar más de lo que está afuera por talla y color. Un doble clic no anota dos vueltas: una marca síncrona corta la segunda llamada.

type Que = "buenas" | "segundas" | "faltantes";
type Escritas = { buenas: Record<string, string>; segundas: Record<string, string>; faltantes: Record<string, string> };

export function AnotarVueltaModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const afuera = useMemo(() => cantidadesAfuera(fase), [fase]);
  const [escritas, setEscritas] = useState<Escritas>(() => ({ buenas: Object.fromEntries(Object.entries(afuera).map(([id, n]) => [id, String(n)])), segundas: {}, faltantes: {} }));
  const [que, setQue] = useState<Que>("buenas");
  const [motivo, setMotivo] = useState("");
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
  const cantidades: CantidadesDeVuelta = escritas;
  const lineas = lineasDeVuelta(fase, cantidades, motivo);
  const suma = (k: Que) => lineas.reduce((s, l) => s + l[k], 0);
  const buenasTotal = suma("buenas");
  const segundasTotal = suma("segundas");
  const faltantesTotal = suma("faltantes");
  const total = buenasTotal + segundasTotal + faltantesTotal;
  const hayExcepciones = segundasTotal + faltantesTotal > 0;
  const excesos = problemasDeVuelta(fase, cantidades, motivo, nombreDe).filter((p) => p.hint === "vuelta_excede");
  const quedan = quedanAfuera(fase, cantidades);

  const guia = useGuiaCampos(camposDeVuelta({ excesos: excesos.map((p) => p.texto), total, hayExcepciones, conMotivo: motivo.trim() !== "", responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace precargada, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ escritas, motivo, guiaDeRemision, nota });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste lo que ibas a anotar y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  // Funcional a propósito: «Llenar todas con» llama a esto una vez por celda en el mismo ciclo, y cada llamada tiene que partir de lo que dejó la anterior.
  function alCantidad(clave: string, valor: string) {
    setEscritas((prev) => {
      if (que === "buenas") return { ...prev, buenas: { ...prev.buenas, [clave]: valor } };
      const nuevo = que === "segundas" ? { segundas: valor } : { faltantes: valor };
      const buenas = buenasAlAnotarExcepcion({ afuera: afuera[clave] ?? 0, buenas: prev.buenas[clave] ?? "", segundas: prev.segundas[clave] ?? "", faltantes: prev.faltantes[clave] ?? "" }, nuevo);
      return { buenas: { ...prev.buenas, [clave]: buenas }, segundas: que === "segundas" ? { ...prev.segundas, [clave]: valor } : prev.segundas, faltantes: que === "faltantes" ? { ...prev.faltantes, [clave]: valor } : prev.faltantes };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    const faltas = problemasDeVuelta(fase, cantidades, motivo, nombreDe);
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
          RPC_REGISTRAR_VUELTA as never,
          { p_fase_id: fase.id, p_lineas: lineas, p_guia: guiaDeRemision.trim() === "" ? null : guiaDeRemision.trim(), p_nota: nota.trim() === "" ? null : nota.trim() } as never
        ),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { data, error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La base pudo guardar y la respuesta perderse: «No se guardó nada» sería mentira. Se dice que no se sabe y se pide mirar la línea de tiempo antes de repetir.
      avisar.error(traducirError(error, `anotar lo que volvió de ${servicio}`, { confirmarAntesDeRepetir: true }));
      return;
    }
    // Lo que se le debe al servicio solo lo ve quien ve los costos del Taller (la base ya devuelve `devengado` de cada fase; aquí solo se lee).
    const devengado = datos.permisos.veCostos ? devengadoDeLaRespuesta(data, fase.id) : null;
    avisar.exito(textoVolvieron({ buenas: buenasTotal, segundas: segundasTotal, faltantes: faltantesTotal }, servicio), {
      detalle: detalleDeVuelta({ numeroTexto: datos.orden.numeroTexto, segundas: segundasTotal, faltantes: faltantesTotal, devengado }),
    });
    cerrarTrasGuardar();
  }

  const opciones = [
    { clave: "buenas", etiqueta: "Volvieron buenas", conteo: buenasTotal },
    // La guía interactiva (ADR-0389) ancla UNA sola opción, la de las segundas: ahí explica que lo que no volvió bueno se anota aparte.
    { clave: "segundas", etiqueta: "Segundas", conteo: segundasTotal > 0 ? segundasTotal : undefined, guia: "prod-orden-vuelta.segundas" },
    { clave: "faltantes", etiqueta: "Faltaron", conteo: faltantesTotal > 0 ? faltantesTotal : undefined },
  ];
  const preguntas: Record<Que, string> = { buenas: "Cuántas volvieron buenas de", segundas: "Cuántas segundas de", faltantes: "Cuántas faltaron de" };

  return (
    <Modal
      titulo={`¿Cuántas volvieron de ${servicio}?`}
      subtitulo={`${fase.nombre}: dejamos todo lo que está afuera como si hubiera vuelto bueno. Cambia lo que no.`}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-vuelta.cantidades">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas volvieron por talla y color")}</span>
            <SegmentoDeslizante forma="modo" etiqueta="Qué anotas" valor={que} onCambio={(clave) => setQue(clave as Que)} opciones={opciones} />
            <MatrizCantidades
              key={que}
              soloCantidades
              teclado
              celdas={tabla.celdas}
              tallas={tabla.tallas}
              colores={tabla.colores}
              excluidas={tabla.excluidas}
              cantidades={escritas[que]}
              onCantidad={alCantidad}
              preguntaCelda={preguntas[que]}
              fantasma={(clave) => (que === "buenas" ? String(afuera[clave] ?? 0) : "0")}
              tituloDe={(clave) => {
                const l = lineasPorId.get(clave);
                const hay = afuera[clave] ?? 0;
                return [l?.codigo, hay > 0 ? `hay ${hay} afuera` : "no hay nada afuera"].filter(Boolean).join(" · ");
              }}
            />
            <p className="text-xs text-tinta/65" aria-live="polite">
              {quedan === 0 ? `Con esto no queda nada afuera con ${servicio}.` : `Con esto quedan ${quedan} afuera con ${servicio}.`} ¿Algo no volvió bien? Anótalo en «Segundas» o «Faltaron»: esas prendas dejan de contar como buenas. Una raya (—) es una
              combinación que este modelo no tiene.
            </p>
          </CampoGuiado>
        </div>

        {hayExcepciones && (
          <CampoGuiado id="motivo" guia={guia}>
            <CampoTexto id="vuelta-motivo" etiqueta="Qué pasó con lo que no volvió bueno" pie="Obligatorio: queda anotado junto a la vuelta" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
          </CampoGuiado>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto id="vuelta-guia" etiqueta="N.º de guía" pie="Opcional · el número del papel con que volvieron" value={guiaDeRemision} onChange={(e) => setGuiaDeRemision(e.target.value)} maxLength={40} />
          <CampoTexto id="vuelta-nota" etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </div>

        <div data-guia="prod-orden-vuelta.cierre" className="space-y-3">
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
            <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Anotando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              {total > 0 ? `Anotar vuelta de ${total}` : "Anotar vuelta"}
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
