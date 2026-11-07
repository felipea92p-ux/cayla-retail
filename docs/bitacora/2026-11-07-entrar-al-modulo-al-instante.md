## 2026-11-07 (El clic en el menú entra al módulo en el mismo instante)
Qué hice: al tocar una fila del menú, el logo o una pantalla del buscador global, la fila queda marcada y el contenido pasa a un esqueleto con el
nombre del módulo antes de que el servidor responda (medido: ~60 ms en modo desarrollo; antes, ~250 ms sin ningún cambio en pantalla). El
`loading.tsx` sigue con el mismo título hasta que llega el módulo. Si no llega (error, «atrás», 15 s), vuelve la pantalla anterior tal cual.
Por qué así: Felipe vio que el clic «no ingresaba» y que la gente volvía a tocar. La espera del servidor no se puede quitar, pero sí que se lea como
«ya entré» (ADR-0628). No cambia adónde lleva ningún enlace.
Felipe se lleva: el módulo lento sigue tardando lo mismo (Existencias, ~3 s); esto quita la duda, no la espera. Bajar esos segundos está en el
backlog de ADR-0622.
