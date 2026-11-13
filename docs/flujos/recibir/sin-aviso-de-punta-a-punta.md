---
flujo: recibir
caso: sin-aviso-de-punta-a-punta
roles: [colaboradora, lider]
nivel: primer-dia
persona: Valentina, encargada del almacén de la tienda (nombre inventado)
estado: aprobado por Felipe (2026-11-03)
---

# Llegó mercadería que nadie avisó, y hay que recibirla

## Objetivo
Llegó un fardo a la tienda y nadie avisó que venía. Trae blusas de dos modelos distintos sin marca, unos vestidos de una marca conocida y unos aretes que nadie sabe cómo se llaman; no te dijeron de qué proveedor es. Regístralo en el sistema para que lo que se pueda vender quede disponible y no se pierda nada de lo que llegó.

## Situación
Pasa en Tienda Trujillo un día normal. Se recibe primero contando (ADR-0393): se cuenta por categoría y por modelo, y lo demás (tallas, colores, costo) puede quedar para después sin frenar a nadie. Felipe revisa este flujo porque «hay varias cosas que no me convencen»; por eso el caso cubre cada camino, no solo el feliz.

## Estado inicial (datos inventados)
- Sedes del seed: Tienda Trujillo (solo CAYLA), Tienda Lima (CAYLA y CLAURE).
- Cuentas del seed: `felipe` (Admin + Líder, ve el dinero de Compras) y `micaela` (Integrante, fija en Trujillo, sin el dinero de Compras).
- Proveedores del seed. Uno de ellos con una factura por recibir en la sede (casuística A4).
- Ningún envío sin aviso abierto en la sede.

## Preparación (solo la ve la pasada informada; la corre la skill entre las dos fotos)
Se ensaya con `begin; …; rollback;` y se lee su efecto antes de darla por buena. Nada se escribe a mano en `stock`.

La base local no tiene el marcaje de Dynamic, y sin él la cuenta de la colaboradora no puede recibir. Para probarla, se crean las tablas `public.marcajes` y `public.jornadas` con la misma forma que usan `scripts/pruebas/` y se le marca la entrada; al terminar el caso se borran, porque `estado.mjs` no restaura `public`.

```sql
-- Solo lectura: el caso no necesita preparar datos si el seed ya trae una factura por recibir en Trujillo (casuística A4).
-- Si no la trae, A4 se declara «no cubierta» en el informe: no se inventa una factura para que el caso pase.
select c.id, c.numero, c.estado from retail.compras c where c.estado not in ('anulada', 'recibida');
```

## Reglas que se prueban
| Regla | Qué exige | Origen |
|---|---|---|
| R-07 | Más del 30 % de lo que llega no trae factura: se recibe igual | `docs/datos/15-COMO-OPERA-CAYLA.md` |
| ADR-0393 | Lo sin aviso se cuenta como un envío, sin nada que falte ni sobre; sin proveedor se cuenta y se elige al cerrar; costo solo de quien ve el dinero | `docs/adr/0393-recibir-contando-primero-sobre-el-envio.md` |
| ADR-0604 | Sin fila «Total»; «+» por categoría; tacho que confirma si ya se contó; «Blusa 1» no deja cerrar si se contó; lo que queda en 0 se descarta | `docs/adr/0604-contar-modelo-por-modelo.md` |
| ADR-0605 | Cancelar la recepción solo si nunca se cerró; queda anulada con quién, cuándo y por qué; no toca stock | `docs/adr/0605-cancelar-la-recepcion-y-quitar-lo-agregado.md` |
| ADR-0542 | En una sede con CAYLA y CLAURE, lo que entra al stock lleva dueño | CLAUDE.md, «Módulos» y memoria de Lima |
| Principio 4 | Todo lo que entra al stock queda en `movimientos`; `stock` nunca se desvía | `CLAUDE.md` |

## Casuísticas

### A · Abrir el envío
| # | Caso | Debe pasar |
|---|---|---|
| A1 | Proveedor conocido, con guía | Se abre y lleva a contar con quien lo abrió como responsable |
| A2 | «No sé de quién es», sin guía | Se abre; el conteo avisa «Proveedor por confirmar» |
| A3 | Proveedor que no está: «+ Agregar proveedor» | Queda elegido sin perder lo demás. Con `micaela`: no ve el botón |
| A4 | Proveedor con factura por recibir | Ofrece recibir contra la factura o «No, recibir sin factura» |
| A5 | Doble clic en «Empezar a contar» | Un solo envío (token) |
| A6 | Cerrar la hoja a medio llenar y volver | Sin envío fantasma |

