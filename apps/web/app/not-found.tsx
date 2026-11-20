import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 pt-6">
      <h1 className="text-2xl font-bold">404</h1>
      <Link href="/" className="text-primary underline">Yojana Mitra</Link>
    </div>
  );
}
