"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { atipicosPorLinea, leerCostoAtipicoRecepcion, type CatalogoParaRecibir, type CostoAtipicoRecepcion, type DetalleEnvio, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  argsResolverPendiente,
  ponerTallas,
  SEPARADO_VACIO,
  textoPrendas,
  textoResuelto,
  totalSeparado,
  type LineaParaContar,
  type ParaDespues,
  type PrendaSeparada,
  type Separado,
  type VarianteSeparada,
  mensajeAlGuardar,
  marcaDeLinea,
  type MarcaDeLinea,
} from "@/lib/recepcion-conteo-reglas";
import { resolverPendiente } from "@/lib/recepcion-conteo-acciones";
import { HojaTallas } from "./HojaTallas";
import { SepararPrendas } from "./SepararPrendas";

// «Hacer ahora» (ADR-0393, decisión 3): terminar lo que quedó de un envío cerrado. Tres caminos, una sola puerta a la base
// (`resolver_pendiente_envio`): «Separar» lo que nadie dijo qué es (prendas con o sin tallas, nuevas); «Tallas y colores» de un pendiente
// «detalle»; y «Crear» lo nuevo (la hoja de la prenda de siempre y, con la prenda creada, sus tallas). Lo que trae tallas entra al stock en
// el acto, con el costo que se fijó al cerrar; lo demás queda como pendiente nuevo. Nunca más de lo que queda: para eso está reabrir.

type Vista =
  | { tipo: "separar" }
  | { tipo: "tallas"; prenda: PrendaRecepcion; original: PrendaSeparada | null }
  | { tipo: "prenda" }
  | { tipo: "cargando" };

