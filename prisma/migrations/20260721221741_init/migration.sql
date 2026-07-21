-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "supplier" TEXT,
    "eta" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "containerId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "photo" TEXT,
    "codigo" TEXT,
    "precioChina" REAL,
    "cantidadPorCaja" INTEGER,
    "cbmUnitario" REAL,
    "cbmTotal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Product_containerId_idx" ON "Product"("containerId");
