import React, { createContext, useContext, useMemo } from "react";
import { getOrCreateIdentity, type Identity } from "./identity";

const IdentityContext = createContext<Identity | null>(null);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const identity = useMemo(() => getOrCreateIdentity(), []);
  return (
    <IdentityContext.Provider value={identity}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): Identity {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentity must be used inside an <IdentityProvider>");
  }
  return ctx;
}
