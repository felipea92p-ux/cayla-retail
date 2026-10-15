// Lo único de Sentry que usa el navegador (ADR-0424). `errores-navegador.ts` lo descarga con `import()` cuando la pantalla ya está
// lista: importar el paquete entero así arrastraba todo lo que trae (grabar la sesión, perfiles, medir tiempos), 157,6 KB
// comprimidos; nombrando estas cuatro, el armado deja fuera lo demás.
export { captureException, init, setTag, setUser } from "@sentry/nextjs";
