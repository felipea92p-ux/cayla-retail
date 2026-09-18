"use client";

import { useEffect, useRef, useState } from "react";
import { largoDocumento, soloDigitos, validarDocumento } from "@cayla-retail/shared";
import type { RespuestaPadron } from "@/lib/padron";
import { Ayuda } from "@/components/Ayuda";
import { Boton, CampoTexto } from "@/components/ui/campos";

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
  /** Cuándo se le pregunta al padrón. `automatico` (por defecto): en cuanto el
      número es válido — es lo que quiere una venta, donde el nombre oficial va
      impreso y se contrasta. `boton`: solo al apretar "Buscar" — es lo que
      quiere el alta de un proveedor, donde cada consulta se paga y quien
      registra puede preferir escribir la razón social a mano (decidido con
      Felipe, 2026-09-14). */
  disparo?: "automatico" | "boton";
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

export function ConsultaDocumento({ tipo, obligatorio, numero, onNumero, nombre, onNombre, disparo = "automatico" }: Props) {
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  // Qué se pidió por última vez, para no repetir la misma llamada (cada una se paga).
  const ultima = useRef<string>("");
  const enVuelo = useRef<AbortController | null>(null);

  const etiqueta = ETIQUETA[tipo];
  const validacion = validarDocumento(tipo, numero);
  const vacio = soloDigitos(numero).length === 0;
  const clave = `${tipo}:${numero}`;
  // Solo se muestra lo que corresponde a lo que está escrito AHORA.
  const actual = consulta?.clave === clave ? consulta : null;

  // La consulta en sí, compartida por los dos modos de disparo.
  async function consultar(control: AbortController) {
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
  }

  // Modo automático: en cuanto el número es válido, con medio segundo de
  // espera: sin eso, tipear un RUC de 11 dígitos dispararía consultas a medio
  // camino, todas cobradas y todas inútiles.
  useEffect(() => {
    if (disparo !== "automatico" || !validacion.valido || ultima.current === clave) return;

    const control = new AbortController();
    const temporizador = setTimeout(() => consultar(control), 500);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, validacion.valido, disparo]);

  // Modo botón: si el formulario se cierra con una consulta en vuelo, se
  // cancela para no escribir sobre un estado que ya no existe.
  useEffect(() => () => enVuelo.current?.abort(), []);

  // Un fallo no se cachea (se puede reintentar); una respuesta ya mostrada
  // para este mismo número, sí (`actual` solo existe si la clave coincide).
  const puedeBuscar = validacion.valido && actual?.fase !== "cargando" && actual?.fase !== "listo";

  function buscar() {
    if (!puedeBuscar) return;
    enVuelo.current?.abort();
    const control = new AbortController();
    enVuelo.current = control;
    void consultar(control).finally(() => {
      if (enVuelo.current === control) enVuelo.current = null;
    });
  }

  const chip = (valor: string, bueno: boolean) => (
    <span
      className={`label-cayla rounded-full border px-2.5 py-0.5 text-[11px] ${
        bueno ? "border-verde/45 bg-verde/10 text-verde-profundo" : "border-rojo/40 bg-rojo/10 text-rojo-profundo"
      }`}
    >
      {valor}
    </span>
  );

  const datos = actual?.fase === "listo" ? actual.datos : null;

  // Una sola línea de estado bajo el campo, por prioridad: nunca dos mensajes
  // peleando (si el número es inválido no se dispara consulta, así que en la
  // práctica solo uno puede estar vivo — el orden lo deja garantizado).
  const estado: { pie: React.ReactNode; tono: "neutro" | "error" | "aviso" } =
    !vacio && !validacion.valido
      ? { pie: validacion.motivo, tono: "error" }
      : actual?.fase === "cargando"
        ? { pie: `Consultando ${etiqueta.padron}…`, tono: "neutro" }
        : actual?.fase === "error"
          ? { pie: actual.mensaje, tono: "aviso" }
          : disparo === "boton" && !actual
            ? { pie: `Con los ${largoDocumento(tipo)} dígitos, «Buscar» trae el nombre desde ${etiqueta.padron}. También puedes escribirlo a mano.`, tono: "neutro" }
            : { pie: null, tono: "neutro" };

  const campoNumero = (
    <CampoTexto
      id="documento-numero"
      etiqueta={
        <>
          {etiqueta.campo} {!obligatorio && <span className="normal-case tracking-normal">(opcional)</span>}
        </>
      }
      ayuda={
        <Ayuda titulo={`Consulta de ${tipo.toUpperCase()}`}>
          {disparo === "boton"
            ? `Con el número completo, «Buscar» le pregunta a ${etiqueta.padron} de quién es y trae el nombre oficial. Si prefieres, o si la consulta no está disponible, el nombre se escribe a mano y se guarda igual.`
            : `Al escribir el número completo, el sistema le pregunta a ${etiqueta.padron} de quién es y muestra el nombre debajo. Sirve para ver, antes de emitir, que el comprobante va a salir a nombre de quien debe. Si la consulta no está disponible, el nombre se escribe a mano y la venta sigue igual.`}
        </Ayuda>
      }
      pie={estado.pie}
      tono={estado.tono}
      mono
      trabajando={actual?.fase === "cargando"}
      required={obligatorio}
      inputMode="numeric"
      autoComplete="off"
      maxLength={largoDocumento(tipo)}
      placeholder={tipo === "dni" ? "8 dígitos" : "11 dígitos"}
      value={numero}
      onChange={(e) => onNumero(soloDigitos(e.target.value).slice(0, largoDocumento(tipo)))}
      onKeyDown={
        disparo === "boton"
          ? (e) => {
              // Enter en el número busca en el padrón; no manda el formulario entero.
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }
          : undefined
      }
    />
  );

  return (
    <div className="space-y-1">
      {disparo === "boton" ? (
        // El botón se alinea con el input, no con el pie: el pie reserva su
        // alto siempre (ver <Campo>), así que se compensa con margen.
        <div className="flex items-end gap-3">
          <div className="flex-1">{campoNumero}</div>
          <Boton
            type="button"
            peso="fantasma"
            className="mb-[1.15rem] h-9 shrink-0 py-0"
            onClick={buscar}
            cargando={actual?.fase === "cargando"}
            disabled={!puedeBuscar}
          >
            {actual?.fase === "cargando" ? "Buscando…" : "Buscar"}
          </Boton>
        </div>
      ) : (
        campoNumero
      )}

      {/* Tarjeta de verificación: lo que se ve antes de emitir. El borde de
          canto en rojo reemplaza al recuadro relleno — mismo lenguaje que el
          hilo vivo de los campos, en vez de una "alerta" de otro sistema.
          Sin relleno (2026-09-14): tenía `bg-papel`, que es más claro que el
          crema del modal de proveedores y se veía como un recuadro blanco; un
          tinte al 3% seguía notándose. El canto solo ya marca el bloque. */}
      {datos && (
        <div
          className={`anim-revelar border-l-2 py-2.5 pl-3 pr-3 ${
            datos.advertencias.length > 0 ? "border-rojo" : "border-sand"
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
              {datos.direccion && <p className="mt-1.5 text-xs leading-snug text-tinta/70">{datos.direccion}</p>}
              <p className="mt-1.5 text-[11px] text-tinta/65">
                {datos.fuente === "padron"
                  ? `Según ${etiqueta.padron}, consultado ahora`
                  : "De un comprobante anterior — no se pudo consultar el padrón ahora"}
              </p>
            </>
          ) : (
            <p className="text-xs leading-snug text-tinta/70">
              {MOTIVO_LEGIBLE[datos.motivo ?? ""] ?? datos.motivo ?? "Sin datos del padrón."} Escribe el nombre a
              mano y confírmalo con la clienta antes de emitir.
            </p>
          )}

          {datos.advertencias.map((a) => (
            <p key={a} className="mt-2 border-t border-rojo/20 pt-2 text-xs leading-snug text-rojo">
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Solo aparece cuando hay algo que escribir. Con el nombre ya confirmado
          arriba, repetirlo en un campo editable invita a corregir justo el dato
          que SUNAT contrasta contra el documento. */}
      {!datos?.nombre && (
        <CampoTexto
          id="documento-nombre"
          etiqueta={etiqueta.nombre}
          required={obligatorio}
          value={nombre}
          onChange={(e) => onNombre(e.target.value)}
        />
      )}
    </div>
  );

}
