import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/session-token";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : "/login");
}