export function HacerAhora({
  detalle,
  item,
  linea,
  catalogo,
  responsable,
  prendas,
  onPrendaVista,
  onListo,
  onCerrar,
}: {
  detalle: DetalleEnvio;
  item: ParaDespues;
  linea: LineaParaContar | null;
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [vista, setVista] = useState<Vista>(() => {
    if (item.tipo === "separar") return { tipo: "separar" };
    if (item.tipo === "crear") return { tipo: "prenda" };
    const ya = item.pendiente.producto ? prendas.get(item.pendiente.producto.id) : undefined;
    return ya ? { tipo: "tallas", prenda: ya, original: null } : { tipo: "cargando" };
  });
  const [separado, setSeparado] = useState<Separado>(SEPARADO_VACIO);
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atipicos, setAtipicos] = useState<{ costos: CostoAtipicoRecepcion[]; separado: Separado } | null>(null);
  const categoria = linea?.categoria ?? null;
  // La de la línea, o «Sin marca» (ADR-0393, 2026-10-14): una línea sin marca también se termina.
  const marca = linea ? marcaDeLinea(linea) : null;
  const pendienteId = item.tipo === "separar" ? null : item.pendiente.id;

  // Un «detalle»: la prenda del pendiente con sus tallas y colores (de lo ya buscado, o se busca por su nombre).
  const cargando = vista.tipo === "cargando";
  useEffect(() => {
    if (!cargando || item.tipo !== "detalle" || !categoria || !marca) return;
    const producto = item.pendiente.producto;
    if (!producto) return;
    let vigente = true;
    void buscarPrendasParaRecibir(categoria.id, marca.id, producto.nombre ?? "").then(({ prendas: halladas }) => {
      if (!vigente) return;
      const hallada = halladas.find((p) => p.productoId === producto.id) ?? null;
      if (hallada) {
        onPrendaVista(hallada);
        setVista({ tipo: "tallas", prenda: hallada, original: null });
      } else setError(`No se pudieron leer las tallas y colores de ${producto.nombre ?? "esa prenda"}. Recarga la pantalla y vuelve a intentar.`);
    });
    return () => {
      vigente = false;
    };
  }, [cargando, item, categoria, marca, onPrendaVista]);

  async function guardar(s: Separado, confirmaCosto = false) {
    if (!linea) return;
    setGuardando(true);
    setError(null);
    const { resuelto, error: e } = await resolverPendiente(
      argsResolverPendiente({ despachoId: detalle.id, linea, pendienteId, separado: s, confirmaCosto, token }),
      responsable.firma(),
    );
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      const atip = leerCostoAtipicoRecepcion(e);
      if (atip && atip.length) {
        setAtipicos({ costos: atip, separado: s });
        return;
      }
      // El mismo token en el reintento: si la respuesta se perdió pero la base guardó, devuelve lo mismo sin meter dos veces. Si la base
      // rechazó, no guardó nada y el token sigue libre.
      setError(mensajeAlGuardar(e, "guardar"));
      return;
    }
    avisar.exito(resuelto ? textoResuelto(resuelto) : "Listo");
    onListo();
  }

  const tallasListas = (prenda: PrendaRecepcion, variantes: VarianteSeparada[]) => {
    if (vista.tipo !== "tallas") return;
    if (item.tipo === "separar") {
      // Separando: las tallas quedan en lo separado y se guarda todo junto al final.
      setSeparado((s) => ponerTallas(s, vista.original?.productoId ?? prenda.productoId, { productoId: prenda.productoId, nombre: prenda.nombre, codigo: prenda.codigo }, variantes));
      setVista({ tipo: "separar" });
      return;
    }
    void guardar({ prendas: [{ productoId: prenda.productoId, nombre: prenda.nombre, codigo: prenda.codigo, cantidad: variantes.reduce((a, v) => a + v.cantidad, 0), variantes }], nuevas: [] });
  };

  if (!linea || !categoria || !marca) {
    return (
      <Modal titulo="No se encontró esa línea" onClose={onCerrar} conCerrar>
        <p className="text-sm text-taupe">Recarga la pantalla: el envío cambió.</p>
      </Modal>
    );
  }

  if (atipicos) {
    return (
      <Modal titulo="Hay un costo fuera de lo normal" onClose={() => setAtipicos(null)} bloqueado={guardando} tamano="mediana">
        <AvisoCostoAtipico
          costos={atipicosPorLinea(atipicos.costos)}
          pie="El costo con el que se cerró esta línea no se parece al de la prenda. Si está bien, confírmalo: el costo de la prenda se promedia con él."
          textoCorregir="Volver"
          textoConfirmar="Está bien, meter al stock"
          textoCargando="Guardando…"
          cargando={guardando}
          listo={responsable.listo}
          motivoNoListo={responsable.motivo}
          onCorregir={() => setAtipicos(null)}
          onConfirmar={() => void guardar(atipicos.separado, true)}
        />
      </Modal>
    );
  }

  if (vista.tipo === "cargando") {
    return (
      <Modal titulo={item.titulo} onClose={onCerrar} conCerrar>
        {error ? <Aviso tono="error">{error}</Aviso> : <p className="text-sm text-taupe">Buscando sus tallas y colores…</p>}
      </Modal>
    );
  }

  if (vista.tipo === "prenda") {
    return (
      <HojaPrenda
        destino={{
          modo: "nueva",
          despachoId: detalle.id,
          despachoItemId: linea.linea?.id ?? null,
          categoriaId: categoria.id,
          marcaId: marca.id,
          marcaNombre: marca.nombre,
          // Sin descripción al contar, el nombre que anotó la compradora en la línea (ADR-0480: «Usar ese nombre»).
          descripcionOrden: (item.tipo === "crear" ? item.pendiente.descripcion : null) ?? linea.linea?.descripcion ?? null,
          precioSugerido: linea.linea?.precioVentaSugerido ?? null,
          costoUnitario: linea.conteo?.costoUnitario ?? linea.linea?.costoUnitario ?? null,
          prenda: null,
          proveedorId: null,
        }}
        categoria={catalogo?.categorias.find((c) => c.id === categoria.id) ?? null}
        colores={catalogo?.colores ?? []}
        responsable={responsable}
        onListo={(prenda) => {
          onPrendaVista(prenda);
          setVista({ tipo: "tallas", prenda, original: null });
        }}
        onUsarExistente={async (productoId, nombre) => {
          const { prendas: halladas } = await buscarPrendasParaRecibir(categoria.id, marca.id, nombre);
          const hallada = halladas.find((p) => p.productoId === productoId);
          if (!hallada) return false;
          onPrendaVista(hallada);
          setVista({ tipo: "tallas", prenda: hallada, original: null });
          return true;
        }}
        onCerrar={item.tipo === "separar" ? () => setVista({ tipo: "separar" }) : onCerrar}
      />
    );
  }

  if (vista.tipo === "tallas") {
    return (
      <HojaTallas
        key={vista.prenda.productoId}
        prenda={vista.prenda}
        categoria={categoria}
        marca={marca}
        colores={catalogo?.colores ?? []}
        variantes={vista.original?.variantes ?? null}
        sugeridas={item.tipo === "separar" ? (vista.original?.cantidad ?? null) : item.cantidad}
        maximo={item.tipo === "separar" ? null : item.cantidad}
        textoListo={item.tipo === "separar" ? "Listo" : "Meter al stock"}
        guardando={guardando}
        error={error}
        onListo={tallasListas}
        onAbrirHoja={() => setVista({ tipo: "prenda" })}
        onCerrar={item.tipo === "separar" ? () => setVista({ tipo: "separar" }) : onCerrar}
      />
    );
  }

  return (
    <SepararAhora
      item={item}
      categoria={categoria}
      marca={marca}
      separado={separado}
      guardando={guardando}
      error={error}
      onPrendaVista={onPrendaVista}
      onSeparado={setSeparado}
      onTallas={async (p) => {
        const ya = prendas.get(p.productoId);
        const completa = ya ?? (await buscarPrendasParaRecibir(categoria.id, marca.id, p.nombre ?? "")).prendas.find((x) => x.productoId === p.productoId) ?? null;
        if (!completa) {
          setError(`No se pudieron leer las tallas y colores de ${p.nombre ?? "esa prenda"}.`);
          return;
        }
        onPrendaVista(completa);
        setVista({ tipo: "tallas", prenda: completa, original: p });
      }}
      onGuardar={() => void guardar(separado)}
      onCerrar={onCerrar}
    />
  );
}

