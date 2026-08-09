import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  function canPerm(module, action) {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    // Mirrors the backend hasPerm() whitelist: employees reach only the
    // support module (plus their own inventory requests, which are
    // requireAuth routes and not gated through here).
    if (user.role === "employee")
      return module === "support" && (action === "read" || action === "create");
    return user.permissions?.[module]?.[`can_${action}`] === true;
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => {
      // logout endpoint failure is non-fatal; clear local state regardless
    });
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, setUser, loading, canPerm, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
