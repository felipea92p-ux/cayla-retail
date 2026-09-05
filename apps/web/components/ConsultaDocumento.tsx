"use client";

import { useEffect, useRef, useState } from "react";
import { largoDocumento, soloDigitos, validarDocumento } from "@cayla-retail/shared";
import type { RespuestaPadron } from "@/lib/padron";
import { Ayuda } from "@/components/Ayuda";

// Campo de identificación de la clienta para un comprobante: se tipea el número
// y el sistema muestra a quién pertenece ANTES de emitir.
//
// Por qué existe como componente aparte y no dentro del modal de facturación:
// el mismo campo va a hacer falta en el punto de venta cuando la clienta pida
// factura al momento de pagar. Un formulario que hace la consulta "por dentro"
// obliga a copiar la lógica la segunda vez — y una copia que se desincroniza es
// exactamente la clase de bug que ya costó dos ADR en este repo.
//
// Regla de diseño (Norman): el sistema NUNCA bloquea la emisión porque una API
// de un tercero no respondió. Si el padrón está caído, el nombre se escribe a
// mano — que es como se factura hoy — y la venta sigue.

type Props = {
  tipo: "dni" | "ruc";
  obligatorio: boolean;
  numero: string;
  onNumero: (v: string) => void;
  nombre: string;
  onNombre: (v: string) => void;
};

// El resultado guarda A QUÉ NÚMERO pertenece. Así, cambiar de boleta a factura o
// corregir un dígito deja el resultado viejo obsoleto por comparación, sin
// tener que "limpiarlo" desde un efecto — no existe el instante en que la
// pantalla muestra el nombre de un documento junto al número de otro.
type Consulta =
  | { clave: string; fase: "cargando" }
  | { clave: string; fase: "listo"; datos: RespuestaPadron }
  | { clave: string; fase: "error"; mensaje: string };

const ETIQUETA = {
  dni: { campo: "DNI de la clienta", nombre: "Nombre de la clienta", padron: "RENIEC" },
  ruc: { campo: "RUC de la empresa", nombre: "Razón social", padron: "SUNAT" },
} as const;

const MOTIVO_LEGIBLE: Record<string, string> = {
  "No hay proveedor de padrón configurado":
    "La consulta automática todavía no está activada.",
  "El token del padrón fue rechazado": "La consulta automática no está funcionando (credenciales).",
  "Se agotó la cuota de consultas del padrón": "Se agotó la cuota de consultas de este mes.",
  "El padrón no respondió a tiempo": "El padrón no respondió.",
};

