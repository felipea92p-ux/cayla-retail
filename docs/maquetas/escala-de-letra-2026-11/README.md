# La letra: tres tamaños para elegir, y muy poco texto — lámina (2026-11-19)

Felipe, sobre la mejora 7 de `docs/maquetas/ocho-mejoras-2026-11/`: «hay cosas con fuente demasiado pequeña y son imposibles de leer»
y «hay cosas con demasiado texto acumulado que no dicen nada, solo confunden con tecnicismos y es mejor que se muestre poquísimo texto
pero que sea bastante conciso y entendible para cualquiera». Esta lámina es para que elija el tamaño y el tono mirando.

- `index.html`: la lámina. Servida en local: `python3 -m http.server 4877 --directory docs/maquetas` y luego
  `http://127.0.0.1:4877/escala-de-letra-2026-11/`. Cinco pantallas reales, con «Hoy», tres escalas y «B + poco texto».
- `capturas/`: el ERP local con cada escala. Cada opción es el ERP real con una regla inyectada; no cambia el código.
- `capturar.mjs`: saca las capturas. `censo.mjs`: mide el texto de 31 pantallas. Solo local.

## Las tres escalas

| Opción | Escalones (px) | Lo más chico | Lo que se lee |
|---|---|---|---|
| A · Ajustada | 12 · 13 · 14 · 15 · 17 · 21 · 28 | 12 | 15 |
| B · Cómoda (recomendada) | 13 · 14 · 16 · 18 · 21 · 28 | 13 | 16 |
| C · Grande | 14 · 16 · 18 · 21 · 24 · 32 | 14 | 16 |

Los tamaños de exhibición (36 px o más: títulos de pantalla, cifras grandes) no cambian.

## Lo medido (ERP local, 1440×900, 31 pantallas)

| Qué | Dato |
|---|---|
| Textos a la vista | 5.191 |
| Por debajo de 14 px | 2.773 (53 %) |
| Por debajo de 12 px | 500 (204 bajo 11 px; el más chico, 9 px) |
| Bloques de 12 palabras o más | 254 (Atributos 88, Resumen de Finanzas 27, Plan del piso 22, Dinero 16, Rendimiento 14) |
| Tamaños escritos a mano en clases (`text-[Npx]`) | 1.309 usos en 433 archivos; 622 por debajo de 12 px |
| Tamaños escritos en hojas de estilo | 1.515 en 89 hojas; 204 por debajo de 12 px |
| Por el token `text-sm` (15 px) y `text-xs` (13 px) | 3.589 y 229 usos |

## Lo que se vio al capturar

- Con la escala C, Existencias empuja las prendas 170 px hacia abajo y la cabecera se reacomoda.
- Con la B, la fila de filtros de Existencias pasa a dos renglones; el resto aguanta.
- El conteo de «textos cortados» no cambió con ninguna escala: no es una señal fiable; hay que mirar cada pantalla.

## Sin verificar

- 375 px, el modo oscuro y las hojas que no se abrieron. La regla inyectada solo cambia el tamaño, no el alto de las cajas.
