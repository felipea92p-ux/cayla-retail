---
flujo: recibir
caso: con-aviso-de-compras
roles: [compradora, colaboradora]
nivel: primer-dia
persona: Valentina, colaboradora de la tienda que recibe el fardo (nombre inventado)
estado: aprobado por Felipe (2026-11-12), con la prenda que sobra
---

# Llegó lo que Compras ya compró y mandó a la tienda, y hay que recibirlo

## Objetivo
(Lo único que ve la pasada ciega.)

Eres Valentina y trabajas en Tienda Trujillo. La persona de Compras te avisó por WhatsApp: «Te mandé el envío **ENV-001652** (el código
lo da la preparación; cambia en cada corrida), son prendas de dos proveedores». Llegó el fardo y, al abrirlo, encuentras:

- 6 blusas nuevas que nunca se vendieron en la tienda. Una de ellas tiene una mancha que no sale.
- 3 pantalones nuevos. Compras te dijo que eran 4.
- 5 prendas de las que ya se venden en la tienda: 2 en talla S, 2 en M y 1 en L.
- 2 chalecos tejidos color mostaza que Compras no mencionó. Traen la misma etiqueta de proveedor que las blusas.

Regístralo en el sistema para que lo que está bien se pueda vender hoy, que quede claro lo que no llegó y lo que llegó mal, y sin
inventar nada que no sepas.

## Situación
Pasa en Tienda Trujillo un día normal. Es el camino **principal** de Recibir desde ADR-0480: la compra nace en el celular de quien
compra («Mis compras» ▸ «Compré ropa»), Compras la manda a la tienda («Mandar a la tienda», un envío por tienda con su código ENV) y
la tienda la recibe contando, viendo como sugerido el precio que puso la compradora (ADR-0480 paso 3; ADR-0393, ADR-0604, ADR-0645).
El caso hermano, `sin-aviso-de-punta-a-punta`, cubre el fardo que nadie anunció; este, el que **sí** se anunció y trae con qué
cruzarse: lo que falta, lo que sobra y lo dañado se cruzan con la compra.

## Estado inicial (datos inventados)
- Sedes del seed: Tienda Trujillo (solo CAYLA) y Tienda Lima (CAYLA y CLAURE).
- `felipe` (Admin + Líder): hace de **compradora** en la preparación. Ve el dinero de Compras.
- `micaela` (Integrante, fija en Trujillo): hace de **Valentina** en las dos pasadas. Tiene «Recibir mercadería» y no tiene «Mis
  compras» ni el dinero de Compras.
- Proveedores del seed: «Textiles Andina SAC» (sin marca) y «CAYLA SAC» (marca CAYLA, dueño de todo el catálogo del seed).
- Ningún envío abierto ni en camino a Trujillo (consultado el 2026-11-12: el único envío local es de Lima y está cerrado).

## Preparación (solo la ve la pasada informada; la corre la skill entre las dos fotos)
Se hace **por la pantalla**, como lo haría la compradora, con `felipe` en «Mis compras» (`/compras/mi-plata`). Nada se escribe a mano
en `stock`, `compras` ni `despachos`. Si un paso de la preparación no se puede hacer por pantalla, se para y se le dice a Felipe: no
se inserta a mano para que el caso pase.

1. Anotar plata y confirmarla si «Compré ropa» lo exige (ronda abierta).
2. **Compra 1 · Textiles Andina SAC**, a Tienda Trujillo, papel «sin papel» o foto de prueba:
   - «Algo nuevo»: *Blusa Lino Coral* (Blusas), 6 u., costo S/ 28, precio S/ 69.
   - «Algo nuevo»: *Pantalón Palazzo Arena* (Pantalones), 4 u., costo S/ 35, precio S/ 89.
3. **Compra 2 · CAYLA SAC**, a Tienda Trujillo: una prenda habitual del catálogo con tallas S/M/L, 5 u., con su costo y precio.
4. «Mandar a la tienda» → un envío a Trujillo. Se anota su código ENV para el Objetivo.
5. Marcar la entrada de `micaela` (la base local no trae el marcaje de Dynamic: se crean `public.marcajes`/`public.jornadas` como en
   `scripts/pruebas/`, y al terminar se borran, porque `estado.mjs` no restaura `public`). La marca lleva `sede_id` = `ubicaciones.sede_dynamic_id`
   de Trujillo, **no** el id de retail: con ese, `retail.fn_persona_presente` dice que no está. `public.jornadas` ya existe en la base local con filas
   de otros: no se crea ni se borra. Se ensaya antes con `begin; …; rollback;` y se lee `fn_persona_presente(persona, sede, now())`.

