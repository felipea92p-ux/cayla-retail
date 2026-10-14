"use client";

import { useState } from "react";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { QuitarColor } from "@/components/orden-produccion/AgregarColor";
import { Aviso } from "@/components/ui/Aviso";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CampoMonto, CampoSelect, CampoTexto, type Opcion } from "@/components/ui/campos";
import { campoEtiqueta } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import {
  FASES,
  FIJO_MAXIMO,
  TARIFA_MAXIMA,
  avisoMinimo,
  faseDe,
  leerServicio,
  ordenarFases,
  proveedoresQueSirven,
  type FaseBorrador,
  type FaseClave,
  type Posicion,
  type ProblemaFase,
  type ProveedorServicio,
  type Quien,
  type ServicioLeido,
  type TarifaDeLista,
} from "@/lib/orden-fases-reglas";

// «Fases y quién las hace», el bloque de la hoja «Nueva orden de producción» (ADR-0400, decisiones 2, 3 y 5; «Pantallas» punto 3). Una FILA por
// fase en el orden de la ruta —Corte · Costura · Acabado siempre; Bordado, Estampado y Lavandería se encienden desde una línea de chips— y en cada
// fila la pregunta de siempre de la prueba ciega: ¿la hace el Taller o sale afuera, y a quién? Cuando sale afuera aparecen el proveedor (solo los
// que hacen servicios), la tarifa por prenda (precargada en gris desde su lista de precios), la cantidad mínima, la fecha prometida y, plegado, el
// fijo por orden (ponchado, matriz). Bordado y estampado dicen además si van sobre la pieza cortada o sobre la prenda armada.
//
// No tiene estado de negocio: el formulario es el dueño de `fases` (una fila por fase del catálogo, `fasesIniciales()`), lee las faltas con
// `problemasFases` y las pasa en `problemas`; acá solo se dibuja lo que dice `lib/orden-fases-reglas.ts` y se llama a `onFases` con la lista entera.
// Lo único propio es si el fijo por orden está desplegado. Las faltas se muestran BAJO su campo (ADR-0284): lo que falta por escribir va en el pie
// neutro (es un camino, no un error) y lo que está mal escrito —una tarifa con coma, una fecha pasada— en rojo. La cantidad mínima del servicio
// solo avisa (`avisoMinimo`): la base no bloquea (decisión 5).

const OPCIONES_QUIEN = [
  { clave: "taller", etiqueta: "Taller" },
  { clave: "servicio", etiqueta: "Afuera" },
];

const OPCIONES_POSICION = [
  { clave: "pieza", etiqueta: "Sobre pieza" },
  { clave: "prenda", etiqueta: "Sobre prenda" },
];

/** Qué significa cada posición, en una frase, al lado del segmento (ley 6 de Formidable: lo difícil a la vista, no solo al pasar el mouse). */
const AYUDA_POSICION: Record<Posicion, string> = {
  pieza: "antes de coser, sobre la pieza cortada",
  prenda: "ya armada, después de coser",
};

/** Bajo qué campo se dice cada falta. `fila`: ninguna caja la explica (se dice en una línea aparte). */
type Lugar = "proveedor" | "tarifa" | "fijo" | "minimo" | "fecha" | "fila";

/**
 * `fase_tarifa_invalida` lo emite `problemasFases` por la tarifa, el fijo o la cantidad mínima, en el orden en que la base los mira; aquí se
 * repite ese mismo orden sobre la lectura (`leerServicio`) para llevar la frase al campo que la provocó.
 */
function lugarDe(p: ProblemaFase, s: ServicioLeido | null): Lugar {
  switch (p.hint) {
    case "fase_sin_proveedor":
    case "fase_proveedor_inactivo":
    case "fase_proveedor_rubro":
      return "proveedor";
    case "fase_sin_tarifa":
      return "tarifa";
    case "fase_tarifa_invalida": {
      if (!s) return "tarifa";
      if (s.tarifa.tipo === "coma" || s.tarifa.tipo === "invalido") return "tarifa";
      if (s.fijo.tipo === "coma" || s.fijo.tipo === "invalido") return "fijo";
      if (s.minimo.tipo === "invalido") return "minimo";
      if (s.tarifaPrenda !== null && s.tarifaPrenda > TARIFA_MAXIMA) return "tarifa";
      if (s.fijo.tipo === "negativo" || s.fijoOrden > FIJO_MAXIMO) return "fijo";
      if (s.cantidadMinima !== null && s.cantidadMinima <= 0) return "minimo";
      return "tarifa";
    }
    case "fase_fecha_invalida":
    case "fase_fecha_pasada":
      return "fecha";
    case "fase_sin_posicion":
      return "fila";
  }
}

