"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ConNumero, Control, FotoConMarcas, ListaAbierta, Renglon, RutaDeClics, Ventana, type Marca } from "@/components/GuiaImpresionVisuales";
import { MEDIDAS, sistemaDelEquipo, type Sistema } from "@/lib/guia-impresion-reglas";

/* ====================================================================
   Guía de impresión de etiquetas (ADR-0180, «Guía de impresión», 2026-09-26)

   Reemplaza la nota larga del pie de Etiquetas de precio. Esa nota estaba escrita para Mac, en Windows decía lo contrario
   de lo que funcionó (el diálogo de Chrome, no el del sistema) y no nombraba Longitud, Orientación ni el corte, que fueron
   justo los tres ajustes que lo arreglaron. Aquí cada sistema tiene su camino, un paso por pantalla, y cada clic lleva un
   número sobre la imagen. El último paso es el diagnóstico: «sale chica / larga / girada» te devuelve al paso que lo arregla.
   ==================================================================== */

const { anchoRollo, largoCorte, largoCorteTexto, escala } = MEDIDAS;
const PAPEL = `${anchoRollo} × ${largoCorteTexto} mm`;
const NOMBRE_PAPEL_MAC = `CAYLA ${anchoRollo} x ${largoCorteTexto}`;
const NOMBRE_PREAJUSTE_MAC = "Etiquetas CAYLA";

type Accion = { marca?: number; texto: ReactNode };
/** Un síntoma del diagnóstico final: lo que se ve en la etiqueta, qué lo arregla y a qué paso volver. */
type Sintoma = { sintoma: string; arreglo: ReactNode; paso: number };
type Paso = {
  titulo: string;
  /** Lo que se ve a la izquierda: foto o maqueta, con los números de `acciones`. */
  visual: (r: { activa: number | null; onActiva: (n: number | null) => void }) => ReactNode;
  acciones: Accion[];
  porQue?: ReactNode;
  ojo?: ReactNode;
  sintomas?: Sintoma[];
};

const b = (t: ReactNode) => <b className="font-semibold text-tinta">{t}</b>;

/* ---------- Las fotos de la tienda (medidas en % sobre el recorte de public/guia-impresion/) ---------- */

const FOTO_AJUSTES = { src: "/guia-impresion/windows-ajustes-impresora.webp", ancho: 900, alto: 670 };
const FOTO_BROTHER = { src: "/guia-impresion/windows-preferencias-brother.webp", ancho: 820, alto: 730 };
const FOTO_CHROME = { src: "/guia-impresion/windows-dialogo-chrome.webp", ancho: 900, alto: 640 };
const FOTO_ETIQUETA = { src: "/guia-impresion/etiqueta-bien-impresa.webp", ancho: 520, alto: 790 };

// Cada número va en un hueco al lado de su rótulo o control (nunca encima): no tapa lo que hay que leer ni la casilla a marcar.
const MARCAS_AJUSTES: Marca[] = [
  { n: 3, x: 4.2, y: 34.8 },
  { n: 5, x: 30, y: 67.5 },
];
const MARCAS_BROTHER: Marca[] = [
  { n: 1, x: 73, y: 21.2 },
  { n: 2, x: 50.6, y: 31.6 },
  { n: 3, x: 65.5, y: 40.7 },
  { n: 4, x: 68.5, y: 58.6 },
  { n: 5, x: 70.5, y: 65.5 },
  { n: 6, x: 97.2, y: 95.4 },
  { n: 7, x: 50.5, y: 93.8 },
];
const MARCAS_CHROME: Marca[] = [
  { n: 1, x: 55, y: 11.3 },
  { n: 2, x: 55, y: 35.3 },
  { n: 3, x: 55, y: 43.1 },
  { n: 4, x: 55, y: 49.4 },
  { n: 5, x: 55, y: 55.5 },
  { n: 6, x: 55, y: 61.1 },
  { n: 7, x: 69.3, y: 65.8 },
  { n: 8, x: 70, y: 93.3 },
];

/* ---------- Pasos compartidos ---------- */

