"use client";

// Leer el QR de una factura o boleta electrónica (ADR-0588, actividad 4): un campo donde la pistola escribe el QR (y termina con Enter) o donde se
// pega, y «Con la cámara», que abre el lector de siempre (`EscanerBusqueda`, el mismo que lee la boleta en Cambios). Lo leído llena la hoja; lo que
// hay que mirar (otro monto, otro dueño) se avisa sin frenar. La cámara la abre quien usa esta pieza, EN LUGAR de su hoja (nunca una hoja sobre
// otra): por eso aquí solo se pide. Las reglas, en `lib/qr-comprobante-reglas.ts`.
import { useState } from "react";
import { ScanLine } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { fechaCorta } from "@/lib/compras-reglas";
import { avisosDelQr, leerQrComprobante, resumenDelQr, type QrComprobante } from "@/lib/qr-comprobante-reglas";

export function LeerQrComprobante({
  leido,
  monto,
  rucEmpresa,
  onLeido,
  onCamara,
}: {
  /** Lo último que se leyó (para decirlo y avisar), o `null`. */
  leido: QrComprobante | null;
  /** El monto contra el que se compara (el del gasto), o `null` si todavía no hay. */
  monto: number | null;
  /** El RUC de CAYLA (Configuración ▸ Empresa); sin él no se compara a nombre de quién está. */
  rucEmpresa: string | null;
  onLeido: (qr: QrComprobante) => void;
  onCamara: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [malo, setMalo] = useState(false);

  /** Solo al terminar (Enter de la pistola, pegar, salir del campo): a mitad de la ráfaga el número del comprador aún no está completo. */
  function probar(t: string): void {
    if (!t.trim()) return;
    const qr = leerQrComprobante(t);
    if (!qr) {
      setMalo(true);
      return;
    }
    setTexto("");
    setMalo(false);
    onLeido(qr);
  }

  const avisos = leido ? avisosDelQr(leido, { monto, rucEmpresa }) : [];
  return (
    <div className="mb-3">
      {/* El título va sobre la fila entera (al lado del botón se partía en dos renglones a 375 px); el campo lleva el suyo para el lector. */}
      <span aria-hidden className="campo-etiqueta">
        QR del comprobante · opcional
      </span>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <CampoTexto
            etiqueta="QR del comprobante · opcional"
            caja
            sinPie
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setMalo(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              probar(texto);
            }}
            onPaste={(e) => {
              const pegado = e.clipboardData.getData("text");
              if (pegado.includes("|")) {
                e.preventDefault();
                probar(pegado);
              }
            }}
            onBlur={() => probar(texto)}
            placeholder="Escanéalo o pégalo aquí" /* sugerir-fijo: dice cómo se llena el campo (la pistola o pegar), no depende de nada elegido */
            tono={malo ? "aviso" : undefined}
            autoComplete="off"
          />
        </div>
        <button type="button" className="btn-cayla btn-secundario" onClick={onCamara}>
          <ScanLine aria-hidden className="h-4 w-4" />
          Con la cámara
        </button>
      </div>
      {/* El aviso va bajo la fila (no bajo el campo): así el botón de la cámara no se descuadra. */}
      {malo && <p className="mt-1 text-sm leading-tight text-ambar-profundo">Ese no es el QR de una factura o boleta electrónica.</p>}
      {leido && (
        <div className="mt-2 space-y-2">
          <Aviso tono="exito" chico titulo="Leído del QR">
            {resumenDelQr(leido, (iso) => fechaCorta(iso))}
          </Aviso>
          {avisos.map((a) => (
            <Aviso key={a.titulo} tono={a.tono} chico titulo={a.titulo}>
              {a.texto}
            </Aviso>
          ))}
        </div>
      )}
    </div>
  );
}
