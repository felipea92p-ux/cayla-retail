# Maqueta · Gestión ▸ Rendimiento más visual e interactivo (2026-11-04)

Tres direcciones para `app/(app)/rendimiento` (ADR-0219, ADR-0325), montadas sobre el marco real y el vidrio ya elegido. Datos inventados; nada
guarda. Las cuentas de ritmo, «Adelante / En ritmo / Por debajo», proyección, contracción y cota prudente son las de `lib/rendimiento-meta-reglas.ts`
y `lib/rendimiento-reglas.ts`, copiadas tal cual.

Abrir `index.html` con la config `maqueta-referentes` del navegador integrado. La barra negra elige dirección, rol, caso, tema y ancho (320 a 1920 px).

| Dirección | Pregunta | Lo que se toca |
|---|---|---|
| **A · La pasarela** (recomendada) | ¿Cómo va el equipo contra su meta, ahora? | Cada persona avanza en su carril hacia SU meta; «Ver cómo fue» y el control para rebobinar; «Si vendemos…» recalcula el cierre del mes. |
| **B · El reloj de la tienda** | ¿Cuándo se vende y quién está en tienda? | Pasar por el día muestra lo vendido y quién estaba; turnos por persona; mapa de calor por día y hora con detalle al tocar. |
| **C · El equipo** | ¿A quién reconozco y a quién acompaño? | Tarjetas con anillo que viajan de grupo al cambiar el período; reparto de la meta que se arrastra, con motivo. |
| Como ahora | | La pantalla de hoy con los mismos datos, para comparar. |

Las tres comparten **la ficha de cada persona** (calendario del mes, lo que va bien, ↑ ↓ entre personas y «Reconocer»), los rankings con «lo que podemos
asegurar» y el gráfico de ventas contra la meta. Se pueden mezclar. Prueba también Lima (sin horarios) y «Sin meta de la sede».

Lo que gana y cuesta cada una, qué datos ya existen y qué pediría una lectura nueva: al pie de `index.html`.

## Reglas que respeta

Reconocer y acompañar, sin dinero (D-65, D-112) · solo encargadas y Admin (D-113) · cada carril se mide contra su propia meta y nunca se mezclan tiendas ·
sin rojo para juzgar (D-159) · sin meta no se inventa nada · solo tokens, claro y oscuro · movimiento una vez, sin rebote ni bucle, apagado con
`prefers-reduced-motion`.

## Pendiente de decidir

- La dirección, o qué mezcla.
- El tablero de vidrio dice que el plan de esta pantalla es de Dany y que solo debía cambiar el material (`docs/vidrio/README.md`). Esta maqueta sí cambia el orden y agrega piezas: falta acordarlo con Dany.
- «Reconocer» es una idea nueva: ¿le llega a la persona? ¿a dónde?
- Las caras de `rendimiento-vidrio-2026-11/` siguen sin elegirse; aquí se usan las recomendadas.

## Lo que se decidió

Descartadas el 2026-11-04: «No me gusta ninguna, crea algo más visual e interactivo». Sigue en `../rendimiento-visual-2026-11/`.
