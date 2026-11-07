import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary, NotificationProvider, ThemeProvider } from "@kasumi/ui";
import "@kasumi/ui/font";
import "@fontsource/caveat/400.css";
import "@/index.css";
import { App } from "@/App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider defaultMaterial="solid" storageKey="yac-canvas:theme">
      <NotificationProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </NotificationProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