export function ConsultaDocumento({ tipo, obligatorio, numero, onNumero, nombre, onNombre }: Props) {
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  // Qué se pidió por última vez, para no repetir la misma llamada (cada una se paga).
  const ultima = useRef<string>("");
  // Contador del botón "Verificar": la consulta ya es automática, pero cuando
  // el padrón no responde o la red falla hace falta una forma explícita de
  // reintentar sin tener que borrar y volver a tipear el número.
  const [reintento, setReintento] = useState(0);

  const etiqueta = ETIQUETA[tipo];
  const validacion = validarDocumento(tipo, numero);
  const vacio = soloDigitos(numero).length === 0;
  const clave = `${tipo}:${numero}`;
  // Solo se muestra lo que corresponde a lo que está escrito AHORA.
  const actual = consulta?.clave === clave ? consulta : null;

  // Consulta automática en cuanto el número es válido, con medio segundo de
  // espera: sin eso, tipear un RUC de 11 dígitos dispararía consultas a medio
  // camino, todas cobradas y todas inútiles.
  useEffect(() => {
    if (!validacion.valido || ultima.current === clave) return;

    const control = new AbortController();
    const temporizador = setTimeout(async () => {
      ultima.current = clave;
      setConsulta({ clave, fase: "cargando" });
      try {
        const r = await fetch(`/api/padron?tipo=${tipo}&numero=${numero}`, { signal: control.signal });
        const json = await r.json();
        if (!r.ok) {
          setConsulta({ clave, fase: "error", mensaje: json.error ?? "No se pudo consultar" });
          return;
        }
        const datos = json as RespuestaPadron;
        setConsulta({ clave, fase: "listo", datos });
        // El nombre oficial manda sobre lo escrito a mano: es el que va impreso
        // en el comprobante y el que SUNAT contrasta.
        if (datos.nombre) onNombre(datos.nombre);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setConsulta({ clave, fase: "error", mensaje: "No se pudo consultar" });
        }
      }
    }, 500);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, validacion.valido, reintento]);

  const chip = (valor: string, bueno: boolean) => (
    <span
      className={`label-cayla rounded-full border px-2.5 py-0.5 text-[9px] ${
        bueno ? "border-verde/45 bg-verde/10 text-verde" : "border-rojo/40 bg-rojo/10 text-rojo"
      }`}
    >
      {valor}
    </span>
  );

  const datos = actual?.fase === "listo" ? actual.datos : null;

  return (
    <div className="space-y-3">
      <div>
        <label className="label-cayla block text-[9px] text-tinta/45">
          {etiqueta.campo} {!obligatorio && <span className="normal-case tracking-normal">(opcional)</span>}
          <Ayuda titulo={`Consulta de ${tipo.toUpperCase()}`}>
            Al escribir el número completo, el sistema le pregunta a {etiqueta.padron} de quién es y
            muestra el nombre debajo. Sirve para ver, antes de emitir, que el comprobante va a salir
            a nombre de quien debe. Si la consulta no está disponible, el nombre se escribe a mano y
            la venta sigue igual.
          </Ayuda>
        </label>
        <div className="mt-1 flex gap-2">
          <input
            required={obligatorio}
            inputMode="numeric"
            autoComplete="off"
            maxLength={largoDocumento(tipo)}
            placeholder={tipo === "dni" ? "8 dígitos" : "11 dígitos"}
            value={numero}
            onChange={(e) => onNumero(soloDigitos(e.target.value).slice(0, largoDocumento(tipo)))}
            className="w-full border border-tinta/20 bg-crema px-3 py-2 font-mono text-sm tracking-wider"
          />
          <button
            type="button"
            disabled={!validacion.valido || actual?.fase === "cargando"}
            onClick={() => {
              // Se limpia el candado de "ya consulté esto" para que el mismo
              // número pueda volver a preguntarse.
              ultima.current = "";
              setReintento((n) => n + 1);
            }}
            className="label-cayla shrink-0 border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40"
          >
            {actual?.fase === "cargando" ? "…" : "Verificar"}
          </button>
        </div>
        {/* Una sola línea de estado bajo el campo: nunca dos mensajes peleando. */}
        <div className="mt-1 min-h-[1rem] text-[11px]">
          {!vacio && !validacion.valido && <span className="text-rojo">{validacion.motivo}</span>}
          {actual?.fase === "cargando" && <span className="text-tinta/45">Consultando {etiqueta.padron}…</span>}
          {actual?.fase === "error" && <span className="text-ambar">{actual.mensaje}</span>}
        </div>
      </div>

      {/* Tarjeta de verificación: lo que se ve antes de emitir. */}
      {datos && (
        <div
          className={`rounded-md border px-3 py-2.5 ${
            datos.advertencias.length > 0 ? "border-rojo/35 bg-rojo/5" : "border-tinta/15 bg-crema"
          }`}
        >
          {datos.nombre ? (
            <>
              <p className="font-display text-base leading-tight text-tinta">{datos.nombre}</p>
              {(datos.estado || datos.condicion) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {datos.estado && chip(datos.estado, datos.estado === "ACTIVO")}
                  {datos.condicion && chip(datos.condicion, datos.condicion === "HABIDO")}
                </div>
              )}
              {datos.direccion && <p className="mt-1.5 text-[11px] text-tinta/50">{datos.direccion}</p>}
              <p className="mt-1.5 text-[10px] text-tinta/35">
                {datos.fuente === "padron"
                  ? `Según ${etiqueta.padron}, consultado ahora`
                  : "De un comprobante anterior — no se pudo consultar el padrón ahora"}
              </p>
            </>
          ) : (
            <p className="text-[11px] leading-snug text-tinta/55">
              {MOTIVO_LEGIBLE[datos.motivo ?? ""] ?? datos.motivo ?? "Sin datos del padrón."} Escribe el nombre a
              mano y confírmalo con la clienta antes de emitir.
            </p>
          )}

          {datos.advertencias.map((a) => (
            <p key={a} className="mt-2 border-t border-rojo/20 pt-2 text-[11px] leading-snug text-rojo">
              {a}
            </p>
          ))}
        </div>
      )}

      <div>
        <label className="label-cayla block text-[9px] text-tinta/45">{etiqueta.nombre}</label>
        <input
          required={obligatorio}
          value={nombre}
          onChange={(e) => onNombre(e.target.value)}
          className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
