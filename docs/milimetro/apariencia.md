# Ficha al milímetro · «Apariencia», los ajustes del aparato (2026-11-17)

Propósito: juntar en un solo lugar lo que cambia **cómo se ve el ERP en este aparato** (modo oscuro, animaciones y modo liviano) y sacarlo de la
barra de arriba, que queda para trabajar. Pedido y decisiones de Felipe: `docs/backlog/2026-11-17-friendly-faraday-ld7j6p.md` (se llama
«Apariencia», el modo liviano gana «Volver a automático», y va en el celular y en el escritorio).

Armada **leyendo el código** (rama `claude/apariencia-ajustes-visuales-cf1643`, sin servidor). Las cifras de la tabla de Estados que dicen «medir»
se confirman al auditar (`/milimetro auditar`, 1440 × 900 y 375 × 812, claro, oscuro y quieto).

## Árbol (reglas 1–3): todo con piezas decididas, nada nuevo

| Parte | Pieza del repo | Rama |
|---|---|---|
| La fila «Apariencia» | la fila de primer nivel del menú: `marco-fila` + `data-prof="0"` + `marco-icono` + `marco-etiqueta` + `marco-corto` (`components/AppShell.tsx`, `claseFila`) | la del marco (ADR-0596); no es un módulo (ADR-0306) |
| Su ícono | lucide `sun-moon`, trazo de fábrica 1,5 del marco | `icono` (2026-10-15): el marco se queda en 1,5 |
| La hoja | `<Modal tamano="angosta" conCerrar>`: no guarda nada, todo se aplica al tocar | `modal` (2026-10-14): «la × si la hoja solo se lee», que es lo más cercano: no hay «Guardar» que cancelar |
| Cada ajuste | una fila en la **placa** (lo que explica es plano) con su ícono, su nombre y su línea, y a la derecha la cara del interruptor (`interruptor` + `interruptor-perilla`, con su `unificar-fijo`, como `AjustarInicio`) | `casilla` (2026-10-13) |
| «Automático» | `<Chip tono="pizarra">` junto al nombre | `estado` (2026-10-07) |
| «Volver a automático» | `btn-cayla btn-enlace`: corrige una sola cosa | `enlace` (2026-10-13, ronda 9) |

DECIDÍ: la fila va **al pie del menú, sobre la tarjeta de la persona**, igual en el celular y en el escritorio (plegado: el ícono y «Apariencia» debajo).
DESCARTÉ: «Mi perfil» ▸ una pestaña, porque una terminal no tiene perfil y estos ajustes son del aparato, no de la persona; y dejar los tres íconos en la
cabecera del escritorio, porque serían dos lugares para lo mismo (integridad conceptual) y la cabecera del escritorio también es para trabajar.
SE ROMPE SI: alguien cambia de tema varias veces al día en el escritorio: pasa de 1 clic a 2 (la fila y el interruptor). Si Felipe lo extraña, la salida es un
atajo de teclado, no volver el ícono a la cabecera.

## Espacio (de las piezas)

- Fila: 40 px de alto, 12 px a la izquierda, 12 a la derecha, radio 10 px, letra 13,5 px (`app/estilos/vidrio/marco.css:98`). Plegado: 54 px, ícono
  arriba y nombre corto de 10 px abajo (`marco.css:226`). Ícono 20 px (`ICONO_POR_PROFUNDIDAD[0]`). Va en su propia caja con el mismo `px-3` del menú,
  8 px sobre la tarjeta de la persona.
- Hoja: `angosta`, 448 px (ADR-0358, `modal`). Cada ajuste: placa con 12 px de relleno y radio 14 px, 8 px entre placas; ícono 20 px en su lente;
  12 px entre ícono y texto; el interruptor 38 × 22 (`campos-y-casillas.css:388`), con el dedo su área sube a 44 (`estilos/tacto.css:49`).
- En el celular la hoja sube desde abajo, con asa, y se baja con el dedo (ADR-0479): no hay que hacer nada.

## Tipografía (de las piezas)

