"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto, Interruptor } from "@/components/ui/campos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { ExisteTambien, faltaPorExistente, useExisteTambien } from "@/components/ui/ExisteTambien";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { existentesParecidos } from "@/lib/atributo-parecido";
import { claveTexto } from "@/lib/nombres-parecidos";
import { sugerirNombreCasilla } from "@/lib/sugerencias-casillas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import type { ControlResponsable } from "@/lib/useResponsable";
import {
  AYUDA_CASILLA_MAX,
  DE_DONDE_SALE,
  NOMBRE_CASILLA_MAX,
  PUNTOS_MAX,
  problemaDeCasilla,
  type Casilla,
  type ReglasDePrecio,
} from "@/lib/margen-por-rasgos";

// Configuración ▸ Precios (ADR-0700, 20261124201000): la hoja que agrega una casilla a «¿Qué tiene esta prenda?» o cambia una que ya está
// (su nombre, su ayuda, cuánto suma y si está prendida). Solo un Admin la abre; la base lo vuelve a exigir.
//
// CONTRATO. PROMETE: guarda con `guardar_casilla_de_precio`, firmada por el responsable, y entrega lo que la base devuelve (la regla entera,
//   con las prendidas y las apagadas). Una casilla nueva se marca a mano y va al final de la lista; su código lo pone la base. Lo que la base
//   rechaza para un campo va bajo ese campo. ASUME: `reglas` y `apagadas` son las de la pantalla (para «Existe también» y el tope de 75 %).
//   NO HACE: no borra (una casilla se apaga: las prendas guardan su código) ni cambia de dónde sale una casilla.

export type CasillaEnHoja = Casilla & { activa: boolean };

