import type { ReactNode } from "react";
import Link from "next/link";
import LogoutButton from "./logout-button";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-gray-800 bg-gray-900 p-4">
        <h1 className="mb-6 text-lg font-bold text-gray-100">Rhumint</h1>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-gray-100">
            Dashboard
          </Link>
          <Link href="/licenses" className="rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-gray-100">
            Licenses
          </Link>
        </nav>
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
