# ADR-0017 — Taupe deja de ser color de texto

**Fecha:** 2026-09-09
**Estado:** Aplicado
**Completa a:** ADR-0012 (piso de contraste), que no vio este caso
**Alcance:** `app/globals.css` (token nuevo) y los 10 usos de `text-taupe` de la app.

## Contexto

ADR-0012 cerró con la promesa de que **0 elementos reprueban AA**. Era cierto sobre lo
que se midió: las pantallas visibles sin sesión más Facturación. Los 9 usos de
`text-taupe` viven todos en pantallas que necesitan login (Producción, Inventario,
Patrimonio, Proveedores) o en la firma de marca, así que quedaron fuera del barrido.

Apareció midiendo el lateral (ADR-0014), donde la firma "Donde el estilo transforma."
iba a repetir el mismo `text-taupe` de `/mas` y `/login`:

| Sobre | `--color-taupe` #a47865 | Mínimo AA |
|---|---|---|
| `crema` #f5f0e8 | **3.39:1** | 4.5:1 |
| `bg-sand/40` sobre crema (chip "tercerizado") | **3.21:1** | 4.5:1 |

No es un caso borde: reprueba en todos los fondos donde se usa. Y no es texto
decorativo — siete de los nueve usos son **información operativa**: los chips
"Estancado", "muestra", "muestra cerrada", "tercerizado", la categoría de un activo y
el score de un proveedor. Son justo las etiquetas que dicen *por qué* una fila es
distinta de las de al lado.

## Decisión

**Taupe deja de ser un color de texto.** Se agrega `--color-taupe-profundo: #805c4c`
— mismo tono (18.1°) y misma saturación que el taupe, luminosidad 52% → 40%.

| Sobre | `--color-taupe-profundo` |
|---|---|
| `crema` | **5.23:1** (medido en el DOM renderizado: 5.21) |
| `bg-sand/40` | **4.94:1** |
| `bg-taupe/10` | **4.72:1** |

La regla queda escrita en `globals.css`, al lado del token:

- `--color-taupe` → **solo** bordes y tintes (`border-taupe/40`, `bg-taupe/10`).
  Nunca texto.
- `--color-taupe-profundo` → todo texto que antes era taupe.

**Ojo con el matiz respecto de ADR-0012.** Ahí el sufijo `-profundo` significaba
*"solo para texto sobre su propio tinte"*, porque `verde` y `ambar` ya pasaban sobre
crema y únicamente reprobaban cuando el chip pintaba el fondo con su mismo color.
Taupe no pasa en ningún fondo, así que acá el hermano profundo **reemplaza al base en
todo texto**, no solo sobre el tinte. Es la misma familia de tokens con una regla de
uso distinta, y está anotado para que no se lea como que se aplicó mal el patrón.

`border-taupe/40` en `OrdenesProduccion.tsx:278` **no se toca**: un borde no es texto y
el brandbook no le pone piso de contraste.

## Consecuencias

- La firma "Donde el estilo transforma." queda en `taupe-profundo` en sus **tres**
  apariciones — `login/page.tsx:56`, `mas/page.tsx:42` y el lateral. Revierte la
  decisión de ADR-0014, que la había pasado a `tinta/65` por ser el arreglo seguro sin
  token nuevo: con `taupe-profundo` existiendo, `tinta/65` dejaba la misma frase de dos
  colores distintos según la pantalla, que es peor que cualquiera de los dos.
- Con esto, taupe pasa a ser el único color de la paleta secundaria que **no** puede
  escribirse. Si algún día alguien quiere texto taupe, la respuesta ya está en el
  token: usa el profundo.
- Sigue pendiente (BACKLOG) medir sobre el DOM renderizado el resto de Finanzas,
  Inventario y Producción con una sesión de prueba. Este ADR cierra el hallazgo
  concreto de taupe, no el barrido completo que ADR-0012 dejó a medias.