/** En el ERP: la forma A y el botón. Es la misma pantalla en los dos sistemas. */
const pasoEnElErp = (siguiente: string): Paso => ({
  titulo: "En el ERP, elige la forma A y presiona Imprimir",
  visual: ({ activa, onActiva }) => (
    <Ventana titulo="Etiquetas de precio · ERP CAYLA" pie="Así está en la pantalla de Etiquetas de precio, debajo de la vista previa y arriba a la derecha.">
      <div className="space-y-3">
        <Renglon rotulo="Cómo la manda a la Brother:" marca={1} activa={activa} onActiva={onActiva}>
          <span className="flex flex-wrap gap-1.5">
            <span className="pildora-cayla" aria-pressed="true">A · Hoja 62 × 40,1 (girada)</span>
            <span className="pildora-cayla">B · Hoja 40,1 × 62 (derecha)</span>
          </span>
        </Renglon>
        <Renglon rotulo="Arriba a la derecha:" marca={2} activa={activa} onActiva={onActiva}>
          <span className="btn-cayla btn-primario pointer-events-none">Imprimir etiquetas</span>
        </Renglon>
      </div>
    </Ventana>
  ),
  acciones: [
    { marca: 1, texto: <>Debajo de la vista previa, deja marcada la forma {b("A · Hoja 62 × 40,1 (girada)")}. Esta computadora la recuerda.</> },
    { marca: 2, texto: <>Presiona {b("Imprimir etiquetas")}. Se abre el diálogo de impresión de Chrome: {siguiente}</> },
  ],
  porQue: <>La forma A manda cada etiqueta en una hoja del mismo tamaño que el papel de la Brother ({PAPEL}). La B solo sirve si la A sale girada.</>,
});

/** Lo que tiene que salir, y el diagnóstico: cada síntoma devuelve al paso que lo arregla. */
const pasoResultado = (sintomas: Sintoma[]): Paso => ({
  titulo: "Revisa la primera etiqueta antes de imprimir el resto",
  visual: ({ activa, onActiva }) => (
    <div className="mx-auto max-w-[15rem]">
      <FotoConMarcas {...FOTO_ETIQUETA} alt="Etiqueta bien impresa: logo, tallas, prenda, precio, código y QR, derecha y del tamaño del cartón" marcas={[]} activa={activa} onActiva={onActiva} pie="Así sale bien: derecha, llena el papel, corte justo debajo." />
    </div>
  ),
  acciones: [
    { texto: <>Imprime {b("una sola")} etiqueta primero (baja las demás a 0).</> },
    { texto: <>Tiene que salir {b("derecha")}, del tamaño del cartón ({PAPEL}), con el logo arriba, el precio grande y el QR abajo a la derecha, y la Brother tiene que {b("cortarla sola")} justo al terminar.</> },
    { texto: <>Si sale así, ya está: sube las cantidades e imprime el resto. La próxima vez solo repites el paso de Chrome.</> },
  ],
  sintomas,
});

