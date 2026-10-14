# Migrar la deuda de una familia de /unificar (ADR-0358)

Cómo se migró la deuda de las rondas 6, 7 y 8 el 2026-10-13 (258 archivos → 4 en un día) y cómo repetirlo con la ronda que siga. Todo es
relativo a `apps/web` salvo que se diga.

## El recorrido

1. **Ver la deuda:** `pnpm --filter web unificar:ver` (cada línea con su contexto; `-- --familia <id>` o `-- <archivo>` para acotar).
2. **Repartir en lotes que no se tocan** (por módulo: Caja, Ventas, Compras, Producción, Inventario, Catálogo, el resto). Un agente por
   lote, con esta guía y su lista exacta de archivos; la sesión principal se queda con un lote y con todo lo compartido.
3. **La sesión principal, al final:** `pnpm --filter web unificar:rellenar <familias…>` (reescribe la `deuda` de `familias.mjs` y la
   valida: si queda rota o con una clave repetida, la deja como estaba), revisa y acepta las huellas de las guías
   (`guias:huella <id>`, después de mirar qué control cambió y si el texto de la guía sigue siendo verdad), baja las cuentas exactas que
   pidan (`lib/foco-comun.test.ts`, `lib/guia-de-foco-pantallas.ts`, `lib/combos-buscan-con-la-regla.test.ts`), corre la suite entera,
   recorre en el navegador lo que tocó cada lote (Vender, Cambios y Devoluciones a 375 px) y commitea por módulo.

## Instrucciones para un agente de un lote

Las piezas YA EXISTEN; tu trabajo es que los archivos de TU LOTE dejen de dibujar a mano lo que ahora es una pieza. **Solo tocas los
archivos de tu lote** (otro agente y la sesión principal trabajan en otros; si tocas uno ajeno, chocan).

### Reglas que no se negocian

1. **Migrar cambia cómo se ve, nunca qué hace.** Mismo `onClick`, mismo `onChange`, mismo `href`, mismas validaciones, mismos permisos, mismo
   texto visible (salvo quitar una «→» o «←» escrita a mano cuando la pieza ya dibuja su flecha). Si migrar obliga a cambiar un
   comportamiento, NO lo migres: déjalo y repórtalo.
2. **Solo tokens** (nunca un hex ni `rgb()`), sin animaciones nuevas propias (las piezas traen las suyas), sin `outline-none` junto a
   `caja-cayla`.
3. **No toques**: `unificar/familias.mjs` (la deuda la reescribe la sesión principal), los componentes de `components/ui/` (las piezas), los
   CSS de `app/` y los archivos de otros lotes. No hagas commits. No levantes servidores.
4. Si una línea ES legítima aunque la firma la marque (una casilla escondida que guarda un estado, un input de archivo, un título que es la
   cabecera de la pantalla y no de un bloque…), exímela en ESA línea con un comentario `// unificar-fijo: <por qué, 10 letras o más>`
   (en JSX, dentro del elemento: `{/* unificar-fijo: … */}` en la misma línea de la firma). Úsalo poco y con un motivo verdadero.
5. Al terminar cada archivo: `npx tsc --noEmit -p .` (desde apps/web) y `npx eslint <archivo>`. Al final, `node unificar/deuda.mjs <familia>`
   para cada familia que tocaste: tus archivos ya no deben aparecer (o solo con su `unificar-fijo`).
6. Los archivos que se prueban sin el alias `@/` (los que renderiza una prueba de `lib/*.test.ts`, p. ej. `PerdidasVista`,
   `ExistenciasVacio`): ahí importa con ruta relativa o usa clases; si dudas, `grep -rn "<nombre del componente>" lib/*.test.ts`.
7. `// unificar-fijo:` vale solo en la MISMA línea que la firma (la del `<input`, la del `role=`): en un tag, como comentario de JS después
   del atributo; dentro de un `<h3>`, como `{/* … */}` antes del texto; nunca un `{/* */}` entre `&& (` y su elemento.
8. Si la pieza no acepta algo que la pantalla necesita (un `disabled`, un corte de ancho, cerrar al navegar), **no la dibujes a mano**:
   dilo en tu informe. La pieza aprende lo que pide la migración (así nacieron `Casilla disabled`, `Encabezado visible`, `EnlaceVer alNavegar`).

### Las piezas, una por familia (qué poner en lugar de lo hecho a mano)