- Título de la hoja: serif 27 px (la hoja Serena, ADR-0596). Bajada: 15 px taupe (`Modal.tsx:333`).
- Nombre de cada ajuste: 15 px, peso 500, tinta (título de una fila, regla `texto` 2026-10-30). Su línea: 14 px (`.texto-detalle`), tinta al 66 %.
- Nada baja de 14 px salvo el `marco-corto` del plegado (10 px, decidido en el marco) y el chip (versalitas 11 px, la pieza).

## Color (de las piezas, sin un hex)

- Fila: `text-tinta/80`, hover `bg-tinta/6` (Tailwind, ya va dentro de `@media (hover: hover)`). Ícono `text-tinta/60`.
- Placa: `--placa-fondo`, `--placa-borde`, `--placa-luz` (`vidrio/recetas.css`). Ícono del ajuste: `text-tinta/65`.
- Interruptor: apagado con el aro `--color-borde-control` (3:1); prendido, relleno de tinta (`campos-y-casillas.css:388–398`).
- En oscuro y con el modo liviano, las mismas recetas en su cara oscura y maciza: no se escribe nada.

## Estados

| Estado | Fila «Apariencia» | Interruptor de cada ajuste | «Volver a automático» |
|---|---|---|---|
| default | como toda fila del menú | aro `borde-control` o relleno tinta | enlace subrayado tenue |
| hover | `bg-tinta/6` y el ícono a tinta, solo con mouse | lo trae la pieza | el hilo rojo corre (pieza) |
| focus-visible | `--foco-*` global (2 px tinta, sep. 2 px) | `--foco-*` | `--foco-*` |
| active | no aplica: abre la hoja al instante | la perilla se estira (pieza) | — |
| selected | `aria-expanded` mientras la hoja está abierta | `role="switch"` + `aria-checked` + la perilla corrida (no solo color) | no aplica: acción |
| disabled | no aplica | no aplica: siempre se puede cambiar | se **quita** si ya está en automático (no hay nada que volver) |
| loading | no aplica | no aplica: se aplica al instante | no aplica |
| error | no aplica | sin almacenamiento (ventana privada) vale para esta carga, sin aviso: como hoy | igual |
| read-only | no aplica | no aplica | no aplica |
| vacío | no aplica | no aplica | no aplica |
| quieto | el color cambia sin desplazarse | la perilla cambia de lado sin deslizarse (`movimiento.css`) | sin el hilo que corre |

Accesibilidad: 4.1.2 (el interruptor lleva `role="switch"`, `aria-checked`, su nombre es el del ajuste por `aria-labelledby` y su línea por
`aria-describedby`) · 1.4.1 («Automático» es texto, no un color) · 1.4.11 (aro del interruptor 3:1, `lib/tema-tokens.test.ts`) · 2.5.8 (24 px con mouse; 44 con el
dedo, `tacto.css`) · 2.1.1 (la fila es un `<button>`; Escape y «atrás» cierran la hoja, ADR-0136 y ADR-0528) · 4.1.3 (no hay mensaje que anunciar: el
cambio se ve en toda la pantalla).

## Movimiento

Nada nuevo. La hoja trae el de `<Modal>` (ADR-0136). El cambio de tema conserva su fundido de ~280 ms con la API de transiciones (`tema-cliente.ts`), que
pregunta `prefiereQuieto()`. El interruptor trae el suyo. Sin rebote ni bucle. Quieto (de fábrica, ADR-0625): todo cambia al instante.

## Texto (regla «Poco texto a la vista»: el nombre y una línea de 8 palabras o menos)

- Fila: «Apariencia». Plegado: «Apariencia» bajo el ícono; al pasar el mouse, la etiqueta «Apariencia» del menú plegado.
- Hoja: título «Apariencia»; bajada «Cómo se ve el ERP en este aparato.» (dice lo que no se ve: que es de este equipo y no de la cuenta).
- «Modo oscuro» · «Descansa la vista con poca luz.»
- «Animaciones» · «Hojas y cifras que se mueven.»
- «Modo liviano» · «Más rápido en teléfonos sencillos.» · chip «Automático» (su `title`: «Este aparato lo decide por su memoria.») · o, si alguien lo
  cambió a mano, el enlace «Volver a automático».

## Propuestas

Ninguna: la pieza calza con las reglas del repo.
