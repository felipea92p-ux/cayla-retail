"use client";

import { useRef, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { MAX_MENSAJE_PREDETERMINADO_WEB, MENSAJE_PREDETERMINADO_WEB, mensajePredeterminadoDelPedido } from "@/lib/pedidos-web-reglas";

/** Un pedido de muestra para la vista previa: el mensaje se ve con un nombre, un código y la tienda reales. */
const PEDIDO_DE_MUESTRA = { codigo: "W-0001", cliente: { nombre: "Valeria Chávez" } } as const;
const INICIALES_MUESTRA = PEDIDO_DE_MUESTRA.cliente.nombre
  .split(" ")
  .map((parte) => parte[0])
  .join("")
  .slice(0, 2)
  .toUpperCase();

/**
 * Editar el mensaje predeterminado de WhatsApp de los pedidos web. Es PROPIO de quien lo edita (cada colaborador tiene el suyo):
 * lo guarda `fn_guardar_mensaje_pedidos_web`, y el pedido lo llena con sus marcas al abrir el enlace. Vacío = volver al de fábrica.
 * Nada se envía desde aquí: WhatsApp lo manda quien atiende, como antes.
 */
export function EditarMensajePredeterminadoHoja({
  textoActual,
  tienda,
  onClose,
  onGuardado,
}: {
  /** El texto que tiene hoy la persona (el propio, o el de fábrica si nunca lo editó). */
  textoActual: string;
  tienda: string;
  onClose: () => void;
  /** Lo guardado: la pantalla lo usa al instante, sin recargar. */
  onGuardado: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(textoActual || MENSAJE_PREDETERMINADO_WEB);
  const [guardando, setGuardando] = useState(false);
  const [errorBase, setErrorBase] = useState<{ titulo: string; detalle: string } | null>(null);
  // Un doble clic no guarda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);
  const largo = texto.trim().length;
  const demasiado = largo > MAX_MENSAJE_PREDETERMINADO_WEB;
  // La hora de la burbuja: la de ahora, como en el celular.
  const hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const vista = mensajePredeterminadoDelPedido({ ...PEDIDO_DE_MUESTRA, tiendaWeb: { nombre: tienda } }, texto);

  async function guardar(cerrar: () => void, nuevo: string) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setGuardando(true);
    setErrorBase(null);
    // Un texto vacío vuelve al de fábrica: la base guarda null y devuelve lo que queda en efecto.
    const { data, error } = (await createClient().rpc("fn_guardar_mensaje_pedidos_web" as never, { p_texto: nuevo } as never)) as unknown as {
      data: unknown;
      error: { message?: string; hint?: string | null } | null;
    };
    enVuelo.current = false;
    setGuardando(false);
    if (error) {
      setErrorBase({
        titulo: "No se guardó tu mensaje",
        detalle: error.hint?.startsWith("pedidos_web_mensaje") ? (error.message ?? "") : traducirError({ message: error.message ?? "", hint: error.hint }, "guardar tu mensaje"),
      });
      return;
    }
    const efectivo = typeof data === "string" ? data : MENSAJE_PREDETERMINADO_WEB;
    avisar.exito("Mensaje predeterminado guardado", { detalle: "Tus próximos pedidos web lo usan. Lo ves en cada pedido." });
    onGuardado(efectivo);
    cerrar();
  }

  return (
    <Modal titulo="Mensaje predeterminado" subtitulo={`Tuyo · ${tienda}`} onClose={onClose} tamano="mediana" bloqueado={guardando}>
      {(cerrar) => (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!demasiado) void guardar(cerrar, texto.trim());
          }}
        >
          <p className="text-[13px] text-taupe">
            Es el texto que se abre en WhatsApp con «Enviar mensaje predeterminado» en los pedidos de la tienda web. Escribe{" "}
            <b className="text-tinta">{"{nombre}"}</b>, <b className="text-tinta">{"{tienda}"}</b> y <b className="text-tinta">{"{codigo}"}</b> donde van
            el nombre del cliente, la tienda y el código del pedido: se llenan solos.
          </p>

          <Campo
            etiqueta="Mensaje"
            etiquetaOculta
            tono={demasiado ? "error" : "neutro"}
            pie={demasiado ? `Pasaste ${largo - MAX_MENSAJE_PREDETERMINADO_WEB} letras: el máximo es ${MAX_MENSAJE_PREDETERMINADO_WEB}.` : `${largo} de ${MAX_MENSAJE_PREDETERMINADO_WEB} letras. Vacío = el de fábrica.`}
          >
            <div className="caja-cayla caja-campo caja-campo-texto-largo">
              <textarea
                // El corrector del navegador en español, como en las demás hojas de texto.
                lang="es"
                spellCheck
                className="self-stretch resize-none"
                rows={5}
                value={texto}
                placeholder={MENSAJE_PREDETERMINADO_WEB}
                onChange={(e) => setTexto(e.target.value)}
                aria-label="Mensaje predeterminado"
                disabled={guardando}
              />
            </div>
          </Campo>

          <div>
            <span className="mb-2 block text-[12px] text-taupe">Así lo verá el cliente en WhatsApp</span>
            {/* Una captura del chat del celular: la cabecera verde con el nombre, el fondo de la conversación y la burbuja de salida
                (la de quien atiende) con la hora y las dos marcas de «leído». Solo es una vista: no envía nada. */}
            <div className="overflow-hidden rounded-xl border border-sand">
              <div className="flex items-center gap-3 bg-verde px-4 py-2.5 text-crema">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crema/20 font-display text-[13px]">
                  {INICIALES_MUESTRA}
                </span>
                <span className="truncate text-[14px] font-medium">{PEDIDO_DE_MUESTRA.cliente.nombre}</span>
              </div>
              <div className="bg-hueso/50 px-4 py-4">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-verde/15 px-3 py-2">
                  <p className="whitespace-pre-wrap break-words text-[14px] text-tinta">{vista}</p>
                  <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-taupe">
                    <span className="tabular-nums">{hora}</span>
                    <CheckCheck aria-hidden className="h-3.5 w-3.5 text-verde" />
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pie-hoja-fijo space-y-2 pt-1">
            {errorBase && (
              <Aviso tono="error" titulo={errorBase.titulo}>
                {errorBase.detalle}
              </Aviso>
            )}
            <PieAcciones>
              {/* Solo cambia el texto del panel: no guarda. Para que quede, hay que presionar «Guardar». */}
              <Boton
                type="button"
                disabled={guardando}
                onClick={() => {
                  setTexto(MENSAJE_PREDETERMINADO_WEB);
                  setErrorBase(null);
                }}
              >
                Usar el de fábrica
              </Boton>
              <Boton type="button" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={guardando} disabled={demasiado}>
                Guardar
              </Boton>
            </PieAcciones>
          </div>
        </form>
      )}
    </Modal>
  );
}
