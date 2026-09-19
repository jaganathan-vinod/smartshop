import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ensureAmplify } from "../amplify";
import { cognitoErrorMessage, isValidEmail } from "../validation";

export function ConfirmPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Enter the email you signed up with.");
      return;
    }
    if (!code.trim()) {
      setError("Enter the verification code from your email.");
      return;
    }
    setBusy(true);
    try {
      await ensureAmplify();
      const { confirmSignUp } = await import("aws-amplify/auth");
      await confirmSignUp({ username: email.trim(), confirmationCode: code.trim() });
      navigate("/login", { replace: true, state: { confirmed: email.trim() } });
    } catch (caught) {
      setError(cognitoErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <h1>Confirm your email</h1>
      <p className="lede">Enter the code Cognito sent to your inbox.</p>
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
          Verification code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          Confirm
        </button>
      </form>
      <p>
        Ready to shop? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
