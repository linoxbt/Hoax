import { Btn, Eyebrow } from "@/components/Ui";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <section className="pg-center-wrap">
      <div className="card pg-center">
        <div className="pg-center-code" aria-hidden>
          404
        </div>
        <Eyebrow>404 / Page not found</Eyebrow>
        <h1 className="h2">Nothing here</h1>
        <p className="txt">This page does not exist. A receipt link may be mistyped, or the page has moved.</p>
        <div className="pg-center-act">
          <Btn href="/" fill>
            Home
          </Btn>
          <Btn href="/stats">Track record</Btn>
        </div>
      </div>
    </section>
  );
}
