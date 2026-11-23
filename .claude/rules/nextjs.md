---
paths:
  - "apps/**/*.ts"
  - "apps/**/*.tsx"
---

## Server Components y archivos "use client" (salió de «Movimiento y modales»)

**Server Components y archivos `"use client"`:** un Server Component solo puede *renderizar* componentes cliente o pasarles
props serializables; NUNCA llames desde el servidor a una función exportada por un archivo `"use client"` (Next lanza
«Attempted to call X() from the server but X is on the client» y la pantalla se cae). La lógica pura va en `lib/*.ts` y se
importa desde ambos lados.
