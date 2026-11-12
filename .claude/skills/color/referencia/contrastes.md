# Contrastes medidos de la paleta real de cayla-retail

> **Generado, no se edita a mano.** Regenerar desde la raíz del repo:
> `python3 .claude/skills/color/referencia/contrastes.py > .claude/skills/color/referencia/contrastes.md`
> Fuente: `apps/web/app/globals.css` (`@theme static`) y `apps/web/app/estilos/tema.css` (`:root[data-tema="oscuro"]`).
> Etiqueta de todo lo que sigue: **[Medido]** con fórmula de [Norma] (WCAG 2) y de [Práctica] (APCA 0.0.98G-4g, Machado 2009).
> Mide TOKENS planos. El vidrio (degradados) lo mide `lib/vidrio-contraste.test.ts` y la pantalla real `tema:auditar` o `referencia/medir.js`.

## OKLCH de los tokens (L % · C · H°)

| Token | Claro | OKLCH claro | Oscuro | OKLCH oscuro |
|---|---|---|---|---|
| `crema` | #f5f0e8 | 95.7 · 0.012 · 80 | #1c1a17 | 21.9 · 0.007 · 78 |
| `papel` | #fbf8f2 | 98.0 · 0.009 · 85 | #26241f | 26.1 · 0.010 · 89 |
| `hueso` | #eae1d2 | 91.3 · 0.022 · 81 | #33302a | 31.0 · 0.011 · 85 |
| `sand` | #e8e0d0 | 90.9 · 0.023 · 85 | #403b34 | 35.5 · 0.014 · 76 |
| `tinta` | #1a1a18 | 21.7 · 0.004 · 107 | #f5f0e8 | 95.7 · 0.012 · 80 |
| `tinta-60` | #5b544c | 45.0 · 0.016 · 71 | #b9b2a7 | 76.6 · 0.017 · 79 |
| `taupe` | #805c4c | 50.8 · 0.054 · 45 | #c4a898 | 75.2 · 0.040 · 52 |
| `borde-control` | #96786a | 59.8 · 0.043 · 46 | #8d7a6e | 59.4 · 0.030 · 54 |
| `rojo` | #b8412d | 53.9 · 0.158 · 32 | #e8806a | 71.0 · 0.133 · 33 |
| `rojo-profundo` | #8b2a1f | 43.2 · 0.134 · 30 | #f29a86 | 77.1 · 0.110 · 34 |
| `verde` | #48603f | 46.0 · 0.059 · 137 | #9ccb8d | 79.3 · 0.099 · 138 |
| `ambar` | #74501a | 46.0 · 0.084 · 73 | #e4b968 | 80.7 · 0.111 · 82 |
| `pizarra` | #4c5d6e | 47.1 · 0.035 · 249 | #a2b8cd | 77.3 · 0.039 · 247 |
| `naranja` | #bf8029 | 65.0 · 0.125 · 70 | #dba04a | 74.6 · 0.124 · 74 |

## Claro (el de fábrica)

### Texto sobre cada superficie (WCAG 2 · APCA Lc)

En **negrita**, bajo 4.5:1 (texto normal, 1.4.3). APCA es la segunda mirada: Lc 75 cuerpo de texto, 60 texto de contenido, 45 títulos, 30 marcadores.

