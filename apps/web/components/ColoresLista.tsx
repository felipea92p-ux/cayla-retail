"use client";

import { bordeDeMuestra, enLaCarta, FAMILIAS_COLOR, fondoDeMuestra, textoDeFamilia, type FamiliaColor } from "@/lib/colores-familias";
import { coloresParecidos } from "@/lib/color-parecido";
import { partirEnGamas } from "@/lib/color-escala";
import { normalizarPantone, normalizarSinonimos } from "@/lib/color-referencias";
import { useEffect, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import {
  AccionTarjeta,
  BarraAtributos,
  BotonesPendiente,
  BotonReactivar,
  GRILLA_ATRIBUTOS,
  PieTarjeta,
  SinCoincidencias,
  TarjetaAtributo,
  TituloGrupo,
} from "@/components/atributos/kit";
import { normalizarCodigo, sugerirCodigoColor } from "@/lib/color-codigo";
import { MuestraEditable, SelectorColor } from "@/components/SelectorColor";
import { filtrarColores } from "@/lib/atributos-buscar";

/**
 * El vocabulario cerrado de colores — portado de `trix/catalogo-vocabulario`
 * (V1) tras ADR-0095: V2 ya tiene el candado real (`colores_clave_unica`) y
 * los 30 colores de CAYLA en la base, pero hasta ahora ninguna pantalla
 * dejaba agregar uno nuevo a mano.
 *
 * "+ Agregar color" es de cualquiera con sesión desde el 2026-09-16
 * (`20260916220000_colores_proponer_aprobar.sql`): un color propuesto nace
 * `pendiente` y queda usable al instante (nunca frena a quien está en medio
 * de un censo), y cualquiera de los Líderes lo aprueba después. Editar,
 * aprobar y desactivar/reactivar siguen detrás de `puedeEditar` — el candado
 * real vive en la base (`colores_update_lider`), esto solo decide qué se
 * MUESTRA.
 *
 * `codigo` no se edita: es la clave primaria natural (referenciada por
 * `variantes.color_codigo` y por el propio código de cada prenda,
 * `BLU-0042-AZM-M`) — moverla desde acá rompería ese enganche.
 */

type Color = {
  codigo: string;
  nombre: string;
  familiaColor: string | null;
  /** `colores.tipo` («solido» | «textura» | «estampado»): una textura (Gris melange) se pinta jaspeada, no como un liso del mismo tono. */
  tipo: string;
  hex: string | null;
  orden: number;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  /** Código Pantone TCX («19-1557 TCX»): la referencia para pedir la tela. Null = sin anclar (los metálicos). */
  pantoneTcx: string | null;
  /** Cómo le dicen en tienda («plomo» → Gris): el buscador los entiende. */
  sinonimos: string[];
};

// El código Pantone se escribe como sea («19-1557», «19 1557 tcx») y se guarda como «19-1557 TCX». Dos colores no
// pueden tener el mismo (índice único en la base): la pantalla lo dice antes de que la base lo rechace.
function pantoneInvalido(texto: string, ocupados: Map<string, string>): boolean {
  const p = normalizarPantone(texto);
  return p === "invalido" || (p !== null && ocupados.has(p));
}
function pieDePantone(texto: string, ocupados: Map<string, string>): string {
  const p = normalizarPantone(texto);
  if (p === "invalido") return "Tiene la forma 19-1557 TCX (o solo 19-1557).";
  if (p !== null && ocupados.has(p)) return `Ya lo tiene «${ocupados.get(p)}».`;
  return p ? `Se guarda como ${p}` : "Opcional: el código para pedir la tela al taller o al proveedor.";
}

// El orden lo da la propia paleta (familia en el espectro, luego gama y claridad: `lib/color-escala.ts`), el mismo de la carta de
// Nuevo producto. `colores.orden` ya no decide nada aquí: un color recién creado cae en su lugar sin que alguien lo numere.
function ordenar(lista: Color[]) {
  return [...lista].sort(enLaCarta);
}

// Agrupa la grilla por familia de color (Neutro, Azul, Rojo...) en vez de una
// sola fila continua ordenada por `orden` global — pedido de Felipe
// (2026-09-18): con 34+ colores, un número global deja un color nuevo
// "colgando" al final en vez de junto a sus parecidos, y la última fila
// queda a medio llenar sin motivo aparente. Agrupado, cada familia cierra su
// propia fila — la de "Estampado" con 3 colores se ve completa, no como el
// resto de una grilla de 5 que faltó llenar. El orden DENTRO de cada sección ya
// viene dado por `ordenar()` (escala: gama y de claro a oscuro); cada gama es su propia grilla, así cada fila es una escala
// pura y la claridad nunca «sube» a mitad de una fila (ADR-0314).
function gruposPorFamilia(lista: Color[]) {
  const grupos: { familia: string; texto: string; colores: Color[] }[] = FAMILIAS_COLOR.map((f) => ({
    familia: f.valor,
    texto: f.texto,
    colores: lista.filter((c) => c.familiaColor === f.valor),
  })).filter((g) => g.colores.length > 0);

  // Defensivo: un color sin familia asignada (dato viejo, o el select vacío
  // en algún camino que no la exige) no debe desaparecer de la pantalla.
  const sinFamilia = lista.filter((c) => !FAMILIAS_COLOR.some((f) => f.valor === c.familiaColor));
  if (sinFamilia.length > 0) {
    grupos.push({ familia: "sin-familia", texto: "Sin familia", colores: sinFamilia });
  }
  return grupos;
}

// El cuadradito de la grilla: el color tal cual está en el vocabulario. Las
// texturas de tela viven en Tejidos y los estampados en Patrones (ADR-0106),
// así que un color es nombre, familia y hex; lo único que se suma es que un
// color de `tipo` textura (Gris melange: el hilo mismo es jaspeado) se pinta
// jaspeado sobre su hex, para no verse igual que el liso del mismo tono.
function Muestra({ hex, familia, tipo, className = "aspect-[3/1] w-full" }: { hex: string | null; familia?: string | null; tipo?: string | null; className?: string }) {
  return <div className={`${className} rounded-lg border border-tinta/10`} style={{ background: fondoDeMuestra(hex, familia, tipo) ?? "#e8e0d0", borderColor: bordeDeMuestra(hex) }} aria-hidden />;
}

/** Bajo el nombre: el código de 3 letras (va en el código de barras) y el Pantone para pedir la tela. */
function DetalleColor({ c }: { c: Color }) {
  return (
    <p className="flex justify-between gap-2 text-[11px] text-tinta/60">
      <span className="font-mono">{c.codigo}</span>
      {c.pantoneTcx && (
        <span className="font-mono" title="Código Pantone para pedir la tela">
          {c.pantoneTcx}
        </span>
      )}
    </p>
  );
}

// Aviso, no candado: el color que se está creando o editando se ve casi igual que otro del vocabulario
// (ΔE2000 < 8, `lib/color-parecido.ts`). Es el criterio con que se armó la paleta esencial (20260926100000):
// dos colores que no se distinguen terminan partiendo el stock de una misma prenda en dos filas. Decide la
// persona: Blanco y Crudo se parecen en pantalla y en textil son dos colores de verdad.
function AvisoParecido({
  hex,
  familiaColor,
  vocabulario,
  excluir,
}: {
  hex: string | null;
  familiaColor: string | null;
  vocabulario: Color[];
  excluir?: string;
}) {
  const parecidos = coloresParecidos(hex, familiaColor, vocabulario, { excluir }).slice(0, 3);
  if (parecidos.length === 0) return null;
  const nombres = parecidos.map((p) => `«${p.color.nombre}»`);
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return (
    <p role="status" className="rounded-md bg-ambar/10 px-3 py-2 text-xs leading-relaxed text-ambar-profundo">
      Se ve casi igual que {lista}. Si es el mismo color, usa ese: con dos nombres, la misma prenda termina registrada de
      dos formas. Si es otro, prueba un tono más distinto o guárdalo igual.
    </p>
  );
}


export function ColoresLista({ coloresIniciales, puedeEditar }: { coloresIniciales: Color[]; puedeEditar: boolean }) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [colores, setColores] = useState(() => ordenar(coloresIniciales));
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<Color | null>(null);
  const [cambiandoCodigo, setCambiandoCodigo] = useState<string | null>(null);
  const [aprobandoCodigo, setAprobandoCodigo] = useState<string | null>(null);
  // Rechazar abre un campo de motivo inline, no un modal — mismo peso visual
  // que el resto de acciones rápidas de esta pantalla (ADR-0095 de referencia).
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoCodigo, setRechazandoCodigo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // La familia de la píldora elegida (ADR-0261). La grilla solo se re-asienta cuando la persona cambia un filtro, nunca
  // al cargar la pantalla: el movimiento responde a una acción (ver globals.css).
  const [familia, setFamilia] = useState<string>("todas");
  const [animar, setAnimar] = useState(false);

  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  // Mientras nadie toque el código, sigue al nombre. Si la persona lo escribe,
  // deja de pisarlo; si lo borra por completo, vuelve a seguir al nombre.
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [familiaColor, setFamiliaColor] = useState<FamiliaColor>("neutro");
  // «Neutro» viene de fábrica: sin esto la guía nunca pasaría por el combo (un valor de fábrica ya cuenta como «lleno») y la
  // familia quedaría en Neutro sin que nadie la mirara. Elegir en el combo —aunque sea Neutro otra vez— es «ya la miré».
  const [familiaElegida, setFamiliaElegida] = useState(false);
  const [hex, setHex] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [pantone, setPantone] = useState("");
  const [sinonimos, setSinonimos] = useState("");

  const activos = colores.filter((c) => c.activo);
  const vocabularioPantone = new Map(colores.filter((c) => c.pantoneTcx).map((c) => [c.pantoneTcx!, c.nombre]));
  const desactivados = colores.filter((c) => !c.activo);
  const familiaDe = (c: Color) => (FAMILIAS_COLOR.some((f) => f.valor === c.familiaColor) ? c.familiaColor : "sin-familia");
  const pasaFamilia = (c: Color) => familia === "todas" || familiaDe(c) === familia;
  const activosVisibles = filtrarColores(activos, busqueda).filter(pasaFamilia);
  const desactivadosVisibles = filtrarColores(desactivados, busqueda).filter(pasaFamilia);
  const hayFiltros = familia !== "todas" || busqueda.trim() !== "";
  const quitarFiltros = () => {
    setFamilia("todas");
    setBusqueda("");
    setAnimar(true);
  };
  // Las píldoras: solo las familias que tienen algún color activo, en el orden del espectro (Neutro, Tierra, Rosado, Rojo…).
  const familiasConColores = gruposPorFamilia(activos);
  // Incluye los desactivados: el código es la clave primaria y sigue ocupado
  // aunque el color ya no se elija (cada SKU apunta a él).
  const codigosUsados = new Set(colores.map((c) => c.codigo));
  const dueñoDelCodigo = codigo.length === 3 ? colores.find((c) => c.codigo === codigo) : undefined;

  // Guía de foco de «Nuevo color» (CLAUDE.md «Guía de foco»): sale de lo que ya apaga «Guardar color». Notas y sinónimos son
  // opcionales y no entran; el Pantone solo es «requerido» cuando ya se escribió algo (mal escrito o repetido bloquea). La familia
  // es SUGERIDA, nunca un candado: ordena el color en la lista y en «Se ve casi igual que…», y «Neutro» de fábrica casi nunca es la
  // correcta para un color nuevo, así que la luz pasa por ella antes del tono.
  const pantoneEscrito = pantone.trim() !== "";
  const guia = useGuiaCampos([
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombre.trim() !== "", pendiente: "Escribe el nombre del color." },
    {
      id: "codigo",
      nombre: "Código",
      requerido: true,
      hecho: codigo.length === 3 && !dueñoDelCodigo,
      pendiente: dueñoDelCodigo ? `Ese código ya lo usa «${dueñoDelCodigo.nombre}»: cambia una letra.` : "Escribe las 3 letras del código.",
    },
    { id: "familia", nombre: "Familia", requerido: false, sugerido: true, hecho: familiaElegida, pendiente: "Elige la familia del color (ahora dice Neutro)." },
    {
      id: "pantone",
      nombre: "Pantone",
      requerido: pantoneEscrito,
      hecho: pantoneEscrito && !pantoneInvalido(pantone, vocabularioPantone),
      pendiente: "Corrige el Pantone (19-1557 TCX) o bórralo.",
    },
    { id: "color", nombre: "Tono del color", requerido: true, hecho: !!hex, pendiente: "Elige el tono del color." },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  const rechazandoColor = colores.find((c) => c.codigo === rechazandoAbierto) ?? null;

  function abrir() {
    setAgregando(true);
    setNombre("");
    setCodigo("");
    setCodigoTocado(false);
    setFamiliaColor("neutro");
    setFamiliaElegida(false);
    setHex(null);
    setNotas("");
    setPantone("");
    setSinonimos("");
  }

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre, codigo, familiaColor, hex, notas, pantoneTcx: pantone, sinonimos: normalizarSinonimos(sinonimos, nombre) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar el color.");
        return;
      }
      setColores((actual) =>
        ordenar([
          ...actual,
          {
            codigo: datos.color.codigo,
            nombre: datos.color.nombre,
            familiaColor: datos.color.familia_color,
            tipo: datos.color.tipo,
            hex: datos.color.hex,
            orden: 2000,
            activo: true,
            notas: datos.color.notas,
            estado: datos.color.estado,
            pantoneTcx: datos.color.pantone_tcx ?? null,
            sinonimos: datos.color.sinonimos ?? [],
          },
        ])
      );
      responsable.despues(null);
      avisar.exito(
        datos.color.estado === "pendiente" ? `${datos.color.nombre} agregado — ya lo puedes usar` : `Color ${datos.color.nombre} agregado`,
        datos.color.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  // Aprobar es de un solo clic, sin modal — el color ya está en uso desde
  // que se propuso, esto solo lo saca de la lista de pendientes. Si no sirve,
  // se rechaza (`rechazar`, abajo) — la base lo bloquea si ya hay una prenda con él.
  async function aprobar(c: Color) {
    setAprobandoCodigo(c.codigo);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ codigo: c.codigo, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar el color.");
        return;
      }
      setColores((actual) => ordenar(actual.map((x) => (x.codigo === c.codigo ? { ...x, estado: "aprobado" as const } : x))));
      avisar.exito(`${c.nombre} aprobado`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoCodigo(null);
    }
  }

  // Reactivar no pasa por el modal (mismo criterio que Proveedores): es una
  // sola acción, sin campos que llenar, y no hace falta el candado de
  // variantes que sí aplica al desactivar. Si el color estaba rechazado, el
  // mismo clic retira el rechazo (manda estado:'aprobado', que el trigger ya
  // deja también activo=true) — nunca queda "aprobado pero rechazado" a la
  // vez, ese estado imposible lo bloquea un CHECK en la base.
  async function reactivar(c: Color) {
    setCambiandoCodigo(c.codigo);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify(c.estado === "rechazado" ? { codigo: c.codigo, estado: "aprobado" } : { codigo: c.codigo, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar el color.");
        return;
      }
      setColores((actual) => ordenar(actual.map((x) => (x.codigo === c.codigo ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${c.nombre} reactivado`, { detalle: "Vuelve a aparecer al elegir color en una prenda." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoCodigo(null);
    }
  }

  // Rechazar solo es válido desde 'pendiente' (lo hace cumplir el trigger).
  // El motivo es opcional (ADR-0095 de referencia: "aprobar es de un clic
  // sin fricción, el mismo criterio aplica al espejo").
  async function rechazar(c: Color) {
    setRechazandoCodigo(c.codigo);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("color_rechazar") },
        body: JSON.stringify({ codigo: c.codigo, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar el color.");
        return;
      }
      setColores((actual) =>
        ordenar(actual.map((x) => (x.codigo === c.codigo ? { ...x, activo: false, estado: "rechazado" as const } : x)))
      );
      avisar.exito(`${c.nombre} rechazado`, { detalle: "Cae a Desactivados. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoCodigo(null);
    }
  }

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar colores"
        filtros={
          <>
            <BotonFiltro activo={familia === "todas"} onClick={() => { setFamilia("todas"); setAnimar(true); }} cuenta={activos.length}>
              Todos
            </BotonFiltro>
            {familiasConColores.map((g) => (
              <BotonFiltro
                key={g.familia}
                activo={familia === g.familia}
                onClick={() => { setFamilia(familia === g.familia ? "todas" : g.familia); setAnimar(true); }}
                cuenta={g.colores.length}
              >
                {g.texto}
              </BotonFiltro>
            ))}
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar color", placeholder: "Buscar color o código" }}
        agregar={{ texto: "+ Agregar color", onClick: abrir }}
      />

      {hayFiltros && activosVisibles.length + desactivadosVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {busqueda.trim() ? <>Ningún color coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ningún color cumple estos filtros."}
        </SinCoincidencias>
      )}

      <div key={familia} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {gruposPorFamilia(activosVisibles).map(({ familia: clave, texto, colores: coloresDeLaFamilia }) => (
          <section key={clave} className="space-y-3">
            <TituloGrupo punto="bg-tinta/25" cuenta={coloresDeLaFamilia.length}>
              {texto}
            </TituloGrupo>
            {partirEnGamas(coloresDeLaFamilia).map((gama, k) => (
              <div key={k} className={GRILLA_ATRIBUTOS}>
                {gama.map((c) => (
                  <TarjetaAtributo
                    key={c.codigo}
                    muestra={<Muestra hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />}
                    nombre={c.nombre}
                    notas={c.notas}
                    insignia={c.estado === "pendiente" ? "Pendiente" : null}
                    detalle={<DetalleColor c={c} />}
                  >
                    {puedeEditar && (
                      <>
                        {c.estado === "pendiente" && (
                          <BotonesPendiente
                            aprobando={aprobandoCodigo === c.codigo}
                            onAprobar={() => setConfirmando(confirmacionCatalogo("aprobar", c.nombre, () => aprobar(c)))}
                            onRechazar={() => {
                              setRechazandoAbierto(c.codigo);
                              setMotivoRechazo("");
                            }}
                          />
                        )}
                        {/* Desactivar un color vive dentro de Editar: antes de apagarlo se ve qué prendas lo usan. */}
                        <PieTarjeta>
                          <AccionTarjeta onClick={() => setEditando(c)}>Editar</AccionTarjeta>
                        </PieTarjeta>
                      </>
                    )}
                  </TarjetaAtributo>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>

      {agregando && (
        <Modal
          titulo="Nuevo color del vocabulario"
          subtitulo="Queda disponible de inmediato para cualquier prenda nueva o existente."
          ancho="max-w-md"
          onClose={() => setAgregando(false)}
        >
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              {/* Mismo agrupado que el modal de edición: cada campo ya reserva su línea de pie. */}
              <div className="space-y-1">
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <CampoGuiado id="nombre" guia={guia}>
                  <CampoTexto
                    etiqueta={guia.etiqueta("nombre", "Nombre")}
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      if (!codigoTocado) setCodigo(sugerirCodigoColor(e.target.value, codigosUsados));
                    }}
                    placeholder="Ej. Verde botella"
                    autoFocus
                  />
                  </CampoGuiado>
                  <CampoGuiado id="codigo" guia={guia}>
                  <CampoTexto
                    etiqueta={guia.etiqueta("codigo", "Código (3 letras)")}
                    mono
                    value={codigo}
                    maxLength={3}
                    onChange={(e) => {
                      const valor = normalizarCodigo(e.target.value);
                      setCodigo(valor);
                      setCodigoTocado(valor !== "");
                    }}
                    tono={dueñoDelCodigo ? "error" : undefined}
                    pie={dueñoDelCodigo ? `Ya lo usa «${dueñoDelCodigo.nombre}».` : codigo.length === 3 && !codigoTocado ? "Sugerido del nombre" : undefined}
                    placeholder="VEB"
                  />
                  </CampoGuiado>
                </div>
                <CampoGuiado id="familia" guia={guia}>
                  <CampoSelect
                    etiqueta={guia.etiqueta("familia", "Familia")}
                    valor={familiaColor}
                    onValor={(v) => {
                      setFamiliaColor(v);
                      setFamiliaElegida(true);
                    }}
                    opciones={FAMILIAS_COLOR}
                  />
                </CampoGuiado>
                <CampoTexto etiqueta="Notas" pie="Opcional, uso interno" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Proveedor de la tela, advertencias…" />
                <CampoGuiado id="pantone" guia={guia}>
                <CampoTexto
                  etiqueta={guia.etiqueta("pantone", "Pantone (TCX)")}
                  mono
                  pie={pieDePantone(pantone, vocabularioPantone)}
                  tono={pantoneInvalido(pantone, vocabularioPantone) ? "error" : undefined}
                  value={pantone}
                  onChange={(e) => setPantone(e.target.value)}
                  placeholder="19-1557 TCX"
                  autoComplete="off"
                />
                </CampoGuiado>
                <CampoTexto
                  etiqueta="Sinónimos"
                  pie="Opcional: cómo le dicen en tienda, separados por coma. El buscador los entiende."
                  value={sinonimos}
                  onChange={(e) => setSinonimos(e.target.value)}
                  placeholder="plomo, gris medio"
                />
              </div>
              <CampoGuiado id="color" guia={guia}>
                <SelectorColor hex={hex} onHex={setHex} etiqueta={guia.etiqueta("color", "Color")} />
              </CampoGuiado>
              <AvisoParecido hex={hex} familiaColor={familiaColor} vocabulario={activos} />

              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para guardar." />
              <div className="flex gap-2 pt-3">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton
                  type="button"
                  peso="primario"
                  onClick={guardar}
                  cargando={guardando}
                  disabled={!nombre.trim() || codigo.length !== 3 || !!dueñoDelCodigo || !hex || pantoneInvalido(pantone, vocabularioPantone) || !responsable.listo}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  className={`flex-1 ${guia.claseConfirmar}`}
                >
                  Guardar color
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {desactivadosVisibles.length > 0 && (
        <section className="space-y-3">
          <TituloGrupo cuenta={desactivadosVisibles.length}>Desactivados — ya no se pueden elegir en una prenda nueva</TituloGrupo>
          <div className={GRILLA_ATRIBUTOS}>
            {desactivadosVisibles.map((c) => (
              <TarjetaAtributo
                key={c.codigo}
                muestra={<Muestra hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />}
                nombre={c.nombre}
                insignia={c.estado === "rechazado" ? "Rechazado" : null}
                detalle={
                  <p className="flex justify-between gap-2 text-[11px] text-tinta/60">
                    <span className="font-mono">{c.codigo}</span>
                    <span>{textoDeFamilia(c.familiaColor)}</span>
                  </p>
                }
                apagada
              >
                {puedeEditar && (
                  <BotonReactivar
                    cambiando={cambiandoCodigo === c.codigo}
                    onClick={() => setConfirmando(confirmacionCatalogo("reactivar", c.nombre, () => reactivar(c)))}
                  />
                )}
              </TarjetaAtributo>
            ))}
          </div>
        </section>
      )}

      {rechazandoColor && (
        <Modal titulo={`Rechazar «${rechazandoColor.nombre}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoCodigo === rechazandoColor.codigo}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoCodigo === rechazandoColor.codigo}
                  onClick={() => rechazar(rechazandoColor)}
                >
                  Confirmar rechazo
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {editando && (
        <ColorEditarModal
          color={editando}
          vocabulario={activos}
          responsable={responsable}
          onClose={() => setEditando(null)}
          onGuardado={(actualizado) => {
            setColores((actual) => ordenar(actual.map((x) => (x.codigo === actualizado.codigo ? actualizado : x))));
            setEditando(null);
          }}
          onDesactivado={(codigoDesactivado) => {
            setColores((actual) => ordenar(actual.map((x) => (x.codigo === codigoDesactivado ? { ...x, activo: false } : x))));
            setEditando(null);
          }}
        />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edición: nombre, familia, hex, Pantone, sinónimos y notas. El orden ya no se edita: lo calcula la escala del color. El HEX arranca bloqueado detrás de
// "Cambiar color" a propósito — no es un candado técnico (nada en
// `movimientos`/`ventas` guarda una copia del hex; catálogo, inventario y
// producción lo resuelven en vivo desde `colores.hex`), es solo para que no
// se mueva sin querer al pasar por el formulario. Desactivar vive acá abajo,
// igual que en Proveedores: es una acción rara y semi-destructiva.
// ---------------------------------------------------------------------------
function ColorEditarModal({
  color,
  vocabulario,
  responsable,
  onClose,
  onGuardado,
  onDesactivado,
}: {
  color: Color;
  /** Los colores activos, para avisar si el tono se ve casi igual que otro. */
  vocabulario: Color[];
  /** El combo de la lista (ADR-0161): uno por pantalla, no uno por modal. */
  responsable: ControlResponsable;
  onClose: () => void;
  onGuardado: (actualizado: Color) => void;
  onDesactivado: (codigo: string) => void;
}) {
  const [nombre, setNombre] = useState(color.nombre);
  const [familiaColor, setFamiliaColor] = useState<FamiliaColor>((color.familiaColor as FamiliaColor) ?? "neutro");
  const [hex, setHex] = useState(color.hex ?? "#c9b79c");
  const [hexAbierto, setHexAbierto] = useState(false);
  const [notas, setNotas] = useState(color.notas ?? "");
  const [pantone, setPantone] = useState(color.pantoneTcx ?? "");
  const [sinonimos, setSinonimos] = useState(color.sinonimos.join(", "));
  // Los códigos Pantone de los OTROS colores: el propio no cuenta como ocupado.
  const vocabularioPantone = new Map(vocabulario.filter((c) => c.codigo !== color.codigo && c.pantoneTcx).map((c) => [c.pantoneTcx!, c.nombre]));
  const [guardando, setGuardando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);
  // Desactivar pide un segundo clic: el primero arma el botón, y si nadie
  // confirma en 4 s vuelve a su estado normal.
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);
  useEffect(() => {
    if (!confirmandoDesactivar) return;
    const t = setTimeout(() => setConfirmandoDesactivar(false), 4000);
    return () => clearTimeout(t);
  }, [confirmandoDesactivar]);

  // Guía de foco de «Editar color»: lo que ya apaga «Guardar» (nombre, Pantone) y quién firma. El color ya viene elegido.
  const pantoneEscrito = pantone.trim() !== "";
  const guia = useGuiaCampos([
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombre.trim() !== "", pendiente: "Escribe el nombre del color." },
    {
      id: "pantone",
      nombre: "Pantone",
      requerido: pantoneEscrito,
      hecho: pantoneEscrito && !pantoneInvalido(pantone, vocabularioPantone),
      pendiente: "Corrige el Pantone (19-1557 TCX) o bórralo.",
    },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ codigo: color.codigo, nombre, familiaColor, hex, notas, pantoneTcx: pantone, sinonimos: normalizarSinonimos(sinonimos, nombre) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar el color.");
        return;
      }
      responsable.despues(null);
      avisar.exito(`${datos.color.nombre} actualizado`);
      onGuardado({
        codigo: datos.color.codigo,
        nombre: datos.color.nombre,
        familiaColor: datos.color.familia_color,
        tipo: datos.color.tipo,
        hex: datos.color.hex,
        orden: datos.color.orden,
        activo: datos.color.activo,
        notas: datos.color.notas,
        estado: datos.color.estado,
        pantoneTcx: datos.color.pantone_tcx ?? null,
        sinonimos: datos.color.sinonimos ?? [],
      });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function desactivar() {
    setConfirmandoDesactivar(false);
    setDesactivando(true);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ codigo: color.codigo, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar el color.");
        return;
      }
      responsable.despues(null);
      avisar.exito(`${color.nombre} desactivado`, {
        detalle: "Deja de aparecer al elegir color en una prenda nueva; el historial se conserva.",
      });
      onDesactivado(color.codigo);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setDesactivando(false);
    }
  }

  const ocupado = guardando || desactivando;

  return (
    <Modal titulo={`Editar «${color.nombre}»`} ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          {/* Cada campo ya reserva su línea de pie; con space-y-4 encima los huecos
              quedaban el doble de grandes que los de Notas hacia abajo. */}
          <div className="space-y-1">
            <CampoGuiado id="nombre" guia={guia}>
              <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre")} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </CampoGuiado>
            <CampoSelect etiqueta="Familia" valor={familiaColor} onValor={setFamiliaColor} opciones={FAMILIAS_COLOR} />
            <CampoTexto etiqueta="Notas" pie="Opcional, uso interno" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Proveedor de la tela, advertencias…" />
            <CampoGuiado id="pantone" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("pantone", "Pantone (TCX)")}
              mono
              pie={pieDePantone(pantone, vocabularioPantone)}
              tono={pantoneInvalido(pantone, vocabularioPantone) ? "error" : undefined}
              value={pantone}
              onChange={(e) => setPantone(e.target.value)}
              placeholder="19-1557 TCX"
              autoComplete="off"
            />
            </CampoGuiado>
            <CampoTexto
              etiqueta="Sinónimos"
              pie="Opcional: cómo le dicen en tienda, separados por coma. El buscador los entiende."
              value={sinonimos}
              onChange={(e) => setSinonimos(e.target.value)}
              placeholder="plomo, gris medio"
            />
          </div>

          <div>
            {hexAbierto ? (
              <SelectorColor hex={hex} onHex={setHex} />
            ) : (
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Color</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <MuestraEditable hex={hex} />
                  <span className="font-mono text-xs uppercase text-tinta/65">{hex}</span>
                  <button type="button" onClick={() => setHexAbierto(true)} className="text-xs text-rojo hover:underline">
                    Cambiar color
                  </button>
                </div>
              </div>
            )}
            <p className="mt-1 text-xs text-tinta/55">Cambia el color en todas las pantallas al instante; no reescribe ventas pasadas.</p>
          </div>
          <AvisoParecido hex={hex} familiaColor={familiaColor} vocabulario={vocabulario} excluir={color.codigo} />

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={ocupado} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              onClick={guardar}
              cargando={guardando}
              disabled={!nombre.trim() || pantoneInvalido(pantone, vocabularioPantone) || ocupado || !responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar
            </Boton>
          </div>

          <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/55">
            ¿Ya no se usa este color?{" "}
            <button
              type="button"
              onClick={() => (confirmandoDesactivar ? desactivar() : setConfirmandoDesactivar(true))}
              disabled={ocupado || !responsable.listo}
              title={responsable.motivo ?? undefined}
              className={confirmandoDesactivar ? "font-medium text-rojo underline" : "text-rojo hover:underline"}
            >
              {desactivando ? "Desactivando…" : confirmandoDesactivar ? "¿Seguro? Confirmar" : "Desactivar color"}
            </button>
            . Se bloquea si todavía hay una prenda activa con este color.
          </p>
        </div>
      )}
    </Modal>
  );
}
