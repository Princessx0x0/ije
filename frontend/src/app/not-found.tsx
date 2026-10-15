import Link from "next/link";

/** Replaces Next's default 404, which follows the OS dark setting (Ije is light only). */
export default function NotFound() {
  return (
    <main className="ije-status">
      <h1>Page not found</h1>
      <p>This page does not exist, or it has moved.</p>
      <Link href="/" className="ije-link">
        Back to Ije
      </Link>
    </main>
  );
}
