// Re-mounts on every navigation, so each page fades in rather than snapping.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}
