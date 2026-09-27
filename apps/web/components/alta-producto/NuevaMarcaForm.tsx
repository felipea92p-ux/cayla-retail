"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { marcasParecidas, type MarcaConProveedores, type ProveedorOpcion } from "@/lib/marcas";
import { proveedoresParecidos } from "@/lib/proveedores-reglas";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// El formulario de "Nueva marca con su proveedor" (ADR-0109): lo usan el
// selector de Nuevo producto/censo/edición Y la pantalla Catálogo → Marcas —
// una sola forma de crear una marca, no dos.
//
// Dos escrituras, y se dicen así porque la segunda puede fallar sola:
//   1. registrar el proveedor (solo si es nuevo), con lo mínimo: nombre y RUC
//      opcional. Contacto, banco y plazo se completan después en Compras;
//   2. `crear_marca`: la marca con su proveedor, o —si la marca ya existe—
//      solo se le suma el proveedor (la misma marca por otro distribuidor).
// Si la 2 falla tras registrar el proveedor, el proveedor YA existe: el formulario
// pasa solo a «un proveedor que ya tengo» con ese elegido, así reintentar NO lo
// registra otra vez (registrar_proveedor no es idempotente: crearía un duplicado).
//
// Responsable (ADR-0161): crear una marca es Catálogo (operación de tienda), así
// que el formulario lleva su propio combo — es un guardado aparte del producto
// que se está dando de alta. `registrar_proveedor` es de Compras, que firma con la
// sesión; aquí se firma igual porque es parte del MISMO gesto de Catálogo, y el
// encabezado solo lo lee la función que lo pide (a las demás no les cambia nada).
// Si la 2 falla, el combo NO se vacía: el reintento es el mismo gesto.
//
// «¿Quién la trae?» es un buscador (ComboBuscable, 6 a la vista) y NO la lista entera de proveedores como botones: con
// ~60 proveedores el muro de chips ocupaba media pantalla (captura de Felipe, 2026-09-24). Registrar uno nuevo es la
// última opción de esa misma lista, con lo tipeado ya puesto como nombre.
//
// «¿No será una marca que ya existe?» (2026-09-25): el 24-sep se creó «Cayla 2» para un top que confecciona Jacard,
// cuando lo que hacía falta era sumarle Jacard a CAYLA. Mientras se escribe el nombre, el formulario dice dos cosas:
//   · si es IGUAL a una marca (como la compara la base), que no se crea otra: se le suma el proveedor;
//   · si se PARECE a una o más (`marcasParecidas`), pregunta. «Sí, es CAYLA» cambia el nombre a la que existe;
//     «No, es otra marca» deja seguir. Guardar sin responder no guarda: la pregunta es barata, la marca partida en
//     dos no (cada filtro y cada reporte por marca la cuenta a medias, y la base no sabe fusionar marcas).
//
// «¿No será un proveedor que ya tienes?» (2026-09-25): lo mismo al registrar un proveedor nuevo desde aquí, con la regla
// de proveedores (`proveedoresParecidos`: «SAC»/«S.A.C.»/«EIRL» no cuentan, y dos RUC válidos distintos no se
// preguntan). Pesa más que la marca: un proveedor partido en dos reparte sus facturas y su Por pagar en dos fichas.
// «Sí, es Jacard Peru SAC» lo elige de la lista (no se registra nada); con el nombre IGUAL no hay «no»: la base no
// dejaría registrar otro.

export type MarcaGuardada = {
  marcaId: string;
  marcaNombre: string;
  proveedorId: string;
  proveedorNombre: string;
  /** El proveedor se creó ahora (no estaba en la lista). */
  proveedorNuevo: boolean;
};