### B · Contar
| # | Caso | Debe pasar |
|---|---|---|
| B1 | Categoría nueva, modelo sin marca | Entra a su categoría, marca vacía |
| B2 | Dos modelos sin marca en la misma categoría | Se cuentan aparte, sin fila «Total» |
| B3 | Modelo con marca | Marca por modelo |
| B4 | Nombre parecido a una prenda del catálogo | Avisa mientras escribe, sin bloquear |
| B5 | Sin nombre: «Blusa 1» con descripción | Se guarda; contado, no deja cerrar |
| B6 | Modelo agregado que queda en 0 | Avisa al cerrar y se descarta sin rastro |
| B7 | Tacho en 0 y con conteo, y su «Deshacer» | Directo / confirma; vuelve con lo que tenía |
| B8 | Quitar categoría entera en 0 y con conteo, y su «Deshacer» | Directo / confirma; vuelve con lo que tenía |
| B9 | Tallas y colores ahora, o dejarlos para después | Ninguno frena el cierre |
| B10 | Recargar a mitad del conteo; salir y volver desde la lista | Nada se pierde; sale como «se sigue contando» |
| B11 | Dos personas contando el mismo envío | Ninguna pisa a la otra sin saberlo (abierto en ADR-0604) |
| B12 | Intentar cerrar sin contar nada | Se dice qué falta |

### C · Cerrar
| # | Caso | Debe pasar |
|---|---|---|
| C1 | `felipe`, con costo | Costo guardado; entra al stock lo identificado |
| C2 | `felipe`, sin costo | Entra sin costo y no toca el costo de la prenda |
| C3 | `micaela`, sin ver el dinero | No ve ni escribe costo; puede cerrar |
| C4 | Costo atípico | Pide confirmar |
| C5 | Elegir proveedor al cerrar (viene de A2) | Se pone una vez y pasa a lo contado |
| C6 | Corregir la guía al cerrar | Queda la nueva, con rastro |
| C7 | Precio de venta, para todas o solo esta sede | Pide confirmar; valida antes de guardar |
| C8 | Sede con dos dueños (Tienda Lima) | Pide de quién es lo que entra |
| C9 | Recargar en el cierre | Lo decidido sigue ahí |
| C10 | Doble clic en «Cerrar» | Un solo cierre: el stock no se duplica |

### D · Después de cerrar
| # | Caso | Debe pasar |
|---|---|---|
| D1 | Terminar lo pendiente: crear la prenda, tallas y precio | Entra al stock con su movimiento y con el proveedor del envío |
| D2 | Reabrir y corregir | Rastro cierre → reapertura → cierre; el stock no se duplica |
| D3 | Llega la factura después | Se puede unir, o se dice que no (sin regla clara: se informa) |
| D4 | Lo recibido se ve en Existencias y se puede vender | Con las cantidades exactas |

### E · Cancelar la recepción
| # | Caso | Debe pasar |
|---|---|---|
| E1 | Abierto sin contar nada | Anulado con motivo y responsable; desaparece de la lista |
| E2 | Abierto con conteo | Se avisa qué se pierde; lo contado queda como historia |
| E3 | Ya cerrado | No se ofrece; la base lo niega |
| E4 | Reabierto (estuvo cerrado) | La base lo niega, porque ya metió stock |
| E5 | Doble clic en cancelar | Un solo resultado, sin error feo |

### F · Por toda la ruta
| # | Caso | Debe pasar |
|---|---|---|
| F1 | Stock contra `movimientos` tras cada cierre | Sin descuadre (`scripts/chaos/invariantes.mjs`) |
| F2 | Se corta la red al guardar | Lo contado no se pierde en silencio |
| F3 | Guía de foco y lenguaje | Se entiende qué sigue en cada paso, sin manual |

## Pasos
Los exactos y sus textos se escriben al correr la pasada informada, verificados en pantalla.

| # | Se ve | Se hace | Sigue | La base debe quedar |
|---|---|---|---|---|
| 1 | Recibir, con «Sin Aviso» | Abrir, elegir proveedor o «No sé de quién es», responsable | Contar | `despachos` abierto, origen sin aviso, con quién y cuándo |
| 2 | Contar, con sus categorías | «+», modelo, contar, tacho | Cerrar | `despacho_conteos.separado` con cada modelo, también en 0 |
| 3 | Cerrar | Proveedor, costo, precio, nota, responsable | Envío cerrado | `movimientos` y `stock` suben igual; pendientes para lo no identificado; los modelos en 0 no quedan |
| 4 | Envío cerrado, con pendientes | Terminar lo pendiente | Existencias | Lo pendiente entra con su movimiento |

## Avisos de la guía (lo que la guía destaca a propósito; NO se le dan a la pasada ciega)
Se escriben con lo que encuentre la pasada ciega: los errores reales son los avisos reales.

## Misión guiada (el guion de la guía del HTML interactivo)
Se escribe después del informe, y solo si Felipe pide la guía.
