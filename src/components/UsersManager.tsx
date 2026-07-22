"use client";

import { useState } from "react";
import { MODULES } from "@/lib/modules";

interface User {
  id: string;
  username: string;
  name: string | null;
  modules: string[];
}

function ModuleChecks({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {MODULES.map((m) => {
        const on = selected.includes(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onToggle(m.key)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              on
                ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5"
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded ${
                on ? "bg-teal-500 text-white" : "border border-white/20"
              }`}
            >
              {on && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function UsersManager({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);

  // Alta
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [newModules, setNewModules] = useState<string[]>(["embarques", "buscar"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edición
  const [editId, setEditId] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function toggle(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password, modules: newModules }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el usuario");
      } else {
        setUsers((u) => [...u, data]);
        setUsername("");
        setName("");
        setPassword("");
        setNewModules(["embarques", "buscar"]);
      }
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modules: editModules,
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUsers((u) => u.map((x) => (x.id === id ? data : x)));
        setEditId(null);
        setEditPassword("");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este usuario?")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) setUsers((u) => u.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Alta de usuario */}
      <form onSubmit={createUser} className="card space-y-4 p-5">
        <h2 className="text-lg font-bold text-white">Nuevo usuario</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Usuario</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ej: mateo"
              className="field"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Opcional"
              className="field"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Contraseña</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
              placeholder="Mínimo 4 caracteres"
              className="field"
              required
            />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Módulos con acceso</label>
          <ModuleChecks
            selected={newModules}
            onToggle={(k) => setNewModules((m) => toggle(m, k))}
          />
        </div>
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {creating ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>

      {/* Lista de usuarios */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Usuarios ({users.length})</h2>
        {users.length === 0 && (
          <div className="card border-dashed p-8 text-center text-sm text-zinc-400">
            Todavía no hay usuarios creados. El administrador principal ingresa con
            las credenciales del sistema.
          </div>
        )}
        {users.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white">
                {(u.name ?? u.username).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white">{u.name ?? u.username}</p>
                <p className="text-xs text-zinc-500">@{u.username}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditId(editId === u.id ? null : u.id);
                    setEditModules(u.modules);
                    setEditPassword("");
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
                >
                  {editId === u.id ? "Cerrar" : "Editar"}
                </button>
                <button
                  onClick={() => remove(u.id)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {editId !== u.id ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {u.modules.length === 0 && (
                  <span className="text-xs text-zinc-500">Sin módulos</span>
                )}
                {MODULES.filter((m) => u.modules.includes(m.key)).map((m) => (
                  <span
                    key={m.key}
                    className="rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-200"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">Módulos</label>
                  <ModuleChecks
                    selected={editModules}
                    onToggle={(k) => setEditModules((m) => toggle(m, k))}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Nueva contraseña (opcional)
                    </label>
                    <input
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      type="text"
                      placeholder="Dejar vacío para no cambiar"
                      className="field"
                    />
                  </div>
                  <button
                    onClick={() => saveEdit(u.id)}
                    disabled={savingId === u.id}
                    className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {savingId === u.id ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
