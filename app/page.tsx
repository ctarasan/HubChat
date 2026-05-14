"use client";

import { useEffect } from "react";
import { hasRequiredSessionConfig, loadSessionConfig } from "../src/ui/sessionConfig.js";

export default function HomePage() {
  useEffect(() => {
    const s = loadSessionConfig(globalThis.localStorage);
    if (hasRequiredSessionConfig(s)) {
      window.location.replace("/dashboard");
    } else {
      window.location.replace("/login");
    }
  }, []);
  return null;
}
