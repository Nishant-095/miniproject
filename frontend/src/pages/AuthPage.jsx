import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import Loading from "../components/Loading.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
export default function AuthPage({ mode = "login" }) {
  // Displays the sign-in or registration form.
  const isRegister = mode === "register";
  usePageTitle(isRegister ? "Create an account" : "Sign in");
  const { user, loading, register, login } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const destination = location.state?.from || "/dashboard";
  function update(event) {
    // Updates an account form field.
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
    setErrors({
      ...errors,
      [event.target.name]: "",
    });
    setError("");
  }
  function validate() {
    // Checks the account form before sending it.
    const nextErrors = {};
    if (
      isRegister &&
      (form.name.trim().length < 2 || form.name.trim().length > 60)
    ) {
      nextErrors.name = "Enter a name between 2 and 60 characters.";
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ||
      form.email.trim().length > 254
    ) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (
      form.password.length < 8 ||
      new TextEncoder().encode(form.password).length > 72
    ) {
      nextErrors.password =
        "Use at least 8 characters (maximum 72 UTF-8 bytes).";
    }
    if (isRegister && form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = "Your passwords do not match.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }
  async function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (busy || !validate()) return;
    setError("");
    setBusy(true);
    try {
      const details = {
        email: form.email.trim(),
        password: form.password,
      };
      if (isRegister)
        await register({
          ...details,
          name: form.name.trim(),
        });
      else await login(details);
      notify(
        isRegister
          ? "Account created. Welcome to UtilityHub!"
          : "Welcome back! You are signed in.",
      );
      navigate(destination, {
        replace: true,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Cannot reach the server. Start the backend and check your connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading message="Checking your session…" />;
  if (user) return <Navigate to={destination} replace />;
  return (
    <section className="auth-layout shell">
      <aside className="auth-aside">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to the toolkit
        </Link>
        <div className="auth-aside-content">
          <div className="auth-symbol">
            u<span>.</span>
          </div>
          <h1>
            A little space.
            <br />
            <span>Just for you.</span>
          </h1>
          <p>
            Bring the plans, lists, and little things in your day into one
            personal workspace.
          </p>
          <ul>
            <li>
              <Check size={16} /> One account for your everyday tools
            </li>
            <li>
              <Check size={16} /> Your own tasks, budgets, and notes
            </li>
            <li>
              <Check size={16} /> Simple enough to use every day
            </li>
          </ul>
        </div>
        <span className="aside-foot">UTILITYHUB · YOUR EVERYDAY TOOLKIT</span>
      </aside>
      <div className="auth-form-side">
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="eyebrow">
            {isRegister ? "LET’S GET YOU SETTLED" : "GOOD TO SEE YOU AGAIN"}
          </div>
          <h1>{isRegister ? "Create your account" : "Welcome back."}</h1>
          <p className="auth-subtitle">
            {isRegister
              ? "Your personal workspace starts here."
              : "Sign in and pick up where you left off."}
          </p>
          {location.state?.from && (
            <p className="info-message">
              {isRegister
                ? "Create an account to open your personal workspace."
                : "Sign in to open your personal workspace."}
            </p>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <fieldset disabled={busy}>
            {isRegister && (
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={update}
                  minLength={2}
                  maxLength={60}
                  autoComplete="name"
                  placeholder="Your full name"
                  required
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                />
                {errors.name && (
                  <span className="field-error" id="name-error" role="alert">
                    {errors.name}
                  </span>
                )}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={update}
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
                required
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <span className="field-error" id="email-error" role="alert">
                  {errors.email}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={update}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  placeholder={
                    isRegister ? "At least 8 characters" : "Enter your password"
                  }
                  required
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "password-error" : "password-hint"
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    // Toggles password visibility in the form.
                    setShowPassword(!showPassword)
                  }
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password ? (
                <span className="field-error" id="password-error" role="alert">
                  {errors.password}
                </span>
              ) : (
                <span className="field-hint" id="password-hint">
                  At least 8 characters. Maximum 72 UTF-8 bytes.
                </span>
              )}
            </div>
            {isRegister && (
              <div className="field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={update}
                  autoComplete="new-password"
                  placeholder="Enter your password again"
                  required
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={
                    errors.confirmPassword ? "confirm-error" : undefined
                  }
                />
                {errors.confirmPassword && (
                  <span className="field-error" id="confirm-error" role="alert">
                    {errors.confirmPassword}
                  </span>
                )}
              </div>
            )}
            <button
              className="button auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Please wait…
                </>
              ) : (
                <>
                  {isRegister ? "Create account" : "Sign in"}{" "}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </fieldset>
          <p className="auth-switch">
            {isRegister ? "Already have an account?" : "New to UtilityHub?"}{" "}
            <Link
              to={isRegister ? "/login" : "/register"}
              state={location.state}
            >
              {isRegister ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <div className="auth-privacy">
            <LockKeyhole size={14} /> Your password is stored as a secure hash.
          </div>
        </form>
      </div>
    </section>
  );
}