| Texto | crema #f5f0e8 | papel #fbf8f2 | hueso #eae1d2 | sand #e8e0d0 |
|---|---|---|---|---|
| `tinta` #1a1a18 | 15.36 · +96 | 16.44 · +100 | 13.44 · +87 | 13.28 · +86 |
| `tinta-60` #5b544c | 6.57 · +77 | 7.03 · +82 | 5.75 · +69 | 5.68 · +68 |
| `taupe` #805c4c | 5.21 · +71 | 5.58 · +75 | 4.56 · +62 | 4.50 · +62 |
| `rojo` #b8412d | 4.83 · +68 | 5.17 · +72 | **4.23** · +59 | **4.18** · +59 |
| `rojo-profundo` #8b2a1f | 7.56 · +80 | 8.09 · +84 | 6.62 · +71 | 6.54 · +71 |
| `verde` #48603f | 6.13 · +75 | 6.56 · +80 | 5.36 · +67 | 5.30 · +66 |
| `verde-profundo` #44583a | 6.85 · +78 | 7.33 · +83 | 5.99 · +70 | 5.92 · +69 |
| `ambar` #74501a | 6.37 · +76 | 6.82 · +81 | 5.58 · +68 | 5.51 · +67 |
| `ambar-profundo` #734f15 | 6.48 · +77 | 6.93 · +81 | 5.67 · +68 | 5.60 · +67 |
| `pizarra` #4c5d6e | 5.98 · +75 | 6.39 · +79 | 5.23 · +66 | 5.17 · +66 |
| `metodo-efectivo-tinta` #6b4a00 | 7.11 · +79 | 7.61 · +84 | 6.22 · +71 | 6.14 · +70 |
| `metodo-tarjeta` #525a64 | 6.16 · +76 | 6.59 · +80 | 5.39 · +67 | 5.33 · +66 |
| `metodo-yape` #6d3fa3 | 6.41 · +76 | 6.85 · +81 | 5.61 · +68 | 5.54 · +67 |
| `metodo-plin` #1c6b56 | 5.63 · +73 | 6.03 · +77 | 4.93 · +64 | 4.87 · +64 |
| `metodo-transferencia` #2f6aa3 | 4.99 · +69 | 5.34 · +74 | **4.36** · +61 | **4.31** · +60 |
| tinta al 64 % (piso de `text-tinta/35…`) | 4.98 · +70 | 5.11 · +73 | 4.69 · +63 | 4.71 · +63 |
| tinta al 50 % sin piso (un `color-mix` en CSS) | **3.24** · +56 | **3.30** · +59 | **3.12** · +51 | **3.13** · +50 |

### Pares de pieza (texto sobre su propio fondo)

| Par | Fondo efectivo | WCAG 2 | APCA Lc | Pasa |
|---|---|---|---|---|
| Botón primario: `crema` sobre `tinta` | #1a1a18 | 15.36 | -97 | sí |
| Primario al pasar el mouse: `crema` sobre `rojo-profundo` | #8b2a1f | 7.56 | -84 | sí |
| Fondo `rojo` plano con letra `crema` (pasa plano; sobre vidrio no y el ERP no lo usa: «Lo peligroso») | #b8412d | 4.83 | -72 | sí |
| `btn-peligro`: `rojo-profundo` sobre papel | #fbf8f2 | 8.09 | +84 | sí |
| Chip neutro: `taupe` sobre `sand` | #e8e0d0 | 4.50 | +62 | sí |
| Chip verde: `verde` sobre `verde/15` en papel | #e0e1d7 | 5.27 | +66 | sí |
| Chip ambar: `ambar` sobre `ambar/15` en papel | #e7dfd2 | 5.47 | +67 | sí |
| Chip pizarra: `pizarra` sobre `pizarra/15` en papel | #e1e1de | 5.17 | +66 | sí |
| Chip rojo: `rojo-profundo` sobre `rojo/10` en papel | #f4e6de | 7.03 | +75 | sí |
| Error bajo el campo (`.pie-error`): `rojo-profundo` sobre crema | #f5f0e8 | 7.56 | +80 | sí |
| Avance a medias sobre su pista: `avance-medio` sobre `sand` (no texto, 3:1) | #e8e0d0 | 2.32 | +39 | **no (3)** |

### Lo que no es texto: bordes, foco, marcas de gráfico (WCAG 1.4.11 · 3:1)

