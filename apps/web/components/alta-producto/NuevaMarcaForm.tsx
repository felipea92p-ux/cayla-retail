"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { marcasParecidas, type MarcaConProveedores, type ProveedorOpcion } from "@/lib/marcas";
import { proveedoresParecidos } from "@/lib/proveedores-reglas";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { firmar } from "@/lib/responsable-reglas";
import { AvisoSinIdentidad, useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposDeRegistroMarca } from "@/lib/marca-registro-guia";
import {
  ordenarPorNombre,
  parejaYaExiste,
  registroListo,
  textoQuienLaTrae,
  type MarcaDelFormulario,
  type ProveedorDelFormulario,
} from "@/lib/marca-proveedor-reglas";
import { Aviso } from "@/components/ui/Aviso";

// El formulario «Registrar marca o proveedor» (ADR-0109; spike Nuevo producto v2, 2026-09-28): lo usan el selector de
// Nuevo producto/censo/edición Y la pantalla Catálogo → Marcas — una sola forma de crear una marca, no dos.
//
// UN formulario para los tres casos (Felipe, 2026-09-28: «¿y si quiero agregar un proveedor?»):
//   · marca nueva con un proveedor que ya existe;
//   · marca nueva con un proveedor nuevo;
//   · un proveedor más para una marca que YA existe.
// El campo Marca sirve para las dos cosas: se busca una que existe o se escribe una nueva («+ Marca nueva «X»», primera
// fila fija de la lista). Elegida una que existe, dice quién la trae hoy. Si además se elige un proveedor que YA la trae,
// no hay nada que registrar: aviso ámbar y el botón queda apagado (la pareja se elige en el buscador).
//
// Dos escrituras, y se dicen así porque la segunda puede fallar sola:
//   1. registrar el proveedor (solo si es nuevo), con lo mínimo: nombre y RUC
//      opcional. Contacto, banco y plazo se completan después en Compras;
//   2. `crear_marca`: la marca con su proveedor, o —si la marca ya existe—
//      solo se le suma el proveedor (la misma marca por otro distribuidor). Los
//      tres casos salen de esta misma función: la base compara el nombre con
//      `fn_clave_texto` y hace `on conflict do nothing` en `marca_proveedores`.
// Si la 2 falla tras registrar el proveedor, el proveedor YA existe: el formulario
// pasa solo a «un proveedor que ya tengo» con ese elegido, así reintentar NO lo
// registra otra vez (registrar_proveedor no es idempotente: crearía un duplicado).
//
// Crear una marca es un guardado aparte del producto que se está dando de alta; dentro del alta lo
// firma quien la inició (`useFirmaDeMitad`), sin combo propio desde 2026-09-29. Desde Catálogo ▸
// Marcas (fuera del alta) sigue soltado del combo, con la clave `alta_producto_marca`.
// `registrar_proveedor` es de Compras, pero aquí es parte del MISMO gesto de Catálogo, así que se
// firma igual (el encabezado solo lo lee la función que lo pide).
//
// «¿No será una marca que ya existe?» (2026-09-25): el 24-sep se creó «Cayla 2» para un top que confecciona Jacard,
// cuando lo que hacía falta era sumarle Jacard a CAYLA. Con una marca NUEVA elegida, el formulario dice dos cosas:
//   · si es IGUAL a una marca (como la compara la base), no queda como nueva: pasa a ser esa marca;
//   · si se PARECE a una o más (`marcasParecidas`), pregunta. «Sí, es CAYLA» la cambia por la que existe;
//     «No, es otra marca» deja seguir. Sin responder no se guarda: la pregunta es barata, la marca partida en
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

/** La marca del formulario: una que existe (por id) o una nueva (por nombre). */
type MarcaSel = { id: string } | { nueva: string } | null;

// Pasar el foco a un campo que recién se monta (el buscador que vuelve con «Cambiar», el que sigue tras elegir).
const enfocar = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

