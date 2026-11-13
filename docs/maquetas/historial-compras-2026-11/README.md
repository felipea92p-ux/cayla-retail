# Historial de compras: auditoría y «El libro de compras» (2026-11-13)

Maqueta navegable de Compras ▸ Historial de compras (`/compras`, `app/(app)/compras/page.tsx`). Felipe pidió una auditoría
(«podría estar muchísimo mejor, mejor distribuido, más entendible y amigable») y una maqueta para recorrerla.

- **«Como ahora»** reproduce la pantalla real con los mismos datos inventados: 4 tarjetas, 5 píldoras, el panel de 8 filtros, el orden
  por emisión o vencimiento y la tabla de 7 columnas con dos insignias por fila.
- **«Propuesta · El libro»** la ordena en tres preguntas: ¿cuánto compré? (el resumen al costado, con barras de 6 meses que filtran),
  ¿qué y a quién? (la lista partida por mes, con el color y el nombre de las prendas) y ¿qué quedó pendiente? (el trayecto
  compra → llegó → pagada en cada fila y dos atajos a Recibir y Por pagar). El detalle se abre en el cajón lateral y ↑ ↓ pasan de compra.

**Las otras dos pestañas de la fila también tienen su «Como ahora» y su propuesta:**
- **Por pagar · «Lo que debes»**: al costado, lo que debes, cuándo vence semana a semana (filtra) y
  a quién le debes (filtra). La lista es la misma fila del Historial, que dice si la mercadería llegó, y «Pagar» abre el mismo cajón.
- **Revisar compras · una sola cola**: todo lo que anotaron las compradoras, agrupado por ronda y en el orden en que se revisa
  (compras → gastos → lo que devuelve; la plata entregada ya no se confirma, decisión de Felipe del 2026-11-13), con el verbo en cada fila; al costado, «Quién tiene plata». El
  detalle es el mismo cajón; al confirmar pasa a lo siguiente.
  «Quién tiene plata» es solo nombre y monto; al tocar a una persona se abre una hoja que se lee como una libreta: la respuesta
  («Tiene que devolver S/ 180»), qué hizo con la plata con lo que le queda tras cada movimiento, y lo que falta para cerrar su cuenta
  (cada cosa lleva a la cola); a otro toque, sus viajes anteriores (hallazgo de Felipe: hoy no se puede ver la plata de una persona).
  «Entregar plata» pregunta a quién, cuánto, cómo y **de qué cuenta sale** (Felipe: «Sí, al entregarla»), con lo que hay en cada
  cuenta; como ya no se confirma después, es el único momento en que se dice de dónde salió la plata.

**Después de la prueba ciega de `/formidable` (2026-11-13, `docs/formidable/compras-historial-maqueta.md`):** bajo 1380 px el resumen se pliega a
una franja de una línea y la lista queda a la vista en un portátil; el buscador de Historial encuentra a la compradora («Ver su cuenta»), el viaje
se nombra por sus fechas y «Entregar plata» pasa a «Darle plata»; y «Pagar» abre una hoja de pago (cuánto, si llegó la mercadería, de qué cuenta
sale, quién paga) con «Pagar juntos» pegada abajo.

Se puede tocar: las barras de los meses, los tres estados, la búsqueda (también por prenda: prueba «antonella»), «Por compra / Por
proveedor», cada compra (abre el cajón), ↑ ↓ y Esc, tema claro u oscuro y siete anchos. El panel «Filtros» y los botones del cajón
solo se muestran.

La auditoría de las tres pestañas (Historial 10 hallazgos, Por pagar 7, Revisar compras 5, cada uno con su evidencia), la comparación medida y lo que decide Felipe están al pie de la página.

**Cómo abrirla:** sirve `docs/maquetas/` (configuración `maquetas` de `.claude/launch.json`) y entra a
`historial-compras-2026-11/`. Usa el marco común `../vidrio-base-2026-10/`. Datos inventados: el repo es público.