| Color | crema | papel | hueso | Uso |
|---|---|---|---|---|
| `borde-control` #96786a | 3.57 | 3.82 | 3.12 | borde de lo que se toca o se escribe |
| `sand` #e8e0d0 | **1.16** | **1.24** | **1.01** | línea DECORATIVA (no identifica un control) |
| `tinta` #1a1a18 | 15.36 | 16.44 | 13.44 | anillo de foco (`--foco-color`) y hilo de la guía |
| `rojo` #b8412d | 4.83 | 5.17 | 4.23 | hilo de fila abierta, acento gráfico |
| `taupe` #805c4c | 5.21 | 5.58 | 4.56 | referencia punteada en `<Linea>`, metas |
| `grafico-alza` #48603f | 6.13 | 6.56 | 5.36 | relleno de dato (va con su nombre al lado) |
| `grafico-neutro` #d3c8b4 | **1.46** | **1.56** | **1.28** | relleno de dato (va con su nombre al lado) |
| `grafico-baja` #a8741f | 3.57 | 3.82 | 3.13 | relleno de dato (va con su nombre al lado) |
| `naranja` #bf8029 | **2.92** | 3.13 | **2.56** | relleno de dato (va con su nombre al lado) |
| `avance-medio` #c08a1e | **2.68** | **2.87** | **2.35** | relleno de dato (va con su nombre al lado) |
| `metodo-efectivo` #d19a12 | **2.22** | **2.37** | **1.94** | relleno de dato (va con su nombre al lado) |
| `metodo-tarjeta` #525a64 | 6.16 | 6.59 | 5.39 | relleno de dato (va con su nombre al lado) |
| `metodo-yape` #6d3fa3 | 6.41 | 6.85 | 5.61 | relleno de dato (va con su nombre al lado) |
| `metodo-plin` #1c6b56 | 5.63 | 6.03 | 4.93 | relleno de dato (va con su nombre al lado) |
| `metodo-transferencia` #2f6aa3 | 4.99 | 5.34 | 4.36 | relleno de dato (va con su nombre al lado) |
| `sede-tru` #2f6aa3 | 4.99 | 5.34 | 4.36 | relleno de dato (va con su nombre al lado) |
| `sede-aqp` #c26a2e | 3.43 | 3.67 | 3.00 | relleno de dato (va con su nombre al lado) |
| `sede-lim` #1d8a72 | 3.75 | 4.02 | 3.29 | relleno de dato (va con su nombre al lado) |
| `sede-tal` #8a4fa8 | 4.92 | 5.26 | 4.30 | relleno de dato (va con su nombre al lado) |
| `sede-emp` #9a8b7b | **2.91** | 3.12 | **2.55** | relleno de dato (va con su nombre al lado) |

### Daltonismo — claro (ΔE CIE76 entre los dos colores; < 11 = se confunden como relleno vecino)

| Par | normal | protán | deután | tritán |
|---|---|---|---|---|
| `verde` / `rojo` | 66.9 | **9.9** | 28.8 | 79.5 |
| `verde` / `ambar` | 32.8 | 18.4 | 21.3 | 35.6 |
| `rojo` / `ambar` | 38.0 | **8.6** | 11.5 | 44.4 |
| `rojo` / `taupe` | 41.2 | 15.8 | 25.6 | 47.5 |
| `rojo` / `rojo-profundo` | 15.7 | 12.9 | 14.9 | 16.0 |
| `pizarra` / `verde` | 31.1 | 29.7 | 27.4 | **5.5** |
| `grafico-alza` / `grafico-baja` | 48.2 | 36.3 | 40.3 | 47.1 |
| `grafico-alza` / `grafico-neutro` | 46.3 | 42.3 | 43.8 | 46.4 |
| `grafico-baja` / `grafico-neutro` | 50.6 | 51.9 | 48.1 | 39.8 |
| `naranja` / `rojo` | 37.0 | 31.1 | 17.9 | 31.9 |
| `sede-aqp` / `rojo` | 21.4 | 19.2 | 11.6 | 18.3 |
| `sede-tru` / `sede-tal` | 40.3 | **9.5** | **3.7** | 46.1 |
| `sede-lim` / `sede-tru` | 54.8 | 43.9 | 41.1 | 14.0 |
| `metodo-yape` / `metodo-transferencia` | 42.2 | 18.8 | **9.1** | 36.0 |
| `metodo-plin` / `verde` | 17.2 | **10.0** | 11.8 | 18.4 |

## Oscuro (`data-tema="oscuro"`)

### Texto sobre cada superficie (WCAG 2 · APCA Lc)

En **negrita**, bajo 4.5:1 (texto normal, 1.4.3). APCA es la segunda mirada: Lc 75 cuerpo de texto, 60 texto de contenido, 45 títulos, 30 marcadores.

