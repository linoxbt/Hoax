"use client";
// The use-case list: one open at a time, a plus that turns into a minus.
import { useState } from "react";

export function Accordion({ items }: { items: Array<[string, string]> }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="acc">
      {items.map(([title, text], i) => (
        <div key={title} className={`acc-item${open === i ? " open" : ""}`}>
          <button className="acc-head" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
            <span className="h5">{title}</span>
            <span className="acc-ic" aria-hidden />
          </button>
          <div className="acc-body">
            <div>
              <p className="txt">{text}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
