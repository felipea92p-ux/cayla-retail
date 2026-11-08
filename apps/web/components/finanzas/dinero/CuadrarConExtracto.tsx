"use client";

// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco: el extracto del banco donde depositan las máquinas (ADR-0629, Fase B). Se sube el .txt
// que exporta la banca, o se pega la tabla copiada de la web, y se ve qué trajo: los QR de Izipay uno por uno, los lotes de tarjeta y los de
// Vendemás. El extracto no se guarda: se lee en el navegador (`lib/extracto-interbank.ts`) y se cierra con la hoja.

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { fechaCorta } from "@/lib/gastos-reglas";
import { leerExtracto, resumenExtracto, solesDeCentimos, type ExtractoLeido } from "@/lib/extracto-interbank";

export function CuadrarConExtracto({ banco }: { banco: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="btn-cayla btn-secundario btn-chico" aria-haspopup="dialog" onClick={() => setAbierto(true)} data-guia="fin-conciliacion.extracto">
        <FileUp className="h-4 w-4" aria-hidden="true" />
        Subir extracto
      </button>
      {abierto && <HojaExtracto banco={banco} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function HojaExtracto({ banco, onCerrar }: { banco: string; onCerrar: () => void }) {
  const [extracto, setExtracto] = useState<ExtractoLeido | null>(null);
  const [pegado, setPegado] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  function leer(texto: string) {
    const e = leerExtracto(texto);
    if (e.lineas.length === 0) {
      setExtracto(null);
      setFallo("No encontré movimientos en lo que trajiste. Sube el .txt que exporta la banca o copia la tabla entera, con sus montos.");
      return;
    }
    setFallo(null);
    setExtracto(e);
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    // El .txt de Interbank viene en Latin-1 (sin tildes hoy, pero un nombre con ñ se leería mal en UTF-8).
    leer(new TextDecoder("windows-1252").decode(await f.arrayBuffer()));
  }

  return (
    <Modal titulo={`El extracto de ${banco}`} subtitulo="Lo que llegó de las máquinas, tal como lo dice el banco. No se guarda." onClose={onCerrar} tamano="mediana" conCerrar>
      {extracto ? (
        <ResumenDelExtracto extracto={extracto} onOtro={() => setExtracto(null)} />
      ) : (
        <div className="space-y-4">
          <input
            ref={archivo}
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Boton type="button" peso="primario" onClick={() => archivo.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Elegir el .txt del banco
          </Boton>
          <div className="campo space-y-2">
            <label htmlFor="extracto-pegado" className="campo-etiqueta">
              O pega la tabla de movimientos copiada de la banca
            </label>
            <textarea
              id="extracto-pegado"
              rows={5}
              value={pegado}
              onChange={(e) => setPegado(e.target.value)}
              placeholder="07/11/2026   09/11/2026   -   .   Abono QR IBK   S/ 45.90   S/ 2,793.69" // sugerir-fijo: así copia la banca una fila de la tabla, no depende de nada elegido
              className="caja-campo-input font-mono text-sm"
            />
            <Boton type="button" peso="fantasma" disabled={pegado.trim() === ""} onClick={() => leer(pegado)}>
              Leer lo pegado
            </Boton>
          </div>
          {fallo && <Aviso tono="error">{fallo}</Aviso>}
        </div>
      )}
    </Modal>
  );
}

function ResumenDelExtracto({ extracto, onOtro }: { extracto: ExtractoLeido; onOtro: () => void }) {
  const resumen = resumenExtracto(extracto.lineas);
  const huecosAdentro = extracto.huecos.filter((h) => !h.enElBorde);
  const huecosBorde = extracto.huecos.filter((h) => h.enElBorde);
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta">
        Del {fechaCorta(extracto.desde)} al {fechaCorta(extracto.hasta)} · {extracto.lineas.length} {extracto.lineas.length === 1 ? "movimiento" : "movimientos"}.{" "}
        <button type="button" className="btn-cayla btn-enlace" onClick={onOtro}>
          Usar otro extracto
        </button>
      </p>
      <div>
        <TituloGrupo>Qué trajo</TituloGrupo>
        <ul className="din-maq-dias mt-2" aria-label="Lo que trajo el extracto">
          {resumen.map((r) => (
            <li key={r.tipo}>
              <span className="text-sm text-tinta">
                {r.titulo} · {r.cuantas}
              </span>
              <b className="din-cuad-num">{solesDeCentimos(r.centimos)}</b>
            </li>
          ))}
        </ul>
      </div>
      {huecosAdentro.length > 0 && (
        <Aviso tono="atencion" titulo="Al extracto le faltan movimientos">
          La cadena de saldos se corta {huecosAdentro.length === 1 ? "una vez" : `${huecosAdentro.length} veces`} en medio del período (la primera, el{" "}
          {fechaCorta(huecosAdentro[0].antesDe.fecha)}). Vuelve a bajarlo completo antes de cuadrar: lo que falta no se puede emparejar.
        </Aviso>
      )}
      {huecosBorde.length > 0 && (
        <p className="nota-cayla text-sm">
          En el primer o el último día faltan movimientos de un día vecino: el banco procesa el fin de semana junto, y el extracto del período no los
          trae. Esos días se cuadran con el extracto siguiente.
        </p>
      )}
      {extracto.ignoradas > 0 && (
        <p className="din-cuad-tenue">
          {extracto.ignoradas === 1 ? "Un renglón no era un movimiento" : `${extracto.ignoradas} renglones no eran movimientos`} (títulos o totales) y no se leyó.
        </p>
      )}
    </div>
  );
}
