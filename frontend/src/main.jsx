import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import App from "./App";
import "./index.css";

const saved = localStorage.getItem("itms-theme");
document.documentElement.setAttribute(
  "data-bs-theme",
  saved === "light" ? "light" : "dark",
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