/** Una falta que todavía no se escribió es un camino (pie neutro); una que se escribió mal es un error (rojo). Sin rojo salvo el error real. */
function esFalta(p: ProblemaFase, fase: FaseBorrador): boolean {
  return p.hint === "fase_sin_proveedor" || (p.hint === "fase_sin_tarifa" && fase.tarifa.trim() === "") || p.hint === "fase_sin_posicion";
}

const dosDecimales = (n: number) => n.toFixed(2);

export type PropsFasesDeLaOrden = {
  /** Una fila por fase del catálogo (`fasesIniciales()`), apagadas incluidas. */
  fases: FaseBorrador[];
  onFases: (fases: FaseBorrador[]) => void;
  /** El directorio del Taller: acá se filtran los que hacen servicios (`proveedoresQueSirven`). */
  proveedores: ProveedorServicio[];
  /** La lista de precios de los proveedores: sugiere la tarifa, el mínimo y el fijo. */
  tarifas: TarifaDeLista[];
  /** Cuántas prendas lleva la orden hoy: con él se avisa la cantidad mínima del servicio. */
  totalPrendas: number;
  /** `aaaa-mm-dd` de Lima. */
  hoy: string;
  guia: GuiaCampos;
  /** Lo que dijo `problemasFases` (el formulario lo calcula una vez y lo comparte con su guía de foco). */
  problemas: ProblemaFase[];
};

export function FasesDeLaOrden({ fases, onFases, proveedores, tarifas, totalPrendas, hoy, guia, problemas }: PropsFasesDeLaOrden) {
  const sirven = proveedoresQueSirven(proveedores);
  const opcionesProveedor: Opcion<string>[] = sirven.map((p) => ({ valor: p.id, texto: p.nombre }));
  const encendidas = ordenarFases(fases).filter((f) => f.encendida || faseDe(f.clave).siempre);
  // Las que se pueden encender, en el orden del catálogo (Bordado · Estampado · Lavandería), no en el de la ruta.
  const apagadas = FASES.filter((def) => !def.siempre && !fases.some((f) => f.clave === def.clave && f.encendida));
  const sinServicios = opcionesProveedor.length === 0 && encendidas.some((f) => f.quien === "servicio");

  function cambiar(clave: FaseClave, parche: Partial<FaseBorrador>) {
    onFases(fases.map((f) => (f.clave === clave ? { ...f, ...parche } : f)));
  }
  /** Enciende una fase opcional. Si el formulario no trajo su fila (solo las de la espina), nace aquí como la haría `fasesIniciales()`. */
  function encender(clave: FaseClave) {
    if (fases.some((f) => f.clave === clave)) cambiar(clave, { encendida: true });
    else
      onFases([
        ...fases,
        { clave, encendida: true, quien: "taller", proveedorId: null, tarifa: "", fijo: "", minimo: "", fechaPrometida: "", posicion: faseDe(clave).posicionable ? "pieza" : null },
      ]);
  }

  return (
    <section aria-label="Fases y quién las hace" data-guia="prod-orden-nueva.fases">
      {/* `retiene="fila"`: el bloque tiene varios controles; la luz de la guía espera mientras la persona siga eligiendo dentro de él. */}
      <CampoGuiado id="fases" guia={guia} retiene="fila" className="space-y-2">
        <span className={`${campoEtiqueta} block`}>{guia.etiqueta("fases", "Fases y quién las hace")}</span>
        <div className="divide-y divide-sand rounded-2xl border border-sand bg-crema">
          {encendidas.map((fase) => (
            <FilaFase
              key={fase.clave}
              fase={fase}
              totalPrendas={totalPrendas}
              hoy={hoy}
              tarifas={tarifas}
              proveedores={proveedores}
              opcionesProveedor={opcionesProveedor}
              problemas={problemas.filter((p) => p.clave === fase.clave)}
              onCambiar={(parche) => cambiar(fase.clave, parche)}
              onApagar={() => cambiar(fase.clave, { encendida: false })}
            />
          ))}
          {apagadas.length > 0 && (
            <div role="group" aria-label="Fases que se pueden agregar" className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
              <span className="text-[12.5px] text-tinta/70">Si la orden también lleva</span>
              {apagadas.map((def) => (
                <ChipOpcion key={def.clave} elegido={false} onClick={() => encender(def.clave)}>
                  {def.nombre}
                </ChipOpcion>
              ))}
            </div>
          )}
        </div>
        {sinServicios && (
          <Aviso tono="info" chico>
            Todavía no hay proveedores de servicio en el directorio del Taller. Regístralos en Abastecimiento ▸ Proveedores y vuelve.
          </Aviso>
        )}
      </CampoGuiado>
    </section>
  );
}