## Reglas que se prueban
| Regla | Qué exige | Origen |
|---|---|---|
| ADR-0480 p. 3 | La tienda recibe mirando la foto; cuenta; ve como sugerido el precio de la compradora y puede cambiarlo; la prenda nueva se crea ahí, sin ir a Catálogo | `docs/adr/0480-compras-simple-en-cuatro-pasos.md` |
| ADR-0393 | Recibir contando primero; costo solo de quien ve el dinero | `docs/adr/0393-recibir-contando-primero-sobre-el-envio.md` |
| ADR-0604 | Contar modelo por modelo; identificar toda prenda contada; «Nos debe» por prenda | `docs/adr/0604-contar-modelo-por-modelo.md` |
| ADR-0608 | Un modelo sale al stock sin cerrar el envío; token por tanda | `docs/adr/0608-un-modelo-sale-al-stock-sin-cerrar-el-envio.md` |
| ADR-0645 | Contar en dos mitades; «Llevar al stock ahora» principal; «¿Pasó algo con esta prenda?» a la vista | `docs/adr/0645-recibir-contar-en-dos-mitades.md` |
| ADR-0635 | En un envío de Compras, el proveedor es solo el de la guía | `docs/adr/0635-recibir-crea-proveedor-y-marca.md` |
| ADR-0517 | Un Admin recibe lo que él mismo compró (no aplica: recibe otra persona) | `docs/adr/0517-un-admin-recibe-lo-que-el-mismo-compro.md` |
| R-07 | Lo que llega sin factura se recibe igual | `docs/datos/15-COMO-OPERA-CAYLA.md` |
| Principio 4 | Todo lo que entra al stock queda en `movimientos`; `stock` nunca se desvía | `CLAUDE.md` |

## Casuísticas
| # | Caso | Debe pasar |
|---|---|---|
| A1 | Encontrar el envío por su código ENV | Sale en Recibir como «por llegar» con su proveedor y su código |
| A2 | Abrir el envío | Queda abierto con quién y cuándo; se ve lo que anotó Compras |
| B1 | Prenda del catálogo, 5 que cuadran | Reparte tallas ahora; «Llevar al stock ahora» la deja vendible |
| B2 | Prenda nueva (Blusa), 6 con 1 dañada | Se crea al recibir sin ir a Catálogo; la dañada no entra a la venta y queda dicho qué pasa con ella |
| B3 | Prenda nueva (Pantalón), llegan 3 de 4 | Se ve la diferencia; al cerrar, queda lo que falta para reclamar («Nos debe») |
| B5 | 2 chalecos que no venían en la compra (mismo proveedor que las blusas) | Se registran como «algo que no estaba en la guía» con el proveedor del envío; al cerrar se decide qué pasa con lo que sobra (regalo, se cobra aparte, se arregla en la próxima compra; ADR-0635) |
| B4 | Precio sugerido de la compradora | Se ve y se puede cambiar. El costo también se ve: quien recibe lo pone, también una terminal (Felipe 2026-11-07, `RecibirContando.tsx:346`) |
| C1 | Cerrar como `micaela` | Cierra; el costo de la compra viaja con lo que entra al stock |
| C2 | Doble clic en «Cerrar» | Un solo cierre: el stock no se duplica |
| D1 | Lo recibido se ve en Existencias de Trujillo | Con las cantidades exactas y vendible (lo dañado no) |
| D2 | Compras ve en qué quedó su envío | «Mis envíos» lo marca como recibido, con la diferencia |
| F1 | Stock contra `movimientos` tras cada salida al stock | Sin descuadre (`scripts/chaos/invariantes.mjs`) |
| F2 | Guía de foco y lenguaje | Se entiende qué sigue en cada paso, sin manual |

## Pasos
Los exactos y sus textos se escriben al correr la pasada informada, verificados en pantalla.

| # | Se ve | Se hace | Sigue | La base debe quedar |
|---|---|---|---|---|
| 1 | Recibir, con el envío por llegar | Abrirlo, responsable | Contar | `despachos` abierto con quién y cuándo |
| 2 | Contar | Contar cada modelo, tallas, la dañada, la que falta | Llevar al stock / Revisar y cerrar | `despacho_conteos` por línea de la compra |
| 3 | Cerrar | Precio, nota, responsable | Envío cerrado | `movimientos` y `stock` suben igual; la falta del pantalón queda como deuda del proveedor; lo dañado no está vendible |
| 4 | Existencias y Mis envíos | Mirar | — | Stock de Trujillo con lo recibido; el envío figura recibido |

## Avisos de la guía (lo que la guía destaca a propósito; NO se le dan a la pasada ciega)
Se escriben con lo que encuentre la pasada ciega.

## Misión guiada
Se escribe después del informe, y solo si Felipe pide la guía.
