# Devoluciones, computadora y celular: demo + spike (2026-09-26) — implementado en ADR-0232

- **`spike.html`** es el spike final con lo que eligió Felipe. Su barra oscura solo cambia el rol, la caja y si hay
  devoluciones por aprobar.
- **`demo.html`** es el demo comparativo con el que se eligió.

## Decisiones de Felipe tras el demo (2026-09-26)

| Tema | Decisión |
|---|---|
| Tarjeta de Actividad reciente | **1A · Compacta + 2 acciones**: «Devolver» (borde), «Cambiar» (enlace a `/cambios?item=`), «Ver venta» (hoja) |
| Celular | **2A · «Escanear prenda» + lupa fijos abajo** (acción de la pantalla, ADR-0206) |
| Seguimiento | **3A · Cifra «Por aprobar» tocable** (ámbar si hay alguna) + pestañas Compras / Por aprobar / Resueltas, con la NC y el destino de cada prenda |
| Accesos | Los cuatro: Cambios, venta y comprobante (hoja + Historial + Comprobantes ▸ Emitidos), cuarentena (Inventario) y caja, ficha de la clienta |
| Aviso de caja cerrada | **También para la colaboradora**, con su propio texto: le avisa a la clienta antes de registrar |

**Sin decidir, fuera de este spike:** «Sin comprobante» como flujo real con solo saldo a favor (Lightspeed) y la nota
de crédito como pago en Vender (Bsale, R-37). Las dos piden decisión de negocio y, la segunda, base.

**Para implementar (sin migración, por lo visto hasta hoy):** las Resueltas necesitan una lectura de devoluciones
aprobadas o rechazadas de 15 días con su NC y el destino de las prendas; hay que revisar si `lib/devoluciones.ts` ya la
trae o si hace falta una función de lectura nueva (si es RPC desde el navegador, sumarla a `espera-reglas.ts`).

---

# Demo comparativo

`demo.html` es autocontenido (el isotipo va incrustado) y usa datos inventados. **No es el spike final ni una
implementación**: no toca `app/(app)/devoluciones`, los componentes `Devoluciones*.tsx` ni la base. Sirve para
elegir, con la barra oscura, entre las opciones abiertas. Las dos vistas se dibujan juntas.

Para verlo: `preview_start` con `maquetas` (`.claude/launch.json`) y abrir `/devoluciones-2026-09/demo.html`.

## El pedido (Felipe, 2026-09-26)

Sumar a Devoluciones accesos a las pantallas nuevas que trabajan junto con ella y volverla más ágil, sobre todo en el
celular. Felipe eligió los cuatro grupos de accesos (Cambios, venta y comprobante, cuarentena y caja, ficha de la
clienta) y pidió investigar otros sistemas y un demo de las opciones de tarjeta, lo fijo en celular y el seguimiento.

## Controles

| Control | Opciones |
|---|---|
| Ver como | Líder · Colaboradora (aprobar, anular y el aviso de caja son del líder) |
| 1 · Tarjetas | A · Compacta + «Devolver» y «Cambiar» · B · Toda tocable (abre la hoja de la venta) · C · Como hoy + días |
| 2 · Celular: qué queda fijo | A · «Escanear prenda» + lupa abajo · B · Buscador pegado arriba · C · Nada |
| 3 · Seguimiento | A · Cifra «Por aprobar» tocable + pestañas Compras / Por aprobar / Resueltas · B · Solo la cifra · C · Como hoy |
| Situación | Caja abierta · Caja cerrada (aparece «Abrir caja» para el líder) |
| Marcas | Muestra u oculta el borde rojo punteado de lo nuevo |

## Lo que va en todas las opciones

- «Quedan N días» en vez de «Dentro del plazo» (ámbar con 3 días o menos).
- El nombre de la clienta lleva a su ficha (`/clientas`).
- «Ver venta»: una hoja con las prendas, el pago, la boleta, «Abrir en Historial», y «Cambiar» o «Devolver».
- Un aviso de las prendas en cuarentena lleva a Inventario (`ResolverDanadosModal`).

## Investigación (documentación pública, 2026-09-26)

Shopify POS, Square Retail, Lightspeed, Odoo POS y Bsale Perú. La tabla y las fuentes van al pie del demo. En resumen:
el cambio va al lado de la devolución (Shopify, Square), el escáner es la entrada del celular (Square), la nota de
crédito se ve desde la devolución (Odoo) y el reembolso en efectivo sale de la caja (Bsale). Quedan como ideas para
después, porque piden decisiones de negocio: «sin comprobante» solo con saldo a favor (Lightspeed) y la NC como pago
en Vender (Bsale, R-37).

## Lo que se respeta

ADR-0206 (en celular no hay barra de navegación inferior: lo fijo es una acción de esta pantalla), ADR-0169 (tokens),
ADR-0136 (la hoja entra con velo y sube 18 px) y ADR-0220 (cabecera de Ventas).
