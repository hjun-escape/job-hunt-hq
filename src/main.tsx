import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createCapabilities } from "./capabilities/resolve";
import "./styles/tokens.css";
import "./styles/app.css";

const el = document.getElementById("root");
if (!el) throw new Error("root element missing");
createRoot(el).render(<App capabilities={createCapabilities()} />);