| Texto | crema #1c1a17 | papel #26241f | hueso #33302a | sand #403b34 |
|---|---|---|---|---|
| `tinta` #f5f0e8 | 15.31 · -97 | 13.67 · -96 | 11.59 · -93 | 9.78 · -90 |
| `tinta-60` #b9b2a7 | 8.26 · -60 | 7.37 · -58 | 6.25 · -56 | 5.28 · -53 |
| `taupe` #c4a898 | 7.77 · -57 | 6.94 · -55 | 5.89 · -53 | 4.97 · -50 |
| `rojo` #e8806a | 6.39 · -48 | 5.70 · -47 | 4.84 · -44 | **4.08** · -41 |
| `rojo-profundo` #f29a86 | 8.05 · -59 | 7.19 · -57 | 6.10 · -55 | 5.15 · -52 |
| `verde` #9ccb8d | 9.38 · -66 | 8.37 · -65 | 7.10 · -63 | 5.99 · -59 |
| `verde-profundo` #a8d49a | 10.38 · -72 | 9.26 · -71 | 7.86 · -68 | 6.63 · -65 |
| `ambar` #e4b968 | 9.46 · -67 | 8.44 · -65 | 7.16 · -63 | 6.04 · -60 |
| `ambar-profundo` #ecc676 | 10.67 · -74 | 9.53 · -72 | 8.08 · -70 | 6.82 · -67 |
| `pizarra` #a2b8cd | 8.49 · -61 | 7.58 · -60 | 6.43 · -57 | 5.43 · -54 |
| `metodo-efectivo-tinta` #f0c35a | 10.47 · -73 | 9.35 · -71 | 7.93 · -69 | 6.69 · -66 |
| `metodo-tarjeta` #a2acb8 | 7.55 · -55 | 6.74 · -54 | 5.72 · -52 | 4.82 · -48 |
| `metodo-yape` #b79be0 | 7.26 · -54 | 6.48 · -52 | 5.50 · -50 | 4.64 · -47 |
| `metodo-plin` #5fc4a4 | 8.20 · -60 | 7.32 · -58 | 6.21 · -56 | 5.24 · -53 |
| `metodo-transferencia` #78b0e6 | 7.57 · -56 | 6.76 · -54 | 5.73 · -52 | 4.83 · -49 |
| tinta al 60 % (piso de `text-tinta/35…`) | 6.20 · -47 | 5.82 · -47 | 5.24 · -47 | 4.69 · -47 |
| tinta al 50 % sin piso (un `color-mix` en CSS) | 4.72 · -36 | 4.52 · -37 | **4.14** · -38 | **3.78** · -38 |

### Pares de pieza (texto sobre su propio fondo)

| Par | Fondo efectivo | WCAG 2 | APCA Lc | Pasa |
|---|---|---|---|---|
| Botón primario: `crema` sobre `tinta` | #f5f0e8 | 15.31 | +96 | sí |
| Primario al pasar el mouse: `crema` sobre `rojo-profundo` | #f29a86 | 8.05 | +60 | sí |
| Fondo `rojo` plano con letra `crema` (pasa plano; sobre vidrio no y el ERP no lo usa: «Lo peligroso») | #e8806a | 6.39 | +50 | sí |
| `btn-peligro`: `rojo-profundo` sobre papel | #26241f | 7.19 | -57 | sí |
| Chip neutro: `taupe` sobre `sand` | #403b34 | 4.97 | -50 | sí |
| Chip verde: `verde` sobre `verde/15` en papel | #383d30 | 6.04 | -59 | sí |
| Chip ambar: `ambar` sobre `ambar/15` en papel | #423a2a | 6.12 | -60 | sí |
| Chip pizarra: `pizarra` sobre `pizarra/15` en papel | #393a39 | 5.59 | -55 | sí |
| Chip rojo: `rojo-profundo` sobre `rojo/10` en papel | #392d26 | 6.18 | -55 | sí |
| Error bajo el campo (`.pie-error`): `rojo-profundo` sobre crema | #1c1a17 | 8.05 | -59 | sí |
| Avance a medias sobre su pista: `avance-medio` sobre `sand` (no texto, 3:1) | #403b34 | 6.04 | -60 | sí |

### Lo que no es texto: bordes, foco, marcas de gráfico (WCAG 1.4.11 · 3:1)