function Sintomas({ lista, irAlPaso }: { lista: Sintoma[]; irAlPaso: (n: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-tinta/70">¿Salió mal? Busca lo que ves</p>
      <ul className="divide-y divide-sand overflow-hidden rounded-xl border border-sand bg-papel">
        {lista.map((s) => (
          <li key={s.sintoma} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-tinta">{s.sintoma}</span>
              <span className="block text-[13px] text-tinta/75">{s.arreglo}</span>
            </span>
            <button type="button" className="btn-cayla btn-sutil shrink-0" onClick={() => irAlPaso(s.paso)}>
              Ir al paso {s.paso}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Windows ---------- */

const PASOS_WINDOWS: Paso[] = [
  {
    titulo: "Abre las preferencias de la Brother en Windows",
    visual: ({ activa, onActiva }) => (
      <div className="space-y-3">
        <RutaDeClics
          activa={activa}
          onActiva={onActiva}
          tramos={[
            { n: 1, texto: "Botón Inicio ⊞" },
            { n: 2, texto: "Configuración ⚙" },
            { n: 3, texto: "Bluetooth y dispositivos" },
            { n: 4, texto: "Impresoras y escáneres → Brother QL-1110NWB" },
            { n: 5, texto: "Preferencias de impresión" },
          ]}
        />
        <FotoConMarcas {...FOTO_AJUSTES} alt="Configuración de Windows, página de la Brother QL-1110NWB" marcas={MARCAS_AJUSTES} activa={activa} onActiva={onActiva} />
      </div>
    ),
    acciones: [
      { marca: 1, texto: <>Haz clic en el {b("botón Inicio")} de Windows (abajo, en la barra).</> },
      { marca: 2, texto: <>Abre {b("Configuración")} (el engranaje).</> },
      { marca: 3, texto: <>En la columna de la izquierda, entra a {b("Bluetooth y dispositivos")}.</> },
      { marca: 4, texto: <>Entra a {b("Impresoras y escáneres")} y haz clic en {b("Brother QL-1110NWB")}.</> },
      { marca: 5, texto: <>Haz clic en {b("Preferencias de impresión")}. Se abre una ventana azul de Brother.</> },
    ],
    porQue: <>Esto se hace {b("una sola vez por computadora")}. El tamaño del corte no lo decide el ERP ni Chrome: lo decide el driver de la Brother, y es aquí donde se le dice.</>,
    ojo: <>¿No aparece la Brother en la lista? La impresora no está instalada en esta computadora: instálala primero con el driver de Brother y vuelve a este paso.</>,
  },
  {
    titulo: "Pon el papel de la etiqueta en la Brother",
    visual: ({ activa, onActiva }) => (
      <FotoConMarcas {...FOTO_BROTHER} alt="Preferencias de impresión de la Brother QL-1110NWB, pestaña Básico" marcas={MARCAS_BROTHER} activa={activa} onActiva={onActiva} pie="Foto real de la computadora de la tienda, con la configuración que funcionó." />
    ),
    acciones: [
      { marca: 1, texto: <>{b("Tamaño de papel")}: elige {b(`${anchoRollo}mm`)}.</> },
      { marca: 2, texto: <>{b("Longitud")}: borra lo que diga y escribe {b(largoCorte)} (con punto). Es el largo de cada etiqueta.</> },
      { marca: 3, texto: <>{b("Orientación")}: marca {b("Vertical")}.</> },
      { marca: 4, texto: <>Marca {b("Cortar cada")} y deja {b("1")} en «Etiquetas»: corta una por una.</> },
      { marca: 5, texto: <>Deja marcado {b("Cortar al final")}.</> },
      { marca: 6, texto: <>Presiona {b("Aplicar")}…</> },
      { marca: 7, texto: <>…y luego {b("Aceptar")}.</> },
    ],
    porQue: <>Sin la Longitud en {largoCorte}, la Brother corta donde ella quiere y la etiqueta sale larga, con papel de sobra.</>,
    ojo: <>{b("Alimentar")} (3.0 mm) y lo demás se deja como está. No toques «Impresión reflejada».</>,
  },
  {
    titulo: "Cierra Chrome por completo y vuelve a abrirlo",
    visual: ({ activa, onActiva }) => (
      <Ventana titulo="Google Chrome">
        <div className="flex justify-end">
          <div className="w-full max-w-[15rem] space-y-1">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-tinta/60">arriba a la derecha</span>
              <ConNumero n={1} activa={activa} onActiva={onActiva}>
                <Control tipo="boton" resaltado={activa === 1}>⋮</Control>
              </ConNumero>
            </div>
            <div className="rounded-md border border-sand bg-papel py-1 text-[13px]">
              {["Nueva pestaña", "Nueva ventana", "Historial", "Descargas", "Imprimir…", "Configuración", "Ayuda"].map((o) => (
                <span key={o} className="block px-3 py-1 text-tinta/70">{o}</span>
              ))}
              <span className="my-1 block border-t border-sand" />
              <div className="flex items-center gap-2 px-1">
                <ConNumero n={2} activa={activa} onActiva={onActiva}>
                  <span className={`block rounded px-2 py-1 ${activa === 2 ? "bg-tinta text-crema" : "bg-hueso font-semibold"}`}>Salir</span>
                </ConNumero>
              </div>
            </div>
          </div>
        </div>
      </Ventana>
    ),
    acciones: [
      { marca: 1, texto: <>En Chrome, haz clic en los {b("tres puntos ⋮")} de arriba a la derecha.</> },
      { marca: 2, texto: <>Elige {b("Salir")}. Se cierran todas las ventanas de Chrome, no solo esta.</> },
      { texto: <>Abre Chrome otra vez, entra al ERP y vuelve a {b("Etiquetas de precio")}.</> },
    ],
    porQue: <>Chrome lee el papel de la impresora solo al abrirse. Si estaba abierto mientras cambiaste la Longitud, sigue usando la medida vieja aunque ya la hayas guardado.</>,
    ojo: <>Cerrar solo la pestaña o la ventana no basta: si queda otra ventana de Chrome abierta, sigue la medida vieja.</>,
  },
  pasoEnElErp("sigue con el paso 5."),
  {
    titulo: "Ajusta el diálogo de impresión de Chrome",
    visual: ({ activa, onActiva }) => (
      <FotoConMarcas {...FOTO_CHROME} alt="Diálogo de impresión de Chrome con la Brother QL-1110NWB y la etiqueta girada en la vista previa" marcas={MARCAS_CHROME} activa={activa} onActiva={onActiva} pie="Foto real: así quedó el diálogo cuando la etiqueta salió bien. La vista previa sale girada; es lo correcto." />
    ),
    acciones: [
      { marca: 1, texto: <>{b("Destino")}: elige {b("Brother QL-1110NWB")} (no «Guardar como PDF»).</> },
      { marca: 2, texto: <>Abre {b("Más opciones de configuración")}.</> },
      { marca: 3, texto: <>{b("Tamaño del papel")}: {b(`${anchoRollo}mm`)}.</> },
      { marca: 4, texto: <>{b("Páginas por hoja")}: {b("1")}.</> },
      { marca: 5, texto: <>{b("Márgenes")}: {b("Ninguno")}.</> },
      { marca: 6, texto: <>{b("Escala")}: {b("Personalizado")}…</> },
      { marca: 7, texto: <>…y escribe {b(escala)} en el campo que aparece debajo.</> },
      { marca: 8, texto: <>Presiona {b("Imprimir")}.</> },
    ],
    porQue: <>En Windows se imprime desde {b("este diálogo de Chrome")}, no desde «Imprimir mediante el sistema de diálogo». Con márgenes o escala distintos, Chrome achica la etiqueta y sale chica con mucho blanco.</>,
    ojo: <>Chrome suele recordar estos valores para la próxima vez, pero no siempre la escala: revísalos antes de cada tanda.</>,
  },
  pasoResultado([
    { sintoma: "Sale chica, con mucho blanco alrededor", arreglo: <>Márgenes «Ninguno» y escala «Personalizado 100» en el diálogo de Chrome.</>, paso: 5 },
    { sintoma: "Sale larga o sobra papel después de la etiqueta", arreglo: <>La Longitud de la Brother no es {largoCorte}, o Chrome sigue con la medida vieja: revisa la Brother y cierra Chrome por completo.</>, paso: 2 },
    { sintoma: "Sale girada o cortada a lo largo", arreglo: <>Cambia a la forma B en el ERP y prueba otra vez; si sigue, vuelve a la A y revisa «Vertical» en la Brother.</>, paso: 4 },
    { sintoma: "No corta entre etiquetas", arreglo: <>Marca «Cortar cada 1 etiquetas» en la Brother.</>, paso: 2 },
    { sintoma: "El diálogo no ofrece «62mm»", arreglo: <>El destino no es la Brother (quizá «Guardar como PDF»): cámbialo arriba de todo.</>, paso: 5 },
  ]),
];

/* ---------- Mac ---------- */

/** El diálogo del sistema de la Mac (⌥⌘P), dibujado. `abierto` despliega la lista que ese paso necesita. */
function DialogoMac({
  activa,
  onActiva,
  papel,
  abierto,
  marcas,
}: {
  activa: number | null;
  onActiva: (n: number | null) => void;
  papel: string;
  abierto?: "papel" | "preajustes";
  marcas: Partial<Record<"impresora" | "preajustes" | "papel" | "escala" | "imprimir", number>>;
}) {
  const r = { activa, onActiva };
  return (
    <Ventana titulo="Imprimir" mac pie="Dibujo del diálogo de impresión de la Mac (⌥⌘P). Según la versión de macOS, algún rótulo puede estar en otro orden.">
      <div className="space-y-1">
        <Renglon rotulo="Impresora:" marca={marcas.impresora} {...r}>
          <Control resaltado={activa === marcas.impresora}>Brother QL-1110NWB</Control>
        </Renglon>
        <Renglon rotulo="Preajustes:" marca={marcas.preajustes} {...r}>
          <Control resaltado={activa === marcas.preajustes}>{abierto === "preajustes" ? "Configuración por omisión" : marcas.preajustes ? NOMBRE_PREAJUSTE_MAC : "Configuración por omisión"}</Control>
          {abierto === "preajustes" && (
            <ListaAbierta opciones={["Configuración por omisión", "Última configuración usada", null, "Guardar configuración actual como preajuste…", "Mostrar preajustes…"]} elegida="Guardar configuración actual como preajuste…" />
          )}
        </Renglon>
        <Renglon rotulo="Copias:" {...r}>
          <Control tipo="campo">1</Control>
        </Renglon>
        <Renglon rotulo="Tamaño del papel:" marca={marcas.papel} {...r}>
          <Control resaltado={activa === marcas.papel}>{papel}</Control>
          {abierto === "papel" && <ListaAbierta opciones={["62mm", "29mm", "62mm x 100mm", null, "Gestionar tamaños personalizados…"]} elegida="Gestionar tamaños personalizados…" />}
        </Renglon>
        <Renglon rotulo="Escala:" marca={marcas.escala} {...r}>
          <span className="inline-flex items-center gap-1.5">
            <Control tipo="campo" resaltado={activa === marcas.escala}>{escala}</Control> %
          </span>
        </Renglon>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-sand pt-3">
        <Control tipo="boton">Cancelar</Control>
        {marcas.imprimir !== undefined ? (
          <ConNumero n={marcas.imprimir} {...r}>
            <Control tipo="boton" resaltado>Imprimir</Control>
          </ConNumero>
        ) : (
          <Control tipo="boton">Imprimir</Control>
        )}
      </div>
    </Ventana>
  );
}

const PASOS_MAC: Paso[] = [
  pasoEnElErp("sigue con el paso 2."),
  {
    titulo: "Pasa al diálogo de impresión de la Mac",
    visual: ({ activa, onActiva }) => (
      <FotoConMarcas
        {...FOTO_CHROME}
        alt="Diálogo de impresión de Chrome; abajo, el enlace Imprimir mediante el sistema de diálogo"
        marcas={[{ n: 1, x: 55, y: 78.1 }]}
        activa={activa}
        onActiva={onActiva}
        pie="El diálogo de Chrome es igual en la Mac; allí el atajo dice ⌥⌘P en vez de Ctrl+Shift+P."
      />
    ),
    acciones: [
      { marca: 1, texto: <>En el diálogo de Chrome, baja y haz clic en {b("Imprimir mediante el sistema de diálogo…")}. Atajo: {b("⌥ Opción + ⌘ Comando + P")}.</> },
      { texto: <>Se abre el diálogo propio de la Mac, con otro aspecto. Todo lo que sigue se hace ahí.</> },
    ],
    porQue: <>En la Mac, el «62mm» de la lista corta cada 100 mm y la etiqueta sale a lo largo. El papel de {PAPEL} hay que crearlo, y solo el diálogo de la Mac deja crear un tamaño propio; el de Chrome no lo muestra.</>,
  },
  {
    titulo: "Abre «Gestionar tamaños personalizados»",
    visual: ({ activa, onActiva }) => <DialogoMac activa={activa} onActiva={onActiva} papel="62mm" abierto="papel" marcas={{ impresora: 1, papel: 2 }} />,
    acciones: [
      { marca: 1, texto: <>{b("Impresora")}: {b("Brother QL-1110NWB")}.</> },
      { marca: 2, texto: <>Abre {b("Tamaño del papel")} y elige la última opción: {b("Gestionar tamaños personalizados…")}</> },
    ],
    porQue: <>Esto se hace {b("una sola vez por Mac")}: el tamaño queda guardado y aparece en la lista para siempre.</>,
  },
  {
    titulo: `Crea el papel «${NOMBRE_PAPEL_MAC}»`,
    visual: ({ activa, onActiva }) => {
      const r = { activa, onActiva };
      return (
        <Ventana titulo="Tamaños personalizados" mac>
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="flex flex-col overflow-hidden rounded-md border border-sand">
              <span className="p-1">
                <ConNumero n={2} {...r}>
                  <span className={`rounded px-1.5 py-0.5 ${activa === 2 ? "bg-tinta font-semibold text-crema" : "bg-hueso font-semibold"}`}>{NOMBRE_PAPEL_MAC}</span>
                </ConNumero>
              </span>
              <span className="min-h-12 flex-1" />
              <span className="flex items-center gap-1 border-t border-sand bg-hueso/60 px-1.5 py-1">
                <ConNumero n={1} {...r}>
                  <Control tipo="boton" resaltado={activa === 1}>+</Control>
                </ConNumero>
                <Control tipo="boton">−</Control>
              </span>
            </div>
            <div className="space-y-1">
              <p className="px-1 text-xs font-semibold text-tinta/70">Tamaño del papel</p>
              <Renglon rotulo="Anchura:" marca={3} {...r}>
                <Control tipo="campo" resaltado={activa === 3}>{anchoRollo} mm</Control>
              </Renglon>
              <Renglon rotulo="Altura:" marca={4} {...r}>
                <Control tipo="campo" resaltado={activa === 4}>{largoCorteTexto} mm</Control>
              </Renglon>
              <p className="px-1 pt-2 text-xs font-semibold text-tinta/70">Área no imprimible</p>
              <ConNumero n={5} {...r}>
                <Control resaltado={activa === 5}>Definido por el usuario</Control>
              </ConNumero>
              <ConNumero n={6} {...r}>
                <span className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-tinta/70">
                  {["Superior", "Inferior", "Izquierda", "Derecha"].map((borde) => (
                    <span key={borde} className="flex items-center justify-between gap-1.5">
                      {borde} <Control tipo="campo" resaltado={activa === 6}>0 mm</Control>
                    </span>
                  ))}
                </span>
              </ConNumero>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-sand pt-3">
            <Control tipo="boton">Cancelar</Control>
            <ConNumero n={7} {...r}>
              <Control tipo="boton" resaltado>OK</Control>
            </ConNumero>
          </div>
        </Ventana>
      );
    },
    acciones: [
      { marca: 1, texto: <>Presiona {b("+")} abajo de la lista. Aparece un tamaño «Sin título».</> },
      { marca: 2, texto: <>Haz doble clic en «Sin título» y escribe {b(NOMBRE_PAPEL_MAC)}.</> },
      { marca: 3, texto: <>{b("Anchura")}: {b(anchoRollo)} mm.</> },
      { marca: 4, texto: <>{b("Altura")}: {b(largoCorteTexto)} mm.</> },
      { marca: 5, texto: <>{b("Área no imprimible")}: elige {b("Definido por el usuario")}.</> },
      { marca: 6, texto: <>Pon {b("0")} en los cuatro bordes: superior, inferior, izquierda y derecha.</> },
      { marca: 7, texto: <>Presiona {b("OK")}.</> },
    ],
    ojo: <>Si la Mac no acepta 0 en algún borde y lo sube sola, déjalo en lo mínimo que acepte.</>,
  },
  {
    titulo: "Elige el papel nuevo y guárdalo como preajuste",
    visual: ({ activa, onActiva }) => <DialogoMac activa={activa} onActiva={onActiva} papel={NOMBRE_PAPEL_MAC} abierto="preajustes" marcas={{ papel: 1, escala: 2, preajustes: 3, imprimir: 4 }} />,
    acciones: [
      { marca: 1, texto: <>{b("Tamaño del papel")}: elige {b(NOMBRE_PAPEL_MAC)}, el que acabas de crear.</> },
      { marca: 2, texto: <>{b("Escala")}: {b(`${escala} %`)}.</> },
      { marca: 3, texto: <>Abre {b("Preajustes")} → {b("Guardar configuración actual como preajuste…")}, nómbralo {b(NOMBRE_PREAJUSTE_MAC)} y guárdalo.</> },
      { marca: 4, texto: <>Presiona {b("Imprimir")}.</> },
    ],
    porQue: <>Con el preajuste, las próximas veces basta con ⌥⌘P, elegir {b(NOMBRE_PREAJUSTE_MAC)} en Preajustes e Imprimir.</>,
  },
  pasoResultado([
    { sintoma: "Sale larga o corta cada 100 mm", arreglo: <>El papel elegido es «62mm» y no «{NOMBRE_PAPEL_MAC}».</>, paso: 5 },
    { sintoma: "Sale chica, con mucho blanco alrededor", arreglo: <>Escala en {escala} % y bordes del papel en 0.</>, paso: 4 },
    { sintoma: "Sale girada o cortada a lo largo", arreglo: <>Cambia a la forma B en el ERP y prueba otra vez.</>, paso: 1 },
    { sintoma: "No encuentro «Gestionar tamaños personalizados»", arreglo: <>Estás en el diálogo de Chrome: pasa al de la Mac con ⌥⌘P.</>, paso: 2 },
  ]),
];

const PASOS: Record<Sistema, Paso[]> = { windows: PASOS_WINDOWS, mac: PASOS_MAC };

const sinSuscripcion = () => () => {};

/** El botón «Guía de impresión» con su modal. Va en la cabecera de Etiquetas de precio y en la nota del pie. */
export function BotonGuiaImpresion({ className = "btn-cayla btn-secundario", children = "Guía de impresión" }: { className?: string; children?: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        {children}
      </button>
      {abierta && <GuiaImpresion onClose={() => setAbierta(false)} />}
    </>
  );
}

function GuiaImpresion({ onClose }: { onClose: () => void }) {
  // Abre en la pestaña del sistema de esta computadora; en el servidor no hay navegador, así que parte en Windows.
  const detectado = useSyncExternalStore(
    sinSuscripcion,
    () => sistemaDelEquipo(navigator.userAgent, navigator.platform),
    () => "windows" as Sistema,
  );
  const [elegido, setElegido] = useState<Sistema | null>(null);
  const sistema = elegido ?? detectado;
  const [indice, setIndice] = useState(0);
  const [activa, setActiva] = useState<number | null>(null);

  const pasos = PASOS[sistema];
  const paso = pasos[indice];
  const ultimo = indice === pasos.length - 1;
  const arriba = useRef<HTMLDivElement>(null);
  const ir = (i: number) => {
    setIndice(Math.max(0, Math.min(pasos.length - 1, i)));
    setActiva(null);
    // Desde el diagnóstico (al fondo de la hoja) el paso nuevo empieza arriba: sin esto se abría a media foto.
    arriba.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 });
  };

  return (
    <Modal
      titulo="Guía de impresión de etiquetas"
      subtitulo={`Brother QL-1110NWB, rollo de ${anchoRollo} mm, etiqueta de ${PAPEL}. Se configura una sola vez por computadora.`}
      onClose={onClose}
      ancho="sm:max-w-5xl"
      variante="papel"
    >
      {(cerrar) => (
        <>
          <div ref={arriba} className="flex flex-wrap items-center justify-between gap-3">
            <SegmentoDeslizante
              etiqueta="Sistema de esta computadora"
              valor={sistema}
              onCambio={(c) => {
                setElegido(c as Sistema);
                setIndice(0);
                setActiva(null);
              }}
              opciones={[
                { clave: "windows", etiqueta: "Windows" },
                { clave: "mac", etiqueta: "Mac" },
              ]}
            />
            <span className="text-xs text-taupe-profundo">
              {sistema === detectado ? "Detectamos que esta computadora es " : "Esta computadora parece "}
              <b className="font-semibold text-tinta">{detectado === "mac" ? "Mac" : "Windows"}</b>.
            </span>
          </div>

          {/* Los pasos: numerados y clicables, para saltar al que falta o volver a uno. */}
          <ol className="mt-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Pasos">
            {pasos.map((p, i) => (
              <li key={p.titulo} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => ir(i)}
                  aria-current={i === indice ? "step" : undefined}
                  title={p.titulo}
                  className={`w-full min-w-[2.5rem] border-t-[3px] pt-1.5 text-left text-[11px] leading-tight transition-colors duration-200 motion-reduce:transition-none ${
                    i === indice ? "border-rojo text-tinta" : i < indice ? "border-tinta/60 text-tinta/70" : "border-sand text-tinta/50 hover:text-tinta/80"
                  }`}
                >
                  <span className="font-semibold tabular-nums">Paso {i + 1}</span>
                  <span className="hidden truncate lg:block">{p.titulo}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-sin-cascada>
            <div className="min-w-0">{paso.visual({ activa, onActiva: setActiva })}</div>

            <div className="min-w-0 space-y-4">
              <h3 className="font-display text-xl leading-snug text-tinta">
                <span className="mr-2 text-taupe-profundo tabular-nums">{indice + 1}.</span>
                {paso.titulo}
              </h3>
              <ol className="space-y-1.5">
                {paso.acciones.map((a, i) => {
                  const encendida = a.marca !== undefined && activa === a.marca;
                  return (
                    <li
                      key={i}
                      onMouseEnter={() => a.marca !== undefined && setActiva(a.marca)}
                      onMouseLeave={() => setActiva(null)}
                      className={`flex gap-2.5 rounded-lg px-2 py-1.5 text-sm leading-relaxed text-tinta/85 transition-colors duration-200 motion-reduce:transition-none ${
                        encendida ? "bg-rojo/[0.07]" : ""
                      }`}
                    >
                      {a.marca !== undefined ? (
                        <span
                          aria-hidden
                          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums text-crema transition-colors duration-200 motion-reduce:transition-none ${
                            encendida ? "bg-rojo" : "bg-tinta"
                          }`}
                        >
                          {a.marca}
                        </span>
                      ) : (
                        <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 translate-x-2 rounded-full bg-taupe" />
                      )}
                      <span className={a.marca === undefined ? "pl-3" : ""}>{a.texto}</span>
                    </li>
                  );
                })}
              </ol>
              {paso.porQue && (
                <p className="nota-cayla">
                  <b>Por qué:</b> {paso.porQue}
                </p>
              )}
              {paso.ojo && (
                <p className="text-[13px] leading-relaxed text-tinta/75">
                  <b className="font-semibold text-tinta">Ojo:</b> {paso.ojo}
                </p>
              )}
              {paso.sintomas && <Sintomas lista={paso.sintomas} irAlPaso={(n) => ir(n - 1)} />}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-sand pt-4">
            <button type="button" className="btn-cayla btn-secundario" onClick={() => ir(indice - 1)} disabled={indice === 0}>
              ← Anterior
            </button>
            <span className="text-xs tabular-nums text-taupe-profundo">
              Paso {indice + 1} de {pasos.length}
            </span>
            {ultimo ? (
              <button type="button" className="btn-cayla btn-primario" onClick={cerrar}>
                Listo, ya salió bien
              </button>
            ) : (
              <button type="button" className="btn-cayla btn-primario" onClick={() => ir(indice + 1)}>
                Siguiente →
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
