import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ensureAmplify } from "../amplify";
import { signOutIfNeeded } from "../cognitoSession";
import {
  cognitoErrorMessage,
  isUsernameTaken,
  isValidEmail,
  passwordPolicyIssues,
} from "../validation";

export function SignupPage() {
  const navigate = useNavigate();
  const { ready, user } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const policy = passwordPolicyIssues(password);
    if (policy.length > 0) {
      setError(`Password needs ${policy.join(", ")}.`);
      return;
    }
    setBusy(true);
    try {
      await ensureAmplify();
      await signOutIfNeeded();
      const { signUp } = await import("aws-amplify/auth");
      await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: {
            email: email.trim(),
            name: displayName.trim(),
          },
          autoSignIn: true,
        },
      });
      navigate(`/confirm?email=${encodeURIComponent(email.trim())}`);
    } catch (caught) {
      if (isUsernameTaken(caught)) {
        try {
          const { resendSignUpCode } = await import("aws-amplify/auth");
          await resendSignUpCode({ username: email.trim() });
          navigate(`/confirm?email=${encodeURIComponent(email.trim())}`);
          return;
        } catch {
          navigate("/login", {
            replace: true,
            state: { existing: email.trim() },
          });
          return;
        }
      }
      setError(cognitoErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <h1>Create an account</h1>
      <p className="lede">We’ll email a verification code. You are not signed in until you confirm.</p>
      {error && <p className="flash error">{error}</p>}
      <form className="stack" onSubmit={(event) => void onSubmit(event)}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Display name
          <input
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          Sign up
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