export function NuevaMarcaForm({
  proveedores,
  marcas,
  nombreInicial = "",
  textoGuardar = "Registrar",
  onGuardado,
  onCancelar,
}: {
  proveedores: ProveedorOpcion[];
  /** Las marcas activas que ya existen, con quién las trae: entre ellas se busca la marca, contra ellas se pregunta
   *  «¿no es esta?» y se avisa la pareja repetida. Obligatorio a propósito: una pantalla nueva que lo olvidara perdería
   *  la pregunta sin que nada avise. */
  marcas: readonly MarcaConProveedores[];
  /** Lo que se tipeó en el buscador antes de abrir: entra como marca (la que existe, si se llama igual; si no, nueva). */
  nombreInicial?: string;
  /** El botón que guarda: «Registrar y elegir» en el selector de Nuevo producto (la pareja queda elegida). */
  textoGuardar?: string;
  onGuardado: (r: MarcaGuardada) => void;
  onCancelar: () => void;
}) {
  const [marcaSel, setMarcaSel] = useState<MarcaSel>(() => marcaDesdeNombre(nombreInicial, marcas));
  // Las parecidas a las que ya se respondió «No, es otra marca»: no se vuelve a preguntar por ellas.
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(() => new Set());
  const [proveedorId, setProveedorId] = useState("");
  const [provNuevo, setProvNuevo] = useState(false);
  // El proveedor que ESTE formulario acaba de registrar: existe aunque la marca haya fallado, y tiene que estar en la lista para reintentar.
  const [creado, setCreado] = useState<ProveedorOpcion | null>(null);
  const lista = useMemo(() => (creado && !proveedores.some((p) => p.id === creado.id) ? [...proveedores, creado] : proveedores), [creado, proveedores]);
  const [provNombre, setProvNombre] = useState("");
  const [provRuc, setProvRuc] = useState("");
  // Los proveedores parecidos a los que ya se respondió «No, es otro proveedor».
  const [provDescartados, setProvDescartados] = useState<ReadonlySet<string>>(() => new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firma = useFirmaDeMitad("alta_producto_marca");

  const opcionesMarca = useMemo(() => ordenarPorNombre(marcas).map((m) => ({ valor: m.id, texto: m.nombre })), [marcas]);
  const opcionesProv = useMemo(() => ordenarPorNombre(lista).map((p) => ({ valor: p.id, texto: p.nombre })), [lista]);

  const marcaExistente = marcaSel && "id" in marcaSel ? (marcas.find((m) => m.id === marcaSel.id) ?? null) : null;
  const marcaNueva = marcaSel && "nueva" in marcaSel ? marcaSel.nueva : null;
  const marcaNombre = marcaExistente?.nombre ?? marcaNueva ?? "";
  // Solo se pregunta por una marca NUEVA: una elegida de la lista ya es una que existe.
  const parecidas = marcaNueva ? marcasParecidas(marcaNueva, marcas).parecidas : [];
  const porResponder = parecidas.filter((p) => !descartadas.has(p.marca.id));
  const provElegido = lista.find((p) => p.id === proveedorId) ?? null;
  // Solo se pregunta mientras se está registrando uno nuevo: elegido de la lista, ya es uno que existe.
  const provPregunta = provNuevo ? proveedoresParecidos({ nombre: provNombre, ruc: provRuc }, lista) : { igual: null, parecidos: [] };
  const provPorResponder = provPregunta.igual ? [] : provPregunta.parecidos.filter((p) => !provDescartados.has(p.proveedor.id));

  const marcaForm: MarcaDelFormulario | null = marcaExistente
    ? { nombre: marcaExistente.nombre, existe: true, proveedores: marcaExistente.proveedores }
    : marcaNueva
      ? { nombre: marcaNueva, existe: false }
      : null;
  const provForm: ProveedorDelFormulario = provNuevo
    ? { tipo: "nuevo", razonSocial: provNombre }
    : provElegido
      ? { tipo: "existente", nombre: provElegido.nombre }
      : null;
  const repetida = parejaYaExiste(marcaForm, provForm);
  const listo = registroListo(marcaForm, provForm, porResponder.length + provPorResponder.length + (provPregunta.igual ? 1 : 0));
  // Guía de foco (CLAUDE.md «Guía de foco»): sale de la misma regla que habilita «Registrar» (`registroListo`).
  const guia = useGuiaCampos(camposDeRegistroMarca(marcaForm, provForm, { marca: porResponder.length, proveedor: provPorResponder.length, proveedorIgual: !!provPregunta.igual }));

  // Qué marcas trae cada proveedor, para que «¿es este?» se conteste sabiendo de quién se habla.
  const marcasDe = (nombreProv: string) => {
    const suyas = marcas.filter((m) => m.proveedores.includes(nombreProv)).map((m) => m.nombre);
    return suyas.length > 0 ? `trae ${suyas.join(", ")}` : undefined;
  };

  function elegirMarca(sel: MarcaSel) {
    setMarcaSel(sel);
    setError(null);
    // Lo que sigue es quién la trae: si todavía no está, el foco va a su buscador (que se abre solo).
    if (sel && !proveedorId && !provNuevo) enfocar("nm-prov");
  }
  function cambiarMarca() {
    setMarcaSel(null);
    setError(null);
    enfocar("nm-marca");
  }
  function esOtraMarca() {
    setDescartadas((prev) => new Set([...prev, ...porResponder.map((p) => p.marca.id)]));
    setError(null);
  }
  function usarProveedor(id: string) {
    setProvNuevo(false);
    setProveedorId(id);
    setProvNombre("");
    setProvRuc("");
    setError(null);
  }
  function proveedorNuevo(nombre = "") {
    setProvNuevo(true);
    setProveedorId("");
    setProvNombre(nombre);
    setError(null);
    enfocar("nuevo-proveedor");
  }
  function cambiarProveedor() {
    setProvNuevo(false);
    setProveedorId("");
    setError(null);
    enfocar("nm-prov");
  }
  function esOtroProveedor() {
    setProvDescartados((prev) => new Set([...prev, ...provPorResponder.map((p) => p.proveedor.id)]));
    setError(null);
  }

  async function guardar() {
    if (guardando) return;
    if (!firma.listo) return setError(firma.motivo);
    const nombre = marcaNombre.trim();
    if (!nombre) return setError("Elige la marca o escribe una nueva.");
    if (porResponder.length > 0) {
      return setError(
        porResponder.length === 1
          ? `Antes de guardar, dinos si «${nombre}» es la misma marca que «${porResponder[0].marca.nombre}».`
          : `Antes de guardar, dinos si «${nombre}» es alguna de las marcas de arriba.`
      );
    }
    if (!provNuevo && !proveedorId) return setError("Elige quién te la trae.");
    if (provNuevo && !provNombre.trim()) return setError("Escribe la razón social del proveedor.");
    if (provNuevo && provPregunta.igual) return setError(`«${provPregunta.igual.nombre}» ya está registrado: elígelo en vez de registrarlo otra vez.`);
    if (provNuevo && provPorResponder.length > 0) {
      return setError(
        provPorResponder.length === 1
          ? `Antes de guardar, dinos si «${provNombre.trim()}» es el mismo proveedor que «${provPorResponder[0].proveedor.nombre}».`
          : `Antes de guardar, dinos si «${provNombre.trim()}» es alguno de los proveedores de arriba.`
      );
    }
    if (repetida) return setError(`${nombre} ya la trae ${provElegido?.nombre}: no hace falta registrarla.`);

    setGuardando(true);
    setError(null);
    const supabase = createClient();

    let provId = proveedorId;
    const eraNuevo = provNuevo;
    if (eraNuevo) {
      const { data, error: errProv } = await firmar(
        supabase.rpc("registrar_proveedor", {
          p_nombre: provNombre.trim(),
          p_ruc: provRuc.trim() || undefined,
        }),
        firma.firma(),
      );
      if (errProv || !data) {
        setGuardando(false);
        return setError(traducirError(errProv, "registrar el proveedor"));
      }
      provId = data;
      setCreado({ id: data, nombre: provNombre.trim() });
      setProvNuevo(false);
      setProveedorId(data);
    }

    // Marca que existe: se manda su nombre de verdad y `crear_marca` solo le suma el proveedor.
    const { data: marcaId, error: errMarca } = await firmar(
      supabase.rpc("crear_marca", { p_nombre: nombre, p_proveedor_id: provId }),
      firma.firma(),
    );
    setGuardando(false);
    if (errMarca || !marcaId) {
      return setError(
        eraNuevo
          ? `El proveedor «${provNombre.trim()}» se registró, pero la marca no se pudo guardar: ${traducirError(errMarca, "agregar la marca")} Vuelve a tocar «${textoGuardar}»: el proveedor ya no se registra otra vez.`
          : traducirError(errMarca, "agregar la marca")
      );
    }

    onGuardado({
      marcaId,
      marcaNombre: nombre,
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

  const etiqueta = "text-[12.5px] font-semibold text-tinta";
  const elegida = "flex items-center gap-2.5 rounded-lg bg-hueso px-3 py-2 text-sm text-tinta";

  return (
    <div className="space-y-3.5 rounded-xl border border-sand bg-crema px-4 py-3.5">
      <div>
        <p className="text-sm font-semibold text-tinta">Registrar marca o proveedor</p>
        <p className="mt-0.5 text-[12.5px] text-taupe">Sirve para una marca nueva o para sumarle un proveedor a una marca que ya tienes.</p>
      </div>

      {/* ---------- la marca: una que existe o una nueva, en el mismo campo ---------- */}
      <CampoGuiado id="marca" guia={guia}>
        <label htmlFor={marcaSel ? undefined : "nm-marca"} className={`mb-1.5 block ${etiqueta}`}>
          {guia.etiqueta("marca", "Marca")}
        </label>
        {marcaSel ? (
          <div className={elegida}>
            <p className="min-w-0">
              <span className="font-semibold">{marcaNombre}</span>
              <span className="text-taupe">
                {" "}
                · {marcaExistente ? `ya existe. ${textoQuienLaTrae(marcaExistente.proveedores)}` : "marca nueva"}
              </span>
            </p>
            <button type="button" onClick={cambiarMarca} disabled={guardando} className="btn-cayla btn-enlace ml-auto text-[12.5px]">
              Cambiar
            </button>
          </div>
        ) : (
          <ComboBuscable
            id="nm-marca"
            caja
            autoFocus={!nombreInicial.trim()}
            etiquetaAccesible="Marca: busca una que ya existe o escribe una nueva"
            marcador="Busca una marca que ya existe o escribe una nueva…"
            valor=""
            onValor={(id) => elegirMarca({ id })}
            opciones={opcionesMarca}
            crearArriba
            crear={{
              etiqueta: (q) => `+ Marca nueva «${q}»`,
              pista: "+ ¿Es nueva? Escribe su nombre arriba",
              onCrear: (q) => q && elegirMarca(marcaDesdeNombre(q, marcas)),
            }}
          />
        )}
      </CampoGuiado>

      {porResponder.length > 0 && (
        <PreguntaParecido
          titulo="¿No será una marca que ya existe?"
          bajada="Si es la misma, elígela: se le suma el proveedor y la marca no queda partida en dos."
          opciones={porResponder.map(({ marca }) => ({
            id: marca.id,
            nombre: marca.nombre,
            detalle: marca.proveedores.length > 0 ? `la trae ${marca.proveedores.join(", ")}` : "sin proveedor",
          }))}
          si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => elegirMarca({ id: o.id }) })}
          no={{ texto: `No, «${marcaNombre}» es otra marca`, onClick: esOtraMarca }}
          deshabilitado={guardando}
        />
      )}

      {/* ---------- quién la trae: uno que existe o uno nuevo ---------- */}
      <CampoGuiado id="proveedor" guia={guia}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
          <label htmlFor={provElegido || provNuevo ? undefined : "nm-prov"} className={etiqueta}>
            {guia.etiqueta("proveedor", "¿Quién te la trae?")}
          </label>
          {!provElegido && !provNuevo && (
            <button type="button" onClick={() => proveedorNuevo()} className="btn-cayla btn-enlace text-[12.5px]">
              + Proveedor nuevo
            </button>
          )}
        </div>
        {provElegido && !provNuevo ? (
          <div className={elegida}>
            <p className="min-w-0 font-semibold">{provElegido.nombre}</p>
            <button type="button" onClick={cambiarProveedor} disabled={guardando} className="btn-cayla btn-enlace ml-auto text-[12.5px]">
              Cambiar
            </button>
          </div>
        ) : provNuevo ? (
          <div className="space-y-1.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nuevo-proveedor" className="mb-1 block text-xs text-tinta/70">
                  Razón social
                </label>
                <input
                  id="nuevo-proveedor"
                  autoFocus
                  value={provNombre}
                  onChange={(e) => setProvNombre(e.target.value)}
                  onKeyDown={enter}
                  placeholder="Textil Andina SAC" // sugerir-fijo: razón social de un proveedor nuevo; no depende de nada elegido antes
                  autoComplete="off"
                  className="caja-cayla h-10 w-full px-3 text-sm text-tinta placeholder:text-tinta/45"
                />
              </div>
              <div>
                <label htmlFor="nuevo-ruc" className="mb-1 block text-xs text-tinta/70">
                  RUC <span className="text-taupe">· opcional</span>
                </label>
                <input
                  id="nuevo-ruc"
                  inputMode="numeric"
                  maxLength={11}
                  value={provRuc}
                  onChange={(e) => setProvRuc(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={enter}
                  placeholder="11 dígitos" // sugerir-fijo: formato del RUC; es el mismo para cualquier proveedor
                  autoComplete="off"
                  className="caja-cayla h-10 w-full px-3 text-sm tabular-nums text-tinta placeholder:text-tinta/45"
                />
              </div>
            </div>
            <p className="text-xs text-taupe">
              Con esto alcanza para seguir; el contacto, el banco y el plazo se completan después en Compras.
              {lista.length > 0 && (
                <>
                  {" "}
                  <button type="button" onClick={cambiarProveedor} disabled={guardando} className="btn-cayla btn-enlace text-xs">
                    Mejor elijo uno que ya existe
                  </button>
                </>
              )}
            </p>
          </div>
        ) : (
          <ComboBuscable
            id="nm-prov"
            caja
            etiquetaAccesible="Proveedor que trae la marca"
            marcador={lista.length > 0 ? `Toca para ver los ${lista.length} proveedores, o escribe…` : "Escribe el nombre del proveedor…"}
            valor=""
            onValor={usarProveedor}
            opciones={opcionesProv}
            crearArriba
            crear={{ etiqueta: (q) => (q ? `+ Proveedor nuevo «${q}»` : "+ Proveedor nuevo"), onCrear: (q) => proveedorNuevo(q) }}
          />
        )}
      </CampoGuiado>

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

      {repetida && provElegido && (
        <Aviso tono="atencion">
          {marcaNombre} ya la trae {provElegido.nombre}. No hace falta registrarla: cancela y elígela en el buscador.
        </Aviso>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}

      <AvisoSinIdentidad firma={firma} />
      <PieGuia guia={guia} listo="Todo listo para registrar." />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={guardando} className="btn-cayla btn-secundario">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !listo || !firma.listo}
          title={firma.motivo ?? guia.frase ?? undefined}
          className={`btn-cayla btn-primario ${guia.claseConfirmar}`}
        >
          {guardando ? "Guardando…" : textoGuardar}
        </button>
      </div>
    </div>
  );
}

/** Un nombre tipeado como marca: la que existe si la base la consideraría la misma (`marcas_nombre_unico` sobre
 *  `fn_clave_texto`, lo que `marcasParecidas` llama «igual»); si no, una marca nueva. Vacío, nada. */
function marcaDesdeNombre(nombre: string, marcas: readonly MarcaConProveedores[]): MarcaSel {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (!limpio) return null;
  const { igual } = marcasParecidas(limpio, marcas);
  return igual ? { id: igual.id } : { nueva: limpio };
}
