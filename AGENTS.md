<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# El trabajo va directo a `main`

Commitear en `main` y `git push origin main`. **No** crear rama de feature ni abrir PR salvo pedido explícito.

Vercel deploya `main` automáticamente, así que un cambio que queda en una rama no llega a producción. Esto vale en cualquier máquina desde la que se trabaje.

Como pushear a `main` es publicar en producción, la verificación va **antes** del push, no después:

```bash
npx vitest run      # los 300+ tests tienen que pasar
npx next build      # el build tiene que compilar
```

Si el cambio toca `prisma/schema.prisma`, la migración versionada va en el mismo commit: el deploy corre `prisma migrate deploy` (ver README).
