import Link from "next/link";

import { AccountMenu } from "@/components/auth/AccountMenu";

export function AppHeader() {
  return (
    <header className="ije-header">
      <Link href="/" className="ije-wordmark">
        Ije
      </Link>
      <AccountMenu />
    </header>
  );
}
