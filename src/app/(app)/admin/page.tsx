import { prisma } from "@/lib/prisma";
import UsersManager from "@/components/UsersManager";
import AdminTools from "@/components/AdminTools";
import { blobAvailable } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, modules: true, lastLoginAt: true },
  });

  const pendingPhotos = await prisma.product.count({
    where: { photo: { startsWith: "data:" } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Administración</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Creá usuarios y elegí a qué módulos puede acceder cada uno.
        </p>
      </div>
      <UsersManager initialUsers={users} />
      <AdminTools initialRemaining={pendingPhotos} blobAvailable={blobAvailable()} />
    </div>
  );
}
