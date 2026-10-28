import Link from "next/link";
import { Label } from "@/components/Ui";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <section className="sec first">
      <div className="pad" style={{ minHeight: "60vh", paddingTop: "6.4rem" }}>
        <Label dot>404</Label>
        <h1 className="h3" style={{ marginTop: "1.6rem" }}>Nothing here</h1>
        <p className="txt ink" style={{ marginTop: "2.4rem", maxWidth: "62rem" }}>
          This page does not exist. A receipt link may be mistyped, or the page has moved.
        </p>
        <div className="row" style={{ marginTop: "3.2rem" }}>
          <Link href="/" className="pill">
            Home
          </Link>
          <Link href="/stats" className="pill ghost">
            Track record
          </Link>
        </div>
      </div>
    </section>
  );
}
