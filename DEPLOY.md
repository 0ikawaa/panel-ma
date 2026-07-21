# Desplegar en Vercel (paso a paso)

La app es full-stack (Next.js + base de datos + login), así que corre en **Vercel** con una base **Postgres** en la nube. Estos son los pasos. Todo es gratis en el tier free.

## 1. Crear la base de datos Postgres

1. Entrá a <https://vercel.com> e iniciá sesión **con tu cuenta de GitHub** (`0ikawaa`).
2. En el dashboard: pestaña **Storage** → **Create Database** → **Postgres** (Neon).
3. Ponele un nombre (ej. `panel-ma-db`) y creala.
4. Copiá el valor de **`DATABASE_URL`** que te da (lo usás en el paso 3).

> Alternativa: podés crear la base gratis en <https://neon.tech> o <https://supabase.com> y copiar su connection string (`postgresql://...?sslmode=require`).

## 2. Importar el repositorio

1. Dashboard de Vercel → **Add New… → Project**.
2. Elegí el repo **`0ikawaa/panel-ma`** y hacé **Import**.
3. Vercel detecta Next.js solo. **No cambies** el build command (ya está configurado en `package.json`).

## 3. Variables de entorno

Antes de hacer deploy, en **Environment Variables** agregá estas 4:

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | La connection string de Postgres del paso 1 |
| `ADMIN_USER` | El usuario para entrar al panel (ej. `admin`) |
| `ADMIN_PASSWORD` | Una contraseña fuerte |
| `AUTH_SECRET` | Una cadena larga y aleatoria (ver abajo) |

Para generar un `AUTH_SECRET` seguro, corré en tu terminal:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Deploy

Hacé click en **Deploy**. En el build, Prisma crea las tablas automáticamente
(`prisma db push`). Cuando termine, Vercel te da el link público:

```
https://panel-ma.vercel.app   (o similar)
```

Entrás con el `ADMIN_USER` / `ADMIN_PASSWORD` que definiste.

## Nota sobre las fotos de los Excel

Las fotos se guardan como texto base64 dentro de la base. En Postgres funciona,
pero si más adelante subís muchos contenedores conviene mover las imágenes a un
almacenamiento de archivos (Vercel Blob / S3). No es necesario para empezar.

## Desarrollo local

Si querés seguir desarrollando en tu PC, ahora la app usa Postgres (no SQLite).
Opciones:
- Usar la misma base de Neon/Vercel poniendo su `DATABASE_URL` en tu `.env`.
- O instalar Postgres local y apuntar `DATABASE_URL` ahí.

Luego: `npm install` y `npm run dev`.
