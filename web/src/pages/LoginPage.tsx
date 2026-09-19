import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ensureAmplify } from "../amplify";
import { cognitoErrorMessage, isUnconfirmedUser } from "../validation";

type LocationState = {
  from?: { pathname?: string };
  confirmed?: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const { refresh, user } = useAuth();
  const [email, setEmail] = useState(state.confirmed ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={state.from?.pathname || "/"} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await ensureAmplify();
      const { signIn } = await import("aws-amplify/auth");
      const result = await signIn({ username: email.trim(), password });
      if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
        navigate(`/confirm?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (!result.isSignedIn) {
        setError("Sign-in did not complete. Confirm your email if you have not already.");
        setBusy(false);
        return;
      }
      await refresh();
      navigate(state.from?.pathname || "/", { replace: true });
    } catch (caught) {
      if (isUnconfirmedUser(caught)) {
        navigate(`/confirm?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      setError(cognitoErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <h1>Sign in</h1>
      {state.confirmed ? (
        <p className="flash ok">Email confirmed. Sign in to continue.</p>
      ) : (
        <p className="lede">Use the email and password stored in Cognito.</p>
      )}
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
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
      <p>
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </section>
  );
}