#### `campo` — una caja de texto a mano (`<input>` o `<textarea>`)
- Con etiqueta visible y su pie: `CampoTexto` (`components/ui/campos.tsx`; acepta todas las props de `<input>`, más `etiqueta`, `pie`,
  `tono="error"`, `mono`, `valido`, `trabajando`, `caja` = etiqueta solo para lector, `sinPie`). Un monto grande: `CampoMonto` (o el
  `CampoMonto` de `components/ui/CampoMonto.tsx` si el archivo ya lo usaba: ese es un input de comportamiento sin cara). Una fecha:
  `CampoFecha` (`components/ui/CampoFecha.tsx`).
- Un input SUELTO que es la caja misma (sin contenedor; una celda de una fila, un input chico): `className="caja-campo-input"` (más lo
  que lo ubique: ancho, `text-right`, `tabular-nums`). Las constantes `campoTexto` y `campoEtiqueta` de `components/ui/Modal.tsx` ya son
  la caja y la etiqueta nuevas.
- Sin etiqueta propia (el título ya está en el bloque, una celda de una fila, un campo dentro de una lista): envuelve el input en la caja
  de la pieza — `<div className="caja-cayla caja-campo">` con el `<input className="self-stretch py-0">` adentro (sin `w-full`, sin
  `bg-transparent`, sin borde ni `outline-none`: la caja ya los pone). Tamaños: `caja-campo-alta` (48 px, un monto), `caja-campo-baja`
  (36 px). Un textarea: la caja con `caja-campo-texto-largo` y `<textarea className="self-stretch">`. Conserva el `type`, `inputMode`,
  `maxLength`, `placeholder`, `aria-*`, `id`, `ref`, `value`, `onChange`, `onKeyDown`, `autoFocus`… exactamente.
- Un input que es un BUSCADOR (lupa, «Buscar…»): eso es `<Buscador>` (`components/ui/Buscador.tsx`, ronda 5), no un campo.
- Un input dentro de una CELDA de una matriz de tallas × colores, un `type="file"`, un `type="range"`: no es esta familia; exímelo con su
  `unificar-fijo` si la firma lo marca.

#### `combo` — un combo o una lista desplegable a mano (`role="combobox"`, `role="listbox"`, `lista-flotante`)
- Elegir una de pocas opciones: `CampoSelect` (con etiqueta) o `Desplegable` (`forma="campo"`) de `components/ui/campos.tsx`
  (`opciones={[{ valor, texto, grupo?, deshabilitada? }]}`, `valor`, `onValor`, `marcador`). Elegir de un catálogo escribiendo:
  `ComboBuscable` (`components/ui/ComboBuscable.tsx`). Si el combo a mano hace algo que la pieza no hace (una lista con fotos, una
  pistola), NO lo cambies: repórtalo.

#### `filtro` — `<Desplegable forma="caja">` o `forma="cajaBaja"` haciendo de filtro en una barra
- Es `<DesplegablePildora icono={IconoLucide} etiqueta="Categoría" valor onValor opciones valorPorDefecto>` de
  `components/ui/FiltrosPildora.tsx` (`opciones` = `[{ valor, texto }]`; para varias opciones a la vez, `varias={{ valores, onValores }}`).
  `valorPorDefecto` es lo que vale el filtro sin elegir nada (`"todos"`, `TODOS`): ahí la píldora queda sin rellenar y sin ✕.
- Si el `Desplegable forma="caja"` está DENTRO DE UN FORMULARIO (no en una barra de filtros de una lista), cámbialo a `forma="campo"`
  (es la misma caja) y listo.

#### `etiqueta-campo` — un título de campo a mano
- Si va sobre un campo, usa `<Campo etiqueta=…>` (o la pieza `CampoTexto`/`CampoSelect` que ya la trae). Si solo es el texto, la clase
  `campo-etiqueta` (versalitas de 11 px, tinta al 62 %, se oscurece con su caja si el contenedor tiene `className="campo"`).

#### `casilla` — `type="checkbox"` o `role="switch"` a mano
- Casilla: `<Casilla marcada={…} onCambio={…} etiqueta="nombre para el lector" aMedias?>` (`components/ui/Casilla.tsx`). La casilla de la
  pieza para el clic (`stopPropagation`): si el archivo necesita que el clic suba, ojo. Si la casilla estaba dentro de un `<label>` con su
  texto, deja el `<label>` y pon `<Casilla>` en lugar del `<input>` (la etiqueta para el lector va en `etiqueta`).