export function NuevaMarcaForm({
  proveedores,
  nombreInicial = "",
  marcaFija = false,
  /** Proveedor ya elegido que todavía no trae ninguna marca: la marca nueva se le cuelga a ese, sin volver a preguntar quién la trae. */
  proveedorFijo,
  marcas,
  onGuardado,
  onCancelar,
}: {
  proveedores: ProveedorOpcion[];
  nombreInicial?: string;
  /** Marca ya existente a la que solo se le suma un proveedor: el nombre no se toca. */
  marcaFija?: boolean;
  proveedorFijo?: ProveedorOpcion;
  /** Las marcas activas que ya existen, con quién las trae: contra ellas se pregunta «¿no es esta?». Obligatorio a
   *  propósito: una pantalla nueva que lo olvidara perdería la pregunta sin que nada avise. */
  marcas: readonly MarcaConProveedores[];
  onGuardado: (r: MarcaGuardada) => void;
  onCancelar: () => void;
}) {
  const [nombreMarca, setNombreMarca] = useState(nombreInicial);
  // Las parecidas a las que ya se respondió «No, es otra marca»: no se vuelve a preguntar por ellas.
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(() => new Set());
  const [modo, setModo] = useState<"existente" | "nuevo">(proveedorFijo || proveedores.length > 0 ? "existente" : "nuevo");
  const [proveedorId, setProveedorId] = useState(proveedorFijo?.id ?? "");
  // El proveedor que ESTE formulario acaba de registrar: existe aunque la marca haya fallado, y tiene que estar en la lista para reintentar.
  const [creado, setCreado] = useState<ProveedorOpcion | null>(null);
  const lista = creado && !proveedores.some((p) => p.id === creado.id) ? [...proveedores, creado] : proveedores;
  const [provNombre, setProvNombre] = useState("");
  const [provRuc, setProvRuc] = useState("");
  // Los proveedores parecidos a los que ya se respondió «No, es otro proveedor».
  const [provDescartados, setProvDescartados] = useState<ReadonlySet<string>>(() => new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable();

  // Con `marcaFija` el nombre ya es el de una marca que existe: no hay nada que preguntar.
  const { igual, parecidas } = marcaFija ? { igual: null, parecidas: [] } : marcasParecidas(nombreMarca, marcas);
  const porResponder = igual ? [] : parecidas.filter((p) => !descartadas.has(p.marca.id));
  const provElegido = proveedorFijo?.nombre ?? (modo === "nuevo" ? provNombre.trim() : lista.find((p) => p.id === proveedorId)?.nombre) ?? "";
  // Solo se pregunta mientras se está registrando uno nuevo: elegido de la lista, ya es uno que existe.
  const provPregunta = modo === "nuevo" && !proveedorFijo ? proveedoresParecidos({ nombre: provNombre, ruc: provRuc }, lista) : { igual: null, parecidos: [] };
  const provPorResponder = provPregunta.igual ? [] : provPregunta.parecidos.filter((p) => !provDescartados.has(p.proveedor.id));
  // Qué marcas trae cada proveedor, para que «¿es este?» se conteste sabiendo de quién se habla.
  const marcasDe = (nombreProv: string) => {
    const suyas = marcas.filter((m) => m.proveedores.includes(nombreProv)).map((m) => m.nombre);
    return suyas.length > 0 ? `trae ${suyas.join(", ")}` : undefined;
  };

  function usarExistente(nombre: string) {
    setNombreMarca(nombre);
    setError(null);
  }
  function esOtraMarca() {
    setDescartadas((prev) => new Set([...prev, ...porResponder.map((p) => p.marca.id)]));
    setError(null);
  }
  function usarProveedor(id: string) {
    setModo("existente");
    setProveedorId(id);
    setProvNombre("");
    setProvRuc("");
    setError(null);
  }
  function esOtroProveedor() {
    setProvDescartados((prev) => new Set([...prev, ...provPorResponder.map((p) => p.proveedor.id)]));
    setError(null);
  }

  async function guardar() {
    if (guardando) return;
    if (!responsable.listo) return setError(responsable.motivo);
    const nombre = nombreMarca.trim();
    if (!nombre) return setError("Escribe el nombre de la marca.");
    if (porResponder.length > 0) {
      return setError(
        porResponder.length === 1
          ? `Antes de guardar, dinos si «${nombre}» es la misma marca que «${porResponder[0].marca.nombre}».`
          : `Antes de guardar, dinos si «${nombre}» es alguna de las marcas de arriba.`
      );
    }
    if (modo === "existente" && !proveedorId) return setError("Elige el proveedor que la trae.");
    if (modo === "nuevo" && !provNombre.trim()) return setError("Escribe el nombre del proveedor.");
    if (modo === "nuevo" && provPregunta.igual) return setError(`«${provPregunta.igual.nombre}» ya está registrado: elígelo en vez de registrarlo otra vez.`);
    if (modo === "nuevo" && provPorResponder.length > 0) {
      return setError(
        provPorResponder.length === 1
          ? `Antes de guardar, dinos si «${provNombre.trim()}» es el mismo proveedor que «${provPorResponder[0].proveedor.nombre}».`
          : `Antes de guardar, dinos si «${provNombre.trim()}» es alguno de los proveedores de arriba.`
      );
    }

    setGuardando(true);
    setError(null);
    const supabase = createClient();

    let provId = proveedorId;
    const eraNuevo = modo === "nuevo";
    if (eraNuevo) {
      const { data, error: errProv } = await firmar(
        supabase.rpc("registrar_proveedor", {
          p_nombre: provNombre.trim(),
          p_ruc: provRuc.trim() || undefined,
        }),
        responsable.firma(),
      );
      if (errProv || !data) {
        setGuardando(false);
        responsable.despues(errProv);
        return setError(traducirError(errProv, "registrar el proveedor"));
      }
      provId = data;
      setCreado({ id: data, nombre: provNombre.trim() });
      setModo("existente");
      setProveedorId(data);
    }

    const { data: marcaId, error: errMarca } = await firmar(
      supabase.rpc("crear_marca", { p_nombre: nombre, p_proveedor_id: provId }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(errMarca);
    if (errMarca || !marcaId) {
      return setError(
        eraNuevo
          ? `El proveedor «${provNombre.trim()}» se registró, pero la marca no se pudo guardar: ${traducirError(errMarca, "agregar la marca")} Vuelve a tocar «Guardar y usar»: el proveedor ya no se registra otra vez.`
          : traducirError(errMarca, "agregar la marca")
      );
    }

    onGuardado({
      marcaId,
      // Si ya existía, se muestra como se llama de verdad («CAYLA»), no como se tipeó («cayla»).
      marcaNombre: igual?.nombre ?? nombre,
      proveedorId: provId,
      proveedorNombre: eraNuevo ? provNombre.trim() : (lista.find((p) => p.id === provId)?.nombre ?? ""),
      // «Nuevo» también si se registró en un intento anterior de este mismo formulario: el padre todavía no lo tiene en su lista.
      proveedorNuevo: eraNuevo || creado?.id === provId,
    });
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void guardar();
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-sand bg-crema p-4">
      <p className="label-cayla text-[11px] text-tinta/70">
        {marcaFija ? `Otro proveedor para ${nombreInicial}` : proveedorFijo ? `Nueva marca de ${proveedorFijo.nombre}` : "Nueva marca"}
      </p>
      <div className={`grid gap-3 ${!marcaFija && !proveedorFijo ? "sm:grid-cols-2" : ""}`}>
        {!marcaFija && (
          <div>
            <label htmlFor="nueva-marca" className="text-xs text-tinta/60">
              Nombre de la marca
            </label>
            <input
              id="nueva-marca"
              autoFocus
              value={nombreMarca}
              onChange={(e) => setNombreMarca(e.target.value)}
              onKeyDown={enter}
              className="caja-cayla mt-1 h-10 w-full px-3 text-sm text-tinta outline-none"
            />
          </div>
        )}

        {!proveedorFijo && (
          <div>
            <label htmlFor="proveedor-marca" className="text-xs text-tinta/60">
              ¿Quién la trae?
            </label>
            <div className="mt-1">
              {modo === "existente" ? (
                <ComboBuscable
                  id="proveedor-marca"
                  caja
                  etiquetaAccesible="Proveedor que trae la marca"
                  marcador={lista.length > 0 ? `Busca entre ${lista.length} proveedores…` : "Escribe el nombre del proveedor…"}
                  valor={proveedorId}
                  onValor={setProveedorId}
                  opciones={lista.map((p) => ({ valor: p.id, texto: p.nombre }))}
                  limite={6}
                  crear={{
                    etiqueta: (q) => (q ? `+ Registrar «${q}» como proveedor nuevo` : "+ Registrar un proveedor nuevo"),
                    onCrear: (q) => {
                      setProvNombre(q);
                      setProveedorId("");
                      setModo("nuevo");
                    },
                  }}
                />
              ) : (
                <div className="flex h-10 items-center justify-between gap-2 rounded-md bg-hueso px-3 text-sm text-tinta">
                  Proveedor nuevo
                  {lista.length > 0 && (
                    <button type="button" onClick={() => setModo("existente")} className="btn-cayla btn-enlace text-xs">
                      Elegir uno que ya tengo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {igual && (
        <p className="nota-cayla text-xs">
          <b>{igual.nombre}</b> ya existe{igual.proveedores.length > 0 && <> (la trae {igual.proveedores.join(", ")})</>}. No se crea otra:{" "}
          {provElegido && igual.proveedores.includes(provElegido)
            ? `${provElegido} ya la trae, así que se usa tal cual.`
            : provElegido
              ? `al guardar, ${provElegido} pasa a ser otro proveedor de ${igual.nombre}.`
              : "al guardar, se le suma el proveedor que elijas."}
        </p>
      )}

      {porResponder.length > 0 && (
        <PreguntaParecido
          titulo="¿No será una marca que ya existe?"
          bajada="Si es la misma, elígela: se le suma el proveedor y la marca no queda partida en dos."
          opciones={porResponder.map(({ marca }) => ({
            id: marca.id,
            nombre: marca.nombre,
            detalle: marca.proveedores.length > 0 ? `la trae ${marca.proveedores.join(", ")}` : "sin proveedor",
          }))}
          si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => usarExistente(o.nombre) })}
          no={{ texto: `No, «${nombreMarca.trim()}» es otra marca`, onClick: esOtraMarca }}
          deshabilitado={guardando}
        />
      )}

      {!proveedorFijo && modo === "nuevo" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nuevo-proveedor" className="text-xs text-tinta/60">
              Razón social o nombre
            </label>
            <input
              id="nuevo-proveedor"
              autoFocus
              value={provNombre}
              onChange={(e) => setProvNombre(e.target.value)}
              onKeyDown={enter}
              className="caja-cayla mt-1 h-10 w-full px-3 text-sm text-tinta outline-none"
            />
          </div>
          <div>
            <label htmlFor="nuevo-ruc" className="text-xs text-tinta/60">
              RUC (opcional)
            </label>
            <input
              id="nuevo-ruc"
              inputMode="numeric"
              maxLength={11}
              value={provRuc}
              onChange={(e) => setProvRuc(e.target.value.replace(/\D/g, ""))}
              onKeyDown={enter}
              className="caja-cayla mt-1 h-10 w-full px-3 text-sm tabular-nums text-tinta outline-none"
            />
          </div>
          <p className="text-xs text-tinta/55 sm:col-span-2">Con esto alcanza para seguir; el contacto, el banco y el plazo se completan después en Compras.</p>
        </div>
      )}

      {provPregunta.igual && (
        <PreguntaParecido
          titulo={`«${provPregunta.igual.nombre}» ya está registrado`}
          bajada="Con el mismo nombre no se registra otro: elígelo y la marca se le suma."
          opciones={[{ id: provPregunta.igual.id, nombre: provPregunta.igual.nombre, detalle: marcasDe(provPregunta.igual.nombre) }]}
          si={(o) => ({ texto: `Usar ${o.nombre}`, onClick: () => usarProveedor(o.id) })}
          deshabilitado={guardando}
        />
      )}
      {provPorResponder.length > 0 && (
        <PreguntaParecido
          titulo="¿No será un proveedor que ya tienes?"
          bajada="Si es el mismo, elígelo: sus facturas y lo que se le debe tienen que quedar en una sola ficha."
          opciones={provPorResponder.map(({ proveedor }) => ({ id: proveedor.id, nombre: proveedor.nombre, detalle: marcasDe(proveedor.nombre) }))}
          si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => usarProveedor(o.id) })}
          no={{ texto: `No, «${provNombre.trim()}» es otro proveedor`, onClick: esOtroProveedor }}
          deshabilitado={guardando}
        />
      )}

      {error && (
        <p role="alert" className="text-xs text-rojo-profundo">
          {error}
        </p>
      )}
      <ComboResponsable control={responsable} deshabilitado={guardando} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !responsable.listo}
          title={responsable.motivo ?? undefined}
          className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar y usar"}
        </button>
        <button type="button" onClick={onCancelar} disabled={guardando} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
          Cancelar
        </button>
      </div>
    </div>
  );
}