| Color | crema | papel | hueso | Uso |
|---|---|---|---|---|
| `borde-control` #8d7a6e | 4.25 | 3.80 | 3.22 | borde de lo que se toca o se escribe |
| `sand` #403b34 | **1.57** | **1.40** | **1.19** | línea DECORATIVA (no identifica un control) |
| `tinta` #f5f0e8 | 15.31 | 13.67 | 11.59 | anillo de foco (`--foco-color`) y hilo de la guía |
| `rojo` #e8806a | 6.39 | 5.70 | 4.84 | hilo de fila abierta, acento gráfico |
| `taupe` #c4a898 | 7.77 | 6.94 | 5.89 | referencia punteada en `<Linea>`, metas |
| `grafico-alza` #7fb36d | 7.09 | 6.33 | 5.37 | relleno de dato (va con su nombre al lado) |
| `grafico-neutro` #7a7467 | 3.74 | 3.34 | **2.83** | relleno de dato (va con su nombre al lado) |
| `grafico-baja` #d9a441 | 7.72 | 6.89 | 5.85 | relleno de dato (va con su nombre al lado) |
| `naranja` #dba04a | 7.56 | 6.75 | 5.72 | relleno de dato (va con su nombre al lado) |
| `avance-medio` #e4b968 | 9.46 | 8.44 | 7.16 | relleno de dato (va con su nombre al lado) |
| `metodo-efectivo` #d19a12 | 6.90 | 6.16 | 5.22 | relleno de dato (va con su nombre al lado) |
| `metodo-tarjeta` #a2acb8 | 7.55 | 6.74 | 5.72 | relleno de dato (va con su nombre al lado) |
| `metodo-yape` #b79be0 | 7.26 | 6.48 | 5.50 | relleno de dato (va con su nombre al lado) |
| `metodo-plin` #5fc4a4 | 8.20 | 7.32 | 6.21 | relleno de dato (va con su nombre al lado) |
| `metodo-transferencia` #78b0e6 | 7.57 | 6.76 | 5.73 | relleno de dato (va con su nombre al lado) |
| `sede-tru` #4f8ad0 | 4.86 | 4.34 | 3.68 | relleno de dato (va con su nombre al lado) |
| `sede-aqp` #d27b3c | 5.49 | 4.90 | 4.16 | relleno de dato (va con su nombre al lado) |
| `sede-lim` #2fa585 | 5.66 | 5.05 | 4.28 | relleno de dato (va con su nombre al lado) |
| `sede-tal` #a26cc6 | 4.54 | 4.06 | 3.44 | relleno de dato (va con su nombre al lado) |
| `sede-emp` #8a7d70 | 4.34 | 3.87 | 3.29 | relleno de dato (va con su nombre al lado) |

### Daltonismo — oscuro (ΔE CIE76 entre los dos colores; < 11 = se confunden como relleno vecino)

| Par | normal | protán | deután | tritán |
|---|---|---|---|---|
| `verde` / `rojo` | 66.2 | 20.3 | 12.8 | 75.6 |
| `verde` / `ambar` | 38.8 | 16.8 | 22.7 | 45.1 |
| `rojo` / `ambar` | 38.3 | 29.1 | 17.4 | 32.1 |
| `rojo` / `taupe` | 35.5 | 15.5 | 20.8 | 42.8 |
| `rojo` / `rojo-profundo` | 11.6 | **9.3** | **9.2** | 13.9 |
| `pizarra` / `verde` | 46.1 | 42.5 | 38.9 | **8.6** |
| `grafico-alza` / `grafico-baja` | 48.3 | 22.8 | 29.0 | 53.0 |
| `grafico-alza` / `grafico-neutro` | 42.2 | 33.6 | 26.8 | 29.4 |
| `grafico-baja` / `grafico-neutro` | 54.3 | 53.2 | 53.6 | 37.8 |
| `naranja` / `rojo` | 33.7 | 30.6 | 19.9 | 21.4 |
| `sede-aqp` / `rojo` | 20.8 | 22.3 | 16.6 | **8.0** |
| `sede-tru` / `sede-tal` | 36.0 | **6.3** | **7.0** | 48.5 |
| `sede-lim` / `sede-tru` | 65.0 | 52.9 | 49.1 | 12.6 |
| `metodo-yape` / `metodo-transferencia` | 27.8 | **4.8** | **4.5** | 38.3 |
| `metodo-plin` / `verde` | 22.0 | 17.9 | 20.7 | 23.5 |

