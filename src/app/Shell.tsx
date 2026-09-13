import { useAppState } from "../store/context";
import { useRoute } from "./router";
import { NAV, PAGES } from "./routes";

export function Shell() {
  const state = useAppState();
  const route = useRoute();
  const key = route.parts[0] ?? "";
  const Page = PAGES[key];
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">Job Hunt HQ</div>
        {NAV.map((n) => (
          <a key={n.key} href={`#${n.to}`} className={key === n.key ? "nav-item active" : "nav-item"}>
            {n.label}
          </a>
        ))}
      </nav>
      <main className="main">
        {state.readOnly && (
          <div className="banner banner-warn" role="alert">
            Storage is unavailable in this view. You can browse, but changes will not be saved.
          </div>
        )}
        {!state.ready ? (
          <div className="boot">Connecting to storage…</div>
        ) : Page ? (
          <Page parts={route.parts.slice(1)} query={route.query} />
        ) : (
          <div className="empty">
            <h2>Nothing at {route.path}</h2>
            <a href="#/">Go to the dashboard</a>
          </div>
        )}
      </main>
    </div>
  );
}
