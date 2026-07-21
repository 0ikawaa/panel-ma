# MA Importaciones · Plataforma de Arribos

Plataforma interna para gestionar **arribos / contenedores**: subís el Excel de cada
contenedor y la plataforma muestra, línea a línea, la **foto**, el **código**, el
**precio en China**, la **cantidad por caja**, el **CBM unitario** y el **CBM total**,
con los totales de volumen. Ideal para mostrar lo que viene y cuánto ocupa.

Construida con **Next.js + Prisma + Tailwind**. Las fotos incrustadas en las celdas del
Excel se extraen automáticamente (soporta imágenes ancladas de Excel y el formato
DISPIMG de WPS, muy usado por proveedores chinos).

---

## 🔐 Acceso

- Usuario: **admin**
- Contraseña: **admin**

Se configuran en el archivo `.env` (`ADMIN_USER` y `ADMIN_PASSWORD`).

---

## 🚀 Correr en tu PC (local)

1. Instalá las dependencias (solo la primera vez):

   ```bash
   npm install
   ```

2. Creá el archivo `.env` (copiá `.env.example` y ajustá si querés):

   ```bash
   cp .env.example .env
   ```

3. Preparás la base de datos (solo la primera vez):

   ```bash
   npx prisma migrate dev
   ```

4. Arrancás la plataforma:

   ```bash
   npm run dev
   ```

5. Abrí **http://localhost:3000** en el navegador.

Para el uso diario, con `npm run dev` alcanza.

---

## 📄 Formato del Excel

La primera hoja debe tener una fila de encabezados con columnas parecidas a:

| Foto | Código | Precio China | Cantidad por caja | CBM unitario | CBM total |
|------|--------|--------------|-------------------|--------------|-----------|

- Los nombres no tienen que ser exactos: detecta variantes (ej. "Precio China (USD)",
  "Cant. por caja", "Codigo", "CBM u.", etc.).
- Las **fotos** deben estar incrustadas en la columna Foto.
- Si falta el CBM total pero está el unitario y la cantidad, se calcula solo (y viceversa).
- Subir un Excel nuevo **reemplaza** los productos de ese contenedor.

---

## ☁️ Subir a GitHub y a la nube

### 1. GitHub

El proyecto ya tiene git inicializado. Para subirlo:

```bash
git add .
git commit -m "Plataforma de arribos"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

> El `.env` y la base local (`prisma/dev.db`) **no** se suben (están en `.gitignore`).

### 2. Base de datos en la nube (Postgres)

SQLite es perfecto en local, pero en la nube (Vercel) el disco es efímero, así que
para producción conviene Postgres (gratis en **Neon** o **Supabase**):

1. Creá una base Postgres gratis y copiá su cadena de conexión.
2. En `prisma/schema.prisma` cambiá el provider:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. Poné esa cadena en `DATABASE_URL` (en `.env` local y en las variables de entorno
   del hosting).
4. Ejecutá `npx prisma migrate deploy`.

### 3. Desplegar en Vercel

1. Importá el repo de GitHub en [vercel.com](https://vercel.com).
2. Cargá las variables de entorno: `DATABASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`,
   `AUTH_SECRET`.
3. Deploy. Vercel corre `npm run build` automáticamente.

---

## 🧩 Estructura

```
src/
  app/
    (app)/            -> páginas con sesión (Inicio, Arribos, detalle)
    api/              -> login, logout, contenedores, subida de Excel
    login/            -> pantalla de acceso
  components/         -> UI (tabla, subida, modales, menú)
  lib/
    excel.ts          -> parser de Excel + extracción de fotos
    prisma.ts         -> conexión a la base
    auth.ts           -> sesiones
prisma/schema.prisma  -> modelo de datos (Contenedor, Producto)
```
