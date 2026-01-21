import React, { useEffect, useState } from "react";
import { useIdentity } from "./identity-context";
import { runIdentityVectorCheck, type VectorResult } from "./identity-vector";

function IdentityProbe() {
  const { did } = useIdentity();
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[IdentityProbe] context DID:", did);
  }, [did]);
  return (
    <span data-testid="identity-probe-did" data-did={did} className="hidden">
      {did}
    </span>
  );
}

export function DidScreen() {
  const { did, publicKey } = useIdentity();
  const [vector, setVector] = useState<VectorResult | null>(null);

  useEffect(() => {
    const result = runIdentityVectorCheck();
    setVector(result);
    // eslint-disable-next-line no-console
    if (result.pass) {
      console.log("[identity-vector] PASS", result.details);
    } else {
      console.error("[identity-vector] FAIL", result.details);
    }
  }, []);

  const pkHex = Array.from(publicKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return (
    <div
      id="identity-screen"
      className="min-h-screen bg-base-100 text-base-content"
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-6">Mook Identity</h1>

        <div
          id="did-display"
          className="card bg-base-200 shadow-sm mb-6"
          data-did={did}
        >
          <div className="card-body">
            <h2 className="text-lg font-semibold opacity-70">
              Your DID:
            </h2>
            <p
              id="did-value"
              className="font-mono text-xl break-all select-all"
            >
              Your DID: {did}
            </p>
          </div>
        </div>

        <div className="card bg-base-200 shadow-sm mb-6">
          <div className="card-body">
            <h2 className="text-lg font-semibold opacity-70 mb-1">
              Public key (hex)
            </h2>
            <p
              id="pubkey-hex"
              className="font-mono text-xs break-all opacity-80"
            >
              {pkHex}
            </p>
          </div>
        </div>

        <div
          id="vector-check"
          className="card bg-base-200 shadow-sm"
          data-status={vector ? (vector.pass ? "pass" : "fail") : "pending"}
        >
          <div className="card-body">
            <h2 className="text-lg font-semibold opacity-70 mb-1">
              Cross-platform vector
            </h2>
            <p className="font-mono text-sm">
              {vector === null
                ? "Running…"
                : vector.pass
                  ? "PASS — derived pubkey + DID match priv/test_vectors/identity.json"
                  : "FAIL — see console for details"}
            </p>
          </div>
        </div>

        <IdentityProbe />
      </div>
    </div>
  );
}
