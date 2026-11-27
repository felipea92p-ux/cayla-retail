"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Campo, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Modal } from "@/components/ui/Modal";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ingresoListo } from "@/lib/insumos-guia";
import { camposDeLoQueYaTenias } from "@/lib/insumos-hojas";
import { CANTIDAD_ILEGIBLE, UNIDADES_INSUMO, cantidadTexto, leerCantidad } from "@/lib/insumos-reglas";
import { costoPor, nombreDeInsumoParaLeer } from "@/lib/insumos-vista";
import { COSTO_UNITARIO_ILEGIBLE, costoUnitarioIlegible, costoUnitarioTexto, numeroDeCostoUnitario } from "@/lib/monto-plata-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { ConUnidad } from "@/components/insumos-taller/PiezasDeHoja";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

// Saldo inicial (ADR-0133, F3; ADR-0614): lo que ya estaba en el estante antes de usar el sistema, sin proveedor ni deuda. Solo del líder, mete dinero (el costo del lote).
// Lo que se le compró a un proveedor entra por «Llegó una compra» (`LlegoUnaCompraModal`), y lo que aparece en el corte, por «Encontré tela».
//
// «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): en pantalla se llama «Lo que ya tenías» y pregunta con esas palabras («Qué tela o avío»,
// «Cuánto había», «Costó el metro»): antes decía «¿Qué llegó?», y aquí nada llegó. El código de lote, el documento y la nota son opcionales y van plegados. Lo que se guarda no cambia.

export function IngresarInsumoModal({ insumos, insumoInicialId, tallerId, onClose }: { insumos: InsumoVista[]; insumoInicialId: string | null; tallerId: string; onClose: () => void }) {
  const router = useRouter();
  // Abre sin nada elegido (Felipe 2026-11-26): con el primero de la lista ya puesto, quien escribía sin mirar arriba le sumaba saldo y costo a otro insumo.
  const [insumoId, setInsumoId] = useState(insumoInicialId ?? "");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const [documento, setDocumento] = useState("");
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de abrir dos lotes. Uno por cada vez que se abre la ventana.
  const token = useRef<string>(crypto.randomUUID());
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  // Lo opcional (código de lote, documento y nota) va plegado: casi nunca se llena.
  const [verMas, setVerMas] = useState(false);
  // Responsable (ADR-0161/0162): el ingreso firma con quien se elige en el combo (lista del Taller, la sede activa).
  const responsable = useResponsable();

  const insumo = insumos.find((i) => i.id === insumoId);
  // Lo escrito se lee con las reglas únicas (coma o punto decimal). Lo que no se entiende NO es cero: la hoja lo dice y no deja guardar (`ingresoListo`);
  // antes `Number("2,5")` daba NaN, luego 0, y el lote se abría a costo cero.
  const q = leerCantidad(cantidad) ?? 0;
  const costoLeido = numeroDeCostoUnitario(costo);
  const c = Number.isFinite(costoLeido) ? costoLeido : 0;
  const total = q * c;
  const cantidadIlegible = cantidad.trim() !== "" && leerCantidad(cantidad) === null;
  const costoIlegible = costoUnitarioIlegible(costo);
  const unidad = insumo?.unidad ?? "unidad";
  const listo = ingresoListo({ tieneInsumo: !!insumo, cantidad, costo });
  const guia = useGuiaCampos(camposDeLoQueYaTenias({ tieneInsumo: !!insumo, cantidad, costo, responsableListo: responsable.listo }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!insumo || !listo) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const { error } = await firmar(createClient().rpc("recibir_insumo", {
      p_insumo_id: insumo.id,
      p_ubicacion_id: tallerId,
      p_cantidad: q,
      p_costo_total: Math.round(total * 100) / 100,
      p_codigo_lote: codigoLote.trim() || undefined,
      p_documento: documento.trim() || undefined,
      p_origen: "saldo_inicial",
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "ingresar el insumo", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`${cantidadTexto(q, unidad)} de ${nombreDeInsumoParaLeer(insumo)} anotados`, { detalle: `Costaron ${costoUnitarioTexto(c)} ${costoPor(unidad)}.` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Lo que ya tenías" subtitulo="Tela o avío que ya había antes de usar el sistema." variante="hoja" onClose={onClose}>
      <form onSubmit={guardar} className="mt-3.5 space-y-4">
        <CampoGuiado id="insumo" guia={guia}>
          <Campo etiqueta={guia.etiqueta("insumo", "Qué tela o avío")} pie={insumo ? `Hoy figuran ${cantidadTexto(insumo.saldo, insumo.unidad).replace(/\.$/, "")}.` : undefined}>
            <ComboBuscable
              valor={insumoId}
              onValor={(v) => setInsumoId(v)}
              opciones={insumos.map((i) => ({ valor: i.id, texto: nombreDeInsumoParaLeer(i), detalle: `Hay ${cantidadTexto(i.saldo, i.unidad)}` }))}
              marcador="Busca la tela o el avío"
              etiquetaAccesible="Qué tela o avío ya tenías"
            />
          </Campo>
        </CampoGuiado>
        <div className="grid grid-cols-2 gap-3">
          <CampoGuiado id="cantidad" guia={guia}>
            <ConUnidad unidad={UNIDADES_INSUMO[unidad].corta}>
              <CampoTexto
                etiqueta={guia.etiqueta("cantidad", "Cuánto había")}
                inputMode="decimal"
                placeholder="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                tono={cantidadIlegible ? "error" : undefined}
                pie={cantidadIlegible ? CANTIDAD_ILEGIBLE : undefined}
              />
            </ConUnidad>
          </CampoGuiado>
          <CampoGuiado id="costo" guia={guia}>
            <CampoMonto
              etiqueta={guia.etiqueta("costo", `Costó ${costoPor(unidad)}`)}
              pie={costoIlegible ? COSTO_UNITARIO_ILEGIBLE : "Sin IGV."}
              tono={costoIlegible ? "error" : undefined}
              inputMode="decimal"
              placeholder="0.00"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
          </CampoGuiado>
        </div>
        <div>
          <BotonVerMas forma="enlace" abierto={verMas} onCambiar={setVerMas} texto="Código de lote, documento o nota" controla="saldo-inicial-mas" />
          <FilasDeMas abierto={verMas} id="saldo-inicial-mas">
            <div className="space-y-1 px-0.5 pb-0.5 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <CampoTexto etiqueta="Código de lote" mono value={codigoLote} onChange={(e) => setCodigoLote(e.target.value)} maxLength={40} />
                <CampoTexto etiqueta="Documento" mono value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={40} />
              </div>
              <CampoTexto etiqueta="Nota" sinPie value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
            </div>
          </FilasDeMas>
        </div>

        {/* El cierre: quién lo anota y, a su lado, lo que vale lo que se está anotando. */}
        <div className="grid items-end gap-x-6 gap-y-3 border-t border-sand pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <p className="sm:text-right">
            <span className="block text-xs text-tenue">Vale</span>
            <span className="font-display block whitespace-nowrap text-3xl leading-tight tabular-nums text-tinta">{listo ? soles(total) : <span className="text-tenue">—</span>}</span>
          </p>
        </div>
        <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton peso="primario" type="submit" cargando={cargando} confirma={guia} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
