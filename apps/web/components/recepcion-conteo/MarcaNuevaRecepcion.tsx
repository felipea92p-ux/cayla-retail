"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { avisar } from "@/components/ui/Avisos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { registrarMarcaDeRecepcion } from "@/lib/recepcion-altas-acciones";
import { marcasParecidas } from "@/lib/marcas";
import { camposMarcaRecepcion, mensajeAltaRecepcion, nombreDeMarca, TOPES_MARCA } from "@/lib/recepcion-altas-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import { ProveedorNuevoRecepcion, type ProveedorDeLaLista } from "./ProveedorNuevoRecepcion";

// «Marca nueva» desde Recibir (ADR-0635, Felipe 2026-11-09): llegó una marca que no está en el catálogo y quien recibe la crea ahí mismo, unida a
// quien la trae, sin el módulo Catálogo. El proveedor se elige de la lista o, en un envío sin aviso, se agrega con la hoja corta (razón social y
// RUC). Antes de crear pregunta «¿no será una marca que ya existe?» (el caso «Cayla 2» de Nuevo producto: una marca partida en dos se cuenta a
// medias en cada filtro). Lo que se guarda lo decide `registrar_marca_de_recepcion`: si ya hay una que se escribe igual, devuelve esa y le suma
// el proveedor, sin crear otra.
//
// ASUME: quien la abre la dibuja FUERA de su <form> (ADR-0128). La hoja del proveedor nuevo va fuera del <form> de esta, por lo mismo.

export type MarcaRegistrada = { marca: { id: string; nombre: string }; proveedor: ProveedorDeLaLista };

