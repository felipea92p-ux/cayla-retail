# ADR-0003 — Modal compartido sobre Radix Dialog, sin adoptar un kit visual externo

**Fecha:** 2026-09-04
**Estado:** Aplicado

## Contexto

Felipe pidió "modernizar" el diseño de todas las interfaces y buscar/descargar
"skills" para eso. Al auditar el repo antes de tocar nada (protocolo de sesión), se
encontró que:

1. Ya existe un sistema de identidad completo y verificado en producción
   (`app/globals.css`, brandbook v3.0: 3 colores, EB Garamond + DM Sans, sin
   sombras). En `docs/BITACORA.md` (2026-07-18) hay un precedente explícito: Felipe
   pidió una vez "tipo Apple" y se decidió que la esencia CAYLA manda en el cómo —
   Apple es solo vara de calidad (espacio, tipografía), no estética a copiar.
2. 6 modales del núcleo (`AbrirCajaModal`, `CerrarCajaModal`, `BajarATiendaModal`,
   `RegistrarGastoModal`, `RegistrarVentaModal`, `MovimientoModal`) seguían con
   estilos genéricos pre-brandbook (`bg-white`, `neutral-*`, `black/30`) en vez de
   los tokens v3 ya adoptados en el resto de la app.
3. Ninguno de los 8 modales de la app (incluido `EfectivoPanel`, que sí usaba los
   tokens correctos) atrapaba el foco ni cerraba con `Escape` — cada uno reimplementaba
   a mano `fixed inset-0` sin esa lógica; solo `Ayuda.tsx` la tenía, copiada aparte.

## Decisión

Con Felipe: "modernizar" significa evolucionar DENTRO del sistema CAYLA, no adoptar
la estética de un kit genérico (shadcn/Material por defecto). Concretamente:

- `@radix-ui/react-dialog` se usa solo como base de comportamiento/accesibilidad
  (foco atrapado, cierre con Escape, `aria-modal`, portal) — no aporta ningún estilo.
- `components/ui/Modal.tsx` es el único cascarón de modal del sistema: overlay
  `bg-tinta/30`, panel `bg-crema`, `font-display` para el título, `label-cayla` para
  subtítulo/etiquetas — el mismo look que ya tenía `EfectivoPanel` (el modal más
  reciente y correcto antes de este cambio), ahora aplicado a los 6 modales que
  se habían quedado atrás.
- Se migraron los 6 modales pre-brandbook + `EfectivoPanel` a `<Modal>`, reemplazando
  además sus clases genéricas (`neutral-*`, `black/30`, `rounded-lg`, `red-600`) por
  los tokens del sistema.

## Alternativas descartadas

- **Kit de componentes completo (shadcn/ui con su tema por defecto, Material, etc.)**:
  pisaría la decisión de marca ya verificada en producción — cambiaría colores,
  radios y tipografía sin que Felipe lo pidiera explícitamente. Descartado.
- **Hook casero de Escape/focus-trap sin dependencia nueva**: más "simplicidad
  radical" en apariencia, pero reimplementa a mano lo que Radix ya resuelve bien
  (trap de foco real, manejo de scroll del body, aria correcto) — hubiera sido un
  parche, no una solución de raíz (principio 12).
- **No tocar los 6 modales por ahora**: dejaba una inconsistencia visible entre
  pantallas de alto tráfico (abrir/cerrar caja, vender, registrar gasto) y el resto
  de la app ya migrada — la interfaz más usada del sistema se veía "vieja".

## Consecuencias

- Todo modal nuevo debe construirse sobre `components/ui/Modal.tsx` (y sus
  constantes `campoEtiqueta`/`campoTexto`/`campoSelect`/`botonCancelar`/`botonPrimario`),
  no reimplementar el overlay a mano.
- Pendiente (no incluido en este paso, mismo criterio si se toca): `MenuNuevo` en
  `AppShell.tsx` sigue como panel posicionado a mano, sin cierre por Escape — es un
  patrón distinto (menú anclado al lateral, no modal centrado/bottom-sheet) y no se
  forzó a este mismo primitivo.
- Primera dependencia externa de comportamiento de UI en el repo (antes: cero
  librerías de componentes). Cualquier extensión futura (`Select`, `DropdownMenu`,
  `Tabs` de Radix) debe seguir el mismo criterio: sin estilos propios, vestido 100%
  con los tokens de `globals.css`.
