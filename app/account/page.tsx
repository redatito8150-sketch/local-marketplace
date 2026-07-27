"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Lock, Mail, Phone, ShieldCheck, Sparkles, User } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";
import CaptchaWidget, { type CaptchaWidgetHandle } from "@/components/account/CaptchaWidget";
import PasswordInput from "@/components/shared/PasswordInput";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton";
import { decidePostAuthDestination } from "@/lib/auth/postAuthDestination";

const CAPTCHA_REQUIRED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const FLOATING_SCENES = [
  [
    { src: "/images/products/saqr-sand-linen-blazer/main.webp", label: "Linen blazer", className: "left-[7%] top-[10%] w-[39%] rotate-[-8deg]" },
    { src: "/images/products/nabta-coral-daypack/main.webp", label: "Coral daypack", className: "right-[5%] top-[4%] w-[31%] rotate-[9deg]" },
    { src: "/images/products/saqr-leather-loafer/main.webp", label: "Leather loafer", className: "bottom-[5%] left-[10%] w-[31%] rotate-[7deg]" },
    { src: "/images/products/nabta-sky-pocket-tee/main.webp", label: "Pocket tee", className: "bottom-[7%] right-[5%] w-[38%] rotate-[-6deg]" },
  ],
  [
    { src: "/images/products/nabta-sage-chore-jacket/main.webp", label: "Chore jacket", className: "left-[5%] top-[7%] w-[38%] rotate-[7deg]" },
    { src: "/images/products/saqr-field-bag/main.webp", label: "Field bag", className: "right-[7%] top-[9%] w-[30%] rotate-[-10deg]" },
    { src: "/images/products/nabta-sunstep-sneaker/main.webp", label: "Sunstep sneaker", className: "bottom-[4%] left-[8%] w-[34%] rotate-[-5deg]" },
    { src: "/images/products/saqr-navy-knit-polo/main.webp", label: "Knit polo", className: "bottom-[5%] right-[4%] w-[39%] rotate-[6deg]" },
  ],
  [
    { src: "/images/products/saqr-stone-overshirt/main.webp", label: "Stone overshirt", className: "left-[6%] top-[7%] w-[39%] rotate-[-6deg]" },
    { src: "/images/products/nabta-cloud-cardigan/main.webp", label: "Cloud cardigan", className: "right-[5%] top-[8%] w-[36%] rotate-[8deg]" },
    { src: "/images/products/nabta-peach-play-trouser/main.webp", label: "Play trouser", className: "bottom-[4%] left-[7%] w-[34%] rotate-[7deg]" },
    { src: "/images/products/saqr-charcoal-trouser/main.webp", label: "Charcoal trouser", className: "bottom-[5%] right-[5%] w-[32%] rotate-[-7deg]" },
  ],
] as const;

const inputClass =
  "w-full rounded-2xl border border-[#d9cfc4] bg-white/75 py-3.5 pl-11 pr-4 text-[14px] text-ink outline-none transition focus:border-mahalyred/50 focus:bg-white focus:ring-4 focus:ring-mahalyred/5";
const passwordClass =
  "w-full rounded-2xl border border-[#d9cfc4] bg-white/75 py-3.5 pl-11 pr-11 text-[14px] text-ink outline-none transition focus:border-mahalyred/50 focus:bg-white focus:ring-4 focus:ring-mahalyred/5";

