import { cookies } from "next/headers";
import { createSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return Response.json({ error: "Admin password not configured" }, { status: 500 });
  }

  if (!password || password !== adminPassword) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSessionToken(adminPassword);
  const cookieStore = cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });

  return Response.json({ success: true });
}