export function MarcaNuevaRecepcion({
  tipeado,
  marcas,
  vinculos,
  proveedores,
  proveedorInicial,
  puedeAgregarProveedor,
  responsable,
  onProveedorNuevo,
  onRegistrada,
  onCerrar,
}: {
  /** Lo escrito en el combo de la marca. */
  tipeado: string;
  /** Las marcas que ya existen y quién trae cada una: entre ellas se pregunta «¿no será…?». */
  marcas: readonly { id: string; nombre: string }[];
  vinculos: readonly { marcaId: string; proveedorId: string }[];
  /** A quién se le puede atribuir la marca: los del envío (con guía) o todo el directorio (sin aviso). */
  proveedores: readonly ProveedorDeLaLista[];
  /** El proveedor ya elegido en la hoja de atrás, o "" si no hay. */
  proveedorInicial: string;
  /** Sin aviso se puede agregar uno nuevo; en un envío de Compras, el proveedor tiene que ser uno de su guía. */
  puedeAgregarProveedor: boolean;
  responsable: ControlResponsable;
  /** Se agregó un proveedor al directorio: quien abre la hoja lo suma a su lista. */
  onProveedorNuevo: (p: ProveedorDeLaLista) => void;
  onRegistrada: (r: MarcaRegistrada) => void;
  onCerrar: () => void;
}) {
  const idCombo = useId();
  const [nombre, setNombre] = useState(tipeado.trim());
  const [agregados, setAgregados] = useState<ProveedorDeLaLista[]>([]);
  const lista = useMemo(() => [...proveedores, ...agregados.filter((a) => !proveedores.some((p) => p.id === a.id))], [proveedores, agregados]);
  const [proveedorId, setProveedorId] = useState(proveedorInicial);
  const [creandoProveedor, setCreandoProveedor] = useState<string | null>(null);
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  const nombreDe = (id: string) => lista.find((p) => p.id === id)?.nombre;
  const quienLaTrae = (marcaId: string) => {
    const nombres = vinculos.filter((v) => v.marcaId === marcaId).map((v) => nombreDe(v.proveedorId)).filter((n): n is string => Boolean(n));
    return nombres.length > 0 ? `la trae ${nombres.join(", ")}` : "sin proveedor";
  };
  const { igual, parecidas } = marcasParecidas(nombre, marcas);
  const porResponder = parecidas.filter((p) => !descartadas.has(p.marca.id));
  const guia = useGuiaCampos(camposMarcaRecepcion(nombre, proveedorId, { preguntaPendiente: Boolean(igual) || porResponder.length > 0 }));

  /** Guarda con el nombre escrito o con el de una marca que ya existe («Sí, es esa»): a la existente solo se le suma el proveedor. */
  async function guardar(conNombre: string) {
    if (guardando || enVuelo.current) return;
    if (!proveedorId) {
      guia.ir("marca-proveedor");
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    setError(null);
    try {
      const { marca, error: falla } = await registrarMarcaDeRecepcion({ p_nombre: nombreDeMarca(conNombre), p_proveedor_id: proveedorId }, responsable.firma());
      responsable.despues(falla);
      if (falla || !marca) {
        setError(mensajeAltaRecepcion(falla, "la marca"));
        return;
      }
      const proveedor = lista.find((p) => p.id === proveedorId) ?? { id: proveedorId, nombre: "" };
      avisar.exito(marca.nueva ? `Marca «${marca.nombre}» creada` : `«${marca.nombre}» ya existía: la elegí`);
      onRegistrada({ marca: { id: marca.id, nombre: marca.nombre }, proveedor });
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Marca nueva" subtitulo="Se crea unida a quien la trae." tamano="angosta" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <>
          <form
            noValidate
            onKeyDown={enterNoGuarda}
            onSubmit={(e) => {
              e.preventDefault();
              if (guia.puedeConfirmar) void guardar(nombre);
            }}
            className="space-y-4"
          >
            <CampoGuiado id="marca-nombre" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("marca-nombre", "Marca")}
                value={nombre}
                maxLength={TOPES_MARCA.max}
                autoFocus={nombre === ""}
                onChange={(e) => setNombre(e.target.value)}
              />
            </CampoGuiado>
            {igual && (
              <PreguntaParecido
                titulo={`«${igual.nombre}» ya existe`}
                bajada="Con el mismo nombre no se crea otra: se usa esa y queda unida a quien la trae."
                opciones={[{ id: igual.id, nombre: igual.nombre, detalle: quienLaTrae(igual.id) }]}
                si={() => ({ texto: `Usar ${igual.nombre}`, onClick: () => void guardar(igual.nombre) })}
                deshabilitado={guardando || !proveedorId}
              />
            )}
            {!igual && porResponder.length > 0 && (
              <PreguntaParecido
                titulo="¿No será una marca que ya existe?"
                bajada="Si es la misma, elígela: así no queda partida en dos."
                opciones={porResponder.map(({ marca }) => ({ id: marca.id, nombre: marca.nombre, detalle: quienLaTrae(marca.id) }))}
                si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => void guardar(o.nombre) })}
                no={{ texto: `No, «${nombreDeMarca(nombre)}» es otra marca`, onClick: () => setDescartadas((d) => new Set([...d, ...porResponder.map((p) => p.marca.id)])) }}
                deshabilitado={guardando || !proveedorId}
              />
            )}
            <CampoGuiado id="marca-proveedor" guia={guia}>
              <Campo etiqueta={guia.etiqueta("marca-proveedor", "¿Quién te la trae?")} htmlFor={idCombo} sinPie>
                <ComboBuscable
                  id={idCombo}
                  etiquetaAccesible="Quién te trae esta marca"
                  marcador={puedeAgregarProveedor ? "Busca el proveedor o agrégalo" : "Elige el proveedor"}
                  valor={proveedorId}
                  onValor={setProveedorId}
                  opciones={lista.map((p) => ({ valor: p.id, texto: p.nombre }))}
                  crear={puedeAgregarProveedor ? { etiqueta: (q) => (q ? `+ Agregar «${q}» como proveedor nuevo` : "+ Agregar proveedor"), onCrear: (q) => setCreandoProveedor(q) } : undefined}
                />
              </Campo>
            </CampoGuiado>
            {error && <Aviso tono="error" titulo="No se pudo crear la marca">{error}</Aviso>}
            <div className="pie-hoja-fijo space-y-3 pt-2">
              <PieGuia guia={guia} listo="Todo listo." />
              <div className="pie-acciones">
                <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Creando…" confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Crear y elegir
                </Boton>
              </div>
            </div>
          </form>
          {creandoProveedor !== null && (
            <ProveedorNuevoRecepcion
              proveedores={lista}
              tipeado={creandoProveedor}
              responsable={responsable}
              onRegistrado={(p) => {
                setAgregados((a) => (a.some((x) => x.id === p.id) ? a : [...a, p]));
                onProveedorNuevo(p);
                setProveedorId(p.id);
                setCreandoProveedor(null);
              }}
              onCerrar={() => setCreandoProveedor(null)}
            />
          )}
        </>
      )}
    </Modal>
  );
}
