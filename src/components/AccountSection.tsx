"use client";

import { useEffect, useState } from "react";
import { getSupabase, isServerMode, setServerMode } from "@/lib/supabase/client";
import {
  hasLocalData,
  isLocalMigrated,
  migrateLocalToSupabase,
} from "@/lib/supabase/migrateLocal";

// 계정 섹션 — 로그인하면 서버 저장(Supabase), 로그아웃하면 로컬 저장으로 동작 (설계 D1·D2)
// Account section — signed in uses Supabase, signed out stays local (design D1, D2)

type AccountView = "loading" | "signedOut" | "signedIn" | "migratePrompt";

const MIN_PASSWORD_LENGTH = 6;

export default function AccountSection() {
  const [view, setView] = useState<AccountView>("loading");
  const [signUpMode, setSignUpMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [canMigrate, setCanMigrate] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await getSupabase().auth.getSession();
        const session = data.session;
        if (cancelled) {
          return;
        }
        if (session) {
          // 세션은 있는데 모드 플래그가 없으면 복구한다 (localStorage 유실 대비)
          // Heal the mode flag if the session exists but the flag was lost
          if (!isServerMode()) {
            setServerMode(true);
          }
          const migratable = !isLocalMigrated() && (await hasLocalData());
          if (cancelled) {
            return;
          }
          setUserEmail(session.user.email ?? "");
          setCanMigrate(migratable);
          setView("signedIn");
        } else {
          setView("signedOut");
        }
      } catch (error) {
        console.error("[Account] failed to read session:", error);
        if (!cancelled) {
          setView("signedOut");
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인 성공 공통 처리 — 로컬 기록이 있으면 이관을 먼저 묻는다 (설계 §4)
  // Shared sign-in success path — offers migration first when local data exists
  async function enterServerMode(signedInEmail: string) {
    setServerMode(true);
    const migratable = !isLocalMigrated() && (await hasLocalData());
    if (migratable) {
      setUserEmail(signedInEmail);
      setView("migratePrompt");
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  async function handleSubmit() {
    if (busy || email.trim() === "" || password.length < MIN_PASSWORD_LENGTH) {
      if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
        setErrorText(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
      }
      return;
    }
    setBusy(true);
    setErrorText("");
    setMessage("");
    try {
      const auth = getSupabase().auth;
      if (signUpMode) {
        const { data, error } = await auth.signUp({ email: email.trim(), password });
        if (error) {
          throw error;
        }
        if (!data.session) {
          // 이메일 확인이 켜져 있으면 세션 없이 반환된다 — 메일 링크 안내
          // With email confirmation on, no session returns — guide to the mail link
          setMessage("확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
          setBusy(false);
          return;
        }
        await enterServerMode(data.session.user.email ?? "");
        return;
      }
      const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        throw error;
      }
      await enterServerMode(data.session.user.email ?? "");
    } catch (error) {
      console.error("[Account] auth failed:", error);
      setErrorText(
        signUpMode
          ? "가입하지 못했어요. 이메일 형식과 비밀번호를 확인해 주세요."
          : "로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.",
      );
      setBusy(false);
    }
  }

  // Google OAuth — 리다이렉트 방식이라 성공 시 이 페이지를 떠난다.
  // 복귀 후 세션 감지와 서버 모드 전환은 AuthSync가 담당한다 (설계 B3)
  // Google OAuth redirects away on success; AuthSync handles the return trip
  async function handleGoogleSignIn() {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorText("");
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("[Account] google sign-in failed:", error);
      setErrorText("Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await getSupabase().auth.signOut();
      setServerMode(false);
      window.location.reload();
    } catch (error) {
      console.error("[Account] sign out failed:", error);
      setErrorText("로그아웃하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  async function handleMigrate() {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorText("");
    try {
      const result = await migrateLocalToSupabase();
      setMessage(`${result.imported.toLocaleString()}개 항목을 계정으로 옮겼어요`);
      window.location.reload();
    } catch (error) {
      console.error("[Account] migration failed:", error);
      setErrorText("기록을 옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  // 시트 무스크롤 목표에 맞춘 컴팩트 입력 높이 (사용자 요청)
  // Compact input height so the settings sheet never scrolls
  const inputClass =
    "w-full rounded-xl bg-fill px-3.5 py-2.5 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint";

  if (view === "loading") {
    return <p className="mt-2 px-1 text-sm text-ink-tertiary">계정 확인 중…</p>;
  }

  if (view === "migratePrompt") {
    return (
      <div className="mt-2 rounded-xl bg-fill px-4 py-3.5">
        <p className="text-[15px] font-medium">이 기기의 기록을 계정으로 옮길까요?</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
          지금까지의 책과 기록을 {userEmail} 계정에 저장해요.
          <br />
          기기의 기록은 지워지지 않아요.
        </p>
        {errorText !== "" && <p className="mt-2 text-sm text-danger">{errorText}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleMigrate()}
          className="mt-3 w-full cursor-pointer rounded-xl bg-accent py-2.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? "옮기는 중…" : "기록 옮기기"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => window.location.reload()}
          className="mt-2 w-full cursor-pointer py-1.5 text-sm font-medium text-ink-tertiary transition-colors duration-150 hover:text-ink active:opacity-70 disabled:opacity-40"
        >
          나중에 할게요
        </button>
      </div>
    );
  }

  if (view === "signedIn") {
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium">{userEmail}</p>
            <p className="mt-0.5 text-[13px] text-ink-tertiary">서버에 저장 중</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSignOut()}
            className="shrink-0 cursor-pointer text-sm font-medium text-ink-tertiary transition-colors duration-150 hover:text-danger active:opacity-70 disabled:opacity-40"
          >
            로그아웃
          </button>
        </div>
        {canMigrate && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleMigrate()}
            className="mt-1 w-full cursor-pointer rounded-xl px-3 py-3 text-left text-[15px] font-medium text-tint active:bg-fill disabled:opacity-40"
          >
            {busy ? "옮기는 중…" : "이 기기의 기록을 계정으로 옮기기"}
          </button>
        )}
        {message !== "" && <p className="mt-2 px-1 text-sm text-tint">{message}</p>}
        {errorText !== "" && <p className="mt-2 px-1 text-sm text-danger">{errorText}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="px-1 text-[13px] leading-relaxed text-ink-secondary">
        로그인하면 기록이 계정에 저장되고 다른 기기에서도 이어볼 수 있어요
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleGoogleSignIn()}
        className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-fill py-2.5 text-[15px] font-semibold active:opacity-70 disabled:opacity-40"
      >
        <span aria-hidden className="text-[15px] font-bold">
          G
        </span>
        Google로 계속하기
      </button>
      <div className="mt-2 flex items-center gap-2 px-1" aria-hidden>
        <span className="h-px flex-1 bg-separator" />
        <span className="text-[11px] text-ink-tertiary">또는 이메일로</span>
        <span className="h-px flex-1 bg-separator" />
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        <input
          type="email"
          value={email}
          aria-label="이메일"
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="이메일"
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          aria-label="비밀번호"
          autoComplete={signUpMode ? "new-password" : "current-password"}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`}
          className={inputClass}
        />
      </div>
      {message !== "" && <p className="mt-1.5 px-1 text-sm text-tint">{message}</p>}
      {errorText !== "" && <p className="mt-1.5 px-1 text-sm text-danger">{errorText}</p>}
      {/* 주 버튼과 모드 토글을 한 행에 — 세로 공간 절약 */}
      {/* Primary action and mode toggle share one row — saves height */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || email.trim() === "" || password === ""}
          onClick={() => void handleSubmit()}
          className="flex-1 cursor-pointer rounded-xl bg-accent py-2.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? "처리 중…" : signUpMode ? "회원가입" : "로그인"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSignUpMode((previous) => !previous);
            setErrorText("");
            setMessage("");
          }}
          className="shrink-0 cursor-pointer px-2 py-2 text-[13px] font-medium text-ink-tertiary transition-colors duration-150 hover:text-ink active:opacity-70 disabled:opacity-40"
        >
          {signUpMode ? "로그인으로" : "회원가입"}
        </button>
      </div>
    </div>
  );
}
