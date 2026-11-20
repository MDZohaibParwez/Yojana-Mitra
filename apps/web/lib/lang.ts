import { cookies, headers } from "next/headers";
import { isLang, type Lang } from "@ym/core";

export async function currentLang(): Promise<Lang> {
  const c = (await cookies()).get("lang")?.value;
  if (isLang(c)) return c;
  const al = (await headers()).get("accept-language") ?? "";
  const first = al.split(",")[0]?.split("-")[0]?.trim();
  if (isLang(first) && first !== "en") return first;
  return al.toLowerCase().startsWith("en") ? "en" : "hi";
}