/** La hoja de «Separar»: lo que quedó sin separar de una línea, dicho por prenda (con o sin tallas) y nuevas. */
function SepararAhora({
  item,
  categoria,
  marca,
  separado,
  guardando,
  error,
  onPrendaVista,
  onSeparado,
  onTallas,
  onGuardar,
  onCerrar,
}: {
  item: ParaDespues;
  categoria: NonNullable<LineaParaContar["categoria"]>;
  marca: MarcaDeLinea;
  separado: Separado;
  guardando: boolean;
  error: string | null;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onSeparado: (s: Separado) => void;
  onTallas: (p: PrendaSeparada) => void;
  onGuardar: () => void;
  onCerrar: () => void;
}) {
  const total = totalSeparado(separado);
  const campos = [
    {
      id: "separar-algo",
      nombre: "Qué prendas son",
      requerido: true,
      hecho: total > 0 && total <= item.cantidad,
      pendiente: total > item.cantidad ? `Solo quedan ${item.cantidad}: quita ${total - item.cantidad}.` : "Di al menos una prenda.",
    },
  ];
  const guia = useGuiaCampos(campos);
  return (
    <Modal titulo={`Separar ${textoPrendas(item.cantidad)}`} subtitulo={`${item.sub}. Busca cada prenda por su nombre; lo que no esté en el catálogo, como nuevas.`} tamano="ancha" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
         
          onSubmit={(e) => {
            e.preventDefault();
            if (guia.puedeConfirmar) onGuardar();
          }}
          className="space-y-4"
        >
          <div data-campo="separar-algo">
            <SepararPrendas
              categoria={categoria}
              marca={marca}
              separado={separado}
              tope={item.cantidad}
              enHacerAhora
              onSeparado={onSeparado}
              onTallas={onTallas}
              onPrendaVista={onPrendaVista}
            />
          </div>
          {error && <Aviso tono="error" titulo="No se pudo guardar">{error}</Aviso>}
          <div className="pie-hoja-fijo">
            <div className="space-y-3 border-t border-sand pt-3">
              <PieGuia guia={guia} listo="Lo que tiene tallas entra al stock; lo demás queda pendiente." />
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <Boton type="button" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Guardar
                </Boton>
              </div>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