export function CasillaDePrecioModal({
  casilla,
  reglas,
  apagadas,
  responsable,
  onCerrar,
  alGuardar,
}: {
  /** `null`: una casilla nueva. */
  casilla: CasillaEnHoja | null;
  reglas: ReglasDePrecio;
  apagadas: readonly Casilla[];
  responsable: ControlResponsable;
  onCerrar: () => void;
  /** Lo que devolvió la base (`fn_reglas_de_precio`). */
  alGuardar: (data: unknown, aviso: string) => void;
}) {
  const nueva = casilla === null;
  const [nombre, setNombre] = useState(casilla?.nombre ?? "");
  const [ayuda, setAyuda] = useState(casilla?.ayuda ?? "");
  const [puntos, setPuntos] = useState(String(casilla?.puntos ?? 3));
  const [activa, setActiva] = useState(casilla?.activa ?? true);
  const [guardando, setGuardando] = useState(false);

  const todas = [...reglas.casillas, ...apagadas];
  // «Existe también» (ADR-0576): al editar, solo si cambió el nombre; las apagadas cuentan (la base rechaza un nombre que ya está).
  const nombreCambio = nueva || claveTexto(nombre) !== claveTexto(casilla.nombre);
  const existe = useExisteTambien(
    nombre,
    nombreCambio ? existentesParecidos(nombre, todas.map((c) => ({ id: c.codigo, nombre: c.nombre, activo: reglas.casillas.includes(c) })), { excluirId: casilla?.codigo }) : [],
  );
  const faltaExiste = faltaPorExistente("casilla", nombre, existe);
  const n = /^\d{1,2}$/.test(puntos.trim()) ? Number(puntos.trim()) : NaN;
  const problema = problemaDeCasilla(reglas, { codigo: casilla?.codigo ?? null, nombre, ayuda, puntos: n, activa });
  const problemaNombre = problema?.startsWith("El nombre") || problema?.startsWith("Ya hay") ? problema : null;
  const problemaAyuda = problema?.startsWith("La ayuda") ? problema : null;
  const problemaPuntos = problema && !problemaNombre && !problemaAyuda ? problema : null;
  const campos = [
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: problemaNombre === null && !existe.bloquea, pendiente: faltaExiste ?? problemaNombre ?? "Escribe el nombre de la casilla." },
    { id: "ayuda", nombre: "Cómo reconocerla", requerido: false, hecho: problemaAyuda === null, pendiente: problemaAyuda ?? "" },
    { id: "puntos", nombre: "Cuánto suma", requerido: true, hecho: problemaPuntos === null, pendiente: problemaPuntos ?? `De 0 a ${PUNTOS_MAX} %.` },
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace el cambio." },
  ];
  const guia = useGuiaCampos(campos);
  const ejemplo = sugerirNombreCasilla(todas);

  async function guardar() {
    if (!sePuedeConfirmar(campos)) return;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc(
        "guardar_casilla_de_precio" as never,
        { p_codigo: casilla?.codigo ?? null, p_nombre: nombre, p_ayuda: ayuda.trim() === "" ? null : ayuda, p_puntos: n, p_activa: activa } as never,
      ) as never,
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      const e = error as { message?: string; hint?: string | null };
      const campo = e.hint === "casilla_nombre" || e.hint === "casilla_repetida" ? "nombre" : e.hint === "casilla_ayuda" ? "ayuda" : e.hint === "casilla_puntos" || e.hint === "casilla_tope" ? "puntos" : null;
      if (campo && e.message) guia.marcarError(campo, e.message);
      else avisar.error(traducirError(error as never, "guardar la casilla"));
      return;
    }
    const limpio = nombre.replace(/\s+/g, " ").trim();
    alGuardar(data, nueva ? `«${limpio}» ya aparece en las prendas.` : activa ? `«${limpio}»: guardada.` : `«${limpio}»: apagada, ya no suma.`);
    onCerrar();
  }

  return (
    <Modal
      titulo={nueva ? "Nueva casilla" : "Editar casilla"}
      subtitulo={nueva ? "La marca quien compra; suma a su margen." : DE_DONDE_SALE[casilla.origen]}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          onKeyDown={enterNoGuarda}
          className="space-y-4"
          data-guia="config.casilla-hoja"
        >
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("nombre", "Nombre")}
              maxLength={NOMBRE_CASILLA_MAX}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={ejemplo.texto}
              autoFocus={nueva}
            />
          </CampoGuiado>
          <ExisteTambien que="casilla" nombre={nombre} estado={existe} si={(o) => ({ texto: `Ver ${o.nombre}`, onClick: cerrar })} deshabilitado={guardando} />
          <CampoGuiado id="ayuda" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("ayuda", "Cómo reconocerla · opcional")}
              maxLength={AYUDA_CASILLA_MAX}
              value={ayuda}
              onChange={(e) => setAyuda(e.target.value)}
              pie="Sale en su «?» junto a la casilla."
            />
          </CampoGuiado>
          <CampoGuiado id="puntos" guia={guia} titulo="Cuánto suma al margen">
            <PasoCantidad
              menos={{ onClick: () => setPuntos(String(Math.max(0, (Number.isNaN(n) ? 0 : n) - 1))), deshabilitado: n <= 0, etiqueta: "Un % menos" }}
              mas={{ onClick: () => setPuntos(String(Math.min(PUNTOS_MAX, (Number.isNaN(n) ? 0 : n) + 1))), deshabilitado: n >= PUNTOS_MAX, etiqueta: "Un % más" }}
              campo={{ value: puntos, inputMode: "numeric", maxLength: 2, onChange: (e) => setPuntos(e.target.value), "aria-label": "Cuánto % suma", style: { width: `${Math.max(1, puntos.length)}ch` } }}
              sufijo="%"
              tono={problemaPuntos ? "error" : undefined}
            />
          </CampoGuiado>
          {!nueva && (
            <Interruptor
              activo={activa}
              onActivo={setActiva}
              etiqueta="Prendida"
              pie={activa ? undefined : "Deja de sumar; vuelve si la prendes."}
              disabled={guardando}
            />
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo={nueva ? "Todo listo para agregar." : "Todo listo para guardar."} />
          <div className="pie-acciones pie-hoja-fijo">
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {nueva ? "Agregar casilla" : "Guardar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
