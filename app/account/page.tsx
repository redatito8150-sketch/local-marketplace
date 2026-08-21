"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Lock, Mail, Phone, ShieldCheck, User } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";
import PasswordInput from "@/components/shared/PasswordInput";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton";
import AuthOrbitStage from "@/components/auth/AuthOrbitStage";
import AuthPageSkeleton from "@/components/auth/AuthPageSkeleton";
import TotpCodeInput from "@/components/auth/TotpCodeInput";
import { decidePostAuthDestination, getAccountEntryReturnPath } from "@/lib/auth/postAuthDestination";
import { isCompleteTotpCode } from "@/lib/auth/oneTimeCode";

const inputClass =
  "w-full rounded-2xl border border-[#d9cfc4] bg-white/75 py-3.5 pl-11 pr-4 text-[14px] text-ink outline-none transition focus:border-mahalyred/50 focus:bg-white focus:ring-4 focus:ring-mahalyred/5";
const passwordClass =
  "w-full rounded-2xl border border-[#d9cfc4] bg-white/75 py-3.5 pl-11 pr-11 text-[14px] text-ink outline-none transition focus:border-mahalyred/50 focus:bg-white focus:ring-4 focus:ring-mahalyred/5";

function SocialOptions({ next }: { next?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <GoogleAuthButton next={next} label="Google" compact />
      <button type="button" disabled title="Available soon" className="group relative flex h-[50px] cursor-not-allowed items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/45 text-[11px] font-semibold text-white/28 grayscale sm:gap-2 sm:text-[13px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white/45">A</span><span>Apple</span>
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[9px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">Available soon</span>
      </button>
      <button type="button" disabled title="Available soon" className="group relative flex h-[50px] cursor-not-allowed items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/45 text-[10px] font-semibold text-white/28 grayscale sm:gap-2 sm:text-[13px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[14px] font-bold text-white/45">f</span><span>Facebook</span>
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[9px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">Available soon</span>
      </button>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense fallback={<AuthPageSkeleton />}><AccountPageContent /></Suspense>;
}

function AccountPageContent() {
  const { user, profile, loading, mfaChallenge, mfaError, signIn, signUp, verifyMfaChallenge, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const accountEntryReturnPath = getAccountEntryReturnPath(nextParam);
  const oauthFailed = searchParams.get("error") === "oauth_failed";
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    if (!user || loading || mfaChallenge || mfaError || !profile) return;
    router.replace(decidePostAuthDestination(profile, accountEntryReturnPath));
  }, [user, profile, loading, mfaChallenge, mfaError, router, accountEntryReturnPath]);

  const switchMode = (value: "sign-in" | "create") => {
    setMode(value);
    setError("");
    setConfirmationMessage("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "create" && password !== confirmPassword) return setError("Passwords do not match");
    if (mode === "create" && !acceptedTerms) return setError("Please accept the Terms and Privacy Policy to continue");
    setSubmitting(true);
    setError("");
    setConfirmationMessage("");
    const result = mode === "sign-in"
      ? await signIn(email, password)
      : await signUp(fullName, email, phone, password);
    if (result.error) {
      setError(result.error);
    } else if (result.needsEmailConfirmation) {
      setConfirmationMessage("Check your inbox to confirm your account before signing in.");
    }
    setSubmitting(false);
  };

  const handleMfaSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isCompleteTotpCode(mfaCode)) {
      setError("Enter all 6 digits from your authenticator app.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await verifyMfaChallenge(mfaCode);
    if (result.error) setError(result.error);
    setSubmitting(false);
  };

  if (loading) {
    return <AuthPageSkeleton />;
  }

  if (user && mfaError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#FAFAF7] p-6">
        <section className="w-full max-w-md rounded-[30px] border border-white/70 bg-white/75 p-8 shadow-card backdrop-blur-xl">
          <ShieldCheck className="h-9 w-9 text-mahalyred" />
          <h1 className="mt-6 font-serif text-3xl font-semibold">Verification is temporarily unavailable</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-ink-soft/70">{mfaError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-7 w-full rounded-2xl bg-mahalyred py-4 text-sm font-semibold text-white transition hover:bg-mahalyred-dark">Retry verification</button>
          <button type="button" onClick={() => void signOut()} className="mt-3 w-full rounded-2xl border border-[#d9cfc4] bg-white py-4 text-sm font-semibold text-ink transition hover:border-mahalyred/30">Sign out</button>
        </section>
      </main>
    );
  }

  if (user && !mfaChallenge) {
    return <main className="grid min-h-screen place-items-center bg-[#FAFAF7]"><div className="flex items-center gap-3 text-sm text-ink/55"><span className="h-2 w-2 animate-pulse rounded-full bg-mahalyred" />Preparing your space…</div></main>;
  }

  if (user && mfaChallenge) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#FAFAF7] p-6">
        <form onSubmit={handleMfaSubmit} className="w-full max-w-md rounded-[30px] border border-white/70 bg-white/75 p-8 shadow-card backdrop-blur-xl">
          <ShieldCheck className="h-9 w-9 text-mahalyred" />
          <h1 className="mt-6 font-serif text-3xl font-semibold">One more step</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft/60">Enter the 6-digit code from your authenticator app. This verification stays active for your current signed-in session; you will be asked again after signing out or when the session expires.</p>
          <TotpCodeInput
            value={mfaCode}
            onChange={(value) => {
              setMfaCode(value);
              if (error) setError("");
            }}
            disabled={submitting}
            invalid={Boolean(error)}
          />
          {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">{error}</p>}
          <button type="submit" disabled={submitting || !isCompleteTotpCode(mfaCode)} className="mt-4 w-full rounded-2xl bg-mahalyred py-4 text-sm font-semibold text-white transition hover:bg-mahalyred-dark disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Verifying…" : "Verify & continue"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#090607] p-3 sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#7f0e15]/32 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-48 right-[18%] h-[560px] w-[560px] rounded-full bg-[#4d070d]/42 blur-[150px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(128deg,rgba(200,89,86,.12),transparent_38%,rgba(0,0,0,.62))]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-48px)] max-w-[1540px] overflow-hidden rounded-[36px] border border-white/10 bg-[#160b0e]/72 shadow-[0_36px_120px_rgba(0,0,0,.48)] backdrop-blur-xl lg:grid-cols-[1.08fr_.92fr]">
        <motion.div initial={{ x: "103%" }} animate={{ x: 0 }} transition={{ duration: 1.15, ease: [0.76, 0, 0.24, 1] }} className="hidden p-3 lg:block"><AuthOrbitStage /></motion.div>

        <motion.section initial={{ x: "-103%" }} animate={{ x: 0 }} transition={{ duration: 1.15, ease: [0.76, 0, 0.24, 1] }} className="relative flex min-h-[760px] flex-col bg-[linear-gradient(145deg,rgba(42,14,18,.96),rgba(15,8,10,.98))] px-5 py-5 text-[#f8efed] sm:px-9 lg:min-h-0 lg:px-12 xl:px-16">
          <div className="flex items-center justify-between">
            <Logo href="/" size="sm" />
            <div className="flex items-center rounded-full border border-white/10 bg-black/30 p-1 text-[10px] font-bold uppercase tracking-[0.08em]">
              <button type="button" className="rounded-full bg-mahalyred px-3 py-1.5 text-white">EN</button>
              <button type="button" disabled title="متوفر قريبًا" className="group relative rounded-full px-3 py-1.5 text-white/30">
                عربي
                <span className="pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[9px] text-white opacity-0 shadow-lg transition group-hover:opacity-100">متوفر قريبًا</span>
              </button>
            </div>
          </div>
          <div className="mt-5 lg:hidden"><AuthOrbitStage compact /></div>

          <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col justify-center py-10 lg:py-8">
            <Link href="/" className="mb-7 inline-flex w-fit items-center gap-2 text-[11px] font-semibold text-white/38 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back to Zakhnook</Link>

            <div className="mb-7 flex rounded-2xl border border-white/5 bg-black/25 p-1.5">
              <button type="button" onClick={() => switchMode("sign-in")} className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition ${mode === "sign-in" ? "bg-white/12 text-white shadow-sm" : "text-white/35"}`}>Sign in</button>
              <button type="button" onClick={() => switchMode("create")} className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition ${mode === "create" ? "bg-white/12 text-white shadow-sm" : "text-white/35"}`}>Create account</button>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mahalyred">{mode === "sign-in" ? "Welcome home" : "Your story starts here"}</p>
              <h1 className="mt-2 font-serif text-[38px] font-semibold leading-none tracking-[-0.035em] text-[#fff6f3] sm:text-[46px]">{mode === "sign-in" ? "Step back into your world." : "Join the new local."}</h1>
              <p className="mt-3 text-[13px] leading-6 text-white/45">{mode === "sign-in" ? "Your saved pieces, orders, and favorite makers are waiting." : "Save discoveries, follow local makers, and track every order in one place."}</p>
            </div>

            {oauthFailed && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">Google sign-in didn&apos;t complete. Please try again or continue with email.</p>}

            <div className="mt-6"><SocialOptions next={accountEntryReturnPath} /></div>
            <div className="my-5 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.16em] text-white/25"><span className="h-px flex-1 bg-white/10" />or use email<span className="h-px flex-1 bg-white/10" /></div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "create" && <div className="relative"><User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /><input type="text" placeholder="Full name" required value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} /></div>}
              <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /><input type="email" placeholder="Email address" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></div>
              {mode === "create" && <div className="relative"><Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /><input type="tel" placeholder="Phone number" required value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} /></div>}
              <PasswordInput icon={Lock} placeholder="Password" required minLength={6} autoComplete={mode === "create" ? "new-password" : "current-password"} value={password} onChange={setPassword} inputClassName={passwordClass} />
              {mode === "create" && <PasswordInput icon={Lock} placeholder="Confirm password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} inputClassName={passwordClass} />}

              {mode === "sign-in" ? (
                <div className="flex items-center justify-between pt-1 text-[11px]"><span className="inline-flex items-center gap-1.5 text-white/30"><Check className="h-3.5 w-3.5 text-mahalyred" />Secure sign in</span><Link href="/forgot-password" className="font-semibold text-white/45 hover:text-white">Forgot password?</Link></div>
              ) : (
                <label className="flex items-start gap-2.5 pt-1 text-[11px] leading-5 text-white/42"><input type="checkbox" className="mt-1 accent-mahalyred" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the <Link href="/terms" className="font-semibold text-white hover:text-mahalyred-soft">Terms</Link> and <Link href="/privacy" className="font-semibold text-white hover:text-mahalyred-soft">Privacy Policy</Link>.</span></label>
              )}

              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">{error}</p>}
              {confirmationMessage && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[12px] font-medium text-emerald-800">{confirmationMessage}</p>}

              <button type="submit" disabled={submitting} className="group flex w-full items-center justify-between rounded-2xl bg-mahalyred px-5 py-4 text-[13px] font-semibold text-white shadow-[0_14px_30px_rgba(200,89,86,.22)] transition hover:-translate-y-0.5 hover:bg-mahalyred-dark disabled:cursor-not-allowed disabled:opacity-60">
                <span>{submitting ? "Please wait…" : mode === "sign-in" ? "Enter Zakhnook" : "Create my account"}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>
          </div>

          <p className="text-center text-[9px] uppercase tracking-[0.14em] text-white/18">Independent brands · Secure checkout · Made with purpose</p>
        </motion.section>
      </div>
    </main>
  );
}
