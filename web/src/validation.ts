export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) {
    issues.push("at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("an uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("a lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("a number");
  }
  return issues;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cognitoErrorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  switch (name) {
    case "UsernameExistsException":
      return "An account with this email already exists.";
    case "UserNotConfirmedException":
      return "Confirm your email before signing in.";
    case "NotAuthorizedException":
      return "Incorrect email or password.";
    case "CodeMismatchException":
      return "That verification code is incorrect.";
    case "ExpiredCodeException":
      return "That verification code has expired.";
    case "InvalidPasswordException":
      return "Password does not meet the required policy.";
    case "LimitExceededException":
      return "Too many attempts. Try again later.";
    case "UserNotFoundException":
      return "Incorrect email or password.";
    default:
      return error instanceof Error ? error.message : "Something went wrong.";
  }
}

export function isUnconfirmedUser(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "UserNotConfirmedException"
  );
}
