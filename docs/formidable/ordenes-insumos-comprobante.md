# Formidable · Producción ▸ Órdenes de insumos ▸ Registrar el comprobante de una orden   (`/ordenes-insumos/comprobante/[id]`)

- **Fecha / SHA:** 2026-10-14 · fase 7 parte 2 (`claude/purchase-order-phase7-2-9b0c82`, PR #1098) · **Dispositivo que manda:** escritorio
  (el Mac mini del Taller); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «¿Qué dice el papel que me dio el proveedor por esta orden, y cómo se paga?» · **Protagonista:**
  el dinero del papel
- **Veredicto en una línea:** «Se llena sin ayuda y las cuentas cuadran, pero arranca con una respuesta que no es de la persona: con solo serie y
  número queda registrada una FACTURA al crédito con IGV (S/ 56.05 de deuda por una orden de S/ 47.50, con crédito fiscal), y al contado el
  medio de pago viene puesto. Es lo que Compras dejó de hacer el 13/10.»

> Medido en el banco propio con Chromium sin pantalla (el panel del navegador estaba oculto). Prueba ciega: un agente (Sonnet) que solo vio
> las capturas, con datos inventados. Escéptico: un agente (Opus) que leyó el código y las capturas para refutar cada hallazgo.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s dijo bien qué era y qué seguía; llenó todo al primer intento (10 pasos), con 14 dudas · real: sin probar |
| 2 Una pregunta, una respuesta | 9 | [Medido] una sola acción principal («Registrar comprobante»); el total arriba a la derecha |
| 3 Simplicidad profunda | 8 | [Observado] «Queda por pagar en el Taller hasta su vencimiento; lo paga tu líder» y «Sugerido: emisión + 15 días» se leyeron como veredicto |
| 4 Lenguaje de tienda | 7 | [Observado] «Sigue aquí», «cajón», «fondo» y «Nota de venta» le costaron; «Costo u.» abreviado en la cabecera de la tabla [Opinión] |
| 5 Contenido primero | 8 | [Observado] lo pedido viene puesto y el ciego lo comparó con su papel sin tocar nada |
| 6 Lo difícil, a un toque | 8 | [Medido] «Si el papel dice otro total» queda abajo y opcional |
| 7 Perdonar antes que preguntar | 3 | [Observado + Medido] «Factura» y «Crédito» se ven elegidos y no cuentan, pero el botón registra igual: con solo serie y número entra «Factura · Crédito · IGV 18 %»; al contado, el medio viene puesto (Transferencia) con su ✓ y «Todo listo para registrar» |
| 8 Quitar antes de agregar | 8 | sin sobrantes claros |
| 9 De punta a punta | 6 | [Medido, /chaos] tras un corte, corregir el papel no ofrece «Recargar» (g4); a 375 px el título parte «OI-» / «000832» (de la cabecera, también en Compras) |
| **Leyes (promedio)** | **7,1** | **la ley 7 en 3**: es lo primero que se arregla |
| **Oficio visual** | **8** | [Medido] de las fallas automáticas, casi todas son del cromo o de piezas del sistema, o falsos positivos (ver «Escéptico»); de la pantalla quedan dos desvíos de 1 px que no se ven |

## Los 3 cambios de mayor impacto (Felipe dio el OK a los tres el 2026-10-14: hechos en `2ff6bf4de`, decisión 87 del ADR-0362)
1. **Antes →** el papel arranca con «Factura» y «Crédito» en negro (la guía los da por faltantes, pero el botón registra igual) y, al elegir «Contado», el
   pago aparece 700 px más abajo con su medio puesto (Transferencia) y «Todo listo para registrar». **Después →** **nada viene puesto**, como el papel de
   Compras desde el 13/10 (commit `5ca186960`): el tipo, cómo se paga y el medio del pago al contado arrancan vacíos y se eligen siempre; el total, sin IGV
   hasta elegir factura. **Ley:** 7 y 1. **Se verifica:** con solo serie y número, el botón no registra y la guía lleva al tipo; la misma prueba ciega no se
   encuentra con nada que no eligió. **Esfuerzo:** S (`sumaDePago` ya exige el medio). **Decide:** Felipe (dinero e impuestos; es la misma decisión que
   tomaste para Compras).
2. **Antes →** «Comprobante de OI-…» y «Registrar comprobante», aunque se elija «Sin comprobante». **Después →** «Compra de OI-…» y «Registrar la compra»,
   como Compras desde el 13/10. **Ley:** 4 y «una función, una pieza». **Esfuerzo:** S. **Decide:** Felipe.
3. **Antes →** el pie dice «Todo listo para registrar» y nada más. **Después →** el pie dice lo que se va a registrar, en una línea: «Vas a registrar la
   factura F001-0456 por S/ 56.05, al crédito: vence el 29/10/2026» (al contado: «… y se paga hoy desde BCP Empresa»). **Ley:** 3 (veredicto antes del
   botón) y 7 (se ve antes de que pase). **Esfuerzo:** S. **Decide:** Felipe.

## Lo que sobra (ley 8)
Nada que esconder: «Si el papel dice otro total» ya es opcional y vive abajo.

## Lo que no pediste y importa más
Una factura con IGV que nadie eligió no es solo un número de más: entra al registro de compras con crédito fiscal (`da_credito = tipo = 'factura'`), y la
base no compara la serie con el tipo (una boleta «B001» pasa como factura). Es el cambio 1.

## Escéptico (Opus, 2026-10-14)
| Hallazgo | Veredicto | Cómo queda |
|---|---|---|
| A1 «Factura» y «Crédito» elegidos que faltan | CONFIRMADO | Sugeridos, no bloquean: el botón registra aunque no se toquen. La pantalla nació el 14/10 copiando la gemela de ANTES de `5ca186960` |
| A2 al contado, el pago viene puesto | CONFIRMADO | Lo que se aparta de la gemela es el MEDIO (`METODOS[0]`); la cuenta sigue al medio por la regla de todo el ERP |
| A3 el ejemplo «F001» parece escrito | MATIZADO | No es de esta pantalla: el ejemplo sale de la regla compartida (ADR-0290) y el tono del ejemplo subió hoy en todo el ERP |
| A4 a 375 px el título se parte | MATIZADO | Real, pero de la cabecera y de la gemela; esta pantalla no es de celular obligatorio |
| A5 oficio (calendario, interruptor, contraste, bordes) | REFUTADO como de esta pantalla | Piezas globales (`CampoFecha`, `Interruptor`), un falso positivo de contraste (la píldora oscura es otra capa) y etiquetas invisibles contadas como visibles |
| (se le escapó a la revisión) Sin tocar nada se registra una factura con IGV | NUEVO, grave | Va al cambio 1 |

## Lista aparte (no se ejecuta)
- A 375 px el título parte el número («OI-» / «000832»): es de la cabecera y le pasa a todo título largo con guion.
- El ejemplo «F001» se parece a un valor escrito (tono global del ejemplo, de hoy).
- «Costo u.» en la cabecera de la tabla a 1440 px (a 375 dice «Costo por metro»).
- /chaos (g2, de Felipe): una emisión «01/01/1900» se acepta; «1.299,50» se lee 1.2995 (la coma decimal, transversal).

## Prueba ciega (2026-10-14, Sonnet, sobre capturas del banco)
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «la pantalla donde se anota el papel que llegó de Telas Peña por la orden», y que seguía escribir serie y número: bien |
| Primer intento | sí: factura F001-0456 al crédito, vence el 29/10/2026, S/ 56.05 |
| Pasos | 10 (mínimo 6): bajó y subió buscando el botón, y tocó «Factura» y «Crédito» que ya se veían elegidos |
| Dudas | 14; las de fondo: «Factura»/«Crédito» elegidos que «faltan»; «Sigue aquí»; el «F001» gris; el «000123» con ceros; al contado, el pago ya puesto y «Todo listo» |
| Palabras no entendidas | 9: «Sigue aquí», «OI», «Nota de venta», «cajón», «fondo», «N.° de operación»… |
| Errores evitables | registrar un pago al contado con un medio que no eligió (lo vio en la captura, no lo tocó) |
| ¿Terminó? | sí, con las cuentas bien (47.50 + 8.55 = 56.05) |

## Antes de decir «listo»
- Concurrencia: [Medido, /chaos] el mismo papel desde dos sesiones: una entra y la otra lee «Ese comprobante ya está registrado».
- Caída externa: [Medido, /chaos] con la red cortada, «Se cortó la conexión… vuelve a pulsar sin cambiar nada»; el reintento igual devuelve el mismo papel.
- Persona sin contexto: ciega ✓ (arriba) · real: sin probar.

## Después (2026-10-15, `2ff6bf4de`, en el banco, 1440 px)
| Lo medido | Antes | Después |
|---|---|---|
| Al entrar | «Factura» y «Crédito» elegidos, sin contar | [Medido] nada elegido: el tipo, cómo se paga y el medio se eligen siempre; el total, sin IGV hasta elegir factura |
| Solo serie y número, y el botón | se registraba una factura al crédito con IGV | [Medido] 0 llamadas a la base: la guía lleva al tipo |
| El pie, factura al crédito | «Todo listo para registrar» | [Medido] «Vas a registrar la factura F001-0456 por S/ 56.05, al crédito: vence el 30/10/2026.» |
| Al contado | el medio venía puesto (Transferencia) | [Medido] ningún medio elegido; con transferencia: «…, pagada con transferencia desde BCP Empresa (prueba).» |
| Título y botón | «Comprobante de OI-…» · «Registrar comprobante» | [Medido] «Compra de OI-…» · «Registrar la compra» (también el botón de la orden y su guía) |
| Tras un corte, corregir y reintentar | sin «Recargar» (g4 de /chaos) | [Medido] ofrece «Recargar» |

**Notas después:** ley 7, de 3 a 8 (arriba); ley 3, de 8 a 9 (el pie dice qué se registra); ley 9, de 6 a 7 («Recargar»; queda el título a 375 px,
que es de la cabecera). Las demás no cambian: la ciega no se repitió, así que la ley 1 sigue en 7. **Leyes: 7,9 (provisional).** Oficio: 8, sin volver
a medir. Capturas: el banco (`formi/despues/p01`–`p03`, `d01`), fuera del repo.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-14 | `a08cd59c2` | 7,1 | 8 | — (los 3 esperan el OK de Felipe) |
| 2026-10-15 | `2ff6bf4de` | 7,9 (provisional) | 8 (sin volver a medir) | los 3 (nada viene puesto, «Registrar la compra», el pie dice qué se registra) y «Recargar» (g4 de /chaos) |
