"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { avisar } from "@/components/ui/Avisos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { reducirMuestra } from "@/lib/muestra-atributo";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import {
  BUCKET_FOTOS_BARRIDO,
  LECTURA_MAX,
  NOTA_MAXIMA_HALLAZGO,
  RPC_REGISTRAR_HALLAZGO,
  camposGuiaApartar,
  rutaFotoHallazgo,
  textoDeRechazo,
  type TipoHallazgo,
} from "@/lib/barrido-piso-reglas";

/* ====================================================================
   HojaApartar · lo que no se puede escanear en el barrido del piso (ADR-0690, actividad 4)

   Una prenda colgada SIN etiqueta, o con un código que el catálogo no conoce: no frena el barrido. Se le toma una foto rápida (o se
   escribe cómo es), se dice cuántas son y queda APARTE, con quién y cuándo, para resolverla después en «Por resolver». La prenda
   física va a la caja «Por etiquetar». No suma a ninguna prenda ni se mueve al confirmar el barrido.

   La foto se achica en el celular (`reducirMuestra`, 1.600 px) y se sube al bucket privado `retail-barridos` en la carpeta del
   barrido ANTES de registrar (`registrar_hallazgo_barrido` guarda su ruta). Si la foto no sube pero hay nota, se registra igual sin
   foto y se dice. El id del registro se elige al abrir la hoja: tocar «Apartar» dos veces no lo registra dos veces.
   ==================================================================== */

export function HojaApartar({
  barridoId,
  tipo,
  codigo,
  firma,
  listo,
  onListo,
  onClose,
}: {
  barridoId: string;
  tipo: TipoHallazgo;
  /** El código que leyó el escáner, si el catálogo no lo conoce. */
  codigo: string | null;
  /** La firma de quien está elegido en el barrido (null en una terminal con firma de respaldo). */
  firma: () => Firma | null;
  /** Hay alguien elegido: se puede guardar. */
  listo: boolean;
  /** Se registró: lo que suma ahora lo apartado. */
  onListo: (aparte: number) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [id] = useState(() => crypto.randomUUID());
  const [foto, setFoto] = useState<File | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const guia = useGuiaCampos(camposGuiaApartar({ tipo, conFoto: foto !== null, nota }));

  // La vista previa de la foto tomada; se suelta al cambiarla o al cerrar la hoja.
  const vista = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => () => (vista ? URL.revokeObjectURL(vista) : undefined), [vista]);

  async function apartar() {
    if (!listo) {
      setFallo("Elige quién está escaneando (arriba, en «Quién escanea») antes de apartar.");
      return;
    }
    setGuardando(true);
    setFallo(null);
    let ruta: string | null = null;
    let sinFoto: string | null = null;
    if (foto) {
      const reducida = await reducirMuestra(foto);
      if ("error" in reducida) sinFoto = reducida.error;
      else {
        const destino = rutaFotoHallazgo(barridoId, id);
        const subida = await supabase.storage.from(BUCKET_FOTOS_BARRIDO).upload(destino, reducida.archivo, { contentType: "image/jpeg", upsert: true });
        if (subida.error) sinFoto = "La foto no se pudo subir.";
        else ruta = destino;
      }
    }
    if (!ruta && !nota.trim() && !codigo) {
      setGuardando(false);
      setFallo(`${sinFoto ?? "Falta la foto."} Escribe cómo es la prenda para poder apartarla.`);
      return;
    }
    const { data, error } = await firmar(
      supabase.rpc(
        RPC_REGISTRAR_HALLAZGO as never,
        { p_barrido_id: barridoId, p_id: id, p_tipo: tipo, p_codigo: codigo, p_cantidad: cantidad, p_nota: nota.trim() || null, p_foto_ruta: ruta } as never,
      ),
      firma(),
    );
    setGuardando(false);
    if (error) {
      setFallo(textoDeRechazo(error.hint) ?? `No se pudo apartar: ${error.message}`);
      return;
    }
    const aparte = Number((data as { aparte?: unknown } | null)?.aparte ?? 0);
    onListo(Number.isFinite(aparte) ? aparte : 0);
    if (sinFoto) avisar.aviso("Se apartó sin foto", { detalle: `${sinFoto} Quedó con tu nota para reconocerla.` });
    onClose();
  }

  const titulo = tipo === "sin_etiqueta" ? "Prenda sin etiqueta" : "Código que no existe";
  return (
    <Modal
      titulo={titulo}
      subtitulo={tipo === "sin_etiqueta" ? "Tómale una foto y ponla en la caja «Por etiquetar»." : `«${codigo}» no está en el catálogo. Apártala con una foto.`}
      tamano="angosta"
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onKeyDown={enterNoGuarda}
        onSubmit={(e) => {
          e.preventDefault();
          void apartar();
        }}
      >
        <CampoGuiado id="foto" guia={guia} titulo={tipo === "sin_etiqueta" ? "Foto o nota" : "Foto"}>
          <Campo etiqueta="Foto" etiquetaOculta>
            <div className="flex items-center gap-3">
              {vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- una vista previa local (blob:), no una imagen del sitio
                <img src={vista} alt="La foto que tomaste" className="h-20 w-20 rounded-xl object-cover" />
              ) : null}
              <label className="btn-cayla btn-secundario h-11 cursor-pointer">
                <Camera aria-hidden className="h-4 w-4" />
                {foto ? "Tomar otra" : "Tomar foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (archivo) setFoto(archivo);
                  }}
                />
              </label>
            </div>
          </Campo>
        </CampoGuiado>

        <Campo etiqueta="Cuántas">
          <PasoCantidad
            menos={{ onClick: () => setCantidad((n) => Math.max(1, n - 1)), deshabilitado: cantidad <= 1, etiqueta: "Una menos" }}
            mas={{ onClick: () => setCantidad((n) => Math.min(LECTURA_MAX, n + 1)), deshabilitado: cantidad >= LECTURA_MAX, etiqueta: "Una más" }}
          >
            {cantidad}
          </PasoCantidad>
        </Campo>

        <CampoTexto
          etiqueta="Cómo es (opcional)"
          value={nota}
          maxLength={NOTA_MAXIMA_HALLAZGO}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej. polo gris de rayas" // sugerir-fijo: describe una prenda cualquiera; nada elegido antes en esta hoja la decide
        />

        {fallo && <Aviso tono="error">{fallo}</Aviso>}
        <PieGuia guia={guia} listo="Lista para apartar." />
        <div className="pie-acciones pie-hoja-fijo">
          <Boton peso="fantasma" type="button" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton peso="primario" type="submit" cargando={guardando} textoCargando="Apartando…" confirma={guia}>
            Apartar {cantidad === 1 ? "1" : cantidad.toLocaleString("es-PE")}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