function FloatingWardrobe() {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setScene((value) => (value + 1) % FLOATING_SCENES.length), 5200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative h-full min-h-[640px] overflow-hidden rounded-[32px] bg-[#211d1b]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_38%_24%,rgba(183,31,26,.42),transparent_34%),radial-gradient(circle_at_78%_68%,rgba(231,211,174,.22),transparent_31%),linear-gradient(145deg,#171412_0%,#2d2521_58%,#151311_100%)]" />
      <div className="auth-stars absolute inset-0 opacity-75" />
      <div className="absolute -left-24 top-[38%] h-64 w-64 rounded-full bg-mahalyred/20 blur-[90px]" />
      <div className="absolute -right-20 bottom-8 h-72 w-72 rounded-full bg-sand/15 blur-[100px]" />

      <AnimatePresence mode="wait">
        <motion.div
          key={scene}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.035 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
          className="absolute inset-x-0 bottom-0 top-[22%]"
        >
          {FLOATING_SCENES[scene].map((item, index) => (
            <motion.div
              key={item.src}
              animate={{ y: [0, index % 2 ? -14 : 17, 0], x: [0, index % 2 ? 8 : -7, 0] }}
              transition={{ duration: 6.8 + index, repeat: Infinity, ease: "easeInOut", delay: index * 0.35 }}
              className={`absolute ${item.className}`}
            >
              <div className="relative aspect-square overflow-hidden rounded-[28px] border border-white/15 bg-white/10 shadow-[0_30px_80px_rgba(0,0,0,.38)] backdrop-blur-sm">
                <Image src={item.src} alt={item.label} fill sizes="22vw" className="object-cover mix-blend-lighten" />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-x-0 top-0 z-20 p-8 xl:p-10">
        <div className="flex items-center justify-between text-white">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#efcbb1]" /> Made in Egypt
          </span>
          <div className="flex gap-1.5">
            {FLOATING_SCENES.map((_, index) => <span key={index} className={`h-1 rounded-full transition-all duration-500 ${index === scene ? "w-7 bg-white" : "w-2 bg-white/30"}`} />)}
          </div>
        </div>
        <h2 className="mt-7 max-w-[470px] font-serif text-[44px] font-semibold leading-[0.94] tracking-[-0.04em] text-white xl:text-[58px]">
          Your wardrobe.<br /><span className="text-[#e8b8b2]">A new orbit.</span>
        </h2>
        <p className="mt-5 max-w-[390px] text-[13px] leading-6 text-white/65">
          Discover independent Egyptian labels, uncommon pieces, and the stories behind every detail.
        </p>
      </div>

      <div className="absolute bottom-7 left-8 z-20 flex items-center gap-3 text-[11px] text-white/50">
        <span className="h-px w-10 bg-white/25" /> New pieces drift in every few seconds
      </div>
    </div>
  );
}

function SocialOptions({ next }: { next?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <GoogleAuthButton next={next} label="Google" compact />
      <button type="button" disabled title="Available soon" className="group relative flex h-[50px] items-center justify-center gap-1.5 rounded-2xl border border-[#d9cfc4] bg-white/70 text-[11px] font-semibold text-ink/55 sm:gap-2 sm:text-[13px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">A</span><span>Apple</span>
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[9px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">Available soon</span>
      </button>
      <button type="button" disabled title="Available soon" className="group relative flex h-[50px] items-center justify-center gap-1.5 rounded-2xl border border-[#d9cfc4] bg-white/70 text-[10px] font-semibold text-ink/55 sm:gap-2 sm:text-[13px]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] text-[14px] font-bold text-white">f</span><span>Facebook</span>
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[9px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">Available soon</span>
      </button>
    </div>
  );
}

function MobileWardrobe() {
  return (
    <div className="relative mt-5 h-[150px] overflow-hidden rounded-[24px] bg-[#211d1b] lg:hidden">
      <div className="auth-stars absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(183,31,26,.42),transparent_38%),linear-gradient(120deg,transparent,rgba(231,211,174,.12))]" />
      {FLOATING_SCENES[0].slice(0, 3).map((item, index) => (
        <motion.div key={item.src} animate={{ y: [0, index % 2 ? 7 : -7, 0], rotate: [index * 5 - 4, index * 5 + 2, index * 5 - 4] }} transition={{ duration: 5 + index, repeat: Infinity, ease: "easeInOut" }} className={`absolute top-5 h-[110px] w-[110px] overflow-hidden rounded-[20px] border border-white/15 shadow-2xl ${index === 0 ? "left-5" : index === 1 ? "left-1/2 -translate-x-1/2" : "right-5"}`}>
          <Image src={item.src} alt={item.label} fill sizes="110px" className="object-cover" />
        </motion.div>
      ))}
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/75 backdrop-blur">New pieces in orbit</span>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#f4eee7]" />}><AccountPageContent /></Suspense>;
}

function AccountPageContent() {
  const { user, profile, loading, mfaChallenge, signIn, signUp, verifyMfaChallenge } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const oauthFailed = searchParams.get("error") === "oauth_failed";
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const captchaRef = useRef<CaptchaWidgetHandle>(null);

  useEffect(() => {
    if (!user || loading || mfaChallenge || !profile) return;
    router.replace(decidePostAuthDestination(profile.onboardingCompletedAt, nextParam));
  }, [user, profile, loading, mfaChallenge, router, nextParam]);

  const switchMode = (value: "sign-in" | "create") => {
    setMode(value);
    setError("");
    setConfirmationMessage("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (CAPTCHA_REQUIRED && !captchaToken) return setError("Please complete the verification challenge");
    if (mode === "create" && password !== confirmPassword) return setError("Passwords do not match");
    if (mode === "create" && !acceptedTerms) return setError("Please accept the Terms and Privacy Policy to continue");
    setSubmitting(true);
    setError("");
    setConfirmationMessage("");
    const result = mode === "sign-in"
      ? await signIn(email, password, captchaToken || undefined)
      : await signUp(fullName, email, phone, password, captchaToken || undefined);
    if (result.error) {
      setError(result.error);
      captchaRef.current?.reset();
      setCaptchaToken("");
    } else if (result.needsEmailConfirmation) {
      setConfirmationMessage("Check your inbox to confirm your account before signing in.");
    }
    setSubmitting(false);
  };

  const handleMfaSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await verifyMfaChallenge(mfaCode);
    if (result.error) setError(result.error);
    setSubmitting(false);
  };

  if (user && !mfaChallenge) {
    return <main className="grid min-h-screen place-items-center bg-[#f4eee7]"><div className="flex items-center gap-3 text-sm text-ink/55"><span className="h-2 w-2 animate-pulse rounded-full bg-mahalyred" />Preparing your space…</div></main>;
  }

  if (user && mfaChallenge) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4eee7] p-6">
        <form onSubmit={handleMfaSubmit} className="w-full max-w-md rounded-[30px] border border-white/70 bg-white/75 p-8 shadow-card backdrop-blur-xl">
          <ShieldCheck className="h-9 w-9 text-mahalyred" />
          <h1 className="mt-6 font-serif text-3xl font-semibold">One more step</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft/60">Enter the 6-digit code from your authenticator app.</p>
          <input type="text" inputMode="numeric" placeholder="123456" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} className="mt-7 w-full rounded-2xl border border-[#d9cfc4] bg-white py-4 text-center text-lg tracking-[0.35em] outline-none focus:border-mahalyred/50" />
          {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="mt-4 w-full rounded-2xl bg-mahalyred py-4 text-sm font-semibold text-white transition hover:bg-mahalyred-dark disabled:opacity-60">{submitting ? "Verifying…" : "Verify & continue"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4eee7] p-3 sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-mahalyred/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 right-[25%] h-[420px] w-[420px] rounded-full bg-sand/35 blur-[120px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-48px)] max-w-[1540px] overflow-hidden rounded-[36px] border border-white/70 bg-white/48 shadow-[0_36px_100px_rgba(77,53,39,.14)] backdrop-blur-xl lg:grid-cols-[1.08fr_.92fr]">
        <div className="hidden p-3 lg:block"><FloatingWardrobe /></div>

        <section className="relative flex min-h-[760px] flex-col px-5 py-5 sm:px-9 lg:min-h-0 lg:px-12 xl:px-16">
          <div className="flex items-center justify-between">
            <Logo href="/" size="sm" />
            <div className="flex items-center rounded-full border border-[#d9cfc4] bg-white/65 p-1 text-[10px] font-bold uppercase tracking-[0.08em]">
              <button type="button" className="rounded-full bg-ink px-3 py-1.5 text-white">EN</button>
              <button type="button" disabled title="متوفر قريبًا" className="group relative rounded-full px-3 py-1.5 text-ink/35">
                عربي
                <span className="pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[9px] text-white opacity-0 shadow-lg transition group-hover:opacity-100">متوفر قريبًا</span>
              </button>
            </div>
          </div>
          <MobileWardrobe />

          <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col justify-center py-10 lg:py-8">
            <Link href="/" className="mb-7 inline-flex w-fit items-center gap-2 text-[11px] font-semibold text-ink/45 transition hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to Mahaly</Link>

            <div className="mb-7 flex rounded-2xl bg-[#e9e0d7]/65 p-1.5">
              <button type="button" onClick={() => switchMode("sign-in")} className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition ${mode === "sign-in" ? "bg-white text-ink shadow-sm" : "text-ink/45"}`}>Sign in</button>
              <button type="button" onClick={() => switchMode("create")} className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition ${mode === "create" ? "bg-white text-ink shadow-sm" : "text-ink/45"}`}>Create account</button>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mahalyred">{mode === "sign-in" ? "Welcome home" : "Your story starts here"}</p>
              <h1 className="mt-2 font-serif text-[38px] font-semibold leading-none tracking-[-0.035em] text-ink sm:text-[46px]">{mode === "sign-in" ? "Step back into your world." : "Join the new local."}</h1>
              <p className="mt-3 text-[13px] leading-6 text-ink-soft/55">{mode === "sign-in" ? "Your saved pieces, orders, and favorite makers are waiting." : "Save discoveries, follow local makers, and track every order in one place."}</p>
            </div>

            {oauthFailed && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">Google sign-in didn&apos;t complete. Please try again or continue with email.</p>}

            <div className="mt-6"><SocialOptions next={nextParam} /></div>
            <div className="my-5 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.16em] text-ink/30"><span className="h-px flex-1 bg-[#d9cfc4]" />or use email<span className="h-px flex-1 bg-[#d9cfc4]" /></div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "create" && <div className="relative"><User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /><input type="text" placeholder="Full name" required value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} /></div>}
              <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /><input type="email" placeholder="Email address" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></div>
              {mode === "create" && <div className="relative"><Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" /><input type="tel" placeholder="Phone number" required value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} /></div>}
              <PasswordInput icon={Lock} placeholder="Password" required minLength={6} autoComplete={mode === "create" ? "new-password" : "current-password"} value={password} onChange={setPassword} inputClassName={passwordClass} />
              {mode === "create" && <PasswordInput icon={Lock} placeholder="Confirm password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} inputClassName={passwordClass} />}

              {mode === "sign-in" ? (
                <div className="flex items-center justify-between pt-1 text-[11px]"><span className="inline-flex items-center gap-1.5 text-ink/35"><Check className="h-3.5 w-3.5 text-mahalyred" />Secure sign in</span><Link href="/forgot-password" className="font-semibold text-ink/55 hover:text-mahalyred">Forgot password?</Link></div>
              ) : (
                <label className="flex items-start gap-2.5 pt-1 text-[11px] leading-5 text-ink/55"><input type="checkbox" className="mt-1 accent-mahalyred" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the <Link href="/terms" className="font-semibold text-ink hover:text-mahalyred">Terms</Link> and <Link href="/privacy" className="font-semibold text-ink hover:text-mahalyred">Privacy Policy</Link>.</span></label>
              )}

              <CaptchaWidget key={mode} ref={captchaRef} onToken={setCaptchaToken} />
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">{error}</p>}
              {confirmationMessage && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[12px] font-medium text-emerald-800">{confirmationMessage}</p>}

              <button type="submit" disabled={submitting} className="group flex w-full items-center justify-between rounded-2xl bg-mahalyred px-5 py-4 text-[13px] font-semibold text-white shadow-[0_14px_30px_rgba(183,31,26,.22)] transition hover:-translate-y-0.5 hover:bg-mahalyred-dark disabled:cursor-not-allowed disabled:opacity-60">
                <span>{submitting ? "Please wait…" : mode === "sign-in" ? "Enter Mahaly" : "Create my account"}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>
          </div>

          <p className="text-center text-[9px] uppercase tracking-[0.14em] text-ink/25">Independent brands · Secure checkout · Made with purpose</p>
        </section>
      </div>
    </main>
  );
}
