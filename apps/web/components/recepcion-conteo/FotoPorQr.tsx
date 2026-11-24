"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { ESPERA_ENTRE_PREGUNTAS_MS, urlDelQr } from "@/lib/foto-por-qr-reglas";
import { crearFotoPorQr, fotosQueLlegaron, recogerFoto, type PermisoDeFoto } from "@/lib/foto-por-qr-acciones";
import type { Firma } from "@/lib/responsable-reglas";

// «Con el celular» (ADR-0699, actividad 2c): la hoja con el QR de UN modelo. Al abrirse pide un permiso nuevo a la base, muestra el QR y
// pregunta cada pocos segundos si llegó una foto; la primera que llega la pone en el modelo (como si se hubiera tomado aquí) y la hoja se
// cierra. El permiso vence a los 10 minutos: entonces se ofrece otro. Si la base no responde, lo dice y no se queda esperando en silencio.

type Estado = { tipo: "pidiendo" } | { tipo: "esperando"; permiso: PermisoDeFoto } | { tipo: "vencido" } | { tipo: "error"; texto: string };

export function FotoPorQr({
  despachoId,
  paradaClave,
  nombre,
  firma,
  onFoto,
  onCerrar,
}: {
  despachoId: string;
  paradaClave: string;
  nombre: string;
  firma: () => Firma | null;
  onFoto: (archivo: File) => void;
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "pidiendo" });
  const [vez, setVez] = useState(0);
  const otroCodigo = () => {
    setEstado({ tipo: "pidiendo" });
    setVez((v) => v + 1);
  };
  const onFotoVivo = useRef(onFoto);
  const onCerrarVivo = useRef(onCerrar);
  useEffect(() => {
    onFotoVivo.current = onFoto;
    onCerrarVivo.current = onCerrar;
  }, [onFoto, onCerrar]);

  // Un permiso por apertura (y otro con «Otro código»).
  useEffect(() => {
    let vivo = true;
    void crearFotoPorQr(despachoId, paradaClave, nombre, firma()).then(({ permiso, error }) => {
      if (!vivo) return;
      setEstado(permiso ? { tipo: "esperando", permiso } : { tipo: "error", texto: error ?? "No se pudo crear el código" });
    });
    return () => {
      vivo = false;
    };
    // `firma` se lee una vez al pedir el permiso: quien firma no cambia mientras el QR está a la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despachoId, paradaClave, nombre, vez]);

  // Mientras el QR está a la vista: ¿llegó algo? La primera que llega entra al modelo y la hoja se cierra.
  const permiso = estado.tipo === "esperando" ? estado.permiso : null;
  useEffect(() => {
    if (!permiso) return;
    let vivo = true;
    let ocupado = false;
    const vence = new Date(permiso.venceEn).getTime();
    const turno = setInterval(async () => {
      if (!vivo || ocupado) return;
      if (Date.now() >= vence) {
        setEstado({ tipo: "vencido" });
        return;
      }
      ocupado = true;
      const llegadas = await fotosQueLlegaron(permiso.id);
      const primera = llegadas[0] ? await recogerFoto(llegadas[0]) : null;
      ocupado = false;
      if (!vivo || !primera) return;
      onFotoVivo.current(primera);
      avisar.exito("Llegó la foto del celular");
      onCerrarVivo.current();
    }, ESPERA_ENTRE_PREGUNTAS_MS);
    return () => {
      vivo = false;
      clearInterval(turno);
    };
  }, [permiso]);

  const url = permiso && typeof window !== "undefined" ? urlDelQr(window.location.origin, permiso.token) : null;

  return (
    <Modal titulo="Foto con el celular" subtitulo={nombre} onClose={onCerrar} conCerrar>
      <div className="grid justify-items-center gap-4 text-center">
        {url ? (
          <div className="papel-fijo rounded-2xl p-4" data-papel>
            <QRCodeSVG value={url} size={208} level="M" marginSize={2} />
          </div>
        ) : estado.tipo === "pidiendo" ? (
          <p className="texto-bajada">Preparando el código…</p>
        ) : null}
        {estado.tipo === "esperando" && (
          <p className="inline-flex items-center gap-2 text-sm text-secundario">
            <Smartphone aria-hidden className="h-4 w-4" />
            Escanéalo y toma la foto. Llega sola.
          </p>
        )}
        {estado.tipo === "vencido" && (
          <Aviso tono="atencion" chico accion={<Boton type="button" peso="fantasma" onClick={otroCodigo}>Otro código</Boton>}>
            Este código venció.
          </Aviso>
        )}
        {estado.tipo === "error" && (
          <Aviso tono="error" chico accion={<Boton type="button" peso="fantasma" onClick={otroCodigo}>Reintentar</Boton>}>
            {estado.texto}
          </Aviso>
        )}
        <p className="texto-detalle">Vale 10 minutos y hasta 3 fotos. Quien lo escanee puede subir fotos.</p>
      </div>
    </Modal>
  );
}