- Interruptor: `<Interruptor activo onActivo etiqueta pie? disabled?>` (`components/ui/campos.tsx`). Si el interruptor a mano no tiene su
  texto al lado (va solo en una fila con otro layout), puedes dejar el `<button role="switch" aria-checked>` y darle `className="interruptor"`
  con `<span aria-hidden className="interruptor-perilla" />` adentro (la cara de la pieza) — y exímelo con `unificar-fijo` explicando que
  usa la cara de la pieza sin su etiqueta.

#### `tabla` — un `<table>` de registros o un `role="columnheader"` a mano
- `<Tabla>` + `<Encabezado columnas plantilla>` + `className={fila(PLANTILLA)}` y `celda("der")` de `components/ui/Tabla.tsx` (una
  plantilla `grid-cols-[…]` que comparten encabezado y filas; `soloEscritorio`, `desdeLg`, `subtitulo`). Si la tabla es una «Ver como tabla»
  de un gráfico (datos para leer), también va con `<Tabla>`.
- Un encabezado a mano con `role="columnheader"` sobre filas que ya son `fila-cayla`: reemplázalo por `<Encabezado>`. Si el layout es muy
  distinto (una lista agrupada con cabeceras propias) y el cambio arriesga romperla, déjalo y repórtalo.
- Una fila que se abre debe ser un `<button>`, un `<Link>`, `role="button"` o tener `cursor-pointer` (así toma el hilo y la «›» de la
  pieza); la fila abierta lleva `aria-current`. No agregues una «›» propia: la pieza la pone (salvo que la fila ya traiga su chevron).

#### `titulo-seccion` — un `h2`/`h3`/`h4` con serif, versalitas o seminegrita a mano
`components/ui/TituloSeccion.tsx`:
- **Título de un bloque** de una pantalla (sobre o dentro de una tarjeta): `<TituloSeccion dato={…} accion={…} nivel={2|3}>Texto</TituloSeccion>`.
  `dato` = lo que lo resume a la derecha (una cifra, «3 prendas»: pon la cifra en `<b>`); `accion` = un `<EnlaceVer>`. Si el h2 tenía
  algo pegado al título (un conteo en un `<span>`), pásalo a `dato`.
- **Título de un grupo dentro de una hoja o un cajón** que se lee de arriba abajo («Pago», «Ruta», «Qué pasó»): `<TituloGrupo cuenta? nivel={3}>`.
- **Un día en una lista larga por fecha** («Hoy», «Ayer», «5 de octubre»): `<SeparadorDia total={…} hoy={esHoy}>`.
- NO son esta familia (exímelos con `unificar-fijo` si la firma los marca): el título de una HOJA o modal (lo pone `<Modal>`), la cabecera
  de una pantalla (`EncabezadoPagina`/`CabeceraPantalla`), el nombre de una persona o una prenda en su ficha (es un dato, no un título de
  sección), el título de un vacío (`<Vacio>`), una cifra grande.
- Conserva `id`, `data-guia` (la prop `guia` de `TituloSeccion`), `aria-*`. Quita los márgenes del título si su contenedor ya da el aire;
  si no, pásalos a `className` del `TituloSeccion` (que solo ubica).

#### `enlace` — un enlace dibujado a mano
- **Dentro de una frase, o una acción de texto chica** («Regístralo en Proveedores», «Deshacer», «Quitar», «Cambiar»): la clase
  `btn-enlace` (o `btn-cayla btn-enlace` si es un `<button>`), sin `text-rojo`, sin `hover:underline`, sin `underline decoration-…`: el
  hilo que se llena ya lo pone la pieza. Conserva el tamaño de letra (`text-xs`, `text-[13px]`).
- **Suelto, que lleva a ver más o a otro lugar** («PAGAR VENCIDO →», «Ver todas», «Ver traslados →», «Calidad: qué se devuelve y por qué →»):
  `<EnlaceVer href="…">Texto sin flecha</EnlaceVer>` o `<EnlaceVer onClick={…}>` (`components/ui/EnlaceVer.tsx`; versalitas rojas con su
  flecha que avanza). Quita la «→» escrita: la pieza la dibuja. Conserva `target` (`target="_blank"`), `data-guia` (prop `guia`).
- Un enlace a un documento (PDF, XML) dentro de una fila: `btn-enlace`.

### Cómo informar al terminar (el agente)

Una lista por archivo: qué cambiaste (familia → pieza), qué dejaste con `unificar-fijo` y por qué, y qué NO migraste y por qué (lo que
pediría cambiar un comportamiento). Y la salida final de `node unificar/deuda.mjs <familia>` filtrada a tus archivos.
