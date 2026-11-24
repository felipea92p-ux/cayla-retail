# Letra y texto de las piezas comunes — 2026-11-23

Rama `claude/letra-piezas-comunes`, apilada sobre `claude/letra-escala-cerrada` (PR #1978). Actividad 3 de las ocho mejoras de estética.
ADR-0691. Sin migraciones.

## Hecho

- [x] **Letra:** 38 tamaños a mano de 20 archivos de `components/ui/` pasaron a la utilidad de su escalón, y 18 de cinco hojas
      (`avisos.css`, `centro-avisos.css`, `puntos-avance.css`, `alta-guia.css`, `guias.css`) a `var(--text-…)`. `components/ui` quedó sin
      letra suelta. La deuda bajó de 2.476 a 2.420 (de 509 a 484 archivos).
- [x] **Texto:** las siete frases largas que las piezas comunes traen de fábrica.

| Dónde sale | Hoy | Ahora |
|---|---|---|
| Al salir de una ficha con cambios | Hiciste cambios en esta ficha que todavía no se guardaron. Si sales ahora, se pierden. | Tienes cambios sin guardar. Si sales, se pierden. |
| Un filtro que se quedó sin opciones | Con los filtros puestos no queda ninguna para elegir. Quita otro filtro. | No queda ninguna con estos filtros. Quita uno. |
| Una tabla sin resultados | Quita alguno de los filtros, o todos de una vez. | Quita un filtro, o todos. |
| Ordenar una columna, en el celular | Ordena o elige qué mostrar. Se aplica al tocar. | Ordena o elige qué mostrar. |
| No se pudo copiar | Selecciónalo y cópialo con Ctrl+C (o mantén pulsado en el celular). | Cópialo con Ctrl+C, o mantén pulsado. |
| Envío en duda, al querer mandar otra cosa | Mientras no sepamos qué pasó con el envío anterior, no se manda otra cosa. Toca «Revisar si se guardó». | Hasta saberlo, no se manda otra cosa. |
| Envío en duda, el aviso de la hoja | Se cortó la conexión y no sabemos si se guardó. No cambies nada todavía: revisa si se guardó, o vuelve a intentarlo tal cual (si ya se guardó, no se repite). | Se cortó la conexión. No cambies nada. Reintentar no lo duplica. |

- [x] Medido en 36 vistas contra el estado del PR #1978: 0 cortes nuevos, 0 pantallas con otro alto, ningún desborde.

## Pendiente

- [ ] **Que Felipe revise el tono** de las siete frases. Las dos últimas son del aviso «No sabemos si se guardó», que sale cuando se
      corta la conexión al guardar: ahí conviene que confirme que «Reintentar no lo duplica» dice lo que él quiere.
- [ ] **El cajón de un proveedor:** con la letra a 13 px, «FACTURADO 12 M» y «ÚLTIMA COMPRA» pasan a dos renglones. Va con Compras.
- [ ] **Lo que no es de las piezas comunes y sigue en `globals.css`:** la leyenda y el eje de Comprobantes (`kpi-*`) y el cobro de
      Vender (`hoja-cobro-*`). Van con Ventas.
- [ ] **Un candado para el texto largo**, como el de la letra: hoy «poco texto a la vista» depende de acordarse. No está en la lista
      aprobada: proponérselo a Felipe.
- [ ] **Dynamic:** queda como tarea allá. Cambiaron 20 archivos de `components/ui/` (solo la clase de la letra, y el texto de cuatro).
