# La escala tipográfica del ERP, con su porqué

Valores leídos del código el 2026-11-12. **Si cambias un valor del repo, este archivo cambia en el mismo PR** (o deja de ser verdad).
Altura x: DM Sans 0,526 em · EB Garamond 0,400 em [Verificación]. Una EB Garamond a 16 px tiene el ojo de una DM Sans a ~12 px.

## La rampa

| Rol | Tamaño / interlineado | Letra · peso · tracking | Dónde vive | Por qué ese valor |
|---|---|---|---|---|
| Título de pantalla | **46 px** / 1 (36 px bajo `sm`) | EB Garamond 600, −0,025 em (`tracking-tight` sobre `.font-display`) | `components/ui/EncabezadoPagina.tsx:78` | Decidido (ADR-0220, `/unificar` `titulo-pagina`). La serif de marca solo en lo grande, como la familia «Brand» de Material [Práctica]. Interlineado 1 porque es una línea; con dos líneas (bajo `sm`) se aprieta: vigílalo |
| Título de hoja | **27 px** / 1,1 | EB Garamond 600 | `app/estilos/vidrio/hoja.css:41` (`.hoja-serena > h2.font-display`) | Decidido (ADR-0596, `modal`). Un escalón bajo la pantalla |
| Título de cajón | **24 px** (`text-2xl`) / `leading-tight` | EB Garamond 600 | `components/ui/Cajon.tsx:313` | Decidido (`cajon`, ronda 17) |
| Cifra de tarjeta | **28 px** (24 compacta, 22 si la tarjeta mide < 148 px) / `leading-tight` | EB Garamond 600, `lining-nums tabular-nums` | `components/ui/TarjetaCifra.tsx:236` | Decidido (`cifra`). EB Garamond **sí** tiene cifras tabulares por defecto: aquí alinean [Verificación]. Es el «metric» de Atlassian [Práctica] |
| Título de sección | **21 px** / 1,2 | EB Garamond **400**, −0,005 em | `app/estilos/titulos.css` (`.titulo-seccion-texto`) | Decidido (`titulo-seccion`, ronda 7). Ojo: a 21 px la serif equivale a una DM Sans de ~16 px: es el piso de la serif en la interfaz |
| Título de un vacío | **22 px** / 1,2, `max-width: 36ch`, `text-wrap: balance` | EB Garamond 400 | `.vacio-tit` (`app/estilos/vacio-aviso-buscador.css:41`) | Decidido (`vacio`, 2026-10-08). Su frase: 14/1,55, `52ch`, `text-wrap: pretty`: el modelo de medida del ERP |
| Bajada de un bloque | **15 px** / 1,4 | DM Sans 400, taupe | `.texto-bajada` (`titulos.css:28`) | Decidido (`texto`, ronda 19). Una línea de ≤ 12 palabras |
| Texto de lectura (`text-sm`) | **15 px** / 1,55 | DM Sans 400 | `--text-sm` (`globals.css:324`) | Repo 2026-09-08: «se sube el piso, no el techo». Tailwind de fábrica es 14/20 |
| Título de una fila | **15 px** | DM Sans 500–600 | CLAUDE.md «La letra de lectura» | Decidido (ronda 19) |
| Detalle de una fila / bajo una cifra | **14 px** / 1,4 | DM Sans 400, tinta al 70 % | `.texto-detalle` (`titulos.css:29`) | Decidido: el piso de lectura. 14 px de DM Sans ≈ tamaño crítico de Legge y Bigelow en un 24" 1080p a 60 cm [Evidencia + cálculo] |
| Nota al pie | **14 px** / 1,6 | DM Sans 400, taupe | `.nota-cayla` (`globals.css:728`) | «a 13 nadie la leía» (ronda 19) |
| Botón | **13,5 px** / 1,25 | DM Sans 500 | `.btn-cayla` (`globals.css`) | Decidido (`boton`, ronda 4). Una línea: 1,25 es lo de Primer para controles de una línea [Práctica]. Chico: 12,5 px (`.btn-chico`) |
| Encabezado de columna, pie de tabla | **13 px** (`text-xs`) / 1,5 | DM Sans 400, taupe | `components/ui/Tabla.tsx:62,65` (`TABLA.titulo`, `TABLA.pie`) | Etiqueta, no lectura: el piso de etiqueta es 12 (Carbon, Material, Primer) y aquí va 1 px arriba |
| Dato junto a un título | **13 px** | DM Sans, taupe, `tabular-nums` | `.titulo-seccion-dato` (`titulos.css`) | Etiqueta. Su `tabular-nums` no hace nada en DM Sans (`cifras.md`) |
| Versalitas (título de campo, rótulo de tarjeta, botón de cabecera) | **11 px** | DM Sans 600, mayúsculas, **0,13 em** | `.campo-etiqueta` (`campos-y-casillas.css:315`), `.label-cayla` (`globals.css:547`), `[data-voz="cabecera"] .btn-cayla` (`globals.css:1807`) | Decidido (`etiqueta-campo`, `boton`). 11 px es el Label S de Material [Práctica]; el tracking positivo en lo chico es de todos los sistemas; el valor exacto 0,13 em no tiene fuente: no se toca |
| Sede y fecha de la cabecera | **11 px** | DM Sans 600, mayúsculas, 0,18 em, taupe profundo | `EncabezadoPagina.tsx:70` | Decidido (ADR-0220) |
| Sobretítulo rojo | **11 px** | DM Sans 700, 0,09 em | `.eyebrow-cayla` (`globals.css`) | Cuenta en los 2 rojos por pantalla |
| Globito de cuenta | **10,5 px** / 1 | DM Sans 600, `tabular-nums` | `.titulo-cuenta` (`titulos.css`) | Un número de 1–3 cifras dentro de 20 px. Bajo el piso de 11: ver propuesta 2 |
| Subtítulo de columna | **10 px** | DM Sans | `Tabla.tsx:140` (`text-[10px]`) | Bajo el piso de 11: ver propuesta 2 |

**Lo que no entra en esta escala** (CLAUDE.md, fila `texto`): papel impreso (etiquetas, tickets: `.papel-fijo`, `data-papel`, en mm), etiquetas
de gráficos (dentro de `svg`), matrices de tallas y las piezas con diseño propio por decisión (Observatorio, Análisis, vista rápida, sellos).

## Lo que la rampa enseña

- **14/15 es el cuerpo** del ERP, un paso sobre el 14/20 del consenso (Material Body M, Carbon body-01, Atlassian Body, Primer sm, Fluent
  Base300) [Práctica]. Está bien: el ERP se lee a distancia, en un Mac mini o en un mostrador.
- **Esta tabla ya suma 16 tamaños** de 10 a 46 px. Los sistemas grandes usan 6–10 pasos [Práctica]. No se quitan de golpe: cada uno está decidido.
  Lo que no se hace es **sumar otro**: un tamaño nuevo usa uno de esta tabla.
- **Interlineados fraccionarios:** 15 × 1,55 = 23,25 px; 13 × 1,5 = 19,5 px. Los sistemas fijan el interlineado en píxeles múltiplos de 4
  (12/16, 14/20, 16/24) [Práctica]. Ver propuesta 3.
- **Casi todo está en px**, no en rem (`.texto-bajada`, `.texto-detalle`, `.nota-cayla`, ~900 `text-[Npx]`). El zoom del navegador los
  agranda; la «letra del navegador» no. Ver propuesta 4.
