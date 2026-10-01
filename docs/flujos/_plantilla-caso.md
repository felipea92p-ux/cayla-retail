---
flujo: venta
caso: nombre-corto-en-minusculas
roles: [colaboradora, clienta]        # colaboradora · lider · clienta
nivel: primer-dia                     # primer-dia · segunda-semana · experta
persona: Valentina, …                 # nombre INVENTADO de quien actúa; nunca el de una persona real
estado: borrador                      # borrador · aprobado por Felipe (AAAA-MM-DD)
---

# Título del caso, como lo diría alguien de la tienda

## Objetivo
Una o dos frases en palabras del negocio. **Esto es lo único que recibe la pasada ciega.**
Sin nombres de pantallas, botones ni tablas.

> Ejemplo de tono: «Una clienta llega a la tienda, elige una blusa y quiere pagar con Yape y que le den boleta.»

## Situación
Quién es la clienta, qué pide y qué pasa alrededor (hora, sede, si hay cola). Es el contexto que la skill usa para armar
la pasada informada y la guía; la pasada ciega no lo ve.

## Estado inicial (datos inventados)
Lo que tiene que existir antes de empezar: la sede, la prenda (producto, color, talla, cuántas unidades), la caja
abierta o cerrada, las cuentas que intervienen. Todo del seed o dicho aquí; nada de datos reales.

## Preparación (solo la ve la pasada informada; la corre la skill entre las dos fotos)
El SQL que deja la base en el «Estado inicial» de arriba: caja abierta, stock de arranque, lo que haga falta. Solo `psql`
contra el Postgres local. Cada sentencia lleva un comentario con el porqué; lo que se escribe pasa por las funciones reales
(`abrir_caja`, `fn_aplicar_movimiento`), nunca por un `insert` directo a `stock`. La skill lo corre después de
`estado.mjs guardar <caso>-origen` y antes de `guardar <caso>`.

```sql
-- …
```

## Reglas que se prueban
| Regla | Qué exige | Origen |
|---|---|---|
| R-00 | … | `docs/datos/15-COMO-OPERA-CAYLA.md` |
| — | … | sin regla escrita |

## Pasos
Uno por fila. «La base debe quedar» solo lo lee la pasada informada.

| # | Se ve | Se hace | Sigue | La base debe quedar |
|---|---|---|---|---|
| 1 | … | … | … | … |

## Avisos de la guía (lo que la guía destaca a propósito; NO se le dan a la pasada ciega)
Lo que la guía subraya aunque el sistema no lo exija: un paso que se olvida (p. ej. indicar quién es el responsable, con un nombre
inventado como «Valentina»), un límite del negocio (un monto que cambia el medio de pago). Cada aviso dice si es una instrucción
a la colaboradora o un candado que el sistema hace cumplir; si solo es instrucción, se anota.

## Misión guiada (el guion de la guía del HTML interactivo)
Los pasos dosificados, **una sola acción por paso**, con los textos **verificados en pantalla** (nunca los supuestos). Cada paso: dónde estás,
qué haces, qué verás, por qué (en palabras del negocio) y los avisos que se destacan (un paso que se olvida, un límite del negocio).

| # | Dónde estás | Haz (una acción) | Verás | Por qué (negocio) | Avisos |
|---|---|---|---|---|---|
| 1 | … | … | … | … | … |

## Lo que le llega a la clienta
El comprobante, el dinero devuelto, el crédito, el mensaje. Lo que ella se lleva de la tienda, no lo que el sistema anotó.

## Lo que se espera que confunda (hipótesis del código; NO se le dan a la pasada ciega)
Lo que la lectura del código anticipa que una persona sin contexto no entenderá (jerga, un campo ambiguo, un paso oculto).
Sirve para **contrastar** con lo que la ciega reporte: si coincide, es una hipótesis confirmada; si la ciega encuentra otra,
es lo que el código no anticipaba, y eso es lo más valioso. Cada punto dice si está verificado en pantalla o no.

## Variantes que vale la pena probar
Lo que puede salir distinto: falta stock, paga de otra forma, pide factura en vez de boleta, se arrepiente a mitad, dos
colaboradoras venden la última unidad a la vez.

## No verificado por este caso
Lo que el caso no puede probar en local (SUNAT real, producción, el celular si no se corrió a 375 px). Siempre se llena.
