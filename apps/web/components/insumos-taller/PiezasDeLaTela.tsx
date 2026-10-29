"use client";

import { useState } from "react";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Campo, CampoTexto, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { proponerValorVocabulario } from "@/lib/alta-producto-ejes";
import { CANTIDAD_ILEGIBLE, type CompraDeTela } from "@/lib/insumos-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import {
  COMPRAS,
  MENSAJE_ANCHO,
  MENSAJE_GRAMAJE,
  anchoFueraDeRango,
  avisosDeTelaNueva,
  gramajeFueraDeRango,
  numeroMalEscrito,
  rindeEscrito,
  type DatosDeLaTela,
} from "@/lib/tela-nueva-reglas";

// Las piezas que «Nueva tela» y «Editar tela» comparten (ADR-0554, actividad 3): el tejido y la composición, y cómo se compra la tela con su merma. Una sola forma de dibujarlas y de avisar lo que no tiene sentido:
// quien edita una tela ve exactamente los mismos campos, en el mismo orden y con los mismos avisos que cuando la creó. Cada hoja pone su título, su guía de foco (`data-guia`) y su botón.

/** Los tejidos que se pueden elegir y el crear uno nuevo ahí mismo (es el mismo vocabulario de Catálogo: nace aprobado, lo cree quien lo cree, ADR-0534). */
export function useTejidosDeLaTela(iniciales: { id: string; nombre: string }[], responsable: ControlResponsable) {
  const [tejidos, setTejidos] = useState(iniciales);
  async function crearTejido(texto: string, alCrear: (id: string) => void) {
    const limpio = texto.trim();
    if (!limpio) return;
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige primero quién lo anota.");
      return;
    }
    const { valor, error } = await proponerValorVocabulario("tejidos", limpio, responsable.encabezados());
    if (error || !valor) {
      avisar.error(error ?? "No se pudo crear el tejido.");
      return;
    }
    setTejidos((ts) => [...ts, { id: valor.id, nombre: valor.texto }].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    alCrear(valor.id);
    avisar.exito(`Tejido «${valor.texto}» creado`, { detalle: "Ya está en la lista de Catálogo." });
  }
  return { tejidos, crearTejido };
}

