import { redirect } from "next/navigation";

// The builder-fee approval now rides in the link transaction (step 02).
export default function FeeStep() {
  redirect("/start/link");
}
