import { createRoot } from "react-dom/client";
import WardPage from "../app/page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<WardPage />);
void navigator.serviceWorker?.register("/sw.js").catch((error) => console.warn("Could not cache Acorn for offline reloads.", error));
