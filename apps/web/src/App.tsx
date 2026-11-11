import { useCallback, useEffect, useState } from "react";
import { PROTOCOL_VERSION } from "@danpan/shared";

type Readiness = "checking" | "ready" | "unavailable";

export function App() {
  const [readiness, setReadiness] = useState<Readiness>("checking");

  const checkServer = useCallback(async () => {
    setReadiness("checking");
    try {
      const response = await fetch("/api/readyz", { cache: "no-store" });
      setReadiness(response.ok ? "ready" : "unavailable");
    } catch {
      setReadiness("unavailable");
    }
  }, []);

  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  const readinessText = {
    checking: "확인 중",
    ready: "서버 준비 완료",
    unavailable: "서버 연결 대기",
  }[readiness];

  return (
    <main className="shell">
      <section className="welcome-card" aria-labelledby="app-title">
        <div className="brand-mark" aria-hidden="true">
          <span className="stone stone-black" />
          <span className="stone stone-white" />
        </div>
        <p className="eyebrow">한 판으로 만나는 오목</p>
        <h1 id="app-title">단판 오목</h1>
        <p className="intro">
          네트워크 대국과 오프라인 혼자 놀기를 준비하고 있습니다.
        </p>
        <div className={`server-state server-state-${readiness}`} role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {readinessText}
        </div>
        <button className="check-button" type="button" onClick={() => void checkServer()}>
          서버 상태 확인
        </button>
        <p className="build-note">프로토콜 v{PROTOCOL_VERSION} · 기본 화면 준비 단계</p>
      </section>
    </main>
  );
}