/** El tejido (si no está en la lista, se crea ahí mismo) y la composición, lado a lado. */
export function TejidoYComposicion({
  guia,
  tejidos,
  leyoVocabulario,
  tejidoId,
  onTejido,
  onCrearTejido,
  composicion,
  onComposicion,
}: {
  guia: GuiaCampos;
  tejidos: { id: string; nombre: string }[];
  /** `false`: los tejidos no se pudieron leer; la hoja lo dice. */
  leyoVocabulario: boolean;
  tejidoId: string;
  onTejido: (id: string) => void;
  onCrearTejido: (texto: string) => void;
  composicion: string;
  onComposicion: (texto: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CampoGuiado id="tejido" guia={guia}>
        <Campo etiqueta={guia.etiqueta("tejido", "Tejido")} sinPie>
          {leyoVocabulario ? (
            <ComboBuscable
              valor={tejidoId}
              onValor={onTejido}
              opciones={tejidos.map((t) => ({ valor: t.id, texto: t.nombre }))}
              marcador="Busca o escribe el tejido"
              etiquetaAccesible="Tejido de la tela"
              crear={{ etiqueta: (t) => `+ Crear el tejido «${t.trim()}»`, onCrear: onCrearTejido, pista: "¿Es nuevo? Escribe su nombre arriba" }}
            />
          ) : (
            <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">No se pudieron cargar los tejidos. Cierra esta ventana y vuelve a abrirla; lo demás se puede guardar igual.</p>
          )}
        </Campo>
      </CampoGuiado>
      <CampoGuiado id="composicion" guia={guia}>
        <CampoTexto
          etiqueta={guia.etiqueta("composicion", "Composición")}
          pie="Sale en la etiqueta de la prenda."
          value={composicion}
          onChange={(ev) => onComposicion(ev.target.value)}
          maxLength={160}
          placeholder="Escribe lo que dice la etiqueta del proveedor"
        />
      </CampoGuiado>
    </div>
  );
}

/** Cómo se compra la tela (metro, kilo con su ancho abierto y gramaje, rollo con sus metros), lo que avisa si los números no tienen sentido y la merma. */
export function CompraDeLaTela({
  guia,
  datos,
  onCompra,
  onAncho,
  onGramaje,
  onMetrosPorRollo,
  onMerma,
  avisoDeCompra = false,
}: {
  guia: GuiaCampos;
  datos: DatosDeLaTela;
  /** Al cambiar la forma de compra: la hoja decide qué hace con lo ya escrito (la de «Nueva tela» vacía las cantidades de sus colores). */
  onCompra: (nueva: CompraDeTela) => void;
  onAncho: (texto: string) => void;
  onGramaje: (texto: string) => void;
  onMetrosPorRollo: (texto: string) => void;
  onMerma: (texto: string) => void;
  /** «Cambiaste cómo la compras…»: las cantidades que estaban escritas se vaciaron. */
  avisoDeCompra?: boolean;
}) {
  const { compra, ancho, gramaje, metrosPorRollo, merma } = datos;
  // El rango (20–400 cm, 30–1500 g/m²) se reclama al SALIR del campo, no mientras se teclea: al escribir «160» el «1» y el «16» ya están «fuera de rango» y la caja se pondría roja a media palabra.
  const [salio, setSalio] = useState({ ancho: false, gramaje: false });
  const anchoMal = numeroMalEscrito(ancho) || (salio.ancho && anchoFueraDeRango(ancho));
  const gramajeMal = numeroMalEscrito(gramaje) || (salio.gramaje && gramajeFueraDeRango(gramaje));
  const rinde = rindeEscrito(datos);
  const avisosBlandos = avisosDeTelaNueva(datos);
  return (
    <>
      <CampoGuiado id="compra" guia={guia}>
        <Segmentado etiqueta={guia.etiqueta("compra", "Se compra")} valor={compra} onValor={onCompra} opciones={COMPRAS} pie="El stock de la tela va siempre en metros; el kilo y el rollo se convierten." />
        {compra === "kilo" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CampoTexto
              etiqueta="Ancho abierto (cm)"
              inputMode="decimal"
              value={ancho}
              onChange={(ev) => onAncho(ev.target.value)}
              onBlur={() => setSalio((s) => ({ ...s, ancho: true }))}
              placeholder="160"
              tono={anchoMal ? "error" : undefined}
              pie={numeroMalEscrito(ancho) ? CANTIDAD_ILEGIBLE : anchoMal ? MENSAJE_ANCHO : "Si viene en tubo, el abierto es el doble del tubo plano."}
            />
            <CampoTexto
              etiqueta="Gramaje (g/m²)"
              inputMode="decimal"
              value={gramaje}
              onChange={(ev) => onGramaje(ev.target.value)}
              onBlur={() => setSalio((s) => ({ ...s, gramaje: true }))}
              placeholder="180"
              tono={gramajeMal ? "error" : undefined}
              pie={numeroMalEscrito(gramaje) ? CANTIDAD_ILEGIBLE : gramajeMal ? MENSAJE_GRAMAJE : undefined}
            />
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-tinta/65">Rinde</p>
              <p className="flex h-12 items-center rounded-lg bg-hueso px-3 text-[14px] text-tinta">
                {rinde === null ? "Falta el ancho y el gramaje" : `≈ ${rinde.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m por kilo`}
              </p>
            </div>
          </div>
        )}
        {compra === "rollo" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CampoTexto
              etiqueta="¿Cuántos metros trae un rollo?"
              inputMode="decimal"
              value={metrosPorRollo}
              onChange={(ev) => onMetrosPorRollo(ev.target.value)}
              placeholder="80"
              tono={numeroMalEscrito(metrosPorRollo) ? "error" : undefined}
              pie={numeroMalEscrito(metrosPorRollo) ? CANTIDAD_ILEGIBLE : "Lo habitual; al recibir lo corriges si un rollo trae otra medida."}
            />
          </div>
        )}
      </CampoGuiado>
      {avisoDeCompra && (
        <Aviso tono="atencion" chico>
          Cambiaste cómo la compras: lo que habías escrito en «¿Ya tienes?» y en el costo estaba en la otra unidad. Vuelve a escribirlo.
        </Aviso>
      )}
      {avisosBlandos.map((t) => (
        <Aviso key={t} tono="atencion" chico>
          {t}
        </Aviso>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoGuiado id="merma" guia={guia}>
          <CampoTexto etiqueta={guia.etiqueta("merma", "Merma al cortar (%)")} pie="Lo que se pierde de cada corte" inputMode="decimal" placeholder="0" value={merma} onChange={(ev) => onMerma(ev.target.value)} />
        </CampoGuiado>
      </div>
    </>
  );
}
