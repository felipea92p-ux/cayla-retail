"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { EMISOR } from "@/lib/emisor";
import { textoMes } from "@/lib/gastos-reglas";
import { leerZip, esZip } from "@/lib/zip-leer";
import { camposDeLaPropuesta } from "@/lib/sire-guia";
import { decodificarTexto, leerPropuestaSire, lineasParaGuardar, type LecturaSire, type RegistroSire } from "@/lib/sire-propuesta-reglas";

// Subir la propuesta del SIRE (ADR-0601): la persona baja del portal de SUNAT el archivo de la propuesta del mes (un .zip con un .txt, o el
// .txt suelto) y lo elige aquí. Se lee en el navegador (`leerPropuestaSire`): si es de otro mes, de otro RUC o no es una propuesta, se dice
// antes de guardar nada. Guardar agrega una versión; nunca borra la anterior. Guía de foco (ADR-0284): el archivo y quién lo sube.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El texto de la propuesta, venga el .txt suelto o dentro del .zip que entrega SUNAT. */
async function textoDelArchivo(archivo: File): Promise<string | null> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (!esZip(bytes)) return decodificarTexto(bytes);
  const adentro = await leerZip(bytes);
  const txt = adentro?.find((a) => a.nombre.toLowerCase().endsWith(".txt"));
  return txt ? decodificarTexto(txt.contenido) : null;
}

export function SubirPropuestaSireModal({ registro, mes, onClose }: { registro: RegistroSire; mes: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaSire | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic) no sale: subiría la misma propuesta dos veces.
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDeLaPropuesta(lectura, { listo: responsable.listo, motivo: responsable.motivo }));
  const delMes = textoMes(mes);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f.name);
    setLeyendo(true);
    try {
      const texto = await textoDelArchivo(f);
      setLectura(
        texto === null
          ? { ok: false, error: "El .zip no trae un archivo .txt adentro. Baja la propuesta otra vez del portal SIRE, en formato txt." }
          : leerPropuestaSire(texto, { registro, mes, ruc: EMISOR.ruc }),
      );
    } catch {
      setLectura({ ok: false, error: "No se pudo abrir el archivo. Bájalo otra vez del portal SIRE y vuelve a elegirlo." });
    }
    setLeyendo(false);
  }

  async function guardar(cerrar: () => void) {
    if (enviando.current || !guia.puedeConfirmar || !lectura?.ok) return;
    enviando.current = true;
    setTrabajando(true);
    const { error } = await firmar(
      createClient().rpc("guardar_propuesta_sire" as never, { p_registro: registro, p_mes: `${mes}-01`, p_archivo: archivo, p_lineas: lineasParaGuardar(lectura.propuesta.lineas) } as never),
      responsable.firma(),
    );
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    // Volver a subirla deja la misma propuesta como vigente: no hace daño si la primera sí había llegado.
    if (error && esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras subías la propuesta: no sabemos si llegó. Vuelve a pulsar «Comparar»; si ya había llegado, queda la misma.");
    if (error) return void avisar.error(traducirError(error, "subir la propuesta"));
    avisar.exito("Propuesta subida", { detalle: `${plural(lectura.propuesta.lineas.length, "comprobante", "comprobantes")} de ${delMes}` });
    router.refresh();
    cerrar();
  }

  const n = lectura?.ok ? lectura.propuesta.lineas.length : 0;
  return (
    <Modal titulo={`Propuesta de ${registro} de ${delMes}`} subtitulo="La que bajaste del portal SIRE de SUNAT. El ERP la compara con lo registrado; no la acepta ni la cambia en SUNAT." onClose={onClose} variante="hoja" tamano="mediana">
      {(cerrar) => (
        <form
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(cerrar);
          }}
          className="space-y-5"
        >
          <CampoGuiado id="archivo" guia={guia} titulo="Archivo de SUNAT" ayuda="El .zip o el .txt de «Descargar propuesta»">
            <input
              ref={input}
              type="file"
              accept=".txt,.zip,text/plain,application/zip"
              className="sr-only"
              disabled={trabajando}
              onChange={(e) => {
                void elegir(e.target.files?.[0]);
                // Se limpia para que elegir el mismo archivo otra vez vuelva a leerlo.
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Boton type="button" cargando={leyendo} textoCargando="Leyendo…" disabled={trabajando} onClick={() => input.current?.click()}>
                {archivo ? "Elegir otro archivo" : "Elegir el archivo"}
              </Boton>
              {archivo && <span className="min-w-0 truncate text-sm text-taupe">{archivo}</span>}
            </div>
          </CampoGuiado>
          {lectura?.ok && (
            <Aviso tono="exito" chico titulo={n === 0 ? "SUNAT no tiene comprobantes este mes" : `${plural(n, "comprobante", "comprobantes")} de ${delMes}`}>
              {n === 0 ? "Se guarda igual: así queda dicho que se revisó." : "Al subirla, el ERP te dice qué cuadra y qué no."}
            </Aviso>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo="Todo listo para comparar." />
            <div className="pie-acciones pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} textoCargando="Subiendo…" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                Comparar
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
