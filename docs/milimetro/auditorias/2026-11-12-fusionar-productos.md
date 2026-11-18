# Al milímetro · auditar `/productos` ▸ «Fusionar productos repetidos» (2026-11-12)

- **Piezas:** `components/fusionar-productos/FusionarProductosHoja.tsx`, `PosiblesDuplicados.tsx`, el botón «Fusionar» de la vista rápida
  (`VistaRapidaProducto.tsx`) y de la barra de marcadas (`ProductosTabla.tsx`). ADR-0650, PR #1794.
- **Cómo:** servidor de la rama contra una base local aislada con el seed, hoja abierta con dos fichas (`window.__milimetro = { raiz: "[data-medir-fusion]" }`).
- **Árbol (reglas 1–3):** todo sale de piezas decididas: `<Modal tamano="ancha">`, `<Boton>` (primario y fantasma con `pie-acciones`), `<Buscador>` +
  `<ListaSugerencias>`, `<MiniaturaPrenda>`, `<Casilla>`, `<Chip>`, `<Aviso>` y `<AvisoNoSeDeshace>`, `<TituloGrupo>`, `<Vacio tamano="chico">`,
  `<ComboResponsable>`, `<CampoGuiado>`/`<PieGuia>`. Las opciones en tarjeta (`role="radio"`) siguen la forma de `ReabrirPrendaModal`.

## Resultado: 1 grave, 1 media, arregladas

| # | Qué · dónde | Medido | Regla · nivel | Estado |
|---|---|---|---|---|
| 1 | «Fusionar» se apagaba por lo que faltaba (la ficha repetida, el responsable) · `FusionarProductosHoja.tsx`, pie | `disabled` con `sePuedeConfirmar(campos)`; con una sola ficha seguía apagado (un plan vacío contaba como bloqueo) | regla del repo con prueba (ADR-0611, mejora 4) · **grave** | **Arreglado:** `confirma={guia}`; al tocarlo, el pie dice «Falta: Ficha repetida». Solo se apaga guardando, leyendo el plan o con un bloqueo de la base, y entonces lleva `aria-describedby` al aviso que lo explica |
| 2 | Lo elegido en «Lo que es distinto» solo cambiaba de color · `ElegirCampo` | medir.js · seleccion: «solo cambia el color (fondo, letra, borde)» | `[Norma]` WCAG 1.4.1 · media | **Arreglado:** la opción elegida lleva su ✓ (`Check` de lucide, 16 px). La tarjeta de «¿Cuál se queda?» ya decía «Queda» con su insignia |

**Falsos positivos (confirmados en el código):** «Fusionar · Fusionando…» como espera escrita a mano y su contraste 1,12:1 (es `PalabraEnEspera` de `<Boton>`,
que reserva la palabra de la espera escondida para no cambiar de ancho); «Buscando… 1:1» (la señal escondida del `<Buscador>`).

## Estados (medido en 1440 × 900 claro)

| Estado | Qué se ve | Qué se anuncia | Cómo se midió |
|---|---|---|---|
| default | piezas del repo, sin hex | nombres accesibles en cada botón (la ✕ dice «Quitar «…» de la fusión») | medir.js |
| hover | el de `btn-*` y de las tarjetas (`hover:` de Tailwind, dentro de `(hover: hover)`) | — | `lib/hover-con-mouse.test.ts` en verde |
| focus-visible | anillo del sistema; los campos, su halo | — | sin medir con `{ foco: true }` |
| active | `.mov-boton` del `<Boton>` | — | a ojo |
| selected | tarjeta en hueso + borde tinta + «Queda»; opción con ✓ | `aria-checked` en `role="radio"` | medir.js · seleccion |
| disabled | solo guardando, leyendo o con bloqueo; el motivo a la vista | `disabled` + `aria-describedby="fusionar-bloqueos"` | medir.js · apagados: 0 sin motivo |
| loading | «Fusionando…» sin cambiar de ancho, hilo | `aria-busy` (de `<Boton cargando>`) | código |
| error | lo de la base en `<Aviso tono="atencion">` arriba del pie; lo que falta, en el pie de la guía | — | en el navegador |
| read-only | no aplica: la hoja no muestra datos de solo lectura en campos | — | — |
| vacío | sin otra ficha: el buscador y «¿Es alguna de estas?»; sin resultados, `<Vacio>` con lo buscado | — | en el navegador |
| quieto | lo del sistema (`<Modal>`, `ListaSugerencias`) | — | sin medir |

## Texto (medido en 1440 × 900)

`/textos` sin fallas: vocabulario, botones genéricos, Mayúscula De Título, solo placeholder, puntos suspensivos, montos partibles, fechas crudas, texto
cortado y botón en dos renglones, todo en 0. Los montos usan `soles()` (`lib/montos-sin-corte.test.ts` en verde).

## Sin medir

`/espacio`, `/tipografia`, `/color` y `/movimiento` no corrieron sus medidores sobre la hoja. Revisado a ojo en claro, en oscuro y a 375 px (hoja de abajo
con asa, sin scroll lateral: `scrollWidth` 375 = ancho), pero eso no reemplaza la medición. El foco (`{ foco: true }`) tampoco se midió.