function FilaFase({
  fase,
  totalPrendas,
  hoy,
  tarifas,
  proveedores,
  opcionesProveedor,
  problemas,
  onCambiar,
  onApagar,
}: {
  fase: FaseBorrador;
  totalPrendas: number;
  hoy: string;
  tarifas: TarifaDeLista[];
  proveedores: ProveedorServicio[];
  opcionesProveedor: Opcion<string>[];
  problemas: ProblemaFase[];
  onCambiar: (parche: Partial<FaseBorrador>) => void;
  onApagar: () => void;
}) {
  const def = faseDe(fase.clave);
  const nombreEnFrase = def.nombre.toLocaleLowerCase("es");
  const servicio = fase.quien === "servicio";
  const lectura = servicio ? leerServicio(fase, tarifas, hoy) : null;
  const sugerida = lectura?.sugerida ?? null;
  // El fijo por orden vive plegado: casi ningún servicio lo cobra. Se despliega al tocar el enlace, si ya trae algo escrito o si la base lo rechazó.
  const [fijoDesplegado, setFijoDesplegado] = useState(false);
  const aviso = avisoMinimo(fase, totalPrendas, tarifas, { hoy, proveedores });

  // La primera falta de cada campo va en su pie; las que ninguna caja explica, en una línea aparte.
  const pies = new Map<Lugar, { pie: string; tono: "neutro" | "error" }>();
  const sueltos: ProblemaFase[] = [];
  for (const p of problemas) {
    const lugar = lugarDe(p, lectura);
    if (lugar === "fila") sueltos.push(p);
    else if (!pies.has(lugar)) pies.set(lugar, { pie: p.texto, tono: esFalta(p, fase) ? "neutro" : "error" });
  }
  const pieDe = (lugar: Lugar, porDefecto?: string): { pie?: string; tono: "neutro" | "error" } => pies.get(lugar) ?? { pie: porDefecto, tono: "neutro" };
  const verFijo = fijoDesplegado || fase.fijo.trim() !== "" || pies.has("fijo");

  // Un proveedor elegido que ya no sirve (se desactivó, cambió de rubro) se sigue viendo con su nombre, pero no se puede volver a elegir.
  const elegidoFuera = fase.proveedorId && !opcionesProveedor.some((o) => o.valor === fase.proveedorId) ? proveedores.find((p) => p.id === fase.proveedorId) : null;
  const opciones: Opcion<string>[] = elegidoFuera ? [{ valor: elegidoFuera.id, texto: `${elegidoFuera.nombre} · ya no hace servicios`, deshabilitada: true }, ...opcionesProveedor] : opcionesProveedor;

  const tarifaVacia = fase.tarifa.trim() === "";
  const pieTarifa = sugerida ? (tarifaVacia ? "de su lista de precios" : `su lista dice S/ ${dosDecimales(sugerida.tarifa)}`) : "sin IGV";
  const minimoVacio = fase.minimo.trim() === "";
  const pieMinimo = sugerida?.minimo != null && minimoVacio ? "de su lista de precios" : "desde cuántas prendas cobra";
  const idBase = `fase-${fase.clave}`;

  return (
    <div className="space-y-3 px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[17px] leading-tight text-tinta">
            {def.nombre}
            {/* La misma × de una fila de color (A2): apagar una fase opcional no borra lo escrito en ella; si vuelve a encenderse, reaparece. */}
            {!def.siempre && <QuitarColor nombre={def.nombre} onQuitar={onApagar} />}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/65">{def.ayuda}</p>
        </div>
        <SegmentoDeslizante
          etiqueta={`Quién hace ${nombreEnFrase}`}
          valor={fase.quien}
          onCambio={(v) => onCambiar({ quien: v === "servicio" ? "servicio" : ("taller" satisfies Quien) })}
          opciones={OPCIONES_QUIEN}
        />
      </div>

      {def.posicionable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <SegmentoDeslizante
            etiqueta={`Dónde va el ${nombreEnFrase}`}
            valor={fase.posicion ?? "pieza"}
            onCambio={(v) => onCambiar({ posicion: v === "prenda" ? "prenda" : ("pieza" satisfies Posicion) })}
            opciones={OPCIONES_POSICION}
          />
          <span className="text-[12.5px] text-tinta/70">{AYUDA_POSICION[fase.posicion ?? "pieza"]}</span>
        </div>
      )}

      {servicio && (
        <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
          <CampoSelect
            id={`${idBase}-proveedor`}
            etiqueta="Proveedor"
            valor={fase.proveedorId ?? ""}
            onValor={(v) => onCambiar({ proveedorId: v || null })}
            opciones={opciones}
            marcador={opcionesProveedor.length === 0 ? "Sin proveedores de servicio" : "Elegir a quién"}
            deshabilitado={opciones.length === 0}
            {...pieDe("proveedor")}
          />
          <CampoMonto
            id={`${idBase}-tarifa`}
            etiqueta="Por prenda"
            inputMode="decimal"
            placeholder={sugerida ? dosDecimales(sugerida.tarifa) : "0.00"}
            value={fase.tarifa}
            onChange={(e) => onCambiar({ tarifa: e.target.value })}
            {...pieDe("tarifa", pieTarifa)}
          />
          <CampoTexto
            id={`${idBase}-minimo`}
            etiqueta="Cantidad mínima"
            mono
            inputMode="numeric"
            placeholder={sugerida?.minimo != null ? String(sugerida.minimo) : ""}
            value={fase.minimo}
            onChange={(e) => onCambiar({ minimo: e.target.value })}
            {...pieDe("minimo", pieMinimo)}
          />
          <CampoFecha
            id={`${idBase}-fecha`}
            etiqueta="Prometido para"
            valor={fase.fechaPrometida}
            onValor={(iso) => onCambiar({ fechaPrometida: iso })}
            {...pieDe("fecha", "opcional · cuándo lo devuelve")}
          />
          <div className="sm:col-span-2">
            {verFijo ? (
              <CampoMonto
                id={`${idBase}-fijo`}
                etiqueta="Fijo por orden"
                inputMode="decimal"
                placeholder={sugerida && sugerida.fijo > 0 ? dosDecimales(sugerida.fijo) : "0.00"}
                value={fase.fijo}
                onChange={(e) => onCambiar({ fijo: e.target.value })}
                {...pieDe("fijo", sugerida && sugerida.fijo > 0 && fase.fijo.trim() === "" ? "de su lista de precios" : "una sola vez por orden: ponchado del bordado, matriz del estampado")}
              />
            ) : (
              <button type="button" onClick={() => setFijoDesplegado(true)} className="btn-cayla btn-enlace text-[12.5px]">
                + fijo por orden (ponchado, matriz)
              </button>
            )}
          </div>
        </div>
      )}

      {aviso && (
        <Aviso tono="atencion" chico>
          {aviso}
        </Aviso>
      )}
      {sueltos.map((p) => (
        <Aviso key={p.hint} tono="error" chico>
          {p.texto}
        </Aviso>
      ))}
    </div>
  );
}
