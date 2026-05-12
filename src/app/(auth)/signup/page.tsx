"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName, preferred_language: language },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("users").insert({
        id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        preferred_language: language,
      });
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{
          background: "radial-gradient(circle at 20% 0%, #f0e7ff 0%, transparent 50%), radial-gradient(circle at 80% 100%, #ffe7f0 0%, transparent 50%), radial-gradient(circle at 50% 50%, #e7f5ff 0%, transparent 70%), #fafafa",
        }}
      >
        <div className="text-center">
          <h2 className="font-heading font-bold text-xl text-text-primary mb-2">Check your email</h2>
          <p className="text-text-secondary text-sm">We sent a confirmation link to {email}</p>
          <Link href="/login" className="text-accent font-medium text-sm hover:underline mt-4 inline-block">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "radial-gradient(circle at 20% 0%, #f0e7ff 0%, transparent 50%), radial-gradient(circle at 80% 100%, #ffe7f0 0%, transparent 50%), radial-gradient(circle at 50% 50%, #e7f5ff 0%, transparent 70%), #fafafa",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-heading font-bold text-2xl tracking-tight text-text-primary">
            YES Vancity
          </h1>
          <p className="text-text-secondary text-sm mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.7)",
              boxShadow: "0 8px 32px rgba(80,50,130,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-text-secondary mb-1">First name</label>
                <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/40 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-text-secondary mb-1">Last name</label>
                <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/40 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </div>
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium text-text-secondary mb-1">Preferred language</label>
              <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/40 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40">
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/40 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="you@example.com" />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/40 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="••••••••" />
            </div>

            {error && <p className="text-urgent text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl bg-text-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? "Creating account..." : "Create account"}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-text-secondary mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-accent font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
