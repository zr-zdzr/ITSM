import React, { createContext, useContext, useEffect, useState } from "react";
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
    return user.permissions?.[module]?.[`can_${action}`] === true;
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, setUser, loading, canPerm, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
