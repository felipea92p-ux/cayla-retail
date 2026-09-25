"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto, Segmentado } from "@/components/ui/campos";
import { DIAS_SUGERIDOS_APARTADO, MAX_DIAS_APARTADO, hoyLima, sumarDias, validarApartar } from "@/lib/apartados-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import type { Sububicacion } from "@/lib/sububicaciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Apartar una prenda para una clienta (ADR-0141): `retail.apartar_stock`. La prenda sigue físicamente
// en la tienda —el conteo no cambia— pero deja de estar DISPONIBLE: ninguna caja puede cobrarla ni
// nadie moverla. La base es quien manda (rechaza si no hay disponible, si falta el nombre, si la fecha
// es absurda); este formulario adelanta esos mismos candados para avisar al lado del campo, y muestra
// el error recién tras el primer intento de enviar — no regaña mientras se escribe.
export function ApartarModal({
  fila,
  ubicacionId,
  sububicacionPiso,
  sububicacionAlmacen,
  onClose,
}: {
  fila: FilaExistencias;
  ubicacionId: string;
  sububicacionPiso: Sububicacion;
  sububicacionAlmacen: Sububicacion;
  onClose: () => void;
}) {
  const router = useRouter();
  const hoy = hoyLima();
  const pisoDisponible = fila.pisoDisponible ?? 0;
  const almacenDisponible = fila.almacenDisponible ?? 0;

  // Se aparta del piso (lo que se ve y se vende) salvo que ahí no quede nada y sí en el almacén.
  const [donde, setDonde] = useState<"piso" | "almacen">(pisoDisponible <= 0 && almacenDisponible > 0 ? "almacen" : "piso");
  const [cantidad, setCantidad] = useState("1");
  const [clienta, setClienta] = useState("");
  const [contacto, setContacto] = useState("");
  const [fecha, setFecha] = useState(sumarDias(hoy, DIAS_SUGERIDOS_APARTADO));
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(false);
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de apartar la prenda dos veces. Uno por cada vez que se abre la ventana.
  const token = useRef<string>(crypto.randomUUID());
  // Apartar guarda en la tienda (deja la prenda no disponible): pide Responsable (ADR-0161).
  const responsable = useResponsable();

  const disponible = donde === "piso" ? pisoDisponible : almacenDisponible;
  const errores = validarApartar({ cantidad, clienta, contacto, fecha }, disponible, hoy);
  const ver = (campo: keyof typeof errores) => (intento ? errores[campo] : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (Object.keys(errores).length > 0) return;
    if (!responsable.listo) return;

    setEnviando(true);
    const { error } = await firmar(createClient().rpc("apartar_stock", {
      p_variante_id: fila.varianteId,
      p_ubicacion_id: ubicacionId,
      p_cantidad: Number(cantidad),
      p_clienta_nombre: clienta.trim(),
      p_clienta_contacto: contacto.trim(),
      p_vence_el: fecha,
      p_nota: nota.trim() || undefined,
      p_sububicacion_id: (donde === "piso" ? sububicacionPiso : sububicacionAlmacen).id,
      p_token: token.current,
    }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "apartar la prenda"));
      return;
    }
    avisar.exito("Prenda apartada", { detalle: `${fila.referencia} · ${clienta.trim()} · hasta el ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` });
    router.refresh();
    onClose();
  }

  const prenda = [fila.talla, fila.color].filter(Boolean).join(" · ");

  return (
    <Modal titulo="Apartar prenda" subtitulo={`${fila.referencia}${prenda ? ` · ${prenda}` : ""}`} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          <p className="text-xs text-tinta/65">
            Sigue en la tienda, pero nadie podrá venderla ni moverla hasta que la libere quien la aparta o una líder.
          </p>

          <Segmentado
            etiqueta="De dónde se aparta"
            valor={donde}
            onValor={setDonde}
            opciones={[
              { valor: "piso", texto: `Piso de venta · ${pisoDisponible}` },
              { valor: "almacen", texto: `Almacén · ${almacenDisponible}` },
            ]}
          />

          <CampoTexto
            etiqueta="Cantidad"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(disponible, 1)}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            pie={ver("cantidad") ?? `${disponible} ${disponible === 1 ? "disponible" : "disponibles"} en este lugar`}
            tono={ver("cantidad") ? "error" : undefined}
          />
          <CampoTexto
            etiqueta="Clienta"
            value={clienta}
            onChange={(e) => setClienta(e.target.value)}
            maxLength={80}
            placeholder="Nombre de la clienta"
            pie={ver("clienta")}
            tono={ver("clienta") ? "error" : undefined}
          />
          <CampoTexto
            etiqueta="Teléfono o WhatsApp"
            type="tel"
            inputMode="tel"
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            maxLength={40}
            placeholder="Para avisarle cuando esté por vencer"
            pie={ver("contacto")}
            tono={ver("contacto") ? "error" : undefined}
          />
          <CampoTexto
            etiqueta="Se la guardas hasta"
            type="date"
            min={hoy}
            max={sumarDias(hoy, MAX_DIAS_APARTADO)}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            pie={ver("fecha") ?? "Si vence, no se libera sola: te sale en rojo para que decidas"}
            tono={ver("fecha") ? "error" : undefined}
          />
          <CampoTexto
            etiqueta="Nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={200}
            placeholder="Ej. la pasa a recoger por la tarde"
          />

          <ComboResponsable control={responsable} deshabilitado={enviando} />

          <div className="flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={enviando}
              disabled={!responsable.listo}
              title={responsable.motivo ?? undefined}
              className="flex-1"
            >
              Apartar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
